// Relatórios contabilísticos calculados a partir do razão em partidas dobradas (fonte única de verdade):
// diário, balancete com saldo inicial, razão por conta, demonstração de resultados, fluxo de caixa,
// previsão de recebimentos e indicadores do período. Valores sempre em cêntimos inteiros.

import { CHART_OF_ACCOUNTS, EXPENSE_ACCOUNTS, LIQUID_ACCOUNTS, REVENUE_ACCOUNTS, accountDefinition, naturalBalance } from './plano-contas.ts';

export type LedgerEntryMeta = {
    id: string; timestamp: string; type: string; description?: string | null;
    clientId?: string | null; creditId?: string | null; paymentId?: string | null;
    processedBy?: string | null; usuario_id?: string | null; integrityHash?: string | null; previousHash?: string | null;
    amountTotalMinor?: number | null; amountTotal?: number | null; justification?: string | null;
};
export type LedgerTransactionMeta = { id: string; timestamp: string; type: string; sourceType: string; sourceId: string; description?: string | null; usuario_id?: string | null };
export type LedgerLineRow = { id: string; transactionId: string; account: string; side: 'debit' | 'credit' | string; component: string; amountMinor: number };

export type JournalLine = { id: string; account: string; side: 'debit' | 'credit'; component: string; amountMinor: number };
export type JournalEntry = {
    id: string; sequence: number; timestamp: string; type: string; sourceType: string; sourceId: string;
    description: string; clientId?: string | null; creditId?: string | null; paymentId?: string | null;
    processedBy?: string | null; usuarioId?: string | null; justification?: string | null;
    integrityHash?: string | null; lines: JournalLine[]; totalMinor: number; hasLines: boolean;
};

export type DateRange = { start: Date | null; end: Date | null };

const inRange = (value: string, range: DateRange) => {
    const time = new Date(value).getTime();
    if (Number.isNaN(time)) return false;
    if (range.start && time < range.start.getTime()) return false;
    if (range.end && time > range.end.getTime()) return false;
    return true;
};
const before = (value: string, range: DateRange) => Boolean(range.start) && new Date(value).getTime() < range.start!.getTime();
const signed = (line: { side: string; amountMinor: number }) => (line.side === 'debit' ? 1 : -1) * Number(line.amountMinor);

/** Diário: um registo por lançamento, numerado pela ordem de inserção, com as linhas a débito e a crédito. */
export function buildJournal(entries: LedgerEntryMeta[], transactions: LedgerTransactionMeta[], lines: LedgerLineRow[]): JournalEntry[] {
    const txById = new Map(transactions.map(tx => [tx.id, tx]));
    const linesByTx = new Map<string, JournalLine[]>();
    for (const line of lines) {
        const list = linesByTx.get(line.transactionId) || [];
        list.push({ id: line.id, account: line.account, side: line.side === 'credit' ? 'credit' : 'debit', component: line.component, amountMinor: Number(line.amountMinor) });
        linesByTx.set(line.transactionId, list);
    }
    const seen = new Set<string>();
    const journal: JournalEntry[] = entries.map((entry, index) => {
        seen.add(entry.id);
        const tx = txById.get(entry.id);
        const own = (linesByTx.get(entry.id) || []).sort((a, b) => (a.side === b.side ? 0 : a.side === 'debit' ? -1 : 1));
        return {
            id: entry.id, sequence: index + 1, timestamp: entry.timestamp, type: entry.type,
            sourceType: tx?.sourceType || 'historical', sourceId: tx?.sourceId || entry.paymentId || entry.creditId || entry.id,
            description: entry.description || tx?.description || entry.id,
            clientId: entry.clientId, creditId: entry.creditId, paymentId: entry.paymentId,
            processedBy: entry.processedBy, usuarioId: entry.usuario_id, justification: entry.justification,
            integrityHash: entry.integrityHash, lines: own,
            totalMinor: own.filter(line => line.side === 'debit').reduce((sum, line) => sum + line.amountMinor, 0) || Number(entry.amountTotalMinor ?? Math.round(Number(entry.amountTotal || 0) * 100)),
            hasLines: own.length > 0,
        };
    });
    // Transações do razão sem resumo na cadeia (não deveria acontecer): aparecem no fim para revisão.
    for (const tx of transactions) {
        if (seen.has(tx.id)) continue;
        const own = linesByTx.get(tx.id) || [];
        journal.push({
            id: tx.id, sequence: journal.length + 1, timestamp: tx.timestamp, type: tx.type, sourceType: tx.sourceType, sourceId: tx.sourceId,
            description: tx.description || tx.id, lines: own, usuarioId: tx.usuario_id,
            totalMinor: own.filter(line => line.side === 'debit').reduce((sum, line) => sum + line.amountMinor, 0), hasLines: own.length > 0,
        });
    }
    return journal;
}

