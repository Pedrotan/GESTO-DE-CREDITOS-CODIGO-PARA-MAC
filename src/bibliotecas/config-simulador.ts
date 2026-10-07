// Configuração do simulador (Definições › Simulador e Produtos): produtos, Imposto do Selo, limite da
// taxa de esforço, ajuste da taxa por nível de risco, mora e validade das simulações. Guardada em
// shared_settings para valer em todos os dispositivos da empresa.

import { DEFAULT_STAMP_DUTY, type AmortizationSystem, type FeeMode, type FeePayment, type StampDutyRates } from './simulador-credito';

export type RiskLevel = 'low' | 'medium' | 'high';
export type RateType = 'fixed' | 'variable';

export type SimulatorProduct = {
    id: string;
    name: string;
    active: boolean;
    minAmount: number;
    maxAmount: number;
    minMonths: number;
    maxMonths: number;
    /** TAN (%) para taxa fixa. */
    annualRate: number;
    rateType: RateType;
    /** Spread (%) somado ao indexante quando a taxa é variável. */
    spread: number;
    openingFee: { mode: FeeMode; value: number };
    processingFee: number;
    insuranceRate: number;
    system: AmortizationSystem;
};

export type SimulatorConfig = {
    products: SimulatorProduct[];
    stampDuty: StampDutyRates;
    /** Taxa de esforço máxima (%). */
    effortLimit: number;
    /** Pontos percentuais somados à TAN conforme o risco calculado. */
    riskSpread: Record<RiskLevel, number>;
    /** Sobretaxa de mora (pontos percentuais anuais) somada à TAN em caso de incumprimento. */
    lateSurcharge: number;
    /** Validade da simulação (dias). */
    validityDays: number;
    feePayment: FeePayment;
    /** Indexante de referência para taxa variável (ex.: LUIBOR a 3 meses). */
    indexName: string;
    indexValue: number;
    extraHolidays: string[];
};

export const DEFAULT_PRODUCTS: SimulatorProduct[] = [
    { id: 'credito-pessoal', name: 'Crédito Pessoal', active: true, minAmount: 50_000, maxAmount: 5_000_000, minMonths: 6, maxMonths: 60, annualRate: 24, rateType: 'fixed', spread: 6, openingFee: { mode: 'percent', value: 2 }, processingFee: 500, insuranceRate: 0, system: 'price' },
    { id: 'credito-salario', name: 'Crédito Salário', active: true, minAmount: 30_000, maxAmount: 3_000_000, minMonths: 3, maxMonths: 36, annualRate: 20, rateType: 'fixed', spread: 4, openingFee: { mode: 'percent', value: 1.5 }, processingFee: 0, insuranceRate: 0, system: 'price' },
    { id: 'credito-consumo', name: 'Crédito ao Consumo', active: true, minAmount: 20_000, maxAmount: 2_000_000, minMonths: 3, maxMonths: 48, annualRate: 26, rateType: 'fixed', spread: 8, openingFee: { mode: 'percent', value: 2.5 }, processingFee: 500, insuranceRate: 0, system: 'price' },
    { id: 'microcredito', name: 'Microcrédito', active: true, minAmount: 10_000, maxAmount: 1_000_000, minMonths: 1, maxMonths: 24, annualRate: 30, rateType: 'fixed', spread: 10, openingFee: { mode: 'percent', value: 3 }, processingFee: 0, insuranceRate: 0, system: 'price' },
    { id: 'credito-empresa', name: 'Crédito Empresa', active: true, minAmount: 500_000, maxAmount: 50_000_000, minMonths: 6, maxMonths: 60, annualRate: 22, rateType: 'variable', spread: 5, openingFee: { mode: 'percent', value: 2 }, processingFee: 1_000, insuranceRate: 0, system: 'sac' },
];

export const DEFAULT_SIMULATOR_CONFIG: SimulatorConfig = {
    products: DEFAULT_PRODUCTS,
    stampDuty: DEFAULT_STAMP_DUTY,
    effortLimit: 33,
    riskSpread: { low: -1, medium: 0, high: 3 },
    lateSurcharge: 2,
    validityDays: 15,
    feePayment: 'deducted',
    indexName: 'LUIBOR a 3 meses',
    indexValue: 17,
    extraHolidays: [],
};

export const SIMULATOR_CONFIG_KEY = 'simulator_config';

