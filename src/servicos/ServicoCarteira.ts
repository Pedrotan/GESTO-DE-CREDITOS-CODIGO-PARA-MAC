// Serviço da carteira de crédito: dados para a página (prestações, abates, contencioso, filas de aprovação,
// promessas de cobrança e produto de cada crédito), passagem automática a "Em atraso" e de volta a "Ativo",
// transferência de gestor, lembretes, reestruturação (com aprovação de outra pessoa), liquidação antecipada,
// documentos do crédito e lotes de importação anuláveis. Usa as operações financeiras existentes.
import { db } from '@/bibliotecas/bd';
import { luandaDateKey, luandaTodayKey } from '@/bibliotecas/fuso-angola';
import type { InstallmentRow } from '@/bibliotecas/carteira-credito';
import type { EarlySettlement, PlanItem } from '@/bibliotecas/liquidacao-antecipada';
import { ServicoFinanceiro } from '@/servicos/ServicoFinanceiro';
import { ServicoAuditoriaAvancada } from '@/servicos/ServicoAuditoriaAvancada';
import { ServicoCobrancaOperacional } from '@/servicos/ServicoCobrancaOperacional';
import type { Credit } from '@/tipos/credito';

type Actor = { id: string; name: string; role: string; permissions?: string[] };
type Statement = { sql: string; params: unknown[]; expectChanges?: number };

const ADMIN = ['admin', 'super_admin'];
const can = (actor: Actor, permission: string) => ADMIN.includes(actor.role) || Boolean(actor.permissions?.includes(permission));
const audit = (actor: { id: string; name: string }, action: string, details: string, metadata: Record<string, unknown>, when = new Date().toISOString()): Statement => ({
    sql: `INSERT INTO audit_logs (id, timestamp, userId, userName, action, entity, details, metadata) VALUES (?, ?, ?, ?, ?, 'credit', ?, ?)`,
    params: [crypto.randomUUID(), when, actor.id, actor.name, action, details, JSON.stringify(metadata)],
});

export type Restructuring = {
    id: string; creditId: string; kind: 'restructure' | 'early_settlement'; mode: string | null; reason: string; status: 'pending' | 'approved' | 'rejected';
    originalPlan: InstallmentRow[]; newPlan: PlanItem[]; params: Record<string, unknown>; payNowMinor: number | null;
    requestedBy: string; requestedByName: string; requestedAt: string; decidedBy: string | null; decidedByName: string | null; decidedAt: string | null; decisionReason: string | null;
};
export type CreditDocument = { id: string; creditId: string; kind: string; fileName: string; mimeType: string; dataUrl: string; uploadedAt: string; uploadedByName: string | null };
export type ImportBatch = { id: string; number: string; fileName: string | null; createdAt: string; createdBy: string; rowsCount: number; totalMinor: number; status: 'active' | 'cancelled'; cancelledAt: string | null; cancelledBy: string | null; cancelReason: string | null };

const parse = <T,>(value: unknown, fallback: T): T => { try { return value ? JSON.parse(String(value)) as T : fallback; } catch { return fallback; } };

