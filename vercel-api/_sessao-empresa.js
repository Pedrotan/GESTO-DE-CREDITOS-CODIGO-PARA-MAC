import crypto from 'node:crypto';

// Sessão da versão web de uma empresa (pentest A-02). Depois de o navegador provar o Código de Acesso uma vez,
// recebe um cookie HttpOnly (o JavaScript da página não o consegue ler) e deixa de guardar o código. A sessão
// fica ligada ao código em vigor: quando o administrador muda o código, todas as sessões da empresa caducam.

export const COMPANY_SESSION_COOKIE = '__Host-tango_sessao';
export const COMPANY_SESSION_DAYS = 30;
const TOKEN_PATTERN = /^tws_[A-Za-z0-9_-]{43}$/;

const sha256 = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');

export const ensureCompanySessionsTable = async (sql) => {
  await sql(`CREATE TABLE IF NOT EXISTS tango_web_sessions (
    token_hash TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    key_fingerprint TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL
  )`);
};

const readCookie = (req, name) => {
  const header = String(req?.headers?.cookie || '');
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index > 0 && part.slice(0, index).trim() === name) return part.slice(index + 1).trim();
  }
  return '';
};

const cookieHeader = (value, maxAgeSeconds) =>
  `${COMPANY_SESSION_COOKIE}=${value}; Path=/; Max-Age=${maxAgeSeconds}; HttpOnly; Secure; SameSite=Strict`;

/** Abre uma sessão para a empresa (depois de o código ter sido verificado) e envia o cookie. */
export const startCompanySession = async (sql, res, tenantId, keyHash) => {
  await ensureCompanySessionsTable(sql);
  await sql('DELETE FROM tango_web_sessions WHERE expires_at <= NOW()');
  const token = `tws_${crypto.randomBytes(32).toString('base64url')}`;
  const maxAge = COMPANY_SESSION_DAYS * 86_400;
  await sql(`INSERT INTO tango_web_sessions (token_hash, tenant_id, key_fingerprint, expires_at)
    VALUES ($1, $2, $3, NOW() + ($4 * INTERVAL '1 second'))`, [sha256(token), tenantId, keyHash, maxAge]);
  res.setHeader('Set-Cookie', cookieHeader(token, maxAge));
};

/** Empresa da sessão deste pedido, se o cookie for válido e o código da empresa não tiver mudado; senão null. */
export const companySessionTenant = async (sql, req) => {
  const token = readCookie(req, COMPANY_SESSION_COOKIE);
  if (!TOKEN_PATTERN.test(token)) return null;
  await ensureCompanySessionsTable(sql);
  const rows = await sql(`SELECT s.tenant_id FROM tango_web_sessions s
    JOIN tango_tenants t ON UPPER(t.tenant_id) = UPPER(s.tenant_id)
    WHERE s.token_hash = $1 AND s.expires_at > NOW() AND s.key_fingerprint = t.key_hash`, [sha256(token)]);
  return rows[0]?.tenant_id || null;
};

export const sameCompany = (left, right) =>
  String(left || '').replace(/[^a-z0-9]/giu, '').toUpperCase() === String(right || '').replace(/[^a-z0-9]/giu, '').toUpperCase();

/** Termina a sessão deste pedido e apaga o cookie. */
export const endCompanySession = async (sql, req, res) => {
  const token = readCookie(req, COMPANY_SESSION_COOKIE);
  if (TOKEN_PATTERN.test(token)) {
    await ensureCompanySessionsTable(sql);
    await sql('DELETE FROM tango_web_sessions WHERE token_hash = $1', [sha256(token)]);
  }
  res.setHeader('Set-Cookie', cookieHeader('', 0));
};
