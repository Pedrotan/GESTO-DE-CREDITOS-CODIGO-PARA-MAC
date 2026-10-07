// Auditoria de nível bancário: leitura dos registos com a cadeia de integridade, verificação (com fecho
// diário e alerta crítico se houver quebra), centro de alertas (estado, responsável, prazo, comentários;
// quem originou um alerta não o fecha), configuração (gravidades, limiares, conservação) e justificações.
import { db } from '@/bibliotecas/bd';
import { auditChainFindings, type AuditChainRow } from '@/bibliotecas/cadeia-auditoria';
import { justificationsFromLogs, validateJustification } from '@/bibliotecas/justificacao';
import { luandaDateKey, luandaTodayKey } from '@/bibliotecas/fuso-angola';
import { DEFAULT_ALERT_CONFIG, type AlertConfig, type AuditRow, type DetectedAlert, type Severity, type AuditAction } from '@/bibliotecas/auditoria-analise';
import { ServicoDefinicoesPartilhadas } from '@/servicos/ServicoDefinicoesPartilhadas';

export type Actor = { id: string; name: string; role?: string };
export type AlertStatus = 'open' | 'in_review' | 'justified' | 'false_positive' | 'resolved';
export const ALERT_STATUS_LABELS: Record<AlertStatus, string> = {
    open: 'Aberto', in_review: 'Em análise', justified: 'Justificado', false_positive: 'Falso positivo', resolved: 'Resolvido',
};
export const CLOSED_ALERT_STATUSES: AlertStatus[] = ['justified', 'false_positive', 'resolved'];

export type StoredAlert = {
    id: string; alertKey: string; ruleId: string; severity: Severity; title: string; description: string | null; eventIds: string | null;
    originUserId: string | null; originUserName: string | null; occurredAt: string; status: AlertStatus; assignedTo: string | null;
    assignedToName: string | null; dueAt: string | null; createdAt: string; updatedAt: string | null; closedBy: string | null;
    closedByName: string | null; closedAt: string | null;
};
export type AlertComment = { id: string; alertId: string; userId: string | null; userName: string; status: string | null; comment: string; createdAt: string };

export type AuditConfig = {
    alerts: AlertConfig;
    severityOverrides: Partial<Record<AuditAction, Severity>>;
    /** Meses visíveis na página (o resto fica em arquivo só de leitura). */
    visibleMonths: number;
    /** Prazo legal de conservação em anos (confirmar com o contabilista). Nunca se apaga antes. */
    retentionYears: number;
    weeklyRecipients: string[];
};
export const DEFAULT_AUDIT_CONFIG: AuditConfig = { alerts: DEFAULT_ALERT_CONFIG, severityOverrides: {}, visibleMonths: 12, retentionYears: 10, weeklyRecipients: [] };

export type IntegrityResult = {
    ok: boolean; checked: number; sealed: number; unsealedLegacy: number; brokenSeq: number | null; brokenId: string | null;
    message: string; verifiedAt: string; hmac?: { available: boolean; ok: boolean; detail: string } | null;
};

