import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildClientRows, buildClientsReport, describeFilters, distinctValues, EMPTY_CLIENT_FILTERS, filterClientRows } from '../src/bibliotecas/relatorio-clientes.ts';

const HOJE = '2026-10-27';
const clientes = [
    { id: 'c1', name: 'Paulo Narciso', nif: '004512345LA041', phone: '923000001', status: 'active', riskLevel: 'low', gender: 'Masculino',
        province: 'Benguela', municipality: 'Lobito', expiryDate: '2026-11-10', monthlyIncome: 350000, creditLimit: 500000, usedCredit: 200000,
        availableCredit: 300000, createdAt: '2026-10-02T10:00:00.000Z', spouseName: 'Ana Narciso', spouseIncome: 120000 },
    { id: 'c2', name: 'Maria Lopes', nif: '005512345LA042', phone: '923000002', status: 'inactive', riskLevel: 'high', gender: 'Feminino',
        province: 'Luanda', municipality: 'Viana', expiryDate: '2025-01-01', monthlyIncome: 150000, createdAt: '2026-08-15T10:00:00.000Z' },
    { id: 'c3', name: 'Empresa Alfa', nif: '5001032771', clientType: 'EMPRESA', status: 'blocked', riskLevel: 'medium',
        province: 'Benguela', municipality: 'Benguela', createdAt: '2026-10-20T10:00:00.000Z' },
];
const creditos = [
    { clientId: 'c1', status: 'overdue', currentBalance: 180000 },
    { clientId: 'c2', status: 'paid', currentBalance: 0 },
    { clientId: 'c1', status: 'active', currentBalance: 50000, deletedAt: '2026-10-25' },
];
const linhas = buildClientRows(clientes, creditos, HOJE, 30);

test('linhas do relatório: estado, BI, créditos em curso e em atraso (eliminados não contam)', () => {
    const [paulo, maria, empresa] = linhas;
    assert.deepEqual([paulo.status, paulo.bi, paulo.inProgress, paulo.late, paulo.outstanding], ['active', 'a_expirar', 1, 1, 180000]);
    assert.deepEqual([maria.status, maria.bi, maria.inProgress], ['no_active_credit', 'expirado', 0]);
    assert.deepEqual([empresa.status, empresa.bi], ['blocked', null], 'empresas não têm BI');
});

test('filtros combinados: estado, crédito, província, município, BI, rendimento e data de cadastro', () => {
    const nomes = (filtros: Partial<typeof EMPTY_CLIENT_FILTERS>) => filterClientRows(linhas, { ...EMPTY_CLIENT_FILTERS, ...filtros }).map(row => row.client.name);
    assert.deepEqual(nomes({}), ['Paulo Narciso', 'Maria Lopes', 'Empresa Alfa']);
    assert.deepEqual(nomes({ status: 'active' }), ['Paulo Narciso']);
    assert.deepEqual(nomes({ credit: 'em_atraso' }), ['Paulo Narciso']);
    assert.deepEqual(nomes({ credit: 'sem_credito' }), ['Maria Lopes', 'Empresa Alfa']);
    assert.deepEqual(nomes({ province: 'Benguela', municipality: 'Lobito' }), ['Paulo Narciso']);
    assert.deepEqual(nomes({ bi: 'contactar' }), ['Paulo Narciso', 'Maria Lopes']);
    assert.deepEqual(nomes({ clientType: 'EMPRESA' }), ['Empresa Alfa']);
    assert.deepEqual(nomes({ incomeMin: '200000' }), ['Paulo Narciso']);
    assert.deepEqual(nomes({ createdFrom: '2026-10-01', createdTo: '2026-10-15' }), ['Paulo Narciso']);
    assert.deepEqual(nomes({ search: '923000002' }), ['Maria Lopes'], 'pesquisa também pelo telefone');
    assert.deepEqual(distinctValues(clientes, 'municipality', 'Benguela'), ['Benguela', 'Lobito']);
});

test('relatório em paisagem com todos os dados em secções e totais', () => {
    const def = buildClientsReport(linhas, { title: 'Lista completa de clientes', categoryLabel: 'Clientes' });
    assert.equal(def.orientation, 'landscape');
    assert.deepEqual(def.sections.map(section => section.heading), ['Identificação e contactos', 'Naturalidade e morada', 'Situação financeira', 'Cônjuges']);
    assert.equal(def.sections[0].rows.length, 3);
    assert.equal(def.sections[0].rows[0][1], 'Empresa Alfa', 'ordenado pelo nome');
    const financeiro = def.sections[2];
    assert.equal(financeiro.foot?.[0][4], 500000, 'total dos limites');
    assert.equal(financeiro.foot?.[0][11], 180000, 'total em dívida');
    assert.equal(def.sections[3].rows.length, 1, 'só clientes com cônjuge');
    assert.match(describeFilters({ ...EMPTY_CLIENT_FILTERS, status: 'active', province: 'Benguela' }), /estado Activo · província Benguela/);
    const filtrado = buildClientsReport(linhas.slice(0, 1), { title: 'x', categoryLabel: 'Clientes', filters: { ...EMPTY_CLIENT_FILTERS, risk: 'low' } });
    assert.match(filtrado.subtitle, /Filtros: risco Baixo/);
});
