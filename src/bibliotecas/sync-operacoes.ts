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
    commandVersion: 1;
    tenantId: string;
    entityId?: string;
    bootstrap?: boolean;
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

export const CONFLICT_INSERT_SQL = `INSERT OR IGNORE INTO sync_conflicts (id, entityType, entityId, operation, status, createdAt)
                          VALUES (?, ?, ?, ?, 'pending', ?)`;
export const CONFLICT_RESOLVE_SQL = `UPDATE sync_conflicts SET status = 'accepted', resolutionNote = ?, resolvedAt = ? WHERE id = ? AND status = 'pending'`;

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
export const buildRemoteStatements = async (
    group: RemoteGroup,
    deps: { sqlById: Map<string, string>; tableColumns: (table: string) => Promise<Set<string>> }
): Promise<SyncStatement[]> => {
    const statements: SyncStatement[] = [];
    for (const operation of group.operations) {
        if (operation.kind === 'statement') {
            const sql = operation.statementId ? deps.sqlById.get(operation.statementId) : undefined;
            if (!sql) throw new Error('Comando remoto desconhecido nesta versão do sistema.');
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
            statements.push({
                sql: `INSERT OR IGNORE INTO ${quoteIdentifier(table)} (${columns.map(quoteIdentifier).join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
                params: operation.params || [],
            });
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
 * Aplica grupos um a um, cada um numa transacção. Um grupo que falha (ex.: o mesmo crédito foi alterado
 * nos dois lados) não bloqueia os restantes: fica registado em sync_conflicts para revisão.
 */
export const applyRemoteGroups = async (
    groups: RemoteGroup[],
    deps: {
        sqlById: Map<string, string>;
        tableColumns: (table: string) => Promise<Set<string>>;
        transaction: (statements: SyncStatement[]) => Promise<unknown>;
    }
): Promise<ApplyResult> => {
    let applied = 0;
    let conflicts = 0;
    for (const group of groups) {
        try {
            const statements = await buildRemoteStatements(group, deps);
            if (statements.length) await deps.transaction(statements);
            applied += group.operations.length;
        } catch (error) {
            conflicts += group.operations.length;
            // Conflitos já existentes (reprocessamento) continuam pendentes; os novos são registados.
            if (!group.resolvesConflictIds?.length) {
                const reason = error instanceof Error ? error.message : String(error);
                await deps.transaction(conflictStatements(group.operations, reason, deps.sqlById));
            }
        }
    }
    return { applied, conflicts };
};

/** Conflitos antigos que podem ser aplicados com segurança: só inserções (snapshots e INSERT). */
export const isSafeToReprocess = (operation: SyncOperation, sqlById: Map<string, string>) => {
    if (operation.kind === 'snapshot') return true;
    if (operation.kind !== 'statement' || !operation.statementId) return false;
    const sql = sqlById.get(operation.statementId);
    return !!sql && /^\s*INSERT\b/iu.test(sql);
};
