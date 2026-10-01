import assert from 'node:assert/strict';
import test from 'node:test';
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
