// Motor de cálculo do simulador de crédito (modelo dos bancos angolanos). Todos os valores são
// calculados em cêntimos inteiros: cada linha é arredondada a 2 casas e a diferença de cêntimos é
// ajustada na última prestação, para o capital em dívida terminar exactamente em 0,00 Kz.

import { angolaHolidays } from './feriados-angola';

export type AmortizationSystem = 'price' | 'sac';
export type GraceType = 'capital' | 'total';
export type FeeMode = 'percent' | 'fixed';
export type FeePayment = 'deducted' | 'financed';

export const AMORTIZATION_LABELS: Record<AmortizationSystem, string> = {
    price: 'Prestações Constantes',
    sac: 'Amortizações Constantes',
};

export const GRACE_LABELS: Record<GraceType, string> = {
    capital: 'Carência de capital (paga só juros)',
    total: 'Carência de capital e juros (juros capitalizados)',
};

/** Taxas do Imposto do Selo, em percentagem (editáveis em Definições). */
export type StampDutyRates = {
    /** Utilização de crédito com prazo até 1 ano. */
    upToOneYear: number;
    /** Utilização de crédito com prazo superior a 1 ano e inferior a 5 anos. */
    overOneYear: number;
    /** Utilização de crédito com prazo igual ou superior a 5 anos. */
    fiveYearsOrMore: number;
    /** Sobre os juros de cada prestação. */
    interest: number;
};

export const DEFAULT_STAMP_DUTY: StampDutyRates = { upToOneYear: 0.5, overOneYear: 0.4, fiveYearsOrMore: 0.3, interest: 0.2 };

export type SimulationInput = {
    /** Capital pedido pelo cliente (Kz). */
    principal: number;
    /** Prazo total em meses, incluindo a carência. */
    months: number;
    /** Taxa Anual Nominal (TAN), em percentagem. */
    annualRate: number;
    system: AmortizationSystem;
    /** Data do desembolso. */
    startDate: Date | string;
    /** Dia de vencimento das prestações (1 a 28). */
    dueDay: number;
    graceMonths?: number;
    graceType?: GraceType;
    openingFee?: { mode: FeeMode; value: number };
    /** Comissão de processamento por prestação (Kz). */
    processingFee?: number;
    /** Seguro de vida/crédito: % mensal sobre o capital em dívida. */
    insuranceRate?: number;
    /** Comissão de abertura e Imposto do Selo de utilização: descontados no desembolso ou financiados. */
    feePayment?: FeePayment;
    stampDuty?: StampDutyRates;
    /** Datas adicionais sem expediente (AAAA-MM-DD) para o ajuste dos vencimentos. */
    extraHolidays?: string[];
    /** Considerar os feriados nacionais de Angola no ajuste dos vencimentos. */
    useNationalHolidays?: boolean;
};

export type ScheduleRow = {
    number: number;
    dueDate: string;
    /** Capital em dívida no início do período. */
    openingBalance: number;
    interest: number;
    stampDutyInterest: number;
    amortization: number;
    processingFee: number;
    insurance: number;
    /** Comissões + seguro da prestação. */
    charges: number;
    /** Prestação sem encargos (juros + amortização). */
    basePayment: number;
    /** Prestação total paga pelo cliente. */
    payment: number;
    /** Capital em dívida no fim do período. */
    closingBalance: number;
    /** Período de carência (juros pagos ou capitalizados). */
    grace: boolean;
    capitalizedInterest: number;
};

export type SimulationResult = {
    valid: boolean;
    rows: ScheduleRow[];
    principal: number;
    financedPrincipal: number;
    netReceived: number;
    openingFee: number;
    stampDutyUse: number;
    stampDutyUseRate: number;
    upfrontCharges: number;
    upfrontDeducted: number;
    totalInterest: number;
    totalStampDutyInterest: number;
    totalProcessingFees: number;
    totalInsurance: number;
    totalCommissions: number;
    totalTaxes: number;
    totalPayments: number;
    /** Montante Total Imputado ao Cliente: capital + juros + comissões + impostos + seguros. */
    mtic: number;
    annualRate: number;
    monthlyRate: number;
    /** Taxa Anual de Encargos Efectiva Global (%), pela TIR dos fluxos reais. */
    taeg: number | null;
    /** Primeira prestação completa (fora da carência), com encargos. */
    installment: number;
    /** A mesma prestação sem encargos (juros + amortização). */
    installmentBase: number;
    /** Maior prestação do plano (usada na taxa de esforço). */
    maxInstallment: number;
    firstDueDate: string | null;
    lastDueDate: string | null;
};

