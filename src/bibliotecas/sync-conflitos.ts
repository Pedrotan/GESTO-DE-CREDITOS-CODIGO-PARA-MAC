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

// ── Tudo em português: nomes das tabelas, motivos técnicos e campos da operação ─────────────────────
const ENTITY_LABELS: Record<string, string> = {
    accounting_audit_runs: 'Auditorias contabilísticas', accounting_bank_imports: 'Importações bancárias', accounting_cash_sessions: 'Sessões de caixa',
    accounting_daily_closes: 'Fechos diários da contabilidade', accounting_divergence_events: 'Divergências contabilísticas', accounting_entries: 'Lançamentos contabilísticos',
    accounting_entry_seals: 'Selos contabilísticos', accounting_receipts: 'Recibos contabilísticos', accounting_requests: 'Pedidos contabilísticos',
    audit_alert_comments: 'Comentários de alertas de auditoria', audit_alerts: 'Alertas de auditoria', audit_daily_closes: 'Fechos diários da auditoria',
    audit_log_chain: 'Cadeia da auditoria', audit_logs: 'Registos de auditoria', calendar_tasks: 'Tarefas do calendário', chat_messages: 'Mensagens do chat',
    clients: 'Clientes', closed_months: 'Meses fechados', collection_events: 'Acções de cobrança', collection_messages: 'Mensagens de cobrança',
    company_settings: 'Definições da empresa', contracts: 'Contratos', credit_approvals: 'Aprovações de crédito', credit_documents: 'Documentos de crédito',
    credit_import_batches: 'Importações de créditos', credit_import_items: 'Linhas de importação de créditos', credit_installments: 'Prestações',
    credit_manager_transfers: 'Transferências de gestor', credit_reinforcements: 'Reforços de crédito', credit_restructurings: 'Reestruturações de crédito',
    credit_writeoffs: 'Abates de créditos', credits: 'Créditos', dictionary: 'Dicionário', internal_messages: 'Mensagens internas',
    ledger_lines: 'Linhas do razão', ledger_transactions: 'Movimentos do razão', legal_cases: 'Contencioso',
    limit_escalation_approvals: 'Aprovações de limites', limit_escalations: 'Pedidos de aumento de limite', limit_exceptions: 'Excepções de limite',
    limit_ledger: 'Registo de limites', limit_locks: 'Bloqueios de limite', limit_policy_versions: 'Políticas de limites', message_templates: 'Modelos de mensagem',
    notifications: 'Notificações', password_reset_requests: 'Pedidos de nova palavra-passe', payment_gateways: 'Portais de pagamento',
    payment_import_batches: 'Importações de pagamentos', payment_proofs: 'Comprovativos de pagamento', payment_references: 'Referências de pagamento',
    payments: 'Pagamentos', report_history: 'Histórico de relatórios', report_schedules: 'Relatórios agendados', schema_migrations: 'Actualizações da base de dados',
    shared_settings: 'Definições partilhadas', simulations: 'Simulações', suppliers: 'Fornecedores', sync_conflicts: 'Conflitos de sincronização',
    user_limits: 'Limites dos utilizadores', users: 'Utilizadores', warranties: 'Garantias',
    rh_alerta: 'RH · Alertas', rh_ausencia: 'RH · Ausências', rh_cargo: 'RH · Cargos', rh_contrato: 'RH · Contratos de trabalho', rh_departamento: 'RH · Departamentos',
    rh_dependente: 'RH · Dependentes', rh_documento: 'RH · Documentos', rh_documento_emitido: 'RH · Documentos emitidos', rh_documento_ficheiro: 'RH · Ficheiros',
    rh_feriado: 'RH · Feriados', rh_funcionario: 'RH · Funcionários', rh_funcionario_rubrica: 'RH · Rubricas do funcionário', rh_historico_salarial: 'RH · Histórico salarial',
    rh_horario: 'RH · Horários', rh_irt_escalao: 'RH · Escalões de IRT', rh_irt_tabela: 'RH · Tabelas de IRT', rh_parametro: 'RH · Parâmetros', rh_plano_ferias: 'RH · Planos de férias',
    rh_ponto: 'RH · Livro de ponto', rh_processamento: 'RH · Processamentos salariais', rh_recibo: 'RH · Recibos', rh_recibo_linha: 'RH · Linhas de recibo',
    rh_rubrica: 'RH · Rubricas', rh_rubrica_pontual: 'RH · Rubricas pontuais', rh_tipo_ausencia: 'RH · Tipos de ausência',
    desconhecido: 'Alteração de outra versão',
};
/** Nome em português do tipo de registo (tabela). */
export const entityLabel = (type?: string | null) => ENTITY_LABELS[String(type || '')] || String(type || 'Registo').replace(/_/g, ' ');

const columnLabel = (column: string) => ({
    id: 'identificador', nif: 'NIF', email: 'email', username: 'nome de utilizador', idempotencyKey: 'chave do pagamento', receiptSeq: 'número do recibo',
} as Record<string, string>)[column] || column;

