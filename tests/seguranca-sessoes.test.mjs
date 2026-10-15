import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

// Correcções depois do pentest externo (Outubro 2026), de ponta a ponta pelas rotas reais num PostgreSQL
// verdadeiro (PGlite): sessão do painel Master, sessão HttpOnly da versão web, bloqueio por NIF sem negação de
// serviço à própria empresa e segredos que já foram expostos.

const ROOT = path.join(import.meta.dirname, '..');
const MASTER_SECRET = 'segredo-de-teste-master-sessoes';
process.env.DATABASE_URL = 'postgres://pglite-sessoes';
process.env.TANGO_MASTER_SECRET = MASTER_SECRET;

const db = new PGlite();
globalThis.__neonQuery = async (text, params = []) => (await db.query(text, params)).rows;

const bundleHandler = async entry => {
    const outfile = path.join(mkdtempSync(path.join(tmpdir(), 'seguranca-sessoes-')), 'bundle.mjs');
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

const invoke = async (handler, { ip, body = {}, headers = {} }) => {
    const response = { statusCode: 200, body: null, headers: {} };
    const res = {
        status(code) { response.statusCode = code; return res; },
        setHeader(name, value) { response.headers[name.toLowerCase()] = value; return res; },
        json(data) { response.body = data; return res; },
    };
    await handler({ method: 'POST', headers: { 'x-forwarded-for': ip, ...headers }, body, query: {}, socket: {} }, res);
    return response;
};

const [tenants, verify, sync] = await Promise.all([
    bundleHandler('vercel-api/tenants.js'),
    bundleHandler('vercel-api/verify-company.js'),
    bundleHandler('vercel-api/sync.js'),
]);

const NIF = '5009988776';
let ipSeq = 1;
const freshIp = () => `10.9.${(ipSeq >> 8) & 255}.${ipSeq++ & 255}`;
const admin = (body, headers = {}) => invoke(tenants, { ip: freshIp(), body: { ...body, masterSecret: MASTER_SECRET }, headers });
const cookieFrom = response => String(response.headers['set-cookie'] || '').split(';')[0];
let accessCode;

test('painel Master: a chave abre uma sessão; o token dá um limite largo e a chave mestra não volta a viajar', async () => {
    const ip = '10.8.0.1';
    const opened = await invoke(tenants, { ip, body: { action: 'session', masterSecret: MASTER_SECRET } });
    assert.equal(opened.statusCode, 200);
    assert.match(opened.body.sessionToken, /^tms_[A-Za-z0-9_-]{43}$/);
    assert.equal(opened.headers['ratelimit-limit'], '10', 'abrir sessão conta para o limite apertado');

    // 15 pedidos seguidos do mesmo IP com a sessão: acima dos 10/min da chave, mas dentro do limite da sessão.
    for (let i = 0; i < 15; i++) {
        const reply = await invoke(tenants, { ip, body: { action: 'list' }, headers: { 'x-master-session': opened.body.sessionToken } });
        assert.equal(reply.statusCode, 200, `pedido ${i + 1}: ${JSON.stringify(reply.body)}`);
        assert.equal(reply.headers['ratelimit-limit'], '300');
    }
    const [row] = await globalThis.__neonQuery('SELECT token_hash FROM tango_master_sessions LIMIT 1');
    assert.notEqual(row.token_hash, opened.body.sessionToken, 'o servidor só guarda o hash do token');

    const forged = await invoke(tenants, { ip, body: { action: 'list' }, headers: { 'x-master-session': `tms_${'A'.repeat(43)}` } });
    assert.equal(forged.statusCode, 401);
    assert.equal(forged.body.code, 'SESSION_INVALID');

    // Mudar a chave mestra no servidor invalida as sessões abertas com a anterior.
    process.env.TANGO_MASTER_SECRET = 'outra-chave-mestra-rodada';
    try {
        const afterRotation = await invoke(tenants, { ip, body: { action: 'list' }, headers: { 'x-master-session': opened.body.sessionToken } });
        assert.equal(afterRotation.body.code, 'SESSION_INVALID');
    } finally {
        process.env.TANGO_MASTER_SECRET = MASTER_SECRET;
    }
    const closed = await invoke(tenants, { ip, body: { action: 'logout' }, headers: { 'x-master-session': opened.body.sessionToken } });
    assert.equal(closed.statusCode, 200);
    assert.equal((await invoke(tenants, { ip, body: { action: 'list' }, headers: { 'x-master-session': opened.body.sessionToken } })).statusCode, 401);
});

test('uma chave mestra que já foi publicada é recusada mesmo estando configurada no servidor', async () => {
    const leaked = 'TANGO_MASTER_2024'; // valor antigo que esteve no código (já citado em api-security.test.mjs)
    process.env.TANGO_MASTER_SECRET = leaked;
    try {
        const reply = await invoke(tenants, { ip: freshIp(), body: { action: 'verify', masterSecret: leaked } });
        assert.equal(reply.statusCode, 503);
        assert.doesNotMatch(JSON.stringify(reply.body), /TANGO_MASTER/);
    } finally {
        process.env.TANGO_MASTER_SECRET = MASTER_SECRET;
    }
});

test('versão web: o código abre uma sessão HttpOnly; depois a empresa confirma-se e sincroniza sem código', async () => {
    const created = await admin({ action: 'create', tenantId: NIF, name: 'Sessões Lda', expiresAt: new Date(Date.now() + 60 * 86_400_000).toISOString() });
    assert.equal(created.statusCode, 200, JSON.stringify(created.body));
    accessCode = created.body.accessCode;

    const ip = '10.7.0.1';
    const login = await invoke(verify, { ip, body: { nif: NIF, accessCode } });
    assert.equal(login.body.code, 'AUTHORIZED');
    const setCookie = String(login.headers['set-cookie']);
    assert.match(setCookie, /^__Host-tango_sessao=tws_[A-Za-z0-9_-]{43};/);
    for (const flag of ['HttpOnly', 'Secure', 'SameSite=Strict', 'Path=/']) assert.ok(setCookie.includes(flag), flag);
    const cookie = cookieFrom(login);

    const check = await invoke(verify, { ip, body: { nif: NIF, session: true }, headers: { cookie } });
    assert.equal(check.body.code, 'AUTHORIZED');
    assert.equal(check.body.accessCode, undefined, 'com sessão, o código nunca volta ao navegador');
    assert.equal(check.body.syncPasskey, undefined);

    const synced = await invoke(sync, { ip, body: { tenantId: NIF, deviceId: 'browser-1', cursor: 0, operations: [] }, headers: { cookie } });
    assert.equal(synced.statusCode, 200, JSON.stringify(synced.body));
    const noCookie = await invoke(sync, { ip: freshIp(), body: { tenantId: NIF, deviceId: 'browser-2', cursor: 0, operations: [] } });
    assert.equal(noCookie.statusCode, 401, 'sem código nem sessão, nada feito');
    const otherCompany = await invoke(verify, { ip, body: { nif: '5001112223', session: true }, headers: { cookie } });
    assert.notEqual(otherCompany.body.code, 'AUTHORIZED', 'a sessão só vale para a sua empresa');
});

test('mudar o Código de Acesso termina as sessões web; sair apaga o cookie', async () => {
    const ip = '10.7.0.2';
    const cookie = cookieFrom(await invoke(verify, { ip, body: { nif: NIF, accessCode } }));
    const rotated = await admin({ action: 'rotate', tenantId: NIF });
    assert.equal(rotated.statusCode, 200);
    const check = await invoke(verify, { ip, body: { nif: NIF, session: true }, headers: { cookie } });
    assert.equal(check.statusCode, 401);
    assert.equal(check.body.code, 'SESSION_INVALID');
    accessCode = rotated.body.accessCode;

    const fresh = cookieFrom(await invoke(verify, { ip, body: { nif: NIF, accessCode } }));
    const logout = await invoke(verify, { ip, body: { logout: true }, headers: { cookie: fresh } });
    assert.match(String(logout.headers['set-cookie']), /Max-Age=0/);
    assert.equal((await invoke(verify, { ip, body: { nif: NIF, session: true }, headers: { cookie: fresh } })).body.code, 'SESSION_INVALID');
});

test('ataque ao NIF: desconhecidos ficam bloqueados, mas os computadores da empresa continuam a entrar', async () => {
    const officeIp = '10.6.0.1';
    // O escritório já sincronizou: passa a ser cliente de confiança desta empresa.
    assert.equal((await invoke(sync, { ip: officeIp, body: { tenantId: NIF, deviceId: 'pc-escritorio', cursor: 0, operations: [] }, headers: { 'x-sync-passkey': accessCode } })).statusCode, 200);
    assert.equal((await invoke(verify, { ip: officeIp, body: { nif: NIF, accessCode } })).body.code, 'AUTHORIZED');

    // Atacante distribuído: muitos IPs, um código errado cada, até bloquear o NIF.
    for (let i = 0; i < 10; i++) {
        await invoke(verify, { ip: `10.66.0.${i + 1}`, body: { nif: NIF, accessCode: `TG-ERRO-${String(i).padStart(4, '0')}` } });
        await invoke(sync, { ip: `10.66.1.${i + 1}`, body: { tenantId: NIF, deviceId: 'x', cursor: 0, operations: [] }, headers: { 'x-sync-passkey': `TG-ERRO-${i}` } });
    }
    const stranger = await invoke(verify, { ip: '10.66.9.9', body: { nif: NIF, accessCode } });
    assert.equal(stranger.statusCode, 429, 'um IP novo fica bloqueado durante o ataque, mesmo com o código certo');
    const strangerSync = await invoke(sync, { ip: '10.66.9.9', body: { tenantId: NIF, deviceId: 'y', cursor: 0, operations: [] }, headers: { 'x-sync-passkey': accessCode } });
    assert.equal(strangerSync.statusCode, 429);

    const office = await invoke(verify, { ip: officeIp, body: { nif: NIF, accessCode } });
    assert.equal(office.body.code, 'AUTHORIZED', 'o escritório da empresa não é afectado');
    const officeSync = await invoke(sync, { ip: officeIp, body: { tenantId: NIF, deviceId: 'pc-escritorio', cursor: 0, operations: [] }, headers: { 'x-sync-passkey': accessCode } });
    assert.equal(officeSync.statusCode, 200);
    // E a entrada do escritório não devolveu tentativas ao atacante: o NIF continua bloqueado para desconhecidos.
    assert.equal((await invoke(verify, { ip: '10.66.9.10', body: { nif: NIF, accessCode } })).statusCode, 429);
});
