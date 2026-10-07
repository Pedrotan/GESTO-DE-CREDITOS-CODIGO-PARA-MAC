import bcrypt from 'bcryptjs';
import { ServicoAuditoriaAvancada } from '@/servicos/ServicoAuditoriaAvancada';
import { db } from '@/bibliotecas/bd';
import { auditRiskFindings } from '@/bibliotecas/alertas-auditoria';
import { auditChainFindings } from '@/bibliotecas/cadeia-auditoria';
import { auditStatus, runAccountingAudit, type AuditFinding, type AuditKind, type AuditResult, type AuditCreditRow, type AuditEntryRow, type AuditLineRow, type AuditPaymentRow, type AuditTransactionRow } from '@/bibliotecas/auditoria-contabil';
import { DEFAULT_WORKING_TIME, normalizeWorkingTime, type WorkingTimeConfig } from '@/bibliotecas/feriados-angola';
import type { SealVerification } from '@/bibliotecas/selo-contabilistico';
import { ServicoDivergencias, type DivergenceDecision } from '@/servicos/ServicoDivergencias';
import { ServicoFinanceiro } from '@/servicos/ServicoFinanceiro';

export type AccountingConfig = { cashGuard: boolean; workingTime: WorkingTimeConfig; provisionRates: number[] };
export const DEFAULT_ACCOUNTING_CONFIG: AccountingConfig = { cashGuard: true, workingTime: DEFAULT_WORKING_TIME, provisionRates: [0, 5, 25, 50, 100] };

export type PanicLock = { active: true; reason: string; lockedBy: string; lockedById: string; lockedAt: string };
export type Actor = { id: string; name: string; role?: string };

export type AuditRunRecord = {
    id: string; kind: AuditKind; startedAt: string; finishedAt: string; userId?: string | null; userName: string;
    status: 'ok' | 'warning' | 'critical'; criticalCount: number; highCount: number; mediumCount: number; lowCount: number;
    headEntryId?: string | null; headHash?: string | null; sealStatus?: string | null; summary: AuditResult['summary'] | null; findings: AuditFinding[];
};

export type DailyCloseRecord = {
    day: string; headEntryId?: string | null; headHash?: string | null; entryCount: number; debitMinor: number; creditMinor: number;
    liquidMinor: number; portfolioMinor: number; auditRunId?: string | null; sealStatus?: string | null; closedAt: string; closedBy: string; closedById?: string | null;
};

export type AccountingRequest = {
    id: string; kind: 'reversal' | 'writeoff'; targetId: string; amountMinor?: number | null; description?: string | null; reason: string;
    requestedBy: string; requestedById: string; requestedAt: string; status: 'pending' | 'approved' | 'rejected';
    decidedBy?: string | null; decidedById?: string | null; decidedAt?: string | null; decisionReason?: string | null; resultEntryId?: string | null;
};

export type LedgerSnapshot = {
    entries: AuditEntryRow[];
    transactions: AuditTransactionRow[];
    lines: AuditLineRow[];
    payments: AuditPaymentRow[];
    credits: AuditCreditRow[];
    installments: any[];
    writeoffs: any[];
    cashSessions: any[];
    auditLogs: any[];
    auditChain: any[];
    loadedAt: string;
};

const parseJson = <T,>(value: unknown, fallback: T): T => {
    if (typeof value !== 'string' || !value) return fallback;
    try { return JSON.parse(value) as T; } catch { return fallback; }
};

const isAdmin = (actor?: Actor | null) => ['admin', 'super_admin'].includes(String(actor?.role || ''));
const UPSERT_SHARED = `INSERT INTO shared_settings (key, value, updatedAt, updatedBy) VALUES (?, ?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updatedAt = excluded.updatedAt, updatedBy = excluded.updatedBy
    WHERE excluded.updatedAt >= shared_settings.updatedAt`;

