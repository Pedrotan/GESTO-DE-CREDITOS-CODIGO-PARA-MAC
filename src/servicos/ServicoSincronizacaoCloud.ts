import { getScopedLocalStorageItem, scopedStorageKey } from '@/bibliotecas/contas';
import { setFinancialConnectionProbe } from '@/bibliotecas/ligacao-financeira';
import { sqlite, type SqlTransactionStatement } from '@/bibliotecas/adaptador-sqlite';
import { RENDERER_SQL_BY_ID, RENDERER_SQL_ID_BY_STATEMENT } from '../../electron/renderer-sql-allowlist.ts';
import {
    SYNC_EXCLUDED_TABLES,
    applyRemoteGroups,
    groupOperations,
    isAllowedDynamicUpdate,
    isSafeToReprocess,
    isSyncableTable,
    mutationTable,
    normalizeSqlText,
    type ApplyResult,
    type RemoteGroup,
    type SyncOperation,
} from '@/bibliotecas/sync-operacoes';
import { reportUsageIfDue } from '@/servicos/ServicoRelatorioUso';

// Sincronização local-first entre todos os dispositivos da empresa (app de computador e navegadores).
// Cada escrita local gera operações cifradas que vão para a nuvem; as operações dos outros dispositivos
// são aplicadas aqui, transacção a transacção. Créditos, pagamentos e contabilidade também sincronizam:
// se o mesmo registo foi alterado nos dois lados, a alteração remota fica em sync_conflicts para revisão.

type CloudSyncConfig = {
    url: string;
    apiKey: string;
    tenantId: string;
    onRemoteApplied?: () => void | Promise<void>;
};

const DB_NAME = 'TangoCloudSyncQueue';
const STORE_NAME = 'operations';
const INCOMING_STORE = 'incoming';
const DEVICE_KEY = 'tango_cloud_device_id';
const CURSOR_KEY = 'cloud_sync_cursor_v1';
// v2: reenvia uma fotografia completa (inclui dados financeiros, antes retidos) para os outros dispositivos.
// v3: reenvia de novo, cifrada com a chave actual da empresa: o histórico antigo pode ter sido cifrado com
// chaves anteriores que os dispositivos novos não conseguem ler.
export const CLOUD_SYNC_BOOTSTRAP_KEY = 'cloud_sync_bootstrap_v3';
const REPROCESS_KEY = 'cloud_sync_reprocess_v2';
// Última lista de utilizadores enviada por este computador (só se reenvia quando muda).
const USERS_DIGEST_KEY = 'cloud_sync_users_digest_v1';
// Impressão digital da chave com que este computador já enviou a fotografia completa dos dados.
const KEY_FINGERPRINT_KEY = 'cloud_sync_key_fingerprint_v1';
/** Avisa o login de que chegaram utilizadores (versão web). */
export const USERS_SYNCED_EVENT = 'tango-users-synced';
const MAX_PUSH_OPERATIONS = 100;
const MAX_PULL_ROUNDS = 10;
const SYNC_INTERVAL_MS = 30_000;
const INCOMPLETE_GROUP_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const SYNCABLE_SQL = /^\s*(INSERT|UPDATE|DELETE|REPLACE)\b/i;

let activeConfig: CloudSyncConfig | null = null;
let syncPromise: Promise<{ success: boolean; pushed?: number; pulled?: number; conflicts?: number; message?: string }> | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let onlineHandler: (() => void) | null = null;
let writeHandler: (() => void) | null = null;
let syncDebounce: ReturnType<typeof setTimeout> | null = null;
let focusHandler: (() => void) | null = null;
let applyingRemote = false;
// Falhas seguidas: novas tentativas com intervalos crescentes, sem nunca bloquear o trabalho local.
const RETRY_DELAYS_MS = [5_000, 15_000, 60_000, 300_000];
let failureCount = 0;
let retryNotBefore = 0;

