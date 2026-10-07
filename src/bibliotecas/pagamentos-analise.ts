// Regras da página de Pagamentos sem interface: linhas da tabela (uma por pagamento), filtros, indicadores do
// período com variação face ao período anterior, séries dos gráficos, agrupamentos, validação da importação e
// dados dos relatórios. Valores em Kz; datas sempre na hora de Angola (data-valor).
import type { Credit, Client, Payment, PaymentMethod } from '@/tipos/credito';
import { addDaysToKey, daysBetweenKeys, luandaDateKey, luandaTodayKey } from './fuso-angola';
import { MONTH_LONG, MONTH_SHORT, toDateKey, type PeriodRange, type PeriodSelection } from './periodos';

// ── Métodos e estados ────────────────────────────────────────────────────────────────
export const PAYMENT_METHODS: Record<PaymentMethod, { label: string; proofRequired: boolean; needsValidation: boolean }> = {
    cash: { label: 'Numerário', proofRequired: false, needsValidation: false },
    transfer: { label: 'Transferência bancária', proofRequired: true, needsValidation: true },
    deposit: { label: 'Depósito bancário', proofRequired: true, needsValidation: true },
    multicaixa: { label: 'Multicaixa Express', proofRequired: false, needsValidation: false },
    tpa: { label: 'TPA (cartão)', proofRequired: false, needsValidation: false },
    reference: { label: 'Referência de pagamento', proofRequired: false, needsValidation: false },
};
export const methodLabel = (method?: string | null) => PAYMENT_METHODS[method as PaymentMethod]?.label || (method ? String(method) : '—');

export const PAYMENT_STATUS: Record<Payment['status'], { label: string; variant: 'success' | 'warning' | 'destructive' }> = {
    confirmed: { label: 'Confirmado', variant: 'success' },
    pending: { label: 'Pendente de validação', variant: 'warning' },
    cancelled: { label: 'Anulado', variant: 'destructive' },
};

/** Texto livre (Excel, pesquisa) → método. */
export function parseMethod(value: unknown): PaymentMethod | null {
    const text = String(value ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
    if (!text) return 'cash';
    if (/^(cash|numerario|dinheiro)/.test(text)) return 'cash';
    if (/^(transfer|transferencia)/.test(text)) return 'transfer';
    if (/^(deposit|deposito)/.test(text)) return 'deposit';
    if (/^(multicaixa|mcx|express)/.test(text)) return 'multicaixa';
    if (/^(tpa|cartao|card|pos)/.test(text)) return 'tpa';
    if (/^(reference|referencia|ref)/.test(text)) return 'reference';
    return null;
}

export const minor = (value: number) => Math.round((Number(value) || 0) * 100);
export const fromMinor = (value: number) => Math.round(Number(value) || 0) / 100;
const round2 = (value: number) => Math.round(value * 100) / 100;

/** Recibo apresentado: RC 2026/000123. */
export const receiptLabel = (payment: Pick<Payment, 'receiptYear' | 'receiptSeq'>) =>
    payment.receiptYear && payment.receiptSeq ? `RC ${payment.receiptYear}/${String(payment.receiptSeq).padStart(6, '0')}` : '';

// ── Contratos ─────────────────────────────────────────────────────────────────────────
/**
 * Número curto de cada contrato (CR-2026-0001): sequência por ano de criação, pela ordem de criação. Os
 * créditos apagados entram na contagem para os números nunca mudarem.
 */
export function contractNumbers(credits: Array<Pick<Credit, 'id' | 'createdAt' | 'startDate'>>): Map<string, string> {
    const byYear = new Map<number, Array<{ id: string; time: number }>>();
    for (const credit of credits) {
        const time = new Date(credit.createdAt || credit.startDate || 0).getTime() || 0;
        const year = Number(luandaDateKey(time || Date.now()).slice(0, 4));
        if (!byYear.has(year)) byYear.set(year, []);
        byYear.get(year)!.push({ id: credit.id, time });
    }
    const numbers = new Map<string, string>();
    for (const [year, list] of byYear) {
        list.sort((a, b) => a.time - b.time || a.id.localeCompare(b.id));
        list.forEach((item, index) => numbers.set(item.id, `CR-${year}-${String(index + 1).padStart(4, '0')}`));
    }
    return numbers;
}

// ── Linhas da tabela ─────────────────────────────────────────────────────────────────
export type InstallmentImputation = { n: number; principalMinor: number; interestMinor: number; lateMinor: number; settled?: boolean };

export type PaymentRow = {
    id: string;
    payment: Payment;
    receipt: string;
    valueDateKey: string;
    registeredAt: string;
    clientId: string;
    clientName: string;
    clientPhone: string;
    creditId: string;
    contract: string;
    installments: InstallmentImputation[];
    installmentsLabel: string;
    principal: number;
    interest: number;
    late: number;
    /** Imposto do Selo, comissões e outros encargos (0 enquanto o pagamento não os cobrar). */
    other: number;
    total: number;
    balanceAfter: number | null;
    method: PaymentMethod;
    methodLabel: string;
    operator: string;
    operatorId: string;
    status: Payment['status'];
    statusLabel: string;
    managerId: string;
    managerName: string;
    product: string;
    reference: string;
    batchId: string;
};

export const productOf = (client?: Pick<Client, 'clientCategory' | 'clientType'> | null) => {
    if (client?.clientType === 'EMPRESA') return 'Crédito a empresas';
    if (client?.clientCategory === 'APOSENTADO') return 'Crédito a aposentados';
    if (client?.clientCategory === 'ESTRANGEIRO') return 'Crédito a estrangeiros';
    return 'Crédito pessoal';
};

export function parseImputation(value?: string | null): InstallmentImputation[] {
    if (!value) return [];
    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed.filter(item => item && Number.isFinite(Number(item.n))) : [];
    } catch { return []; }
}

