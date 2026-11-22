// Sessão do utilizador no servidor (versão web). Em cada login o servidor valida a senha e entrega:
//   - access token (JWT, 15 min): só em memória nesta página, nunca em localStorage/sessionStorage;
//   - refresh token: num cookie HttpOnly que o JavaScript não lê, trocado em cada renovação;
//   - token CSRF: guardado na sessão do separador e enviado em cada renovação ou fim de sessão.
// No computador os tokens ficam no processo principal (ver electron/sessao-nuvem.ts); aqui só se pede o estado.
import { webCloudSyncConfig } from '@/servicos/ServicoSincronizacaoCloud';
import { registarCabecalhoSessao, SERVER_PASSWORD_PLACEHOLDER, SERVER_SESSION_STARTED_EVENT } from '@/bibliotecas/sessao-utilizador-cabecalho';

export { SERVER_PASSWORD_PLACEHOLDER, SERVER_SESSION_STARTED_EVENT };

export const SERVER_SESSION_ENDED_EVENT = 'tango-server-session-ended';
const CSRF_KEY = 'tango_server_csrf';
const SESSION_ID_KEY = 'tango_server_session_id';
const REFRESH_MARGIN_MS = 60_000;
const REQUEST_TIMEOUT_MS = 15_000;
// Respostas que significam «a sessão acabou no servidor»: a página volta ao login.
const ENDED_CODES = new Set(['SESSION_REVOKED', 'REFRESH_REUSED', 'SESSION_EXPIRED', 'SESSION_INVALID']);

export type ServerUser = { id: string; name: string | null; email: string | null; username: string | null; role: string; permissions: string[]; isOwner: number };

export type ServerLoginOutcome =
    | { state: 'ok'; user: ServerUser; sessionId: string }
    | { state: 'invalid' }
    | { state: 'refused'; message: string }
    /** O servidor não pode validar (empresa sem utilizadores enviados, versão antiga, sem ligação): login anterior. */
    | { state: 'unavailable'; reason: string };

type Tokens = { accessToken: string; accessTokenExpiresAt: string; csrfToken?: string | null; sessionId: string; user: ServerUser };

let accessToken: string | null = null;
// Resultado do último login no servidor (o ecrã de login decide se ainda faz sentido o login anterior).
let lastLoginState: ServerLoginOutcome['state'] | null = null;
export const ultimoLoginServidor = () => lastLoginState;
let accessExpiresAt = 0;
let refreshTimer: ReturnType<typeof setTimeout> | null = null;
let refreshing: Promise<boolean> | null = null;

const storage = () => { try { return typeof sessionStorage === 'undefined' ? null : sessionStorage; } catch { return null; } };
const isDesktop = () => typeof window !== 'undefined' && Boolean((window as any).electronAPI);

const target = () => {
    const config = webCloudSyncConfig();
    if (!config) return null;
    return { url: config.url.replace(/\/+$/u, ''), tenantId: config.tenantId, headers: config.sessionAuth ? {} : { 'x-sync-passkey': config.apiKey } as Record<string, string> };
};

const post = async (url: string, body: Record<string, unknown>, headers: Record<string, string> = {}) => {
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        credentials: 'same-origin',
        cache: 'no-store',
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const data = await response.json().catch(() => ({}));
    return { ok: response.ok && data?.success === true, status: response.status, data };
};

const clearLocal = () => {
    accessToken = null;
    accessExpiresAt = 0;
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = null;
    storage()?.removeItem(CSRF_KEY);
    storage()?.removeItem(SESSION_ID_KEY);
};

const keep = (tokens: Tokens) => {
    const started = !accessToken;
    accessToken = tokens.accessToken;
    accessExpiresAt = Date.parse(tokens.accessTokenExpiresAt) || Date.now() + 14 * 60_000;
    if (tokens.csrfToken) storage()?.setItem(CSRF_KEY, tokens.csrfToken);
    storage()?.setItem(SESSION_ID_KEY, tokens.sessionId);
    if (refreshTimer) clearTimeout(refreshTimer);
    // Renovar antes de caducar: é também assim que uma revogação no servidor chega a este separador.
    refreshTimer = setTimeout(() => { void renovarSessaoServidor(); }, Math.max(5_000, accessExpiresAt - Date.now() - REFRESH_MARGIN_MS));
    if (started && typeof window !== 'undefined') window.dispatchEvent(new Event(SERVER_SESSION_STARTED_EVENT));
};

const ended = (code: string, message?: string) => {
    clearLocal();
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(SERVER_SESSION_ENDED_EVENT, { detail: { code, message } }));
};

/** Login no servidor (versão web). Nunca lança: sem ligação devolve `unavailable`. */
export const iniciarSessaoServidor = async (login: string, password: string, deviceId?: string): Promise<ServerLoginOutcome> => {
    const outcome = await loginNoServidor(login, password, deviceId);
    lastLoginState = outcome.state;
    return outcome;
};

const loginNoServidor = async (login: string, password: string, deviceId?: string): Promise<ServerLoginOutcome> => {
    if (isDesktop()) return { state: 'unavailable', reason: 'desktop' };
    const company = target();
    if (!company) return { state: 'unavailable', reason: 'no_company' };
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return { state: 'unavailable', reason: 'offline' };
    clearLocal();
    try {
        const reply = await post(`${company.url}/api/v1/auth/login`, { tenantId: company.tenantId, login, password, deviceId: deviceId || null, client: 'web' }, company.headers);
        if (reply.ok && reply.data?.accessToken) {
            keep(reply.data as Tokens);
            return { state: 'ok', user: reply.data.user as ServerUser, sessionId: String(reply.data.sessionId) };
        }
        const code = String(reply.data?.code || '');
        if (code === 'INVALID_CREDENTIALS') return { state: 'invalid' };
        if (code === 'LOGIN_LOCKED' || code === 'ACCOUNT_DISABLED') return { state: 'refused', message: String(reply.data?.message || 'Acesso recusado.') };
        return { state: 'unavailable', reason: code || `HTTP_${reply.status}` };
    } catch (error: any) {
        return { state: 'unavailable', reason: error?.name === 'TimeoutError' ? 'timeout' : 'network' };
    }
};

