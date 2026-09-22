import assert from 'node:assert/strict';
import test from 'node:test';
import { assertRendererSqlAllowlisted, isAllowedDynamicUpdate } from '../electron/sql-policy.ts';

test('política SQL aceita comandos registados e rejeita mutação arbitrária', () => {
    assert.doesNotThrow(() => assertRendererSqlAllowlisted([{ sql: 'UPDATE notifications SET read = 1 WHERE id = ?' }]));
    assert.throws(() => assertRendererSqlAllowlisted([{ sql: 'UPDATE notifications SET message = ? WHERE id = ?' }]), /não registado/);
    assert.throws(() => assertRendererSqlAllowlisted([{ sql: 'DELETE FROM accounting_entries' }]), /não registado/);
});

test('updates dinâmicos só aceitam tabelas e colunas declaradas', () => {
    assert.equal(isAllowedDynamicUpdate('UPDATE suppliers SET name = ?, status = ? WHERE id = ?'), true);
    assert.equal(isAllowedDynamicUpdate('UPDATE suppliers SET apiSecret = ? WHERE id = ?'), false);
    assert.equal(isAllowedDynamicUpdate('UPDATE users SET role = ? WHERE id = ?'), false);
});
