import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDisbursementAccountingEntry, buildPaymentAccountingEntry, buildPaymentCorrectionEntry, toMinorUnits } from '../src/bibliotecas/ledger-financeiro.ts';

const payment = {
    id: 'payment-1', creditId: 'credit-1', clientId: 'client-1', clientName: 'Cliente',
    amount: 120.25, allocatedToPrincipal: 100, allocatedToInterest: 15.25,
    allocatedToLateInterest: 5, processedBy: 'user-1', usuario_id: 'tenant-1'
};

test('lançamento de pagamento fecha em unidades mínimas e produz hash determinístico', async () => {
    const timestamp = new Date('2026-09-22T10:00:00.000Z');
    const previousHash = 'a'.repeat(64);
    const first = await buildPaymentAccountingEntry(payment, previousHash, timestamp);
    const second = await buildPaymentAccountingEntry(payment, previousHash, timestamp);
    assert.equal(first.amountTotalMinor, 12025);
    assert.equal(first.amountPrincipalMinor + first.amountInterestMinor + first.amountLateInterestMinor, first.amountTotalMinor);
    assert.equal(first.integrityHash, second.integrityHash);
    assert.match(first.integrityHash, /^[a-f0-9]{64}$/);
    assert.equal(first.id, 'payment:payment-1');
});

test('valores inválidos e alocações desequilibradas são recusados', async () => {
    assert.throws(() => toMinorUnits(1.001), /duas casas/);
    assert.throws(() => toMinorUnits(-1), /inválido/);
    await assert.rejects(buildPaymentAccountingEntry({ ...payment, amount: 121 }, 'a'.repeat(64)), /soma das alocações/);
    await assert.rejects(buildPaymentAccountingEntry({ ...payment, amount: 0, allocatedToPrincipal: 0,
        allocatedToInterest: 0, allocatedToLateInterest: 0 }, 'a'.repeat(64)), /superior a zero/);
    await assert.rejects(buildPaymentAccountingEntry(payment, 'invalido'), /Hash/);
});

test('estorno inverte débito e crédito sem alterar os montantes', async () => {
    const entry = await buildPaymentCorrectionEntry(payment, 'b'.repeat(64), 'reversal',
        new Date('2026-09-22T10:00:00.000Z'), 'correction-1');
    assert.equal(entry.type, 'reversal');
    assert.equal(entry.debit, 'portfolio');
    assert.equal(entry.credit, 'cash');
    assert.equal(entry.amountTotalMinor, 12025);
    assert.match(entry.integrityHash, /^[a-f0-9]{64}$/);
});

test('reforço gera desembolso equilibrado em unidades mínimas', async () => {
    const entry = await buildDisbursementAccountingEntry({
        id: 'reinforcement-1', creditId: 'credit-1', clientId: 'client-1', amount: 2500.75,
        processedBy: 'Gestor', usuario_id: 'tenant-1', description: 'Reforço contratual'
    }, 'c'.repeat(64), new Date('2026-09-22T12:00:00.000Z'));
    assert.equal(entry.type, 'disbursement');
    assert.equal(entry.debit, 'portfolio');
    assert.equal(entry.credit, 'cash');
    assert.equal(entry.amountPrincipalMinor, 250075);
    assert.equal(entry.amountTotalMinor, 250075);
    assert.match(entry.integrityHash, /^[a-f0-9]{64}$/);
});