/** Troca o refresh token (cookie) por um conjunto novo. false quando não há sessão no servidor. */
export const renovarSessaoServidor = async (): Promise<boolean> => {
    if (isDesktop()) return false;
    if (refreshing) return refreshing;
    const csrf = storage()?.getItem(CSRF_KEY);
    const company = target();
    if (!csrf || !company) return false;
    refreshing = (async () => {
        for (let attempt = 0; attempt < 3; attempt++) {
            let reply;
            try {
                reply = await post(`${company.url}/api/v1/auth/refresh`, {}, { 'x-csrf-token': csrf });
            } catch {
                // Sem ligação: tenta de novo daqui a um minuto (a página continua com o que tem).
                if (refreshTimer) clearTimeout(refreshTimer);
                refreshTimer = setTimeout(() => { void renovarSessaoServidor(); }, 60_000);
                return false;
            }
            if (reply.ok && reply.data?.accessToken) { keep(reply.data as Tokens); return true; }
            // Outro separador renovou ao mesmo tempo: o cookie já tem o refresh novo, basta repetir.
            if (reply.status === 409) { await new Promise(resolve => setTimeout(resolve, 400 * (attempt + 1))); continue; }
            const code = String(reply.data?.code || '');
            if (ENDED_CODES.has(code) || code === 'CSRF_INVALID') { ended(code, reply.data?.message); return false; }
            if (refreshTimer) clearTimeout(refreshTimer);
            refreshTimer = setTimeout(() => { void renovarSessaoServidor(); }, 60_000);
            return false;
        }
        return false;
    })().finally(() => { refreshing = null; });
    return refreshing;
};

/** Recarregar a página apaga o access token da memória: recupera-o com o refresh token (cookie). */
export const retomarSessaoServidor = async (): Promise<'resumed' | 'none' | 'ended'> => {
    if (isDesktop() || !storage()?.getItem(CSRF_KEY)) return 'none';
    let endedNow = false;
    const onEnd = () => { endedNow = true; };
    window.addEventListener(SERVER_SESSION_ENDED_EVENT, onEnd, { once: true });
    const ok = await renovarSessaoServidor();
    window.removeEventListener(SERVER_SESSION_ENDED_EVENT, onEnd);
    return ok ? 'resumed' : endedNow ? 'ended' : 'none';
};

export const temSessaoServidor = () => (isDesktop() ? false : Boolean(storage()?.getItem(CSRF_KEY)));

/** Access token válido para pedidos ao servidor (renovado se estiver a caducar); null sem sessão. */
export const tokenAcessoServidor = async (): Promise<string | null> => {
    if (isDesktop() || !temSessaoServidor()) return null;
    if (!accessToken || accessExpiresAt - Date.now() < REFRESH_MARGIN_MS) await renovarSessaoServidor();
    return accessToken;
};

/** Cabeçalho de autenticação do utilizador para as rotas da empresa (vazio sem sessão no servidor ou no computador). */
export const cabecalhoSessaoUtilizador = async (): Promise<Record<string, string>> => {
    const token = await tokenAcessoServidor();
    return token ? { Authorization: `Bearer ${token}` } : {};
};

registarCabecalhoSessao(cabecalhoSessaoUtilizador);

/** Fim de sessão no servidor (revoga o refresh token e apaga o cookie). Não lança. */
export const terminarSessaoServidor = async () => {
    if (isDesktop()) return;
    const csrf = storage()?.getItem(CSRF_KEY);
    const company = target();
    const token = accessToken;
    clearLocal();
    if (!company || (!csrf && !token)) return;
    await post(`${company.url}/api/v1/auth/logout`, {}, {
        ...(csrf ? { 'x-csrf-token': csrf } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}),
    }).catch(() => undefined);
};

type SessionsOp = { op: 'list' | 'revoke' | 'revoke-user' | 'revoke-others'; userId?: string; sessionId?: string; all?: boolean };

/** Sessões abertas no servidor e fim de sessões, no computador (processo principal) ou na web. */
export const pedidoSessoesServidor = async (input: SessionsOp): Promise<{ success: boolean; revoked?: number; message?: string; code?: string; sessions?: unknown[]; currentSessionId?: string }> => {
    const api = (window as any).electronAPI;
    if (api?.userAuthCloudSessions) return api.userAuthCloudSessions(input);
    const token = await tokenAcessoServidor();
    const company = target();
    if (!token || !company) return { success: false, code: 'NO_CLOUD_SESSION', message: 'Sem sessão no servidor.' };
    try {
        const reply = await post(`${company.url}/api/v1/auth/sessions`, input, { Authorization: `Bearer ${token}` });
        return { success: reply.ok, ...reply.data };
    } catch {
        return { success: false, code: 'NETWORK', message: 'Não foi possível contactar o servidor.' };
    }
};

/** Termina no servidor todas as sessões de um utilizador (computadores e navegadores). */
export const revogarSessoesUtilizador = (userId: string) => pedidoSessoesServidor({ op: 'revoke-user', userId });
