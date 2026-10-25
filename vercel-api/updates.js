import fs from 'node:fs';
import { neon } from '@neondatabase/serverless';
import { applyCors, enforceDistributedRateLimit, isCompromisedSecret } from './_security.js';
import { clientIp, recordRejectedOrigin } from './_alertas.js';
import { isValidMasterSession } from './_sessao-master.js';
import { loadSigningKey, publicKeyInfo, verifyLicenseToken } from './_token-licenca.js';
import {
  ARCHES, DEVICE_KINDS, DEVICE_STATES, PLATFORMS, buildFeedYaml, compareVersions, ensureUpdateTables, findRelease,
  inspectReleaseFiles, isDeviceId, isEligible, isSemver, isTeamDevice, listReleases, normalizeTenantId, pickRelease,
  publicReleaseInfo, recordAck, recordDeviceStatus, registerDevice, releaseFilePath, sanitizeNotes, writeAudit,
} from './_actualizacoes.js';

// Centro de actualizações (separado da sincronização de dados):
//   GET  /api/updates/check?deviceId&platform&arch&version     → há versão nova para este dispositivo?
//   POST /api/updates/register { deviceId, kind, platform, arch, version, licenseToken? }
//   POST /api/updates/status   { deviceId, state, reason?, targetVersion? }
//   POST /api/updates/ack      { deviceId, version }            → a versão nova arrancou bem
//   GET  /api/updates/feed/<deviceId>/latest.yml | latest-mac.yml   → feed do electron-updater
//   GET  /api/updates/feed/<deviceId>/files/<versão>/<ficheiro>     → instalador (mesma regra do feed)
//   GET  /api/updates/events                                    → SSE: aviso «update.available» em tempo real
//   POST /api/updates/admin { action, ... }                     → Tango Master (sessão x-master-session)
// O aviso em tempo real é só um sinal para o cliente voltar a perguntar: nunca leva endereços nem comandos.

const MAX_EVENT_CLIENTS = 5_000;
const eventClients = new Set();

const send = (res, status, body) => {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.json(body);
};

/** Envia um aviso a todos os clientes ligados ao canal de eventos das actualizações. */
export const broadcastUpdateEvent = (event) => {
  const line = `data: ${JSON.stringify({ ...event, at: new Date().toISOString() })}\n\n`;
  for (const client of eventClients) {
    try { client.write(line); } catch { eventClients.delete(client); }
  }
};

