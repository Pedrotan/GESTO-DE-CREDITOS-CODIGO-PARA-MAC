import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { build } from 'esbuild';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

// Sessões por utilizador no servidor: em cada login o servidor entrega access token (JWT Ed25519), refresh token
// (trocado em cada uso, com detecção de reutilização) e token CSRF. Testado pelas rotas reais num PostgreSQL (PGlite).

const ROOT = path.join(import.meta.dirname, '..');
const MASTER_SECRET = 'segredo-de-teste-master-utilizadores';
process.env.DATABASE_URL = 'postgres://pglite-utilizadores';
process.env.TANGO_MASTER_SECRET = MASTER_SECRET;
const { privateKey } = crypto.generateKeyPairSync('ed25519');
process.env.TANGO_SESSION_SIGNING_KEY = privateKey.export({ format: 'pem', type: 'pkcs8' });

const db = new PGlite();
globalThis.__neonQuery = async (text, params = []) => (await db.query(text, params)).rows;

const bundleHandler = async entry => {
    const outfile = path.join(mkdtempSync(path.join(tmpdir(), 'sessoes-utilizador-')), 'bundle.mjs');
    await build({
        entryPoints: [path.join(ROOT, entry)], bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent',
        plugins: [{
            name: 'neon',
            setup(builder) {
                builder.onResolve({ filter: /^@neondatabase\/serverless$/ }, () => ({ path: 'neon', namespace: 'stub' }));
                builder.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
                    contents: 'export const neon = () => ({ query: (text, params) => globalThis.__neonQuery(text, params) });', loader: 'js',
                }));
            },
        }],
    });
    return (await import(`${pathToFileURL(outfile).href}?v=${Math.random()}`)).default;
};

let ipSeq = 1;
const freshIp = () => `10.20.${(ipSeq >> 8) & 255}.${ipSeq++ & 255}`;
const invoke = async (handler, { action, ip = freshIp(), body = {}, headers = {} }) => {
    const response = { statusCode: 200, body: null, headers: {} };
    const res = {
        status(code) { response.statusCode = code; return res; },
        setHeader(name, value) { response.headers[name.toLowerCase()] = value; return res; },
        json(data) { response.body = data; return res; },
    };
    await handler({ method: 'POST', url: action ? `/api/v1/auth/${action}` : '/', headers: { 'x-forwarded-for': ip, ...headers },
        body, query: action ? { acao: action } : {}, socket: {} }, res);
    return response;
};

const [tenants, verify, auth] = await Promise.all([
    bundleHandler('vercel-api/tenants.js'),
    bundleHandler('vercel-api/verify-company.js'),
    bundleHandler('vercel-api/auth-login.js'),
]);

const NIF = '5001122334';
const cookieValue = (response, name) => {
    const header = String(response.headers['set-cookie'] || '');
    return header.startsWith(`${name}=`) ? header.split(';')[0] : '';
};
const decode = (jwt) => JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString('utf8'));

let accessCode;
const hash = (password) => bcrypt.hashSync(password, 4);
const users = () => ([
    { id: 'u-admin', name: 'Ana Admin', email: 'Ana@Empresa.ao', username: 'ana', passwordHash: hash('SenhaAdmin#1'), role: 'super_admin', permissions: [], status: 'offline', isOwner: 1 },
    { id: 'u-op', name: 'Óscar Operador', email: 'oscar@empresa.ao', username: 'oscar', passwordHash: hash('SenhaOper#1'), role: 'operator', permissions: ['view_credits'], status: 'active' },
]);
const desktop = () => ({ 'x-sync-passkey': accessCode });
let webCookie = '';

test('preparação: empresa registada no Master', async () => {
    const created = await invoke(tenants, { body: { action: 'create', tenantId: NIF, name: 'Utilizadores Lda', masterSecret: MASTER_SECRET,
        expiresAt: new Date(Date.now() + 60 * 86_400_000).toISOString() } });
    assert.equal(created.statusCode, 200, JSON.stringify(created.body));
    accessCode = created.body.accessCode;
    const linked = await invoke(verify, { body: { nif: NIF, accessCode } });
    assert.equal(linked.body.code, 'AUTHORIZED');
    webCookie = String(linked.headers['set-cookie']).split(';')[0];
});

