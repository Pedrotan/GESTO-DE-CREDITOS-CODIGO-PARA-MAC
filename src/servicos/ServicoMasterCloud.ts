import { secureCloudUrl } from '@/servicos/ServicoLigacaoNuvem';

// Pedidos do Tango Master à API de administração do servidor (/api/tenants), com o mesmo servidor e a mesma
// chave mestra configurados em Empresas. Usado fora desse ecrã (painel inicial, histórico de emissões).

const URL_KEY = 'tango_master_cloud_url';
const SECRET_KEY = 'tango_master_cloud_secret';
const DEFAULT_URL = 'https://tangogestaoecreditos.tech';

type TenantsReply = { response: Response; data: any };

// Sessões abertas por servidor e chave: a chave mestra só viaja para abrir a sessão (o servidor limita essas
// tentativas a 10/min); os restantes pedidos usam o token da sessão, com limite largo. Só em memória.
const sessions = new Map<string, { token: string; expiresAt: number }>();

const postTenants = async (base: string, headers: Record<string, string>, body: Record<string, unknown>, timeoutMs: number): Promise<TenantsReply> => {
    const response = await fetch(`${base}/api/tenants`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
    });
    return { response, data: await response.json().catch(() => ({})) };
};

/**
 * Pedido à API de administração (/api/tenants) com sessão. Devolve a resposta tal como veio, para cada ecrã
 * tratar os erros à sua maneira. Servidores ainda sem sessões recebem a chave em cada pedido, como antes.
 */
export const masterTenantsRequest = async (baseUrl: string, secret: string, body: Record<string, unknown>, timeoutMs = 20_000): Promise<TenantsReply> => {
    const base = secureCloudUrl(baseUrl); // Nunca a chave mestra por HTTP sem cifra.
    const key = `${base}\u0000${secret}`;
    // No corpo a chave segue em UTF-8; o cabeçalho só aceita texto latin1 (sem acentos especiais).
    const secretHeaders: Record<string, string> = /^[\x20-\x7e]*$/.test(secret) ? { Authorization: `Bearer ${secret}` } : {};
    const withSecret = () => postTenants(base, secretHeaders, { ...body, masterSecret: secret }, timeoutMs);

    for (let attempt = 0; attempt < 2; attempt++) {
        let session = sessions.get(key);
        if (!session || session.expiresAt <= Date.now()) {
            const opened = await postTenants(base, secretHeaders, { action: 'session', masterSecret: secret }, timeoutMs);
            if (opened.response.ok && opened.data.success && opened.data.sessionToken) {
                session = { token: String(opened.data.sessionToken), expiresAt: (Date.parse(opened.data.sessionExpiresAt) || Date.now() + 3_600_000) - 60_000 };
                sessions.set(key, session);
            } else if (opened.response.status === 400 || (opened.response.ok && opened.data.success)) {
                return withSecret(); // Servidor antigo, sem sessões.
            } else {
                return opened; // Chave errada, bloqueio ou servidor indisponível.
            }
        }
        const reply = await postTenants(base, { 'x-master-session': session.token }, body, timeoutMs);
        if (reply.response.status === 401 && reply.data.code === 'SESSION_INVALID' && attempt === 0) {
            sessions.delete(key); // Expirou ou a chave do servidor mudou: abre uma sessão nova uma vez.
            continue;
        }
        return reply;
    }
    return withSecret();
};

export const masterCloudApi = async (action: string, payload: Record<string, unknown> = {}) => {
    const base = ((localStorage.getItem(URL_KEY) || DEFAULT_URL).trim() || DEFAULT_URL).replace(/\/+$/, '');
    const secret = (localStorage.getItem(SECRET_KEY) || '').trim();
    if (!secret) throw new Error('Configure a Chave Mestra em Empresas para ligar o Master ao servidor.');
    const { response, data } = await masterTenantsRequest(base, secret, { action, ...payload });
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
