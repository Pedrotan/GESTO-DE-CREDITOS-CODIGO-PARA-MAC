/**
 * Cofre dos segredos de sincronização (Código de Acesso da empresa e passkey de sincronização).
 *
 * Os segredos nunca ficam em texto claro no localStorage: são cifrados com AES-GCM por uma chave do
 * dispositivo NÃO exportável, guardada no IndexedDB (nem o próprio código da página consegue ler os bytes
 * dessa chave). Em claro só existem em memória enquanto a página está aberta.
 *
 * Versão web ligada à empresa na mesma origem (pentest A-02): o Código de Acesso nem chega a ficar aqui. O
 * servidor abre uma sessão num cookie HttpOnly (ilegível para o JavaScript) e o cofre guarda apenas as chaves de
 * cifra da sincronização, derivadas do código, como CryptoKey NÃO exportáveis. Um script malicioso que corresse
 * na página poderia, no máximo, usá-las enquanto a página está aberta, mas nunca levar o código consigo.
 *
 * Os segredos em texto (computador, servidor na rede local, ligação a outro servidor) ficam cifrados como acima.
 * Sem WebCrypto ou IndexedDB (rede local em HTTP), ficam só no sessionStorage e são repostos a partir das
 * definições da empresa ao entrar.
 */

export const SEGREDO_CODIGO_EMPRESA = 'tango_active_tenant_code';
export const SEGREDO_CHAVE_SINCRONIZACAO = 'tango_active_tenant_sync_key';
/** Passkey da sincronização por conta local (o nome completo inclui o id da conta). */
export const segredoPasskeyConta = (accountId: string) => `sync_passkey:${accountId}`;

const PREFIXO = 'tango_cofre:';
const FORMATO = 'v1';
const BD_NOME = 'tango-cofre';
const BD_LOJA = 'chaves';
const ID_CHAVE = 'dispositivo';

const ID_SINCRONIZACAO = 'sincronizacao-web';

/** Chaves de cifra da sincronização da versão web: a de envio e as de leitura (outras formas do código). */
export type ChavesSincronizacao = { tenantId: string; write: CryptoKey; read: CryptoKey[] };

const cache = new Map<string, string>();
let chavesSincronizacao: ChavesSincronizacao | null = null;
let chaveDispositivo: CryptoKey | null = null;
let modoSessao = false;
let inicializacao: Promise<void> | null = null;

const temJanela = () => typeof window !== 'undefined' && typeof localStorage !== 'undefined';

const bytesParaBase64 = (bytes: Uint8Array) => {
    let texto = '';
    for (let i = 0; i < bytes.length; i += 0x8000) texto += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(texto);
};
const base64ParaBytes = (valor: string) => Uint8Array.from(atob(valor), caractere => caractere.charCodeAt(0));

const pedidoIdb = <T>(pedido: IDBRequest<T>) => new Promise<T>((resolve, reject) => {
    pedido.onsuccess = () => resolve(pedido.result);
    pedido.onerror = () => reject(pedido.error);
});

const abrirBd = () => new Promise<IDBDatabase>((resolve, reject) => {
    const pedido = indexedDB.open(BD_NOME, 1);
    pedido.onupgradeneeded = () => pedido.result.createObjectStore(BD_LOJA);
    pedido.onsuccess = () => resolve(pedido.result);
    pedido.onerror = () => reject(pedido.error);
});

const obterChaveDispositivo = async (): Promise<CryptoKey> => {
    const bd = await abrirBd();
    try {
        const existente = await pedidoIdb(bd.transaction(BD_LOJA, 'readonly').objectStore(BD_LOJA).get(ID_CHAVE));
        if (existente instanceof CryptoKey) return existente;
        const nova = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
        await pedidoIdb(bd.transaction(BD_LOJA, 'readwrite').objectStore(BD_LOJA).put(nova, ID_CHAVE));
        return nova;
    } finally {
        bd.close();
    }
};

const cifrar = async (texto: string) => {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const cifrado = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, chaveDispositivo!, new TextEncoder().encode(texto)));
    return `${FORMATO}.${bytesParaBase64(iv)}.${bytesParaBase64(cifrado)}`;
};

