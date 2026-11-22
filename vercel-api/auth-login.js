import { neon } from '@neondatabase/serverless';
import { applyCors, clientIp, enforceDistributedRateLimit } from './_security.js';
import { clearAuthFailures, lockoutRemaining, recordRejectedOrigin, recordSecurityEvent, registerAuthFailure } from './_alertas.js';
import { authorizeTenant } from './_autorizacao-empresa.js';
import {
  csrfMatches, isAdminClaims, listOpenSessions, normalizeLogin, openUserSession, readRefreshCookie, refreshCookie,
  revokeSession, revokeUserSessions, rotateRefreshToken, sessionForRefresh, sessionSigningKey, SESSION_ABSOLUTE_S,
  storeCredentials, tenantHasCredentials, checkPassword, verifyAccessToken,
} from './_sessao-utilizador.js';

// Sessões dos utilizadores no servidor (ver _sessao-utilizador.js):
//   POST /api/v1/auth/login        senha → conjunto de tokens (access, refresh, CSRF)
//   POST /api/v1/auth/refresh      refresh token → conjunto novo (o anterior deixa de valer)
//   POST /api/v1/auth/logout       termina a sessão
//   POST /api/v1/auth/sessions     sessões abertas; terminar sessões (a própria, de outro utilizador)
//   POST /api/v1/auth/credentials  o computador da empresa envia os verificadores (bcrypt) dos utilizadores

const ACTIONS = new Set(['login', 'refresh', 'logout', 'sessions', 'credentials']);
// Falhas de senha: por IP, largo (um escritório inteiro sai pelo mesmo IP); por conta, apertado.
const LOGIN_IP_POLICY = { maxFailures: 30, windowMs: 15 * 60_000, blockMs: 15 * 60_000 };
const LOGIN_ACCOUNT_POLICY = { maxFailures: 5, windowMs: 15 * 60_000, blockMs: 15 * 60_000 };

const send = (res, status, body) => {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.json(body);
};

const actionFor = (req) => {
  const fromQuery = String(req.query?.acao || '').trim();
  if (ACTIONS.has(fromQuery)) return fromQuery;
  const match = String(req.url || '').match(/\/api\/v1\/auth\/([a-z]+)/u);
  if (match && ACTIONS.has(match[1])) return match[1];
  const fromBody = String(req.body?.action || '').trim();
  return ACTIONS.has(fromBody) ? fromBody : 'login';
};

const bearerOf = (req) => String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();

/** Quem recebe o refresh token no corpo: só o computador (que se identifica com o código da empresa). */
const clientKindOf = (req, providedKey) => (String(req.body?.client || '') === 'desktop' && providedKey ? 'desktop' : 'web');

const withTokens = (res, tokens, clientKind, status = 200) => {
  if (clientKind === 'web') {
    const maxAge = Math.max(0, (Date.parse(tokens.sessionExpiresAt) - Date.now()) / 1000) || SESSION_ABSOLUTE_S;
    res.setHeader('Set-Cookie', refreshCookie(tokens.refreshToken, maxAge));
    // No navegador o refresh token nunca chega ao JavaScript da página.
    const { refreshToken: _hidden, ...visible } = tokens;
    return send(res, status, { success: true, client: 'web', ...visible });
  }
  return send(res, status, { success: true, client: 'desktop', ...tokens });
};

