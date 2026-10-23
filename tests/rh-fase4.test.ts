import test from 'node:test';
import assert from 'node:assert/strict';
import { conflitoDepartamento, dataRegresso, diasDoPlano, estadoEfectivo, saldoFerias, type PlanoFerias } from '../src/bibliotecas/rh/ferias.ts';
import { aniversarioNoAno, gerarAlertas } from '../src/bibliotecas/rh/alertas-rh.ts';
import { HORARIO_OMISSAO, type Feriado } from '../src/bibliotecas/rh/ponto.ts';
import { RH_FERIADOS_INICIAIS } from '../src/bibliotecas/rh/esquema-rh.ts';

const H = HORARIO_OMISSAO;
const feriados: Feriado[] = RH_FERIADOS_INICIAIS.map(([dia, nome]) => ({ id: dia, data: `2000-${dia}`, nome, tipo: 'nacional', recorrente: 1, activo: 1 }));
const plano = (extra: Partial<PlanoFerias>): PlanoFerias => ({ id: 'p1', funcionario_id: 'f1', ano: 2026, mes_previsto: 11, data_inicio: '2026-10-28', data_fim: '2026-11-13', dias: 0,
    estado: 'aprovado', subsidio_processado: 0, processamento_id: null, ausencia_id: null, guia_id: null, ...extra });
const PARAM = { alertaFeriasDias: 5, mesNatal: 11, prazoEntregaDia: 10, alertaPrazosDias: 5, biDiasAviso: 90 };
const base = { funcionarios: [{ id: 'f1', nome: 'João Pedro', data_nascimento: '1990-10-26', estado: 'activo' }], contratos: [], documentos: [], planos: [], processamentos: [], ausenciasPendentes: 0, parametros: PARAM };

test('férias: dias úteis sem feriados, estados automáticos pelas datas e data de regresso', () => {
    assert.equal(diasDoPlano('2026-10-28', '2026-11-13', H, feriados), 11, '13 dias úteis menos os feriados de 2 e 11 de Novembro');
    assert.equal(estadoEfectivo(plano({}), '2026-10-23'), 'aprovado');
    assert.equal(estadoEfectivo(plano({}), '2026-11-02'), 'em_gozo');
    assert.equal(estadoEfectivo(plano({}), '2026-11-14'), 'gozado');
    assert.equal(estadoEfectivo(plano({ estado: 'planeado' }), '2026-11-14'), 'planeado');
    assert.equal(dataRegresso('2026-11-13', H, feriados), '2026-11-16', 'fim numa sexta: regressa segunda');
});

test('saldo: 22 dias + transitados do ano anterior − marcados e gozados', () => {
    const planos = [plano({ id: 'a', ano: 2025, data_inicio: '2025-08-01', data_fim: '2025-08-20', dias: 14 }), plano({ dias: 11 }), plano({ id: 'c', estado: 'planeado', dias: 5 })];
    assert.deepEqual(saldoFerias(planos, 'f1', 2026, 22, '2026-10-23', 22, '2020-01-01'), { direito: 22, transitados: 8, marcados: 11, gozados: 0, saldo: 19 });
    assert.equal(saldoFerias(planos, 'f1', 2026, 22, '2026-10-23', 22, '2026-03-01').transitados, 0, 'admitido este ano não transita');
});

test('conflito: mais de X% do departamento de férias ao mesmo tempo', () => {
    const funcionarios = ['f1', 'f2', 'f3'].map(id => ({ id, departamento_id: 'd1', estado: 'activo' }));
    const planos = [plano({ id: 'x', funcionario_id: 'f2', data_inicio: '2026-11-02', data_fim: '2026-11-06' })];
    const c = conflitoDepartamento({ inicio: '2026-11-05', fim: '2026-11-10', funcionarioId: 'f1', departamentoId: 'd1', planos, funcionarios, limitePct: 30, hoje: '2026-10-23' });
    assert.deepEqual(c, { pct: 67, dia: '2026-11-05' });
    assert.equal(conflitoDepartamento({ inicio: '2026-11-09', fim: '2026-11-10', funcionarioId: 'f1', departamentoId: 'd1', planos, funcionarios, limitePct: 40, hoje: '2026-10-23' }), null);
});

