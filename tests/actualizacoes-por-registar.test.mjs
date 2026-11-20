// Uma versão copiada para a VPS sem registo não avisa nenhum computador: o Tango Master tem de a mostrar.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { listUnregisteredVersions } from '../vercel-api/_actualizacoes.js';

const FEED = version => `version: ${version}
files:
  - url: TangoGestaoCreditos_Setup.exe
    sha512: ${'A'.repeat(86)}==
    size: 10
path: TangoGestaoCreditos_Setup.exe
sha512: ${'A'.repeat(86)}==
releaseDate: '2026-11-09T13:39:10.466Z'
`;

const withFolder = (run) => {
    const dir = mkdtempSync(path.join(tmpdir(), 'por-registar-'));
    const add = (name, feed = FEED(name), file = 'latest.yml') => {
        mkdirSync(path.join(dir, name), { recursive: true });
        if (feed !== null) writeFileSync(path.join(dir, name, file), feed);
    };
    try { run(dir, add); } finally { rmSync(dir, { recursive: true, force: true }); }
};

test('mostra as versões copiadas e por registar, da mais recente para a mais antiga', () => withFolder((dir, add) => {
    add('3.0.4'); add('3.0.10'); add('3.0.5');
    assert.deepEqual(listUnregisteredVersions(['3.0.4'], dir), ['3.0.10', '3.0.5']);
}));

test('uma versão já registada deixa de aparecer', () => withFolder((dir, add) => {
    add('3.0.5');
    assert.deepEqual(listUnregisteredVersions(['3.0.5'], dir), []);
}));

test('ignora pastas sem feed, com feed de outra versão, com feed inválido ou com nome inválido', () => withFolder((dir, add) => {
    add('3.0.6', null);
    add('3.0.7', FEED('3.0.8'));
    add('3.0.9', 'isto não é um feed');
    add('temporario');
    assert.deepEqual(listUnregisteredVersions([], dir), []);
}));

test('aceita o feed do Mac e não falha quando a pasta não existe', () => withFolder((dir, add) => {
    add('3.1.0', FEED('3.1.0'), 'latest-mac.yml');
    assert.deepEqual(listUnregisteredVersions([], dir), ['3.1.0']);
    assert.deepEqual(listUnregisteredVersions([], path.join(dir, 'nao-existe')), []);
}));