export class ServicoContabilidadeGeral {
    /** Lê o razão e os registos operacionais de uma só vez; repete se houver movimentos durante a leitura. */
    static async loadSnapshot(): Promise<LedgerSnapshot> {
        for (let attempt = 0; attempt < 3; attempt++) {
            const head = await db.get<{ id: string }>('SELECT id FROM accounting_entries ORDER BY rowid DESC LIMIT 1');
            const [entries, transactions, lines, payments, credits, installments, writeoffs, cashSessions, auditLogs, auditChain] = await Promise.all([
                db.all<AuditEntryRow>('SELECT * FROM accounting_entries ORDER BY rowid'),
                db.all<AuditTransactionRow>('SELECT * FROM ledger_transactions ORDER BY rowid'),
                db.all<AuditLineRow>('SELECT * FROM ledger_lines ORDER BY rowid'),
                db.all<AuditPaymentRow>('SELECT * FROM payments'),
                db.all<AuditCreditRow>('SELECT * FROM credits'),
                db.all<any>('SELECT * FROM credit_installments'),
                db.all<any>('SELECT * FROM credit_writeoffs').catch(() => []),
                db.all<any>("SELECT * FROM accounting_cash_sessions WHERE status = 'closed'").catch(() => []),
                db.all<any>('SELECT * FROM audit_logs ORDER BY timestamp DESC, rowid DESC'),
                db.all<any>('SELECT * FROM audit_log_chain ORDER BY seq').catch(() => []),
            ]);
            const after = await db.get<{ id: string }>('SELECT id FROM accounting_entries ORDER BY rowid DESC LIMIT 1');
            if (head?.id === after?.id) {
                return { entries, transactions, lines, payments, credits, installments, writeoffs, cashSessions, auditLogs, auditChain, loadedAt: new Date().toISOString() };
            }
        }
        throw new Error('Ocorreram movimentos durante a leitura do razão. Tente novamente.');
    }

    static async getConfig(): Promise<AccountingConfig> {
        const row = await db.get<{ value: string }>('SELECT value FROM shared_settings WHERE key = ?', [ServicoFinanceiro.ACCOUNTING_CONFIG_KEY]).catch(() => undefined);
        const parsed = parseJson<Partial<AccountingConfig>>(row?.value, {});
        const rates = Array.isArray(parsed.provisionRates) && parsed.provisionRates.length === 5
            && parsed.provisionRates.every(rate => Number.isFinite(Number(rate)) && Number(rate) >= 0 && Number(rate) <= 100)
            ? parsed.provisionRates.map(Number) : DEFAULT_ACCOUNTING_CONFIG.provisionRates;
        return { cashGuard: parsed.cashGuard !== false, workingTime: normalizeWorkingTime(parsed.workingTime), provisionRates: rates };
    }

    static async saveConfig(config: AccountingConfig, actor: Actor) {
        if (!isAdmin(actor)) throw new Error('Só administradores podem alterar as regras de auditoria.');
        const value: AccountingConfig = { cashGuard: config.cashGuard, workingTime: normalizeWorkingTime(config.workingTime), provisionRates: config.provisionRates.map(Number) };
        const now = new Date().toISOString();
        await db.transaction([
            { sql: UPSERT_SHARED, params: [ServicoFinanceiro.ACCOUNTING_CONFIG_KEY, JSON.stringify(value), now, actor.name] },
            {
                sql: `INSERT INTO audit_logs (id, timestamp, userId, userName, action, entity, details, metadata)
                      VALUES (?, ?, ?, ?, 'update', 'accounting_entry', ?, ?)`,
                params: [crypto.randomUUID(), now, actor.id, actor.name, 'Regras de auditoria contabilística alteradas', JSON.stringify(value)]
            }
        ]);
        return value;
    }

    /** Selos HMAC: só no aplicativo desktop (a chave fica no processo principal). */
    static async verifySeals(): Promise<SealVerification | null> {
        const api = typeof window !== 'undefined' ? window.electronAPI : undefined;
        if (!api?.accountingSealVerify) return null;
        try { return await api.accountingSealVerify(); } catch { return null; }
    }

    static async sealPending(): Promise<number> {
        const api = typeof window !== 'undefined' ? window.electronAPI : undefined;
        if (!api?.accountingSealPending) throw new Error('A selagem HMAC só está disponível no aplicativo desktop.');
        return (await api.accountingSealPending()).sealed;
    }

