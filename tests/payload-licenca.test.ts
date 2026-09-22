import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalizeLicensePayload, validateSignedLicensePayload } from '../src/bibliotecas/payload-licenca.ts';

const valid = {
    alg: 'RS256', kid: 'tango-license-2026-01', licenseVersion: 2,
    jti: '550e8400-e29b-41d4-a716-446655440000', mid: 'TANGO-DEVICE', type: 'annual',
    tier: 'singular', iat: '2026-09-22T00:00:00.000Z', exp: '2035-09-22T00:00:00.000Z', devices: 1
};

test('payload de licença é validado e canonicalizado de forma determinística', () => {
    validateSignedLicensePayload(valid, Date.parse('2026-09-22T01:00:00.000Z'));
    const a = canonicalizeLicensePayload(valid);
    const b = canonicalizeLicensePayload(Object.fromEntries(Object.entries(valid).reverse()));
    assert.equal(a, b);
});

test('payload recusa algoritmo, datas, identificador e dispositivos inválidos', () => {
    assert.throws(() => validateSignedLicensePayload({ ...valid, alg: 'none' }), /inválidos/);
    assert.throws(() => validateSignedLicensePayload({ ...valid, exp: valid.iat }), /inválidos/);
    assert.throws(() => validateSignedLicensePayload({ ...valid, jti: 'previsivel' }), /inválidos/);
    assert.throws(() => validateSignedLicensePayload({ ...valid, devices: 0 }), /inválidos/);
});
