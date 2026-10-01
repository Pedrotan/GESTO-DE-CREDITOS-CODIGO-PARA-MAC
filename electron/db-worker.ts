import { parentPort, workerData } from 'worker_threads';
import Database from 'better-sqlite3-multiple-ciphers';
import path from 'path';
import fs from 'fs';
import { LEDGER_PROTECTION_SQL } from '../src/bibliotecas/esquema-ledger';

const {
    dbPath,
    encryptionKey,
    encryptionKeys,
    logPath: workerLogPath
} = workerData;

const LOG_FILE = workerLogPath || path.join(process.cwd(), 'db-worker.log');

function log(message: string, data?: any) {
    const timestamp = new Date().toISOString();
    const logLine = `[${timestamp}] ${message} ${data ? JSON.stringify(data) : ''}\n`;
    try {
        fs.appendFileSync(LOG_FILE, logLine);
    } catch {
        // ignore logging errors
    }
}

log('Worker started');

if (!parentPort) {
    log('Error: Not running as worker thread');
    throw new Error('This file must be run as a worker thread');
}

const keyCandidates = Array.from(new Set(
    [
        ...(Array.isArray(encryptionKeys) ? encryptionKeys : []),
        encryptionKey
    ].filter((key): key is string => typeof key === 'string' && key.length > 0)
));

log('Worker data received', { dbPath, keyCandidates: keyCandidates.length });

let db: any;
let encryptionActive = false;
let activeEncryptionProfile = 'plain';
let activeKeyIndex = -1;

type EncryptionProfile = {
    name: string;
    pragmas: string[];
};

const encryptionProfiles: EncryptionProfile[] = [
    { name: 'default', pragmas: [] },
    { name: 'chacha20', pragmas: ["cipher = 'chacha20'"] },
    { name: 'chacha20-sqleet-legacy', pragmas: ["cipher = 'chacha20'", 'legacy = 1'] },
    { name: 'sqlcipher-legacy-4', pragmas: ["cipher = 'sqlcipher'", 'legacy = 4'] },
    { name: 'sqlcipher-legacy-3', pragmas: ["cipher = 'sqlcipher'", 'legacy = 3'] },
    { name: 'sqlcipher-legacy-1', pragmas: ["cipher = 'sqlcipher'", 'legacy = 1'] },
    { name: 'sqlcipher-modern', pragmas: ["cipher = 'sqlcipher'"] },
    { name: 'aes128cbc', pragmas: ["cipher = 'aes128cbc'"] },
    { name: 'aes256cbc', pragmas: ["cipher = 'aes256cbc'"] },
    { name: 'rc4', pragmas: ["cipher = 'rc4'"] },
    { name: 'ascon128', pragmas: ["cipher = 'ascon128'"] },
    { name: 'aegis', pragmas: ["cipher = 'aegis'"] }
];

type DbOperationType = 'execute' | 'query' | 'get' | 'exec';
type DbTransactionStatement = {
    sql: string;
    params?: unknown[];
    type?: 'execute' | 'exec';
    expectChanges?: number;
};

const MAX_SQL_LENGTH = 200_000;
const MAX_SQL_STATEMENTS = 100;
const MAX_TRANSACTION_STATEMENTS = 1_000;
const MAX_PARAM_COUNT = 500;
const MAX_STRING_PARAM_LENGTH = 1_000_000;
const FORBIDDEN_SQL_PATTERN = /\b(ATTACH|DETACH|LOAD_EXTENSION)\b|\bPRAGMA\s+(key|rekey|hexkey|textkey|cipher|cipher_|legacy)\b/i;
const READ_KEYWORDS = new Set(['SELECT', 'WITH', 'PRAGMA']);
const WRITE_KEYWORDS = new Set(['INSERT', 'UPDATE', 'DELETE', 'REPLACE', 'CREATE', 'ALTER', 'DROP', 'VACUUM', 'REINDEX', 'ANALYZE', 'PRAGMA']);
const EXEC_KEYWORDS = new Set([...READ_KEYWORDS, ...WRITE_KEYWORDS]);
const ALLOWED_READ_PRAGMAS = new Set([
    'table_info',
    'table_xinfo',
    'index_list',
    'index_info',
    'index_xinfo',
    'foreign_key_list',
    'integrity_check',
    'quick_check',
    'database_list',
    'user_version'
]);
const ALLOWED_WRITE_PRAGMAS = new Set(['optimize', 'wal_checkpoint', 'user_version']);

