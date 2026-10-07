import * as crypto from 'crypto';
import * as fs from 'fs';

// Selagem HMAC-SHA256 dos registos de auditoria no processo principal. Complementa a cadeia SHA-256 da
// base de dados: quem tiver acesso de administrador à base pode recalcular hashes, mas não tem a chave
// secreta, que fica num ficheiro próprio da pasta de dados (cifrado pelo sistema operativo quando possível).

type Query = (type: 'get' | 'query' | 'execute' | 'exec', sql: string, params?: unknown[]) => Promise<any>;
type Transaction = (statements: Array<{ sql: string; params?: unknown[] }>) => Promise<any>;
type SafeStorageLike = { isEncryptionAvailable: () => boolean; encryptString: (value: string) => Buffer; decryptString: (value: Buffer) => string };

export type AuditSealVerification = {
    available: boolean; reason?: string; sealedCount: number; keyFingerprint?: string;
    tampered: string[]; broken: string[]; missing: string[]; unsealed: number; checkedAt: string;
};

const GENESIS = '0'.repeat(64);
const COLUMNS = 'id, timestamp, userId, userName, action, entity, details, previousState, newState, metadata';
const SCHEMA = [
    `CREATE TABLE IF NOT EXISTS audit_entry_seals (seq INTEGER PRIMARY KEY AUTOINCREMENT, auditId TEXT NOT NULL UNIQUE, hmac TEXT NOT NULL,
        previousHmac TEXT NOT NULL, sealedAt TEXT NOT NULL)`,
    `CREATE TRIGGER IF NOT EXISTS trg_audit_entry_seals_update BEFORE UPDATE ON audit_entry_seals BEGIN SELECT RAISE(ABORT, 'Os selos da auditoria são imutáveis'); END`,
    `CREATE TRIGGER IF NOT EXISTS trg_audit_entry_seals_delete BEFORE DELETE ON audit_entry_seals BEGIN SELECT RAISE(ABORT, 'Os selos da auditoria são imutáveis'); END`,
];

export const auditSealPayload = (row: Record<string, unknown>, previous: string) =>
    JSON.stringify([row.id, row.timestamp, row.userId, row.userName, row.action, row.entity, row.details, row.previousState, row.newState, row.metadata, previous].map(value => value ?? null));

export function createAuditSealer(options: { query: Query; transaction: Transaction; keyPath: string; safeStorage: SafeStorageLike }) {
    let cachedKey: Buffer | null = null;
    let queue: Promise<unknown> = Promise.resolve();
    let schemaReady = false;

    const loadKey = (): Buffer => {
        if (cachedKey) return cachedKey;
        if (fs.existsSync(options.keyPath)) {
            const raw = fs.readFileSync(options.keyPath);
            const text = raw.toString('utf8');
            cachedKey = text.startsWith('plain:v1:') ? Buffer.from(text.slice(9).trim(), 'base64') : Buffer.from(options.safeStorage.decryptString(raw), 'base64');
        } else {
            const key = crypto.randomBytes(32);
            const encoded = key.toString('base64');
            const data = options.safeStorage.isEncryptionAvailable() ? options.safeStorage.encryptString(encoded) : Buffer.from(`plain:v1:${encoded}`, 'utf8');
            fs.writeFileSync(options.keyPath, data, { mode: 0o600 });
            cachedKey = key;
        }
        if (!cachedKey || cachedKey.length !== 32) throw new Error('Chave de selagem da auditoria inválida.');
        return cachedKey;
    };
    const hmac = (payload: string) => crypto.createHmac('sha256', loadKey()).update(payload).digest('hex');
    const exclusive = <T>(task: () => Promise<T>): Promise<T> => { const run = queue.then(task, task); queue = run.catch(() => undefined); return run; };
    const ensureSchema = async () => {
        if (schemaReady) return true;
        const table = await options.query('get', "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'audit_logs'");
        if (!table?.name) return false;
        for (const statement of SCHEMA) await options.query('exec', statement);
        schemaReady = true;
        return true;
    };

    /** Sela os registos ainda sem selo, pela ordem de inserção. */
    const sealPending = () => exclusive(async () => {
        if (!(await ensureSchema())) return 0;
        const pending: Array<Record<string, unknown>> = await options.query('query', `SELECT ${COLUMNS} FROM audit_logs
            WHERE id NOT IN (SELECT auditId FROM audit_entry_seals) ORDER BY rowid LIMIT 5000`) || [];
        if (!pending.length) return 0;
        const last = await options.query('get', 'SELECT hmac FROM audit_entry_seals ORDER BY seq DESC LIMIT 1');
        let previous = last?.hmac || GENESIS;
        const sealedAt = new Date().toISOString();
        const statements = pending.map(row => {
            const value = hmac(auditSealPayload(row, previous));
            const statement = { sql: 'INSERT INTO audit_entry_seals (auditId, hmac, previousHmac, sealedAt) VALUES (?, ?, ?, ?)', params: [row.id, value, previous, sealedAt] };
            previous = value;
            return statement;
        });
        await options.transaction(statements);
        return statements.length;
    });

    const verify = () => exclusive(async (): Promise<AuditSealVerification> => {
        const checkedAt = new Date().toISOString();
        if (!(await ensureSchema())) return { available: false, reason: 'A tabela de auditoria ainda não existe.', sealedCount: 0, tampered: [], broken: [], missing: [], unsealed: 0, checkedAt };
        const seals: Array<{ auditId: string; hmac: string; previousHmac: string }> = await options.query('query', 'SELECT auditId, hmac, previousHmac FROM audit_entry_seals ORDER BY seq') || [];
        const rows: Array<Record<string, unknown>> = await options.query('query', `SELECT ${COLUMNS} FROM audit_logs`) || [];
        const byId = new Map(rows.map(row => [String(row.id), row]));
        const result: AuditSealVerification = { available: true, sealedCount: seals.length, keyFingerprint: crypto.createHash('sha256').update(loadKey()).digest('hex').slice(0, 12), tampered: [], broken: [], missing: [], unsealed: 0, checkedAt };
        let previous = GENESIS;
        for (const seal of seals) {
            if (seal.previousHmac !== previous) result.broken.push(seal.auditId);
            const row = byId.get(seal.auditId);
            if (!row) result.missing.push(seal.auditId);
            else if (hmac(auditSealPayload(row, seal.previousHmac)) !== seal.hmac) result.tampered.push(seal.auditId);
            previous = seal.hmac;
        }
        const sealed = new Set(seals.map(seal => seal.auditId));
        result.unsealed = rows.filter(row => !sealed.has(String(row.id))).length;
        return result;
    });

    return { sealPending, verify };
}
