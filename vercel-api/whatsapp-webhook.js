import { ensureHub, accountCredentials, verifyWebhook, ingestWebhook } from './_cobranca-cloud.js';
import { safeEqual } from './_security.js';
export const config = { api: { bodyParser: false } };
export async function handleWebhook(req, res, sql) {
  const tenant = String(req.query?.empresa || '').trim().toUpperCase();
  if (!tenant || tenant.length > 100) return res.status(404).end();
  await ensureHub(sql);
  const account = (await sql('SELECT * FROM hub_cloud_accounts WHERE tenant_id=$1', [tenant]))[0];
  let credentials; try { credentials = accountCredentials(account); } catch { return res.status(503).end(); }
  if (!credentials) return res.status(404).end();
  if (req.method === 'GET') {
    if (req.query['hub.mode'] !== 'subscribe' || !safeEqual(req.query['hub.verify_token'], credentials.verifyToken)) return res.status(403).end();
    res.setHeader('Content-Type', 'text/plain'); return res.status(200).end(String(req.query['hub.challenge'] || ''));
  }
  if (req.method !== 'POST') return res.status(405).end();
  let raw = req.rawBody;
  if (!raw) {
    const chunks = []; let length = 0;
    for await (const chunk of req) { length += chunk.length; if (length > 2 * 1024 * 1024) return res.status(413).end(); chunks.push(chunk); }
    raw = Buffer.concat(chunks);
  }
  if (!verifyWebhook(raw, req.headers['x-hub-signature-256'], credentials.appSecret)) return res.status(401).end();
  const body = JSON.parse(raw.toString('utf8'));
  if (body.object !== 'whatsapp_business_account') return res.status(400).end();
  for (const entry of body.entry || []) {
    if (String(entry.id) !== credentials.businessAccountId) continue;
    for (const change of entry.changes || []) if (change.field === 'messages' && String(change.value?.metadata?.phone_number_id) === credentials.phoneNumberId) await ingestWebhook(sql, tenant, change.value);
  }
  return res.status(200).end('EVENT_RECEIVED');
}
export default async function handler(req, res) {
  if (!process.env.DATABASE_URL) return res.status(503).end();
  try { const { neon } = await import('@neondatabase/serverless'); const client = neon(process.env.DATABASE_URL); return await handleWebhook(req, res, (q, p = []) => client.query(q, p)); }
  catch { return res.status(503).end(); }
}
