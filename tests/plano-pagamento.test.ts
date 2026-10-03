import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPaymentPlan, planOptionsFromTiers } from '../src/bibliotecas/plano-pagamento.ts';
import { DEFAULT_INTEREST_TIERS } from '../src/bibliotecas/taxas-juro.ts';

test('100 000 Kz a 50% em 2 meses: 150 000 Kz em 2 prestações de 75 000 Kz', () => {
    const plan = buildPaymentPlan({ principalMinor: 10_000_000, ratePercent: 50, months: 2, startDate: '2026-10-03T00:00:00Z' });
    assert.equal(plan.interestMinor, 5_000_000);
    assert.equal(plan.totalMinor, 15_000_000);
    assert.equal(plan.installmentMinor, 7_500_000);
    assert.deepEqual(plan.installments.map(item => item.dueDate.slice(0, 10)), ['2026-11-03', '2026-12-03']);
    assert.deepEqual(plan.installments.map(item => item.balanceAfterMinor), [7_500_000, 0]);
});

test('divisões inexactas fecham ao cêntimo e o saldo termina em zero', () => {
    const plan = buildPaymentPlan({ principalMinor: 10_000_001, ratePercent: 35, months: 3, startDate: '2026-01-31T00:00:00Z' });
    const sum = plan.installments.reduce((total, item) => total + item.totalMinor, 0);
    assert.equal(sum, plan.totalMinor);
    assert.equal(plan.installments.at(-1)?.balanceAfterMinor, 0);
    assert.equal(plan.installments[0].dueDate.slice(0, 10), '2026-02-28', 'fim de mês ajusta ao último dia');
});

test('as opções seguem a tabela de taxas e os valores inválidos são recusados', () => {
    const options = planOptionsFromTiers(5_000_000, DEFAULT_INTEREST_TIERS, '2026-10-03T00:00:00Z');
    assert.deepEqual(options.map(option => [option.plan.months, option.plan.ratePercent]), [[1, 35], [2, 50], [3, 60], [5, 70], [8, 80], [10, 100]]);
    assert.throws(() => buildPaymentPlan({ principalMinor: 0, ratePercent: 10, months: 1, startDate: new Date() }), /valor concedido/);
    assert.throws(() => buildPaymentPlan({ principalMinor: 100, ratePercent: 10, months: 0, startDate: new Date() }), /prazo/);
});
