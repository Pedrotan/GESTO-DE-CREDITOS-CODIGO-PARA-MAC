import { auditSqlHash } from '../src/bibliotecas/cadeia-auditoria.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { trialBalance, ledgerFindings, reconcileBank, agingPortfolio, historicalLines } from '../src/bibliotecas/controlo-contabilistico.ts';
import { LEDGER_PROTECTION_SQL } from '../src/bibliotecas/esquema-ledger.ts';
import { DatabaseSync } from 'node:sqlite';

const payment = { id: 'p1', type: 'payment', timestamp: '2026-10-01', debit: 'cash', credit: 'portfolio',
    amountTotalMinor: 10000, amountPrincipalMinor: 7000, amountInterestMinor: 2500, amountLateInterestMinor: 500 };
test('pagamento misto separa capital, juros e mora sem duplicar o total', () => {
    const lines = historicalLines(payment);
    const rows = trialBalance(lines);
    assert.equal(rows.find(r=>r.account==='cash')?.debitMinor,10000);
    assert.equal(rows.find(r=>r.account==='portfolio')?.creditMinor,7000);
    assert.equal(rows.find(r=>r.account==='revenue_interest')?.creditMinor,2500);
    assert.equal(ledgerFindings([{id:'p1',totalDebitMinor:10000,totalCreditMinor:10000}],lines).length,0);
});
test('migração recusa valores históricos incompletos', () => {
    assert.throws(()=>historicalLines({...payment,amountPrincipalMinor:1}),/incompletas/);
});
test('deteta transação com linhas desequilibradas', () => {
    assert.equal(ledgerFindings([{id:'p1',totalDebitMinor:10000,totalCreditMinor:10000}],historicalLines(payment).slice(1)).length,1);
});
test('reconciliação não confirma correspondências ambíguas nem usa pagamento duas vezes', () => {
    const row = {id:'b1',date:'2026-10-01',amountMinor:10000,reference:''};
    const result = reconcileBank([row],[{...row,id:'p1'},{...row,id:'p2'}]);
    assert.equal(result.bank[0].state,'ambiguous');
    const unique = reconcileBank([row,{...row,id:'b2'}],[{...row,id:'p1'}]);
    assert.equal(unique.bank[0].state,'matched');
    assert.equal(unique.bank[1].state,'missing-system');
});
test('PAR30 usa capital com atraso estritamente superior a 30 dias', () => {
    const report = agingPortfolio([{status:'active',currentBalanceMinor:10000,daysOverdue:0},
        {status:'overdue',currentBalanceMinor:10000,daysOverdue:30},{status:'overdue',currentBalanceMinor:10000,daysOverdue:31}], [0,10,20,50,100]);
    assert.ok(Math.abs(report.par30 - 100/3) < 0.000001);
    assert.equal(report.buckets[2].provisionMinor,2000);
});
test('base de dados impede alterações à auditoria e lançamentos num período fechado', () => {
    const db = new DatabaseSync(':memory:');
    db.function('tango_audit_hash',{varargs:true},auditSqlHash);
    db.exec("CREATE TABLE audit_logs(id TEXT PRIMARY KEY,timestamp TEXT,userId TEXT,userName TEXT,action TEXT,entity TEXT,details TEXT,previousState TEXT,newState TEXT,metadata TEXT); CREATE TABLE closed_months(id TEXT); CREATE TABLE accounting_entries(id TEXT,timestamp TEXT,previousHash TEXT,integrityHash TEXT,paymentId TEXT,type TEXT); CREATE TABLE ledger_transactions(id TEXT); CREATE TABLE ledger_lines(id TEXT)");
    for (const sql of LEDGER_PROTECTION_SQL) db.exec(sql);
    db.exec("INSERT INTO audit_logs(id,details) VALUES ('a','original'); INSERT INTO closed_months VALUES ('2026-10')");
    assert.throws(()=>db.exec("UPDATE audit_logs SET details='alterado'"),/imutáveis/);
    assert.throws(()=>db.exec("DELETE FROM audit_logs"),/imutáveis/);
    assert.throws(()=>db.prepare("INSERT INTO accounting_entries(id,timestamp,previousHash,integrityHash) VALUES (?,?,?,?)").run('e','2026-10-04','0'.repeat(64),'1'.repeat(64)),/fechado/);
    db.close();
});
test('fecho de caixa com diferença exige motivo e não permite editar um fecho concluído', () => {
    const db = new DatabaseSync(':memory:');
    db.function('tango_audit_hash',{varargs:true},auditSqlHash);
    db.exec("CREATE TABLE audit_logs(id TEXT PRIMARY KEY,timestamp TEXT,userId TEXT,userName TEXT,action TEXT,entity TEXT,details TEXT,previousState TEXT,newState TEXT,metadata TEXT); CREATE TABLE closed_months(id TEXT); CREATE TABLE accounting_entries(id TEXT,timestamp TEXT,previousHash TEXT,integrityHash TEXT,paymentId TEXT,type TEXT); CREATE TABLE ledger_transactions(id TEXT); CREATE TABLE ledger_lines(id TEXT)");
    for (const sql of LEDGER_PROTECTION_SQL) db.exec(sql);
    db.exec("INSERT INTO accounting_cash_sessions (id,operatorId,operatorName,sessionDate,openedAt,openingMinor) VALUES ('s','u','Operador','2026-10-05','2026-10-05T08:00:00Z',10000)");
    assert.throws(()=>db.exec("UPDATE accounting_cash_sessions SET status='closed',expectedMinor=10000,countedMinor=9000,reason='' WHERE id='s'"),/CHECK/);
    db.exec("UPDATE accounting_cash_sessions SET status='closed',expectedMinor=10000,countedMinor=9000,reason='Diferença justificada no fecho' WHERE id='s'");
    assert.throws(()=>db.exec("UPDATE accounting_cash_sessions SET countedMinor=10000 WHERE id='s'"),/imutável/);
    assert.throws(()=>db.exec("DELETE FROM accounting_cash_sessions WHERE id='s'"),/imutável/);
    db.close();
});