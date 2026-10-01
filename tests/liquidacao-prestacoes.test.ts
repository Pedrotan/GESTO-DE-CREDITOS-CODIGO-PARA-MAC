import test from 'node:test';
import assert from 'node:assert/strict';
import { planConsecutiveInstallments, type InstallmentBalance } from '../src/bibliotecas/liquidacao-prestacoes.ts';
import { reconcileInstallments } from '../src/bibliotecas/conciliacao-prestacoes.ts';

const row = (number: number, principalMinor: number, interestMinor: number,
    paidPrincipalMinor = 0, paidInterestMinor = 0): InstallmentBalance => ({
    id: `i${number}`, installmentNumber: number, dueDate: `2026-0${number}-31`,
    principalMinor, interestMinor, lateInterestMinor: 0, paidPrincipalMinor,
    paidInterestMinor, paidLateInterestMinor: 0,
    status: paidPrincipalMinor === principalMinor && paidInterestMinor === interestMinor ? 'paid' : 'pending',
    paidAt: null, version: 0
});

test('liquidação escolhe as prestações mais antigas e respeita pagamento parcial', () => {
    const schedule = [row(3, 1000, 100), row(1, 1000, 100, 500), row(2, 1000, 100)];
    const plan = planConsecutiveInstallments(schedule, 2);
    assert.deepEqual(plan.selected.map(item => item.installmentNumber), [1, 2]);
    assert.equal(plan.principalMinor, 1500);
    assert.equal(plan.interestMinor, 200);
    assert.equal(plan.amountMinor, 1700);
    const reconciled = reconcileInstallments(schedule, {
        principalMinor: 500 + plan.principalMinor,
        interestMinor: plan.interestMinor,
        lateInterestMinor: 0
    }, '2026-01-01');
    assert.deepEqual(reconciled.installments.map(item => item.status), ['paid', 'paid', 'pending']);
});

test('não permite contar além das parcelas abertas nem pagar crédito liquidado', () => {
    const schedule = [row(1, 1000, 100, 1000, 100), row(2, 1000, 100)];
    assert.deepEqual(planConsecutiveInstallments(schedule, 1).selected.map(item => item.id), ['i2']);
    assert.throws(() => planConsecutiveInstallments(schedule, 2), /excede/);
    assert.throws(() => planConsecutiveInstallments([row(1, 1000, 100, 1000, 100)], 1), /liquidado/);
    assert.throws(() => planConsecutiveInstallments(schedule, 0), /quantidade válida/);
});