export type CloudSyncStatus = {
    state: 'idle' | 'syncing' | 'synced' | 'pending' | 'error';
    pending?: number;
    message?: string;
    at?: string;
    pushed?: number;
    pulled?: number;
    conflicts?: number;
    /** Operações da nuvem cifradas com uma chave antiga, ignoradas por não poderem ser lidas. */
    skipped?: number;
    /** O servidor recusou o Código de Acesso guardado (alterado ou revogado no Tango Master). */
    authFailed?: boolean;
};
let lastStatus: CloudSyncStatus = { state: 'idle' };
export const getLastCloudSyncStatus = () => lastStatus;

export const isCloudSyncUrl = (url?: string | null) => {
    if (!url) return false;
    try {
        const parsed = new URL(url);
        // HTTPS em produção; HTTP só no próprio computador (servidor de testes local).
        return parsed.protocol === 'https:' || (parsed.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(parsed.hostname));
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
    const request = indexedDB.open(DB_NAME, 2);
    request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME, { keyPath: 'id' });
        // Operações recebidas cuja transacção ainda não chegou completa.
        if (!database.objectStoreNames.contains(INCOMING_STORE)) database.createObjectStore(INCOMING_STORE, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
});

const putOperations = async (operations: SyncOperation[], store = STORE_NAME) => {
    if (!operations.length) return;
    const database = await openQueue();
    await new Promise<void>((resolve, reject) => {
        const tx = database.transaction(store, 'readwrite');
        const objectStore = tx.objectStore(store);
        operations.forEach(operation => objectStore.put(operation));
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
    database.close();
};

const readAll = async (store: string): Promise<SyncOperation[]> => {
    const database = await openQueue();
    const values = await new Promise<SyncOperation[]>((resolve, reject) => {
        const request = database.transaction(store, 'readonly').objectStore(store).getAll();
        request.onsuccess = () => resolve((request.result || []).sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
        request.onerror = () => reject(request.error);
    });
    database.close();
    return values;
};

// Envia no máximo MAX_PUSH_OPERATIONS, sem nunca partir uma transacção entre dois envios.
const getQueuedOperations = async (limit = MAX_PUSH_OPERATIONS): Promise<SyncOperation[]> => {
    const all = await readAll(STORE_NAME);
    if (all.length <= limit) return all;
    const batch = all.slice(0, limit);
    const lastTx = batch[batch.length - 1].txId;
    if (lastTx) batch.push(...all.slice(limit).filter(operation => operation.txId === lastTx));
    return batch;
};

const deleteOperations = async (ids: string[], store = STORE_NAME) => {
    if (!ids.length) return;
    const database = await openQueue();
    await new Promise<void>((resolve, reject) => {
        const tx = database.transaction(store, 'readwrite');
        const objectStore = tx.objectStore(store);
        ids.forEach(id => objectStore.delete(id));
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
    database.close();
};

const isSyncableOperation = (sql: string) => SYNCABLE_SQL.test(sql) && isSyncableTable(mutationTable(sql));

type StatementCommand = Omit<SyncOperation, 'id' | 'deviceId' | 'createdAt'>;
const toStatementCommand = (sql: string, params: unknown[], expectChanges?: number): StatementCommand | null => {
    if (!isSyncableOperation(sql)) return null;
    const cleanParams = params.map(value => value === undefined ? null : value);
    const isInsert = /^\s*(?:INSERT|REPLACE)\b/iu.test(sql);
    const base = {
        params: cleanParams, commandVersion: 1 as const, expectChanges,
        tenantId: activeConfig?.tenantId || '', entityId: String(cleanParams[isInsert ? 0 : cleanParams.length - 1] || ''),
    };
    const normalized = normalizeSqlText(sql);
    const statementId = RENDERER_SQL_ID_BY_STATEMENT.get(normalized);
    if (statementId) return { kind: 'statement', statementId, ...base };
    // Edições dinâmicas aprovadas (fornecedores, processos, garantias) também sincronizam.
    if (isAllowedDynamicUpdate(normalized)) return { kind: 'dynamic', sql: normalized, ...base };
    return null;
};

const syncIsActive = () => !applyingRemote
    && getScopedLocalStorageItem('sync_enabled') === 'true'
    && isCloudSyncUrl(getScopedLocalStorageItem('sync_url'));

export const enqueueSyncOperation = async (sql: string, params: unknown[] = []) => {
    if (!syncIsActive() || !isSyncableOperation(sql)) return;
    const command = toStatementCommand(sql, params);
    if (!command) {
        console.warn('[CloudSync] Mutação sem comando versionado; sincronização recusada.', mutationTable(sql));
        return;
    }
    await putOperations([{ id: crypto.randomUUID(), deviceId: getDeviceId(), ...command, createdAt: new Date().toISOString() }]);
    window.dispatchEvent(new CustomEvent('tango-local-db-write'));
    void emitPending();
};

export const enqueueSyncTransaction = async (statements: SqlTransactionStatement[]) => {
    if (!syncIsActive()) return;
    const commands = statements
        .map(statement => {
            const command = toStatementCommand(statement.sql, statement.params || [], statement.expectChanges);
            if (!command && isSyncableOperation(statement.sql)) {
                console.warn('[CloudSync] Mutação sem comando versionado; sincronização recusada.', mutationTable(statement.sql));
            }
            return command;
        })
        .filter((command): command is StatementCommand => Boolean(command));
    if (!commands.length) return;

    const deviceId = getDeviceId();
    const txId = crypto.randomUUID();
    const now = Date.now();
    await putOperations(commands.map((command, index) => ({
        id: crypto.randomUUID(), deviceId, ...command, txId, txSize: commands.length,
        createdAt: new Date(now + index).toISOString(),
    })));
    window.dispatchEvent(new CustomEvent('tango-local-db-write'));
    void emitPending();
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

// Fotografia completa das tabelas sincronizáveis, para que um dispositivo novo receba tudo o que já existe.
// As linhas entram com INSERT OR IGNORE: nunca substituem dados que o outro dispositivo já tenha.
const createBootstrapOperations = async () => {
    if (localStorage.getItem(scopedStorageKey(CLOUD_SYNC_BOOTSTRAP_KEY)) === 'true') return;
    const tables = await sqlite.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
    const deviceId = getDeviceId();
    const operations: SyncOperation[] = [];
    let order = 0;

    for (const { name } of tables) {
        if (!/^[\w-]+$/u.test(name) || SYNC_EXCLUDED_TABLES.has(name.toLowerCase())) continue;
        const rows = await sqlite.all<Record<string, unknown>>(`SELECT * FROM ${quoteIdentifier(name)}`);
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
    localStorage.setItem(scopedStorageKey(CLOUD_SYNC_BOOTSTRAP_KEY), 'true');
};

const tableColumnsCache = new Map<string, Set<string>>();
const localTableColumns = async (table: string) => {
    if (!/^[a-z_][a-z0-9_]*$/iu.test(table)) return new Set<string>();
    if (!tableColumnsCache.has(table)) {
        const rows = await sqlite.all<{ name: string }>(`PRAGMA table_info(${quoteIdentifier(table)})`);
        tableColumnsCache.set(table, new Set(rows.map(row => row.name)));
    }
    return tableColumnsCache.get(table)!;
};

// Na app de computador o processo principal valida e aplica; no navegador aplica-se directamente no sql.js.
const applyGroups = async (groups: RemoteGroup[]): Promise<ApplyResult> => {
    if (!groups.length) return { applied: 0, conflicts: 0 };
    applyingRemote = true;
    try {
        const electronApply = window.electronAPI?.syncApplyRemote;
        if (electronApply) return await electronApply(groups);
        return await applyRemoteGroups(groups, {
            sqlById: RENDERER_SQL_BY_ID,
            tableColumns: localTableColumns,
            transaction: statements => sqlite.transaction(statements as SqlTransactionStatement[]),
        });
    } finally {
        applyingRemote = false;
    }
};

// Colunas de utilizador que cada dispositivo gere sozinho (2FA, bloqueios por tentativas, presença, fotografia).
const LOCAL_USER_COLUMNS = new Set(['twoFactorEnabled', 'twoFactorSecret', 'mfaRecoveryCodes', 'failedAttempts', 'blockedAt', 'lastLogin', 'lastSeen', 'ip', 'avatar']);
// Navegador: impressão de cada utilizador tal como foi sincronizado da última vez (só se envia o que mudou).
const USERS_STATE_KEY = 'cloud_sync_users_state_v1';
// Computador: utilizadores incluídos na última lista enviada (para comunicar as remoções).
const USERS_IDS_KEY = 'cloud_sync_users_ids_v1';
type UsersRoster = { kind: 'users'; columns: string[]; rows: unknown[][]; deleted?: string[]; createdAt: string };

const sharedUserColumns = async () => [...await localTableColumns('users')]
    .filter(column => /^[a-z_][a-z0-9_]*$/iu.test(column) && !LOCAL_USER_COLUMNS.has(column));

/** Utilizadores deste navegador (colunas partilhadas) e a impressão de cada um. */
const readLocalUsers = async () => {
    const columns = await sharedUserColumns();
    const fingerprints: Record<string, string> = {};
    if (!columns.includes('id')) return { columns, rows: [] as unknown[][], fingerprints };
    const records = await sqlite.all<Record<string, unknown>>(`SELECT ${columns.map(quoteIdentifier).join(', ')} FROM users ORDER BY id`);
    const rows = records.map(record => columns.map(column => record[column] ?? null));
    for (const row of rows) {
        const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(row))));
        fingerprints[String(row[columns.indexOf('id')])] = bytesToBase64(digest).slice(0, 22);
    }
    return { columns, rows, fingerprints };
};

const saveUsersState = async () => {
    const { fingerprints } = await readLocalUsers();
    localStorage.setItem(scopedStorageKey(USERS_STATE_KEY), JSON.stringify(fingerprints));
};

/**
 * Lista de utilizadores vinda de outro dispositivo da empresa: cria/actualiza e remove os indicados, mantendo
 * o 2FA e os bloqueios locais. No computador quem valida e grava é o processo principal (senhas protegidas).
 */
const applyUserRoster = async (roster: UsersRoster) => {
    if (window.electronAPI?.syncUsersApply) {
        const result = await window.electronAPI.syncUsersApply({ columns: roster.columns, rows: roster.rows, deleted: roster.deleted || [] });
        return result.applied + result.deleted;
    }
    const local = new Set(await sharedUserColumns());
    const columns = (roster.columns || []).filter(column => local.has(column));
    if (!columns.includes('id') || !columns.includes('password') || !columns.includes('email')) return 0;
    const positions = columns.map(column => roster.columns.indexOf(column));
    const list = columns.map(quoteIdentifier).join(', ');
    const updates = columns.filter(column => column !== 'id').map(column => `${quoteIdentifier(column)} = excluded.${quoteIdentifier(column)}`).join(', ');
    const statements: SqlTransactionStatement[] = [];
    for (const row of roster.rows || []) {
        if (!Array.isArray(row)) continue;
        const values = positions.map(position => row[position] ?? null);
        const id = String(values[columns.indexOf('id')] || '');
        const email = String(values[columns.indexOf('email')] || '').toLowerCase();
        if (!id || !values[columns.indexOf('password')]) continue;
        // Email já usado por outro utilizador deste navegador: não se sobrepõe.
        const clash = await sqlite.all<{ id: string }>('SELECT id FROM users WHERE LOWER(email) = ? AND id <> ? LIMIT 1', [email, id]);
        if (clash.length) continue;
        statements.push({ sql: `INSERT INTO users (${list}) VALUES (${columns.map(() => '?').join(', ')}) ON CONFLICT(id) DO UPDATE SET ${updates}`, params: values });
    }
    for (const id of roster.deleted || []) statements.push({ sql: 'DELETE FROM users WHERE id = ?', params: [String(id)] });
    if (!statements.length) return 0;
    applyingRemote = true;
    try { await sqlite.transaction(statements); } finally { applyingRemote = false; }
    // O que chegou não volta a ser enviado por este navegador.
    await saveUsersState();
    window.dispatchEvent(new Event(USERS_SYNCED_EVENT));
    return statements.length;
};

/** Navegador: utilizadores criados, alterados ou removidos aqui desde a última sincronização. */
const webUsersChange = async () => {
    const saved = localStorage.getItem(scopedStorageKey(USERS_STATE_KEY));
    const previous: Record<string, string> = saved ? JSON.parse(saved) : {};
    const { columns, rows, fingerprints } = await readLocalUsers();
    if (!columns.includes('id') || !columns.includes('password')) return null;
    const changed = rows.filter(row => {
        const id = String(row[columns.indexOf('id')]);
        return previous[id] !== fingerprints[id] && Boolean(row[columns.indexOf('password')]);
    });
    const deleted = Object.keys(previous).filter(id => !(id in fingerprints));
    if (!changed.length && !deleted.length) return null;
    return { columns, rows: changed, deleted, fingerprints };
};

const applyOperations = async (operations: SyncOperation[]): Promise<ApplyResult> => {
    const accepted = operations.filter(operation => operation.commandVersion === 1 && activeConfig && operation.tenantId === activeConfig.tenantId);
    const rosters = (accepted.filter(operation => (operation as any).kind === 'users') as unknown as UsersRoster[])
        .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
    const valid = accepted.filter(operation => (operation as any).kind !== 'users');
    let rosterApplied = 0;
    for (const roster of rosters) {
        try { rosterApplied += await applyUserRoster(roster) ? 1 : 0; }
        catch (error) { console.warn('[CloudSync] Utilizadores recebidos não aplicados:', error); }
    }
    const waiting = await readAll(INCOMING_STORE);
    const { complete, pending } = groupOperations([...waiting, ...valid]);

    // Transacções que nunca chegam completas não podem ficar à espera para sempre.
    const cutoff = Date.now() - INCOMPLETE_GROUP_MAX_AGE_MS;
    const expired = pending.filter(operation => Date.parse(operation.createdAt) < cutoff);
    const stillWaiting = pending.filter(operation => !expired.includes(operation));
    const groups: RemoteGroup[] = complete.map(group => ({ operations: group }));
    // Partes de uma transacção incompleta não são aplicadas: vão para revisão.
    for (const operation of expired) groups.push({ operations: [{ ...operation, kind: 'statement', statementId: '__incompleto__' }] });

    const result = await applyGroups(groups);
    await deleteOperations(waiting.map(operation => operation.id), INCOMING_STORE);
    await putOperations(stillWaiting, INCOMING_STORE);
    return { ...result, applied: result.applied + rosterApplied };
};

// Versões anteriores retinham créditos/pagamentos remotos em sync_conflicts. Aplica uma vez as inserções
// retidas (seguras); alterações e eliminações retidas continuam para revisão manual.
const reprocessRetainedOperations = async () => {
    if (localStorage.getItem(scopedStorageKey(REPROCESS_KEY)) === 'true') return 0;
    const rows = await sqlite.all<{ id: string; operation: string }>(
        `SELECT id, operation FROM sync_conflicts WHERE status = 'pending' ORDER BY createdAt ASC LIMIT 5000`
    );
    const groups: RemoteGroup[] = [];
    for (const row of rows) {
        try {
            const operation = JSON.parse(row.operation) as SyncOperation & { reason?: string };
            // Com `reason` é um conflito real desta versão (ex.: versão divergente): fica para revisão.
            if (operation.reason || !isSafeToReprocess(operation, RENDERER_SQL_BY_ID)) continue;
            groups.push({ operations: [operation], resolvesConflictIds: [row.id] });
        } catch { /* registo antigo ilegível: fica para revisão */ }
    }
    const result = await applyGroups(groups);
    localStorage.setItem(scopedStorageKey(REPROCESS_KEY), 'true');
    return result.applied;
};

const emitStatus = (detail: CloudSyncStatus) => {
    lastStatus = detail;
    window.dispatchEvent(new CustomEvent('tango-cloud-sync-status', { detail }));
};

/** Alterações locais ainda por enviar para a nuvem. */
export const getPendingSyncCount = async () => (await readAll(STORE_NAME)).length;

const emitPending = async () => {
    if (lastStatus.state === 'syncing') return;
    const pending = await getPendingSyncCount().catch(() => 0);
    emitStatus({ ...lastStatus, state: lastStatus.state === 'error' ? 'error' : 'pending', pending });
};

/**
 * Modo multi-empresa configurado no executável, enviado ao servidor para a versão web mostrar o mesmo layout.
 * Só o computador o envia: um navegador novo ainda não tem as definições reais da empresa.
 */
const companyProfile = async (): Promise<{ multiTenant: boolean } | undefined> => {
    if (typeof window === 'undefined' || !window.electronAPI) return undefined;
    try {
        const row = (await sqlite.all<{ enableMultiTenant: number | null }>('SELECT enableMultiTenant FROM company_settings WHERE id = 1'))[0];
        if (!row || row.enableMultiTenant === null || row.enableMultiTenant === undefined) return undefined;
        return { multiTenant: Number(row.enableMultiTenant) !== 0 };
    } catch {
        return undefined;
    }
};

export const syncCloudNow = async () => {
    if (syncPromise) return syncPromise;
    syncPromise = (async () => {
        const config = activeConfig;
        if (!config || !navigator.onLine) {
            if (config) emitStatus({ state: 'error', message: 'Sem ligação à Internet.', pending: await getPendingSyncCount().catch(() => 0) });
            return { success: false, message: 'Sem ligação à Internet.' };
        }
        if (!config.apiKey || config.apiKey.length < 8) return { success: false, message: 'Configure uma chave de sincronização com pelo menos 8 caracteres.' };
        emitStatus({ state: 'syncing' });
        try {
            // Os dados vão cifrados com o Código de Acesso: se mudou, o histórico antigo deixa de ser legível
            // para os outros dispositivos. O computador (referência da empresa) reenvia então tudo com a chave nova.
            if (window.electronAPI) {
                const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${config.tenantId}:${config.apiKey}`)));
                const fingerprint = bytesToBase64(digest).slice(0, 24);
                if (localStorage.getItem(scopedStorageKey(KEY_FINGERPRINT_KEY)) !== fingerprint) {
                    localStorage.removeItem(scopedStorageKey(CLOUD_SYNC_BOOTSTRAP_KEY));
                    localStorage.removeItem(scopedStorageKey(USERS_DIGEST_KEY));
                    localStorage.setItem(scopedStorageKey(KEY_FINGERPRINT_KEY), fingerprint);
                }
            }
            await createBootstrapOperations();
            const key = await deriveKey(config.apiKey, config.tenantId);
            let cursor = Number(localStorage.getItem(scopedStorageKey(CURSOR_KEY)) || '0');
            let totalPushed = 0;
            let totalPulled = await reprocessRetainedOperations();
            let totalConflicts = 0;
            let totalSkipped = 0;
            const profile = await companyProfile();
            // Computador: lista de utilizadores cifrada no processo principal, enviada só quando muda.
            const usersOut = window.electronAPI?.syncUsersPayload
                ? await window.electronAPI.syncUsersPayload({
                    apiKey: config.apiKey, tenantId: config.tenantId, deviceId: getDeviceId(),
                    knownDigest: localStorage.getItem(scopedStorageKey(USERS_DIGEST_KEY)),
                    knownIds: JSON.parse(localStorage.getItem(scopedStorageKey(USERS_IDS_KEY)) || '[]'),
                }).catch(error => { console.warn('[CloudSync] Utilizadores não enviados:', error); return null; })
                : null;

            for (let round = 0; round < MAX_PULL_ROUNDS; round++) {
                const queued = await getQueuedOperations();
                const supported = queued.filter(operation => ['statement', 'snapshot', 'dynamic'].includes(operation.kind));
                const outgoing = await Promise.all(supported.map(async operation => ({ id: operation.id, deviceId: operation.deviceId, payload: await encryptOperation(operation, key) })));
                if (round === 0 && usersOut?.payload && usersOut.id) outgoing.push({ id: usersOut.id, deviceId: getDeviceId(), payload: usersOut.payload });
                const response = await fetch(`${normalizeBaseUrl(config.url)}/api/sync`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'x-sync-passkey': config.apiKey },
                    body: JSON.stringify({ tenantId: config.tenantId, deviceId: getDeviceId(), cursor, operations: outgoing, ...(round === 0 && profile ? { companyProfile: profile } : {}) }),
                    signal: AbortSignal.timeout(20_000)
                });
                const body = await response.json().catch(() => ({}));
                if (!response.ok) throw Object.assign(new Error(body.message || body.error || `Erro de sincronização (${response.status}).`), { status: response.status });
                await deleteOperations(queued.map(operation => operation.id));
                if (round === 0 && usersOut?.digest) {
                    localStorage.setItem(scopedStorageKey(USERS_DIGEST_KEY), usersOut.digest);
                    localStorage.setItem(scopedStorageKey(USERS_IDS_KEY), JSON.stringify(usersOut.ids || []));
                }
                totalPushed += supported.length;

                const incoming: SyncOperation[] = [];
                for (const item of body.operations || []) {
                    // Uma operação cifrada com uma chave antiga não pode bloquear a sincronização de tudo o resto.
                    try {
                        incoming.push(await decryptOperation(item.payload, key));
                    } catch {
                        totalSkipped += 1;
                    }
                }
                const result = await applyOperations(incoming);
                totalPulled += result.applied;
                totalConflicts += result.conflicts;
                cursor = Number(body.cursor || cursor);
                localStorage.setItem(scopedStorageKey(CURSOR_KEY), String(cursor));
                if (!body.hasMore && queued.length < MAX_PUSH_OPERATIONS) break;
            }

            // Navegador: envia os utilizadores criados/alterados/removidos aqui (depois de receber os dos outros).
            if (!window.electronAPI) {
                const change = await webUsersChange().catch(error => { console.warn('[CloudSync] Utilizadores locais:', error); return null; });
                if (change) {
                    const operation = {
                        id: crypto.randomUUID(), deviceId: getDeviceId(), kind: 'users', commandVersion: 1, tenantId: config.tenantId,
                        entityId: 'users', createdAt: new Date().toISOString(), columns: change.columns, rows: change.rows, deleted: change.deleted,
                    } as unknown as SyncOperation;
                    const response = await fetch(`${normalizeBaseUrl(config.url)}/api/sync`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'x-sync-passkey': config.apiKey },
                        // O cursor fica igual: o que vier na resposta é recebido na próxima sincronização.
                        body: JSON.stringify({ tenantId: config.tenantId, deviceId: getDeviceId(), cursor, operations: [{ id: operation.id, deviceId: operation.deviceId, payload: await encryptOperation(operation, key) }] }),
                        signal: AbortSignal.timeout(20_000)
                    });
                    if (response.ok) {
                        localStorage.setItem(scopedStorageKey(USERS_STATE_KEY), JSON.stringify(change.fingerprints));
                        totalPushed += 1;
                    }
                }
            }

            if ((totalPulled || totalConflicts) && config.onRemoteApplied) await config.onRemoteApplied();
            void reportUsageIfDue({
                url: normalizeBaseUrl(config.url), apiKey: config.apiKey, tenantId: config.tenantId,
                deviceId: getDeviceId(), query: (sql, params) => sqlite.all(sql, params), appVersion: `${window.electronAPI ? 'PC' : 'Web'} 3.0.2`,
            });
            if (totalSkipped) console.warn(`[CloudSync] ${totalSkipped} operações antigas cifradas com outra chave foram ignoradas.`);
            const result = { success: true, pushed: totalPushed, pulled: totalPulled, conflicts: totalConflicts, skipped: totalSkipped };
            failureCount = 0;
            retryNotBefore = 0;
            const pending = await getPendingSyncCount().catch(() => 0);
            emitStatus({ state: pending ? 'pending' : 'synced', pending, pushed: totalPushed, pulled: totalPulled, conflicts: totalConflicts, skipped: totalSkipped, at: new Date().toISOString() });
            return result;
        } catch (error: any) {
            const message = error?.name === 'TimeoutError' ? 'O servidor demorou muito a responder.'
                : error?.message === 'Failed to fetch' ? 'Não foi possível contactar o servidor da nuvem.'
                    : (error?.message || (error?.name ? `Falha na sincronização (${error.name}).` : 'Falha na sincronização.'));
            console.error('[CloudSync]', error);
            const delay = RETRY_DELAYS_MS[Math.min(failureCount, RETRY_DELAYS_MS.length - 1)];
            failureCount += 1;
            retryNotBefore = Date.now() + delay;
            const pending = await getPendingSyncCount().catch(() => 0);
            emitStatus({ state: 'error', message, pending, at: new Date().toISOString(), authFailed: error?.status === 401 });
            scheduleSync(delay);
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
    failureCount = 0;
    retryNotBefore = 0;
    onlineHandler = () => { retryNotBefore = 0; scheduleSync(100); };
    writeHandler = () => scheduleSync();
    // Ao voltar à janela recebe logo o que foi feito noutros dispositivos (ex.: na versão web).
    focusHandler = () => { if (Date.now() >= retryNotBefore) scheduleSync(100); };
    window.addEventListener('online', onlineHandler);
    window.addEventListener('focus', focusHandler);
    window.addEventListener('tango-local-db-write', writeHandler);
    timer = setInterval(() => { if (Date.now() >= retryNotBefore) scheduleSync(0); }, SYNC_INTERVAL_MS);
    scheduleSync(100);
    // Versão web (cópia da nuvem): as operações financeiras só avançam com o servidor contactável; a sonda
    // sincroniza antes (envia o que falta e recebe o mais recente) e, sem ligação, a operação é recusada.
    if (!window.electronAPI) setFinancialConnectionProbe(async () => {
        if (!navigator.onLine) return { ok: false, message: 'sem Internet' };
        const result: any = await syncCloudNow();
        return result?.success ? { ok: true } : { ok: false, message: result?.message };
    });
    return stopCloudSync;
};

export const stopCloudSync = () => {
    setFinancialConnectionProbe(null);
    if (timer) clearInterval(timer);
    if (syncDebounce) clearTimeout(syncDebounce);
    if (onlineHandler) window.removeEventListener('online', onlineHandler);
    if (writeHandler) window.removeEventListener('tango-local-db-write', writeHandler);
    if (focusHandler) window.removeEventListener('focus', focusHandler);
    timer = null;
    focusHandler = null;
    syncDebounce = null;
    onlineHandler = null;
    writeHandler = null;
    activeConfig = null;
    emitStatus({ state: 'idle' });
};
