import { scopedStorageKey } from '@/bibliotecas/contas';
import { publishCompanyProfile, readCompanyProfile } from '@/bibliotecas/identidade-empresa-sync';
import { portableCompanyImage } from '@/bibliotecas/imagem-portatil';
import { lerChavesSincronizacao, lerSegredo, SEGREDO_CHAVE_SINCRONIZACAO, SEGREDO_CODIGO_EMPRESA } from '@/bibliotecas/cofre-segredos';
import { secureCloudUrl } from '@/servicos/ServicoLigacaoNuvem';
import { setFinancialConnectionProbe } from '@/bibliotecas/ligacao-financeira';
import { REPLICA_BACKUP_AT_KEY, RESTORE_REPLICA_FLAG, sqlite, type SqlTransactionStatement } from '@/bibliotecas/adaptador-sqlite';
import { RENDERER_SQL_ID_BY_STATEMENT } from '../../electron/renderer-sql-allowlist.ts';
import { SYNC_SQL_BY_ID } from '../../electron/sync-sql.ts';
import {
    REBUILD_REPLICA_FLAG,
    SYNC_EXCLUDED_TABLES,
    applyRemoteGroups,
    groupOperations,
    isAllowedDynamicUpdate,
    markIncomplete,
    reprocessableGroups,
    splitExpired,
    stampReceived,
    isSyncableTable,
    mutationTable,
    normalizeSqlText,
    statementRowId,
    isOtherVersionReason,
    CONFLICT_RESOLVE_SQL,
    HEAL_NOTE,
    type ApplyResult,
    type RemoteGroup,
    type SyncOperation,
} from '@/bibliotecas/sync-operacoes';
import { reportUsageIfDue } from '@/servicos/ServicoRelatorioUso';
import { syncHealth, syncIssues, type SyncCounts, type SyncIssue } from '@/bibliotecas/estado-sincronizacao';

// Sincronização local-first entre todos os dispositivos da empresa (app de computador e navegadores).
// Cada escrita local gera operações cifradas que vão para a nuvem; as operações dos outros dispositivos
// são aplicadas aqui, transacção a transacção. Créditos, pagamentos e contabilidade também sincronizam:
// se o mesmo registo foi alterado nos dois lados, a alteração remota fica em sync_conflicts para revisão.

type CloudSyncConfig = {
    url: string;
    apiKey: string;
    tenantId: string;
    /**
     * Outras formas conhecidas do mesmo Código de Acesso (ex.: como foi escrito no navegador). Só servem para
     * ler o que outro dispositivo cifrou; o envio usa sempre `apiKey`.
     */
    extraKeys?: Array<string | null | undefined>;
    /**
     * Versão web ligada na mesma origem: o servidor reconhece o navegador pela sessão HttpOnly (sem cabeçalho
     * com o código) e a cifra usa chaves já derivadas e não exportáveis — o código não existe no navegador.
     */
    sessionAuth?: boolean;
    cryptoKeys?: { write: CryptoKey; read: CryptoKey[] };
    onRemoteApplied?: () => void | Promise<void>;
};

/** Autenticação de cada pedido: o Código de Acesso no cabeçalho, ou nada (o cookie HttpOnly da sessão vai sozinho). */
const authHeaders = (config: CloudSyncConfig): Record<string, string> =>
    config.sessionAuth ? {} : { 'x-sync-passkey': config.apiKey };

const DB_NAME = 'TangoCloudSyncQueue';
const STORE_NAME = 'operations';
const INCOMING_STORE = 'incoming';
const UNREADABLE_STORE = 'unreadable';
type EncryptedPending = { id: string; payload: string; tenantId: string; url: string; createdAt: string };
const DEVICE_KEY = 'tango_cloud_device_id';
const CURSOR_KEY = 'cloud_sync_cursor_v1';
// v2: reenvia uma fotografia completa (inclui dados financeiros, antes retidos) para os outros dispositivos.
// v3: reenvia de novo, cifrada com a chave actual da empresa: o histórico antigo pode ter sido cifrado com
// chaves anteriores que os dispositivos novos não conseguem ler.
export const CLOUD_SYNC_BOOTSTRAP_KEY = 'cloud_sync_bootstrap_v3';
// Reparação bidireccional: também a web reenvia os registos locais que possam não ter entrado no histórico.
const REPAIR_SNAPSHOT_KEY = 'cloud_sync_repair_snapshot_v4';
// Autocura: cada dispositivo envia uma vez a cópia completa de todos os registos (quem a recebe cria o que lhe falta
// e substitui o que tem mais antigo) e, depois, a cópia de cada registo que alterar. Assim uma alteração que não se
// consegue aplicar noutro dispositivo (comando de outra versão, registo alterado nos dois lados) acaba corrigida
// sozinha, sem ninguém ter de resolver conflitos.
export const HEAL_SNAPSHOT_KEY = 'cloud_sync_heal_snapshot_v1';
const HEAL_JOURNAL_KEY = 'cloud_sync_heal_journal_v1';
// Espera um pouco depois da alteração: a operação original chega primeiro e a cópia só confirma o estado final.
const HEAL_DELAY_MS = 60_000;
const HEAL_JOURNAL_MAX = 5000;
// Última lista de utilizadores enviada por este computador (só se reenvia quando muda).
// v2: reenvia uma vez, marcada como lista completa, para o servidor a guardar à parte para a versão web.
const USERS_DIGEST_KEY = 'cloud_sync_users_digest_v2';
// Navegador: data da última lista completa de utilizadores recebida do computador da empresa.
const USERS_ROSTER_AT_KEY = 'cloud_sync_users_roster_at_v1';
// Impressão digital da chave com que este computador já enviou a fotografia completa dos dados.
const KEY_FINGERPRINT_KEY = 'cloud_sync_key_fingerprint_v1';
/** Avisa o login de que chegaram utilizadores (versão web). */
export const USERS_SYNCED_EVENT = 'tango-users-synced';
const MAX_PUSH_OPERATIONS = 80;
/** Lote actual: começa em MAX_PUSH_OPERATIONS e reduz-se a metade se o servidor recusar por excesso (413). */
let pushLimit = MAX_PUSH_OPERATIONS;
/** Recusas por tamanho (413) recebidas desde o último diagnóstico enviado ao servidor (inclui as de um proxy). */
let rejected413SinceReport = 0;
/** Versão real desta instalação (a mesma do ecrã «Sobre»). */
const APP_VERSION = typeof __TANGO_APP_VERSION__ === 'string' ? __TANGO_APP_VERSION__ : 'desconhecida';

/**
 * Diagnóstico deste dispositivo para o servidor (tango_sync_devices): só números e o último erro, nunca dados da
 * empresa. A hora do computador serve para o servidor medir a diferença do relógio.
 */
const syncDiagnostics = async (lastError?: string) => {
    const counts = await collectSyncCounts().catch(() => null);
    return {
        platform: window.electronAPI ? 'desktop' : 'web',
        appVersion: APP_VERSION,
        ...(counts ? {
            pending: counts.pending, oversized: counts.oversized, waiting: counts.waiting, unreadable: counts.unreadable,
            conflicts: counts.conflicts, otherVersion: counts.otherVersion, userClashes: counts.userClashes,
        } : {}),
        users: activeConfig ? await usersFingerprint(activeConfig.tenantId).catch(() => []) : [],
        rejected413: rejected413SinceReport,
        lastError,
        clientTime: Date.now(),
    };
};
// Bytes por pedido, medidos já cifrados (a cifra em base64 acrescenta cerca de um terço): com ficheiros, um lote
// medido antes da cifra podia passar o limite do servidor e, em ligações lentas, não chegar dentro do tempo.
const MAX_PUSH_BYTES = 4_000_000;
// Uma só alteração cifrada acima disto não cabe no servidor (12 MB): fica de parte, guardada, sem bloquear a fila.
const MAX_OPERATION_BYTES = 11_500_000;
/** Tamanho aproximado da alteração depois de cifrada (texto UTF-8 em base64, mais o IV). */
const encryptedSize = (operation: SyncOperation) => Math.ceil(new TextEncoder().encode(JSON.stringify(operation)).length / 3) * 4 + 64;
type QueuedOperation = SyncOperation & { oversized?: string };
const MAX_PULL_BYTES = 2_000_000;
const MAX_PULL_ROUNDS = 10;
// Quase tempo real: recebe o que os outros dispositivos fizeram a cada 10 s (e logo ao gravar, ao voltar à janela
// ou ao recuperar a Internet).
const SYNC_INTERVAL_MS = 10_000;
const INCOMPLETE_GROUP_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const SYNCABLE_SQL = /^\s*(INSERT|UPDATE|DELETE|REPLACE)\b/i;

