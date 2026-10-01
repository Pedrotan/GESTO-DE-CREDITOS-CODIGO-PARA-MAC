import assert from 'node:assert/strict';
import test from 'node:test';
import { planearAjusteEncargos } from '../src/bibliotecas/ajuste-encargos.ts';
import { buildChargeAdjustmentEntry } from '../src/bibliotecas/ledger-financeiro.ts';

const prestacoes = () => [
    { id: 'paid', status: 'paid', interestMinor: 100, lateInterestMinor: 0,
        paidInterestMinor: 100, paidLateInterestMinor: 0, version: 1 },
    { id: 'open', status: 'partial', interestMinor: 300, lateInterestMinor: 200,
        paidInterestMinor: 100, paidLateInterestMinor: 0, version: 2 }
];

test('ajuste conserva prestações liquidadas e não desconta encargos já pagos', () => {
    const result = planearAjusteEncargos(prestacoes(), -150, 50);
    assert.equal(result.length, 1);
    assert.equal(result[0].id, 'open');
    assert.equal(result[0].interestMinor, 150);
    assert.equal(result[0].lateInterestMinor, 250);
    assert.throws(() => planearAjusteEncargos(prestacoes(), -201, 0), /excede/);
});

test('ajuste de encargos cria lançamento encadeado e equilibrado', async () => {
    const entry = await buildChargeAdjustmentEntry({
        id: 'charge-adjustment:case-1:interest', creditId: 'credit-1', component: 'interest',
        deltaMinor: -150, processedBy: 'Operador', justification: 'Correção fundamentada'
    }, '0'.repeat(64), new Date('2026-09-23T10:00:00.000Z'));
    assert.equal(entry.debit, 'revenue_interest');
    assert.equal(entry.credit, 'receivable_interest');
    assert.equal(entry.amountTotalMinor, 150);
    assert.match(entry.integrityHash, /^[0-9a-f]{64}$/u);
});
