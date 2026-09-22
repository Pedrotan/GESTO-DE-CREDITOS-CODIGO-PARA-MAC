import crypto from 'node:crypto';
import { neon } from '@neondatabase/serverless';
import { applyCors, enforceRateLimit } from './_security.js';

// API de administração de empresas (tenants) e chaves de sincronização.
// Uso exclusivo do Painel Master. Protegida por TANGO_MASTER_SECRET
// (com fallback para TANGO_SYNC_SECRET para facilitar a primeira configuração).

const send = (res, status, body) => {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-master-secret');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.json(body);
};

const safeEqual = (left, right) => {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

const sha256 = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');

const generateTenantKey = () => `tango_live_${crypto.randomBytes(24).toString('base64url')}`;

const ensureTable = async (sql) => {
  await sql(`
    CREATE TABLE IF NOT EXISTS tango_tenants (
      tenant_id TEXT PRIMARY KEY,
      tenant_hash TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      key_hash TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      expires_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_sync_at TIMESTAMPTZ
    )
  `);
  // Necessária aqui também porque a query "list" faz JOIN com esta tabela,
  // e o Painel Master pode ser usado antes de qualquer sincronização ocorrer.
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
  status: row.status,
  expiresAt: row.expires_at,
  createdAt: row.created_at,
  lastSyncAt: row.last_sync_at,
  operations: row.operations !== undefined ? Number(row.operations) : undefined
});

export default async function handler(req, res) {
  if (!applyCors(req, res)) return send(res, 403, { success: false, message: 'Origem não autorizada.' });
  if (req.method === 'OPTIONS') return send(res, 200, { success: true });
  if (req.method !== 'POST') return send(res, 405, { success: false, message: 'Método não permitido.' });
  if (!enforceRateLimit(req, res, { limit: 30, windowMs: 60_000, scope: 'tenants' })) return;

  const databaseUrl = process.env.DATABASE_URL;
  const masterSecret = process.env.TANGO_MASTER_SECRET;
  if (!databaseUrl || !masterSecret) {
    return send(res, 503, { success: false, message: 'Painel Master ainda não configurado no servidor (DATABASE_URL / TANGO_MASTER_SECRET).' });
  }

  const bearer = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const provided = bearer || req.headers['x-master-secret'];
  if (!safeEqual(provided, masterSecret)) {
    return send(res, 401, { success: false, message: 'Chave mestra inválida.' });
  }

  const body = req.body || {};
  const action = String(body.action || '').trim();
  const tenantId = String(body.tenantId || '').trim();
  const name = String(body.name || '').trim();
  const expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;
  if (expiresAt && Number.isNaN(expiresAt.getTime())) {
    return send(res, 400, { success: false, message: 'Data de expiração inválida.' });
  }

  const client = neon(databaseUrl);
  const sql = (text, params) => client.query(text, params);

  try {
    await ensureTable(sql);

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

    if (!tenantId || tenantId.length > 200) {
      return send(res, 400, { success: false, message: 'Identificação da empresa (NIF) inválida.' });
    }
    const tenantHash = sha256(tenantId);

    if (action === 'create') {
      if (!name || name.length > 200) {
        return send(res, 400, { success: false, message: 'Nome da empresa inválido.' });
      }
      const existing = await sql('SELECT tenant_id FROM tango_tenants WHERE tenant_id = $1', [tenantId]);
      if (existing.length) {
        return send(res, 409, { success: false, message: 'Já existe uma empresa registada com este NIF.' });
      }
      const key = generateTenantKey();
      await sql(
        `INSERT INTO tango_tenants (tenant_id, tenant_hash, name, key_hash, status, expires_at)
         VALUES ($1, $2, $3, $4, 'active', $5)`,
        [tenantId, tenantHash, name, sha256(key), expiresAt]
      );
      // A chave em claro só é devolvida neste momento — apenas o hash fica guardado.
      return send(res, 200, { success: true, key, tenant: { tenantId, name, status: 'active', expiresAt } });
    }

    const rows = await sql('SELECT * FROM tango_tenants WHERE tenant_id = $1', [tenantId]);
    if (!rows.length) {
      return send(res, 404, { success: false, message: 'Empresa não encontrada.' });
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
           expires_at = CASE WHEN $4 THEN $5 ELSE expires_at END
         WHERE tenant_id = $1`,
        [tenantId, name, status, body.expiresAt !== undefined, expiresAt]
      );
      const [updated] = await sql('SELECT * FROM tango_tenants WHERE tenant_id = $1', [tenantId]);
      return send(res, 200, { success: true, tenant: toPublicTenant(updated) });
    }

    if (action === 'rotate') {
      const key = generateTenantKey();
      await sql('UPDATE tango_tenants SET key_hash = $2 WHERE tenant_id = $1', [tenantId, sha256(key)]);
      return send(res, 200, { success: true, key });
    }

    if (action === 'delete') {
      await sql('DELETE FROM tango_tenants WHERE tenant_id = $1', [tenantId]);
      if (body.purgeData === true) {
        await sql('DELETE FROM tango_sync_operations WHERE tenant_hash = $1', [tenantHash]);
      }
      return send(res, 200, { success: true });
    }

    return send(res, 400, { success: false, message: 'Ação desconhecida.' });
  } catch (error) {
    console.error('[tenants]', error);
    return send(res, 500, { success: false, message: 'O servidor não conseguiu processar o pedido.' });
  }
}
