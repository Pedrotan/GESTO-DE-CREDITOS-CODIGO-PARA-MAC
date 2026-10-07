import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultPeriod, isInPeriod, periodRange } from '../src/bibliotecas/periodos.ts';

const base = defaultPeriod(new Date(2026, 9, 4)); // domingo, 4 de outubro de 2026

test('mês, semestre e ano cobrem os dias certos', () => {
    const month = periodRange(base);
    assert.equal(month.label, 'Outubro de 2026');
    assert.equal(isInPeriod(new Date(2026, 9, 31, 23, 59), month), true);
    assert.equal(isInPeriod(new Date(2026, 10, 1), month), false);
    const semester = periodRange({ ...base, kind: 'semester', semester: 2 });
    assert.equal(semester.label, '2.º semestre de 2026');
    assert.equal(isInPeriod(new Date(2026, 6, 1), semester), true);
    assert.equal(isInPeriod(new Date(2026, 5, 30), semester), false);
    assert.equal(isInPeriod(new Date(2026, 11, 31, 12), periodRange({ ...base, kind: 'year' })), true);
});

test('a semana vai de segunda a domingo; o dia e o intervalo incluem o último dia inteiro', () => {
    const week = periodRange({ ...base, kind: 'week' });
    assert.equal(week.label, 'Semana de 28/09/2026 a 04/10/2026');
    assert.equal(isInPeriod(new Date(2026, 8, 28, 0, 0), week), true);
    assert.equal(isInPeriod(new Date(2026, 9, 5), week), false);
    assert.equal(isInPeriod(new Date(2026, 9, 4, 22), periodRange({ ...base, kind: 'day' })), true);
    const custom = periodRange({ ...base, kind: 'custom', start: '2026-10-15', end: '2026-10-01' });
    assert.equal(custom.label, '01/10/2026 a 15/10/2026');
    assert.equal(isInPeriod('2026-10-15T20:00:00', custom), true);
    assert.equal(isInPeriod(new Date(2020, 0, 1), periodRange({ ...base, kind: 'all' })), true);
});
