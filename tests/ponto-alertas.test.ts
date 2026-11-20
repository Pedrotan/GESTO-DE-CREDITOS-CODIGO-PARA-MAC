// Alertas do livro de ponto (secção 7.7).
import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG_PONTO_OMISSAO, type DiaPonto } from '../src/bibliotecas/rh/ponto-calculo.ts';
import { alertasPonto } from '../src/bibliotecas/rh/ponto-alertas.ts';

const dia = (data: string, extra: Partial<DiaPonto> = {}): DiaPonto => ({
    data, estado: 'P', util: true, feriado: null, entrada_prevista: `${data}T08:00`, saida_prevista: `${data}T17:00`,
    primeira_entrada: `${data}T08:00`, ultima_saida: `${data}T17:00`, minutos_trabalhados: 480, minutos_pausa: 60, minutos_atraso: 0,
    minutos_saida_antecipada: 0, minutos_extra: 0, tipo_extra: null, minutos_noturnos: 0, incompleto: false, falta_fraccao: 0, falta_tipo: null,
    desconto_fraccao: 0, ausencia_id: null, ausencia_pendente: false, ...extra,
} as DiaPonto);
const base = { hoje: '2026-12-10', config: CONFIG_PONTO_OMISSAO, extraAnoAnterioresMin: new Map<string, number>(), justificacoesPendentes: [], mesAnteriorFechado: true };

test('sem marcação só depois da hora de alerta e só em dia útil', () => {
    const linhas = [{ funcionario: { id: 'a', nome: 'Ana' }, dias: [dia('2026-12-10', { estado: 'SEM_REGISTO', primeira_entrada: null, ultima_saida: null })] }];
    assert.equal(alertasPonto({ ...base, agora: '2026-12-10T08:00', linhas }).length, 0);
    const r = alertasPonto({ ...base, agora: '2026-12-10T09:00', linhas });
    assert.deepEqual(r.map(a => a.id), ['ponto_sem_marcacao:a:2026-12-10']);
});

test('entrada sem saída 2 horas depois da saída prevista', () => {
    const linhas = [{ funcionario: { id: 'a', nome: 'Ana' }, dias: [dia('2026-12-10', { ultima_saida: null, incompleto: true })] }];
    assert.equal(alertasPonto({ ...base, agora: '2026-12-10T18:30', linhas }).length, 0);
    assert.equal(alertasPonto({ ...base, agora: '2026-12-10T19:05', linhas })[0].tipo, 'ponto_sem_saida');
});

test('atrasos repetidos, horas extra acima do limite, justificação há mais de 48 h e mês por fechar', () => {
    const dias = ['2026-12-01', '2026-12-02', '2026-12-03'].map(d => dia(d, { minutos_atraso: 12 }));
    dias.push(dia('2026-12-04', { minutos_extra: 180, tipo_extra: 'util' }));
    const r = alertasPonto({
        ...base, agora: '2026-12-10T12:00', mesAnteriorFechado: false,
        extraAnoAnterioresMin: new Map([['a', 11_900]]),
        linhas: [{ funcionario: { id: 'a', nome: 'Ana' }, dias }],
        justificacoesPendentes: [{ id: 'j1', funcionario_id: 'a', data_inicio: '2026-12-05', criado_em: '2026-12-07T10:00:00.000Z' }],
    });
    const ids = r.map(a => a.id).sort();
    assert.deepEqual(ids, ['ponto_atrasos:a:2026-12', 'ponto_extra_ano:a:2026', 'ponto_extra_dia:a:2026-12-04', 'ponto_justificacao:j1', 'ponto_mes_validar:2026-11']);
    assert.match(r.find(a => a.id === 'ponto_justificacao:j1')!.mensagem, /48 horas/);
});
