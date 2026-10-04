// Ligação da app de computador à empresa na nuvem (versão web), identificada pelo NIF.
// O NIF localiza a empresa; o Código de Acesso atribuído pelo Tango Master prova que este computador
// pertence a ela (o NIF é público, por isso não basta para ler ou escrever dados da empresa).

const PRODUCTION_CLOUD_URL = 'https://tango-gestao-creditos.vercel.app';
// Só em desenvolvimento: permite apontar para um servidor de testes local (localStorage "tango_dev_cloud_url").
const devCloudUrl = () => {
    if (!import.meta.env.DEV || typeof localStorage === 'undefined') return '';
    return (localStorage.getItem('tango_dev_cloud_url') || '').trim().replace(/\/+$/, '');
};
export const getCloudBaseUrl = () => devCloudUrl() || PRODUCTION_CLOUD_URL;

export type CloudCompanyStatus = 'active' | 'not_registered' | 'blocked' | 'expired';

export type CloudCompanyLink = {
    tenantId: string;
    companyName: string;
    syncPasskey: string;
};

export const cleanCompanyNif = (nif?: string | null) => String(nif || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();

const postCloud = async (path: string, body: Record<string, unknown>) => {
    const response = await fetch(`${getCloudBaseUrl()}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
    });
    const data = await response.json().catch(() => ({}));
    return { ok: response.ok && data.success !== false, data };
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
