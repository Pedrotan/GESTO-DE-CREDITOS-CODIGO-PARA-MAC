import type { JournalEntry } from './relatorios-contabeis.ts';
import { REVENUE_ACCOUNTS, EXPENSE_ACCOUNTS } from './plano-contas.ts';

type CreditGroup = { id: string; amortizationMethod?: string; usuario_id?: string; requestedBy?: string };
type Schedule = { creditId: string; dueDate: string; interestMinor: number; lateInterestMinor?: number };
type Receipt = { creditId: string; paymentDate: string | Date; status: string; deletedAt?: unknown; allocatedToInterestMinor?: number; allocatedToInterest?: number; allocatedToLateInterestMinor?: number; allocatedToLateInterest?: number };
export type ProfitabilityRow = { key: string; credits: number; expectedMinor: number; receivedMinor: number; revenueMinor: number; expenseMinor: number; marginMinor: number };
const dateKey = (date: string | Date) => {
    const value = new Date(date);
    return Number.isNaN(value.getTime()) ? '' : new Date(value.getTime() + 3600000).toISOString().slice(0, 10);
};
export function profitability(credits: CreditGroup[], schedules: Schedule[], payments: Receipt[], journal: JournalEntry[], from: string, to: string, dimension: 'method' | 'agent') {
    if (from > to) throw new Error('Intervalo de datas inválido.');
    const rows = new Map<string, ProfitabilityRow>();
    const creditById = new Map(credits.map(credit => [credit.id, credit]));
    const keyFor = (id?: string | null) => {
        const credit = id ? creditById.get(id) : undefined;
        return !credit ? 'Sem atribuição' : dimension === 'method' ? credit.amortizationMethod || 'Modalidade não registada' : credit.usuario_id || credit.requestedBy || 'Responsável não registado';
    };
    const row = (key: string) => {
        if (!rows.has(key)) rows.set(key, { key, credits: 0, expectedMinor: 0, receivedMinor: 0, revenueMinor: 0, expenseMinor: 0, marginMinor: 0 });
        return rows.get(key)!;
    };
    const inPeriod = (date: string | Date) => { const key = dateKey(date); return !!key && key >= from && key <= to; };
    for (const credit of credits) row(keyFor(credit.id)).credits++;
    for (const installment of schedules) if (inPeriod(installment.dueDate)) row(keyFor(installment.creditId)).expectedMinor += installment.interestMinor + (installment.lateInterestMinor || 0);
    for (const payment of payments) if (!payment.deletedAt && payment.status === 'confirmed' && inPeriod(payment.paymentDate)) {
        row(keyFor(payment.creditId)).receivedMinor += (payment.allocatedToInterestMinor ?? Math.round((payment.allocatedToInterest || 0) * 100)) + (payment.allocatedToLateInterestMinor ?? Math.round((payment.allocatedToLateInterest || 0) * 100));
    }
    for (const entry of journal) if (inPeriod(entry.timestamp)) for (const line of entry.lines) {
        const target = row(keyFor(entry.creditId));
        if (REVENUE_ACCOUNTS.has(line.account)) target.revenueMinor += (line.side === 'credit' ? 1 : -1) * line.amountMinor;
        if (EXPENSE_ACCOUNTS.has(line.account)) target.expenseMinor += (line.side === 'debit' ? 1 : -1) * line.amountMinor;
    }
    return [...rows.values()].map(value => ({ ...value, marginMinor: value.revenueMinor - value.expenseMinor })).sort((a, b) => b.marginMinor - a.marginMinor || a.key.localeCompare(b.key));
}
