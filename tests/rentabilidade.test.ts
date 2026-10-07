import { test } from 'node:test';
import assert from 'node:assert/strict';
import { profitability } from '../src/bibliotecas/rentabilidade.ts';
import type { JournalEntry } from '../src/bibliotecas/relatorios-contabeis.ts';

test('margem conserva despesas gerais e estornos sem confundir recebimento e previsão', () => {
    const entry = (id: string, creditId: string | null, account: string, side: string, amountMinor: number) => ({ id, creditId, timestamp: '2026-10-02T10:00:00Z', lines: [{ account, side, amountMinor }] } as JournalEntry);
    const rows = profitability([{ id: 'c', amortizationMethod: 'PRICE', usuario_id: 'u' }],
        [{ creditId: 'c', dueDate: '2026-10-20', interestMinor: 2000 }],
        [{ creditId: 'c', paymentDate: '2026-10-03', status: 'confirmed', allocatedToInterestMinor: 700 },
         { creditId: 'c', paymentDate: '2026-10-03', status: 'cancelled', allocatedToInterestMinor: 900 }],
        [entry('1','c','revenue_interest','credit',700),entry('2','c','revenue_interest','debit',100),entry('3',null,'expenses','debit',300)], '2026-10-01','2026-10-31','method');
    assert.equal(rows.find(r => r.key === 'PRICE')?.marginMinor, 600);
    assert.equal(rows.find(r => r.key === 'PRICE')?.expectedMinor, 2000);
    assert.equal(rows.find(r => r.key === 'PRICE')?.receivedMinor, 700);
    assert.equal(rows.find(r => r.key === 'Sem atribuição')?.marginMinor, -300);
    assert.equal(rows.reduce((sum,r) => sum + r.marginMinor,0),300);
});
test('período usa a data em Angola e mantém responsável original', () => {
    const rows = profitability([{id:'c',usuario_id:'u'}],[],[{creditId:'c',paymentDate:'2026-09-30T23:30:00Z',status:'confirmed',allocatedToInterestMinor:500}],[], '2026-10-01','2026-10-31','agent');
    assert.equal(rows[0].key,'u'); assert.equal(rows[0].receivedMinor,500);
    assert.throws(() => profitability([],[],[],[],'2026-11-01','2026-10-01','agent'));
});
