import crypto from 'node:crypto';

// Detecção de intrusões da API: regista cada tentativa suspeita (origem não autorizada, chave errada,
// excesso de pedidos, força bruta), agrupa repetições, bloqueia temporariamente quem insiste e, quando
// configurado, envia o alerta para um webhook (TANGO_SECURITY_WEBHOOK_URL) — por exemplo um canal de
// mensagens da equipa. Os alertas ficam visíveis no Painel Master (Segurança).

const SEVERITIES = ['low', 'medium', 'high', 'critical'];
const raise = (severity) => SEVERITIES[Math.min(SEVERITIES.length - 1, SEVERITIES.indexOf(severity) + 1)];

/** IP real do cliente: na Vercel, x-vercel-forwarded-for é definido pela plataforma e não pode ser falsificado. */
export const clientIp = (req) => String(
  req?.headers?.['x-vercel-forwarded-for'] || req?.headers?.['x-real-ip'] || req?.headers?.['x-forwarded-for'] || req?.socket?.remoteAddress || 'unknown',
).split(',')[0].trim().slice(0, 64);

const sha256 = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');

let sharedSql = null;
const getSql = async () => {
  if (!process.env.DATABASE_URL) return null;
  if (!sharedSql) {
    const { neon } = await import('@neondatabase/serverless');
    const client = neon(process.env.DATABASE_URL);
    sharedSql = (text, params) => client.query(text, params);
  }
  return sharedSql;
};

let tablesReady = false;
export const ensureSecurityTables = async (sql) => {
  if (tablesReady) return;
  await sql(`CREATE TABLE IF NOT EXISTS security_events (
    id TEXT PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    type TEXT NOT NULL,
    severity TEXT NOT NULL,
    title TEXT NOT NULL,
    details TEXT,
    ip TEXT,
    path TEXT,
    subject TEXT,
    user_agent TEXT,
    count INTEGER NOT NULL DEFAULT 1,
    acknowledged BOOLEAN NOT NULL DEFAULT FALSE
  )`);
  await sql('CREATE INDEX IF NOT EXISTS idx_security_events_seen ON security_events (last_seen DESC)');
  await sql(`CREATE TABLE IF NOT EXISTS security_lockouts (
    key_hash TEXT PRIMARY KEY,
    failures INTEGER NOT NULL,
    window_start TIMESTAMPTZ NOT NULL,
    locked_until TIMESTAMPTZ
  )`);
  tablesReady = true;
};

