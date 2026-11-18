// Livro de ponto, 2.ª parte: escalas e turnos (F3.9/F3.10), horário flexível e banco de horas (F3.11).
import test from 'node:test';
import assert from 'node:assert/strict';
import { calcularDiaPonto, CONFIG_PONTO_OMISSAO, type Marcacao } from '../src/bibliotecas/rh/ponto-calculo.ts';
import { cicloDoHorario, horarioNaData, posicaoNoCiclo, segundaDaSemana } from '../src/bibliotecas/rh/ponto-escalas.ts';
import { extraNoBanco, movimentosDoFecho, saldoBanco, type MovimentoBanco } from '../src/bibliotecas/rh/ponto-banco.ts';
import { construirGrelha } from '../src/bibliotecas/rh/ponto-grelha.ts';
import type { Horario } from '../src/bibliotecas/rh/ponto.ts';

const manha: Horario = { id: 'manha', nome: 'Manhã', entrada: '06:00', saida: '14:00', intervalo_min: 30, dias_semana: '1,2,3,4,5', tolerancia_min: 10 };
const noite: Horario = { id: 'noite', nome: 'Noite', entrada: '22:00', saida: '06:00', intervalo_min: 30, dias_semana: '1,2,3,4,5', tolerancia_min: 10, tipo: 'noturno' };
// 2 manhãs, 2 noites, 4 folgas, a começar a 2026-11-02.
const rotativo: Horario = { id: 'rot', nome: 'Escala 2-2-4', entrada: '06:00', saida: '14:00', intervalo_min: 30, dias_semana: '1,2,3,4,5,6,7', tolerancia_min: 10,
    tipo: 'rotativo', ciclo: JSON.stringify(['manha', 'manha', 'noite', 'noite', '', '', '', '']), ciclo_inicio: '2026-11-02' };
const horarios = [manha, noite, rotativo];
const m = (data: string, hora: string, tipo: Marcacao['tipo'], dia = data): Marcacao => ({ id: `${dia}${hora}`, funcionario_id: 'f', data: dia, data_hora: `${data}T${hora}`, tipo, origem: 'relogio' });

test('ciclo rotativo: posição, turno e folga em cada dia (também antes do início)', () => {
    assert.equal(cicloDoHorario(rotativo).length, 8);
    assert.equal(posicaoNoCiclo('2026-11-02', '2026-11-02', 8), 0);
    assert.equal(posicaoNoCiclo('2026-11-01', '2026-11-02', 8), 7);
    assert.equal(horarioNaData(rotativo, '2026-11-02', horarios).horario.id, 'manha');
    assert.equal(horarioNaData(rotativo, '2026-11-04', horarios).horario.id, 'noite');
    const folga = horarioNaData(rotativo, '2026-11-06', horarios);
    assert.equal(folga.folga, true);
    assert.equal(folga.horario.dias_semana, '');
    // O ciclo repete-se: dia 10 = dia 2 do ciclo seguinte (manhã), mesmo sendo terça ou domingo.
    assert.equal(horarioNaData(rotativo, '2026-11-11', horarios).horario.id, 'manha');
    // Sábado 21/11 = dia 4 do ciclo (noite): trabalha ao sábado; domingo 15/11 = folga.
    const sabado = horarioNaData(rotativo, '2026-11-21', horarios);
    assert.equal(sabado.horario.id, 'noite');
    assert.equal(sabado.horario.dias_semana, '6');
    assert.equal(horarioNaData(rotativo, '2026-11-15', horarios).folga, true);
});

test('a escala lançada manda: turno num sábado e folga num dia de trabalho', () => {
    const sabado = horarioNaData(manha, '2026-11-07', horarios, { funcionario_id: 'f', data: '2026-11-07', horario_id: 'noite' });
    assert.equal(sabado.origem, 'escala');
    assert.equal(sabado.horario.id, 'noite');
    assert.equal(sabado.horario.dias_semana, '6');
    const folga = horarioNaData(manha, '2026-11-04', horarios, { funcionario_id: 'f', data: '2026-11-04', horario_id: null });
    assert.equal(folga.folga, true);
    assert.equal(segundaDaSemana('2026-11-08'), '2026-11-02');
});

test('grelha: dia de folga da escala fica FS e o turno da noite conta pelo dia da entrada', () => {
    const f = { id: 'f', nome: 'Ana', numero_mecanografico: '1', departamento_id: null, cargo_id: null, horario_id: 'rot', data_admissao: '2024-01-01', data_saida: null, estado: 'activo' };
    const g = construirGrelha({
        ano: 2026, mes: 11, hoje: '2026-11-30', funcionarios: [f], horarios, feriados: [], tipos: [], ausencias: [], legados: [], config: CONFIG_PONTO_OMISSAO,
        marcacoes: [m('2026-11-04', '22:05', 'entrada'), m('2026-11-05', '06:02', 'saida', '2026-11-04')],
        escalas: [{ funcionario_id: 'f', data: '2026-11-03', horario_id: null }],
    });
    const dia = (d: string) => g.linhas[0].dias.find(x => x.data === d)!;
    assert.equal(dia('2026-11-03').estado, 'FS');
    assert.equal(dia('2026-11-04').estado, 'P');
    // 22:05–06:02 = 7h57 de presença, menos a pausa automática de 30 min do turno.
    assert.equal(dia('2026-11-04').minutos_trabalhados, 477 - 30);
    assert.equal(dia('2026-11-06').estado, 'FS');
    assert.equal(dia('2026-11-02').estado, 'SEM_REGISTO');
});

