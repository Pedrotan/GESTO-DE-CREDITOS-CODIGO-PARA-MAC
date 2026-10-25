import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { build } from 'esbuild';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

// Centro de actualizações num PostgreSQL verdadeiro (PGlite): o interruptor «Disponibilizar para todos» do
// Tango Master decide o aviso, o feed do electron-updater e o download; tudo fica na auditoria.

const ROOT = path.join(import.meta.dirname, '..');
const MASTER_SECRET = 'segredo-de-teste-master-actualizacoes';
process.env.DATABASE_URL = 'postgres://pglite-test';
process.env.TANGO_MASTER_SECRET = MASTER_SECRET;
const UPDATES_DIR = mkdtempSync(path.join(tmpdir(), 'actualizacoes-'));
process.env.TANGO_UPDATES_DIR = UPDATES_DIR;
const signingKey = crypto.generateKeyPairSync('ed25519').privateKey;
process.env.TANGO_LICENSE_SIGNING_KEY = signingKey.export({ format: 'pem', type: 'pkcs8' });

const db = new PGlite();
const sql = async (text, params = []) => (await db.query(text, params)).rows;
globalThis.__neonQuery = sql;

const bundle = async entry => {
    const outfile = path.join(mkdtempSync(path.join(tmpdir(), 'updates-')), 'bundle.mjs');
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
    return import(`${pathToFileURL(outfile).href}?v=${Math.random()}`);
};

const mod = await bundle('vercel-api/updates.js');
const handler = mod.default;
const { createMasterSession } = await import(pathToFileURL(path.join(ROOT, 'vercel-api/_sessao-master.js')).href);
const { signLicenseToken } = await import(pathToFileURL(path.join(ROOT, 'vercel-api/_token-licenca.js')).href);

let ipCounter = 0;
const call = async ({ method = 'GET', url, body, headers = {} }) => {
    const response = { statusCode: 200, headers: {}, body: null, raw: '' };
    const res = {
        headersSent: false,
        get statusCode() { return response.statusCode; },
        set statusCode(code) { response.statusCode = code; },
        status(code) { response.statusCode = code; return res; },
        setHeader(name, value) { response.headers[name.toLowerCase()] = value; return res; },
        json(data) { response.body = data; return res; },
        end(chunk) { if (chunk) response.raw += chunk; return res; },
        on() { return res; }, write() { return true; }, writeHead() { return res; }, once() { return res; }, emit() { return res; },
        destroy() {},
    };
    const query = Object.fromEntries(new URL(url, 'http://x').searchParams);
    // Um IP por pedido: os limites de pedidos não interferem com o teste.
    await handler({ method, url, query, body, headers: { 'x-forwarded-for': `10.9.${Math.floor(++ipCounter / 250)}.${ipCounter % 250}`, ...headers }, socket: {}, on() {} }, res);
    return response;
};

const sha512 = buffer => crypto.createHash('sha512').update(buffer).digest('base64');
const putRelease = (version, content = `instalador ${version}`) => {
    const dir = path.join(UPDATES_DIR, version);
    mkdirSync(dir, { recursive: true });
    const exe = Buffer.from(content);
    writeFileSync(path.join(dir, 'TangoGestaoCreditos_Setup.exe'), exe);
    writeFileSync(path.join(dir, 'latest.yml'), [
        `version: ${version}`, 'files:', '  - url: TangoGestaoCreditos_Setup.exe', `    sha512: ${sha512(exe)}`, `    size: ${exe.length}`,
        'path: TangoGestaoCreditos_Setup.exe', `sha512: ${sha512(exe)}`, "releaseDate: '2026-10-25T10:00:00.000Z'", '',
    ].join('\n'));
};

await sql(`CREATE TABLE tango_tenants (tenant_id TEXT PRIMARY KEY, tenant_hash TEXT NOT NULL UNIQUE, name TEXT NOT NULL, key_hash TEXT NOT NULL,
    access_code TEXT, status TEXT NOT NULL DEFAULT 'active', expires_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), last_sync_at TIMESTAMPTZ)`);
await sql(`INSERT INTO tango_tenants (tenant_id, tenant_hash, name, key_hash) VALUES ('5003207439', 'h1', 'Digital Norte', 'k')`);
const session = await createMasterSession(sql, MASTER_SECRET, '127.0.0.1');
const admin = (body) => call({ method: 'POST', url: '/api/updates/admin', body, headers: { 'x-master-session': session.token } });