const CONFIG_KEY = 'audit_config';
const auditInsert = (actor: Actor, action: string, entity: string, details: string, metadata: Record<string, unknown>, when = new Date().toISOString()) => ({
    sql: `INSERT INTO audit_logs (id, timestamp, userId, userName, action, entity, details, metadata)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    params: [crypto.randomUUID(), when, actor.id || null, actor.name, action, entity, details, JSON.stringify(metadata)],
});

export class ServicoAuditoriaAvancada {
    static async getConfig(): Promise<AuditConfig> {
        try {
            const raw = await ServicoDefinicoesPartilhadas.get(CONFIG_KEY);
            const parsed = raw ? JSON.parse(raw) : {};
            return {
                ...DEFAULT_AUDIT_CONFIG, ...parsed,
                alerts: { ...DEFAULT_ALERT_CONFIG, ...(parsed.alerts || {}) },
                visibleMonths: Math.max(1, Number(parsed.visibleMonths) || 12),
                retentionYears: Math.max(5, Number(parsed.retentionYears) || 10),
            };
        } catch { return { ...DEFAULT_AUDIT_CONFIG }; }
    }

    static async saveConfig(config: AuditConfig, actor: Actor) {
        if (actor.role !== 'super_admin') throw new Error('Só o Super Administrador altera as regras da auditoria.');
        const before = await this.getConfig();
        await ServicoDefinicoesPartilhadas.set(CONFIG_KEY, JSON.stringify(config), actor.name);
        await db.run(`INSERT INTO audit_logs (id, timestamp, userId, userName, action, entity, details, previousState, newState, metadata)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [crypto.randomUUID(), new Date().toISOString(), actor.id, actor.name, 'update', 'system',
            'Atualizou as regras de auditoria (gravidades, limiares de alerta e conservação)', JSON.stringify(before), JSON.stringify(config), JSON.stringify({ area: 'auditoria' })]);
    }

    /** Registos com a cadeia (n.º sequencial e hash). Sem período, devolve o mais recente até ao limite. */
    static async loadRows(range: { fromIso: string; toIso: string } | null, limit = 20_000): Promise<AuditRow[]> {
        const columns = `a.id, a.timestamp, a.userId, a.userName, a.action, a.entity, a.details, a.previousState, a.newState, a.metadata,
            c.seq, c.integrityHash, c.previousHash`;
        const rows = range
            ? await db.all<AuditRow>(`SELECT ${columns} FROM audit_logs a LEFT JOIN audit_log_chain c ON c.auditId = a.id
                WHERE a.timestamp >= ? AND a.timestamp <= ? ORDER BY a.timestamp DESC LIMIT ?`, [range.fromIso, range.toIso, limit]).catch(() => null)
            : await db.all<AuditRow>(`SELECT ${columns} FROM audit_logs a LEFT JOIN audit_log_chain c ON c.auditId = a.id
                ORDER BY a.timestamp DESC LIMIT ?`, [limit]).catch(() => null);
        if (rows) return rows;
        // Bases sem a tabela da cadeia (versões antigas): só os registos.
        return range
            ? db.all<AuditRow>('SELECT * FROM audit_logs WHERE timestamp >= ? AND timestamp <= ? ORDER BY timestamp DESC LIMIT ?', [range.fromIso, range.toIso, limit])
            : db.all<AuditRow>('SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT ?', [limit]);
    }

    /** Actividade de um utilizador (a vista "A minha actividade" só vê os seus registos). */
    static async loadUserRows(userId: string, limit = 2000): Promise<AuditRow[]> {
        return db.all<AuditRow>(`SELECT a.id, a.timestamp, a.userId, a.userName, a.action, a.entity, a.details, a.previousState, a.newState, a.metadata,
            c.seq, c.integrityHash, c.previousHash FROM audit_logs a LEFT JOIN audit_log_chain c ON c.auditId = a.id
            WHERE a.userId = ? ORDER BY a.timestamp DESC LIMIT ?`, [userId, limit]).catch(() => []);
    }

    /** Histórico completo de uma entidade (crédito, cliente, pagamento) desde a criação. */
    static async entityHistory(entityId: string, extraTerms: string[] = []): Promise<AuditRow[]> {
        const terms = [entityId, ...extraTerms].filter(term => term && term.length >= 4);
        if (!terms.length) return [];
        const where = terms.map(() => '(a.metadata LIKE ? OR a.details LIKE ? OR a.previousState LIKE ? OR a.newState LIKE ?)').join(' OR ');
        const params = terms.flatMap(term => [`%${term}%`, `%${term}%`, `%${term}%`, `%${term}%`]);
        return db.all<AuditRow>(`SELECT a.id, a.timestamp, a.userId, a.userName, a.action, a.entity, a.details, a.previousState, a.newState, a.metadata,
            c.seq, c.integrityHash, c.previousHash FROM audit_logs a LEFT JOIN audit_log_chain c ON c.auditId = a.id
            WHERE ${where} ORDER BY a.timestamp ASC LIMIT 2000`, params).catch(() => []);
    }

    /** A consulta da própria página de auditoria também fica registada. */
    static async logView(actor: Actor, mode: 'full' | 'own') {
        await db.run(`INSERT INTO audit_logs (id, timestamp, userId, userName, action, entity, details, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [crypto.randomUUID(), new Date().toISOString(), actor.id, actor.name, 'view', 'audit',
                mode === 'full' ? 'Consultou a página de auditoria' : 'Consultou a sua própria actividade', JSON.stringify({ mode })]).catch(() => undefined);
    }

    static async logExport(actor: Actor, details: string, metadata: Record<string, unknown>) {
        await db.run(`INSERT INTO audit_logs (id, timestamp, userId, userName, action, entity, details, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [crypto.randomUUID(), new Date().toISOString(), actor.id, actor.name, 'export', 'audit', details, JSON.stringify(metadata)]);
    }

    // ── Integridade ─────────────────────────────────────────────────────────────────
    /**
     * Percorre a cadeia SHA-256 dos registos (e, no desktop, os selos HMAC do processo principal). Uma quebra gera
     * um alerta crítico. O hash do último registo de cada dia fica num fecho diário imutável.
     */
    static async verifyIntegrity(actor: Actor): Promise<IntegrityResult> {
        const verifiedAt = new Date().toISOString();
        const logs = await db.all<AuditChainRow & { timestamp: string }>(`SELECT id, timestamp, userId, userName, action, entity, details, previousState, newState, metadata
            FROM audit_logs`).catch(() => []);
        const chain = await db.all<{ auditId: string; previousHash: string; integrityHash: string; seq: number }>(
            'SELECT auditId, previousHash, integrityHash, seq FROM audit_log_chain ORDER BY seq').catch(() => []);
        const findings = auditChainFindings(logs, chain);
        const errors = findings.filter(item => item.severity === 'error');
        const seqOf = new Map<string, number>(chain.map(item => [item.auditId, Number(item.seq)] as [string, number]));
        const first = errors.map(item => ({ id: item.entityId, seq: seqOf.get(item.entityId) ?? null })).sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))[0];
        let hmac: IntegrityResult['hmac'] = null;
        const api = typeof window !== 'undefined' ? (window as any).electronAPI : undefined;
        if (typeof api?.auditSealVerify === 'function') {
            try {
                const seal = await api.auditSealVerify();
                const bad = [...(seal?.tampered || []), ...(seal?.broken || []), ...(seal?.missing || [])];
                hmac = seal?.available ? { available: true, ok: bad.length === 0, detail: bad.length ? `${bad.length} registo(s) com selo HMAC inválido` : `${seal.sealedCount} registo(s) selados (chave ${seal.keyFingerprint || '—'})` }
                    : { available: false, ok: true, detail: seal?.reason || 'Selos HMAC indisponíveis' };
            } catch (error) { hmac = { available: false, ok: true, detail: error instanceof Error ? error.message : 'Selos HMAC indisponíveis' }; }
        }
        const ok = errors.length === 0 && (hmac?.ok ?? true);
        const result: IntegrityResult = {
            ok, checked: logs.length, sealed: chain.length, unsealedLegacy: findings.filter(item => item.severity === 'warning').length,
            brokenSeq: first?.seq ?? null, brokenId: first?.id ?? null, verifiedAt, hmac,
            message: ok ? 'Íntegra' : first ? `Quebra no registo n.º ${first.seq ?? '?'}` : 'Selos HMAC inválidos',
        };
        const day = luandaTodayKey();
        const head = chain[chain.length - 1];
        const statements: Array<{ sql: string; params: unknown[] }> = [
            {
                sql: `INSERT OR IGNORE INTO audit_daily_closes (day, lastAuditId, headHash, eventCount, status, brokenSeq, verifiedAt, verifiedBy)
                      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                params: [day, head?.auditId || null, head?.integrityHash || null, logs.length, ok ? 'ok' : 'broken', result.brokenSeq, verifiedAt, actor.name],
            },
        ];
        if (!ok) {
            statements.push(auditInsert(actor, 'security_alert', 'audit', `Falha na verificação de integridade da auditoria: ${result.message}`, { integrity: result, result: 'failed' }, verifiedAt));
        }
        await db.transaction(statements).catch(() => undefined);
        if (!ok) {
            await this.raiseAlerts([{
                key: `integrity:${result.brokenId || 'hmac'}`, ruleId: 'integrity', severity: 'critical', title: 'Falha na verificação da cadeia de integridade',
                description: `${result.message}. Algum registo de auditoria foi alterado ou apagado fora da aplicação.${hmac && !hmac.ok ? ` ${hmac.detail}.` : ''}`,
                eventIds: result.brokenId ? [result.brokenId] : [], originUserId: 'system', originUserName: 'Verificação de integridade', occurredAt: verifiedAt,
            }]);
        }
        return result;
    }

    static async lastIntegrity(): Promise<{ day: string; status: string; brokenSeq: number | null; verifiedAt: string } | null> {
        return (await db.get<any>('SELECT day, status, brokenSeq, verifiedAt FROM audit_daily_closes ORDER BY day DESC LIMIT 1').catch(() => null)) || null;
    }

    /** Verificação automática: uma vez por dia, ao abrir a aplicação. */
    static async verifyDailyIfNeeded(actor: Actor) {
        const last = await this.lastIntegrity();
        if (last?.day === luandaTodayKey()) return null;
        return this.verifyIntegrity(actor);
    }

    // ── Alertas ─────────────────────────────────────────────────────────────────────
    /** Grava os alertas detectados que ainda não existem e avisa os responsáveis (Super Admin e Auditor). */
    static async raiseAlerts(detected: DetectedAlert[]) {
        if (!detected.length) return 0;
        const existing = new Set((await db.all<{ alertKey: string }>('SELECT alertKey FROM audit_alerts').catch(() => [])).map(row => row.alertKey));
        const fresh = detected.filter(alert => !existing.has(alert.key));
        if (!fresh.length) return 0;
        const responsible = await db.all<{ id: string }>(`SELECT id FROM users WHERE role IN ('super_admin', 'internal_auditor') AND (status IS NULL OR status <> 'blocked')`).catch(() => []);
        const now = new Date().toISOString();
        const statements: Array<{ sql: string; params: unknown[] }> = [];
        for (const alert of fresh) {
            const id = crypto.randomUUID();
            const due = new Date(Date.now() + (alert.severity === 'critical' ? 1 : alert.severity === 'high' ? 3 : 7) * 86_400_000).toISOString();
            statements.push({
                sql: `INSERT OR IGNORE INTO audit_alerts (id, alertKey, ruleId, severity, title, description, eventIds, originUserId, originUserName, occurredAt, status, dueAt, createdAt)
                      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)`,
                params: [id, alert.key, alert.ruleId, alert.severity, alert.title, alert.description, JSON.stringify(alert.eventIds), alert.originUserId, alert.originUserName, alert.occurredAt, due, now],
            });
            if (alert.severity === 'high' || alert.severity === 'critical') {
                for (const user of responsible) {
                    statements.push({
                        sql: `INSERT OR IGNORE INTO notifications (id, userId, title, message, type, read, timestamp) VALUES (?, ?, ?, ?, ?, 0, ?)`,
                        params: [`notification:audit-alert:${alert.key}:${user.id}`, user.id, `Alerta de auditoria: ${alert.title}`, alert.description.slice(0, 400), alert.severity === 'critical' ? 'error' : 'warning', now],
                    });
                }
            }
        }
        await db.transaction(statements);
        return fresh.length;
    }

    static async listAlerts(): Promise<StoredAlert[]> {
        return db.all<StoredAlert>('SELECT * FROM audit_alerts ORDER BY occurredAt DESC LIMIT 1000').catch(() => []);
    }

    static async alertComments(alertId: string): Promise<AlertComment[]> {
        return db.all<AlertComment>('SELECT * FROM audit_alert_comments WHERE alertId = ? ORDER BY createdAt', [alertId]).catch(() => []);
    }

    /** Muda o estado, o responsável ou o prazo, sempre com comentário. Quem originou o alerta não o fecha. */
    static async updateAlert(alert: StoredAlert, changes: { status: AlertStatus; assignedTo?: { id: string; name: string } | null; dueAt?: string | null; comment: string }, actor: Actor) {
        // O Auditor Interno tem acesso só de leitura: a gestão dos alertas é do Super Administrador.
        if (actor.role !== 'super_admin') throw new Error('Só o Super Administrador gere os alertas (o Auditor Interno tem acesso de leitura).');
        const comment = (changes.comment || '').trim();
        if (comment.length < 10) throw new Error('Escreva um comentário com pelo menos 10 caracteres.');
        const closing = CLOSED_ALERT_STATUSES.includes(changes.status);
        if (closing && alert.originUserId && alert.originUserId === actor.id) throw new Error('Não pode fechar um alerta originado por si próprio.');
        if (closing) {
            const error = validateJustification(comment);
            if (error) throw new Error(`Para fechar o alerta, a justificação tem de ser válida: ${error}`);
        }
        const now = new Date().toISOString();
        await db.transaction([
            {
                sql: `UPDATE audit_alerts SET status = ?, assignedTo = ?, assignedToName = ?, dueAt = ?, updatedAt = ?, closedBy = ?, closedByName = ?, closedAt = ?
                      WHERE id = ?`,
                params: [changes.status, changes.assignedTo?.id ?? alert.assignedTo, changes.assignedTo?.name ?? alert.assignedToName, changes.dueAt ?? alert.dueAt, now,
                    closing ? actor.id : null, closing ? actor.name : null, closing ? now : null, alert.id],
                expectChanges: 1,
            } as any,
            {
                sql: `INSERT INTO audit_alert_comments (id, alertId, userId, userName, status, comment, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)`,
                params: [crypto.randomUUID(), alert.id, actor.id, actor.name, changes.status, comment, now],
            },
            auditInsert(actor, 'update', 'audit', `Alerta «${alert.title}»: ${alert.status} → ${changes.status}`, { alertId: alert.id, reason: comment, previous: alert.status, next: changes.status }, now),
        ]);
    }

    // ── Justificações ───────────────────────────────────────────────────────────────
    static async previousJustifications(userId: string): Promise<string[]> {
        const rows = await db.all<{ details: string; metadata: string }>('SELECT details, metadata FROM audit_logs WHERE userId = ? ORDER BY timestamp DESC LIMIT 500', [userId]).catch(() => []);
        return justificationsFromLogs(rows);
    }

    /** Valida a justificação (regras + não repetir uma anterior do mesmo utilizador). */
    static async checkJustification(text: string, userId?: string | null): Promise<string | null> {
        const previous = userId ? await this.previousJustifications(userId) : [];
        return validateJustification(text, previous);
    }

    static async assertJustification(text: string, userId?: string | null) {
        const error = await this.checkJustification(text, userId);
        if (error) throw new Error(error);
    }

    static dayKey = luandaDateKey;
}