const number = (value: unknown, fallback: number, min = 0, max = Number.MAX_SAFE_INTEGER) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
};

export function normalizeProduct(raw: Partial<SimulatorProduct>, fallback: SimulatorProduct): SimulatorProduct {
    const minAmount = number(raw.minAmount, fallback.minAmount);
    const minMonths = Math.round(number(raw.minMonths, fallback.minMonths, 1, 600));
    return {
        id: String(raw.id || fallback.id),
        name: String(raw.name || fallback.name).slice(0, 80),
        active: raw.active !== false,
        minAmount,
        maxAmount: Math.max(minAmount, number(raw.maxAmount, fallback.maxAmount)),
        minMonths,
        maxMonths: Math.max(minMonths, Math.round(number(raw.maxMonths, fallback.maxMonths, 1, 600))),
        annualRate: number(raw.annualRate, fallback.annualRate, 0, 500),
        rateType: raw.rateType === 'variable' ? 'variable' : 'fixed',
        spread: number(raw.spread, fallback.spread, -100, 500),
        openingFee: {
            mode: raw.openingFee?.mode === 'fixed' ? 'fixed' : 'percent',
            value: number(raw.openingFee?.value, fallback.openingFee.value),
        },
        processingFee: number(raw.processingFee, fallback.processingFee),
        insuranceRate: number(raw.insuranceRate, fallback.insuranceRate, 0, 100),
        system: raw.system === 'sac' ? 'sac' : 'price',
    };
}

export function normalizeSimulatorConfig(raw: unknown): SimulatorConfig {
    const value = (raw && typeof raw === 'object' ? raw : {}) as Partial<SimulatorConfig>;
    const base = DEFAULT_SIMULATOR_CONFIG;
    const products = Array.isArray(value.products) && value.products.length
        ? value.products.map((product, index) => normalizeProduct(product, base.products.find(item => item.id === product?.id) || base.products[index % base.products.length]))
        : base.products;
    const stamp = (value.stampDuty || {}) as Partial<StampDutyRates>;
    const spread = (value.riskSpread || {}) as Partial<Record<RiskLevel, number>>;
    return {
        products,
        stampDuty: {
            upToOneYear: number(stamp.upToOneYear, base.stampDuty.upToOneYear, 0, 100),
            overOneYear: number(stamp.overOneYear, base.stampDuty.overOneYear, 0, 100),
            fiveYearsOrMore: number(stamp.fiveYearsOrMore, base.stampDuty.fiveYearsOrMore, 0, 100),
            interest: number(stamp.interest, base.stampDuty.interest, 0, 100),
        },
        effortLimit: number(value.effortLimit, base.effortLimit, 1, 100),
        riskSpread: {
            low: number(spread.low, base.riskSpread.low, -100, 100),
            medium: number(spread.medium, base.riskSpread.medium, -100, 100),
            high: number(spread.high, base.riskSpread.high, -100, 100),
        },
        lateSurcharge: number(value.lateSurcharge, base.lateSurcharge, 0, 100),
        validityDays: Math.round(number(value.validityDays, base.validityDays, 1, 365)),
        feePayment: value.feePayment === 'financed' ? 'financed' : 'deducted',
        indexName: String(value.indexName || base.indexName).slice(0, 60),
        indexValue: number(value.indexValue, base.indexValue, 0, 500),
        extraHolidays: Array.isArray(value.extraHolidays) ? value.extraHolidays.filter(item => /^\d{4}-\d{2}-\d{2}$/.test(String(item))).map(String) : [],
    };
}

/** Validação da simulação contra os limites do produto: mensagens claras para o utilizador. */
export function productLimitErrors(product: SimulatorProduct, principal: number, months: number, format: (value: number) => string): string[] {
    const errors: string[] = [];
    if (principal < product.minAmount) errors.push(`O montante mínimo do ${product.name} é ${format(product.minAmount)}.`);
    if (principal > product.maxAmount) errors.push(`O montante máximo do ${product.name} é ${format(product.maxAmount)}.`);
    if (months < product.minMonths) errors.push(`O prazo mínimo do ${product.name} é de ${product.minMonths} meses.`);
    if (months > product.maxMonths) errors.push(`O prazo máximo do ${product.name} é de ${product.maxMonths} meses.`);
    return errors;
}
