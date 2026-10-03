import { neon } from '@neondatabase/serverless';
import { applyCors, enforceDistributedRateLimit } from './_security.js';
import { authorizeTenant } from './_autorizacao-empresa.js';
import { ensureUsageTable, sanitizeUsageReport } from './_uso-empresas.js';

// Recebe o resumo mensal agregado de uma empresa (enviado pela app de computador ou pelo navegador
// depois de sincronizar). Autenticado com o código de acesso da empresa, tal como /api/sync.

const send = (res, status, body) => {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-sync-passkey');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.json(body);
};

export default async function handler(req, res) {
  if (!applyCors(req, res)) return send(res, 403, { success: false, message: 'Origem não autorizada.' });
  if (req.method === 'OPTIONS') return send(res, 200, { success: true });
  if (req.method !== 'POST') return send(res, 405, { success: false, message: 'Método não permitido.' });
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return send(res, 503, { success: false, message: 'Servidor ainda não configurado.' });

  const body = req.body || {};
  const tenantId = String(body.tenantId || '').trim();
  const deviceId = String(body.deviceId || '').trim().slice(0, 100);
  const appVersion = String(body.appVersion || '').trim().slice(0, 30);
  const reports = Array.isArray(body.reports) ? body.reports : [];
  if (!tenantId || tenantId.length > 200 || reports.length === 0 || reports.length > 3) {
    return send(res, 400, { success: false, message: 'Relatório de utilização inválido.' });
  }
  const sanitized = reports.map(sanitizeUsageReport);
  if (sanitized.some(report => !report)) return send(res, 400, { success: false, message: 'Relatório de utilização inválido.' });

  const client = neon(databaseUrl);
  const sql = (text, params) => client.query(text, params);
  try {
    if (!await enforceDistributedRateLimit(sql, req, res, { limit: 30, windowMs: 60 * 60_000, scope: 'usage_report' })) return;
    const bearer = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const auth = await authorizeTenant(sql, tenantId, req.headers['x-sync-passkey'] || bearer);
    if (!auth.ok) return send(res, auth.status, { success: false, message: auth.message });

    await ensureUsageTable(sql);
    const canonicalTenant = tenantId.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    for (const report of sanitized) {
      await sql(
        `INSERT INTO tango_usage_reports (tenant_id, period, metrics, device_id, app_version, reported_at)
         VALUES ($1, $2, $3::jsonb, $4, $5, NOW())
         ON CONFLICT (tenant_id, period) DO UPDATE SET metrics = EXCLUDED.metrics, device_id = EXCLUDED.device_id,
           app_version = EXCLUDED.app_version, reported_at = NOW()`,
        [canonicalTenant, report.period, JSON.stringify(report.metrics), deviceId || null, appVersion || null]
      );
    }
    return send(res, 200, { success: true });
  } catch (error) {
    console.error('[usage-report]', error);
    return send(res, 500, { success: false, message: 'Não foi possível registar o relatório.' });
  }
}
