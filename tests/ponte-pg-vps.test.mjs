import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { neonConfig } from '@neondatabase/serverless';

// O caminho exacto da VPS: o driver neon() verdadeiro, ligado ao PostgreSQL pela ponte do server.mjs
// (rowMode 'array', valores já convertidos pelo pg). Aqui o PGlite faz de pg: devolve Date e objectos JSONB tal
// como o pg. Antes da correcção, a activação rebentava ao ler a coluna JSONB do plano.

const ROOT = path.join(import.meta.dirname, '..');
const MASTER_SECRET = 'segredo-de-teste-master';
process.env.DATABASE_URL = 'postgresql://tango:teste@db:5432/tangodb';
process.env.TANGO_MASTER_SECRET = MASTER_SECRET;
process.env.TANGO_LICENSE_SIGNING_KEY = crypto.generateKeyPairSync('ed25519').privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64');

const { toNeonResult } = await import(pathToFileURL(path.join(ROOT, 'vercel-api/_ponte-pg.js')).href);
const db = new PGlite();
neonConfig.fetchFunction = async (_url, options) => {
    const body = JSON.parse(options.body || '{}');
    try {
        const result = await db.query(body.query || '', body.params || [], { rowMode: 'array' });
        return new Response(JSON.stringify(toNeonResult(result)), { status: 200, headers: { 'Content-Type': 'application/json' } });
    } catch (error) {
        return new Response(JSON.stringify({ message: error.message, code: error.code || 'XX000' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
};

const load = async file => (await import(pathToFileURL(path.join(ROOT, 'vercel-api', file)).href)).default;
const [tenants, licencas] = [await load('tenants.js'), await load('licencas.js')];
const invoke = async (handler, url, body) => {
    const response = { statusCode: 200, body: null };
    const res = {
        status(code) { response.statusCode = code; return res; },
        setHeader() { return res; },
        json(data) { response.body = data; return res; },
    };
    await handler({ method: 'POST', url, headers: { 'x-forwarded-for': '10.4.4.4' }, body, query: {}, socket: {} }, res);
    return response;
};
const admin = body => invoke(tenants, '/api/tenants', { ...body, masterSecret: MASTER_SECRET });

test('ponte da VPS: JSON/JSONB seguem como texto JSON e datas como texto', () => {
    const converted = toNeonResult({
        fields: [{ name: 'detalhe', dataTypeID: 3802 }, { name: 'criado_em', dataTypeID: 1184 }, { name: 'n', dataTypeID: 23 }],
        rows: [[{ a: 1 }, new Date('2026-10-13T00:00:00Z'), 5], [null, null, 6]],
    });
    assert.deepEqual(converted.fields.map(field => field.dataTypeID), [3802, 25, 23]);
    assert.equal(converted.rows[0][0], '{"a":1}');
    assert.equal(converted.rows[1][0], null);
});

test('activação, histórico e lista de licenças funcionam pelo driver neon e pela ponte da VPS', async () => {
    await db.query(`CREATE TABLE tango_tenants (tenant_id TEXT PRIMARY KEY, tenant_hash TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
        key_hash TEXT NOT NULL, access_code TEXT, status TEXT NOT NULL DEFAULT 'active', expires_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), last_sync_at TIMESTAMPTZ)`);
    const created = await admin({ action: 'create', tenantId: '5003207439', name: 'Digital Norte', expiresAt: new Date(Date.now() + 90 * 86_400_000).toISOString() });
    assert.equal(created.statusCode, 200, JSON.stringify(created.body));

    const machine = crypto.createHash('sha256').update('pc-vps').digest('hex');
    const activated = await invoke(licencas, '/api/licencas/ativar', { chave: created.body.licenseKey, machine_hash: machine, nome_maquina: 'Caixa' });
    assert.equal(activated.statusCode, 200, JSON.stringify(activated.body));
    assert.ok(activated.body.token);

    const renewed = await invoke(licencas, '/api/licencas/heartbeat', { token: activated.body.token, machine_hash: machine });
    assert.equal(renewed.statusCode, 200, JSON.stringify(renewed.body));

    const details = await admin({ action: 'license-details', tenantId: '5003207439' });
    assert.equal(details.statusCode, 200, JSON.stringify(details.body));
    const activation = details.body.events.find(event => event.type === 'maquina_ativada');
    assert.equal(activation.detail.nome, 'Caixa', 'o detalhe JSONB chega como objecto');

    const list = await admin({ action: 'licenses-list' });
    assert.equal(list.body.licenses[0].machines, 1);
    assert.equal(list.body.licenses[0].daysRemaining, 90);
});
