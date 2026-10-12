import { neon } from '@neondatabase/serverless';
import { applyCors, enforceDistributedRateLimit } from './_security.js';
import { clientIp, lockoutRemaining, recordRejectedOrigin, registerAuthFailure } from './_alertas.js';
import { activateLicense, licenseHeartbeat, prepareLicenses } from './_licencas.js';
import { licenseKeyHash, parseLicenseKey } from './_chave-licenca.js';
import { loadSigningKey, publicKeyInfo, signLicenseToken, verifyLicenseToken } from './_token-licenca.js';

// Licenças do Desktop:
//   POST /api/licencas/ativar        { chave, machine_hash, nome_maquina }  → token assinado
//   POST /api/licencas/heartbeat     { token, machine_hash }                → token renovado
//   GET  /api/licencas/chave-publica                                        → chave pública Ed25519 (kid)
// A decisão é sempre do servidor; o Desktop só verifica a assinatura do token para trabalhar offline.

// Tentativas de chaves erradas: 5 por IP a cada 15 minutos (impede adivinhar chaves por tentativa e erro).
const KEY_FAILURE_POLICY = { maxFailures: 5, windowMs: 15 * 60_000, blockMs: 15 * 60_000 };

const send = (res, status, body) => {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.json(body);
};

const routeOf = (req) => {
  const path = String(req.url || '').split('?')[0].replace(/\/+$/, '');
  const fromPath = path.split('/').pop();
  return ['ativar', 'heartbeat', 'chave-publica'].includes(fromPath) ? fromPath : String(req.query?.acao || req.body?.acao || '');
};

export default async function handler(req, res) {
  if (!applyCors(req, res)) {
    await recordRejectedOrigin(req);
    return send(res, 403, { success: false, message: 'Origem não autorizada.' });
  }
  if (req.method === 'OPTIONS') return send(res, 200, { success: true });

  const route = routeOf(req);
  const signingKey = loadSigningKey();
  if (!signingKey) {
    return send(res, 503, { success: false, code: 'ASSINATURA_NAO_CONFIGURADA', message: 'A activação de licenças ainda não está configurada neste servidor.' });
  }

  if (route === 'chave-publica') {
    if (req.method !== 'GET' && req.method !== 'POST') return send(res, 405, { success: false, message: 'Método não permitido.' });
    return send(res, 200, { success: true, ...publicKeyInfo(signingKey) });
  }
  if (req.method !== 'POST') return send(res, 405, { success: false, message: 'Método não permitido.' });
  if (route !== 'ativar' && route !== 'heartbeat') return send(res, 404, { success: false, message: 'Rota de licenças desconhecida.' });

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return send(res, 503, { success: false, message: 'Servidor central ainda não configurado.' });
  const client = neon(databaseUrl);
  const sql = (text, params) => client.query(text, params);
  const ip = clientIp(req);
  const body = req.body || {};
  const machineHash = String(body.machine_hash || body.machineHash || '').toLowerCase();

  try {
    if (!await enforceDistributedRateLimit(sql, req, res, { limit: route === 'ativar' ? 30 : 120, windowMs: 15 * 60_000, scope: `licencas_${route}` })) return;
    const remaining = await lockoutRemaining(sql, req, { scope: 'license_key' });
    if (route === 'ativar' && remaining > 0) {
      res.setHeader('Retry-After', String(remaining));
      return send(res, 429, { success: false, code: 'BLOQUEADO', message: `Demasiadas chaves erradas. Tente novamente dentro de ${Math.ceil(remaining / 60)} minuto(s).` });
    }
    await prepareLicenses(sql, databaseUrl);
    const publicKeys = [publicKeyInfo(signingKey)];
    const tools = {
      parse: parseLicenseKey,
      hash: licenseKeyHash,
      sign: claims => signLicenseToken(signingKey, claims),
      verify: token => verifyLicenseToken(token, publicKeys),
    };

    const result = route === 'ativar'
      ? await activateLicense(sql, { key: body.chave ?? body.key, machineHash, machineName: body.nome_maquina ?? body.machineName, ip }, tools)
      : await licenseHeartbeat(sql, { token: body.token, machineHash, ip }, tools);

    if (!result.ok) {
      if (result.failure) {
        await registerAuthFailure(sql, req, {
          scope: 'license_key', type: 'license_key_failed', title: 'Chave de licença errada',
          details: `Tentativa de activação com uma chave ${result.code === 'CHAVE_MAL_ESCRITA' ? 'mal escrita' : 'inexistente'}.`,
          ipPolicy: KEY_FAILURE_POLICY,
        });
      }
      return send(res, result.status, { success: false, code: result.code, message: result.message });
    }
    const { claims } = result;
    return send(res, 200, {
      success: true,
      token: result.token,
      licenca: {
        empresaId: claims.empresa_id,
        plano: claims.plano,
        planoNome: claims.plano_nome,
        escalao: claims.escalao,
        dataFim: claims.data_fim,
        validoAte: claims.valido_ate,
        maxMaquinas: claims.max_maquinas,
      },
      horaServidor: claims.hora_servidor,
    });
  } catch (error) {
    console.error(`[licencas][${route}]`, error);
    return send(res, 500, { success: false, message: 'O servidor não conseguiu processar o pedido de licença.' });
  }
}