export function buildPaymentRows(input: {
    payments: Payment[];
    credits: Credit[];
    clients: Client[];
    users: Array<{ id: string; name: string }>;
    numbers?: Map<string, string>;
}): PaymentRow[] {
    const numbers = input.numbers || contractNumbers(input.credits);
    const credits = new Map(input.credits.map(credit => [credit.id, credit]));
    const clients = new Map(input.clients.map(client => [client.id, client]));
    const users = new Map(input.users.map(user => [user.id, user.name]));
    return input.payments.map(payment => {
        const credit = credits.get(payment.creditId);
        const client = credit ? clients.get(credit.clientId) : undefined;
        const installments = parseImputation(payment.allocationDetail);
        const principal = round2(Number(payment.allocatedToPrincipal) || 0);
        const interest = round2(Number(payment.allocatedToInterest) || 0);
        const late = round2(Number(payment.allocatedToLateInterest) || 0);
        const total = round2(Number(payment.amount) || 0);
        const managerId = String(client?.usuario_id || credit?.usuario_id || '');
        return {
            id: payment.id,
            payment,
            receipt: receiptLabel(payment),
            valueDateKey: luandaDateKey(payment.paymentDate),
            registeredAt: payment.registeredAt ? new Date(payment.registeredAt).toISOString() : new Date(payment.paymentDate).toISOString(),
            clientId: credit?.clientId || '',
            clientName: payment.clientName || credit?.clientName || '—',
            clientPhone: client?.phone || '',
            creditId: payment.creditId,
            contract: numbers.get(payment.creditId) || payment.creditId.slice(0, 8).toUpperCase(),
            installments,
            installmentsLabel: installments.length ? installments.map(item => `${item.n}.ª`).join(', ') : '—',
            principal, interest, late,
            // Pendentes ainda não estão imputados: o valor todo fica em "outros" até à validação.
            other: payment.status === 'pending' ? 0 : round2(total - principal - interest - late),
            total,
            balanceAfter: payment.balanceAfterMinor === null || payment.balanceAfterMinor === undefined ? null : fromMinor(Number(payment.balanceAfterMinor)),
            method: (payment.method || 'cash') as PaymentMethod,
            methodLabel: methodLabel(payment.method),
            operator: payment.processedBy || '—',
            operatorId: String(payment.usuario_id || ''),
            status: payment.status,
            statusLabel: PAYMENT_STATUS[payment.status]?.label || payment.status,
            managerId,
            managerName: users.get(managerId) || credit?.requestedBy || '—',
            product: productOf(client),
            reference: payment.reference || '',
            batchId: payment.batchId || '',
        };
    });
}

