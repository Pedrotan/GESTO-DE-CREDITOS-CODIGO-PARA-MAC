import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { loadSigningKey, publicKeyInfo } from './_token-licenca.js';

// Sessões por utilizador emitidas pelo servidor. Em cada login o servidor valida a senha (o verificador bcrypt que o
// computador da empresa lhe envia) e entrega um conjunto de tokens:
//   - access token: JWT assinado com Ed25519 (typ at+jwt), válido 15 minutos, com o utilizador, a empresa, o perfil,
//     as permissões e a sessão. Cada uso confirma também que a sessão continua aberta (revogação imediata);
//   - refresh token: aleatório (256 bits), guardado só como hash, trocado em cada uso. Um refresh token já trocado
//     que volte a aparecer revela roubo: a sessão inteira é revogada;
//   - token CSRF: obrigatório para renovar ou fechar uma sessão da versão web (o refresh vai num cookie HttpOnly).
// No navegador, o refresh token fica num cookie HttpOnly que o JavaScript da página não lê; no computador, fica só
// na memória do processo principal.

export const ACCESS_TTL_S = 15 * 60;
export const REFRESH_IDLE_S = 8 * 60 * 60;
export const SESSION_ABSOLUTE_S = 24 * 60 * 60;
// Dois separadores do mesmo navegador a renovar ao mesmo tempo: o segundo ainda leva o refresh anterior. Dentro desta
// janela é uma corrida (pede-se nova tentativa); depois dela, é reutilização (roubo).
export const REFRESH_REUSE_GRACE_S = 30;
export const REFRESH_COOKIE = '__Host-tango_refresh';

const ISSUER = 'tango-gestao';
const AUDIENCE = 'tango-api';
const REFRESH_PATTERN = /^trt_[A-Za-z0-9_-]{43}$/;
const CSRF_PATTERN = /^tcs_[A-Za-z0-9_-]{43}$/;
const BCRYPT_PATTERN = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;
// Estados da conta que impedem o login. 'active' e 'offline' são só presença (online/desligado).
const DENIED_STATUSES = new Set(['blocked', 'deleted', 'inactive', 'suspended', 'disabled']);
const ADMIN_ROLES = new Set(['super_admin', 'admin']);
// Hash bcrypt de uma senha aleatória: comparada quando a conta não existe, para o tempo de resposta não a denunciar.
const DUMMY_VERIFIER = bcrypt.hashSync(crypto.randomBytes(18).toString('base64'), 10);

export const sha256 = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');
const randomToken = (prefix) => `${prefix}_${crypto.randomBytes(32).toString('base64url')}`;
const b64url = (value) => Buffer.from(value).toString('base64url');

export const normalizeLogin = (value) => String(value || '').trim().toLowerCase().slice(0, 254);
export const isDeniedStatus = (status) => DENIED_STATUSES.has(String(status || '').trim().toLowerCase());
const credentialFingerprint = (verifier) => sha256(`tango-credential:${verifier}`);

/** Chave de assinatura dos access tokens: própria (TANGO_SESSION_SIGNING_KEY) ou, sem ela, a das licenças. */
export const sessionSigningKey = () =>
  loadSigningKey(process.env.TANGO_SESSION_SIGNING_KEY) || loadSigningKey(process.env.TANGO_LICENSE_SIGNING_KEY);

