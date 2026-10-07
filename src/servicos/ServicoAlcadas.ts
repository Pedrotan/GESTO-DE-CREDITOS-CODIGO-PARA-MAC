// Serviço das alçadas: versões da política de limites (com motivo, data de entrada em vigor e aprovação de um
// segundo administrador quando há aumentos grandes ou desativações), exceções temporárias, consumo por
// utilizador/agência/empresa com guardas na mesma transacção da operação, alertas a 80% e 100%, fila de
// escalonamento (com subida automática ao nível seguinte e dupla aprovação) e dados para os relatórios.
import { db } from '@/bibliotecas/bd';
import * as A from '@/bibliotecas/alcadas';
import { formatLuandaDateTime } from '@/bibliotecas/fuso-angola';
import { ServicoAuditoriaAvancada } from '@/servicos/ServicoAuditoriaAvancada';

type Actor = A.LimitActor & { permissions?: string[] };
type Statement = { sql: string; params: unknown[]; expectChanges?: number };

export type PolicyVersion = {
    id: string; version: number; policy: A.LimitPolicy; summary: string[]; reason: string;
    status: 'pending' | 'approved' | 'rejected' | 'cancelled'; effectiveFrom: string;
    requiresSecondApproval: boolean; secondApprovalReasons: string[];
    createdBy: string; createdByName: string; createdAt: string;
    decidedBy: string | null; decidedByName: string | null; decidedAt: string | null; decisionReason: string | null; restoredFrom: string | null;
};

export type Escalation = {
    id: string; operationType: A.OperationType; entityType: string; entityId: string; amountMinor: number;
    requestedById: string | null; requestedByName: string | null; requestedRole: string | null; reason: string; details: string[];
    requiredLevelId: string; requiredLevelIndex: number; requiredLevelName: string; dual: boolean;
    status: 'pending' | 'approved' | 'rejected' | 'cancelled'; createdAt: string; levelSince: string; escalationCount: number;
    lastReminderAt: string | null; decidedAt: string | null; decidedBy: string | null; decidedByName: string | null;
};
export type EscalationApproval = { id: string; escalationId: string; approverId: string; approverName: string; approverRole: string | null; decision: 'approved' | 'rejected'; notes: string | null; decidedAt: string };

export type UserRow = { id: string; name: string; role: string; status?: string | null; branchId?: string | null; branchName?: string | null };

const ADMIN_ROLES = ['admin', 'super_admin'];
export const canManageLimits = (actor: Partial<Actor> | null | undefined) =>
    !!actor && (ADMIN_ROLES.includes(String(actor.role)) || Boolean(actor.permissions?.includes('manage_limits')));
const assertAdmin = (actor: Actor, what: string) => {
    if (!ADMIN_ROLES.includes(actor.role)) throw new Error(`${what} exige um administrador.`);
};

const json = <T,>(value: unknown, fallback: T): T => { try { return value ? JSON.parse(String(value)) as T : fallback; } catch { return fallback; } };

const auditStatement = (actor: { id: string; name: string }, details: string, metadata: Record<string, unknown>, previous?: unknown, next?: unknown, when = new Date().toISOString()): Statement => ({
    sql: `INSERT INTO audit_logs (id, timestamp, userId, userName, action, entity, details, previousState, newState, metadata)
          VALUES (?, ?, ?, ?, 'update', 'system', ?, ?, ?, ?)`,
    params: [crypto.randomUUID(), when, actor.id, actor.name, details, previous === undefined ? null : JSON.stringify(previous), next === undefined ? null : JSON.stringify(next), JSON.stringify({ ...metadata, limitsChange: true })],
});

const notificationStatement = (id: string, userId: string, title: string, message: string, type: 'info' | 'warning' | 'success' | 'error', when = new Date().toISOString()): Statement => ({
    sql: `INSERT OR IGNORE INTO notifications (id, userId, title, message, type, read, timestamp) VALUES (?, ?, ?, ?, ?, 0, ?)`,
    params: [id, userId, title, message, type, when],
});

const mapVersion = (row: any): PolicyVersion => ({
    id: row.id, version: Number(row.version), policy: A.parsePolicy(row.policy), summary: json<string[]>(row.summary, []), reason: row.reason,
    status: row.status, effectiveFrom: row.effectiveFrom, requiresSecondApproval: Boolean(Number(row.requiresSecondApproval)),
    secondApprovalReasons: json<string[]>(row.secondApprovalReasons, []), createdBy: row.createdBy, createdByName: row.createdByName, createdAt: row.createdAt,
    decidedBy: row.decidedBy ?? null, decidedByName: row.decidedByName ?? null, decidedAt: row.decidedAt ?? null, decisionReason: row.decisionReason ?? null, restoredFrom: row.restoredFrom ?? null,
});

const mapEscalation = (row: any): Escalation => ({
    ...row, amountMinor: Number(row.amountMinor) || 0, details: json<string[]>(row.details, []), requiredLevelIndex: Number(row.requiredLevelIndex) || 0,
    dual: Boolean(Number(row.dual)), escalationCount: Number(row.escalationCount) || 0,
});


export class ServicoAlcadas {
    // ── Política e versões ─────────────────────────────────────────────────────────
    static async versions(): Promise<PolicyVersion[]> {
        const rows = await db.all<any>('SELECT * FROM limit_policy_versions ORDER BY version DESC').catch(() => []);
        return rows.map(mapVersion);
    }

    static async legacyLimits() {
        return db.all<{ role: string; maxTransaction: number; dailyLimit: number; monthlyLimit: number }>('SELECT * FROM user_limits').catch(() => []);
    }