let activeConfig: CloudSyncConfig | null = null;
let syncPromise: Promise<{ success: boolean; pushed?: number; pulled?: number; conflicts?: number; skipped?: number; message?: string; usersRoster?: UsersRosterOutcome }> | null = null;
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
    /** attention = «Verificar»: há conflitos, alterações retidas, ilegíveis ou grandes demais para ver. */
    state: 'idle' | 'syncing' | 'synced' | 'pending' | 'attention' | 'error';
    pending?: number;
    /** Contagens reais deste dispositivo e a lista do que precisa de atenção (mostrada ao clicar no ícone). */
    counts?: SyncCounts;
    issues?: SyncIssue[];
    message?: string;
    at?: string;
    pushed?: number;
    pulled?: number;
    conflicts?: number;
    /** Operações da nuvem cifradas com uma chave antiga, ignoradas por não poderem ser lidas. */
    skipped?: number;
    /** O servidor recusou o Código de Acesso guardado (alterado ou revogado no Tango Master). */
    authFailed?: boolean;
    /** O servidor recusou porque a licença da empresa está suspensa, expirada ou revogada (LICENCA_*). */
    licenseRefused?: string;
    /** Computador: a lista de utilizadores foi enviada nesta sincronização. */
    usersSent?: boolean;
    /** Navegador: estado da lista de utilizadores vinda do computador da empresa. */
    usersRoster?: UsersRosterOutcome;
};

export type UsersRosterOutcome = {
    /**
     * none: o computador ainda não enviou a lista; current: já recebida e sem alterações; applied: recebida agora;
     * unreadable: cifrada com outro Código de Acesso; error: falha ao contactar o servidor ou ao gravar.
     */
    state: 'none' | 'current' | 'applied' | 'unreadable' | 'error';
    at?: string;
    applied?: number;
    message?: string;
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
    // Servidores na Internet só por HTTPS (o Código de Acesso segue em cada pedido).
    let value = secureCloudUrl(url);
    value = value.replace(/\/api\/sync$/i, '').replace(/\/sync$/i, '');
    return value;
};

export const getDeviceId = () => {
    let value = localStorage.getItem(DEVICE_KEY);
    if (!value) {
        value = crypto.randomUUID();
        localStorage.setItem(DEVICE_KEY, value);
    }
    return value;
};

// Abre a fila na versão desta aplicação. Se o navegador já a tiver numa versão mais recente (correu aqui outra
// versão da aplicação), abre-a como está em vez de falhar: a versão mais recente tem sempre as tabelas desta. Sem
// isto o login ficava bloqueado com "The requested version (2) is less than the existing version (3)".
const openQueue = (): Promise<IDBDatabase> => new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 3);
    request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME, { keyPath: 'id' });
        // Operações recebidas cuja transacção ainda não chegou completa.
        if (!database.objectStoreNames.contains(INCOMING_STORE)) database.createObjectStore(INCOMING_STORE, { keyPath: 'id' });
        if (!database.objectStoreNames.contains(UNREADABLE_STORE)) database.createObjectStore(UNREADABLE_STORE, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
        if (request.error?.name !== 'VersionError') { reject(request.error); return; }
        const existing = indexedDB.open(DB_NAME);
        existing.onsuccess = () => resolve(existing.result);
        existing.onerror = () => reject(existing.error);
    };
});

