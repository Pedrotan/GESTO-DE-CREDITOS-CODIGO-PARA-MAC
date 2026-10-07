// Relatórios das alçadas em PDF e Excel (mesmo motor dos relatórios de pagamentos): utilização dos limites por
// utilizador e agência, operações escaladas (quem pediu, quem aprovou e quanto tempo demorou), exceções
// temporárias concedidas e histórico das alterações aos limites.
import { formatLuandaDateTime, luandaDateKey } from './fuso-angola.ts';
import { OPERATION_LABELS, OPERATION_TYPES, effectiveLimit, formatKz, type LedgerRow, type LimitActor, type LimitException, type LimitPolicy, type OperationType } from './alcadas.ts';
import type { Cell, ReportDef, Section } from './relatorios-pagamentos';

export type LimitsReportKey = 'utilizacao' | 'escalonamentos' | 'excecoes' | 'historico';
export const LIMITS_REPORTS: Array<{ key: LimitsReportKey; title: string; description: string }> = [
    { key: 'utilizacao', title: 'Utilização de Limites', description: 'Consumo por utilizador e por agência no período.' },
    { key: 'escalonamentos', title: 'Operações Escaladas', description: 'Quem pediu, quem aprovou e quanto tempo demorou.' },
    { key: 'excecoes', title: 'Exceções Temporárias', description: 'Aumentos temporários concedidos, com motivo e aprovação.' },
    { key: 'historico', title: 'Histórico de Alterações aos Limites', description: 'Versões, motivos, aprovações e diferenças.' },
];

type ReportUser = LimitActor & { branchName?: string | null };
type ReportLedger = LedgerRow & { id?: string; userName?: string | null; createdAt: string };
type ReportEscalation = {
    id: string; operationType: string; entityId: string; amountMinor: number; requestedByName: string | null; reason: string; requiredLevelName: string;
    dual: boolean; status: string; createdAt: string; decidedAt: string | null; decidedByName: string | null; escalationCount: number;
};
type ReportApproval = { escalationId: string; approverName: string; decision: string; decidedAt: string };
type ReportVersion = {
    version: number; status: string; effectiveFrom: string; createdByName: string; createdAt: string; decidedByName: string | null; decidedAt: string | null;
    reason: string; summary: string[]; requiresSecondApproval: boolean; restoredFrom: string | null;
};

export type LimitsReportInput = {
    periodLabel: string; fromKey: string; toKey: string;
    policy: LimitPolicy; users: ReportUser[]; ledger: ReportLedger[]; escalations: ReportEscalation[]; approvals: ReportApproval[];
    exceptions: LimitException[]; versions: ReportVersion[]; profileName: (id: string) => string;
};

const STATUS: Record<string, string> = { pending: 'Pendente', approved: 'Aprovada', rejected: 'Rejeitada', cancelled: 'Cancelada', revoked: 'Terminada antes do prazo' };
const inPeriod = (iso: string | null | undefined, from: string, to: string) => {
    if (!iso) return false;
    const key = luandaDateKey(iso);
    return key >= from && key <= to;
};
const kz = (minor: number) => Math.round(minor) / 100;
export function durationLabel(fromIso: string, toIso: string | null) {
    if (!toIso) return '—';
    const minutes = Math.max(0, Math.round((new Date(toIso).getTime() - new Date(fromIso).getTime()) / 60_000));
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60), rest = minutes % 60;
    if (hours < 24) return `${hours} h${rest ? ` ${rest} min` : ''}`;
    return `${Math.floor(hours / 24)} d ${hours % 24} h`;
}

