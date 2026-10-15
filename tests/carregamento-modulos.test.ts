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

// O __vitePreload do Vite 7 faz `baseModule().catch(handlePreloadError)`: se alguém cancelar o evento
// vite:preloadError, o import() resolve com undefined e o React.lazy lia `.default` de undefined.
test('um import() que resolve sem módulo conta como ficheiro em falta e não chega ao React.lazy', async () => {
    const { importWithReload, isReloadPending } = await import('../src/bibliotecas/carregamento-modulos.ts');
    const store = new Map<string, string>();
    let reloads = 0;
    (globalThis as any).sessionStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) };
    (globalThis as any).window = { location: { reload: () => { reloads += 1; } } };
    try {
        // Já recarregou há pouco: em vez do TypeError, mostra um erro de ficheiro em falta reconhecível.
        store.set('tango_chunk_reload_at', String(Date.now()));
        await assert.rejects(importWithReload(async () => undefined as any), (error: Error) => isChunkLoadError(error) && !/reading 'default'/.test(error.message));
        assert.equal(reloads, 0);

        // Módulo normal passa sem mexer em nada.
        const Page = () => null;
        assert.equal((await importWithReload(async () => ({ default: Page }))).default, Page);

        // Ainda não recarregou: recarrega uma vez e fica à espera (não resolve, não rejeita).
        store.clear();
        const pending = importWithReload(async () => undefined as any);
        const outcome = await Promise.race([pending.then(() => 'resolveu', () => 'rejeitou'), new Promise(r => setTimeout(() => r('à espera'), 20))]);
        assert.equal(outcome, 'à espera');
        assert.equal(reloads, 1);
        assert.equal(isReloadPending(), true);

        // Outras páginas que falhem enquanto a recarga decorre também esperam, sem segunda recarga.
        const other = importWithReload(() => Promise.reject(new TypeError('Failed to fetch dynamically imported module: /assets/Clientes-x.js')));
        const otherOutcome = await Promise.race([other.then(() => 'resolveu', () => 'rejeitou'), new Promise(r => setTimeout(() => r('à espera'), 20))]);
        assert.equal(otherOutcome, 'à espera');
        assert.equal(reloads, 1);
    } finally {
        delete (globalThis as any).sessionStorage;
        delete (globalThis as any).window;
    }
});
