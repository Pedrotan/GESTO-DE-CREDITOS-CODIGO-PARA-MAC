// Detecção de intrusões e alertas de segurança do processo principal: classifica os pedidos rejeitados,
// agrupa repetições (para não inundar o registo), escala a gravidade quando um ataque insiste e bloqueia
// temporariamente quem tenta adivinhar chaves. Lógica pura, sem dependências do Electron, para ser testada.

import crypto from 'node:crypto';

export type SecuritySeverity = 'low' | 'medium' | 'high' | 'critical';

export type SecurityEventInput = {
    type: string;
    severity: SecuritySeverity;
    title: string;
    details: string;
    source: string;
    ip?: string | null;
    channel?: string | null;
    metadata?: Record<string, unknown>;
};

export type SecurityEvent = SecurityEventInput & { id: string; timestamp: string; count: number };

const SEVERITY_ORDER: SecuritySeverity[] = ['low', 'medium', 'high', 'critical'];
export const severityRank = (severity: SecuritySeverity) => SEVERITY_ORDER.indexOf(severity);
const raise = (severity: SecuritySeverity): SecuritySeverity => SEVERITY_ORDER[Math.min(SEVERITY_ORDER.length - 1, severityRank(severity) + 1)];

export const SECURITY_EVENT_LABELS: Record<string, string> = {
    ipc_untrusted_origin: 'Pedido de origem não autorizada ao sistema',
    sql_injection_attempt: 'Tentativa de comando de base de dados não autorizado',
    privilege_escalation_attempt: 'Tentativa de acção sem permissão',
    oversized_payload: 'Pedido anormalmente grande',
    master_login_failed: 'Falha de autenticação no Tango Master',
    login_bruteforce: 'Várias palavras-passe erradas (possível força bruta)',
    navigation_blocked: 'Navegação para destino não autorizado bloqueada',
    webview_blocked: 'Tentativa de incorporar conteúdo externo bloqueada',
    path_traversal_attempt: 'Tentativa de ler ficheiro fora das pastas permitidas',
    lan_bruteforce: 'Tentativas repetidas com chave de rede errada',
    lan_origin_rejected: 'Pedido à rede local de origem não autorizada',
    lan_rate_limited: 'Excesso de pedidos à rede local (possível ataque de negação de serviço)',
    license_forgery_attempt: 'Licença falsificada ou inválida',
    devtools_opened: 'Ferramentas de programador abertas em produção',
    renderer_crash: 'Interface terminada de forma anormal',
};

/** Classifica o erro de um pedido IPC rejeitado; null quando é um erro normal de utilização. */
export function classifyIpcError(channel: string, message: string): Pick<SecurityEventInput, 'type' | 'severity' | 'title'> | null {
    const text = String(message || '');
    const event = (type: string, severity: SecuritySeverity) => ({ type, severity, title: SECURITY_EVENT_LABELS[type] || type });
    if (/^Pedido IPC rejeitado/i.test(text)) return event('ipc_untrusted_origin', 'critical');
    if (/Instru[cç][aã]o SQLite bloqueada|Comando de dados n[aã]o registado|leitura de credenciais pelo renderer|Leituras aceitam apenas|Comandos SQL de esquema/i.test(text)) {
        return event('sql_injection_attempt', 'high');
    }
    if (/^Sem permiss[aã]o|n[aã]o possui permiss[aã]o|S[oó] administradores|Apenas administradores|exige (um|o) (administrador|respons[aá]vel)/i.test(text)) {
        return event('privilege_escalation_attempt', 'high');
    }
    if (/demasiado grande|demasiadas instru|Demasiados par[aâ]metros|Transa[cç][aã]o com demasiadas/i.test(text)) return event('oversized_payload', 'medium');
    if (channel.startsWith('master-auth') && /Credenciais invalidas|Demasiadas tentativas/i.test(text)) return event('master_login_failed', 'medium');
    return null;
}

type Persist = (event: SecurityEvent) => void | Promise<void>;
type Notify = (event: SecurityEvent) => void;

/**
 * Monitor de segurança: cada ocorrência é registada; repetições do mesmo tipo e origem dentro de
 * `dedupeMs` são agrupadas. À 5.ª e 20.ª repetição numa janela de 10 minutos a gravidade sobe e o
 * alerta volta a ser emitido (um ataque insistente nunca passa despercebido).
 */
export function createSecurityMonitor(options: { persist: Persist; notify: Notify; now?: () => number; dedupeMs?: number; windowMs?: number }) {
    const now = options.now ?? Date.now;
    const dedupeMs = options.dedupeMs ?? 60_000;
    const windowMs = options.windowMs ?? 10 * 60_000;
    const recent = new Map<string, { last: number; first: number; count: number; event: SecurityEvent }>();
    const history: SecurityEvent[] = [];

    const report = (input: SecurityEventInput): SecurityEvent | null => {
        const time = now();
        const key = `${input.type}|${input.ip || ''}|${input.channel || ''}`;
        const entry = recent.get(key);
        if (entry && time - entry.first <= windowMs) {
            entry.count += 1;
            const escalate = entry.count === 5 || entry.count === 20;
            if (!escalate && time - entry.last < dedupeMs) { entry.event.count = entry.count; return null; }
            entry.last = time;
            const severity = escalate ? raise(entry.event.severity) : entry.event.severity;
            const event: SecurityEvent = {
                ...input, severity, id: crypto.randomUUID(), timestamp: new Date(time).toISOString(), count: entry.count,
                title: escalate ? `${input.title} (repetido ${entry.count} vezes)` : input.title,
            };
            entry.event = event;
            emit(event);
            return event;
        }
        const event: SecurityEvent = { ...input, id: crypto.randomUUID(), timestamp: new Date(time).toISOString(), count: 1 };
        recent.set(key, { first: time, last: time, count: 1, event });
        if (recent.size > 2_000) for (const [k, value] of recent) if (time - value.first > windowMs) recent.delete(k);
        emit(event);
        return event;
    };

    const emit = (event: SecurityEvent) => {
        history.unshift(event);
        if (history.length > 500) history.length = 500;
        try { void Promise.resolve(options.persist(event)).catch(() => undefined); } catch { /* o registo nunca derruba o sistema */ }
        try { options.notify(event); } catch { /* idem */ }
    };

    return { report, history: () => [...history] };
}

