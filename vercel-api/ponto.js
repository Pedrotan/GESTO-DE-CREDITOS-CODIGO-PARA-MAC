import crypto from 'node:crypto';
import { neon } from '@neondatabase/serverless';
import { applyCors, enforceDistributedRateLimit } from './_security.js';
import { recordRejectedOrigin } from './_alertas.js';
import { authorizeTenant, safeEqual, sha256 } from './_autorizacao-empresa.js';
import { canSendEmail } from './_email-verification.js';

// Livro de ponto: ligação directa aos relógios biométricos (F3.6) e envio dos alertas por e-mail.
//
// Os relógios enviam as marcações para aqui e os computadores da empresa vão buscá-las (como numa importação),
// confirmam a recepção e o servidor apaga-as passados 30 dias. Os dados da empresa continuam nos seus computadores:
// o servidor só guarda, enquanto não forem recolhidas, o número do funcionário no relógio e a data e hora.
//
//  - POST /api/ponto                                      acções da empresa (código de acesso ou sessão da web)
//  - POST /api/ponto/relogio/{dispositivo}/marcacoes      relógio ou serviço intermédio, com «x-device-key»
//  - GET/POST /iclock/cdata, GET /iclock/getrequest       protocolo «ADMS» (push) dos relógios ZKTeco, pelo nº de série

const RETENCAO_DIAS = 30;
const MAX_MARCACOES = 5000;
const EMAILS_POR_DIA = 300;

const send = (res, status, body) => {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-sync-passkey, x-device-key');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.json(body);
};
const sendText = (res, status, text) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.end(text);
};

let tabelasProntas = null;
const prepararTabelas = (sql) => {
  tabelasProntas ||= (async () => {
    await sql(`CREATE TABLE IF NOT EXISTS tango_ponto_relogios (
      tenant_hash TEXT NOT NULL, device_id TEXT NOT NULL, nome TEXT NOT NULL, localizacao TEXT, serial TEXT,
      key_hash TEXT NOT NULL, criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(), ultimo_contacto TIMESTAMPTZ, ultimo_ip TEXT,
      PRIMARY KEY (tenant_hash, device_id))`);
    await sql(`CREATE UNIQUE INDEX IF NOT EXISTS idx_tango_ponto_relogios_serial ON tango_ponto_relogios (serial) WHERE serial IS NOT NULL`);
    await sql(`CREATE TABLE IF NOT EXISTS tango_ponto_relogio_marcacoes (
      tenant_hash TEXT NOT NULL, id TEXT NOT NULL, device_id TEXT NOT NULL, numero TEXT NOT NULL, data_hora TEXT NOT NULL,
      estado INTEGER, recebido_em TIMESTAMPTZ NOT NULL DEFAULT NOW(), entregue_em TIMESTAMPTZ,
      PRIMARY KEY (tenant_hash, id))`);
    await sql(`CREATE INDEX IF NOT EXISTS idx_tango_ponto_marc_pendentes ON tango_ponto_relogio_marcacoes (tenant_hash, entregue_em)`);
    await sql(`CREATE TABLE IF NOT EXISTS tango_ponto_emails (tenant_hash TEXT NOT NULL, dia TEXT NOT NULL, enviados INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (tenant_hash, dia))`);
  })().catch(error => { tabelasProntas = null; throw error; });
  return tabelasProntas;
};

const ligar = () => {
  const client = neon(process.env.DATABASE_URL);
  return (text, params) => client.query(text, params);
};
const clientIp = (req) => String(req.headers['x-real-ip'] || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim().slice(0, 60);

/** «2026-11-18 08:03:00» ou «2026-11-18T08:03» → «2026-11-18T08:03». */
const normalizarDataHora = (texto) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{1,2}):(\d{2})/u.exec(String(texto || '').trim());
  if (!m) return null;
  const [ano, mes, dia, hora, minuto] = [m[1], m[2], m[3], m[4].padStart(2, '0'), m[5]];
  if (Number(mes) < 1 || Number(mes) > 12 || Number(dia) < 1 || Number(dia) > 31 || Number(hora) > 23 || Number(minuto) > 59) return null;
  return `${ano}-${mes}-${dia}T${hora}:${minuto}`;
};
const ESTADOS = { entrada: 0, saida: 1, inicio_pausa: 2, fim_pausa: 3 };