const toMinor = (value: number) => Math.round((Number(value) || 0) * 100);
const fromMinor = (minor: number) => minor / 100;
const pad = (value: number) => String(value).padStart(2, '0');
const keyOf = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

/** Taxa do Imposto do Selo sobre a utilização do crédito, conforme o prazo. */
export function stampDutyUseRate(months: number, rates: StampDutyRates = DEFAULT_STAMP_DUTY) {
    if (months >= 60) return rates.fiveYearsOrMore;
    if (months > 12) return rates.overOneYear;
    return rates.upToOneYear;
}

/** Dia útil seguinte (ou o próprio dia) — fins-de-semana, feriados nacionais e datas configuradas. */
export function nextBusinessDay(date: Date, extraHolidays: string[] = [], useNationalHolidays = true): Date {
    const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    for (let guard = 0; guard < 15; guard++) {
        const weekday = result.getDay();
        const key = keyOf(result);
        const holiday = (useNationalHolidays && angolaHolidays(result.getFullYear()).has(key)) || extraHolidays.includes(key);
        if (weekday !== 0 && weekday !== 6 && !holiday) return result;
        result.setDate(result.getDate() + 1);
    }
    return result;
}

/** Data de vencimento da prestação n (1 = primeira): mês seguinte ao desembolso, no dia escolhido, em dia útil. */
export function dueDateFor(startDate: Date | string, dueDay: number, number: number, extraHolidays: string[] = [], useNationalHolidays = true): Date {
    const start = new Date(startDate);
    const day = Math.min(28, Math.max(1, Math.round(dueDay) || 1));
    const nominal = new Date(start.getFullYear(), start.getMonth() + number, day);
    return nextBusinessDay(nominal, extraHolidays, useNationalHolidays);
}

/** Taxa interna de rentabilidade mensal dos fluxos (fluxo 0 = montante recebido, positivo). */
export function monthlyIrr(flows: number[]): number | null {
    if (flows.length < 2 || flows[0] <= 0 || !flows.slice(1).some(flow => flow < 0)) return null;
    const npv = (rate: number) => flows.reduce((sum, flow, index) => sum + flow / Math.pow(1 + rate, index), 0);
    const derivative = (rate: number) => flows.reduce((sum, flow, index) => sum - index * flow / Math.pow(1 + rate, index + 1), 0);
    let rate = 0.02;
    for (let iteration = 0; iteration < 60; iteration++) {
        const value = npv(rate);
        const slope = derivative(rate);
        if (!Number.isFinite(value) || !Number.isFinite(slope) || slope === 0) break;
        const next = rate - value / slope;
        if (!Number.isFinite(next) || next <= -0.99) break;
        if (Math.abs(next - rate) < 1e-12) return next;
        rate = next;
    }
    // Recurso: bissecção num intervalo largo.
    let low = -0.99, high = 10;
    if (npv(low) * npv(high) > 0) return null;
    for (let iteration = 0; iteration < 200; iteration++) {
        const middle = (low + high) / 2;
        if (npv(low) * npv(middle) <= 0) high = middle; else low = middle;
        if (high - low < 1e-12) break;
    }
    return (low + high) / 2;
}

