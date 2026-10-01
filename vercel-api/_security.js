import crypto from 'node:crypto';

const buckets = new Map();

export const safeEqual = (left, right) => {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

export const applyCors = (req, res) => {
  const origin = String(req.headers.origin || '');
  const configured = String(process.env.TANGO_ALLOWED_ORIGINS || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);
  if (origin && (configured.length === 0 || configured.includes(origin))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key, x-sync-passkey, x-master-secret');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  return !origin || configured.length === 0 || configured.includes(origin);
};

export const enforceRateLimit = (req, res, { limit, windowMs, scope }) => {
  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
  const key = `${scope}:${ip}`;
  const now = Date.now();
  const previous = buckets.get(key);
  const bucket = !previous || previous.resetAt <= now ? { count: 0, resetAt: now + windowMs } : previous;
  bucket.count += 1;
  buckets.set(key, bucket);
  res.setHeader('RateLimit-Limit', String(limit));
  res.setHeader('RateLimit-Remaining', String(Math.max(0, limit - bucket.count)));
  res.setHeader('RateLimit-Reset', String(Math.ceil(bucket.resetAt / 1000)));
  if (bucket.count > limit) {
    res.setHeader('Retry-After', String(Math.ceil((bucket.resetAt - now) / 1000)));
    res.status(429).json({ success: false, message: 'Demasiados pedidos. Tente novamente mais tarde.' });
    return false;
  }
  if (buckets.size > 10_000) {
    for (const [entryKey, entry] of buckets) if (entry.resetAt <= now) buckets.delete(entryKey);
  }
  return true;
};

// A contagem em memória serve apenas testes e desenvolvimento local. Em produção,
// todas as instâncias partilham a contagem na mesma base PostgreSQL.
export const enforceDistributedRateLimit = async (sql, req, res, { limit, windowMs, scope, subject = '', dimension = 'ip' }) => {
  if (!Number.isSafeInteger(limit) || limit < 1 || !Number.isSafeInteger(windowMs) || windowMs < 1000) {
    throw new Error('Política de rate limit inválida.');
  }
  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
  if (!['ip', 'subject'].includes(dimension) || dimension === 'subject' && !subject) {
    throw new Error('Dimensão de rate limit inválida.');
  }
  const key = crypto.createHash('sha256').update(`${scope}:${dimension}:${dimension === 'ip' ? ip : subject}`).digest('hex');
  await sql(`CREATE TABLE IF NOT EXISTS api_rate_limits (
    key_hash TEXT PRIMARY KEY,
    request_count INTEGER NOT NULL CHECK (request_count > 0),
    reset_at TIMESTAMPTZ NOT NULL
  )`);
  const rows = await sql(`INSERT INTO api_rate_limits (key_hash, request_count, reset_at)
    VALUES ($1, 1, NOW() + ($2 * INTERVAL '1 millisecond'))
    ON CONFLICT (key_hash) DO UPDATE SET
      request_count = CASE WHEN api_rate_limits.reset_at <= NOW() THEN 1 ELSE api_rate_limits.request_count + 1 END,
      reset_at = CASE WHEN api_rate_limits.reset_at <= NOW() THEN NOW() + ($2 * INTERVAL '1 millisecond') ELSE api_rate_limits.reset_at END
    RETURNING request_count, EXTRACT(EPOCH FROM reset_at)::bigint AS reset_epoch`, [key, windowMs]);
  const count = Number(rows[0]?.request_count);
  const reset = Number(rows[0]?.reset_epoch);
  if (!Number.isSafeInteger(count) || !Number.isFinite(reset)) throw new Error('Resposta inválida do limitador distribuído.');
  res.setHeader('RateLimit-Limit', String(limit));
  res.setHeader('RateLimit-Remaining', String(Math.max(0, limit - count)));
  res.setHeader('RateLimit-Reset', String(reset));
  if (count > limit) {
    res.setHeader('Retry-After', String(Math.max(1, reset - Math.floor(Date.now() / 1000))));
    res.status(429).json({ success: false, message: 'Demasiados pedidos. Tente novamente mais tarde.' });
    return false;
  }
  return true;
};

export const requireSecret = (req, configuredSecret, headerName = 'x-api-key') => {
  if (!configuredSecret) return false;
  const bearer = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  return safeEqual(bearer || req.headers[headerName], configuredSecret);
};
