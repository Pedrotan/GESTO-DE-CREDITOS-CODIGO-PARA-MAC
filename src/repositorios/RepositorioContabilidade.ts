import { RepositorioBase } from './RepositorioBase';
import { AccountingEntry } from '@/tipos/credito';

export class RepositorioContabilidade extends RepositorioBase {
    static async findAll(): Promise<any[]> {
        return await this.query('SELECT rowid AS ledgerSequence, * FROM accounting_entries ORDER BY rowid ASC');
    }

    static async findLastEntry(): Promise<{ integrityHash: string } | null> {
        return await this.get<{ integrityHash: string }>('SELECT integrityHash FROM accounting_entries ORDER BY rowid DESC LIMIT 1');
    }

    static async findPaged(limit: number, lastTimestamp?: string, lastId?: string): Promise<any[]> {
        if (!lastTimestamp || !lastId) {
            return await this.query('SELECT * FROM accounting_entries ORDER BY timestamp DESC, id DESC LIMIT ?', [limit]);
        }
        const sql = `
            SELECT * FROM accounting_entries 
            WHERE timestamp < ? OR (timestamp = ? AND id < ?)
            ORDER BY timestamp DESC, id DESC 
            LIMIT ?
        `;
        return await this.query(sql, [lastTimestamp, lastTimestamp, lastId, limit]);
    }

    static async insert(entry: AccountingEntry): Promise<void> {
        const sql = `INSERT INTO accounting_entries
            (id, timestamp, type, description, clientId, creditId, paymentId, debit, credit,
             amountPrincipal, amountInterest, amountLateInterest, amountTotal,
             amountPrincipalMinor, amountInterestMinor, amountLateInterestMinor, amountTotalMinor,
             processedBy, justification, integrityHash, previousHash, hashVersion, usuario_id)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`;
        const params = [
            entry.id,
            (entry.timestamp && !isNaN(entry.timestamp.getTime())) ? entry.timestamp.toISOString() : new Date().toISOString(),
            entry.type, entry.description,
            entry.clientId, entry.creditId, entry.paymentId, entry.debit, entry.credit,
            entry.amountPrincipal, entry.amountInterest, entry.amountLateInterest,
            entry.amountTotal, entry.amountPrincipalMinor, entry.amountInterestMinor,
            entry.amountLateInterestMinor, entry.amountTotalMinor,
            entry.processedBy, entry.justification,
            entry.integrityHash, entry.previousHash, entry.hashVersion || 2,
            entry.usuario_id
        ];
        await this.execute(sql, params);
    }
}