export function simulateCredit(input: SimulationInput): SimulationResult {
    const months = Math.max(0, Math.floor(Number(input.months) || 0));
    const graceMonths = Math.min(Math.max(0, Math.floor(Number(input.graceMonths) || 0)), Math.max(0, months - 1));
    const graceType: GraceType = input.graceType === 'total' ? 'total' : 'capital';
    const stamp = input.stampDuty || DEFAULT_STAMP_DUTY;
    const principalMinor = toMinor(input.principal);
    const rate = Math.max(0, Number(input.annualRate) || 0);
    const monthlyRate = rate / 1200;
    const extra = input.extraHolidays || [];
    const national = input.useNationalHolidays !== false;

    const empty: SimulationResult = {
        valid: false, rows: [], principal: fromMinor(principalMinor), financedPrincipal: 0, netReceived: 0, openingFee: 0, stampDutyUse: 0,
        stampDutyUseRate: stampDutyUseRate(months, stamp), upfrontCharges: 0, upfrontDeducted: 0, totalInterest: 0, totalStampDutyInterest: 0,
        totalProcessingFees: 0, totalInsurance: 0, totalCommissions: 0, totalTaxes: 0, totalPayments: 0, mtic: 0, annualRate: rate, monthlyRate: monthlyRate * 100,
        taeg: null, installment: 0, installmentBase: 0, maxInstallment: 0, firstDueDate: null, lastDueDate: null,
    };
    if (principalMinor <= 0 || months <= 0 || Number.isNaN(new Date(input.startDate).getTime())) return empty;

    // Encargos iniciais: comissão de abertura e Imposto do Selo sobre a utilização do crédito.
    const opening = input.openingFee || { mode: 'percent' as FeeMode, value: 0 };
    const openingFeeMinor = Math.max(0, opening.mode === 'fixed' ? toMinor(opening.value) : Math.round(principalMinor * (Number(opening.value) || 0) / 100));
    const useRate = stampDutyUseRate(months, stamp);
    const stampUseMinor = Math.round(principalMinor * useRate / 100);
    const upfrontMinor = openingFeeMinor + stampUseMinor;
    const financed = input.feePayment === 'financed';
    const financedMinor = principalMinor + (financed ? upfrontMinor : 0);
    const netReceivedMinor = principalMinor - (financed ? 0 : upfrontMinor);

    const processingMinor = Math.max(0, toMinor(input.processingFee || 0));
    const insuranceRate = Math.max(0, Number(input.insuranceRate) || 0) / 100;
    const interestStampRate = Math.max(0, Number(stamp.interest) || 0) / 100;

    const rows: ScheduleRow[] = [];
    let balance = financedMinor;
    const pushRow = (number: number, values: Omit<ScheduleRow, 'number' | 'dueDate'>) => {
        rows.push({ number, dueDate: keyOf(dueDateFor(input.startDate, input.dueDay, number, extra, national)), ...values });
    };

    // Carência
    for (let number = 1; number <= graceMonths; number++) {
        const interest = Math.round(balance * monthlyRate);
        if (graceType === 'total') {
            pushRow(number, {
                openingBalance: fromMinor(balance), interest: fromMinor(interest), stampDutyInterest: 0, amortization: 0, processingFee: 0, insurance: 0,
                charges: 0, basePayment: 0, payment: 0, closingBalance: fromMinor(balance + interest), grace: true, capitalizedInterest: fromMinor(interest),
            });
            balance += interest;
        } else {
            const stampInterest = Math.round(interest * interestStampRate);
            const insurance = Math.round(balance * insuranceRate);
            pushRow(number, {
                openingBalance: fromMinor(balance), interest: fromMinor(interest), stampDutyInterest: fromMinor(stampInterest), amortization: 0,
                processingFee: fromMinor(processingMinor), insurance: fromMinor(insurance), charges: fromMinor(processingMinor + insurance),
                basePayment: fromMinor(interest), payment: fromMinor(interest + stampInterest + processingMinor + insurance),
                closingBalance: fromMinor(balance), grace: true, capitalizedInterest: 0,
            });
        }
    }

    // Prestações de amortização
    const amortizing = months - graceMonths;
    const base = balance;
    const constantPayment = monthlyRate > 0
        ? Math.round(base * monthlyRate / (1 - Math.pow(1 + monthlyRate, -amortizing)))
        : Math.round(base / amortizing);
    const constantAmortization = Math.round(base / amortizing);
    for (let index = 0; index < amortizing; index++) {
        const number = graceMonths + index + 1;
        const last = index === amortizing - 1;
        const interest = Math.round(balance * monthlyRate);
        let amortization = input.system === 'sac' ? constantAmortization : constantPayment - interest;
        if (last || amortization > balance) amortization = balance;
        amortization = Math.max(0, amortization);
        const stampInterest = Math.round(interest * interestStampRate);
        const insurance = Math.round(balance * insuranceRate);
        const baseMinor = interest + amortization;
        pushRow(number, {
            openingBalance: fromMinor(balance), interest: fromMinor(interest), stampDutyInterest: fromMinor(stampInterest), amortization: fromMinor(amortization),
            processingFee: fromMinor(processingMinor), insurance: fromMinor(insurance), charges: fromMinor(processingMinor + insurance),
            basePayment: fromMinor(baseMinor), payment: fromMinor(baseMinor + stampInterest + processingMinor + insurance),
            closingBalance: fromMinor(balance - amortization), grace: false, capitalizedInterest: 0,
        });
        balance -= amortization;
    }

    const sum = (pick: (row: ScheduleRow) => number) => rows.reduce((total, row) => total + toMinor(pick(row)), 0);
    const totalInterestMinor = sum(row => row.interest);
    const totalStampInterestMinor = sum(row => row.stampDutyInterest);
    const totalProcessingMinor = sum(row => row.processingFee);
    const totalInsuranceMinor = sum(row => row.insurance);
    const totalPaymentsMinor = sum(row => row.payment);
    const totalCommissionsMinor = openingFeeMinor + totalProcessingMinor;
    const totalTaxesMinor = stampUseMinor + totalStampInterestMinor;
    // MTIC: capital pedido + juros + comissões + impostos + seguros (os juros incluem os da carência capitalizada).
    const mticMinor = principalMinor + totalInterestMinor + totalCommissionsMinor + totalTaxesMinor + totalInsuranceMinor;

    const irr = monthlyIrr([fromMinor(netReceivedMinor), ...rows.map(row => -row.payment)]);
    const taeg = irr === null ? null : (Math.pow(1 + irr, 12) - 1) * 100;
    const firstFull = rows.find(row => !row.grace) || rows[0];

    return {
        valid: true, rows,
        principal: fromMinor(principalMinor), financedPrincipal: fromMinor(financedMinor), netReceived: fromMinor(netReceivedMinor),
        openingFee: fromMinor(openingFeeMinor), stampDutyUse: fromMinor(stampUseMinor), stampDutyUseRate: useRate,
        upfrontCharges: fromMinor(upfrontMinor), upfrontDeducted: financed ? 0 : fromMinor(upfrontMinor),
        totalInterest: fromMinor(totalInterestMinor), totalStampDutyInterest: fromMinor(totalStampInterestMinor),
        totalProcessingFees: fromMinor(totalProcessingMinor), totalInsurance: fromMinor(totalInsuranceMinor),
        totalCommissions: fromMinor(totalCommissionsMinor), totalTaxes: fromMinor(totalTaxesMinor),
        totalPayments: fromMinor(totalPaymentsMinor), mtic: fromMinor(mticMinor),
        annualRate: rate, monthlyRate: monthlyRate * 100, taeg,
        installment: firstFull?.payment || 0, installmentBase: firstFull?.basePayment || 0,
        maxInstallment: rows.reduce((max, row) => Math.max(max, row.payment), 0),
        firstDueDate: rows[0]?.dueDate || null, lastDueDate: rows[rows.length - 1]?.dueDate || null,
    };
}