test('sem utilizadores enviados, o login indica que ainda não há verificadores (o cliente usa o login anterior)', async () => {
    const reply = await invoke(auth, { action: 'login', body: { tenantId: NIF, login: 'ana', password: 'SenhaAdmin#1' }, headers: desktop() });
    assert.equal(reply.statusCode, 409);
    assert.equal(reply.body.code, 'CREDENTIALS_NOT_PROVISIONED');
});

test('envio dos verificadores: exige o código da empresa (a sessão web não chega) e só aceita hashes bcrypt', async () => {
    const withCookie = await invoke(auth, { action: 'credentials', body: { tenantId: NIF, users: users() }, headers: { cookie: webCookie } });
    assert.equal(withCookie.statusCode, 401);
    const wrong = await invoke(auth, { action: 'credentials', body: { tenantId: NIF, users: users() }, headers: { 'x-sync-passkey': 'CODIGO-ERRADO-1234' } });
    assert.equal(wrong.statusCode, 401);
    const sent = await invoke(auth, { action: 'credentials', headers: desktop(),
        body: { tenantId: NIF, complete: true, users: [...users(), { id: 'u-texto', email: 'x@y.ao', passwordHash: 'senha-em-claro', role: 'operator' }] } });
    assert.equal(sent.statusCode, 200, JSON.stringify(sent.body));
    assert.equal(sent.body.stored, 2);
    assert.equal(sent.body.ignored, 1, 'uma senha que não é bcrypt nunca é guardada');
});

test('computador: o login entrega access token, refresh token e CSRF; o access token é um JWT Ed25519 com o utilizador', async () => {
    const reply = await invoke(auth, { action: 'login', headers: desktop(),
        body: { tenantId: NIF, login: 'ANA@empresa.ao', password: 'SenhaAdmin#1', client: 'desktop', deviceId: 'pc-1' } });
    assert.equal(reply.statusCode, 200, JSON.stringify(reply.body));
    const tokens = reply.body;
    assert.equal(tokens.tokenType, 'Bearer');
    assert.match(tokens.refreshToken, /^trt_[A-Za-z0-9_-]{43}$/);
    assert.match(tokens.csrfToken, /^tcs_[A-Za-z0-9_-]{43}$/);
    assert.equal(reply.headers['set-cookie'], undefined, 'o computador não recebe cookie');
    const header = JSON.parse(Buffer.from(tokens.accessToken.split('.')[0], 'base64url').toString('utf8'));
    assert.deepEqual([header.alg, header.typ], ['EdDSA', 'at+jwt']);
    const claims = decode(tokens.accessToken);
    assert.equal(claims.sub, 'u-admin');
    assert.equal(claims.tid, NIF);
    assert.equal(claims.sid, tokens.sessionId);
    assert.equal(claims.role, 'super_admin');
    assert.ok(claims.exp - claims.iat <= 15 * 60);
    assert.equal(tokens.user.email, 'ana@empresa.ao');
    assert.equal(tokens.user.passwordHash, undefined);

    const [row] = await globalThis.__neonQuery('SELECT refresh_hash, csrf_hash FROM tango_user_sessions WHERE session_id = $1', [tokens.sessionId]);
    assert.notEqual(row.refresh_hash, tokens.refreshToken, 'o servidor só guarda o hash do refresh token');
    assert.notEqual(row.csrf_hash, tokens.csrfToken);

    // Renovação: conjunto novo; o refresh anterior deixa de valer.
    const renewed = await invoke(auth, { action: 'refresh', body: { refreshToken: tokens.refreshToken } });
    assert.equal(renewed.statusCode, 200, JSON.stringify(renewed.body));
    assert.notEqual(renewed.body.refreshToken, tokens.refreshToken);
    assert.notEqual(renewed.body.accessToken, tokens.accessToken);
    assert.equal(renewed.body.sessionId, tokens.sessionId);

    // Dentro da janela curta, o refresh antigo é tratado como corrida (outro separador), sem revogar.
    const race = await invoke(auth, { action: 'refresh', body: { refreshToken: tokens.refreshToken } });
    assert.equal(race.statusCode, 409);
    assert.equal(race.body.code, 'REFRESH_RACE');

    // Fora da janela: reutilização = roubo. A sessão inteira é revogada, incluindo o refresh mais recente.
    await globalThis.__neonQuery(`UPDATE tango_user_refresh_rotated SET rotated_at = NOW() - INTERVAL '5 minutes'`);
    const reuse = await invoke(auth, { action: 'refresh', body: { refreshToken: tokens.refreshToken } });
    assert.equal(reuse.statusCode, 401);
    assert.equal(reuse.body.code, 'REFRESH_REUSED');
    const after = await invoke(auth, { action: 'refresh', body: { refreshToken: renewed.body.refreshToken } });
    assert.equal(after.statusCode, 401);
    assert.equal(after.body.code, 'SESSION_REVOKED');
    const sessionsAfter = await invoke(auth, { action: 'sessions', body: { op: 'list' }, headers: { authorization: `Bearer ${renewed.body.accessToken}` } });
    assert.equal(sessionsAfter.statusCode, 401, 'o access token deixa de valer logo que a sessão é revogada');
});

