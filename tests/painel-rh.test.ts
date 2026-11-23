import test from 'node:test';
import assert from 'node:assert/strict';
import {
    assiduidade, assiduidadeDiaria, ausencias, camposEmFalta, corDepartamento, estadoMapa, etapaSalarios, extrasEFaltas, intervaloDoPeriodo, mesesDoIntervalo, variacao,
    type LinhaPainel,
} from '../src/bibliotecas/rh/painel-rh.ts';
import type { DiaPonto } from '../src/bibliotecas/rh/ponto-calculo.ts';

const dia = (data: string, estado: string, extra: Partial<DiaPonto> = {}): DiaPonto => ({ data, estado, util: !['FS', 'FR'].includes(estado), minutos_atraso: 0, minutos_extra: 0, primeira_entrada: null, ...extra } as DiaPonto);
const linha = (id: string, dias: DiaPonto[]): LinhaPainel => ({ funcionarioId: id, nome: id, departamentoId: null, dias });
const HOJE = '2026-11-23';

test('períodos do filtro e o período anterior', () => {
    assert.deepEqual(intervaloDoPeriodo('este_mes', HOJE), { de: '2026-11-01', ate: HOJE, anterior: { de: '2026-10-01', ate: '2026-10-23' } });
    assert.deepEqual(intervaloDoPeriodo('mes_passado', HOJE), { de: '2026-10-01', ate: '2026-10-31', anterior: { de: '2026-09-01', ate: '2026-09-30' } });
    assert.deepEqual(intervaloDoPeriodo('semana', HOJE), { de: '2026-11-23', ate: HOJE, anterior: { de: '2026-11-22', ate: '2026-11-22' } }, '23/11/2026 é segunda-feira');
    assert.deepEqual(intervaloDoPeriodo('este_ano', HOJE).de, '2026-01-01');
    assert.deepEqual(intervaloDoPeriodo('personalizado', HOJE, { de: '2026-11-10', ate: '2026-11-01' }), { de: '2026-11-01', ate: '2026-11-10', anterior: { de: '2026-10-22', ate: '2026-10-31' } });
    assert.deepEqual(intervaloDoPeriodo('mes_passado', '2027-01-15').de, '2026-12-01', 'Janeiro → Dezembro do ano anterior');
    assert.deepEqual(mesesDoIntervalo({ de: '2026-11-20', ate: '2027-02-02' }).map(m => `${m.ano}-${m.mes}`), ['2026-11', '2026-12', '2027-1', '2027-2']);
});

test('assiduidade: presentes ÷ dias úteis esperados, sem férias, licenças, feriados nem dias futuros', () => {
    const linhas = [
        linha('a', [dia('2026-11-18', 'P'), dia('2026-11-19', 'P', { minutos_atraso: 12 }), dia('2026-11-20', 'F'), dia('2026-11-21', 'FS'), dia('2026-11-23', 'SEM_REGISTO'), dia('2026-11-24', 'FUTURO')]),
        linha('b', [dia('2026-11-18', 'Fe'), dia('2026-11-19', 'P'), dia('2026-11-20', 'P'), dia('2026-11-23', 'P')]),
    ];
    const i = { de: '2026-11-01', ate: HOJE };
    assert.deepEqual(assiduidade(linhas, i, HOJE), { esperados: 6, presentes: 5, taxa: 83.3 }, 'hoje só conta quem já marcou');
    assert.deepEqual(assiduidadeDiaria(linhas, i, HOJE).map(d => [d.data, d.taxa]), [['2026-11-18', 100], ['2026-11-19', 100], ['2026-11-20', 50], ['2026-11-23', 100]]);
    assert.equal(assiduidade(linhas, { de: '2026-12-01', ate: '2026-12-31' }, HOJE).taxa, null);
});

test('mapa de presença: presente, atraso, falta, férias/licença, sem registo e futuro', () => {
    assert.equal(estadoMapa(dia('2026-11-18', 'P'), HOJE), 'P');
    assert.equal(estadoMapa(dia('2026-11-18', 'P', { minutos_atraso: 5 }), HOJE), 'A');
    assert.equal(estadoMapa(dia('2026-11-18', 'FJ'), HOJE), 'F');
    assert.equal(estadoMapa(dia('2026-11-18', 'L'), HOJE), 'L');
    assert.equal(estadoMapa(dia('2026-11-18', 'SEM_REGISTO'), HOJE), 'S');
    assert.equal(estadoMapa(dia('2026-11-25', 'SEM_REGISTO'), HOJE), 'futuro');
    assert.equal(estadoMapa(dia('2026-11-21', 'FS'), HOJE), null);
});

test('ausências por tipo e por dia da semana; horas extra e faltas por funcionário', () => {
    const linhas = [linha('a', [dia('2026-11-16', 'F'), dia('2026-11-17', 'FJ'), dia('2026-11-18', 'Fe'), dia('2026-11-19', 'L'), dia('2026-11-20', 'D'), dia('2026-11-23', 'F'), dia('2026-11-13', 'P', { minutos_extra: 90 })])];
    const r = ausencias(linhas, { de: '2026-11-01', ate: HOJE }, HOJE);
    assert.deepEqual(r.tipos, { ferias: 1, faltas_justificadas: 1, faltas_injustificadas: 2, licencas: 1, dispensas: 1 });
    assert.deepEqual(r.semana, [2, 1, 0, 1, 1], 'as férias não entram na distribuição por dia da semana');
    assert.deepEqual(extrasEFaltas(linhas, { de: '2026-11-01', ate: HOJE }, HOJE).get('a'), { minutosExtra: 90, faltas: 2 });
    assert.equal(variacao(12, 10), 20);
    assert.equal(variacao(5, 0), null);
});

test('fichas incompletas, etapa dos salários e cores fixas dos departamentos', () => {
    assert.deepEqual(camposEmFalta({ nif: '123', numero_inss: '', iban: null, bi_numero: '002658949BA031', data_nascimento: null }), ['INSS', 'IBAN', 'data de nascimento']);
    assert.equal(etapaSalarios(null, false), 'ponto');
    assert.equal(etapaSalarios(null, true), 'processar');
    assert.equal(etapaSalarios('calculado', true), 'aprovar');
    assert.equal(etapaSalarios('aprovado', true), 'pagar');
    assert.equal(etapaSalarios('pago', true), 'recibos');
    assert.equal(corDepartamento(['d1', 'd2'], 'd2'), '#eb6834');
    assert.equal(corDepartamento(['d1'], 'x'), '#98A2B3');
});
