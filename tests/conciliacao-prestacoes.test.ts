import assert from 'node:assert/strict';
import test from 'node:test';
import { reconcileInstallments } from '../src/bibliotecas/conciliacao-prestacoes.ts';

const schedule = [1, 2, 3].map(number => ({
    id: `i${number}`,
    dueDate: `2026-0${number}-28T00:00:00.000Z`,
    principalMinor: 10_000,
    interestMinor: 1_000,
    lateInterestMinor: 0,
    version: 0
}));

test('conciliação liquida prestações por ordem de vencimento e deriva o contador', () => {
        const result = reconcileInstallments(schedule, {
            principalMinor: 20_000,
            interestMinor: 2_000,
            lateInterestMinor: 0
        }, '2026-01-15T00:00:00.000Z');
        assert.equal(result.paidInstallments, 2);
        assert.deepEqual(result.installments.map(item => item.status), ['paid', 'paid', 'pending']);
});

test('conciliação distingue prestações parciais e vencidas', () => {
        const result = reconcileInstallments(schedule, {
            principalMinor: 5_000,
            interestMinor: 0,
            lateInterestMinor: 0
        }, '2026-03-15T00:00:00.000Z');
        assert.deepEqual(result.installments.map(item => item.status), ['partial', 'overdue', 'pending']);
        assert.equal(result.paidInstallments, 0);
});
