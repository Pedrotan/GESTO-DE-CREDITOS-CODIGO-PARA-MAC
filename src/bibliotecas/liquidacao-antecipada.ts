// Liquidação antecipada (total ou parcial) e plano reestruturado. Simulação pura: calcula o que o cliente paga
// hoje (prestações em atraso, juros decorridos até à data, mora e capital antecipado) e o novo plano das
// prestações que ficam, reduzindo a prestação ou o prazo. Os valores das prestações usam o gerador de plano
// existente (`buildInstallmentSchedule`), com o mesmo método de amortização e a mesma taxa do contrato.

import { buildInstallmentSchedule } from '@/bibliotecas/cronograma-prestacoes';
import { luandaDateKey } from '@/bibliotecas/fuso-angola';
import type { InstallmentRow } from '@/bibliotecas/carteira-credito';

export type EarlyMode = 'reduce_installment' | 'reduce_term';
export type PlanItem = { number: number; dueDate: string; principalMinor: number; interestMinor: number; totalMinor: number };

export type EarlySettlement = {
    kind: 'total' | 'partial';
    mode: EarlyMode | null;
    asOfKey: string;
    overdueMinor: number;
    accruedInterestMinor: number;
    moraMinor: number;
    capitalMinor: number;
    payNowMinor: number;
    /** Juros futuros que deixam de ser cobrados por causa da antecipação. */
    interestSavedMinor: number;
    outstandingCapitalMinor: number;
    remainingCapitalMinor: number;
    oldCount: number;
    newCount: number;
    oldInstallmentMinor: number;
    newInstallmentMinor: number;
    newPlan: PlanItem[];
    /** Prestações do plano actual que deixam de existir ou mudam (para o histórico). */
    replacedIds: string[];
};

const num = (value: unknown) => Number(value) || 0;
const owed = (item: InstallmentRow) => (num(item.principalMinor) + num(item.interestMinor)) - (num(item.paidPrincipalMinor) + num(item.paidInterestMinor));
const keyTime = (key: string) => Date.UTC(+key.slice(0, 4), +key.slice(5, 7) - 1, +key.slice(8, 10));