const handleLogin = async (sql, req, res, signingKey) => {
  const body = req.body || {};
  const tenantId = String(body.tenantId || '').trim();
  const login = normalizeLogin(body.login ?? body.email);
  const password = String(body.password || '');
  if (!tenantId || tenantId.length > 200 || !login || !password || password.length > 256) {
    return send(res, 400, { success: false, code: 'BAD_REQUEST', message: 'Empresa, utilizador e senha são obrigatórios.' });
  }
  const providedKey = String(req.headers['x-sync-passkey'] || '').trim();
  const auth = await authorizeTenant(sql, tenantId, providedKey, req);
  if (!auth.ok) return send(res, auth.status, { success: false, code: auth.code || 'TENANT_UNAUTHORIZED', message: auth.message });
  const tenantHash = auth.tenantHash;
  const subject = `${tenantHash}:${login}`;

  const remaining = await lockoutRemaining(sql, req, { scope: 'user_login', subject });
  if (remaining > 0) {
    res.setHeader('Retry-After', String(remaining));
    return send(res, 429, { success: false, code: 'LOGIN_LOCKED',
      message: `Demasiadas tentativas falhadas. Tente novamente em ${Math.ceil(remaining / 60)} minuto(s).` });
  }
  // Empresa cujo computador ainda não enviou os utilizadores (versão antiga): o cliente usa o login anterior.
  if (!await tenantHasCredentials(sql, tenantHash)) {
    return send(res, 409, { success: false, code: 'CREDENTIALS_NOT_PROVISIONED',
      message: 'Os utilizadores desta empresa ainda não foram enviados para o servidor pelo computador da empresa.' });
  }
  const result = await checkPassword(sql, tenantHash, login, password);
  if (!result.ok && result.reason === 'invalid_credentials') {
    const { locked } = await registerAuthFailure(sql, req, {
      scope: 'user_login', subject, type: 'user_login_failed', title: 'Senha de utilizador errada',
      details: `Login falhado na empresa ${tenantId}.`, ipPolicy: LOGIN_IP_POLICY, subjectPolicy: LOGIN_ACCOUNT_POLICY,
    });
    return send(res, locked ? 429 : 401, { success: false, code: locked ? 'LOGIN_LOCKED' : 'INVALID_CREDENTIALS',
      message: locked ? 'Demasiadas tentativas falhadas. A conta fica bloqueada durante 15 minutos.' : 'Email ou senha incorrectos.' });
  }
  if (!result.ok) {
    return send(res, 403, { success: false, code: 'ACCOUNT_DISABLED', message: 'Esta conta está bloqueada. Contacte o administrador.' });
  }
  await clearAuthFailures(sql, { scope: 'user_login', subject });
  const clientKind = clientKindOf(req, providedKey);
  const tokens = await openUserSession(sql, signingKey, {
    tenantHash, tenantId, credential: result.credential, clientKind,
    deviceId: body.deviceId, ip: clientIp(req), userAgent: req.headers['user-agent'],
  });
  return withTokens(res, tokens, clientKind);
};

const handleRefresh = async (sql, req, res, signingKey) => {
  const cookieToken = readRefreshCookie(req);
  const bodyToken = String(req.body?.refreshToken || '');
  // O cookie é da versão web: exige o token CSRF. O refresh no corpo é do computador.
  const fromCookie = Boolean(cookieToken) && !bodyToken;
  const result = await rotateRefreshToken(sql, signingKey, {
    refreshToken: fromCookie ? cookieToken : bodyToken,
    csrfToken: String(req.headers['x-csrf-token'] || ''),
    requireCsrf: fromCookie,
  });
  if (!result.ok) {
    if (result.code === 'REFRESH_REUSED') {
      await recordSecurityEvent(req, { type: 'refresh_token_reuse', severity: 'high', title: 'Reutilização de refresh token',
        details: 'Um refresh token já trocado voltou a ser apresentado; a sessão foi revogada.', subject: result.sessionId || '' }, sql);
    }
    if (fromCookie && result.status === 401) res.setHeader('Set-Cookie', refreshCookie('', 0));
    return send(res, result.status, { success: false, code: result.code, message: result.message });
  }
  return withTokens(res, result.tokens, fromCookie ? 'web' : 'desktop');
};

const handleLogout = async (sql, req, res, signingKey) => {
  const cookieToken = readRefreshCookie(req);
  const bodyToken = String(req.body?.refreshToken || '');
  let sessionId = null;
  if (bodyToken) sessionId = (await sessionForRefresh(sql, bodyToken))?.session_id || null;
  else if (cookieToken) {
    const row = await sessionForRefresh(sql, cookieToken);
    // Sem o token CSRF, outro site não consegue terminar a sessão de ninguém.
    if (row && csrfMatches(row, req.headers['x-csrf-token'])) sessionId = row.session_id;
  }
  if (!sessionId) {
    const claims = await verifyAccessToken(sql, bearerOf(req), signingKey);
    sessionId = claims?.sid || null;
  }
  if (sessionId) await revokeSession(sql, sessionId, 'logout');
  if (cookieToken) res.setHeader('Set-Cookie', refreshCookie('', 0));
  return send(res, 200, { success: true, revoked: Boolean(sessionId) });
};