    /** Junta as decisões (justificado/resolvido) registadas para cada apontamento. */
    static applyDecisions(findings: AuditFinding[], decisions: DivergenceDecision[]): AuditFinding[] {
        const latest = new Map<string, DivergenceDecision>();
        for (const decision of decisions) if (!latest.has(decision.issueKey)) latest.set(decision.issueKey, decision);
        return findings.map(finding => {
            const decision = latest.get(`audit:${finding.id}`);
            return decision ? { ...finding, justification: { state: decision.state, reason: decision.reason, actorName: decision.actorName, createdAt: decision.createdAt } } : finding;
        });
    }

    /** Avalia o razão sem gravar a execução (estado mostrado ao abrir a página e após cada movimento). */
    static async evaluate(kind: AuditKind, snapshot?: LedgerSnapshot): Promise<{ result: AuditResult; snapshot: LedgerSnapshot; seals: SealVerification | null; config: AccountingConfig }> {
        const data = snapshot || await this.loadSnapshot();
        const [config, seals, decisions] = await Promise.all([
            this.getConfig(),
            this.verifySeals(),
            ServicoDivergencias.list().catch(() => [] as DivergenceDecision[]),
        ]);
        const userFindings = [
            ...auditRiskFindings(data.auditLogs, data.entries.map(entry => ({ id: entry.id, type: entry.type, timestamp: entry.timestamp, usuario_id: entry.usuario_id || undefined }))),
            // Cadeia da trilha de utilizadores: só registos alterados ou fora de sequência (os antigos sem selo são informativos).
            ...auditChainFindings(data.auditLogs, data.auditChain || []).filter(item => item.severity === 'error'),
        ];
        const result = await runAccountingAudit({
            entries: data.entries, transactions: data.transactions, lines: data.lines, payments: data.payments, credits: data.credits,
            installments: data.installments, writtenOffCreditIds: data.writeoffs.map(item => String(item.creditId)),
            cashSessions: data.cashSessions.filter(item => Number(item.expectedMinor) !== Number(item.countedMinor)),
            userFindings, seals, workingTime: config.workingTime,
        }, kind);
        result.findings = this.applyDecisions(result.findings, decisions);
        return { result, snapshot: data, seals, config };
    }

