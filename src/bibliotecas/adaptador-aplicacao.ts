// Platform Adapter to abstract Electron API vs Web Browser capabilities
import { isLanLicenseServer } from './payload-licenca';

export interface NetworkInfo {
    ip: string;
    ips: string[];
    hostname: string;
    isPrivate: boolean;
}

export interface AppAdapter {
    isElectron: boolean;
    getNetworkInfo: () => Promise<NetworkInfo>;
    fetchServerConfig: (url: string, passkey?: string) => Promise<any>;
    getIpAddress: () => Promise<string>;
    stopServer?: () => Promise<void>;
    startServer?: (passkey?: string) => Promise<any>;
    setSharedConfig?: (config: any) => Promise<void>;
    onDbUpdate: (callback: () => void) => () => void;
    activateLicense: (url: string, licenseKey: string, machineId: string) => Promise<{ success: boolean; message: string; code?: string }>;
}

const electronAPI = (window as any).electronAPI;

export const appAdapter: AppAdapter = {
    isElectron: !!electronAPI,

    getNetworkInfo: async () => {
        if (electronAPI?.getNetworkInfo) {
            return await electronAPI.getNetworkInfo();
        }
        // Web Fallback
        return {
            ip: window.location.hostname,
            ips: [window.location.hostname],
            hostname: 'Web Client',
            isPrivate: true
        };
    },

    getIpAddress: async () => {
        if (electronAPI?.getIpAddress) {
            return await electronAPI.getIpAddress();
        }
        return window.location.hostname; // Web: URL Host
    },

    fetchServerConfig: async (url: string, passkey?: string) => {
        if (electronAPI?.fetchServerConfig) {
            return await electronAPI.fetchServerConfig({ url, passkey });
        }
        // Web Native Fetch logic (Cross-Origin might block if not configured on server, but same-origin is fine)
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);

            const info = await appAdapter.getNetworkInfo();
            const clientName = info.hostname || 'Navegador';

            const response = await fetch(url, {
                headers: {
                    'x-sync-passkey': passkey || '',
                    'x-client-name': clientName
                },
                signal: controller.signal
            }).finally(() => clearTimeout(timeoutId));

            const data = await response.json();
            return {
                success: response.ok,
                status: response.status,
                data,
                message: response.ok ? null : (data.message || `Erro (${response.status})`)
            };
        } catch (e: any) {
            return {
                success: false,
                message: e.name === 'AbortError' ? 'Tempo esgotado.' : e.message
            };
        }
    },

    // Server commands are Electron-only
    startServer: electronAPI?.startServer,
    stopServer: electronAPI?.stopServer,
    setSharedConfig: electronAPI?.setSharedConfig,

    onDbUpdate: (callback: () => void) => {
        if (electronAPI?.onDbUpdate) {
            electronAPI.onDbUpdate(callback);
            return () => {
                // Electron IPC listeners are usually managed globally or via specific cleanup if provided
                // For simplicity here, we assume the preload handle takes care of it or it's a permanent listener
            };
        }

        // Web / Remote Implementation using Server-Sent Events (SSE)
        const getBaseUrl = () => {
            const stored = localStorage.getItem('remote_sync_url');
            if (stored) return stored;

            // Auto-discovery: If we are a Web Client running on a non-localhost IP, assume the server is the origin
            if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
                return window.location.origin;
            }
            return null;
        };

        const rawUrl = getBaseUrl();
        if (!rawUrl) return () => { };

        let baseUrl = rawUrl.replace(/\/$/, '');
        if (baseUrl.endsWith('/sync')) {
            baseUrl = baseUrl.substring(0, baseUrl.length - 5);
        }

        const eventsUrl = `${baseUrl}/events`;
        console.log('[AppAdapter] Connecting to SSE:', eventsUrl);
        const eventSource = new EventSource(eventsUrl);

        eventSource.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.type === 'db-update') {
                    callback();
                }
            } catch (e) {
                console.error('[AppAdapter] SSE parse error:', e);
            }
        };
        return () => {
            console.log('[AppAdapter] Closing SSE connection');
            eventSource.close();
        };
    },

    activateLicense: async (url: string, licenseKey: string, machineId: string) => {
        // O controlo de uso único só existe no servidor Master da rede local (http). A nuvem (https) não tem
        // este endpoint: a licença já é validada pela assinatura do Tango Master.
        if (!isLanLicenseServer(url)) return { success: true, message: 'Sem servidor local de licenças.' };
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000);

            // Normalizar URL
            let baseUrl = url.replace(/\/$/, '');
            if (baseUrl.endsWith('/sync')) {
                baseUrl = baseUrl.substring(0, baseUrl.length - 5);
            }

            const activateUrl = `${baseUrl}/api/license/activate`;

            const response = await fetch(activateUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ licenseKey, machineId }),
                signal: controller.signal
            }).finally(() => clearTimeout(timeoutId));

            const data = await response.json();
            return {
                success: response.ok,
                message: data.message || (response.ok ? 'Sucesso' : 'Erro'),
                code: data.code
            };
        } catch (e: any) {
            console.error('[AppAdapter] License activation error:', e);
            return {
                success: false,
                message: e.name === 'AbortError'
                    ? 'O servidor Master demorou muito a responder.'
                    : 'Não foi possível ligar ao Master para validar o uso único da licença.'
            };
        }
    }
};




