import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { COLLECTION_SCHEMA_SQL, customerPaymentScore, latestCollectionEvents, validDateKey } from '../src/bibliotecas/cobranca-operacional.ts';
test('classificação recusa ausência de histórico e distingue pontualidade, mora e falta de pagamento',()=>{
    assert.equal(customerPaymentScore([],'2026-10-05').score,null);
    const row={dueDate:'2026-10-01',principalMinor:10000,interestMinor:2000,paidPrincipalMinor:10000,paidInterestMinor:2000,paidAt:'2026-10-01'};
    assert.equal(customerPaymentScore([row],'2026-10-05').score,100);
    assert.ok(customerPaymentScore([{...row,paidAt:'2026-10-05'}],'2026-10-05').score<100);
    assert.ok(customerPaymentScore([{...row,paidPrincipalMinor:0,paidInterestMinor:0,paidAt:null}],'2026-10-05').score<50);
    assert.equal(customerPaymentScore([{...row,dueDate:'2026-10-10'}],'2026-10-05').score,null);
    assert.equal(validDateKey('2026-02-30'),false);
});
test('última atribuição vence e metas de meses distintos não se substituem',()=>{
    const event=(id,kind,createdAt,extra)=>({id,kind,createdAt,notes:'Registo',actorId:'admin',actorName:'Admin',...extra});
    const data=[event('a','assignment','2026-10-01',{creditId:'c',agentId:'u'}),event('b','assignment','2026-10-02',{creditId:'c',agentId:'v'}),event('t1','target','2026-10-01',{agentId:'u',monthKey:'2026-10',amountMinor:10000}),event('t2','target','2026-10-02',{agentId:'u',monthKey:'2026-11',amountMinor:20000})];
    assert.equal(latestCollectionEvents(data,'assignment').get('c').agentId,'v');
    assert.equal(latestCollectionEvents(data,'target').size,2);
});
test('histórico de cobrança é imutável e uma promessa só pode ter uma decisão final',()=>{
    const db=new DatabaseSync(':memory:');
    try {
        for(const sql of COLLECTION_SCHEMA_SQL) db.exec(sql);
        const insert=db.prepare('INSERT INTO collection_events(id,creditId,kind,relatedId,notes,actorId,actorName,createdAt) VALUES (?,?,?,?,?,?,?,?)');
        insert.run('a','c','promise_kept','promise1','Cliente pagou','u','Gestor','2026-10-05');
        assert.throws(()=>insert.run('b','c','promise_broken','promise1','Não pagou','u','Gestor','2026-10-06'),/UNIQUE/);
        assert.throws(()=>db.exec("UPDATE collection_events SET notes='alterado'"),/imutável/);
        assert.throws(()=>db.exec('DELETE FROM collection_events'),/imutável/);
        assert.throws(()=>insert.run('bad','c','invalid',null,'Notas válidas','u','Gestor','2026-10-05'),/CHECK/);
    }finally{db.close();}
});