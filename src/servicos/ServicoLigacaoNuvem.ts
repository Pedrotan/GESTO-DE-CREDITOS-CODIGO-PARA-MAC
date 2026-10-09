// Ligação da app de computador à empresa na nuvem (versão web), identificada pelo NIF.
// O NIF localiza a empresa; o Código de Acesso atribuído pelo Tango Master prova que este computador
// pertence a ela (o NIF é público, por isso não basta para ler ou escrever dados da empresa).

export const VERCEL_CLOUD_URL = 'https://tango-gestao-creditos.vercel.app';
export const VPS_IP_URL = 'http://191.215.45.104:3000';
export const VPS_DOMAIN_URL = 'https://tangogestaoecreditos.tech';

export const getCloudBaseUrl = (): string => {
    if (typeof localStorage !== 'undefined') {
        const custom = (localStorage.getItem('tango_cloud_url') || localStorage.getItem('tango_master_cloud_url') || localStorage.getItem('tango_dev_cloud_url') || '').trim();
        if (custom.startsWith('http')) {
            if (!custom.includes('vercel.app')) {
                return custom.replace(/\/+$/, '');
            }
        }
    }

    const envUrl = (import.meta.env.VITE_TANGO_MASTER_URL || import.meta.env.VITE_CLOUD_URL || '') as string;
    if (envUrl && envUrl.trim().startsWith('http')) {
        return envUrl.trim().replace(/\/+$/, '');
    }

    // Se estiver a correr num navegador web (e não em Electron file://), apontar para a própria origem
    if (typeof window !== 'undefined' && window.location?.origin && window.location.origin.startsWith('http')) {
        return window.location.origin.replace(/\/+$/, '');
    }

    return VPS_DOMAIN_URL;
};

/** Lista de todos os servidores centrais autorizados para consulta em cascata */
export const getKnownCloudServers = (): string[] => {
    const isHttps = typeof window !== 'undefined' && window.location?.protocol === 'https:';
    const current = getCloudBaseUrl();
    const list = [current];
    const known = [
        VPS_DOMAIN_URL,
        VERCEL_CLOUD_URL
    ];
    // Evitar URLs http:// se estiver sob https:// para prevenir Mixed Content e bloqueio CSP
    if (!isHttps) {
        known.push(VPS_IP_URL);
        known.push('http://tangogestaoecreditos.tech');
    }
    for (const url of known) {
        if (!list.includes(url)) list.push(url);
    }
    return list;
};

export type CloudCompanyStatus = 'active' | 'not_registered' | 'blocked' | 'expired';

export type CloudCompanyLink = {
    tenantId: string;
    companyName: string;
    syncPasskey: string;
};

export const cleanCompanyNif = (nif?: string | null) => String(nif || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();

const postCloud = async (path: string, body: Record<string, unknown>) => {
    const servers = getKnownCloudServers();
    let lastResult = { ok: false, data: {} as any };
    for (const base of servers) {
        try {
            const response = await fetch(`${base}${path}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
                signal: AbortSignal.timeout(10_000),
            });
            const data = await response.json().catch(() => ({}));
            if (response.ok && data.success !== false) {
                return { ok: true, data };
            }
            lastResult = { ok: false, data };
        } catch {
            // Tenta o próximo servidor
        }
    }
    return lastResult;
};

/** Estado da empresa na nuvem, ou null se o servidor não respondeu. */
export const fetchCloudCompanyStatus = async (nif: string): Promise<{ status: CloudCompanyStatus; companyName?: string } | null> => {
    const clean = cleanCompanyNif(nif);
    if (clean.length < 9) return null;
    try {
        const { ok, data } = await postCloud('/api/company-status', { nif: clean });
        if (!ok || !data.status) return null;
        return { status: data.status, companyName: data.companyName };
    } catch {
        return null;
    }
};

/** Confirma o Código de Acesso da empresa e devolve os dados para sincronizar. */
export const verifyCloudCompany = async (nif: string, accessCode: string): Promise<CloudCompanyLink> => {
    const code = accessCode.trim().toUpperCase();
    if (code.length < 4) throw new Error('Introduza o Código de Acesso da empresa.');
    let result;
    try {
        result = await postCloud('/api/verify-company', { nif: cleanCompanyNif(nif), accessCode: code });
    } catch (error: any) {
        throw new Error(error?.name === 'TimeoutError'
            ? 'O servidor demorou muito a responder. Verifique a ligação à Internet.'
            : 'Não foi possível comunicar com o servidor. Verifique a ligação à Internet.');
    }
    if (!result.ok) throw new Error(result.data.message || 'Código de Acesso inválido para esta empresa.');
    return {
        tenantId: String(result.data.tenantId || cleanCompanyNif(nif)),
        companyName: String(result.data.companyName || ''),
        syncPasskey: String(result.data.syncPasskey || code),
    };
};
