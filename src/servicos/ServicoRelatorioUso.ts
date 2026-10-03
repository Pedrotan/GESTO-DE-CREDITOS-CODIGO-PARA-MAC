// Resumo mensal de utilização enviado ao Tango Master (relatórios de volume de negócio do SaaS).
// Só contém números agregados: contagens e totais em cêntimos. Nenhum nome, documento ou contacto
// de clientes sai do dispositivo por esta via.

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

export type UsageReport = { period: string; metrics: UsageMetrics };

type QueryFn = <T>(sql: string, params?: unknown[]) => Promise<T[]>;

const REPORT_INTERVAL_MS = 6 * 60 * 60 * 1000;
const LAST_REPORT_KEY = 'tango_usage_report_last_sent';

// Valores em cêntimos: colunas *Minor quando existem, senão o valor legado convertido.
const PRINCIPAL = 'COALESCE(principalAmountMinor, CAST(ROUND(principalAmount * 100) AS INTEGER))';
const TOTAL_DUE = 'COALESCE(totalDueMinor, CAST(ROUND(totalDue * 100) AS INTEGER))';
const BALANCE = 'COALESCE(currentBalanceMinor, CAST(ROUND(currentBalance * 100) AS INTEGER))';
const PAYMENT = 'COALESCE(amountMinor, CAST(ROUND(amount * 100) AS INTEGER))';
const INTEREST_PAID = `COALESCE(allocatedToInterestMinor, CAST(ROUND(COALESCE(allocatedToInterest, 0) * 100) AS INTEGER))
    + COALESCE(allocatedToLateInterestMinor, CAST(ROUND(COALESCE(allocatedToLateInterest, 0) * 100) AS INTEGER))`;

const CREDITS_IN_PERIOD = `SELECT COUNT(*) AS n, COALESCE(SUM(${PRINCIPAL}), 0) AS principal,
        COALESCE(SUM(${TOTAL_DUE} - ${PRINCIPAL}), 0) AS interest
    FROM credits
    WHERE deletedAt IS NULL AND status NOT IN ('rejected', 'cancelled', 'pending_approval')
      AND substr(COALESCE(startDate, createdAt), 1, 7) = ?`;
const PAYMENTS_IN_PERIOD = `SELECT COUNT(*) AS n, COALESCE(SUM(${PAYMENT}), 0) AS total, COALESCE(SUM(${INTEREST_PAID}), 0) AS interest
    FROM payments
    WHERE deletedAt IS NULL AND COALESCE(status, 'confirmed') = 'confirmed' AND substr(paymentDate, 1, 7) = ?`;
const NEW_CLIENTS_IN_PERIOD = `SELECT COUNT(*) AS n FROM clients WHERE deletedAt IS NULL AND substr(createdAt, 1, 7) = ?`;
const PORTFOLIO_NOW = `SELECT
        (SELECT COUNT(*) FROM clients WHERE deletedAt IS NULL) AS clients,
        (SELECT COUNT(*) FROM credits WHERE deletedAt IS NULL AND status IN ('active', 'overdue', 'defaulted', 'renegotiated')) AS active,
        (SELECT COALESCE(SUM(${BALANCE}), 0) FROM credits WHERE deletedAt IS NULL AND status IN ('active', 'overdue', 'defaulted', 'renegotiated')) AS portfolio,
        (SELECT COUNT(*) FROM credits WHERE deletedAt IS NULL AND status IN ('overdue', 'defaulted')) AS overdue,
        (SELECT COALESCE(SUM(${BALANCE}), 0) FROM credits WHERE deletedAt IS NULL AND status IN ('overdue', 'defaulted')) AS overdueBalance`;
const USERS_COUNT = `SELECT COUNT(*) AS n FROM users`;

const toInt = (value: unknown) => Math.max(0, Math.round(Number(value) || 0));

export const periodOf = (date: Date) => date.toISOString().slice(0, 7);
export const previousPeriod = (period: string) => {
    const [year, month] = period.split('-').map(Number);
    return new Date(Date.UTC(year, month - 2, 1)).toISOString().slice(0, 7);
};

/** Calcula o resumo de um mês. A carteira (saldos, atraso) é a fotografia actual. */
export const buildUsageReport = async (query: QueryFn, period: string): Promise<UsageReport> => {
    const [[credits], [payments], [clients], [portfolio], users] = await Promise.all([
        query<{ n: number; principal: number; interest: number }>(CREDITS_IN_PERIOD, [period]),
        query<{ n: number; total: number; interest: number }>(PAYMENTS_IN_PERIOD, [period]),
        query<{ n: number }>(NEW_CLIENTS_IN_PERIOD, [period]),
        query<{ clients: number; active: number; portfolio: number; overdue: number; overdueBalance: number }>(PORTFOLIO_NOW),
        query<{ n: number }>(USERS_COUNT).catch(() => [{ n: 0 }]),
    ]);
    return {
        period,
        metrics: {
            creditsCount: toInt(credits?.n),
            creditsVolumeMinor: toInt(credits?.principal),
            expectedInterestMinor: toInt(credits?.interest),
            paymentsCount: toInt(payments?.n),
            paymentsVolumeMinor: toInt(payments?.total),
            interestReceivedMinor: toInt(payments?.interest),
            newClients: toInt(clients?.n),
            totalClients: toInt(portfolio?.clients),
            activeCredits: toInt(portfolio?.active),
            portfolioMinor: toInt(portfolio?.portfolio),
            overdueCredits: toInt(portfolio?.overdue),
            overdueMinor: toInt(portfolio?.overdueBalance),
            users: toInt(users?.[0]?.n),
        },
    };
};

/**
 * Envia o mês actual no máximo a cada 6 horas e, nos primeiros 5 dias do mês, também o anterior
 * (para o fechar com a carteira próxima do fim do mês).
 * Falhas são silenciosas: o relatório nunca pode atrapalhar a sincronização nem o trabalho.
 */
export const reportUsageIfDue = async (config: {
    url: string; apiKey: string; tenantId: string; deviceId: string; query: QueryFn; appVersion?: string;
}) => {
    try {
        const last = Number(localStorage.getItem(LAST_REPORT_KEY) || 0);
        if (Date.now() - last < REPORT_INTERVAL_MS) return false;
        const now = new Date();
        const current = periodOf(now);
        const periods = now.getUTCDate() <= 5 ? [previousPeriod(current), current] : [current];
        const reports = await Promise.all(periods.map(period => buildUsageReport(config.query, period)));
        const response = await fetch(`${config.url}/api/usage-report`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-sync-passkey': config.apiKey },
            body: JSON.stringify({ tenantId: config.tenantId, deviceId: config.deviceId, appVersion: config.appVersion, reports }),
            signal: AbortSignal.timeout(15_000),
        });
        if (!response.ok) return false;
        localStorage.setItem(LAST_REPORT_KEY, String(Date.now()));
        return true;
    } catch (error) {
        console.warn('[RelatorioUso] Envio adiado:', error);
        return false;
    }
};
