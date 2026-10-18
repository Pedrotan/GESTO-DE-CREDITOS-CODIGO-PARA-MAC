import type { SyncStatement } from './sync-operacoes.ts';

export type SyncConflict = {
    id: string; entityType: string; entityId: string | null; operation: string; createdAt: string;
    status: 'pending' | 'accepted' | 'rejected';
    resolutionNote: string | null; resolvedBy: string | null; resolvedAt: string | null;
};

// O esquema antigo só admite pending/accepted/rejected. O arquivo é uma rejeição explícita,
// com marca reservada na nota; não aplica nem apaga a operação e mantém compatibilidade entre versões.
export const ARCHIVE_PREFIX = '[ARQUIVADO] ';
export const conflictStatus = (row: SyncConflict) => row.status === 'rejected' && row.resolutionNote?.startsWith(ARCHIVE_PREFIX)
    ? 'archived' : row.status;
export const CONFLICT_STATUS_LABELS = { pending: 'Pendente', accepted: 'Reconciliado', rejected: 'Rejeitado', archived: 'Arquivado' };
export const conflictReason = (row: SyncConflict) => {
    try { return String(JSON.parse(row.operation).reason || ''); } catch { return 'Operação sem descrição válida.'; }
};
export const conflictNote = (row: SyncConflict) => row.resolutionNote?.startsWith(ARCHIVE_PREFIX)
    ? row.resolutionNote.slice(ARCHIVE_PREFIX.length) : row.resolutionNote || '';

export const filterConflicts = (rows: SyncConflict[], search: string, status: string, entity: string) => {
    const needle = search.trim().toLocaleLowerCase('pt');
    return rows.filter(row => (status === 'all' || conflictStatus(row) === status)
        && (entity === 'all' || row.entityType === entity)
        && (!needle || [row.id, row.entityType, row.entityId, conflictReason(row), conflictNote(row), row.resolvedBy]
            .some(value => String(value || '').toLocaleLowerCase('pt').includes(needle))));
};

export const conflictReportRows = (rows: SyncConflict[]) => rows.map(row => [
    row.id, row.createdAt, row.entityType, row.entityId || '', CONFLICT_STATUS_LABELS[conflictStatus(row)],
    conflictReason(row), conflictNote(row), row.resolvedBy || '', row.resolvedAt || '',
]);
export const CONFLICT_REPORT_COLUMNS = ['ID do conflito', 'Data de criação', 'Tipo', 'ID do registo', 'Estado', 'Motivo', 'Decisão / arquivo', 'Responsável (ID)', 'Data da decisão'];

export const conflictArchiveStatements = (
    rows: SyncConflict[], action: 'archive' | 'restore', actorId: string, actorName: string, explanation: string,
    now = new Date().toISOString(),
): SyncStatement[] => {
    if (!actorId || !actorName || explanation.trim().length < 10 || explanation.trim().length > 1000) throw new Error('Indique o responsável e um motivo de 10 a 1000 caracteres.');
    if (!rows.length || rows.length > 200) throw new Error('Seleccione entre 1 e 200 registos por operação.');
    if (rows.some(row => action === 'archive' ? row.status !== 'pending' : conflictStatus(row) !== 'archived')) throw new Error('A selecção contém registos que já mudaram de estado. Atualize a tabela.');
    const statements: SyncStatement[] = rows.map(row => action === 'archive' ? {
        sql: `UPDATE sync_conflicts SET status = 'rejected', resolutionNote = ?, resolvedBy = ?, resolvedAt = ? WHERE id = ? AND status = 'pending'`,
        params: [ARCHIVE_PREFIX + explanation.trim(), actorId, now, row.id], expectChanges: 1,
    } : {
        sql: `UPDATE sync_conflicts SET status = 'pending', resolutionNote = NULL, resolvedBy = NULL, resolvedAt = NULL WHERE id = ? AND status = 'rejected' AND resolutionNote LIKE '[ARQUIVADO] %'`,
        params: [row.id], expectChanges: 1,
    });
    statements.push({
        sql: `INSERT INTO audit_logs (id, timestamp, userId, userName, action, entity, details, metadata)
              VALUES (?, ?, ?, ?, 'update', 'credit', ?, ?)`,
        params: [crypto.randomUUID(), now, actorId, actorName,
            `${action === 'archive' ? 'Arquivo' : 'Restauro'} de ${rows.length} conflito(s) de sincronização`,
            JSON.stringify({ action, conflictIds: rows.map(row => row.id), explanation: explanation.trim() })],
    });
    return statements;
};