// ── Períodos (hora de Angola) ────────────────────────────────────────────────────────
export type KeyRange = { start: string; end: string } | null;

/** O período do seletor (datas de calendário) em chaves AAAA-MM-DD; null = todo o período. */
export const rangeKeys = (range: PeriodRange): KeyRange =>
    range.start && range.end ? { start: toDateKey(range.start), end: toDateKey(range.end) } : null;

export const inKeyRange = (key: string, range: KeyRange) => !!key && (!range || (key >= range.start && key <= range.end));

/** Período imediatamente anterior, com a mesma duração (mês anterior, trimestre anterior, etc.). */
export function previousKeyRange(selection: PeriodSelection, range: KeyRange): KeyRange {
    if (!range) return null;
    const shiftMonths = (months: number) => {
        const [y, m] = range.start.split('-').map(Number);
        const start = new Date(Date.UTC(y, m - 1 - months, 1));
        const end = new Date(Date.UTC(y, m - 1, 0));
        const key = (date: Date) => date.toISOString().slice(0, 10);
        return { start: key(start), end: key(end) };
    };
    switch (selection.kind) {
        case 'month': return shiftMonths(1);
        case 'quarter': return shiftMonths(3);
        case 'semester': return shiftMonths(6);
        case 'year': return shiftMonths(12);
        default: {
            const length = daysBetweenKeys(range.start, range.end) + 1;
            return { start: addDaysToKey(range.start, -length), end: addDaysToKey(range.start, -1) };
        }
    }
}

/** O mesmo período um ano antes. */
export const sameRangeLastYear = (range: KeyRange): KeyRange => range ? {
    start: `${Number(range.start.slice(0, 4)) - 1}${range.start.slice(4)}`,
    end: `${Number(range.end.slice(0, 4)) - 1}${range.end.slice(4)}`.replace(/-02-29$/, '-02-28'),
} : null;

// ── Filtros ───────────────────────────────────────────────────────────────────────────
export type PaymentFilters = {
    methods: string[];
    statuses: string[];
    operators: string[];
    managers: string[];
    products: string[];
    clientId: string;
    creditId: string;
    minAmount: number | null;
    maxAmount: number | null;
    onlyLate: boolean;
    search: string;
};

export const EMPTY_FILTERS: PaymentFilters = {
    methods: [], statuses: [], operators: [], managers: [], products: [], clientId: '', creditId: '',
    minAmount: null, maxAmount: null, onlyLate: false, search: '',
};

export type CardFilter = 'all' | 'collected' | 'interest' | 'late' | 'principal' | 'pending' | 'cancelled';

const normalize = (value: string) => value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

export function matchesFilters(row: PaymentRow, filters: PaymentFilters): boolean {
    if (filters.methods.length && !filters.methods.includes(row.method)) return false;
    if (filters.statuses.length && !filters.statuses.includes(row.status)) return false;
    if (filters.operators.length && !filters.operators.includes(row.operator)) return false;
    if (filters.managers.length && !filters.managers.includes(row.managerId || row.managerName)) return false;
    if (filters.products.length && !filters.products.includes(row.product)) return false;
    if (filters.clientId && row.clientId !== filters.clientId) return false;
    if (filters.creditId && row.creditId !== filters.creditId) return false;
    if (filters.minAmount !== null && row.total < filters.minAmount) return false;
    if (filters.maxAmount !== null && row.total > filters.maxAmount) return false;
    if (filters.onlyLate && !(row.late > 0)) return false;
    const term = normalize(filters.search.trim());
    if (term) {
        const haystack = normalize([row.receipt, row.id, row.reference, row.clientName, row.contract, row.creditId].join(' '));
        if (!haystack.includes(term)) return false;
    }
    return true;
}

export const matchesCard = (row: PaymentRow, card: CardFilter) => card === 'all'
    || (card === 'collected' && row.status === 'confirmed')
    || (card === 'interest' && row.status === 'confirmed' && row.interest > 0)
    || (card === 'late' && row.status === 'confirmed' && row.late > 0)
    || (card === 'principal' && row.status === 'confirmed' && row.principal > 0)
    || (card === 'pending' && row.status === 'pending')
    || (card === 'cancelled' && row.status === 'cancelled');

