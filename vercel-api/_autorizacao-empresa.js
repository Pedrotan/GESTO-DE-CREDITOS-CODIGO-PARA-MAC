import crypto from 'node:crypto';
import { clearAuthFailures, lockoutRemaining, registerAuthFailure } from './_alertas.js';

// Autorização de uma empresa (tenant) pelo seu código de acesso. Partilhada pela sincronização e
// pelo envio dos relatórios de utilização.

export const safeEqual = (left, right) => {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

export const sha256 = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');

export const normalizeCode = (val) => String(val || '').trim().replace(/[-\s]/g, '').toUpperCase();

// Middleware de autorização por empresa (tenant).
// Se a empresa estiver registada no Painel Master (tabela tango_tenants),
// valida a chave/código individual dela + estado + expiração. Caso contrário,
// mantém a compatibilidade com a chave global TANGO_SYNC_SECRET.
export const authorizeTenant = async (sql, tenantId, providedKey, req = null) => {
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

  // Quem falhou a chave demasiadas vezes fica bloqueado (por IP e por empresa) antes de qualquer comparação.
  if (req) {
    const remaining = await lockoutRemaining(sql, req, { scope: 'tenant_key', subject: tenantId });
    if (remaining > 0) return { ok: false, status: 429, message: `Acesso bloqueado por tentativas falhadas. Tente novamente em ${Math.ceil(remaining / 60)} minuto(s).` };
  }
  const fail = async (result, details) => {
    if (req) await registerAuthFailure(sql, req, { scope: 'tenant_key', subject: tenantId, type: 'tenant_key_failed', title: 'Chave de sincronização de empresa errada', details });
    return result;
  };
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
    return fail({ ok: false, status: 403, message: 'Empresa não registada para sincronização.' }, `Tentativa de sincronizar a empresa ${tenantId}, que não está registada.`);
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
    return fail({ ok: false, status: 401, message: 'Chave ou Código de Acesso de sincronização inválido para esta empresa.' }, `Chave de sincronização errada para a empresa ${tenantId}.`);
  }
  if (tenant.status !== 'active') {
    return { ok: false, status: 403, message: 'O acesso desta empresa está bloqueado no Tango Master. Contacte o administrador.' };
  }
  if (tenant.expires_at && new Date(tenant.expires_at).getTime() < Date.now()) {
    return { ok: false, status: 403, message: 'A chave ou código de acesso desta empresa expirou. Contacte o administrador.' };
  }
  await sql('UPDATE tango_tenants SET last_sync_at = NOW() WHERE UPPER(tenant_id) = UPPER($1)', [tenantId]);
  if (req) await clearAuthFailures(sql, { scope: 'tenant_key', subject: tenantId });
  return { ok: true };
};
