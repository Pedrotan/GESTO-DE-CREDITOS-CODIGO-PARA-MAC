import crypto from 'node:crypto';
import { neon } from '@neondatabase/serverless';
import { applyCors, enforceDistributedRateLimit, isCompromisedSecret } from './_security.js';
import { clearAuthFailures, LOCKOUT_POLICIES, lockoutRemaining, recordRejectedOrigin, recordSecurityEvent, registerAuthFailure } from './_alertas.js';
import { ensureRegistrationRequestsTable, toPublicRequest } from './_pedidos-cadastro.js';
import { PERIOD_PATTERN, currentPeriod, ensureUsageTable } from './_uso-empresas.js';
import { ensureTenantProfileColumns } from './_autorizacao-empresa.js';
import { changeLicensePlan, importLegacyKeys, legacyKeyStatuses, issueLicenseKey, licenseDetails, listLicenses, listPlans, releaseMachine, setLicenseModules, migrateTenantsToLicenses, prepareLicenses, syncLicenseFromTenant, toPublicLicense } from './_licencas.js';
import { createMasterSession, isValidMasterSession, revokeMasterSession } from './_sessao-master.js';
import { listSyncDevices, userIdDivergences } from './_dispositivos-sync.js';
import { integrityPlan } from './_integridade-sync.js';
import { tenantLockCte } from './_bloqueio-empresa.js';
import { generateLicenseKey, licenseKeyHash, licenseKeyPrefix, parseLicenseKey } from './_chave-licenca.js';

const KEY_TOOLS = { generate: generateLicenseKey, parse: parseLicenseKey, hash: licenseKeyHash, prefix: licenseKeyPrefix };

// API de administração de empresas (tenants) e chaves de sincronização.
// Uso exclusivo do Painel Master. Protegida pela chave mestra configurada no servidor.
// Sem ela, o painel fica indisponível (não há chaves fixas no código).

const send = (res, status, body) => {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-master-secret, x-master-session');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.json(body);
};