/** Etiquetas dos filtros activos (removíveis). */
export function activeFilterChips(filters: PaymentFilters, labels: { client?: string; contract?: string; manager?: (id: string) => string } = {}) {
    const chips: Array<{ key: string; label: string; clear: Partial<PaymentFilters> }> = [];
    filters.methods.forEach(method => chips.push({ key: `m:${method}`, label: `Método: ${methodLabel(method)}`, clear: { methods: filters.methods.filter(item => item !== method) } }));
    filters.statuses.forEach(status => chips.push({ key: `s:${status}`, label: `Estado: ${PAYMENT_STATUS[status as Payment['status']]?.label || status}`, clear: { statuses: filters.statuses.filter(item => item !== status) } }));
    filters.operators.forEach(operator => chips.push({ key: `o:${operator}`, label: `Operador: ${operator}`, clear: { operators: filters.operators.filter(item => item !== operator) } }));
    filters.managers.forEach(manager => chips.push({ key: `g:${manager}`, label: `Gestor: ${labels.manager?.(manager) || manager}`, clear: { managers: filters.managers.filter(item => item !== manager) } }));
    filters.products.forEach(product => chips.push({ key: `p:${product}`, label: `Produto: ${product}`, clear: { products: filters.products.filter(item => item !== product) } }));
    if (filters.clientId) chips.push({ key: 'client', label: `Cliente: ${labels.client || filters.clientId}`, clear: { clientId: '' } });
    if (filters.creditId) chips.push({ key: 'contract', label: `Contrato: ${labels.contract || filters.creditId}`, clear: { creditId: '' } });
    if (filters.minAmount !== null) chips.push({ key: 'min', label: `Valor ≥ ${formatKz(filters.minAmount)}`, clear: { minAmount: null } });
    if (filters.maxAmount !== null) chips.push({ key: 'max', label: `Valor ≤ ${formatKz(filters.maxAmount)}`, clear: { maxAmount: null } });
    if (filters.onlyLate) chips.push({ key: 'late', label: 'Só com juros de mora', clear: { onlyLate: false } });
    if (filters.search.trim()) chips.push({ key: 'search', label: `Pesquisa: «${filters.search.trim()}»`, clear: { search: '' } });
    return chips;
}

/** Valor em Kz com espaço nos milhares e vírgula decimal (igual nos PDF, no Excel e no ecrã). */
export const formatKz = (value: number) => {
    const fixed = (Math.round((Number(value) || 0) * 100) / 100).toFixed(2);
    const [int, dec] = fixed.replace('-', '').split('.');
    return `${Number(value) < 0 ? '-' : ''}${int.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')},${dec} Kz`;
};

// ── Totais e indicadores ─────────────────────────────────────────────────────────────
export type RowTotals = { count: number; principal: number; interest: number; late: number; other: number; total: number };

export function sumRows(rows: PaymentRow[]): RowTotals {
    const totals = rows.reduce((sum, row) => ({
        count: sum.count + 1,
        principal: sum.principal + minor(row.principal), interest: sum.interest + minor(row.interest),
        late: sum.late + minor(row.late), other: sum.other + minor(row.other), total: sum.total + minor(row.total),
    }), { count: 0, principal: 0, interest: 0, late: 0, other: 0, total: 0 });
    return { count: totals.count, principal: fromMinor(totals.principal), interest: fromMinor(totals.interest), late: fromMinor(totals.late), other: fromMinor(totals.other), total: fromMinor(totals.total) };
}

export type ScheduleItem = {
    creditId: string;
    clientId: string;
    clientName: string;
    number: number;
    dueDate: string;
    principalMinor: number;
    interestMinor: number;
    lateInterestMinor: number;
    paidPrincipalMinor: number;
    paidInterestMinor: number;
    paidLateInterestMinor: number;
};

export type MissingInstallment = {
    creditId: string; clientId: string; clientName: string; number: number; dueDateKey: string; daysLate: number;
    missing: number; late: number; phone: string; manager: string; contract: string;
};

export type PeriodKpis = {
    collected: number; count: number; expected: number; rate: number | null;
    interest: number; late: number; principal: number; other: number; average: number;
    pendingAmount: number; pendingCount: number; cancelledAmount: number; cancelledCount: number;
    missingAmount: number; missingClients: number; missing: MissingInstallment[];
    /** Pagamentos em que capital + juros + mora + outros não somam o valor pago. */
    inconsistent: PaymentRow[];
};

