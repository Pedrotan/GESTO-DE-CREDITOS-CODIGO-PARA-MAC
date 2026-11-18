// Importação do relógio biométrico: formatos, mapeamento de colunas, inferência de entrada/saída e duplicados.
import test from 'node:test';
import assert from 'node:assert/strict';
import { idMarcacaoImportada, lerTabelaCsv, MAPEAMENTO_ANTERIOR, normalizarData, normalizarHora, normalizarTipo, previsualizarCsv, relatorioErros, type MapeamentoCsv } from '../src/bibliotecas/rh/ponto-importacao.ts';
import { HORARIO_OMISSAO } from '../src/bibliotecas/rh/ponto.ts';

const FUNCIONARIOS = [
    { id: 'f1', nome: 'Osvaldo', numero_mecanografico: '0001', horario: HORARIO_OMISSAO },
    { id: 'f2', nome: 'Guarda', numero_mecanografico: '0002', horario: { ...HORARIO_OMISSAO, id: 'noite', entrada: '22:00', saida: '06:00', intervalo_min: 0 } },
];
const UMA_POR_LINHA: MapeamentoCsv = { modo: 'marcacoes', numero: 0, data: null, hora: null, data_hora: 1, tipo: null, entrada: null, saida: null, cabecalho: true };

test('datas, horas e tipos em formatos comuns', () => {
    assert.deepEqual(['2026-11-03', '03/11/2026', '3-11-2026', '31/02/2026'].map(normalizarData), ['2026-11-03', '2026-11-03', '2026-11-03', null]);
    assert.deepEqual(['8:05', '08:05:59', '24:00'].map(normalizarHora), ['08:05', '08:05', null]);
    assert.deepEqual(['IN', 'Check-Out', 'x', ''].map(normalizarTipo), ['entrada', 'saida', null, null]);
    assert.deepEqual(lerTabelaCsv('﻿a,b\n"1","2"\n'), [['a', 'b'], ['1', '2']]);
});

test('relógio com uma marcação por linha e sem tipo: primeira entrada, última saída, intermédias pausas', () => {
    const csv = 'ID,Data/Hora\n1,2026-11-03 08:02:11\n1,2026-11-03 12:01\n1,2026-11-03 13:00\n1,2026-11-03 17:04\n';
    const linhas = previsualizarCsv(csv, UMA_POR_LINHA, FUNCIONARIOS, []);
    assert.deepEqual(linhas.map(l => [l.data_hora?.slice(11), l.tipo, l.estado]), [
        ['08:02', 'entrada', 'valida'], ['12:01', 'inicio_pausa', 'valida'], ['13:00', 'fim_pausa', 'valida'], ['17:04', 'saida', 'valida'],
    ]);
});

test('turno nocturno: a saída depois da meia-noite pertence ao dia da entrada', () => {
    const csv = 'ID,Data/Hora\n2,2026-11-03 22:00\n2,2026-11-04 06:03\n';
    const linhas = previsualizarCsv(csv, UMA_POR_LINHA, FUNCIONARIOS, []);
    assert.deepEqual(linhas.map(l => [l.data, l.tipo]), [['2026-11-03', 'entrada'], ['2026-11-03', 'saida']]);
});

test('formato da versão anterior: entrada e saída na mesma linha; desconhecidos e duplicados assinalados', () => {
    const csv = 'numero;data;entrada;saida\n0001;2026-11-03;08:00;17:00\n0009;2026-11-03;08:00;17:00\n0001;2026-11-04;xx;17:00\n';
    const existentes = [{ funcionario_id: 'f1', data_hora: '2026-11-03T17:00', tipo: 'saida' as const }];
    const linhas = previsualizarCsv(csv, MAPEAMENTO_ANTERIOR, FUNCIONARIOS, existentes);
    assert.deepEqual(linhas.map(l => l.estado), ['valida', 'duplicada', 'funcionario_desconhecido', 'funcionario_desconhecido', 'data_invalida', 'valida']);
    assert.match(relatorioErros(linhas), /funcionario_desconhecido/u);
    assert.equal(idMarcacaoImportada('f1', '2026-11-03T08:00', 'entrada'), 'csv:f1:2026-11-03T08:00:entrada');
});
