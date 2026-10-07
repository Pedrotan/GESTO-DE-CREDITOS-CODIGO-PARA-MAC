import { authorizeTenant } from './_autorizacao-empresa.js';
import { lookupConfiguredProvider } from './_document-provider.js';
import { applyCors, enforceDistributedRateLimit, requireSecret } from './_security.js';
import { clearAuthFailures, LOCKOUT_POLICIES, lockoutRemaining, recordRejectedOrigin, recordSecurityEvent, registerAuthFailure } from './_alertas.js';

const send = (res, status, body) => {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.json(body);
};

export default async function handler(req, res) {
  if (!applyCors(req, res)) {
    await recordRejectedOrigin(req);
    return send(res, 403, { success: false, message: 'Origem não autorizada.' });
  }
  if (req.method === 'OPTIONS') return send(res, 200, { success: true });
  if (req.method !== 'GET') return send(res, 405, { success: false, message: 'Método não permitido.' });
  if (!process.env.DATABASE_URL) return send(res, 503, { success: false, message: 'Consulta de documentos ainda não configurada.' });
  let sql;
  try {
    const { neon } = await import('@neondatabase/serverless');
    const client = neon(process.env.DATABASE_URL);
    sql = (text, params) => client.query(text, params);
    if (!await enforceDistributedRateLimit(sql, req, res, { limit: 30, windowMs: 60_000, scope: 'lookup' })) return;
  } catch (error) {
    console.error('[lookup][rate-limit]', error);
    return send(res, 503, { success: false, message: 'O controlo de acesso está indisponível.' });
  }
  // Aceita a chave dedicada de consulta ou a chave mestra usada pelo painel Tango Master. Quem enviou uma
  // chave (Authorization ou x-master-secret) e falhou conta para o mesmo bloqueio da chave mestra.
  const sentSecret = Boolean(req.headers.authorization || req.headers['x-master-secret'] || req.headers['x-api-key']);
  if (sentSecret) {
    const remaining = await lockoutRemaining(sql, req, { scope: 'master' });
    if (remaining > 0) {
      res.setHeader('Retry-After', String(remaining));
      return send(res, 429, { success: false, message: 'Acesso bloqueado por tentativas falhadas.' });
    }
  }
  let authorized = requireSecret(req, process.env.TANGO_LOOKUP_API_KEY) ||
    requireSecret(req, process.env.TANGO_MASTER_SECRET, 'x-master-secret');
  if (!authorized && sentSecret) {
    await registerAuthFailure(sql, req, { scope: 'master', type: 'master_secret_failed', title: 'Chave errada na consulta de documentos',
      details: 'Pedido à consulta de BI/NIF com uma chave de API ou chave mestra inválida.', ipPolicy: LOCKOUT_POLICIES.master });
  }
  if (!authorized && req.headers['x-tenant-id'] && req.headers['x-sync-passkey']) {
    const access = await authorizeTenant(sql, String(req.headers['x-tenant-id']), String(req.headers['x-sync-passkey']), req);
    if (!access.ok) return send(res, access.status, { success: false, message: access.message });
    authorized = true;
  }
  if (!authorized) {
    await recordSecurityEvent(req, { type: 'unauthenticated_request', severity: 'medium', title: 'Consulta de documentos sem autenticação',
      details: 'Pedido à consulta de BI/NIF sem chave válida.' }, sql);
    return send(res, 401, { success: false, message: 'Autenticação obrigatória. Ligue primeiro a empresa ou configure a chave mestra.' });
  }

  const document = String(req.query?.document || '').trim().toUpperCase().replace(/\s+/g, '');
  const type = String(req.query?.type || 'SINGULAR').toUpperCase();
  const isCompany = type === 'COLECTIVO';
  if (!/^[0-9A-Z]{9,20}$/.test(document)) {
    return send(res, 400, { success: false, message: 'Número de documento inválido.' });
  }

  const providerResult = await lookupConfiguredProvider(document, type);
  return send(res, providerResult.success ? 200 : providerResult.code === 'DOCUMENT_NOT_FOUND' ? 404 : 503, {
    ...providerResult,
    officialLinks: {
      minfin: 'https://portaldocontribuinte.minfin.gov.ao/consultar-nif-do-contribuinte',
      sepe: 'https://sepe.gov.ao/catalogo/eservicos/consulta-de-nif'
    }
  });
}
