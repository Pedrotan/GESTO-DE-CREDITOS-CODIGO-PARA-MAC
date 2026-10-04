import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isLastDayOfMonth, monthClosureState, monthIdOf } from '../src/bibliotecas/fecho-mes.ts';

test('reconhece o último dia de cada mês, incluindo fevereiro e anos bissextos', () => {
    assert.equal(isLastDayOfMonth(new Date(2026, 9, 31)), true);
    assert.equal(isLastDayOfMonth(new Date(2026, 9, 30)), false);
    assert.equal(isLastDayOfMonth(new Date(2026, 1, 28)), true);
    assert.equal(isLastDayOfMonth(new Date(2028, 1, 28)), false);
    assert.equal(isLastDayOfMonth(new Date(2028, 1, 29)), true);
});

test('no último dia lembra o fecho do próprio mês; fechado, não lembra', () => {
    assert.deepEqual(monthClosureState(new Date(2026, 9, 31, 15), [], '2026-10'), { kind: 'due-today', monthId: '2026-10' });
    assert.deepEqual(monthClosureState(new Date(2026, 9, 31, 15), ['2026-10'], '2026-10'), { kind: 'none' });
    assert.deepEqual(monthClosureState(new Date(2026, 9, 15), [], '2026-10'), { kind: 'none' });
});

test('depois de o mês acabar sem fecho, o fecho fica obrigatório a partir do mais antigo', () => {
    assert.deepEqual(monthClosureState(new Date(2026, 11, 3), ['2026-11'], '2026-10'),
        { kind: 'overdue', monthId: '2026-10', pendingMonthIds: ['2026-10'] });
    assert.deepEqual(monthClosureState(new Date(2027, 0, 2), [], '2026-11'),
        { kind: 'overdue', monthId: '2026-11', pendingMonthIds: ['2026-11', '2026-12'] });
    // Meses anteriores à activação da regra não são exigidos.
    assert.deepEqual(monthClosureState(new Date(2026, 10, 2), [], '2026-11'), { kind: 'none' });
    assert.equal(monthIdOf(new Date(2026, 0, 5)), '2026-01');
});
