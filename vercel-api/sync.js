import { neon } from '@neondatabase/serverless';
import { applyCors, enforceDistributedRateLimit } from './_security.js';
import { clearAuthFailures, LOCKOUT_POLICIES, lockoutRemaining, recordRejectedOrigin, recordSecurityEvent, registerAuthFailure } from './_alertas.js';
import { authorizeTenant, sha256 } from './_autorizacao-empresa.js';
import { recordSyncDevice } from './_dispositivos-sync.js';

// Alterações por pedido. Os clientes enviam lotes de até 100, mais a lista de utilizadores e o resto de uma transacção
// que não pode ser partida: com o limite antigo de 100 esse lote era recusado sempre e o dispositivo deixava de
// sincronizar (nem enviava nem recebia). O tamanho do pedido continua limitado pelo servidor (8 MB).
const MAX_OPERATIONS = 2000;
// Uma alteração cifrada. Clientes com documentos anexados (BI, comprovativos em base64) passavam os 2 MB antigos:
// a alteração era recusada e, como a fila não avança sem ela, o dispositivo deixava de enviar tudo o resto.
const MAX_PAYLOAD_LENGTH = 12_000_000;
const PULL_LIMIT = 500;
// Bytes por resposta: em ligações lentas uma página de 500 operações com ficheiros não chegava a tempo.
const DEFAULT_PULL_BYTES = 3_000_000;
const MIN_PULL_BYTES = 200_000;
const MAX_PULL_BYTES = 8_000_000;

/** Regista no servidor cada envio recusado (sem dados da empresa): data, dispositivo, alterações e tamanho. */
const logRejected = (req, tenantId, deviceId, count, reason) => {
  const bytes = req.rawBody?.length ?? Buffer.byteLength(JSON.stringify(req.body || {}));
  console.warn(`[sync] Envio recusado (${reason}): empresa ${tenantId ? sha256(tenantId).slice(0, 12) : '?'}, dispositivo ${String(deviceId || '?').slice(0, 40)}, ${count} alteração(ões), ${bytes} bytes.`);
};

const send = (res, status, body) => {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-sync-passkey');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.json(body);
};

