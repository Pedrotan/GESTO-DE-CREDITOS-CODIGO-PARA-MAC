import crypto from 'node:crypto';
import nodemailer from 'nodemailer';

export const EMAIL_VERIFICATION_TTL_MS = 30 * 60 * 1000;
export const EMAIL_VERIFICATION_RESEND_MIN_MS = 60 * 1000;

const toIso = (time) => new Date(time).toISOString();
const sha256 = value => crypto.createHash('sha256').update(String(value)).digest('hex');

const normalizeSql = (sql) => {
  if (typeof sql === 'function') return sql;
  if (sql && typeof sql.query === 'function') return (query, params) => sql.query(query, params);
  if (sql && typeof sql.begin === 'function') return sql;
  if (sql && typeof sql.transaction === 'function') return sql;
  throw new TypeError('sql is not a function');
};

const withSqlTransaction = async (sql, callback) => {
  if (sql && typeof sql.begin === 'function') {
    return sql.begin(async (tx) => callback(normalizeSql(tx)));
  }
  if (sql && typeof sql.transaction === 'function') {
    return sql.transaction(async (tx) => callback(normalizeSql(tx)));
  }
  return callback(normalizeSql(sql));
};

const normalizeEmail = value => String(value || '').trim().toLowerCase();
const normalizeRows = (result) => {
  if (Array.isArray(result)) return result;
  if (result && Array.isArray(result.rows)) return result.rows;
  if (result) return [result];
  return [];
};
const isAllowedEmail = value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(String(value || '').trim());

const buildVerificationLink = ({ appUrl, token, requestId, nif }) => {
  const base = String(appUrl || '').replace(/\/+$/, '');
  const safeToken = encodeURIComponent(String(token || ''));
  const safeRequest = encodeURIComponent(String(requestId || ''));
  const safeNif = encodeURIComponent(String(nif || ''));
  return `${base}/#/verify-company-email?token=${safeToken}&request=${safeRequest}&nif=${safeNif}`;
};

export const canSendEmail = () => {
  const enabled = String(process.env.MAIL_ENABLED || '').trim().toLowerCase() === 'true';
  if (!enabled) return { enabled: false, reason: 'smtp_disabled' };
  const host = String(process.env.MAIL_HOST || '').trim();
  const user = String(process.env.MAIL_USERNAME || '').trim();
  const pass = String(process.env.MAIL_PASSWORD || '');
  const from = String(process.env.MAIL_FROM_ADDRESS || '').trim();
  if (!host || !user || !pass || !from) {
    return { enabled: false, reason: 'smtp_unconfigured' };
  }
  return { enabled: true };
};

export const sendVerificationEmail = async ({ email, token, requestId, nif, appUrl }) => {
  const config = canSendEmail();
  if (!config.enabled) {
    return { sent: false, status: config.reason };
  }

  const transporter = globalThis.__TANGO_TEST_TRANSPORT__ || nodemailer.createTransport({
    host: process.env.MAIL_HOST,
    port: Number(process.env.MAIL_PORT || 587),
    secure: String(process.env.MAIL_ENCRYPTION || '').trim().toLowerCase() === 'tls',
    requireTLS: String(process.env.MAIL_ENCRYPTION || '').trim().toLowerCase() === 'starttls',
    auth: { user: process.env.MAIL_USERNAME, pass: process.env.MAIL_PASSWORD },
    tls: { rejectUnauthorized: true, minVersion: 'TLSv1.2' },
  });

  try {
    const info = await transporter.sendMail({
      from: process.env.MAIL_FROM_ADDRESS,
      to: email,
      subject: 'Confirme o endereço de e-mail da sua empresa',
      text: `Confirme o seu endereço de e-mail para continuar o onboarding.\n${buildVerificationLink({ appUrl, token, requestId, nif })}`,
      html: `<p>Confirme o seu endereço de e-mail para continuar o onboarding.</p><p><a href="${buildVerificationLink({ appUrl, token, requestId, nif })}">Confirmar e-mail</a></p>`,
    });
    return { sent: true, status: 'sent', messageId: info?.messageId || null };
  } catch (error) {
    return { sent: false, status: 'smtp_failed', message: 'Falha no transporte de e-mail.' };
  }
};

export const createSafelistedAuditCard = ({ tokenHash, requestId, companyNif, email, result }) => ({
  tokenHash,
  requestId,
  companyNif,
  email,
  result,
  message: `Verificação de e-mail ${result} para pedido ${requestId} da empresa ${companyNif}; token hash ${tokenHash}; endereço ${email}.`,
});

