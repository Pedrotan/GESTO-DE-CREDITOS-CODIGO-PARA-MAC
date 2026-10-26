import { neon } from '@neondatabase/serverless';
import { applyCors, enforceDistributedRateLimit } from './_security.js';
import { recordRejectedOrigin } from './_alertas.js';
import { authorizeTenant, sha256 } from './_autorizacao-empresa.js';

// Presença em tempo real: cada dispositivo com sessão iniciada envia um sinal a cada minuto e recebe quem da empresa
// está ligado (em qualquer computador ou navegador). O servidor não sabe quem é quem: recebe só um identificador
// opaco do utilizador (SHA-256 calculado no dispositivo) e o do dispositivo. Os nomes ficam nos dispositivos.

const ONLINE_WINDOW_SECONDS = 150;
const KEY_PATTERN = /^[a-f0-9]{64}$/;

const send = (res, status, body) => {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-sync-passkey');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.json(body);
};

export default async function handler(req, res) {
  if (!applyCors(req, res)) {
    await recordRejectedOrigin(req);
    return send(res, 403, { success: false, message: 'Origem não autorizada.' });
  }
  if (req.method === 'OPTIONS') return send(res, 200, { success: true });
  if (req.method !== 'POST') return send(res, 405, { success: false, message: 'Método não permitido.' });
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return send(res, 503, { success: false, message: 'Presença indisponível: servidor sem base de dados.' });

  const body = req.body || {};
  const tenantId = String(body.tenantId || '').trim();
  const deviceId = String(body.deviceId || '').trim();
  const userKey = String(body.userKey || '').trim().toLowerCase();
  const platform = body.platform === 'pc' ? 'pc' : 'web';
  const active = body.active !== false;
  if (!tenantId || tenantId.length > 200 || !deviceId || deviceId.length > 100 || !KEY_PATTERN.test(userKey)) {
    return send(res, 400, { success: false, message: 'Pedido de presença inválido.' });
  }

  const client = neon(databaseUrl);
  const sql = (text, params) => client.query(text, params);
  try {
    if (!await enforceDistributedRateLimit(sql, req, res, { limit: 120, windowMs: 60_000, scope: 'presence' })) return;
    const bearer = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const auth = await authorizeTenant(sql, tenantId, req.headers['x-sync-passkey'] || bearer, req);
    if (!auth.ok) return send(res, auth.status, { success: false, code: auth.code, message: auth.message });
  } catch (error) {
    console.error('[presence][auth]', error);
    return send(res, 500, { success: false, message: 'O servidor não conseguiu validar o acesso.' });
  }

  const tenantHash = sha256(tenantId);
  const deviceKey = sha256(`${tenantId}:${deviceId}`);
  try {
    await sql(`
      CREATE TABLE IF NOT EXISTS tango_presence (
        tenant_hash TEXT NOT NULL,
        user_key TEXT NOT NULL,
        device_key TEXT NOT NULL,
        platform TEXT NOT NULL,
        last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (tenant_hash, user_key, device_key)
      )
    `);
    if (active) {
      await sql(`INSERT INTO tango_presence (tenant_hash, user_key, device_key, platform, last_seen) VALUES ($1, $2, $3, $4, NOW())
        ON CONFLICT (tenant_hash, user_key, device_key) DO UPDATE SET platform = EXCLUDED.platform, last_seen = NOW()`,
      [tenantHash, userKey, deviceKey, platform]);
    } else {
      // Fim de sessão: deixa de aparecer logo, sem esperar que o sinal expire.
      await sql('DELETE FROM tango_presence WHERE tenant_hash = $1 AND user_key = $2 AND device_key = $3', [tenantHash, userKey, deviceKey]);
    }
    if (Math.random() < 0.02) await sql(`DELETE FROM tango_presence WHERE last_seen < NOW() - INTERVAL '1 day'`);
    const rows = await sql(`SELECT user_key, platform, last_seen FROM tango_presence
      WHERE tenant_hash = $1 AND last_seen > NOW() - ($2 * INTERVAL '1 second') ORDER BY last_seen DESC`, [tenantHash, ONLINE_WINDOW_SECONDS]);
    const online = new Map();
    for (const row of rows) {
      const current = online.get(row.user_key) || { userKey: row.user_key, lastSeen: new Date(row.last_seen).toISOString(), devices: 0, platforms: [] };
      current.devices += 1;
      if (!current.platforms.includes(row.platform)) current.platforms.push(row.platform);
      online.set(row.user_key, current);
    }
    return send(res, 200, { success: true, windowSeconds: ONLINE_WINDOW_SECONDS, serverTime: new Date().toISOString(), online: [...online.values()] });
  } catch (error) {
    console.error('[presence]', error);
    return send(res, 500, { success: false, message: 'O servidor não conseguiu registar a presença.' });
  }
}
