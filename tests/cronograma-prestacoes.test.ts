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