function closeDatabase(candidate: any) {
    try {
        candidate?.close?.();
    } catch {
        // ignore close errors during startup fallback
    }
}

function quotePragmaValue(value: string) {
    return `'${value.replace(/'/g, "''")}'`;
}

const stripSqlComments = (sql: string) => sql
    .replace(/--.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .trim();

function splitSqlStatements(sql: string) {
    const statements: string[] = [];
    let current = '';
    let quote: '"' | "'" | '`' | ']' | null = null;

    for (let i = 0; i < sql.length; i++) {
        const char = sql[i];
        const next = sql[i + 1];
        current += char;

        if (quote) {
            if (quote === "'" && char === "'" && next === "'") {
                current += next;
                i++;
                continue;
            }
            if ((quote === '"' && char === '"') || (quote === "'" && char === "'") || (quote === '`' && char === '`') || (quote === ']' && char === ']')) {
                quote = null;
            }
            continue;
        }

        if (char === '-' && next === '-') {
            while (i + 1 < sql.length && sql[i + 1] !== '\n') current += sql[++i];
            continue;
        }

        if (char === '/' && next === '*') {
            current += next;
            i++;
            while (i + 1 < sql.length && !(sql[i] === '*' && sql[i + 1] === '/')) current += sql[++i];
            if (i + 1 < sql.length) current += sql[++i];
            continue;
        }

        if (char === '"' || char === "'" || char === '`') {
            quote = char;
            continue;
        }
        if (char === '[') {
            quote = ']';
            continue;
        }
        if (char === ';') {
            // A trigger body contains an internal semicolon. Ledger triggers are
            // delivered one at a time and validated against an exact allowlist.
            if (/^\s*CREATE\s+TRIGGER\b/i.test(current)) continue;
            const statement = current.slice(0, -1).trim();
            if (statement) statements.push(statement);
            current = '';
        }
    }

    const tail = current.trim();
    if (tail) statements.push(tail);
    return statements;
}

const getSqlKeyword = (statement: string) => {
    const match = stripSqlComments(statement).match(/^([a-z_]+)/i);
    return (match?.[1] || '').toUpperCase();
};

const getPragmaName = (statement: string) => {
    const match = stripSqlComments(statement).match(/^PRAGMA\s+(?:main\.)?([a-z_][\w]*)/i);
    return (match?.[1] || '').toLowerCase();
};

const isSafeReadStatement = (statement: string) => {
    const keyword = getSqlKeyword(statement);
    if (!READ_KEYWORDS.has(keyword)) return false;
    if (keyword === 'PRAGMA') return ALLOWED_READ_PRAGMAS.has(getPragmaName(statement));
    if (keyword === 'WITH') {
        return !/\b(INSERT|UPDATE|DELETE|REPLACE|CREATE|ALTER|DROP|VACUUM|REINDEX|ANALYZE|PRAGMA)\b/i.test(stripSqlComments(statement));
    }
    return true;
};

const isAllowedWriteStatement = (statement: string) => {
    const cleaned = stripSqlComments(statement);
    const keyword = getSqlKeyword(cleaned);
    if (!WRITE_KEYWORDS.has(keyword)) return false;
    if (keyword === 'PRAGMA') {
        const pragmaName = getPragmaName(cleaned);
        return ALLOWED_READ_PRAGMAS.has(pragmaName) || ALLOWED_WRITE_PRAGMAS.has(pragmaName);
    }
    if (keyword === 'CREATE') {
        if (/^CREATE\s+(UNIQUE\s+)?(TABLE|INDEX)\b/i.test(cleaned)) return true;
        const normalized = cleaned.replace(/\s+/g, ' ').trim();
        return LEDGER_PROTECTION_SQL.some(allowed => allowed.replace(/\s+/g, ' ').trim() === normalized);
    }
    if (keyword === 'DROP') {
        // Allow DROP TABLE for migration renames (tables ending with _old)
        if (/^DROP\s+TABLE\s+(IF\s+EXISTS\s+)?(?:"|'|`|\[)?[a-z0-9_]+_old(?:"|'|`|\])?\s*$/i.test(cleaned)) return true;
        // Allow DROP INDEX IF EXISTS (needed for recreating unique indexes during migrations)
        if (/^DROP\s+INDEX\s+IF\s+EXISTS\s+/i.test(cleaned)) return true;
        return false;
    }
    if (keyword === 'DELETE' && /\bFROM\s+sqlite_(master|schema)\b/i.test(cleaned)) return false;
    return true;
};

const sanitizeSql = (sql: unknown) => {
    if (typeof sql !== 'string') throw new TypeError('SQL invalido.');
    const normalized = sql.trim();
    if (!normalized) throw new Error('SQL vazio.');
    if (normalized.length > MAX_SQL_LENGTH) throw new Error('SQL demasiado grande.');
    if (FORBIDDEN_SQL_PATTERN.test(normalized)) throw new Error('Instrucao SQLite bloqueada.');
    return normalized;
};

const sanitizeSqlParams = (params: unknown = []) => {
    if (params == null) return [];
    if (!Array.isArray(params)) throw new TypeError('Parametros SQL devem ser array.');
    if (params.length > MAX_PARAM_COUNT) throw new Error('Demasiados parametros SQL.');

    return params.map((value) => {
        if (value === undefined) return null;
        if (value === null || typeof value === 'number' || typeof value === 'boolean') return value;
        if (typeof value === 'string') {
            if (value.length > MAX_STRING_PARAM_LENGTH) throw new Error('Parametro SQL textual demasiado grande.');
            return value;
        }
        if (Buffer.isBuffer(value)) return value;
        if (value instanceof Uint8Array) return Buffer.from(value);
        if (value instanceof ArrayBuffer) return Buffer.from(value);
        throw new TypeError('Parametro SQL nao suportado.');
    });
};

const validateSqlRequest = (type: DbOperationType, sql: unknown, params: unknown = []) => {
    const normalizedSql = sanitizeSql(sql);
    const statements = LEDGER_PROTECTION_SQL.some(allowed =>
        allowed.replace(/\s+/g, ' ').trim() === normalizedSql.replace(/\s+/g, ' ').trim()
    ) ? [normalizedSql] : splitSqlStatements(normalizedSql);

    if (statements.length === 0) throw new Error('SQL vazio.');
    if (type !== 'exec' && statements.length !== 1) throw new Error('Use transacoes para multiplas instrucoes SQL.');
    if (statements.length > MAX_SQL_STATEMENTS) throw new Error('SQL contem demasiadas instrucoes.');

    for (const statement of statements) {
        const keyword = getSqlKeyword(statement);
        if (type === 'query' || type === 'get') {
            if (!isSafeReadStatement(statement)) throw new Error('Leituras aceitam apenas SELECT, WITH seguro ou PRAGMA de leitura.');
        } else if (type === 'execute') {
            if (!isAllowedWriteStatement(statement)) throw new Error(`Instrucao ${keyword || 'SQL'} nao permitida em escrita.`);
        } else if (!EXEC_KEYWORDS.has(keyword) || (!isSafeReadStatement(statement) && !isAllowedWriteStatement(statement))) {
            throw new Error(`Instrucao ${keyword || 'SQL'} nao permitida em execucao.`);
        }
    }

    return { sql: normalizedSql, params: sanitizeSqlParams(params) };
};

const validateTransactionStatements = (statements: unknown): DbTransactionStatement[] => {
    if (!Array.isArray(statements)) throw new TypeError('Transacao invalida.');
    if (statements.length === 0) throw new Error('Transacao vazia.');
    if (statements.length > MAX_TRANSACTION_STATEMENTS) throw new Error('Transacao com demasiadas instrucoes.');

    return statements.map((statement) => {
        if (!statement || typeof statement !== 'object') throw new TypeError('Instrucao de transacao invalida.');
        const item = statement as DbTransactionStatement;
        const type = item.type === 'exec' ? 'exec' : 'execute';
        const validated = validateSqlRequest(type, item.sql, item.params);
        if (item.expectChanges !== undefined && (!Number.isSafeInteger(item.expectChanges) || item.expectChanges < 0 || item.expectChanges > 1_000_000)) {
            throw new Error('Contagem esperada de alteracoes invalida.');
        }
        return { ...validated, type, expectChanges: item.expectChanges };
    });
};

function looksLikeOpenFailure(error: any) {
    const message = String(error?.message || '');
    return /file is not a database|not a database|database disk image is malformed|bad decrypt|bad key|no encryption key candidate|cannot open/i.test(message);
}

function applyPerformancePragmas(candidate: any) {
    log('Applying pragmas...');
    candidate.pragma('journal_mode = WAL');
    candidate.pragma('synchronous = NORMAL');
    candidate.pragma('foreign_keys = ON');
    candidate.pragma('cache_size = -128000'); // 128MB
    candidate.pragma('temp_store = MEMORY');
    candidate.pragma('mmap_size = 268435456');
    candidate.pragma('page_size = 4096');
    candidate.pragma('busy_timeout = 10000');
    candidate.pragma('wal_autocheckpoint = 1000');
    candidate.pragma('journal_size_limit = 67108864');
    log('Pragmas applied successfully');
}

function verifyDatabase(candidate: any, shouldVerifyEncryption: boolean) {
    log('Running integrity check (quick)...');
    const integrityResult = candidate.pragma('quick_check', { simple: true });
    if (integrityResult !== 'ok') {
        log('Database integrity check FAILED', { result: integrityResult });
        throw new Error('A verificacao de integridade da base de dados falhou.');
    }
    log('Database integrity check finished');

    if (shouldVerifyEncryption) {
        const cipherVersion = candidate.pragma('cipher_version', { simple: true });
        log('Database encryption status', { cipherVersion: cipherVersion || null });
    }
}

function validateCanRead(candidate: any) {
    candidate.prepare('SELECT count(*) AS total FROM sqlite_master').get();
}

function openDatabaseWithOptions(key?: string, profile?: EncryptionProfile) {
    log('Initializing database connection...', {
        encrypted: !!key,
        profile: profile?.name || 'plain'
    });

    const candidate = new Database(dbPath);

    try {
        if (key) {
            for (const pragma of profile?.pragmas || []) {
                candidate.pragma(pragma);
            }
            candidate.pragma(`key = ${quotePragmaValue(key)}`);
        }

        validateCanRead(candidate);
        applyPerformancePragmas(candidate);
        verifyDatabase(candidate, !!key);
        return candidate;
    } catch (error) {
        closeDatabase(candidate);
        throw error;
    }
}

function copyIfExists(source: string, destination: string) {
    try {
        if (fs.existsSync(source)) fs.copyFileSync(source, destination);
    } catch (error: any) {
        log('Failed to copy migration backup part', { source, message: error.message });
    }
}

function migratePlainDatabaseToEncrypted(candidate: any, key: string) {
    if (!key) return false;

    const backupBasePath = `${dbPath}.plain-before-encryption-${new Date().toISOString().replace(/[:.]/g, '-')}.bak`;
    try {
        log('Migrating plain SQLite database to encrypted storage', { backupBasePath });
        try {
            candidate.pragma('wal_checkpoint(TRUNCATE)');
        } catch (error: any) {
            log('WAL checkpoint before encryption failed', { message: error.message });
        }

        copyIfExists(dbPath, backupBasePath);
        copyIfExists(`${dbPath}-wal`, `${backupBasePath}-wal`);
        copyIfExists(`${dbPath}-shm`, `${backupBasePath}-shm`);

        try {
            candidate.pragma('journal_mode = DELETE');
        } catch (error: any) {
            log('Could not switch journal mode before encryption', { message: error.message });
        }

        candidate.pragma(`rekey = ${quotePragmaValue(key)}`);
        validateCanRead(candidate);
        applyPerformancePragmas(candidate);
        verifyDatabase(candidate, true);
        log('Plain database encrypted successfully');
        return true;
    } catch (error: any) {
        log('Plain database encryption migration failed', { message: error.message, stack: error.stack });
        return false;
    }
}

function openEncryptedDatabase() {
    let lastError: any = null;

    for (let keyIndex = 0; keyIndex < keyCandidates.length; keyIndex++) {
        const key = keyCandidates[keyIndex];
        for (const profile of encryptionProfiles) {
            try {
                const candidate = openDatabaseWithOptions(key, profile);
                activeEncryptionProfile = profile.name;
                activeKeyIndex = keyIndex;
                return candidate;
            } catch (error: any) {
                lastError = error;
                log('Encrypted open attempt failed', {
                    keyIndex,
                    profile: profile.name,
                    message: error.message
                });
            }
        }
    }

    throw lastError || new Error('No encryption key candidate could open the database');
}

try {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
        log('Creating directory', dir);
        fs.mkdirSync(dir, { recursive: true });
    }

    const hadExistingDatabase = fs.existsSync(dbPath);

    if (keyCandidates.length > 0) {
        try {
            db = openEncryptedDatabase();
            encryptionActive = true;
        } catch (primaryError: any) {
            if (hadExistingDatabase && looksLikeOpenFailure(primaryError)) {
                log('Encrypted open failed; retrying as plain SQLite database', { message: primaryError.message });
                try {
                    db = openDatabaseWithOptions();
                    const migrated = migratePlainDatabaseToEncrypted(db, keyCandidates[0]);
                    encryptionActive = migrated;
                    activeEncryptionProfile = migrated ? 'default' : 'plain';
                    activeKeyIndex = migrated ? 0 : -1;
                    log('Plain SQLite database opened successfully', { encryptedAfterMigration: migrated });
                } catch (fallbackError: any) {
                    log('Both encrypted and plain open failed. Preserving database for recovery.', {
                        primaryError: primaryError.message,
                        fallbackError: fallbackError.message
                    });
                    throw new Error('A base de dados nao pode ser aberta. Os ficheiros foram preservados; restaure um backup valido ou use a chave original.');
                }
            } else {
                throw primaryError;
            }
        }
    } else {
        db = openDatabaseWithOptions();
    }

    log('[DB Worker] Database initialized at:', {
        dbPath,
        encrypted: encryptionActive,
        profile: activeEncryptionProfile,
        keyIndex: activeKeyIndex
    });
} catch (error: any) {
    log('Initialization error', { message: error.message, stack: error.stack });
    process.exit(1);
}

const runPreparedStatement = (statement: DbTransactionStatement) => {
    const requestType = statement.type === 'exec' ? 'exec' : 'execute';
    const { sql, params } = validateSqlRequest(requestType, statement.sql, statement.params);

    if (requestType === 'exec') {
        db.exec(sql);
        return { success: true };
    }

    const runResult = db.prepare(sql).run(...params);
    if (statement.expectChanges !== undefined && runResult.changes !== statement.expectChanges) {
        throw new Error(`Conflito de concorrencia: esperadas ${statement.expectChanges} alteracoes, obtidas ${runResult.changes}.`);
    }
    return { changes: runResult.changes, lastInsertRowid: runResult.lastInsertRowid };
};

parentPort.on('message', async (request) => {
    const { id, type, sql, params, statements, destination } = request;
    const startTime = Date.now();
    log(`[${id}] Recebido pedido: ${type}`, { sql: sql?.substring(0, 100) });

    try {
        let result;

        switch (type) {
            case 'execute': {
                const requestData = validateSqlRequest('execute', sql, params);
                const stmtExecute = db.prepare(requestData.sql);
                const runResult = stmtExecute.run(...requestData.params);
                result = { changes: runResult.changes, lastInsertRowid: runResult.lastInsertRowid };
                break;
            }
            case 'query': {
                const requestData = validateSqlRequest('query', sql, params);
                const stmtQuery = db.prepare(requestData.sql);
                result = stmtQuery.all(...requestData.params);
                break;
            }
            case 'get': {
                const requestData = validateSqlRequest('get', sql, params);
                const stmtGet = db.prepare(requestData.sql);
                result = stmtGet.get(...requestData.params);
                break;
            }
            case 'exec': {
                const requestData = validateSqlRequest('exec', sql);
                db.exec(requestData.sql);
                result = { success: true };
                break;
            }
            case 'transaction': {
                const safeStatements = validateTransactionStatements(statements);
                const executeTransaction = db.transaction((batch: DbTransactionStatement[]) => (
                    batch.map((statement) => runPreparedStatement(statement))
                ));
                result = executeTransaction(safeStatements);
                break;
            }
            case 'backup': {
                if (typeof destination !== 'string' || !destination.trim()) throw new Error('Destino de backup invalido.');
                const resolvedDestination = path.resolve(destination);
                if (resolvedDestination === path.resolve(dbPath)) {
                    throw new Error('O destino do backup nao pode ser a base de dados ativa.');
                }
                const destinationDir = path.dirname(resolvedDestination);
                if (!fs.existsSync(destinationDir)) throw new Error('A pasta de destino do backup nao existe.');
                fs.accessSync(destinationDir, fs.constants.W_OK);

                // The native backup API opens an unkeyed destination and cannot copy
                // encrypted databases. VACUUM INTO creates a consistent encrypted
                // snapshot (including WAL data), inheriting the connection's cipher.
                let progress;
                if (encryptionActive) {
                    try { db.prepare('VACUUM INTO ?').run(resolvedDestination); }
                    catch { throw new Error('Nao foi possivel criar o snapshot cifrado da base de dados.'); }
                    progress = { totalPages: db.pragma('page_count', { simple: true }), remainingPages: 0 };
                } else {
                    progress = await db.backup(resolvedDestination);
                }
                const stats = fs.statSync(resolvedDestination);
                if (!stats.isFile() || stats.size === 0 || progress?.remainingPages !== 0) {
                    throw new Error('O backup nao foi concluido corretamente.');
                }
                const verification = new Database(resolvedDestination, { readonly: true, fileMustExist: true });
                try {
                    if (encryptionActive) {
                        const profile = encryptionProfiles.find(item => item.name === activeEncryptionProfile);
                        for (const pragma of profile?.pragmas || []) verification.pragma(pragma);
                        verification.pragma(`key = ${quotePragmaValue(keyCandidates[activeKeyIndex])}`);
                    }
                    verifyDatabase(verification, encryptionActive);
                } finally { verification.close(); }
                result = {
                    success: true,
                    size: stats.size,
                    totalPages: progress.totalPages,
                    remainingPages: progress.remainingPages
                };
                break;
            }
            default:
                throw new Error(`Tipo de operacao desconhecido: ${type}`);
        }

        const duration = Date.now() - startTime;
        log(`[${id}] Pedido ${type} sucesso em ${duration}ms`);
        parentPort!.postMessage({ id, success: true, result });
    } catch (error: any) {
        const duration = Date.now() - startTime;
        log(`[${id}] Erro em ${type} apos ${duration}ms`, { message: error.message });
        parentPort!.postMessage({ id, success: false, error: error.message });
    }
});