test('versão web: o refresh vai num cookie HttpOnly (nunca no JSON) e renovar exige o token CSRF', async () => {
    const reply = await invoke(auth, { action: 'login', headers: { cookie: webCookie },
        body: { tenantId: NIF, login: 'oscar', password: 'SenhaOper#1', client: 'desktop' } });
    assert.equal(reply.statusCode, 200, JSON.stringify(reply.body));
    assert.equal(reply.body.client, 'web', 'sem o código da empresa, nunca recebe o refresh no corpo');
    assert.equal(reply.body.refreshToken, undefined);
    const setCookie = String(reply.headers['set-cookie']);
    assert.match(setCookie, /^__Host-tango_refresh=trt_[A-Za-z0-9_-]{43};/);
    for (const flag of ['HttpOnly', 'Secure', 'SameSite=Strict', 'Path=/']) assert.ok(setCookie.includes(flag), flag);
    const refresh = cookieValue(reply, '__Host-tango_refresh');

    const noCsrf = await invoke(auth, { action: 'refresh', headers: { cookie: refresh } });
    assert.equal(noCsrf.statusCode, 403);
    assert.equal(noCsrf.body.code, 'CSRF_INVALID');
    const renewed = await invoke(auth, { action: 'refresh', headers: { cookie: refresh, 'x-csrf-token': reply.body.csrfToken } });
    assert.equal(renewed.statusCode, 200, JSON.stringify(renewed.body));
    assert.equal(renewed.body.refreshToken, undefined);
    assert.equal(renewed.body.csrfToken, reply.body.csrfToken);
    const nextRefresh = cookieValue(renewed, '__Host-tango_refresh');
    assert.notEqual(nextRefresh, refresh);

    // Fim de sessão: sem CSRF não termina nada; com CSRF revoga e apaga o cookie.
    const forged = await invoke(auth, { action: 'logout', headers: { cookie: nextRefresh } });
    assert.equal(forged.body.revoked, false);
    const out = await invoke(auth, { action: 'logout', headers: { cookie: nextRefresh, 'x-csrf-token': reply.body.csrfToken } });
    assert.equal(out.body.revoked, true);
    assert.match(String(out.headers['set-cookie']), /Max-Age=0/);
    const gone = await invoke(auth, { action: 'refresh', headers: { cookie: nextRefresh, 'x-csrf-token': reply.body.csrfToken } });
    assert.equal(gone.statusCode, 401);
});

test('administrador termina as sessões de outro utilizador; um operador não pode', async () => {
    const admin = await invoke(auth, { action: 'login', headers: desktop(), body: { tenantId: NIF, login: 'ana', password: 'SenhaAdmin#1', client: 'desktop' } });
    const operator = await invoke(auth, { action: 'login', headers: desktop(), body: { tenantId: NIF, login: 'oscar', password: 'SenhaOper#1', client: 'desktop' } });
    const asOperator = { authorization: `Bearer ${operator.body.accessToken}` };
    const denied = await invoke(auth, { action: 'sessions', body: { op: 'revoke-user', userId: 'u-admin' }, headers: asOperator });
    assert.equal(denied.statusCode, 403);

    const list = await invoke(auth, { action: 'sessions', body: { op: 'list', all: true }, headers: { authorization: `Bearer ${admin.body.accessToken}` } });
    assert.equal(list.statusCode, 200);
    assert.ok(list.body.sessions.some(item => item.userId === 'u-op'));
    assert.ok(list.body.sessions.every(item => !('refreshToken' in item) && !('refresh_hash' in item)));

    const revoked = await invoke(auth, { action: 'sessions', body: { op: 'revoke-user', userId: 'u-op' }, headers: { authorization: `Bearer ${admin.body.accessToken}` } });
    assert.equal(revoked.body.revoked, 1);
    const blocked = await invoke(auth, { action: 'refresh', body: { refreshToken: operator.body.refreshToken } });
    assert.equal(blocked.body.code, 'SESSION_REVOKED');
});

