import fs from 'node:fs';
import path from 'node:path';
import { authorizeTenant } from './_autorizacao-empresa.js';
import { applyCors, enforceDistributedRateLimit } from './_security.js';
import { recordRejectedOrigin, recordSecurityEvent } from './_alertas.js';
import { assinarDocumento, chamarAgt, descreverChave, hashSaft, lerChavePrivada, AGT_CAMPOS_ASSINATURA } from './_agt-nucleo.js';

// Ponte AGT da versão web (VPS). O navegador nunca vê as chaves: aqui assinam-se documentos e pedidos e
// fazem-se as chamadas aos serviços da AGT (que não aceitam pedidos directos de um navegador).
//
// Chaves por empresa em AGT_KEYS_DIR/<empresa>/ (permissão 600):
//   contribuinte.pem + contribuinte.json ({ nif }) — chave do contribuinte (Portal do Contribuinte)
//   saft.pem — chave do hash SAF-T (RSA 1024). Se faltar, usa AGT_KEYS_DIR/produtor/saft.pem.
// Na Vercel o disco é só de leitura: lá as chaves têm de ser colocadas na publicação, não pela interface.

const PASTA = process.env.AGT_KEYS_DIR || path.join(process.cwd(), 'dados-agt');
const MAX_PEM = 20_000;

const send = (res, status, body) => {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.json(body);
};

const pastaEmpresa = (tenantId) => path.join(PASTA, String(tenantId).replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 80));

const lerFicheiro = (ficheiro) => (fs.existsSync(ficheiro) ? fs.readFileSync(ficheiro, 'utf8') : null);

const chavesDaEmpresa = (tenantId) => {
  const pasta = pastaEmpresa(tenantId);
  const pemContribuinte = lerFicheiro(path.join(pasta, 'contribuinte.pem'));
  const meta = JSON.parse(lerFicheiro(path.join(pasta, 'contribuinte.json')) || '{}');
  const pemSaft = lerFicheiro(path.join(pasta, 'saft.pem')) || lerFicheiro(path.join(PASTA, 'produtor', 'saft.pem'));
  return {
    contribuinte: pemContribuinte ? lerChavePrivada(pemContribuinte, 2048) : null,
    nif: String(meta.nif || ''),
    saft: pemSaft ? lerChavePrivada(pemSaft, 1024) : null,
  };
};

export default async function handler(req, res) {
  if (!applyCors(req, res)) {
    await recordRejectedOrigin(req);
    return send(res, 403, { success: false, message: 'Origem não autorizada.' });
  }
  if (req.method === 'OPTIONS') return send(res, 200, { success: true });
  if (req.method !== 'POST') return send(res, 405, { success: false, message: 'Método não permitido.' });
  if (!process.env.DATABASE_URL) return send(res, 503, { success: false, message: 'Servidor sem base de dados configurada.' });

  let sql;
  try {
    const { neon } = await import('@neondatabase/serverless');
    const client = neon(process.env.DATABASE_URL);
    sql = (text, params) => client.query(text, params);
    if (!await enforceDistributedRateLimit(sql, req, res, { limit: 240, windowMs: 60_000, scope: 'agt' })) return;
  } catch (error) {
    console.error('[agt][rate-limit]', error);
    return send(res, 503, { success: false, message: 'O controlo de acesso está indisponível.' });
  }

  const tenantId = String(req.headers['x-tenant-id'] || '').trim();
  if (!tenantId || !(req.headers['x-sync-passkey'] || req.headers.cookie)) {
    await recordSecurityEvent(req, { type: 'unauthenticated_request', severity: 'medium', title: 'Ponte AGT sem autenticação', details: 'Pedido à ponte AGT sem empresa ligada.' }, sql);
    return send(res, 401, { success: false, message: 'Ligue primeiro a empresa para usar a facturação electrónica.' });
  }
  const acesso = await authorizeTenant(sql, tenantId, String(req.headers['x-sync-passkey'] || ''), req);
  if (!acesso.ok) return send(res, acesso.status, { success: false, code: acesso.code, message: acesso.message });

  const body = req.body || {};
  try {
    switch (body.accao) {
      case 'estado': {
        let chaves;
        try { chaves = chavesDaEmpresa(tenantId); } catch (erro) { return send(res, 200, { success: true, erro: erro.message, contribuinte: { carregada: false }, saft: { carregada: false } }); }
        return send(res, 200, {
          success: true,
          nif: chaves.nif,
          contribuinte: chaves.contribuinte ? descreverChave(chaves.contribuinte) : { carregada: false },
          saft: chaves.saft ? descreverChave(chaves.saft) : { carregada: false },
        });
      }
      case 'importarChave': {
        const tipo = body.tipo === 'saft' ? 'saft' : body.tipo === 'contribuinte' ? 'contribuinte' : null;
        const pem = String(body.pem || '');
        if (!tipo || !pem || pem.length > MAX_PEM) return send(res, 400, { success: false, message: 'Chave inválida.' });
        const chave = lerChavePrivada(pem, tipo === 'saft' ? 1024 : 2048);
        if (tipo === 'contribuinte' && !/^\d{10}$/.test(String(body.nif || ''))) return send(res, 400, { success: false, message: 'Indique o NIF (10 dígitos) a que a chave pertence.' });
        const pasta = pastaEmpresa(tenantId);
        fs.mkdirSync(pasta, { recursive: true, mode: 0o700 });
        fs.writeFileSync(path.join(pasta, `${tipo}.pem`), chave.export({ type: 'pkcs8', format: 'pem' }).toString(), { mode: 0o600 });
        if (tipo === 'contribuinte') fs.writeFileSync(path.join(pasta, 'contribuinte.json'), JSON.stringify({ nif: String(body.nif) }), { mode: 0o600 });
        await recordSecurityEvent(req, { type: 'agt_key_imported', severity: 'medium', title: 'Chave AGT importada', details: `Chave ${tipo} da empresa ${tenantId} substituída.` }, sql);
        return send(res, 200, { success: true, ...descreverChave(chave) });
      }
      case 'assinarDocumento': {
        const chaves = chavesDaEmpresa(tenantId);
        if (!chaves.contribuinte) return send(res, 412, { success: false, message: 'A chave do contribuinte ainda não foi importada.' });
        return send(res, 200, { success: true, jws: assinarDocumento(body.payload, chaves.nif, chaves.contribuinte) });
      }
      case 'hashSaft': {
        const chaves = chavesDaEmpresa(tenantId);
        if (!chaves.saft) return send(res, 412, { success: false, message: 'A chave do hash SAF-T ainda não foi importada.' });
        const mensagens = Array.isArray(body.mensagens) ? body.mensagens.slice(0, 500) : [body.mensagem];
        return send(res, 200, { success: true, hashes: mensagens.map(m => hashSaft(m, chaves.saft)) });
      }
      case 'chamar': {
        if (!(body.servico in AGT_CAMPOS_ASSINATURA)) return send(res, 400, { success: false, message: 'Serviço AGT desconhecido.' });
        const chaves = chavesDaEmpresa(tenantId);
        if (!chaves.contribuinte) return send(res, 412, { success: false, message: 'A chave do contribuinte ainda não foi importada.' });
        const resultado = await chamarAgt({ ambiente: body.ambiente, servico: body.servico, corpo: body.corpo, nif: chaves.nif, chave: chaves.contribuinte });
        return send(res, 200, { success: true, ...resultado });
      }
      default:
        return send(res, 400, { success: false, message: 'Acção desconhecida.' });
    }
  } catch (erro) {
    return send(res, 400, { success: false, message: erro?.message || 'Pedido inválido.' });
  }
}
