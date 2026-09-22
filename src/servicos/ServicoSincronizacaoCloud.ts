import { getScopedLocalStorageItem, scopedStorageKey } from '@/bibliotecas/contas';
import { sqlite, type SqlTransactionStatement } from '@/bibliotecas/adaptador-sqlite';
import { RENDERER_SQL_BY_ID, RENDERER_SQL_ID_BY_STATEMENT } from '../../electron/renderer-sql-allowlist.ts';

type SyncOperation = {
    id: string;
    deviceId: string;
    kind: 'statement' | 'snapshot';
    statementId?: string;
    table?: string;
    columns?: string[];
    params: any[];
    createdAt: string;
    commandVersion: 1;
    tenantId: string;
    entityId?: string;
    bootstrap?: boolean;
};

type CloudSyncConfig = {
    url: string;
    apiKey: string;
    tenantId: string;
    onRemoteApplied?: () => void | Promise<void>;
};

const DB_NAME = 'TangoCloudSyncQueue';
const STORE_NAME = 'operations';
const DEVICE_KEY = 'tango_cloud_device_id';
const CURSOR_KEY = 'cloud_sync_cursor_v1';
const BOOTSTRAP_KEY = 'cloud_sync_bootstrap_v1';
const MAX_PUSH_OPERATIONS = 100;
const MAX_PULL_ROUNDS = 10;
const SYNC_INTERVAL_MS = 30_000;
const SYNCABLE_SQL = /^\s*(INSERT|UPDATE|DELETE|REPLACE)\b/i;
const IGNORED_TABLES = new Set(['dictionary', 'sqlite_sequence', 'users', 'company_settings', 'payment_gateways', 'password_reset_requests']);
const FINANCIAL_TABLES = new Set(['credits', 'payments', 'accounting_entries', 'ledger_transactions', 'ledger_lines', 'credit_installments', 'credit_reinforcements']);

let activeConfig: CloudSyncConfig | null = null;
let syncPromise: Promise<{ success: boolean; pushed?: number; pulled?: number; message?: string }> | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let onlineHandler: (() => void) | null = null;
let writeHandler: (() => void) | null = null;
let syncDebounce: ReturnType<typeof setTimeout> | null = null;
let applyingRemote = false;

export const isCloudSyncUrl = (url?: string | null) => {
    if (!url) return false;
    try {
        const parsed = new URL(url);
        return parsed.protocol === 'https:';
    } catch {
        return false;
    }
};

const normalizeBaseUrl = (url: string) => {
    let value = url.trim().replace(/\/+$/, '');
    value = value.replace(/\/api\/sync$/i, '').replace(/\/sync$/i, '');
    return value;
};

const getDeviceId = () => {
    let value = localStorage.getItem(DEVICE_KEY);
    if (!value) {
        value = crypto.randomUUID();
        localStorage.setItem(DEVICE_KEY, value);
    }
    return value;
};

const openQueue = (): Promise<IDBDatabase> => new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(STORE_NAME)) {
            database.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
});