export function computeKpis(rows: PaymentRow[], schedule: ScheduleItem[], range: KeyRange, context: {
    today?: string; phones?: Map<string, string>; managers?: Map<string, string>; numbers?: Map<string, string>;
} = {}): PeriodKpis {
    const today = context.today || luandaTodayKey();
    const inPeriod = rows.filter(row => inKeyRange(row.valueDateKey, range));
    const confirmed = inPeriod.filter(row => row.status === 'confirmed');
    const pending = inPeriod.filter(row => row.status === 'pending');
    const cancelled = inPeriod.filter(row => row.status === 'cancelled');
    const totals = sumRows(confirmed);
    const due = schedule.filter(item => inKeyRange(luandaDateKey(item.dueDate), range));
    const expectedMinor = due.reduce((sum, item) => sum + item.principalMinor + item.interestMinor, 0);
    const missing: MissingInstallment[] = due.map(item => {
        const dueDateKey = luandaDateKey(item.dueDate);
        const owedMinor = item.principalMinor + item.interestMinor + item.lateInterestMinor
            - item.paidPrincipalMinor - item.paidInterestMinor - item.paidLateInterestMinor;
        return {
            creditId: item.creditId, clientId: item.clientId, clientName: item.clientName, number: item.number, dueDateKey,
            daysLate: Math.max(0, daysBetweenKeys(dueDateKey, today)), missing: fromMinor(Math.max(0, owedMinor)),
            late: fromMinor(Math.max(0, item.lateInterestMinor - item.paidLateInterestMinor)),
            phone: context.phones?.get(item.clientId) || '', manager: context.managers?.get(item.clientId) || '',
            contract: context.numbers?.get(item.creditId) || item.creditId.slice(0, 8).toUpperCase(),
        };
    }).filter(item => item.dueDateKey < today && item.missing > 0.004)
        .sort((a, b) => b.daysLate - a.daysLate || b.missing - a.missing);
    const expected = fromMinor(expectedMinor);
    const pendingTotals = sumRows(pending);
    const cancelledTotals = sumRows(cancelled);
    return {
        collected: totals.total, count: totals.count, expected,
        rate: expected > 0 ? Math.round((totals.total / expected) * 10_000) / 100 : null,
        interest: totals.interest, late: totals.late, principal: totals.principal, other: totals.other,
        average: totals.count ? Math.round((totals.total / totals.count) * 100) / 100 : 0,
        pendingAmount: pendingTotals.total, pendingCount: pendingTotals.count,
        cancelledAmount: cancelledTotals.total, cancelledCount: cancelledTotals.count,
        missingAmount: fromMinor(missing.reduce((sum, item) => sum + minor(item.missing), 0)),
        missingClients: new Set(missing.map(item => item.clientId)).size,
        missing,
        inconsistent: confirmed.filter(row => Math.abs(minor(row.principal) + minor(row.interest) + minor(row.late) + minor(row.other) - minor(row.total)) > 0
            || minor(row.other) !== 0),
    };
}

/** Variação percentual face ao período anterior (null quando não há base de comparação). */
export const variation = (current: number, previous: number): number | null =>
    previous ? Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10 : current ? null : 0;

export const collectionRateTone = (rate: number | null) => rate === null ? 'neutral' : rate >= 95 ? 'good' : rate >= 80 ? 'warning' : 'bad';

// ── Gráficos ──────────────────────────────────────────────────────────────────────────
export function dailySeries(rows: PaymentRow[], schedule: ScheduleItem[], range: KeyRange) {
    if (!range) return [];
    const days = Math.min(400, daysBetweenKeys(range.start, range.end) + 1);
    const collected = new Map<string, number>();
    const expected = new Map<string, number>();
    for (const row of rows) if (row.status === 'confirmed' && inKeyRange(row.valueDateKey, range)) collected.set(row.valueDateKey, (collected.get(row.valueDateKey) || 0) + minor(row.total));
    for (const item of schedule) {
        const key = luandaDateKey(item.dueDate);
        if (inKeyRange(key, range)) expected.set(key, (expected.get(key) || 0) + item.principalMinor + item.interestMinor);
    }
    let cumulative = 0;
    let cumulativeExpected = 0;
    return Array.from({ length: days }, (_, index) => {
        const key = addDaysToKey(range.start, index);
        cumulative += collected.get(key) || 0;
        cumulativeExpected += expected.get(key) || 0;
        return {
            key, label: `${key.slice(8, 10)}/${key.slice(5, 7)}`,
            collected: fromMinor(collected.get(key) || 0), expected: fromMinor(expected.get(key) || 0),
            cumulative: fromMinor(cumulative), cumulativeExpected: fromMinor(cumulativeExpected),
        };
    });
}

