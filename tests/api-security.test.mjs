import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { applyCors, enforceDistributedRateLimit, enforceRateLimit, requireSecret, safeEqual } from '../vercel-api/_security.js';

const response = () => ({
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
});

test('comparação de segredos e autenticação', () => {
    assert.equal(safeEqual('abc', 'abc'), true);
    assert.equal(safeEqual('abc', 'abd'), false);
    assert.equal(requireSecret({ headers: { authorization: 'Bearer secret' } }, 'secret'), true);
});

test('CORS só reflete origem explicitamente autorizada', () => {
    const previous = process.env.TANGO_ALLOWED_ORIGINS;
    process.env.TANGO_ALLOWED_ORIGINS = 'https://erp.example.com';
    const allowed = response();
    assert.equal(applyCors({ headers: { origin: 'https://erp.example.com' } }, allowed), true);
    assert.equal(allowed.headers['Access-Control-Allow-Origin'], 'https://erp.example.com');
    const denied = response();
    assert.equal(applyCors({ headers: { origin: 'https://evil.example' } }, denied), false);
    if (previous === undefined) delete process.env.TANGO_ALLOWED_ORIGINS;
    else process.env.TANGO_ALLOWED_ORIGINS = previous;
});

test('limitador bloqueia excesso', () => {
    const req = { headers: { 'x-forwarded-for': `203.0.113.${Date.now() % 200}` }, socket: {} };
    assert.equal(enforceRateLimit(req, response(), { limit: 1, windowMs: 60_000, scope: 'test' }), true);
    const blocked = response();
    assert.equal(enforceRateLimit(req, blocked, { limit: 1, windowMs: 60_000, scope: 'test' }), false);
    assert.equal(blocked.statusCode, 429);
});

test('limitador distribuído partilha a contagem e falha fechado', async () => {
    let count = 0;
    const sql = async (query, params) => {
        if (query.startsWith('CREATE TABLE')) return [];
        assert.equal(params[1], 60_000);
        return [{ request_count: ++count, reset_epoch: Math.floor(Date.now() / 1000) + 60 }];
    };
    const req = { headers: { 'x-forwarded-for': '203.0.113.123' }, socket: {} };
    assert.equal(await enforceDistributedRateLimit(sql, req, response(), { limit: 1, windowMs: 60_000, scope: 'test-distributed' }), true);
    const blocked = response();
    assert.equal(await enforceDistributedRateLimit(sql, req, blocked, { limit: 1, windowMs: 60_000, scope: 'test-distributed' }), false);
    assert.equal(blocked.statusCode, 429);
    await assert.rejects(() => enforceDistributedRateLimit(async () => { throw new Error('database unavailable'); }, req, response(),
        { limit: 1, windowMs: 60_000, scope: 'test-distributed' }), /database unavailable/);
});

test('API de empresas só aceita a chave mestra configurada e falha fechada sem ela', async () => {
    const tenants = await loadHandlerWithoutNeon('tenants.js');
    const previous = { db: process.env.DATABASE_URL, master: process.env.TANGO_MASTER_SECRET };
    process.env.DATABASE_URL = 'postgres://test';
    const call = async secret => {
        const res = response();
        await tenants({ method: 'POST', headers: { authorization: `Bearer ${secret}` }, body: { action: 'list' } }, res);
        return res;
    };
    try {
        delete process.env.TANGO_MASTER_SECRET;
        assert.equal((await call('TangoMaster#2026!LiveSecret')).statusCode, 503);
        process.env.TANGO_MASTER_SECRET = 'segredo-configurado-no-servidor';
        for (const legacy of ['TangoMaster#2026!LiveSecret', 'TANGO_MASTER_2024', 'Senha-Mestra-2026!', 'TangoSync#2026!Live']) {
            assert.equal((await call(legacy)).statusCode, 401, legacy);
        }
        // A chave correta passa a autenticação (falha depois apenas no acesso à base de dados de teste).
        const accepted = async request => {
            const res = response();
            await tenants({ method: 'POST', headers: {}, ...request }, res).catch(() => undefined);
            return res.statusCode !== 401;
        };
        process.env.TANGO_MASTER_SECRET = ' "Chave-Mestra-Açúcar-2026" \n';
        assert.equal(await accepted({ body: { action: 'list', masterSecret: 'Chave-Mestra-Açúcar-2026' } }), true);
        const latin1Header = Buffer.from('Bearer Chave-Mestra-Açúcar-2026', 'utf8').toString('latin1');
        assert.equal(await accepted({ headers: { authorization: latin1Header }, body: { action: 'list' } }), true);
        assert.equal(await accepted({ body: { action: 'list', masterSecret: 'Chave-Mestra-Acucar-2026' } }), false);
    } finally {
        for (const [key, value] of [['DATABASE_URL', previous.db], ['TANGO_MASTER_SECRET', previous.master]]) {
            if (value === undefined) delete process.env[key]; else process.env[key] = value;
        }
    }
});

// Os handlers importam o cliente Neon, só instalado no deploy; nos testes a autenticação
// tem de responder antes de qualquer acesso à base de dados.
async function loadHandlerWithoutNeon(file) {
    const outdir = mkdtempSync(path.join(tmpdir(), 'api-handler-'));
    const outfile = path.join(outdir, 'handler.mjs');
    await build({
        entryPoints: [path.join(import.meta.dirname, '..', 'vercel-api', file)],
        bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent',
        plugins: [{ name: 'neon-stub', setup(builder) {
            builder.onResolve({ filter: /^@neondatabase\/serverless$/ }, () => ({ path: 'neon', namespace: 'neon-stub' }));
            builder.onLoad({ filter: /.*/, namespace: 'neon-stub' }, () => ({
                contents: 'export const neon = () => { throw new Error("Base de dados não deve ser acedida."); };', loader: 'js'
            }));
        } }]
    });
    const module = await import(pathToFileURL(outfile).href);
    rmSync(outdir, { recursive: true, force: true });
    return module.default;
}