test('alerta de férias: 5 dias antes, sem duplicar, desaparece quando o subsídio é processado', () => {
    const a = gerarAlertas({ ...base, hoje: '2026-10-23', planos: [plano({})] });
    const ferias = a.find(x => x.tipo === 'ferias');
    assert.equal(ferias?.id, 'ferias:p1');
    assert.equal(ferias?.mensagem, 'O funcionário João Pedro vai sair de férias daqui a 5 dia(s) (início em 28/10/2026). Por favor, processe o seu subsídio de férias.');
    assert.equal(gerarAlertas({ ...base, hoje: '2026-10-24', planos: [plano({})] }).find(x => x.tipo === 'ferias')?.id, 'ferias:p1', 'mesma chave no dia seguinte');
    assert.equal(gerarAlertas({ ...base, hoje: '2026-10-22', planos: [plano({})] }).some(x => x.tipo === 'ferias'), false, '6 dias antes ainda não');
    assert.equal(gerarAlertas({ ...base, hoje: '2026-10-23', planos: [plano({ subsidio_processado: 1 })] }).some(x => x.tipo === 'ferias'), false);
    assert.equal(gerarAlertas({ ...base, hoje: '2026-10-23', planos: [plano({ processamento_id: 'pf' })], processamentos: [{ id: 'pf', ano: 2026, tipo: 'ferias', estado: 'aprovado' }] }).some(x => x.tipo === 'ferias'), false);
    assert.ok(gerarAlertas({ ...base, hoje: '2026-11-14', planos: [plano({})] }).some(x => x.id === 'regresso:p1'));
});

test('aniversários, contratos, Natal, prazos e BI dos clientes', () => {
    const hoje = gerarAlertas({ ...base, hoje: '2026-10-26' });
    assert.equal(hoje.find(x => x.tipo === 'aniversario')?.destinatario_perfil, 'todos');
    assert.equal(gerarAlertas({ ...base, hoje: '2026-10-23' }).find(x => x.tipo === 'aniversario_proximo')?.mensagem, 'O aniversário de João Pedro é na segunda-feira, 26/10.');
    assert.equal(aniversarioNoAno('2000-02-29', 2026), '2026-02-28');
    const contratos = [{ id: 'c1', funcionario_id: 'f1', estado: 'activo', fim: '2026-11-30', periodo_experiencia_fim: '2026-11-05' }];
    const ids = gerarAlertas({ ...base, hoje: '2026-11-01', contratos }).map(x => x.id);
    assert.ok(ids.includes('contrato-30:c1'));
    assert.ok(ids.includes('experiencia:c1'));
    assert.ok(ids.includes('natal:2026'));
    assert.ok(gerarAlertas({ ...base, hoje: '2026-10-05' }).some(x => x.id === 'prazos:2026-09'));
    assert.equal(gerarAlertas({ ...base, hoje: '2026-11-01', processamentos: [{ id: 'n', ano: 2026, tipo: 'natal', estado: 'fechado' }] }).some(x => x.tipo === 'natal'), false);
    const bi = gerarAlertas({ ...base, hoje: '2026-10-23', clientes: [{ id: 'k', name: 'Carlos', expiryDate: '2025-01-10' }] }).find(x => x.tipo === 'bi_cliente');
    assert.equal(bi?.mensagem, 'O BI do cliente Carlos expirou a 10/01/2025. Contacte o cliente para renovar.');
});

test('clientes com BI: decide pelo número quando o tipo não está guardado', async () => {
    const { clienteComBI } = await import('../src/bibliotecas/rh/bi-validade.ts');
    assert.equal(clienteComBI({ nif: '001111111LA011' }), true);
    assert.equal(clienteComBI({ nif: '5000000000' }), false, 'NIF de empresa');
    assert.equal(clienteComBI({ nif: 'SEM-1A2B3C4D' }), true);
    assert.equal(clienteComBI({ nif: '001111111LA011', documentType: 'PASSAPORTE' }), false);
    const sab = gerarAlertas({ ...base, funcionarios: [{ id: 'f1', nome: 'Rui', data_nascimento: '1990-10-24', estado: 'activo' }], hoje: '2026-10-22' });
    assert.equal(sab.find(x => x.tipo === 'aniversario_proximo')?.mensagem, 'O aniversário de Rui é no sábado, 24/10.');
});