    static async runAudit(kind: AuditKind, actor: Actor, snapshot?: LedgerSnapshot): Promise<{ result: AuditResult; run: AuditRunRecord; snapshot: LedgerSnapshot; seals: SealVerification | null }> {
        const startedAt = new Date().toISOString();
        const { result, snapshot: data, seals } = await this.evaluate(kind, snapshot);
        const count = (severity: string) => result.findings.filter(finding => finding.severity === severity && (!finding.justification || finding.justification.state === 'pending')).length;
        const run: AuditRunRecord = {
            id: crypto.randomUUID(), kind, startedAt, finishedAt: new Date().toISOString(), userId: actor.id, userName: actor.name,
            status: auditStatus(result.findings), criticalCount: count('critical'), highCount: count('high'), mediumCount: count('medium'), lowCount: count('low'),
            headEntryId: result.summary.headEntryId, headHash: result.summary.headHash, sealStatus: result.summary.sealStatus,
            summary: result.summary, findings: result.findings,
        };
        await db.run(`INSERT INTO accounting_audit_runs (id, kind, startedAt, finishedAt, userId, userName, status, criticalCount, highCount,
                mediumCount, lowCount, headEntryId, headHash, sealStatus, summary, findings) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [run.id, run.kind, run.startedAt, run.finishedAt, run.userId, run.userName, run.status, run.criticalCount, run.highCount,
                run.mediumCount, run.lowCount, run.headEntryId, run.headHash, run.sealStatus, JSON.stringify(run.summary),
                // Os apontamentos ficam guardados (até 500) para consulta no histórico.
                JSON.stringify(run.findings.slice(0, 500))]);
        return { result, run, snapshot: data, seals };
    }

    static async listAuditRuns(limit = 200): Promise<AuditRunRecord[]> {
        const rows = await db.all<any>('SELECT * FROM accounting_audit_runs ORDER BY finishedAt DESC LIMIT ?', [limit]).catch(() => []);
        return rows.map(row => ({
            ...row,
            criticalCount: Number(row.criticalCount) || 0, highCount: Number(row.highCount) || 0,
            mediumCount: Number(row.mediumCount) || 0, lowCount: Number(row.lowCount) || 0,
            summary: parseJson(row.summary, null), findings: parseJson<AuditFinding[]>(row.findings, []),
        }));
    }

    static async listDailyCloses(): Promise<DailyCloseRecord[]> {
        const rows = await db.all<any>('SELECT * FROM accounting_daily_closes ORDER BY day DESC').catch(() => []);
        return rows.map(row => ({ ...row, entryCount: Number(row.entryCount), debitMinor: Number(row.debitMinor), creditMinor: Number(row.creditMinor), liquidMinor: Number(row.liquidMinor), portfolioMinor: Number(row.portfolioMinor) }));
    }

    /**
     * Fecho diário: executa a auditoria completa e, sem apontamentos críticos por resolver, grava a
     * fotografia do dia (último lançamento, hash, totais e estado dos selos). Um dia fechado não reabre.
     */
    static async closeDay(day: string, actor: Actor): Promise<{ close: DailyCloseRecord; run: AuditRunRecord }> {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error('Data inválida.');
        const today = new Date();
        const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        if (day > todayKey) throw new Error('Não é possível fechar um dia futuro.');
        if (await db.get('SELECT day FROM accounting_daily_closes WHERE day = ?', [day])) throw new Error(`O dia ${day} já está fechado.`);
        const { run, snapshot } = await this.runAudit('full', actor);
        if (run.status === 'critical') throw new Error(`A auditoria encontrou ${run.criticalCount} apontamento(s) crítico(s). Resolva-os ou justifique-os antes de fechar o dia.`);
        const endOfDay = new Date(`${day}T23:59:59.999`).getTime();
        const dayEntries = snapshot.entries.filter(entry => new Date(entry.timestamp).getTime() <= endOfDay);
        const ids = new Set(dayEntries.map(entry => entry.id));
        const lines = snapshot.lines.filter(line => ids.has(line.transactionId));
        const sum = (side: string) => lines.filter(line => line.side === side).reduce((total, line) => total + Number(line.amountMinor), 0);
        const balance = (accounts: string[]) => lines.filter(line => accounts.includes(line.account)).reduce((total, line) => total + (line.side === 'debit' ? 1 : -1) * Number(line.amountMinor), 0);
        const head = dayEntries[dayEntries.length - 1];
        const close: DailyCloseRecord = {
            day, headEntryId: head?.id || null, headHash: head?.integrityHash || null, entryCount: dayEntries.length,
            debitMinor: sum('debit'), creditMinor: sum('credit'), liquidMinor: balance(['cash', 'bank']), portfolioMinor: balance(['portfolio']),
            auditRunId: run.id, sealStatus: run.sealStatus || null, closedAt: new Date().toISOString(), closedBy: actor.name, closedById: actor.id,
        };
        await db.transaction([
            {
                sql: `INSERT INTO accounting_daily_closes (day, headEntryId, headHash, entryCount, debitMinor, creditMinor, liquidMinor, portfolioMinor,
                      auditRunId, sealStatus, closedAt, closedBy, closedById) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                params: [close.day, close.headEntryId, close.headHash, close.entryCount, close.debitMinor, close.creditMinor, close.liquidMinor,
                    close.portfolioMinor, close.auditRunId, close.sealStatus, close.closedAt, close.closedBy, close.closedById],
                expectChanges: 1
            },
            {
                sql: `INSERT INTO audit_logs (id, timestamp, userId, userName, action, entity, details, metadata)
                      VALUES (?, ?, ?, ?, 'create', 'accounting_entry', ?, ?)`,
                params: [crypto.randomUUID(), close.closedAt, actor.id, actor.name, `Fecho diário de ${day}`, JSON.stringify({ day, auditRunId: run.id, headHash: close.headHash })]
            }
        ]);
        return { close, run };
    }

    static async listRequests(): Promise<AccountingRequest[]> {
        return db.all<AccountingRequest>('SELECT * FROM accounting_requests ORDER BY requestedAt DESC').catch(() => []);
    }

    static async createRequest(input: { kind: 'reversal' | 'writeoff'; targetId: string; amountMinor?: number; description: string; reason: string }, actor: Actor) {
        const reason = input.reason?.trim() || '';
        await ServicoAuditoriaAvancada.assertJustification(reason, actor.id);
        if (await db.get("SELECT id FROM accounting_requests WHERE kind = ? AND targetId = ? AND status = 'pending'", [input.kind, input.targetId])) {
            throw new Error('Já existe um pedido pendente para este registo.');
        }
        const id = crypto.randomUUID();
        const now = new Date().toISOString();
        await db.transaction([
            {
                sql: `INSERT INTO accounting_requests (id, kind, targetId, amountMinor, description, reason, requestedBy, requestedById, requestedAt, status)
                      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
                params: [id, input.kind, input.targetId, input.amountMinor ?? null, input.description, reason, actor.name, actor.id, now], expectChanges: 1
            },
            {
                sql: `INSERT INTO audit_logs (id, timestamp, userId, userName, action, entity, details, metadata)
                      VALUES (?, ?, ?, ?, 'create', 'accounting_entry', ?, ?)`,
                params: [crypto.randomUUID(), now, actor.id, actor.name, `Pedido de ${input.kind === 'reversal' ? 'estorno' : 'abate'}: ${input.description}`,
                    JSON.stringify({ requestId: id, targetId: input.targetId, reason })]
            }
        ]);
        return id;
    }

    /**
     * Decide um pedido. A aprovação exige outro administrador e executa a operação: estorno de um
     * lançamento manual, estorno de pagamento (pela função de pagamentos) ou abate do crédito.
     */
    static async decideRequest(request: AccountingRequest, approve: boolean, decisionReason: string, actor: Actor,
        _executors: { reversePayment: (paymentId: string, justification: string) => Promise<void> }) {
        if (!isAdmin(actor)) throw new Error('Só administradores podem decidir pedidos.');
        const stored = await db.get<AccountingRequest>('SELECT * FROM accounting_requests WHERE id = ?', [request.id]);
        if (!stored) throw new Error('Pedido não encontrado.');
        request = stored;
        if (request.requestedById === actor.id) throw new Error('O pedido tem de ser decidido por um administrador diferente de quem o fez.');
        if (request.status !== 'pending') throw new Error('Este pedido já foi decidido.');
        const reason = decisionReason?.trim() || '';
        if (!approve && reason.length < 5) throw new Error('Indique o motivo da rejeição.');
        let resultEntryId: string | null = null;
        if (approve) {
            if (request.kind === 'writeoff') {
                const entry = await ServicoFinanceiro.writeOffCredit({ creditId: request.targetId, reason: request.reason, requestedBy: request.requestedBy,
                      requestedById: request.requestedById, approvedBy: actor.name, approvedById: actor.id, requestId:request.id, decisionReason:reason });
                  return entry.id;
            } else if (request.targetId.startsWith('payment:')) {
                const paymentId = request.targetId.slice('payment:'.length);
                const payment = (await ServicoFinanceiro.getAllPayments()).find(item => item.id === paymentId && !item.deletedAt && item.status === 'confirmed');
                const credit = payment && (await ServicoFinanceiro.getAllCredits()).find(item => item.id === payment.creditId);
                if (!payment || !credit) throw new Error('Pagamento ou crédito não encontrado para estorno.');
                const entry = await ServicoFinanceiro.reversePaymentAndUpdateCredit(payment, credit, actor.id, request.reason, request.id);
                return entry.id;
            } else {
                const entry = await ServicoFinanceiro.reverseJournalEntry({ entryId: request.targetId, reason: request.reason, actorId: actor.id, actorName: actor.name, approvedBy: actor.name, requestId: request.id });
                return entry.id;
            }
        }
        const now = new Date().toISOString();
        await db.transaction([
            {
                sql: `UPDATE accounting_requests SET status = ?, decidedBy = ?, decidedById = ?, decidedAt = ?, decisionReason = ?, resultEntryId = ?
                      WHERE id = ? AND status = 'pending'`,
                params: [approve ? 'approved' : 'rejected', actor.name, actor.id, now, reason || null, resultEntryId, request.id], expectChanges: 1
            },
            {
                sql: `INSERT INTO audit_logs (id, timestamp, userId, userName, action, entity, details, metadata)
                      VALUES (?, ?, ?, ?, 'update', 'accounting_entry', ?, ?)`,
                params: [crypto.randomUUID(), now, actor.id, actor.name,
                    `${approve ? 'Aprovou' : 'Rejeitou'} o pedido de ${request.kind === 'reversal' ? 'estorno' : 'abate'} de ${request.requestedBy}`,
                    JSON.stringify({ requestId: request.id, targetId: request.targetId, resultEntryId, reason })]
            }
        ]);
        return resultEntryId;
    }

    // ------------------------------------------------------------------ Botão de pânico
    static async getPanicLock(): Promise<PanicLock | null> {
        return ServicoFinanceiro.getPanicLock();
    }

    /** Confirma a palavra-passe do utilizador com sessão (desktop: no processo principal; web: na base local). */
    static async confirmPassword(password: string, userId: string): Promise<boolean> {
        const api = typeof window !== 'undefined' ? window.electronAPI : undefined;
        if (api?.userAuthConfirmPassword) return (await api.userAuthConfirmPassword(password)).confirmed;
        const row = await db.get<{ password?: string }>('SELECT password FROM users WHERE id = ?', [userId]);
        return Boolean(row?.password) && bcrypt.compareSync(password.trim(), String(row!.password));
    }

    static async lockPanic(reason: string, password: string, actor: Actor) {
        if (!isAdmin(actor)) throw new Error('Só administradores podem congelar a movimentação.');
        if ((reason?.trim() || '').length < 10) throw new Error('Indique o motivo do congelamento (pelo menos 10 caracteres).');
        if (!(await this.confirmPassword(password, actor.id))) throw new Error('Palavra-passe incorrecta.');
        const lock: PanicLock = { active: true, reason: reason.trim(), lockedBy: actor.name, lockedById: actor.id, lockedAt: new Date().toISOString() };
        await db.transaction([
            { sql: UPSERT_SHARED, params: [ServicoFinanceiro.PANIC_LOCK_KEY, JSON.stringify(lock), lock.lockedAt, actor.name] },
            {
                sql: `INSERT INTO audit_logs (id, timestamp, userId, userName, action, entity, details, metadata)
                      VALUES (?, ?, ?, ?, 'update', 'system', ?, ?)`,
                params: [crypto.randomUUID(), lock.lockedAt, actor.id, actor.name, `Movimentação financeira congelada: ${lock.reason}`, JSON.stringify({ panic: 'lock', reason: lock.reason })]
            }
        ]);
        return lock;
    }

    static async unlockPanic(reason: string, password: string, actor: Actor) {
        if (!isAdmin(actor)) throw new Error('Só administradores podem desbloquear a movimentação.');
        const lock = await this.getPanicLock();
        if (!lock) throw new Error('A movimentação não está congelada.');
        if (lock.lockedById === actor.id) throw new Error('O desbloqueio tem de ser feito por um administrador diferente de quem congelou.');
        if ((reason?.trim() || '').length < 10) throw new Error('Indique o motivo do desbloqueio (pelo menos 10 caracteres).');
        if (!(await this.confirmPassword(password, actor.id))) throw new Error('Palavra-passe incorrecta.');
        const now = new Date().toISOString();
        await db.transaction([
            { sql: UPSERT_SHARED, params: [ServicoFinanceiro.PANIC_LOCK_KEY, JSON.stringify({ active: false, unlockedBy: actor.name, unlockedById: actor.id, unlockedAt: now, reason: reason.trim(), previous: lock }), now, actor.name] },
            {
                sql: `INSERT INTO audit_logs (id, timestamp, userId, userName, action, entity, details, metadata)
                      VALUES (?, ?, ?, ?, 'update', 'system', ?, ?)`,
                params: [crypto.randomUUID(), now, actor.id, actor.name, `Movimentação financeira desbloqueada: ${reason.trim()}`, JSON.stringify({ panic: 'unlock', reason: reason.trim(), lockedBy: lock.lockedBy })]
            }
        ]);
    }
}
