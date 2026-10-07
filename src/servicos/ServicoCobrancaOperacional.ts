import { db } from '@/bibliotecas/bd';
import { toMinorUnits } from '@/bibliotecas/ledger-financeiro';
import { validDateKey, type CollectionEvent, type CollectionKind } from '@/bibliotecas/cobranca-operacional';
export class ServicoCobrancaOperacional {
    static async list() { return db.all<CollectionEvent>('SELECT * FROM collection_events ORDER BY createdAt DESC, rowid DESC'); }
    static async record(input:{creditId?:string;kind:CollectionKind;agentId?:string;agentName?:string;monthKey?:string;amount?:number;
        promisedDate?:string;relatedId?:string;notes:string},actor:{id:string;name:string;role:string}) {
        const kinds=['contact','promise','promise_kept','promise_broken','assignment','target'];
        if(!kinds.includes(input.kind) || input.notes.trim().length<5 || !actor.id) throw new Error('Registo inválido. Descreva a ação com pelo menos 5 caracteres.');
        if(['assignment','target'].includes(input.kind) && !['admin','super_admin'].includes(actor.role)) throw new Error('Só administradores podem atribuir gestores e metas.');
        if(input.kind==='target' && (!/^\d{4}-(0[1-9]|1[0-2])$/.test(input.monthKey || '') || !input.agentId)) throw new Error('Selecione o gestor e um mês válido.');
        if(input.kind==='assignment' && !input.agentId) throw new Error('Selecione um gestor.');
        const minor=input.amount===undefined?null:toMinorUnits(input.amount,'Valor');
        const timestamp=new Date().toISOString(), id=crypto.randomUUID();
        let credit:{id:string;totalDueMinor:number;totalDue:number;deletedAt?:string}|undefined;
        if(input.kind!=='target') {
            credit=await db.get('SELECT id, totalDueMinor, totalDue, deletedAt FROM credits WHERE id = ?',[input.creditId]);
            if(!credit || credit.deletedAt) throw new Error('Crédito não encontrado ou eliminado.');
        }
        if(input.kind==='promise' && (!input.promisedDate || !validDateKey(input.promisedDate) || !minor || minor<=0 || minor>Number(credit?.totalDueMinor ?? toMinorUnits(credit?.totalDue || 0)))) throw new Error('A promessa exige uma data válida e um valor até ao total em dívida.');
        if(['promise_kept','promise_broken'].includes(input.kind)) {
            const original=await db.get<CollectionEvent>('SELECT * FROM collection_events WHERE id = ? AND kind = ?',[input.relatedId,'promise']);
            if(!original || original.creditId!==input.creditId) throw new Error('Promessa não encontrada para este crédito.');
        }
        await db.transaction([
            {sql:`INSERT INTO collection_events (id, creditId, kind, agentId, agentName, monthKey, amountMinor, promisedDate, relatedId, notes, actorId, actorName, createdAt)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,params:[id,input.creditId || null,input.kind,input.agentId || null,input.agentName || null,input.monthKey || null,minor,input.promisedDate || null,input.relatedId || null,input.notes.trim(),actor.id,actor.name,timestamp],expectChanges:1},
            {sql:`INSERT INTO audit_logs (id, timestamp, userId, userName, action, entity, details, metadata)
                VALUES (?, ?, ?, ?, 'create', 'credit', ?, ?)`,params:[crypto.randomUUID(),timestamp,actor.id,actor.name,'Registo de cobrança: '+input.kind,
                    JSON.stringify({collectionEventId:id,creditId:input.creditId,kind:input.kind,amountMinor:minor,notes:input.notes.trim()})],expectChanges:1}
        ]);
    }
}