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
  // O script inicial da VPS criava esta tabela com outro formato (sem period/metrics) e o CREATE IF NOT EXISTS
  // mantinha-a, pelo que cada relatório falhava (500). Guarda-a com outro nome, sem apagar nada, e cria a certa.
  const columns = await sql(`SELECT column_name FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'tango_usage_reports'`);
  const names = new Set(columns.map(row => row.column_name));
  if (names.size && (!names.has('period') || !names.has('metrics'))) {
    await sql(`ALTER TABLE tango_usage_reports RENAME TO tango_usage_reports_legacy_${Date.now()}`);
    await sql(`DROP INDEX IF EXISTS idx_tango_usage_tenant`);
  }
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
