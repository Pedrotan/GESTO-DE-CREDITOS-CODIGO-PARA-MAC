import { test } from 'node:test';
import assert from 'node:assert/strict';
import { motivoRecusaDesignar, motivoRecusaNivel, lerAdminPrincipal, type AdminPrincipal } from '../src/bibliotecas/administrador-principal.ts';
import { checkUserMutation } from '../src/bibliotecas/conta-principal.ts';

const sa = (id: string, extra: Record<string, unknown> = {}) => ({ id, name: id, role: 'super_admin', status: 'active', ...extra });
const principal: AdminPrincipal = { userId: 'osvaldo', nome: 'Osvaldo', designadoPor: 'osvaldo', designadoPorNome: 'Osvaldo', em: '2026-11-19T12:00:00Z' };
const nivel = (actor: string, alvo: string, role: string, p: AdminPrincipal | null) => checkUserMutation({
    kind: 'update', sql: 'UPDATE users SET role = ?, permissions = ? WHERE id = ?', params: [role, '[]', alvo],
    actor: { id: actor, role: 'super_admin' }, target: { id: alvo, role: 'super_admin' }, principal: p,
}).error;

test('designar: sem principal qualquer Super Administrador escolhe; depois só o principal transfere', () => {
    assert.equal(motivoRecusaDesignar(sa('paulo'), sa('osvaldo'), null), null);
    assert.equal(motivoRecusaDesignar(sa('paulo'), sa('paulo'), null), null, 'pode designar-se a si próprio');
    assert.match(motivoRecusaDesignar(sa('paulo'), sa('stanislau'), principal)!, /Só o Administrador principal actual \(Osvaldo\)/u);
    assert.equal(motivoRecusaDesignar(sa('osvaldo'), sa('stanislau'), principal), null, 'o principal transfere');
    assert.match(motivoRecusaDesignar(sa('osvaldo'), { id: 'larissa', role: 'employee' }, null)!, /tem de ser um Super Administrador/u);
    assert.match(motivoRecusaDesignar(sa('osvaldo'), sa('x', { status: 'blocked' }), null)!, /conta activa/u);
    assert.match(motivoRecusaDesignar({ id: 'larissa', role: 'employee' }, sa('osvaldo'), null)!, /Só um Super Administrador/u);
    assert.equal(lerAdminPrincipal('lixo'), null);
    assert.equal(lerAdminPrincipal(JSON.stringify(principal))?.userId, 'osvaldo');
});

test('nível: com principal, só ele baixa outro Super Administrador; o dele ninguém muda', () => {
    assert.equal(nivel('osvaldo', 'paulo', 'admin', principal), null, 'o principal baixa outro Super Administrador');
    assert.match(nivel('paulo', 'stanislau', 'admin', principal)!, /Só o Administrador principal \(Osvaldo\)/u);
    assert.match(nivel('paulo', 'osvaldo', 'admin', principal)!, /não pode ser alterado por outros/u);
    assert.match(nivel('osvaldo', 'osvaldo', 'admin', principal)!, /Transfira primeiro/u);
    assert.equal(nivel('paulo', 'stanislau', 'admin', null), null, 'sem principal: regra anterior (qualquer Super Administrador)');
    // Funcionário comum: qualquer Super Administrador continua a mudar.
    assert.equal(motivoRecusaNivel(sa('paulo'), { id: 'larissa', role: 'employee' }, principal), null);
});

test('o principal não fica preso: entrar/sair, editar o perfil com o mesmo papel e desbloquear continuam a funcionar', () => {
    const upd = (sql: string, params: unknown[], actor = 'osvaldo') => checkUserMutation({ kind: 'update', sql, params, actor: { id: actor },
        target: { id: 'osvaldo', role: 'super_admin' }, principal }).error;
    assert.equal(upd('UPDATE users SET status = ? WHERE id = ?', ['online', 'osvaldo']), null);
    assert.equal(upd('UPDATE users SET name = ?, role = ? WHERE id = ?', ['Osvaldo F.', 'super_admin', 'osvaldo']), null);
    assert.match(upd('UPDATE users SET status = ? WHERE id = ?', ['blocked', 'osvaldo'], 'paulo')!, /não pode ser alterado por outros/u);
    assert.match(checkUserMutation({ kind: 'delete', sql: 'DELETE FROM users WHERE id = ?', params: ['osvaldo'], actor: { id: 'paulo' },
        target: { id: 'osvaldo', role: 'super_admin' }, principal }).error!, /não pode ser alterado|não pode ser eliminado/u);
});

test('funcionário só com o portal: só vê o portal; com outra permissão volta ao sistema normal', async () => {
    const { ehSoFuncionario, rotaPermitidaFuncionario } = await import('../src/bibliotecas/portal-funcionario.ts');
    assert.equal(ehSoFuncionario({ role: 'employee', permissions: [] }), true);
    assert.equal(ehSoFuncionario({ role: 'employee', permissions: '["hr_self"]' }), true);
    assert.equal(ehSoFuncionario({ role: 'employee', permissions: ['hr_self', 'view_credits'] }), false);
    assert.equal(ehSoFuncionario({ role: 'super_admin', permissions: [] }), false);
    assert.equal(rotaPermitidaFuncionario('/rh/portal'), true);
    assert.equal(rotaPermitidaFuncionario('/'), false);
    assert.equal(rotaPermitidaFuncionario('/creditos'), false);
    assert.equal(rotaPermitidaFuncionario('/rh/processamento'), false);
});
