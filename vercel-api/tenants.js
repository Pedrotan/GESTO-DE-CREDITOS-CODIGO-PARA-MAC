import crypto from 'node:crypto';
import { neon } from '@neondatabase/serverless';
import { applyCors, enforceDistributedRateLimit } from './_security.js';

// API de administração de empresas (tenants) e chaves de sincronização.
// Uso exclusivo do Painel Master. Protegida por TANGO_MASTER_SECRET
// Sem a variável configurada, o painel fica indisponível (não há chaves fixas no código).

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
  operations: row.operations !== undefined ? Number(row.operations) : undefined
});

// Remove diferenças invisíveis ao copiar a chave: espaços, aspas envolventes e formas Unicode.
const normalizeSecret = (value) => String(value ?? '')
  .normalize('NFC')
  .trim()
  .replace(/^(['"`])(.*)\1$/su, '$2')
  .trim();

export default async function handler(req, res) {
  if (!applyCors(req, res)) return send(res, 403, { success: false, message: 'Origem não autorizada.' });
  if (req.method === 'OPTIONS') return send(res, 200, { success: true });
  if (req.method !== 'POST') return send(res, 405, { success: false, message: 'Método não permitido.' });
  
  const databaseUrl = process.env.DATABASE_URL;
  // Apenas a chave mestra configurada no servidor é aceite; sem ela o painel fica indisponível.
  const masterSecret = normalizeSecret(process.env.TANGO_MASTER_SECRET);

  if (!databaseUrl || !masterSecret) {
    return send(res, 503, { success: false, message: 'Painel Master ainda não configurado no servidor.' });
  }

  // O corpo JSON chega em UTF-8; os cabeçalhos HTTP são lidos em latin1, o que altera acentos.
  const bearer = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const header = bearer || String(req.headers['x-master-secret'] || '');
  const candidates = [
    req.body?.masterSecret,
    header,
    Buffer.from(header, 'latin1').toString('utf8')
  ].map(normalizeSecret).filter(Boolean);

  if (!candidates.some(candidate => safeEqual(candidate, masterSecret))) {
    return send(res, 401, { success: false, message: 'Chave mestra inválida. Use o valor de TANGO_MASTER_SECRET configurado no projeto na Vercel.' });
  }

  const body = req.body || {};
  const action = String(body.action || '').trim();
  const rawTenantId = String(body.tenantId || '').trim();
  const tenantId = rawTenantId.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  const name = String(body.name || '').trim();
  const expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;
  if (expiresAt && Number.isNaN(expiresAt.getTime())) {
    return send(res, 400, { success: false, message: 'Data de expiração inválida.' });
  }

  const client = neon(databaseUrl);
  const sql = (text, params) => client.query(text, params);
  try {
    if (!await enforceDistributedRateLimit(sql, req, res, { limit: 60, windowMs: 60_000, scope: 'tenants' })) return;
  } catch (error) {
    console.error('[tenants][rate-limit]', error);
    return send(res, 503, { success: false, message: 'O controlo de acesso está temporariamente indisponível.' });
  }

  try {
    await ensureTable(sql);

    if (action === 'verify') {
      return send(res, 200, { success: true, message: 'Credenciais master válidas e ligadas com sucesso.' });
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
        `INSERT INTO tango_tenants (tenant_id, tenant_hash, name, key_hash, access_code, status, expires_at)
         VALUES ($1, $2, $3, $4, $5, 'active', $6)`,
        [tenantId, tenantHash, name, sha256(normKey), code, expiresAt]
      );
      
      return send(res, 200, { 
        success: true, 
        key: code, 
        accessCode: code,
        tenant: { tenantId, name, accessCode: code, status: 'active', expiresAt } 
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
           expires_at = CASE WHEN $4 THEN $5 ELSE expires_at END
         WHERE UPPER(tenant_id) = UPPER($1)`,
        [tenantId, name, status, body.expiresAt !== undefined, expiresAt]
      );
      const [updated] = await sql('SELECT * FROM tango_tenants WHERE UPPER(tenant_id) = UPPER($1)', [tenantId]);
      return send(res, 200, { success: true, tenant: toPublicTenant(updated) });
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
