import { neon } from '@neondatabase/serverless';
import { applyCors, enforceDistributedRateLimit } from './_security.js';
import { recordRejectedOrigin } from './_alertas.js';
import { normalizeNif } from './_pedidos-cadastro.js';

// Retorna o status de uma empresa no Tango Master Gen sem expor dados sensíveis.
// Endpoint oficial: GET /api/v1/companies/status/{identificador} e POST /api/company-status
// Aceita como identificador: NIF, E-mail de Registo ou Código Único (Access Code / Tenant ID).

const send = (res, status, body) => {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.json(body);
};

export default async function handler(req, res) {
  if (!applyCors(req, res)) {
    await recordRejectedOrigin(req);
    return send(res, 403, { success: false, message: 'Origem não autorizada.' });
  }
  if (req.method === 'OPTIONS') return send(res, 200, { success: true });
  if (req.method !== 'GET' && req.method !== 'POST') {
    return send(res, 405, { success: false, message: 'Método não permitido.' });
  }

  if (!process.env.DATABASE_URL) {
    return send(res, 503, { success: false, message: 'Servidor central ainda não configurado.' });
  }

  // Obter o identificador a partir dos parâmetros de rota, query string ou corpo da requisição
  const rawIdentifier = (
    req.query?.id ||
    req.query?.identificador ||
    req.query?.nif ||
    req.body?.identificador ||
    req.body?.nif ||
    req.body?.id ||
    ''
  ).toString().trim();

  if (!rawIdentifier) {
    return send(res, 400, {
      success: false,
      message: 'Indique o identificador da empresa (NIF, E-mail ou Código Único).'
    });
  }

  if (req.body?.nif) {
    const nif = normalizeNif(req.body.nif);
    if (!/^[0-9A-Z]{9,20}$/u.test(nif)) {
      return send(res, 400, { success: false, message: 'Indique um NIF ou BI válido.' });
    }
  }

  if (rawIdentifier.length < 3) {
    return send(res, 400, { success: false, message: 'Identificador da empresa inválido ou muito curto.' });
  }

  const cleanIdentifier = rawIdentifier.replace(/[-\s]/g, '').toUpperCase();
  const cleanEmail = rawIdentifier.toLowerCase();

  const client = neon(process.env.DATABASE_URL);
  const sql = (text, params) => client.query(text, params);

  try {
    if (!await enforceDistributedRateLimit(sql, req, res, { limit: 30, windowMs: 60_000, scope: 'company_status' })) return;

    // 1. Procurar na tabela de empresas registadas (tango_tenants)
    let tenantRows = [];
    try {
      tenantRows = await sql(`
        SELECT tenant_id, name, status, expires_at 
        FROM tango_tenants 
        WHERE UPPER(tenant_id) = $1 
           OR UPPER(REPLACE(COALESCE(access_code, ''), '-', '')) = $1
        LIMIT 1
      `, [cleanIdentifier]);
    } catch (error) {
      if (!/does not exist/iu.test(String(error?.message))) throw error;
    }

    if (tenantRows.length > 0) {
      const tenant = tenantRows[0];
      const expired = tenant.expires_at && new Date(tenant.expires_at).getTime() < Date.now();
      
      if (tenant.status === 'blocked') {
        return send(res, 403, {
          success: false,
          status: 'BLOCKED',
          message: 'O acesso desta empresa está suspenso no Tango Master Gen. Contacte o suporte.'
        });
      }

      if (expired) {
        return send(res, 403, {
          success: false,
          status: 'EXPIRED',
          message: 'A subscrição desta empresa expirou. Solicite a renovação no Tango Master Gen.'
        });
      }

      // Regra de Segurança: Devolver APENAS configurações não-sensíveis para inicialização do tenant
      return send(res, 200, {
        success: true,
        status: 'ACTIVE',
        company: {
          id: tenant.tenant_id,
          tenantId: tenant.tenant_id,
          name: tenant.name,
          logo: null,
          isMultiTenant: false
        }
      });
    }

    // 2. Se não estiver no tango_tenants, procurar nos pedidos de registo (tango_registration_requests)
    let requestRows = [];
    try {
      requestRows = await sql(`
        SELECT id, nif, company_name, status 
        FROM tango_registration_requests 
        WHERE UPPER(REPLACE(nif, '-', '')) = $1 
           OR LOWER(email) = $2
        ORDER BY created_at DESC 
        LIMIT 1
      `, [cleanIdentifier, cleanEmail]);
    } catch (error) {
      if (!/does not exist/iu.test(String(error?.message))) throw error;
    }

    if (requestRows.length > 0) {
      const reg = requestRows[0];
      if (reg.status === 'pending') {
        return send(res, 200, {
          success: true,
          status: 'PENDING',
          companyName: reg.company_name,
          message: 'O registo da empresa foi submetido e está pendente de aprovação.'
        });
      }
    }

    // 3. Não encontrada em nenhuma tabela
    return send(res, 200, {
      success: true,
      status: 'NOT_FOUND',
      message: 'Empresa não encontrada no registo central. Acesso ao onboarding permitido.'
    });

  } catch (error) {
    console.error('[company-status-v1]', error);
    return send(res, 500, { success: false, message: 'Erro ao verificar status da empresa no servidor central.' });
  }
}
