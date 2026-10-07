import { db } from '@/bibliotecas/bd';
import type { BankMovement } from '@/bibliotecas/controlo-contabilistico';
export type StoredBankImport={id:string;fileName:string;movements:string;actorId:string;actorName:string;importedAt:string};
export class ServicoExtratosBancarios {
    static async list() { return db.all<StoredBankImport>('SELECT * FROM accounting_bank_imports ORDER BY importedAt DESC, rowid DESC'); }
    static async save(movements:BankMovement[],fileName:string,actor:{id:string;name:string}) {
        if(!movements.length || movements.length>20000 || !actor.id || movements.some(m=>!Number.isSafeInteger(m.amountMinor) || !m.amountMinor)) throw new Error('Extrato vazio, demasiado extenso ou com valores inválidos.');
        const value=JSON.stringify([...movements].sort((a,b)=>a.id.localeCompare(b.id)));
        if(value.length>900000)throw new Error('Extrato demasiado extenso. Divida o ficheiro em períodos menores.');
        const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));
        const id='bank-import:'+Array.from(new Uint8Array(hash)).map(b=>b.toString(16).padStart(2,'0')).join('');
        const now=new Date().toISOString();
        await db.transaction([
            {sql:'INSERT OR IGNORE INTO accounting_bank_imports (id, fileName, movements, actorId, actorName, importedAt) VALUES (?,?,?,?,?,?)',params:[id,fileName.slice(0,255),value,actor.id,actor.name,now]},
            {sql:`INSERT OR IGNORE INTO audit_logs (id, timestamp, userId, userName, action, entity, details, metadata)
                VALUES (?, ?, ?, ?, 'create', 'accounting_entry', ?, ?)`,params:['audit:'+id,now,actor.id,actor.name,'Importação de extrato bancário: '+fileName.slice(0,255),JSON.stringify({bankImportId:id,count:movements.length})]}
        ]);
        return id;
    }
}