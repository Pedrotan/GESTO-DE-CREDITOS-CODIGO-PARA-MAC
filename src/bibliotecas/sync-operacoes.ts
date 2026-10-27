// Regras partilhadas (navegador e Electron) para transformar operações recebidas da nuvem em SQL local.
// Cada operação foi autorizada no dispositivo de origem e chega cifrada com a chave da empresa; aqui só
// se aceita SQL registado na allowlist, actualizações dinâmicas aprovadas ou inserções de snapshot cujas
// colunas existem no esquema local. Tabelas com credenciais ou configuração local nunca são aplicadas.

export type SyncStatement = { sql: string; params?: unknown[]; expectChanges?: number };

export type SyncOperation = {
    id: string;
    deviceId: string;
    kind: 'statement' | 'snapshot' | 'dynamic';
    statementId?: string;
    /** Apenas para `dynamic`: UPDATE dinâmico aprovado pela política de SQL. */
    sql?: string;
    table?: string;
    columns?: string[];
    params: unknown[];
    createdAt: string;
    /** Formato da operação. Esta versão escreve 1; uma versão futura pode escrever outro número. */
    commandVersion: number;
    tenantId: string;
    entityId?: string;
    bootstrap?: boolean;
    /**
     * Autocura: cópia completa do registo tal como está no dispositivo de origem. Cria o registo se faltar e
     * substitui-o só quando é mais recente; se não puder ser aplicada, é ignorada (nunca vira conflito).
     */
    heal?: boolean;
    /** Número de ordem atribuído pelo servidor (a ordem real das alterações, independente do relógio dos PCs). */
    serverSeq?: number;
    /** Campos deste registo alterados aqui e ainda por enviar: a cópia de autocura nunca os toca. */
    keepColumns?: string[];
    /** Operações da mesma transacção local partilham txId e são aplicadas juntas (tudo ou nada). */
    txId?: string;
    txSize?: number;
    expectChanges?: number;
};

export type RemoteGroup = {
    operations: SyncOperation[];
    /** Conflitos antigos que esta aplicação resolve (reprocessamento). */
    resolvesConflictIds?: string[];
};

export type ApplyResult = { applied: number; conflicts: number };

/** Tabelas que nunca saem nem entram pela nuvem (credenciais, chaves e estado local). */
export const SYNC_EXCLUDED_TABLES = new Set([
    'dictionary', 'sqlite_sequence', 'users', 'company_settings', 'payment_gateways',
    'password_reset_requests', 'sync_conflicts', 'schema_migrations', 'audit_log_chain', 'accounting_entry_seals',
    // Ficheiros de relatórios gerados e agendamentos de envio ficam no computador que os criou.
    'report_history', 'report_schedules',
    // Selos HMAC e fechos diários da auditoria: cada computador verifica e sela a sua cópia.
    'audit_entry_seals', 'audit_daily_closes',
    // Linhas de bloqueio dos limites: só servem de guarda na transacção local (o consumo sincroniza em limit_ledger).
    'limit_locks',
    // Fiscal: o registo das chamadas à AGT e as cópias dos ficheiros SAF-T ficam no computador que os fez
    // (os documentos, as séries e a configuração fiscal sincronizam normalmente).
    'fiscal_agt_requests', 'fiscal_saft_exports',
]);

