import test from 'node:test';
import assert from 'node:assert/strict';
import { calcularDia, codigoDia, diasUteis, ehDiaUtil, horasSemanais, lerCsvPonto, resumoMes, HORARIO_OMISSAO, type Ausencia, type Feriado, type TipoAusencia } from '../src/bibliotecas/rh/ponto.ts';
import { RH_FERIADOS_INICIAIS, RH_TIPOS_AUSENCIA_INICIAIS, rhSeedFase2Statements } from '../src/bibliotecas/rh/esquema-rh.ts';

const H = HORARIO_OMISSAO; // 08:00–17:00, 60 min de intervalo, seg–sex, tolerância 10 min
const feriados: Feriado[] = RH_FERIADOS_INICIAIS.map(([dia, nome]) => ({ id: dia, data: `2000-${dia}`, nome, tipo: 'nacional', recorrente: 1, activo: 1 }));
const tipos: TipoAusencia[] = RH_TIPOS_AUSENCIA_INICIAIS.map(t => ({ id: t.codigo, codigo: t.codigo, nome: t.nome, justificada: t.justificada, remunerada: t.remunerada, desconta_salario: t.desconta, desconta_ferias: t.ferias || 0, exige_documento: t.documento || 0 }));

test('ponto: horas, atraso acima da tolerância e horas extra', () => {
    assert.deepEqual(calcularDia('08:00', '17:00', H, true), { horas_trabalhadas: 8, horas_extra: 0, minutos_atraso: 0 });
    assert.equal(calcularDia('08:09', '17:00', H, true).minutos_atraso, 0, 'dentro da tolerância');
    assert.equal(calcularDia('08:25', '17:00', H, true).minutos_atraso, 25);
    assert.deepEqual(calcularDia('08:00', '19:30', H, true), { horas_trabalhadas: 10.5, horas_extra: 2.5, minutos_atraso: 0 });
    assert.deepEqual(calcularDia('09:00', '13:00', H, false), { horas_trabalhadas: 4, horas_extra: 4, minutos_atraso: 0 }, 'feriado: tudo é extra, sem intervalo');
    assert.equal(calcularDia('22:00', '06:00', H, false).horas_trabalhadas, 7, 'turno que passa a meia-noite');
    assert.equal(horasSemanais(H), 40);
});

test('calendário: fins-de-semana e feriados recorrentes não são dias úteis', () => {
    assert.equal(ehDiaUtil('2026-11-11', H, feriados), false, 'Independência');
    assert.equal(ehDiaUtil('2026-10-24', H, feriados), false, 'sábado');
    assert.equal(ehDiaUtil('2026-10-23', H, feriados), true);
    assert.equal(diasUteis('2026-10-01', '2026-10-31', H, feriados), 22);
    assert.equal(diasUteis('2026-11-01', '2026-11-30', H, feriados), 19, 'Novembro de 2026 tem os feriados de 2 e 11');
});

test('resumo do mês: só ausências aprovadas que descontam contam como faltas descontáveis', () => {
    const ausencias: Ausencia[] = [
        { id: 'a', funcionario_id: 'f1', tipo_id: 'F', data_inicio: '2026-10-05', data_fim: '2026-10-06', dias: 2, horas: 0, estado: 'aprovada' },
        { id: 'b', funcionario_id: 'f1', tipo_id: 'F', data_inicio: '2026-10-07', data_fim: '2026-10-07', dias: 1, horas: 0, estado: 'anulada' },
        { id: 'c', funcionario_id: 'f1', tipo_id: 'DOE', data_inicio: '2026-10-08', data_fim: '2026-10-08', dias: 1, horas: 0, estado: 'aprovada' },
        { id: 'd', funcionario_id: 'f1', tipo_id: 'FJ', data_inicio: '2026-10-09', data_fim: '2026-10-09', dias: 0, horas: 4, estado: 'aprovada' },
        { id: 'e', funcionario_id: 'f1', tipo_id: 'F', data_inicio: '2026-10-12', data_fim: '2026-10-12', dias: 1, horas: 0, estado: 'pendente' },
    ];
    const pontos = [
        { funcionario_id: 'f1', data: '2026-10-01', entrada: '08:30', saida: '19:00', ...calcularDia('08:30', '19:00', H, true) },
        { funcionario_id: 'f1', data: '2026-10-04', entrada: '09:00', saida: '12:00', ...calcularDia('09:00', '12:00', H, false) },
    ];
    const r = resumoMes({ funcionarioId: 'f1', ano: 2026, mes: 10, horario: H, feriados, pontos, ausencias, tipos, admissao: '2026-01-05', hoje: '2026-11-01' });
    assert.equal(r.diasUteis, 22);
    assert.equal(r.faltasInjustificadas, 2);
    assert.equal(r.faltasDescontaveis, 2.5, '2 injustificadas + meio dia justificado sem remuneração');
    assert.equal(r.faltasJustificadas, 1.5);
    assert.equal(r.minutosAtraso, 30);
    assert.equal(r.horasExtra, 1.5);
    assert.equal(r.horasExtraFeriado, 3);
    assert.equal(r.ausenciasPendentes, 1);
    assert.equal(r.diasPresenca, 1);
});

test('livro de ponto: códigos de cada dia', () => {
    const mapa = new Map([['f1:2026-10-01', { funcionario_id: 'f1', data: '2026-10-01', entrada: '08:00', saida: '17:00', horas_trabalhadas: 8, horas_extra: 0, minutos_atraso: 0 }]]);
    const ausencias: Ausencia[] = [{ id: 'a', funcionario_id: 'f1', tipo_id: 'FE', data_inicio: '2026-10-19', data_fim: '2026-10-23', dias: 5, horas: 0, estado: 'aprovada' }];
    const base = { funcionarioId: 'f1', horario: H, feriados, pontos: mapa, ausencias, tipos: new Map(tipos.map(t => [t.id, t])), hoje: '2026-10-23' };
    assert.equal(codigoDia({ ...base, data: '2026-10-01' }), 'P');
    assert.equal(codigoDia({ ...base, data: '2026-10-02' }), '?', 'dia útil passado sem registo');
    assert.equal(codigoDia({ ...base, data: '2026-10-03' }), 'FS');
    assert.equal(codigoDia({ ...base, data: '2026-10-20' }), 'Fé');
    assert.equal(codigoDia({ ...base, data: '2026-11-11' }), 'FR');
    assert.equal(codigoDia({ ...base, data: '2026-10-28' }), '', 'futuro sem registo');
});

test('importação CSV do relógio', () => {
    const { linhas, erros } = lerCsvPonto('numero;data;entrada;saida\n0001;2026-10-01;8:05;17:10\n0002;01/10/2026;08:00;16:00\nlixo');
    assert.deepEqual(linhas, [
        { numero: '0001', data: '2026-10-01', entrada: '08:05', saida: '17:10' },
        { numero: '0002', data: '2026-10-01', entrada: '08:00', saida: '16:00' },
    ]);
    assert.equal(erros.length, 1);
    const ids = rhSeedFase2Statements('x').map(s => s.params[0]);
    assert.equal(new Set(ids).size, ids.length);
});