export function simulateEarlySettlement(input: {
    method: 'FLAT' | 'PRICE' | 'SAC' | string;
    annualRatePercent: number;
    startDate: string | Date;
    installments: InstallmentRow[];
    moraMinor: number;
    asOf?: Date;
    kind: 'total' | 'partial';
    capitalMinor?: number;
    mode?: EarlyMode;
}): EarlySettlement {
    const today = luandaDateKey(input.asOf || new Date());
    const schedule = input.installments.filter(item => item.status !== 'cancelled' && (num(item.principalMinor) + num(item.interestMinor)) > 0)
        .sort((a, b) => num(a.installmentNumber) - num(b.installmentNumber));
    const open = schedule.filter(item => owed(item) > 0);
    if (!open.length) throw new Error('Este crédito não tem prestações por pagar.');
    const overdue = open.filter(item => luandaDateKey(item.dueDate) < today);
    const future = open.filter(item => luandaDateKey(item.dueDate) >= today);
    const overdueMinor = overdue.reduce((sum, item) => sum + owed(item), 0);
    const futureCapital = future.reduce((sum, item) => sum + Math.max(0, num(item.principalMinor) - num(item.paidPrincipalMinor)), 0);
    const futureInterest = future.reduce((sum, item) => sum + Math.max(0, num(item.interestMinor) - num(item.paidInterestMinor)), 0);
    const outstandingCapital = open.reduce((sum, item) => sum + Math.max(0, num(item.principalMinor) - num(item.paidPrincipalMinor)), 0);

    // Juros decorridos no período da prestação corrente (da data da anterior até hoje), proporcionais aos dias.
    const current = future[0];
    let fraction = 0;
    let accruedInterest = 0;
    if (current) {
        const index = schedule.findIndex(item => item.id === current.id);
        const previousKey = index > 0 ? luandaDateKey(schedule[index - 1].dueDate) : luandaDateKey(input.startDate);
        const dueKey = luandaDateKey(current.dueDate);
        const span = Math.max(1, (keyTime(dueKey) - keyTime(previousKey)) / 86_400_000);
        fraction = Math.min(1, Math.max(0, (keyTime(today) - keyTime(previousKey)) / 86_400_000 / span));
        accruedInterest = Math.round(Math.max(0, num(current.interestMinor) - num(current.paidInterestMinor)) * fraction);
    }
    const mora = Math.max(0, Math.round(num(input.moraMinor)));
    const oldInstallment = current ? num(current.principalMinor) + num(current.interestMinor) : 0;
    const base = { asOfKey: today, overdueMinor, accruedInterestMinor: accruedInterest, moraMinor: mora, outstandingCapitalMinor: outstandingCapital, oldCount: future.length, oldInstallmentMinor: oldInstallment };

    const capital = input.kind === 'total' ? futureCapital : Math.round(num(input.capitalMinor));
    if (input.kind === 'partial') {
        if (!(capital > 0)) throw new Error('Indique o capital a antecipar.');
        if (capital >= futureCapital) throw new Error('O valor cobre todo o capital por vencer: escolha a liquidação total.');
    }
    if (input.kind === 'total' || capital >= futureCapital) {
        return { ...base, kind: 'total', mode: null, capitalMinor: futureCapital, payNowMinor: overdueMinor + futureCapital + accruedInterest + mora,
            interestSavedMinor: Math.max(0, futureInterest - accruedInterest), remainingCapitalMinor: 0, newCount: 0, newInstallmentMinor: 0, newPlan: [], replacedIds: future.map(item => item.id) };
    }

    const mode: EarlyMode = input.mode || 'reduce_installment';
    const remaining = futureCapital - capital;
    const dates = future.map(item => item.dueDate);
    const method = (['PRICE', 'SAC', 'FLAT'].includes(String(input.method).toUpperCase()) ? String(input.method).toUpperCase() : 'FLAT') as 'PRICE' | 'SAC' | 'FLAT';
    const rate = Math.max(0, num(input.annualRatePercent));
    // Prazo: igual (reduzir prestação) ou o menor número de prestações que mantém a prestação actual.
    let count = future.length;
    if (mode === 'reduce_term') {
        const monthly = rate / 1200;
        const principalPart = current ? Math.max(1, num(current.principalMinor)) : Math.max(1, Math.round(futureCapital / future.length));
        if (method === 'PRICE' && monthly > 0 && oldInstallment > remaining * monthly) count = Math.ceil(-Math.log(1 - (remaining * monthly) / oldInstallment) / Math.log(1 + monthly) - 1e-9);
        else if (method === 'PRICE' && monthly === 0) count = Math.ceil(remaining / Math.max(1, oldInstallment));
        else count = Math.ceil(remaining / principalPart);
        count = Math.min(future.length, Math.max(1, count));
    }
    const remainingInterest = Math.max(0, futureInterest - accruedInterest);
    const flatInterest = Math.round(remainingInterest * (remaining / futureCapital) * (count / future.length));
    const first = new Date(dates[0]);
    const start = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() - 1, first.getUTCDate()));
    const built = buildInstallmentSchedule({ principalMinor: remaining, installments: count, startDate: start, method, annualRatePercent: rate, flatInterestMinor: method === 'FLAT' ? flatInterest : undefined });
    const newPlan: PlanItem[] = built.map((item, index) => {
        // A primeira prestação já pagou hoje os juros decorridos: só cobra a parte restante do período.
        const interest = method !== 'FLAT' && index === 0 ? Math.round(item.interestMinor * (1 - fraction)) : item.interestMinor;
        return { number: index + 1, dueDate: dates[index] || item.dueDate, principalMinor: item.principalMinor, interestMinor: interest, totalMinor: item.principalMinor + interest };
    });
    const newInterest = newPlan.reduce((sum, item) => sum + item.interestMinor, 0);
    return {
        ...base, kind: 'partial', mode, capitalMinor: capital, payNowMinor: overdueMinor + capital + accruedInterest + mora,
        interestSavedMinor: Math.max(0, futureInterest - accruedInterest - newInterest), remainingCapitalMinor: remaining,
        newCount: newPlan.length, newInstallmentMinor: newPlan[0]?.totalMinor || 0, newPlan, replacedIds: future.map(item => item.id),
    };
}

/** Novo plano para uma reestruturação: o capital em dívida reescalonado num novo prazo e taxa. */
export function restructurePlan(input: { outstandingCapitalMinor: number; installments: number; annualRatePercent: number; method: 'FLAT' | 'PRICE' | 'SAC'; firstDueDate: string; flatInterestMinor?: number }): PlanItem[] {
    const first = new Date(input.firstDueDate);
    if (Number.isNaN(first.getTime())) throw new Error('Indique a data da primeira prestação.');
    const start = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() - 1, first.getUTCDate()));
    const flat = input.method === 'FLAT' ? Math.round(input.flatInterestMinor ?? input.outstandingCapitalMinor * input.annualRatePercent / 100) : undefined;
    return buildInstallmentSchedule({ principalMinor: input.outstandingCapitalMinor, installments: input.installments, startDate: start, method: input.method, annualRatePercent: input.annualRatePercent, flatInterestMinor: flat })
        .map(item => ({ number: item.number, dueDate: item.dueDate, principalMinor: item.principalMinor, interestMinor: item.interestMinor, totalMinor: item.totalMinor }));
}
