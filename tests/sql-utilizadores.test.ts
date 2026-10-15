import assert from 'node:assert/strict';
import test from 'node:test';
import { usersListSqlFromColumns } from '../src/bibliotecas/sql-utilizadores.ts';
import { userReadExposesSecrets } from '../electron/user-security.ts';

const USERS_COLUMNS = ['id', 'name', 'email', 'username', 'password', 'role', 'avatar', 'createdAt', 'lastLogin',
    'permissions', 'status', 'twoFactorEnabled', 'twoFactorSecret', 'mfaRecoveryCodes', 'permissionExceptions', 'approvalLimits'];

test('lista de utilizadores inclui as colunas com nomes de várias letras', () => {
    const sql = usersListSqlFromColumns(USERS_COLUMNS);
    assert.match(sql, /^SELECT "id", "name", "email", "username", "role", /);
    assert.match(sql, /"permissionExceptions", "approvalLimits" FROM users$/);
});

test('lista de utilizadores nunca pede segredos e passa a política do processo principal', () => {
    const sql = usersListSqlFromColumns(USERS_COLUMNS);
    assert.doesNotMatch(sql, /password|twoFactorSecret|mfaRecoveryCodes/);
    assert.equal(userReadExposesSecrets(sql), false);
});

test('colunas com nomes inválidos são ignoradas e uma lista vazia não gera SQL inválido', () => {
    assert.equal(usersListSqlFromColumns(['id', 'x"; DROP TABLE users; --', 'name']), 'SELECT "id", "name" FROM users');
    assert.throws(() => usersListSqlFromColumns(['password']), /não tem colunas legíveis/);
});
