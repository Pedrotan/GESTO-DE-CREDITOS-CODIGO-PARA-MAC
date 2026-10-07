// Estado do formulário do simulador e as regras que o ligam ao motor de cálculo, ao risco e ao histórico.

import type { Client, Credit, Payment, Simulation } from '@/tipos/credito';
import type { Warranty } from '@/tipos/contencioso';
import type { RiskLevel, RateType, SimulatorConfig, SimulatorProduct } from '@/bibliotecas/config-simulador';
import type { AmortizationSystem, FeeMode, FeePayment, GraceType, SimulationInput } from '@/bibliotecas/simulador-credito';
import type { RiskInputs } from '@/bibliotecas/risco-simulacao';

export type SimulatorForm = {
    clientId: string | null;
    clientName: string;
    clientNif: string;
    clientPhone: string;
    clientEmail: string;
    clientAddress: string;
    /** Rendimento mensal líquido. */
    income: number;
    /** Outros encargos mensais com créditos. */
    otherDebts: number;
    productId: string;
    principal: number;
    months: number;
    startDate: string;
    dueDay: number;
    graceMonths: number;
    graceType: GraceType;
    rateType: RateType;
    /** TAN da taxa fixa (antes do ajuste por risco). */
    baseRate: number;
    spread: number;
    indexValue: number;
    applyRiskAdjustment: boolean;
    system: AmortizationSystem;
    openingFee: { mode: FeeMode; value: number };
    processingFee: number;
    insuranceEnabled: boolean;
    insuranceRate: number;
    feePayment: FeePayment;
    riskOverride: RiskLevel | null;
    riskJustification: string;
};

export const QUICK_TERMS = [6, 12, 18, 24, 36, 48, 60];

/** Cor da taxa de esforço: verde abaixo de 30%, amarelo até ao limite, vermelho acima. */
export const effortTone = (effort: number | null, limit: number) => effort === null ? 'none' : effort > limit ? 'red' : effort >= 30 ? 'yellow' : 'green';

const pad = (value: number) => String(value).padStart(2, '0');
export const todayKey = (date = new Date()) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

export function activeProducts(config: SimulatorConfig): SimulatorProduct[] {
    const active = config.products.filter(product => product.active);
    return active.length ? active : config.products;
}

export function productFields(product: SimulatorProduct, config: SimulatorConfig): Partial<SimulatorForm> {
    return {
        productId: product.id,
        rateType: product.rateType,
        baseRate: product.annualRate,
        spread: product.spread,
        indexValue: config.indexValue,
        system: product.system,
        openingFee: { ...product.openingFee },
        processingFee: product.processingFee,
        insuranceEnabled: product.insuranceRate > 0,
        insuranceRate: product.insuranceRate > 0 ? product.insuranceRate : 0.05,
        feePayment: config.feePayment,
    };
}

export function defaultForm(config: SimulatorConfig): SimulatorForm {
    const product = activeProducts(config)[0];
    const today = new Date();
    return {
        clientId: null, clientName: '', clientNif: '', clientPhone: '', clientEmail: '', clientAddress: '',
        income: 0, otherDebts: 0, productId: product.id, principal: 0, months: 0,
        startDate: todayKey(today), dueDay: Math.min(28, today.getDate()), graceMonths: 0, graceType: 'capital',
        rateType: 'fixed', baseRate: product.annualRate, spread: product.spread, indexValue: config.indexValue,
        applyRiskAdjustment: true, system: product.system, openingFee: { ...product.openingFee }, processingFee: product.processingFee,
        insuranceEnabled: false, insuranceRate: 0.05, feePayment: config.feePayment, riskOverride: null, riskJustification: '',
        ...productFields(product, config),
    };
}

/** TAN antes do ajuste por risco: taxa fixa do produto ou indexante + spread. */
export const baseAnnualRate = (form: SimulatorForm) => Math.max(0, form.rateType === 'variable' ? form.indexValue + form.spread : form.baseRate);

export function buildInput(form: SimulatorForm, config: SimulatorConfig, annualRate: number): SimulationInput {
    return {
        principal: form.principal,
        months: form.months,
        annualRate,
        system: form.system,
        startDate: `${form.startDate}T12:00:00`,
        dueDay: form.dueDay,
        graceMonths: form.graceMonths,
        graceType: form.graceType,
        openingFee: form.openingFee,
        processingFee: form.processingFee,
        insuranceRate: form.insuranceEnabled ? form.insuranceRate : 0,
        feePayment: form.feePayment,
        stampDuty: config.stampDuty,
        extraHolidays: config.extraHolidays,
    };
}

export type ClientHistory = Omit<RiskInputs, 'effortRate' | 'effortLimit'> & {
    /** Prestação mensal estimada dos créditos em curso. */
    monthlyDebts: number;
    activeList: Array<{ id: string; principal: number; remaining: number; monthly: number; status: string }>;
    guaranteesValue: number;
};

const DEAD = ['rejected', 'cancelled'];
const OPEN = ['active', 'overdue', 'renegotiated'];

