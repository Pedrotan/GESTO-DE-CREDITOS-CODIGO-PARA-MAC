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
    // O limite de pedidos e o bloqueio por tentativas são verificados ANTES da chave (contra força bruta);
    // a base de dados de teste só responde a essas tabelas.
    const tenants = await loadHandlerWithoutNeon('tenants.js', true);
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

// Base de dados de teste que só responde ao limitador de pedidos, aos bloqueios e ao registo de alertas.
const SECURITY_ONLY_NEON = `export const neon = () => ({ query: async (text) => {
    if (/^s*CREATE/i.test(text)) return [];
    if (/api_rate_limits/.test(text)) return [{ request_count: 1, reset_epoch: Math.floor(Date.now() / 1000) + 60 }];
    if (/security_lockouts|security_events/.test(text)) return [];
    throw new Error('Base de dados de teste: só tabelas de segurança.');
} });`;

// Os handlers importam o cliente Neon, só instalado no deploy; nos testes a autenticação
// tem de responder antes de qualquer acesso à base de dados.
async function loadHandlerWithoutNeon(file, securityTablesOnly = false) {
    const outdir = mkdtempSync(path.join(tmpdir(), 'api-handler-'));
    const outfile = path.join(outdir, 'handler.mjs');
    await build({
        entryPoints: [path.join(import.meta.dirname, '..', 'vercel-api', file)],
        bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent',
        plugins: [{ name: 'neon-stub', setup(builder) {
            builder.onResolve({ filter: /^@neondatabase\/serverless$/ }, () => ({ path: 'neon', namespace: 'neon-stub' }));
            builder.onLoad({ filter: /.*/, namespace: 'neon-stub' }, () => ({
                contents: securityTablesOnly ? SECURITY_ONLY_NEON : 'export const neon = () => { throw new Error("Base de dados não deve ser acedida."); };', loader: 'js'
            }));
        } }]
    });
    const module = await import(pathToFileURL(outfile).href);
    rmSync(outdir, { recursive: true, force: true });
    return module.default;
}

test('pedido de cadastro valida e normaliza os dados antes de chegar à base de dados', async () => {
    const { parseRegistrationRequest } = await import('../vercel-api/_pedidos-cadastro.js');
    const valid = parseRegistrationRequest({
        nif: '500.320.7439', companyName: '  Digital Norte, Lda ', contactName: 'Pedro', phone: '+244 923 000 000', email: '', message: ''
    });
    assert.deepEqual(valid.value, {
        nif: '5003207439', companyName: 'Digital Norte, Lda', contactName: 'Pedro',
        phone: '+244 923 000 000', email: null, message: null
    });
    assert.match(parseRegistrationRequest({ nif: '123', companyName: 'X', contactName: 'Y', phone: '1' }).error, /NIF/);
    assert.match(parseRegistrationRequest({ nif: '5003207439', companyName: 'Empresa', contactName: 'Pedro', phone: 'abc' }).error, /telefone/);
    assert.match(parseRegistrationRequest({ nif: '5003207439', companyName: 'Empresa', contactName: 'Pedro', phone: '923000000', email: 'x' }).error, /email/);
    assert.match(parseRegistrationRequest({ nif: '5003207439', companyName: 'E'.repeat(201), contactName: 'Pedro', phone: '923000000' }).error, /nome da empresa/);
});

