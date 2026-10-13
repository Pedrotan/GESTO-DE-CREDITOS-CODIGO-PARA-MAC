// Pedidos do Tango Master à API de administração do servidor (/api/tenants), com o mesmo servidor e a mesma
// chave mestra configurados em Empresas. Usado fora desse ecrã (painel inicial, histórico de emissões).

const URL_KEY = 'tango_master_cloud_url';
const SECRET_KEY = 'tango_master_cloud_secret';
const DEFAULT_URL = 'https://tangogestaoecreditos.tech';

export const masterCloudApi = async (action: string, payload: Record<string, unknown> = {}) => {
    const base = ((localStorage.getItem(URL_KEY) || DEFAULT_URL).trim() || DEFAULT_URL).replace(/\/+$/, '');
    const secret = (localStorage.getItem(SECRET_KEY) || '').trim();
    if (!secret) throw new Error('Configure a Chave Mestra em Empresas para ligar o Master ao servidor.');
    const headerSafe = /^[\x20-\x7e]*$/.test(secret);
    const response = await fetch(`${base}/api/tenants`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(headerSafe ? { Authorization: `Bearer ${secret}` } : {}) },
        body: JSON.stringify({ action, ...payload, masterSecret: secret }),
        signal: AbortSignal.timeout(20_000),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.success) throw new Error(data.message || `Erro do servidor (${response.status}).`);
    return data;
};

export type ServerLicenseSummary = {
    tenantId: string;
    companyName: string;
    status: 'ativa' | 'suspensa' | 'expirada' | 'revogada';
    endsAt: string | null;
    daysRemaining: number | null;
    machines: number;
    maxMachines: number;
    planName: string;
};

export type LegacyKeyServerStatus = { jti: string; state: 'mantida' | 'revogada'; tenantId: string };
