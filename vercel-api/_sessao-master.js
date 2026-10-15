import crypto from 'node:crypto';

// Sessões do painel Master. A chave mestra só é enviada para abrir uma sessão (limite apertado e bloqueio por
// tentativas falhadas); o uso normal do painel faz-se com um token aleatório de 256 bits, impossível de adivinhar,
// e por isso com um limite de pedidos largo. O servidor guarda apenas o hash do token.

export const MASTER_SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const TOKEN_PATTERN = /^tms_[A-Za-z0-9_-]{43}$/;

const sha256 = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');
// Mudar a chave mestra no servidor invalida todas as sessões abertas com a anterior.
const secretFingerprint = (masterSecret) => sha256(`tango-master-session:${masterSecret}`);

export const ensureMasterSessionsTable = async (sql) => {
  await sql(`CREATE TABLE IF NOT EXISTS tango_master_sessions (
    token_hash TEXT PRIMARY KEY,
    secret_fingerprint TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    ip TEXT
  )`);
};

export const createMasterSession = async (sql, masterSecret, ip = null) => {
  await ensureMasterSessionsTable(sql);
  await sql('DELETE FROM tango_master_sessions WHERE expires_at <= NOW()');
  const token = `tms_${crypto.randomBytes(32).toString('base64url')}`;
  const expiresAt = new Date(Date.now() + MASTER_SESSION_TTL_MS);
  await sql(`INSERT INTO tango_master_sessions (token_hash, secret_fingerprint, expires_at, ip) VALUES ($1, $2, $3, $4)`,
    [sha256(token), secretFingerprint(masterSecret), expiresAt.toISOString(), ip]);
  return { token, expiresAt: expiresAt.toISOString() };
};

export const isValidMasterSession = async (sql, token, masterSecret) => {
  if (!TOKEN_PATTERN.test(String(token || ''))) return false;
  await ensureMasterSessionsTable(sql);
  const rows = await sql(`SELECT 1 FROM tango_master_sessions
    WHERE token_hash = $1 AND secret_fingerprint = $2 AND expires_at > NOW()`, [sha256(token), secretFingerprint(masterSecret)]);
  return rows.length > 0;
};

export const revokeMasterSession = async (sql, token) => {
  if (!TOKEN_PATTERN.test(String(token || ''))) return;
  await ensureMasterSessionsTable(sql);
  await sql('DELETE FROM tango_master_sessions WHERE token_hash = $1', [sha256(token)]);
};
