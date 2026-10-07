import { neon } from '@neondatabase/serverless';
import { applyCors, enforceDistributedRateLimit } from './_security.js';
import { clearAuthFailures, LOCKOUT_POLICIES, lockoutRemaining, recordRejectedOrigin, recordSecurityEvent, registerAuthFailure } from './_alertas.js';
import { normalizeNif } from './_pedidos-cadastro.js';

// Indica se um NIF tem empresa registada no Tango Master, sem revelar códigos de acesso.
// Usado pela página inicial da versão web para decidir entre login e ativação.

const send = (res, status, body) => {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.json(body);
};

export default async function handler(req, res) {
  if (!applyCors(req, res)) {
    await recordRejectedOrigin(req);
    return send(res, 403, { success: false, message: 'Origem não autorizada.' });
  }
  if (req.method === 'OPTIONS') return send(res, 200, { success: true });
  if (req.method !== 'POST') return send(res, 405, { success: false, message: 'Método não permitido.' });
  if (!process.env.DATABASE_URL) {
    return send(res, 503, { success: false, message: 'Servidor central ainda não configurado.' });
  }

  const nif = normalizeNif(req.body?.nif);
  if (!/^[0-9A-Z]{9,20}$/u.test(nif)) {
    return send(res, 400, { success: false, message: 'Indique um NIF ou BI válido.' });
  }

  const client = neon(process.env.DATABASE_URL);
  const sql = (text, params) => client.query(text, params);
  try {
    if (!await enforceDistributedRateLimit(sql, req, res, { limit: 20, windowMs: 60_000, scope: 'company_status' })) return;

    let rows = [];
    try {
      rows = await sql('SELECT name, status, expires_at FROM tango_tenants WHERE UPPER(tenant_id) = $1', [nif]);
    } catch (error) {
      // Tabela ainda inexistente: nenhuma empresa foi registada.
      if (!/does not exist/iu.test(String(error?.message))) throw error;
    }
    if (!rows.length) return send(res, 200, { success: true, status: 'not_registered' });

    const tenant = rows[0];
    const expired = tenant.expires_at && new Date(tenant.expires_at).getTime() < Date.now();
    const status = tenant.status === 'blocked' ? 'blocked' : expired ? 'expired' : 'active';
    return send(res, 200, { success: true, status, companyName: tenant.name });
  } catch (error) {
    console.error('[company-status]', error);
    return send(res, 500, { success: false, message: 'Não foi possível verificar a empresa neste momento.' });
  }
}