export function buildLimitsReport(key: LimitsReportKey, input: LimitsReportInput): ReportDef {
    const info = LIMITS_REPORTS.find(item => item.key === key)!;
    const users = new Map(input.users.map(user => [user.id, user]));
    const branch = (id?: string | null) => input.users.find(user => user.branchId && user.branchId === id)?.branchName || id || 'Sem agência';
    let sections: Section[] = [];
    let summary: Array<[string, string]> = [];
    let orientation: ReportDef['orientation'] = 'landscape';
    switch (key) {
        case 'utilizacao': {
            const ledger = input.ledger.filter(row => row.dayKey >= input.fromKey && row.dayKey <= input.toKey);
            const byUser = new Map<string, { user: string; role: string; branchId: string; op: OperationType; count: number; amount: number; days: Map<string, number> }>();
            for (const row of ledger) {
                const id = `${row.userId}|${row.operationType}`;
                const entry = byUser.get(id) || { user: row.userName || users.get(row.userId)?.name || row.userId, role: row.profileId || users.get(row.userId)?.role || '', branchId: row.branchId || '', op: row.operationType as OperationType, count: 0, amount: 0, days: new Map() };
                entry.count += Number(row.count) || 0; entry.amount += Number(row.amountMinor) || 0;
                entry.days.set(row.dayKey, (entry.days.get(row.dayKey) || 0) + (Number(row.amountMinor) || 0));
                byUser.set(id, entry);
            }
            const userRows: Cell[][] = [...byUser.entries()].sort((a, b) => a[1].user.localeCompare(b[1].user) || a[1].op.localeCompare(b[1].op)).map(([id, entry]) => {
                const actor = users.get(id.split('|')[0]) || { id: id.split('|')[0], name: entry.user, role: entry.role, branchId: entry.branchId };
                const limit = effectiveLimit(input.policy, actor, entry.op);
                const peak = Math.max(0, ...entry.days.values());
                const peakPct = limit.dailyMinor ? `${Math.round((peak / limit.dailyMinor) * 100)}%` : '—';
                return [entry.user, input.profileName(entry.role), branch(entry.branchId), OPERATION_LABELS[entry.op] || entry.op, entry.count,
                    entry.op === 'client_export' ? null : kz(entry.amount), limit.dailyMinor != null ? kz(limit.dailyMinor) : null, limit.monthlyMinor != null ? kz(limit.monthlyMinor) : null,
                    entry.op === 'client_export' ? '—' : `${formatKz(peak)} (${peakPct})`];
            });
            const byBranch = new Map<string, { count: number; amount: number }>();
            for (const row of ledger) {
                const id = `${row.branchId || ''}|${row.operationType}`;
                const entry = byBranch.get(id) || { count: 0, amount: 0 };
                entry.count += Number(row.count) || 0; entry.amount += Number(row.amountMinor) || 0;
                byBranch.set(id, entry);
            }
            const branchRows: Cell[][] = [...byBranch.entries()].sort().map(([id, entry]) => {
                const [branchId, op] = id.split('|');
                return [branch(branchId), OPERATION_LABELS[op as OperationType] || op, entry.count, op === 'client_export' ? null : kz(entry.amount)];
            });
            summary = [['Movimentos', String(ledger.length)], ['Utilizadores', String(new Set(ledger.map(row => row.userId)).size)],
                ['Valor consumido', formatKz(ledger.filter(row => row.operationType !== 'client_export').reduce((sum, row) => sum + (Number(row.amountMinor) || 0), 0))]];
            sections = [
                { heading: 'Por utilizador', head: ['Utilizador', 'Perfil', 'Agência', 'Operação', 'Operações', 'Valor no período', 'Limite diário', 'Limite mensal', 'Maior dia (% do diário)'],
                    rows: userRows, money: [5, 6, 7], numeric: [4], widths: { 0: 38, 1: 30, 2: 26, 3: 34, 4: 18 }, emptyText: 'Sem consumo de limites no período.' },
                { heading: 'Por agência', head: ['Agência', 'Operação', 'Operações', 'Valor no período'], rows: branchRows, money: [3], numeric: [2], emptyText: 'Sem consumo no período.' },
            ];
            break;
        }
        case 'escalonamentos': {
            const list = input.escalations.filter(item => inPeriod(item.createdAt, input.fromKey, input.toKey)).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
            const decided = list.filter(item => item.decidedAt);
            const avgMinutes = decided.length ? decided.reduce((sum, item) => sum + (new Date(item.decidedAt!).getTime() - new Date(item.createdAt).getTime()) / 60_000, 0) / decided.length : null;
            summary = [['Operações escaladas', String(list.length)], ['Aprovadas', String(list.filter(item => item.status === 'approved').length)],
                ['Rejeitadas', String(list.filter(item => item.status === 'rejected').length)], ['Pendentes', String(list.filter(item => item.status === 'pending').length)],
                ['Dupla aprovação', String(list.filter(item => item.dual).length)], ['Tempo médio até decisão', avgMinutes === null ? '—' : durationLabel(new Date(0).toISOString(), new Date(avgMinutes * 60_000).toISOString())]];
            sections = [{
                heading: 'Pedidos acima da alçada', head: ['Data/Hora', 'Operação', 'Valor', 'Pedido por', 'Motivo', 'Nível exigido', 'Estado', 'Aprovado/decidido por', 'Tempo até decisão'],
                widths: { 0: 28, 1: 28, 2: 26, 3: 30, 5: 30, 6: 20, 7: 36, 8: 22 }, money: [2],
                rows: list.map(item => {
                    const approvers = input.approvals.filter(approval => approval.escalationId === item.id).map(approval => `${approval.approverName} (${approval.decision === 'approved' ? 'aprovou' : 'rejeitou'})`);
                    return [formatLuandaDateTime(item.createdAt), OPERATION_LABELS[item.operationType as OperationType] || item.operationType, kz(item.amountMinor), item.requestedByName || '—',
                        `${item.reason}${item.escalationCount ? ` (subiu ${item.escalationCount}× por falta de decisão)` : ''}`, item.requiredLevelName, STATUS[item.status] || item.status,
                        approvers.join(', ') || item.decidedByName || '—', durationLabel(item.createdAt, item.decidedAt)];
                }),
                emptyText: 'Sem operações escaladas no período.',
            }];
            break;
        }
        case 'excecoes': {
            const list = input.exceptions.filter(item => inPeriod(item.requestedAt, input.fromKey, input.toKey) || (item.startsAt.slice(0, 10) <= input.toKey && item.endsAt.slice(0, 10) >= input.fromKey));
            const values = (item: LimitException) => [
                item.perOperationMinor != null ? `por operação ${formatKz(item.perOperationMinor)}` : '', item.dailyMinor != null ? `diário ${formatKz(item.dailyMinor)}` : '',
                item.monthlyMinor != null ? `mensal ${formatKz(item.monthlyMinor)}` : '', item.dailyCount != null ? `${item.dailyCount} por dia` : '',
            ].filter(Boolean).join(' · ');
            const now = Date.now();
            const state = (item: LimitException) => item.status === 'approved' ? (new Date(item.endsAt).getTime() <= now ? 'Expirada' : new Date(item.startsAt).getTime() > now ? 'Agendada' : 'Ativa') : STATUS[item.status] || item.status;
            summary = [['Exceções', String(list.length)], ['Ativas', String(list.filter(item => state(item) === 'Ativa').length)], ['Expiradas', String(list.filter(item => state(item) === 'Expirada').length)],
                ['Rejeitadas', String(list.filter(item => item.status === 'rejected').length)]];
            sections = [{
                heading: 'Aumentos temporários de limite', head: ['Utilizador', 'Operação', 'Valores', 'Início', 'Fim', 'Estado', 'Pedido por', 'Aprovado por', 'Motivo'],
                widths: { 0: 32, 1: 30, 2: 44, 3: 26, 4: 26, 5: 20, 6: 28, 7: 28 },
                rows: list.map(item => [item.userName, OPERATION_LABELS[item.operationType] || item.operationType, values(item), formatLuandaDateTime(item.startsAt), formatLuandaDateTime(item.endsAt),
                    state(item), item.requestedByName, item.decidedByName || '—', item.reason]),
                emptyText: 'Sem exceções temporárias no período.',
            }];
            break;
        }
        case 'historico': {
            const list = input.versions.filter(item => inPeriod(item.createdAt, input.fromKey, input.toKey)).sort((a, b) => a.version - b.version);
            summary = [['Versões no período', String(list.length)], ['Com segundo administrador', String(list.filter(item => item.requiresSecondApproval).length)],
                ['Reposições de versões anteriores', String(list.filter(item => item.restoredFrom).length)]];
            sections = [{
                heading: 'Versões dos limites', head: ['Versão', 'Estado', 'Em vigor desde', 'Criada por', 'Data', 'Aprovada por', 'Motivo', 'Alterações'],
                widths: { 0: 14, 1: 20, 2: 26, 3: 28, 4: 26, 5: 28, 6: 46 }, numeric: [0],
                rows: list.map(item => [item.version, STATUS[item.status] || item.status, formatLuandaDateTime(item.effectiveFrom), item.createdByName, formatLuandaDateTime(item.createdAt),
                    item.decidedByName ? `${item.decidedByName} (${formatLuandaDateTime(item.decidedAt)})` : item.requiresSecondApproval ? '—' : 'Não exigida',
                    item.reason, item.summary.slice(0, 12).join('\n') + (item.summary.length > 12 ? `\n… e mais ${item.summary.length - 12}` : '')]),
                emptyText: 'Sem alterações aos limites no período.',
            }];
            orientation = 'landscape';
            break;
        }
    }
    return {
        key: `limites-${key}`, title: info.title, subtitle: input.periodLabel, orientation, fileBase: `limites-${key}`,
        summary, sections, tagline: 'LIMITES DE TRANSAÇÃO',
        footerNote: `Cadeia de aprovação: ${input.policy.chain.levels.map(level => level.name).join(', ')} e dupla aprovação acima do nível máximo · ${OPERATION_TYPES.length} tipos de operação`,
    };
}
