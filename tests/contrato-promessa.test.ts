import assert from 'node:assert/strict';
import test from 'node:test';
import { inteiroPorExtenso, kwanzasPorExtenso } from '../src/bibliotecas/extenso.ts';
import { companyCity, companyShortName, promessaPlaceholderValues } from '../src/bibliotecas/contrato-promessa.ts';

test('valores por extenso em português', () => {
    assert.equal(inteiroPorExtenso(200000), 'duzentos mil');
    assert.equal(inteiroPorExtenso(208000), 'duzentos e oito mil');
    assert.equal(inteiroPorExtenso(20800), 'vinte mil e oitocentos');
    assert.equal(inteiroPorExtenso(1001), 'mil e um');
    assert.equal(inteiroPorExtenso(1150), 'mil cento e cinquenta');
    assert.equal(inteiroPorExtenso(1250300), 'um milhão duzentos e cinquenta mil e trezentos');
    assert.equal(kwanzasPorExtenso(8000), 'oito mil kwanzas');
    assert.equal(kwanzasPorExtenso(2000000), 'dois milhões de kwanzas');
    assert.equal(kwanzasPorExtenso(1.5), 'um kwanza e cinquenta cêntimos');
});

test('contrato-promessa: campos calculados a partir do crédito (FLAT) e da empresa', () => {
    const values = promessaPlaceholderValues(
        { principalAmount: 200000, interestRate: 4, installments: 10, startDate: '2026-07-24T10:00:00Z', lateInterestRate: 1, clientMaritalStatus: 'Solteiro(a)' },
        { name: 'BRAVALDO – Prestação de Serviços e Microcrédito, Lda.', location: 'Benguela - Angola', currency: 'AOA' },
    );
    assert.equal(values['{{EMPRESA_CURTO}}'], 'BRAVALDO');
    assert.equal(values['{{CIDADE_EMPRESA}}'], 'Benguela');
    assert.equal(values['{{VALOR_EXTENSO}}'], 'duzentos mil kwanzas');
    assert.equal(values['{{JUROS_EXTENSO}}'], 'oito mil kwanzas');
    assert.equal(values['{{TOTAL_EXTENSO}}'], 'duzentos e oito mil kwanzas');
    assert.equal(values['{{PRESTACAO_EXTENSO}}'], 'vinte mil e oitocentos kwanzas');
    assert.equal(values['{{PRAZO_MESES}}'], '10');
    assert.equal(values['{{TAXA_MENSAL}}'], '0,4%');
    assert.equal(values['{{PRIMEIRA_PRESTACAO}}'], '24/08/2026');
    assert.equal(values['{{DATA_FIM_PLANO}}'], '24/05/2027');
    assert.equal(values['{{ESTADO_CIVIL}}'], 'Solteiro(a)');
    assert.equal(values['{{EMAIL_CLIENTE}}'], '________________');
});

test('cidade e nome curto da empresa', () => {
    assert.equal(companyCity({ location: 'Angola', address: 'Cuanza Norte, N´dalatando' }), 'Cuanza Norte');
    assert.equal(companyCity({}), 'Luanda');
    assert.equal(companyShortName('DIGITAL NORTE - COMÉRCIO E PRESTAÇÃO DE SERVIÇOS, (SU), LDA'), 'DIGITAL NORTE');
});
