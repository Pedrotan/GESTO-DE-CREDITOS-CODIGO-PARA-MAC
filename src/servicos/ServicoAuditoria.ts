import { AuditLog } from '@/tipos/credito';
import { RepositorioAuditoria } from '@/repositorios/RepositorioAuditoria';

// Palavras-passe, segredos de 2FA e chaves nunca entram nos registos de auditoria.
const SECRET_KEYS = /password|passe|secret|token|mfa|recovery|rescuekey|passkey|apikey|otp/i;
const SESSION_KEY = 'tango_audit_session';
const IP_KEY = 'tango_audit_ip';

function sanitize(value: any, depth = 0): any {
    if (value === null || value === undefined || depth > 6) return value;
    if (Array.isArray(value)) return value.map(item => sanitize(item, depth + 1));
    if (typeof value !== 'object') return value;
    const clean: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) clean[key] = SECRET_KEYS.test(key) ? (item ? '(protegido)' : item) : sanitize(item, depth + 1);
    return clean;
}

/** Sessão, dispositivo e fuso de quem gera o registo (para investigar sessão a sessão). */
function sessionContext(): Record<string, string> {
    try {
        let sessionId = sessionStorage.getItem(SESSION_KEY);
        if (!sessionId) { sessionId = crypto.randomUUID(); sessionStorage.setItem(SESSION_KEY, sessionId); }
        const ip = sessionStorage.getItem(IP_KEY) || '';
        return {
            sessionId, userAgent: navigator.userAgent.slice(0, 200),
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || '', ...(ip ? { ip } : {}),
        };
    } catch {
        return {};
    }
}

export class ServicoAuditoria {
    /** Abre uma sessão de auditoria nova (no login) e guarda o IP conhecido. */
    static startSession(ip?: string) {
        try {
            sessionStorage.setItem(SESSION_KEY, crypto.randomUUID());
            if (ip) sessionStorage.setItem(IP_KEY, ip);
        } catch { /* sem armazenamento de sessão */ }
    }

    static endSession() {
        try { sessionStorage.removeItem(SESSION_KEY); sessionStorage.removeItem(IP_KEY); } catch { /* sem armazenamento de sessão */ }
    }

    static async addLog(
        action: AuditLog['action'],
        entity: AuditLog['entity'],
        details: string,
        userId: string,
        userName: string,
        previousState?: any,
        newState?: any,
        metadata?: any
    ): Promise<AuditLog> {
        const enriched = { ...sessionContext(), ...(metadata && typeof metadata === 'object' ? sanitize(metadata) : metadata ? { info: metadata } : {}) };
        const newLog: AuditLog = {
            id: crypto.randomUUID(),
            action,
            entity,
            details,
            userId: userId || 'system',
            userName: userName || 'Sistema',
            timestamp: new Date(),
            previousState: previousState ? JSON.stringify(sanitize(previousState)) : undefined,
            newState: newState ? JSON.stringify(sanitize(newState)) : undefined,
            metadata: JSON.stringify(enriched)
        };

        await RepositorioAuditoria.insert(newLog);

        return newLog;
    }

    static async getLogs(limit: number = 400): Promise<AuditLog[]> {
        const rows = await RepositorioAuditoria.findLatest(limit);
        if (!rows) return [];
        return rows.map(l => ({ ...l, timestamp: new Date(l.timestamp) }));
    }

    static async getPagedLogs(limit: number = 50, lastTimestamp?: string, lastId?: string): Promise<AuditLog[]> {
        const rows = await RepositorioAuditoria.findPaged(limit, lastTimestamp, lastId);
        if (!rows) return [];
        return rows.map(l => ({ ...l, timestamp: new Date(l.timestamp) }));
    }

    // Os registos de auditoria são só de inserção: não há forma de os apagar ou editar.
    static async deleteLog(_id: string): Promise<void> {
        throw new Error('Os registos de auditoria são imutáveis.');
    }

    static async clearUserLogs(_userId: string): Promise<void> {
        throw new Error('Os registos de auditoria são imutáveis.');
    }

    static async clearAllLogs(): Promise<void> {
        throw new Error('Os registos de auditoria são imutáveis.');
    }
}
