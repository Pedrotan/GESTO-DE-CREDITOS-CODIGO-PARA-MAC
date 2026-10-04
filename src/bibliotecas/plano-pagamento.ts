// Plano de pagamento de um crédito: as mesmas regras usadas na emissão (juro simples sobre o capital,
// dividido em prestações mensais iguais, a primeira um mês depois da data do acordo).
import { buildInstallmentSchedule } from './cronograma-prestacoes.ts';
import { tierMonths, type InterestTier } from './taxas-juro.ts';

export type InstallmentStatus = 'paid' | 'partial' | 'overdue' | 'pending';

export type PaymentPlanInstallment = {
    number: number;
    dueDate: string;
    principalMinor: number;
    interestMinor: number;
    totalMinor: number;
    /** Valor que ainda falta pagar depois desta prestação. */
    balanceAfterMinor: number;
    /** Situação real do pagamento (só em créditos já concedidos). */
    paidMinor?: number;
    status?: InstallmentStatus;
    paidAt?: string | null;
};

export type PaymentProgress = {
    paidCount: number;
    partialCount: number;
    overdueCount: number;
    paidMinor: number;
    remainingMinor: number;
    /** Percentagem do total já paga (0-100). */
    percent: number;
    nextDue: PaymentPlanInstallment | null;
};

export const INSTALLMENT_STATUS_LABEL: Record<InstallmentStatus, string> = {
    paid: 'Paga', partial: 'Parcial', overdue: 'Em atraso', pending: 'Por pagar',
};

export type PaymentPlan = {
    principalMinor: number;
    ratePercent: number;
    months: number;
    interestMinor: number;
    totalMinor: number;
    /** Prestação mensal (a maior, quando a divisão não é exacta). */
    installmentMinor: number;
    firstDueDate: string;
    lastDueDate: string;
    installments: PaymentPlanInstallment[];
};

export type PaymentPlanInput = {
    principalMinor: number;
    ratePercent: number;
    months: number;
    startDate: Date | string;
};

export const buildPaymentPlan = (input: PaymentPlanInput): PaymentPlan => {
    if (!Number.isSafeInteger(input.principalMinor) || input.principalMinor <= 0) throw new Error('Indique um valor concedido válido.');
    if (!Number.isFinite(input.ratePercent) || input.ratePercent < 0) throw new Error('Taxa de juro inválida.');
    if (!Number.isInteger(input.months) || input.months < 1 || input.months > 120) throw new Error('O prazo deve estar entre 1 e 120 meses.');

    const interestMinor = Math.round(input.principalMinor * input.ratePercent / 100);
    const schedule = buildInstallmentSchedule({
        principalMinor: input.principalMinor,
        installments: input.months,
        startDate: input.startDate,
        method: 'FLAT',
        flatInterestMinor: interestMinor,
    });
    const totalMinor = input.principalMinor + interestMinor;
    let paid = 0;
    const installments = schedule.map(item => {
        paid += item.totalMinor;
        return { ...item, balanceAfterMinor: totalMinor - paid };
    });
    return {
        principalMinor: input.principalMinor,
        ratePercent: input.ratePercent,
        months: input.months,
        interestMinor,
        totalMinor,
        installmentMinor: Math.max(...installments.map(item => item.totalMinor)),
        firstDueDate: installments[0].dueDate,
        lastDueDate: installments[installments.length - 1].dueDate,
        installments,
    };
};

export type StoredInstallment = {
    installmentNumber: number;
    dueDate: string;
    principalMinor: number;
    interestMinor: number;
    lateInterestMinor?: number;
    paidPrincipalMinor?: number;
    paidInterestMinor?: number;
    paidLateInterestMinor?: number;
    status?: string;
    paidAt?: string | null;
};

const dayKey = (value: Date | string) => new Date(value).toISOString().slice(0, 10);