const TEAM = crypto.randomUUID();
const CLIENT = crypto.randomUUID();
const OTHER_COMPANY = crypto.randomUUID();
const register = (deviceId, extra = {}) => call({ method: 'POST', url: '/api/updates/register', body: { deviceId, kind: 'desktop', platform: 'win', arch: 'x64', version: '3.0.3', ...extra } });
const check = (deviceId, version = '3.0.3') => call({ url: `/api/updates/check?deviceId=${deviceId}&platform=win&arch=x64&version=${version}` });

test('admin: sem sessão do Tango Master é recusado (a chave mestra não é aceite aqui)', async () => {
    const noSession = await call({ method: 'POST', url: '/api/updates/admin', body: { action: 'overview', masterSecret: MASTER_SECRET } });
    assert.equal(noSession.statusCode, 401);
    const forged = await call({ method: 'POST', url: '/api/updates/admin', body: { action: 'overview' }, headers: { 'x-master-session': `tms_${'A'.repeat(43)}` } });
    assert.equal(forged.statusCode, 401);
});

test('registar versão confere tamanho e SHA-512 dos ficheiros na VPS', async () => {
    putRelease('3.0.4');
    writeFileSync(path.join(UPDATES_DIR, '3.0.4', 'TangoGestaoCreditos_Setup.exe'), 'adulterado');
    const bad = await admin({ action: 'release-register', version: '3.0.4' });
    assert.equal(bad.statusCode, 422);
    assert.match(bad.body.message, /tamanho|SHA-512/);
    const missing = await admin({ action: 'release-register', version: '9.9.9' });
    assert.equal(missing.statusCode, 422);

    putRelease('3.0.4');
    const ok = await admin({ action: 'release-register', version: '3.0.4', notes: 'Correcções no fecho do mês.' });
    assert.equal(ok.statusCode, 200, JSON.stringify(ok.body));
    assert.equal(ok.body.release.public, false, 'uma versão nova começa sempre só para a equipa');
    assert.equal((await admin({ action: 'release-register', version: '3.0.4' })).statusCode, 409);
});

test('interruptor desligado: só a equipa recebe aviso, feed e download', async () => {
    assert.equal((await register(TEAM)).statusCode, 200);
    assert.equal((await register(CLIENT)).statusCode, 200);
    assert.equal((await admin({ action: 'device-set-team', deviceId: TEAM, team: true, label: 'PC do Pedro' })).statusCode, 200);

    const teamCheck = await check(TEAM);
    assert.equal(teamCheck.body.channel, 'internal');
    assert.equal(teamCheck.body.available, true);
    assert.equal(teamCheck.body.release.version, '3.0.4');
    assert.equal(teamCheck.body.release.notes, 'Correcções no fecho do mês.');

    const clientCheck = await check(CLIENT);
    assert.equal(clientCheck.body.channel, 'stable');
    assert.equal(clientCheck.body.available, false);

    const teamFeed = await call({ url: `/api/updates/feed/${TEAM}/latest.yml` });
    assert.equal(teamFeed.statusCode, 200);
    assert.match(teamFeed.raw, /^version: 3\.0\.4$/m);
    assert.match(teamFeed.raw, /url: files\/3\.0\.4\/TangoGestaoCreditos_Setup\.exe/);
    assert.equal((await call({ url: `/api/updates/feed/${CLIENT}/latest.yml` })).statusCode, 404, 'o feed também respeita o interruptor');
    assert.equal((await call({ url: `/api/updates/feed/${CLIENT}/files/3.0.4/TangoGestaoCreditos_Setup.exe` })).statusCode, 404,
        'nem conhecendo o endereço um cliente descarrega a versão da equipa');
    assert.equal((await call({ url: `/api/updates/feed/${TEAM}/files/3.0.4/..%2F..%2Fsegredo` })).statusCode, 404);
});

test('interruptor ligado: chega a todos; desligar volta a ser só da equipa; tudo na auditoria', async () => {
    assert.equal((await admin({ action: 'release-set-public', version: '3.0.4', public: true })).body.release.public, true);
    assert.equal((await check(CLIENT)).body.available, true);
    assert.equal((await call({ url: `/api/updates/feed/${CLIENT}/latest.yml` })).statusCode, 200);

    await admin({ action: 'release-set-public', version: '3.0.4', public: false });
    assert.equal((await check(CLIENT)).body.available, false);

    const overview = await admin({ action: 'overview' });
    const actions = overview.body.audit.map(row => row.action);
    assert.ok(actions.includes('release_registered'));
    assert.ok(actions.includes('release_public_on'));
    assert.ok(actions.includes('release_public_off'));
    assert.ok(actions.includes('device_team_on'));
    assert.equal(overview.body.devices.find(device => device.device_id === TEAM).label, 'PC do Pedro');
});