/** Guarda marcações recebidas de um relógio (repetidas são ignoradas). */
const guardarMarcacoes = async (sql, relogio, linhas) => {
  let aceites = 0;
  for (const linha of linhas.slice(0, MAX_MARCACOES)) {
    const numero = String(linha.numero ?? '').trim().slice(0, 40);
    const dataHora = normalizarDataHora(linha.data_hora);
    if (!numero || !dataHora) continue;
    const estado = Number.isInteger(linha.estado) ? linha.estado : null;
    const id = sha256(`${relogio.device_id}:${numero}:${dataHora}:${estado ?? ''}`).slice(0, 40);
    const r = await sql(`INSERT INTO tango_ponto_relogio_marcacoes (tenant_hash, id, device_id, numero, data_hora, estado)
      VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (tenant_hash, id) DO NOTHING RETURNING id`, [relogio.tenant_hash, id, relogio.device_id, numero, dataHora, estado]);
    if (r.length) aceites += 1;
  }
  return aceites;
};

const tocar = (sql, relogio, req) => sql(`UPDATE tango_ponto_relogios SET ultimo_contacto = NOW(), ultimo_ip = $3 WHERE tenant_hash = $1 AND device_id = $2`,
  [relogio.tenant_hash, relogio.device_id, clientIp(req)]);

// ── Protocolo ADMS (ZKTeco) ──────────────────────────────────────────────────
// O relógio identifica-se pelo número de série (SN), registado pela empresa no ecrã «Relógios».
export async function handleIclock(req, res, pathname, query, rawBody) {
  if (!process.env.DATABASE_URL) return sendText(res, 503, 'ERROR');
  const serial = String(query.SN || query.sn || '').trim().slice(0, 64);
  if (!serial) return sendText(res, 400, 'ERROR');
  const sql = ligar();
  await prepararTabelas(sql);
  const [relogio] = await sql(`SELECT tenant_hash, device_id FROM tango_ponto_relogios WHERE serial = $1`, [serial]);
  if (!relogio) {
    console.warn(`[ponto][adms] Relógio não registado: ${serial.slice(0, 20)}`);
    return sendText(res, 404, 'Unknown device');
  }
  await tocar(sql, relogio, req);
  if (pathname === '/iclock/cdata' && req.method === 'GET') {
    return sendText(res, 200, [
      `GET OPTION FROM: ${serial}`, 'ATTLOGStamp=None', 'OPERLOGStamp=9999', 'ATTPHOTOStamp=None', 'ErrorDelay=30', 'Delay=10',
      'TransTimes=00:00;14:05', 'TransInterval=1', 'TransFlag=TransData AttLog', 'TimeZone=1', 'Realtime=1', 'Encrypt=None', '',
    ].join('\n'));
  }
  if (pathname === '/iclock/cdata' && req.method === 'POST') {
    const tabela = String(query.table || '').toUpperCase();
    if (tabela !== 'ATTLOG') return sendText(res, 200, 'OK');
    // Cada linha: PIN \t AAAA-MM-DD HH:MM:SS \t estado \t verificação ...
    const linhas = String(rawBody || '').split(/\r?\n/u).filter(Boolean).map(l => {
      const [numero, dataHora, estado] = l.split('\t');
      const e = Number.parseInt(estado, 10);
      return { numero, data_hora: dataHora, estado: Number.isInteger(e) ? e : null };
    });
    const aceites = await guardarMarcacoes(sql, relogio, linhas);
    return sendText(res, 200, `OK: ${aceites}`);
  }
  // getrequest, devicecmd e outros: sem comandos pendentes.
  return sendText(res, 200, 'OK');
}

// ── Recepção HTTP genérica (serviço intermédio ou relógio com push HTTP) ─────
const receberDoRelogio = async (req, res, deviceId) => {
  const chave = String(req.headers['x-device-key'] || '').trim();
  if (!chave || !deviceId) return send(res, 401, { success: false, message: 'Chave do relógio em falta.' });
  const sql = ligar();
  if (!await enforceDistributedRateLimit(sql, req, res, { limit: 120, windowMs: 60_000, scope: 'ponto-relogio' })) return;
  await prepararTabelas(sql);
  const [relogio] = await sql(`SELECT tenant_hash, device_id, key_hash FROM tango_ponto_relogios WHERE device_id = $1`, [deviceId]);
  if (!relogio || !safeEqual(relogio.key_hash, sha256(chave))) return send(res, 401, { success: false, message: 'Relógio ou chave inválidos.' });
  await tocar(sql, relogio, req);
  const linhas = Array.isArray(req.body?.marcacoes) ? req.body.marcacoes : [];
  const normalizadas = linhas.map(l => ({
    numero: l.funcionario ?? l.numero ?? l.pin, data_hora: l.data_hora ?? l.dataHora,
    estado: Number.isInteger(l.estado) ? l.estado : (ESTADOS[l.tipo] ?? null),
  }));
  const aceites = await guardarMarcacoes(sql, relogio, normalizadas);
  return send(res, 200, { success: true, recebidas: linhas.length, novas: aceites });
};

