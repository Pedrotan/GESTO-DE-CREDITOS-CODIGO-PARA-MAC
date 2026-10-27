import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bucketOf, differingContentBuckets, differingIdBuckets, INTEGRITY_BUCKETS, rowContentHash, tableDigest } from '../src/bibliotecas/integridade-sync.ts';

const clientes = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `c-${i}`, name: `Cliente ${i}`, phone: `92300${i}` }));

test('resumo igual em dispositivos e versões diferentes (ordem das colunas, campos vazios, números)', () => {
    assert.equal(rowContentHash({ id: 'a', name: 'X', value: 10 }), rowContentHash({ value: 10.0, name: 'X', id: 'a', novaColuna: null, outra: '' }));
    assert.notEqual(rowContentHash({ id: 'a', name: 'X' }), rowContentHash({ id: 'a', name: 'Y' }));
    const a = tableDigest(clientes(40));
    const b = tableDigest([...clientes(40)].reverse());
    assert.deepEqual(a, b, 'a ordem dos registos não conta');
    assert.equal(a.count, 40);
    assert.equal(a.buckets.length, INTEGRITY_BUCKETS);
    assert.ok(bucketOf('c-1') >= 0 && bucketOf('c-1') < INTEGRITY_BUCKETS);
});

test('registo em falta: só o grupo dele difere; conteúdo diferente com os mesmos IDs é assinalado à parte', () => {
    const todos = clientes(40);
    const referencia = tableDigest(todos);
    const semUm = tableDigest(todos.filter(row => row.id !== 'c-7'));
    assert.deepEqual(differingIdBuckets(semUm, referencia), [bucketOf('c-7')]);
    assert.deepEqual(differingContentBuckets(semUm, referencia), []);
    const alterado = tableDigest(todos.map(row => (row.id === 'c-3' ? { ...row, phone: '000' } : row)));
    assert.deepEqual(differingIdBuckets(alterado, referencia), []);
    assert.deepEqual(differingContentBuckets(alterado, referencia), [bucketOf('c-3')]);
    assert.equal(differingIdBuckets(undefined, referencia).length, INTEGRITY_BUCKETS, 'tabela que falta toda');
});
