import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import test from 'node:test';
import { authorizeTenant, sha256 } from '../vercel-api/_autorizacao-empresa.js';
import { isValidMasterSecret } from '../vercel-api/_security.js';

const newKey = () => randomBytes(32).toString('base64url');

test('segredo Master só aceita 32 bytes aleatórios em base64url canónico', () => {
    const secret = newKey();
    assert.equal(isValidMasterSecret(secret), true);
    assert.equal(isValidMasterSecret(secret.slice(1)), false);
    assert.equal(isValidMasterSecret(`${secret}!`), false);
    assert.equal(isValidMasterSecret(undefined), false);
});

test('sincronização exige chave individual, tenant registado e respeita revogação', async () => {
    const previousGlobalKey = process.env.TANGO_SYNC_SECRET;
    const globalKey = newKey();
    const tenantAKey = newKey();
    const tenantBKey = newKey();
    const rotatedKey = newKey();
    process.env.TANGO_SYNC_SECRET = globalKey;

    const tenants = new Map([
        ['TENANT-A', { key_hash: sha256(tenantAKey), status: 'active', expires_at: null, access_code: null }],
        ['TENANT-B', { key_hash: sha256(tenantBKey), status: 'active', expires_at: null, access_code: null }],
    ]);
    let implicitCreates = 0;
    const sql = async (statement, params = []) => {
        if (statement.includes('SELECT key_hash')) {
            const tenant = tenants.get(String(params[0]).toUpperCase());
            return tenant ? [tenant] : [];
        }
        if (statement.includes('INSERT INTO tango_tenants')) implicitCreates += 1;
        return [];
    };

    try {
        assert.deepEqual(await authorizeTenant(sql, 'tenant-a', tenantAKey), { ok: true });
        assert.equal((await authorizeTenant(sql, 'tenant-b', tenantAKey)).ok, false);
        assert.equal((await authorizeTenant(sql, 'tenant-b', globalKey)).ok, false);
        assert.equal((await authorizeTenant(sql, 'tenant-unknown', globalKey)).ok, false);
        assert.equal(implicitCreates, 0);

        tenants.set('TENANT-A', { ...tenants.get('TENANT-A'), key_hash: sha256(rotatedKey) });
        assert.equal((await authorizeTenant(sql, 'tenant-a', tenantAKey)).ok, false);
        assert.deepEqual(await authorizeTenant(sql, 'tenant-a', rotatedKey), { ok: true });

        tenants.set('TENANT-A', { ...tenants.get('TENANT-A'), status: 'blocked' });
        assert.equal((await authorizeTenant(sql, 'tenant-a', rotatedKey)).status, 403);
    } finally {
        if (previousGlobalKey === undefined) delete process.env.TANGO_SYNC_SECRET;
        else process.env.TANGO_SYNC_SECRET = previousGlobalKey;
    }
});