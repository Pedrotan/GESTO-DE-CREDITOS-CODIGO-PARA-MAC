import assert from 'node:assert/strict';
import test from 'node:test';
import { buildInstallmentSchedule } from '../src/bibliotecas/cronograma-prestacoes.ts';

for (const method of ['PRICE', 'SAC', 'FLAT'] as const) {
    test(`cronograma ${method} preserva o capital e usa inteiros`, () => {
        const schedule = buildInstallmentSchedule({
            principalMinor: 1_000_001,
            installments: 12,
            startDate: '2026-01-31T00:00:00.000Z',
            method,
            annualRatePercent: 24,
            flatInterestMinor: 120_000
        });
        assert.equal(schedule.length, 12);
        assert.equal(schedule.reduce((sum, item) => sum + item.principalMinor, 0), 1_000_001);
        assert.equal(schedule.every(item => Number.isSafeInteger(item.totalMinor) && item.totalMinor >= 0), true);
        assert.equal(schedule[0].dueDate, '2026-02-28T00:00:00.000Z');
    });
}

test('cronograma recusa montantes e prazos inválidos', () => {
    assert.throws(() => buildInstallmentSchedule({ principalMinor: 1.5, installments: 2, startDate: new Date(), method: 'SAC' }), /inteiro/);
    assert.throws(() => buildInstallmentSchedule({ principalMinor: 100, installments: 0, startDate: new Date(), method: 'PRICE' }), /prestações/);
});

test('cronograma com as datas da simulação (dia escolhido e dias úteis) e recusa de datas fora de ordem', () => {
    const dueDates = ['2027-01-28T00:00:00.000Z', '2027-03-01T00:00:00.000Z', '2027-03-29T00:00:00.000Z'];
    const schedule = buildInstallmentSchedule({ principalMinor: 300_000, installments: 3, startDate: '2026-10-15T11:00:00.000Z', method: 'FLAT', flatInterestMinor: 300_000, dueDates });
    assert.deepEqual(schedule.map(item => item.dueDate), dueDates);
    assert.throws(() => buildInstallmentSchedule({ principalMinor: 300_000, installments: 3, startDate: '2026-10-15T11:00:00.000Z', method: 'FLAT', dueDates: dueDates.slice(0, 2) }), /datas de vencimento/);
    assert.throws(() => buildInstallmentSchedule({ principalMinor: 300_000, installments: 3, startDate: '2027-02-01T11:00:00.000Z', method: 'FLAT', dueDates }), /datas de vencimento/);
});