export function methodBreakdown(rows: PaymentRow[]) {
    const map = new Map<string, { method: string; label: string; amount: number; count: number }>();
    for (const row of rows) {
        if (row.status !== 'confirmed') continue;
        const item = map.get(row.method) || { method: row.method, label: row.methodLabel, amount: 0, count: 0 };
        item.amount = round2(item.amount + row.total);
        item.count += 1;
        map.set(row.method, item);
    }
    return [...map.values()].sort((a, b) => b.amount - a.amount);
}

export function monthlyEvolution(rows: PaymentRow[], schedule: ScheduleItem[], endMonthKey: string, months = 12) {
    const [endYear, endMonth] = endMonthKey.split('-').map(Number);
    return Array.from({ length: months }, (_, index) => {
        const date = new Date(Date.UTC(endYear, endMonth - 1 - (months - 1 - index), 1));
        const monthKey = date.toISOString().slice(0, 7);
        const range = { start: `${monthKey}-01`, end: new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).toISOString().slice(0, 10) };
        const collected = sumRows(rows.filter(row => row.status === 'confirmed' && inKeyRange(row.valueDateKey, range))).total;
        const expected = fromMinor(schedule.filter(item => inKeyRange(luandaDateKey(item.dueDate), range))
            .reduce((sum, item) => sum + item.principalMinor + item.interestMinor, 0));
        return {
            monthKey, label: `${MONTH_SHORT[date.getUTCMonth()]}/${String(date.getUTCFullYear()).slice(2)}`,
            collected, expected, rate: expected > 0 ? Math.round((collected / expected) * 1000) / 10 : null,
        };
    });
}

// ── Agrupamentos ──────────────────────────────────────────────────────────────────────
export type PaymentGroup = { key: string; label: string; sub: string; rows: PaymentRow[]; totals: RowTotals };

export function groupRows(rows: PaymentRow[], by: 'credit' | 'client'): PaymentGroup[] {
    const groups = new Map<string, PaymentGroup>();
    for (const row of rows) {
        const key = by === 'credit' ? row.creditId : (row.clientId || row.clientName);
        const group = groups.get(key) || {
            key, label: by === 'credit' ? row.contract : row.clientName,
            sub: by === 'credit' ? row.clientName : '', rows: [], totals: sumRows([]),
        };
        group.rows.push(row);
        groups.set(key, group);
    }
    return [...groups.values()].map(group => {
        const contracts = new Set(group.rows.map(row => row.contract));
        // Totais do grupo = dinheiro recebido (confirmados); pendentes e anulados aparecem nas linhas, mas não somam.
        return { ...group, sub: by === 'client' ? `${contracts.size} contrato(s)` : group.sub, totals: sumRows(group.rows.filter(row => row.status === 'confirmed')) };
    });
}

// ── Duplicados ────────────────────────────────────────────────────────────────────────
/** Pagamentos do mesmo cliente, com o mesmo valor, na mesma data-valor (excluindo anulados). */
export const sameDayDuplicates = (rows: PaymentRow[], clientId: string, amount: number, dateKey: string) =>
    rows.filter(row => row.status !== 'cancelled' && row.clientId === clientId && row.valueDateKey === dateKey && minor(row.total) === minor(amount));

// ── Importação ────────────────────────────────────────────────────────────────────────
export const IMPORT_COLUMNS = ['Contrato', 'Data-valor (AAAA-MM-DD)', 'Valor (Kz)', 'Método', 'Referência'] as const;

