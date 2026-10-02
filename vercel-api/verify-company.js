import crypto from 'node:crypto';
import { neon } from '@neondatabase/serverless';
import { applyCors, enforceDistributedRateLimit } from './_security.js';

const send = (res, status, body) => {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.json(body);
};

const safeEqual = (left, right) => {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

const sha256 = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');

const normalizeCode = (val) => String(val || '').trim().replace(/[-\s]/g, '').toUpperCase();

export default async function handler(req, res) {
  if (!applyCors(req, res)) return send(res, 403, { success: false, message: 'Origem não autorizada.' });
  if (req.method === 'OPTIONS') return send(res, 200, { success: true });
  if (req.method !== 'POST') return send(res, 405, { success: false, message: 'Método não permitido.' });

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    return send(res, 503, { 
      success: false, 
      code: 'SERVER_UNCONFIGURED',
      message: 'Base de dados central da cloud ainda não configurada no servidor.' 
    });
  }

  const body = req.body || {};
  const rawNif = String(body.nif || body.tenantId || '').trim();
  const rawCode = String(body.accessCode || body.code || '').trim();

  const tenantId = rawNif.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  const normalizedCode = normalizeCode(rawCode);

  if (!tenantId || tenantId.length < 5) {
    return send(res, 400, { 
      success: false, 
      code: 'INVALID_NIF',
      message: 'Por favor, introduza um NIF de empresa válido.' 
    });
  }

  if (!normalizedCode || normalizedCode.length < 4) {
    return send(res, 400, { 
      success: false, 
      code: 'INVALID_CODE',
      message: 'Por favor, introduza o Código de Acesso atribuído pelo Tango Master.' 
    });
  }

  const client = neon(databaseUrl);
  const sql = (text, params) => client.query(text, params);

  try {
    // Limite de segurança: 20 tentativas por minuto por IP para prevenir força bruta
    if (!await enforceDistributedRateLimit(sql, req, res, { limit: 20, windowMs: 60_000, scope: 'verify_company' })) return;

    // Garantir que a tabela existe e suporta o campo access_code
    await sql(`
      CREATE TABLE IF NOT EXISTS tango_tenants (
        tenant_id TEXT PRIMARY KEY,
        tenant_hash TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        key_hash TEXT NOT NULL,
        access_code TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        expires_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_sync_at TIMESTAMPTZ
      )
    `);

    try {
      await sql(`ALTER TABLE tango_tenants ADD COLUMN IF NOT EXISTS access_code TEXT`);
    } catch {
      // Ignorar se já existe
    }

    // Procurar a empresa cadastrada pelo NIF
    const rows = await sql('SELECT * FROM tango_tenants WHERE UPPER(tenant_id) = $1', [tenantId]);

    if (!rows || rows.length === 0) {
      return send(res, 404, {
        success: false,
        code: 'NOT_REGISTERED',
        message: 'Esta empresa não está cadastrada no sistema Tango Master. Solicite o cadastro e as credenciais de acesso ao Administrador.'
      });
    }

    const tenant = rows[0];

    // Verificar se a empresa está bloqueada
    if (tenant.status === 'blocked') {
      return send(res, 403, {
        success: false,
        code: 'BLOCKED',
        message: 'O acesso desta empresa encontra-se suspenso ou bloqueado no Tango Master. Por favor, contacte o suporte.'
      });
    }

    // Verificar se expirou
    if (tenant.expires_at && new Date(tenant.expires_at).getTime() < Date.now()) {
      return send(res, 403, {
        success: false,
        code: 'EXPIRED',
        message: 'O período de validade do código de acesso desta empresa expirou. Solicite a renovação no Tango Master.'
      });
    }

    // Verificar o código de acesso
    const codeMatches = 
      (tenant.access_code && (
        safeEqual(normalizeCode(tenant.access_code), normalizedCode) ||
        safeEqual(tenant.access_code.trim().toUpperCase(), rawCode.trim().toUpperCase())
      )) ||
      safeEqual(sha256(normalizedCode), tenant.key_hash) ||
      safeEqual(sha256(rawCode.trim()), tenant.key_hash);

    if (!codeMatches) {
      return send(res, 401, {
        success: false,
        code: 'WRONG_CODE',
        message: 'Código de Acesso incorreto para este NIF. Verifique o código atribuído pelo Tango Master e tente novamente.'
      });
    }

    // Empresa aprovada com sucesso!
    return send(res, 200, {
      success: true,
      code: 'AUTHORIZED',
      tenantId: tenant.tenant_id,
      companyName: tenant.name,
      accessCode: tenant.access_code || rawCode,
      syncPasskey: tenant.access_code || rawCode,
      status: tenant.status,
      expiresAt: tenant.expires_at,
      message: 'Empresa verificada e autorizada com sucesso!'
    });

  } catch (error) {
    console.error('[verify-company]', error);
    return send(res, 500, { 
      success: false, 
      code: 'SERVER_ERROR',
      message: 'O servidor não conseguiu verificar a empresa neste momento. Tente novamente mais tarde.' 
    });
  }
}
