import crypto from 'node:crypto';
import { neon } from '@neondatabase/serverless';
import { applyCors, enforceDistributedRateLimit } from './_security.js';
import { recordRejectedOrigin } from './_alertas.js';
import { ensureRegistrationRequestsTable, parseRegistrationRequest } from './_pedidos-cadastro.js';

// Endpoint Blindado de Onboarding: POST /api/v1/companies/onboarding
// Rejeita a requisição com HTTP 403 / 409 se a empresa já estiver com status ACTIVE no servidor central.

const send = (res, status, body) => {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
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
    return send(res, 503, { success: false, message: 'Servidor central Tango Master Gen ainda não configurado.' });
  }

  const parsed = parseRegistrationRequest(req.body);
  if (parsed.error) return send(res, 400, { success: false, message: parsed.error });
  const request = parsed.value;

  const client = neon(process.env.DATABASE_URL);
  const sql = (text, params) => client.query(text, params);

  try {
    if (!await enforceDistributedRateLimit(sql, req, res, { limit: 10, windowMs: 60 * 60_000, scope: 'company_onboarding' })) return;
    await ensureRegistrationRequestsTable(sql);

    // REGRA DE SEGURANÇA CRÍTICA: Se a empresa já existir com status 'active', rejeitar com 409 Conflict / 403 Forbidden
    let existingActive = [];
    try {
      existingActive = await sql(
        `SELECT tenant_id, name, status FROM tango_tenants WHERE UPPER(tenant_id) = $1 AND status = 'active' LIMIT 1`,
        [request.nif]
      );
    } catch (error) {
      if (!/does not exist/iu.test(String(error?.message))) throw error;
    }

    if (existingActive.length > 0) {
      return send(res, 409, {
        success: false,
        code: 'ALREADY_ACTIVE',
        error: 'EMPRESA_JA_ATIVA',
        message: 'Esta empresa já se encontra registada e com estado ACTIVE no Tango Master Gen. O registo inicial está bloqueado. Por favor, aceda à tela de Login.'
      });
    }

    // Se não for ativa, salvar ou atualizar o registo de pedido pendente
    const pending = await sql(
      `SELECT id FROM tango_registration_requests WHERE nif = $1 AND status = 'pending' LIMIT 1`,
      [request.nif]
    );

    const values = [request.nif, request.companyName, request.contactName, request.phone, request.email, request.message];
    if (pending.length) {
      await sql(
        `UPDATE tango_registration_requests 
         SET company_name = $3, contact_name = $4, phone = $5, email = $6, message = $7, updated_at = NOW() 
         WHERE id = $1 AND nif = $2`,
        [pending[0].id, ...values]
      );
    } else {
      await sql(
        `INSERT INTO tango_registration_requests (id, nif, company_name, contact_name, phone, email, message, status) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')`,
        [crypto.randomUUID(), ...values]
      );
    }

    return send(res, 201, {
      success: true,
      status: 'PENDING',
      message: 'Registo de onboarding submetido com sucesso. O administrador do Tango Master Gen irá validar a empresa.'
    });

  } catch (error) {
    console.error('[onboarding-blindado]', error);
    return send(res, 500, { success: false, message: 'Não foi possível submeter o onboarding neste momento.' });
  }
}