let tablesReady = false;
export const ensureUserSessionTables = async (sql) => {
  if (tablesReady) return;
  await sql(`CREATE TABLE IF NOT EXISTS tango_user_credentials (
    tenant_hash TEXT NOT NULL,
    user_id TEXT NOT NULL,
    email TEXT,
    username TEXT,
    name TEXT,
    verifier TEXT NOT NULL,
    role TEXT NOT NULL,
    permissions TEXT NOT NULL DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'active',
    is_owner BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (tenant_hash, user_id)
  )`);
  await sql('CREATE INDEX IF NOT EXISTS tango_user_credentials_email ON tango_user_credentials (tenant_hash, email)');
  await sql('CREATE INDEX IF NOT EXISTS tango_user_credentials_username ON tango_user_credentials (tenant_hash, username)');
  await sql(`CREATE TABLE IF NOT EXISTS tango_user_sessions (
    session_id TEXT PRIMARY KEY,
    tenant_hash TEXT NOT NULL,
    tenant_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    refresh_hash TEXT NOT NULL UNIQUE,
    csrf_hash TEXT NOT NULL,
    credential_fingerprint TEXT NOT NULL,
    client_kind TEXT NOT NULL,
    device_id TEXT,
    ip TEXT,
    user_agent TEXT,
    generation INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    idle_expires_at TIMESTAMPTZ NOT NULL,
    absolute_expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    revoked_reason TEXT
  )`);
  await sql('CREATE INDEX IF NOT EXISTS tango_user_sessions_user ON tango_user_sessions (tenant_hash, user_id)');
  await sql(`CREATE TABLE IF NOT EXISTS tango_user_refresh_rotated (
    refresh_hash TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    rotated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  tablesReady = true;
};

/** Só para testes: volta a criar as tabelas numa base nova. */
export const resetUserSessionTablesForTests = () => { tablesReady = false; };

const parsePermissions = (raw) => {
  try {
    const value = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(value) ? value.map(String).filter(item => item.length <= 80).slice(0, 200) : [];
  } catch {
    return [];
  }
};

export const isAdminClaims = (claims) =>
  ADMIN_ROLES.has(String(claims?.role || '')) || claims?.own === true || (Array.isArray(claims?.perms) && claims.perms.includes('manage_users'));

const publicUser = (row) => ({
  id: row.user_id,
  name: row.name || null,
  email: row.email || null,
  username: row.username || null,
  role: row.role,
  permissions: parsePermissions(row.permissions),
  isOwner: row.is_owner === true ? 1 : 0,
});

// ── Verificadores enviados pelo computador da empresa ───────────────────────────────────────────

/** Valida um utilizador recebido; devolve null quando falta algo essencial (fica de fora, sem erro). */
const sanitizeIncomingUser = (input) => {
  const id = String(input?.id ?? '').trim();
  const verifier = String(input?.passwordHash ?? '').trim();
  const role = String(input?.role ?? '').trim();
  const email = normalizeLogin(input?.email);
  const username = normalizeLogin(input?.username);
  if (!id || id.length > 100 || !BCRYPT_PATTERN.test(verifier) || !role || role.length > 50) return null;
  if (!email && !username) return null;
  const status = isDeniedStatus(input?.status) ? String(input.status).trim().toLowerCase() : 'active';
  return {
    id, verifier, role, email: email || null, username: username || null,
    name: String(input?.name ?? '').trim().slice(0, 200) || null,
    permissions: JSON.stringify(parsePermissions(input?.permissions)),
    status,
    isOwner: input?.isOwner === true || Number(input?.isOwner) === 1,
  };
};

/**
 * Grava os verificadores da empresa. Senha mudada, conta bloqueada ou removida: as sessões dessa conta são revogadas.
 * `complete`: a lista é a de todos os utilizadores; quem não vem nela deixa de poder entrar.
 */
export const storeCredentials = async (sql, tenantHash, users, { complete = false } = {}) => {
  await ensureUserSessionTables(sql);
  const incoming = (Array.isArray(users) ? users : []).slice(0, 2000).map(sanitizeIncomingUser).filter(Boolean);
  const existing = await sql('SELECT user_id, verifier, status FROM tango_user_credentials WHERE tenant_hash = $1', [tenantHash]);
  const previous = new Map(existing.map(row => [row.user_id, row]));
  let revoked = 0;
  for (const user of incoming) {
    await sql(`INSERT INTO tango_user_credentials (tenant_hash, user_id, email, username, name, verifier, role, permissions, status, is_owner, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
      ON CONFLICT (tenant_hash, user_id) DO UPDATE SET email = EXCLUDED.email, username = EXCLUDED.username, name = EXCLUDED.name,
        verifier = EXCLUDED.verifier, role = EXCLUDED.role, permissions = EXCLUDED.permissions, status = EXCLUDED.status,
        is_owner = EXCLUDED.is_owner, updated_at = NOW()`,
    [tenantHash, user.id, user.email, user.username, user.name, user.verifier, user.role, user.permissions, user.status, user.isOwner]);
    const before = previous.get(user.id);
    if (before && before.verifier !== user.verifier) revoked += await revokeUserSessions(sql, tenantHash, user.id, 'password_changed');
    if (isDeniedStatus(user.status)) revoked += await revokeUserSessions(sql, tenantHash, user.id, 'user_blocked');
  }
  let removed = 0;
  if (complete) {
    const keep = new Set(incoming.map(user => user.id));
    for (const row of existing) {
      if (keep.has(row.user_id)) continue;
      await sql('DELETE FROM tango_user_credentials WHERE tenant_hash = $1 AND user_id = $2', [tenantHash, row.user_id]);
      revoked += await revokeUserSessions(sql, tenantHash, row.user_id, 'user_removed');
      removed += 1;
    }
  }
  return { stored: incoming.length, ignored: (Array.isArray(users) ? Math.min(users.length, 2000) : 0) - incoming.length, removed, revoked };
};

export const tenantHasCredentials = async (sql, tenantHash) => {
  await ensureUserSessionTables(sql);
  const rows = await sql('SELECT 1 FROM tango_user_credentials WHERE tenant_hash = $1 LIMIT 1', [tenantHash]);
  return rows.length > 0;
};

/** Confirma a senha. Devolve { ok, credential } ou { ok: false, reason }. */
export const checkPassword = async (sql, tenantHash, login, password) => {
  await ensureUserSessionTables(sql);
  const normalized = normalizeLogin(login);
  const rows = normalized
    ? await sql(`SELECT * FROM tango_user_credentials WHERE tenant_hash = $1 AND (email = $2 OR username = $2)
        ORDER BY (email = $2) DESC LIMIT 1`, [tenantHash, normalized])
    : [];
  const credential = rows[0];
  const candidate = String(password || '').trim().slice(0, 256);
  const valid = await bcrypt.compare(candidate, credential?.verifier || DUMMY_VERIFIER);
  if (!credential || !valid || !candidate) return { ok: false, reason: 'invalid_credentials' };
  if (isDeniedStatus(credential.status)) return { ok: false, reason: 'account_disabled', credential };
  return { ok: true, credential };
};

// ── Tokens ───────────────────────────────────────────────────────────────────────────────────────

const signAccessToken = (privateKey, claims) => {
  const { kid } = publicKeyInfo(privateKey);
  const header = b64url(JSON.stringify({ alg: 'EdDSA', typ: 'at+jwt', kid }));
  const payload = b64url(JSON.stringify(claims));
  const signature = crypto.sign(null, Buffer.from(`${header}.${payload}`), privateKey);
  return `${header}.${payload}.${signature.toString('base64url')}`;
};

const accessClaims = (session, credential, now) => ({
  iss: ISSUER,
  aud: AUDIENCE,
  sub: credential.user_id,
  tid: session.tenant_id,
  sid: session.session_id,
  role: credential.role,
  own: credential.is_owner === true,
  perms: parsePermissions(credential.permissions),
  ck: session.client_kind,
  iat: now,
  nbf: now - 5,
  exp: now + ACCESS_TTL_S,
  jti: crypto.randomUUID(),
});

const tokenBundle = (privateKey, session, credential, { refreshToken, csrfToken }) => {
  const now = Math.floor(Date.now() / 1000);
  const claims = accessClaims(session, credential, now);
  return {
    tokenType: 'Bearer',
    accessToken: signAccessToken(privateKey, claims),
    accessTokenExpiresAt: new Date(claims.exp * 1000).toISOString(),
    refreshToken,
    refreshTokenExpiresAt: new Date(Math.min(Date.parse(session.absolute_expires_at), Date.now() + REFRESH_IDLE_S * 1000)).toISOString(),
    sessionExpiresAt: new Date(session.absolute_expires_at).toISOString(),
    csrfToken,
    sessionId: session.session_id,
    user: publicUser(credential),
  };
};

/** Abre uma sessão para a conta (senha já confirmada) e entrega o conjunto de tokens. */
export const openUserSession = async (sql, privateKey, { tenantHash, tenantId, credential, clientKind, deviceId, ip, userAgent }) => {
  await ensureUserSessionTables(sql);
  // Limpeza: sessões terminadas há mais de uma semana e refresh tokens trocados há mais de dois dias.
  await sql(`DELETE FROM tango_user_sessions WHERE absolute_expires_at < NOW() - INTERVAL '7 days'`);
  await sql(`DELETE FROM tango_user_refresh_rotated WHERE rotated_at < NOW() - INTERVAL '2 days'`);
  const refreshToken = randomToken('trt');
  const csrfToken = randomToken('tcs');
  const sessionId = crypto.randomUUID();
  const [session] = await sql(`INSERT INTO tango_user_sessions (session_id, tenant_hash, tenant_id, user_id, refresh_hash, csrf_hash,
      credential_fingerprint, client_kind, device_id, ip, user_agent, idle_expires_at, absolute_expires_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW() + ($12 * INTERVAL '1 second'), NOW() + ($13 * INTERVAL '1 second'))
    RETURNING *`,
  [sessionId, tenantHash, tenantId, credential.user_id, sha256(refreshToken), sha256(csrfToken), credentialFingerprint(credential.verifier),
    clientKind, String(deviceId || '').slice(0, 100) || null, String(ip || '').slice(0, 64) || null, String(userAgent || '').slice(0, 300) || null,
    REFRESH_IDLE_S, SESSION_ABSOLUTE_S]);
  return tokenBundle(privateKey, session, credential, { refreshToken, csrfToken });
};

export const revokeSession = async (sql, sessionId, reason) => {
  await ensureUserSessionTables(sql);
  const rows = await sql(`UPDATE tango_user_sessions SET revoked_at = NOW(), revoked_reason = $2
    WHERE session_id = $1 AND revoked_at IS NULL RETURNING session_id`, [String(sessionId || ''), String(reason || 'logout').slice(0, 40)]);
  return rows.length;
};

export const revokeUserSessions = async (sql, tenantHash, userId, reason, exceptSessionId = null) => {
  await ensureUserSessionTables(sql);
  const rows = await sql(`UPDATE tango_user_sessions SET revoked_at = NOW(), revoked_reason = $3
    WHERE tenant_hash = $1 AND user_id = $2 AND revoked_at IS NULL AND ($4::text IS NULL OR session_id <> $4) RETURNING session_id`,
  [tenantHash, String(userId || ''), String(reason || 'revoked').slice(0, 40), exceptSessionId]);
  return rows.length;
};

/**
 * Troca o refresh token por um conjunto novo. Devolve { ok, tokens } ou { ok: false, status, code, message }.
 * `csrfToken` é obrigatório quando o refresh veio do cookie (versão web).
 */
export const rotateRefreshToken = async (sql, privateKey, { refreshToken, csrfToken, requireCsrf }) => {
  await ensureUserSessionTables(sql);
  const invalid = { ok: false, status: 401, code: 'SESSION_INVALID', message: 'A sessão terminou. Inicie sessão novamente.' };
  if (!REFRESH_PATTERN.test(String(refreshToken || ''))) return invalid;
  const oldHash = sha256(refreshToken);
  const [session] = await sql('SELECT * FROM tango_user_sessions WHERE refresh_hash = $1', [oldHash]);
  if (!session) {
    const [rotated] = await sql(`SELECT session_id, EXTRACT(EPOCH FROM (NOW() - rotated_at))::int AS age
      FROM tango_user_refresh_rotated WHERE refresh_hash = $1`, [oldHash]);
    if (!rotated) return invalid;
    if (Number(rotated.age) <= REFRESH_REUSE_GRACE_S) {
      return { ok: false, status: 409, code: 'REFRESH_RACE', message: 'A sessão acabou de ser renovada noutro separador. Tente novamente.' };
    }
    const revokedCount = await revokeSession(sql, rotated.session_id, 'refresh_reuse');
    return { ok: false, status: 401, code: 'REFRESH_REUSED', reuse: revokedCount > 0, sessionId: rotated.session_id,
      message: 'Foi detectada a reutilização de um token antigo. Por segurança, a sessão foi terminada.' };
  }
  if (session.revoked_at) return { ...invalid, code: 'SESSION_REVOKED', message: 'A sessão foi terminada. Inicie sessão novamente.' };
  if (Date.parse(session.idle_expires_at) <= Date.now() || Date.parse(session.absolute_expires_at) <= Date.now()) {
    return { ...invalid, code: 'SESSION_EXPIRED', message: 'A sessão expirou. Inicie sessão novamente.' };
  }
  if (requireCsrf && (!CSRF_PATTERN.test(String(csrfToken || '')) || sha256(csrfToken) !== session.csrf_hash)) {
    return { ok: false, status: 403, code: 'CSRF_INVALID', message: 'Pedido recusado (token CSRF em falta ou inválido).' };
  }
  const [credential] = await sql('SELECT * FROM tango_user_credentials WHERE tenant_hash = $1 AND user_id = $2', [session.tenant_hash, session.user_id]);
  const stop = async (reason, message) => {
    await revokeSession(sql, session.session_id, reason);
    return { ...invalid, code: 'SESSION_REVOKED', message };
  };
  if (!credential) return stop('user_removed', 'A conta já não existe.');
  if (isDeniedStatus(credential.status)) return stop('user_blocked', 'A conta foi bloqueada.');
  if (credentialFingerprint(credential.verifier) !== session.credential_fingerprint) return stop('password_changed', 'A senha da conta foi alterada. Inicie sessão novamente.');
  const [tenant] = await sql('SELECT status, expires_at FROM tango_tenants WHERE tenant_hash = $1', [session.tenant_hash]).catch(() => []);
  if (tenant && (tenant.status !== 'active' || tenant.expires_at && Date.parse(tenant.expires_at) < Date.now())) {
    return stop('tenant_blocked', 'O acesso desta empresa está bloqueado.');
  }

  const nextRefresh = randomToken('trt');
  // Troca atómica: só um pedido consegue trocar este refresh token (o outro cai no caso da corrida acima).
  const [updated] = await sql(`UPDATE tango_user_sessions SET refresh_hash = $2, generation = generation + 1, last_used_at = NOW(),
      idle_expires_at = LEAST(absolute_expires_at, NOW() + ($3 * INTERVAL '1 second'))
    WHERE session_id = $1 AND refresh_hash = $4 AND revoked_at IS NULL RETURNING *`,
  [session.session_id, sha256(nextRefresh), REFRESH_IDLE_S, oldHash]);
  if (!updated) return { ok: false, status: 409, code: 'REFRESH_RACE', message: 'A sessão acabou de ser renovada noutro separador. Tente novamente.' };
  await sql(`INSERT INTO tango_user_refresh_rotated (refresh_hash, session_id) VALUES ($1, $2) ON CONFLICT (refresh_hash) DO NOTHING`, [oldHash, session.session_id]);
  // O token CSRF mantém-se durante a sessão (os outros separadores continuam a tê-lo); é devolvido para o cliente o repor.
  return { ok: true, tokens: tokenBundle(privateKey, updated, credential, { refreshToken: nextRefresh, csrfToken: requireCsrf ? csrfToken : null }) };
};

/** Sessão (id) do refresh token indicado, aberta ou não; null quando o token não é reconhecido. */
export const sessionForRefresh = async (sql, refreshToken) => {
  if (!REFRESH_PATTERN.test(String(refreshToken || ''))) return null;
  await ensureUserSessionTables(sql);
  const [row] = await sql('SELECT session_id, csrf_hash FROM tango_user_sessions WHERE refresh_hash = $1', [sha256(refreshToken)]);
  return row || null;
};

export const csrfMatches = (row, csrfToken) => Boolean(row && CSRF_PATTERN.test(String(csrfToken || '')) && sha256(csrfToken) === row.csrf_hash);

/**
 * Valida um access token: assinatura Ed25519, tipo, emissor, audiência, validade e — sempre — que a sessão continua
 * aberta no servidor. Devolve as reivindicações ou null.
 */
export const verifyAccessToken = async (sql, token, privateKey = sessionSigningKey()) => {
  if (!privateKey) return null;
  const parts = String(token || '').split('.');
  if (parts.length !== 3 || parts.some(part => !/^[A-Za-z0-9_-]+$/.test(part))) return null;
  let header;
  let claims;
  try {
    header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (header?.alg !== 'EdDSA' || header?.typ !== 'at+jwt') return null;
  const publicKey = crypto.createPublicKey(privateKey);
  if (!crypto.verify(null, Buffer.from(`${parts[0]}.${parts[1]}`), publicKey, Buffer.from(parts[2], 'base64url'))) return null;
  const now = Math.floor(Date.now() / 1000);
  if (claims?.iss !== ISSUER || claims?.aud !== AUDIENCE || !claims?.sid || !claims?.sub) return null;
  if (!Number.isFinite(claims.exp) || claims.exp <= now || Number(claims.nbf || 0) > now + 5) return null;
  await ensureUserSessionTables(sql);
  const [session] = await sql(`SELECT tenant_hash FROM tango_user_sessions WHERE session_id = $1 AND user_id = $2
    AND revoked_at IS NULL AND absolute_expires_at > NOW()`, [claims.sid, claims.sub]);
  if (!session) return null;
  return { ...claims, tenantHash: session.tenant_hash };
};

/** Sessões abertas de uma empresa (ou só de um utilizador), sem nenhum token. */
export const listOpenSessions = async (sql, tenantHash, userId = null) => {
  await ensureUserSessionTables(sql);
  const rows = await sql(`SELECT s.session_id, s.user_id, c.name, c.email, s.client_kind, s.device_id, s.ip, s.user_agent,
      s.created_at, s.last_used_at, s.idle_expires_at, s.absolute_expires_at
    FROM tango_user_sessions s LEFT JOIN tango_user_credentials c ON c.tenant_hash = s.tenant_hash AND c.user_id = s.user_id
    WHERE s.tenant_hash = $1 AND ($2::text IS NULL OR s.user_id = $2) AND s.revoked_at IS NULL
      AND s.idle_expires_at > NOW() AND s.absolute_expires_at > NOW()
    ORDER BY s.last_used_at DESC LIMIT 500`, [tenantHash, userId]);
  return rows.map(row => ({
    sessionId: row.session_id, userId: row.user_id, name: row.name || null, email: row.email || null,
    client: row.client_kind, deviceId: row.device_id, ip: row.ip, userAgent: row.user_agent,
    createdAt: new Date(row.created_at).toISOString(), lastUsedAt: new Date(row.last_used_at).toISOString(),
    expiresAt: new Date(Math.min(Date.parse(row.idle_expires_at), Date.parse(row.absolute_expires_at))).toISOString(),
  }));
};

export const refreshCookie = (value, maxAgeSeconds) =>
  `${REFRESH_COOKIE}=${value}; Path=/; Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}; HttpOnly; Secure; SameSite=Strict`;

export const readRefreshCookie = (req) => {
  const header = String(req?.headers?.cookie || '');
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index > 0 && part.slice(0, index).trim() === REFRESH_COOKIE) return part.slice(index + 1).trim();
  }
  return '';
};
