import test from 'node:test';
import assert from 'node:assert/strict';
import { buildJournal,trialBalanceForPeriod,accountLedger,incomeStatement,cashFlow } from '../src/bibliotecas/relatorios-contabeis.ts';
const range={start:new Date('2026-10-01T00:00:00Z'),end:new Date('2026-10-31T23:59:59Z')};
const entry=(id,timestamp,type)=>({id,timestamp,type,description:id});
const tx=(id,timestamp,sourceType)=>({id,timestamp,type:'adjustment',sourceType,sourceId:id});
const line=(id,account,side,amountMinor)=>({id:id+account,transactionId:id,account,side,amountMinor,component:'test'});
const journal=buildJournal([entry('capital','2026-09-30','capital_entry'),entry('expense','2026-10-05','adjustment'),entry('interest','2026-10-06','payment')],
    [tx('capital','2026-09-30','manual'),tx('expense','2026-10-05','expense'),tx('interest','2026-10-06','payment')],
    [line('capital','bank','debit',100000),line('capital','capital','credit',100000),line('expense','expenses','debit',10000),line('expense','bank','credit',10000),line('interest','bank','debit',5000),line('interest','revenue_interest','credit',5000)]);
test('balancete e razão incluem saldo inicial e resultados excluem entrada de capital',()=>{
    const balance=trialBalanceForPeriod(journal,range);
    assert.equal(balance.balanced,true);
    const bank=balance.rows.find(r=>r.account==='bank');assert.equal(bank.openingMinor,100000);assert.equal(bank.closingMinor,95000);
    const ledger=accountLedger(journal,'bank',range);assert.equal(ledger.openingMinor,100000);assert.equal(ledger.closingMinor,95000);
    const result=incomeStatement(journal,range);assert.equal(result.revenueMinor,5000);assert.equal(result.expensesMinor,10000);assert.equal(result.resultMinor,-5000);
});
test('fluxo reconhece despesas antigas com tipo adjustment e fecha com o saldo do razão',()=>{
    const cash=cashFlow(journal,range);assert.equal(cash.openingMinor,100000);assert.equal(cash.closingMinor,95000);
    assert.equal(cash.items.find(i=>i.category==='expenses').amountMinor,-10000);
});