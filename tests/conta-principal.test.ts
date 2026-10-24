import test from 'node:test';
import assert from 'node:assert/strict';
import { checkUserMutation, insertedUserValue, isPrimaryOwner, updatedUserValue } from '../src/bibliotecas/conta-principal.ts';

const owner = { id: 'dono', isOwner: 1, permissions: '[]' };
const otherSuper = { id: 'super2', isOwner: 0, permissions: JSON.stringify(['manage_users', 'manage_clients']) };
const ownerRow = { id: 'dono', isOwner: 1, role: 'super_admin' };
const staffRow = { id: 'gestor', isOwner: 0, role: 'manager' };

test('lê valores de parâmetros e de literais nas instruções reais', () => {
    const presence = "UPDATE users SET lastSeen = ?, status = 'active', ip = COALESCE(NULLIF(ip, ''), ?) WHERE id = ?";
    assert.equal(updatedUserValue(presence, ['agora', '10.0.0.1', 'dono'], 'status'), 'active');
    assert.equal(updatedUserValue('UPDATE users SET failedAttempts = ?, status = ?, blockedAt = ?, ip = ? WHERE id = ?', [3, 'blocked', 'x', 'ip', 'u'], 'status'), 'blocked');
    assert.equal(insertedUserValue('INSERT INTO users (id, name, role, permissions) VALUES (?, ?, ?, ?)', ['1', 'Ana', 'manager', '["a"]'], 'role'), 'manager');
    assert.equal(isPrimaryOwner({ isOwner: 1 }), true);
    assert.equal(isPrimaryOwner({ isOwner: 0 }), false);
    assert.equal(isPrimaryOwner(null), false);
});

test('a conta principal não pode ser eliminada, alterada nem perder permissões por outros', () => {
    const del = checkUserMutation({ kind: 'delete', sql: 'DELETE FROM users WHERE id = ?', params: ['dono'], actor: otherSuper, target: ownerRow });
    assert.match(del.error!, /não pode ser eliminado/);
    const perms = checkUserMutation({ kind: 'update', sql: 'UPDATE users SET permissions = ? WHERE id = ?', params: ['[]', 'dono'], actor: otherSuper, target: ownerRow });
    assert.match(perms.error!, /só pode ser alterado por ele próprio/);
    const block = checkUserMutation({ kind: 'update', sql: 'UPDATE users SET status = ? WHERE id = ?', params: ['blocked', 'dono'], actor: otherSuper, target: ownerRow });
    assert.ok(block.error);
});

test('um Super Administrador desbloqueia outro (só reactivar, nada mais)', () => {
    const sql = "UPDATE users SET status = 'active', failedAttempts = 0, blockedAt = NULL WHERE id = ?";
    const superActor = { id: 'super2', isOwner: 0, role: 'super_admin', permissions: '[]' };
    const ok = checkUserMutation({ kind: 'update', sql, params: ['dono'], actor: superActor, target: ownerRow });
    assert.equal(ok.error, null);
    assert.equal(ok.changesPrivileges, true);
    // Um gestor não desbloqueia a conta principal; e o mesmo canal não serve para bloquear nem mudar outra coisa.
    assert.ok(checkUserMutation({ kind: 'update', sql, params: ['dono'], actor: { id: 'g', isOwner: 0, role: 'manager', permissions: '[]' }, target: ownerRow }).error);
    assert.ok(checkUserMutation({ kind: 'update', sql: 'UPDATE users SET status = ? WHERE id = ?', params: ['blocked', 'dono'], actor: superActor, target: ownerRow }).error);
    assert.ok(checkUserMutation({ kind: 'update', sql: "UPDATE users SET status = 'active', name = ? WHERE id = ?", params: ['x', 'dono'], actor: superActor, target: ownerRow }).error);
});

