import { db } from '@/bibliotecas/bd';
import { toMinorUnits } from '@/bibliotecas/ledger-financeiro';
export type CashSession = { id: string; operatorId: string; operatorName: string; sessionDate: string; openedAt: string;
    closedAt?: string; openingMinor: number; expectedMinor?: number; countedMinor?: number; reason?: string; status: 'open'|'closed' };
export class ServicoCaixa {
    static async current(operatorId: string, day: string) {
        return db.get<CashSession>('SELECT * FROM accounting_cash_sessions WHERE operatorId = ? AND sessionDate = ?', [operatorId,day]);
    }
    static async list(operatorId: string) {
        return db.all<CashSession>('SELECT * FROM accounting_cash_sessions WHERE operatorId = ? ORDER BY sessionDate DESC LIMIT 90', [operatorId]);
    }
    static async open(operatorId: string, operatorName: string, opening: number, day: string) {
        const minor=toMinorUnits(opening,'Saldo inicial');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || Number.isNaN(Date.parse(day)) || new Date(day).toISOString().slice(0,10) !== day) throw new Error('Data inválida.');
        const timestamp=new Date().toISOString(), id=crypto.randomUUID();
        await db.transaction([
            { sql: 'INSERT INTO accounting_cash_sessions (id, operatorId, operatorName, sessionDate, openedAt, openingMinor, status) VALUES (?,?,?,?,?,?,?)',
                params:[id,operatorId,operatorName,day,timestamp,minor,'open'],expectChanges:1 },
            { sql: `INSERT INTO audit_logs (id, timestamp, userId, userName, action, entity, details, metadata)
                VALUES (?, ?, ?, ?, 'create', 'system', ?, ?)`,params:[crypto.randomUUID(),timestamp,operatorId,operatorName,
                    'Abertura de caixa do operador',JSON.stringify({sessionId:id,openingMinor:minor})],expectChanges:1 }
        ]);
    }
    static async expected(session: CashSession) {
        const row=await db.get<{ net: number }>(`SELECT COALESCE(SUM(CASE WHEN l.side = 'debit' THEN l.amountMinor ELSE -l.amountMinor END),0) AS net
            FROM ledger_lines l JOIN ledger_transactions t ON t.id = l.transactionId
            WHERE l.account = 'cash' AND t.usuario_id = ? AND t.timestamp >= ?`,[session.operatorId,session.openedAt]);
        return session.openingMinor+Number(row?.net || 0);
    }
    static async close(session: CashSession, counted: number, reason: string) {
        const count=toMinorUnits(counted,'Saldo contado'), timestamp=new Date().toISOString();
        // O saldo é calculado dentro da própria instrução de fecho, não é aceite da interface.
        await db.transaction([
            { sql: `UPDATE accounting_cash_sessions SET
                expectedMinor = openingMinor + (SELECT COALESCE(SUM(CASE WHEN l.side = 'debit' THEN l.amountMinor ELSE -l.amountMinor END),0)
                    FROM ledger_lines l JOIN ledger_transactions t ON t.id = l.transactionId
                    WHERE l.account = 'cash' AND t.usuario_id = accounting_cash_sessions.operatorId
                    AND t.timestamp >= accounting_cash_sessions.openedAt AND t.timestamp <= ?),
                countedMinor = ?, reason = ?, closedAt = ?, status = 'closed'
                WHERE id = ? AND operatorId = ? AND status = 'open'`,
                params:[timestamp,count,reason.trim(),timestamp,session.id,session.operatorId],expectChanges:1 },
            { sql: `INSERT INTO audit_logs (id, timestamp, userId, userName, action, entity, details, metadata)
                VALUES (?, ?, ?, ?, 'create', 'system', ?, ?)`,params:[crypto.randomUUID(),timestamp,session.operatorId,session.operatorName,
                    'Fecho de caixa do operador',JSON.stringify({sessionId:session.id,countedMinor:count,reason:reason.trim()})],expectChanges:1 }
        ]);
    }
}