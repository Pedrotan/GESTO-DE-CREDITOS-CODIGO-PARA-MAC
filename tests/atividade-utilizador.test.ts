import test from 'node:test';
import assert from 'node:assert/strict';
import { activityLabel, activityReportDef, activityType, countByType, entityLabel, filterActivity } from '../src/bibliotecas/atividade-utilizador.ts';

const logs = [
    { id: '1', timestamp: '2026-10-24T21:49:00Z', userId: 'pb', userName: 'Paulo Benchimol', action: 'export', entity: 'report', details: 'Gerou o relatório «Carteira de Crédito» (PDF)' },
    { id: '2', timestamp: '2026-10-24T21:38:00Z', userId: 'pb', userName: 'Paulo Benchimol', action: 'delete', entity: 'credit', details: 'Apagou definitivamente o crédito' },
    { id: '3', timestamp: '2026-10-24T21:22:00Z', userId: 'pb', userName: 'Paulo Benchimol', action: 'update', entity: 'system', details: 'Atualizou definições' },
    { id: '4', timestamp: '2026-10-23T09:00:00Z', userId: 'sb', userName: 'Stanislau Bastos', action: 'create', entity: 'client', details: 'Cadastrou o cliente Ana' },
    { id: '5', timestamp: '2026-10-23T10:00:00Z', userId: 'sb', userName: 'Stanislau Bastos', action: 'update', entity: 'credit', details: 'Aprovou crédito CR-1' },
    { id: '6', timestamp: '2026-10-23T11:00:00Z', userId: 'sb', userName: 'Stanislau Bastos', action: 'login', entity: 'user', details: 'Login efetuado' },
];

test('tipos de acção e nomes em português (nada em inglês)', () => {
    assert.equal(activityLabel(logs[0]), 'Exportação de relatórios');
    assert.equal(activityLabel(logs[1]), 'Exclusão');
    assert.equal(activityType(logs[4]), 'aprovacao', 'aprovação gravada como edição');
    assert.equal(activityLabel(logs[5]), 'Início de sessão');
    assert.equal(entityLabel('report'), 'Relatório');
    assert.equal(entityLabel('credit'), 'Crédito');
});

test('filtros por tipo (CRUD), utilizador, área e período', () => {
    assert.deepEqual(filterActivity(logs, { types: ['exclusao'] }).map(log => log.id), ['2']);
    assert.deepEqual(filterActivity(logs, { types: ['cadastro', 'edicao'] }).map(log => log.id), ['3', '4']);
    assert.deepEqual(filterActivity(logs, { userIds: ['sb'], entities: ['credit'] }).map(log => log.id), ['5']);
    assert.deepEqual(filterActivity(logs, { startKey: '2026-10-24' }).map(log => log.id), ['1', '2', '3']);
    assert.equal(countByType(logs).edicao, 1);
});

test('relatório com os filtros: resumo por utilizador e acções em português', () => {
    const def = activityReportDef(filterActivity(logs, { types: ['exclusao', 'exportacao'] }), { types: ['exclusao', 'exportacao'] }, { users: 'Todos os utilizadores', scope: 'all' });
    assert.match(def.subtitle, /Exclusão, Exportação de relatórios/);
    const actions = def.sections[1].rows;
    assert.equal(actions.length, 2);
    assert.ok(actions.every(row => !/EXPORT|DELETE|REPORT|CREDIT/.test(row.join(' '))));
    assert.equal(def.sections[0].rows[0][0], 'Paulo Benchimol');
});
