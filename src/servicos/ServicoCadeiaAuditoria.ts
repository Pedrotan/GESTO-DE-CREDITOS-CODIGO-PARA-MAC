import { db } from '@/bibliotecas/bd';
import { auditChainHash, type AuditChainRow } from '@/bibliotecas/cadeia-auditoria';
export class ServicoCadeiaAuditoria {
    static async migrateLegacy(actor:{id:string;name:string;role:string}) {
        if(!['admin','super_admin'].includes(actor.role)) throw new Error('Só administradores podem migrar a cadeia de auditoria.');
        let count=0;
        for(;;) {
            const rows=await db.all<AuditChainRow>('SELECT a.* FROM audit_logs a LEFT JOIN audit_log_chain c ON c.auditId = a.id WHERE c.auditId IS NULL ORDER BY a.rowid LIMIT 200');
            if(!rows.length) return count;
            const head=await db.get<{integrityHash:string}>('SELECT integrityHash FROM audit_log_chain ORDER BY seq DESC LIMIT 1');
            let previous=head?.integrityHash || '0'.repeat(64);
            const statements=rows.map(row=>{
                const integrityHash=auditChainHash(row,previous),old=previous;previous=integrityHash;
                return {sql:`INSERT INTO audit_log_chain (auditId,previousHash,integrityHash,origin)
                    SELECT ?,?,?,'legacy' WHERE ? = COALESCE((SELECT integrityHash FROM audit_log_chain ORDER BY seq DESC LIMIT 1), ?)`,
                    params:[row.id,old,integrityHash,old,'0'.repeat(64)],expectChanges:1};
            });
            statements.push({sql:`INSERT INTO audit_logs (id,timestamp,userId,userName,action,entity,details,metadata) VALUES (?,?,?,?,?,?,?,?)`,
                params:[crypto.randomUUID(),new Date().toISOString(),actor.id,actor.name,'create','system','Migração da cadeia de auditoria',JSON.stringify({legacyCount:rows.length,baseline:true})],expectChanges:1});
            await db.transaction(statements);count+=rows.length;
        }
    }
}