/** Taxa de esforço (%): (nova prestação + outros encargos com créditos) / rendimento mensal líquido. */
export function effortRate(installment: number, otherDebts: number, income: number): number | null {
    if (!(income > 0)) return null;
    return ((Math.max(0, installment) + Math.max(0, otherDebts)) / income) * 100;
}

/**
 * Montante máximo cuja maior prestação não ultrapassa `maxPayment` (simulação inversa e montante
 * máximo recomendado pela taxa de esforço). Pesquisa binária sobre o próprio motor.
 */
export function maxPrincipalForPayment(maxPayment: number, base: Omit<SimulationInput, 'principal'>, ceiling = 1e10): number {
    if (!(maxPayment > 0)) return 0;
    let low = 0, high = ceiling;
    for (let iteration = 0; iteration < 80 && high - low > 0.5; iteration++) {
        const middle = (low + high) / 2;
        const result = simulateCredit({ ...base, principal: middle });
        if (result.valid && result.maxInstallment <= maxPayment + 1e-9) low = middle; else high = middle;
    }
    return Math.floor(low);
}

/** Prazo mínimo (em meses) para a maior prestação caber em `maxPayment`, até `maxMonths`. */
export function minMonthsForPayment(maxPayment: number, input: SimulationInput, maxMonths: number): number | null {
    if (!(maxPayment > 0)) return null;
    for (let months = Math.max(1, (input.graceMonths || 0) + 1); months <= maxMonths; months++) {
        const result = simulateCredit({ ...input, months });
        if (result.valid && result.maxInstallment <= maxPayment) return months;
    }
    return null;
}
