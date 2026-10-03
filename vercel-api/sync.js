import crypto from 'node:crypto';
import { neon } from '@neondatabase/serverless';
import { applyCors, enforceDistributedRateLimit } from './_security.js';

const MAX_OPERATIONS = 100;
const MAX_PAYLOAD_LENGTH = 2_000_000;
const PULL_LIMIT = 500;

const send = (res, status, body) => {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-sync-passkey');
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

// Middleware de autorização por empresa (tenant).
// Se a empresa estiver registada no Painel Master (tabela tango_tenants),
// valida a chave/código individual dela + estado + expiração. Caso contrário,
// mantém a compatibilidade com a chave global TANGO_SYNC_SECRET.
const authorizeTenant = async (sql, tenantId, providedKey) => {
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

  const rows = await sql('SELECT key_hash, status, expires_at, access_code FROM tango_tenants WHERE UPPER(tenant_id) = UPPER($1)', [tenantId]);
  // Chave global de administração: apenas a configurada no servidor, nunca um valor fixo no código.
  const globalSecret = String(process.env.TANGO_SYNC_SECRET || '').trim();
  const isGlobalSecretValid = Boolean(globalSecret && safeEqual(providedKey, globalSecret));

  if (!rows.length) {
    if (isGlobalSecretValid) {
      await sql(`
        INSERT INTO tango_tenants (tenant_id, tenant_hash, name, key_hash, status, created_at, last_sync_at)
        VALUES ($1, $2, $3, $4, 'active', NOW(), NOW())
        ON CONFLICT (tenant_id) DO UPDATE SET last_sync_at = NOW()
      `, [tenantId, sha256(tenantId), `Empresa ${tenantId}`, sha256(providedKey)]);
      return { ok: true };
    }
    return { ok: false, status: 403, message: 'Empresa não registada para sincronização.' };
  }

  const tenant = rows[0];
  const normProvided = normalizeCode(providedKey);
  const isTenantKeyValid = 
    safeEqual(sha256(providedKey), tenant.key_hash) ||
    safeEqual(sha256(normProvided), tenant.key_hash) ||
    (tenant.access_code && (
      safeEqual(tenant.access_code.trim().toUpperCase(), String(providedKey).trim().toUpperCase()) ||
      safeEqual(normalizeCode(tenant.access_code), normProvided)
    ));

  if (!isTenantKeyValid && !isGlobalSecretValid) {
    return { ok: false, status: 401, message: 'Chave ou Código de Acesso de sincronização inválido para esta empresa.' };
  }
  if (tenant.status !== 'active') {
    return { ok: false, status: 403, message: 'O acesso desta empresa está bloqueado no Tango Master. Contacte o administrador.' };
  }
  if (tenant.expires_at && new Date(tenant.expires_at).getTime() < Date.now()) {
    return { ok: false, status: 403, message: 'A chave ou código de acesso desta empresa expirou. Contacte o administrador.' };
  }
  await sql('UPDATE tango_tenants SET last_sync_at = NOW() WHERE UPPER(tenant_id) = UPPER($1)', [tenantId]);
  return { ok: true };
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
