import { RepositorioContabilidade } from '@/repositorios/RepositorioContabilidade';
import { AccountingEntry } from '@/tipos/credito';
import { calculateLedgerHash, toMinorUnits } from '@/bibliotecas/ledger-financeiro';
import { db } from '@/bibliotecas/bd';

const mapEntry = (entry: any): AccountingEntry => ({
    ...entry,
    timestamp: new Date(entry.timestamp),
    amountPrincipal: entry.amountPrincipalMinor == null ? entry.amountPrincipal : Number(entry.amountPrincipalMinor) / 100,
    amountInterest: entry.amountInterestMinor == null ? entry.amountInterest : Number(entry.amountInterestMinor) / 100,
    amountLateInterest: entry.amountLateInterestMinor == null ? entry.amountLateInterest : Number(entry.amountLateInterestMinor) / 100,
    amountTotal: entry.amountTotalMinor == null ? entry.amountTotal : Number(entry.amountTotalMinor) / 100
});

export class ServicoContabilidade {
    static async getAll(): Promise<AccountingEntry[]> {
        const rows = await RepositorioContabilidade.findAll();
        return rows.map(mapEntry);
    }

    static async getPaged(limit: number = 50, lastTimestamp?: string, lastId?: string): Promise<AccountingEntry[]> {
        const rows = await RepositorioContabilidade.findPaged(limit, lastTimestamp, lastId);
        return rows.map(mapEntry);
    }

    static async createEntry(entry: Omit<AccountingEntry, 'id' | 'timestamp' | 'integrityHash' | 'previousHash'>): Promise<AccountingEntry> {
        const id = crypto.randomUUID();
        const timestamp = (entry as any).timestamp ? new Date((entry as any).timestamp) : new Date();
        const previousHash = await this.getNextPreviousHash();

        const amountPrincipalMinor = toMinorUnits(entry.amountPrincipal, 'Capital');
        const amountInterestMinor = toMinorUnits(entry.amountInterest, 'Juro');
        const amountLateInterestMinor = toMinorUnits(entry.amountLateInterest, 'Juro de mora');
        const amountTotalMinor = toMinorUnits(entry.amountTotal, 'Total');
        if (entry.type !== 'adjustment' || entry.debit !== 'expenses' || !['cash', 'bank'].includes(entry.credit)) {
            throw new Error('O lançamento manual deve corresponder a uma despesa paga por caixa ou banco.');
        }
        if (!entry.description?.trim() || !entry.processedBy?.trim() || amountTotalMinor <= 0 ||
            amountPrincipalMinor !== 0 || amountInterestMinor !== 0 || amountLateInterestMinor !== 0) {
            throw new Error('Despesa inválida: indique descrição, responsável e valor positivo.');
        }
        if (amountPrincipalMinor + amountInterestMinor + amountLateInterestMinor > amountTotalMinor) {
            throw new Error('Os componentes do lançamento excedem o total.');
        }
        const unsignedEntry = {
            ...entry,
            id,
            timestamp,
            previousHash,
            amountPrincipalMinor,
            amountInterestMinor,
            amountLateInterestMinor,
            amountTotalMinor,
            hashVersion: 2
        };
        const newEntry: AccountingEntry = {
            ...unsignedEntry,
            integrityHash: await calculateLedgerHash(unsignedEntry)
        };

        const timestampIso = timestamp.toISOString();
        await db.transaction([
            { ...RepositorioContabilidade.buildInsertStatement(newEntry), expectChanges: 1 },
            {
                sql: `INSERT INTO ledger_transactions
                      (id, timestamp, type, sourceType, sourceId, description, totalDebitMinor,
                       totalCreditMinor, integrityHash, previousHash, hashVersion, usuario_id)
                      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
                params: [id, timestampIso, 'adjustment', 'expense', id, entry.description,
                    amountTotalMinor, amountTotalMinor, newEntry.integrityHash, previousHash, 2, entry.usuario_id || null],
                expectChanges: 1
            },
            {
                sql: `INSERT INTO ledger_lines (id, transactionId, account, side, component, amountMinor)
                      VALUES (?,?,?,?,?,?)`,
                params: [`${id}:line:1`, id, 'expenses', 'debit', 'expense', amountTotalMinor],
                expectChanges: 1
            },
            {
                sql: `INSERT INTO ledger_lines (id, transactionId, account, side, component, amountMinor)
                      VALUES (?,?,?,?,?,?)`,
                params: [`${id}:line:2`, id, entry.credit, 'credit', 'settlement', amountTotalMinor],
                expectChanges: 1
            },
            {
                sql: `INSERT INTO audit_logs (id, timestamp, userId, userName, action, entity, details, metadata)
                      VALUES (?, ?, ?, ?, 'create', 'accounting_entry', ?, ?)`,
                params: [crypto.randomUUID(), timestampIso, entry.usuario_id || null, entry.processedBy,
                    `Despesa ${id} registada`, JSON.stringify({ accountingEntryId: id, amountTotalMinor })],
                expectChanges: 1
            }
        ]);
        return newEntry;
    }

    static async getNextPreviousHash(): Promise<string> {
        const lastEntry = await RepositorioContabilidade.findLastEntry();
        return lastEntry?.integrityHash || '0'.repeat(64);
    }
}




