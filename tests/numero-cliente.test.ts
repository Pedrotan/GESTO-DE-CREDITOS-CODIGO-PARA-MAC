import { test } from 'node:test';
import assert from 'node:assert/strict';
import { atribuirNumerosEmFalta, NUMERO_CLIENTE, prefixoCliente, proximoNumeroCliente } from '../src/bibliotecas/numero-cliente.ts';

test('o prefixo é 00 + ano com 2 algarismos + mês do cadastro, no fuso de Angola', () => {
    assert.equal(prefixoCliente('2026-11-07T10:00:00Z'), '002611');
    // 23:30 de 31/12/2025 em UTC já é 1 de Janeiro de 2026 em Luanda.
    assert.equal(prefixoCliente('2025-12-31T23:30:00Z'), '002601');
    assert.equal(prefixoCliente(null, new Date('2026-03-02T12:00:00Z')), '002603');
});

test('o número tem 8 algarismos, segue a sequência do mês e nunca reutiliza um apagado', () => {
    assert.equal(proximoNumeroCliente('002611', []), '00261101');
    assert.equal(proximoNumeroCliente('002611', ['00261101', '00261105', '00261003']), '00261106');
    assert.ok(NUMERO_CLIENTE.test('00261199'));
    assert.equal(NUMERO_CLIENTE.test('0026110'), false);
    assert.throws(() => proximoNumeroCliente('002611', ['00261199']), /99 números/u);
});

test('clientes antigos recebem números pela ordem de cadastro, depois dos já atribuídos', () => {
    const { atribuidos, semEspaco } = atribuirNumerosEmFalta([
        { id: 'b', createdAt: '2026-11-05T10:00:00Z' },
        { id: 'a', createdAt: '2026-11-02T10:00:00Z' },
        { id: 'c', createdAt: '2026-10-20T10:00:00Z', clientNumber: '00261001' },
        { id: 'd', createdAt: '2026-10-21T10:00:00Z' },
        { id: 'e', createdAt: '2026-11-05T10:00:00Z' },
    ]);
    assert.deepEqual(atribuidos, [
        { id: 'd', numero: '00261002' }, { id: 'a', numero: '00261101' }, { id: 'b', numero: '00261102' }, { id: 'e', numero: '00261103' },
    ]);
    assert.deepEqual(semEspaco, []);
    const cheios = Array.from({ length: 100 }, (_, i) => ({ id: `x${String(i).padStart(3, '0')}`, createdAt: '2026-11-01T10:00:00Z' }));
    const r = atribuirNumerosEmFalta(cheios);
    assert.equal(r.atribuidos.length, 99);
    assert.deepEqual(r.semEspaco, ['x099']);
});
