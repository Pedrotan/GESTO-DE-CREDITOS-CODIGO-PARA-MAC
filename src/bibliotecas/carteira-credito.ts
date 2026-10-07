// Carteira de crédito: uma única forma de calcular o estado de cada crédito e os indicadores da carteira, a partir
// dos mesmos dados que as outras páginas usam (contratos, plano de prestações, pagamentos e razão). Não cria
// fórmulas novas: a mora vem de `calculateLateInterest`, o recebido das funções da página de Pagamentos
// (`buildPaymentRows`/`sumRows`) e o desembolsado dos lançamentos do razão (como na Contabilidade).

import { calculateLateInterest } from '@/bibliotecas/juros-mora';
import { luandaDateKey, luandaTodayKey } from '@/bibliotecas/fuso-angola';
import { buildPaymentRows, contractNumbers, inKeyRange, sumRows, type KeyRange, type RowTotals } from '@/bibliotecas/pagamentos-analise';
import type { AccountingEntry, Client, Credit, Payment } from '@/tipos/credito';

// ── Ciclo de vida ────────────────────────────────────────────────────────────────

export type CreditStage =
    | 'pedido' | 'em_analise' | 'aprovado' | 'rejeitado' | 'contrato' | 'ativo' | 'em_atraso'
    | 'liquidado' | 'reestruturado' | 'contencioso' | 'abatido' | 'cancelado';

