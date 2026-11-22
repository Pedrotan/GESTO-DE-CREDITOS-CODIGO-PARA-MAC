import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultPolicy, EMPTY_USAGE, evaluateOperation } from '../src/bibliotecas/alcadas.ts';

const usage = { scope: EMPTY_USAGE, company: EMPTY_USAGE };
const perdao = (role: string, extra: Record<string, unknown> = {}) => evaluateOperation({
    policy: defaultPolicy(), actor: { id: `u-${role}`, name: role, role, ...extra }, operationType: 'interest_waiver',
    amountMinor: 3_000_000_00, percent: 100, usage,
});

test('Super Administrador, o principal e o Gestor de Crédito perdoam 100% da mora sem limite', () => {
    assert.equal(perdao('super_admin').decision, 'allow');
    assert.equal(perdao('manager').decision, 'allow');
    assert.equal(perdao('admin', { isOwner: true }).decision, 'allow');
});

test('os outros perfis continuam limitados pela alçada do perdão', () => {
    const r = perdao('collection_officer');
    assert.equal(r.decision, 'block');
    assert.ok(r.reasons.some(m => /acima do máximo de 5%/u.test(m)));
    assert.equal(perdao('credit_director').decision, 'block');
});
