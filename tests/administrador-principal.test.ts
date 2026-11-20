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

test('eliminar: só o Administrador principal, também outros Super Administradores, nunca a si próprio', () => {
    const del = (actor: string, alvo: string, role: string, p: AdminPrincipal | null) => checkUserMutation({ kind: 'delete', sql: 'DELETE FROM users WHERE id = ?', params: [alvo],
        actor: { id: actor, role: 'super_admin' }, target: { id: alvo, role }, principal: p }).error;
    assert.equal(del('osvaldo', 'larissa', 'employee', principal), null);
    assert.equal(del('osvaldo', 'paulo', 'super_admin', principal), null, 'o principal elimina outro Super Administrador');
    assert.match(del('paulo', 'larissa', 'employee', principal)!, /Só o Administrador principal \(Osvaldo\) pode eliminar/u);
    assert.match(del('osvaldo', 'osvaldo', 'super_admin', principal)!, /Transfira primeiro|não pode ser eliminado/u);
});

test('relatório do utilizador eliminado: créditos, % pago, arrecadado, clientes e operações activas', async () => {
    const R = await import('../src/bibliotecas/relatorio-utilizador-eliminado.ts');
    const l = {
        utilizador: { id: 'paulo', name: 'Paulo', createdAt: '2026-10-01T00:00:00Z' },
        creditos: [
            { id: 'c1', clientId: 'k1', clientName: 'Ana', principalAmount: 100000, totalDue: 120000, currentBalance: 0, installments: 4, paidInstallments: 4, status: 'paid', createdAt: '2026-10-02' },
            { id: 'c2', clientId: 'k2', clientName: 'Bruno', principalAmount: 200000, totalDue: 240000, currentBalance: 180000, installments: 4, paidInstallments: 1, status: 'active', createdAt: '2026-10-05' },
            { id: 'c3', clientId: 'k2', clientName: 'Bruno', principalAmount: 50000, totalDue: 60000, currentBalance: 60000, installments: 2, paidInstallments: 0, status: 'pending_approval', createdAt: '2026-11-01' },
        ],
        pagamentosRecebidos: [{ id: 'p1', creditId: 'c1', clientName: 'Ana', amount: 120000, paymentDate: '2026-11-01', method: 'cash' }],
        pagamentosDosCreditos: [
            { id: 'p1', creditId: 'c1', clientName: 'Ana', amount: 120000, paymentDate: '2026-11-01', method: 'cash' },
            { id: 'p2', creditId: 'c2', clientName: 'Bruno', amount: 60000, paymentDate: '2026-11-03', method: 'bank' },
            { id: 'p3', creditId: 'c2', clientName: 'Bruno', amount: 5000, paymentDate: '2026-11-04', method: 'bank', status: 'cancelled' },
        ],
        clientes: [{ id: 'k1', name: 'Ana' }],
        auditoria: [{ id: 'a1', timestamp: '2026-10-02T10:00:00Z', action: 'create', entity: 'credit', details: 'Crédito de Ana' }],
    };
    assert.equal(R.percentagemPaga(l.creditos[1] as never), 25);
    assert.equal(R.percentagemPaga(l.creditos[0] as never), 100);
    const activas = R.operacoesActivas(l as never);
    assert.deepEqual([activas.creditosActivos, activas.porAprovar, activas.emDivida], [1, 1, 180000]);
    const r = R.resumoUtilizador(l as never);
    assert.equal(r.arrecadadoDaCarteira, 180000, 'pagamentos anulados não contam');
    assert.equal(r.clientes, 2);
    assert.equal(r.montanteConcedido, 300000, 'o crédito por aprovar não conta como concedido');
    const def = R.relatorioUtilizadorEliminado(l as never, { porNome: 'Osvaldo', em: '2026-11-20T10:00:00Z', motivo: 'Saiu da empresa.' });
    assert.equal(def.sections[0].rows.length, 3);
    assert.equal(def.sections[3].rows.length, 1, 'o histórico completo vai no relatório');
});