/** Histórico do cliente no sistema: créditos, atrasos e garantias, usados no risco e na taxa de esforço. */
export function clientHistory(client: Client | undefined, credits: Credit[], payments: Payment[], warranties: Warranty[], principal: number): ClientHistory | null {
    if (!client) return null;
    const own = credits.filter(credit => credit.clientId === client.id && !credit.deletedAt && !DEAD.includes(credit.status));
    const ids = new Set(own.map(credit => credit.id));
    const open = own.filter(credit => OPEN.includes(credit.status) && (Number(credit.totalDue ?? credit.currentBalance) || 0) > 0.1);
    const activeList = open.map(credit => {
        const remaining = Math.max(0, Number(credit.totalDue ?? credit.currentBalance) || 0);
        const left = Math.max(1, (Number(credit.installments) || 1) - (Number(credit.paidInstallments) || 0));
        return { id: credit.id, principal: Number(credit.principalAmount) || 0, remaining, monthly: remaining / left, status: credit.status };
    });
    const latePaid = payments.filter(payment => ids.has(payment.creditId) && payment.status !== 'cancelled' && !payment.deletedAt && payment.dueDate
        && new Date(payment.paymentDate).getTime() > new Date(payment.dueDate).getTime() + 86_400_000).length;
    const guaranteesValue = warranties.filter(warranty => warranty.clientId === client.id && warranty.status === 'active' && !warranty.deletedAt)
        .reduce((sum, warranty) => sum + (Number(warranty.marketValue) || 0), 0);
    return {
        latePayments: latePaid + own.filter(credit => credit.status === 'overdue').length,
        maxDaysOverdue: own.reduce((max, credit) => Math.max(max, Number(credit.daysOverdue) || 0), 0),
        paidCredits: own.filter(credit => credit.status === 'paid').length,
        activeCredits: open.length,
        defaultedCredits: own.filter(credit => credit.status === 'defaulted').length,
        guaranteeCoverage: principal > 0 ? guaranteesValue / principal : 0,
        monthlyDebts: Math.round(activeList.reduce((sum, item) => sum + item.monthly, 0) * 100) / 100,
        activeList,
        guaranteesValue,
    };
}

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const randomCode = (length: number) => {
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    return [...bytes].map(byte => ALPHABET[byte % ALPHABET.length]).join('');
};

/** Número único da simulação, ex.: SIM-2026-7KQ2M9. */
export const newSimulationNumber = (date = new Date()) => `SIM-${date.getFullYear()}-${randomCode(6)}`;
/** Código de verificação impresso na ficha e no QR code, ex.: 4F7K-QM2X. */
export const newVerificationCode = () => `${randomCode(4)}-${randomCode(4)}`;

export type SimulationStatus = 'simulated' | 'converted' | 'expired';
export const STATUS_LABELS: Record<SimulationStatus, string> = { simulated: 'Simulada', converted: 'Convertida em pedido', expired: 'Expirada' };

export function simulationStatus(simulation: Simulation, now = new Date()): SimulationStatus {
    if (simulation.status === 'converted') return 'converted';
    const expires = simulation.expiresAt ? new Date(simulation.expiresAt) : null;
    if (expires && !Number.isNaN(expires.getTime()) && expires.getTime() < now.getTime()) return 'expired';
    if (!expires) {
        // Simulações antigas (antes da validade): expiram 15 dias depois da data.
        const date = new Date(simulation.date);
        if (!Number.isNaN(date.getTime()) && date.getTime() + 15 * 86_400_000 < now.getTime()) return 'expired';
    }
    return 'simulated';
}

export type StoredDetails = {
    version: 2;
    form: SimulatorForm;
    productName: string;
    baseRate: number;
    riskAdjustment: number;
    annualRate: number;
    risk: { calculated: RiskLevel; level: RiskLevel; score: number; overridden: boolean; justification?: string };
    effortRate: number | null;
    summary: { taeg: number | null; mtic: number; netReceived: number; installmentBase: number; totalInterest: number; totalTaxes: number; totalCommissions: number; totalInsurance: number };
    /** Parâmetros da empresa em vigor quando a simulação foi guardada (para reemitir a mesma ficha). */
    settings?: Pick<SimulatorConfig, 'stampDuty' | 'extraHolidays' | 'effortLimit' | 'lateSurcharge' | 'validityDays' | 'indexName'>;
};

export function parseDetails(simulation: Simulation): StoredDetails | null {
    if (!simulation.details) return null;
    try {
        const parsed = JSON.parse(simulation.details);
        return parsed?.version === 2 && parsed.form ? parsed as StoredDetails : null;
    } catch { return null; }
}

/** Formulário de uma simulação do histórico (as antigas, sem detalhes, são reconstruídas com o essencial). */
export function formFromSimulation(simulation: Simulation, config: SimulatorConfig): SimulatorForm {
    const details = parseDetails(simulation);
    if (details) return { ...defaultForm(config), ...details.form };
    const base = defaultForm(config);
    return {
        ...base,
        clientName: simulation.clientName || '',
        income: Number(simulation.clientIncome) || 0,
        principal: Number(simulation.amount) || 0,
        months: Number(simulation.term) || 0,
        system: simulation.method === 'sac' ? 'sac' : 'price',
        rateType: 'fixed',
        // O simulador antigo guardava a taxa mensal: a TAN é 12 vezes esse valor.
        baseRate: Number(simulation.interestRate) ? Number(simulation.interestRate) * 12 : base.baseRate,
        applyRiskAdjustment: false,
    };
}