const decifrar = async (guardado: string) => {
    const [formato, iv, cifrado] = guardado.split('.');
    if (formato !== FORMATO || !iv || !cifrado) return null;
    try {
        const claro = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: base64ParaBytes(iv) }, chaveDispositivo!, base64ParaBytes(cifrado));
        return new TextDecoder().decode(claro);
    } catch {
        return null; // Chave do dispositivo diferente (perfil copiado ou IndexedDB apagado): o segredo perde-se.
    }
};

const persistir = async (nome: string, valor: string) => {
    if (modoSessao) {
        sessionStorage.setItem(PREFIXO + nome, valor);
        return;
    }
    const guardado = await cifrar(valor);
    // Entretanto o segredo pode ter sido apagado ou substituído: só grava se continuar a ser o actual.
    if (cache.get(nome) === valor) localStorage.setItem(PREFIXO + nome, guardado);
};

/** Versões anteriores guardavam os segredos em claro (ou só em Base64): passam para o cofre e são apagados. */
const migrarSegredosAntigos = async () => {
    const pendentes: Array<Promise<void>> = [];
    const migrar = (chaveAntiga: string, nome: string, transformar = (valor: string) => valor) => {
        const valor = localStorage.getItem(chaveAntiga);
        if (valor === null) return;
        localStorage.removeItem(chaveAntiga);
        let claro = '';
        try { claro = transformar(valor); } catch { claro = ''; }
        if (claro && !cache.has(nome)) {
            cache.set(nome, claro);
            pendentes.push(persistir(nome, claro));
        }
    };
    migrar(SEGREDO_CODIGO_EMPRESA, SEGREDO_CODIGO_EMPRESA);
    migrar(SEGREDO_CHAVE_SINCRONIZACAO, SEGREDO_CHAVE_SINCRONIZACAO);
    for (const chave of Object.keys(localStorage)) {
        if (chave.startsWith('sync_pk_v2:')) {
            migrar(chave, segredoPasskeyConta(chave.slice('sync_pk_v2:'.length)), valor => decodeURIComponent(escape(atob(valor))));
        } else if (chave.startsWith('sync_passkey:')) {
            migrar(chave, chave);
        } else if (chave.startsWith('cached_company_settings:')) {
            // A cópia das definições usada no arranque não deve levar segredos.
            try {
                const definicoes = JSON.parse(localStorage.getItem(chave) || '{}');
                if (definicoes && typeof definicoes === 'object' && Object.keys(definicoes).some(campo => CAMPOS_SECRETOS.test(campo))) {
                    localStorage.setItem(chave, JSON.stringify(semSegredos(definicoes)));
                }
            } catch { /* cópia inválida: fica como está */ }
        }
    }
    localStorage.removeItem('sync_passkey');
    localStorage.removeItem('sync_pk_v2');
    await Promise.all(pendentes);
};

const ouvirOutrosSeparadores = () => {
    window.addEventListener('storage', event => {
        if (!event.key?.startsWith(PREFIXO) || event.storageArea !== localStorage) return;
        const nome = event.key.slice(PREFIXO.length);
        if (event.newValue === null) {
            cache.delete(nome);
            return;
        }
        void decifrar(event.newValue).then(claro => { if (claro !== null) cache.set(nome, claro); });
    });
};

/**
 * Abre o cofre: tem de terminar antes de a aplicação ler qualquer segredo (é chamado em main.tsx antes da
 * primeira renderização). Pode ser chamado várias vezes.
 */
export const iniciarCofre = (): Promise<void> => {
    if (inicializacao) return inicializacao;
    inicializacao = (async () => {
        if (!temJanela()) return;
        try {
            if (!window.isSecureContext || !crypto?.subtle || typeof indexedDB === 'undefined') throw new Error('sem WebCrypto');
            chaveDispositivo = await obterChaveDispositivo();
            chavesSincronizacao = await lerChavesGuardadas();
            for (const chave of Object.keys(localStorage)) {
                if (!chave.startsWith(PREFIXO)) continue;
                const claro = await decifrar(localStorage.getItem(chave) || '');
                if (claro === null) localStorage.removeItem(chave);
                else cache.set(chave.slice(PREFIXO.length), claro);
            }
        } catch (error) {
            console.warn('[Cofre] Sem armazenamento cifrado neste navegador; os segredos ficam só nesta sessão.', error);
            modoSessao = true;
            chaveDispositivo = null;
            for (const chave of Object.keys(sessionStorage)) {
                if (chave.startsWith(PREFIXO)) cache.set(chave.slice(PREFIXO.length), sessionStorage.getItem(chave) || '');
            }
        }
        await migrarSegredosAntigos();
        if (!modoSessao) ouvirOutrosSeparadores();
    })();
    return inicializacao;
};

