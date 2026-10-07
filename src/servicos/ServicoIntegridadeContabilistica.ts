import { auditChainFindings } from '@/bibliotecas/cadeia-auditoria';
import { auditRiskFindings } from '@/bibliotecas/alertas-auditoria';
import { db } from '@/bibliotecas/bd';
import { historicalLines, ledgerFindings, type LedgerLine, type Finding } from '@/bibliotecas/controlo-contabilistico';
import { calculateLedgerHash } from '@/bibliotecas/ledger-financeiro';

export class ServicoIntegridadeContabilistica {
    static async migrateHistorical(actorId: string, actorName: string) {
        const report = await this.scan();
        if (report.findings.some(f => f.id.startsWith('hash:') || f.id.startsWith('chain:')))
            throw new Error('Corrija as divergências de hash antes de migrar.');
        const historical = await db.all<any>('SELECT a.* FROM accounting_entries a LEFT JOIN ledger_transactions t ON t.id = a.id WHERE t.id IS NULL ORDER BY a.rowid');
        const statements: any[] = [];
        for (const entry of historical) {
            const lines = historicalLines(entry);
            statements.push({ sql: `INSERT INTO ledger_transactions
                (id, timestamp, type, sourceType, sourceId, description, totalDebitMinor,
                 totalCreditMinor, integrityHash, previousHash, hashVersion, usuario_id)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
                params: [entry.id, entry.timestamp, entry.type, 'historical', entry.paymentId || entry.creditId || entry.id,
                    entry.description, entry.amountTotalMinor, entry.amountTotalMinor, entry.integrityHash, entry.previousHash, entry.hashVersion || 1, entry.usuario_id || null],
                expectChanges: 1 });
            for (const line of lines) statements.push({ sql: 'INSERT INTO ledger_lines (id, transactionId, account, side, component, amountMinor) VALUES (?,?,?,?,?,?)',
                params: [line.id,line.transactionId,line.account,line.side,line.component,line.amountMinor], expectChanges: 1 });
        }
        if (!statements.length) return 0;
        statements.push({ sql: `INSERT INTO audit_logs (id, timestamp, userId, userName, action, entity, details, metadata)
            VALUES (?, ?, ?, ?, 'create', 'accounting_entry', ?, ?)`,
            params: [crypto.randomUUID(),new Date().toISOString(),actorId,actorName,'Migração de linhas históricas sem alteração dos lançamentos originais',
                JSON.stringify({ entryIds: historical.map(e=>e.id) })], expectChanges: 1 });
        await db.transaction(statements);
        return historical.length;
    }
    static async scan() {
        const revision = await db.get<any>('SELECT id FROM accounting_entries ORDER BY rowid DESC LIMIT 1');
        const [transactions, lines, entries, payments, credits, installments, cashSessions, auditLogs, writeoffs, auditChain] = await Promise.all([
            db.all<any>('SELECT * FROM ledger_transactions ORDER BY rowid'),
            db.all<LedgerLine>('SELECT l.*, t.timestamp, t.sourceId, t.description FROM ledger_lines l LEFT JOIN ledger_transactions t ON t.id = l.transactionId ORDER BY t.timestamp, l.id'),
            db.all<any>('SELECT * FROM accounting_entries ORDER BY rowid'),
            db.all<any>('SELECT * FROM payments'),
            db.all<any>('SELECT * FROM credits'),
            db.all<any>('SELECT * FROM credit_installments'),
            db.all<any>("SELECT * FROM accounting_cash_sessions WHERE status = 'closed' AND expectedMinor <> countedMinor"),
            db.all<any>('SELECT * FROM audit_logs ORDER BY timestamp DESC, rowid DESC'),
            db.all<any>('SELECT * FROM credit_writeoffs'),
            db.all<any>('SELECT * FROM audit_log_chain ORDER BY seq')
        ]);
        const after = await db.get<any>('SELECT id FROM accounting_entries ORDER BY rowid DESC LIMIT 1');
        if (revision?.id !== after?.id) throw new Error('Ocorreram movimentos durante a verificação. Execute novamente.');
        const findings: Finding[] = [...ledgerFindings(transactions, lines), ...auditRiskFindings(auditLogs, entries), ...auditChainFindings(auditLogs,auditChain)];
        for (const session of cashSessions) findings.push({id:'cash:'+session.id,severity:'warning',entityId:session.id,
            message:'Diferença de caixa de '+session.operatorName+' em '+session.sessionDate+': '+((Number(session.countedMinor)-Number(session.expectedMinor))/100).toFixed(2)+' AOA. Motivo registado: '+session.reason});
        let previous = '0'.repeat(64);
        for (const entry of entries) {
            if (entry.previousHash !== previous) findings.push({ id: 'chain:' + entry.id, severity: 'error', message: 'Encadeamento contabilístico inválido.', entityId: entry.id });
            if (Number(entry.hashVersion) === 2 && await calculateLedgerHash(entry) !== entry.integrityHash)
                findings.push({ id: 'hash:' + entry.id, severity: 'error', message: 'Conteúdo contabilístico adulterado ou hash inválido.', entityId: entry.id });
            if (!transactions.some(t => t.id === entry.id)) findings.push({ id: 'migration:' + entry.id, severity: 'warning', message: 'Lançamento histórico sem linhas de partidas dobradas; requer migração validada.', entityId: entry.id });
            previous = entry.integrityHash;
        }
        for (const payment of payments.filter(p => !p.deletedAt && p.status !== 'cancelled')) {
            if (!credits.some(c => c.id === payment.creditId)) findings.push({ id: 'orphan-payment:' + payment.id, severity: 'error', message: 'Pagamento sem crédito associado.', entityId: payment.id });
            const allocated = Number(payment.allocatedToPrincipalMinor || 0) + Number(payment.allocatedToInterestMinor || 0) + Number(payment.allocatedToLateInterestMinor || 0);
            if (payment.amountMinor != null && allocated !== Number(payment.amountMinor))
                findings.push({ id: 'allocation:' + payment.id, severity: 'error', message: 'Pagamento diferente da soma de capital, juros e mora.', entityId: payment.id });
        }
        for (const credit of credits.filter(c => !c.deletedAt && ['active','overdue','renegotiated','defaulted'].includes(c.status))) {
            if (!installments.some(i => i.creditId === credit.id)) findings.push({ id: 'schedule:' + credit.id, severity: 'warning', message: 'Crédito ativo sem plano de prestações gravado.', entityId: credit.id });
        }
        const ledgerPortfolio = lines.filter((l: LedgerLine) => l.account === 'portfolio').reduce((s: number,l: LedgerLine) => s + (l.side === 'debit' ? 1 : -1)*Number(l.amountMinor),0);
        const writtenOffIds = new Set(writeoffs.map(w=>String(w.creditId)));
        const portfolio = credits.filter(c => !c.deletedAt && !writtenOffIds.has(c.id) && !['pending_approval','rejected','cancelled'].includes(c.status))
            .reduce((s,c) => s + Number(c.currentBalanceMinor ?? Math.round(Number(c.currentBalance || 0)*100)),0);
        if (ledgerPortfolio !== portfolio) findings.push({ id: 'portfolio', severity: 'error', message: 'Saldo da carteira diferente do razão: diferença de ' + ((ledgerPortfolio-portfolio)/100).toFixed(2) + ' AOA.' });
        return { checkedAt: new Date().toISOString(), entries, transactions, lines: lines as LedgerLine[], findings, credits, payments, installments, auditLogs, writeoffs };
    }
}