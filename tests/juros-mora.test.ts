import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateLateInterest, projectLateInterest, type MoraInstallment } from '../src/bibliotecas/juros-mora.ts';

// Prestação de 100 000,00 (10 000 000 cêntimos) que vence a 26/10/2026; mora de 1% ao dia.
const installment: MoraInstallment = { id: 'p1', number: 1, dueDate: '2026-10-26', principalMinor: 8_000_000, interestMinor: 2_000_000 };
const rate = 1;

test('no dia do vencimento não há mora; começa no dia seguinte', () => {
    assert.equal(calculateLateInterest({ installments: [installment], payments: [], dailyRatePercent: rate, asOf: '2026-10-26' }).owedMinor, 0);
    const day27 = calculateLateInterest({ installments: [installment], payments: [], dailyRatePercent: rate, asOf: '2026-10-27' });
    assert.equal(day27.owedMinor, 100_000); // 1 dia x 1% x 100 000,00 = 1 000,00
    assert.equal(day27.installments[0].daysLate, 1);
    assert.equal(day27.dailyMinor, 100_000);
});

test('a mora conta até ao dia do pagamento e depois pára', () => {
    const paidOn30 = { date: '2026-10-30', principalMinor: 8_000_000, interestMinor: 2_000_000 };
    const summary = calculateLateInterest({ installments: [installment], payments: [paidOn30], dailyRatePercent: rate, asOf: '2026-11-15' });
    assert.equal(summary.installments[0].daysLate, 4); // 27, 28, 29 e 30
    assert.equal(summary.accruedMinor, 400_000);
    assert.equal(summary.installments[0].outstandingMinor, 0);
    assert.equal(summary.dailyMinor, 0);
    // A mora já paga é registada à parte e abate à mora em dívida.
    const withLatePaid = calculateLateInterest({ installments: [installment], payments: [{ ...paidOn30, lateMinor: 400_000 }], dailyRatePercent: rate, asOf: '2026-11-15' });
    assert.equal(withLatePaid.owedMinor, 0);
    assert.equal(withLatePaid.paidLateMinor, 400_000);
});

test('pagamentos parciais reduzem a base da mora a partir do dia em que entram', () => {
    const partial = { date: '2026-10-28', principalMinor: 5_000_000, interestMinor: 0 };
    const summary = calculateLateInterest({ installments: [installment], payments: [partial], dailyRatePercent: rate, asOf: '2026-10-31' });
    // 27 e 28 sobre 100 000,00 (2 000,00); 29, 30 e 31 sobre 50 000,00 (1 500,00).
    assert.equal(summary.accruedMinor, 350_000);
    assert.equal(summary.installments[0].outstandingMinor, 5_000_000);
});

test('os pagamentos liquidam primeiro a prestação mais antiga; as não vencidas não têm mora', () => {
    const second: MoraInstallment = { id: 'p2', number: 2, dueDate: '2026-11-26', principalMinor: 8_000_000, interestMinor: 2_000_000 };
    const summary = calculateLateInterest({
        installments: [second, installment], payments: [{ date: '2026-11-01', principalMinor: 8_000_000, interestMinor: 2_000_000 }],
        dailyRatePercent: rate, asOf: '2026-11-10',
    });
    assert.equal(summary.installments[0].id, 'p1');
    assert.equal(summary.installments[0].accruedMinor, 600_000); // 27/10 a 01/11: 6 dias
    assert.equal(summary.installments[1].accruedMinor, 0);
    assert.equal(summary.overdueMinor, 0);
});

test('a projecção soma a mora futura, incluindo prestações que vão vencer', () => {
    const second: MoraInstallment = { id: 'p2', number: 2, dueDate: '2026-11-05', principalMinor: 10_000_000, interestMinor: 0 };
    const summary = calculateLateInterest({ installments: [installment, second], payments: [], dailyRatePercent: rate, asOf: '2026-11-01' });
    assert.equal(summary.owedMinor, 600_000);
    const projection = projectLateInterest(summary, 10); // até 11/11
    assert.equal(projection.installments[0].additionalMinor, 1_000_000); // 10 dias
    assert.equal(projection.installments[1].additionalMinor, 600_000); // 06/11 a 11/11: 6 dias
    assert.equal(projection.projectedOwedMinor, 600_000 + 1_600_000);
    assert.equal(calculateLateInterest({ installments: [installment], payments: [], dailyRatePercent: 0, asOf: '2026-12-01' }).owedMinor, 0);
});
