import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isChunkLoadError } from '../src/bibliotecas/carregamento-modulos.ts';

test('reconhece os erros de ficheiros de uma versão anterior (depois de um deploy)', () => {
    assert.equal(isChunkLoadError(new TypeError('Failed to fetch dynamically imported module: https://tango-gestao-creditos.vercel.app/assets/Sessoes-C1a3Ec1l.js')), true);
    assert.equal(isChunkLoadError(new TypeError('Importing a module script failed.')), true);
    assert.equal(isChunkLoadError('error loading dynamically imported module'), true);
    assert.equal(isChunkLoadError(new Error('Loading chunk 42 failed.')), true);
    assert.equal(isChunkLoadError(new Error('Cannot read properties of undefined')), false);
    assert.equal(isChunkLoadError(null), false);
});
