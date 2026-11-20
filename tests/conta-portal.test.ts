import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enderecoPortal, senhaAleatoria, utilizadorDoNome } from '../src/bibliotecas/rh/conta-portal.ts';
import { checkUserMutation, ehContaPortalNova, ehContaSoPortal, ehReposicaoSenhaPortal } from '../src/bibliotecas/conta-principal.ts';
import { ehSoFuncionario } from '../src/bibliotecas/portal-funcionario.ts';
import { validatePasswordStrength } from '../src/bibliotecas/password-validator.ts';

const SQL = `INSERT INTO users (id, name, email, username, password, role, avatar, createdAt, permissions, status, mustChangePassword)
                VALUES (?, ?, ?, ?, ?, 'employee', ?, ?, ?, 'active', 1)`;
const params = (permissoes: string[]) => ['id1', 'João Ângelo', 'joao@x.ao', 'joao.angelo', '$2a$10$hash', 'JA', '2026-11-20', JSON.stringify(permissoes)];
const rh = { id: 'rh', role: 'hr_manager', permissions: JSON.stringify(['hr_view', 'hr_manage']) };

test('conta do portal: utilizador pelo nome completo, sem acentos e sem repetir', () => {
    assert.equal(utilizadorDoNome('Pedro de Morais Tango'), 'pedro.de.morais.tango');
    assert.equal(utilizadorDoNome('  Conceição  Ngola-Neto '), 'conceicao.ngola.neto');
    assert.equal(utilizadorDoNome('Ana Silva', [{ username: 'ana.silva' }, { email: 'ana.silva2' }]), 'ana.silva3');
});

test('conta do portal: senha aleatória forte e diferente a cada vez', () => {
    const senhas = new Set(Array.from({ length: 50 }, () => senhaAleatoria()));
    assert.equal(senhas.size, 50);
    for (const s of senhas) {
        assert.equal(s.length, 10);
        assert.ok(/[A-Z]/u.test(s) && /[a-z]/u.test(s) && /\d/u.test(s) && /[@#$%&*!?]/u.test(s), s);
        assert.ok(validatePasswordStrength(s).score >= 60, s);
    }
});

test('conta do portal: quem gere o RH cria-a sem gerir utilizadores; nada além do portal', () => {
    assert.equal(ehContaPortalNova(SQL, params(['hr_self', 'rh_portal.ver', 'rh_portal.criar'])), true);
    const portal = checkUserMutation({ kind: 'insert', sql: SQL, params: params(['hr_self', 'rh_portal.ver', 'rh_portal.criar']), actor: rh });
    assert.equal(portal.error, null);
    // Uma permissão de créditos já não é «só o portal»: volta a regra normal (não pode dar o que não tem).
    assert.equal(ehContaPortalNova(SQL, params(['hr_self', 'view_credits'])), false);
    assert.match(checkUserMutation({ kind: 'insert', sql: SQL, params: params(['hr_self', 'view_credits']), actor: rh }).error || '', /não tem/u);
    // Sem gerir o RH não há excepção.
    assert.match(checkUserMutation({ kind: 'insert', sql: SQL, params: params(['hr_self']), actor: { id: 'x', role: 'manager', permissions: '[]' } }).error || '', /não tem/u);
    // Sem troca obrigatória da senha ou com outro perfil não é conta do portal.
    assert.equal(ehContaPortalNova(SQL.replace("'active', 1)", "'active', 0)"), params(['hr_self'])), false);
    assert.equal(ehContaPortalNova(SQL.replace("'employee'", "'manager'"), params(['hr_self'])), false);
    // A conta criada só vê o portal.
    assert.equal(ehSoFuncionario({ role: 'employee', permissions: ['hr_self', 'rh_portal.ver', 'rh_portal.criar'] }), true);
});

test('conta do portal: o RH só repõe a senha (com troca obrigatória) de contas só do portal', () => {
    const repor = 'UPDATE users SET password = ?, mustChangePassword = ? WHERE id = ?';
    assert.equal(ehReposicaoSenhaPortal(repor, ['$2a$hash', 1, 'u1']), true);
    assert.equal(ehReposicaoSenhaPortal(repor, ['$2a$hash', 0, 'u1']), false, 'sem troca obrigatória não é reposição');
    assert.equal(ehReposicaoSenhaPortal('UPDATE users SET password = ?, mustChangePassword = ?, role = ? WHERE id = ?', ['h', 1, 'admin', 'u1']), false);
    assert.equal(ehContaSoPortal({ role: 'employee', permissions: '["hr_self","rh_portal.ver"]' }), true);
    assert.equal(ehContaSoPortal({ role: 'employee', permissions: '["hr_self","view_credits"]' }), false);
    assert.equal(ehContaSoPortal({ role: 'manager', permissions: '["hr_self"]' }), false);
    assert.equal(ehContaSoPortal({ role: 'employee', permissions: '["hr_self"]', isOwner: 1 }), false);
});

test('troca obrigatória: a própria conta só a conclui com a nova senha', () => {
    const eu = { id: 'u1', role: 'employee', permissions: '["hr_self"]' };
    const alvo = { id: 'u1', role: 'employee' };
    const so = checkUserMutation({ kind: 'update', sql: 'UPDATE users SET mustChangePassword = ? WHERE id = ?', params: [0, 'u1'], actor: eu, target: alvo });
    assert.match(so.error || '', /nova senha/u);
    const comSenha = checkUserMutation({ kind: 'update', sql: 'UPDATE users SET password = ?, mustChangePassword = ? WHERE id = ?', params: ['h', 0, 'u1'], actor: eu, target: alvo });
    assert.equal(comSenha.error, null);
});

test('ficha de acesso: endereço do portal é o da versão web; no computador, o domínio oficial', () => {
    assert.equal(enderecoPortal({ protocol: 'https:', hostname: 'bravaldo.tangogestaoecreditos.tech', origin: 'https://bravaldo.tangogestaoecreditos.tech' }), 'https://bravaldo.tangogestaoecreditos.tech');
    assert.equal(enderecoPortal({ protocol: 'file:', hostname: '', origin: 'null' }), 'https://tangogestaoecreditos.tech');
    assert.equal(enderecoPortal({ protocol: 'http:', hostname: 'localhost', origin: 'http://localhost:5199' }), 'https://tangogestaoecreditos.tech');
    assert.equal(enderecoPortal(null), 'https://tangogestaoecreditos.tech');
});