export default async function handler(req, res) {
  if (!applyCors(req, res)) {
    await recordRejectedOrigin(req);
    return send(res, 403, { success: false, message: 'Origem não autorizada.' });
  }
  if (req.method === 'OPTIONS') return send(res, 200, { success: true });
  if (req.method !== 'POST') return send(res, 405, { success: false, message: 'Método não permitido.' });
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    return send(res, 503, { success: false, message: 'Sincronização cloud ainda não configurada no servidor.' });
  }

  const body = req.body || {};
  const tenantId = String(body.tenantId || '').trim();
  const deviceId = String(body.deviceId || '').trim();
  const cursor = Math.max(0, Number(body.cursor || 0));
  const operations = Array.isArray(body.operations) ? body.operations : [];
  if (!tenantId || tenantId.length > 200 || !deviceId || deviceId.length > 100) {
    return send(res, 400, { success: false, message: 'Identificação da sincronização inválida.' });
  }
  const tenantHash = sha256(tenantId);
  const client = neon(databaseUrl);
  const sql = (text, params) => client.query(text, params);
  try {
    if (!await enforceDistributedRateLimit(sql, req, res, { limit: 120, windowMs: 60_000, scope: 'sync' })) return;
  } catch (error) {
    console.error('[sync][rate-limit]', error);
    return send(res, 503, { success: false, message: 'O controlo de acesso está indisponível.' });
  }

  const bearer = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const providedKey = req.headers['x-sync-passkey'] || bearer;
  try {
    const auth = await authorizeTenant(sql, tenantId, providedKey, req);
    if (!auth.ok) return send(res, auth.status, { success: false, code: auth.code, message: auth.message });
    if (!await enforceDistributedRateLimit(sql, req, res, {
      limit: 600, windowMs: 60_000, scope: 'sync-tenant', subject: tenantId, dimension: 'subject'
    })) return;
    // Depois de confirmada a empresa: a recusa fica também no diagnóstico deste dispositivo.
    if (operations.length > MAX_OPERATIONS) {
      logRejected(req, tenantId, deviceId, operations.length, 'demasiadas alterações');
      await recordSyncDevice(sql, { tenantHash, deviceId, userAgent: req.headers['user-agent'], diagnostics: body.diagnostics,
        outcome: { rejected413: true, error: `Envio recusado: ${operations.length} alterações (máximo ${MAX_OPERATIONS}).` } });
      return send(res, 413, { success: false, code: 'TOO_MANY_OPERATIONS', message: 'Foram enviadas demasiadas alterações de uma só vez.' });
    }
    // O executável da empresa informa se foi configurado como multi-empresa (a web mostra o mesmo layout).
    if (typeof body.companyProfile?.multiTenant === 'boolean') {
      await sql(`UPDATE tango_tenants SET multi_tenant = $2 WHERE UPPER(tenant_id) = UPPER($1) AND multi_tenant IS DISTINCT FROM $2`,
        [tenantId, body.companyProfile.multiTenant]);
    }
  } catch (error) {
    console.error('[sync][auth]', error);
    return send(res, 500, { success: false, message: 'O servidor não conseguiu validar o acesso.' });
  }

  try {
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
    await sql(`CREATE INDEX IF NOT EXISTS tango_sync_tenant_seq_idx ON tango_sync_operations (tenant_hash, seq)`);
    // Última lista completa de utilizadores enviada pelo computador da empresa (cifrada, ilegível aqui).
    // A versão web pede-a directamente: não depende do cursor nem de ter estado ligada quando foi enviada.
    await sql(`
      CREATE TABLE IF NOT EXISTS tango_sync_rosters (
        tenant_hash TEXT PRIMARY KEY,
        operation_id TEXT NOT NULL,
        device_id TEXT NOT NULL,
        payload TEXT NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const validatedOperations = [];
    let roster = null;
    // Alterações maiores do que o limite: o dispositivo põe-nas de parte (sem as perder) e envia as restantes.
    const tooLarge = operations.filter(operation => String(operation?.payload || '').length > MAX_PAYLOAD_LENGTH).map(operation => String(operation?.id || ''));
    if (tooLarge.length) {
      logRejected(req, tenantId, deviceId, operations.length, `${tooLarge.length} alteração(ões) acima de ${MAX_PAYLOAD_LENGTH} caracteres`);
      await recordSyncDevice(sql, { tenantHash, deviceId, userAgent: req.headers['user-agent'], diagnostics: body.diagnostics,
        outcome: { rejected413: true, error: `Envio recusado: ${tooLarge.length} alteração(ões) grande(s) demais.` } });
      return send(res, 413, { success: false, code: 'OPERATION_TOO_LARGE', operationIds: tooLarge, maxPayloadLength: MAX_PAYLOAD_LENGTH, message: 'Há alterações demasiado grandes para enviar.' });
    }
    for (const operation of operations) {
      const id = String(operation?.id || '');
      const sourceDevice = String(operation?.deviceId || deviceId);
      const payload = String(operation?.payload || '');
      if (!/^[0-9a-f-]{20,80}$/i.test(id) || sourceDevice.length > 100 || !payload) {
        logRejected(req, tenantId, deviceId, operations.length, 'alteração inválida');
        return send(res, 400, { success: false, message: 'Alteração de sincronização inválida.' });
      }
      validatedOperations.push({ operation_id: id, device_id: sourceDevice, payload });
      if (operation?.kind === 'users') roster = { id, device: sourceDevice, payload };
    }
    if (validatedOperations.length) {
      // O número (seq) é atribuído quando a gravação começa, mas só fica visível quando termina. Com dois envios
      // da mesma empresa ao mesmo tempo, o que começou primeiro podia terminar depois: quem recebia nesse instante
      // avançava o cursor para lá dos números dele e nunca mais os recebia. O bloqueio por empresa (no mesmo
      // comando, até ao fim da gravação) põe os envios em fila: um número visível garante que os anteriores também.
      await sql(
        `WITH tenant_lock AS (SELECT pg_advisory_xact_lock(hashtextextended($1, 7041)) AS locked)
         INSERT INTO tango_sync_operations (tenant_hash, operation_id, device_id, payload)
         SELECT $1, item.operation_id, item.device_id, item.payload
         FROM tenant_lock, jsonb_to_recordset($2::jsonb) AS item(operation_id TEXT, device_id TEXT, payload TEXT)
         ON CONFLICT (tenant_hash, operation_id) DO NOTHING`,
        [tenantHash, JSON.stringify(validatedOperations)]
      );
    }
    if (roster) {
      await sql(
        `INSERT INTO tango_sync_rosters (tenant_hash, operation_id, device_id, payload, updated_at)
         VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT (tenant_hash) DO UPDATE SET operation_id = EXCLUDED.operation_id, device_id = EXCLUDED.device_id,
           payload = EXCLUDED.payload, updated_at = NOW()`,
        [tenantHash, roster.id, roster.device, roster.payload]
      );
    }

    let usersRoster;
    if (body.usersRoster) {
      const [saved] = await sql(
        `SELECT operation_id, device_id, payload, updated_at FROM tango_sync_rosters WHERE tenant_hash = $1`,
        [tenantHash]
      );
      const updatedAt = saved ? new Date(saved.updated_at).toISOString() : null;
      const since = Date.parse(String(body.usersRosterSince || ''));
      usersRoster = !saved
        ? null
        : saved.device_id === deviceId || (Number.isFinite(since) && Date.parse(updatedAt) <= since)
          ? { updatedAt, unchanged: true }
          : { id: saved.operation_id, deviceId: saved.device_id, payload: saved.payload, updatedAt };
    }

    // pull: false só envia (e pede a lista de utilizadores), sem receber alterações: resposta rápida para o login.
    if (body.pull === false) {
      await recordSyncDevice(sql, { tenantHash, deviceId, userAgent: req.headers['user-agent'], diagnostics: body.diagnostics, outcome: { synced: true, cursor } });
      return send(res, 200, { success: true, cursor, hasMore: false, operations: [], ...(usersRoster !== undefined ? { usersRoster } : {}) });
    }

    const pullBytes = Math.min(MAX_PULL_BYTES, Math.max(MIN_PULL_BYTES, Number(body.maxBytes) || DEFAULT_PULL_BYTES));
    let rows;
    let fetched;
    try {
      rows = await sql(
        `WITH page AS (
           SELECT seq, operation_id, device_id, payload
           FROM tango_sync_operations
           WHERE tenant_hash = $1 AND seq > $2
           ORDER BY seq ASC
           LIMIT $3
         ), sized AS (
           SELECT seq, operation_id, device_id, payload,
                  SUM(OCTET_LENGTH(payload)) OVER (ORDER BY seq) AS running, OCTET_LENGTH(payload) AS payload_size,
                  COUNT(*) OVER () AS fetched
           FROM page
         )
         SELECT seq, operation_id, device_id, payload, fetched FROM sized
         WHERE running - payload_size < $4
         ORDER BY seq ASC`,
        [tenantHash, cursor, PULL_LIMIT + 1, pullBytes]
      );
      fetched = rows.length ? Number(rows[0].fetched) : 0;
    } catch (error) {
      // Base sem suporte para a página por tamanho: a página por número de operações continua a funcionar.
      console.warn('[sync] Página por tamanho indisponível:', error?.message);
      rows = await sql(
        `SELECT seq, operation_id, device_id, payload FROM tango_sync_operations
         WHERE tenant_hash = $1 AND seq > $2 ORDER BY seq ASC LIMIT $3`,
        [tenantHash, cursor, PULL_LIMIT + 1]
      );
      fetched = rows.length;
    }
    const hasMore = fetched > PULL_LIMIT || rows.length < fetched;
    const page = rows.slice(0, PULL_LIMIT);
    const nextCursor = page.length ? Number(page[page.length - 1].seq) : cursor;

    // O histórico completo é o que permite a um dispositivo novo receber todos os dados da empresa.
    // Só se apaga quando a retenção é configurada explicitamente na Vercel.
    const retentionDays = Number(process.env.TANGO_SYNC_RETENTION_DAYS || 0);
    if (retentionDays > 0 && Math.random() < 0.01) {
      await sql(`DELETE FROM tango_sync_operations WHERE created_at < NOW() - ($1 * INTERVAL '1 day')`, [Math.max(365, retentionDays)]);
    }

    await recordSyncDevice(sql, { tenantHash, deviceId, userAgent: req.headers['user-agent'], diagnostics: body.diagnostics, outcome: { synced: true, cursor: nextCursor } });
    return send(res, 200, {
      success: true,
      cursor: nextCursor,
      hasMore,
      ...(usersRoster !== undefined ? { usersRoster } : {}),
      operations: page
        .filter(row => row.device_id !== deviceId)
        .map(row => ({ id: row.operation_id, deviceId: row.device_id, payload: row.payload }))
    });
  } catch (error) {
    console.error('[sync]', error);
    await recordSyncDevice(sql, { tenantHash, deviceId, userAgent: req.headers['user-agent'], diagnostics: body.diagnostics,
      outcome: { error: `Erro do servidor: ${error?.message || 'falha ao sincronizar'}` } });
    return send(res, 500, { success: false, message: 'O servidor não conseguiu sincronizar os dados.' });
  }
}
