import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { MASTER_PUBLIC_KEY, MASTER_PUBLIC_KEYS } from '../src/bibliotecas/chave-publica-licencas.ts';

const der = (key: string) => Buffer.from(key.replace(/-----[^-]+-----/g, '').replace(/\s/g, ''), 'base64');

test('as chaves públicas embutidas são válidas e distintas, com a actual em primeiro', () => {
    assert.equal(MASTER_PUBLIC_KEYS[0], MASTER_PUBLIC_KEY);
    assert.ok(MASTER_PUBLIC_KEYS.length >= 2, 'a chave anterior continua aceite');
    assert.equal(new Set(MASTER_PUBLIC_KEYS).size, MASTER_PUBLIC_KEYS.length);
    for (const key of MASTER_PUBLIC_KEYS) {
        const imported = crypto.createPublicKey({ key: der(key), format: 'der', type: 'spki' });
        assert.equal(imported.asymmetricKeyType, 'rsa');
    }
});

test('uma assinatura de outra chave é recusada por todas sem lançar erro', async () => {
    const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    const payload = Buffer.from('{"teste":true}').toString('base64');
    const signature = crypto.sign('sha256', Buffer.from(payload), { key: privateKey, padding: crypto.constants.RSA_PKCS1_PADDING });
    for (const key of MASTER_PUBLIC_KEYS) {
        const imported = await crypto.webcrypto.subtle.importKey('spki', der(key), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
        assert.equal(await crypto.webcrypto.subtle.verify('RSASSA-PKCS1-v1_5', imported, signature, new TextEncoder().encode(payload)), false);
    }
});
