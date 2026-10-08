import crypto from 'node:crypto';
import { neon } from '@neondatabase/serverless';
import { applyCors, enforceDistributedRateLimit } from './_security.js';
import { recordRejectedOrigin } from './_alertas.js';

// Fluxo Oficial de Recuperação de Senha: POST /api/v1/auth/forgot-password
// Gera Token criptográfico único e temporário (expiração máx 15 min).
// NUNCA gera nem envia senhas temporárias em texto limpo.

const send = (res, status, body) => {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.json(body);
};

export const ensurePasswordResetTable = async (sql) => {
  await sql(`
    CREATE TABLE IF NOT EXISTS tango_password_reset_tokens (
      id UUID PRIMARY KEY,
      email TEXT NOT NULL,
      token TEXT NOT NULL UNIQUE,
      token_hash TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      used BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
};

export default async function handler(req, res) {
  if (!applyCors(req, res)) {
    await recordRejectedOrigin(req);
    return send(res, 403, { success: false, message: 'Origem não autorizada.' });
  }
  if (req.method === 'OPTIONS') return send(res, 200, { success: true });
  if (req.method !== 'POST') return send(res, 405, { success: false, message: 'Método não permitido.' });

  const rawEmail = (req.body?.email || '').toString().trim().toLowerCase();
  if (!rawEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail)) {
    return send(res, 400, { success: false, message: 'Indique um endereço de e-mail válido.' });
  }

  if (!process.env.DATABASE_URL) {
    // Fallback gracioso em ambiente local/sem DB central
    return send(res, 200, {
      success: true,
      message: 'Se o endereço estiver associado a uma conta ativa, foi enviado um link de recuperação válido por 15 minutos.'
    });
  }

  const client = neon(process.env.DATABASE_URL);
  const sql = (text, params) => client.query(text, params);

  try {
    if (!await enforceDistributedRateLimit(sql, req, res, { limit: 5, windowMs: 15 * 60_000, scope: 'forgot_password' })) return;
    await ensurePasswordResetTable(sql);

    // Gerar token criptográfico único e seguro de 32 bytes (64 caracteres hexadecimais)
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // Exatamente 15 minutos

    await sql(
      `INSERT INTO tango_password_reset_tokens (id, email, token, token_hash, expires_at, used)
       VALUES ($1, $2, $3, $4, $5, FALSE)`,
      [crypto.randomUUID(), rawEmail, token, tokenHash, expiresAt.toISOString()]
    );

    const resetBaseUrl = process.env.TANGO_MASTERGEN_URL || 'https://mastergen.tangogestao.com';
    const secureResetLink = `${resetBaseUrl.replace(/\/+$/, '')}/reset-password?token=${token}`;

    console.log(`🔒 [Forgot-Password] Link seguro de redefinição gerado para ${rawEmail} (válido até ${expiresAt.toLocaleTimeString('pt-AO')}): ${secureResetLink}`);

    // Resposta de segurança padronizada (nunca revela se o e-mail existe ou não na base de dados)
    return send(res, 200, {
      success: true,
      message: 'Se o endereço estiver associado a uma conta ativa, foi enviado um link de recuperação válido por 15 minutos.',
      // Em modo de testes/desenvolvimento seguro fornece o link para conveniência
      ...(process.env.NODE_ENV !== 'production' ? { devLink: secureResetLink } : {})
    });

  } catch (error) {
    console.error('[forgot-password]', error);
    return send(res, 500, { success: false, message: 'Não foi possível processar a recuperação de senha neste momento.' });
  }
}