/** Motivo técnico (base de dados ou nuvem) explicado em português. */
export const translateReason = (reason: string) => {
    const text = String(reason || '').trim();
    if (!text) return '';
    const unique = text.match(/UNIQUE constraint failed: ([\w.,\s]+)/i);
    if (unique) {
        const parts = unique[1].split(',').map(part => part.trim().split('.'));
        return `Já existe um registo em «${entityLabel(parts[0][0])}» com o mesmo ${parts.map(part => columnLabel(part[1] || part[0])).join(' e ')}.`;
    }
    if (/FOREIGN KEY constraint failed/i.test(text)) return 'O registo depende de outro que ainda não existe neste dispositivo (por exemplo, o cliente ou o crédito).';
    const notNull = text.match(/NOT NULL constraint failed: (\w+)\.(\w+)/i);
    if (notNull) return `Falta o campo «${notNull[2]}» em «${entityLabel(notNull[1])}».`;
    if (/CHECK constraint failed/i.test(text)) return 'Os valores não respeitam as regras do sistema.';
    const noColumn = text.match(/(?:no such column|has no column named):? (\w+)/i);
    if (noColumn) return `Esta versão do sistema ainda não tem o campo «${noColumn[1]}». Actualize o programa.`;
    const noTable = text.match(/no such table: (\w+)/i);
    if (noTable) return `Esta versão do sistema ainda não tem «${entityLabel(noTable[1])}». Actualize o programa.`;
    if (/database is locked|SQLITE_BUSY/i.test(text)) return 'A base de dados estava ocupada. Carregue em «Reprocessar registos seguros».';
    if (/Pagamento já registado no ledger/i.test(text)) return 'O lançamento contabilístico deste pagamento já está registado neste dispositivo.';
    if (/Comando remoto desconhecido/i.test(text)) return 'Alteração feita numa versão mais recente do sistema. Depois de actualizar este dispositivo, é aplicada automaticamente.';
    if (/Conflito de concorrência|esperadas \d+ alterações/i.test(text)) return 'O mesmo registo foi alterado noutro dispositivo ao mesmo tempo.';
    return text.replace(/\bledger\b/gi, 'razão').replace(/\bsnapshot\b/gi, 'cópia de registo');
};

export const conflictReason = (row: SyncConflict) => {
    try { return translateReason(String(JSON.parse(row.operation).reason || '')); } catch { return 'Operação sem descrição válida.'; }
};

const OPERATION_FIELDS: Array<[string, string]> = [
    ['id', 'Identificador da operação'], ['entityId', 'Registo'], ['table', 'Tabela'], ['kind', 'Tipo de operação'], ['statementId', 'Comando'],
    ['deviceId', 'Dispositivo de origem'], ['createdAt', 'Feita em'], ['txId', 'Transacção'], ['txSize', 'Partes da transacção'],
    ['expectChanges', 'Alterações esperadas'], ['columns', 'Campos'], ['params', 'Valores'], ['tenantId', 'Empresa'], ['bootstrap', 'Carga inicial'],
    ['commandVersion', 'Versão do comando'],
];
const KIND_LABELS: Record<string, string> = { statement: 'Comando', snapshot: 'Cópia de registo', dynamic: 'Actualização' };

/** Operação completa, campo a campo, com nomes em português. */
export const conflictOperationDetails = (row: SyncConflict): Array<[string, string]> => {
    let operation: Record<string, unknown>;
    try { operation = JSON.parse(row.operation); } catch { return [['Operação', row.operation]]; }
    const show = (key: string, value: unknown) => {
        if (key === 'kind') return KIND_LABELS[String(value)] || String(value);
        if (key === 'table') return entityLabel(String(value));
        if (key === 'bootstrap') return value ? 'Sim' : 'Não';
        if (key === 'createdAt' && typeof value === 'string' && Number.isFinite(Date.parse(value))) return new Date(value).toLocaleString('pt-AO');
        if (Array.isArray(value)) return value.map(item => item === null ? '(vazio)' : typeof item === 'object' ? JSON.stringify(item) : String(item)).join(' · ');
        return value === null || value === undefined ? '—' : typeof value === 'object' ? JSON.stringify(value) : String(value);
    };
    return OPERATION_FIELDS.filter(([key]) => operation[key] !== undefined && operation[key] !== '').map(([key, label]) => [label, show(key, operation[key])]);
};
export const conflictNote = (row: SyncConflict) => row.resolutionNote?.startsWith(ARCHIVE_PREFIX)
    ? row.resolutionNote.slice(ARCHIVE_PREFIX.length) : row.resolutionNote || '';

export const filterConflicts = (rows: SyncConflict[], search: string, status: string, entity: string) => {
    const needle = search.trim().toLocaleLowerCase('pt');
    return rows.filter(row => (status === 'all' || conflictStatus(row) === status)
        && (entity === 'all' || row.entityType === entity)
        && (!needle || [row.id, row.entityType, entityLabel(row.entityType), row.entityId, conflictReason(row), conflictNote(row), row.resolvedBy]
            .some(value => String(value || '').toLocaleLowerCase('pt').includes(needle))));
};

export const conflictReportRows = (rows: SyncConflict[]) => rows.map(row => [
    row.id, row.createdAt, entityLabel(row.entityType), row.entityId || '', CONFLICT_STATUS_LABELS[conflictStatus(row)],
    conflictReason(row), conflictNote(row), row.resolvedBy || '', row.resolvedAt || '',
]);
export const CONFLICT_REPORT_COLUMNS = ['Identificador do conflito', 'Data de criação', 'Tipo', 'Identificador do registo', 'Estado', 'Motivo', 'Decisão / arquivo', 'Responsável (identificador)', 'Data da decisão'];

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
