import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { LEDGER_PROTECTION_SQL } from '../src/bibliotecas/esquema-ledger.ts';
import { RENDERER_SQL_ALLOWLIST } from '../electron/renderer-sql-allowlist.ts';
const root=path.resolve(import.meta.dirname,'..');
async function setup() {
    const dir=mkdtempSync(path.join(tmpdir(),'divergencias-')), outfile=path.join(dir,'service.mjs');
    await build({entryPoints:[path.join(root,'src/servicos/ServicoDivergencias.ts')],bundle:true,format:'esm',platform:'node',outfile,logLevel:'silent',plugins:[{
        name:'db',setup(b) { b.onResolve({filter:/^@\/bibliotecas\/bd$/},()=>({path:'db',namespace:'test'}));
            b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:'export const db = new Proxy({}, {get:(_,key)=>globalThis.__divergenceDb[key]});',loader:'js'})); }
    }]});
    const service=(await import(pathToFileURL(outfile).href)).ServicoDivergencias;
    rmSync(dir,{recursive:true,force:true});
    const db=new DatabaseSync(':memory:');
    db.exec('CREATE TABLE audit_logs(id TEXT PRIMARY KEY,timestamp TEXT,userId TEXT,userName TEXT,action TEXT,entity TEXT,details TEXT,metadata TEXT)');
    for(const sql of LEDGER_PROTECTION_SQL.filter(sql=>sql.includes('accounting_divergence_events'))) db.exec(sql);
    globalThis.__divergenceDb={all:async(sql)=>db.prepare(sql).all(),transaction:async(statements)=>{
        db.exec('BEGIN'); try { for(const item of statements) {
            assert.ok(RENDERER_SQL_ALLOWLIST.has(item.sql.replace(/\s+/g,' ').trim()));
            const result=db.prepare(item.sql).run(...item.params);
            if(result.changes!==item.expectChanges) throw new Error('Conflito concorrente');
        } db.exec('COMMIT'); } catch(e) {db.exec('ROLLBACK');throw e;}
    }};
    return {service,db};
}
const decision={issueKey:'portfolio',previousId:'',source:'integrity',description:'Diferença da carteira',state:'justified',reason:'Diferença em investigação',actorId:'admin',actorName:'Administrador'};
test('decisões persistem com auditoria, histórico imutável e controlo de concorrência',async()=>{
    const {service,db}=await setup();
    try {
        await service.decide(decision);
        const first=(await service.list())[0];
        assert.equal(first.state,'justified');
        assert.equal(db.prepare('SELECT COUNT(*) AS n FROM audit_logs').get().n,1);
        await assert.rejects(service.decide({...decision,state:'resolved'}),/concorrente/);
        assert.equal(db.prepare('SELECT COUNT(*) AS n FROM audit_logs').get().n,1);
        await service.decide({...decision,previousId:first.id,state:'resolved',reason:'Movimento comprovado e corrigido'});
        assert.equal((await service.list())[0].state,'resolved');
        assert.equal((await service.list()).length,2);
        assert.throws(()=>db.exec("UPDATE accounting_divergence_events SET state='pending'"),/imutáveis/);
        assert.throws(()=>db.exec('DELETE FROM accounting_divergence_events'),/imutáveis/);
    } finally {db.close();}
});
test('falha na auditoria reverte a decisão e motivos vazios são recusados',async()=>{
    const {service,db}=await setup();
    try {
        await assert.rejects(service.decide({...decision,reason:'curto'}),/justificação/);
        db.exec("CREATE TRIGGER reject_audit BEFORE INSERT ON audit_logs BEGIN SELECT RAISE(ABORT,'falha audit'); END");
        await assert.rejects(service.decide(decision),/falha audit/);
        assert.equal((await service.list()).length,0);
    } finally {db.close();}
});