const putOperations = async <T extends { id: string }>(operations: T[], store = STORE_NAME) => {
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

const readAll = async <T extends { createdAt: string } = SyncOperation>(store: string): Promise<T[]> => {
    const database = await openQueue();
    const values = await new Promise<T[]>((resolve, reject) => {
        const request = database.transaction(store, 'readonly').objectStore(store).getAll();
        request.onsuccess = () => resolve((request.result || []).sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
        request.onerror = () => reject(request.error);
    });
    database.close();
    return values;
};

// Envia no máximo MAX_PUSH_OPERATIONS (e cerca de MAX_PUSH_BYTES), sem nunca partir uma transacção entre dois envios.
const getQueuedOperations = async (limit = MAX_PUSH_OPERATIONS): Promise<{ batch: SyncOperation[]; more: boolean }> => {
    // As alterações postas de parte por serem grandes demais continuam guardadas, mas não entram nos lotes.
    const all = (await readAll<QueuedOperation>(STORE_NAME)).filter(operation => !operation.oversized);
    const batch: SyncOperation[] = [];
    let bytes = 0;
    for (let index = 0; index < all.length; index++) {
        const size = encryptedSize(all[index]);
        if (batch.length && (batch.length >= limit || bytes + size > MAX_PUSH_BYTES)) {
            const lastTx = batch[batch.length - 1].txId;
            if (lastTx) batch.push(...all.slice(index).filter(operation => operation.txId === lastTx));
            break;
        }
        batch.push(all[index]);
        bytes += size;
    }
    return { batch, more: batch.length < all.length };
};

/**
 * Põe de parte alterações que o servidor não aceita por tamanho (e as outras partes da mesma transacção, que não
 * podem seguir sozinhas). Ficam na fila, marcadas, para não se perderem nem bloquearem o envio do resto.
 */
const setAsideOversized = async (ids: string[], reason: string) => {
    if (!ids.length) return 0;
    const all = await readAll<QueuedOperation>(STORE_NAME);
    const txIds = new Set(all.filter(operation => ids.includes(operation.id) && operation.txId).map(operation => operation.txId));
    const marked = all.filter(operation => ids.includes(operation.id) || (operation.txId && txIds.has(operation.txId)))
        .map(operation => ({ ...operation, oversized: reason }));
    await putOperations(marked);
    console.warn(`[CloudSync] ${marked.length} alteração(ões) postas de parte: ${reason}. Ficam guardadas neste dispositivo.`);
    return marked.length;
};

/** Alterações guardadas aqui que não cabem no servidor (contam como por enviar). */
export const getOversizedCount = async () => (await readAll<QueuedOperation>(STORE_NAME)).filter(operation => operation.oversized).length;

// Tempo de espera proporcional ao volume: em ligações lentas (dezenas de KB/s) 2 MB levam minutos.
const requestTimeout = (bytes: number) => Math.min(300_000, 30_000 + Math.ceil(bytes / 10));

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

const clearStore = async (store: string) => deleteOperations((await readAll(store)).map(operation => operation.id), store);

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

type HealJournal = Record<string, number>;
const readHealJournal = (): HealJournal => {
    try { return JSON.parse(localStorage.getItem(scopedStorageKey(HEAL_JOURNAL_KEY)) || '{}') || {}; } catch { return {}; }
};
const writeHealJournal = (journal: HealJournal) => {
    const entries = Object.entries(journal).sort((a, b) => a[1] - b[1]).slice(-HEAL_JOURNAL_MAX);
    localStorage.setItem(scopedStorageKey(HEAL_JOURNAL_KEY), JSON.stringify(Object.fromEntries(entries)));
};
/** Regista os registos alterados aqui: daqui a um minuto segue a cópia completa de cada um (autocura). */
const noteHealRows = (statements: Array<{ sql: string; params?: unknown[] }>) => {
    const journal = readHealJournal();
    const now = Date.now();
    let changed = false;
    for (const statement of statements) {
        const table = mutationTable(statement.sql);
        const rowId = table && isSyncableTable(table) ? statementRowId(statement.sql, statement.params || []) : null;
        if (!table || !rowId) continue;
        const key = `${table}\u0001${rowId}`;
        if (!(key in journal)) { journal[key] = now; changed = true; }
    }
    if (changed) writeHealJournal(journal);
};

const snapshotOperation = (table: string, row: Record<string, unknown>, order: number, bootstrap: boolean): SyncOperation | null => {
    const columns = Object.keys(row);
    if (!columns.length) return null;
    const params = columns.map(column => row[column] ?? null);
    if (JSON.stringify(params).length > MAX_SNAPSHOT_ROW_CHARS) return null;
    return {
        id: crypto.randomUUID(), deviceId: getDeviceId(), kind: 'snapshot', table, columns, params, commandVersion: 1,
        tenantId: activeConfig?.tenantId || '', entityId: String(row.id || ''),
        createdAt: new Date(Date.now() + order).toISOString(), bootstrap, heal: true,
    };
};

/** Cópias dos registos alterados aqui há mais de um minuto (estado actual de cada um). */
const createJournalHealOperations = async () => {
    const journal = readHealJournal();
    const due = Object.entries(journal).filter(([, at]) => at <= Date.now() - HEAL_DELAY_MS);
    if (!due.length) return;
    const operations: SyncOperation[] = [];
    let order = 0;
    for (const [key] of due) {
        const [table, rowId] = key.split('\u0001');
        delete journal[key];
        if (!/^[a-z_][a-z0-9_]*$/iu.test(table) || !isSyncableTable(table) || !(await localTableColumns(table)).has('id')) continue;
        const row = (await sqlite.all<Record<string, unknown>>(`SELECT * FROM ${quoteIdentifier(table)} WHERE id = ?`, [rowId]))[0];
        const operation = row ? snapshotOperation(table, row, order++, false) : null;
        if (operation) operations.push(operation);
    }
    await putOperations(operations);
    writeHealJournal(journal);
};

/**
 * Conflitos de uma transacção em que a cópia de autocura corrigiu uma das partes: as outras partes (do mesmo
 * crédito, pagamento…) também chegaram na cópia completa do dispositivo de origem, por isso ficam resolvidas.
 */
const resolveHealedTransactions = async () => {
    const rows = await sqlite.all<{ id: string; status: string; resolutionNote: string | null; operation: string }>(
        `SELECT id, status, resolutionNote, operation FROM sync_conflicts WHERE status = 'pending' OR resolutionNote = ?`, [HEAL_NOTE]);
    const healedTx = new Set<string>();
    const pendingByTx = new Map<string, string[]>();
    for (const row of rows) {
        let txId: string | undefined;
        try { txId = JSON.parse(row.operation)?.txId; } catch { continue; }
        if (!txId) continue;
        if (row.status === 'accepted') healedTx.add(txId);
        else pendingByTx.set(txId, [...(pendingByTx.get(txId) || []), row.id]);
    }
    const now = new Date().toISOString();
    const statements = [...pendingByTx].filter(([txId]) => healedTx.has(txId))
        .flatMap(([, ids]) => ids.map(id => ({ sql: CONFLICT_RESOLVE_SQL, params: [HEAL_NOTE, now, id] })));
    if (statements.length) await sqlite.transaction(statements as SqlTransactionStatement[]);
};

const syncIsActive = () => !applyingRemote
    && !!activeConfig
    && isCloudSyncUrl(activeConfig.url);

export const enqueueSyncOperation = async (sql: string, params: unknown[] = []) => {
    if (!syncIsActive() || !isSyncableOperation(sql)) return;
    const command = toStatementCommand(sql, params);
    if (!command) {
        console.warn('[CloudSync] Mutação sem comando versionado; sincronização recusada.', mutationTable(sql));
        return;
    }
    await putOperations([{ id: crypto.randomUUID(), deviceId: getDeviceId(), ...command, createdAt: new Date().toISOString() }]);
    noteHealRows([{ sql, params }]);
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
    noteHealRows(statements);

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

// A derivação (120 000 iterações) é cara: cada chave é calculada uma vez por sessão.
const derivedKeys = new Map<string, Promise<CryptoKey>>();
const deriveKey = (secret: string, tenantId: string) => {
    const cacheId = `${tenantId}\n${secret}`;
    let key = derivedKeys.get(cacheId);
    if (!key) {
        key = (async () => {
            const encoder = new TextEncoder();
            const material = await crypto.subtle.importKey('raw', encoder.encode(secret), 'PBKDF2', false, ['deriveKey']);
            return crypto.subtle.deriveKey(
                { name: 'PBKDF2', salt: encoder.encode(`tango-sync:${tenantId}`), iterations: 120_000, hash: 'SHA-256' },
                material,
                { name: 'AES-GCM', length: 256 },
                false,
                ['encrypt', 'decrypt']
            );
        })();
        key.catch(() => derivedKeys.delete(cacheId));
        derivedKeys.set(cacheId, key);
    }
    return key;
};

const normalizeAccessCode = (value: string) => value.trim().replace(/[-\s]/g, '').toUpperCase();

/**
 * Formas do mesmo Código de Acesso: como foi guardado, sem hífens/espaços e no formato do Tango Master
 * (TG-XXXX-XXXX). O servidor aceita todas, mas a chave de cifra depende do texto exacto: um dispositivo que
 * guardou o código escrito de outra forma não conseguia ler o que o outro enviou.
 */
const accessCodeVariants = (values: Array<string | null | undefined>) => {
    const variants: string[] = [];
    for (const value of values) {
        if (!value) continue;
        const normalized = normalizeAccessCode(value);
        variants.push(value, value.trim(), normalized);
        if (/^TG[A-Z0-9]{8}$/.test(normalized)) variants.push(`TG-${normalized.slice(2, 6)}-${normalized.slice(6)}`);
    }
    return [...new Set(variants.filter(variant => variant.length >= 4))];
};

/** Chaves para ler: a de envio primeiro, depois as outras formas conhecidas do código. */
const readKeysFor = async (config: CloudSyncConfig) => config.cryptoKeys?.read ||
    Promise.all(accessCodeVariants([config.apiKey, ...(config.extraKeys || [])]).map(secret => deriveKey(secret, config.tenantId)));

const writeKeyFor = async (config: CloudSyncConfig) => config.cryptoKeys?.write || deriveKey(config.apiKey, config.tenantId);

/**
 * Versão web: deriva, uma única vez ao ligar a empresa, as chaves de cifra (não exportáveis) a partir das formas
 * do Código de Acesso. Depois disto o código pode ser esquecido; as chaves ficam no cofre (cofre-segredos.ts).
 */
export const deriveWebSyncKeys = async (tenantId: string, codes: Array<string | null | undefined>) => {
    const sendCode = codes.find(Boolean);
    if (!sendCode) throw new Error('Código de Acesso em falta.');
    const write = await deriveKey(sendCode, tenantId);
    const read = await Promise.all(accessCodeVariants([sendCode, ...codes]).map(secret => deriveKey(secret, tenantId)));
    // O código não fica na cache em memória (a chave da cache é o próprio código).
    for (const secret of accessCodeVariants([sendCode, ...codes])) derivedKeys.delete(`${tenantId}\n${secret}`);
    return { tenantId, write, read };
};

const sameTenant = (left?: string, right?: string) =>
    String(left || '').replace(/[^a-z0-9]/giu, '').toUpperCase() === String(right || '').replace(/[^a-z0-9]/giu, '').toUpperCase();

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

/** Tenta cada chave; a que funcionar passa para o início da lista (as seguintes costumam usar a mesma). */
const decryptWithAny = async (payload: string, keys: CryptoKey[]): Promise<SyncOperation> => {
    for (let index = 0; index < keys.length; index++) {
        try {
            const operation = await decryptOperation(payload, keys[index]);
            if (index > 0) keys.unshift(...keys.splice(index, 1));
            return operation;
        } catch {
            // tenta a chave seguinte
        }
    }
    throw new Error('Alteração cifrada com um Código de Acesso diferente.');
};

const quoteIdentifier = (value: string) => `"${value.replace(/"/g, '""')}"`;

// Fotografia completa das tabelas sincronizáveis, para que um dispositivo novo receba tudo o que já existe.
// As linhas entram com INSERT OR IGNORE: nunca substituem dados que o outro dispositivo já tenha.
// Lê por páginas (as tabelas com ficheiros em pequenas páginas) e cede a vez entre páginas: uma leitura única
// de uma tabela grande ocupava a base mais de 60 s e as outras consultas falhavam por timeout.
const BOOTSTRAP_PAGE_SIZE = 200;
const BOOTSTRAP_FILE_TABLES: Record<string, number> = { payment_proofs: 5, credit_documents: 5, rh_documento_ficheiro: 5 };
// O servidor aceita até 2 MB por operação cifrada (base64 ≈ +35%): linhas maiores não se enviam.
const MAX_SNAPSHOT_ROW_CHARS = 1_400_000;
const createBootstrapOperations = async () => {
    if (localStorage.getItem(scopedStorageKey(CLOUD_SYNC_BOOTSTRAP_KEY)) === 'true'
        && localStorage.getItem(scopedStorageKey(REPAIR_SNAPSHOT_KEY)) === 'true'
        && localStorage.getItem(scopedStorageKey(HEAL_SNAPSHOT_KEY)) === 'true') return;
    const tables = await sqlite.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
    const operations: SyncOperation[] = [];
    let order = 0;
    let oversized = 0;

    for (const { name } of tables) {
        if (!/^[\w-]+$/u.test(name) || SYNC_EXCLUDED_TABLES.has(name.toLowerCase())) continue;
        const pageSize = BOOTSTRAP_FILE_TABLES[name.toLowerCase()] || BOOTSTRAP_PAGE_SIZE;
        for (let offset = 0; ; offset += pageSize) {
            const rows = await sqlite.all<Record<string, unknown>>(`SELECT * FROM ${quoteIdentifier(name)} LIMIT ${pageSize} OFFSET ${offset}`);
            for (const row of rows) {
                if (!Object.keys(row).length) continue;
                const operation = snapshotOperation(name, row, order++, true);
                if (!operation) { oversized += 1; continue; }
                operations.push(operation);
                if (operations.length >= 250) await putOperations(operations.splice(0));
            }
            if (rows.length < pageSize) break;
            await new Promise(resolve => setTimeout(resolve, 0));
        }
    }
    await putOperations(operations);
    if (oversized) console.warn(`[CloudSync] ${oversized} registos maiores do que o limite de envio ficaram só neste dispositivo.`);
    localStorage.setItem(scopedStorageKey(CLOUD_SYNC_BOOTSTRAP_KEY), 'true');
    localStorage.setItem(scopedStorageKey(REPAIR_SNAPSHOT_KEY), 'true');
    localStorage.setItem(scopedStorageKey(HEAL_SNAPSHOT_KEY), 'true');
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
            sqlById: SYNC_SQL_BY_ID,
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
// ── Mesmo utilizador com IDs diferentes ──────────────────────────────────────────────────────────────────────
// A mesma pessoa (mesmo email) criada em separado em dois dispositivos fica com dois IDs. A lista recebida não se
// sobrepõe à local, e por isso as mensagens do chat e o histórico de um ID não aparecem a quem entra com o outro.
// Cada choque fica registado aqui (para o ícone, o diagnóstico e a unificação) em vez de ser esquecido.
const USER_CLASHES_KEY = 'cloud_sync_user_clashes_v1';
export type UserIdClash = { email: string; name: string; localId: string; remoteId: string; at: string };
const readUserClashes = (): Record<string, UserIdClash> => {
    try { return JSON.parse(localStorage.getItem(scopedStorageKey(USER_CLASHES_KEY)) || '{}') || {}; } catch { return {}; }
};
const recordUserClashes = (found: Array<Omit<UserIdClash, 'at'>>, resolvedEmails: string[] = []) => {
    const current = readUserClashes();
    for (const email of resolvedEmails) delete current[email];
    for (const clash of found) current[clash.email] = { ...clash, at: new Date().toISOString() };
    localStorage.setItem(scopedStorageKey(USER_CLASHES_KEY), JSON.stringify(current));
};
/** Choques ainda reais: o email continua aqui com um ID diferente do que os outros dispositivos usam. */
export const getUserIdClashes = async (): Promise<UserIdClash[]> => {
    const clashes = Object.values(readUserClashes());
    if (!clashes.length) return [];
    const users = await sqlite.all<{ id: string; email: string }>('SELECT id, email FROM users').catch(() => [] as Array<{ id: string; email: string }>);
    const byEmail = new Map(users.map(user => [String(user.email || '').trim().toLowerCase(), String(user.id)]));
    return clashes.filter(clash => byEmail.has(clash.email) && byEmail.get(clash.email) !== clash.remoteId);
};

/**
 * Impressão digital de cada utilizador deste dispositivo: hash do email (com a empresa) e o ID. O servidor compara
 * entre dispositivos sem ver emails nem nomes, e o Tango Master mostra quem tem IDs diferentes.
 */
const usersFingerprint = async (tenantId: string) => {
    const users = await sqlite.all<{ id: string; email: string }>('SELECT id, email FROM users').catch(() => [] as Array<{ id: string; email: string }>);
    const rows: Array<[string, string]> = [];
    for (const user of users.slice(0, 500)) {
        const email = String(user.email || '').trim().toLowerCase();
        if (!email || !user.id) continue;
        const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${tenantId}:${email}`)));
        rows.push([Array.from(digest.slice(0, 12), byte => byte.toString(16).padStart(2, '0')).join(''), String(user.id)]);
    }
    return rows;
};

const applyUserRoster = async (roster: UsersRoster) => {
    if (window.electronAPI?.syncUsersApply) {
        const result = await window.electronAPI.syncUsersApply({ columns: roster.columns, rows: roster.rows, deleted: roster.deleted || [] });
        if (result.clashes?.length) recordUserClashes(result.clashes);
        return result.applied + result.deleted;
    }
    const local = new Set(await sharedUserColumns());
    const incoming = Array.isArray(roster.columns) ? roster.columns.map(String) : [];
    const columns = incoming.filter(column => local.has(column));
    if (!columns.includes('id') || !columns.includes('password') || !columns.includes('email')) return 0;
    // Colunas obrigatórias neste navegador que o outro dispositivo pode não ter (bases antigas).
    const missing = ['name', 'createdAt'].filter(column => local.has(column) && !columns.includes(column));
    const target = [...columns, ...missing];
    const list = target.map(quoteIdentifier).join(', ');
    const updates = columns.filter(column => column !== 'id').map(column => `${quoteIdentifier(column)} = excluded.${quoteIdentifier(column)}`).join(', ');
    const upsert = `INSERT INTO users (${list}) VALUES (${target.map(() => '?').join(', ')}) ON CONFLICT(id) DO UPDATE SET ${updates}`;
    const statements: SqlTransactionStatement[] = [];
    // Alterações feitas neste navegador e ainda não enviadas (ex.: nova palavra-passe) ganham à lista recebida:
    // a lista de outro dispositivo pode ser anterior a elas.
    const sentState: Record<string, string> = JSON.parse(localStorage.getItem(scopedStorageKey(USERS_STATE_KEY)) || '{}');
    const hasSentBefore = Object.keys(sentState).length > 0;
    const localNow = hasSentBefore ? (await readLocalUsers()).fingerprints : {};
    const appliedIds: string[] = [];
    const clashes: Array<Omit<UserIdClash, 'at'>> = [];
    const resolvedEmails: string[] = [];
    for (const row of roster.rows || []) {
        if (!Array.isArray(row)) continue;
        const value = (column: string) => row[incoming.indexOf(column)] ?? null;
        const id = String(value('id') || '');
        if (hasSentBefore && localNow[id] && sentState[id] !== localNow[id]) continue;
        const email = String(value('email') || '').trim().toLowerCase();
        // Sem perfil (role) não se sabe que permissões dar: o utilizador não entra.
        if (!id || !email || !value('password') || !value('role')) continue;
        // Email já usado por outro utilizador deste navegador: não se sobrepõe.
        const clash = await sqlite.all<{ id: string }>('SELECT id FROM users WHERE LOWER(email) = ? AND id <> ? LIMIT 1', [email, id]);
        if (clash.length) {
            clashes.push({ email, name: String(value('name') || email).slice(0, 120), localId: String(clash[0].id), remoteId: id });
            continue;
        }
        resolvedEmails.push(email);
        // Nome de utilizador já usado por outro: entra sem ele (o login também aceita o email).
        const username = columns.includes('username') && value('username')
            ? String(value('username')) : null;
        const usernameTaken = username
            ? (await sqlite.all<{ id: string }>('SELECT id FROM users WHERE LOWER(username) = ? AND id <> ? LIMIT 1', [username.toLowerCase(), id])).length > 0
            : false;
        const params = target.map(column => {
            const current = column === 'username' && usernameTaken ? null : value(column);
            if (current !== null && current !== '') return typeof current === 'object' ? JSON.stringify(current) : current;
            if (column === 'createdAt') return new Date().toISOString();
            if (column === 'name') return email;
            if (column === 'status') return 'active';
            return current;
        });
        statements.push({ sql: upsert, params });
        appliedIds.push(id);
    }
    for (const id of roster.deleted || []) statements.push({ sql: 'DELETE FROM users WHERE id = ?', params: [String(id)] });
    recordUserClashes(clashes, resolvedEmails);
    if (!statements.length) return 0;
    let applied = 0;
    applyingRemote = true;
    try {
        try {
            await sqlite.transaction(statements);
            applied = statements.length;
        } catch (error) {
            // Um registo inválido não pode impedir os restantes de entrar: um a um.
            console.warn('[CloudSync] Lista de utilizadores aplicada registo a registo:', (error as Error)?.message);
            for (const statement of statements) {
                try {
                    await sqlite.transaction([statement]);
                    applied += 1;
                } catch (rowError) {
                    console.warn('[CloudSync] Utilizador recebido não gravado:', (rowError as Error)?.message);
                }
            }
        }
    } finally {
        applyingRemote = false;
    }
    if (!applied) throw new Error('Nenhum utilizador recebido pôde ser gravado neste navegador.');
    // O que chegou não volta a ser enviado por este navegador. Só os registos recebidos ficam marcados: uma alteração
    // local ainda por enviar não pode ser dada como enviada (perdia-se, ex.: a palavra-passe nova nunca saía daqui).
    if (!hasSentBefore) await saveUsersState();
    else {
        const { fingerprints } = await readLocalUsers();
        for (const id of appliedIds) if (fingerprints[id]) sentState[id] = fingerprints[id];
        for (const id of roster.deleted || []) delete sentState[String(id)];
        localStorage.setItem(scopedStorageKey(USERS_STATE_KEY), JSON.stringify(sentState));
    }
    window.dispatchEvent(new Event(USERS_SYNCED_EVENT));
    return applied;
};

/**
 * Navegador: depois de um login com palavra-passe, o registo de quem entrou volta a ser enviado uma vez. É a palavra-passe
 * acabada de confirmar, por isso corrige uma alteração que versões anteriores davam por enviada sem a enviar (os outros
 * dispositivos ficavam com a antiga e o login falhava neles).
 */
export const republishSignedInUser = (userId: string) => {
    if (window.electronAPI || !userId) return;
    try {
        const flag = scopedStorageKey(`cloud_sync_user_republished_v1:${userId}`);
        if (localStorage.getItem(flag)) return;
        const state: Record<string, string> = JSON.parse(localStorage.getItem(scopedStorageKey(USERS_STATE_KEY)) || '{}');
        if (Object.keys(state).length) {
            delete state[userId];
            localStorage.setItem(scopedStorageKey(USERS_STATE_KEY), JSON.stringify(state));
        }
        localStorage.setItem(flag, new Date().toISOString());
        if (activeConfig) scheduleSync(1500);
    } catch (error) {
        console.warn('[CloudSync] Não foi possível marcar o utilizador para reenvio:', error);
    }
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

const isUsersRoster = (operation: SyncOperation) => (operation as any).kind === 'users';

const applyOperations = async (operations: SyncOperation[], caughtUp = true): Promise<ApplyResult> => {
    // Só a empresa activa. Uma operação de formato mais recente segue também: a aplicação retém-na como «de outra
    // versão» (antes era deitada fora aqui e, com o cursor a avançar, perdia-se).
    const foreign = operations.filter(operation => !activeConfig || !sameTenant(operation.tenantId, activeConfig.tenantId));
    if (foreign.length) console.warn(`[CloudSync] ${foreign.length} alteração(ões) de outra empresa ignoradas.`);
    const accepted = operations.filter(operation => !foreign.includes(operation));
    const waiting = await readAll(INCOMING_STORE);
    // Listas de utilizadores que ficaram por aplicar (ex.: chegaram ao computador sem sessão iniciada), pela ordem
    // de chegada ao servidor: os relógios dos dispositivos podem diferir e uma lista antiga não pode ganhar a uma nova.
    const rosters = [...waiting, ...accepted].filter(isUsersRoster);
    const valid = accepted.filter(operation => !isUsersRoster(operation));
    const retryRosters: SyncOperation[] = [];
    let rosterApplied = 0;
    for (const roster of rosters) {
        try { rosterApplied += await applyUserRoster(roster as unknown as UsersRoster) ? 1 : 0; }
        catch (error) {
            console.warn('[CloudSync] Utilizadores recebidos não aplicados:', error);
            // No computador a recusa costuma ser falta de sessão: tenta de novo nas próximas sincronizações.
            if (window.electronAPI && Date.parse(roster.createdAt) > Date.now() - 7 * INCOMPLETE_GROUP_MAX_AGE_MS) retryRosters.push(roster);
        }
    }
    const { complete, pending } = groupOperations([...waiting.filter(operation => !isUsersRoster(operation)), ...valid]);

    // Transacções que nunca chegam completas não podem ficar à espera para sempre — mas o prazo conta desde que
    // as partes chegaram aqui e só depois de recebidas todas as páginas (o resto pode vir na página seguinte).
    const { expired, waiting: stillWaiting } = splitExpired(stampReceived(pending, new Date().toISOString()), Date.now(), caughtUp, INCOMPLETE_GROUP_MAX_AGE_MS);
    const groups: RemoteGroup[] = complete.map(group => ({ operations: group }));
    // Partes de uma transacção incompleta não são aplicadas: vão para revisão, com o comando original guardado.
    for (const operation of expired) groups.push({ operations: [markIncomplete(operation)] });

    const result = await applyGroups(groups);
    if (result.applied > 0) reprocessDirty = true;
    await deleteOperations(waiting.map(operation => operation.id), INCOMING_STORE);
    await putOperations([...stillWaiting, ...retryRosters], INCOMING_STORE);
    return { ...result, applied: result.applied + rosterApplied };
};

/**
 * Navegador: lista completa de utilizadores guardada no servidor pelo computador da empresa. Não depende do
 * cursor: chega mesmo que tenha sido enviada antes de este navegador ser ligado ou cifrada com outra forma do código.
 */
const receiveUsersRoster = async (config: CloudSyncConfig, saved: any, keys: CryptoKey[]): Promise<UsersRosterOutcome> => {
    if (saved === undefined) return { state: 'error', message: 'O servidor ainda não tem a versão mais recente.' };
    if (!saved) return { state: 'none' };
    if (saved.unchanged || !saved.payload) return { state: 'current', at: saved.updatedAt };
    let roster: SyncOperation;
    try {
        roster = await decryptWithAny(String(saved.payload), keys);
    } catch {
        return { state: 'unreadable', at: saved.updatedAt };
    }
    if (!isUsersRoster(roster) || !sameTenant(roster.tenantId, config.tenantId)) return { state: 'unreadable', at: saved.updatedAt };
    try {
        const applied = await applyUserRoster(roster as unknown as UsersRoster);
        // Nada gravado (ex.: base deste navegador ainda a preparar): não marcar como recebida, volta a pedir.
        if (!applied) return { state: 'error', at: saved.updatedAt, message: 'A base de dados deste navegador ainda não está pronta.' };
        localStorage.setItem(scopedStorageKey(USERS_ROSTER_AT_KEY), String(saved.updatedAt || ''));
        return { state: 'applied', at: saved.updatedAt, applied };
    } catch (error: any) {
        return { state: 'error', at: saved.updatedAt, message: error?.message || 'Os utilizadores recebidos não puderam ser gravados.' };
    }
};

const localUsersCount = async () => {
    try {
        return Number((await sqlite.all<{ total: number }>('SELECT COUNT(*) AS total FROM users'))[0]?.total || 0);
    } catch {
        return 0;
    }
};

let lastUsersRoster: UsersRosterOutcome | undefined;
let rejectedRosterAt: string | undefined;
export const getLastUsersRoster = () => lastUsersRoster;

// Reprocessa automaticamente operações retidas em sync_conflicts que nunca foram aplicadas: inserções e snapshots,
// comandos de outra versão que esta já conhece e alterações que falharam por o registo de que dependiam ainda não
// existir. Só volta a tentar quando chegou ou se aplicou algo novo (não repete as mesmas falhas a cada 10 s).
let reprocessDirty = true;
export const reprocessRetainedOperations = async (force = false): Promise<number> => {
    if (!force && !reprocessDirty) return 0;
    reprocessDirty = false;
    try {
        const rows = await sqlite.all<{ id: string; operation: string; entityType?: string }>(
            `SELECT id, operation, entityType FROM sync_conflicts WHERE status = 'pending' ORDER BY createdAt ASC LIMIT 5000`
        );
        if (!rows || rows.length === 0) return 0;

        const groups = reprocessableGroups(rows, SYNC_SQL_BY_ID);
        if (groups.length === 0) return 0;
        const result = await applyGroups(groups);
        if (result.applied > 0) {
            // Uma alteração aplicada pode desbloquear as que dependiam dela: tenta de novo na próxima passagem.
            reprocessDirty = true;
            console.log(`[CloudSync] ${result.applied} registos de sync_conflicts reprocessados e aplicados com sucesso.`);
        }
        return result.applied;
    } catch (err) {
        console.warn('[CloudSync] Erro ao reprocessar operações retidas:', err);
        return 0;
    }
};

const emitStatus = (detail: CloudSyncStatus) => {
    lastStatus = detail;
    window.dispatchEvent(new CustomEvent('tango-cloud-sync-status', { detail }));
};

/**
 * Versão web: apaga a cópia local deste navegador e recebe tudo de novo da nuvem (resolve conflitos antigos que
 * já não se conseguem reaplicar). Recusado com alterações por enviar, para não perder nada deste navegador.
 */
export const rebuildBrowserReplica = async () => {
    if (window.electronAPI) throw new Error('No computador os conflitos resolvem-se sozinhos depois de instalar a versão nova.');
    const pending = await getPendingSyncCount();
    if (pending > 0) throw new Error(`Ainda há ${pending} alteração(ões) deste navegador por enviar. Sincronize primeiro e tente de novo.`);
    // Só com a sincronização a funcionar: se não se consegue enviar nem receber agora, a cópia nova ficaria vazia.
    if (lastStatus.state === 'error') throw new Error('A sincronização está com erro neste momento. Resolva a ligação (ou aguarde «Sincronizado») antes de receber tudo de novo.');
    // As alterações recebidas e ainda por aplicar (partes de transacções à espera do resto, cargas ilegíveis) estão
    // todas no servidor e voltam a ser recebidas desde o início: não se perdem ao reconstruir, por isso não bloqueiam.
    await clearStore(INCOMING_STORE);
    await clearStore(UNREADABLE_STORE);
    localStorage.setItem(scopedStorageKey(CURSOR_KEY), '0');
    // Este navegador não volta a enviar a fotografia completa: os dados vêm todos da nuvem.
    localStorage.setItem(scopedStorageKey(CLOUD_SYNC_BOOTSTRAP_KEY), 'true');
    localStorage.setItem(scopedStorageKey(REPAIR_SNAPSHOT_KEY), 'true');
    localStorage.setItem(scopedStorageKey(HEAL_SNAPSHOT_KEY), 'true');
    localStorage.removeItem(scopedStorageKey(USERS_STATE_KEY));
    localStorage.removeItem(scopedStorageKey(USERS_ROSTER_AT_KEY));
    localStorage.setItem(REBUILD_REPLICA_FLAG, new Date().toISOString());
    window.location.reload();
};

/** Data da cópia guardada antes da última reconstrução deste navegador (null = não há). */
export const replicaBackupAt = () => (window.electronAPI ? null : localStorage.getItem(REPLICA_BACKUP_AT_KEY));

/** Repõe a cópia anterior à reconstrução e volta a receber da nuvem o que mudou desde então (por cima). */
export const restoreBrowserReplicaBackup = () => {
    if (window.electronAPI || !replicaBackupAt()) throw new Error('Não há cópia anterior guardada neste navegador.');
    localStorage.setItem(scopedStorageKey(CURSOR_KEY), '0');
    localStorage.setItem(RESTORE_REPLICA_FLAG, new Date().toISOString());
    window.location.reload();
};

/**
 * Alterações recebidas que este dispositivo ainda não consegue aplicar por serem de outra versão do sistema (comando
 * desconhecido ou formato mais recente). Ficam retidas e aplicam-se sozinhas quando os dois tiverem a mesma versão.
 */
export const getOtherVersionRetainedCount = async () => {
    const rows = await sqlite.all<{ operation: string }>(`SELECT operation FROM sync_conflicts WHERE status = 'pending'`).catch(() => []);
    return rows.filter(row => {
        try { return isOtherVersionReason(JSON.parse(row.operation)?.reason); } catch { return false; }
    }).length;
};

/** Contagens que decidem o ícone: fila, retidas, ilegíveis, grandes demais e conflitos por ver. */
const collectSyncCounts = async (extra: Partial<SyncCounts> = {}): Promise<SyncCounts> => {
    const queue = await readAll<QueuedOperation>(STORE_NAME).catch(() => [] as QueuedOperation[]);
    const oversized = queue.filter(operation => operation.oversized).length;
    const waiting = (await readAll(INCOMING_STORE).catch(() => [])).length;
    const unreadable = (await readAll<EncryptedPending>(UNREADABLE_STORE).catch(() => [] as EncryptedPending[]))
        .filter(item => !activeConfig || item.tenantId === activeConfig.tenantId).length;
    const rows = await sqlite.all<{ operation: string }>(`SELECT operation FROM sync_conflicts WHERE status = 'pending'`).catch(() => []);
    const otherVersion = rows.filter(row => {
        try { return isOtherVersionReason(JSON.parse(row.operation)?.reason); } catch { return false; }
    }).length;
    const userClashes = (await getUserIdClashes().catch(() => [])).length;
    return { pending: queue.length - oversized, oversized, waiting, unreadable, conflicts: rows.length - otherVersion, otherVersion, userClashes, ...extra };
};

/** Alterações locais ainda por enviar para a nuvem. */
export const getPendingSyncCount = async () => (await readAll(STORE_NAME)).length;

const emitPending = async () => {
    if (lastStatus.state === 'syncing') return;
    const pending = await getPendingSyncCount().catch(() => 0);
    // Uma gravação local não esconde um erro nem algo que já precisava de atenção.
    const state = lastStatus.state === 'error' || lastStatus.state === 'attention' ? lastStatus.state : 'pending';
    emitStatus({ ...lastStatus, state, pending });
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
        if (config.sessionAuth ? !config.cryptoKeys : !config.apiKey || config.apiKey.length < 8) return { success: false, message: 'Configure uma chave de sincronização com pelo menos 8 caracteres.' };
        // Último erro antes desta tentativa (o estado passa já a «a sincronizar»), para o diagnóstico do servidor.
        const previousError = lastStatus.state === 'error' ? lastStatus.message : undefined;
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
            await createJournalHealOperations().catch(error => console.warn('[CloudSync] Autocura:', error));
            const key = await writeKeyFor(config);
            const readKeys = await readKeysFor(config);
            let cursor = Number(localStorage.getItem(scopedStorageKey(CURSOR_KEY)) || '0');
            let totalPushed = 0;
            let totalPulled = await reprocessRetainedOperations();
            let totalConflicts = 0;
            let totalSkipped = 0;
            let usersSent = false;
            let hasMoreRemote = false;
            let usersRoster: UsersRosterOutcome | undefined;
            const profile = await companyProfile();
            // Navegador: pede sempre a lista de utilizadores do computador (só vem de novo quando mudou, ou
            // completa se este navegador ainda não tiver nenhum utilizador).
            const isWeb = !window.electronAPI;
            const rosterSince = !isWeb ? undefined : await localUsersCount() > 0
                ? localStorage.getItem(scopedStorageKey(USERS_ROSTER_AT_KEY)) || undefined
                : rejectedRosterAt;
            // Computador: lista de utilizadores cifrada no processo principal, enviada só quando muda.
            const usersOut = window.electronAPI?.syncUsersPayload
                ? await window.electronAPI.syncUsersPayload({
                    apiKey: config.apiKey, tenantId: config.tenantId, deviceId: getDeviceId(),
                    knownDigest: localStorage.getItem(scopedStorageKey(USERS_DIGEST_KEY)),
                    knownIds: JSON.parse(localStorage.getItem(scopedStorageKey(USERS_IDS_KEY)) || '[]'),
                }).catch(error => { console.warn('[CloudSync] Utilizadores não enviados:', error); return null; })
                : null;

            let sizeRetries = 0;
            for (let round = 0; round < MAX_PULL_ROUNDS; round++) {
                const { batch: queued, more } = await getQueuedOperations(pushLimit);
                const supported = queued.filter(operation => ['statement', 'snapshot', 'dynamic'].includes(operation.kind));
                const outgoing: Array<{ id: string; deviceId: string; payload: string; kind?: 'users' }> = await Promise.all(
                    supported.map(async operation => ({ id: operation.id, deviceId: operation.deviceId, payload: await encryptOperation(operation, key) })));
                // Alteração que, cifrada, não cabe no servidor: fica de parte (guardada) e o resto segue já.
                const tooLarge = outgoing.filter(item => item.payload.length > MAX_OPERATION_BYTES).map(item => item.id);
                if (tooLarge.length) {
                    await setAsideOversized(tooLarge, `maior do que ${Math.round(MAX_OPERATION_BYTES / 1_000_000)} MB depois de cifrada`);
                    if (++sizeRetries > 30) throw new Error('Não foi possível preparar um envio dentro do limite do servidor.');
                    round -= 1;
                    continue;
                }
                // Lista completa: o servidor guarda também a última à parte, para a versão web a pedir directamente.
                if (round === 0 && usersOut?.payload && usersOut.id) outgoing.push({ id: usersOut.id, deviceId: getDeviceId(), payload: usersOut.payload, kind: 'users' });
                const diagnostics = round === 0 ? await syncDiagnostics(previousError) : undefined;
                const requestBody = JSON.stringify({
                    tenantId: config.tenantId, deviceId: getDeviceId(), cursor, operations: outgoing, maxBytes: MAX_PULL_BYTES,
                    ...(diagnostics ? { diagnostics } : {}),
                    ...(round === 0 && profile ? { companyProfile: profile } : {}),
                    ...(round === 0 && isWeb ? { usersRoster: true, usersRosterSince: rosterSince } : {}),
                });
                const response = await fetch(`${normalizeBaseUrl(config.url)}/api/sync`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', ...authHeaders(config) },
                credentials: 'same-origin',
                    body: requestBody,
                    signal: AbortSignal.timeout(requestTimeout(requestBody.length + MAX_PULL_BYTES))
                });
                const body = await response.json().catch(() => ({}));
                // Lote recusado por ser grande demais. Nada é apagado da fila: o lote volta a seguir mais pequeno; se o
                // servidor indicar as alterações grandes demais, ou se já for uma só, essas ficam de parte (guardadas).
                if (response.status === 413) {
                    rejected413SinceReport += 1;
                    const named = Array.isArray(body.operationIds) ? body.operationIds.map(String) : [];
                    // Sem avanço possível (ex.: a lista de utilizadores é que é grande demais): erro, nunca um ciclo.
                    if (++sizeRetries > 30) throw Object.assign(new Error(body.message || 'O servidor recusou o envio por ser grande demais.'), { status: 413 });
                    if (body.code === 'OPERATION_TOO_LARGE' && named.length) {
                        if (!await setAsideOversized(named, 'recusada pelo servidor por ser grande demais')) {
                            throw Object.assign(new Error(body.message || 'O servidor recusou o envio por ser grande demais.'), { status: 413 });
                        }
                    } else if (pushLimit > 1 && queued.length > 1) {
                        pushLimit = Math.max(1, Math.floor(pushLimit / 2));
                        console.warn(`[CloudSync] Lote recusado pelo tamanho: a enviar ${pushLimit} alteração(ões) de cada vez.`);
                    } else if (queued.length) {
                        await setAsideOversized(queued.map(operation => operation.id), 'recusada pelo servidor por ser grande demais');
                    } else {
                        throw Object.assign(new Error(body.message || 'O servidor recusou o pedido por ser grande demais.'), { status: 413 });
                    }
                    round -= 1;
                    continue;
                }
                if (!response.ok || body.success !== true) throw Object.assign(new Error(body.message || body.error || `Resposta inválida do servidor de sincronização (${response.status}).`), { status: response.status, code: body.code });
                if (!Array.isArray(body.operations) || typeof body.hasMore !== 'boolean'
                    || !Number.isSafeInteger(Number(body.cursor)) || Number(body.cursor) < cursor) {
                    throw new Error('Resposta de sincronização incompleta. As alterações locais foram mantidas para nova tentativa.');
                }
                await deleteOperations(queued.map(operation => operation.id));
                // O servidor registou o diagnóstico com as recusas contadas até aqui.
                if (diagnostics) rejected413SinceReport = Math.max(0, rejected413SinceReport - diagnostics.rejected413);
                // Envio aceite: o lote volta a crescer aos poucos depois de ter sido reduzido por um 413.
                if (pushLimit < MAX_PUSH_OPERATIONS) pushLimit = Math.min(MAX_PUSH_OPERATIONS, pushLimit * 2);
                if (round === 0 && usersOut?.digest) {
                    localStorage.setItem(scopedStorageKey(USERS_DIGEST_KEY), usersOut.digest);
                    localStorage.setItem(scopedStorageKey(USERS_IDS_KEY), JSON.stringify(usersOut.ids || []));
                    usersSent = Boolean(usersOut.payload);
                    if (usersSent) console.info('[CloudSync] Lista de utilizadores enviada para a versão web.');
                }
                totalPushed += supported.length;

                if (round === 0 && isWeb) {
                    usersRoster = await receiveUsersRoster(config, body.usersRoster, readKeys);
                    if (usersRoster.state === 'applied') totalPulled += 1;
                    if (usersRoster.state === 'unreadable' && usersRoster.at) rejectedRosterAt = usersRoster.at;
                }

                const incoming: SyncOperation[] = [];
                const retained = (await readAll<EncryptedPending>(UNREADABLE_STORE))
                    .filter(item => item.tenantId === config.tenantId && item.url === config.url);
                const encrypted = new Map([...retained, ...body.operations].map(item => [item.id, item]));
                const decodedIds: string[] = [];
                const unreadable: EncryptedPending[] = [];
                for (const item of encrypted.values()) {
                    // Uma operação cifrada com uma chave antiga não pode bloquear a sincronização de tudo o resto.
                    try {
                        incoming.push(await decryptWithAny(item.payload, readKeys));
                        decodedIds.push(item.id);
                    } catch {
                        unreadable.push({ id: item.id, payload: item.payload, tenantId: config.tenantId, url: config.url, createdAt: new Date().toISOString() });
                    }
                }
                // Guardar a carga cifrada antes de avançar o cursor: uma chave corrigida pode recuperá-la.
                await putOperations(unreadable, UNREADABLE_STORE);
                const result = await applyOperations(incoming, !body.hasMore);
                await deleteOperations(decodedIds, UNREADABLE_STORE);
                totalSkipped = unreadable.length;
                totalPulled += result.applied;
                totalConflicts += result.conflicts;
                cursor = Number(body.cursor || cursor);
                localStorage.setItem(scopedStorageKey(CURSOR_KEY), String(cursor));
                hasMoreRemote = body.hasMore;
                if (!body.hasMore && !more) break;
                // Histórico grande (navegador novo, «Receber tudo de novo»): mostra quanto já chegou.
                emitStatus({ state: 'syncing', pulled: totalPulled, pushed: totalPushed, conflicts: totalConflicts });
            }
            if (usersRoster) lastUsersRoster = usersRoster;

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
                        headers: { 'Content-Type': 'application/json', ...authHeaders(config) },
                credentials: 'same-origin',
                        // O cursor fica igual: o que vier na resposta é recebido na próxima sincronização.
                        body: JSON.stringify({ tenantId: config.tenantId, deviceId: getDeviceId(), cursor, pull: false, operations: [{ id: operation.id, deviceId: operation.deviceId, payload: await encryptOperation(operation, key) }] }),
                        signal: AbortSignal.timeout(requestTimeout(JSON.stringify(change.rows).length * 2))
                    });
                    const acknowledgement = await response.json().catch(() => ({}));
                    if (response.ok && acknowledgement.success === true) {
                        localStorage.setItem(scopedStorageKey(USERS_STATE_KEY), JSON.stringify(change.fingerprints));
                        totalPushed += 1;
                    }
                }
            }

            // Dependências podem ter chegado numa página posterior (cliente antes de crédito, por exemplo).
            totalPulled += await reprocessRetainedOperations();
            await resolveHealedTransactions().catch(error => console.warn('[CloudSync] Autocura de transacções:', error));
            // Primeiro recebe o perfil existente. Só depois completa os campos ainda não partilhados:
            // uma instalação nova/vazia nunca substitui a identidade que já está na nuvem.
            let identityError: string | undefined;
            if (window.electronAPI) {
                try {
                    const settings = (await sqlite.all<Record<string, unknown>>('SELECT * FROM company_settings WHERE id = 1'))[0];
                    if (settings) for (const field of ['logo', 'reportLogo', 'watermarkLogo']) {
                        const backup = field === 'logo' ? 'company_logo_backup' : field === 'reportLogo' ? 'company_report_logo_backup' : 'company_watermark_logo_backup';
                        if (!settings[field]) settings[field] = localStorage.getItem(scopedStorageKey(backup));
                    }
                    const identityStore = { all: sqlite.all, run: async (sql: string, params: unknown[] = []) => {
                        const result = await sqlite.run(sql, params);
                        await enqueueSyncOperation(sql, params);
                        return result;
                    } };
                    if (settings && await publishCompanyProfile(identityStore, config.tenantId, settings, { seed: true, image: portableCompanyImage })) scheduleSync(1000);
                } catch (error) {
                    identityError = `Identidade visual por sincronizar: ${error instanceof Error ? error.message : 'não foi possível preparar os dados da empresa'}`;
                }
            }
            const identity = await readCompanyProfile(sqlite, config.tenantId);
            const identityKey = scopedStorageKey(`cloud_identity_seen_v1:${config.tenantId}:${config.url}`);
            const identityDigest = JSON.stringify(identity);
            if (Object.keys(identity).length && localStorage.getItem(identityKey) !== identityDigest) {
                totalPulled += 1;
                localStorage.setItem(identityKey, identityDigest);
            }
            if ((totalPulled || totalConflicts) && config.onRemoteApplied) await config.onRemoteApplied();
            void reportUsageIfDue({
                url: normalizeBaseUrl(config.url), apiKey: config.sessionAuth ? '' : config.apiKey, tenantId: config.tenantId,
                deviceId: getDeviceId(), query: (sql, params) => sqlite.all(sql, params), appVersion: `${window.electronAPI ? 'PC' : 'Web'} ${APP_VERSION}`,
            });
            if (totalSkipped) console.warn(`[CloudSync] ${totalSkipped} operações cifradas permanecem guardadas para recuperação.`);
            const result = { success: true, pushed: totalPushed, pulled: totalPulled, conflicts: totalConflicts, skipped: totalSkipped, usersRoster };
            failureCount = 0;
            retryNotBefore = 0;
            // «Sincronizado» só sem nada por enviar, nada retido, nada ilegível e nenhum conflito por ver; o que precisa
            // de atenção fica «Verificar», com a lista ao clicar no ícone.
            const counts = await collectSyncCounts({ hasMoreRemote, identityError });
            const issues = syncIssues(counts);
            const state = syncHealth(counts);
            const message = identityError || (state === 'attention' ? issues.filter(issue => issue.attention).map(issue => issue.title).join(' · ')
                : state === 'pending' ? 'Ainda existem alterações por enviar ou receber.' : undefined);
            emitStatus({ state, message, counts, issues, pending: counts.pending + counts.waiting, pushed: totalPushed, pulled: totalPulled,
                conflicts: counts.conflicts + counts.otherVersion, skipped: counts.unreadable, usersSent, usersRoster: lastUsersRoster, at: new Date().toISOString() });
            if (hasMoreRemote || counts.pending) scheduleSync(1000);
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
            const licenseRefused = /^LICENCA_/.test(String(error?.code || '')) ? String(error.code) : undefined;
            const counts = await collectSyncCounts().catch(() => undefined);
            emitStatus({ state: 'error', message, pending, counts, issues: counts ? syncIssues(counts) : undefined, at: new Date().toISOString(), authFailed: error?.status === 401, licenseRefused });
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
    rejectedRosterAt = undefined;
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

/**
 * Computador novo ligado a uma empresa que já existe na nuvem: recebe tudo desde o início e não envia a sua
 * base (vazia) como fotografia inicial. A impressão da chave fica registada para a próxima sincronização não
 * tratar esta chave como "nova" e reenviar tudo.
 */
export const prepareCloudReceiver = async (config: { tenantId: string; apiKey: string }) => {
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${config.tenantId}:${config.apiKey}`)));
    localStorage.setItem(scopedStorageKey(KEY_FINGERPRINT_KEY), bytesToBase64(digest).slice(0, 24));
    localStorage.setItem(scopedStorageKey(CLOUD_SYNC_BOOTSTRAP_KEY), 'true');
    localStorage.setItem(scopedStorageKey(REPAIR_SNAPSHOT_KEY), 'true');
    localStorage.setItem(scopedStorageKey(HEAL_SNAPSHOT_KEY), 'true');
    localStorage.setItem(scopedStorageKey(CURSOR_KEY), '0');
    localStorage.removeItem(scopedStorageKey(USERS_DIGEST_KEY));
};

/** Computador: volta a enviar a lista completa de utilizadores na próxima sincronização (ex.: ao religar à web). */
export const resendUsersOnNextSync = () => {
    localStorage.removeItem(scopedStorageKey(USERS_DIGEST_KEY));
};

/** Navegador: configuração da empresa ligada (guardada na ligação com NIF e Código de Acesso). */
export const webCloudSyncConfig = (): CloudSyncConfig | null => {
    if (typeof window === 'undefined' || window.electronAPI) return null;
    const tenantId = localStorage.getItem('tango_active_tenant_id');
    // Ligação actual: sessão HttpOnly + chaves não exportáveis (o código não fica no navegador).
    const cryptoKeys = lerChavesSincronizacao(tenantId);
    if (tenantId && cryptoKeys) return { url: window.location.origin, apiKey: '', tenantId, sessionAuth: true, cryptoKeys };
    // Ligações anteriores (ou a outro servidor): o código, cifrado no cofre, até a migração automática.
    const typedCode = lerSegredo(SEGREDO_CODIGO_EMPRESA);
    const serverCode = lerSegredo(SEGREDO_CHAVE_SINCRONIZACAO);
    const apiKey = serverCode || typedCode;
    if (!tenantId || !apiKey) return null;
    return { url: window.location.origin, apiKey, tenantId, extraKeys: [typedCode, serverCode] };
};

/**
 * Login da versão web: pede já ao servidor a lista de utilizadores do computador da empresa e grava-a,
 * sem esperar pela sincronização completa (pedido leve, sem receber as restantes alterações).
 */
export const receiveUsersFromCloud = async (): Promise<UsersRosterOutcome> => {
    const config = activeConfig || webCloudSyncConfig();
    if (!config) return { state: 'error', message: 'Este navegador ainda não está ligado a uma empresa.' };
    if (!navigator.onLine) return { state: 'error', message: 'Sem ligação à Internet.' };
    try {
        const readKeys = await readKeysFor(config);
        const requestBody = JSON.stringify({
            tenantId: config.tenantId, deviceId: getDeviceId(), cursor: 0, operations: [], pull: false, usersRoster: true,
        });
        const response = await fetch(`${normalizeBaseUrl(config.url)}/api/sync`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeaders(config) },
                credentials: 'same-origin',
            body: requestBody,
            signal: AbortSignal.timeout(requestTimeout(MAX_PULL_BYTES)),
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
            return {
                state: 'error',
                message: response.status === 401
                    ? 'O Código de Acesso guardado neste navegador já não é aceite. Volte a ligar a empresa com o código actual.'
                    : body.message || `O servidor respondeu com erro (${response.status}).`,
            };
        }
        const outcome = await receiveUsersRoster(config, body.usersRoster, readKeys);
        lastUsersRoster = outcome;
        return outcome;
    } catch (error: any) {
        return {
            state: 'error',
            message: error?.name === 'TimeoutError' ? 'O servidor demorou muito a responder.' : 'Não foi possível contactar o servidor da nuvem.',
        };
    }
};

// ── Presença em tempo real ───────────────────────────────────────────────────────────
export type PresenceEntry = { userKey: string; lastSeen: string; devices: number; platforms: Array<'pc' | 'web'> };

/** Identificador opaco do utilizador para o servidor (o servidor não recebe ids nem nomes). */
export const presenceUserKey = async (tenantId: string, userId: string) => {
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`tango-presence:${tenantId.toUpperCase()}:${userId}`)));
    return Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('');
};

/**
 * Sinal de presença deste dispositivo (ou fim de sessão com `active = false`) e lista de quem da empresa está ligado,
 * em qualquer computador ou navegador. Sem ligação à nuvem devolve null (a página usa só este dispositivo).
 */
export const sendPresence = async (userId: string, active = true): Promise<{ tenantId: string; online: PresenceEntry[]; windowSeconds: number } | null> => {
    const config = activeConfig || webCloudSyncConfig();
    if (!config || !userId || (typeof navigator !== 'undefined' && navigator.onLine === false)) return null;
    const userKey = await presenceUserKey(config.tenantId, userId);
    const response = await fetch(`${normalizeBaseUrl(config.url)}/api/presence`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders(config) },
        credentials: 'same-origin',
        body: JSON.stringify({ tenantId: config.tenantId, deviceId: getDeviceId(), userKey, platform: window.electronAPI ? 'pc' : 'web', active }),
        keepalive: !active,
        signal: AbortSignal.timeout(15_000),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body.success !== true || !Array.isArray(body.online)) return null;
    return { tenantId: config.tenantId, online: body.online, windowSeconds: Number(body.windowSeconds) || 150 };
};
