import { RepositorioContabilidade } from '@/repositorios/RepositorioContabilidade';
import { AccountingEntry } from '@/tipos/credito';
import { calculateLedgerHash, toMinorUnits } from '@/bibliotecas/ledger-financeiro';

export class ServicoContabilidade {
    static async getAll(): Promise<AccountingEntry[]> {
        const rows = await RepositorioContabilidade.findAll();
        return rows.map(e => ({ ...e, timestamp: new Date(e.timestamp) }));
    }

    static async getPaged(limit: number = 50, lastTimestamp?: string, lastId?: string): Promise<AccountingEntry[]> {
        const rows = await RepositorioContabilidade.findPaged(limit, lastTimestamp, lastId);
        return rows.map(e => ({ ...e, timestamp: new Date(e.timestamp) }));
    }

    static async createEntry(entry: Omit<AccountingEntry, 'id' | 'timestamp' | 'integrityHash' | 'previousHash'>): Promise<AccountingEntry> {
        const id = crypto.randomUUID();
        const timestamp = (entry as any).timestamp ? new Date((entry as any).timestamp) : new Date();
        const previousHash = await this.getNextPreviousHash();

        const amountPrincipalMinor = toMinorUnits(entry.amountPrincipal, 'Capital');
        const amountInterestMinor = toMinorUnits(entry.amountInterest, 'Juro');
        const amountLateInterestMinor = toMinorUnits(entry.amountLateInterest, 'Juro de mora');
        const amountTotalMinor = toMinorUnits(entry.amountTotal, 'Total');
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

        await RepositorioContabilidade.insert(newEntry);
        return newEntry;
    }

    static async getNextPreviousHash(): Promise<string> {
        const lastEntry = await RepositorioContabilidade.findLastEntry();
        return lastEntry?.integrityHash || '0'.repeat(64);
    }
}




