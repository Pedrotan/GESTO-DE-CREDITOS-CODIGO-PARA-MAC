import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { build } from 'esbuild';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

// Etapa 3 das licenças: a licença da empresa é verificada em cada pedido (sincronização, versão web, estado da
// empresa, relatórios). Rotas reais num PostgreSQL verdadeiro (PGlite).

const ROOT = path.join(import.meta.dirname, '..');
const MASTER_SECRET = 'segredo-de-teste-master';
process.env.DATABASE_URL = 'postgres://pglite-verificacao';
process.env.TANGO_MASTER_SECRET = MASTER_SECRET;

const db = new PGlite();
const sql = async (text, params = []) => (await db.query(text, params)).rows;
globalThis.__neonQuery = sql;

const bundleHandler = async entry => {
    const outfile = path.join(mkdtempSync(path.join(tmpdir(), 'licencas-verificacao-')), 'bundle.mjs');
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

const invoke = async (handler, { method = 'POST', url, body = {}, headers = {} }) => {
    const response = { statusCode: 200, body: null };
    const res = {
        status(code) { response.statusCode = code; return res; },
        setHeader() { return res; },
        json(data) { response.body = data; return res; },
    };
    await handler({ method, url, headers: { 'x-forwarded-for': '10.2.2.2', ...headers }, body, query: {}, socket: {} }, res);
    return response;
};

const [tenants, sync, verify, status] = await Promise.all([
    bundleHandler('vercel-api/tenants.js'),
    bundleHandler('vercel-api/sync.js'),
    bundleHandler('vercel-api/verify-company.js'),
    bundleHandler('vercel-api/company-status.js'),
]);

const NIF = '5003207439';
let accessCode;
const admin = body => invoke(tenants, { url: '/api/tenants', body: { ...body, masterSecret: MASTER_SECRET } });
const doSync = () => invoke(sync, {
    url: '/api/sync',
    headers: { 'x-sync-passkey': accessCode },
    body: { tenantId: NIF, deviceId: 'pc-1', cursor: 0, operations: [] },
});
const doVerify = () => invoke(verify, { url: '/api/verify-company', body: { nif: NIF, accessCode } });
const doStatus = () => invoke(status, { url: '/api/company-status', body: { nif: NIF } });
const setLicense = (estado, dataFim) => sql(`UPDATE tango_licencas SET estado = $2, data_fim = $3 WHERE empresa_id = $1`, [NIF, estado, dataFim]);

test('licença activa: sincronização, versão web e estado da empresa funcionam', async () => {
    const created = await admin({ action: 'create', tenantId: NIF, name: 'Digital Norte', expiresAt: new Date(Date.now() + 90 * 86_400_000).toISOString() });
    assert.equal(created.statusCode, 200, JSON.stringify(created.body));
    accessCode = created.body.accessCode;
    assert.equal((await doSync()).statusCode, 200);
    assert.equal((await doVerify()).body.code, 'AUTHORIZED');
    assert.equal((await doStatus()).body.status, 'ACTIVE');
});

test('licença expirada (mesmo com a empresa ainda dentro do prazo): o servidor recusa tudo', async () => {
    await setLicense('ativa', new Date(Date.now() - 3_600_000).toISOString());
    const refused = await doSync();
    assert.equal(refused.statusCode, 403);
    assert.equal(refused.body.code, 'LICENCA_EXPIRADA');
    assert.match(refused.body.message, /expirou/);
    const [row] = await sql(`SELECT estado FROM tango_licencas WHERE empresa_id = $1`, [NIF]);
    assert.equal(row.estado, 'expirada', 'a licença passa a expirada no servidor');

    const web = await doVerify();
    assert.equal(web.statusCode, 403);
    assert.equal(web.body.code, 'EXPIRED', 'a versão web mostra o ecrã de subscrição expirada');
    assert.equal(web.body.licenseCode, 'LICENCA_EXPIRADA');
    assert.equal((await doStatus()).body.status, 'EXPIRED');
});

test('licença suspensa ou revogada: bloqueia com a mensagem de suporte', async () => {
    await setLicense('suspensa', new Date(Date.now() + 86_400_000).toISOString());
    assert.equal((await doSync()).body.code, 'LICENCA_SUSPENSA');
    assert.equal((await doVerify()).body.code, 'BLOCKED');
    await setLicense('revogada', null);
    const revoked = await doSync();
    assert.equal(revoked.body.code, 'LICENCA_REVOGADA');
    assert.match(revoked.body.message, /941 537 486/);
    assert.equal((await doStatus()).body.status, 'BLOCKED');
});

test('renovar no painel volta a abrir a sincronização e a versão web', async () => {
    await setLicense('expirada', new Date(Date.now() - 86_400_000).toISOString());
    await admin({ action: 'update', tenantId: NIF, status: 'active', expiresAt: new Date(Date.now() + 365 * 86_400_000).toISOString() });
    assert.equal((await doSync()).statusCode, 200);
    assert.equal((await doVerify()).body.code, 'AUTHORIZED');
});

test('empresa sem linha de licença (registada pela chave global) segue só as regras da empresa', async () => {
    await sql(`DELETE FROM tango_licencas WHERE empresa_id = $1`, [NIF]);
    const L = await import(pathToFileURL(path.join(ROOT, 'vercel-api/_licencas.js')).href);
    assert.deepEqual(await L.checkTenantLicense(sql, NIF), { ok: true, license: null });
    // Se as tabelas não existirem, a verificação deixa passar em vez de parar todas as empresas.
    const broken = async () => { throw new Error('relation "tango_licencas" does not exist'); };
    assert.equal((await L.licenseGate(broken, NIF)).ok, true);
});