test('a conta principal altera-se a si própria, mas não se despromove nem se bloqueia', () => {
    const presence = "UPDATE users SET lastSeen = ?, status = 'active', ip = COALESCE(NULLIF(ip, ''), ?) WHERE id = ?";
    assert.equal(checkUserMutation({ kind: 'update', sql: presence, params: ['agora', 'ip', 'dono'], actor: owner, target: ownerRow }).error, null);
    assert.equal(checkUserMutation({ kind: 'update', sql: 'UPDATE users SET name = ? WHERE id = ?', params: ['Pedro', 'dono'], actor: owner, target: ownerRow }).error, null);
    assert.ok(checkUserMutation({ kind: 'update', sql: 'UPDATE users SET role = ? WHERE id = ?', params: ['manager', 'dono'], actor: owner, target: ownerRow }).error);
    assert.ok(checkUserMutation({ kind: 'update', sql: 'UPDATE users SET status = ? WHERE id = ?', params: ['blocked', 'dono'], actor: owner, target: ownerRow }).error);
    assert.ok(checkUserMutation({ kind: 'update', sql: 'UPDATE users SET isOwner = ? WHERE id = ?', params: [0, 'dono'], actor: owner, target: ownerRow }).error);
});

test('só a conta principal muda perfis e permissões dos outros', () => {
    const sql = 'UPDATE users SET role = ?, permissions = ? WHERE id = ?';
    const byOwner = checkUserMutation({ kind: 'update', sql, params: ['admin', '["view_credits"]', 'gestor'], actor: owner, target: staffRow });
    assert.deepEqual(byOwner, { error: null, changesPrivileges: true });
    assert.match(checkUserMutation({ kind: 'update', sql, params: ['admin', '[]', 'gestor'], actor: otherSuper, target: staffRow }).error!, /Só o Super Administrador principal/);
    // Outros gestores de utilizadores podem desactivar contas (não mexe em permissões).
    assert.equal(checkUserMutation({ kind: 'update', sql: 'UPDATE users SET status = ? WHERE id = ?', params: ['blocked', 'gestor'], actor: otherSuper, target: staffRow }).error, null);
});

test('criar utilizadores: só a conta principal cria Super Administradores; os outros só dão o que têm', () => {
    const sql = 'INSERT INTO users (id, name, email, role, permissions, password) VALUES (?, ?, ?, ?, ?, ?)';
    assert.match(checkUserMutation({ kind: 'insert', sql, params: ['n', 'N', 'n@x', 'super_admin', '[]', 'h'], actor: otherSuper }).error!, /Só o Super Administrador principal/);
    assert.equal(checkUserMutation({ kind: 'insert', sql, params: ['n', 'N', 'n@x', 'super_admin', '[]', 'h'], actor: owner }).error, null);
    assert.match(checkUserMutation({ kind: 'insert', sql, params: ['n', 'N', 'n@x', 'manager', '["manage_settings"]', 'h'], actor: otherSuper }).error!, /manage_settings/);
    assert.equal(checkUserMutation({ kind: 'insert', sql, params: ['n', 'N', 'n@x', 'manager', '["manage_clients"]', 'h'], actor: otherSuper }).error, null);
    assert.ok(checkUserMutation({ kind: 'insert', sql: 'INSERT INTO users (id, isOwner) VALUES (?, ?)', params: ['x', 1], actor: owner }).error);
});

test('permissões efectivas: qualquer Super Administrador tem tudo; os outros perfis só o que lhes foi atribuído', async () => {
    const { ServicoControloAcesso } = await import('../src/servicos/ServicoControloAcesso.ts');
    const dono = { id: 'd', role: 'super_admin', isOwner: 1, permissions: [] };
    const outro = { id: 'o', role: 'super_admin', isOwner: 0, permissions: ['view_credits'] };
    assert.equal(ServicoControloAcesso.temPermissao(dono as any, 'approve_loans'), true);
    assert.equal(ServicoControloAcesso.temPermissao(dono as any, 'view_market'), true);
    assert.equal(ServicoControloAcesso.temPermissao(outro as any, 'view_credits'), true);
    assert.equal(ServicoControloAcesso.temPermissao(outro as any, 'creditos.ver'), true, 'a permissão antiga dá as detalhadas');
    // Decisão do utilizador: um Super Administrador tem autoridade total (pode, por exemplo, desbloquear outro).
    assert.equal(ServicoControloAcesso.temPermissao(outro as any, 'approve_loans'), true);
    // Funcionário: vale o perfil e o que lhe foi atribuído, sem aprovar créditos nem mudar definições.
    const gestor = { id: 'g', role: 'employee', isOwner: 0, permissions: ['view_credits'] };
    assert.equal(ServicoControloAcesso.temPermissao(gestor as any, 'view_credits'), true);
    assert.equal(ServicoControloAcesso.temPermissao(gestor as any, 'approve_loans'), false);
    assert.equal(ServicoControloAcesso.temPermissao(gestor as any, 'manage_settings'), false);
});
