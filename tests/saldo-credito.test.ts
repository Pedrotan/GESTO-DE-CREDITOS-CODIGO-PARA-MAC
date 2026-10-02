import test from 'node:test';
import assert from 'node:assert/strict';
import {
    allocatePaymentMinor, applyPaymentToBalances, creditBalancesFromRow, revertPaymentFromBalances,
    type CreditBalancesMinor
} from '../src/bibliotecas/saldo-credito.ts';

const balances = (overrides: Partial<CreditBalancesMinor> = {}): CreditBalancesMinor => ({
    principalMinor: 100_000, balanceMinor: 100_000, interestMinor: 20_000, lateInterestMinor: 5_000,
    status: 'active', version: 3, ...overrides
});

test('saldos usam colunas Minor e só recorrem às colunas REAL em bases antigas', () => {
    const current = creditBalancesFromRow({
        principalAmount: 999, principalAmountMinor: 100_000, currentBalance: 0.1 + 0.2, currentBalanceMinor: 30,
        accruedInterest: 12.345, accruedInterestMinor: null, lateInterest: 0, status: 'overdue', version: 7
    });
    assert.deepEqual(current, {
        principalMinor: 100_000, balanceMinor: 30, interestMinor: 1235, lateInterestMinor: 0,
        status: 'overdue', version: 7
    });
});

test('pagamento livre liquida mora, depois juro e só então capital', () => {
    assert.deepEqual(allocatePaymentMinor(balances(), 30_000),
        { lateInterestMinor: 5_000, interestMinor: 20_000, principalMinor: 5_000 });
    assert.deepEqual(allocatePaymentMinor(balances(), 3_000),
        { lateInterestMinor: 3_000, interestMinor: 0, principalMinor: 0 });
});

test('alocação usa o juro em dívida persistido sem descontar pagamentos anteriores outra vez', () => {
    // Após pagar 10.000 de juro, o crédito guarda 10.000 em dívida; o próximo pagamento deve vê-los.
    const afterFirst = balances({ interestMinor: 10_000, lateInterestMinor: 0 });
    assert.deepEqual(allocatePaymentMinor(afterFirst, 10_000),
        { lateInterestMinor: 0, interestMinor: 10_000, principalMinor: 0 });
});

test('pagamento acima do total em dívida é recusado em vez de ficar por alocar', () => {
    assert.throws(() => allocatePaymentMinor(balances(), 125_001), /excede o total em dívida/);
    assert.throws(() => allocatePaymentMinor(balances(), 0), /maior que zero/);
});

test('liquidação total marca o crédito como pago e a reversão repõe saldos e estado', () => {
    const current = balances();
    const allocation = allocatePaymentMinor(current, 125_000);
    const paid = applyPaymentToBalances(current, allocation);
    assert.deepEqual(paid, { balanceMinor: 0, interestMinor: 0, lateInterestMinor: 0, totalDueMinor: 0, status: 'paid' });
    const reverted = revertPaymentFromBalances({ ...current, balanceMinor: 0, interestMinor: 0, lateInterestMinor: 0, status: 'paid' }, allocation);
    assert.deepEqual(reverted, { balanceMinor: 100_000, interestMinor: 20_000, lateInterestMinor: 5_000, totalDueMinor: 125_000, status: 'active' });
});

test('alocação que excede um componente em dívida é recusada', () => {
    assert.throws(() => applyPaymentToBalances(balances({ interestMinor: 100 }),
        { principalMinor: 0, interestMinor: 101, lateInterestMinor: 0 }), /excede o saldo/);
    assert.throws(() => applyPaymentToBalances(balances(),
        { principalMinor: -1, interestMinor: 0, lateInterestMinor: 0 }), /inválido/);
});
