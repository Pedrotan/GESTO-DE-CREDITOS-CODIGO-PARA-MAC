import { test } from 'node:test';
import assert from 'node:assert/strict';
import { syncHealth, syncIssues, type SyncCounts } from '../src/bibliotecas/estado-sincronizacao.ts';

const zero: SyncCounts = { pending: 0, oversized: 0, waiting: 0, unreadable: 0, conflicts: 0, otherVersion: 0 };

test('«Sincronizado» só sem nada por enviar, nada retido, nada ilegível e nenhum conflito', () => {
    assert.equal(syncHealth(zero), 'synced');
    assert.deepEqual(syncIssues(zero), []);
});

test('por enviar ou a receber: «A sincronizar», não «Sincronizado»', () => {
    assert.equal(syncHealth({ ...zero, pending: 3 }), 'pending');
    assert.equal(syncHealth({ ...zero, waiting: 2 }), 'pending');
    assert.equal(syncHealth({ ...zero, hasMoreRemote: true }), 'pending');
});

test('conflitos, retidas de outra versão, ilegíveis e grandes demais: «Verificar», com a lista', () => {
    for (const key of ['conflicts', 'otherVersion', 'unreadable', 'oversized'] as const) {
        assert.equal(syncHealth({ ...zero, [key]: 1 }), 'attention', key);
    }
    assert.equal(syncHealth({ ...zero, identityError: 'Identidade visual por sincronizar' }), 'attention');
    const issues = syncIssues({ ...zero, conflicts: 2, otherVersion: 1, unreadable: 4, oversized: 1, pending: 5 });
    assert.deepEqual(issues.map(issue => [issue.kind, issue.count, issue.attention]), [
        ['conflicts', 2, true], ['otherVersion', 1, true], ['unreadable', 4, true], ['oversized', 1, true], ['pending', 5, false],
    ]);
    assert.equal(issues[0].title, '2 conflitos por ver');
    assert.equal(issues[1].title, '1 alteração de outra versão');
});
