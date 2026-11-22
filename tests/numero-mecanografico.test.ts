import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    eNumeroComSigla, gerarNumeroComSigla, gerarNumeroUnico, normalizarSigla, sugerirSigla, validarSigla,
} from '../src/bibliotecas/rh/numero-mecanografico.ts';

test('a sigla sugerida vem do nome comercial, sem forma jurídica', () => {
    assert.equal(sugerirSigla('BRAVALDO - COMERCIO E SERVIÇOS, LDA'), 'BRV');
    assert.equal(sugerirSigla('Digital Norte - Comércio e Prestação de Serviços, (SU), Lda'), 'DNR');
    assert.equal(sugerirSigla('Banco Angolano de Investimentos, SA'), 'BAI');
    assert.equal(sugerirSigla(''), 'EMP');
    assert.equal(sugerirSigla(null), 'EMP');
    assert.equal(sugerirSigla('Ana'), 'ANA');
});

test('a sigla escrita é normalizada e validada', () => {
    assert.equal(normalizarSigla(' brv-ç '), 'BRVC');
    assert.equal(validarSigla('BRV'), null);
    assert.ok(validarSigla('B'));
    assert.ok(validarSigla('ABCDEF'));
});

test('o número tem 4 algarismos, a sigla e mais 4 algarismos', () => {
    const valores = [4821, 937];
    assert.equal(gerarNumeroComSigla('BRV', () => valores.shift()!), '4821-BRV-0937');
    for (let i = 0; i < 200; i += 1) assert.ok(eNumeroComSigla(gerarNumeroComSigla('BRV')));
    assert.equal(eNumeroComSigla('0001'), false);
});

test('o gerador salta números que já existem na base', async () => {
    const existentes = new Set(['0001-BRV-0002']);
    const sequencia = [1, 2, 1, 2, 3, 4];
    const consultados: string[] = [];
    const numero = await gerarNumeroUnico('BRV', async n => { consultados.push(n); return existentes.has(n); }, () => sequencia.shift()!);
    assert.deepEqual(consultados, ['0001-BRV-0002', '0001-BRV-0002', '0003-BRV-0004']);
    assert.equal(numero, '0003-BRV-0004');
});

test('desiste com uma mensagem clara se não encontrar número livre', async () => {
    await assert.rejects(gerarNumeroUnico('BRV', async () => true, () => 1, 3), /n\.º mecanográfico livre/u);
});
