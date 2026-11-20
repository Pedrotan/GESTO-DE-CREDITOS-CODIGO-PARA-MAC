// Motor do Livro de ponto: os testes obrigatórios T1–T14 da especificação (secção 13.1) e casos de apoio.
import test from 'node:test';
import assert from 'node:assert/strict';
import { calcularDiaPonto, CONFIG_PONTO_OMISSAO, configDosParametros, distanciaMetros, formatarMinutos, inferirTipos, totaisDosDias,
    type ConfigPonto, type Marcacao, type TipoMarcacao } from '../src/bibliotecas/rh/ponto-calculo.ts';
import { HORARIO_OMISSAO, type Feriado, type Horario, type TipoAusencia } from '../src/bibliotecas/rh/ponto.ts';

const H = HORARIO_OMISSAO; // 08:00–17:00, pausa de 60, segunda a sexta
const FERIADOS: Feriado[] = [{ id: 'f', data: '2000-11-11', nome: 'Dia da Independência Nacional', tipo: 'nacional', recorrente: 1, activo: 1 }];
const CFG: ConfigPonto = { ...CONFIG_PONTO_OMISSAO };
const HOJE = '2026-11-20';
const TERCA = '2026-11-03';
const tipo = (codigo: string, extra: Partial<TipoAusencia> = {}): TipoAusencia => ({ id: codigo, codigo, nome: codigo, justificada: 0, remunerada: 0, desconta_salario: 1, desconta_ferias: 0, exige_documento: 0, ...extra });
let seq = 0;
const m = (data: string, hora: string, t: TipoMarcacao | null, dia = data): Marcacao => ({ id: `m${seq++}`, funcionario_id: 'f1', data: dia, data_hora: `${data}T${hora}`, tipo: t, origem: 'manual' });
const dia = (marcacoes: Marcacao[], extra: Partial<Parameters<typeof calcularDiaPonto>[0]> = {}) =>
    calcularDiaPonto({ data: TERCA, hoje: HOJE, horario: H, feriados: FERIADOS, config: CFG, marcacoes, ...extra });

test('T1 · 08:00–17:00 com pausa de 60: 480 trabalhados, sem atraso nem extra, presente', () => {
    const d = dia([m(TERCA, '08:00', 'entrada'), m(TERCA, '17:00', 'saida')]);
    assert.deepEqual([d.minutos_trabalhados, d.minutos_atraso, d.minutos_extra, d.estado], [480, 0, 0, 'P']);
});

test('T2 · entrada às 08:09 com tolerância de 10: sem atraso', () => {
    assert.equal(dia([m(TERCA, '08:09', 'entrada'), m(TERCA, '17:00', 'saida')]).minutos_atraso, 0);
});

test('T3 · entrada às 08:25: conta só o excesso (15) ou, com tolerância cumulativa, o atraso todo (25)', () => {
    const marcacoes = [m(TERCA, '08:25', 'entrada'), m(TERCA, '17:00', 'saida')];
    assert.equal(dia(marcacoes).minutos_atraso, 15);
    assert.equal(dia(marcacoes, { config: { ...CFG, tolerancia_cumulativa: true } }).minutos_atraso, 25);
});

test('T4 · saída às 18:30: 90 minutos extra', () => {
    const d = dia([m(TERCA, '08:00', 'entrada'), m(TERCA, '18:30', 'saida')]);
    assert.deepEqual([d.minutos_extra, d.tipo_extra], [90, 'util']);
});

test('T5 · saída às 17:10 com mínimo de 15: sem extra', () => {
    assert.equal(dia([m(TERCA, '08:00', 'entrada'), m(TERCA, '17:10', 'saida')]).minutos_extra, 0);
});

test('T6 · só entrada num dia que já passou: incompleto, sem extra', () => {
    const d = dia([m(TERCA, '08:00', 'entrada')]);
    assert.deepEqual([d.incompleto, d.minutos_extra, d.estado], [true, 0, 'P']);
});

test('T7 · dia útil passado sem marcações: sem registo', () => {
    assert.equal(dia([]).estado, 'SEM_REGISTO');
});

test('T8 · feriado sem marcações: FR', () => {
    assert.equal(dia([], { data: '2026-11-11' }).estado, 'FR');
});

test('T9 · marcações num sábado de folga: FS e todas as horas como extra', () => {
    const d = dia([m('2026-11-07', '09:00', 'entrada'), m('2026-11-07', '13:00', 'saida')], { data: '2026-11-07' });
    assert.deepEqual([d.estado, d.minutos_trabalhados, d.minutos_extra, d.tipo_extra], ['FS', 240, 240, 'descanso']);
});

test('T10 · férias aprovadas com marcação: Fe, com aviso de inconsistência', () => {
    const d = dia([m(TERCA, '08:00', 'entrada'), m(TERCA, '17:00', 'saida')], { ausencia: { id: 'a', tipo: tipo('FE', { desconta_ferias: 1, justificada: 1 }), estado: 'aprovada' } });
    assert.equal(d.estado, 'Fe');
    assert.match(d.aviso || '', /ausência/u);
});

