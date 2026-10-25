// Relatórios de actividade dos utilizadores: tipo de cada acção (cadastro, edição, exclusão…), nomes em português,
// filtros e o relatório (PDF e Excel) com os mesmos filtros. Lê o registo de auditoria completo do período escolhido
// (o painel só guarda os registos mais recentes em memória, o que dava totais errados).
import type { Cell, ReportDef } from './relatorios-pagamentos.ts';
import { formatLuandaDateTime, luandaDateKey } from './fuso-angola.ts';

export type ActivityLog = {
    id: string; timestamp: string | Date; userId?: string | null; userName?: string | null; action?: string | null; entity?: string | null;
    details?: string | null; metadata?: string | null;
};

export type ActivityType = 'cadastro' | 'edicao' | 'exclusao' | 'reposicao' | 'aprovacao' | 'rejeicao' | 'exportacao' | 'importacao'
    | 'consulta' | 'inicio_sessao' | 'fim_sessao' | 'sessao_falhada' | 'seguranca' | 'outro';

export const ACTIVITY_TYPE_LABELS: Record<ActivityType, string> = {
    cadastro: 'Cadastro', edicao: 'Edição / actualização', exclusao: 'Exclusão', reposicao: 'Reposição (lixeira)', aprovacao: 'Aprovação',
    rejeicao: 'Rejeição', exportacao: 'Exportação de relatórios', importacao: 'Importação', consulta: 'Consulta', inicio_sessao: 'Início de sessão',
    fim_sessao: 'Fim de sessão', sessao_falhada: 'Tentativa de entrada falhada', seguranca: 'Alerta de segurança', outro: 'Outras acções',
};
/** Ordem dos filtros (os do dia-a-dia primeiro). */
export const ACTIVITY_TYPES: ActivityType[] = ['cadastro', 'edicao', 'exclusao', 'reposicao', 'aprovacao', 'rejeicao', 'exportacao', 'importacao',
    'consulta', 'inicio_sessao', 'fim_sessao', 'sessao_falhada', 'seguranca', 'outro'];

export const ENTITY_LABELS: Record<string, string> = {
    client: 'Cliente', credit: 'Crédito', payment: 'Pagamento', user: 'Utilizador', system: 'Sistema', contencioso: 'Contencioso', garantia: 'Garantia',
    payment_gateway: 'Portal de pagamento', audit: 'Auditoria', report: 'Relatório', security: 'Segurança', accounting_entry: 'Lançamento contabilístico',
    contract: 'Contrato', simulation: 'Simulação', expense: 'Despesa', supplier: 'Fornecedor', settings: 'Configurações', hr: 'Recursos Humanos',
};
export const entityLabel = (entity?: string | null) => ENTITY_LABELS[String(entity || '')] || (entity ? String(entity).replace(/_/g, ' ') : '—');

/** Tipo da acção: pelo código gravado e, para aprovações e rejeições (gravadas como edição), pela descrição. */
export function activityType(log: Pick<ActivityLog, 'action' | 'details'>): ActivityType {
    const action = String(log.action || '').toLowerCase();
    const details = String(log.details || '').toLowerCase();
    if (/\baprov(ou|ado|ação)/.test(details) && action !== 'create') return 'aprovacao';
    if (/\brejeit(ou|ado)|\breprov/.test(details)) return 'rejeicao';
    if (/restaur|repôs|repos/.test(details) || action === 'restore') return 'reposicao';
    switch (action) {
        case 'create': return 'cadastro';
        case 'update': return 'edicao';
        case 'delete': return 'exclusao';
        case 'export': return 'exportacao';
        case 'import': return 'importacao';
        case 'view': case 'view_sensitive': return 'consulta';
        case 'login': return 'inicio_sessao';
        case 'logout': return 'fim_sessao';
        case 'login_failure': case 'login_failed': return 'sessao_falhada';
        case 'security_alert': case 'security': case 'access_denied': return 'seguranca';
        case 'approve': return 'aprovacao';
        case 'reject': return 'rejeicao';
        default: return 'outro';
    }
}
export const activityLabel = (log: Pick<ActivityLog, 'action' | 'details'>) => ACTIVITY_TYPE_LABELS[activityType(log)];

/** Endereço de origem gravado nos metadados (ou «Este computador» quando não há). */
export const activityOrigin = (log: Pick<ActivityLog, 'metadata'>) => {
    try {
        const meta = JSON.parse(String(log.metadata || '{}'));
        return String(meta.ip || meta.ipAddress || '') || 'Este computador';
    } catch {
        return 'Este computador';
    }
};