export class ServicoCarteira {
    /** Tudo o que a carteira precisa além do que já está no contexto (créditos, pagamentos, clientes, razão). */
    static async loadContext() {
        const [installments, writeoffs, legal, escalations, promises, simulations, restructurings] = await Promise.all([
            db.all<InstallmentRow>(`SELECT id, creditId, installmentNumber, dueDate, principalMinor, interestMinor, lateInterestMinor,
                paidPrincipalMinor, paidInterestMinor, paidLateInterestMinor, status, paidAt FROM credit_installments`).catch(() => []),
            db.all<{ creditId: string }>('SELECT creditId FROM credit_writeoffs').catch(() => []),
            db.all<{ creditId: string; stage: string }>(`SELECT creditId, stage FROM legal_cases WHERE deletedAt IS NULL AND stage <> 'closed'`).catch(() => []),
            db.all<{ entityId: string }>(`SELECT entityId FROM limit_escalations WHERE entityType = 'credit' AND status = 'pending'`).catch(() => []),
            db.all<any>(`SELECT * FROM collection_events WHERE kind IN ('promise','promise_kept','promise_broken') ORDER BY createdAt`).catch(() => []),
            db.all<{ convertedCreditId: string; productId: string }>(`SELECT convertedCreditId, productId FROM simulations WHERE convertedCreditId IS NOT NULL AND productId IS NOT NULL`).catch(() => []),
            db.all<any>('SELECT * FROM credit_restructurings ORDER BY requestedAt DESC').catch(() => []),
        ]);
        // Promessas vencidas sem cumprimento registado (ou marcadas como falhadas).
        const decided = new Set(promises.filter(item => item.kind !== 'promise').map(item => item.relatedId));
        const today = luandaTodayKey();
        const brokenPromises = promises.filter(item => (item.kind === 'promise' && !decided.has(item.id) && item.promisedDate && item.promisedDate < today)
            || item.kind === 'promise_broken').map(item => ({ creditId: item.creditId, promisedDate: item.promisedDate, amountMinor: item.amountMinor }));
        return {
            installments: installments.map(item => ({ ...item, installmentNumber: Number(item.installmentNumber), principalMinor: Number(item.principalMinor), interestMinor: Number(item.interestMinor),
                lateInterestMinor: Number(item.lateInterestMinor), paidPrincipalMinor: Number(item.paidPrincipalMinor), paidInterestMinor: Number(item.paidInterestMinor), paidLateInterestMinor: Number(item.paidLateInterestMinor) })),
            writtenOffIds: new Set(writeoffs.map(item => item.creditId)),
            legalCreditIds: new Set(legal.map(item => item.creditId)),
            escalatedIds: new Set(escalations.map(item => item.entityId)),
            brokenPromises,
            productOf: new Map(simulations.map(item => [item.convertedCreditId, item.productId])),
            restructurings: restructurings.map(row => this.mapRestructuring(row)),
        };
    }

    private static mapRestructuring(row: any): Restructuring {
        return { ...row, originalPlan: parse(row.originalPlan, []), newPlan: parse(row.newPlan, []), params: parse(row.params, {}), payNowMinor: row.payNowMinor === null ? null : Number(row.payNowMinor) };
    }