// ── Acções da empresa ────────────────────────────────────────────────────────
const accoes = {
  async relogios(sql, tenantHash) {
    const rows = await sql(`SELECT r.device_id, r.nome, r.localizacao, r.serial, r.criado_em, r.ultimo_contacto, r.ultimo_ip,
        (SELECT COUNT(*)::int FROM tango_ponto_relogio_marcacoes m WHERE m.tenant_hash = r.tenant_hash AND m.device_id = r.device_id AND m.entregue_em IS NULL) AS pendentes
      FROM tango_ponto_relogios r WHERE r.tenant_hash = $1 ORDER BY r.nome`, [tenantHash]);
    return { relogios: rows.map(r => ({ ...r, criado_em: r.criado_em && new Date(r.criado_em).toISOString(), ultimo_contacto: r.ultimo_contacto && new Date(r.ultimo_contacto).toISOString() })) };
  },
  async registarRelogio(sql, tenantHash, body) {
    const nome = String(body.nome || '').trim().slice(0, 80);
    if (!nome) throw new Erro('Indique o nome do relógio.');
    const serial = String(body.serial || '').trim().toUpperCase().slice(0, 64) || null;
    if (serial && !/^[A-Z0-9-]{4,64}$/u.test(serial)) throw new Erro('Número de série inválido.');
    if (serial) {
      const [outro] = await sql(`SELECT tenant_hash FROM tango_ponto_relogios WHERE serial = $1`, [serial]);
      if (outro) throw new Erro('Este número de série já está registado.');
    }
    const deviceId = `rel_${crypto.randomBytes(9).toString('hex')}`;
    const chave = crypto.randomBytes(24).toString('base64url');
    await sql(`INSERT INTO tango_ponto_relogios (tenant_hash, device_id, nome, localizacao, serial, key_hash) VALUES ($1, $2, $3, $4, $5, $6)`,
      [tenantHash, deviceId, nome, String(body.localizacao || '').trim().slice(0, 120) || null, serial, sha256(chave)]);
    return { deviceId, chave };
  },
  async novaChave(sql, tenantHash, body) {
    const chave = crypto.randomBytes(24).toString('base64url');
    const r = await sql(`UPDATE tango_ponto_relogios SET key_hash = $3 WHERE tenant_hash = $1 AND device_id = $2 RETURNING device_id`, [tenantHash, String(body.deviceId || ''), sha256(chave)]);
    if (!r.length) throw new Erro('Relógio não encontrado.');
    return { chave };
  },
  async removerRelogio(sql, tenantHash, body) {
    const id = String(body.deviceId || '');
    await sql(`DELETE FROM tango_ponto_relogio_marcacoes WHERE tenant_hash = $1 AND device_id = $2 AND entregue_em IS NOT NULL`, [tenantHash, id]);
    const r = await sql(`DELETE FROM tango_ponto_relogios WHERE tenant_hash = $1 AND device_id = $2 RETURNING device_id`, [tenantHash, id]);
    if (!r.length) throw new Erro('Relógio não encontrado.');
    return {};
  },
  async recolher(sql, tenantHash) {
    if (Math.random() < 0.05) await sql(`DELETE FROM tango_ponto_relogio_marcacoes WHERE entregue_em < NOW() - ($1 * INTERVAL '1 day')`, [RETENCAO_DIAS]);
    const rows = await sql(`SELECT id, device_id, numero, data_hora, estado FROM tango_ponto_relogio_marcacoes
      WHERE tenant_hash = $1 AND entregue_em IS NULL ORDER BY data_hora LIMIT $2`, [tenantHash, MAX_MARCACOES]);
    return { marcacoes: rows };
  },
  async confirmar(sql, tenantHash, body) {
    const ids = (Array.isArray(body.ids) ? body.ids : []).map(String).filter(id => /^[a-f0-9]{40}$/u.test(id)).slice(0, MAX_MARCACOES);
    if (!ids.length) return { confirmadas: 0 };
    const r = await sql(`UPDATE tango_ponto_relogio_marcacoes SET entregue_em = NOW() WHERE tenant_hash = $1 AND id = ANY($2::text[]) AND entregue_em IS NULL RETURNING id`, [tenantHash, ids]);
    return { confirmadas: r.length };
  },
  async estadoEmail() {
    const estado = canSendEmail();
    return { email: estado.enabled, motivo: estado.enabled ? null : estado.reason };
  },
  async email(sql, tenantHash, body) {
    const estado = canSendEmail();
    if (!estado.enabled) return { enviados: 0, motivo: estado.reason };
    const mensagens = (Array.isArray(body.mensagens) ? body.mensagens : []).slice(0, 50).map(m => ({
      para: String(m.para || '').trim().toLowerCase().slice(0, 200), assunto: String(m.assunto || '').trim().slice(0, 160), texto: String(m.texto || '').slice(0, 4000),
    })).filter(m => /^[^\s@<>]+@[^\s@<>]+\.[a-z]{2,}$/iu.test(m.para) && m.assunto && m.texto);
    if (!mensagens.length) return { enviados: 0 };
    const dia = new Date().toISOString().slice(0, 10);
    const [quota] = await sql(`INSERT INTO tango_ponto_emails (tenant_hash, dia, enviados) VALUES ($1, $2, 0)
      ON CONFLICT (tenant_hash, dia) DO UPDATE SET enviados = tango_ponto_emails.enviados RETURNING enviados`, [tenantHash, dia]);
    const restantes = Math.max(0, EMAILS_POR_DIA - Number(quota?.enviados || 0));
    const aEnviar = mensagens.slice(0, restantes);
    const mailerModule = 'nodemailer';
    const nodemailer = (await import(mailerModule)).default;
    const transporter = nodemailer.createTransport({
      host: process.env.MAIL_HOST, port: Number(process.env.MAIL_PORT || 587),
      secure: String(process.env.MAIL_ENCRYPTION || '').trim().toLowerCase() === 'tls',
      requireTLS: String(process.env.MAIL_ENCRYPTION || '').trim().toLowerCase() === 'starttls',
      auth: { user: process.env.MAIL_USERNAME, pass: process.env.MAIL_PASSWORD },
      tls: { rejectUnauthorized: true, minVersion: 'TLSv1.2' },
    });
    let enviados = 0;
    for (const m of aEnviar) {
      try {
        await transporter.sendMail({ from: process.env.MAIL_FROM_ADDRESS, to: m.para, subject: m.assunto, text: `${m.texto}\n\n— Tango Gestão e Créditos · Livro de ponto` });
        enviados += 1;
      } catch (error) {
        console.warn('[ponto][email] Falha no envio:', error?.message || error);
      }
    }
    if (enviados) await sql(`UPDATE tango_ponto_emails SET enviados = enviados + $3 WHERE tenant_hash = $1 AND dia = $2`, [tenantHash, dia, enviados]);
    return { enviados, limitados: mensagens.length - aEnviar.length };
  },
};