test('T11 · turno 22:00–06:00: 480 trabalhados no dia da entrada, 480 nocturnos (janela 20–06)', () => {
    const noite: Horario = { ...H, id: 'noite', entrada: '22:00', saida: '06:00', intervalo_min: 0 };
    const d = dia([m(TERCA, '22:00', 'entrada'), m('2026-11-04', '06:00', 'saida', TERCA)], { horario: noite });
    assert.deepEqual([d.minutos_trabalhados, d.minutos_noturnos, d.minutos_atraso, d.estado], [480, 480, 0, 'P']);
});

test('T12 · falta de meio dia (manhã) e entrada às 13:00: F = 0,5, sem atraso à tarde', () => {
    const d = dia([m(TERCA, '13:00', 'entrada'), m(TERCA, '17:00', 'saida')], { ausencia: { id: 'a', tipo: tipo('F'), estado: 'aprovada', meio_dia: 'manha' } });
    assert.deepEqual([d.estado, d.falta_tipo, d.falta_fraccao, d.minutos_atraso, d.minutos_extra, d.desconto_fraccao], ['P', 'F', 0.5, 0, 0, 0.5]);
    const t = totaisDosDias([d], HOJE);
    assert.equal(t.faltas, 0.5);
});

test('T13 · admitido a dia 15: dias 1–14 sem estado, não contam como pendentes', () => {
    const dias = ['2026-11-03', '2026-11-16'].map(data => calcularDiaPonto({ data, hoje: HOJE, horario: H, feriados: FERIADOS, config: CFG, marcacoes: [], admissao: '2026-11-15' }));
    assert.deepEqual(dias.map(d => d.estado), ['FORA', 'SEM_REGISTO']);
    assert.equal(totaisDosDias(dias, HOJE).pendentes, 1);
});

test('T14 · duas entradas com 1 minuto de diferença: a segunda é ignorada', () => {
    const segunda = m(TERCA, '08:01', 'entrada');
    const d = dia([m(TERCA, '08:00', 'entrada'), segunda, m(TERCA, '17:00', 'saida')]);
    assert.deepEqual([d.ignoradas, d.incompleto, d.minutos_trabalhados], [[segunda.id], false, 480]);
});

test('falta injustificada de dia inteiro: F e desconto só quando aprovada', () => {
    const aprovada = dia([], { ausencia: { id: 'a', tipo: tipo('F'), estado: 'aprovada' } });
    const pendente = dia([], { ausencia: { id: 'a', tipo: tipo('F'), estado: 'pendente' } });
    assert.deepEqual([aprovada.estado, aprovada.falta_fraccao, aprovada.desconto_fraccao], ['F', 1, 1]);
    assert.deepEqual([pendente.estado, pendente.desconto_fraccao, pendente.ausencia_pendente], ['F', 0, true]);
});

test('o estado «sem registo» nunca desconta e o dia de hoje e os futuros não são pendentes', () => {
    const dias = ['2026-11-19', HOJE, '2026-11-23'].map(data => calcularDiaPonto({ data, hoje: HOJE, horario: H, feriados: FERIADOS, config: CFG, marcacoes: [] }));
    assert.deepEqual(dias.map(d => d.estado), ['SEM_REGISTO', 'SEM_REGISTO', 'FUTURO']);
    const t = totaisDosDias(dias, HOJE);
    assert.deepEqual([t.pendentes, t.faltas_descontaveis], [1, 0]);
});

test('marcações de pausa substituem a pausa automática; saída antecipada conta acima da tolerância', () => {
    const d = dia([m(TERCA, '08:00', 'entrada'), m(TERCA, '12:00', 'inicio_pausa'), m(TERCA, '12:30', 'fim_pausa'), m(TERCA, '16:30', 'saida')]);
    assert.deepEqual([d.minutos_trabalhados, d.minutos_pausa, d.minutos_saida_antecipada], [480, 30, 25]);
});

test('relógio sem tipos: alterna entrada e saída; trabalho num feriado conta como extra de feriado', () => {
    const d = dia([m('2026-11-11', '08:00', null), m('2026-11-11', '12:00', null)], { data: '2026-11-11' });
    assert.deepEqual([d.estado, d.minutos_extra, d.tipo_extra], ['FR', 240, 'feriado']);
    assert.deepEqual(inferirTipos([{ data_hora: 'b' }, { data_hora: 'a' }, { data_hora: 'c' }]).map(x => x.tipo), ['entrada', 'inicio_pausa', 'saida']);
});

test('configuração lida dos parâmetros com vigência, com os valores por omissão da especificação', () => {
    const p = (chave: string, valor: string) => ({ id: chave, chave, valor, vigencia_inicio: '2026-01-01' });
    const c = configDosParametros([p('ponto_tolerancia_entrada_min', '5'), p('ponto_tolerancia_cumulativa', '1'), p('ponto_inicio_noturno', '21:00')], '2026-11-03');
    assert.deepEqual([c.tolerancia_entrada_min, c.tolerancia_cumulativa, c.inicio_noturno, c.minimo_extra_min], [5, true, '21:00', 15]);
});

test('apoio: formato hh:mm e distância para a área permitida', () => {
    assert.equal(formatarMinutos(5760), '96:00');
    assert.equal(formatarMinutos(150), '2:30');
    assert.ok(Math.abs(distanciaMetros(-8.8383, 13.2344, -8.8383, 13.2362) - 198) < 5);
});
