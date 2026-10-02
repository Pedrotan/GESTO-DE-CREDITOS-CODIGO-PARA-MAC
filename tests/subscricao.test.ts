import test from 'node:test';
import assert from 'node:assert/strict';
import { extendSubscription, parsePaidAmount, subscriptionState } from '../src/bibliotecas/subscricao.ts';

const now = new Date('2026-10-02T12:00:00Z');

test('estado da subscrição distingue vitalícia, ativa, a expirar e expirada', () => {
    assert.deepEqual(subscriptionState(null, now), { kind: 'lifetime' });
    assert.deepEqual(subscriptionState('2026-12-31T23:59:59Z', now), { kind: 'active', daysLeft: 91 });
    assert.deepEqual(subscriptionState('2026-10-16T12:00:00Z', now), { kind: 'expiring', daysLeft: 14 });
    assert.deepEqual(subscriptionState('2026-10-02T13:00:00Z', now), { kind: 'expiring', daysLeft: 1 });
    assert.deepEqual(subscriptionState('2026-09-29T12:00:00Z', now), { kind: 'expired', daysAgo: 3 });
});

test('renovação soma à validade em vigor e começa hoje quando já expirou', () => {
    assert.equal(extendSubscription('2026-10-20T00:00:00.000Z', '1m', now), '2026-11-20T00:00:00.000Z');
    assert.equal(extendSubscription('2026-09-01T00:00:00.000Z', '1y', now), '2027-10-02T12:00:00.000Z');
    assert.equal(extendSubscription(null, '3m', now), '2027-01-02T12:00:00.000Z');
    assert.equal(extendSubscription('2026-12-01T00:00:00.000Z', 'lifetime', now), null);
});

test('valor pago aceita formatos angolanos e recusa texto inválido', () => {
    assert.equal(parsePaidAmount('15000'), 15000);
    assert.equal(parsePaidAmount('15 000,50'), 15000.5);
    assert.equal(parsePaidAmount('15.000,50 Kz'), 15000.5);
    assert.equal(parsePaidAmount('0'), 0);
    assert.equal(parsePaidAmount(''), null);
    assert.equal(parsePaidAmount('-5'), null);
    assert.equal(parsePaidAmount('abc'), null);
});
