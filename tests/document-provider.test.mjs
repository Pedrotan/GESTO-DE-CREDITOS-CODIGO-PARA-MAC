import test from 'node:test';
import assert from 'node:assert/strict';
import { lookupConfiguredProvider } from '../vercel-api/_document-provider.js';

test('não consulta serviços sem chave configurada', async () => {
  const result = await lookupConfiguredProvider('5400000000', 'COLECTIVO', {}, () => { throw new Error('Não deve ser chamado'); });
  assert.equal(result.code, 'PROVIDER_NOT_CONFIGURED');
});
test('NIF usa Bearer no servidor e normaliza resposta aninhada', async () => {
  const result = await lookupConfiguredProvider('5400000000', 'COLECTIVO', { TANGO_NIF_PROVIDER_KEY: 'test-only' }, async (url, options) => {
    assert.equal(url, 'https://api-agt.angohost.ao/consultar/5400000000');
    assert.equal(options.headers.Authorization, 'Bearer test-only');
    return { ok: true, json: async () => ({ data: { success: true, nome: 'Empresa de teste', endereco: 'Luanda' } }) };
  });
  assert.equal(result.success, true);
  assert.equal(result.address, 'Luanda');
});
test('BI envia X-API-Key e distingue rejeição de autenticação', async () => {
  const result = await lookupConfiguredProvider('000000000LA000', 'SINGULAR', { TANGO_BI_PROVIDER_KEY: 'test-only' }, async (_url, options) => {
    assert.equal(options.headers['X-API-Key'], 'test-only');
    return { ok: false, status: 401 };
  });
  assert.equal(result.code, 'PROVIDER_AUTH_FAILED');
  assert.ok(!JSON.stringify(result).includes('test-only'));
});
test('não apresenta indisponibilidade como documento inexistente', async () => {
  const result = await lookupConfiguredProvider('5400000000', 'COLECTIVO', { TANGO_NIF_PROVIDER_KEY: 'test-only' }, async () => { throw new Error('timeout'); });
  assert.equal(result.code, 'PROVIDER_UNAVAILABLE');
});