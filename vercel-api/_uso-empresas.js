// Relatórios de utilização das empresas: apenas números agregados por mês (contagens e totais em
// cêntimos), nunca nomes, documentos ou dados pessoais. Servem os relatórios de negócio do Tango Master.

export const USAGE_METRICS = [
  'creditsCount', 'creditsVolumeMinor', 'expectedInterestMinor',
  'paymentsCount', 'paymentsVolumeMinor', 'interestReceivedMinor',
  'newClients', 'totalClients', 'activeCredits', 'portfolioMinor',
  'overdueCredits', 'overdueMinor', 'users'
];

export const PERIOD_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const MAX_METRIC = 1e15;

export const ensureUsageTable = async (sql) => {
  await sql(`
    CREATE TABLE IF NOT EXISTS tango_usage_reports (
      tenant_id TEXT NOT NULL,
      period TEXT NOT NULL,
      metrics JSONB NOT NULL,
      device_id TEXT,
      app_version TEXT,
      reported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (tenant_id, period)
    )
  `);
};

/** Mantém só as métricas conhecidas, como inteiros não negativos. Devolve null se o relatório for inválido. */
export const sanitizeUsageReport = (report) => {
  const period = String(report?.period || '');
  if (!PERIOD_PATTERN.test(period)) return null;
  const metrics = {};
  for (const key of USAGE_METRICS) {
    const value = Number(report?.metrics?.[key] ?? 0);
    if (!Number.isFinite(value) || value < 0 || value > MAX_METRIC) return null;
    metrics[key] = Math.round(value);
  }
  return { period, metrics };
};

export const currentPeriod = (date = new Date()) => date.toISOString().slice(0, 7);