test('horário flexível: atraso pela faixa obrigatória e extra acima do mínimo', () => {
    const flex: Horario = { id: 'flex', nome: 'Flexível', entrada: '07:00', saida: '19:00', intervalo_min: 60, dias_semana: '1,2,3,4,5', tolerancia_min: 0,
        tipo: 'flexivel', minimo_diario_min: 480, faixa_inicio: '10:00', faixa_fim: '15:00' };
    const base = { hoje: '2026-11-30', horario: flex, feriados: [], config: CONFIG_PONTO_OMISSAO };
    // Entra às 09:00 e sai às 18:00: dentro da faixa, 9 h de presença − 1 h de pausa = 8 h → sem atraso nem extra.
    const normal = calcularDiaPonto({ ...base, data: '2026-11-03', marcacoes: [m('2026-11-03', '09:00', 'entrada'), m('2026-11-03', '18:00', 'saida')] });
    assert.equal(normal.minutos_atraso, 0);
    assert.equal(normal.minutos_extra, 0);
    assert.equal(normal.entrada_prevista, '2026-11-03T10:00');
    // Entra às 10:30 (30 min depois do início da faixa; tolerância de 10 → 20) e sai às 14:30 (antes do fim).
    const tarde = calcularDiaPonto({ ...base, data: '2026-11-04', marcacoes: [m('2026-11-04', '10:30', 'entrada'), m('2026-11-04', '14:30', 'saida')] });
    assert.equal(tarde.minutos_atraso, 20);
    assert.equal(tarde.minutos_saida_antecipada, 25);
    // 07:00–19:00 = 12 h − 1 h = 11 h: 3 h acima do mínimo.
    const longo = calcularDiaPonto({ ...base, data: '2026-11-05', marcacoes: [m('2026-11-05', '07:00', 'entrada'), m('2026-11-05', '19:00', 'saida')] });
    assert.equal(longo.minutos_extra, 180);
});

test('banco de horas: saldo, débitos pelas mais antigas e validade', () => {
    const mov = (id: string, data: string, minutos: number, tipo: MovimentoBanco['tipo'] = minutos > 0 ? 'extra' : 'folga'): MovimentoBanco => ({ id, funcionario_id: 'f', data, minutos, tipo });
    const movimentos = [mov('a', '2026-01-10', 120), mov('b', '2026-05-10', 240), mov('c', '2026-06-01', -60), mov('x', '2026-06-02', 999, 'ajuste')];
    movimentos[3].anulado = 1;
    // Sem validade: 120 + 240 − 60.
    assert.equal(saldoBanco(movimentos, '2026-11-18', 0).saldo, 300);
    // Validade de 6 meses: o débito de Junho gasta 60 dos 120 de Janeiro; os outros 60 expiram a 10/07.
    const s = saldoBanco(movimentos, '2026-11-05', 6);
    assert.equal(s.expirados, 60);
    assert.equal(s.saldo, 240);
    // A 18/11 os 240 de Maio também já expiraram (10/11).
    assert.equal(saldoBanco(movimentos, '2026-11-18', 6).saldo, 0);
    // A 2026-10-20, os 240 de Maio expiram a 10/11: estão nos 30 dias.
    assert.equal(saldoBanco(movimentos, '2026-10-20', 6).a_expirar_30d, 240);
    // Débito maior que o saldo fica negativo e é pago pelo crédito seguinte.
    const divida = [mov('d1', '2026-03-01', -90), mov('d2', '2026-03-05', 60, 'ajuste')];
    assert.equal(saldoBanco(divida, '2026-03-10', 6).saldo, -30);
});

test('fecho do mês: horas extra e saídas antecipadas viram movimentos e saem do salário', () => {
    const dias = [
        { data: '2026-11-03', minutos_extra: 90, tipo_extra: 'util', minutos_saida_antecipada: 0 },
        { data: '2026-11-04', minutos_extra: 0, tipo_extra: null, minutos_saida_antecipada: 30 },
        { data: '2026-11-08', minutos_extra: 300, tipo_extra: 'descanso', minutos_saida_antecipada: 0 },
    ] as Parameters<typeof movimentosDoFecho>[1];
    const novos = movimentosDoFecho('f', dias, new Set(['banco:extra:f:2026-11-08']));
    assert.deepEqual(novos.map(n => [n.id, n.minutos]), [['banco:extra:f:2026-11-03', 90], ['banco:saida:f:2026-11-04', -30]]);
    const todos: MovimentoBanco[] = [...novos, { id: 'banco:extra:f:2026-11-08', funcionario_id: 'f', data: '2026-11-08', minutos: 300, tipo: 'extra', tipo_extra: 'descanso' }];
    assert.deepEqual(extraNoBanco(todos, 'f', '2026-11'), { util: 90, descanso: 300, feriado: 0 });
});
