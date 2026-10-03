// Plano de pagamento de um crédito: as mesmas regras usadas na emissão (juro simples sobre o capital,
// dividido em prestações mensais iguais, a primeira um mês depois da data do acordo).
import { buildInstallmentSchedule } from './cronograma-prestacoes.ts';
import { tierMonths, type InterestTier } from './taxas-juro.ts';

export type PaymentPlanInstallment = {
    number: number;
    dueDate: string;
    principalMinor: number;
    interestMinor: number;
    totalMinor: number;
    /** Valor que ainda falta pagar depois desta prestação. */
    balanceAfterMinor: number;
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

/** Uma opção de plano para cada escalão da tabela de taxas (para comparar prazos). */
export const planOptionsFromTiers = (principalMinor: number, tiers: InterestTier[], startDate: Date | string) =>
    tiers.map(tier => ({
        tier,
        plan: buildPaymentPlan({ principalMinor, ratePercent: tier.rate, months: tierMonths(tier), startDate }),
    }));
