// Cálculos dos relatórios de volume de negócio do SaaS (Tango Master).
// Os valores monetários chegam em cêntimos (minor units) para evitar erros de arredondamento.

export type UsageMetrics = {
    creditsCount: number;
    creditsVolumeMinor: number;
    expectedInterestMinor: number;
    paymentsCount: number;
    paymentsVolumeMinor: number;
    interestReceivedMinor: number;
    newClients: number;
    totalClients: number;
    activeCredits: number;
    portfolioMinor: number;
    overdueCredits: number;
    overdueMinor: number;
    users: number;
};

export type CompanyUsage = {
    tenantId: string;
    name: string;
    status: string;
    expiresAt: string | null;
    createdAt: string | null;
    lastSyncAt: string | null;
    reportedAt: string | null;
    appVersion: string | null;
    metrics: UsageMetrics | null;
    previousMetrics: UsageMetrics | null;
    syncOperations: number;
    activeDevices: number;
};

export type UsageSummary = UsageMetrics & {
    companies: number;
    reportingCompanies: number;
    activeCompanies: number;
    syncOperations: number;
    activeDevices: number;
    previousCreditsVolumeMinor: number;
    previousPaymentsVolumeMinor: number;
};

const METRIC_KEYS: Array<keyof UsageMetrics> = [
    'creditsCount', 'creditsVolumeMinor', 'expectedInterestMinor', 'paymentsCount', 'paymentsVolumeMinor',
    'interestReceivedMinor', 'newClients', 'totalClients', 'activeCredits', 'portfolioMinor', 'overdueCredits',
    'overdueMinor', 'users',
];

export const emptyMetrics = (): UsageMetrics =>
    Object.fromEntries(METRIC_KEYS.map(key => [key, 0])) as UsageMetrics;

/** Empresa com actividade no mês: enviou relatório com operações ou sincronizou. */
export const isActiveCompany = (company: CompanyUsage) =>
    company.syncOperations > 0 || !!(company.metrics && (company.metrics.creditsCount > 0 || company.metrics.paymentsCount > 0));

export const summarizeUsage = (companies: CompanyUsage[]): UsageSummary => {
    const totals = emptyMetrics();
    let previousCredits = 0;
    let previousPayments = 0;
    for (const company of companies) {
        for (const key of METRIC_KEYS) totals[key] += Number(company.metrics?.[key] || 0);
        previousCredits += Number(company.previousMetrics?.creditsVolumeMinor || 0);
        previousPayments += Number(company.previousMetrics?.paymentsVolumeMinor || 0);
    }
    return {
        ...totals,
        companies: companies.length,
        reportingCompanies: companies.filter(company => company.metrics).length,
        activeCompanies: companies.filter(isActiveCompany).length,
        syncOperations: companies.reduce((sum, company) => sum + company.syncOperations, 0),
        activeDevices: companies.reduce((sum, company) => sum + company.activeDevices, 0),
        previousCreditsVolumeMinor: previousCredits,
        previousPaymentsVolumeMinor: previousPayments,
    };
};

/** Variação percentual face ao período anterior; null quando não há base de comparação. */
export const variation = (current: number, previous: number): number | null =>
    previous > 0 ? Math.round(((current - previous) / previous) * 1000) / 10 : null;

export const overdueRate = (metrics: Pick<UsageMetrics, 'overdueMinor' | 'portfolioMinor'>): number =>
    metrics.portfolioMinor > 0 ? Math.round((metrics.overdueMinor / metrics.portfolioMinor) * 1000) / 10 : 0;

export const formatKz = (minor: number) =>
    `${(minor / 100).toLocaleString('pt-AO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Kz`;

const csvCell = (value: string | number) => {
    const text = String(value);
    // Evita que o Excel interprete o conteúdo como fórmula.
    const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
    return /[";\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

const decimal = (minor: number) => (minor / 100).toFixed(2).replace('.', ',');

/** CSV com ";" (formato que o Excel em português abre directamente). */
export const usageToCsv = (companies: CompanyUsage[], period: string) => {
    const header = ['Período', 'Empresa', 'NIF', 'Estado', 'Créditos (nº)', 'Créditos concedidos (Kz)', 'Juros contratados (Kz)',
        'Pagamentos (nº)', 'Pagamentos recebidos (Kz)', 'Juros recebidos (Kz)', 'Clientes', 'Novos clientes',
        'Créditos activos', 'Carteira activa (Kz)', 'Créditos em atraso', 'Valor em atraso (Kz)', 'Utilizadores',
        'Dispositivos (30 dias)', 'Operações sincronizadas', 'Último relatório'];
    const rows = companies.map(company => {
        const m = company.metrics || emptyMetrics();
        return [period, company.name, company.tenantId, company.status, m.creditsCount, decimal(m.creditsVolumeMinor),
            decimal(m.expectedInterestMinor), m.paymentsCount, decimal(m.paymentsVolumeMinor), decimal(m.interestReceivedMinor),
            m.totalClients, m.newClients, m.activeCredits, decimal(m.portfolioMinor), m.overdueCredits, decimal(m.overdueMinor),
            m.users, company.activeDevices, company.syncOperations, company.reportedAt || 'Sem relatório'];
    });
    return '﻿' + [header, ...rows].map(row => row.map(csvCell).join(';')).join('\r\n');
};
