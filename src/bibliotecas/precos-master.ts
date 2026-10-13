// Tabela de preços do Tango Master: uma única fonte para todos os sítios que pedem um valor (emissão de licenças,
// cadastro e renovação de empresas, gestão das licenças no servidor). Guardada neste computador.

import type { LicenseType } from './licenciamento';
import type { RenewalPeriod } from './subscricao';

export const PRICES_STORAGE_KEY = 'tango_master_prices';
export const PRICES_CHANGED_EVENT = 'tango-master-prices-changed';

export type MasterPrices = Record<LicenseType, number> & { enterpriseMultiplier: number };

export const DEFAULT_PRICES: MasterPrices = {
    monthly: 15000,
    quarterly: 40000,
    biannual: 75000,
    annual: 140000,
    lifetime: 1500000,
    trial: 0,
    // Licença empresarial custa este múltiplo da pessoal.
    enterpriseMultiplier: 2.5,
};

export const PRICE_PLAN_ORDER: LicenseType[] = ['monthly', 'quarterly', 'biannual', 'annual', 'lifetime', 'trial'];

const cleanAmount = (value: unknown, fallback: number) => {
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? Math.round(number * 100) / 100 : fallback;
};

export const getMasterPrices = (): MasterPrices => {
    let saved: Record<string, unknown> = {};
    try { saved = JSON.parse((typeof localStorage !== 'undefined' && localStorage.getItem(PRICES_STORAGE_KEY)) || '{}') || {}; } catch { saved = {}; }
    const prices = { ...DEFAULT_PRICES };
    for (const key of [...PRICE_PLAN_ORDER, 'enterpriseMultiplier'] as const) prices[key] = cleanAmount(saved[key], DEFAULT_PRICES[key]);
    if (prices.enterpriseMultiplier <= 0) prices.enterpriseMultiplier = DEFAULT_PRICES.enterpriseMultiplier;
    return prices;
};

export const saveMasterPrices = (prices: MasterPrices) => {
    const clean = { ...DEFAULT_PRICES };
    for (const key of [...PRICE_PLAN_ORDER, 'enterpriseMultiplier'] as const) clean[key] = cleanAmount(prices[key], DEFAULT_PRICES[key]);
    localStorage.setItem(PRICES_STORAGE_KEY, JSON.stringify(clean));
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(PRICES_CHANGED_EVENT, { detail: clean }));
    return clean;
};

/** Preço de uma licença: base do plano × escalão × número de computadores. */
export const licensePrice = (prices: MasterPrices, plan: string, tier: string = 'singular', devices = 1) => {
    const base = (prices as Record<string, number>)[plan];
    if (!Number.isFinite(base)) return null;
    const multiplier = tier === 'empresarial' ? prices.enterpriseMultiplier : 1;
    return Math.round(base * multiplier * Math.max(1, Math.floor(devices || 1)) * 100) / 100;
};

/** Plano correspondente a um período de subscrição (cadastro e renovação das empresas). */
export const PLAN_BY_PERIOD: Record<RenewalPeriod, LicenseType> = { '1m': 'monthly', '3m': 'quarterly', '6m': 'biannual', '1y': 'annual', lifetime: 'lifetime' };

/** Valor a cobrar por um período da subscrição da empresa (empresarial: a empresa usa a nuvem e vários computadores). */
export const periodPrice = (prices: MasterPrices, period: string, tier: string = 'empresarial', devices = 1) => {
    const plan = PLAN_BY_PERIOD[period as RenewalPeriod];
    return plan ? licensePrice(prices, plan, tier, devices) : null;
};

/** Valor para um campo de texto (sem separadores, para o parsePaidAmount aceitar). */
export const priceInputValue = (value: number | null) => (value === null ? '' : String(value));
