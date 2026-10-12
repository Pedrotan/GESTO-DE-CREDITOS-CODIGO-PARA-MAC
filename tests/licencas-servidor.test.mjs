import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { build } from 'esbuild';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

// Etapa 1 das licenças num PostgreSQL verdadeiro (PGlite): esquema, migração das empresas da nuvem,
// fusão das chaves assinadas antigas numa licença por empresa e a API do painel do Master.

const ROOT = path.join(import.meta.dirname, '..');
const MASTER_SECRET = 'segredo-de-teste-master';
process.env.DATABASE_URL = 'postgres://pglite-test';
process.env.TANGO_MASTER_SECRET = MASTER_SECRET;

const db = new PGlite();
const sql = async (text, params = []) => (await db.query(text, params)).rows;
globalThis.__neonQuery = sql;

const sha256 = value => crypto.createHash('sha256').update(String(value)).digest('hex');
const days = n => new Date(Date.now() + n * 86_400_000);

const bundleHandler = async entry => {
    const outfile = path.join(mkdtempSync(path.join(tmpdir(), 'licencas-')), 'bundle.mjs');
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

const callTenants = async (handler, body) => {
    const response = { statusCode: 200, headers: {}, body: null };
    const res = {
        status(code) { response.statusCode = code; return res; },
        setHeader(name, value) { response.headers[name] = value; return res; },
        json(data) { response.body = data; return res; },
    };
    await handler({ method: 'POST', headers: { 'x-forwarded-for': '10.0.0.7' }, body: { ...body, masterSecret: MASTER_SECRET }, socket: {} }, res);
    return response;
};

const legacyKey = (overrides = {}) => ({
    jti: crypto.randomUUID(), nif: '5003207439', mid: 'TANGO-16EDE273', type: 'annual', tier: 'empresarial',
    exp: days(365).toISOString(), iat: new Date().toISOString(), devices: 2, keyHash: sha256(crypto.randomUUID()), ...overrides,
});

const L = await import(pathToFileURL(path.join(ROOT, 'vercel-api/_licencas.js')).href);

await sql(`CREATE TABLE tango_tenants (
    tenant_id TEXT PRIMARY KEY, tenant_hash TEXT NOT NULL UNIQUE, name TEXT NOT NULL, key_hash TEXT NOT NULL,
    access_code TEXT, status TEXT NOT NULL DEFAULT 'active', expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), last_sync_at TIMESTAMPTZ)`);
const addTenant = (id, name, status, expiresAt) => sql(
    `INSERT INTO tango_tenants (tenant_id, tenant_hash, name, key_hash, status, expires_at) VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, sha256(id), name, sha256('x'), status, expiresAt]);
await addTenant('5003207439', 'Digital Norte', 'active', days(30));
await addTenant('5000000001', 'Empresa Bloqueada', 'blocked', days(30));
await addTenant('5000000002', 'Empresa Expirada', 'active', days(-2));
await addTenant('5000000003', 'Empresa Sem Prazo', 'active', null);

test('migração: cada empresa da nuvem recebe exactamente uma licença, com o estado certo', async () => {
    assert.equal(await L.prepareLicenses(sql, 'db-teste'), 4);
    assert.equal(await L.migrateTenantsToLicenses(sql), 0, 'idempotente');
    const rows = await sql(`SELECT empresa_id, estado, plano_id, data_fim FROM tango_licencas ORDER BY empresa_id`);
    assert.deepEqual(rows.map(row => [row.empresa_id, row.estado, row.plano_id]), [
        ['5000000001', 'suspensa', 'por_definir'],
        ['5000000002', 'expirada', 'por_definir'],
        ['5000000003', 'ativa', 'por_definir'],
        ['5003207439', 'ativa', 'por_definir'],
    ]);
    assert.equal(rows.find(row => row.empresa_id === '5000000003').data_fim, null);
    const events = await sql(`SELECT COUNT(*)::int AS total FROM tango_licenca_eventos WHERE tipo = 'criada_por_migracao'`);
    assert.equal(events[0].total, 4);
});

test('a base de dados impede duas licenças para a mesma empresa', async () => {
    await assert.rejects(sql(`INSERT INTO tango_licencas (id, empresa_id, plano_id, estado) VALUES ($1, '5003207439', 'annual', 'ativa')`,
        [crypto.randomUUID()]), /duplicate key|unique/i);
});

test('chaves antigas: fica a de prazo mais longo, as outras são revogadas e as máquinas passam a activações', async () => {
    const older = legacyKey({ exp: days(100).toISOString(), mid: 'TANGO-AAAA1111', devices: 1, type: 'quarterly' });
    const kept = legacyKey({ exp: days(400).toISOString(), mid: 'TANGO-16EDE273', devices: 3 });
    const migrated = legacyKey({ exp: days(900).toISOString(), mid: 'TANGO-BBBB2222', status: 'migrated' });
    const consumer = legacyKey({ nif: '999999999' });
    const unknown = legacyKey({ nif: '5999999999' });
    const broken = { jti: 'nao-e-uuid', nif: '5003207439' };

    const report = await L.importLegacyKeys(sql, [older, kept, migrated, consumer, unknown, broken], '10.0.0.1');
    assert.equal(report.mantidas, 1);
    assert.equal(report.revogadas, 2);
    assert.equal(report.ativacoes, 3);
    assert.equal(report.ignoradas.length, 3);
    assert.equal(report.empresas[0].chaveMantida, kept.jti);
    assert.equal(report.empresas[0].dataFimNuvemDiferente, true, 'a data da nuvem (30 dias) difere da chave (400 dias)');

    const [license] = await sql(`SELECT * FROM tango_licencas WHERE empresa_id = '5003207439'`);
    assert.equal(license.plano_id, 'annual');
    assert.equal(license.max_maquinas, 3);
    assert.equal(license.estado, 'ativa');
    assert.equal(license.origem, 'chave_assinada');
    assert.equal(new Date(license.data_fim).toISOString(), new Date(kept.exp).toISOString());

    const legacy = await sql(`SELECT jti, estado FROM tango_licencas_legado ORDER BY estado`);
    assert.deepEqual(Object.fromEntries(legacy.map(row => [row.jti, row.estado])), {
        [kept.jti]: 'mantida', [older.jti]: 'revogada', [migrated.jti]: 'revogada',
    });
    const machines = await sql(`SELECT machine_hash FROM tango_licenca_ativacoes WHERE licenca_id = $1`, [license.id]);
    assert.equal(machines.length, 3);
    assert.ok(machines.every(row => /^[0-9a-f]{64}$/.test(row.machine_hash)), 'só o hash da máquina é guardado');
    assert.ok(machines.some(row => row.machine_hash === L.machineHash('tango-16ede273')));

    // Importar de novo dá o mesmo resultado.
    const again = await L.importLegacyKeys(sql, [older, kept, migrated]);
    assert.equal(again.ativacoes, 0);
    assert.equal((await sql(`SELECT COUNT(*)::int AS total FROM tango_licencas_legado`))[0].total, 3);
});

test('uma licença suspensa continua suspensa depois de importar as chaves antigas', async () => {
    await L.importLegacyKeys(sql, [legacyKey({ nif: '5000000001' })]);
    const [license] = await sql(`SELECT estado, plano_id FROM tango_licencas WHERE empresa_id = '5000000001'`);
    assert.deepEqual([license.estado, license.plano_id], ['suspensa', 'annual']);
});

test('API do painel: lista com dias restantes, criação, bloqueio, renovação e importação', async () => {
    const handler = await bundleHandler('vercel-api/tenants.js');

    const list = await callTenants(handler, { action: 'licenses-list' });
    assert.equal(list.statusCode, 200);
    const digital = list.body.licenses.find(item => item.tenantId === '5003207439');
    assert.ok(digital.daysRemaining >= 399 && digital.daysRemaining <= 401);
    assert.equal(digital.machines, 3);
    assert.equal(digital.revokedLegacyKeys, 2);
    assert.equal(list.body.licenses.find(item => item.tenantId === '5000000003').daysRemaining, null);

    const created = await callTenants(handler, { action: 'create', tenantId: '5000000009', name: 'Nova Lda', expiresAt: days(10).toISOString() });
    assert.equal(created.statusCode, 200, JSON.stringify(created.body));
    let [license] = await sql(`SELECT estado, data_fim FROM tango_licencas WHERE empresa_id = '5000000009'`);
    assert.equal(license.estado, 'ativa');

    await callTenants(handler, { action: 'update', tenantId: '5000000009', status: 'blocked' });
    [license] = await sql(`SELECT estado FROM tango_licencas WHERE empresa_id = '5000000009'`);
    assert.equal(license.estado, 'suspensa');

    const renewTo = days(200).toISOString();
    await callTenants(handler, { action: 'update', tenantId: '5000000009', status: 'active', expiresAt: renewTo });
    [license] = await sql(`SELECT estado, data_fim FROM tango_licencas WHERE empresa_id = '5000000009'`);
    assert.equal(license.estado, 'ativa');
    assert.equal(new Date(license.data_fim).toISOString(), renewTo);
    const changes = await sql(`SELECT COUNT(*)::int AS total FROM tango_licenca_eventos WHERE empresa_id = '5000000009' AND tipo = 'alterada_no_painel'`);
    assert.equal(changes[0].total, 2);

    const imported = await callTenants(handler, { action: 'licenses-import-legacy', keys: [legacyKey({ nif: '5000000009', exp: days(50).toISOString() })] });
    assert.equal(imported.statusCode, 200);
    assert.equal(imported.body.report.mantidas, 1);

    const denied = await callTenants(handler, { action: 'licenses-import-legacy', keys: 'x' });
    assert.equal(denied.statusCode, 400);

    await callTenants(handler, { action: 'delete', tenantId: '5000000009' });
    assert.equal((await sql(`SELECT COUNT(*)::int AS total FROM tango_licencas WHERE empresa_id = '5000000009'`))[0].total, 0);
});