export const normalizeSqlText = (sql: string) =>
    sql.replace(/--.*$/gmu, '').replace(/\/\*[\s\S]*?\*\//gu, '').replace(/\s+/gu, ' ').trim().replace(/;$/u, '');

export const mutationTable = (sql: string) =>
    sql.match(/\b(?:INSERT\s+(?:OR\s+\w+\s+)?INTO|UPDATE|DELETE\s+FROM|REPLACE\s+INTO)\s+["'`[]?([a-z_][a-z0-9_]*)/iu)?.[1]?.toLowerCase() || null;

const DYNAMIC_UPDATE_COLUMNS: Record<string, Set<string>> = {
    suppliers: new Set(['name', 'phone', 'email', 'nif', 'address', 'notes', 'status']),
    legal_cases: new Set(['clientId', 'creditId', 'stage', 'priority', 'debtAmount', 'lastAction', 'notes', 'updatedAt', 'usuario_id']),
    warranties: new Set(['clientId', 'creditId', 'type', 'description', 'marketValue', 'status', 'location', 'registrationNumber', 'notes', 'updatedAt', 'usuario_id']),
};

export const isAllowedDynamicUpdate = (sql: string) => {
    const normalized = normalizeSqlText(sql);
    const match = normalized.match(/^UPDATE\s+([a-z_][a-z0-9_]*)\s+SET\s+(.+)\s+WHERE\s+id\s*=\s*\?$/iu);
    if (!match || !DYNAMIC_UPDATE_COLUMNS[match[1]]) return false;
    const assignments = match[2].split(',').map(value => value.trim().match(/^([a-z_][a-z0-9_]*)\s*=\s*\?$/iu)?.[1]);
    return assignments.length > 0 && assignments.every(column => column && DYNAMIC_UPDATE_COLUMNS[match[1]].has(column));
};

export const isSyncableTable = (table: string | null | undefined) => !!table && !SYNC_EXCLUDED_TABLES.has(table.toLowerCase());

const IDENTIFIER = /^[a-z_][a-z0-9_]*$/iu;
const quoteIdentifier = (value: string) => `"${value.replace(/"/g, '""')}"`;

/** Pedido de «receber tudo de novo da nuvem» (versão web): a cópia local é apagada no arranque, antes de abrir. */
export const REBUILD_REPLICA_FLAG = 'tango_rebuild_replica_v1';
export const UNKNOWN_COMMAND_REASON = 'Comando remoto desconhecido nesta versão do sistema.';
/** Formatos de operação que esta versão sabe aplicar. */
export const SUPPORTED_COMMAND_VERSIONS = new Set([1]);
// Operação num formato de uma versão mais recente: fica retida (antes era deitada fora ao chegar e o cursor
// avançava, perdendo-a) e é aplicada quando este dispositivo actualizar.
export const UNSUPPORTED_VERSION_PREFIX = 'Formato de alteração de uma versão mais recente';
export const unsupportedVersionReason = (version: unknown) => `${UNSUPPORTED_VERSION_PREFIX} (formato ${String(version)}).`;
/** Retida por ser de outra versão do sistema (comando desconhecido ou formato mais recente). */
export const isOtherVersionReason = (reason: string | undefined) =>
    reason === UNKNOWN_COMMAND_REASON || String(reason || '').startsWith(UNSUPPORTED_VERSION_PREFIX);
export const CONFLICT_INSERT_SQL = `INSERT OR IGNORE INTO sync_conflicts (id, entityType, entityId, operation, status, createdAt)
                          VALUES (?, ?, ?, ?, 'pending', ?)`;
export const CONFLICT_RESOLVE_SQL = `UPDATE sync_conflicts SET status = 'accepted', resolutionNote = ?, resolvedAt = ? WHERE id = ? AND status = 'pending'`;
export const HEAL_NOTE = 'Corrigido automaticamente com a cópia mais recente do registo.';
/** Alterações retidas (conflitos pendentes) que podem dizer respeito a um registo; a confirmação é feita em JS. */
export const RETAINED_FOR_ROW_SQL = `SELECT id, operation FROM sync_conflicts WHERE status = 'pending' AND (entityType = ? OR entityType = 'desconhecido') AND (entityId = ? OR instr(operation, ?) > 0)`;

const splitTopLevel = (text: string) => {
    const parts: string[] = [];
    let depth = 0, quote = '', current = '';
    for (const char of text) {
        if (quote) { if (char === quote) quote = ''; }
        else if (char === "'" || char === '"') quote = char;
        else if (char === '(') depth += 1;
        else if (char === ')') depth -= 1;
        else if (char === ',' && depth === 0) { parts.push(current); current = ''; continue; }
        current += char;
    }
    parts.push(current);
    return parts.map(part => part.trim());
};

/**
 * Campos que um comando escreve: as colunas do INSERT ou as do SET do UPDATE. DELETE e comandos sem lista
 * reconhecível devolvem [] (não dizem que campos repor).
 */
export const statementColumns = (sql: string): string[] => {
    const normalized = normalizeSqlText(sql);
    const insert = normalized.match(/^(?:INSERT|REPLACE)(?:\s+OR\s+\w+)?\s+INTO\s+\S+\s*\(([^)]*)\)/isu);
    if (insert) return splitTopLevel(insert[1]).map(column => column.replace(/^["'`[]|["'`\]]$/gu, '')).filter(column => IDENTIFIER.test(column));
    const update = normalized.match(/^UPDATE\s+\S+\s+SET\s+(.+?)(?:\s+WHERE\s+.*)?$/isu);
    if (!update) return [];
    return splitTopLevel(update[1]).map(item => item.match(/^["'`[]?([a-z_][a-z0-9_]*)["'`\]]?\s*=/iu)?.[1] || '').filter(Boolean);
};

/** Identificador (`id`) do registo que um INSERT/UPDATE/DELETE altera, quando o comando o indica. */
export const statementRowId = (sql: string, params: unknown[]): string | null => {
    const normalized = normalizeSqlText(sql);
    const value = (index: number) => (index >= 0 && params[index] !== undefined && params[index] !== null ? String(params[index]) : null);
    const insert = normalized.match(/^(?:INSERT|REPLACE)(?:\s+OR\s+\w+)?\s+INTO\s+\S+\s*\(([^)]*)\)\s*VALUES\s*\((.*)\)$/isu);
    if (insert) {
        const columns = splitTopLevel(insert[1]).map(column => column.replace(/^["'`[]|["'`\]]$/gu, ''));
        const values = splitTopLevel(insert[2]);
        const index = columns.indexOf('id');
        if (index < 0 || values[index] !== '?') return null;
        return value(values.slice(0, index).filter(item => item.includes('?')).reduce((total, item) => total + (item.match(/\?/gu) || []).length, 0));
    }
    const where = normalized.search(/\bWHERE\b/iu);
    if (where < 0) return null;
    const match = /(?:^|[\s(.])id\s*=\s*\?/iu.exec(normalized.slice(where));
    if (!match) return null;
    return value((normalized.slice(0, where + match.index + match[0].length - 1).match(/\?/gu) || []).length);
};

/**
 * Alterações retidas aqui sobre um registo que a cópia de autocura pode repor: só as feitas pelo mesmo dispositivo
 * que enviou a cópia e anteriores a ela na ordem do servidor (o autor já as tinha aplicado quando fez a cópia). Diz
 * que conflitos ficam resolvidos e que campos repor (null = todos: comando que esta versão não sabe ler).
 */
export const healableRetained = (
    rows: Array<{ id: string; operation: string }>,
    copy: { table: string; rowId: string; deviceId: string; serverSeq?: number },
    sqlById: Map<string, string>,
) => {
    const conflictIds: string[] = [];
    let columns: Set<string> | null = new Set();
    for (const row of rows) {
        let retained: SyncOperation & { reason?: string; original?: Partial<SyncOperation> };
        try { retained = JSON.parse(row.operation); } catch { continue; }
        if (retained.deviceId !== copy.deviceId) continue;
        if (retained.serverSeq !== undefined && copy.serverSeq !== undefined && !(copy.serverSeq > retained.serverSeq)) continue;
        const kind = retained.original?.kind || retained.kind;
        const statementId = retained.original?.statementId || retained.statementId;
        const sql = kind === 'statement' && statementId ? sqlById.get(statementId) : kind === 'dynamic' ? (retained.original?.sql || retained.sql) : undefined;
        let touched: string[] | null;
        if (kind === 'snapshot') {
            const snapshotColumns = retained.original?.columns || retained.columns || [];
            if (String(retained.original?.table || retained.table || '') !== copy.table || String(retained.params?.[snapshotColumns.indexOf('id')] ?? '') !== copy.rowId) continue;
            touched = snapshotColumns;
        } else if (sql) {
            if (mutationTable(sql) !== copy.table || statementRowId(sql, retained.params || []) !== copy.rowId) continue;
            touched = statementColumns(sql);
        } else {
            // Comando que esta versão não conhece: só o identificador da alteração diz o registo; repõe tudo.
            if (String(retained.entityId || '') !== copy.rowId) continue;
            touched = null;
        }
        conflictIds.push(row.id);
        if (touched === null) columns = null;
        else if (columns) touched.forEach(column => columns!.add(column));
    }
    return { conflictIds, columns };
};

export const operationTable = (operation: SyncOperation, sqlById: Map<string, string>) => {
    if (operation.kind === 'snapshot') return operation.table?.toLowerCase() || null;
    if (operation.kind === 'dynamic') return operation.sql ? mutationTable(operation.sql) : null;
    const sql = operation.statementId ? sqlById.get(operation.statementId) : undefined;
    return sql ? mutationTable(sql) : null;
};

/**
 * Agrupa as operações pela transacção de origem, mantendo a ordem de chegada.
 * Grupos ainda incompletos (parte noutra página da nuvem) ficam em `pending`.
 */
export const groupOperations = (operations: SyncOperation[]) => {
    const seen = new Set<string>();
    const groups = new Map<string, SyncOperation[]>();
    for (const operation of operations) {
        if (seen.has(operation.id)) continue;
        seen.add(operation.id);
        const key = operation.txId || operation.id;
        const group = groups.get(key);
        if (group) group.push(operation); else groups.set(key, [operation]);
    }
    const complete: SyncOperation[][] = [];
    const pending: SyncOperation[] = [];
    for (const group of groups.values()) {
        const expected = Math.max(1, Number(group[0].txSize) || 1);
        if (group.length >= expected) complete.push(group);
        else pending.push(...group);
    }
    return { complete, pending };
};

/** Converte um grupo em SQL local validado. Lança erro se alguma operação não for aceitável. */
export type RemoteDeps = {
    sqlById: Map<string, string>;
    tableColumns: (table: string) => Promise<Set<string>>;
    /** Alterações retidas candidatas para um registo (RETAINED_FOR_ROW_SQL). Sem isto a autocura só cria o que falta. */
    retainedForRow?: (table: string, rowId: string) => Promise<Array<{ id: string; operation: string }>>;
};

export const buildRemoteStatements = async (
    group: RemoteGroup,
    deps: RemoteDeps
): Promise<SyncStatement[]> => {
    const statements: SyncStatement[] = [];
    for (const operation of group.operations) {
        if (!SUPPORTED_COMMAND_VERSIONS.has(Number(operation.commandVersion))) throw new Error(unsupportedVersionReason(operation.commandVersion));
        if (operation.kind === 'statement') {
            const sql = operation.statementId ? deps.sqlById.get(operation.statementId) : undefined;
            if (!sql) throw new Error(UNKNOWN_COMMAND_REASON);
            if (!isSyncableTable(mutationTable(sql))) throw new Error('Tabela remota não sincronizável.');
            statements.push({ sql, params: operation.params || [], expectChanges: operation.expectChanges });
        } else if (operation.kind === 'dynamic') {
            if (!operation.sql || !isAllowedDynamicUpdate(operation.sql)) throw new Error('Actualização remota não autorizada.');
            if (!isSyncableTable(mutationTable(operation.sql))) throw new Error('Tabela remota não sincronizável.');
            statements.push({ sql: operation.sql, params: operation.params || [], expectChanges: operation.expectChanges });
        } else if (operation.kind === 'snapshot') {
            const table = operation.table || '';
            const columns = operation.columns || [];
            if (!IDENTIFIER.test(table) || !isSyncableTable(table) || columns.length === 0) throw new Error('Snapshot remoto inválido.');
            const allowed = await deps.tableColumns(table);
            if (!columns.every(column => IDENTIFIER.test(column) && allowed.has(column))) throw new Error('Snapshot remoto com colunas desconhecidas.');
            const values = `(${columns.map(quoteIdentifier).join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`;
            const rawId = operation.heal ? operation.params?.[columns.indexOf('id')] : undefined;
            const rowId = rawId === undefined || rawId === null || rawId === '' ? null : String(rawId);
            // Cópia de autocura: cria sempre o registo que falta. Num registo que já existe, repõe campo a campo só o
            // que ficou divergente aqui: os campos das alterações retidas feitas pelo dispositivo que enviou a cópia
            // e anteriores a ela na ordem do servidor (nunca pela hora dos PCs). Campos alterados aqui e ainda por
            // enviar ficam como estão; os restantes campos chegam pelas alterações normais de cada um.
            const healed = rowId && deps.retainedForRow
                ? healableRetained(await deps.retainedForRow(table, rowId), { table, rowId, deviceId: operation.deviceId, serverSeq: operation.serverSeq }, deps.sqlById)
                : { conflictIds: [] as string[], columns: new Set<string>() };
            const keep = new Set(['id', ...(operation.keepColumns || [])]);
            const updates = columns.filter(column => !keep.has(column) && (healed.columns === null || healed.columns.has(column)));
            statements.push({
                sql: healed.conflictIds.length && updates.length
                    ? `INSERT INTO ${quoteIdentifier(table)} ${values} ON CONFLICT(id) DO UPDATE SET ${updates.map(column => `${quoteIdentifier(column)} = excluded.${quoteIdentifier(column)}`).join(', ')}`
                    : `INSERT OR IGNORE INTO ${quoteIdentifier(table)} ${values}`,
                params: operation.params || [],
            });
            const now = new Date().toISOString();
            for (const conflictId of healed.conflictIds) statements.push({ sql: CONFLICT_RESOLVE_SQL, params: [HEAL_NOTE, now, conflictId] });
        } else {
            throw new Error('Tipo de operação remota desconhecido.');
        }
    }
    const now = new Date().toISOString();
    for (const conflictId of group.resolvesConflictIds || []) {
        statements.push({ sql: CONFLICT_RESOLVE_SQL, params: ['Aplicado automaticamente pela sincronização.', now, conflictId] });
    }
    return statements;
};

export const conflictStatements = (operations: SyncOperation[], reason: string, sqlById: Map<string, string>): SyncStatement[] => {
    const now = new Date().toISOString();
    return operations.map(operation => ({
        sql: CONFLICT_INSERT_SQL,
        params: [operation.id, operationTable(operation, sqlById) || 'desconhecido', operation.entityId || null,
            JSON.stringify({ ...operation, reason: reason.slice(0, 300) }), now],
    }));
};

/**
 * Erros de um registo que já existe neste dispositivo: o mesmo identificador (chave primária `id`) ou o
 * lançamento contabilístico do mesmo pagamento já gravado (cada pagamento tem um só lançamento). Outras chaves
 * únicas repetidas (ex.: o mesmo NIF em dois clientes diferentes) continuam a ser conflitos para rever.
 */
export const isAlreadyAppliedError = (reason: string) =>
    /UNIQUE constraint failed: \w+\.id(?:$|[^\w,])|Pagamento já registado no ledger/i.test(reason);

/**
 * Aplica grupos um a um, cada um numa transacção. Um grupo que falha (ex.: o mesmo crédito foi alterado
 * nos dois lados) não bloqueia os restantes: fica registado em sync_conflicts para revisão.
 */
export const applyRemoteGroups = async (
    groups: RemoteGroup[],
    deps: RemoteDeps & { transaction: (statements: SyncStatement[]) => Promise<unknown> }
): Promise<ApplyResult> => {
    let applied = 0;
    let conflicts = 0;
    for (const group of groups) {
        try {
            const statements = await buildRemoteStatements(group, deps);
            if (statements.length) await deps.transaction(statements);
            applied += group.operations.length;
        } catch (error) {
            const reason = error instanceof Error ? error.message : String(error);
            // Histórico recebido de novo (repetição da nuvem, «Receber tudo de novo», reprocessamento): só inserções
            // de registos que já existem aqui. Já foi aplicado: não é conflito.
            if (isAlreadyAppliedError(reason) && group.operations.every(operation => isSafeToReprocess(operation, deps.sqlById))) {
                applied += group.operations.length;
                if (group.resolvesConflictIds?.length) {
                    const now = new Date().toISOString();
                    await deps.transaction(group.resolvesConflictIds.map(id => ({ sql: CONFLICT_RESOLVE_SQL, params: ['Já estava aplicado neste dispositivo.', now, id] })));
                }
                continue;
            }
            // Cópia de autocura que não se aplica aqui (ex.: cadeia contabilística noutra ordem): é só uma ajuda,
            // nunca um conflito para alguém rever. A próxima cópia ou a alteração original tratam do registo.
            // Excepção: uma cópia de uma versão mais recente fica retida como as outras alterações dessa versão.
            if (group.operations.every(operation => operation.heal) && !isOtherVersionReason(reason)) continue;
            conflicts += group.operations.length;
            // Conflitos já existentes (reprocessamento) continuam pendentes; os novos são registados.
            if (!group.resolvesConflictIds?.length) {
                await deps.transaction(conflictStatements(group.operations, reason, deps.sqlById));
            }
        }
    }
    return { applied, conflicts };
};

/**
 * Alteração com condição própria (`expectChanges`) que falhou porque o registo ainda não existia aqui ou ainda não
 * estava no estado esperado (o crédito chegou depois, numa versão que este dispositivo não conhecia). Nunca foi
 * aplicada e a condição protege-a: volta a ser tentada pela ordem original e só se aplica se a condição se cumprir
 * agora; se o registo foi mesmo alterado nos dois lados, continua pendente para revisão.
 */
export const isGuardedRetry = (operation: SyncOperation, reason: string | undefined) => operation.expectChanges !== undefined
    && /Conflito de concorr[eê]ncia|esperadas \d+ altera/iu.test(String(reason || ''));

/** Conflitos antigos que podem ser aplicados com segurança: só inserções (snapshots e INSERT). */
export const isSafeToReprocess = (operation: SyncOperation, sqlById: Map<string, string>) => {
    if (operation.kind === 'snapshot') return true;
    if (operation.kind !== 'statement' || !operation.statementId) return false;
    const sql = sqlById.get(operation.statementId);
    return !!sql && /^\s*INSERT\b/iu.test(sql);
};

// ── Transacções que chegam em partes ─────────────────────────────────────────────
// A nuvem entrega o histórico em páginas e uma transacção pode ficar entre duas. As partes ficam à espera
// (com a hora a que chegaram a ESTE dispositivo) e só expiram depois de recebidas todas as páginas e de
// passado o prazo desde a chegada. Contar o prazo desde a criação noutro computador partia as transacções
// antigas de quem recebe o histórico (navegador novo, computador que esteve desligado).

export type PendingOperation = SyncOperation & { receivedAt?: string };
export const INCOMPLETE_STATEMENT_ID = '__incompleto__';

/** Marca a hora de chegada das partes que ainda não a têm. */
export const stampReceived = (operations: PendingOperation[], now: string): PendingOperation[] =>
    operations.map(operation => (operation.receivedAt ? operation : { ...operation, receivedAt: now }));

/** Partes de transacções incompletas que já podem ir para revisão: só com o histórico todo recebido. */
export const splitExpired = (pending: PendingOperation[], nowMs: number, caughtUp: boolean, maxAgeMs: number) => {
    if (!caughtUp) return { expired: [] as PendingOperation[], waiting: pending };
    const expired = pending.filter(operation => Date.parse(operation.receivedAt || operation.createdAt) < nowMs - maxAgeMs);
    return { expired, waiting: pending.filter(operation => !expired.includes(operation)) };
};

/** Parte de uma transacção incompleta: não é aplicada, mas guarda o comando original para ser recuperada. */
export const markIncomplete = (operation: SyncOperation): SyncOperation & { original?: Partial<SyncOperation> } => ({
    ...operation, kind: 'statement', statementId: INCOMPLETE_STATEMENT_ID,
    original: { kind: operation.kind, statementId: operation.statementId, sql: operation.sql, table: operation.table, columns: operation.columns },
});

const restoreIncomplete = (operation: SyncOperation & { original?: Partial<SyncOperation> }): SyncOperation | null => {
    if (operation.statementId !== INCOMPLETE_STATEMENT_ID) return operation;
    if (!operation.original?.kind) return null; // marcado por uma versão antiga: o comando perdeu-se
    const { original, ...rest } = operation;
    return { ...rest, kind: original.kind!, statementId: original.statementId, sql: original.sql, table: original.table, columns: original.columns };
};

/**
 * Conflitos pendentes que podem voltar a ser aplicados. Uma transacção de várias operações só volta inteira
 * (todas as partes presentes, pela ordem original): aplicar só as inserções de uma transacção partida deixava,
 * por exemplo, a decisão «aprovado» e o desembolso gravados com o crédito ainda pendente. Operações isoladas
 * continuam a voltar só quando são inserções.
 */
export const reprocessableGroups = (rows: Array<{ id: string; operation: string }>, sqlById: Map<string, string>): RemoteGroup[] => {
    const byTx = new Map<string, Array<{ id: string; operation: SyncOperation }>>();
    const groups: RemoteGroup[] = [];
    for (const row of rows) {
        let parsed: SyncOperation & { reason?: string; original?: Partial<SyncOperation> };
        try { parsed = JSON.parse(row.operation); } catch { continue; }
        const { reason, ...clean } = parsed;
        const operation = restoreIncomplete(clean);
        if (!operation) continue;
        // Formato que esta versão ainda não sabe aplicar: continua retido, sem tentativas inúteis a cada sincronização.
        if (!SUPPORTED_COMMAND_VERSIONS.has(Number(operation.commandVersion))) continue;
        // Retida só porque esta versão ainda não conhecia o comando: nunca foi aplicada, por isso aplicá-la depois
        // de actualizar é seguro (antes ficavam presas para sempre as alterações que não eram inserções).
        const unknownBefore = (reason === UNKNOWN_COMMAND_REASON && operation.kind === 'statement'
            && !!operation.statementId && sqlById.has(operation.statementId))
            // Formato de uma versão mais recente que esta versão já sabe ler (depois de actualizar).
            || (String(reason || '').startsWith(UNSUPPORTED_VERSION_PREFIX) && SUPPORTED_COMMAND_VERSIONS.has(Number(operation.commandVersion)));
        if (operation.txId && Number(operation.txSize) > 1) {
            byTx.set(operation.txId, [...(byTx.get(operation.txId) || []), { id: row.id, operation }]);
        } else if (unknownBefore || isGuardedRetry(operation, reason) || isSafeToReprocess(operation, sqlById)) {
            groups.push({ operations: [operation], resolvesConflictIds: [row.id] });
        }
    }
    for (const parts of byTx.values()) {
        const unique = new Map(parts.map(part => [part.operation.id, part]));
        if (unique.size < Number(parts[0].operation.txSize)) continue; // ainda falta alguma parte
        const ordered = [...unique.values()].sort((a, b) => String(a.operation.createdAt).localeCompare(String(b.operation.createdAt)));
        groups.push({ operations: ordered.map(part => part.operation), resolvesConflictIds: parts.map(part => part.id) });
    }
    // Pela ordem em que foram feitas (ex.: o cliente antes do crédito, o crédito antes das prestações).
    return groups.sort((a, b) => String(a.operations[0].createdAt).localeCompare(String(b.operations[0].createdAt)));
};