/**
 * Bloqueio temporário após falhas repetidas (chaves de rede, códigos de acesso, palavras-passe):
 * `maxFailures` falhas numa janela de `windowMs` bloqueiam a origem durante `blockMs`.
 */
export function createFailureTracker(policy: { maxFailures: number; windowMs: number; blockMs: number }, now: () => number = Date.now) {
    const state = new Map<string, { failures: number; windowStart: number; blockedUntil: number }>();
    return {
        isBlocked(key: string) {
            const entry = state.get(key);
            return !!entry && entry.blockedUntil > now();
        },
        retryAfterSeconds(key: string) {
            const entry = state.get(key);
            return entry ? Math.max(0, Math.ceil((entry.blockedUntil - now()) / 1000)) : 0;
        },
        fail(key: string) {
            const time = now();
            let entry = state.get(key);
            if (!entry || time - entry.windowStart > policy.windowMs) entry = { failures: 0, windowStart: time, blockedUntil: 0 };
            entry.failures += 1;
            const justBlocked = entry.failures >= policy.maxFailures && entry.blockedUntil <= time;
            if (justBlocked) entry.blockedUntil = time + policy.blockMs;
            state.set(key, entry);
            if (state.size > 10_000) for (const [k, value] of state) if (value.blockedUntil < time && time - value.windowStart > policy.windowMs) state.delete(k);
            return { failures: entry.failures, blocked: entry.blockedUntil > time, justBlocked };
        },
        success(key: string) { state.delete(key); },
    };
}

/** Apenas estes destinos podem ser abertos fora da aplicação (nada de file:, smb:, ms-*: ou javascript:). */
export const isSafeExternalUrl = (value: string) => {
    try { return ['https:', 'mailto:', 'tel:'].includes(new URL(value).protocol); } catch { return false; }
};

/** Chave pública SPKI (base64 ou PEM) em formato PEM. */
export const toPublicKeyPem = (key: string) => {
    const clean = String(key || '').trim();
    if (!clean) return '';
    if (clean.includes('BEGIN PUBLIC KEY')) return clean;
    const body = clean.replace(/\s+/g, '').match(/.{1,64}/g)?.join('\n') || '';
    return `-----BEGIN PUBLIC KEY-----\n${body}\n-----END PUBLIC KEY-----\n`;
};

/**
 * Valida um pedido de activação de licença recebido pela rede: formato, tamanho e assinatura RSA do
 * Tango Master. Uma licença forjada ou alterada nunca chega a ser registada.
 */
export function verifyLicenseActivation(licenseKey: unknown, machineId: unknown, publicKeys: string[]): { ok: true; key: string; machineId: string } | { ok: false; reason: string } {
    const key = String(licenseKey ?? '').replace(/\s+/g, '');
    const mid = String(machineId ?? '').trim();
    if (!key || key.length > 16_384) return { ok: false, reason: 'Licença em falta ou demasiado grande.' };
    if (!mid || mid.length > 200 || !/^[\w.:@-]+$/u.test(mid)) return { ok: false, reason: 'Identificador de máquina inválido.' };
    let parsed: any = null;
    try {
        const text = key.startsWith('{') ? key : Buffer.from(key, 'base64').toString('utf8');
        parsed = JSON.parse(text);
    } catch { return { ok: false, reason: 'Formato de licença inválido.' }; }
    if (typeof parsed?.payload !== 'string' || typeof parsed?.signature !== 'string') return { ok: false, reason: 'Licença sem assinatura.' };
    const signature = Buffer.from(parsed.signature, 'base64');
    const valid = publicKeys.map(toPublicKeyPem).filter(Boolean).some(pem => {
        try { return crypto.verify('sha256', Buffer.from(parsed.payload, 'utf8'), { key: pem, padding: crypto.constants.RSA_PKCS1_PADDING }, signature); }
        catch { return false; }
    });
    return valid ? { ok: true, key, machineId: mid } : { ok: false, reason: 'Assinatura da licença inválida.' };
}

/** Mascara um identificador (email, login, IP) para os registos: suficiente para investigar, sem expor tudo. */
export const maskIdentifier = (value: string) => {
    const text = String(value || '');
    if (text.includes('@')) {
        const [user, domain] = text.split('@');
        return `${user.slice(0, 2)}***@${domain}`;
    }
    return text.length <= 4 ? '***' : `${text.slice(0, 3)}***${text.slice(-2)}`;
};
