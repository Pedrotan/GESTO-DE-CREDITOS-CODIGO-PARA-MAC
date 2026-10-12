import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { LICENSE_TOKEN_PUBLIC_KEYS } from '../src/bibliotecas/chave-publica-tokens.ts';

test('as chaves públicas dos tokens são Ed25519 e o kid corresponde à chave', () => {
    assert.ok(LICENSE_TOKEN_PUBLIC_KEYS.length >= 1);
    for (const entry of LICENSE_TOKEN_PUBLIC_KEYS) {
        const der = Buffer.from(entry.publicKey, 'base64');
        assert.equal(crypto.createPublicKey({ key: der, format: 'der', type: 'spki' }).asymmetricKeyType, 'ed25519');
        assert.equal(entry.kid, crypto.createHash('sha256').update(der).digest('hex').slice(0, 16));
    }
});
