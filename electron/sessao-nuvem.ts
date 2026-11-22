// Sessão do utilizador no servidor da empresa (computador). Depois do login local (que continua a funcionar sem
// Internet), o processo principal faz também o login no servidor e recebe o conjunto de tokens: access token
// (15 min), refresh token (trocado em cada uso) e token CSRF. Os tokens ficam só na memória deste processo, nunca
// no renderer nem em disco. Quando o servidor revoga a sessão (administrador, senha mudada, refresh roubado), a
// sessão local também termina.

export type CloudTarget = { url: string; tenantId: string; apiKey: string };

type TokenBundle = {
  accessToken: string; accessTokenExpiresAt: string; refreshToken: string; sessionExpiresAt: string; sessionId: string;
};

type CloudSession = {
  target: CloudTarget;
  userId: string;
  accessToken: string;
  accessExpiresAt: number;
  refreshToken: string;
  sessionId: string;
  sessionExpiresAt: number;
  /** Login com segundo factor ainda por confirmar: os tokens existem mas não são usados. */
  pendingMfa: boolean;
  timer?: ReturnType<typeof setTimeout>;
};

export type CloudSessionStatus = {
  connected: boolean; sessionId?: string; accessTokenExpiresAt?: string; sessionExpiresAt?: string; pendingMfa?: boolean;
};

type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal }) => Promise<{
  ok: boolean; status: number; json: () => Promise<any>;
}>;

const REQUEST_TIMEOUT_MS = 10_000;
// Renova um minuto antes de o access token caducar: assim uma revogação no servidor chega aqui em menos de 15 minutos.
const REFRESH_MARGIN_MS = 60_000;
// Respostas que significam «esta sessão acabou no servidor»: a sessão local também termina.
const REVOKED_CODES = new Set(['SESSION_REVOKED', 'REFRESH_REUSED']);

/** Endereço do servidor da empresa: HTTPS (ou HTTP só no próprio computador, para testes). null quando inválido. */
export const cloudBaseUrl = (raw: unknown): string | null => {
  const value = String(raw || '').trim().replace(/\/+$/u, '').replace(/\/api\/sync$/iu, '').replace(/\/sync$/iu, '');
  let parsed: URL;
  try { parsed = new URL(value); } catch { return null; }
  const local = ['localhost', '127.0.0.1'].includes(parsed.hostname);
  if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && local)) return null;
  if (parsed.username || parsed.password) return null;
  return `${parsed.origin}${parsed.pathname.replace(/\/+$/u, '')}`;
};

/** Empresa ligada à nuvem, a partir das definições guardadas neste computador; null sem ligação. */
export const cloudTargetFromSettings = (row: any): CloudTarget | null => {
  if (!row || !Number(row.syncEnabled)) return null;
  const url = cloudBaseUrl(row.syncUrl);
  const apiKey = String(row.syncApiKey || row.syncPasskey || '').trim();
  const tenantId = String(row.nif || '').trim();
  if (!url || apiKey.length < 8 || !tenantId) return null;
  return { url, tenantId, apiKey };
};

export class CloudSessionStore {
  private sessions = new Map<number, CloudSession>();

  constructor(
    private readonly fetchImpl: FetchLike = (url, init) => fetch(url, init) as any,
    /** Chamado quando o servidor revogou a sessão deste renderer (para terminar também a sessão local). */
    private readonly onRevoked: (senderId: number, code: string) => void = () => undefined,
  ) {}

