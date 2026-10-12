import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { legacyKeysForImport } from '../src/bibliotecas/licencas-legado.ts';
import { encodeLicensePayload } from '../src/bibliotecas/payload-licenca.ts';

const signedKey = (payload: Record<string, unknown>) =>
    btoa(JSON.stringify({ payload: encodeLicensePayload(JSON.stringify(payload)), signature: 'AAAA' }));

test('converte as chaves do Master em metadados, sem enviar a chave em claro', async () => {
    const jti = crypto.randomUUID();
    const key = signedKey({ jti, nif: '5003207439', mid: 'TANGO-16EDE273', type: 'annual', tier: 'empresarial',
        exp: '2027-10-12T00:00:00.000Z', iat: '2026-10-12T00:00:00.000Z', devices: 2, client: 'Digital Norte – Comércio' });
    const { keys, unreadable } = await legacyKeysForImport([
        { key: key.replace(/(.{60})/g, '$1\n') }, // colada com quebras de linha
        { key, status: 'migrated' },               // repetida: conta uma vez
        { key: 'chave-antiga-ilegivel' },
    ]);
    assert.equal(unreadable, 1);
    assert.equal(keys.length, 1);
    assert.deepEqual({ ...keys[0], keyHash: undefined }, {
        jti, nif: '5003207439', mid: 'TANGO-16EDE273', type: 'annual', tier: 'empresarial', exp: '2027-10-12T00:00:00.000Z',
        iat: '2026-10-12T00:00:00.000Z', devices: 2, keyHash: undefined, status: 'active',
    });
    assert.equal(keys[0].keyHash, crypto.createHash('sha256').update(key).digest('hex'));
    assert.ok(!JSON.stringify(keys).includes(key.slice(0, 40)), 'a chave não segue no pedido');
});
