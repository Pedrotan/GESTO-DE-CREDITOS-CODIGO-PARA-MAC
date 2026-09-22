import { sqlite } from './adaptador-sqlite';
import type { SqlTransactionStatement } from './adaptador-sqlite';
import { remoteSql } from './adaptador-bd-remoto';
import { RepositorioAuditoria } from '@/repositorios/RepositorioAuditoria';
import { getScopedLocalStorageItem } from './contas';
import { enqueueSyncOperation, enqueueSyncTransaction, isCloudSyncUrl } from '@/servicos/ServicoSincronizacaoCloud';

// Detetar se estamos em Electron ou Web Browser
const isElectron = !!(window as any).electronAPI;

export const setDbAdapterMode = (mode: 'local' | 'remote') => {
    if (mode === 'remote' && isCloudSyncUrl(getScopedLocalStorageItem('sync_url'))) {
        state.adapter = sqlite;
        console.log('[DB] Sincronização cloud ativa em modo local-first.');
        return;
    }
    // @ts-ignore
    state.adapter = mode === 'local' ? sqlite : remoteSql;
    console.log(`[DB] Adaptador alterado para: ${mode.toUpperCase()}`);
};

// Inicialização inteligente do adaptador
const getInitialAdapter = () => {
    // Se o electronAPI já existir, usamos local por padrão (standalone)
    const hasElectron = !!(window as any).electronAPI;

    const syncEnabled = getScopedLocalStorageItem('sync_enabled') === 'true';
    const syncUrl = getScopedLocalStorageItem('sync_url');
    const isMaster = getScopedLocalStorageItem('is_master') === 'true';

    if (!isMaster && syncUrl && syncUrl.trim() !== '' && !isCloudSyncUrl(syncUrl)) {
        console.log('[DB] Modo Cliente detectado (IP configurado) - usando adaptador remoto');
        return remoteSql;
    }

    return sqlite;
};

// Use an object to hold the current adapter to allow dynamic switching if needed
let state = {
    adapter: getInitialAdapter()
};

export interface DBResult {
    lastInsertRowid?: number | string;
    changes?: number;
}

export const db = {
    query: async <T>(query: string, params?: any[]): Promise<T[]> => {
        return await (state.adapter as any).all(query, params) as T[];
    },
    get: async <T>(query: string, params?: any[]): Promise<T | undefined> => {
        return await (state.adapter as any).get(query, params) as T | undefined;
    },
    run: async (query: string, params?: any[]): Promise<DBResult> => {
        const result = await (state.adapter as any).run(query, params) as DBResult;
        if (state.adapter === sqlite) await enqueueSyncOperation(query, params || []);
        return result;
    },
    transaction: async (statements: SqlTransactionStatement[]): Promise<any[]> => {
        const adapter = state.adapter as any;
        if (adapter.transaction) {
            const result = await adapter.transaction(statements);
            if (adapter === sqlite) await enqueueSyncTransaction(statements);
            return result;
        }

        const results: any[] = [];
        for (const statement of statements) {
            if (statement.type === 'exec') {
                results.push(await adapter.exec(statement.sql));
            } else {
                results.push(await adapter.run(statement.sql, statement.params || []));
            }
        }
        if (adapter === sqlite) await enqueueSyncTransaction(statements);
        return results;
    },
    all: async <T>(query: string, params?: any[]): Promise<T[]> => {
        return await (state.adapter as any).all(query, params) as T[];
    },
    init: async () => {
        try {
            // Re-evaluate adapter on init just in case
            state.adapter = getInitialAdapter();
            const res = await (state.adapter as any).init();

            // Critical schema upgrades at startup
            if (res && (res.success || !res.offline)) {
                await RepositorioAuditoria.ensureSchema();
            }

            return res;
        } catch (e) {
            console.warn("[DB] Falha crítica na inicialização (Modo Offline/Desligado):", e);
            return { success: false, offline: true };
        }
    }
};
