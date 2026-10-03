import { neon } from '@neondatabase/serverless';
import { applyCors, enforceDistributedRateLimit } from './_security.js';
import { authorizeTenant, sha256 } from './_autorizacao-empresa.js';

const MAX_OPERATIONS = 100;
const MAX_PAYLOAD_LENGTH = 2_000_000;
const PULL_LIMIT = 500;

const send = (res, status, body) => {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-sync-passkey');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.json(body);
};

export default async function handler(req, res) {
  if (!applyCors(req, res)) return send(res, 403, { success: false, message: 'Origem não autorizada.' });
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
  if (operations.length > MAX_OPERATIONS) {
    return send(res, 413, { success: false, message: 'Foram enviadas demasiadas alterações de uma só vez.' });
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
    const auth = await authorizeTenant(sql, tenantId, providedKey);
    if (!auth.ok) return send(res, auth.status, { success: false, message: auth.message });
    if (!await enforceDistributedRateLimit(sql, req, res, {
      limit: 600, windowMs: 60_000, scope: 'sync-tenant', subject: tenantId, dimension: 'subject'
    })) return;
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

    const validatedOperations = [];
    for (const operation of operations) {
      const id = String(operation?.id || '');
      const sourceDevice = String(operation?.deviceId || deviceId);
      const payload = String(operation?.payload || '');
      if (!/^[0-9a-f-]{20,80}$/i.test(id) || sourceDevice.length > 100 || !payload || payload.length > MAX_PAYLOAD_LENGTH) {
        return send(res, 400, { success: false, message: 'Alteração de sincronização inválida.' });
      }
      validatedOperations.push({ operation_id: id, device_id: sourceDevice, payload });
    }
    if (validatedOperations.length) {
      await sql(
        `INSERT INTO tango_sync_operations (tenant_hash, operation_id, device_id, payload)
         SELECT $1, item.operation_id, item.device_id, item.payload
         FROM jsonb_to_recordset($2::jsonb) AS item(operation_id TEXT, device_id TEXT, payload TEXT)
         ON CONFLICT (tenant_hash, operation_id) DO NOTHING`,
        [tenantHash, JSON.stringify(validatedOperations)]
      );
    }

    const rows = await sql(
      `SELECT seq, operation_id, device_id, payload
       FROM tango_sync_operations
       WHERE tenant_hash = $1 AND seq > $2
       ORDER BY seq ASC
       LIMIT $3`,
      [tenantHash, cursor, PULL_LIMIT + 1]
    );
    const hasMore = rows.length > PULL_LIMIT;
    const page = rows.slice(0, PULL_LIMIT);
    const nextCursor = page.length ? Number(page[page.length - 1].seq) : cursor;

    // O histórico completo é o que permite a um dispositivo novo receber todos os dados da empresa.
    // Só se apaga quando a retenção é configurada explicitamente na Vercel.
    const retentionDays = Number(process.env.TANGO_SYNC_RETENTION_DAYS || 0);
    if (retentionDays > 0 && Math.random() < 0.01) {
      await sql(`DELETE FROM tango_sync_operations WHERE created_at < NOW() - ($1 * INTERVAL '1 day')`, [Math.max(365, retentionDays)]);
    }

    return send(res, 200, {
      success: true,
      cursor: nextCursor,
      hasMore,
      operations: page
        .filter(row => row.device_id !== deviceId)
        .map(row => ({ id: row.operation_id, deviceId: row.device_id, payload: row.payload }))
    });
  } catch (error) {
    console.error('[sync]', error);
    return send(res, 500, { success: false, message: 'O servidor não conseguiu sincronizar os dados.' });
  }
}