/** Lê um segredo (síncrono, a partir da memória). Antes de `iniciarCofre` terminar devolve null. */
export const lerSegredo = (nome: string): string | null => cache.get(nome) ?? null;

/** Guarda um segredo. Aguarde a promessa antes de recarregar a página, para não o perder. */
export const guardarSegredo = async (nome: string, valor: string | null | undefined): Promise<void> => {
    if (!valor) {
        apagarSegredo(nome);
        return;
    }
    cache.set(nome, valor);
    if (!temJanela()) return;
    await iniciarCofre();
    try {
        await persistir(nome, valor);
    } catch (error) {
        console.warn('[Cofre] Não foi possível guardar o segredo de forma persistente:', error);
    }
};

/** Apaga um segredo da memória e do armazenamento (síncrono). */
export const apagarSegredo = (nome: string) => {
    cache.delete(nome);
    if (!temJanela()) return;
    try {
        localStorage.removeItem(PREFIXO + nome);
        sessionStorage.removeItem(PREFIXO + nome);
    } catch { /* armazenamento indisponível */ }
};

const mesmaEmpresa = (a: string, b: string) =>
    a.replace(/[^a-z0-9]/giu, '').toUpperCase() === b.replace(/[^a-z0-9]/giu, '').toUpperCase();

const lerChavesGuardadas = async (): Promise<ChavesSincronizacao | null> => {
    const bd = await abrirBd();
    try {
        const valor = await pedidoIdb(bd.transaction(BD_LOJA, 'readonly').objectStore(BD_LOJA).get(ID_SINCRONIZACAO));
        const valido = valor && typeof valor.tenantId === 'string' && valor.write instanceof CryptoKey &&
            Array.isArray(valor.read) && valor.read.every((chave: unknown) => chave instanceof CryptoKey);
        return valido ? valor as ChavesSincronizacao : null;
    } finally {
        bd.close();
    }
};

/** Chaves da sincronização web da empresa indicada (ou da que estiver ligada); null se não houver. */
export const lerChavesSincronizacao = (tenantId?: string | null): ChavesSincronizacao | null =>
    chavesSincronizacao && (!tenantId || mesmaEmpresa(chavesSincronizacao.tenantId, tenantId)) ? chavesSincronizacao : null;

/** Guarda as chaves (não exportáveis) da sincronização web. Aguarde antes de recarregar a página. */
export const guardarChavesSincronizacao = async (chaves: ChavesSincronizacao) => {
    if (chaves.write.extractable || chaves.read.some(chave => chave.extractable)) throw new Error('As chaves de sincronização têm de ser não exportáveis.');
    chavesSincronizacao = chaves;
    await iniciarCofre();
    if (modoSessao) return;
    const bd = await abrirBd();
    try {
        await pedidoIdb(bd.transaction(BD_LOJA, 'readwrite').objectStore(BD_LOJA).put(chaves, ID_SINCRONIZACAO));
    } finally {
        bd.close();
    }
};

export const apagarChavesSincronizacao = async () => {
    chavesSincronizacao = null;
    if (!temJanela() || modoSessao || typeof indexedDB === 'undefined') return;
    try {
        const bd = await abrirBd();
        try { await pedidoIdb(bd.transaction(BD_LOJA, 'readwrite').objectStore(BD_LOJA).delete(ID_SINCRONIZACAO)); }
        finally { bd.close(); }
    } catch (error) {
        console.warn('[Cofre] Não foi possível apagar as chaves de sincronização:', error);
    }
};

/** Campos das definições da empresa que são segredos e nunca entram em cópias guardadas no navegador. */
export const CAMPOS_SECRETOS = /password|rescueKey|passkey|apiKey|licenseKey|secret/i;

export const semSegredos = <T extends Record<string, unknown>>(definicoes: T): T =>
    Object.fromEntries(Object.entries(definicoes).filter(([campo]) => !CAMPOS_SECRETOS.test(campo))) as T;
