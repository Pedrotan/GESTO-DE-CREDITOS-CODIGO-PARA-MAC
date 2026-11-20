import crypto from 'node:crypto';
import { authorizeTenant } from './_autorizacao-empresa.js';
import { applyCors, enforceDistributedRateLimit } from './_security.js';
import { ensureHub, accountCredentials, approvedTemplates, encryptCredentials, validateCredentials, validateApprovedTemplate, metaRequest, optOut, processQueue } from './_cobranca-cloud.js';
import { telefoneAngola, validarPolitica, POLITICA_COBRANCA_PADRAO, diaValido } from './_cobranca-regras.js';
const send = (res, status, data) => { res.setHeader('Cache-Control', 'no-store'); return res.status(status).json(data); };
const small = (v, n = 300) => String(v || '').trim().slice(0, n);
export async function handleHub(req, res, sql) {
  if (!applyCors(req, res)) return send(res, 403, { success: false, message: 'Origem não autorizada.' });
  if (req.method === 'OPTIONS') return send(res, 200, { success: true });
  if (req.method !== 'POST') return send(res, 405, { success: false, message: 'Use POST.' });
  if (!await enforceDistributedRateLimit(sql, req, res, { limit: 180, windowMs: 60000, scope: 'hub_cobranca' })) return;
  const tenant = small(req.headers['x-tenant-id'], 100).toUpperCase(), code = String(req.headers['x-sync-passkey'] || '');
  if (!tenant || (!code && !req.headers.cookie)) return send(res, 401, { success: false, message: 'Ligue primeiro a empresa.' });
  const auth = await authorizeTenant(sql, tenant, code, req);
  if (!auth.ok) return send(res, auth.status, { success: false, message: auth.message });
  await ensureHub(sql);
  const body = req.body || {}, accounts = await sql('SELECT * FROM hub_cloud_accounts WHERE tenant_id=$1', [tenant]);
  const account = accounts[0];
  const credentials = () => { const c = accountCredentials(account); if (!c) throw new Error('Configure primeiro a WhatsApp Business Platform.'); return c; };
  try {
    switch (body.accao) {
      case 'estado': {
        const [events, jobs, optOuts] = await Promise.all([
          sql('SELECT * FROM hub_cloud_events WHERE tenant_id=$1 AND seq > $2 ORDER BY seq LIMIT 2000', [tenant, Math.max(0, Number(body.after) || 0)]),
          sql('SELECT id,client_id,phone,data,status,provider_id,error,scheduled_at,updated_at FROM hub_cloud_jobs WHERE tenant_id=$1 ORDER BY scheduled_at DESC LIMIT 1000', [tenant]),
          sql('SELECT client_id,updated_at FROM hub_cloud_optouts WHERE tenant_id=$1', [tenant]),
        ]);
        let ready = false; try { ready = Boolean(accountCredentials(account)); } catch { /* chave de cifra em falta */ }
        return send(res, 200, { success: true, connected: ready, enabled: account?.enabled || false, encryptionReady: (process.env.WHATSAPP_ENCRYPTION_KEY || '').length >= 32, worker: process.env.WHATSAPP_WORKER_ENABLED === 'true', events, jobs, optOuts, cursor: events.at(-1)?.seq || Number(body.after) || 0, hasMore: events.length === 2000 });
      }
      case 'configurar': {
        if (!code) return send(res, 403, { success: false, message: 'Para configurar o canal, indique o Código de Acesso da empresa.' });
        const c = validateCredentials(body.config || {}), cipher = encryptCredentials(c), policy = validarPolitica(body.politica || POLITICA_COBRANCA_PADRAO);
        await sql(`INSERT INTO hub_cloud_accounts (tenant_id,credentials,policy,enabled) VALUES ($1,$2,$3::jsonb,false) ON CONFLICT(tenant_id) DO UPDATE SET credentials=excluded.credentials,policy=excluded.policy,enabled=false,updated_at=NOW()`, [tenant, cipher, JSON.stringify(policy)]);
        return send(res, 200, { success: true });
      }
      case 'activar': {
        if (!code) return send(res, 403, { success: false, message: 'Confirme o Código de Acesso da empresa para activar ou desactivar envios.' });
        if (body.enabled === true) credentials();
        await sql('UPDATE hub_cloud_accounts SET enabled=$2,updated_at=NOW() WHERE tenant_id=$1', [tenant, body.enabled === true]);
        return send(res, 200, { success: true });
      }
      case 'politica': {
        const policy = validarPolitica(body.politica);
        await sql(`INSERT INTO hub_cloud_accounts (tenant_id,policy) VALUES ($1,$2::jsonb) ON CONFLICT(tenant_id) DO UPDATE SET policy=excluded.policy,updated_at=NOW()`, [tenant, JSON.stringify(policy)]);
        return send(res, 200, { success: true });
      }
      case 'modelos': return send(res, 200, { success: true, templates: await approvedTemplates(credentials()) });
      case 'snapshot': {
        if (!Array.isArray(body.clients) || body.clients.length > 1000) throw new Error('Envie até 1000 clientes por lote.');
        for (const c of body.clients) {
          if (!c.id || !Array.isArray(c.items) || c.items.length > 500 || !Number.isSafeInteger(c.atrasoMinor) || c.atrasoMinor < 0 || (c.manualContactsToday !== undefined && (!Number.isInteger(c.manualContactsToday) || c.manualContactsToday < 0 || c.manualContactsToday > 1000))) throw new Error('Dados financeiros inválidos.');
          const data = { phone: telefoneAngola(c.phone), atrasoMinor: c.atrasoMinor, manualContactsToday: c.manualContactsToday || 0, manualDay: new Date(Date.now() + 3600000).toISOString().slice(0, 10), consentimento: c.consentimento === true && Boolean(c.aceiteEm), aceiteEm: c.aceiteEm || null, promessa: c.promessa || null, failedPromises: Array.isArray(c.failedPromises) ? c.failedPromises.slice(0, 500).map(String) : [], items: c.items.map(i => { if (!i.id || !Number.isSafeInteger(i.valorMinor) || i.valorMinor < 0 || !diaValido(i.vencimento)) throw new Error('Prestação inválida.'); return { id: small(i.id), valorMinor: i.valorMinor, vencimento: i.vencimento }; }) };
          await sql(`INSERT INTO hub_cloud_snapshots (tenant_id,client_id,data) VALUES ($1,$2,$3::jsonb) ON CONFLICT(tenant_id,client_id) DO UPDATE SET data=excluded.data,updated_at=NOW()`, [tenant, small(c.id), JSON.stringify(data)]);
          // Novo aceite explícito posterior à saída pode reactivar promoções; um snapshot antigo não pode fazê-lo.
          if (data.consentimento && Number.isFinite(Date.parse(data.aceiteEm))) await sql('DELETE FROM hub_cloud_optouts WHERE tenant_id=$1 AND phone=$2 AND updated_at < $3::timestamptz', [tenant, data.phone, data.aceiteEm]);
        }
        return send(res, 200, { success: true });
      }
      case 'optOut': await optOut(sql, tenant, small(body.clientId)); return send(res, 200, { success: true });
      case 'anexo': {
        const mime = body.mime, filename = small(body.filename, 150);
        if (!['image/png', 'image/jpeg', 'application/pdf'].includes(mime) || typeof body.base64 !== 'string' || body.base64.length > 5600000) throw new Error('Envie uma imagem PNG/JPEG ou PDF com até 4 MB.');
        const bytes = Buffer.from(body.base64, 'base64');
        if (!bytes.length || bytes.length > 4 * 1024 * 1024) throw new Error('Anexo vazio ou demasiado grande.');
        const c = credentials(), form = new FormData(); form.set('messaging_product', 'whatsapp'); form.set('type', mime); form.set('file', new Blob([bytes], { type: mime }), filename);
        const media = await metaRequest(c, `${c.phoneNumberId}/media`, { method: 'POST', body: form });
        if (!media.id) throw new Error('A Meta não devolveu o identificador do anexo.');
        await sql('INSERT INTO hub_cloud_media (tenant_id,media_id,mime,filename) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING', [tenant, media.id, mime, filename]);
        return send(res, 200, { success: true, mediaId: media.id, mediaType: mime === 'application/pdf' ? 'document' : 'image' });
      }
      case 'agendar': {
        if (!account?.enabled) throw new Error('Os envios reais estão desligados na configuração do canal.');
        if (!Array.isArray(body.jobs) || !body.jobs.length || body.jobs.length > 500) throw new Error('Prepare de 1 a 500 mensagens por lote.');
        const templates = await approvedTemplates(credentials());
        let queued = 0;
        for (const j of body.jobs) {
          const phone = telefoneAngola(j.phone);
          if (!phone || !j.clientId || !/^[\w:.-]{1,250}$/.test(j.id || '') || !['collection', 'marketing', 'promise', 'test'].includes(j.purpose) || !Array.isArray(j.parameters) || j.parameters.length > 20 || j.parameters.some(p => typeof p !== 'string' || p.length > 2000) || !Number.isFinite(Date.parse(j.scheduledAt))) throw new Error('Mensagem ou agendamento inválido.');
          if (j.purpose === 'marketing' && (!j.campaignId || !diaValido(j.expiresAt))) throw new Error('Indique a campanha e a sua validade.');
          if (j.mediaId && !(await sql('SELECT media_id FROM hub_cloud_media WHERE tenant_id=$1 AND media_id=$2', [tenant, j.mediaId])).length) throw new Error('O anexo não pertence a esta empresa.');
          const preview = validateApprovedTemplate(j, templates);
          const result = await sql(`INSERT INTO hub_cloud_jobs (id,tenant_id,client_id,phone,data,scheduled_at) VALUES ($1,$2,$3,$4,$5::jsonb,$6) ON CONFLICT(tenant_id,id) DO UPDATE SET status='queued',data=excluded.data,scheduled_at=excluded.scheduled_at,error=NULL,updated_at=NOW() WHERE hub_cloud_jobs.status='cancelled' AND hub_cloud_jobs.error='Campanha pausada' RETURNING id`, [j.id, tenant, j.clientId, phone, JSON.stringify({ ...j, preview }), j.scheduledAt]);
          queued += result.length;
        }
        return send(res, 200, { success: true, queued });
      }
      case 'pausarCampanha': await sql(`UPDATE hub_cloud_jobs SET status='cancelled',error='Campanha pausada',updated_at=NOW() WHERE tenant_id=$1 AND data->>'campaignId'=$2 AND status='queued'`, [tenant, small(body.campaignId)]); return send(res, 200, { success: true });
      case 'cancelar': await sql(`UPDATE hub_cloud_jobs SET status='cancelled',error='Cancelada pelo operador',updated_at=NOW() WHERE tenant_id=$1 AND id=$2 AND status='queued'`, [tenant, small(body.id)]); return send(res, 200, { success: true });
      case 'processar': return send(res, 200, { success: true, ...await processQueue(sql, tenant) });
      default: return send(res, 400, { success: false, message: 'Acção desconhecida.' });
    }
  } catch (e) { return send(res, 400, { success: false, message: e.message }); }
}
export default async function handler(req, res) {
  if (!process.env.DATABASE_URL) return send(res, 503, { success: false, message: 'Servidor sem base de dados configurada.' });
  try { const { neon } = await import('@neondatabase/serverless'); const client = neon(process.env.DATABASE_URL); return await handleHub(req, res, (q, p = []) => client.query(q, p)); }
  catch { return send(res, 503, { success: false, message: 'O serviço de cobrança está temporariamente indisponível.' }); }
}