test('uma versão da equipa não esconde a última versão pública dos restantes', async () => {
    await admin({ action: 'release-set-public', version: '3.0.4', public: true });
    putRelease('3.0.5');
    await admin({ action: 'release-register', version: '3.0.5' });
    assert.equal((await check(TEAM)).body.release.version, '3.0.5');
    assert.equal((await check(CLIENT)).body.release.version, '3.0.4');
    assert.equal((await check(CLIENT, '3.0.4')).body.available, false);
});

test('empresa marcada como equipa: conta só com token de licença assinado pelo servidor', async () => {
    await admin({ action: 'tenant-set-team', tenantId: '5003207439', team: true });
    // Sem token, dizer a empresa não chega.
    await register(OTHER_COMPANY, { tenantId: '5003207439' });
    assert.equal((await check(OTHER_COMPANY)).body.channel, 'stable');
    const forged = signLicenseToken(crypto.generateKeyPairSync('ed25519').privateKey, { empresa_id: '5003207439' });
    await register(OTHER_COMPANY, { licenseToken: forged });
    assert.equal((await check(OTHER_COMPANY)).body.channel, 'stable', 'token assinado por outra chave é ignorado');
    await register(OTHER_COMPANY, { licenseToken: signLicenseToken(signingKey, { empresa_id: '5003207439' }) });
    assert.equal((await check(OTHER_COMPANY)).body.channel, 'internal');
});

test('suspender uma versão corta aviso e download, mesmo para a equipa', async () => {
    await admin({ action: 'release-pause', version: '3.0.5' });
    assert.equal((await check(TEAM)).body.release.version, '3.0.4');
    assert.equal((await call({ url: `/api/updates/feed/${TEAM}/files/3.0.5/TangoGestaoCreditos_Setup.exe` })).statusCode, 404);
    await admin({ action: 'release-resume', version: '3.0.5' });
    assert.equal((await check(TEAM)).body.release.version, '3.0.5');
});

test('rollout parcial: o mesmo dispositivo cai sempre do mesmo lado', async () => {
    await admin({ action: 'release-update', version: '3.0.4', rolloutPercent: 50 });
    const devices = Array.from({ length: 40 }, () => crypto.randomUUID());
    for (const id of devices) await register(id);
    const first = [];
    for (const id of devices) first.push((await check(id)).body.available);
    const second = [];
    for (const id of devices) second.push((await check(id)).body.available);
    assert.deepEqual(first, second);
    assert.ok(first.some(Boolean) && first.some(value => !value), 'com 40 dispositivos há dos dois lados');
    await admin({ action: 'release-update', version: '3.0.4', rolloutPercent: 100 });
});

test('estado e ACK: validados e idempotentes', async () => {
    assert.equal((await call({ method: 'POST', url: '/api/updates/status', body: { deviceId: CLIENT, state: 'apagar-tudo' } })).statusCode, 400);
    assert.equal((await call({ method: 'POST', url: '/api/updates/status', body: { deviceId: CLIENT, state: 'downloading', targetVersion: '3.0.4' } })).statusCode, 200);
    const first = await call({ method: 'POST', url: '/api/updates/ack', body: { deviceId: CLIENT, version: '3.0.4' } });
    assert.equal(first.statusCode, 200);
    const again = await call({ method: 'POST', url: '/api/updates/ack', body: { deviceId: CLIENT, version: '3.0.4' } });
    assert.equal(String(again.body.ackedAt), String(first.body.ackedAt), 'repetir o ACK não muda a data');
    const [row] = await sql('SELECT state, app_version FROM tango_update_devices WHERE device_id = $1', [CLIENT]);
    assert.deepEqual([row.state, row.app_version], ['succeeded', '3.0.4']);
    assert.equal((await call({ method: 'POST', url: '/api/updates/ack', body: { deviceId: crypto.randomUUID(), version: '3.0.4' } })).statusCode, 404);
});

test('pedidos inválidos são recusados', async () => {
    assert.equal((await call({ url: '/api/updates/check?deviceId=x&platform=linux&version=3.0.3' })).statusCode, 400);
    assert.equal((await call({ url: `/api/updates/check?deviceId=${CLIENT}&platform=win&version=latest` })).statusCode, 400);
    assert.equal((await call({ method: 'POST', url: '/api/updates/register', body: { deviceId: 'abc', kind: 'desktop', platform: 'win', version: '3.0.3' } })).statusCode, 400);
    assert.equal((await call({ url: '/api/updates/feed/nao-e-id/latest.yml' })).statusCode, 404);
    assert.equal((await admin({ action: 'release-update', version: '3.0.4', rolloutPercent: 0 })).statusCode, 400);
});

