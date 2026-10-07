import { sha256 } from '@noble/hashes/sha2.js';
export type AuditChainRow={id:string;timestamp?:string|null;userId?:string|null;userName?:string|null;action?:string|null;entity?:string|null;details?:string|null;previousState?:string|null;newState?:string|null;metadata?:string|null};
export function auditChainHash(row:AuditChainRow,previousHash:string) {
    const values=[row.id,row.timestamp,row.userId,row.userName,row.action,row.entity,row.details,row.previousState,row.newState,row.metadata,previousHash].map(v=>v??null);
    return Array.from(sha256(new TextEncoder().encode(JSON.stringify(values)))).map(b=>b.toString(16).padStart(2,'0')).join('');
}
export function auditSqlHash(id:unknown,timestamp:unknown,userId:unknown,userName:unknown,action:unknown,entity:unknown,details:unknown,previousState:unknown,newState:unknown,metadata:unknown,previousHash:unknown) {
    return auditChainHash({id:String(id),timestamp:timestamp as string|null,userId:userId as string|null,userName:userName as string|null,action:action as string|null,entity:entity as string|null,details:details as string|null,previousState:previousState as string|null,newState:newState as string|null,metadata:metadata as string|null},String(previousHash));
}
export const AUDIT_CHAIN_SCHEMA_SQL=[
    `CREATE TABLE IF NOT EXISTS audit_log_chain (seq INTEGER PRIMARY KEY AUTOINCREMENT, auditId TEXT NOT NULL UNIQUE, previousHash TEXT NOT NULL, integrityHash TEXT NOT NULL, origin TEXT NOT NULL CHECK(origin IN ('live','legacy')))`,
    `CREATE TRIGGER IF NOT EXISTS trg_audit_chain_insert AFTER INSERT ON audit_logs BEGIN
        INSERT INTO audit_log_chain (auditId, previousHash, integrityHash, origin)
        VALUES (NEW.id, COALESCE((SELECT integrityHash FROM audit_log_chain ORDER BY seq DESC LIMIT 1), '0000000000000000000000000000000000000000000000000000000000000000'),
            tango_audit_hash(NEW.id,NEW.timestamp,NEW.userId,NEW.userName,NEW.action,NEW.entity,NEW.details,NEW.previousState,NEW.newState,NEW.metadata,
                COALESCE((SELECT integrityHash FROM audit_log_chain ORDER BY seq DESC LIMIT 1), '0000000000000000000000000000000000000000000000000000000000000000')),'live'); END`,
    `CREATE TRIGGER IF NOT EXISTS trg_audit_chain_update BEFORE UPDATE ON audit_log_chain BEGIN SELECT RAISE(ABORT,'A cadeia de auditoria é imutável'); END`,
    `CREATE TRIGGER IF NOT EXISTS trg_audit_chain_delete BEFORE DELETE ON audit_log_chain BEGIN SELECT RAISE(ABORT,'A cadeia de auditoria é imutável'); END`
];
export function auditChainFindings(logs:AuditChainRow[],chain:Array<{auditId:string;previousHash:string;integrityHash:string;seq:number}>) {
    const issues:Array<{id:string;severity:'error'|'warning';message:string;entityId:string}>=[];
    const byId=new Map(logs.map(log=>[log.id,log]));const sealed=new Set<string>();let previous='0'.repeat(64);
    for(const seal of [...chain].sort((a,b)=>a.seq-b.seq)) {
        const row=byId.get(seal.auditId);sealed.add(seal.auditId);
        if(!row || seal.previousHash!==previous || (row && auditChainHash(row,seal.previousHash)!==seal.integrityHash))
            issues.push({id:'audit-chain:'+seal.auditId,severity:'error',entityId:seal.auditId,message:'Falha no encadeamento ou conteúdo da auditoria.'});
        previous=seal.integrityHash;
    }
    for(const log of logs) if(!sealed.has(log.id)) issues.push({id:'audit-unsealed:'+log.id,severity:'warning',entityId:log.id,message:'Registo de auditoria anterior sem selo; requer migração da cadeia.'});
    return issues;
}