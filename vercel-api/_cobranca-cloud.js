import crypto from 'node:crypto';
import { telefoneAngola, payloadMeta, estadoMensagem, pediuSaida, validarPolitica, POLITICA_COBRANCA_PADRAO, horarioPermitido, elegibilidadePromocao, hojeLuanda, passoDaRegua, diasEntre } from './_cobranca-regras.js';
import { licenseGate } from './_licencas.js';

export const CLOUD_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS hub_cloud_accounts (tenant_id TEXT PRIMARY KEY, enabled BOOLEAN NOT NULL DEFAULT false, credentials TEXT, policy JSONB NOT NULL DEFAULT '{}', updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS hub_cloud_snapshots (tenant_id TEXT NOT NULL, client_id TEXT NOT NULL, data JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY(tenant_id,client_id))`,
  `CREATE TABLE IF NOT EXISTS hub_cloud_jobs (id TEXT NOT NULL, tenant_id TEXT NOT NULL, client_id TEXT NOT NULL, phone TEXT NOT NULL, data JSONB NOT NULL, scheduled_at TIMESTAMPTZ NOT NULL, status TEXT NOT NULL DEFAULT 'queued', provider_id TEXT, error TEXT, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY(tenant_id,id))`,
  `CREATE INDEX IF NOT EXISTS idx_hub_jobs_queue ON hub_cloud_jobs(status,scheduled_at)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_hub_jobs_provider ON hub_cloud_jobs(provider_id) WHERE provider_id IS NOT NULL`,
  `CREATE TABLE IF NOT EXISTS hub_cloud_events (seq BIGSERIAL, id TEXT NOT NULL, tenant_id TEXT NOT NULL, client_id TEXT NOT NULL, credit_id TEXT, kind TEXT NOT NULL, status TEXT NOT NULL, message TEXT NOT NULL, metadata JSONB NOT NULL DEFAULT '{}', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY(tenant_id,id))`,
  `CREATE TABLE IF NOT EXISTS hub_cloud_optouts (tenant_id TEXT NOT NULL, phone TEXT NOT NULL, client_id TEXT NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY(tenant_id,phone))`,
  `CREATE TABLE IF NOT EXISTS hub_cloud_quota (tenant_id TEXT NOT NULL, phone TEXT NOT NULL, day TEXT NOT NULL, slot INTEGER NOT NULL, job_id TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY(tenant_id,phone,day,slot))`,
  `CREATE TABLE IF NOT EXISTS hub_cloud_media (tenant_id TEXT NOT NULL, media_id TEXT NOT NULL, mime TEXT NOT NULL, filename TEXT NOT NULL, PRIMARY KEY(tenant_id,media_id))`,
  `CREATE TABLE IF NOT EXISTS hub_cloud_marketing_lock (tenant_id TEXT NOT NULL, phone TEXT NOT NULL, reserved_at TIMESTAMPTZ NOT NULL, PRIMARY KEY(tenant_id,phone))`,
];
export async function ensureHub(sql) { for (const statement of CLOUD_SCHEMA) await sql(statement); }
const key = () => {
  const value = process.env.WHATSAPP_ENCRYPTION_KEY || '';
  if (value.length < 32) throw new Error('Configure WHATSAPP_ENCRYPTION_KEY no servidor (pelo menos 32 caracteres aleatórios).');
  return crypto.createHash('sha256').update(value).digest();
};
export function encryptCredentials(data) {
  const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(data), 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map(x => x.toString('base64url')).join('.');
}
export function decryptCredentials(value) {
  const [iv, tag, data] = value.split('.').map(x => Buffer.from(x, 'base64url'));
  const cipher = crypto.createDecipheriv('aes-256-gcm', key(), iv); cipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([cipher.update(data), cipher.final()]).toString('utf8'));
}
export const accountCredentials = account => account?.credentials ? decryptCredentials(account.credentials) : null;
export function validateCredentials(input) {
  if (!/^\d{5,30}$/.test(input.phoneNumberId || '') || !/^\d{5,30}$/.test(input.businessAccountId || '') || !/^v\d{2}\.\d+$/.test(input.apiVersion || '') || String(input.token || '').length < 20 || String(input.appSecret || '').length < 16 || String(input.verifyToken || '').length < 16) throw new Error('Preencha os identificadores, versão da API e segredos da aplicação Meta.');
  return { phoneNumberId: input.phoneNumberId, businessAccountId: input.businessAccountId, apiVersion: input.apiVersion, token: input.token, appSecret: input.appSecret, verifyToken: input.verifyToken };
}
export async function metaRequest(credentials, endpoint, options = {}, fetcher = fetch) {
  const response = await fetcher(`https://graph.facebook.com/${credentials.apiVersion}/${endpoint}`, { ...options, headers: { Authorization: `Bearer ${credentials.token}`, ...options.headers }, signal: AbortSignal.timeout(25000) });
  const body = await response.json().catch(() => null);
  if (!response.ok || body?.error) throw new Error(`Meta ${response.status}: ${String(body?.error?.message || 'Pedido recusado').slice(0, 250)}`);
  return body;
}
export async function approvedTemplates(c, fetcher = fetch) {
  const result = []; let after;
  for (let page = 0; page < 20; page++) {
    const body = await metaRequest(c, `${c.businessAccountId}/message_templates?fields=id,name,status,category,language,components&limit=100${after ? `&after=${encodeURIComponent(after)}` : ''}`, {}, fetcher);
    result.push(...(body.data || []).filter(t => t.status === 'APPROVED'));
    after = body.paging?.cursors?.after;
    if (!body.paging?.next || !after) break;
  }
  return result;
}
export function validateApprovedTemplate(job, templates) {
  const template = templates.find(t => t.name === job.templateName && t.language === job.language);
  if (!template || template.status !== 'APPROVED') throw new Error('O modelo não está aprovado na Meta para este idioma.');
  if (job.purpose === 'test' ? !['MARKETING', 'UTILITY'].includes(template.category) : job.purpose === 'marketing' ? template.category !== 'MARKETING' : template.category !== 'UTILITY') throw new Error('Use um modelo MARKETING para promoções e UTILITY para cobrança.');
  const body = template.components?.find(c => c.type === 'BODY')?.text || '';
  if (job.purpose === 'marketing' && !/SAIR/i.test(body)) throw new Error('O modelo promocional deve permitir sair respondendo SAIR.');
  const placeholders = [...new Set([...body.matchAll(/\{\{(\d+)\}\}/g)].map(m => +m[1]))].sort((a, b) => a - b);
  if (placeholders.length !== job.parameters.length || placeholders.some((p, i) => p !== i + 1)) throw new Error('O modelo aprovado deve ter os mesmos parâmetros apresentados na pré-visualização.');
  const header = template.components?.find(c => c.type === 'HEADER');
  if (['IMAGE', 'DOCUMENT'].includes(header?.format) && (!job.mediaId || job.mediaType !== header.format.toLowerCase())) throw new Error('Anexe a imagem ou o documento exigido pelo modelo aprovado.');
  if (job.mediaId && !['IMAGE', 'DOCUMENT'].includes(header?.format)) throw new Error('O modelo aprovado não permite este anexo.');
  if (template.components?.some(c => c.type === 'BUTTONS' && c.buttons?.some(b => /\{\{/.test(b.url || '')))) throw new Error('Este modelo tem um botão dinâmico. Use um modelo com botão fixo ou sem botão.');
  return body.replace(/\{\{(\d+)\}\}/g, (_, i) => String(job.parameters[Number(i) - 1]));
}
export function verifyWebhook(raw, signature, secret) {
  if (!Buffer.isBuffer(raw) || !/^sha256=[a-f0-9]{64}$/i.test(signature || '')) return false;
  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(raw).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}
// Mesmo calendário nacional usado no ERP, apurado em UTC para não depender do fuso da VPS.
export function feriadosDoAno(year) {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451), month = Math.floor((h + l - 7 * m + 114) / 31), day = (h + l - 7 * m + 114) % 31 + 1;
  const easter = Date.UTC(year, month - 1, day);
  return ['01-01', '02-04', '03-08', '03-23', '04-04', '05-01', '09-17', '11-02', '11-11', '12-25'].map(x => `${year}-${x}`).concat([-47, -2].map(n => new Date(easter + n * 86400000).toISOString().slice(0, 10)));
}
export async function cloudEvent(sql, tenant, input) {
  await sql(`INSERT INTO hub_cloud_events (id,tenant_id,client_id,credit_id,kind,status,message,metadata,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,COALESCE($9::timestamptz,NOW())) ON CONFLICT(tenant_id,id) DO NOTHING`, [input.id || crypto.randomUUID(), tenant, input.clientId || '', input.creditId || null, input.kind || 'message', input.status, input.message || '', JSON.stringify(input.metadata || {}), input.createdAt || null]);
}
export async function optOut(sql, tenant, clientId, phone) {
  if (!phone) {
    const rows = await sql('SELECT data FROM hub_cloud_snapshots WHERE tenant_id=$1 AND client_id=$2', [tenant, clientId]); phone = rows[0]?.data?.phone;
  }
  if (!telefoneAngola(phone)) return;
  await sql(`INSERT INTO hub_cloud_optouts (tenant_id,phone,client_id) VALUES ($1,$2,$3) ON CONFLICT(tenant_id,phone) DO UPDATE SET client_id=excluded.client_id,updated_at=NOW()`, [tenant, phone, clientId]);
  await sql(`UPDATE hub_cloud_jobs SET status='cancelled',error='Cliente pediu para sair',updated_at=NOW() WHERE tenant_id=$1 AND phone=$2 AND data->>'purpose'='marketing' AND status='queued'`, [tenant, phone]);
}
export async function ingestWebhook(sql, tenant, value) {
  for (const status of value.statuses || []) {
    const jobs = await sql('SELECT * FROM hub_cloud_jobs WHERE tenant_id=$1 AND provider_id=$2', [tenant, status.id]);
    const job = jobs[0]; if (!job) continue;
    const next = estadoMensagem(job.status, status.status);
    // Comparação na própria actualização: webhooks concorrentes não podem regredir de lida para enviada.
    await sql(`UPDATE hub_cloud_jobs SET status=CASE WHEN status='read' THEN 'read' WHEN status='delivered' AND $3 NOT IN ('read') THEN 'delivered' ELSE $3 END,updated_at=NOW() WHERE tenant_id=$1 AND id=$2`, [tenant, job.id, next]);
    await cloudEvent(sql, tenant, { id: `${status.id}:${status.status}`, clientId: job.client_id, creditId: job.data.creditId, status: status.status, message: job.data.preview, metadata: { jobId: job.id, campaignId: job.data.campaignId, preventiva: job.data.preventiva === true, errors: status.errors || [] }, createdAt: new Date(Number(status.timestamp) * 1000).toISOString() });
  }
  for (const message of value.messages || []) {
    const phone = telefoneAngola(message.from); if (!phone) continue;
    const contacts = await sql(`SELECT client_id FROM hub_cloud_snapshots WHERE tenant_id=$1 AND data->>'phone'=$2`, [tenant, phone]);
    const text = message.text?.body || message.button?.text || message.interactive?.button_reply?.title || `[${message.type || 'anexo'} recebido]`;
    for (const contact of contacts) {
      if (pediuSaida(text)) await optOut(sql, tenant, contact.client_id, phone);
      const latest = message.context?.id
        ? await sql('SELECT data FROM hub_cloud_jobs WHERE tenant_id=$1 AND provider_id=$2', [tenant, message.context.id])
        : await sql(`SELECT data FROM hub_cloud_jobs WHERE tenant_id=$1 AND phone=$2 AND status IN ('accepted','sent','delivered','read') ORDER BY updated_at DESC LIMIT 1`, [tenant, phone]);
      await cloudEvent(sql, tenant, { id: `${message.id}:${contact.client_id}`, clientId: contact.client_id, kind: pediuSaida(text) ? 'consent' : 'reply', status: pediuSaida(text) ? 'opt_out' : 'received', message: text, metadata: { providerId: message.id, campaignId: latest[0]?.data?.campaignId }, createdAt: new Date(Number(message.timestamp) * 1000).toISOString() });
    }
    // Mesmo sem cadastro local, respeitar SAIR para esse número.
    if (pediuSaida(text) && !contacts.length) await optOut(sql, tenant, '', phone);
  }
}
export async function processQueue(sql, tenant, fetcher = fetch, checkLicense = licenseGate, now = new Date()) {
  const accounts = await sql('SELECT * FROM hub_cloud_accounts WHERE tenant_id=$1 AND enabled=true', [tenant]);
  const account = accounts[0]; if (!account?.credentials) return { sent: 0 };
  const license = await checkLicense(sql, tenant); if (!license.ok) return { sent: 0, reason: license.message };
  const policy = validarPolitica(account.policy || POLITICA_COBRANCA_PADRAO);
  const blocked = horarioPermitido(now, policy, feriadosDoAno(Number(hojeLuanda(now).slice(0, 4))));
  if (blocked) return { sent: 0, reason: blocked };
  const credentials = accountCredentials(account), templates = await approvedTemplates(credentials, fetcher);
  const jobs = await sql(`UPDATE hub_cloud_jobs SET status='sending',updated_at=NOW() WHERE (tenant_id,id) IN (SELECT tenant_id,id FROM hub_cloud_jobs WHERE tenant_id=$1 AND status='queued' AND scheduled_at <= NOW() ORDER BY scheduled_at LIMIT 1 FOR UPDATE SKIP LOCKED) RETURNING *`, [tenant]);
  if (!jobs.length) return { sent: 0 };
  const job = jobs[0], data = job.data;
  let calledProvider = false;
  try {
    const snapshots = await sql('SELECT * FROM hub_cloud_snapshots WHERE tenant_id=$1 AND client_id=$2', [tenant, job.client_id]);
    const snapshot = snapshots[0];
    if (!snapshot || Date.now() - Date.parse(snapshot.updated_at) > 15 * 60000) {
      await sql(`UPDATE hub_cloud_jobs SET status='queued',scheduled_at=NOW()+INTERVAL '5 minutes',error='A aguardar dados financeiros actualizados',updated_at=NOW() WHERE tenant_id=$1 AND id=$2`, [tenant, job.id]);
      return { sent: 0, reason: 'Dados desactualizados' };
    }
    if (snapshot.data.phone !== job.phone) throw new Error('O telefone do cadastro mudou. Prepare novamente a mensagem.');
    if (data.purpose === 'marketing') {
      if (data.expiresAt < hojeLuanda()) throw new Error('A campanha terminou.');
      const opt = await sql('SELECT updated_at FROM hub_cloud_optouts WHERE tenant_id=$1 AND phone=$2', [tenant, job.phone]);
      const last = await sql(`SELECT MAX(updated_at) AS last FROM hub_cloud_jobs WHERE tenant_id=$1 AND phone=$2 AND data->>'purpose'='marketing' AND status IN ('accepted','sent','delivered','read','unknown')`, [tenant, job.phone]);
      const motivo = elegibilidadePromocao({ consentimento: snapshot.data.consentimento, saida: Boolean(opt.length), atrasoMinor: snapshot.data.atrasoMinor, ultimoEnvio: last[0]?.last }, now, policy.intervaloPromocoesDias);
      if (motivo) throw new Error(motivo);
    } else if (data.purpose !== 'test') {
      const pending = (snapshot.data.promessa || []).find(p => p.creditId === data.creditId);
      if (pending && data.purpose !== 'promise' && pending.dia >= hojeLuanda()) throw new Error('Existe uma promessa de pagamento em aberto para este crédito.');
      if (data.purpose === 'promise' && (!pending || pending.id !== data.promiseId || pending.dia !== hojeLuanda())) throw new Error('O lembrete da promessa deixou de ser aplicável.');
      const item = (snapshot.data.items || []).find(i => i.id === data.itemId && i.valorMinor > 0);
      if (!item) throw new Error('A prestação já foi paga, cancelada ou alterada.');
      if (data.stepId && data.purpose !== 'promise') {
        const actual = passoDaRegua({ diasAtraso: diasEntre(item.vencimento, hojeLuanda(now)), hoje: hojeLuanda(now) }, policy);
        const escalada = data.escalatedPromiseId && (snapshot.data.failedPromises || []).includes(data.escalatedPromiseId);
        if (actual?.id !== data.stepId && !escalada) throw new Error('O passo da régua foi ultrapassado ou desactivado.');
      }
      const amount = data.purpose === 'promise' ? Math.min(item.valorMinor, Number(pending.amountMinor) || 0) : item.valorMinor;
      if (amount <= 0) throw new Error('A promessa já foi cumprida.');
      data.parameters[1] = (amount / 100).toLocaleString('pt-AO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' Kz';
    }
    const preview = validateApprovedTemplate(data, templates);
    const recent = await sql(`SELECT job_id FROM hub_cloud_quota WHERE tenant_id=$1 AND created_at > NOW()-($2::int * INTERVAL '1 second') LIMIT 1`, [tenant, policy.intervaloEnvioSegundos]);
    if (recent.length) {
      await sql(`UPDATE hub_cloud_jobs SET status='queued',scheduled_at=NOW()+INTERVAL '1 minute',updated_at=NOW() WHERE tenant_id=$1 AND id=$2`, [tenant, job.id]);
      return { sent: 0, reason: 'Intervalo entre envios' };
    }
    const manual = await sql(`SELECT COALESCE(SUM((data->>'manualContactsToday')::int),0) AS n FROM hub_cloud_snapshots WHERE tenant_id=$1 AND data->>'phone'=$2 AND data->>'manualDay'=$3`, [tenant, job.phone, hojeLuanda()]);
    const quota = await sql(`INSERT INTO hub_cloud_quota (tenant_id,phone,day,slot,job_id) SELECT $1,$2,$3,n,$4 FROM generate_series(1,$5::int) n WHERE NOT EXISTS (SELECT 1 FROM hub_cloud_quota q WHERE q.tenant_id=$1 AND q.phone=$2 AND q.day=$3 AND q.slot=n) ORDER BY n LIMIT 1 ON CONFLICT DO NOTHING RETURNING slot`, [tenant, job.phone, hojeLuanda(), job.id, Math.max(0, policy.limiteDiario - Number(manual[0]?.n || 0))]);
    if (!quota.length) {
      await sql(`UPDATE hub_cloud_jobs SET status='queued',scheduled_at=NOW()+INTERVAL '1 hour',error='Limite diário de contactos',updated_at=NOW() WHERE tenant_id=$1 AND id=$2`, [tenant, job.id]);
      return { sent: 0, reason: 'Limite diário' };
    }
    if (data.purpose === 'marketing') {
      const lock = await sql(`INSERT INTO hub_cloud_marketing_lock (tenant_id,phone,reserved_at) VALUES ($1,$2,NOW()) ON CONFLICT(tenant_id,phone) DO UPDATE SET reserved_at=NOW() WHERE hub_cloud_marketing_lock.reserved_at <= NOW()-($3::int * INTERVAL '1 day') RETURNING phone`, [tenant, job.phone, policy.intervaloPromocoesDias]);
      if (!lock.length) throw new Error('Limite de frequência promocional: outro envio já foi reservado para este número.');
    }
    const payload = payloadMeta({ ...data, phone: job.phone });
    calledProvider = true;
    const response = await metaRequest(credentials, `${credentials.phoneNumberId}/messages`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }, fetcher);
    const providerId = response.messages?.[0]?.id; if (!providerId) throw new Error('A Meta não confirmou o identificador da mensagem.');
    await sql(`UPDATE hub_cloud_jobs SET status='accepted',provider_id=$3,error=NULL,updated_at=NOW() WHERE tenant_id=$1 AND id=$2`, [tenant, job.id, providerId]);
    await cloudEvent(sql, tenant, { id: `${providerId}:accepted`, clientId: job.client_id, creditId: data.creditId, status: 'accepted', message: preview, metadata: { jobId: job.id, campaignId: data.campaignId, preventiva: data.preventiva === true } });
    return { sent: 1 };
  } catch (error) {
    // Depois de iniciar HTTP, um timeout é ambíguo: nunca reenviar automaticamente e duplicar a cobrança.
    const state = calledProvider ? 'unknown' : 'cancelled';
    await sql(`UPDATE hub_cloud_jobs SET status=$3,error=$4,updated_at=NOW() WHERE tenant_id=$1 AND id=$2`, [tenant, job.id, state, error.message]);
    await cloudEvent(sql, tenant, { id: `${job.id}:${state}`, clientId: job.client_id, creditId: data.creditId, status: state, message: error.message, metadata: { jobId: job.id, campaignId: data.campaignId } });
    return { sent: 0, reason: error.message };
  }
}
export function startCollectionWorker(sql) {
  if (process.env.WHATSAPP_WORKER_ENABLED !== 'true') return;
  let running = false;
  const tick = async () => {
    if (running) return; running = true;
    try {
      await ensureHub(sql);
      const accounts = await sql('SELECT tenant_id FROM hub_cloud_accounts WHERE enabled=true');
      // Um envio por minuto e empresa; a fila partilhada impede dois processos de obterem o mesmo trabalho.
      for (const a of accounts) await processQueue(sql, a.tenant_id).catch(e => console.warn('[Hub WhatsApp]', e.message));
      await sql(`UPDATE hub_cloud_jobs SET status='unknown',error='Processo interrompido: confirmar na Meta antes de reenviar',updated_at=NOW() WHERE status='sending' AND updated_at < NOW()-INTERVAL '5 minutes'`);
    } catch (e) { console.warn('[Hub WhatsApp worker]', e.message); } finally { running = false; }
  };
  const timer = setInterval(tick, 60000); timer.unref();
}