export type TrialBalanceRow = {
    account: string; code: string; name: string; accountClass: string; nature: 'debit' | 'credit';
    openingMinor: number; debitMinor: number; creditMinor: number; closingMinor: number;
};

/**
 * Balancete do período: saldo inicial (movimentos anteriores), débitos e créditos do período e saldo
 * final. Os saldos vêm em débito − crédito; a apresentação na natureza da conta faz-se na interface.
 */
export function trialBalanceForPeriod(journal: JournalEntry[], range: DateRange, includeEmpty = false): { rows: TrialBalanceRow[]; totals: { openingDebitMinor: number; openingCreditMinor: number; debitMinor: number; creditMinor: number; closingDebitMinor: number; closingCreditMinor: number }; balanced: boolean } {
    const rows = new Map<string, TrialBalanceRow>();
    const row = (account: string) => {
        let current = rows.get(account);
        if (!current) {
            const def = accountDefinition(account);
            current = { account, code: def.code, name: def.name, accountClass: def.accountClass, nature: def.nature, openingMinor: 0, debitMinor: 0, creditMinor: 0, closingMinor: 0 };
            rows.set(account, current);
        }
        return current;
    };
    if (includeEmpty) for (const def of CHART_OF_ACCOUNTS) row(def.account);
    for (const entry of journal) {
        const isBefore = before(entry.timestamp, range);
        const isIn = inRange(entry.timestamp, range);
        if (!isBefore && !isIn) continue;
        for (const line of entry.lines) {
            const current = row(line.account);
            if (isBefore) current.openingMinor += signed(line);
            else if (line.side === 'debit') current.debitMinor += line.amountMinor;
            else current.creditMinor += line.amountMinor;
        }
    }
    const list = [...rows.values()].map(item => ({ ...item, closingMinor: item.openingMinor + item.debitMinor - item.creditMinor }))
        .sort((a, b) => a.code.localeCompare(b.code, 'pt', { numeric: true }));
    const totals = list.reduce((sum, item) => ({
        openingDebitMinor: sum.openingDebitMinor + Math.max(0, item.openingMinor),
        openingCreditMinor: sum.openingCreditMinor + Math.max(0, -item.openingMinor),
        debitMinor: sum.debitMinor + item.debitMinor,
        creditMinor: sum.creditMinor + item.creditMinor,
        closingDebitMinor: sum.closingDebitMinor + Math.max(0, item.closingMinor),
        closingCreditMinor: sum.closingCreditMinor + Math.max(0, -item.closingMinor),
    }), { openingDebitMinor: 0, openingCreditMinor: 0, debitMinor: 0, creditMinor: 0, closingDebitMinor: 0, closingCreditMinor: 0 });
    const balanced = totals.debitMinor === totals.creditMinor && totals.openingDebitMinor === totals.openingCreditMinor && totals.closingDebitMinor === totals.closingCreditMinor;
    return { rows: list, totals, balanced };
}

export type AccountMovement = { entryId: string; sequence: number; timestamp: string; description: string; type: string; debitMinor: number; creditMinor: number; balanceMinor: number; creditId?: string | null; paymentId?: string | null };

/** Razão de uma conta: saldo inicial e movimentos do período com saldo acumulado (na natureza da conta). */
export function accountLedger(journal: JournalEntry[], account: string, range: DateRange) {
    let opening = 0;
    const movements: AccountMovement[] = [];
    for (const entry of journal) {
        const own = entry.lines.filter(line => line.account === account);
        if (!own.length) continue;
        const net = own.reduce((sum, line) => sum + signed(line), 0);
        if (before(entry.timestamp, range)) { opening += net; continue; }
        if (!inRange(entry.timestamp, range)) continue;
        movements.push({
            entryId: entry.id, sequence: entry.sequence, timestamp: entry.timestamp, description: entry.description, type: entry.type,
            debitMinor: own.filter(line => line.side === 'debit').reduce((sum, line) => sum + line.amountMinor, 0),
            creditMinor: own.filter(line => line.side === 'credit').reduce((sum, line) => sum + line.amountMinor, 0),
            balanceMinor: 0, creditId: entry.creditId, paymentId: entry.paymentId,
        });
    }
    movements.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime() || a.sequence - b.sequence);
    let running = naturalBalance(account, opening);
    for (const movement of movements) {
        running += naturalBalance(account, movement.debitMinor - movement.creditMinor);
        movement.balanceMinor = running;
    }
    return { openingMinor: naturalBalance(account, opening), closingMinor: running, movements };
}