export const STAGES: Record<CreditStage, { label: string; badge: string; dot: string }> = {
    pedido: { label: 'Pedido', badge: 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-600', dot: 'bg-slate-400' },
    em_analise: { label: 'Em análise', badge: 'bg-violet-100 text-violet-800 border-violet-300 dark:bg-violet-900/40 dark:text-violet-200 dark:border-violet-800', dot: 'bg-violet-500' },
    aprovado: { label: 'Aprovado', badge: 'bg-sky-100 text-sky-800 border-sky-300 dark:bg-sky-900/40 dark:text-sky-200 dark:border-sky-800', dot: 'bg-sky-500' },
    rejeitado: { label: 'Rejeitado', badge: 'bg-zinc-100 text-zinc-600 border-zinc-300 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-600', dot: 'bg-zinc-400' },
    contrato: { label: 'Contrato assinado', badge: 'bg-indigo-100 text-indigo-800 border-indigo-300 dark:bg-indigo-900/40 dark:text-indigo-200 dark:border-indigo-800', dot: 'bg-indigo-500' },
    ativo: { label: 'Ativo', badge: 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900/40 dark:text-emerald-200 dark:border-emerald-800', dot: 'bg-emerald-500' },
    em_atraso: { label: 'Em atraso', badge: 'bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-900/40 dark:text-orange-200 dark:border-orange-800', dot: 'bg-orange-500' },
    liquidado: { label: 'Liquidado', badge: 'bg-teal-100 text-teal-800 border-teal-300 dark:bg-teal-900/40 dark:text-teal-200 dark:border-teal-800', dot: 'bg-teal-500' },
    reestruturado: { label: 'Reestruturado', badge: 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/40 dark:text-blue-200 dark:border-blue-800', dot: 'bg-blue-500' },
    contencioso: { label: 'Contencioso', badge: 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-900/40 dark:text-rose-200 dark:border-rose-800', dot: 'bg-rose-600' },
    abatido: { label: 'Abatido', badge: 'bg-neutral-800 text-white border-neutral-900 dark:bg-neutral-700 dark:border-neutral-500', dot: 'bg-neutral-800' },
    cancelado: { label: 'Cancelado', badge: 'bg-zinc-100 text-zinc-500 border-zinc-300 dark:bg-zinc-800 dark:text-zinc-400', dot: 'bg-zinc-300' },
};

/**
 * Transições permitidas. As automáticas (ativo ⇄ em atraso, → liquidado) são feitas pelo sistema; as restantes
 * exigem permissão, motivo e ficam na auditoria (reestruturação, contencioso e abate com aprovação).
 */
export const TRANSITIONS: Record<CreditStage, CreditStage[]> = {
    pedido: ['em_analise', 'aprovado', 'rejeitado'],
    em_analise: ['aprovado', 'rejeitado'],
    aprovado: ['contrato', 'ativo'],
    rejeitado: [],
    contrato: ['ativo'],
    ativo: ['em_atraso', 'liquidado', 'reestruturado', 'contencioso', 'abatido'],
    em_atraso: ['ativo', 'liquidado', 'reestruturado', 'contencioso', 'abatido'],
    reestruturado: ['em_atraso', 'liquidado', 'contencioso', 'abatido'],
    contencioso: ['liquidado', 'abatido'],
    liquidado: [],
    abatido: [],
    cancelado: [],
};
export const canTransition = (from: CreditStage, to: CreditStage) => TRANSITIONS[from].includes(to);

/** Separadores rápidos da página (com contador). */
export const STAGE_TABS: Array<{ id: string; label: string; stages: CreditStage[] | null }> = [
    { id: 'todos', label: 'Todos', stages: null },
    { id: 'pedidos', label: 'Pedidos', stages: ['pedido'] },
    { id: 'analise', label: 'Em análise', stages: ['em_analise'] },
    { id: 'aprovados', label: 'Aprovados', stages: ['aprovado', 'contrato'] },
    { id: 'ativos', label: 'Ativos', stages: ['ativo'] },
    { id: 'atraso', label: 'Em atraso', stages: ['em_atraso'] },
    { id: 'liquidados', label: 'Liquidados', stages: ['liquidado'] },
    { id: 'reestruturados', label: 'Reestruturados', stages: ['reestruturado'] },
    { id: 'contencioso', label: 'Contencioso', stages: ['contencioso'] },
    { id: 'abatidos', label: 'Abatidos', stages: ['abatido'] },
];

// ── Dados de entrada ─────────────────────────────────────────────────────────────

export type InstallmentRow = {
    id: string; creditId: string; installmentNumber: number; dueDate: string;
    principalMinor: number; interestMinor: number; lateInterestMinor: number;
    paidPrincipalMinor: number; paidInterestMinor: number; paidLateInterestMinor: number;
    status: string; paidAt?: string | null;
};

export type PortfolioContext = {
    installments: InstallmentRow[];
    payments: Payment[];
    /** Processos de contencioso abertos (por crédito). */
    legalCreditIds?: Set<string>;
    /** Créditos abatidos (credit_writeoffs). */
    writtenOffIds?: Set<string>;
    /** Pedidos ainda na fila de escalonamento das alçadas. */
    escalatedIds?: Set<string>;
    clients?: Client[];
    users?: Array<{ id: string; name: string; branchId?: string | null; branchName?: string | null }>;
    /** Produto do Simulador de cada crédito convertido (simulations.convertedCreditId → productId). */
    productOf?: Map<string, string>;
    productNames?: Map<string, string>;
    now?: Date;
};

const num = (value: unknown) => Number(value) || 0;
const toMinor = (value: unknown) => Math.round(num(value) * 100);
const DAY = 86_400_000;
const dayDiff = (fromKey: string, toKey: string) => Math.round((Date.UTC(+toKey.slice(0, 4), +toKey.slice(5, 7) - 1, +toKey.slice(8, 10)) - Date.UTC(+fromKey.slice(0, 4), +fromKey.slice(5, 7) - 1, +fromKey.slice(8, 10))) / DAY);
/** Prestações com valor (as anuladas numa reestruturação ficam a zero e não contam). */
const real = (item: InstallmentRow) => item.status !== 'cancelled' && (num(item.principalMinor) + num(item.interestMinor)) > 0;

export type AgingBucket = 'em_dia' | '1-30' | '31-60' | '61-90' | '90+';
export const AGING_LABELS: Record<AgingBucket, string> = { em_dia: 'Em dia', '1-30': '1–30 dias', '31-60': '31–60 dias', '61-90': '61–90 dias', '90+': 'Mais de 90 dias' };
export const agingOf = (days: number): AgingBucket => days <= 0 ? 'em_dia' : days <= 30 ? '1-30' : days <= 60 ? '31-60' : days <= 90 ? '61-90' : '90+';

/** Linha da carteira: o crédito com os valores calculados a partir das prestações e dos pagamentos. */
export type PortfolioRow = {
    credit: Credit;
    id: string;
    reference: string;
    clientId: string;
    clientName: string;
    product: string;
    managerId: string;
    managerName: string;
    branchId: string;
    branchName: string;
    riskLevel: string;
    stage: CreditStage;
    grantedMinor: number;
    outstandingMinor: number;
    interestOutstandingMinor: number;
    contractedInterestMinor: number;
    rate: number;
    installmentMinor: number;
    paidCount: number;
    totalCount: number;
    nextDueKey: string | null;
    nextDueMinor: number;
    daysOverdue: number;
    overdueMinor: number;
    moraMinor: number;
    aging: AgingBucket;
    grantedKey: string;
    competenceMonth: string;
    paidOffKey: string | null;
};

const competenceOf = (credit: Credit) => /^\d{4}-\d{2}$/.test(String(credit.targetMonthId || ''))
    ? String(credit.targetMonthId) : luandaDateKey(credit.startDate || credit.createdAt).slice(0, 7);

/** Calcula a linha de um crédito. A mora usa a fórmula existente, com a taxa diária do contrato. */
export function portfolioRow(credit: Credit, context: PortfolioContext, numbers?: Map<string, string>): PortfolioRow {
    const now = context.now || new Date();
    const today = luandaDateKey(now);
    const schedule = context.installments.filter(item => item.creditId === credit.id).sort((a, b) => num(a.installmentNumber) - num(b.installmentNumber));
    const valid = schedule.filter(real);
    const payments = context.payments.filter(payment => payment.creditId === credit.id && payment.status === 'confirmed' && !payment.deletedAt);
    const outstanding = valid.length
        ? valid.reduce((sum, item) => sum + Math.max(0, num(item.principalMinor) - num(item.paidPrincipalMinor)), 0)
        : toMinor(credit.currentBalance);
    const interestOutstanding = valid.length
        ? valid.reduce((sum, item) => sum + Math.max(0, num(item.interestMinor) - num(item.paidInterestMinor)), 0)
        : toMinor(credit.accruedInterest);
    const contracted = valid.length ? valid.reduce((sum, item) => sum + num(item.interestMinor), 0) : toMinor(credit.accruedInterest);
    const open = valid.filter(item => (num(item.principalMinor) + num(item.interestMinor)) > (num(item.paidPrincipalMinor) + num(item.paidInterestMinor)));
    const next = [...open].sort((a, b) => luandaDateKey(a.dueDate).localeCompare(luandaDateKey(b.dueDate)))[0];
    const overdueItems = open.filter(item => luandaDateKey(item.dueDate) < today);
    const firstOverdue = overdueItems.map(item => luandaDateKey(item.dueDate)).sort()[0];
    const daysOverdue = firstOverdue ? Math.max(0, dayDiff(firstOverdue, today)) : 0;
    const overdueMinor = overdueItems.reduce((sum, item) => sum + (num(item.principalMinor) + num(item.interestMinor)) - (num(item.paidPrincipalMinor) + num(item.paidInterestMinor)), 0);
    let moraMinor = 0;
    if (valid.length && ['active', 'overdue', 'defaulted', 'renegotiated'].includes(credit.status)) {
        const mora = calculateLateInterest({
            installments: valid.map(item => ({ id: item.id, number: num(item.installmentNumber), dueDate: item.dueDate, principalMinor: num(item.principalMinor), interestMinor: num(item.interestMinor) })),
            payments: payments.map(payment => ({ date: payment.paymentDate, principalMinor: toMinor(payment.allocatedToPrincipal), interestMinor: toMinor(payment.allocatedToInterest), lateMinor: toMinor(payment.allocatedToLateInterest) })),
            dailyRatePercent: num(credit.lateInterestRate), asOf: now,
        });
        // Mora por cobrar: a calculada até hoje ou a já lançada no crédito, a maior (nunca se perde mora lançada).
        const posted = valid.reduce((sum, item) => sum + Math.max(0, num(item.lateInterestMinor) - num(item.paidLateInterestMinor)), 0);
        moraMinor = Math.max(mora.owedMinor, posted);
    }
    const stage = stageOf(credit, { outstanding, interestOutstanding, daysOverdue, context });
    const client = context.clients?.find(item => item.id === credit.clientId);
    const managerId = String(credit.usuario_id || client?.usuario_id || '');
    const manager = context.users?.find(user => user.id === managerId);
    const productId = (credit as any).productId || context.productOf?.get(credit.id);
    const lastPayment = payments.map(payment => luandaDateKey(payment.paymentDate)).sort().at(-1) || null;
    return {
        credit, id: credit.id, reference: numbers?.get(credit.id) || credit.id.slice(0, 11).toUpperCase(),
        clientId: credit.clientId, clientName: credit.clientName,
        product: productId ? (context.productNames?.get(productId) || productId) : (client?.clientType === 'EMPRESA' ? 'Crédito Empresa' : client?.clientCategory === 'APOSENTADO' ? 'Crédito Aposentado' : 'Crédito Particular'),
        managerId, managerName: manager?.name || credit.requestedBy || '—',
        branchId: manager?.branchId || '', branchName: manager?.branchName || 'Sem agência',
        riskLevel: client?.riskLevel || 'low', stage,
        grantedMinor: toMinor(credit.principalAmount), outstandingMinor: outstanding, interestOutstandingMinor: interestOutstanding, contractedInterestMinor: contracted,
        rate: num(credit.interestRate),
        installmentMinor: next ? num(next.principalMinor) + num(next.interestMinor) : 0,
        paidCount: valid.filter(item => (num(item.paidPrincipalMinor) + num(item.paidInterestMinor)) >= (num(item.principalMinor) + num(item.interestMinor))).length,
        totalCount: valid.length || num(credit.installments),
        nextDueKey: next ? luandaDateKey(next.dueDate) : null,
        nextDueMinor: next ? (num(next.principalMinor) + num(next.interestMinor)) - (num(next.paidPrincipalMinor) + num(next.paidInterestMinor)) : 0,
        daysOverdue, overdueMinor, moraMinor, aging: agingOf(daysOverdue),
        grantedKey: luandaDateKey(credit.startDate || credit.createdAt), competenceMonth: competenceOf(credit),
        paidOffKey: stage === 'liquidado' ? (credit.paidAt ? luandaDateKey(credit.paidAt) : lastPayment) : null,
    };
}

/** Estado do ciclo de vida a partir do estado gravado e dos dados relacionados (sem alterar o que está gravado). */
export function stageOf(credit: Credit, input: { outstanding: number; interestOutstanding: number; daysOverdue: number; context: PortfolioContext }): CreditStage {
    const { context } = input;
    if (credit.status === 'cancelled') return 'cancelado';
    if (credit.status === 'rejected') return 'rejeitado';
    if (credit.status === 'pending_approval') return context.escalatedIds?.has(credit.id) ? 'em_analise' : 'pedido';
    if (context.writtenOffIds?.has(credit.id)) return 'abatido';
    if (credit.status === 'paid') return 'liquidado';
    // Liquidado automaticamente quando capital, juros e mora ficam a zero.
    if (input.outstanding <= 0 && input.interestOutstanding <= 0 && num(credit.lateInterest) <= 0 && context.installments.some(item => item.creditId === credit.id)) return 'liquidado';
    if (context.legalCreditIds?.has(credit.id)) return 'contencioso';
    if (credit.status === 'renegotiated') return 'reestruturado';
    return input.daysOverdue > 0 ? 'em_atraso' : 'ativo';
}

export function buildPortfolio(credits: Credit[], context: PortfolioContext): PortfolioRow[] {
    const numbers = contractNumbers(credits);
    return credits.filter(credit => !credit.deletedAt).map(credit => portfolioRow(credit, context, numbers));
}

/** "Em curso hoje": créditos com dinheiro na rua (ativos, em atraso, reestruturados e em contencioso). */
export const IN_PORTFOLIO: CreditStage[] = ['ativo', 'em_atraso', 'reestruturado', 'contencioso'];

// ── Indicadores da Carteira ──────────────────────────────────────────────────────

export type PortfolioKpis = {
    activeMinor: number; activeCount: number;
    overdueMinor: number; overdueCount: number; par30: number | null;
    dueSoonCount: number; dueSoonMinor: number;
    moraMinor: number; defaultRate: number | null; futureInterestMinor: number;
};

export function portfolioKpis(rows: PortfolioRow[], installments: InstallmentRow[], now: Date = new Date()): PortfolioKpis {
    const today = luandaDateKey(now);
    const limit = luandaDateKey(new Date(now.getTime() + 7 * DAY));
    const book = rows.filter(row => IN_PORTFOLIO.includes(row.stage));
    const active = book.reduce((sum, row) => sum + row.outstandingMinor, 0);
    const overdue = book.filter(row => row.daysOverdue > 0);
    const over30 = book.filter(row => row.daysOverdue > 30).reduce((sum, row) => sum + row.outstandingMinor, 0);
    const over90 = book.filter(row => row.daysOverdue > 90).reduce((sum, row) => sum + row.outstandingMinor, 0);
    const ids = new Set(book.map(row => row.id));
    const soon = installments.filter(item => ids.has(item.creditId) && real(item)
        && (num(item.principalMinor) + num(item.interestMinor)) > (num(item.paidPrincipalMinor) + num(item.paidInterestMinor))
        && luandaDateKey(item.dueDate) >= today && luandaDateKey(item.dueDate) <= limit);
    return {
        activeMinor: active, activeCount: book.length,
        overdueMinor: overdue.reduce((sum, row) => sum + row.overdueMinor, 0), overdueCount: overdue.length,
        par30: active > 0 ? Math.round((over30 / active) * 1000) / 10 : null,
        dueSoonCount: soon.length,
        dueSoonMinor: soon.reduce((sum, item) => sum + (num(item.principalMinor) + num(item.interestMinor)) - (num(item.paidPrincipalMinor) + num(item.paidInterestMinor)), 0),
        moraMinor: book.reduce((sum, row) => sum + row.moraMinor, 0),
        defaultRate: active > 0 ? Math.round((over90 / active) * 1000) / 10 : null,
        futureInterestMinor: book.reduce((sum, row) => sum + row.interestOutstandingMinor, 0),
    };
}

// ── Valores de um período (a mesma fonte em Créditos, Pagamentos e Contabilidade) ─

export type PeriodFigures = {
    grantedCount: number; grantedClients: number; grantedMinor: number;
    disbursedMinor: number; contractedInterestMinor: number;
    received: RowTotals; receivedInterestMinor: number;
    paidOffCount: number; outstandingMinor: number;
};

/**
 * Valores de um período: concedidos (pelo mês de competência), desembolsado (lançamentos de desembolso do
 * razão), recebido (as mesmas linhas e totais da página de Pagamentos) e liquidados no período.
 */
export function periodFigures(input: { rows: PortfolioRow[]; credits: Credit[]; payments: Payment[]; entries: AccountingEntry[]; clients?: Client[]; range: KeyRange }): PeriodFigures {
    const granted = input.rows.filter(row => !['pedido', 'em_analise', 'rejeitado', 'cancelado'].includes(row.stage) && inMonthRange(row.competenceMonth, input.range));
    const paymentRows = buildPaymentRows({ payments: input.payments.filter(payment => !payment.deletedAt), credits: input.credits, clients: input.clients || [], users: [] });
    const received = sumRows(paymentRows.filter(row => row.status === 'confirmed' && inKeyRange(row.valueDateKey, input.range)));
    const disbursed = input.entries.filter(entry => entry.type === 'disbursement' && inKeyRange(luandaDateKey(entry.timestamp), input.range))
        .reduce((sum, entry) => sum + (entry.amountTotalMinor ?? toMinor(entry.amountTotal)), 0);
    return {
        grantedCount: granted.length, grantedClients: new Set(granted.map(row => row.clientId)).size, grantedMinor: granted.reduce((sum, row) => sum + row.grantedMinor, 0),
        disbursedMinor: disbursed, contractedInterestMinor: granted.reduce((sum, row) => sum + row.contractedInterestMinor, 0),
        received, receivedInterestMinor: toMinor(received.interest) + toMinor(received.late),
        paidOffCount: input.rows.filter(row => row.paidOffKey && inKeyRange(row.paidOffKey, input.range)).length,
        outstandingMinor: granted.reduce((sum, row) => sum + row.outstandingMinor, 0),
    };
}

const inMonthRange = (month: string, range: KeyRange) => !range || (month >= range.start.slice(0, 7) && month <= range.end.slice(0, 7));

/** Visão anual: meses × indicadores. "Em atraso" = prestações com vencimento no mês que continuam por pagar. */
export function annualTable(input: { rows: PortfolioRow[]; credits: Credit[]; payments: Payment[]; entries: AccountingEntry[]; installments: InstallmentRow[]; clients?: Client[]; year: number; now?: Date }) {
    const today = luandaDateKey(input.now || new Date());
    const months = Array.from({ length: 12 }, (_, index) => {
        const month = `${input.year}-${String(index + 1).padStart(2, '0')}`;
        const last = new Date(Date.UTC(input.year, index + 1, 0)).getUTCDate();
        const range = { start: `${month}-01`, end: `${month}-${String(last).padStart(2, '0')}` };
        const figures = periodFigures({ ...input, range });
        const overdue = input.installments.filter(item => real(item) && luandaDateKey(item.dueDate).startsWith(month) && luandaDateKey(item.dueDate) < today)
            .reduce((sum, item) => sum + Math.max(0, (num(item.principalMinor) + num(item.interestMinor)) - (num(item.paidPrincipalMinor) + num(item.paidInterestMinor))), 0);
        return { month, index, grantedCount: figures.grantedCount, grantedMinor: figures.grantedMinor, disbursedMinor: figures.disbursedMinor,
            receivedMinor: toMinor(figures.received.total), interestMinor: figures.receivedInterestMinor, overdueMinor: overdue };
    });
    const total = months.reduce((sum, month) => ({
        grantedCount: sum.grantedCount + month.grantedCount, grantedMinor: sum.grantedMinor + month.grantedMinor, disbursedMinor: sum.disbursedMinor + month.disbursedMinor,
        receivedMinor: sum.receivedMinor + month.receivedMinor, interestMinor: sum.interestMinor + month.interestMinor, overdueMinor: sum.overdueMinor + month.overdueMinor,
    }), { grantedCount: 0, grantedMinor: 0, disbursedMinor: 0, receivedMinor: 0, interestMinor: 0, overdueMinor: 0 });
    return { months, total };
}

/** Ponto de cada mês no seletor: verde sem atrasos, laranja com prestações em atraso, cinzento sem operações. */
export function monthDots(rows: PortfolioRow[], installments: InstallmentRow[], year: number, now: Date = new Date()): Array<'green' | 'orange' | 'grey' | null> {
    const today = luandaDateKey(now);
    const currentMonth = today.slice(0, 7);
    return Array.from({ length: 12 }, (_, index) => {
        const month = `${year}-${String(index + 1).padStart(2, '0')}`;
        if (month > currentMonth) return null;
        const granted = rows.filter(row => row.competenceMonth === month);
        const credits = new Set(granted.map(row => row.id));
        const overdue = installments.some(item => real(item) && (credits.has(item.creditId) || luandaDateKey(item.dueDate).startsWith(month))
            && luandaDateKey(item.dueDate) < today && (num(item.principalMinor) + num(item.interestMinor)) > (num(item.paidPrincipalMinor) + num(item.paidInterestMinor)));
        if (!granted.length && !installments.some(item => luandaDateKey(item.dueDate).startsWith(month))) return 'grey';
        return overdue ? 'orange' : 'green';
    });
}

// ── Alertas (Parte I) ────────────────────────────────────────────────────────────

export type CreditAlert = { id: string; kind: 'due_today' | 'due_soon' | 'overdue_today' | 'aging_30' | 'aging_60' | 'aging_90' | 'promise_broken'; row: PortfolioRow; label: string; detail: string };

export function creditAlerts(rows: PortfolioRow[], installments: InstallmentRow[], brokenPromises: Array<{ creditId: string; promisedDate?: string | null; amountMinor?: number | null }>, now: Date = new Date()): CreditAlert[] {
    const today = luandaDateKey(now);
    const in3 = luandaDateKey(new Date(now.getTime() + 3 * DAY));
    const byId = new Map(rows.map(row => [row.id, row]));
    const alerts: CreditAlert[] = [];
    for (const item of installments) {
        const row = byId.get(item.creditId);
        if (!row || !IN_PORTFOLIO.includes(row.stage) || !real(item)) continue;
        const owed = (num(item.principalMinor) + num(item.interestMinor)) - (num(item.paidPrincipalMinor) + num(item.paidInterestMinor));
        if (owed <= 0) continue;
        const due = luandaDateKey(item.dueDate);
        if (due === today) alerts.push({ id: `today:${item.id}`, kind: 'due_today', row, label: 'Vence hoje', detail: `${item.installmentNumber}.ª prestação · ${(owed / 100).toLocaleString('pt-AO', { minimumFractionDigits: 2 })} Kz` });
        else if (due > today && due <= in3) alerts.push({ id: `soon:${item.id}`, kind: 'due_soon', row, label: `Vence a ${due.split('-').reverse().join('/')}`, detail: `${item.installmentNumber}.ª prestação · ${(owed / 100).toLocaleString('pt-AO', { minimumFractionDigits: 2 })} Kz` });
    }
    for (const row of rows) {
        if (!IN_PORTFOLIO.includes(row.stage)) continue;
        if (row.daysOverdue === 1) alerts.push({ id: `late:${row.id}`, kind: 'overdue_today', row, label: 'Entrou em atraso hoje', detail: `${(row.overdueMinor / 100).toLocaleString('pt-AO', { minimumFractionDigits: 2 })} Kz em atraso` });
        for (const [days, kind] of [[31, 'aging_30'], [61, 'aging_60'], [91, 'aging_90']] as const) {
            if (row.daysOverdue === days) alerts.push({ id: `${kind}:${row.id}`, kind, row, label: `Passou ${days - 1} dias de atraso`, detail: `${row.daysOverdue} dias · mora ${(row.moraMinor / 100).toLocaleString('pt-AO', { minimumFractionDigits: 2 })} Kz` });
        }
    }
    for (const promise of brokenPromises) {
        const row = byId.get(promise.creditId);
        if (row && IN_PORTFOLIO.includes(row.stage)) alerts.push({ id: `promise:${promise.creditId}:${promise.promisedDate}`, kind: 'promise_broken', row, label: 'Promessa de pagamento falhada', detail: `Prometido para ${String(promise.promisedDate || '').split('-').reverse().join('/')}` });
    }
    return alerts;
}

export const todayKey = luandaTodayKey;