class Erro extends Error {}

export default async function handler(req, res) {
  const url = String(req.url || '');
  const relogio = /^\/api\/ponto\/relogio\/([A-Za-z0-9_-]{4,64})\/marcacoes(?:[?]|$)/u.exec(url);
  if (relogio) {
    if (req.method === 'OPTIONS') return send(res, 200, { success: true });
    if (req.method !== 'POST') return send(res, 405, { success: false, message: 'Método não permitido.' });
    if (!process.env.DATABASE_URL) return send(res, 503, { success: false, message: 'Servidor sem base de dados.' });
    try {
      return await receberDoRelogio(req, res, relogio[1]);
    } catch (error) {
      console.error('[ponto][relogio]', error);
      return send(res, 500, { success: false, message: 'O servidor não conseguiu guardar as marcações.' });
    }
  }

  if (!applyCors(req, res)) {
    await recordRejectedOrigin(req);
    return send(res, 403, { success: false, message: 'Origem não autorizada.' });
  }
  if (req.method === 'OPTIONS') return send(res, 200, { success: true });
  if (req.method !== 'POST') return send(res, 405, { success: false, message: 'Método não permitido.' });
  if (!process.env.DATABASE_URL) return send(res, 503, { success: false, message: 'Servidor sem base de dados.' });

  const body = req.body || {};
  const tenantId = String(body.tenantId || '').trim();
  const accao = String(body.accao || '');
  if (!tenantId || tenantId.length > 200 || !Object.hasOwn(accoes, accao)) return send(res, 400, { success: false, message: 'Pedido inválido.' });
  const sql = ligar();
  let tenantHash = sha256(tenantId);
  try {
    if (!await enforceDistributedRateLimit(sql, req, res, { limit: 60, windowMs: 60_000, scope: 'ponto' })) return;
    const bearer = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const auth = await authorizeTenant(sql, tenantId, req.headers['x-sync-passkey'] || bearer, req);
    if (!auth.ok) return send(res, auth.status, { success: false, code: auth.code, message: auth.message });
    tenantHash = auth.tenantHash || tenantHash;
  } catch (error) {
    console.error('[ponto][auth]', error);
    return send(res, 500, { success: false, message: 'O servidor não conseguiu validar o acesso.' });
  }
  try {
    await prepararTabelas(sql);
    const resultado = await accoes[accao](sql, tenantHash, body);
    return send(res, 200, { success: true, ...resultado });
  } catch (error) {
    if (error instanceof Erro) return send(res, 400, { success: false, message: error.message });
    console.error(`[ponto][${accao}]`, error);
    return send(res, 500, { success: false, message: 'O servidor não conseguiu concluir o pedido.' });
  }
}
