import test from 'node:test';
import assert from 'node:assert/strict';
import { auditRiskFindings } from '../src/bibliotecas/alertas-auditoria.ts';
test('alertas distinguem aprovação própria, alteração de taxa e reabertura justificada',()=>{
    const logs=[{id:'a',timestamp:'2026-10-05',userId:'u',entity:'credit',previousState:JSON.stringify({requestedBy:'u',status:'pending_approval'}),metadata:JSON.stringify({decision:'approved'})},
        {id:'b',timestamp:'2026-10-05',entity:'credit',previousState:JSON.stringify({status:'active',interestRate:10}),newState:JSON.stringify({status:'active',interestRate:20})},
        {id:'c',timestamp:'2026-10-05',metadata:JSON.stringify({periodId:'2026-09',reason:'Correção documentada'})}];
    const found=auditRiskFindings(logs,[]);
    assert.equal(found.length,3);
    assert.equal(found.find(f=>f.id==='audit-self-approval:a').severity,'error');
});
test('pagamento normal e aprovação por outro utilizador não geram alertas de alteração',()=>{
    const logs=[{id:'a',timestamp:'2026-10-05',userId:'other',entity:'credit',previousState:JSON.stringify({requestedBy:'u',status:'pending_approval'}),metadata:JSON.stringify({decision:'approved'})},
        {id:'b',timestamp:'2026-10-05',entity:'credit',previousState:JSON.stringify({status:'active',currentBalanceMinor:10000}),newState:JSON.stringify({status:'active',currentBalanceMinor:9000})},
        {id:'c',timestamp:'2026-10-05',previousState:'invalid json'}];
    assert.deepEqual(auditRiskFindings(logs,[]),[]);
});
test('estornos frequentes agrupam por operador e dia, sem misturar pessoas ou datas',()=>{
    const entry=(id,user,day)=>({id,type:'reversal',usuario_id:user,timestamp:day+'T10:00:00Z'});
    const found=auditRiskFindings([],[entry('a','u','2026-10-05'),entry('b','u','2026-10-05'),entry('c','u','2026-10-05'),entry('d','v','2026-10-05'),entry('e','u','2026-10-04')]);
    assert.equal(found.length,1);
    assert.match(found[0].message,/3 estornos/);
});