const sendWebhook = async (event) => {
  const target = String(process.env.TANGO_SECURITY_WEBHOOK_URL || '').trim();
  if (!/^https:\/\//i.test(target)) return;
  const body = JSON.stringify({
    text: `🚨 [Tango] ${event.title} (${event.severity.toUpperCase()}) — ${event.details}`,
    event,
  });
  const secret = String(process.env.TANGO_SECURITY_WEBHOOK_SECRET || '');
  const headers = { 'Content-Type': 'application/json' };
  if (secret) headers['X-Tango-Signature'] = crypto.createHmac('sha256', secret).update(body).digest('hex');
  try {
    await fetch(target, { method: 'POST', headers, body, signal: AbortSignal.timeout(3000) });
  } catch (error) {
    console.warn('[security][webhook]', error?.message || error);
  }
};

/**
 * Regista um evento de segurança. Repetições do mesmo tipo/IP/assunto em 10 minutos são agrupadas;
 * à 5.ª e 20.ª repetição a gravidade sobe e o alerta volta a ser enviado. Nunca lança erros.
 */
export const recordSecurityEvent = async (req, input, sqlOverride = null) => {
  const event = {
    type: String(input.type || 'unknown').slice(0, 60),
    severity: SEVERITIES.includes(input.severity) ? input.severity : 'medium',
    title: String(input.title || input.type || 'Evento de segurança').slice(0, 160),
    details: String(input.details || '').slice(0, 600),
    ip: clientIp(req),
    path: String(req?.url || '').split('?')[0].slice(0, 120),
    subject: input.subject ? String(input.subject).slice(0, 80) : '',
    userAgent: String(req?.headers?.['user-agent'] || '').slice(0, 200),
  };
  console.warn(`[security] ${event.severity.toUpperCase()} ${event.type} ip=${event.ip} ${event.details}`);
  try {
    const sql = sqlOverride || await getSql();
    if (!sql) return event;
    await ensureSecurityTables(sql);
    const grouped = await sql(`UPDATE security_events SET count = count + 1, last_seen = NOW()
      WHERE id = (SELECT id FROM security_events WHERE type = $1 AND ip = $2 AND COALESCE(subject, '') = $3
                  AND last_seen > NOW() - INTERVAL '10 minutes' ORDER BY last_seen DESC LIMIT 1)
      RETURNING id, count, severity`, [event.type, event.ip, event.subject]);
    if (grouped.length) {
      const count = Number(grouped[0].count);
      if (count === 5 || count === 20) {
        const severity = raise(grouped[0].severity);
        await sql('UPDATE security_events SET severity = $2, title = $3 WHERE id = $1', [grouped[0].id, severity, `${event.title} (repetido ${count} vezes)`]);
        if (severity === 'high' || severity === 'critical') await sendWebhook({ ...event, severity, count });
      }
      return { ...event, count };
    }
    await sql(`INSERT INTO security_events (id, type, severity, title, details, ip, path, subject, user_agent)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [crypto.randomUUID(), event.type, event.severity, event.title, event.details, event.ip, event.path, event.subject || null, event.userAgent]);
    if (event.severity === 'high' || event.severity === 'critical') await sendWebhook({ ...event, count: 1 });
  } catch (error) {
    console.error('[security][record]', error?.message || error);
  }
  return event;
};

/** Políticas de bloqueio após falhas (chave mestra, códigos de acesso das empresas). */
export const LOCKOUT_POLICIES = {
  master: { maxFailures: 5, windowMs: 15 * 60_000, blockMs: 60 * 60_000 },
  ip: { maxFailures: 10, windowMs: 15 * 60_000, blockMs: 30 * 60_000 },
  subject: { maxFailures: 8, windowMs: 15 * 60_000, blockMs: 15 * 60_000 },
};

/** Próximo estado de um contador de falhas (puro, para testes). */
export const nextLockoutState = (row, now, policy) => {
  const windowStart = row?.window_start ? new Date(row.window_start).getTime() : 0;
  const lockedUntil = row?.locked_until ? new Date(row.locked_until).getTime() : 0;
  const fresh = !row || now - windowStart > policy.windowMs;
  const failures = (fresh ? 0 : Number(row.failures || 0)) + 1;
  const justLocked = failures >= policy.maxFailures && lockedUntil <= now;
  return {
    failures,
    windowStart: fresh ? now : windowStart,
    lockedUntil: justLocked ? now + policy.blockMs : lockedUntil,
    justLocked,
  };
};

const lockKey = (scope, kind, value) => sha256(`${scope}:${kind}:${String(value).toUpperCase()}`);

/** Segundos de bloqueio restantes para este IP (e assunto, se indicado); 0 quando livre. */
export const lockoutRemaining = async (sql, req, { scope, subject = '' }) => {
  await ensureSecurityTables(sql);
  const keys = [lockKey(scope, 'ip', clientIp(req)), ...(subject ? [lockKey(scope, 'subject', subject)] : [])];
  const rows = await sql('SELECT EXTRACT(EPOCH FROM (locked_until - NOW()))::int AS remaining FROM security_lockouts WHERE key_hash = ANY($1) AND locked_until > NOW()', [keys]);
  return rows.reduce((max, row) => Math.max(max, Number(row.remaining) || 0), 0);
};

const bump = async (sql, key, policy) => {
  const rows = await sql('SELECT failures, window_start, locked_until FROM security_lockouts WHERE key_hash = $1', [key]);
  const next = nextLockoutState(rows[0], Date.now(), policy);
  await sql(`INSERT INTO security_lockouts (key_hash, failures, window_start, locked_until) VALUES ($1, $2, $3, $4)
    ON CONFLICT (key_hash) DO UPDATE SET failures = EXCLUDED.failures, window_start = EXCLUDED.window_start, locked_until = EXCLUDED.locked_until`,
    [key, next.failures, new Date(next.windowStart).toISOString(), next.lockedUntil ? new Date(next.lockedUntil).toISOString() : null]);
  return next;
};

/**
 * Regista uma falha de autenticação: conta por IP e por assunto (ex.: NIF), bloqueia quando a política
 * é atingida e gera o alerta correspondente.
 */
export const registerAuthFailure = async (sql, req, { scope, subject = '', type, title, details, ipPolicy = LOCKOUT_POLICIES.ip, subjectPolicy = LOCKOUT_POLICIES.subject }) => {
  try {
    await ensureSecurityTables(sql);
    const byIp = await bump(sql, lockKey(scope, 'ip', clientIp(req)), ipPolicy);
    const bySubject = subject ? await bump(sql, lockKey(scope, 'subject', subject), subjectPolicy) : null;
    const locked = byIp.justLocked || bySubject?.justLocked;
    await recordSecurityEvent(req, {
      type: locked ? `${type}_locked` : type,
      severity: locked ? 'critical' : byIp.failures >= 3 || (bySubject?.failures || 0) >= 3 ? 'high' : 'medium',
      title: locked ? `${title} — acesso bloqueado temporariamente` : title,
      details: `${details} Falhas: ${byIp.failures} deste IP${bySubject ? `, ${bySubject.failures} para este identificador` : ''}.`,
      subject,
    }, sql);
    return { locked: !!locked };
  } catch (error) {
    console.error('[security][lockout]', error?.message || error);
    return { locked: false };
  }
};

/** Depois de uma autenticação correcta, o contador do assunto volta a zero. */
export const clearAuthFailures = async (sql, { scope, subject }) => {
  if (!subject) return;
  try { await sql('DELETE FROM security_lockouts WHERE key_hash = $1', [lockKey(scope, 'subject', subject)]); }
  catch { /* sem tabela ainda */ }
};

export const ORIGIN_REJECTED = {
  type: 'origin_rejected', severity: 'medium', title: 'Pedido de um site não autorizado',
};

/** Rejeita uma origem não autorizada e regista a tentativa. */
export const recordRejectedOrigin = (req) => recordSecurityEvent(req, {
  ...ORIGIN_REJECTED, details: `Origem ${String(req?.headers?.origin || '').slice(0, 120)} tentou usar a API.`,
});
