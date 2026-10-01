import { applyCors } from './_security.js';
import { neon } from '@neondatabase/serverless';

const send = (res, status, body) => {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.json(body);
};

export default async function handler(req, res) {
  if (!applyCors(req, res)) return send(res, 403, { success: false, message: 'Origem não autorizada.' });
  if (req.method === 'OPTIONS') return send(res, 200, { success: true });
  if (req.method !== 'GET' && req.method !== 'POST') return send(res, 405, { success: false, message: 'Método não permitido.' });

  const databaseUrl = process.env.DATABASE_URL;
  const defaultTenant = process.env.DEFAULT_TENANT_ID || '5417106080';
  const defaultPasskey = process.env.DEFAULT_SYNC_PASSKEY || process.env.TANGO_SYNC_SECRET || 'TangoSync#2026!Live';

  let companyName = 'Tango Gestão de Créditos';
  let activeTenantId = defaultTenant;

  if (databaseUrl) {
    try {
      const client = neon(databaseUrl);
      const rows = await client.query(`
        SELECT tenant_id, name 
        FROM tango_tenants 
        WHERE status = 'active' 
        ORDER BY CASE WHEN tenant_id = $1 THEN 0 ELSE 1 END, created_at ASC 
        LIMIT 1
      `, [defaultTenant]);

      if (rows && rows.length > 0) {
        activeTenantId = rows[0].tenant_id || defaultTenant;
        if (rows[0].name) {
          companyName = rows[0].name;
        }
      }
    } catch (e) {
      console.error('[tenant-bootstrap]', e);
    }
  }

  return send(res, 200, {
    success: true,
    configured: Boolean(activeTenantId && defaultPasskey),
    tenantId: activeTenantId,
    syncPasskey: defaultPasskey,
    companyName
  });
}
