import { appAdapter } from './adaptador-aplicacao';
import { getActiveAccountIdFromStorage, getScopedLocalStorageItem, setScopedLocalStorageItem } from './contas';
import { guardarSegredo, lerSegredo, segredoPasskeyConta } from './cofre-segredos';

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

// Pentest A-02: a passkey vive no cofre cifrado (cofre-segredos.ts), nunca em texto claro no localStorage.
const getStoredPasskey = (): string => lerSegredo(segredoPasskeyConta(getActiveAccountIdFromStorage())) || '';

let remoteSyncUrl = getInitialUrl();
let remoteSyncPasskey = '';

export function setRemoteSqlConfig(url: string, passkey: string) {
    remoteSyncUrl = url;
    remoteSyncPasskey = passkey;
    if (typeof window !== 'undefined') {
        setScopedLocalStorageItem('sync_url', url);
        void guardarSegredo(segredoPasskeyConta(getActiveAccountIdFromStorage()), passkey);
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
                'x-sync-passkey': remoteSyncPasskey || getStoredPasskey(),
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

/** Endereço do servidor da rede local a que este posto está ligado (vazio se não houver). */
export const remoteServerAddress = () => {
    const url = remoteSyncUrl || getInitialUrl();
    return url ? url.replace(/\/$/, '').replace(/\/sync$/, '') : '';
};

/**
 * O servidor da rede local responde? Qualquer resposta HTTP conta (o servidor está lá); só a falta de resposta
 * (rede desligada, servidor parado) conta como desligado. Usa a chave do posto, para não parecer um ataque.
 */
export async function pingRemoteServer(): Promise<boolean> {
    const base = remoteServerAddress();
    if (!base) return false;
    try {
        await fetch(`${base}/api/sql`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-sync-passkey': remoteSyncPasskey || getStoredPasskey() },
            body: JSON.stringify({ sql: 'SELECT 1 AS ok', params: [], method: 'get' }),
            signal: AbortSignal.timeout(5_000),
        });
        return true;
    } catch {
        return false;
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




