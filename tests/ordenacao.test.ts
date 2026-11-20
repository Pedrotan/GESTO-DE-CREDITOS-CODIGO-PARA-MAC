import { test } from 'node:test';
import assert from 'node:assert/strict';
import { instante, maisRecentePrimeiro } from '../src/bibliotecas/ordenacao.ts';

test('listagens: o registo mais recente primeiro; sem data fica no fim; empates mantêm a ordem', () => {
    const clientes = [
        { nome: 'Isaac', createdAt: '2026-10-19T15:49:24.532Z' },
        { nome: 'Sem data', createdAt: null },
        { nome: 'Sukeina', createdAt: new Date('2026-10-27T09:37:28.124Z') },
        { nome: 'Daniel', createdAt: '2026-10-20' },
        { nome: 'Gémeo A', createdAt: '2026-10-21T10:00:00.000Z' },
        { nome: 'Gémeo B', createdAt: '2026-10-21T10:00:00.000Z' },
    ];
    assert.deepEqual(maisRecentePrimeiro(clientes, c => c.createdAt).map(c => c.nome), ['Sukeina', 'Gémeo A', 'Gémeo B', 'Daniel', 'Isaac', 'Sem data']);
    assert.equal(clientes[0].nome, 'Isaac', 'a lista original não muda');
    assert.equal(instante('não é data'), -Infinity);
});