test('senha mudada ou conta bloqueada no computador: as sessões abertas dessa conta terminam', async () => {
    const opened = await invoke(auth, { action: 'login', headers: desktop(), body: { tenantId: NIF, login: 'oscar', password: 'SenhaOper#1', client: 'desktop' } });
    assert.equal(opened.statusCode, 200);
    const changed = users().map(user => user.id === 'u-op' ? { ...user, passwordHash: hash('NovaSenha#2') } : user);
    const sent = await invoke(auth, { action: 'credentials', headers: desktop(), body: { tenantId: NIF, complete: true, users: changed } });
    assert.ok(sent.body.revoked >= 1);
    const refused = await invoke(auth, { action: 'refresh', body: { refreshToken: opened.body.refreshToken } });
    assert.equal(refused.statusCode, 401);
    assert.equal((await invoke(auth, { action: 'login', headers: desktop(), body: { tenantId: NIF, login: 'oscar', password: 'SenhaOper#1' } })).statusCode, 401);
    assert.equal((await invoke(auth, { action: 'login', headers: desktop(), body: { tenantId: NIF, login: 'oscar', password: 'NovaSenha#2' } })).statusCode, 200);

    const blockedList = changed.map(user => user.id === 'u-op' ? { ...user, status: 'blocked' } : user);
    await invoke(auth, { action: 'credentials', headers: desktop(), body: { tenantId: NIF, complete: true, users: blockedList } });
    const disabled = await invoke(auth, { action: 'login', headers: desktop(), body: { tenantId: NIF, login: 'oscar', password: 'NovaSenha#2' } });
    assert.equal(disabled.statusCode, 403);
    assert.equal(disabled.body.code, 'ACCOUNT_DISABLED');
});

test('senha errada repetida bloqueia a conta no servidor (o navegador já não decide)', async () => {
    const ip = '10.30.0.1';
    let last;
    for (let attempt = 0; attempt < 5; attempt++) {
        last = await invoke(auth, { action: 'login', ip, headers: desktop(), body: { tenantId: NIF, login: 'ana', password: `errada-${attempt}` } });
    }
    assert.equal(last.statusCode, 429);
    assert.equal(last.body.code, 'LOGIN_LOCKED');
    const evenRight = await invoke(auth, { action: 'login', headers: desktop(), body: { tenantId: NIF, login: 'ana', password: 'SenhaAdmin#1' } });
    assert.equal(evenRight.statusCode, 429, 'bloqueio por conta, também a partir de outro IP');
    const unknown = await invoke(auth, { action: 'login', headers: desktop(), body: { tenantId: NIF, login: 'ninguem@empresa.ao', password: 'qualquer' } });
    assert.equal(unknown.statusCode, 401);
    assert.equal(unknown.body.code, 'INVALID_CREDENTIALS', 'conta inexistente e senha errada dão a mesma resposta');
});

test('um access token forjado, de outro tipo ou com a assinatura de outra chave é recusado', async () => {
    const other = crypto.generateKeyPairSync('ed25519').privateKey;
    const forge = (header, claims, key) => {
        const h = Buffer.from(JSON.stringify(header)).toString('base64url');
        const p = Buffer.from(JSON.stringify(claims)).toString('base64url');
        return `${h}.${p}.${crypto.sign(null, Buffer.from(`${h}.${p}`), key).toString('base64url')}`;
    };
    const now = Math.floor(Date.now() / 1000);
    const claims = { iss: 'tango-gestao', aud: 'tango-api', sub: 'u-admin', sid: 'x', role: 'super_admin', iat: now, exp: now + 600 };
    for (const token of [
        forge({ alg: 'EdDSA', typ: 'at+jwt' }, claims, other),
        forge({ alg: 'EdDSA', typ: 'JWT' }, claims, privateKey),
        'abc.def.ghi',
    ]) {
        const reply = await invoke(auth, { action: 'sessions', body: { op: 'list' }, headers: { authorization: `Bearer ${token}` } });
        assert.equal(reply.statusCode, 401);
    }
});