    /** Política em vigor agora (ou num instante), com a versão de origem (null = valores por omissão). */
    static async current(now: Date = new Date()): Promise<{ policy: A.LimitPolicy; version: PolicyVersion | null }> {
        const versions = await this.versions();
        const active = versions.filter(item => item.status === 'approved' && new Date(item.effectiveFrom).getTime() <= now.getTime())
            .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom) || b.version - a.version)[0];
        if (active) return { policy: active.policy, version: active };
        return { policy: A.policyFromRows([], await this.legacyLimits(), now), version: null };
    }

    static async users(): Promise<UserRow[]> {
        return db.all<UserRow>(`SELECT id, name, role, status, branchId, branchName FROM users WHERE status IS NULL OR status <> 'blocked'`).catch(() => []);
    }

    private static async otherAdmins(exceptId: string) {
        return (await this.users()).filter(user => ADMIN_ROLES.includes(user.role) && user.id !== exceptId);
    }

    /**
     * Propõe uma nova versão. Valida a coerência, exige motivo e, quando há aumentos acima do limiar ou
     * desativações, fica pendente até um segundo administrador aprovar. Pode ficar agendada para uma data.
     */
    static async propose(input: { policy: A.LimitPolicy; reason: string; effectiveFrom?: string | null; actor: Actor; profileName?: (id: string) => string; restoredFrom?: string | null }) {
        const { actor } = input;
        if (!canManageLimits(actor)) throw new Error('Sem permissão para alterar limites (Utilizadores › Limites).');
        const reason = (input.reason || '').trim();
        await ServicoAuditoriaAvancada.assertJustification(reason, actor.id);
        const issues = A.validatePolicy(input.policy, input.profileName);
        if (issues.length) throw new Error(issues.slice(0, 5).map(issue => issue.message).join('\n'));
        const { policy: currentPolicy, version: currentVersion } = await this.current();
        const changes = A.diffPolicies(currentPolicy, input.policy, input.profileName);
        if (!changes.length && !input.restoredFrom) throw new Error('Não há alterações para guardar.');
        const second = A.needsSecondApproval(changes, currentPolicy.governance);
        const now = new Date();
        const effective = input.effectiveFrom && new Date(input.effectiveFrom).getTime() > now.getTime() ? new Date(input.effectiveFrom).toISOString() : now.toISOString();
        const versions = await this.versions();
        const versionNumber = (versions[0]?.version || 0) + 1;
        const id = crypto.randomUUID();
        const status = second.required ? 'pending' : 'approved';
        const summary = changes.map(change => `${change.label}: ${change.before} → ${change.after}`);
        const statements: Statement[] = [{
            sql: `INSERT INTO limit_policy_versions (id, version, policy, summary, reason, status, effectiveFrom, requiresSecondApproval, secondApprovalReasons, createdBy, createdByName, createdAt, restoredFrom)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            params: [id, versionNumber, JSON.stringify(input.policy), JSON.stringify(summary), reason, status, effective, second.required ? 1 : 0, JSON.stringify(second.reasons), actor.id, actor.name, now.toISOString(), input.restoredFrom || null],
            expectChanges: 1,
        }, auditStatement(actor,
            `Limites de transação: ${input.restoredFrom ? 'reposição de versão anterior' : 'alteração'} v${versionNumber} ${status === 'pending' ? 'pendente de aprovação de um segundo administrador' : effective > now.toISOString() ? `agendada para ${formatLuandaDateTime(effective)}` : 'em vigor'}`,
            { policyVersionId: id, version: versionNumber, previousVersion: currentVersion?.version ?? 0, changes: summary, reason, justification: reason, effectiveFrom: effective, requiresSecondApproval: second.required, secondApprovalReasons: second.reasons, restoredFrom: input.restoredFrom || undefined },
            currentPolicy, input.policy, now.toISOString())];
        if (second.required) for (const admin of await this.otherAdmins(actor.id)) {
            statements.push(notificationStatement(`limit-version:${id}:${admin.id}`, admin.id, 'Limites — aprovação pendente',
                `${actor.name} propôs a versão ${versionNumber} dos limites de transação. Precisa da aprovação de um segundo administrador: ${second.reasons.slice(0, 2).join('; ')}`, 'warning', now.toISOString()));
        }
        await db.transaction(statements);
        return { id, version: versionNumber, status, changes, second, effectiveFrom: effective };
    }

    static async decideVersion(versionId: string, approve: boolean, reason: string, actor: Actor) {
        assertAdmin(actor, 'A aprovação de alterações aos limites');
        const version = (await this.versions()).find(item => item.id === versionId);
        if (!version || version.status !== 'pending') throw new Error('Esta versão já não está pendente.');
        if (version.createdBy === actor.id) throw new Error('Quem propôs a alteração não a pode aprovar: tem de ser um segundo administrador.');
        await ServicoAuditoriaAvancada.assertJustification(reason, actor.id);
        const now = new Date().toISOString();
        await db.transaction([
            { sql: `UPDATE limit_policy_versions SET status = ?, decidedBy = ?, decidedByName = ?, decidedAt = ?, decisionReason = ? WHERE id = ? AND status = 'pending'`,
                params: [approve ? 'approved' : 'rejected', actor.id, actor.name, now, reason.trim(), versionId], expectChanges: 1 },
            auditStatement(actor, `Limites de transação: versão ${version.version} ${approve ? 'aprovada' : 'rejeitada'} pelo segundo administrador`,
                { policyVersionId: versionId, version: version.version, decision: approve ? 'approved' : 'rejected', reason, justification: reason, changes: version.summary }, undefined, undefined, now),
            notificationStatement(`limit-version-decision:${versionId}`, version.createdBy, approve ? 'Limites aprovados' : 'Limites rejeitados',
                `${actor.name} ${approve ? 'aprovou' : 'rejeitou'} a versão ${version.version} dos limites de transação. Motivo: ${reason.trim()}`, approve ? 'success' : 'warning', now),
        ]);
    }

    /** Repor uma versão anterior é uma nova alteração (com motivo e as mesmas regras de aprovação). */
    static async restore(versionId: string, reason: string, actor: Actor, profileName?: (id: string) => string, effectiveFrom?: string | null) {
        const version = (await this.versions()).find(item => item.id === versionId);
        if (!version) throw new Error('Versão não encontrada.');
        return this.propose({ policy: version.policy, reason, actor, profileName, restoredFrom: versionId, effectiveFrom });
    }

    // ── Exceções temporárias ───────────────────────────────────────────────────────
    static async exceptions(): Promise<A.LimitException[]> {
        const rows = await db.all<any>('SELECT * FROM limit_exceptions ORDER BY requestedAt DESC').catch(() => []);
        return rows.map(row => ({ ...row, perOperationMinor: row.perOperationMinor ?? null, dailyMinor: row.dailyMinor ?? null, monthlyMinor: row.monthlyMinor ?? null, dailyCount: row.dailyCount ?? null }));
    }

    static async requestException(input: Omit<A.LimitException, 'id' | 'status' | 'requestedBy' | 'requestedByName' | 'requestedAt'>, actor: Actor) {
        if (!canManageLimits(actor)) throw new Error('Sem permissão para conceder exceções de limites.');
        await ServicoAuditoriaAvancada.assertJustification(input.reason, actor.id);
        const starts = new Date(input.startsAt), ends = new Date(input.endsAt);
        if (Number.isNaN(starts.getTime()) || Number.isNaN(ends.getTime())) throw new Error('Indique a data e hora de início e de fim.');
        if (ends.getTime() <= starts.getTime()) throw new Error('A data de fim tem de ser posterior à de início.');
        if (ends.getTime() <= Date.now()) throw new Error('A data de fim já passou.');
        if (ends.getTime() - starts.getTime() > 92 * 86_400_000) throw new Error('Uma exceção temporária não pode durar mais de 3 meses. Para um limite permanente use os Limites Individuais.');
        const values = [input.perOperationMinor, input.dailyMinor, input.monthlyMinor, input.dailyCount];
        if (values.every(value => value === null || value === undefined)) throw new Error('Indique pelo menos um valor para a exceção.');
        if (values.some(value => value !== null && value !== undefined && (!Number.isFinite(value) || value < 0))) throw new Error('Os valores da exceção têm de ser positivos.');
        if (input.perOperationMinor != null && input.dailyMinor != null && input.perOperationMinor > input.dailyMinor) throw new Error('O limite por operação não pode ser maior do que o volume diário.');
        if (input.dailyMinor != null && input.monthlyMinor != null && input.dailyMinor > input.monthlyMinor) throw new Error('O volume diário não pode ser maior do que o mensal.');
        const id = crypto.randomUUID();
        const now = new Date().toISOString();
        const statements: Statement[] = [
            { sql: `INSERT INTO limit_exceptions (id, userId, userName, operationType, perOperationMinor, dailyMinor, monthlyMinor, dailyCount, startsAt, endsAt, reason, status, requestedBy, requestedByName, requestedAt)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`,
                params: [id, input.userId, input.userName, input.operationType, input.perOperationMinor ?? null, input.dailyMinor ?? null, input.monthlyMinor ?? null, input.dailyCount ?? null,
                    starts.toISOString(), ends.toISOString(), input.reason.trim(), actor.id, actor.name, now], expectChanges: 1 },
            auditStatement(actor, `Limites de transação: pedido de exceção temporária para ${input.userName} (${A.OPERATION_LABELS[input.operationType]}) até ${formatLuandaDateTime(ends)}`,
                { limitExceptionId: id, targetUserId: input.userId, operationType: input.operationType, perOperation: A.formatKz(input.perOperationMinor), daily: A.formatKz(input.dailyMinor), monthly: A.formatKz(input.monthlyMinor), startsAt: starts.toISOString(), endsAt: ends.toISOString(), reason: input.reason, justification: input.reason }, undefined, undefined, now),
        ];
        for (const admin of await this.otherAdmins(actor.id)) if (admin.id !== input.userId) statements.push(notificationStatement(`limit-exception:${id}:${admin.id}`, admin.id, 'Exceção de limite por aprovar',
            `${actor.name} pediu um aumento temporário de ${A.OPERATION_LABELS[input.operationType].toLowerCase()} para ${input.userName} até ${formatLuandaDateTime(ends)}.`, 'warning', now));
        await db.transaction(statements);
        return id;
    }

    static async decideException(id: string, approve: boolean, reason: string, actor: Actor) {
        assertAdmin(actor, 'A aprovação de exceções de limites');
        const exception = (await this.exceptions()).find(item => item.id === id);
        if (!exception || exception.status !== 'pending') throw new Error('Esta exceção já não está pendente.');
        if (exception.requestedBy === actor.id) throw new Error('Quem pediu a exceção não a pode aprovar: tem de ser outro administrador.');
        if (exception.userId === actor.id) throw new Error('Não pode aprovar uma exceção para si próprio.');
        await ServicoAuditoriaAvancada.assertJustification(reason, actor.id);
        const now = new Date().toISOString();
        await db.transaction([
            { sql: `UPDATE limit_exceptions SET status = ?, decidedBy = ?, decidedByName = ?, decidedAt = ?, decisionReason = ? WHERE id = ? AND status = 'pending'`,
                params: [approve ? 'approved' : 'rejected', actor.id, actor.name, now, reason.trim(), id], expectChanges: 1 },
            auditStatement(actor, `Limites de transação: exceção temporária de ${exception.userName} ${approve ? 'aprovada' : 'rejeitada'}`,
                { limitExceptionId: id, targetUserId: exception.userId, decision: approve ? 'approved' : 'rejected', endsAt: exception.endsAt, reason, justification: reason }, undefined, undefined, now),
            notificationStatement(`limit-exception-decision:${id}:${exception.userId}`, exception.userId, approve ? 'Limite temporário aprovado' : 'Limite temporário rejeitado',
                approve ? `O seu limite de ${A.OPERATION_LABELS[exception.operationType].toLowerCase()} foi aumentado até ${formatLuandaDateTime(exception.endsAt)}.` : `O aumento temporário de ${A.OPERATION_LABELS[exception.operationType].toLowerCase()} foi rejeitado.`, approve ? 'success' : 'warning', now),
            notificationStatement(`limit-exception-decision:${id}:${exception.requestedBy}`, exception.requestedBy, approve ? 'Exceção aprovada' : 'Exceção rejeitada',
                `${actor.name} ${approve ? 'aprovou' : 'rejeitou'} a exceção de ${exception.userName}.`, approve ? 'success' : 'warning', now),
        ]);
    }

    static async revokeException(id: string, reason: string, actor: Actor) {
        if (!canManageLimits(actor)) throw new Error('Sem permissão para terminar exceções de limites.');
        const exception = (await this.exceptions()).find(item => item.id === id);
        if (!exception || !['approved', 'pending'].includes(exception.status)) throw new Error('Esta exceção já não está activa.');
        await ServicoAuditoriaAvancada.assertJustification(reason, actor.id);
        const now = new Date().toISOString();
        await db.transaction([
            { sql: `UPDATE limit_exceptions SET status = 'revoked', decidedBy = COALESCE(decidedBy, ?), decidedByName = COALESCE(decidedByName, ?), decidedAt = COALESCE(decidedAt, ?), decisionReason = ? WHERE id = ? AND status IN ('approved','pending')`,
                params: [actor.id, actor.name, now, `Terminada antes do prazo: ${reason.trim()}`, id], expectChanges: 1 },
            auditStatement(actor, `Limites de transação: exceção temporária de ${exception.userName} terminada antes do prazo`, { limitExceptionId: id, targetUserId: exception.userId, reason, justification: reason }, undefined, undefined, now),
            notificationStatement(`limit-exception-revoked:${id}`, exception.userId, 'Limite temporário terminado', `O aumento temporário de ${A.OPERATION_LABELS[exception.operationType].toLowerCase()} terminou. Volta a aplicar-se o seu limite normal.`, 'info', now),
        ]);
    }

    // ── Consumo ────────────────────────────────────────────────────────────────────
    static async ledger(sinceDayKey?: string): Promise<Array<A.LedgerRow & { id: string; userName: string | null; entityType: string | null; entityId: string | null; createdAt: string }>> {
        const since = sinceDayKey || A.periodKeys().month + '-01';
        return db.all<any>('SELECT * FROM limit_ledger WHERE dayKey >= ? ORDER BY createdAt DESC', [since]).catch(() => []);
    }

    static async usageFor(policy: A.LimitPolicy, actor: A.LimitActor, operationType: A.OperationType, exceptions: A.LimitException[], now: Date = new Date(), productId?: string | null): Promise<A.UsageSnapshot> {
        const rows = await this.ledger(A.periodKeys(now).month + '-01');
        const limit = A.effectiveLimit(policy, actor, operationType, exceptions, now);
        const key = A.scopeKey(limit.scope, actor);
        const product = productId ? rows.filter(row => (row as any).entityType === `product:${productId}`) : [];
        return {
            scope: A.sumUsage(rows, operationType, key.scope, key.scopeId, now),
            company: A.sumUsage(rows, 'disbursement', 'all', 'all', now),
            product: productId ? { monthMinor: product.reduce((sum, row) => sum + Number(row.amountMinor || 0), 0) } : undefined,
        };
    }

    /** Exposição actual a um cliente e ao seu grupo de clientes relacionados (capital em dívida). */
    static async clientExposure(clientId?: string | null): Promise<{ riskLevel: string | null; exposureMinor: number; groupExposureMinor: number }> {
        if (!clientId) return { riskLevel: null, exposureMinor: 0, groupExposureMinor: 0 };
        const clients: any[] = await db.all<any>('SELECT id, name, nif, phone, riskLevel, fatherName, motherName, spouseName, spouseBi, spouseNif, spousePhone, legalRepresentative FROM clients WHERE deletedAt IS NULL').catch(() => []);
        const balances: Array<{ clientId: string; balance: number }> = await db.all<{ clientId: string; balance: number }>(`SELECT clientId, SUM(COALESCE(currentBalanceMinor, ROUND(currentBalance * 100))) AS balance FROM credits
            WHERE deletedAt IS NULL AND status IN ('active','overdue','defaulted','renegotiated','pending_approval') GROUP BY clientId`).catch(() => []);
        const byClient = new Map<string, number>(balances.map(row => [row.clientId, Number(row.balance) || 0] as [string, number]));
        const groups = A.relatedGroups(clients);
        const group = groups.get(clientId);
        const groupExposure = clients.filter(client => groups.get(client.id) === group).reduce((sum, client) => sum + (byClient.get(client.id) || 0), 0);
        return { riskLevel: clients.find(client => client.id === clientId)?.riskLevel ?? null, exposureMinor: byClient.get(clientId) || 0, groupExposureMinor: groupExposure || byClient.get(clientId) || 0 };
    }

    /** Alertas a 80% e 100% (uma vez por período), para o utilizador e para os supervisores. */
    static async alertStatements(policy: A.LimitPolicy, actor: A.LimitActor, operationType: A.OperationType, limit: A.EffectiveLimit, usage: A.UsageTotals, addMinor: number, now: Date = new Date()): Promise<Statement[]> {
        const statements: Statement[] = [];
        const keys = A.periodKeys(now);
        const supervisors = (await this.users()).filter(user => ADMIN_ROLES.includes(user.role) && user.id !== actor.id);
        const check = (period: 'day' | 'month', used: number, cap: number | null | undefined) => {
            if (cap === null || cap === undefined || cap <= 0) return;
            const before = (used / cap) * 100, after = ((used + addMinor) / cap) * 100;
            for (const threshold of policy.governance.alertThresholds) {
                if (before < threshold && after >= threshold) {
                    const label = `${A.OPERATION_LABELS[operationType]} — ${period === 'day' ? 'volume diário' : 'volume mensal'}`;
                    const text = `${A.formatShortKz(used + addMinor)} de ${A.formatKz(cap)} · ${Math.round(after)}%`;
                    const periodKey = period === 'day' ? keys.day : keys.month;
                    statements.push(notificationStatement(`limit-alert:${actor.id}:${operationType}:${period}:${periodKey}:${threshold}`, actor.id,
                        threshold >= 100 ? 'Limite atingido' : `Limite a ${threshold}%`, `${label}: ${text}.`, threshold >= 100 ? 'error' : 'warning', now.toISOString()));
                    for (const supervisor of supervisors) statements.push(notificationStatement(`limit-alert:${actor.id}:${operationType}:${period}:${periodKey}:${threshold}:${supervisor.id}`, supervisor.id,
                        threshold >= 100 ? `${actor.name} atingiu o limite` : `${actor.name} a ${threshold}% do limite`, `${label}: ${text}.`, threshold >= 100 ? 'error' : 'warning', now.toISOString()));
                }
            }
        };
        check('day', usage.dayMinor, limit.dailyMinor);
        check('month', usage.monthMinor, limit.monthlyMinor);
        return statements;
    }

    // ── Avaliação de operações ─────────────────────────────────────────────────────
    /**
     * Avalia uma operação e prepara as instruções a juntar à transacção: se for permitida, os guardas e o
     * registo do consumo (com alertas); se tiver de subir, o pedido escalado com o motivo e as notificações.
     */
    static async plan(input: {
        actor: A.LimitActor; operationType: A.OperationType; amountMinor: number; entityType: string; entityId: string;
        count?: number; percent?: number; clientId?: string | null; effortRate?: number | null; productId?: string | null;
        cashAvailableMinor?: number | null; extraConsumption?: A.OperationType[]; now?: Date; forceEscalation?: string | null;
    }) {
        const now = input.now || new Date();
        const { policy } = await this.current(now);
        const exceptions = await this.exceptions();
        const usage = await this.usageFor(policy, input.actor, input.operationType, exceptions, now, input.productId);
        const client = input.clientId ? await this.clientExposure(input.clientId) : null;
        const evaluation = A.evaluateOperation({
            policy, actor: input.actor, operationType: input.operationType, amountMinor: input.amountMinor, count: input.count, percent: input.percent,
            usage, exceptions, now, client, effortRate: input.effortRate ?? null, productId: input.productId,
            cashAvailableMinor: policy.global.linkToCash ? input.cashAvailableMinor ?? null : null,
        });
        if (input.forceEscalation && evaluation.decision === 'allow') {
            evaluation.decision = 'escalate';
            evaluation.reasons.unshift(input.forceEscalation);
            const required = evaluation.required || A.requiredLevelFor(policy, input.amountMinor, { riskLevel: client?.riskLevel });
            const next = Math.min(policy.chain.levels.length - 1, Math.max(required.index, evaluation.actorLevel + 1));
            evaluation.required = { ...required, index: next, id: policy.chain.levels[next]?.id || required.id, name: required.dual ? required.name : policy.chain.levels[next]?.name || required.name };
            evaluation.queueReason = `Acima da alçada de ${input.actor.name} — requer ${evaluation.required.name}`;
            evaluation.guards = [];
        }
        const statements: Statement[] = [];
        if (evaluation.decision === 'allow') {
            const types = [input.operationType, ...(input.extraConsumption || [])];
            for (const type of types) {
                const typeEvaluation = type === input.operationType ? evaluation : A.evaluateOperation({
                    policy, actor: input.actor, operationType: type, amountMinor: input.amountMinor, usage: await this.usageFor(policy, input.actor, type, exceptions, now), exceptions, now, client,
                });
                if (type !== input.operationType && typeEvaluation.decision !== 'allow') {
                    evaluation.decision = 'escalate';
                    evaluation.reasons.push(...typeEvaluation.reasons.map(reason => `${A.OPERATION_LABELS[type]}: ${reason}`));
                    evaluation.queueReason = `Acima da alçada de ${input.actor.name} — requer ${typeEvaluation.required?.name || evaluation.required?.name || 'nível superior'}`;
                    if (typeEvaluation.required && (!evaluation.required || typeEvaluation.required.index > evaluation.required.index)) evaluation.required = typeEvaluation.required;
                    statements.length = 0;
                    break;
                }
                const typeUsage = type === input.operationType ? usage.scope : (await this.usageFor(policy, input.actor, type, exceptions, now)).scope;
                // Com produto, o consumo fica marcado com o produto (volume mensal por produto do Simulador).
                statements.push(...A.consumptionStatements({ operationType: type, actor: input.actor, amountMinor: input.amountMinor, count: input.count, entityType: input.productId ? `product:${input.productId}` : input.entityType, entityId: input.entityId, guards: typeEvaluation.guards, now }));
                statements.push(...await this.alertStatements(policy, input.actor, type, typeEvaluation.limit, typeUsage, type === 'client_export' ? 0 : input.amountMinor, now));
            }
        }
        const escalation = evaluation.decision === 'escalate' ? await this.escalationStatements({ policy, evaluation, actor: input.actor, operationType: input.operationType, amountMinor: input.amountMinor, entityType: input.entityType, entityId: input.entityId, now }) : null;
        return { policy, evaluation, usage, client, statements, escalation };
    }

    /** Instruções do pedido escalado: registo na fila com o motivo e notificação aos aprovadores do nível. */
    static async escalationStatements(input: { policy: A.LimitPolicy; evaluation: A.Evaluation; actor: A.LimitActor; operationType: A.OperationType; amountMinor: number; entityType: string; entityId: string; now?: Date; reason?: string }) {
        const now = (input.now || new Date()).toISOString();
        const required = input.evaluation.required || { index: Math.min(input.policy.chain.levels.length - 1, input.evaluation.actorLevel + 1), id: input.policy.chain.levels[0]?.id || 'nivel', name: input.policy.chain.levels[0]?.name || 'Nível superior', dual: input.evaluation.dual, reasons: [] };
        const dual = Boolean(input.evaluation.dual || required.dual);
        const index = dual ? input.policy.chain.levels.length - 1 : Math.max(0, required.index);
        const levelName = dual ? `Dupla aprovação (${input.policy.chain.levels[index]?.name || 'nível máximo'})` : input.policy.chain.levels[index]?.name || required.name;
        const reason = input.reason || input.evaluation.queueReason || `Acima da alçada de ${input.actor.name} — requer ${levelName}`;
        const id = crypto.randomUUID();
        const statements: Statement[] = [{
            sql: `INSERT INTO limit_escalations (id, operationType, entityType, entityId, amountMinor, requestedById, requestedByName, requestedRole, reason, details, requiredLevelId, requiredLevelIndex, requiredLevelName, dual, status, createdAt, levelSince)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
            params: [id, input.operationType, input.entityType, input.entityId, input.amountMinor, input.actor.id, input.actor.name, input.actor.role, reason,
                JSON.stringify(input.evaluation.reasons), input.policy.chain.levels[index]?.id || required.id, index, levelName, dual ? 1 : 0, now, now],
        }];
        for (const approver of await this.approversFor(input.policy, index, dual)) {
            if (approver.id === input.actor.id) continue;
            statements.push(notificationStatement(`limit-escalation:${id}:${approver.id}`, approver.id, dual ? 'Dupla aprovação necessária' : 'Pedido acima da alçada',
                `${reason}. ${A.OPERATION_LABELS[input.operationType]} de ${A.formatKz(input.amountMinor)}.`, 'warning', now));
        }
        return { id, statements, reason, levelName, dual, index };
    }

    /** Pré-visualização para os formulários: quanto resta do limite e o que acontecerá ao submeter (nada é gravado). */
    static async preview(input: { actor: A.LimitActor; operationType: A.OperationType; amountMinor: number; clientId?: string | null; productId?: string | null; effortRate?: number | null }) {
        const now = new Date();
        const { policy } = await this.current(now);
        const exceptions = await this.exceptions();
        const usage = await this.usageFor(policy, input.actor, input.operationType, exceptions, now, input.productId);
        const client = input.clientId ? await this.clientExposure(input.clientId) : null;
        const evaluation = A.evaluateOperation({ policy, actor: input.actor, operationType: input.operationType, amountMinor: input.amountMinor, usage, exceptions, now, client,
            effortRate: input.effortRate ?? null, productId: input.productId });
        return { evaluation, usage, policy };
    }

    /** Utilizador (perfil e agência) a partir do id, para aplicar as alçadas nos serviços. */
    static async actorOf(userId?: string | null): Promise<A.LimitActor | null> {
        if (!userId) return null;
        const row = await db.get<{ id: string; name: string; role: string; branchId?: string | null }>('SELECT id, name, role, branchId FROM users WHERE id = ?', [userId]).catch(() => undefined);
        return row ? { id: row.id, name: row.name, role: row.role, branchId: row.branchId || null } : null;
    }

    /**
     * Operação executada directamente (sem fila): tem de caber na alçada de quem a executa. Devolve os guardas
     * e o registo do consumo para a transacção; fora da alçada lança um erro com o motivo.
     */
    static async enforce(input: { actor: A.LimitActor; operationType: A.OperationType; amountMinor: number; entityType: string; entityId: string; percent?: number; count?: number; now?: Date }) {
        const plan = await this.plan(input);
        if (plan.evaluation.decision !== 'allow') {
            throw new Error(`${A.OPERATION_LABELS[input.operationType]} acima da alçada de ${input.actor.name}: ${plan.evaluation.reasons.join('; ')}.`);
        }
        return plan.statements;
    }

    /**
     * Exportação de dados de clientes: até N registos por exportação e N exportações por dia. Regista o consumo
     * (com guarda) e a auditoria antes de o ficheiro ser gerado; fora da alçada lança um erro claro.
     */
    static async authorizeExport(userId: string | null | undefined, count: number, label: string) {
        const actor = await this.actorOf(userId);
        if (!actor) return;
        const entityId = `${label}:${Date.now()}`;
        const statements = await this.enforce({ actor, operationType: 'client_export', amountMinor: 0, count, entityType: 'export', entityId });
        await db.transaction([...statements, {
            sql: `INSERT INTO audit_logs (id, timestamp, userId, userName, action, entity, details, metadata) VALUES (?, ?, ?, ?, 'export', 'client', ?, ?)`,
            params: [crypto.randomUUID(), new Date().toISOString(), actor.id, actor.name, `Exportou ${count} registos de clientes (${label})`, JSON.stringify({ count, export: label })],
        }]).catch(error => {
            if (/conflito de concorr/i.test(String(error?.message))) throw new Error('Atingiu o número máximo de exportações de dados de clientes por hoje.');
            throw error;
        });
    }

    /**
     * Aprovação de um pedido de outro utilizador (estorno, anulação acima da alçada, abate). O abate exige
     * sempre dupla aprovação: quem pede e um aprovador do nível máximo da cadeia, diferente de quem pediu.
     */
    static async approverStatements(input: { actor: A.LimitActor; operationType: A.OperationType; amountMinor: number; entityType: string; entityId: string; requesterId?: string | null; now?: Date }) {
        const now = input.now || new Date();
        if (input.requesterId && input.requesterId === input.actor.id) throw new Error('Quem pediu a operação não a pode aprovar.');
        if (input.operationType !== 'write_off') return this.enforce(input);
        const { policy } = await this.current(now);
        const top = policy.chain.levels.length - 1;
        if (A.levelIndexOfProfile(policy, input.actor.role) < top)
            throw new Error(`O abate de crédito exige dupla aprovação: quem pede e um aprovador do nível ${policy.chain.levels[top]?.name || 'máximo'}.`);
        const limit = A.effectiveLimit(policy, input.actor, 'write_off', await this.exceptions(), now);
        if (!limit.allowed) throw new Error(`O perfil de ${input.actor.name} não tem alçada para abates de crédito.`);
        if (limit.source !== 'desativado' && limit.perOperationMinor != null && input.amountMinor > limit.perOperationMinor)
            throw new Error(`Abate de ${A.formatKz(input.amountMinor)} acima da alçada de ${input.actor.name} (${A.formatKz(limit.perOperationMinor)}).`);
        return A.consumptionStatements({ operationType: 'write_off', actor: input.actor, amountMinor: input.amountMinor, entityType: input.entityType, entityId: input.entityId, guards: [], now });
    }

    static async approversFor(policy: A.LimitPolicy, levelIndex: number, dual: boolean) {
        const top = policy.chain.levels.length - 1;
        const from = dual ? top : levelIndex;
        const roles = new Set(policy.chain.levels.slice(from).flatMap(level => level.profileIds));
        return (await this.users()).filter(user => roles.has(user.role));
    }

    // ── Escalonamentos ─────────────────────────────────────────────────────────────
    static async escalations(sinceIso?: string): Promise<Escalation[]> {
        const rows = sinceIso
            ? await db.all<any>('SELECT * FROM limit_escalations WHERE createdAt >= ? ORDER BY createdAt DESC', [sinceIso]).catch(() => [])
            : await db.all<any>('SELECT * FROM limit_escalations ORDER BY createdAt DESC LIMIT 2000').catch(() => []);
        return rows.map(mapEscalation);
    }

    static async escalationFor(entityType: string, entityId: string): Promise<Escalation | null> {
        const row = await db.get<any>(`SELECT * FROM limit_escalations WHERE entityType = ? AND entityId = ? ORDER BY createdAt DESC LIMIT 1`, [entityType, entityId]).catch(() => undefined);
        return row ? mapEscalation(row) : null;
    }

    static async approvals(escalationId?: string): Promise<EscalationApproval[]> {
        return escalationId
            ? db.all<EscalationApproval>('SELECT * FROM limit_escalation_approvals WHERE escalationId = ? ORDER BY decidedAt', [escalationId]).catch(() => [])
            : db.all<EscalationApproval>('SELECT * FROM limit_escalation_approvals ORDER BY decidedAt DESC LIMIT 5000').catch(() => []);
    }

    /**
     * Decisão de um aprovador sobre um crédito: confirma que tem nível suficiente, que não é quem pediu e, na
     * dupla aprovação, regista a primeira aprovação e só conclui com um segundo aprovador diferente.
     * Devolve as instruções a juntar à transacção da decisão (incluindo os guardas do volume do aprovador).
     */
    static async creditDecision(input: { creditId: string; clientId?: string | null; amountMinor: number; requestedById?: string | null; actor: A.LimitActor; approve: boolean; notes?: string; now?: Date }) {
        const now = input.now || new Date();
        const { policy } = await this.current(now);
        const escalation = await this.escalationFor('credit', input.creditId);
        const pending = escalation && escalation.status === 'pending' ? escalation : null;
        const client = await this.clientExposure(input.clientId);
        const required = pending
            ? { index: pending.requiredLevelIndex, dual: pending.dual, name: pending.requiredLevelName }
            : (() => { const level = A.requiredLevelFor(policy, input.amountMinor, { riskLevel: client.riskLevel }); return { index: level.index, dual: level.dual, name: level.name }; })();
        const requester = pending?.requestedById || input.requestedById || null;
        if (requester && requester === input.actor.id) throw new Error('Quem pediu o crédito não o pode aprovar nem rejeitar.');
        const statements: Statement[] = [];
        const nowIso = now.toISOString();
        if (!input.approve) {
            if (pending) statements.push(
                { sql: `INSERT INTO limit_escalation_approvals (id, escalationId, approverId, approverName, approverRole, decision, notes, decidedAt) VALUES (?, ?, ?, ?, ?, 'rejected', ?, ?)`, params: [crypto.randomUUID(), pending.id, input.actor.id, input.actor.name, input.actor.role, input.notes || null, nowIso] },
                { sql: `UPDATE limit_escalations SET status = 'rejected', decidedAt = ?, decidedBy = ?, decidedByName = ? WHERE id = ? AND status = 'pending'`, params: [nowIso, input.actor.id, input.actor.name, pending.id] });
            return { final: true, statements, required, escalation: pending };
        }
        if (!A.canApproveAtLevel(policy, input.actor.role, required)) {
            const own = policy.chain.levels[A.levelIndexOfProfile(policy, input.actor.role)]?.name;
            throw new Error(`A sua alçada${own ? ` (${own})` : ''} não chega para este pedido: requer ${required.name}.`);
        }
        const previous = pending ? (await this.approvals(pending.id)).filter(item => item.decision === 'approved') : [];
        if (previous.some(item => item.approverId === input.actor.id)) throw new Error('Já aprovou este pedido. A dupla aprovação exige um segundo aprovador diferente.');
        const final = !required.dual || previous.length >= 1;
        if (pending) statements.push({ sql: `INSERT INTO limit_escalation_approvals (id, escalationId, approverId, approverName, approverRole, decision, notes, decidedAt) VALUES (?, ?, ?, ?, ?, 'approved', ?, ?)`,
            params: [crypto.randomUUID(), pending.id, input.actor.id, input.actor.name, input.actor.role, input.notes || null, nowIso] });
        if (!final) {
            for (const approver of await this.approversFor(policy, required.index, true)) if (approver.id !== input.actor.id && approver.id !== requester)
                statements.push(notificationStatement(`limit-dual:${pending?.id || input.creditId}:${approver.id}`, approver.id, 'Falta a segunda aprovação',
                    `${input.actor.name} aprovou o crédito de ${A.formatKz(input.amountMinor)}. É necessária a aprovação de um segundo aprovador do nível máximo.`, 'warning', nowIso));
            return { final, statements, required, escalation: pending };
        }
        // O aprovador final consome a sua alçada (volume diário/mensal), com guardas na mesma transacção.
        const exceptions = await this.exceptions();
        for (const type of ['credit_approval', 'disbursement'] as A.OperationType[]) {
            const usage = await this.usageFor(policy, input.actor, type, exceptions, now);
            const limit = A.effectiveLimit(policy, input.actor, type, exceptions, now);
            if (limit.source !== 'desativado' && limit.allowed) {
                if (limit.dailyMinor != null && usage.scope.dayMinor + input.amountMinor > limit.dailyMinor)
                    throw new Error(`O seu volume diário de ${A.OPERATION_LABELS[type].toLowerCase()} não chega (restam ${A.formatKz(Math.max(0, limit.dailyMinor - usage.scope.dayMinor))}). Peça a outro aprovador do mesmo nível ou superior.`);
                if (limit.monthlyMinor != null && usage.scope.monthMinor + input.amountMinor > limit.monthlyMinor)
                    throw new Error(`O seu volume mensal de ${A.OPERATION_LABELS[type].toLowerCase()} não chega. Peça a outro aprovador do mesmo nível ou superior.`);
            }
            const key = A.scopeKey(limit.scope, input.actor);
            const guards: A.GuardCheck[] = limit.source === 'desativado' || !limit.allowed ? [] : [
                ...(limit.dailyMinor != null ? [{ ...key, period: 'day' as const, limitMinor: limit.dailyMinor, limitCount: 9_000_000_000_000_000, label: 'volume diário' }] : []),
                ...(limit.monthlyMinor != null ? [{ ...key, period: 'month' as const, limitMinor: limit.monthlyMinor, limitCount: 9_000_000_000_000_000, label: 'volume mensal' }] : []),
            ];
            statements.push(...A.consumptionStatements({ operationType: type, actor: input.actor, amountMinor: input.amountMinor, entityType: 'credit', entityId: input.creditId, guards, now }));
            statements.push(...await this.alertStatements(policy, input.actor, type, limit, usage.scope, input.amountMinor, now));
        }
        if (pending) statements.push({ sql: `UPDATE limit_escalations SET status = 'approved', decidedAt = ?, decidedBy = ?, decidedByName = ? WHERE id = ? AND status = 'pending'`, params: [nowIso, input.actor.id, input.actor.name, pending.id] });
        return { final, statements, required, escalation: pending };
    }

    /**
     * Tarefas periódicas: pedidos sem decisão há mais de X horas sobem ao nível seguinte (com lembrete) e
     * exceções temporárias que terminaram são notificadas ao utilizador e ao administrador.
     */
    static async processTimers(now: Date = new Date()) {
        const { policy } = await this.current(now);
        const hours = policy.chain.escalationHours;
        const statements: Statement[] = [];
        const top = policy.chain.levels.length - 1;
        for (const escalation of (await this.escalations()).filter(item => item.status === 'pending')) {
            if (now.getTime() - new Date(escalation.levelSince).getTime() < hours * 3_600_000) continue;
            const nowIso = now.toISOString();
            const atTop = escalation.dual || escalation.requiredLevelIndex >= top;
            const nextIndex = atTop ? escalation.requiredLevelIndex : escalation.requiredLevelIndex + 1;
            const nextName = atTop ? escalation.requiredLevelName : policy.chain.levels[nextIndex]?.name || escalation.requiredLevelName;
            statements.push({
                sql: `UPDATE limit_escalations SET requiredLevelIndex = ?, requiredLevelId = ?, requiredLevelName = ?, levelSince = ?, escalationCount = escalationCount + 1, lastReminderAt = ? WHERE id = ? AND status = 'pending' AND levelSince = ?`,
                params: [nextIndex, policy.chain.levels[nextIndex]?.id || escalation.requiredLevelId, nextName, nowIso, nowIso, escalation.id, escalation.levelSince],
            });
            statements.push({
                sql: `INSERT INTO audit_logs (id, timestamp, userId, userName, action, entity, details, metadata) VALUES (?, ?, NULL, 'Sistema', 'update', 'system', ?, ?)`,
                params: [crypto.randomUUID(), nowIso, atTop ? `Limites de transação: lembrete — pedido escalado sem decisão há mais de ${hours} h (${escalation.requiredLevelName})` : `Limites de transação: pedido sem decisão há mais de ${hours} h subiu de ${escalation.requiredLevelName} para ${nextName}`,
                    JSON.stringify({ escalationId: escalation.id, creditId: escalation.entityType === 'credit' ? escalation.entityId : undefined, from: escalation.requiredLevelName, to: nextName, limitsChange: true })],
            });
            for (const approver of await this.approversFor(policy, nextIndex, escalation.dual)) if (approver.id !== escalation.requestedById)
                statements.push(notificationStatement(`limit-escalation-timer:${escalation.id}:${escalation.escalationCount + 1}:${approver.id}`, approver.id,
                    atTop ? 'Lembrete: pedido por decidir' : 'Pedido subiu de nível', `${escalation.reason}. ${A.OPERATION_LABELS[escalation.operationType] || 'Operação'} de ${A.formatKz(escalation.amountMinor)} sem decisão há mais de ${hours} h.`, 'warning', nowIso));
        }
        for (const exception of await this.exceptions()) {
            if (exception.status !== 'approved' || new Date(exception.endsAt).getTime() > now.getTime()) continue;
            const text = `O aumento temporário de ${A.OPERATION_LABELS[exception.operationType].toLowerCase()} de ${exception.userName} terminou em ${formatLuandaDateTime(exception.endsAt)}. Volta a aplicar-se o limite normal.`;
            statements.push(notificationStatement(`limit-exception-expired:${exception.id}:${exception.userId}`, exception.userId, 'Limite temporário terminou', text, 'info', exception.endsAt));
            statements.push(notificationStatement(`limit-exception-expired:${exception.id}:${exception.requestedBy}`, exception.requestedBy, 'Exceção de limite terminou', text, 'info', exception.endsAt));
            if (exception.decidedBy) statements.push(notificationStatement(`limit-exception-expired:${exception.id}:${exception.decidedBy}`, exception.decidedBy, 'Exceção de limite terminou', text, 'info', exception.endsAt));
        }
        if (statements.length) await db.transaction(statements).catch(error => console.warn('[Alçadas] Processamento periódico:', error?.message));
        return statements.length;
    }

    // ── Visão geral para a página ──────────────────────────────────────────────────
    static async overview(now: Date = new Date()) {
        const [{ policy, version }, versions, exceptions, users, ledger, escalations] = await Promise.all([
            this.current(now), this.versions(), this.exceptions(), this.users(), this.ledger(luandaMonthStart(now, 1)), this.escalations(new Date(now.getTime() - 400 * 86_400_000).toISOString()),
        ]);
        return { policy, version, versions, exceptions, users, ledger, escalations, approvals: await this.approvals() };
    }

    /** Operações dos últimos 30 dias para a simulação de impacto (créditos e consumos registados). */
    static async recentOperations(users: UserRow[], now: Date = new Date()): Promise<A.HistoricOperation[]> {
        const since = new Date(now.getTime() - 30 * 86_400_000).toISOString();
        const byName = new Map(users.map(user => [user.name, user]));
        const byId = new Map(users.map(user => [user.id, user]));
        const credits = await db.all<any>(`SELECT c.id, c.principalAmount, c.principalAmountMinor, c.createdAt, c.requestedBy, c.usuario_id, cl.riskLevel FROM credits c
            LEFT JOIN clients cl ON cl.id = c.clientId WHERE c.deletedAt IS NULL AND c.createdAt >= ?`, [since]).catch(() => []);
        const operations: A.HistoricOperation[] = [];
        for (const credit of credits) {
            const user = byId.get(credit.usuario_id) || byName.get(credit.requestedBy);
            if (!user) continue;
            operations.push({ id: credit.id, operationType: 'credit_approval', amountMinor: Number(credit.principalAmountMinor ?? Math.round(Number(credit.principalAmount) * 100)), createdAt: credit.createdAt,
                actor: { id: user.id, name: user.name, role: user.role, branchId: user.branchId }, riskLevel: credit.riskLevel });
        }
        const ledger = await db.all<any>(`SELECT * FROM limit_ledger WHERE createdAt >= ? AND operationType NOT IN ('credit_approval','disbursement')`, [since]).catch(() => []);
        for (const row of ledger) {
            const user = byId.get(row.userId);
            if (user) operations.push({ id: row.id, operationType: row.operationType, amountMinor: Number(row.amountMinor) || 0, createdAt: row.createdAt, actor: { id: user.id, name: user.name, role: user.role, branchId: user.branchId } });
        }
        return operations;
    }
}

/** Primeiro dia (AAAA-MM-DD) do mês de Luanda, `monthsBack` meses antes. */
function luandaMonthStart(now: Date, monthsBack = 0) {
    const [year, month] = A.periodKeys(now).month.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1 - monthsBack, 1));
    return date.toISOString().slice(0, 10);
}
