import { useEffect, useState } from 'react';
import { pingRemoteServer } from '@/bibliotecas/adaptador-bd-remoto';
import { CLOUD_LICENSE_EVENT } from '@/bibliotecas/licenca-nuvem-cliente';
import { licenseAllowsFeature, validateLicense, type LicenseInfo } from '@/bibliotecas/licenciamento';

// Estado real das ligações mostrado no cabeçalho. O "navigator.onLine" só diz se a placa de rede está ligada
// (o Wi-Fi pode estar ligado sem Internet), por isso faz-se um pedido leve de 20 em 20 segundos.

export const NETWORK_CHECK_INTERVAL_MS = 20_000;

export type InternetState = 'online' | 'offline' | 'checking';

/** Um pedido leve que só tem resposta com Internet. Qualquer resposta HTTP conta como ligado. */
export async function checkInternetNow(): Promise<boolean> {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
    const api = typeof window !== 'undefined' ? (window as any).electronAPI : null;
    // Desktop: o processo principal faz o pedido (não depende da política de conteúdos da janela).
    if (api?.netCheck) {
        try { return Boolean(await api.netCheck()); } catch { return false; }
    }
    try {
        await fetch(`/api/health?t=${Date.now()}`, { method: 'GET', cache: 'no-store', signal: AbortSignal.timeout(6_000) });
        return true;
    } catch {
        return false;
    }
}

export function useInternetStatus(): InternetState {
    const [state, setState] = useState<InternetState>(() => (typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'checking'));
    useEffect(() => {
        let cancelled = false;
        let running = false;
        const check = async () => {
            if (running) return;
            running = true;
            const ok = await checkInternetNow();
            running = false;
            if (!cancelled) setState(ok ? 'online' : 'offline');
        };
        const goOffline = () => setState('offline');
        void check();
        const timer = setInterval(check, NETWORK_CHECK_INTERVAL_MS);
        window.addEventListener('online', check);
        window.addEventListener('offline', goOffline);
        window.addEventListener('focus', check);
        return () => {
            cancelled = true;
            clearInterval(timer);
            window.removeEventListener('online', check);
            window.removeEventListener('offline', goOffline);
            window.removeEventListener('focus', check);
        };
    }, []);
    return state;
}

/** Licença em vigor, actualizada quando a licença da nuvem muda. */
export function useLicenseInfo(licenseKey: string | null | undefined): LicenseInfo | null {
    const [entry, setEntry] = useState<{ key: string; info: LicenseInfo } | null>(null);
    useEffect(() => {
        let cancelled = false;
        const load = () => {
            setEntry(null);
            void validateLicense(licenseKey || '').then(value => { if (!cancelled) setEntry({ key: licenseKey || '', info: value }); }).catch(() => undefined);
        };
        load();
        window.addEventListener(CLOUD_LICENSE_EVENT, load);
        return () => { cancelled = true; window.removeEventListener(CLOUD_LICENSE_EVENT, load); };
    }, [licenseKey]);
    return entry?.key === (licenseKey || '') ? entry.info : null;
}

export const licenseAllowsIntranet = (info: LicenseInfo | null) => licenseAllowsFeature(info, 'intranet');

/** Posto cliente: consegue chegar ao servidor da rede local? (verificado de 20 em 20 segundos) */
export function useIntranetClientStatus(enabled: boolean): 'connected' | 'disconnected' | 'checking' {
    const [state, setState] = useState<'connected' | 'disconnected' | 'checking'>('checking');
    useEffect(() => {
        if (!enabled) return;
        let cancelled = false;
        const check = async () => {
            const ok = await pingRemoteServer();
            if (!cancelled) setState(ok ? 'connected' : 'disconnected');
        };
        void check();
        const timer = setInterval(check, NETWORK_CHECK_INTERVAL_MS);
        return () => { cancelled = true; clearInterval(timer); };
    }, [enabled]);
    return state;
}
