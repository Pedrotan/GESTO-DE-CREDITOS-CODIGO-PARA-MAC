import { lazy, type ComponentType } from 'react';

// Depois de um novo deploy, os ficheiros das páginas mudam de nome. Um separador aberto com a versão
// antiga pede um ficheiro que já não existe: em vez de mostrar o erro, recarrega uma vez para obter a
// versão nova. O intervalo mínimo entre recargas evita um ciclo se o servidor estiver mesmo em baixo.

const RELOAD_KEY = 'tango_chunk_reload_at';
const MIN_RELOAD_INTERVAL_MS = 30_000;

export const isChunkLoadError = (error: unknown) =>
    /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Loading chunk [\w-]+ failed|Unable to preload CSS/i
        .test(String((error as { message?: string })?.message ?? error ?? ''));

/** Recarrega a página para obter a versão nova; devolve false se já recarregou há pouco. */
export const reloadForNewVersion = () => {
    try {
        const last = Number(sessionStorage.getItem(RELOAD_KEY) || 0);
        if (Date.now() - last < MIN_RELOAD_INTERVAL_MS) return false;
        sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
    } catch {
        // Sem sessionStorage não há como evitar um ciclo: não recarrega.
        return false;
    }
    window.location.reload();
    return true;
};

/** React.lazy que, perante um ficheiro de uma versão antiga, recarrega a aplicação em vez de falhar. */
export function lazyWithReload<T extends ComponentType<any>>(factory: () => Promise<{ default: T }>) {
    return lazy(() => factory().catch((error: unknown) => {
        if (isChunkLoadError(error) && reloadForNewVersion()) {
            // A página vai recarregar: mantém o Suspense à espera em vez de mostrar o erro.
            return new Promise<{ default: T }>(() => undefined);
        }
        throw error;
    }));
}
