// Separação das listas de clientes: a carteira gravada manda; nos clientes antigos, é deduzida do que ficou guardado.
import test from 'node:test';
import assert from 'node:assert/strict';
import { clientCategoryOf } from '../src/bibliotecas/carteira-cliente.ts';

test('a carteira gravada prevalece sobre qualquer pista', () => {
    assert.equal(clientCategoryOf({ clientCategory: 'COMUM', socialSecurityNumber: '123', nif: 'N1234567' }), 'COMUM');
    assert.equal(clientCategoryOf({ clientCategory: 'ESTRANGEIRO', nif: '000000000LA000' }), 'ESTRANGEIRO');
    assert.equal(clientCategoryOf({ clientCategory: 'APOSENTADO' }), 'APOSENTADO');
});

test('clientes antigos: os dados de reforma indicam aposentado', () => {
    assert.equal(clientCategoryOf({ nif: '000000000LA000', socialSecurityNumber: '12345' }), 'APOSENTADO');
    assert.equal(clientCategoryOf({ nif: '000000000LA000', workInstitution: 'Ministério da Educação' }), 'APOSENTADO');
});

test('a instituição de quem tem sector de actividade é o emprego actual, não a reforma', () => {
    assert.equal(clientCategoryOf({ nif: '000000000LA000', workInstitution: 'Hospital', employmentSector: 'PUBLICO' }), 'COMUM');
});

test('clientes antigos: só o formato de passaporte indica estrangeiro', () => {
    assert.equal(clientCategoryOf({ nif: 'N1234567' }), 'ESTRANGEIRO');
    assert.equal(clientCategoryOf({ nif: 'AB123456' }), 'ESTRANGEIRO');
    assert.equal(clientCategoryOf({ documentType: 'PASSAPORTE', nif: '12345678' }), 'ESTRANGEIRO');
});

test('BI, NIF de empresa e clientes sem documento continuam comuns', () => {
    assert.equal(clientCategoryOf({ nif: '000000000LA000' }), 'COMUM');
    assert.equal(clientCategoryOf({ nif: '5000000000' }), 'COMUM');
    assert.equal(clientCategoryOf({ nif: 'SEM-ABC123' }), 'COMUM');
    assert.equal(clientCategoryOf({ nif: 'SEM IDENTIFICAÇÃO' }), 'COMUM');
    assert.equal(clientCategoryOf({ nif: '' }), 'COMUM');
    assert.equal(clientCategoryOf({}), 'COMUM');
    assert.equal(clientCategoryOf({ clientType: 'EMPRESA', nif: 'AB123456' }), 'COMUM');
});
