import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { build } from 'esbuild';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

// Etapa 5 das licenças: gestão no painel do Master (renovar, mudar plano, suspender, libertar computador,
// histórico), de ponta a ponta pelas rotas reais /api/tenants e /api/licencas num PostgreSQL verdadeiro.

const ROOT = path.join(import.meta.dirname, '..');
const MASTER_SECRET = 'segredo-de-teste-master';
process.env.DATABASE_URL = 'postgres://pglite-gestao';
process.env.TANGO_MASTER_SECRET = MASTER_SECRET;
process.env.TANGO_LICENSE_SIGNING_KEY = crypto.generateKeyPairSync('ed25519').privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64');

const db = new PGlite();
const sql = async (text, params = []) => (await db.query(text, params)).rows;
globalThis.__neonQuery = sql;

const bundleHandler = async entry => {
    const outfile = path.join(mkdtempSync(path.join(tmpdir(), 'licencas-gestao-')), 'bundle.mjs');
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

const invoke = async (handler, url, body) => {
    const response = { statusCode: 200, body: null };
    const res = {
        status(code) { response.statusCode = code; return res; },
        setHeader() { return res; },
        json(data) { response.body = data; return res; },
    };
    await handler({ method: 'POST', url, headers: { 'x-forwarded-for': '10.3.3.3' }, body, query: {}, socket: {} }, res);
    return response;
};

const [tenants, licencas] = await Promise.all([bundleHandler('vercel-api/tenants.js'), bundleHandler('vercel-api/licencas.js')]);
const admin = body => invoke(tenants, '/api/tenants', { ...body, masterSecret: MASTER_SECRET });
const activate = body => invoke(licencas, '/api/licencas/ativar', body);
const machine = name => crypto.createHash('sha256').update(name).digest('hex');
const NIF = '5003207439';
let key;

test('a lista traz os planos e cada licença com dias restantes', async () => {
    const created = await admin({ action: 'create', tenantId: NIF, name: 'Digital Norte', expiresAt: new Date(Date.now() + 40 * 86_400_000).toISOString() });
    key = created.body.licenseKey;
    const list = await admin({ action: 'licenses-list' });
    assert.equal(list.statusCode, 200);
    assert.deepEqual(list.body.plans.map(plan => plan.id), ['trial', 'monthly', 'quarterly', 'biannual', 'annual', 'lifetime', 'por_definir']);
    assert.equal(list.body.licenses[0].daysRemaining, 40);
});

test('mudar plano: altera plano, escalão e computadores, e avisa quando há mais computadores do que o novo máximo', async () => {
    const changed = await admin({ action: 'license-change-plan', tenantId: NIF, plan: 'annual', tier: 'empresarial', maxMachines: 2 });
    assert.equal(changed.statusCode, 200, JSON.stringify(changed.body));
    assert.equal((await activate({ chave: key, machine_hash: machine('pc-1'), nome_maquina: 'Caixa 1' })).statusCode, 200);
    assert.equal((await activate({ chave: key, machine_hash: machine('pc-2'), nome_maquina: 'Gerência' })).statusCode, 200);
    const reduced = await admin({ action: 'license-change-plan', tenantId: NIF, plan: 'monthly', tier: 'singular', maxMachines: 1 });
    assert.equal(reduced.body.overLimit, true);
    assert.equal(reduced.body.activeMachines, 2);
    const [license] = await sql(`SELECT plano_id, escalao, max_maquinas FROM tango_licencas WHERE empresa_id = $1`, [NIF]);
    assert.deepEqual([license.plano_id, license.escalao, license.max_maquinas], ['monthly', 'singular', 1]);
    assert.equal((await admin({ action: 'license-change-plan', tenantId: NIF, plan: 'ouro', tier: 'singular', maxMachines: 1 })).statusCode, 400);
    assert.equal((await admin({ action: 'license-change-plan', tenantId: NIF, plan: 'annual', tier: 'singular', maxMachines: 0 })).statusCode, 400);
});

test('libertar um computador: deixa de renovar e o lugar fica livre para outro', async () => {
    const details = await admin({ action: 'license-details', tenantId: NIF });
    assert.equal(details.body.machines.length, 2);
    const caixa = details.body.machines.find(item => item.name === 'Caixa 1');
    assert.equal(caixa.fingerprint, machine('pc-1').slice(0, 12), 'o painel só vê o início da impressão digital');

    const firstToken = (await activate({ chave: key, machine_hash: machine('pc-1') })).body.token;
    const released = await admin({ action: 'license-release-machine', tenantId: NIF, activationId: caixa.id });
    assert.equal(released.statusCode, 200);
    assert.equal((await admin({ action: 'license-release-machine', tenantId: NIF, activationId: caixa.id })).statusCode, 404, 'já libertado');

    const heartbeat = await invoke(licencas, '/api/licencas/heartbeat', { token: firstToken, machine_hash: machine('pc-1') });
    assert.equal(heartbeat.body.code, 'MAQUINA_LIBERTADA');

    await admin({ action: 'license-change-plan', tenantId: NIF, plan: 'annual', tier: 'empresarial', maxMachines: 2 });
    assert.equal((await activate({ chave: key, machine_hash: machine('pc-novo'), nome_maquina: 'Computador novo' })).statusCode, 200);
});

test('suspender e renovar pelo painel actualizam a licença; o histórico regista tudo', async () => {
    await admin({ action: 'update', tenantId: NIF, status: 'blocked' });
    assert.equal((await activate({ chave: key, machine_hash: machine('pc-2') })).body.code, 'LICENCA_SUSPENSA');
    const renewTo = new Date(Date.now() + 400 * 86_400_000).toISOString();
    await admin({ action: 'update', tenantId: NIF, status: 'active', expiresAt: renewTo });
    const list = await admin({ action: 'licenses-list' });
    const license = list.body.licenses.find(item => item.tenantId === NIF);
    assert.equal(license.status, 'ativa');
    assert.equal(license.daysRemaining, 400);
    assert.equal(license.machines, 2);

    const history = await admin({ action: 'license-details', tenantId: NIF });
    const types = history.body.events.map(event => event.type);
    for (const type of ['criada_por_migracao', 'chave_emitida', 'plano_alterado', 'maquina_ativada', 'maquina_libertada', 'alterada_no_painel', 'ativacao_recusada']) {
        assert.ok(types.includes(type), `histórico inclui ${type}`);
    }
    assert.ok(new Date(history.body.events[0].at) >= new Date(history.body.events.at(-1).at), 'mais recente primeiro');
});

test('empresa inexistente: as acções respondem 404', async () => {
    for (const action of ['license-details', 'license-release-machine', 'license-change-plan']) {
        const response = await admin({ action, tenantId: '5999999999', plan: 'annual', tier: 'singular', maxMachines: 1, activationId: 'x' });
        assert.equal(response.statusCode, 404, action);
    }
});