/** Demonstração de resultados do período (proveitos − custos), por conta. */
export function incomeStatement(journal: JournalEntry[], range: DateRange) {
    const revenue = new Map<string, number>();
    const expenses = new Map<string, number>();
    for (const entry of journal) {
        if (!inRange(entry.timestamp, range)) continue;
        for (const line of entry.lines) {
            if (REVENUE_ACCOUNTS.has(line.account)) revenue.set(line.account, (revenue.get(line.account) || 0) - signed(line));
            if (EXPENSE_ACCOUNTS.has(line.account)) expenses.set(line.account, (expenses.get(line.account) || 0) + signed(line));
        }
    }
    const revenueMinor = [...revenue.values()].reduce((sum, value) => sum + value, 0);
    const expensesMinor = [...expenses.values()].reduce((sum, value) => sum + value, 0);
    return {
        revenue: [...revenue.entries()].map(([account, amountMinor]) => ({ account, amountMinor })),
        expenses: [...expenses.entries()].map(([account, amountMinor]) => ({ account, amountMinor })),
        revenueMinor, expensesMinor, resultMinor: revenueMinor - expensesMinor,
    };
}

export type CashFlowCategory = 'customer_principal' | 'customer_interest' | 'customer_late' | 'disbursements' | 'capital' | 'loans' | 'expenses' | 'reversals' | 'transfers' | 'other';
export const CASH_FLOW_LABELS: Record<CashFlowCategory, string> = {
    customer_principal: 'Recebimentos de capital',
    customer_interest: 'Recebimentos de juros',
    customer_late: 'Recebimentos de juros de mora',
    disbursements: 'Desembolsos de crédito',
    capital: 'Entradas de capital',
    loans: 'Financiamentos obtidos',
    expenses: 'Despesas pagas',
    reversals: 'Estornos de pagamentos',
    transfers: 'Transferências internas (caixa ↔ banco)',
    other: 'Outros movimentos',
};

/** Fluxo de caixa do período: entradas e saídas de Caixa/Bancos por natureza, com saldos inicial e final. */
export function cashFlow(journal: JournalEntry[], range: DateRange) {
    const flows = new Map<CashFlowCategory, number>();
    let opening = 0;
    const addFlow = (category: CashFlowCategory, amount: number) => flows.set(category, (flows.get(category) || 0) + amount);
    for (const entry of journal) {
        const liquid = entry.lines.filter(line => LIQUID_ACCOUNTS.has(line.account));
        if (!liquid.length) continue;
        const net = liquid.reduce((sum, line) => sum + signed(line), 0);
        if (before(entry.timestamp, range)) { opening += net; continue; }
        if (!inRange(entry.timestamp, range)) continue;
        if (entry.type === 'transfer') { addFlow('transfers', net); continue; }
        if (entry.type === 'disbursement') { addFlow('disbursements', net); continue; }
        if (entry.type === 'capital_entry') { addFlow('capital', net); continue; }
        if (entry.type === 'loan_received') { addFlow('loans', net); continue; }
        if (entry.type === 'expense' || entry.sourceType === 'expense') { addFlow('expenses', net); continue; }
        if (entry.paymentId) {
            // Divide o valor recebido pelas componentes (as contas do outro lado do lançamento).
            const sign = net >= 0 ? 1 : -1;
            const other = entry.lines.filter(line => !LIQUID_ACCOUNTS.has(line.account));
            const part = (accounts: string[]) => other.filter(line => accounts.includes(line.account)).reduce((sum, line) => sum + line.amountMinor, 0);
            const principal = part(['portfolio', 'revenue_recoveries']);
            const interest = part(['revenue_interest', 'receivable_interest']);
            const late = part(['revenue_late_interest', 'receivable_late_interest']);
            if (entry.type === 'reversal') { addFlow('reversals', net); continue; }
            addFlow('customer_principal', sign * principal);
            addFlow('customer_interest', sign * interest);
            addFlow('customer_late', sign * late);
            const rest = net - sign * (principal + interest + late);
            if (rest) addFlow('other', rest);
            continue;
        }
        addFlow('other', net);
    }
    const items = (Object.keys(CASH_FLOW_LABELS) as CashFlowCategory[])
        .map(category => ({ category, label: CASH_FLOW_LABELS[category], amountMinor: flows.get(category) || 0 }))
        .filter(item => item.amountMinor !== 0);
    const inflowMinor = items.filter(item => item.amountMinor > 0 && item.category !== 'transfers').reduce((sum, item) => sum + item.amountMinor, 0);
    const outflowMinor = items.filter(item => item.amountMinor < 0 && item.category !== 'transfers').reduce((sum, item) => sum - item.amountMinor, 0);
    const netMinor = items.reduce((sum, item) => sum + item.amountMinor, 0);
    return { openingMinor: opening, items, inflowMinor, outflowMinor, netMinor, closingMinor: opening + netMinor };
}

