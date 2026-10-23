import test from 'node:test';
import assert from 'node:assert/strict';
import { absentismo, aExpirar, antiguidade, custoPessoal, efectivos, mapaINSS, mapaIRT, mesesDoPeriodo, type Base, type FiltroRH, type ReciboRel } from '../src/bibliotecas/rh/relatorios-rh.ts';
import { HORARIO_OMISSAO } from '../src/bibliotecas/rh/ponto.ts';

const func = (id: string, nome: string, extra = {}) => ({ id, numero_mecanografico: id, nome, nif: `NIF${id}`, numero_inss: `INSS${id}`, departamento_id: 'd1', cargo_id: null,
    estado: 'activo', data_admissao: '2020-03-15', data_saida: null, data_nascimento: '1990-01-01', horario_id: null, ...extra });
const recibo = (id: string, fid: string, mes: number, estado = 'fechado'): ReciboRel => ({ id, funcionario_id: fid, ano: 2026, mes, tipo: 'normal', estado, departamento: 'Comercial',
    nome: fid === 'a' ? 'Ana' : 'Rui', numero_mecanografico: fid, nif: `NIF${fid}`, numero_inss: `INSS${fid}`, bruto_minor: 37_666_667, base_inss_minor: 37_666_667,
    inss_minor: 1_130_000, inss_emp_minor: 3_013_333, base_irt_minor: 33_536_667, irt_minor: 5_596_967, outros_descontos_minor: 0, liquido_minor: 30_939_700, custo_empresa_minor: 40_680_000 });
const base: Base = {
    funcionarios: [func('a', 'Ana'), func('b', 'Rui', { data_admissao: '2026-10-05', bi_validade: '2026-11-01' })], departamentos: [{ id: 'd1', nome: 'Comercial' }], cargos: [],
    recibos: [recibo('r1', 'a', 9), recibo('r2', 'a', 10), recibo('r3', 'b', 10, 'calculado')], linhas: [],
    ausencias: [{ id: 'x', funcionario_id: 'a', tipo_id: 'F', data_inicio: '2026-10-06', data_fim: '2026-10-07', dias: 2, horas: 0, estado: 'aprovada' }],
    tipos: [{ id: 'F', codigo: 'F', nome: 'Falta', justificada: 0, remunerada: 0, desconta_salario: 1, desconta_ferias: 0, exige_documento: 0 }],
    pontos: [], horarios: [HORARIO_OMISSAO], feriados: [], planos: [], contratos: [{ id: 'c1', funcionario_id: 'a', estado: 'activo', tipo: 'determinado', fim: '2026-12-01', dias_ferias: 22 }],
    documentos: [], diasFeriasPadrao: 22,
};
const filtro: FiltroRH = { de: '2026-10-01', ate: '2026-10-31', departamentoId: null, estado: 'todos', hoje: '2026-10-23' };

test('mapas de INSS e IRT: só processamentos aprovados, pagos ou fechados do período', () => {
    const inss = mapaINSS(base, filtro);
    assert.equal(inss.linhas.length, 1, 'o recibo «calculado» de Rui e o de Setembro ficam de fora');
    assert.deepEqual(inss.totais, ['TOTAL', '', '', 376666.67, 11300, 30133.33, 41433.33]);
    assert.deepEqual(mapaIRT(base, filtro).totais, ['TOTAL', '', '', 376666.67, 335366.67, 55969.67]);
    assert.equal(mapaINSS(base, { ...filtro, de: '2026-09-01' }).linhas.length, 2);
    assert.deepEqual(custoPessoal(base, filtro).totais, ['TOTAL', '', 1, 376666.67, 30133.33, 406800]);
});

test('absentismo: taxa sobre os dias úteis do período', () => {
    const r = absentismo(base, filtro);
    const ana = r.linhas.find(l => l[0] === 'Ana')!;
    assert.deepEqual(ana.slice(2), [22, 2, 0, 2, 9.1]);
    const rui = r.linhas.find(l => l[0] === 'Rui')!;
    assert.equal(rui[2], 20, 'admitido a 5 de Outubro');
});

test('efectivos, antiguidade e documentos a expirar', () => {
    assert.equal(antiguidade('2020-03-15', '2026-10-23'), '6 ano(s) e 7 mês(es)');
    const e = efectivos(base, filtro);
    assert.match(e.subtitulo, /1 admissão/);
    assert.equal(e.linhas.find(l => l[1] === 'Rui')?.[7], 'Admissão no período');
    const x = aExpirar(base, filtro, 60);
    assert.deepEqual(x.linhas.map(l => [l[0], l[3]]), [['Rui', '2026-11-01'], ['Ana', '2026-12-01']]);
    assert.equal(mesesDoPeriodo('2026-11-01', '2027-02-28').length, 4);
});

test('portal: o processo principal só aceita os dois pedidos do funcionário', async () => {
    const { isPortalPedidoSql } = await import('../src/bibliotecas/rh/portal-sql.ts');
    const { readFileSync } = await import('node:fs');
    const fonte = (f: string) => readFileSync(new URL(`../src/servicos/rh/${f}`, import.meta.url), 'utf8');
    const instrucoes = (texto: string) => [...texto.matchAll(/`(INSERT INTO rh_(?:plano_ferias|ausencia)[^`]*)`/gu)].map(m => m[1]);
    const portal = instrucoes(fonte('ServicoPortalRH.ts'));
    assert.equal(portal.length, 2);
    assert.ok(portal.every(isPortalPedidoSql), 'os pedidos do portal são reconhecidos');
    const rh = [...instrucoes(fonte('ServicoFeriasRH.ts')), ...instrucoes(fonte('ServicoTempoRH.ts'))];
    assert.ok(rh.length >= 2);
    assert.ok(rh.every(sql => !isPortalPedidoSql(sql)), 'as instruções do RH (ex.: ausência aprovada) continuam a exigir hr_manage');
});
