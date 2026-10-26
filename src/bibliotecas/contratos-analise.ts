// Página de Contratos sem interface: uma linha por contrato com os valores do plano de prestações (saldo, atraso,
// reembolsado, próxima prestação), filtros rápidos com contagem, indicadores do período, alertas «Requer atenção» e
// o relatório de contratos (PDF e Excel com o motor dos relatórios de Pagamentos). Não altera dados: o estado
// «Em atraso» e «Liquidado» é calculado a partir das prestações (via `portfolioRow`), nunca escrito à mão.
// A numeração dos contratos não é tocada: usa-se o mapa de `contractNumbers` tal como a página já fazia.
import { addDaysToKey, daysBetweenKeys, luandaDateKey } from '@/bibliotecas/fuso-angola';
import { formatKz } from '@/bibliotecas/pagamentos-analise';
import type { InstallmentRow, PortfolioRow } from '@/bibliotecas/carteira-credito';
import type { Cell, ReportDef } from '@/bibliotecas/relatorios-pagamentos';
import type { Client, Contract } from '@/tipos/credito';

// ── Estados ──────────────────────────────────────────────────────────────────────────
export type ContractState = 'em_dia' | 'atraso' | 'liquidado' | 'terminado' | 'rascunho';

export const CONTRACT_STATES: Record<ContractState, { label: string; badge: string }> = {
    em_dia: { label: 'Em dia', badge: 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900/40 dark:text-emerald-200 dark:border-emerald-800' },
    atraso: { label: 'Em atraso', badge: 'bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-900/40 dark:text-orange-200 dark:border-orange-800' },
    liquidado: { label: 'Liquidado', badge: 'bg-teal-100 text-teal-800 border-teal-300 dark:bg-teal-900/40 dark:text-teal-200 dark:border-teal-800' },
    terminado: { label: 'Terminado / expirado', badge: 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-900/40 dark:text-rose-200 dark:border-rose-800' },
    rascunho: { label: 'Rascunho', badge: 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-600' },
};

/** Em vigor = com dinheiro por receber (em dia ou em atraso). */
export const IN_FORCE: ContractState[] = ['em_dia', 'atraso'];

export type RiskClass = 'A' | 'B' | 'C';

export type ContractDocument = { creditId: string; kind: string; fileName: string; uploadedAt: string };

/** Linha da tabela de contratos. Valores em cêntimos (minor) para os totais baterem certo. */
export type ContractRow = {
    contract: Contract;
    portfolio: PortfolioRow | null;
    id: string;
    number: string;
    startKey: string;
    endKey: string;
    clientId: string;
    clientName: string;
    nif: string;
    phone: string;
    product: string;
    managerId: string;
    managerName: string;
    rate: number;
    totalCount: number;
    paidCount: number;
    amountMinor: number;
    outstandingMinor: number;
    overdueMinor: number;
    repaidMinor: number;
    moraMinor: number;
    nextDueKey: string | null;
    nextDueMinor: number;
    /** Dias até à próxima prestação (negativo = atrasada). */
    daysToNext: number | null;
    daysOverdue: number;
    state: ContractState;
    risk: RiskClass;
    missingDocs: string[];
    /** O BI do cliente expira antes do fim do contrato. */
    idExpiresDuringContract: boolean;
    idExpiryKey: string;
};

const num = (value: unknown) => Number(value) || 0;
const toMinor = (value: unknown) => Math.round(num(value) * 100);
export const kz = (minor: number) => formatKz(minor / 100);

/** Classe de risco: o atraso pesa mais do que a classificação do cliente. */
export function riskClassOf(riskLevel: string | undefined, daysOverdue: number): RiskClass {
    if (daysOverdue > 30 || riskLevel === 'high') return 'C';
    if (daysOverdue > 0 || riskLevel === 'medium') return 'B';
    return 'A';
}

function stateOf(contract: Contract, row: PortfolioRow | null): ContractState {
    if (contract.status === 'terminated' || contract.status === 'expired') return 'terminado';
    if (row && (row.stage === 'abatido' || row.stage === 'cancelado' || row.stage === 'rejeitado')) return 'terminado';
    if (contract.status === 'paid' || row?.stage === 'liquidado') return 'liquidado';
    if (!row && contract.status === 'draft') return 'rascunho';
    if (row && row.daysOverdue > 0) return 'atraso';
    return 'em_dia';
}

/** Documentos que um contrato em vigor deve ter (os tipos da Ficha de Crédito). */
export const REQUIRED_DOCS: Array<{ kind: string; label: string }> = [
    { kind: 'contrato', label: 'Cópia assinada do contrato' },
    { kind: 'bi', label: 'Bilhete de Identidade' },
];

export function buildContractRows(input: {
    contracts: Contract[];
    portfolio: PortfolioRow[];
    installments: InstallmentRow[];
    clients: Client[];
    numbers: Map<string, string>;
    documents?: ContractDocument[];
    today: string;
}): ContractRow[] {
    const byId = new Map(input.portfolio.map(row => [row.id, row]));
    const clients = new Map(input.clients.map(client => [client.id, client]));
    const repaid = new Map<string, number>();
    for (const item of input.installments) {
        repaid.set(item.creditId, (repaid.get(item.creditId) || 0) + num(item.paidPrincipalMinor) + num(item.paidInterestMinor) + num(item.paidLateInterestMinor));
    }
    const docs = new Map<string, Set<string>>();
    for (const doc of input.documents || []) {
        if (!docs.has(doc.creditId)) docs.set(doc.creditId, new Set());
        docs.get(doc.creditId)!.add(doc.kind);
    }
    return input.contracts.map(contract => {
        const row = byId.get(contract.id) || null;
        const client = clients.get(contract.clientId);
        const state = stateOf(contract, row);
        const startKey = luandaDateKey(contract.startDate || contract.createdAt);
        const endKey = luandaDateKey(contract.endDate || row?.credit.dueDate);
        const amountMinor = row ? row.grantedMinor : toMinor(contract.value);
        const settled = state === 'liquidado' || state === 'terminado';
        const outstandingMinor = settled ? 0 : row ? row.outstandingMinor : amountMinor;
        const overdueMinor = state === 'atraso' && row ? row.overdueMinor : 0;
        const daysOverdue = state === 'atraso' && row ? row.daysOverdue : 0;
        const nextDueKey = settled ? null : row?.nextDueKey || null;
        const kinds = docs.get(contract.id) || new Set<string>();
        const idExpiryKey = client?.expiryDate ? luandaDateKey(client.expiryDate) : '';
        return {
            contract, portfolio: row, id: contract.id,
            number: input.numbers.get(contract.id) || contract.id,
            startKey, endKey,
            clientId: contract.clientId, clientName: contract.clientName || row?.clientName || '—',
            nif: client?.nif || contract.clientNif || '', phone: client?.phone || '',
            product: row?.product || '—', managerId: row?.managerId || '', managerName: row?.managerName || '—',
            rate: row?.rate || 0, totalCount: row?.totalCount || 0, paidCount: row?.paidCount || 0,
            amountMinor, outstandingMinor, overdueMinor,
            // Sem plano de prestações: um contrato liquidado conta como reembolsado; um terminado não.
            repaidMinor: repaid.get(contract.id) ?? (state === 'terminado' ? 0 : Math.max(0, amountMinor - outstandingMinor)),
            moraMinor: settled ? 0 : row?.moraMinor || 0,
            nextDueKey, nextDueMinor: nextDueKey ? row?.nextDueMinor || 0 : 0,
            daysToNext: nextDueKey ? daysBetweenKeys(input.today, nextDueKey) : null,
            daysOverdue, state,
            risk: riskClassOf(client?.riskLevel || row?.riskLevel, daysOverdue),
            missingDocs: IN_FORCE.includes(state) ? REQUIRED_DOCS.filter(doc => !kinds.has(doc.kind)).map(doc => doc.label) : [],
            idExpiresDuringContract: IN_FORCE.includes(state) && !!idExpiryKey && !!endKey && idExpiryKey < endKey,
            idExpiryKey,
        };
    });
}

// ── Filtros ───────────────────────────────────────────────────────────────────────────
/** «vigor» (em dia + em atraso) só é usado pelo cartão «Em vigor»; não tem botão próprio. */
export type QuickFilter = 'todos' | 'vigor' | 'em_dia' | 'atraso' | 'vence7' | 'docs' | 'liquidados' | 'terminados';

export const QUICK_FILTERS: Array<{ id: QuickFilter; label: string }> = [
    { id: 'todos', label: 'Todos' },
    { id: 'em_dia', label: 'Em dia' },
    { id: 'atraso', label: 'Com atraso' },
    { id: 'vence7', label: 'Vence em 7 dias' },
    { id: 'docs', label: 'Documentação pendente' },
    { id: 'liquidados', label: 'Liquidados' },
    { id: 'terminados', label: 'Terminados / expirados' },
];

export function matchesQuick(row: ContractRow, filter: QuickFilter, soonDays = 7): boolean {
    switch (filter) {
        case 'vigor': return IN_FORCE.includes(row.state);
        case 'em_dia': return row.state === 'em_dia';
        case 'atraso': return row.state === 'atraso';
        case 'vence7': return IN_FORCE.includes(row.state) && row.daysToNext !== null && row.daysToNext >= 0 && row.daysToNext <= soonDays;
        case 'docs': return row.missingDocs.length > 0;
        case 'liquidados': return row.state === 'liquidado';
        case 'terminados': return row.state === 'terminado';
        default: return true;
    }
}

export const quickCounts = (rows: ContractRow[], soonDays = 7) =>
    Object.fromEntries(QUICK_FILTERS.map(item => [item.id, rows.filter(row => matchesQuick(row, item.id, soonDays)).length])) as Record<QuickFilter, number>;

export type ContractFilters = { search: string; product: string; managerId: string; risk: string; clientId: string };
export const EMPTY_CONTRACT_FILTERS: ContractFilters = { search: '', product: '', managerId: '', risk: '', clientId: '' };

const normalize = (value: string) => value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

export function matchesContractFilters(row: ContractRow, filters: ContractFilters): boolean {
    if (filters.product && row.product !== filters.product) return false;
    if (filters.managerId && row.managerId !== filters.managerId) return false;
    if (filters.risk && row.risk !== filters.risk) return false;
    if (filters.clientId && row.clientId !== filters.clientId) return false;
    const term = normalize(filters.search.trim());
    if (term) {
        const haystack = normalize([row.clientName, row.nif, row.phone, row.number, row.id, row.contract.title].join(' '));
        if (!haystack.includes(term)) return false;
    }
    return true;
}

// ── Totais e indicadores ─────────────────────────────────────────────────────────────
export type ContractTotals = { count: number; amountMinor: number; outstandingMinor: number; overdueMinor: number; repaidMinor: number };

export const sumContracts = (rows: ContractRow[]): ContractTotals => rows.reduce((sum, row) => ({
    count: sum.count + 1, amountMinor: sum.amountMinor + row.amountMinor, outstandingMinor: sum.outstandingMinor + row.outstandingMinor,
    overdueMinor: sum.overdueMinor + row.overdueMinor, repaidMinor: sum.repaidMinor + row.repaidMinor,
}), { count: 0, amountMinor: 0, outstandingMinor: 0, overdueMinor: 0, repaidMinor: 0 });

export type ContractKpis = {
    period: ContractTotals;
    inForce: ContractTotals & { share: number | null };
    overdue: ContractTotals;
    dueSoon: { installments: number; amountMinor: number };
    paid: ContractTotals;
    closed: ContractTotals;
};

/** Indicadores dos contratos indicados. «Vence em N dias» conta prestações por pagar no plano. */
export function contractKpis(rows: ContractRow[], installments: InstallmentRow[], today: string, soonDays = 7): ContractKpis {
    const inForce = rows.filter(row => IN_FORCE.includes(row.state));
    const ids = new Set(inForce.map(row => row.id));
    const limit = addDaysToKey(today, soonDays);
    let count = 0;
    let amount = 0;
    for (const item of installments) {
        if (!ids.has(item.creditId) || item.status === 'cancelled') continue;
        const owed = num(item.principalMinor) + num(item.interestMinor) - num(item.paidPrincipalMinor) - num(item.paidInterestMinor);
        const due = luandaDateKey(item.dueDate);
        if (owed > 0 && due >= today && due <= limit) { count++; amount += owed; }
    }
    const inForceTotals = sumContracts(inForce);
    return {
        period: sumContracts(rows),
        inForce: { ...inForceTotals, share: rows.length ? Math.round((inForce.length / rows.length) * 1000) / 10 : null },
        overdue: sumContracts(rows.filter(row => row.state === 'atraso')),
        dueSoon: { installments: count, amountMinor: amount },
        paid: sumContracts(rows.filter(row => row.state === 'liquidado')),
        closed: sumContracts(rows.filter(row => row.state === 'terminado')),
    };
}

// ── Requer atenção ───────────────────────────────────────────────────────────────────
export type AttentionKind = 'overdue' | 'due_soon' | 'missing_contract' | 'id_expiring';
export type AttentionItem = { id: string; kind: AttentionKind; row: ContractRow; title: string; detail: string; action: string; weight: number };

export const ATTENTION_LABELS: Record<AttentionKind, string> = {
    overdue: 'Prestação em atraso', due_soon: 'Vencimento próximo', missing_contract: 'Contrato assinado em falta', id_expiring: 'BI a expirar',
};

export function attentionItems(rows: ContractRow[], soonDays = 7): AttentionItem[] {
    const items: AttentionItem[] = [];
    const date = (key: string) => key ? `${key.slice(8, 10)}/${key.slice(5, 7)}/${key.slice(0, 4)}` : '—';
    for (const row of rows) {
        if (!IN_FORCE.includes(row.state)) continue;
        if (row.state === 'atraso') items.push({ id: `${row.id}:overdue`, kind: 'overdue', row, title: ATTENTION_LABELS.overdue,
            detail: `${kz(row.overdueMinor)} vencidos há ${row.daysOverdue} ${row.daysOverdue === 1 ? 'dia' : 'dias'}`, action: 'Enviar cobrança', weight: 3000 + row.daysOverdue });
        else if (row.daysToNext !== null && row.daysToNext >= 0 && row.daysToNext <= soonDays) items.push({ id: `${row.id}:soon`, kind: 'due_soon', row, title: ATTENTION_LABELS.due_soon,
            detail: `${kz(row.nextDueMinor)} vencem ${row.daysToNext === 0 ? 'hoje' : `em ${row.daysToNext} ${row.daysToNext === 1 ? 'dia' : 'dias'}`} (${date(row.nextDueKey || '')})`, action: 'Lembrar cliente', weight: 2000 - row.daysToNext });
        if (row.missingDocs.includes(REQUIRED_DOCS[0].label)) items.push({ id: `${row.id}:contract`, kind: 'missing_contract', row, title: ATTENTION_LABELS.missing_contract,
            detail: 'Falta carregar a cópia assinada do contrato', action: 'Carregar', weight: 1000 });
        if (row.idExpiresDuringContract) items.push({ id: `${row.id}:bi`, kind: 'id_expiring', row, title: ATTENTION_LABELS.id_expiring,
            detail: `O BI expira a ${date(row.idExpiryKey)}, antes do fim do contrato (${date(row.endKey)})`, action: 'Actualizar BI', weight: 500 });
    }
    return items.sort((a, b) => b.weight - a.weight);
}

// ── Relatório ────────────────────────────────────────────────────────────────────────
export type ReportStateFilter = 'todos' | 'vigor' | 'atraso' | 'liquidado' | 'terminado';
export const REPORT_STATE_LABELS: Record<ReportStateFilter, string> = {
    todos: 'Todos os estados', vigor: 'Em vigor', atraso: 'Com atraso', liquidado: 'Liquidados', terminado: 'Terminados / expirados',
};

export const matchesReportState = (row: ContractRow, state: ReportStateFilter) => state === 'todos'
    || (state === 'vigor' && IN_FORCE.includes(row.state))
    || (state === 'atraso' && row.state === 'atraso')
    || (state === 'liquidado' && row.state === 'liquidado')
    || (state === 'terminado' && row.state === 'terminado');

const dateText = (key: string) => key ? `${key.slice(8, 10)}/${key.slice(5, 7)}/${key.slice(0, 4)}` : '-';
const money = (minor: number) => Math.round(minor) / 100;

/** Relatório de contratos celebrados: resumo com os totais, lista e totais por estado. */
export function buildContractsReport(rows: ContractRow[], input: { periodLabel: string; filters: string[]; title?: string; fileBase?: string }): ReportDef {
    const sorted = [...rows].sort((a, b) => a.startKey.localeCompare(b.startKey) || a.number.localeCompare(b.number));
    const totals = sumContracts(sorted);
    const byState = (Object.keys(CONTRACT_STATES) as ContractState[])
        .map(state => ({ state, totals: sumContracts(sorted.filter(row => row.state === state)) }))
        .filter(item => item.totals.count > 0);
    const totalCells = (t: ContractTotals): Cell[] => [money(t.amountMinor), money(t.repaidMinor), money(t.outstandingMinor), money(t.overdueMinor)];
    return {
        key: 'contratos', title: input.title || 'Relatório de Contratos Celebrados',
        subtitle: `${input.periodLabel}${input.filters.length ? ` · ${input.filters.join(' · ')}` : ''}`,
        orientation: 'landscape', fileBase: input.fileBase || 'relatorio-contratos', tagline: 'RELATÓRIOS DE CONTRATOS',
        summary: [
            ['N.º de contratos', String(totals.count)], ['Valor contratado', kz(totals.amountMinor)],
            ['Saldo em dívida', kz(totals.outstandingMinor)], ['Valor em atraso', kz(totals.overdueMinor)],
            ['Valor reembolsado', kz(totals.repaidMinor)], ['Contratos com atraso', String(sorted.filter(row => row.state === 'atraso').length)],
        ],
        sections: [
            {
                heading: 'Contratos', emptyText: 'Nenhum contrato corresponde aos filtros.',
                head: ['N.º', 'Data', 'Cliente', 'NIF / BI', 'Produto', 'Gestor', 'Prest.', 'Montante', 'Reembolsado', 'Saldo em dívida', 'Em atraso', 'Dias', 'Estado'],
                money: [7, 8, 9, 10], numeric: [11],
                widths: { 0: 26, 1: 17, 3: 24, 6: 13, 7: 24, 8: 24, 9: 24, 10: 22, 11: 10, 12: 21 },
                rows: sorted.map(row => [row.number, dateText(row.startKey), row.clientName, row.nif || '-', row.product, row.managerName,
                    row.totalCount ? `${row.paidCount}/${row.totalCount}` : '-', ...totalCells(sumContracts([row])), row.daysOverdue || '', CONTRACT_STATES[row.state].label]),
                foot: [[`Total (${totals.count})`, '', '', '', '', '', '', ...totalCells(totals), '', '']],
            },
            {
                heading: 'Totais por estado', head: ['Estado', 'N.º', 'Montante', 'Reembolsado', 'Saldo em dívida', 'Em atraso'], money: [2, 3, 4, 5], numeric: [1],
                rows: byState.map(item => [CONTRACT_STATES[item.state].label, item.totals.count, ...totalCells(item.totals)]),
                foot: [['Total', totals.count, ...totalCells(totals)]], emptyText: 'Sem contratos.',
            },
        ],
    };
}
