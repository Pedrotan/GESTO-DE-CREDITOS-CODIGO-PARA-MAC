import test from 'node:test';
import assert from 'node:assert/strict';
import { calendarioDoAno, feriadosNacionais, folgasComoFeriados, pascoa, ponteDe, type FeriadoRegistado } from '../src/bibliotecas/rh/calendario-laboral.ts';
import { avisosFerias, simularFerias, type PlanoFerias } from '../src/bibliotecas/rh/ferias.ts';
import { ehDiaUtil, HORARIO_OMISSAO } from '../src/bibliotecas/rh/ponto.ts';
import { RH_FERIADOS_INICIAIS } from '../src/bibliotecas/rh/esquema-rh.ts';
import { feriasPortalSql, isPortalPedidoSql } from '../src/bibliotecas/rh/portal-sql.ts';

// As linhas que a instalação já tem em rh_feriado (feriados nacionais recorrentes).
const SEMENTE: FeriadoRegistado[] = RH_FERIADOS_INICIAIS.map(([dia, nome]) => ({ id: `feriado-${dia}`, data: `2000-${dia}`, nome, tipo: 'nacional', recorrente: 1, activo: 1 }));
const folgas = (registados: FeriadoRegistado[] = SEMENTE) => folgasComoFeriados([2026, 2027, 2028], registados, { pontesDesde: 2027 });
const H = HORARIO_OMISSAO;
const ferias = (inicio: string, dias: number, feriados = folgas(), horario = H) => simularFerias({ inicio, dias, horario, feriados });

test('T7: Páscoa pelo algoritmo gregoriano', () => {
    assert.equal(pascoa(2026), '2026-04-05');
    assert.equal(pascoa(2027), '2027-03-28');
    assert.equal(pascoa(2028), '2028-04-16');
});

test('T8: Carnaval (Páscoa − 47) e Sexta-Feira Santa (Páscoa − 2)', () => {
    const nomes = (ano: number) => new Map(feriadosNacionais(ano).map(f => [f.data, f.nome]));
    assert.equal(nomes(2026).get('2026-02-17'), 'Dia do Carnaval');
    assert.equal(nomes(2027).get('2027-02-09'), 'Dia do Carnaval');
    assert.equal(nomes(2027).get('2027-03-26'), 'Sexta-Feira Santa');
    assert.equal(feriadosNacionais(2027).length, 12);
});

test('feriados e pontes de 2027 (secção 4.2)', () => {
    const cal = calendarioDoAno(2027, SEMENTE, { pontesDesde: 2027 });
    const pontes = [...cal.values()].filter(d => d.tipo === 'ponte' && d.activo).map(d => d.data);
    assert.deepEqual(pontes, ['2027-02-05', '2027-02-08', '2027-03-22', '2027-11-01', '2027-11-12']);
    assert.equal(ponteDe('2027-11-02'), '2027-11-01', 'terça → segunda');
    assert.equal(ponteDe('2027-11-11'), '2027-11-12', 'quinta → sexta');
    assert.equal(ponteDe('2027-04-04'), null, 'domingo não tem ponte');
    assert.equal(cal.get('2027-05-25')?.tipo, 'data_internacional');
    assert.equal(cal.get('2027-05-25')?.folga, false, 'Dia de África não é folga');
    assert.equal(cal.get('2027-12-25')?.internacional, true);
    assert.equal(ehDiaUtil('2027-05-25', H, folgas()), true, 'data internacional conta como dia útil');
    // Antes do ano das pontes, o livro de ponto fica como estava.
    assert.equal([...calendarioDoAno(2026, SEMENTE, { pontesDesde: 2027 }).values()].some(d => d.tipo === 'ponte'), false);
});

test('T1: 22 dias sem feriados', () => {
    const r = ferias('2027-07-05', 22);
    assert.deepEqual([r.inicio, r.ultimoDia, r.regresso], ['2027-07-05', '2027-08-03', '2027-08-04']);
    assert.equal(r.diasCalendario, 30);
    assert.equal(r.ajustado, false);
});

test('T2: Março de 2027 salta 08/03, ponte 22/03, 23/03 e Sexta-Feira Santa', () => {
    const r = ferias('2027-03-01', 22);
    assert.deepEqual([r.ultimoDia, r.regresso], ['2027-04-05', '2027-04-06']);
    assert.deepEqual(r.feriadosNoPeriodo.map(f => f.data), ['2027-03-08', '2027-03-22', '2027-03-23', '2027-03-26', '2027-04-04']);
});

test('T3: início numa ponte e num feriado → ajustado para quarta 03/11', () => {
    const r = ferias('2027-11-01', 5);
    assert.deepEqual([r.inicio, r.ultimoDia, r.regresso, r.ajustado], ['2027-11-03', '2027-11-09', '2027-11-10', true]);
});

test('T4: atravessa o ano (25/12 e 01/01/2028 ao sábado)', () => {
    const r = ferias('2027-12-20', 10);
    assert.deepEqual([r.ultimoDia, r.regresso], ['2027-12-31', '2028-01-03']);
});