    /**
     * Em atraso no dia seguinte ao vencimento de uma prestação não paga (hora de Angola); volta a Ativo quando é
     * regularizado. Só muda créditos ativos/em atraso, regista na auditoria e não mexe na versão do crédito.
     */
    static async refreshDelinquency(now: Date = new Date()) {
        const today = luandaDateKey(now);
        const credits = await db.all<{ id: string; status: string; daysOverdue: number; clientName: string }>(
            `SELECT id, status, daysOverdue, clientName FROM credits WHERE deletedAt IS NULL AND status IN ('active','overdue')`).catch(() => []);
        if (!credits.length) return { changed: 0 };
        const installments = await db.all<InstallmentRow>(`SELECT creditId, dueDate, principalMinor, interestMinor, paidPrincipalMinor, paidInterestMinor, status
            FROM credit_installments WHERE status <> 'cancelled'`).catch(() => []);
        const statements: Statement[] = [];
        const when = now.toISOString();
        for (const credit of credits) {
            const late = installments.filter(item => item.creditId === credit.id
                && Number(item.principalMinor) + Number(item.interestMinor) > Number(item.paidPrincipalMinor) + Number(item.paidInterestMinor)
                && luandaDateKey(item.dueDate) < today).map(item => luandaDateKey(item.dueDate)).sort();
            const days = late.length ? Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${late[0]}T00:00:00Z`)) / 86_400_000) : 0;
            const status = days > 0 ? 'overdue' : 'active';
            if (status === credit.status && Number(credit.daysOverdue || 0) === days) continue;
            statements.push({ sql: `UPDATE credits SET status = ?, daysOverdue = ? WHERE id = ? AND status = ? AND deletedAt IS NULL`, params: [status, days, credit.id, credit.status] });
            if (status !== credit.status) statements.push(audit({ id: 'system', name: 'Sistema' }, 'update',
                status === 'overdue' ? `Crédito ${credit.id} de ${credit.clientName} passou a Em atraso (prestação vencida a ${late[0].split('-').reverse().join('/')})` : `Crédito ${credit.id} de ${credit.clientName} regularizado: volta a Ativo`,
                { creditId: credit.id, from: credit.status, to: status, daysOverdue: days, automatic: true }, when));
        }
        if (statements.length) await db.transaction(statements);
        return { changed: statements.length };
    }

    /** Transfere um ou mais créditos para outro gestor (com motivo e histórico imutável). */
    static async transferManager(creditIds: string[], target: { id: string; name: string }, reason: string, actor: Actor) {
        if (!can(actor, 'manage_credits') && !can(actor, 'creditos.editar')) throw new Error('Sem permissão para transferir créditos.');
        await ServicoAuditoriaAvancada.assertJustification(reason, actor.id);
        if (!creditIds.length) throw new Error('Escolha pelo menos um crédito.');
        const rows = await db.all<{ id: string; usuario_id: string | null; clientName: string }>(`SELECT id, usuario_id, clientName FROM credits WHERE deletedAt IS NULL`).catch(() => []);
        const when = new Date().toISOString();
        const statements: Statement[] = [];
        for (const id of creditIds) {
            const credit = rows.find(row => row.id === id);
            if (!credit) throw new Error(`Crédito ${id} não encontrado.`);
            if (credit.usuario_id === target.id) continue;
            statements.push({ sql: `UPDATE credits SET usuario_id = ? WHERE id = ? AND deletedAt IS NULL`, params: [target.id, id], expectChanges: 1 },
                { sql: `INSERT INTO credit_manager_transfers (id, creditId, fromUserId, toUserId, toUserName, reason, actorId, actorName, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    params: [crypto.randomUUID(), id, credit.usuario_id, target.id, target.name, reason.trim(), actor.id, actor.name, when] },
                audit(actor, 'update', `Transferiu o crédito ${id} de ${credit.clientName} para o gestor ${target.name}`, { creditId: id, fromUserId: credit.usuario_id, toUserId: target.id, reason, justification: reason }, when));
        }
        if (statements.length) await db.transaction(statements);
        return statements.length / 3;
    }

    static async transfers(creditId: string) {
        return db.all<any>('SELECT * FROM credit_manager_transfers WHERE creditId = ? ORDER BY createdAt DESC', [creditId]).catch(() => []);
    }

    /** Lembretes de pagamento: ficam no histórico de cobrança de cada crédito (Hub de Cobrança). */
    static async recordReminders(creditIds: string[], channel: 'WhatsApp' | 'SMS' | 'email', actor: Actor) {
        let count = 0;
        for (const creditId of creditIds) {
            await ServicoCobrancaOperacional.record({ creditId, kind: 'contact', notes: `Lembrete de pagamento enviado por ${channel}` }, actor);
            count += 1;
        }
        return count;
    }

    // ── Reestruturação e liquidação antecipada ─────────────────────────────────────
    static async restructurings(creditId?: string): Promise<Restructuring[]> {
        const rows = creditId
            ? await db.all<any>('SELECT * FROM credit_restructurings WHERE creditId = ? ORDER BY requestedAt DESC', [creditId]).catch(() => [])
            : await db.all<any>('SELECT * FROM credit_restructurings ORDER BY requestedAt DESC').catch(() => []);
        return rows.map(row => this.mapRestructuring(row));
    }

    /** Pede uma reestruturação: fica pendente até outra pessoa (com permissão) aprovar. */
    static async requestRestructure(input: { credit: Credit; plan: PlanItem[]; replacedIds: string[]; params: Record<string, unknown>; reason: string; actor: Actor }) {
        if (!can(input.actor, 'manage_credits') && !can(input.actor, 'creditos.editar')) throw new Error('Sem permissão para reestruturar créditos.');
        await ServicoAuditoriaAvancada.assertJustification(input.reason, input.actor.id);
        if (!['active', 'overdue', 'renegotiated', 'defaulted'].includes(input.credit.status)) throw new Error('Só créditos ativos ou em atraso podem ser reestruturados.');
        if ((await this.restructurings(input.credit.id)).some(item => item.status === 'pending')) throw new Error('Já existe um pedido de reestruturação pendente para este crédito.');
        const original = await ServicoFinanceiro.getCreditInstallments(input.credit.id);
        const id = crypto.randomUUID();
        const when = new Date().toISOString();
        const approvers = await db.all<{ id: string }>(`SELECT id FROM users WHERE role IN ('admin','super_admin','credit_director') AND (status IS NULL OR status <> 'blocked')`).catch(() => []);
        await db.transaction([
            { sql: `INSERT INTO credit_restructurings (id, creditId, kind, mode, reason, status, originalPlan, newPlan, params, payNowMinor, requestedBy, requestedByName, requestedAt)
                    VALUES (?, ?, 'restructure', NULL, ?, 'pending', ?, ?, ?, NULL, ?, ?, ?)`,
                params: [id, input.credit.id, input.reason.trim(), JSON.stringify(original), JSON.stringify(input.plan), JSON.stringify({ ...input.params, replacedIds: input.replacedIds, version: input.credit.version ?? 0 }), input.actor.id, input.actor.name, when], expectChanges: 1 },
            audit(input.actor, 'update', `Pediu a reestruturação do crédito ${input.credit.id} de ${input.credit.clientName} (${input.plan.length} prestações)`, { creditId: input.credit.id, restructuringId: id, reason: input.reason, justification: input.reason }, when),
            ...approvers.filter(user => user.id !== input.actor.id).map(user => ({
                sql: `INSERT OR IGNORE INTO notifications (id, userId, title, message, type, read, timestamp) VALUES (?, ?, ?, ?, ?, 0, ?)`,
                params: [`restructure:${id}:${user.id}`, user.id, 'Reestruturação por aprovar', `${input.actor.name} pediu a reestruturação do crédito de ${input.credit.clientName}.`, 'warning', when],
            })),
        ]);
        return id;
    }

    /** Decide a reestruturação. Aprovar aplica o novo plano (o original fica guardado no pedido). */
    static async decideRestructure(id: string, approve: boolean, reason: string, actor: Actor) {
        if (!ADMIN.includes(actor.role) && actor.role !== 'credit_director') throw new Error('A reestruturação é aprovada por um administrador ou diretor.');
        const request = (await this.restructurings()).find(item => item.id === id);
        if (!request || request.status !== 'pending') throw new Error('Este pedido já não está pendente.');
        if (request.requestedBy === actor.id) throw new Error('Quem pediu a reestruturação não a pode aprovar.');
        await ServicoAuditoriaAvancada.assertJustification(reason, actor.id);
        const when = new Date().toISOString();
        const decision: Statement = { sql: `UPDATE credit_restructurings SET status = ?, decidedBy = ?, decidedByName = ?, decidedAt = ?, decisionReason = ? WHERE id = ? AND status = 'pending'`,
            params: [approve ? 'approved' : 'rejected', actor.id, actor.name, when, reason.trim(), id], expectChanges: 1 };
        if (!approve) {
            await db.transaction([decision, audit(actor, 'update', `Rejeitou a reestruturação do crédito ${request.creditId}`, { creditId: request.creditId, restructuringId: id, reason, justification: reason }, when)]);
            return;
        }
        const params = request.params as { replacedIds?: string[]; version?: number };
        await ServicoFinanceiro.applyInstallmentPlan({
            creditId: request.creditId, expectedVersion: Number(params.version ?? 0), replacedIds: params.replacedIds || [], plan: request.newPlan,
            markRestructured: true, reason: `${request.reason} (aprovado por ${actor.name}: ${reason.trim()})`, actorId: actor.id, actorName: actor.name,
            extraStatements: [decision, audit(actor, 'update', `Aprovou a reestruturação do crédito ${request.creditId}: novo plano de ${request.newPlan.length} prestações`, { creditId: request.creditId, restructuringId: id, reason, justification: reason }, when)],
        });
    }

    /**
     * Liquidação antecipada: grava o plano simulado (uma prestação com vencimento hoje com o capital antecipado e
     * os juros decorridos e, na parcial, o novo plano) e devolve o valor a pagar hoje, que o utilizador regista
     * logo a seguir no assistente de pagamento (a imputação é a de sempre: a prestação mais antiga primeiro).
     */
    static async earlySettlement(input: { credit: Credit; simulation: EarlySettlement; reason: string; actor: Actor }) {
        if (!can(input.actor, 'manage_payments') && !can(input.actor, 'pagamentos.registar')) throw new Error('Sem permissão para liquidações antecipadas.');
        await ServicoAuditoriaAvancada.assertJustification(input.reason, input.actor.id);
        const sim = input.simulation;
        const settlement: PlanItem = { number: 1, dueDate: new Date(`${sim.asOfKey}T12:00:00Z`).toISOString(), principalMinor: sim.capitalMinor, interestMinor: sim.accruedInterestMinor, totalMinor: sim.capitalMinor + sim.accruedInterestMinor };
        const plan = [settlement, ...sim.newPlan];
        const original = await ServicoFinanceiro.getCreditInstallments(input.credit.id);
        const id = crypto.randomUUID();
        const when = new Date().toISOString();
        const label = sim.kind === 'total' ? 'total' : sim.mode === 'reduce_term' ? 'parcial (reduzir prazo)' : 'parcial (reduzir prestação)';
        await ServicoFinanceiro.applyInstallmentPlan({
            creditId: input.credit.id, expectedVersion: input.credit.version ?? 0, replacedIds: sim.replacedIds, plan, markRestructured: false,
            reason: input.reason, actorId: input.actor.id, actorName: input.actor.name,
            extraStatements: [
                { sql: `INSERT INTO credit_restructurings (id, creditId, kind, mode, reason, status, originalPlan, newPlan, params, payNowMinor, requestedBy, requestedByName, requestedAt, decidedBy, decidedByName, decidedAt)
                        VALUES (?, ?, 'early_settlement', ?, ?, 'approved', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    params: [id, input.credit.id, sim.mode, input.reason.trim(), JSON.stringify(original), JSON.stringify(plan), JSON.stringify({ kind: sim.kind, capitalMinor: sim.capitalMinor, interestSavedMinor: sim.interestSavedMinor }),
                        sim.payNowMinor, input.actor.id, input.actor.name, when, input.actor.id, input.actor.name, when], expectChanges: 1 },
                audit(input.actor, 'update', `Liquidação antecipada ${label} do crédito ${input.credit.id} de ${input.credit.clientName}: a pagar hoje ${(sim.payNowMinor / 100).toLocaleString('pt-AO', { minimumFractionDigits: 2 })} Kz`,
                    { creditId: input.credit.id, restructuringId: id, payNowMinor: sim.payNowMinor, interestSavedMinor: sim.interestSavedMinor, reason: input.reason, justification: input.reason }, when),
            ],
        });
        return { id, payNowMinor: sim.payNowMinor };
    }

    // ── Documentos ─────────────────────────────────────────────────────────────────
    static async documents(creditId: string): Promise<CreditDocument[]> {
        return db.all<CreditDocument>('SELECT id, creditId, kind, fileName, mimeType, dataUrl, uploadedAt, uploadedByName FROM credit_documents WHERE creditId = ? AND deletedAt IS NULL ORDER BY uploadedAt DESC', [creditId]).catch(() => []);
    }

    static async addDocument(input: { creditId: string; kind: string; fileName: string; mimeType: string; dataUrl: string }, actor: Actor) {
        if (!/^data:(image\/(png|jpe?g|webp)|application\/pdf);base64,/.test(input.dataUrl)) throw new Error('O documento tem de ser uma imagem (PNG, JPG) ou um PDF.');
        if (input.dataUrl.length > 3_000_000) throw new Error('O documento é demasiado grande (máximo 2 MB).');
        const id = crypto.randomUUID();
        const when = new Date().toISOString();
        await db.transaction([
            { sql: `INSERT INTO credit_documents (id, creditId, kind, fileName, mimeType, dataUrl, uploadedAt, uploadedBy, uploadedByName) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                params: [id, input.creditId, input.kind, input.fileName.slice(0, 200), input.mimeType, input.dataUrl, when, actor.id, actor.name], expectChanges: 1 },
            audit(actor, 'create', `Anexou o documento «${input.fileName}» (${input.kind}) ao crédito ${input.creditId}`, { creditId: input.creditId, documentId: id }, when),
        ]);
        return id;
    }

    static async archiveDocument(id: string, creditId: string, actor: Actor) {
        const when = new Date().toISOString();
        await db.transaction([
            { sql: `UPDATE credit_documents SET deletedAt = ?, deletedBy = ? WHERE id = ? AND deletedAt IS NULL`, params: [when, actor.id, id], expectChanges: 1 },
            audit(actor, 'delete', `Arquivou um documento do crédito ${creditId}`, { creditId, documentId: id }, when),
        ]);
    }

    // ── Lotes de importação ────────────────────────────────────────────────────────
    static async batches(): Promise<ImportBatch[]> {
        return db.all<ImportBatch>('SELECT * FROM credit_import_batches ORDER BY createdAt DESC').catch(() => []);
    }

    static async batchCredits(batchId: string) {
        return db.all<{ creditId: string }>('SELECT creditId FROM credit_import_items WHERE batchId = ?', [batchId]).catch(() => []);
    }

    static async createBatch(fileName: string, actor: Actor): Promise<ImportBatch> {
        const year = luandaTodayKey().slice(0, 4);
        const last = await db.get<{ total: number }>('SELECT COUNT(*) AS total FROM credit_import_batches WHERE number LIKE ?', [`LC ${year}/%`]).catch(() => undefined);
        const batch: ImportBatch = { id: crypto.randomUUID(), number: `LC ${year}/${String((Number(last?.total) || 0) + 1).padStart(4, '0')}`, fileName: fileName.slice(0, 200),
            createdAt: new Date().toISOString(), createdBy: actor.name, rowsCount: 0, totalMinor: 0, status: 'active', cancelledAt: null, cancelledBy: null, cancelReason: null };
        await db.transaction([
            { sql: `INSERT INTO credit_import_batches (id, number, fileName, createdAt, createdBy, createdById, rowsCount, totalMinor, status) VALUES (?, ?, ?, ?, ?, ?, 0, 0, 'active')`,
                params: [batch.id, batch.number, batch.fileName, batch.createdAt, actor.name, actor.id], expectChanges: 1 },
            audit(actor, 'import', `Iniciou o lote de importação de créditos ${batch.number} (${fileName})`, { batchId: batch.id }),
        ]);
        return batch;
    }

    static async addToBatch(batchId: string, creditId: string) {
        await db.transaction([{ sql: `INSERT OR IGNORE INTO credit_import_items (batchId, creditId) VALUES (?, ?)`, params: [batchId, creditId] }]);
    }

    static async finishBatch(batchId: string, rowsCount: number, totalMinor: number) {
        await db.transaction([{ sql: `UPDATE credit_import_batches SET rowsCount = ?, totalMinor = ? WHERE id = ?`, params: [rowsCount, totalMinor, batchId] }]);
    }

    /** Anula um lote: os pedidos ainda por aprovar são cancelados; os já aprovados ficam (indicados no resultado). */
    static async cancelBatch(batchId: string, reason: string, actor: Actor) {
        await ServicoAuditoriaAvancada.assertJustification(reason, actor.id);
        const batch = (await this.batches()).find(item => item.id === batchId);
        if (!batch || batch.status !== 'active') throw new Error('Este lote já foi anulado.');
        const items = await this.batchCredits(batchId);
        const credits = await db.all<{ id: string; status: string }>(`SELECT id, status FROM credits WHERE deletedAt IS NULL`).catch(() => []);
        const pending = items.filter(item => credits.find(credit => credit.id === item.creditId)?.status === 'pending_approval');
        const kept = items.length - pending.length;
        const when = new Date().toISOString();
        await db.transaction([
            ...pending.flatMap(item => [
                { sql: `UPDATE credits SET status = 'cancelled' WHERE id = ? AND status = 'pending_approval'`, params: [item.creditId], expectChanges: 1 },
                { sql: `UPDATE limit_escalations SET status = 'cancelled', decidedAt = ?, decidedBy = ?, decidedByName = ? WHERE entityType = 'credit' AND entityId = ? AND status = 'pending'`, params: [when, actor.id, actor.name, item.creditId] },
            ]),
            { sql: `UPDATE credit_import_batches SET status = 'cancelled', cancelledAt = ?, cancelledBy = ?, cancelReason = ? WHERE id = ? AND status = 'active'`, params: [when, actor.name, reason.trim(), batchId], expectChanges: 1 },
            audit(actor, 'delete', `Anulou o lote de importação de créditos ${batch.number}: ${pending.length} pedido(s) cancelado(s)${kept ? `, ${kept} já aprovado(s) mantido(s)` : ''}`, { batchId, cancelled: pending.length, kept, reason, justification: reason }, when),
        ]);
        return { cancelled: pending.length, kept };
    }
}
