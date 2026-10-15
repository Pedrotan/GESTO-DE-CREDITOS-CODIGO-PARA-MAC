import crypto from 'node:crypto';
import { clearAuthFailures, isTrustedClient, lockoutRemaining, registerAuthFailure, rememberTrustedClient } from './_alertas.js';
import { licenseGate } from './_licencas.js';
import { isCompromisedSecret } from './_security.js';
import { companySessionTenant, sameCompany } from './_sessao-empresa.js';

// Autorização de uma empresa (tenant) pelo seu código de acesso. Partilhada pela sincronização e
// pelo envio dos relatórios de utilização.

export const safeEqual = (left, right) => {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

export const sha256 = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');

export const normalizeCode = (val) => String(val || '').trim().replace(/[-\s]/g, '').toUpperCase();

// Modo multi-empresa da empresa: definido no cadastro do Tango Master e actualizado pelo executável da empresa.
// NULL = ainda desconhecido (a versão web mantém o comportamento das suas definições locais).
export const ensureTenantProfileColumns = async (sql) => {
  await sql(`ALTER TABLE tango_tenants ADD COLUMN IF NOT EXISTS multi_tenant BOOLEAN`);
};

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
  await ensureTenantProfileColumns(sql);

  // Quem falhou a chave demasiadas vezes fica bloqueado (por IP e por empresa) antes de qualquer comparação.
  // Os clientes que já sincronizaram esta empresa não ficam presos ao bloqueio da empresa (só ao do seu IP).
  const trusted = req ? await isTrustedClient(sql, req, tenantId) : false;
  if (req) {
    const remaining = await lockoutRemaining(sql, req, { scope: 'tenant_key', subject: tenantId, trusted });
    if (remaining > 0) return { ok: false, status: 429, message: `Acesso bloqueado por tentativas falhadas. Tente novamente em ${Math.ceil(remaining / 60)} minuto(s).` };
  }
  const fail = async (result, details) => {
    if (req) await registerAuthFailure(sql, req, { scope: 'tenant_key', subject: trusted ? '' : tenantId, type: 'tenant_key_failed', title: 'Chave de sincronização de empresa errada', details });
    return result;
  };
  const rows = await sql('SELECT key_hash, status, expires_at, access_code FROM tango_tenants WHERE UPPER(tenant_id) = UPPER($1)', [tenantId]);
  // Chave global de administração: apenas a configurada no servidor, nunca um valor fixo no código.
  // Uma chave global que já foi exposta é ignorada (como se não estivesse configurada).
  const configuredGlobal = String(process.env.TANGO_SYNC_SECRET || '').trim();
  const globalSecret = isCompromisedSecret(configuredGlobal) ? '' : configuredGlobal;
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
  // Versão web: sem código no pedido, vale a sessão HttpOnly da empresa (o navegador já não guarda o código).
  const sessionTenant = !String(providedKey || '').trim() && req ? await companySessionTenant(sql, req) : null;
  const normProvided = normalizeCode(providedKey);
  const isTenantKeyValid = Boolean(sessionTenant && sameCompany(sessionTenant, tenantId)) ||
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
  // A licença da empresa (fonte única de verdade) tem de estar activa: sem ela, a nuvem recusa o pedido.
  const license = await licenseGate(sql, tenantId);
  if (!license.ok) return { ok: false, status: license.status, code: license.code, message: license.message };
  await sql('UPDATE tango_tenants SET last_sync_at = NOW() WHERE UPPER(tenant_id) = UPPER($1)', [tenantId]);
  if (req) {
    await clearAuthFailures(sql, { scope: 'tenant_key', subject: tenantId });
    await rememberTrustedClient(sql, req, tenantId);
  }
  return { ok: true };
};
