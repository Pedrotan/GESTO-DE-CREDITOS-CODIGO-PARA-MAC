import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPaymentPlan, paymentProgress, planFromStoredInstallments, planOptionsFromTiers, withPaidCount } from '../src/bibliotecas/plano-pagamento.ts';

test('com as prestações gravadas, marca pagas, parciais, em atraso e por pagar à medida que o cliente paga', () => {
    const row = (n: number, due: string, paid: number, paidAt: string | null = null) => ({
        installmentNumber: n, dueDate: due, principalMinor: 40_000, interestMinor: 10_000,
        paidPrincipalMinor: Math.min(paid, 40_000), paidInterestMinor: Math.max(0, paid - 40_000), paidAt,
    });
    const plan = planFromStoredInstallments([
        row(1, '2026-08-03', 50_000, '2026-08-02T10:00:00Z'),
        row(2, '2026-09-03', 20_000),
        row(3, '2026-11-03', 10_000),
        row(4, '2026-12-03', 0),
    ], 25, new Date('2026-10-03T12:00:00Z'));
    assert.deepEqual(plan.installments.map(item => item.status), ['paid', 'overdue', 'partial', 'pending']);
    assert.equal(plan.installments[0].paidAt, '2026-08-02T10:00:00Z');
    const progress = paymentProgress(plan);
    assert.deepEqual({ paid: progress.paidCount, overdue: progress.overdueCount, partial: progress.partialCount }, { paid: 1, overdue: 1, partial: 1 });
    assert.equal(progress.paidMinor, 80_000);
    assert.equal(progress.remainingMinor, 120_000);
    assert.equal(progress.percent, 40);
    assert.equal(progress.nextDue?.number, 2);
});

test('créditos antigos sem prestações gravadas usam o número de prestações pagas', () => {
    const plan = withPaidCount(buildPaymentPlan({ principalMinor: 30_000, ratePercent: 0, months: 3, startDate: '2026-09-01T00:00:00Z' }), 1, new Date('2026-10-15T00:00:00Z'));
    assert.deepEqual(plan.installments.map(item => item.status), ['paid', 'pending', 'pending']);
    assert.equal(paymentProgress(plan).paidCount, 1);
});
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