test('feed real por HTTP: o electron-updater lê o latest.yml e descarrega o instalador certo', async () => {
    const http = await import('node:http');
    const { createRequire } = await import('node:module');
    const require = createRequire(import.meta.url);
    const { parseUpdateInfo, resolveFiles } = require('electron-updater/out/providers/Provider.js');
    // Servidor igual ao da VPS (server.mjs): helpers status/json e query.
    const server = http.createServer(async (req, res) => {
        res.status = code => { res.statusCode = code; return res; };
        res.json = data => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(data)); };
        req.query = Object.fromEntries(new URL(req.url, 'http://x').searchParams);
        req.body = {};
        await handler(req, res);
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    try {
        // Como o GenericProvider: base com barra final e ?noCache=… no pedido do latest.yml.
        const feedBase = new URL(`${base}/api/updates/feed/${TEAM}/`);
        const channelUrl = new URL(`latest.yml?noCache=${Date.now().toString(32)}`, feedBase);
        const response = await fetch(channelUrl);
        assert.equal(response.status, 200);
        const info = parseUpdateInfo(await response.text(), 'latest.yml', channelUrl);
        assert.equal(info.version, '3.0.5');
        const [file] = resolveFiles(info, feedBase);
        assert.equal(file.url.pathname, `/api/updates/feed/${TEAM}/files/3.0.5/TangoGestaoCreditos_Setup.exe`);
        const download = await fetch(file.url);
        assert.equal(download.status, 200);
        const bytes = Buffer.from(await download.arrayBuffer());
        assert.equal(bytes.length, info.files[0].size);
        assert.equal(sha512(bytes), info.files[0].sha512, 'o SHA-512 do feed confere com o ficheiro servido');

        const clientFeed = await fetch(new URL(`${base}/api/updates/feed/${CLIENT}/latest.yml`));
        assert.equal(parseUpdateInfo(await clientFeed.text(), 'latest.yml', clientFeed.url).version, '3.0.4', 'o cliente só vê a versão pública');
        assert.equal((await fetch(`${base}/api/updates/feed/${CLIENT}/files/3.0.5/TangoGestaoCreditos_Setup.exe`)).status, 404);
    } finally {
        server.close();
    }
});

test('aviso em tempo real: ligar o interruptor chega aos clientes ligados, sem endereços', async () => {
    const http = await import('node:http');
    const server = http.createServer(async (req, res) => {
        res.status = code => { res.statusCode = code; return res; };
        res.json = data => res.end(JSON.stringify(data));
        req.query = {}; req.body = {};
        await handler(req, res);
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const abort = new AbortController();
    try {
        const response = await fetch(`http://127.0.0.1:${server.address().port}/api/updates/events`, { signal: abort.signal });
        assert.equal(response.headers.get('content-type'), 'text/event-stream; charset=utf-8');
        const reader = response.body.getReader();
        let text = '';
        const readUntil = async (pattern) => {
            while (!pattern.test(text)) text += new TextDecoder().decode((await reader.read()).value);
        };
        await readUntil(/"connected"/);
        await admin({ action: 'release-set-public', version: '3.0.5', public: true });
        await readUntil(/update\.available/);
        const event = JSON.parse(text.split('\n').filter(line => line.includes('update.available'))[0].slice(5));
        assert.equal(event.version, '3.0.5');
        assert.equal(event.scope, 'all');
        assert.equal(JSON.stringify(event).includes('http'), false, 'o aviso nunca leva endereços');
    } finally {
        abort.abort();
        server.closeAllConnections?.();
        server.close();
    }
});

test('o painel lista as empresas já cadastradas, com a marca de equipa e os computadores', async () => {
    await sql(`INSERT INTO tango_tenants (tenant_id, tenant_hash, name, key_hash) VALUES ('5000000099', 'h99', 'Aaa Microcrédito', 'k') ON CONFLICT DO NOTHING`);
    const { body } = await admin({ action: 'overview' });
    const byId = Object.fromEntries(body.companies.map(company => [company.tenant_id, company]));
    assert.equal(byId['5000000099'].name, 'Aaa Microcrédito');
    assert.equal(byId['5000000099'].team, false);
    assert.equal(byId['5003207439'].team, true, 'marcada como equipa num teste anterior');
    assert.equal(byId['5003207439'].devices, 1, 'o computador registado com o token da empresa');
    assert.equal(body.companies[0].name, 'Aaa Microcrédito', 'ordenadas por nome');
    await admin({ action: 'tenant-set-team', tenantId: '5000000099', team: true });
    assert.equal((await admin({ action: 'overview' })).body.companies.find(company => company.tenant_id === '5000000099').team, true);
});
