import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import initSqlJs from 'sql.js';
import { auditSqlHash,auditChainFindings,AUDIT_CHAIN_SCHEMA_SQL } from '../src/bibliotecas/cadeia-auditoria.ts';
const auditSchema='CREATE TABLE audit_logs(id TEXT PRIMARY KEY,timestamp TEXT,userId TEXT,userName TEXT,action TEXT,entity TEXT,details TEXT,previousState TEXT,newState TEXT,metadata TEXT)';
test('cada inserção direta é encadeada na transação e adulteração ou remoção são detetadas',()=>{
    const db=new DatabaseSync(':memory:');
    try{
        db.function('tango_audit_hash',{varargs:true},auditSqlHash);db.exec(auditSchema);
        for(const sql of AUDIT_CHAIN_SCHEMA_SQL)db.exec(sql);
        const add=db.prepare('INSERT INTO audit_logs(id,timestamp,userId,action,details) VALUES (?,?,?,?,?)');
        add.run('a','2026-10-05','u','create','original');add.run('b','2026-10-05','u','update','seguinte');
        const logs=db.prepare('SELECT * FROM audit_logs').all(),chain=db.prepare('SELECT * FROM audit_log_chain').all();
        assert.equal(chain.length,2);assert.equal(chain[1].previousHash,chain[0].integrityHash);
        assert.equal(auditChainFindings(logs,chain).length,0);
        assert.ok(auditChainFindings([{...logs[0],details:'alterado'},logs[1]],chain).length>0);
        assert.ok(auditChainFindings([logs[1]],chain).length>0);
        db.exec('BEGIN');add.run('c','2026-10-05','u','update','rollback');db.exec('ROLLBACK');
        assert.equal(db.prepare('SELECT COUNT(*) AS n FROM audit_log_chain').get().n,2);
        assert.throws(()=>db.exec('DELETE FROM audit_log_chain'),/imutável/);
    }finally{db.close();}
});
test('SQL.js suporta o mesmo hash e a função é reinstalada depois de exportar a base',async()=>{
    const SQL=await initSqlJs(),db=new SQL.Database();
    try{
        db.create_function('tango_audit_hash',auditSqlHash);db.exec(auditSchema);for(const sql of AUDIT_CHAIN_SCHEMA_SQL)db.exec(sql);
        db.run("INSERT INTO audit_logs(id,details) VALUES('a','primeiro')");
        db.export();db.create_function('tango_audit_hash',auditSqlHash);
        db.run("INSERT INTO audit_logs(id,details) VALUES('b','segundo')");
        assert.equal(db.exec('SELECT COUNT(*) FROM audit_log_chain')[0].values[0][0],2);
    }finally{db.close();}
});