  private async post(target: CloudTarget, action: string, body: Record<string, unknown>, headers: Record<string, string> = {}) {
    const response = await this.fetchImpl(`${target.url}/api/v1/auth/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const data = await response.json().catch(() => ({}));
    return { ok: response.ok && data?.success === true, status: response.status, data };
  }

  private store(senderId: number, target: CloudTarget, userId: string, tokens: TokenBundle, pendingMfa: boolean) {
    this.clearTimer(senderId);
    const session: CloudSession = {
      target, userId, pendingMfa,
      accessToken: String(tokens.accessToken),
      accessExpiresAt: Date.parse(tokens.accessTokenExpiresAt) || Date.now() + 14 * 60_000,
      refreshToken: String(tokens.refreshToken),
      sessionId: String(tokens.sessionId),
      sessionExpiresAt: Date.parse(tokens.sessionExpiresAt) || Date.now() + 8 * 3_600_000,
    };
    this.sessions.set(senderId, session);
    this.schedule(senderId);
  }

  private clearTimer(senderId: number) {
    const timer = this.sessions.get(senderId)?.timer;
    if (timer) clearTimeout(timer);
  }

  private schedule(senderId: number) {
    const session = this.sessions.get(senderId);
    if (!session) return;
    const delay = Math.max(5_000, session.accessExpiresAt - Date.now() - REFRESH_MARGIN_MS);
    session.timer = setTimeout(() => { void this.refresh(senderId).catch(() => undefined); }, delay);
    (session.timer as any)?.unref?.();
  }

  /**
   * Login no servidor com a senha que acabou de ser confirmada localmente. Nunca lança: sem Internet, servidor
   * antigo ou empresa sem verificadores, o computador continua só com a sessão local.
   */
  async login(senderId: number, target: CloudTarget | null, input: { login: string; password: string; userId: string; deviceId?: string; pendingMfa?: boolean }) {
    if (!target) return { ok: false, code: 'NO_CLOUD' };
    try {
      const reply = await this.post(target, 'login', {
        tenantId: target.tenantId, login: input.login, password: input.password, client: 'desktop', deviceId: input.deviceId || null,
      }, { 'x-sync-passkey': target.apiKey });
      if (!reply.ok || !reply.data?.refreshToken) return { ok: false, code: String(reply.data?.code || `HTTP_${reply.status}`) };
      if (String(reply.data?.user?.id || '') !== input.userId) {
        // O servidor reconheceu outra conta com este login (dados desfasados): não usar estes tokens.
        await this.post(target, 'logout', { refreshToken: reply.data.refreshToken }).catch(() => undefined);
        return { ok: false, code: 'USER_MISMATCH' };
      }
      this.store(senderId, target, input.userId, reply.data, Boolean(input.pendingMfa));
      return { ok: true, sessionId: String(reply.data.sessionId) };
    } catch (error: any) {
      return { ok: false, code: error?.name === 'TimeoutError' ? 'TIMEOUT' : 'NETWORK' };
    }
  }

  /** Segundo factor confirmado localmente: a sessão do servidor passa a valer. */
  confirmMfa(senderId: number, userId: string) {
    const session = this.sessions.get(senderId);
    if (session && session.userId === userId) session.pendingMfa = false;
  }

  status(senderId: number): CloudSessionStatus {
    const session = this.sessions.get(senderId);
    if (!session) return { connected: false };
    return {
      connected: !session.pendingMfa, pendingMfa: session.pendingMfa, sessionId: session.sessionId,
      accessTokenExpiresAt: new Date(session.accessExpiresAt).toISOString(), sessionExpiresAt: new Date(session.sessionExpiresAt).toISOString(),
    };
  }

  /** Troca o refresh token. false quando a sessão do servidor terminou (ou não há sessão). */
  async refresh(senderId: number): Promise<boolean> {
    const session = this.sessions.get(senderId);
    if (!session) return false;
    let reply;
    try {
      reply = await this.post(session.target, 'refresh', { refreshToken: session.refreshToken });
    } catch {
      // Sem ligação: tenta de novo mais tarde, a sessão local continua.
      session.timer = setTimeout(() => { void this.refresh(senderId).catch(() => undefined); }, 60_000);
      (session.timer as any)?.unref?.();
      return false;
    }
    if (this.sessions.get(senderId) !== session) return false;
    if (reply.ok && reply.data?.refreshToken) {
      this.store(senderId, session.target, session.userId, reply.data, session.pendingMfa);
      return true;
    }
    const code = String(reply.data?.code || '');
    if (reply.status === 409) {
      session.timer = setTimeout(() => { void this.refresh(senderId).catch(() => undefined); }, 2_000);
      return false;
    }
    if (reply.status >= 500 || reply.status === 429) {
      session.timer = setTimeout(() => { void this.refresh(senderId).catch(() => undefined); }, 60_000);
      (session.timer as any)?.unref?.();
      return false;
    }
    this.drop(senderId);
    if (REVOKED_CODES.has(code)) this.onRevoked(senderId, code);
    return false;
  }

  /** Access token válido (renovado se estiver a caducar); null sem sessão no servidor. */
  async accessToken(senderId: number): Promise<string | null> {
    const session = this.sessions.get(senderId);
    if (!session || session.pendingMfa) return null;
    if (session.accessExpiresAt - Date.now() < REFRESH_MARGIN_MS && !await this.refresh(senderId)) return null;
    return this.sessions.get(senderId)?.accessToken || null;
  }

  /** Pedido autenticado à rota de sessões do servidor (listar, terminar sessões). */
  async sessionsRequest(senderId: number, body: Record<string, unknown>) {
    const token = await this.accessToken(senderId);
    const session = this.sessions.get(senderId);
    if (!token || !session) return { ok: false, status: 0, data: { code: 'NO_CLOUD_SESSION', message: 'Sem sessão no servidor.' } };
    return this.post(session.target, 'sessions', body, { Authorization: `Bearer ${token}` });
  }

  /** Termina a sessão no servidor (fim de sessão local). Não espera pela rede mais do que o necessário. */
  async logout(senderId: number) {
    const session = this.sessions.get(senderId);
    this.drop(senderId);
    if (!session) return;
    await this.post(session.target, 'logout', { refreshToken: session.refreshToken }).catch(() => undefined);
  }

  drop(senderId: number) {
    this.clearTimer(senderId);
    this.sessions.delete(senderId);
  }
}
