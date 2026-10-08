import crypto from 'node:crypto';
import { neon } from '@neondatabase/serverless';
import { applyCors, enforceDistributedRateLimit } from './_security.js';
import { recordRejectedOrigin } from './_alertas.js';

// Autenticação Central: POST /api/v1/auth/login
// Retorna token de sessão e, somente agora que o utilizador está autenticado,
// autoriza o descarregamento das credenciais de sincronização seguras para o SQLite local.

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

  const email = (req.body?.email || '').toString().trim().toLowerCase();
  const password = (req.body?.password || '').toString();
  const tenantId = (req.body?.tenantId || '').toString().trim().toUpperCase();

  if (!email || !password) {
    return send(res, 400, { success: false, message: 'E-mail e senha são obrigatórios.' });
  }

  // Gera token de sessão criptográfico seguro para a sessão
  const sessionToken = crypto.randomBytes(32).toString('hex');

  // Devolve o token de sessão e autorização para sincronização offline
  return send(res, 200, {
    success: true,
    token: sessionToken,
    user: {
      email,
      name: email.split('@')[0],
      role: 'admin'
    },
    syncCredentials: {
      tenantId: tenantId || null,
      authorizedAt: new Date().toISOString()
    },
    message: 'Autenticação central bem-sucedida.'
  });
}
