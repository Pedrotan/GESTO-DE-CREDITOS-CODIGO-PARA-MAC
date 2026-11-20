import test from 'node:test';
import assert from 'node:assert/strict';
import { integrityPlan, normalizeIntegrity } from '../vercel-api/_integridade-sync.js';

const B = 16;
const digest = (counts, ids = counts.map(n => `i${n}`), content = counts.map(n => `c${n}`)) =>
    ({ count: counts.reduce((a, b) => a + b, 0), buckets: counts.map((count, i) => ({ count, ids: `${ids[i]}`.replace(/[^0-9a-f]/g, '') || '0', content: `${content[i]}`.replace(/[^0-9a-f]/g, '') || '0' })) });
const base = Array.from({ length: B }, () => 3);
const now = Date.parse('2026-10-27T12:00:00Z');
const at = new Date(now - 60_000).toISOString();

test('plano: o dispositivo com registos em falta pede o grupo a quem tem mais registos nele', () => {
    const falta = [...base]; falta[5] = 2;
    const devices = [
        { deviceId: 'pc-luanda', platform: 'desktop', integrity: { at, tables: { clients: digest(base) } } },
        { deviceId: 'web-osvaldo', platform: 'web', integrity: { at, tables: { clients: digest(falta, falta.map((n, i) => (i === 5 ? 'aa' : `${n}`))) } } },
        { deviceId: 'pc-antigo', platform: 'desktop', integrity: { at: new Date(now - 3 * 60 * 60_000).toISOString(), tables: { clients: digest([]) } } },
    ];
    const plan = integrityPlan(devices, 'web-osvaldo', now);
    assert.equal(plan.compared, 1, 'o resumo com 3 h já não conta');
    assert.deepEqual(plan.missing, [{ table: 'clients', buckets: [5] }]);
    assert.deepEqual(plan.requests, [{ sourceDeviceId: 'pc-luanda', table: 'clients', bucket: 5 }]);
    const reference = integrityPlan(devices, 'pc-luanda', now);
    assert.deepEqual(reference.missing, [{ table: 'clients', buckets: [5] }], 'a diferença também aparece do outro lado');
    assert.deepEqual(reference.requests, [], 'mas não pede a quem tem menos registos');
});

test('plano: conteúdo diferente com os mesmos IDs só é contado; resumo inválido é recusado', () => {
    const devices = [
        { deviceId: 'a', platform: 'desktop', integrity: { at, tables: { credits: digest(base) } } },
        { deviceId: 'b', platform: 'web', integrity: { at, tables: { credits: digest(base, undefined, base.map((n, i) => (i === 2 ? 'ff' : `${n}`))) } } },
    ];
    const plan = integrityPlan(devices, 'b', now);
    assert.deepEqual(plan.missing, []);
    assert.deepEqual(plan.content, ['credits']);
    assert.deepEqual(plan.requests, []);
    assert.equal(normalizeIntegrity({ at, tables: { 'DROP TABLE': digest(base), clients: { buckets: [1, 2] } } }).tables.clients, undefined);
    assert.deepEqual(Object.keys(normalizeIntegrity({ at, tables: { 'x;--': digest(base), credits: digest(base) } }).tables), ['credits']);
});
