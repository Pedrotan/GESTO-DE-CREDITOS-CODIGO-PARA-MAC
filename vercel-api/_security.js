import crypto from 'node:crypto';
import { clientIp, recordSecurityEvent } from './_alertas.js';

export { clientIp };

const buckets = new Map();

export const safeEqual = (left, right) => {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

/**
 * Origens que podem chamar a API a partir de um navegador: as configuradas em TANGO_ALLOWED_ORIGINS e,
 * por omissão, o próprio domínio da aplicação na Vercel, a aplicação desktop (origem "null" de file://)
 * e o ambiente de desenvolvimento local. Qualquer outro site é recusado.
 */
export const allowedOrigins = (req) => {
  const configured = String(process.env.TANGO_ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean);
  const vercelHosts = [process.env.VERCEL_PROJECT_PRODUCTION_URL, process.env.VERCEL_URL, process.env.VERCEL_BRANCH_URL]
    .filter(Boolean).map(host => `https://${host}`);
  const host = String(req?.headers?.host || '').trim();
  const sameHost = host && !/[\s/]/.test(host) ? [`https://${host}`, `http://${host}`] : [];
  return new Set([
    ...configured, ...vercelHosts, ...sameHost,
    'https://tango-gestao-creditos.vercel.app',
    'http://191.215.45.104',
    'http://191.215.45.104:3000',
    'http://tangogestaoecreditos.tech',
    'https://tangogestaoecreditos.tech',
    'null',
    'http://localhost:8081', 'http://localhost:8082', 'http://localhost:5173', 'http://localhost:4173', 'http://127.0.0.1:8081', 'http://localhost:3000',
  ]);
};

/** Cabeçalhos de segurança de todas as respostas da API (JSON, nunca incorporável numa página). */
export const applySecurityHeaders = (res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
  res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
};

export const applyCors = (req, res) => {
  applySecurityHeaders(res);
  const origin = String(req.headers.origin || '');
  const allowed = !origin ||
    allowedOrigins(req).has(origin) ||
    /^https?:\/\/[a-z0-9-]+\.vercel\.app$/i.test(origin) ||
    /^https?:\/\/(191\.215\.45\.104|tangogestaoecreditos\.tech)(:\d+)?$/i.test(origin);

  if (origin && allowed) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key, x-sync-passkey, x-master-secret, x-tenant-id');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  return allowed;
};

export const enforceRateLimit = (req, res, { limit, windowMs, scope }) => {
  const ip = clientIp(req);
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
  const ip = clientIp(req);
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
    // Excesso de pedidos: possível ataque de negação de serviço ou força bruta. Fica registado.
    await recordSecurityEvent(req, {
      type: 'rate_limit_exceeded', severity: count > limit * 3 ? 'high' : 'medium', title: 'Excesso de pedidos à API',
      details: `${count} pedidos em ${Math.round(windowMs / 1000)} s na rota ${scope} (limite ${limit}).`, subject: scope,
    }, sql);
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
