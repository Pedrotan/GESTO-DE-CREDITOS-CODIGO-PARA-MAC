import crypto from 'node:crypto';
import { neon } from '@neondatabase/serverless';
import { applyCors, enforceDistributedRateLimit } from './_security.js';
import { recordRejectedOrigin } from './_alertas.js';
import {
  ensureCompanyEmailVerificationTable,
  issueCompanyEmailVerification,
  verifyCompanyEmailToken,
} from './_email-verification.js';

const send = (res, status, body) => {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.json(body);
};

const normalizeRows = (result) => {
  if (Array.isArray(result)) return result;
  if (result && Array.isArray(result.rows)) return result.rows;
  if (result) return [result];
  return [];
};

const ensureRegistrationRequest = async (sql, requestId, nif) => {
  const rows = await sql(`SELECT id, nif, email, status FROM tango_registration_requests WHERE id = $1 AND nif = $2 LIMIT 1`, [requestId, nif]);
  return normalizeRows(rows)[0] || null;
};

export default async function handler(req, res) {
  if (!applyCors(req, res)) {
    await recordRejectedOrigin(req);
    return send(res, 403, { success: false, message: 'Origem não autorizada.' });
  }
  if (req.method === 'OPTIONS') return send(res, 200, { success: true });

  if (!process.env.DATABASE_URL) {
    return send(res, 503, { success: false, message: 'Base de dados central ainda não configurada.' });
  }

  const client = neon(process.env.DATABASE_URL);
  const sql = (text, params) => client.query(text, params);

  try {
    await ensureCompanyEmailVerificationTable(sql);

    if (req.method === 'POST') {
      const body = req.body || {};
      const requestId = String(body.requestId || '').trim();
      const nif = String(body.nif || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
      const email = String(body.email || '').trim().toLowerCase();

      if (!requestId || !nif || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)) {
        return send(res, 400, { success: false, message: 'Pedido, NIF ou endereço de e-mail inválidos.' });
      }

      if (!await enforceDistributedRateLimit(sql, req, res, { limit: 6, windowMs: 60 * 60_000, scope: 'company_email_verification' })) return;

      const request = await ensureRegistrationRequest(sql, requestId, nif);
      if (!request) {
        return send(res, 404, { success: false, message: 'Pedido de onboarding não encontrado.' });
      }
      if (request.status === 'rejected') {
        return send(res, 409, { success: false, message: 'Este pedido foi rejeitado e não pode emitir novo link.' });
      }
      if (request.email && request.email.toLowerCase() !== email) {
        return send(res, 409, { success: false, message: 'O endereço fornecido não corresponde ao pedido de onboarding.' });
      }

      const result = await issueCompanyEmailVerification({
        sql,
        requestId,
        nif,
        email,
        appUrl: process.env.APP_URL || 'https://tangogestaoecreditos.tech',
      });

      if (!result.success) {
        return send(res, result.reason === 'rate_limited' ? 429 : 400, {
          success: false,
          code: result.reason,
          message: result.message,
        });
      }

      return send(res, 200, {
        success: true,
        message: 'Pedido de confirmação de e-mail registado com sucesso.',
        requestId,
        email,
        expiresAt: result.expiresAt,
        emailVerification: {
          status: result.delivery?.sent ? 'sent' : 'pending',
          expiresAt: result.expiresAt,
          message: result.delivery?.sent ? 'Link de confirmação preparado e entregue pelo serviço de e-mail configurado.' : 'O envio de e-mail está desativado ou não configurado; o pedido continua pendente de confirmação operacional.'
        }
      });
    }

    if (req.method === 'GET') {
      const { token, requestId, request, nif } = req.query || {};
      const normalizedRequestId = String(requestId || request || '').trim();
      if (!token || !normalizedRequestId || !nif) {
        return send(res, 400, { success: false, message: 'Parâmetros inválidos.' });
      }
      const result = await verifyCompanyEmailToken({ sql, token, requestId: normalizedRequestId, nif });
      if (!result.success) {
        return send(res, result.reason === 'used' || result.reason === 'invalid' || result.reason === 'expired' ? 400 : 409, {
          success: false,
          code: result.reason,
          message: result.message,
        });
      }
      return send(res, 200, {
        success: true,
        verified: true,
        emailVerified: true,
        requestId: result.requestId,
        nif: result.nif,
        email: result.email,
        message: result.message,
      });
    }

    return send(res, 405, { success: false, message: 'Método não permitido.' });
  } catch (error) {
    console.error('[company-email-verification]', error);
    return send(res, 500, { success: false, message: 'Não foi possível processar a verificação do e-mail.' });
  }
}