export type ActivityFilters = { userIds?: string[]; types?: ActivityType[]; entities?: string[]; search?: string; startKey?: string; endKey?: string };

export function filterActivity<T extends ActivityLog>(logs: T[], filters: ActivityFilters): T[] {
    const needle = String(filters.search || '').trim().toLowerCase();
    return logs.filter(log => {
        const day = luandaDateKey(log.timestamp);
        if (filters.startKey && day < filters.startKey) return false;
        if (filters.endKey && day > filters.endKey) return false;
        if (filters.userIds?.length && !filters.userIds.includes(String(log.userId || ''))) return false;
        if (filters.types?.length && !filters.types.includes(activityType(log))) return false;
        if (filters.entities?.length && !filters.entities.includes(String(log.entity || ''))) return false;
        if (needle && ![log.details, log.userName, entityLabel(log.entity), activityLabel(log)].some(value => String(value || '').toLowerCase().includes(needle))) return false;
        return true;
    });
}

/** Contagem por tipo de acção. */
export function countByType(logs: ActivityLog[]) {
    const counts = Object.fromEntries(ACTIVITY_TYPES.map(type => [type, 0])) as Record<ActivityType, number>;
    for (const log of logs) counts[activityType(log)] += 1;
    return counts;
}

const dateLabel = (key?: string) => key ? key.split('-').reverse().join('/') : '';

/** Relatório de actividade (PDF e Excel) com os filtros aplicados. */
export function activityReportDef(logs: ActivityLog[], filters: ActivityFilters, names: { users: string; scope: string }): ReportDef {
    const sorted = [...logs].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    const counts = countByType(sorted);
    const period = filters.startKey || filters.endKey
        ? `${filters.startKey ? `de ${dateLabel(filters.startKey)}` : 'desde o início'} ${filters.endKey ? `até ${dateLabel(filters.endKey)}` : 'até hoje'}`
        : 'Todo o histórico';
    const typesText = filters.types?.length ? filters.types.map(type => ACTIVITY_TYPE_LABELS[type]).join(', ') : 'Todas as acções';
    const byUser = new Map<string, { name: string; counts: Record<ActivityType, number>; total: number }>();
    for (const log of sorted) {
        const key = String(log.userId || log.userName || 'sistema');
        const entry = byUser.get(key) || { name: log.userName || 'Sistema', counts: countByType([]), total: 0 };
        entry.counts[activityType(log)] += 1; entry.total += 1;
        byUser.set(key, entry);
    }
    const mainTypes: ActivityType[] = ['cadastro', 'edicao', 'exclusao', 'aprovacao', 'exportacao', 'inicio_sessao'];
    return {
        key: 'atividade-utilizadores', title: names.scope === 'one' ? `Relatório de actividade de ${names.users}` : 'Relatório de actividade dos utilizadores',
        subtitle: `${period} · ${typesText}`, orientation: 'landscape', fileBase: 'atividade-utilizadores', tagline: 'AUDITORIA DE UTILIZADORES',
        summary: [
            ['Utilizador(es)', names.users], ['Período', period], ['Tipos de acção', typesText], ['Acções no relatório', String(sorted.length)],
            ...ACTIVITY_TYPES.filter(type => counts[type] > 0).map(type => [ACTIVITY_TYPE_LABELS[type], String(counts[type])] as [string, string]),
        ],
        sections: [
            {
                heading: 'Resumo por utilizador', head: ['Utilizador', ...mainTypes.map(type => ACTIVITY_TYPE_LABELS[type]), 'Outras', 'Total'],
                numeric: [1, 2, 3, 4, 5, 6, 7, 8],
                rows: [...byUser.values()].sort((a, b) => b.total - a.total).map(entry => [entry.name, ...mainTypes.map(type => entry.counts[type]),
                    entry.total - mainTypes.reduce((sum, type) => sum + entry.counts[type], 0), entry.total] as Cell[]),
            },
            {
                heading: 'Acções registadas', head: ['Data e hora', 'Utilizador', 'Tipo de acção', 'Área', 'Descrição', 'Origem'], widths: { 0: 30, 1: 34, 2: 34, 3: 30, 5: 26 },
                rows: sorted.map(log => [formatLuandaDateTime(new Date(log.timestamp)), log.userName || 'Sistema', activityLabel(log), entityLabel(log.entity), log.details || '—', activityOrigin(log)]),
                emptyText: 'Sem acções com estes filtros.',
            },
        ],
    };
}
