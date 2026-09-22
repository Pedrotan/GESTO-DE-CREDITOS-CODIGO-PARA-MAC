import assert from 'node:assert/strict';
import test from 'node:test';
import { applyCors, enforceRateLimit, requireSecret, safeEqual } from '../vercel-api/_security.js';

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