export type InstallmentForecastRow = {
    creditId: string; dueDate: string; principalMinor: number; interestMinor: number; lateInterestMinor?: number | null;
    paidPrincipalMinor?: number | null; paidInterestMinor?: number | null; paidLateInterestMinor?: number | null; status?: string | null;
};

const outstandingOf = (item: InstallmentForecastRow) => Math.max(0,
    Number(item.principalMinor) + Number(item.interestMinor) + Number(item.lateInterestMinor || 0)
    - Number(item.paidPrincipalMinor || 0) - Number(item.paidInterestMinor || 0) - Number(item.paidLateInterestMinor || 0));

/** Previsão de recebimentos: prestações em aberto a vencer nos próximos 7/30/60/90 dias e já vencidas. */
export function receivablesForecast(installments: InstallmentForecastRow[], activeCreditIds: Set<string>, now = new Date()) {
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const day = 24 * 60 * 60 * 1000;
    const open = installments.filter(item => activeCreditIds.has(item.creditId) && item.status !== 'paid' && outstandingOf(item) > 0);
    const overdueMinor = open.filter(item => new Date(item.dueDate).getTime() < today).reduce((sum, item) => sum + outstandingOf(item), 0);
    const horizons = [7, 30, 60, 90].map(days => ({
        days,
        amountMinor: open.filter(item => {
            const due = new Date(item.dueDate).getTime();
            return due >= today && due <= today + days * day;
        }).reduce((sum, item) => sum + outstandingOf(item), 0),
        count: open.filter(item => {
            const due = new Date(item.dueDate).getTime();
            return due >= today && due <= today + days * day;
        }).length,
    }));
    return { overdueMinor, overdueCount: open.filter(item => new Date(item.dueDate).getTime() < today).length, horizons };
}

/** Saldo de uma conta (débito − crédito) até ao fim do período. */
export function balanceAt(journal: JournalEntry[], account: string, end: Date | null) {
    let total = 0;
    for (const entry of journal) {
        if (end && new Date(entry.timestamp).getTime() > end.getTime()) continue;
        for (const line of entry.lines) if (line.account === account) total += signed(line);
    }
    return total;
}

const SHORT_MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

/** Série mensal (últimos `months` meses) de proveitos, custos, resultado, disponibilidades e carteira. */
export function monthlySeries(journal: JournalEntry[], months = 12, now = new Date()) {
    const series = [];
    for (let offset = months - 1; offset >= 0; offset--) {
        const start = new Date(now.getFullYear(), now.getMonth() - offset, 1);
        const end = new Date(now.getFullYear(), now.getMonth() - offset + 1, 0, 23, 59, 59, 999);
        const income = incomeStatement(journal, { start, end });
        series.push({
            key: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`,
            label: `${SHORT_MONTHS[start.getMonth()]} ${String(start.getFullYear()).slice(2)}`,
            revenueMinor: income.revenueMinor,
            expensesMinor: income.expensesMinor,
            resultMinor: income.resultMinor,
            liquidMinor: balanceAt(journal, 'cash', end) + balanceAt(journal, 'bank', end),
            portfolioMinor: balanceAt(journal, 'portfolio', end),
        });
    }
    return series;
}