export const ensureCompanyEmailVerificationTable = async (sql) => {
  const db = normalizeSql(sql);
  await db(`
    CREATE TABLE IF NOT EXISTS tango_company_email_verifications (
      id TEXT PRIMARY KEY,
      request_id TEXT NOT NULL,
      nif TEXT NOT NULL,
      email TEXT NOT NULL,
      token_hash TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      used BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  try { await db(`CREATE INDEX IF NOT EXISTS idx_company_email_verification_request ON tango_company_email_verifications (request_id, nif);`); } catch {}
  try { await db(`CREATE INDEX IF NOT EXISTS idx_company_email_verification_expiry ON tango_company_email_verifications (expires_at, used);`); } catch {}
};

export const issueCompanyEmailVerification = async ({
  sql,
  requestId,
  nif,
  email,
  appUrl,
  ttlMs = EMAIL_VERIFICATION_TTL_MS,
  resendLimitMs = EMAIL_VERIFICATION_RESEND_MIN_MS,
  now = Date.now(),
}) => {
  const cleanNif = String(nif || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  const cleanEmail = normalizeEmail(email);

  if (!cleanNif || !cleanEmail || !isAllowedEmail(cleanEmail)) {
    return { success: false, reason: 'invalid_request', message: 'Pedido de verificação inválido.' };
  }

  if (!appUrl || !/^https:\/\//u.test(appUrl)) {
    return { success: false, reason: 'invalid_url', message: 'URL de confirmação inválida.' };
  }

  const issued = await withSqlTransaction(sql, async (db) => {
    const recentResult = await db(
      `SELECT id, created_at, last_requested_at
       FROM tango_company_email_verifications
       WHERE request_id = $1 AND nif = $2 AND used = FALSE
       ORDER BY created_at DESC
       LIMIT 1`,
      [requestId, cleanNif]
    );
    const recent = normalizeRows(recentResult);
    const lastRequestedAt = recent[0]?.last_requested_at ? new Date(recent[0].last_requested_at).getTime() : 0;
    if (recent.length && now - lastRequestedAt < resendLimitMs) {
      return { success: false, reason: 'rate_limited', message: 'Solicitação repetida demasiado cedo.' };
    }

    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = sha256(token);
    const expiresAt = toIso(now + ttlMs);
    const id = crypto.randomUUID();

    await db(
      `INSERT INTO tango_company_email_verifications (id, request_id, nif, email, token_hash, expires_at, used, created_at, last_requested_at)
       VALUES ($1, $2, $3, $4, $5, $6, FALSE, NOW(), NOW())`,
      [id, requestId, cleanNif, cleanEmail, tokenHash, expiresAt]
    );

    return {
      success: true,
      reason: 'issued',
      requestId,
      nif: cleanNif,
      email: cleanEmail,
      token,
      tokenHash,
      expiresAt,
    };
  });

  if (!issued.success) {
    return issued;
  }

  const delivery = await sendVerificationEmail({ email: cleanEmail, token: issued.token, requestId, nif: cleanNif, appUrl });

  return {
    ...issued,
    delivery,
    message: delivery.sent ? 'Link de verificação do endereço de e-mail gerado com sucesso.' : 'Pedido registado. O processo de envio de e-mail está desativado ou não configurado; o link não foi divulgado ao cliente.',
  };
};

export const verifyCompanyEmailToken = async ({
  sql,
  token,
  requestId,
  nif,
  now = Date.now(),
}) => {
  const cleanToken = String(token || '').trim();
  const cleanNif = String(nif || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  const cleanRequestId = String(requestId || '').trim();

  if (!cleanToken || !cleanNif || !cleanRequestId) {
    return { success: false, reason: 'invalid', message: 'Token ou pedido inválidos.' };
  }

  const tokenHash = sha256(cleanToken);

  return withSqlTransaction(sql, async (db) => {
    const rows = await db(
      `SELECT id, request_id, nif, email, token_hash, expires_at, used
       FROM tango_company_email_verifications
       WHERE token_hash = $1
       ORDER BY created_at DESC
       LIMIT 1
       FOR UPDATE`,
      [tokenHash]
    );

    const row = normalizeRows(rows)[0] || null;
    if (!row) {
      return { success: false, reason: 'invalid', message: 'Token inválido.' };
    }
    if (row.request_id !== cleanRequestId || row.nif !== cleanNif) {
      return { success: false, reason: 'wrong_request', message: 'Token não corresponde a este pedido ou empresa.' };
    }
    if (row.used) {
      return { success: false, reason: 'used', message: 'Este token já foi utilizado.' };
    }
    if (new Date(row.expires_at).getTime() < now) {
      return { success: false, reason: 'expired', message: 'Este token expirou.' };
    }

    const updated = await db(
      `UPDATE tango_company_email_verifications
       SET used = TRUE, last_requested_at = NOW()
       WHERE id = $1 AND used = FALSE
       RETURNING id, request_id, nif, email, expires_at`,
      [row.id]
    );

    if (!normalizeRows(updated).length) {
      return { success: false, reason: 'used', message: 'Este token já foi utilizado.' };
    }

    const registrationRows = await db(
      `UPDATE tango_registration_requests
         SET email_verified = TRUE,
             email_verified_at = NOW(),
             updated_at = NOW()
       WHERE id = $1 AND nif = $2 AND status = 'pending'
       RETURNING id`,
      [row.request_id, row.nif]
    );

    if (!normalizeRows(registrationRows).length) {
      return { success: false, reason: 'rejected_or_processed', message: 'Este pedido não está pendente ou já foi processado.' };
    }

    return {
      success: true,
      reason: 'verified',
      verified: true,
      emailVerified: true,
      requestId: row.request_id,
      nif: row.nif,
      email: row.email,
      expiresAt: row.expires_at,
      message: 'Endereço de e-mail confirmado com sucesso.',
    };
  });
};