const statusOf = (dueMinor: number, paidMinor: number, dueDate: string, today: Date): InstallmentStatus => {
    if (dueMinor > 0 && paidMinor >= dueMinor) return 'paid';
    if (dayKey(dueDate) < dayKey(today)) return 'overdue';
    return paidMinor > 0 ? 'partial' : 'pending';
};

/**
 * Plano de um crédito já concedido a partir das prestações gravadas (actualizadas a cada pagamento):
 * cada prestação fica Paga, Parcial, Em atraso ou Por pagar, com o valor e a data do pagamento.
 */
export const planFromStoredInstallments = (
    rows: StoredInstallment[], ratePercent: number, today: Date = new Date()
): PaymentPlan => {
    if (rows.length === 0) throw new Error('Este crédito não tem prestações registadas.');
    const sorted = [...rows].sort((a, b) => a.installmentNumber - b.installmentNumber);
    const totalMinor = sorted.reduce((sum, row) => sum + row.principalMinor + row.interestMinor + Number(row.lateInterestMinor || 0), 0);
    let scheduled = 0;
    const installments = sorted.map(row => {
        const dueMinor = row.principalMinor + row.interestMinor + Number(row.lateInterestMinor || 0);
        const paidMinor = Number(row.paidPrincipalMinor || 0) + Number(row.paidInterestMinor || 0) + Number(row.paidLateInterestMinor || 0);
        scheduled += dueMinor;
        return {
            number: row.installmentNumber,
            dueDate: row.dueDate,
            principalMinor: row.principalMinor,
            interestMinor: row.interestMinor + Number(row.lateInterestMinor || 0),
            totalMinor: dueMinor,
            balanceAfterMinor: totalMinor - scheduled,
            paidMinor,
            status: row.status === 'cancelled' ? 'pending' as const : statusOf(dueMinor, paidMinor, row.dueDate, today),
            paidAt: row.paidAt || null,
        };
    });
    const principalMinor = sorted.reduce((sum, row) => sum + row.principalMinor, 0);
    return {
        principalMinor,
        ratePercent,
        months: installments.length,
        interestMinor: totalMinor - principalMinor,
        totalMinor,
        installmentMinor: Math.max(...installments.map(item => item.totalMinor)),
        firstDueDate: installments[0].dueDate,
        lastDueDate: installments[installments.length - 1].dueDate,
        installments,
    };
};

/** Para créditos antigos sem prestações gravadas: marca as primeiras `paidCount` como pagas. */
export const withPaidCount = (plan: PaymentPlan, paidCount: number, today: Date = new Date()): PaymentPlan => ({
    ...plan,
    installments: plan.installments.map(item => {
        const paidMinor = item.number <= paidCount ? item.totalMinor : 0;
        return { ...item, paidMinor, status: statusOf(item.totalMinor, paidMinor, item.dueDate, today), paidAt: null };
    }),
});

export const paymentProgress = (plan: PaymentPlan): PaymentProgress => {
    const paidMinor = plan.installments.reduce((sum, item) => sum + Math.min(item.totalMinor, item.paidMinor || 0), 0);
    return {
        paidCount: plan.installments.filter(item => item.status === 'paid').length,
        partialCount: plan.installments.filter(item => item.status === 'partial').length,
        overdueCount: plan.installments.filter(item => item.status === 'overdue').length,
        paidMinor,
        remainingMinor: Math.max(0, plan.totalMinor - paidMinor),
        percent: plan.totalMinor > 0 ? Math.round((paidMinor / plan.totalMinor) * 1000) / 10 : 0,
        nextDue: plan.installments.find(item => item.status && item.status !== 'paid') || null,
    };
};

/** Uma opção de plano para cada escalão da tabela de taxas (para comparar prazos). */
export const planOptionsFromTiers = (principalMinor: number, tiers: InterestTier[], startDate: Date | string) =>
    tiers.map(tier => ({
        tier,
        plan: buildPaymentPlan({ principalMinor, ratePercent: tier.rate, months: tierMonths(tier), startDate }),
    }));
