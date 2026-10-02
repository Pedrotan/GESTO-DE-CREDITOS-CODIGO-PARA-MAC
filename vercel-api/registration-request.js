import crypto from 'node:crypto';
import { neon } from '@neondatabase/serverless';
import { applyCors, enforceDistributedRateLimit } from './_security.js';
import { ensureRegistrationRequestsTable, parseRegistrationRequest } from './_pedidos-cadastro.js';

// Recebe pedidos de cadastro de empresas a partir da página pública da versão web.

const send = (res, status, body) => {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.json(body);
};

export default async function handler(req, res) {
  if (!applyCors(req, res)) return send(res, 403, { success: false, message: 'Origem não autorizada.' });
  if (req.method === 'OPTIONS') return send(res, 200, { success: true });
  if (req.method !== 'POST') return send(res, 405, { success: false, message: 'Método não permitido.' });
  if (!process.env.DATABASE_URL) {
    return send(res, 503, { success: false, message: 'Servidor central ainda não configurado.' });
  }

  const parsed = parseRegistrationRequest(req.body);
  if (parsed.error) return send(res, 400, { success: false, message: parsed.error });
  const request = parsed.value;

  const client = neon(process.env.DATABASE_URL);
  const sql = (text, params) => client.query(text, params);
  try {
    if (!await enforceDistributedRateLimit(sql, req, res, { limit: 5, windowMs: 60 * 60_000, scope: 'registration_request' })) return;
    await ensureRegistrationRequestsTable(sql);

    let registered = [];
    try {
      registered = await sql('SELECT 1 FROM tango_tenants WHERE UPPER(tenant_id) = $1', [request.nif]);
    } catch (error) {
      if (!/does not exist/iu.test(String(error?.message))) throw error;
    }
    if (registered.length) {
      return send(res, 409, {
        success: false,
        code: 'ALREADY_REGISTERED',
        message: 'Esta empresa já está cadastrada. Use "Iniciar sessão" com o Código de Acesso da empresa.'
      });
    }

    // Um pedido pendente por NIF: um novo envio atualiza os dados em vez de duplicar.
    const pending = await sql(`SELECT id FROM tango_registration_requests WHERE nif = $1 AND status = 'pending' LIMIT 1`, [request.nif]);
    const values = [request.nif, request.companyName, request.contactName, request.phone, request.email, request.message];
    if (pending.length) {
      await sql(`UPDATE tango_registration_requests SET company_name = $3, contact_name = $4, phone = $5,
                 email = $6, message = $7, updated_at = NOW() WHERE id = $1 AND nif = $2`, [pending[0].id, ...values]);
    } else {
      await sql(`INSERT INTO tango_registration_requests (id, nif, company_name, contact_name, phone, email, message)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)`, [crypto.randomUUID(), ...values]);
    }
    return send(res, 200, {
      success: true,
      message: 'Pedido de cadastro enviado. O administrador irá contactá-lo com o Código de Acesso da sua empresa.'
    });
  } catch (error) {
    console.error('[registration-request]', error);
    return send(res, 500, { success: false, message: 'Não foi possível enviar o pedido neste momento.' });
  }
}