const putOperations = async (operations: SyncOperation[]) => {
    if (!operations.length) return;
    const database = await openQueue();
    await new Promise<void>((resolve, reject) => {
        const tx = database.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        operations.forEach(operation => store.put(operation));
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
    database.close();
};

const getQueuedOperations = async (limit = MAX_PUSH_OPERATIONS): Promise<SyncOperation[]> => {
    const database = await openQueue();
    const values = await new Promise<SyncOperation[]>((resolve, reject) => {
        const request = database.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).getAll();
        request.onsuccess = () => resolve((request.result || []).sort((a, b) => a.createdAt.localeCompare(b.createdAt)).slice(0, limit));
        request.onerror = () => reject(request.error);
    });
    database.close();
    return values;
};

const deleteQueuedOperations = async (ids: string[]) => {
    if (!ids.length) return;
    const database = await openQueue();
    await new Promise<void>((resolve, reject) => {
        const tx = database.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        ids.forEach(id => store.delete(id));
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
    database.close();
};

const isSyncableOperation = (sql: string) => {
    if (!SYNCABLE_SQL.test(sql)) return false;
    const match = sql.match(/(?:INTO|UPDATE|FROM)\s+["`\[]?([\w-]+)/i);
    return !match || !IGNORED_TABLES.has(match[1].toLowerCase());
};
const normalizeSql = (sql: string) => sql.replace(/--.*$/gmu, '').replace(/\/\*[\s\S]*?\*\//gu, '').replace(/\s+/gu, ' ').trim().replace(/;$/u, '');
const toStatementCommand = (sql: string, params: any[]): Omit<SyncOperation, 'id' | 'deviceId' | 'createdAt'> | null => {
    if (!isSyncableOperation(sql)) return null;
    const statementId = RENDERER_SQL_ID_BY_STATEMENT.get(normalizeSql(sql));
    if (!statementId) return null;
    const cleanParams = params.map(value => value === undefined ? null : value);
    const isInsert = /^\s*(?:INSERT|REPLACE)\b/iu.test(sql);
    return { kind: 'statement', statementId, params: cleanParams, commandVersion: 1,
        tenantId: activeConfig?.tenantId || '', entityId: String(cleanParams[isInsert ? 0 : cleanParams.length - 1] || '') };
};

export const enqueueSyncOperation = async (sql: string, params: any[] = [], type: 'execute' | 'exec' = 'execute') => {
    if (applyingRemote || !isSyncableOperation(sql)) return;
    if (getScopedLocalStorageItem('sync_enabled') !== 'true') return;
    if (!isCloudSyncUrl(getScopedLocalStorageItem('sync_url'))) return;

    const command = toStatementCommand(sql, params);
    if (!command) {
        console.warn('[CloudSync] Mutação sem comando versionado; sincronização recusada.');
        return;
    }
    await putOperations([{
        id: crypto.randomUUID(),
        deviceId: getDeviceId(),
        ...command,
        createdAt: new Date().toISOString()
    }]);
    window.dispatchEvent(new CustomEvent('tango-local-db-write'));
};

export const enqueueSyncTransaction = async (statements: SqlTransactionStatement[]) => {
    if (applyingRemote || getScopedLocalStorageItem('sync_enabled') !== 'true') return;
    if (!isCloudSyncUrl(getScopedLocalStorageItem('sync_url'))) return;

    const deviceId = getDeviceId();
    const now = Date.now();
    const operations = statements.map((statement, index): SyncOperation | null => {
        const command = toStatementCommand(statement.sql, statement.params || []);
        return command ? { id: crypto.randomUUID(), deviceId, ...command, createdAt: new Date(now + index).toISOString() } : null;
    }).filter((operation): operation is SyncOperation => Boolean(operation));
    await putOperations(operations);
    if (operations.length) window.dispatchEvent(new CustomEvent('tango-local-db-write'));
};

const bytesToBase64 = (bytes: Uint8Array) => {
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(binary);
};
const base64ToBytes = (value: string) => Uint8Array.from(atob(value), char => char.charCodeAt(0));

const deriveKey = async (secret: string, tenantId: string) => {
    const encoder = new TextEncoder();
    const material = await crypto.subtle.importKey('raw', encoder.encode(secret), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt: encoder.encode(`tango-sync:${tenantId}`), iterations: 120_000, hash: 'SHA-256' },
        material,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
    );
};

const encryptOperation = async (operation: SyncOperation, key: CryptoKey) => {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const plain = new TextEncoder().encode(JSON.stringify(operation));
    const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain));
    return `${bytesToBase64(iv)}.${bytesToBase64(encrypted)}`;
};

const decryptOperation = async (payload: string, key: CryptoKey): Promise<SyncOperation> => {
    const [ivValue, encryptedValue] = payload.split('.');
    if (!ivValue || !encryptedValue) throw new Error('Carga de sincronização inválida.');
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: base64ToBytes(ivValue) }, key, base64ToBytes(encryptedValue));
    return JSON.parse(new TextDecoder().decode(decrypted));
};

const quoteIdentifier = (value: string) => `"${value.replace(/"/g, '""')}"`;

const createBootstrapOperations = async () => {
    if (localStorage.getItem(scopedStorageKey(BOOTSTRAP_KEY)) === 'true') return;
    const tables = await sqlite.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
    const deviceId = getDeviceId();
    const operations: SyncOperation[] = [];
    let order = 0;

    for (const { name } of tables) {
        if (!/^[\w-]+$/u.test(name) || IGNORED_TABLES.has(name.toLowerCase())) continue;
        const rows = await sqlite.all<Record<string, any>>(`SELECT * FROM ${quoteIdentifier(name)}`);
        for (const row of rows) {
            const columns = Object.keys(row);
            if (!columns.length) continue;
            operations.push({
                id: crypto.randomUUID(),
                deviceId,
                kind: 'snapshot',
                table: name,
                columns,
                params: columns.map(column => row[column] ?? null),
                commandVersion: 1,
                tenantId: activeConfig?.tenantId || '',
                entityId: String(row.id || ''),
                createdAt: new Date(Date.now() + order++).toISOString(),
                bootstrap: true
            });
            if (operations.length >= 250) await putOperations(operations.splice(0));
        }
    }
    await putOperations(operations);
    localStorage.setItem(scopedStorageKey(BOOTSTRAP_KEY), 'true');
};

const applyOperations = async (operations: SyncOperation[]) => {
    const statements: SqlTransactionStatement[] = [];
    for (const operation of operations) {
        if (operation.commandVersion !== 1 || !activeConfig || operation.tenantId !== activeConfig.tenantId) continue;
        if (operation.kind === 'statement' && operation.statementId) {
            const sql = RENDERER_SQL_BY_ID.get(operation.statementId);
            const table = sql?.match(/(?:INTO|UPDATE|FROM)\s+["`\[]?([\w-]+)/iu)?.[1]?.toLowerCase();
            if (sql && table && FINANCIAL_TABLES.has(table)) {
                statements.push({
                    sql: `INSERT OR IGNORE INTO sync_conflicts (id, entityType, entityId, operation, status, createdAt)
                          VALUES (?, ?, ?, ?, 'pending', ?)`,
                    params: [operation.id, table, operation.entityId || null, JSON.stringify(operation), new Date().toISOString()]
                });
            } else if (sql && isSyncableOperation(sql)) statements.push({ sql, params: operation.params || [] });
            continue;
        }
        if (operation.kind === 'snapshot' && operation.table && Array.isArray(operation.columns) && operation.columns.length) {
            if (!/^[a-z_][a-z0-9_]*$/iu.test(operation.table) || IGNORED_TABLES.has(operation.table.toLowerCase())) continue;
            const tableInfo = await sqlite.all<{ name: string }>(`PRAGMA table_info(${quoteIdentifier(operation.table)})`);
            const allowed = new Set(tableInfo.map(column => column.name));
            if (!operation.columns.every(column => /^[a-z_][a-z0-9_]*$/iu.test(column) && allowed.has(column))) continue;
            if (FINANCIAL_TABLES.has(operation.table.toLowerCase())) {
                statements.push({
                    sql: `INSERT OR IGNORE INTO sync_conflicts (id, entityType, entityId, operation, status, createdAt)
                          VALUES (?, ?, ?, ?, 'pending', ?)`,
                    params: [operation.id, operation.table, operation.entityId || null, JSON.stringify(operation), new Date().toISOString()]
                });
                continue;
            }
            statements.push({
                sql: `INSERT OR IGNORE INTO ${quoteIdentifier(operation.table)} (${operation.columns.map(quoteIdentifier).join(', ')}) VALUES (${operation.columns.map(() => '?').join(', ')})`,
                params: operation.params || []
            });
        }
    }
    if (!statements.length) return 0;
    applyingRemote = true;
    try { await sqlite.transaction(statements); } finally { applyingRemote = false; }
    return statements.length;
};

const emitStatus = (detail: Record<string, any>) => window.dispatchEvent(new CustomEvent('tango-cloud-sync-status', { detail }));

export const syncCloudNow = async () => {
    if (syncPromise) return syncPromise;
    syncPromise = (async () => {
        const config = activeConfig;
        if (!config || !navigator.onLine) return { success: false, message: 'Sem ligação à Internet.' };
        if (!config.apiKey || config.apiKey.length < 8) return { success: false, message: 'Configure uma chave de sincronização com pelo menos 8 caracteres.' };
        emitStatus({ state: 'syncing' });
        try {
            await createBootstrapOperations();
            const key = await deriveKey(config.apiKey, config.tenantId);
            let cursor = Number(localStorage.getItem(scopedStorageKey(CURSOR_KEY)) || '0');
            let totalPushed = 0;
            let totalPulled = 0;

            for (let round = 0; round < MAX_PULL_ROUNDS; round++) {
                const queued = await getQueuedOperations();
                const supported = queued.filter(operation => operation.kind === 'statement' || operation.kind === 'snapshot');
                const outgoing = await Promise.all(supported.map(async operation => ({ id: operation.id, deviceId: operation.deviceId, payload: await encryptOperation(operation, key) })));
                const response = await fetch(`${normalizeBaseUrl(config.url)}/api/sync`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'x-sync-passkey': config.apiKey },
                    body: JSON.stringify({ tenantId: config.tenantId, deviceId: getDeviceId(), cursor, operations: outgoing }),
                    signal: AbortSignal.timeout(20_000)
                });
                const body = await response.json().catch(() => ({}));
                if (!response.ok) throw new Error(body.message || body.error || `Erro de sincronização (${response.status}).`);
                await deleteQueuedOperations(queued.map(operation => operation.id));
                totalPushed += supported.length;

                const incoming: SyncOperation[] = [];
                for (const item of body.operations || []) incoming.push(await decryptOperation(item.payload, key));
                totalPulled += await applyOperations(incoming);
                cursor = Number(body.cursor || cursor);
                localStorage.setItem(scopedStorageKey(CURSOR_KEY), String(cursor));
                if (!body.hasMore && queued.length < MAX_PUSH_OPERATIONS) break;
            }

            if (totalPulled && config.onRemoteApplied) await config.onRemoteApplied();
            const result = { success: true, pushed: totalPushed, pulled: totalPulled };
            emitStatus({ state: 'synced', ...result, at: new Date().toISOString() });
            return result;
        } catch (error: any) {
            const message = error?.name === 'TimeoutError' ? 'O servidor demorou muito a responder.' : (error?.message || 'Falha na sincronização.');
            console.error('[CloudSync]', error);
            emitStatus({ state: 'error', message });
            return { success: false, message };
        }
    })().finally(() => { syncPromise = null; });
    return syncPromise;
};

const scheduleSync = (delay = 750) => {
    if (syncDebounce) clearTimeout(syncDebounce);
    syncDebounce = setTimeout(() => syncCloudNow().catch(console.warn), delay);
};

export const startCloudSync = (config: CloudSyncConfig) => {
    stopCloudSync();
    activeConfig = { ...config, url: normalizeBaseUrl(config.url) };
    onlineHandler = () => scheduleSync(100);
    writeHandler = () => scheduleSync();
    window.addEventListener('online', onlineHandler);
    window.addEventListener('tango-local-db-write', writeHandler);
    timer = setInterval(() => scheduleSync(0), SYNC_INTERVAL_MS);
    scheduleSync(100);
    return stopCloudSync;
};

export const stopCloudSync = () => {
    if (timer) clearInterval(timer);
    if (syncDebounce) clearTimeout(syncDebounce);
    if (onlineHandler) window.removeEventListener('online', onlineHandler);
    if (writeHandler) window.removeEventListener('tango-local-db-write', writeHandler);
    timer = null;
    syncDebounce = null;
    onlineHandler = null;
    writeHandler = null;
    activeConfig = null;
};
