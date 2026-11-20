import assert from 'node:assert/strict';
import test from 'node:test';
import { createHmac, randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { DatabaseSync } from 'node:sqlite';
import { PGlite } from '@electric-sql/pglite';
import { POLITICA_COBRANCA_PADRAO as padrao, telefoneAngola, validarPolitica, horarioPermitido, hojeLuanda, elegibilidadePromocao, destinatariosUnicos, pediuSaida, estadoMensagem, payloadMeta, passoDaRegua } from '../vercel-api/_cobranca-regras.js';
import { ensureHub, encryptCredentials, decryptCredentials, verifyWebhook, validateApprovedTemplate, processQueue, ingestWebhook, feriadosDoAno } from '../vercel-api/_cobranca-cloud.js';
import { HUB_COLLECTION_SCHEMA_SQL } from '../src/bibliotecas/esquema-hub-cobranca.ts';
import { angolaHolidays } from '../src/bibliotecas/feriados-angola.ts';
const root = resolve(import.meta.dirname, '..');
const credentials = { phoneNumberId: '12345678', businessAccountId: '87654321', apiVersion: 'v26.0', token: 'test-only-token-that-is-never-sent', appSecret: 'test-app-secret-1234567890', verifyToken: 'test-verification-12345678' };
const template = { id: 't', name: 'lembrete', status: 'APPROVED', category: 'UTILITY', language: 'pt_PT', components: [{ type: 'BODY', text: 'Olá {{1}}, valor {{2}}, vence {{3}}, {{4}}.' }] };

test('telefones +244: normalização, formatos inválidos e duplicados', () => {
  for (const phone of ['923 456 789', '+244 923456789', '00244923456789']) assert.equal(telefoneAngola(phone), '244923456789');
  for (const phone of ['', '244123456789', '92345678', '351923456789']) assert.equal(telefoneAngola(phone), null);
  const result = destinatariosUnicos([{ phone: '923456789' }, { phone: '+244923456789' }, { phone: 'x' }]);
  assert.equal(result.validos.length, 1); assert.equal(result.rejeitados.length, 2);
});
test('horários e feriados usam Angola em vez do fuso da máquina', () => {
  assert.equal(hojeLuanda('2026-10-24T23:30:00Z'), '2026-10-25');
  assert.match(horarioPermitido('2026-10-25T10:00:00Z', padrao), /semana/);
  assert.match(horarioPermitido('2026-10-27T18:00:00Z', padrao), /horário/);
  assert.equal(horarioPermitido('2026-10-27T07:00:00Z', padrao), null);
  assert.match(horarioPermitido('2026-11-11T10:00:00Z', padrao, feriadosDoAno(2026)), /Feriado/);
  assert.deepEqual([...feriadosDoAno(2026)].sort(), [...angolaHolidays(2026).keys()].sort());
});
test('política valida limites e régua escolhe um só passo, respeitando promessas', () => {
  assert.throws(() => validarPolitica({ limiteDiario: 0 }), /inválida/);
  assert.throws(() => validarPolitica({ inicioHora: 19, fimHora: 8 }), /posterior/);
  assert.throws(() => validarPolitica({ intervaloPromocoesDias: 1 }), /inválida/);
  assert.equal(passoDaRegua({ diasAtraso: -2, hoje: '2026-10-25' }, padrao).id, 'd-3');
  assert.equal(passoDaRegua({ diasAtraso: 8, hoje: '2026-10-25' }, padrao).id, 'd7');
  assert.equal(passoDaRegua({ diasAtraso: 8, hoje: '2026-10-25' }, padrao, ['d7']), null);
  assert.equal(passoDaRegua({ diasAtraso: 8, hoje: '2026-10-25' }, padrao, [], '2026-10-26'), null);
});
test('promoções exigem aceite, excluem atrasados e respeitam saída e frequência', () => {
  const data = { consentimento: true, saida: false, atrasoMinor: 0 };
  assert.equal(elegibilidadePromocao(data), null);
  assert.match(elegibilidadePromocao({ ...data, consentimento: false }), /consentimento/);
  assert.match(elegibilidadePromocao({ ...data, saida: true }), /consentimento/);
  assert.match(elegibilidadePromocao({ ...data, atrasoMinor: 1 }), /atraso/);
  assert.match(elegibilidadePromocao({ ...data, ultimoEnvio: new Date().toISOString() }), /frequência/);
  assert.equal(pediuSaida(' sair '), true); assert.equal(pediuSaida('Gostava de sair amanhã?'), false);
});
test('modelos aprovados: categoria, parâmetros, opt-out e anexos', () => {
  const job = { purpose: 'collection', templateName: 'lembrete', language: 'pt_PT', parameters: ['Ana', '100 Kz', '25/10', 'IBAN'] };
  assert.match(validateApprovedTemplate(job, [template]), /Ana/);
  assert.throws(() => validateApprovedTemplate({ ...job, parameters: ['Ana'] }, [template]), /parâmetros/);
  assert.throws(() => validateApprovedTemplate({ ...job, purpose: 'marketing' }, [template]), /MARKETING/);
  const marketing = { ...template, category: 'MARKETING' };
  assert.throws(() => validateApprovedTemplate({ ...job, purpose: 'marketing' }, [marketing]), /SAIR/);
  assert.equal(estadoMensagem('read', 'sent'), 'read'); assert.equal(estadoMensagem('delivered', 'failed'), 'delivered');
  assert.equal(payloadMeta({ phone: '923456789', templateName: 'lembrete', parameters: ['Ana'], mediaId: 'media', mediaType: 'document', filename: 'nota.pdf' }).template.components[0].parameters[0].document.filename, 'nota.pdf');
});
test('segredos cifrados e webhook: assinatura sobre bytes originais, sem aceitar corpo alterado', () => {
  const old = process.env.WHATSAPP_ENCRYPTION_KEY; process.env.WHATSAPP_ENCRYPTION_KEY = randomBytes(32).toString('hex');
  try {
    const encrypted = encryptCredentials(credentials); assert.ok(!encrypted.includes(credentials.token)); assert.deepEqual(decryptCredentials(encrypted), credentials);
    const raw = Buffer.from('{ "entry": [] }'); const sig = 'sha256=' + createHmac('sha256', credentials.appSecret).update(raw).digest('hex');
    assert.equal(verifyWebhook(raw, sig, credentials.appSecret), true);
    assert.equal(verifyWebhook(Buffer.from('{"entry":[]}'), sig, credentials.appSecret), false);
    assert.equal(verifyWebhook(raw, 'sha256=errado', credentials.appSecret), false);
  } finally { if (old === undefined) delete process.env.WHATSAPP_ENCRYPTION_KEY; else process.env.WHATSAPP_ENCRYPTION_KEY = old; }
});
test('histórico local é imutável e o esquema pode ser aplicado numa base antiga', () => {
  const db = new DatabaseSync(':memory:');
  try {
    for (const sql of [...HUB_COLLECTION_SCHEMA_SQL, ...HUB_COLLECTION_SCHEMA_SQL]) db.exec(sql);
    db.prepare('INSERT INTO hub_collection_events VALUES (?,?,?,?,?,?,?,?,?,?,?)').run('e', 'c', 'cr', 'call', 'phone', 'confirmed', 'Atendido', '{}', 'u', 'Operador', '2026-10-25');
    assert.throws(() => db.exec('DELETE FROM hub_collection_events'), /imutável/);
    assert.throws(() => db.exec("UPDATE hub_collection_events SET message='editado'"), /imutável/);
  } finally { db.close(); }
});
test('prestações parciais, cancelamentos, antiguidade e promessas usam os montantes correctos', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'hub-domain-')), outfile = join(dir, 'domain.mjs');
  try {
    await build({ entryPoints: [resolve(root, 'src/bibliotecas/hub-cobranca.ts')], outfile, bundle: true, platform: 'node', format: 'esm', logLevel: 'silent' });
    const domain = await import(pathToFileURL(outfile).href);
    const client = { id: 'c', name: 'Ana', createdAt: '2026-01-01' };
    const credit = { id: 'cr', clientId: 'c', status: 'active', totalDue: 999999, dueDate: '2026-12-25' };
    const installment = { id: 'i', creditId: 'cr', dueDate: '2026-10-24', installmentNumber: 1, principalMinor: 10000, interestMinor: 2000, lateInterestMinor: 300, paidPrincipalMinor: 3000, paidInterestMinor: 1000, paidLateInterestMinor: 0, status: 'partial' };
    const rows = domain.clientesDoHub([client], [credit], [installment, { ...installment, id: 'cancelled', status: 'cancelled' }, { ...installment, id: 'future', dueDate: '2026-10-26' }], 7, '2026-10-25');
    assert.equal(rows[0].atrasoMinor, 8300); assert.equal(rows[0].aVencerMinor, 8300); assert.equal(rows[0].vencidas.length, 1);
    assert.equal(rows[0].diasAtraso, 1); assert.equal(domain.faixasDivida(rows)[0].clientes, 1);
    const promise = { id: 'p', kind: 'promise', creditId: 'cr', amountMinor: 5000, promisedDate: '2026-10-25', createdAt: '2026-10-24T08:00:00Z' };
    const payment = { id: 'pay', creditId: 'cr', amount: 50, status: 'confirmed', paymentDate: '2026-10-25T10:00:00Z' };
    assert.equal(domain.apurarPromessas([promise], [payment], '2026-10-25')[0].cumprida, true);
    assert.equal(domain.apurarPromessas([promise], [{ ...payment, status: 'cancelled' }], '2026-10-26')[0].cumprida, false);
    assert.equal(domain.apurarPromessas([promise], [], '2026-10-25').length, 0);
    assert.equal(domain.indicadoresHub(rows, [{ id: 'e', kind: 'message', status: 'prepared', metadata: '{}', clientId: 'c', creditId: 'cr', createdAt: '2026-10-25T09:00:00Z' }], [], [payment], '2026-10-25').recuperadoMinor, 0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test('fila PostgreSQL: isolamento, cancelamento após pagamento, envio único, resposta SAIR e estados fora de ordem', async () => {
  const old = process.env.WHATSAPP_ENCRYPTION_KEY; process.env.WHATSAPP_ENCRYPTION_KEY = randomBytes(32).toString('hex');
  const db = new PGlite(), sql = async (q, p = []) => (await db.query(q, p)).rows;
  try {
    await ensureHub(sql);
    const policy = { ...padrao, intervaloEnvioSegundos: 30 };
    await sql('INSERT INTO hub_cloud_accounts(tenant_id,enabled,credentials,policy) VALUES ($1,true,$2,$3::jsonb)', ['A', encryptCredentials(credentials), JSON.stringify(policy)]);
    const data = { purpose: 'collection', templateName: 'lembrete', language: 'pt_PT', parameters: ['Ana', '100', '25/10', 'IBAN'], itemId: 'i', creditId: 'cr' };
    let calls = 0;
    const fetcher = async (url, options) => { if (url.includes('message_templates')) return { ok: true, json: async () => ({ data: [template] }) }; calls++; const payload = JSON.parse(options.body); assert.equal(payload.to, '244923456789'); assert.ok(payload.template.components[0].parameters[1].text.includes('100')); return { ok: true, json: async () => ({ messages: [{ id: 'wamid.1' }] }) }; };
    await sql('INSERT INTO hub_cloud_snapshots(tenant_id,client_id,data) VALUES ($1,$2,$3::jsonb)', ['A', 'c', JSON.stringify({ phone: '244923456789', atrasoMinor: 10000, items: [{ id: 'i', valorMinor: 10000 }] })]);
    await sql('INSERT INTO hub_cloud_jobs(id,tenant_id,client_id,phone,data,scheduled_at) VALUES ($1,$2,$3,$4,$5::jsonb,NOW())', ['j', 'A', 'c', '244923456789', JSON.stringify(data)]);
    const result = await processQueue(sql, 'A', fetcher, async () => ({ ok: true }), new Date('2026-10-27T09:00:00Z'));
    assert.equal(result.sent, 1); assert.equal(calls, 1);
    await processQueue(sql, 'A', fetcher, async () => ({ ok: true }), new Date('2026-10-27T09:00:00Z')); assert.equal(calls, 1);
    assert.equal((await sql('SELECT * FROM hub_cloud_events WHERE tenant_id=$1', ['B'])).length, 0);
    await ingestWebhook(sql, 'A', { statuses: [{ id: 'wamid.1', status: 'read', timestamp: '1793000000' }] });
    await ingestWebhook(sql, 'A', { statuses: [{ id: 'wamid.1', status: 'sent', timestamp: '1793000000' }] });
    assert.equal((await sql('SELECT status FROM hub_cloud_jobs WHERE id=$1', ['j']))[0].status, 'read');
    await ingestWebhook(sql, 'A', { messages: [{ id: 'reply.1', from: '244923456789', timestamp: '1793000000', text: { body: 'SAIR' } }] });
    await ingestWebhook(sql, 'A', { messages: [{ id: 'reply.1', from: '244923456789', timestamp: '1793000000', text: { body: 'SAIR' } }] });
    assert.equal((await sql('SELECT * FROM hub_cloud_optouts')).length, 1);
    assert.equal((await sql("SELECT * FROM hub_cloud_events WHERE kind='consent'")).length, 1);
    await sql("UPDATE hub_cloud_snapshots SET data=jsonb_set(data,'{items}','[]')");
    await sql('INSERT INTO hub_cloud_jobs(id,tenant_id,client_id,phone,data,scheduled_at) VALUES ($1,$2,$3,$4,$5::jsonb,NOW())', ['j2', 'A', 'c', '244923456789', JSON.stringify(data)]);
    await processQueue(sql, 'A', fetcher, async () => ({ ok: true }), new Date('2026-10-27T09:00:00Z'));
    assert.equal((await sql('SELECT status FROM hub_cloud_jobs WHERE id=$1', ['j2']))[0].status, 'cancelled'); assert.equal(calls, 1);
  } finally { await db.close(); if (old === undefined) delete process.env.WHATSAPP_ENCRYPTION_KEY; else process.env.WHATSAPP_ENCRYPTION_KEY = old; }
});
