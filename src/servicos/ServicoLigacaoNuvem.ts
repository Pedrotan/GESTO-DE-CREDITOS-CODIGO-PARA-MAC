// Ligação da app de computador à empresa na nuvem (versão web), identificada pelo NIF.
// O NIF localiza a empresa; o Código de Acesso atribuído pelo Tango Master prova que este computador
// pertence a ela (o NIF é público, por isso não basta para ler ou escrever dados da empresa).

export const VERCEL_CLOUD_URL = 'https://tango-gestao-creditos.vercel.app';
/** Endereço antigo (HTTP directo, sem cifra). Só serve para reconhecer configurações antigas: nunca é usado. */
export const VPS_IP_URL = 'http://191.215.45.104:3000';
export const VPS_DOMAIN_URL = 'https://tangogestaoecreditos.tech';

const LEGACY_VPS_HOSTS = new Set(['191.215.45.104', 'tangogestaoecreditos.tech', 'www.tangogestaoecreditos.tech']);
const isLocalNetworkHost = (host: string) =>
    /^(localhost|127\.\d+\.\d+\.\d+|\[::1\]|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$/i.test(host) ||
    /\.(local|localhost|test|lan)$/i.test(host);

/**
 * Servidores na Internet só por HTTPS: códigos de acesso e chaves nunca viajam sem cifra. O IP e o domínio da
 * VPS passam para o domínio oficial em HTTPS; servidores da rede local (modo servidor da empresa) ficam como estão.
 */
export const secureCloudUrl = (url: string): string => {
    const value = String(url || '').trim().replace(/\/+$/, '');
    let parsed: URL;
    try { parsed = new URL(value); } catch { return value; }
    if (parsed.protocol !== 'http:' || isLocalNetworkHost(parsed.hostname)) return value;
    if (LEGACY_VPS_HOSTS.has(parsed.hostname.toLowerCase())) return `${VPS_DOMAIN_URL}${parsed.pathname.replace(/\/+$/, '')}`;
    parsed.protocol = 'https:';
    if (parsed.port === '80') parsed.port = '';
    return parsed.toString().replace(/\/+$/, '');
};

export const getCloudBaseUrl = (): string => {
    if (typeof localStorage !== 'undefined') {
        const custom = (localStorage.getItem('tango_cloud_url') || localStorage.getItem('tango_master_cloud_url') || localStorage.getItem('tango_dev_cloud_url') || '').trim();
        if (custom.startsWith('http')) {
            if (!custom.includes('vercel.app')) {
                return secureCloudUrl(custom);
            }
        }
    }

    const env: Partial<ImportMetaEnv> = import.meta.env || {}; // Fora do Vite (testes em Node) não há import.meta.env.
    const envUrl = (env.VITE_TANGO_MASTER_URL || env.VITE_CLOUD_URL || '') as string;
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
    const current = getCloudBaseUrl();
    const list = [current];
    // Só servidores HTTPS: as alternativas em HTTP (IP directo) enviavam o Código de Acesso sem cifra.
    const known = [
        VPS_DOMAIN_URL,
        VERCEL_CLOUD_URL
    ];
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
            // Resposta definitiva do servidor (ex.: código errado, empresa não registada): não perguntar aos
            // servidores seguintes, que têm outra base de dados e dariam outra resposta. Só falhas de rede ou
            // erros do servidor (5xx) passam ao seguinte.
            if (response.status < 500) return lastResult;
        } catch {
            // Tenta o próximo servidor
        }
    }
    return lastResult;
};

export const cloudCompanyStatusFrom = (raw: unknown): CloudCompanyStatus | null => {
    switch (String(raw || '').trim().toUpperCase()) {
        case 'ACTIVE': return 'active';
        case 'BLOCKED': case 'SUSPENDED': return 'blocked';
        case 'EXPIRED': return 'expired';
        case 'NOT_FOUND': case 'NOT_REGISTERED': case 'PENDING': return 'not_registered';
        default: return null;
    }
};

/** Estado da empresa na nuvem, ou null se o servidor não respondeu. */
export const fetchCloudCompanyStatus = async (nif: string): Promise<{ status: CloudCompanyStatus; companyName?: string } | null> => {
    const clean = cleanCompanyNif(nif);
    if (clean.length < 9) return null;
    try {
        // O servidor responde ACTIVE / NOT_FOUND / PENDING (200) ou BLOCKED / EXPIRED (403).
        const { data } = await postCloud('/api/company-status', { nif: clean });
        const status = cloudCompanyStatusFrom(data?.status);
        if (!status) return null;
        return { status, companyName: data.companyName || data.company?.name };
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