const handleSessions = async (sql, req, res, signingKey) => {
  const claims = await verifyAccessToken(sql, bearerOf(req), signingKey);
  if (!claims) return send(res, 401, { success: false, code: 'ACCESS_TOKEN_INVALID', message: 'Sessão inválida ou expirada.' });
  const body = req.body || {};
  const op = String(body.op || 'list');
  const admin = isAdminClaims(claims);
  const targetUser = String(body.userId || '').trim().slice(0, 100) || null;
  if (targetUser && targetUser !== claims.sub && !admin) {
    return send(res, 403, { success: false, code: 'FORBIDDEN', message: 'Sem permissão para gerir sessões de outros utilizadores.' });
  }
  if (op === 'list') {
    const scope = admin && body.all === true ? null : targetUser || claims.sub;
    const sessions = await listOpenSessions(sql, claims.tenantHash, scope);
    return send(res, 200, { success: true, currentSessionId: claims.sid, sessions });
  }
  if (op === 'revoke') {
    const sessionId = String(body.sessionId || '').trim();
    const [row] = await sql('SELECT user_id FROM tango_user_sessions WHERE session_id = $1 AND tenant_hash = $2', [sessionId, claims.tenantHash]);
    if (!row) return send(res, 404, { success: false, code: 'NOT_FOUND', message: 'Sessão não encontrada.' });
    if (row.user_id !== claims.sub && !admin) return send(res, 403, { success: false, code: 'FORBIDDEN', message: 'Sem permissão para terminar esta sessão.' });
    const revoked = await revokeSession(sql, sessionId, row.user_id === claims.sub ? 'logout' : 'admin_revoked');
    return send(res, 200, { success: true, revoked });
  }
  if (op === 'revoke-user') {
    const userId = targetUser || claims.sub;
    const revoked = await revokeUserSessions(sql, claims.tenantHash, userId, userId === claims.sub ? 'logout_all' : 'admin_revoked');
    return send(res, 200, { success: true, revoked });
  }
  if (op === 'revoke-others') {
    const revoked = await revokeUserSessions(sql, claims.tenantHash, claims.sub, 'logout_others', claims.sid);
    return send(res, 200, { success: true, revoked });
  }
  return send(res, 400, { success: false, code: 'BAD_REQUEST', message: 'Operação desconhecida.' });
};

const handleCredentials = async (sql, req, res) => {
  const body = req.body || {};
  const tenantId = String(body.tenantId || '').trim();
  const providedKey = String(req.headers['x-sync-passkey'] || '').trim();
  // Só o computador da empresa (com o código) envia verificadores; a sessão web da empresa não chega.
  if (!tenantId || tenantId.length > 200 || !providedKey) {
    return send(res, 401, { success: false, code: 'TENANT_KEY_REQUIRED', message: 'O envio de utilizadores exige o código da empresa.' });
  }
  if (!Array.isArray(body.users) || body.users.length > 2000) {
    return send(res, 400, { success: false, code: 'BAD_REQUEST', message: 'Lista de utilizadores inválida.' });
  }
  const auth = await authorizeTenant(sql, tenantId, providedKey, req);
  if (!auth.ok) return send(res, auth.status, { success: false, code: auth.code || 'TENANT_UNAUTHORIZED', message: auth.message });
  const result = await storeCredentials(sql, auth.tenantHash, body.users, { complete: body.complete === true });
  return send(res, 200, { success: true, ...result });
};

export default async function handler(req, res) {
  if (!applyCors(req, res)) {
    await recordRejectedOrigin(req);
    return send(res, 403, { success: false, message: 'Origem não autorizada.' });
  }
  if (req.method === 'OPTIONS') return send(res, 200, { success: true });
  if (req.method !== 'POST') return send(res, 405, { success: false, message: 'Método não permitido.' });
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return send(res, 503, { success: false, code: 'SERVER_UNCONFIGURED', message: 'Base de dados central ainda não configurada no servidor.' });
  const action = actionFor(req);
  const signingKey = sessionSigningKey();
  if (!signingKey && action !== 'credentials') {
    return send(res, 503, { success: false, code: 'SESSION_SIGNING_UNAVAILABLE', message: 'O servidor ainda não tem a chave de assinatura das sessões configurada.' });
  }
  const client = neon(databaseUrl);
  const sql = (text, params) => client.query(text, params);
  try {
    const limits = { login: 20, refresh: 120, logout: 60, sessions: 120, credentials: 30 };
    if (!await enforceDistributedRateLimit(sql, req, res, { limit: limits[action], windowMs: 60_000, scope: `auth-${action}` })) return;
    if (action === 'login') return await handleLogin(sql, req, res, signingKey);
    if (action === 'refresh') return await handleRefresh(sql, req, res, signingKey);
    if (action === 'logout') return await handleLogout(sql, req, res, signingKey);
    if (action === 'sessions') return await handleSessions(sql, req, res, signingKey);
    return await handleCredentials(sql, req, res);
  } catch (error) {
    console.error(`[auth][${action}]`, error?.message || error);
    return send(res, 500, { success: false, code: 'SERVER_ERROR', message: 'O servidor não conseguiu processar o pedido de sessão.' });
  }
}
