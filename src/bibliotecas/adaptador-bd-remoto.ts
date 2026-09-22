import { appAdapter } from './adaptador-aplicacao';
import { getScopedLocalStorageItem, removeScopedLocalStorageItem, scopedStorageKey, setScopedLocalStorageItem } from './contas';

// A02: Obfuscação Base64 para evitar exposição casual da passkey no DevTools
const obfuscate = (value: string): string => {
    if (!value) return '';
    try { return btoa(unescape(encodeURIComponent(value))); } catch { return value; }
};
const deobfuscate = (value: string): string => {
    if (!value) return '';
    try { return decodeURIComponent(escape(atob(value))); } catch { return value; }
};

const PASSKEY_STORAGE_KEY = 'sync_pk_v2'; // Nova chave para migrar dados antigos

// Initialize from LocalStorage or default to current origin (for Web Client auto-discovery)
const getInitialUrl = () => {
    if (typeof window === 'undefined') return '';
    const stored = getScopedLocalStorageItem('sync_url');
    if (stored) return stored;

    // Auto-discovery: If we are a Web Client running on a non-localhost IP, assume the server is the origin
    if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
        const origin = window.location.origin;
        // Default to port 3000 if served from standard web port (80/443), otherwise respect current port
        return origin;
    }
    return '';
};

// A02: Migrar passkey antiga (plaintext) para formato obfuscado
const getStoredPasskey = (): string => {
    if (typeof window === 'undefined') return '';
    // Tentar ler da nova chave obfuscada
    const obfuscated = localStorage.getItem(scopedStorageKey(PASSKEY_STORAGE_KEY));
    if (obfuscated) return deobfuscate(obfuscated);
    // Migrar da chave antiga (plaintext)
    const legacy = getScopedLocalStorageItem('sync_passkey') || localStorage.getItem('sync_passkey');
    if (legacy) {
        localStorage.setItem(scopedStorageKey(PASSKEY_STORAGE_KEY), obfuscate(legacy));
        removeScopedLocalStorageItem('sync_passkey');
        localStorage.removeItem('sync_passkey'); // Limpar a versão plaintext
        return legacy;
    }
    return '';
};

let remoteSyncUrl = getInitialUrl();
let remoteSyncPasskey = getStoredPasskey();

export function setRemoteSqlConfig(url: string, passkey: string) {
    remoteSyncUrl = url;
    remoteSyncPasskey = passkey;
    if (typeof window !== 'undefined') {
        setScopedLocalStorageItem('sync_url', url);
        localStorage.setItem(scopedStorageKey(PASSKEY_STORAGE_KEY), obfuscate(passkey));
        // Garantir que a chave antiga não permanece
        removeScopedLocalStorageItem('sync_passkey');
        localStorage.removeItem('sync_passkey');
    }
}

async function executeRemoteSql(sql: string, params: any[] = [], method: 'all' | 'get' | 'run' | 'exec' = 'all') {
    if (!remoteSyncUrl) {
        // Tentar recuperar novamente caso tenha sido setado entretanto
        remoteSyncUrl = getInitialUrl();
    }

    if (!remoteSyncUrl) {
        console.warn(`[RemoteDB] Tentativa de execução SQL sem configuração: ${sql}`);
        // Retornar nulo em vez de lançar erro para evitar crashes na UI durante estados transitórios
        return method === 'all' ? [] : null;
    }

    // Clean URL to avoid double slashes, but preserve protocol
    // Clean URL: Strip /sync suffix and trailing slashes to get the root base URL
    let baseUrl = remoteSyncUrl.replace(/\/$/, ''); // Remove trailing slash
    if (baseUrl.endsWith('/sync')) {
        baseUrl = baseUrl.substring(0, baseUrl.length - 5); // Remove /sync
    }
    const url = `${baseUrl}/api/sql`;

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-sync-passkey': remoteSyncPasskey,
                'x-client-name': typeof window !== 'undefined' ? (window.location.hostname || 'Web Client') : 'Slave Device'
            },
            body: JSON.stringify({ sql, params, method }),
            signal: AbortSignal.timeout(10000)
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || `Erro do servidor: ${response.status}`);
        }

        const data = await response.json();
        return data.result;
    } catch (e: any) {
        console.error('[RemoteDB Error]:', e);
        throw e;
    }
}

export const remoteSql = {
    get: async <T>(sql: string, params: any[] = []): Promise<T | null> => {
        return executeRemoteSql(sql, params, 'get');
    },
    all: async <T>(sql: string, params: any[] = []): Promise<T[]> => {
        return executeRemoteSql(sql, params, 'all');
    },
    run: async (sql: string, params: any[] = []): Promise<any> => {
        return executeRemoteSql(sql, params, 'run');
    },
    exec: async (sql: string): Promise<any> => {
        return executeRemoteSql(sql, [], 'exec');
    },
    init: async () => {
        // Para adaptador remoto, a inicialização é implícita no fetch,
        // mas precisamos deste método para compatibilidade com o db.init()
        return { success: true };
    }
};