test('rotas públicas de estado e cadastro recusam dados inválidos sem tocar na base de dados', async () => {
    const companyStatus = await loadHandlerWithoutNeon('company-status.js');
    const registration = await loadHandlerWithoutNeon('registration-request.js');
    const previous = process.env.DATABASE_URL;
    try {
        delete process.env.DATABASE_URL;
        const unconfigured = response();
        await companyStatus({ method: 'POST', headers: {}, body: { nif: '5003207439' } }, unconfigured);
        assert.equal(unconfigured.statusCode, 503);

        process.env.DATABASE_URL = 'postgres://test';
        const badNif = response();
        await companyStatus({ method: 'POST', headers: {}, body: { nif: '12' } }, badNif);
        assert.equal(badNif.statusCode, 400);
        const badRequest = response();
        await registration({ method: 'POST', headers: {}, body: { nif: '5003207439', companyName: 'Empresa' } }, badRequest);
        assert.equal(badRequest.statusCode, 400);
        const wrongMethod = response();
        await registration({ method: 'GET', headers: {} }, wrongMethod);
        assert.equal(wrongMethod.statusCode, 405);
    } finally {
        if (previous === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previous;
    }
});

test('relatório de utilização só aceita métricas agregadas válidas e exige código da empresa', async () => {
    const { sanitizeUsageReport } = await import('../vercel-api/_uso-empresas.js');
    assert.deepEqual(sanitizeUsageReport({ period: '2026-10', metrics: { creditsCount: 3.4, creditsVolumeMinor: 100, clientName: 'Ana' } }).metrics.creditsCount, 3);
    assert.equal('clientName' in sanitizeUsageReport({ period: '2026-10', metrics: { clientName: 'Ana' } }).metrics, false);
    assert.equal(sanitizeUsageReport({ period: '2026-13', metrics: {} }), null);
    assert.equal(sanitizeUsageReport({ period: '2026-10', metrics: { paymentsCount: -1 } }), null);

    const usage = await loadHandlerWithoutNeon('usage-report.js');
    const previous = process.env.DATABASE_URL;
    try {
        process.env.DATABASE_URL = 'postgres://test';
        const empty = response();
        await usage({ method: 'POST', headers: {}, body: { tenantId: '5003207439', reports: [] } }, empty);
        assert.equal(empty.statusCode, 400);
        const invalid = response();
        await usage({ method: 'POST', headers: {}, body: { tenantId: '5003207439', reports: [{ period: 'x', metrics: {} }] } }, invalid);
        assert.equal(invalid.statusCode, 400);
    } finally {
        if (previous === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previous;
    }
});
// ---- Relatório de pentest externo (7/10/2026): achados A-01, A-04 e A-05 ----

// Base de dados falsa controlada pelo teste: regista as consultas e deixa definir a contagem de pedidos e os bloqueios.
const FAKE_DB_NEON = 'export const neon = () => ({ query: (text, params) => globalThis.__pentestQuery(text, params) });';
async function loadHandlerWithFakeDb(file) {
    const outdir = mkdtempSync(path.join(tmpdir(), 'api-pentest-'));
    const outfile = path.join(outdir, 'handler.mjs');
    await build({
        entryPoints: [path.join(import.meta.dirname, '..', 'vercel-api', file)],
        bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent',
        plugins: [{ name: 'neon-fake', setup(builder) {
            builder.onResolve({ filter: /^@neondatabase\/serverless$/ }, () => ({ path: 'neon', namespace: 'neon-fake' }));
            builder.onLoad({ filter: /.*/, namespace: 'neon-fake' }, () => ({ contents: FAKE_DB_NEON, loader: 'js' }));
        } }]
    });
    const module = await import(pathToFileURL(outfile).href);
    rmSync(outdir, { recursive: true, force: true });
    return module.default;
}
const fakeDb = ({ requestCount = 1, lockedSeconds = 0 } = {}) => {
    const queries = [];
    globalThis.__pentestQuery = async (text) => {
        queries.push(text);
        if (/^\s*(CREATE|ALTER)/i.test(text)) return [];
        if (/api_rate_limits/.test(text)) return [{ request_count: requestCount, reset_epoch: Math.floor(Date.now() / 1000) + 60 }];
        if (/FROM security_lockouts WHERE key_hash = ANY/.test(text)) return lockedSeconds ? [{ remaining: lockedSeconds }] : [];
        if (/security_lockouts|security_events/.test(text)) return [];
        throw new Error('Consulta inesperada no teste de pentest.');
    };
    return queries;
};
const withEnv = async (vars, run) => {
    const previous = Object.fromEntries(Object.keys(vars).map(key => [key, process.env[key]]));
    Object.assign(process.env, vars);
    try { return await run(); } finally {
        for (const [key, value] of Object.entries(previous)) if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
};

test('A-01/A-04: chave mestra errada recebe mensagem genérica, conta para o limite de 10/min e regista a falha', async () => {
    const tenants = await loadHandlerWithFakeDb('tenants.js');
    await withEnv({ DATABASE_URL: 'postgres://test', TANGO_MASTER_SECRET: 'segredo-real' }, async () => {
        const queries = fakeDb();
        const res = response();
        await tenants({ method: 'POST', headers: { 'x-forwarded-for': '198.51.100.7', authorization: 'Bearer tentativa' }, body: { action: 'list' }, socket: {} }, res);
        assert.equal(res.statusCode, 401);
        assert.equal(res.body.message, 'Chave de autenticação inválida.');
        assert.doesNotMatch(JSON.stringify(res.body), /TANGO_|MASTER_SECRET|\.env|Vercel/i);
        assert.equal(res.headers['RateLimit-Limit'], '10', 'o 401 também traz o limite de pedidos');
        assert.ok(queries.some(text => /INSERT INTO security_lockouts/.test(text)), 'a falha conta para o bloqueio do IP');
    });
});

test('A-04: acima do limite ou com o IP bloqueado, a chave nem chega a ser comparada', async () => {
    const tenants = await loadHandlerWithFakeDb('tenants.js');
    await withEnv({ DATABASE_URL: 'postgres://test', TANGO_MASTER_SECRET: 'segredo-real' }, async () => {
        const request = { method: 'POST', headers: { 'x-forwarded-for': '198.51.100.8' }, body: { action: 'verify', masterSecret: 'segredo-real' }, socket: {} };
        fakeDb({ requestCount: 11 });
        const limited = response();
        await tenants(request, limited);
        assert.equal(limited.statusCode, 429);

        const queries = fakeDb({ lockedSeconds: 3000 });
        const locked = response();
        await tenants(request, locked);
        assert.equal(locked.statusCode, 429, 'mesmo a chave certa é recusada durante o bloqueio');
        assert.ok(!queries.some(text => /INSERT INTO security_lockouts/.test(text)));
    });
});

test('A-05: verify-company aplica o limite (10/min por IP) a todas as respostas, incluindo pedidos inválidos', async () => {
    const verify = await loadHandlerWithFakeDb('verify-company.js');
    await withEnv({ DATABASE_URL: 'postgres://test' }, async () => {
        fakeDb();
        const invalid = response();
        await verify({ method: 'POST', headers: { 'x-forwarded-for': '198.51.100.9' }, body: {}, socket: {} }, invalid);
        assert.equal(invalid.statusCode, 400);
        assert.equal(invalid.headers['RateLimit-Limit'], '10');

        fakeDb({ requestCount: 11 });
        const limited = response();
        await verify({ method: 'POST', headers: { 'x-forwarded-for': '198.51.100.9' }, body: { nif: '5003207439', code: 'TG-ABCD-EFGH' }, socket: {} }, limited);
        assert.equal(limited.statusCode, 429);
        assert.ok(Number(limited.headers['Retry-After']) > 0);
    });
});