test('T5: salta 11/11 (feriado), 12/11 (ponte) e o fim-de-semana', () => {
    const r = ferias('2027-11-10', 3);
    assert.deepEqual([r.ultimoDia, r.regresso], ['2027-11-16', '2027-11-17']);
});

test('T6: início ao sábado → ajustado para segunda', () => {
    const r = ferias('2027-07-03', 1);
    assert.deepEqual([r.inicio, r.ultimoDia, r.regresso, r.ajustado], ['2027-07-05', '2027-07-05', '2027-07-06', true]);
});

test('T9: ponte de 22/03/2027 desactivada termina um dia útil mais cedo', () => {
    const desligada: FeriadoRegistado = { id: 'ponte-2027-03-22', data: '2027-03-22', nome: 'Ponte', tipo: 'nacional', recorrente: 0, activo: 0, categoria: 'ponte' };
    const r = ferias('2027-03-01', 22, folgas([...SEMENTE, desligada]));
    assert.deepEqual([r.ultimoDia, r.regresso], ['2027-04-02', '2027-04-05']);
});

test('T10: quem trabalha ao sábado conta os sábados', () => {
    const r = ferias('2027-07-05', 22, folgas(), { ...H, dias_semana: '1,2,3,4,5,6' });
    assert.deepEqual([r.ultimoDia, r.regresso], ['2027-07-29', '2027-07-30']);
});

test('calendário: tolerâncias e locais contam como folga; desactivar um feriado nacional gerado', () => {
    const tolerancia: FeriadoRegistado = { id: 't1', data: '2027-06-14', nome: 'Tolerância de ponto', tipo: 'empresa', recorrente: 0, activo: 1, categoria: 'tolerancia' };
    const data: FeriadoRegistado = { id: 'd1', data: '2000-10-16', nome: 'Dia Mundial da Alimentação', tipo: 'empresa', recorrente: 1, activo: 1, categoria: 'data_internacional' };
    const excepcao: FeriadoRegistado = { id: 'excepcao-2027-02-09', data: '2027-02-09', nome: 'Dia do Carnaval', tipo: 'nacional', recorrente: 0, activo: 0, categoria: 'nacional' };
    const f = folgas([...SEMENTE, tolerancia, data, excepcao]);
    assert.equal(ehDiaUtil('2027-06-14', H, f), false);
    assert.equal(ehDiaUtil('2027-10-18', H, f), true);
    assert.equal(ehDiaUtil('2027-10-16', H, f), false, 'sábado');
    assert.equal(ehDiaUtil('2027-02-09', H, f), true, 'Carnaval desactivado');
    const cal = calendarioDoAno(2027, [...SEMENTE, excepcao], { pontesDesde: 2027 });
    assert.equal(cal.get('2027-02-08'), undefined, 'sem feriado, a ponte do Carnaval também sai');
});

test('avisos: excede o saldo, sobreposição, divisão em períodos', () => {
    const r = ferias('2027-07-05', 10);
    const plano = (extra: Partial<PlanoFerias>): PlanoFerias => ({ id: 'p', funcionario_id: 'f1', ano: 2027, mes_previsto: 7, data_inicio: '2027-07-12', data_fim: '2027-07-16', dias: 5,
        estado: 'planeado', subsidio_processado: 0, processamento_id: null, ausencia_id: null, guia_id: null, ...extra });
    const codigos = (planos: PlanoFerias[], saldo = 22) => avisosFerias({ resultado: r, funcionarioId: 'f1', saldo, hoje: '2026-11-23', planos, periodoMinimo: 15, direito: 22 }).map(a => a.codigo);
    assert.deepEqual(codigos([]), ['divisao']);
    assert.deepEqual(codigos([plano({})]), ['sobreposicao', 'divisao']);
    assert.deepEqual(codigos([plano({ data_inicio: '2027-09-01', data_fim: '2027-09-22', dias: 16 })], 8), ['excede']);
});

test('portal: pedido de férias com regresso e decisões do chefe passam no processo principal', () => {
    assert.equal(isPortalPedidoSql(`INSERT INTO rh_plano_ferias (id, funcionario_id, ano, mes_previsto, data_inicio, data_fim, dias, data_regresso, dias_calendario, observacoes, estado, pedido_funcionario, criado_em, criado_por, criado_por_nome)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'planeado', 1, ?, ?, ?)`), true);
    assert.deepEqual(feriasPortalSql(`UPDATE rh_plano_ferias SET chefe_aprovado_por = ?, chefe_aprovado_por_nome = ?, chefe_aprovado_em = ?, actualizado_em = ? WHERE id = ? AND estado = 'planeado' AND pedido_funcionario = 1 AND chefe_aprovado_em IS NULL`), { tipo: 'chefe', actorParam: 0, planoParam: 4 });
    assert.equal(feriasPortalSql(`UPDATE rh_plano_ferias SET estado = 'aprovado' WHERE id = ?`), null);
});
