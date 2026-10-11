import { applyCors } from './_security.js';
import { recordRejectedOrigin } from './_alertas.js';

// Autenticação Central: POST /api/v1/auth/login
// Sem utilizadores no servidor, as credenciais não podem ser validadas aqui: o endpoint recusa sempre.

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

  if (!email || !password) {
    return send(res, 400, { success: false, message: 'E-mail e senha são obrigatórios.' });
  }

  // O servidor não guarda utilizadores nem palavras-passe: não pode validar credenciais. Antes este endpoint
  // devolvia sucesso (perfil admin) para qualquer email/senha; recusar sempre, sem emitir token.
  return send(res, 501, {
    success: false,
    code: 'CENTRAL_LOGIN_UNAVAILABLE',
    message: 'Os utilizadores da empresa ainda não estão disponíveis neste navegador. O início de sessão é feito com os utilizadores existentes neste dispositivo.'
  });
}
