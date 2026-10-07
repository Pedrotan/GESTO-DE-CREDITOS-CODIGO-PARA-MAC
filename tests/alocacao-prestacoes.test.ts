import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allocatePaymentByInstallments, type CreditBalancesMinor } from '../src/bibliotecas/saldo-credito.ts';

// Crédito de 100 000 a 20% em 2 prestações de 60 000 (50 000 capital + 10 000 juro); 18 000 de mora na 1.ª.
const schedule = [
    { dueDate: '2026-09-05', installmentNumber: 1, principalMinor: 5_000_000, interestMinor: 1_000_000, lateInterestMinor: 1_800_000, paidPrincipalMinor: 0, paidInterestMinor: 0, paidLateInterestMinor: 0 },
    { dueDate: '2026-10-05', installmentNumber: 2, principalMinor: 5_000_000, interestMinor: 1_000_000, lateInterestMinor: 0, paidPrincipalMinor: 0, paidInterestMinor: 0, paidLateInterestMinor: 0 },
];
const current: CreditBalancesMinor = { principalMinor: 10_000_000, balanceMinor: 10_000_000, interestMinor: 2_000_000, lateInterestMinor: 1_800_000, status: 'active', version: 1 };

test('pagar a prestação vencida e a sua mora liquida essa prestação por inteiro', () => {
    const allocation = allocatePaymentByInstallments(schedule, current, 7_800_000);
    assert.deepEqual(allocation, { lateInterestMinor: 1_800_000, interestMinor: 1_000_000, principalMinor: 5_000_000 });
});

test('um pagamento parcial vai à mora, depois ao juro e depois ao capital da prestação mais antiga', () => {
    assert.deepEqual(allocatePaymentByInstallments(schedule, current, 2_000_000), { lateInterestMinor: 1_800_000, interestMinor: 200_000, principalMinor: 0 });
    assert.deepEqual(allocatePaymentByInstallments([...schedule].reverse(), current, 8_000_000),
        { lateInterestMinor: 1_800_000, interestMinor: 1_200_000, principalMinor: 5_000_000 });
});

test('liquidar tudo e recusar valores acima do total em dívida', () => {
    assert.deepEqual(allocatePaymentByInstallments(schedule, current, 13_800_000), { lateInterestMinor: 1_800_000, interestMinor: 2_000_000, principalMinor: 10_000_000 });
    assert.throws(() => allocatePaymentByInstallments(schedule, current, 13_800_001), /excede o total em dívida/);
});
