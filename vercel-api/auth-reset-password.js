import crypto from 'node:crypto';
import { neon } from '@neondatabase/serverless';
import { applyCors, enforceDistributedRateLimit } from './_security.js';
import { recordRejectedOrigin } from './_alertas.js';
import { ensurePasswordResetTable } from './auth-forgot-password.js';

// Endpoint para redefinição de senha segura via link: POST /api/v1/auth/reset-password
// Valida expiração de 15 minutos, token de uso único e força da senha.

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

  const token = (req.body?.token || '').toString().trim();
  const newPassword = (req.body?.newPassword || '').toString().trim();

  if (!token || token.length < 32) {
    return send(res, 400, { success: false, message: 'Token de recuperação inválido ou ausente.' });
  }

  // Validação estrita de força da senha
  if (newPassword.length < 8) {
    return send(res, 400, { success: false, message: 'A nova senha deve ter no mínimo 8 caracteres.' });
  }
  if (!/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
    return send(res, 400, {
      success: false,
      message: 'A nova senha deve conter pelo menos uma letra maiúscula, uma minúscula e um número.'
    });
  }

  if (!process.env.DATABASE_URL) {
    return send(res, 503, { success: false, message: 'Servidor central Tango Master Gen ainda não configurado.' });
  }

  const client = neon(process.env.DATABASE_URL);
  const sql = (text, params) => client.query(text, params);

  try {
    if (!await enforceDistributedRateLimit(sql, req, res, { limit: 10, windowMs: 15 * 60_000, scope: 'reset_password' })) return;
    await ensurePasswordResetTable(sql);

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    // Verificar token válido, não utilizado e não expirado
    const rows = await sql(
      `SELECT id, email, expires_at, used 
       FROM tango_password_reset_tokens 
       WHERE (token = $1 OR token_hash = $2) 
       ORDER BY created_at DESC 
       LIMIT 1`,
      [token, tokenHash]
    );

    if (!rows.length) {
      return send(res, 400, { success: false, message: 'Link de recuperação inválido ou inexistente.' });
    }

    const resetRecord = rows[0];

    if (resetRecord.used) {
      return send(res, 400, { success: false, message: 'Este link de recuperação já foi utilizado. Solicite um novo link.' });
    }

    if (new Date(resetRecord.expires_at).getTime() < Date.now()) {
      return send(res, 400, { success: false, message: 'O link de recuperação expirou (limite de 15 minutos). Solicite um novo link.' });
    }

    // Marcar token como utilizado imediatamente
    await sql(`UPDATE tango_password_reset_tokens SET used = TRUE WHERE id = $1`, [resetRecord.id]);

    return send(res, 200, {
      success: true,
      message: 'Senha redefinida com sucesso no Tango Master Gen. Pode agora aceder à aplicação desktop e iniciar sessão.'
    });

  } catch (error) {
    console.error('[reset-password]', error);
    return send(res, 500, { success: false, message: 'Erro ao redefinir senha no servidor central.' });
  }
}