const safeEqual = (left, right) => {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

const sha256 = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');

const normalizeCode = (val) => String(val || '').trim().replace(/[-\s]/g, '').toUpperCase();

export const generateAccessCode = () => {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // base32 sem caracteres confusos (0, 1, I, O)
  let part1 = '';
  let part2 = '';
  const bytes = crypto.randomBytes(8);
  for (let i = 0; i < 4; i++) {
    part1 += chars[bytes[i] % chars.length];
    part2 += chars[bytes[i + 4] % chars.length];
  }
  return `TG-${part1}-${part2}`;
};

const ensureTable = async (sql) => {
  await sql(`
    CREATE TABLE IF NOT EXISTS tango_tenants (
      tenant_id TEXT PRIMARY KEY,
      tenant_hash TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      key_hash TEXT NOT NULL,
      access_code TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      expires_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_sync_at TIMESTAMPTZ
    )
  `);

  try {
    await sql(`ALTER TABLE tango_tenants ADD COLUMN IF NOT EXISTS access_code TEXT`);
  } catch {
    // Ignorar se já existe
  }
  await ensureTenantProfileColumns(sql);

  // Necessária aqui também porque a query "list" faz JOIN com esta tabela
  await sql(`
    CREATE TABLE IF NOT EXISTS tango_sync_operations (
      seq BIGSERIAL PRIMARY KEY,
      tenant_hash TEXT NOT NULL,
      operation_id TEXT NOT NULL,
      device_id TEXT NOT NULL,
      payload TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (tenant_hash, operation_id)
    )
  `);
};

const toPublicTenant = (row) => ({
  tenantId: row.tenant_id,
  name: row.name,
  accessCode: row.access_code || null,
  status: row.status,
  expiresAt: row.expires_at,
  createdAt: row.created_at,
  lastSyncAt: row.last_sync_at,
  multiTenant: typeof row.multi_tenant === 'boolean' ? row.multi_tenant : null,
  operations: row.operations !== undefined ? Number(row.operations) : undefined
});

// Remove diferenças invisíveis ao copiar a chave: espaços, aspas envolventes e formas Unicode.
const normalizeSecret = (value) => String(value ?? '')
  .normalize('NFC')
  .trim()
  .replace(/^(['"`])(.*)\1$/su, '$2')
  .trim();

export default async function handler(req, res) {
  if (!applyCors(req, res)) {
    await recordRejectedOrigin(req);
    return send(res, 403, { success: false, message: 'Origem não autorizada.' });
  }
  if (req.method === 'OPTIONS') return send(res, 200, { success: true });
  if (req.method !== 'POST') return send(res, 405, { success: false, message: 'Método não permitido.' });
  
  const databaseUrl = process.env.DATABASE_URL;
  // Apenas a chave mestra configurada no servidor é aceite; sem ela o painel fica indisponível.
  const masterSecret = normalizeSecret(process.env.TANGO_MASTER_SECRET);

  if (!databaseUrl || !masterSecret) {
    return send(res, 503, { success: false, message: 'Painel Master ainda não configurado no servidor.' });
  }
  if (isCompromisedSecret(masterSecret)) {
    console.error('[tenants] A chave mestra configurada já foi exposta publicamente: substitua-a. O painel fica fechado até lá.');
    return send(res, 503, { success: false, message: 'Painel Master indisponível: a chave mestra do servidor tem de ser substituída.' });
  }

  // O corpo JSON chega em UTF-8; os cabeçalhos HTTP são lidos em latin1, o que altera acentos.
  const bearer = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const header = bearer || String(req.headers['x-master-secret'] || '');
  const candidates = [
    req.body?.masterSecret,
    header,
    Buffer.from(header, 'latin1').toString('utf8')
  ].map(normalizeSecret).filter(Boolean);

  const client = neon(databaseUrl);
  const sql = (text, params) => client.query(text, params);
  // Com sessão aberta o painel usa o token (256 bits, não se adivinha) e tem um limite largo; sem sessão, cada
  // pedido é uma tentativa de chave mestra: limite apertado e bloqueio por IP ANTES de comparar a chave.
  const sessionToken = String(req.headers['x-master-session'] || '').trim();
  try {
    if (sessionToken) {
      if (!await enforceDistributedRateLimit(sql, req, res, { limit: 300, windowMs: 60_000, scope: 'tenants_session' })) return;
    } else {
      if (!await enforceDistributedRateLimit(sql, req, res, { limit: 10, windowMs: 60_000, scope: 'tenants' })) return;
      const remaining = await lockoutRemaining(sql, req, { scope: 'master' });
      if (remaining > 0) {
        res.setHeader('Retry-After', String(remaining));
        return send(res, 429, { success: false, message: `Acesso bloqueado por tentativas falhadas. Tente novamente em ${Math.ceil(remaining / 60)} minuto(s).` });
      }
    }
  } catch (error) {
    console.error('[tenants][rate-limit]', error);
    return send(res, 503, { success: false, message: 'O controlo de acesso está temporariamente indisponível.' });
  }

  if (sessionToken) {
    let valid = false;
    try {
      valid = await isValidMasterSession(sql, sessionToken, masterSecret);
    } catch (error) {
      console.error('[tenants][session]', error);
      return send(res, 503, { success: false, message: 'O controlo de acesso está temporariamente indisponível.' });
    }
    if (!valid) return send(res, 401, { success: false, code: 'SESSION_INVALID', message: 'A sessão do painel expirou. Autentique-se novamente.' });
  } else if (!candidates.some(candidate => safeEqual(candidate, masterSecret))) {
    // 5 falhas em 15 min bloqueiam este IP durante 1 hora. A resposta não revela nada da configuração.
    await registerAuthFailure(sql, req, { scope: 'master', type: 'master_secret_failed',
      title: 'Chave mestra errada no painel Master', details: 'Tentativa de acesso à API de administração com uma chave inválida.',
      ipPolicy: LOCKOUT_POLICIES.master });
    return send(res, 401, { success: false, message: 'Chave de autenticação inválida.' });
  }

  const body = req.body || {};
  const action = String(body.action || '').trim();
  const rawTenantId = String(body.tenantId || '').trim();
  const tenantId = rawTenantId.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  const name = String(body.name || '').trim();
  const expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;
  // Modo multi-empresa escolhido no Tango Master (o executável da empresa actualiza-o depois).
  const multiTenant = typeof body.multiTenant === 'boolean' ? body.multiTenant : null;
  if (expiresAt && Number.isNaN(expiresAt.getTime())) {
    return send(res, 400, { success: false, message: 'Data de expiração inválida.' });
  }


  const clientIp = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim() || null;
  try {
    await ensureTable(sql);
    // Licenças (uma por empresa): uma falha aqui não pode impedir a gestão das empresas.
    let licensesReady = true;
    try {
      await prepareLicenses(sql, databaseUrl);
    } catch (error) {
      licensesReady = false;
      console.error('[tenants][licencas]', error);
    }
    const keepLicenseInSync = async (changes) => {
      if (!licensesReady) return;
      try {
        await syncLicenseFromTenant(sql, tenantId, changes, clientIp);
      } catch (error) {
        console.error('[tenants][licencas][sync]', error);
      }
    };

    if (action === 'verify' || action === 'session') {
      // Quem se autenticou com a chave mestra recebe uma sessão para os pedidos seguintes.
      const session = sessionToken ? null : await createMasterSession(sql, masterSecret, clientIp);
      return send(res, 200, {
        success: true,
        message: 'Credenciais master válidas e ligadas com sucesso.',
        ...(session ? { sessionToken: session.token, sessionExpiresAt: session.expiresAt } : {}),
      });
    }
    if (action === 'logout') {
      if (sessionToken) await revokeMasterSession(sql, sessionToken);
      return send(res, 200, { success: true });
    }

    if (action === 'list') {
      const rows = await sql(`
        SELECT t.*, (
          SELECT COUNT(*)::int FROM tango_sync_operations o WHERE o.tenant_hash = t.tenant_hash
        ) AS operations
        FROM tango_tenants t
        ORDER BY t.created_at DESC
      `);
      return send(res, 200, { success: true, tenants: rows.map(toPublicTenant) });
    }

    // Volume de negócio por empresa: resumo mensal enviado pelas empresas + actividade de sincronização
    // (que o servidor conhece sem decifrar os dados).
    if (action === 'usage') {
      const period = PERIOD_PATTERN.test(String(body.period || '')) ? String(body.period) : currentPeriod();
      const [year, month] = period.split('-').map(Number);
      const previous = new Date(Date.UTC(year, month - 2, 1)).toISOString().slice(0, 7);
      const start = new Date(Date.UTC(year, month - 1, 1)).toISOString();
      const end = new Date(Date.UTC(year, month, 1)).toISOString();
      await ensureUsageTable(sql);
      const rows = await sql(`
        SELECT t.tenant_id, t.name, t.status, t.expires_at, t.created_at, t.last_sync_at,
          cur.metrics AS metrics, cur.reported_at AS reported_at, cur.app_version AS app_version,
          prev.metrics AS previous_metrics,
          (SELECT COUNT(*)::int FROM tango_sync_operations o
             WHERE o.tenant_hash = t.tenant_hash AND o.created_at >= $2 AND o.created_at < $3) AS sync_operations,
          (SELECT COUNT(DISTINCT o.device_id)::int FROM tango_sync_operations o
             WHERE o.tenant_hash = t.tenant_hash AND o.created_at >= NOW() - INTERVAL '30 days') AS active_devices
        FROM tango_tenants t
        LEFT JOIN tango_usage_reports cur ON cur.tenant_id = t.tenant_id AND cur.period = $1
        LEFT JOIN tango_usage_reports prev ON prev.tenant_id = t.tenant_id AND prev.period = $4
        ORDER BY t.name ASC
      `, [period, start, end, previous]);
      return send(res, 200, {
        success: true,
        period,
        previousPeriod: previous,
        companies: rows.map(row => ({
          tenantId: row.tenant_id,
          name: row.name,
          status: row.status,
          expiresAt: row.expires_at,
          createdAt: row.created_at,
          lastSyncAt: row.last_sync_at,
          reportedAt: row.reported_at,
          appVersion: row.app_version,
          metrics: row.metrics || null,
          previousMetrics: row.previous_metrics || null,
          syncOperations: Number(row.sync_operations || 0),
          activeDevices: Number(row.active_devices || 0)
        }))
      });
    }

    // Diagnóstico da sincronização de cada dispositivo da empresa (versão, última sincronização, retidas, erros).
    if (action === 'sync-devices') {
      const [tenant] = await sql(`SELECT tenant_hash, name FROM tango_tenants WHERE UPPER(tenant_id) = UPPER($1)`, [String(body.tenantId || '')]);
      if (!tenant) return send(res, 404, { success: false, message: 'Empresa não encontrada.' });
      const devices = await listSyncDevices(sql, tenant.tenant_hash);
      return send(res, 200, {
        success: true, tenantName: tenant.name, serverTime: new Date().toISOString(),
        devices: devices.map(({ usersFingerprint, integrity, ...device }) => {
          const plan = integrity ? integrityPlan(devices, device.deviceId) : null;
          return { ...device, users: usersFingerprint.length, integrityAt: integrity?.at || null,
            integrityMissing: plan ? plan.missing.map(item => item.table) : null, integrityContent: plan ? plan.content : null };
        }),
        userIdDivergences: userIdDivergences(devices),
      });
    }

    if (action === 'list-requests') {
      await ensureRegistrationRequestsTable(sql);
      const requests = await sql(`SELECT * FROM tango_registration_requests
        WHERE status = 'pending' OR handled_at > NOW() - INTERVAL '30 days'
        ORDER BY (status = 'pending') DESC, created_at DESC LIMIT 200`);
      return send(res, 200, { success: true, requests: requests.map(toPublicRequest) });
    }

    if (action === 'resolve-request') {
      const requestId = String(body.requestId || '');
      const status = String(body.status || '');
      if (!/^[0-9a-f-]{36}$/iu.test(requestId) || !['approved', 'rejected'].includes(status)) {
        return send(res, 400, { success: false, message: 'Pedido ou decisão inválidos.' });
      }
      await ensureRegistrationRequestsTable(sql);
      const updated = await sql(`UPDATE tango_registration_requests SET status = $2, handled_at = NOW(), updated_at = NOW()
        WHERE id = $1 RETURNING *`, [requestId, status]);
      if (!updated.length) return send(res, 404, { success: false, message: 'Pedido de cadastro não encontrado.' });
      return send(res, 200, { success: true, request: toPublicRequest(updated[0]) });
    }

    // Licenças: lista com dias restantes (calculados no servidor) e fusão das chaves assinadas antigas do Master.
    if (action === 'licenses-list' || action === 'licenses-import-legacy' || action === 'licenses-legacy-status') {
      if (!licensesReady) return send(res, 503, { success: false, message: 'As tabelas de licenças não estão disponíveis neste servidor.' });
      if (action === 'licenses-legacy-status') {
        return send(res, 200, { success: true, keys: await legacyKeyStatuses(sql, body.jtis) });
      }
      if (action === 'licenses-import-legacy') {
        if (!Array.isArray(body.keys) || body.keys.length > 5000) {
          return send(res, 400, { success: false, message: 'Lista de chaves inválida.' });
        }
        const report = await importLegacyKeys(sql, body.keys, clientIp);
        const licenses = await listLicenses(sql);
        return send(res, 200, { success: true, report, licenses: licenses.map(toPublicLicense) });
      }
      await migrateTenantsToLicenses(sql);
      const licenses = await listLicenses(sql);
      const plans = await listPlans(sql);
      return send(res, 200, {
        success: true,
        licenses: licenses.map(toPublicLicense),
        plans: plans.map(plan => ({ id: plan.id, name: plan.nome, months: plan.duracao_meses, days: plan.duracao_dias })),
      });
    }

    if (!tenantId || tenantId.length > 200) {
      return send(res, 400, { success: false, message: 'Identificação da empresa (NIF) inválida.' });
    }
    const tenantHash = sha256(tenantId);

    if (action === 'create') {
      if (!name || name.length > 200) {
        return send(res, 400, { success: false, message: 'Nome ou Razão Social da empresa inválido.' });
      }
      const existing = await sql('SELECT tenant_id FROM tango_tenants WHERE UPPER(tenant_id) = UPPER($1)', [tenantId]);
      if (existing.length) {
        return send(res, 409, { success: false, message: `Já existe uma empresa cadastrada com o NIF ${tenantId}.` });
      }
      
      const code = String(body.accessCode || generateAccessCode()).trim().toUpperCase();
      const normKey = normalizeCode(code);
      
      await sql(
        `INSERT INTO tango_tenants (tenant_id, tenant_hash, name, key_hash, access_code, status, expires_at, multi_tenant)
         VALUES ($1, $2, $3, $4, $5, 'active', $6, $7)`,
        [tenantId, tenantHash, name, sha256(normKey), code, expiresAt, multiTenant]
      );
      await ensureRegistrationRequestsTable(sql);
      await sql(`UPDATE tango_registration_requests SET status = 'approved', handled_at = NOW(), updated_at = NOW()
        WHERE nif = $1 AND status = 'pending'`, [tenantId]);
      await keepLicenseInSync({ expiresAt });
      // Chave de licença da empresa (TANGO-XXXX-…), mostrada só agora: o servidor guarda apenas o hash.
      let licenseKey = null;
      if (licensesReady) {
        try {
          const issued = await issueLicenseKey(sql, tenantId, KEY_TOOLS, clientIp);
          if (issued.ok) licenseKey = issued.key;
        } catch (error) {
          console.error('[tenants][licencas][chave]', error);
        }
      }

      return send(res, 200, { 
        success: true, 
        key: code, 
        accessCode: code,
        licenseKey,
        tenant: { tenantId, name, accessCode: code, status: 'active', expiresAt, multiTenant } 
      });
    }

    const rows = await sql('SELECT * FROM tango_tenants WHERE UPPER(tenant_id) = UPPER($1)', [tenantId]);
    if (!rows.length) {
      return send(res, 404, { success: false, message: 'Empresa não encontrada no registo central.' });
    }

    if (action === 'update') {
      const status = body.status !== undefined ? String(body.status) : null;
      if (status && !['active', 'blocked'].includes(status)) {
        return send(res, 400, { success: false, message: 'Estado inválido (use "active" ou "blocked").' });
      }
      await sql(
        `UPDATE tango_tenants SET
           name = COALESCE(NULLIF($2, ''), name),
           status = COALESCE($3, status),
           expires_at = CASE WHEN $4 THEN $5 ELSE expires_at END,
           multi_tenant = CASE WHEN $6 THEN $7 ELSE multi_tenant END
         WHERE UPPER(tenant_id) = UPPER($1)`,
        [tenantId, name, status, body.expiresAt !== undefined, expiresAt, multiTenant !== null, multiTenant]
      );
      await keepLicenseInSync(body.expiresAt !== undefined ? { expiresAt } : {});
      const [updated] = await sql('SELECT * FROM tango_tenants WHERE UPPER(tenant_id) = UPPER($1)', [tenantId]);
      return send(res, 200, { success: true, tenant: toPublicTenant(updated) });
    }

    // Emite ou substitui a chave de licença (TANGO-XXXX-…); as máquinas já activadas continuam ligadas.
    if (action === 'license-issue-key') {
      if (!licensesReady) return send(res, 503, { success: false, message: 'As tabelas de licenças não estão disponíveis neste servidor.' });
      const issued = await issueLicenseKey(sql, tenantId, KEY_TOOLS, clientIp);
      if (!issued.ok) return send(res, issued.status, { success: false, message: issued.message });
      return send(res, 200, { success: true, licenseKey: issued.key, keyPrefix: issued.prefix, replaced: issued.replaced });
    }

    // Gestão da licença: mudar plano, libertar um computador, ver computadores e histórico.
    if (action === 'license-change-plan' || action === 'license-release-machine' || action === 'license-details' || action === 'license-modules') {
      if (!licensesReady) return send(res, 503, { success: false, message: 'As tabelas de licenças não estão disponíveis neste servidor.' });
      const result = action === 'license-change-plan'
        ? await changeLicensePlan(sql, tenantId, { plan: body.plan, tier: body.tier, maxMachines: body.maxMachines }, clientIp)
        : action === 'license-modules'
          ? await setLicenseModules(sql, tenantId, body.modules, clientIp)
          : action === 'license-release-machine'
          ? await releaseMachine(sql, tenantId, body.activationId, clientIp)
          : await licenseDetails(sql, tenantId);
      if (!result.ok) return send(res, result.status, { success: false, message: result.message });
      const { ok, ...data } = result;
      return send(res, 200, { success: true, ...data });
    }

    if (action === 'rotate') {
      const code = generateAccessCode();
      const normKey = normalizeCode(code);
      await sql('UPDATE tango_tenants SET key_hash = $2, access_code = $3 WHERE UPPER(tenant_id) = UPPER($1)', [tenantId, sha256(normKey), code]);
      return send(res, 200, { success: true, key: code, accessCode: code });
    }

    if (action === 'delete') {
      await sql('DELETE FROM tango_tenants WHERE UPPER(tenant_id) = UPPER($1)', [tenantId]);
      if (body.purgeData === true) {
        // Com o bloqueio da empresa: um envio a meio termina antes, não deixa alterações soltas de uma empresa eliminada.
        await sql(`${tenantLockCte('$1')}
          DELETE FROM tango_sync_operations USING tenant_lock WHERE tango_sync_operations.tenant_hash = $1`, [tenantHash]);
        await ensureUsageTable(sql);
        await sql('DELETE FROM tango_usage_reports WHERE UPPER(tenant_id) = UPPER($1)', [tenantId]);
      }
      return send(res, 200, { success: true });
    }

    // Alertas de segurança do servidor (tentativas de intrusão, força bruta, origens recusadas).
    if (action === 'security-events') {
      const { ensureSecurityTables } = await import('./_alertas.js');
      await ensureSecurityTables(sql);
      const rows = await sql(`SELECT id, created_at, last_seen, type, severity, title, details, ip, path, subject, count, acknowledged
        FROM security_events ORDER BY last_seen DESC LIMIT 300`);
      const open = await sql(`SELECT severity, COUNT(*)::int AS total FROM security_events WHERE acknowledged = FALSE GROUP BY severity`);
      return send(res, 200, { success: true, events: rows, open: Object.fromEntries(open.map(row => [row.severity, row.total])) });
    }
    if (action === 'security-events-ack') {
      const { ensureSecurityTables } = await import('./_alertas.js');
      await ensureSecurityTables(sql);
      await sql('UPDATE security_events SET acknowledged = TRUE WHERE acknowledged = FALSE');
      return send(res, 200, { success: true });
    }

    return send(res, 400, { success: false, message: 'Ação desconhecida.' });
  } catch (error) {
    console.error('[tenants]', error);
    return send(res, 500, { success: false, message: 'O servidor não conseguiu processar o pedido.' });
  }
}
