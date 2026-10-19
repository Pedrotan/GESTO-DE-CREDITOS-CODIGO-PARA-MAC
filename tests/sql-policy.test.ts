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

test('perfil de utilizador: o SET dinâmico por id passa a política, os segredos e a conta principal não', () => {
    assert.doesNotThrow(() => assertRendererSqlAllowlisted([{ sql: 'UPDATE users SET name = ?, email = ?, signature = ? WHERE id = ?' }]));
    assert.doesNotThrow(() => assertRendererSqlAllowlisted([{ sql: 'UPDATE users SET name = ?, email = ?, avatar = ?, signature = ? WHERE id = ?' }]));
    for (const sql of ['UPDATE users SET isOwner = ? WHERE id = ?', 'UPDATE users SET twoFactorEnabled = ? WHERE id = ?',
        'UPDATE users SET name = ?, twoFactorSecret = ? WHERE id = ?', 'UPDATE users SET mfaRecoveryCodes = ? WHERE id = ?',
        'UPDATE users SET signature = ?', 'UPDATE users SET signature = ? WHERE email = ?', "UPDATE users SET name = 'x' WHERE id = ?"]) {
        assert.throws(() => assertRendererSqlAllowlisted([{ sql }]), /não registado/, sql);
    }
});