const normalizeSecret = (value) => String(value ?? '').normalize('NFC').trim().replace(/^(['"`])(.*)\1$/su, '$2').trim();

const subPath = (req) => String(req.url || '').split('?')[0].replace(/^\/api\/updates\/?/, '').replace(/\/+$/, '').split('/').filter(Boolean);

const licensePublicKeys = () => {
  const key = loadSigningKey();
  return key ? [publicKeyInfo(key)] : [];
};

const platformOf = (value) => (Object.hasOwn(PLATFORMS, String(value)) ? String(value) : null);

const openEvents = (req, res) => {
  if (eventClients.size >= MAX_EVENT_CLIENTS) return send(res, 503, { success: false, message: 'Canal de avisos cheio; o cliente volta a verificar mais tarde.' });
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write(`retry: 30000\ndata: ${JSON.stringify({ type: 'connected', at: new Date().toISOString() })}\n\n`);
  eventClients.add(res);
  const keepAlive = setInterval(() => { if (!res.writableEnded) res.write(': keepalive\n\n'); }, 25_000);
  req.on('close', () => { clearInterval(keepAlive); eventClients.delete(res); });
};

const streamFile = (req, res, filePath) => {
  const stats = fs.statSync(filePath);
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Length', stats.size);
  res.setHeader('Cache-Control', 'private, no-transform, max-age=0');
  if (req.method === 'HEAD') return res.end();
  const stream = fs.createReadStream(filePath);
  stream.on('error', error => { console.error('[updates][download]', error.message); res.destroy(error); });
  res.on('close', () => stream.destroy());
  stream.pipe(res);
};

const handleAdmin = async (req, res, sql, ip) => {
  const masterSecret = normalizeSecret(process.env.TANGO_MASTER_SECRET);
  if (!masterSecret || isCompromisedSecret(masterSecret)) return send(res, 503, { success: false, message: 'Painel Master indisponível neste servidor.' });
  if (!await enforceDistributedRateLimit(sql, req, res, { limit: 300, windowMs: 60_000, scope: 'updates_admin' })) return;
  // Só com a sessão aberta em /api/tenants (a chave mestra nunca é tentada aqui: não há outra porta para força bruta).
  if (!await isValidMasterSession(sql, String(req.headers['x-master-session'] || '').trim(), masterSecret)) {
    return send(res, 401, { success: false, code: 'SESSION_INVALID', message: 'A sessão do painel expirou. Autentique-se novamente.' });
  }

  const body = req.body || {};
  const action = String(body.action || '');
  const version = String(body.version || '').trim();
  const audit = (name, details) => writeAudit(sql, { action: name, version: version || null, details, ip });
  const requireRelease = async () => {
    if (!isSemver(version)) { send(res, 400, { success: false, message: 'Versão inválida.' }); return null; }
    const release = await findRelease(sql, version);
    if (!release) send(res, 404, { success: false, message: `A versão ${version} não está registada.` });
    return release;
  };

  if (action === 'overview') {
    const [releases, devices, teamTenants, auditRows, companies] = await Promise.all([
      listReleases(sql),
      sql(`SELECT d.device_id, d.kind, d.platform, d.arch, d.app_version, d.tenant_id, d.team, d.label, d.state, d.state_reason,
          d.target_version, d.acked_version, d.acked_at, d.last_seen, t.name AS tenant_name,
          EXISTS (SELECT 1 FROM tango_update_team_tenants tt WHERE tt.tenant_id = d.tenant_id) AS tenant_team
        FROM tango_update_devices d LEFT JOIN tango_tenants t ON t.tenant_id = d.tenant_id
        ORDER BY d.last_seen DESC LIMIT 500`).catch(() => sql('SELECT *, NULL AS tenant_name, FALSE AS tenant_team FROM tango_update_devices ORDER BY last_seen DESC LIMIT 500')),
      sql('SELECT tenant_id, added_at FROM tango_update_team_tenants ORDER BY added_at DESC'),
      sql('SELECT id, at, action, version, details, ip FROM tango_update_audit ORDER BY id DESC LIMIT 200'),
      // Empresas já cadastradas no Tango Master: aparecem todas, prontas a marcar como equipa.
      sql(`SELECT t.tenant_id, t.name, t.status,
          EXISTS (SELECT 1 FROM tango_update_team_tenants tt WHERE tt.tenant_id = t.tenant_id) AS team,
          (SELECT COUNT(*)::int FROM tango_update_devices d WHERE d.tenant_id = t.tenant_id) AS devices
        FROM tango_tenants t ORDER BY t.name ASC`).catch(() => []),
    ]);
    return send(res, 200, { success: true, releases, devices, teamTenants, companies, audit: auditRows, eventClients: eventClients.size });
  }

  if (action === 'release-register') {
    if (!isSemver(version)) return send(res, 400, { success: false, message: 'Versão inválida (ex.: 3.0.4).' });
    if (await findRelease(sql, version)) return send(res, 409, { success: false, message: `A versão ${version} já está registada.` });
    let files;
    try {
      files = await inspectReleaseFiles(version);
    } catch (error) {
      return send(res, 422, { success: false, message: error.message });
    }
    const notes = sanitizeNotes(body.notes);
    const mandatory = body.mandatory === true;
    // Uma versão nova começa sempre só para a equipa: o interruptor «para todos» liga-se depois de testada.
    await sql(`INSERT INTO tango_update_releases (id, version, notes, mandatory, public, files) VALUES ($1, $2, $3, $4, FALSE, $5)`,
      [`rel_${version}`, version, notes, mandatory, JSON.stringify(files)]);
    await audit('release_registered', `Versão ${version} registada (só equipa). Plataformas: ${Object.keys(files).join(', ')}.${mandatory ? ' Obrigatória.' : ''}`);
    broadcastUpdateEvent({ type: 'update.available', scope: 'team' });
    return send(res, 200, { success: true, release: await findRelease(sql, version) });
  }

  if (action === 'release-set-public') {
    const release = await requireRelease();
    if (!release) return;
    const enabled = body.public === true;
    if (enabled === release.public) return send(res, 200, { success: true, release });
    await sql(`UPDATE tango_update_releases SET public = $2, published_at = CASE WHEN $2 THEN COALESCE(published_at, NOW()) ELSE published_at END, updated_at = NOW() WHERE version = $1`,
      [version, enabled]);
    await audit(enabled ? 'release_public_on' : 'release_public_off',
      enabled ? `«Disponibilizar para todos» LIGADO na versão ${version}.` : `«Disponibilizar para todos» DESLIGADO na versão ${version}: volta a ser só da equipa.`);
    if (enabled) broadcastUpdateEvent({ type: 'update.available', scope: 'all', version, releaseId: release.id, mandatory: release.mandatory });
    return send(res, 200, { success: true, release: await findRelease(sql, version) });
  }

  if (action === 'release-update') {
    const release = await requireRelease();
    if (!release) return;
    const notes = body.notes === undefined ? release.notes : sanitizeNotes(body.notes);
    const mandatory = body.mandatory === undefined ? release.mandatory : body.mandatory === true;
    const percent = body.rolloutPercent === undefined ? release.rolloutPercent : Math.round(Number(body.rolloutPercent));
    if (!Number.isInteger(percent) || percent < 1 || percent > 100) return send(res, 400, { success: false, message: 'A percentagem de rollout vai de 1 a 100.' });
    await sql('UPDATE tango_update_releases SET notes = $2, mandatory = $3, rollout_percent = $4, updated_at = NOW() WHERE version = $1', [version, notes, mandatory, percent]);
    await audit('release_updated', `Versão ${version}: rollout ${percent}%, ${mandatory ? 'obrigatória' : 'opcional'}${notes !== release.notes ? ', notas alteradas' : ''}.`);
    return send(res, 200, { success: true, release: await findRelease(sql, version) });
  }

  if (action === 'release-pause' || action === 'release-resume') {
    const release = await requireRelease();
    if (!release) return;
    const status = action === 'release-pause' ? 'paused' : 'active';
    await sql('UPDATE tango_update_releases SET status = $2, updated_at = NOW() WHERE version = $1', [version, status]);
    await audit(action === 'release-pause' ? 'release_paused' : 'release_resumed',
      action === 'release-pause' ? `Versão ${version} suspensa: deixa de ser oferecida e descarregada.` : `Versão ${version} retomada.`);
    if (status === 'active') broadcastUpdateEvent({ type: 'update.available', scope: release.public ? 'all' : 'team' });
    return send(res, 200, { success: true, release: await findRelease(sql, version) });
  }

  if (action === 'device-set-team') {
    const deviceId = String(body.deviceId || '').toLowerCase();
    if (!isDeviceId(deviceId)) return send(res, 400, { success: false, message: 'Identificador de dispositivo inválido.' });
    const team = body.team === true;
    const label = body.label === undefined ? undefined : String(body.label || '').trim().slice(0, 80) || null;
    const rows = await sql(`UPDATE tango_update_devices SET team = $2${label !== undefined ? ', label = $3' : ''} WHERE device_id = $1 RETURNING device_id`,
      label !== undefined ? [deviceId, team, label] : [deviceId, team]);
    if (!rows.length) return send(res, 404, { success: false, message: 'Dispositivo ainda não registado: abra o Tango ERP nesse computador primeiro.' });
    await audit(team ? 'device_team_on' : 'device_team_off', `Dispositivo ${deviceId}${label ? ` (${label})` : ''} ${team ? 'marcado' : 'retirado'} como equipa de desenvolvimento.`);
    broadcastUpdateEvent({ type: 'update.available', scope: 'team' });
    return send(res, 200, { success: true });
  }

  if (action === 'tenant-set-team') {
    const tenantId = normalizeTenantId(body.tenantId);
    if (!tenantId) return send(res, 400, { success: false, message: 'Empresa inválida.' });
    if (body.team === true) await sql('INSERT INTO tango_update_team_tenants (tenant_id) VALUES ($1) ON CONFLICT DO NOTHING', [tenantId]);
    else await sql('DELETE FROM tango_update_team_tenants WHERE tenant_id = $1', [tenantId]);
    await audit(body.team === true ? 'tenant_team_on' : 'tenant_team_off', `Empresa ${tenantId} ${body.team === true ? 'marcada' : 'retirada'} como equipa de desenvolvimento.`);
    broadcastUpdateEvent({ type: 'update.available', scope: 'team' });
    return send(res, 200, { success: true });
  }

  return send(res, 400, { success: false, message: 'Acção desconhecida.' });
};

export default async function handler(req, res) {
  if (!applyCors(req, res)) {
    await recordRejectedOrigin(req);
    return send(res, 403, { success: false, message: 'Origem não autorizada.' });
  }
  if (req.method === 'OPTIONS') return send(res, 200, { success: true });

  const parts = subPath(req);
  const route = parts[0] || '';
  if (route === 'events') {
    if (req.method !== 'GET') return send(res, 405, { success: false, message: 'Método não permitido.' });
    return openEvents(req, res);
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return send(res, 503, { success: false, message: 'Servidor central ainda não configurado.' });
  const client = neon(databaseUrl);
  const sql = (text, params) => client.query(text, params);
  const ip = clientIp(req);
  const query = req.query || {};
  const body = req.body || {};

  try {
    await ensureUpdateTables(sql);

    if (route === 'admin') {
      if (req.method !== 'POST') return send(res, 405, { success: false, message: 'Método não permitido.' });
      return await handleAdmin(req, res, sql, ip);
    }

    if (route === 'check') {
      if (req.method !== 'GET') return send(res, 405, { success: false, message: 'Método não permitido.' });
      if (!await enforceDistributedRateLimit(sql, req, res, { limit: 240, windowMs: 15 * 60_000, scope: 'updates_check' })) return;
      const deviceId = String(query.deviceId || '').toLowerCase();
      const platform = platformOf(query.platform);
      const version = String(query.version || '');
      if (!platform || !isSemver(version)) return send(res, 400, { success: false, message: 'Plataforma ou versão inválida.' });
      const team = await isTeamDevice(sql, deviceId);
      const release = pickRelease(await listReleases(sql), { deviceId, team, platform });
      const available = !!release && compareVersions(release.version, version) > 0;
      return send(res, 200, {
        success: true,
        channel: team ? 'internal' : 'stable',
        available,
        release: available ? publicReleaseInfo(release, platform) : null,
      });
    }

    if (route === 'register') {
      if (req.method !== 'POST') return send(res, 405, { success: false, message: 'Método não permitido.' });
      if (!await enforceDistributedRateLimit(sql, req, res, { limit: 120, windowMs: 15 * 60_000, scope: 'updates_register' })) return;
      const deviceId = String(body.deviceId || '').toLowerCase();
      const kind = String(body.kind || '');
      const platform = kind === 'web' ? null : platformOf(body.platform);
      const arch = body.arch && ARCHES.has(String(body.arch)) ? String(body.arch) : null;
      const version = String(body.version || '');
      if (!isDeviceId(deviceId) || !DEVICE_KINDS.has(kind) || (kind === 'desktop' && !platform) || !isSemver(version)) {
        return send(res, 400, { success: false, message: 'Registo de dispositivo inválido.' });
      }
      // A empresa só conta quando vem num token de licença assinado pelo servidor (não basta dizer o nome).
      const claims = body.licenseToken ? verifyLicenseToken(String(body.licenseToken).slice(0, 8_000), licensePublicKeys()) : null;
      const tenantId = claims ? normalizeTenantId(claims.empresa_id) : null;
      await registerDevice(sql, { deviceId, kind, platform, arch, version, tenantId });
      const team = await isTeamDevice(sql, deviceId);
      return send(res, 200, { success: true, channel: team ? 'internal' : 'stable' });
    }

    if (route === 'status' || route === 'ack') {
      if (req.method !== 'POST') return send(res, 405, { success: false, message: 'Método não permitido.' });
      if (!await enforceDistributedRateLimit(sql, req, res, { limit: 240, windowMs: 15 * 60_000, scope: 'updates_status' })) return;
      const deviceId = String(body.deviceId || '').toLowerCase();
      if (!isDeviceId(deviceId)) return send(res, 400, { success: false, message: 'Dispositivo inválido.' });
      if (route === 'ack') {
        const version = String(body.version || '');
        if (!isSemver(version)) return send(res, 400, { success: false, message: 'Versão inválida.' });
        const acked = await recordAck(sql, { deviceId, version });
        return acked ? send(res, 200, { success: true, ackedAt: acked.acked_at }) : send(res, 404, { success: false, message: 'Dispositivo não registado.' });
      }
      const state = String(body.state || '');
      const targetVersion = body.targetVersion && isSemver(body.targetVersion) ? String(body.targetVersion) : null;
      if (!DEVICE_STATES.has(state)) return send(res, 400, { success: false, message: 'Estado inválido.' });
      const ok = await recordDeviceStatus(sql, { deviceId, state, reason: body.reason, targetVersion });
      return ok ? send(res, 200, { success: true }) : send(res, 404, { success: false, message: 'Dispositivo não registado.' });
    }

    if (route === 'feed') {
      if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { success: false, message: 'Método não permitido.' });
      if (!await enforceDistributedRateLimit(sql, req, res, { limit: 120, windowMs: 15 * 60_000, scope: 'updates_feed' })) return;
      const deviceId = String(parts[1] || '').toLowerCase();
      if (!isDeviceId(deviceId)) return send(res, 404, { success: false, message: 'Feed desconhecido.' });
      const team = await isTeamDevice(sql, deviceId);

      // feed/<id>/latest.yml ou latest-mac.yml
      if (parts.length === 3) {
        const platform = Object.keys(PLATFORMS).find(key => PLATFORMS[key].feedFile === parts[2]);
        if (!platform) return send(res, 404, { success: false, message: 'Feed desconhecido.' });
        const release = pickRelease(await listReleases(sql), { deviceId, team, platform });
        if (!release) return send(res, 404, { success: false, message: 'Nenhuma versão disponível para este dispositivo.' });
        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/yaml; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store, max-age=0');
        return res.end(buildFeedYaml(release, platform));
      }

      // feed/<id>/files/<versão>/<ficheiro>: a regra volta a ser verificada no próprio download.
      if (parts.length === 5 && parts[2] === 'files') {
        const version = parts[3];
        const fileName = decodeURIComponent(parts[4]);
        const release = isSemver(version) ? await findRelease(sql, version) : null;
        const listed = release && Object.values(release.files || {}).some(entry => entry.files.some(file => file.url === fileName));
        if (!release || !listed || !isEligible(release, { deviceId, team })) {
          return send(res, 404, { success: false, message: 'Esta versão não está disponível para este dispositivo.' });
        }
        const filePath = releaseFilePath(version, fileName);
        if (!filePath || !fs.existsSync(filePath)) return send(res, 404, { success: false, message: 'Ficheiro em falta no servidor.' });
        return streamFile(req, res, filePath);
      }
      return send(res, 404, { success: false, message: 'Feed desconhecido.' });
    }

    return send(res, 404, { success: false, message: 'Rota de actualizações desconhecida.' });
  } catch (error) {
    console.error('[updates]', error);
    if (!res.headersSent) return send(res, 500, { success: false, message: 'Erro interno no centro de actualizações.' });
  }
}