export type ImportPreviewRow = {
    line: number;
    contractText: string;
    creditId: string;
    clientId: string;
    clientName: string;
    dateKey: string;
    amount: number;
    method: PaymentMethod | null;
    reference: string;
    status: 'ok' | 'warning' | 'error';
    messages: string[];
};

export function parseImportDate(value: unknown): string {
    if (value instanceof Date && !Number.isNaN(value.getTime())) return toDateKey(value);
    if (typeof value === 'number' && value > 20000 && value < 80000) {
        const date = new Date(Date.UTC(1899, 11, 30) + Math.round(value) * 86_400_000);
        return date.toISOString().slice(0, 10);
    }
    const text = String(value ?? '').trim();
    let match = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
    if (match) return `${match[1]}-${match[2]}-${match[3]}`;
    match = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(text);
    if (match) return `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
    return '';
}

export function parseImportAmount(value: unknown): number {
    if (typeof value === 'number') return round2(value);
    const text = String(value ?? '').replace(/kz|aoa/gi, '').replace(/\s/g, '').trim();
    if (!text) return NaN;
    // 1.234,56 ou 1 234,56 → 1234.56; 1234.56 também é aceite.
    const normalized = /,\d{1,2}$/.test(text) ? text.replace(/\./g, '').replace(',', '.') : text.replace(/,/g, '');
    const amount = Number(normalized);
    return Number.isFinite(amount) ? round2(amount) : NaN;
}

export function validateImportRows(rawRows: Array<Record<string, unknown>>, context: {
    credits: Array<Pick<Credit, 'id' | 'clientId' | 'clientName' | 'status' | 'currentBalance' | 'accruedInterest' | 'lateInterest' | 'totalDue'>>;
    numbers: Map<string, string>;
    existing: PaymentRow[];
    closedMonths: Set<string>;
    today?: string;
}): ImportPreviewRow[] {
    const today = context.today || luandaTodayKey();
    const byNumber = new Map<string, string>();
    for (const [id, number] of context.numbers) byNumber.set(number.toUpperCase(), id);
    const credits = new Map(context.credits.map(credit => [credit.id, credit]));
    const usedPerCredit = new Map<string, number>();
    const seen = new Set<string>();
    const payable = new Set(['active', 'overdue', 'defaulted', 'renegotiated']);
    const pick = (row: Record<string, unknown>, ...names: string[]) => {
        for (const name of names) for (const key of Object.keys(row)) if (normalize(key).startsWith(normalize(name))) return row[key];
        return undefined;
    };
    return rawRows.map((row, index) => {
        const messages: string[] = [];
        let status: ImportPreviewRow['status'] = 'ok';
        const fail = (message: string) => { status = 'error'; messages.push(message); };
        const warn = (message: string) => { if (status !== 'error') status = 'warning'; messages.push(message); };
        const contractText = String(pick(row, 'Contrato', 'ID Crédito', 'Credito') ?? '').trim();
        const creditId = byNumber.get(contractText.toUpperCase()) || (credits.has(contractText) ? contractText : '');
        const credit = creditId ? credits.get(creditId) : undefined;
        const dateKey = parseImportDate(pick(row, 'Data-valor', 'Data'));
        const amount = parseImportAmount(pick(row, 'Valor', 'Montante'));
        const method = parseMethod(pick(row, 'Método', 'Metodo'));
        const reference = String(pick(row, 'Referência', 'Referencia') ?? '').trim().slice(0, 120);
        if (!contractText) fail('Contrato em falta.');
        else if (!credit) fail(`Contrato inexistente: ${contractText}.`);
        else if (!payable.has(String(credit.status))) fail('O contrato não está activo (pendente, liquidado, rejeitado ou cancelado).');
        if (!dateKey) fail('Data-valor inválida (use AAAA-MM-DD).');
        else if (dateKey > today) fail('A data-valor não pode ser futura.');
        else if (context.closedMonths.has(dateKey.slice(0, 7))) fail(`O mês ${dateKey.slice(5, 7)}/${dateKey.slice(0, 4)} está fechado.`);
        if (!Number.isFinite(amount) || amount <= 0) fail('Valor inválido (tem de ser maior que zero).');
        if (!method) fail('Método desconhecido (numerário, transferência, depósito, Multicaixa, TPA ou referência).');
        if (credit && Number.isFinite(amount) && amount > 0) {
            const debt = minor(Number(credit.currentBalance) + Number(credit.accruedInterest) + Number(credit.lateInterest)) || minor(credit.totalDue);
            const used = usedPerCredit.get(credit.id) || 0;
            if (used + minor(amount) > debt) fail(`O valor excede a dívida do contrato (${formatKz(fromMinor(debt - used))} em aberto).`);
            else usedPerCredit.set(credit.id, used + minor(amount));
        }
        if ((status as ImportPreviewRow['status']) !== 'error' && credit) {
            const key = `${credit.id}|${dateKey}|${minor(amount)}`;
            if (seen.has(key)) warn('Linha duplicada no ficheiro (mesmo contrato, data e valor).');
            seen.add(key);
            if (sameDayDuplicates(context.existing, credit.clientId, amount, dateKey).length) warn('Possível duplicado: já existe um pagamento deste cliente com o mesmo valor neste dia.');
            if (method && PAYMENT_METHODS[method].needsValidation) messages.push('Entra como pendente de validação.');
        }
        return {
            line: index + 2, contractText, creditId, clientId: credit?.clientId || '', clientName: credit?.clientName || '',
            dateKey, amount: Number.isFinite(amount) ? amount : 0, method, reference, status, messages,
        };
    });
}

// ── Dados dos relatórios ─────────────────────────────────────────────────────────────
export function monthlyListData(rows: PaymentRow[], range: KeyRange) {
    const inPeriod = rows.filter(row => inKeyRange(row.valueDateKey, range)).sort((a, b) => a.valueDateKey.localeCompare(b.valueDateKey) || a.registeredAt.localeCompare(b.registeredAt));
    const valid = inPeriod.filter(row => row.status !== 'cancelled');
    const confirmed = valid.filter(row => row.status === 'confirmed');
    const byDay = new Map<string, PaymentRow[]>();
    for (const row of confirmed) byDay.set(row.valueDateKey, [...(byDay.get(row.valueDateKey) || []), row]);
    const byMethod = new Map<string, PaymentRow[]>();
    for (const row of confirmed) byMethod.set(row.methodLabel, [...(byMethod.get(row.methodLabel) || []), row]);
    return {
        rows: valid,
        pending: valid.filter(row => row.status === 'pending'),
        cancelled: inPeriod.filter(row => row.status === 'cancelled'),
        days: [...byDay.entries()].map(([key, list]) => ({ key, totals: sumRows(list) })),
        methods: [...byMethod.entries()].map(([label, list]) => ({ label, totals: sumRows(list) })).sort((a, b) => b.totals.total - a.totals.total),
        totals: sumRows(confirmed),
    };
}

export function cashCloseData(rows: PaymentRow[], range: KeyRange) {
    const confirmed = rows.filter(row => row.status !== 'cancelled' && inKeyRange(row.valueDateKey, range));
    const operators = new Map<string, PaymentRow[]>();
    for (const row of confirmed) operators.set(row.operator, [...(operators.get(row.operator) || []), row]);
    return [...operators.entries()].map(([operator, list]) => ({
        operator,
        methods: methodBreakdown(list.filter(row => row.status === 'confirmed')),
        pending: sumRows(list.filter(row => row.status === 'pending')),
        totals: sumRows(list.filter(row => row.status === 'confirmed')),
        rows: list,
    })).sort((a, b) => b.totals.total - a.totals.total);
}

export function incomeMapData(rows: PaymentRow[], year: number) {
    return MONTH_LONG.map((label, month) => {
        const key = `${year}-${String(month + 1).padStart(2, '0')}`;
        const totals = sumRows(rows.filter(row => row.status === 'confirmed' && row.valueDateKey.startsWith(key)));
        return { month: label, interest: totals.interest, late: totals.late, income: round2(totals.interest + totals.late), principal: totals.principal, count: totals.count };
    });
}

export function clientStatementData(rows: PaymentRow[], filter: { clientId?: string; creditId?: string }) {
    return rows.filter(row => (!filter.creditId || row.creditId === filter.creditId) && (!filter.clientId || row.clientId === filter.clientId))
        .sort((a, b) => a.valueDateKey.localeCompare(b.valueDateKey) || a.registeredAt.localeCompare(b.registeredAt));
}
