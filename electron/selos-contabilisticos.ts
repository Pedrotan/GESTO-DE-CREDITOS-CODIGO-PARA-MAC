import * as crypto from 'crypto';
import * as fs from 'fs';
import { SEAL_GENESIS, sealPayload, type SealEntryRow, type SealLineRow, type SealVerification } from '../src/bibliotecas/selo-contabilistico';

// Selagem HMAC-SHA256 do razão no processo principal. A chave nunca passa para o renderer nem para a
// base de dados: fica num ficheiro próprio da pasta de dados do aplicativo, cifrado pelo sistema
// operativo (safeStorage) quando disponível.

type Query = (type: 'get' | 'query' | 'execute' | 'exec', sql: string, params?: unknown[]) => Promise<any>;
type Transaction = (statements: Array<{ sql: string; params?: unknown[] }>) => Promise<any>;
type SafeStorageLike = {
    isEncryptionAvailable: () => boolean;
    encryptString: (value: string) => Buffer;
    decryptString: (value: Buffer) => string;
};

export type LedgerSealOrigin = 'local' | 'remote' | 'legacy' | 'review';

const ENTRY_COLUMNS = `id, timestamp, type, debit, credit, clientId, creditId, paymentId, amountTotalMinor, amountPrincipalMinor,
    amountInterestMinor, amountLateInterestMinor, integrityHash, previousHash`;

export function createLedgerSealer(options: { query: Query; transaction: Transaction; keyPath: string; safeStorage: SafeStorageLike }) {
    let cachedKey: Buffer | null = null;
    let queue: Promise<unknown> = Promise.resolve();

    const loadKey = (): Buffer => {
        if (cachedKey) return cachedKey;
        const { keyPath, safeStorage } = options;
        if (fs.existsSync(keyPath)) {
            const raw = fs.readFileSync(keyPath);
            const text = raw.toString('utf8');
            if (text.startsWith('plain:v1:')) cachedKey = Buffer.from(text.slice('plain:v1:'.length).trim(), 'base64');
            else cachedKey = Buffer.from(safeStorage.decryptString(raw), 'base64');
        } else {
            const key = crypto.randomBytes(32);
            const encoded = key.toString('base64');
            const data = safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(encoded) : Buffer.from(`plain:v1:${encoded}`, 'utf8');
            fs.writeFileSync(keyPath, data, { mode: 0o600 });
            cachedKey = key;
        }
        if (!cachedKey || cachedKey.length !== 32) throw new Error('Chave de selagem contabilística inválida.');
        return cachedKey;
    };

    const fingerprint = () => crypto.createHash('sha256').update(loadKey()).digest('hex').slice(0, 12);
    const hmac = (payload: string) => crypto.createHmac('sha256', loadKey()).update(payload).digest('hex');

    const linesOf = async (entryId: string): Promise<SealLineRow[]> =>
        (await options.query('query', 'SELECT id, account, side, component, amountMinor FROM ledger_lines WHERE transactionId = ? ORDER BY id', [entryId])) || [];

    // As operações de selagem e verificação correm em fila: nunca há duas cadeias calculadas ao mesmo tempo.
    const exclusive = <T>(task: () => Promise<T>): Promise<T> => {
        const run = queue.then(task, task);
        queue = run.catch(() => undefined);
        return run;
    };

    const tableReady = async () => {
        const row = await options.query('get', "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'accounting_entry_seals'");
        return Boolean(row?.name);
    };

    /** Sela os lançamentos ainda sem selo, pela ordem de inserção. */
    const sealPending = (origin: LedgerSealOrigin) => exclusive(async () => {
        if (!(await tableReady())) return 0;
        const pending: SealEntryRow[] = await options.query('query', `SELECT ${ENTRY_COLUMNS} FROM accounting_entries
            WHERE id NOT IN (SELECT entryId FROM accounting_entry_seals) ORDER BY rowid`) || [];
        if (!pending.length) return 0;
        const last = await options.query('get', 'SELECT hmac FROM accounting_entry_seals ORDER BY seq DESC LIMIT 1');
        let previous = last?.hmac || SEAL_GENESIS;
        const sealedAt = new Date().toISOString();
        const statements: Array<{ sql: string; params: unknown[] }> = [];
        for (const entry of pending) {
            const value = hmac(sealPayload(entry, await linesOf(entry.id), previous));
            statements.push({
                sql: 'INSERT INTO accounting_entry_seals (entryId, hmac, previousHmac, origin, sealedAt) VALUES (?, ?, ?, ?, ?)',
                params: [entry.id, value, previous, origin, sealedAt],
            });
            previous = value;
        }
        await options.transaction(statements);
        return statements.length;
    });

    /** Primeira activação: sela o histórico existente como "legado" (a cadeia SHA-256 continua a cobri-lo). */
    const initialize = () => exclusive(async () => {
        if (!(await tableReady())) return { initialized: false };
        loadKey();
        const count = await options.query('get', 'SELECT COUNT(*) AS total FROM accounting_entry_seals');
        return { initialized: true, empty: Number(count?.total || 0) === 0 };
    }).then(async state => {
        if (state.initialized && (state as any).empty) await sealPending('legacy');
        return state;
    });

    const verify = () => exclusive(async (): Promise<SealVerification> => {
        const checkedAt = new Date().toISOString();
        if (!(await tableReady())) {
            return { available: false, reason: 'Tabela de selos ainda não criada.', sealedCount: 0, tampered: [], broken: [], missing: [], unsealed: [], checkedAt };
        }
        const seals: Array<{ entryId: string; hmac: string; previousHmac: string }> =
            await options.query('query', 'SELECT entryId, hmac, previousHmac FROM accounting_entry_seals ORDER BY seq') || [];
        const entries: SealEntryRow[] = await options.query('query', `SELECT ${ENTRY_COLUMNS} FROM accounting_entries ORDER BY rowid`) || [];
        const byId = new Map(entries.map(entry => [entry.id, entry]));
        const result: SealVerification = { available: true, sealedCount: seals.length, keyFingerprint: fingerprint(), tampered: [], broken: [], missing: [], unsealed: [], checkedAt };
        let previous = SEAL_GENESIS;
        for (const seal of seals) {
            if (seal.previousHmac !== previous) result.broken.push(seal.entryId);
            const entry = byId.get(seal.entryId);
            if (!entry) result.missing.push(seal.entryId);
            else if (hmac(sealPayload(entry, await linesOf(entry.id), seal.previousHmac)) !== seal.hmac) result.tampered.push(seal.entryId);
            previous = seal.hmac;
        }
        const sealed = new Set(seals.map(seal => seal.entryId));
        result.unsealed = entries.filter(entry => !sealed.has(entry.id)).map(entry => entry.id);
        return result;
    });

    return { sealPending, initialize, verify, fingerprint };
}
