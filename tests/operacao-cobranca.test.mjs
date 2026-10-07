import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { COLLECTION_SCHEMA_SQL } from '../src/bibliotecas/cobranca-operacional.ts';
import { BANK_IMPORT_SCHEMA_SQL } from '../src/bibliotecas/esquema-extratos.ts';
import { RENDERER_SQL_ALLOWLIST } from '../electron/renderer-sql-allowlist.ts';
const root=path.resolve(import.meta.dirname,'..');
async function setup(serviceName) {
    const dir=mkdtempSync(path.join(tmpdir(),'operacao-')),outfile=path.join(dir,'service.mjs');
    await build({entryPoints:[path.join(root,'src/servicos/'+serviceName+'.ts')],bundle:true,format:'esm',platform:'node',outfile,logLevel:'silent',plugins:[{name:'db',setup(b){
        b.onResolve({filter:/^@\/bibliotecas\/bd$/},()=>({path:'db',namespace:'test'}));
        b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:'export const db=new Proxy({}, {get:(_,k)=>globalThis.__operationsDb[k]});',loader:'js'}));
        b.onResolve({filter:/^@\//},args=>b.resolve(path.join(root,'src',args.path.slice(2)),{kind:args.kind,resolveDir:root}));
    }}]});
    const service=(await import(pathToFileURL(outfile).href))[serviceName]; rmSync(dir,{recursive:true,force:true});
    const db=new DatabaseSync(':memory:');
    db.exec(`CREATE TABLE credits(id TEXT PRIMARY KEY,totalDueMinor INTEGER,totalDue REAL,deletedAt TEXT);
        INSERT INTO credits VALUES('c',10000,100,NULL);
        CREATE TABLE audit_logs(id TEXT PRIMARY KEY,timestamp TEXT,userId TEXT,userName TEXT,action TEXT,entity TEXT,details TEXT,metadata TEXT);`);
    for(const sql of [...COLLECTION_SCHEMA_SQL,...BANK_IMPORT_SCHEMA_SQL]) db.exec(sql);
    globalThis.__operationsDb={all:async(sql,params=[])=>db.prepare(sql).all(...params),get:async(sql,params=[])=>db.prepare(sql).get(...params),transaction:async(statements)=>{
        db.exec('BEGIN');try{for(const item of statements){assert.ok(RENDERER_SQL_ALLOWLIST.has(item.sql.replace(/\s+/g,' ').trim()));const result=db.prepare(item.sql).run(...item.params);if(item.expectChanges!==undefined)assert.equal(result.changes,item.expectChanges);}db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
    }};
    return {service,db};
}
const actor={id:'u',name:'Gestor',role:'manager'};
test('cobrança valida limites de promessas e permissões e faz rollback se auditoria falhar',async()=>{
    const {service,db}=await setup('ServicoCobrancaOperacional');
    try {
        await assert.rejects(service.record({kind:'target',monthKey:'2026-10',agentId:'u',amount:10,notes:'Meta mensal'},actor),/administradores/);
        const promise={kind:'promise',creditId:'c',notes:'Cliente prometeu pagar',amount:101,promisedDate:'2026-10-10'};
        await assert.rejects(service.record(promise,actor),/até ao total/);
        await assert.rejects(service.record({...promise,amount:50,promisedDate:'2026-02-30'},actor),/data válida/);
        await service.record({...promise,amount:50},actor);
        assert.equal((await service.list()).length,1);
        db.exec("CREATE TRIGGER fail_audit BEFORE INSERT ON audit_logs BEGIN SELECT RAISE(ABORT,'falha auditoria'); END");
        await assert.rejects(service.record({kind:'contact',creditId:'c',notes:'Contacto realizado'},actor),/falha auditoria/);
        assert.equal((await service.list()).length,1);
    }finally{db.close();}
});
test('extrato sobrevive à reimportação sem duplicar arquivo ou auditoria e conserva conteúdo',async()=>{
    const {service,db}=await setup('ServicoExtratosBancarios');
    try {
        const rows=[{id:'b1',date:'2026-10-05',amountMinor:5000,reference:'ref'}];
        const id=await service.save(rows,'banco.csv',actor);
        assert.equal(await service.save(rows,'renomeado.csv',actor),id);
        assert.equal((await service.list()).length,1);
        assert.deepEqual(JSON.parse((await service.list())[0].movements),rows);
        assert.equal(db.prepare('SELECT COUNT(*) AS n FROM audit_logs').get().n,1);
        assert.throws(()=>db.exec('DELETE FROM accounting_bank_imports'),/imutável/);
        db.exec("CREATE TRIGGER fail_audit BEFORE INSERT ON audit_logs BEGIN SELECT RAISE(ABORT,'falha auditoria'); END");
        await assert.rejects(service.save([{...rows[0],amountMinor:6000}],'outro.csv',actor),/falha auditoria/);
        assert.equal((await service.list()).length,1);
    }finally{db.close();}
});