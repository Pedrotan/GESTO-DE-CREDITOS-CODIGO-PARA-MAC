import { db } from '@/bibliotecas/bd';
export type DivergenceState = 'pending' | 'justified' | 'resolved';
export type DivergenceDecision = {
    id: string; issueKey: string; previousId: string; source: string; description: string;
    state: DivergenceState; reason: string; actorId: string; actorName: string; createdAt: string;
};
export class ServicoDivergencias {
    static async list() {
        return db.all<DivergenceDecision>('SELECT * FROM accounting_divergence_events ORDER BY createdAt DESC, rowid DESC');
    }
    static async decide(input: Omit<DivergenceDecision, 'id' | 'createdAt'>) {
        if (!input.issueKey || !input.actorId || !['pending','justified','resolved'].includes(input.state)) throw new Error('Decisão inválida.');
        if (input.reason.trim().length < 10) throw new Error('Introduza uma justificação com pelo menos 10 caracteres.');
        const timestamp = new Date().toISOString(), id = crypto.randomUUID();
        await db.transaction([
            { sql: `INSERT INTO accounting_divergence_events
                (id, issueKey, previousId, source, description, state, reason, actorId, actorName, createdAt)
                SELECT ?,?,?,?,?,?,?,?,?,? WHERE ? = COALESCE((SELECT id FROM accounting_divergence_events
                    WHERE issueKey = ? ORDER BY createdAt DESC, rowid DESC LIMIT 1),'')`,
                params: [id,input.issueKey,input.previousId,input.source,input.description,input.state,input.reason.trim(),input.actorId,input.actorName,timestamp,input.previousId,input.issueKey], expectChanges: 1 },
            { sql: `INSERT INTO audit_logs (id, timestamp, userId, userName, action, entity, details, metadata)
                VALUES (?, ?, ?, ?, 'update', 'accounting_entry', ?, ?)`,
                params: [crypto.randomUUID(),timestamp,input.actorId,input.actorName,'Decisão sobre divergência: '+input.description,
                    JSON.stringify({issueKey:input.issueKey,previousDecision:input.previousId,newState:input.state,reason:input.reason.trim(),decisionId:id})], expectChanges: 1 }
        ]);
    }
}