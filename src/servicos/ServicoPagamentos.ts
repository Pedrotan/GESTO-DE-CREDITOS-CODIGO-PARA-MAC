// Operações da página de Pagamentos que vão além do registo base do ServicoFinanceiro: pré-visualização da
// imputação, regras do assistente (datas, períodos fechados, duplicados, comprovativo), transferências
// pendentes de validação, anulação com segregação de funções e dupla aprovação, lotes de importação,
// comprovativos, histórico de auditoria e relatórios gerados.
import { db } from '@/bibliotecas/bd';
import type { User } from '@/tipos/autenticacao';
import type { Payment, PaymentMethod } from '@/tipos/credito';
import { calculateLateInterest } from '@/bibliotecas/juros-mora';
import { reconcileInstallments } from '@/bibliotecas/conciliacao-prestacoes';
import { allocatePaymentByInstallments, creditBalancesFromRow, type AllocationMinor } from '@/bibliotecas/saldo-credito';
import { luandaDateKey, luandaTodayKey, valueDateToIso } from '@/bibliotecas/fuso-angola';
import { PAYMENT_METHODS, receiptLabel, type InstallmentImputation, type ScheduleItem } from '@/bibliotecas/pagamentos-analise';
import { ServicoFinanceiro } from '@/servicos/ServicoFinanceiro';
import { ServicoControloAcesso } from '@/servicos/ServicoControloAcesso';
import { ServicoContabilidadeGeral } from '@/servicos/ServicoContabilidadeGeral';
import { ServicoDefinicoesPartilhadas } from '@/servicos/ServicoDefinicoesPartilhadas';
import { ServicoAuditoriaAvancada } from '@/servicos/ServicoAuditoriaAvancada';
import { ServicoAlcadas } from '@/servicos/ServicoAlcadas';
import { assertFinancialConnection } from '@/bibliotecas/ligacao-financeira';

export type Actor = Pick<User, 'id' | 'name' | 'role'> & Partial<User>;

export type PaymentsConfig = {
    /** Anulações acima deste valor (Kz) exigem a aprovação de outro administrador. */
    cancelApprovalThreshold: number;
};
const CONFIG_KEY = 'payments_config';
const DEFAULT_CONFIG: PaymentsConfig = { cancelApprovalThreshold: 500_000 };
const PAYABLE = ['active', 'overdue', 'defaulted', 'renegotiated'];
const MAX_PROOF_BYTES = 1_500_000;

export type OpenInstallment = {
    n: number; dueDateKey: string; principalMinor: number; interestMinor: number; lateMinor: number; owedMinor: number; overdue: boolean;
};

export type ImputationPreview = {
    allocation: AllocationMinor;
    detail: InstallmentImputation[];
    open: OpenInstallment[];
    /** Dívida total na data-valor (capital + juros + mora calculada até essa data), em cêntimos. */
    totalDueMinor: number;
    moraMinor: number;
    balanceAfterMinor: number;
};

export type PaymentDraft = {
    creditId: string;
    valueDateKey: string;
    amount: number;
    method: PaymentMethod;
    reference?: string;
    proof?: { fileName: string; mimeType: string; dataUrl: string } | null;
};

export type ReportHistoryItem = {
    id: string; reportType: string; title: string; format: 'pdf' | 'xlsx'; filters: string | null; fileName: string;
    generatedAt: string; generatedBy: string; generatedById: string | null;
};

export type ReportSchedule = {
    id: string; reportType: string; recipients: string; enabled: number; lastRunMonth: string | null;
    lastRunAt: string | null; lastError: string | null; createdAt: string; createdBy: string | null;
};

export type ImportBatch = {
    id: string; number: string; fileName: string | null; createdAt: string; createdBy: string; createdById: string | null;
    rowsCount: number; totalMinor: number; status: 'active' | 'cancelled'; cancelledAt: string | null; cancelledBy: string | null; cancelReason: string | null;
};

const can = (actor: Actor | null | undefined, permission: string) => ServicoControloAcesso.temPermissao(actor as any, permission);

const auditStatement = (actor: { id?: string | null; name: string }, action: string, details: string, metadata: Record<string, unknown>, when = new Date().toISOString()) => ({
    sql: `INSERT INTO audit_logs (id, timestamp, userId, userName, action, entity, details, metadata)
          VALUES (?, ?, ?, ?, ?, 'payment', ?, ?)`,
    params: [crypto.randomUUID(), when, actor.id || null, actor.name, action, details, JSON.stringify(metadata)],
});

export class ServicoPagamentos {
    // ── Configuração ────────────────────────────────────────────────────────────────
    static async getConfig(): Promise<PaymentsConfig> {
        try {
            const raw = await ServicoDefinicoesPartilhadas.get(CONFIG_KEY);
            const parsed = raw ? JSON.parse(raw) : {};
            const threshold = Number(parsed.cancelApprovalThreshold);
            return { cancelApprovalThreshold: Number.isFinite(threshold) && threshold >= 0 ? threshold : DEFAULT_CONFIG.cancelApprovalThreshold };
        } catch { return { ...DEFAULT_CONFIG }; }
    }

    static async saveConfig(config: PaymentsConfig, actor: Actor) {
        if (!can(actor, 'configuracoes.editar') && !['super_admin', 'admin'].includes(String(actor.role))) throw new Error('Sem permissão para alterar as regras de pagamentos.');
        if (!Number.isFinite(config.cancelApprovalThreshold) || config.cancelApprovalThreshold < 0) throw new Error('Indique um valor válido.');
        await ServicoDefinicoesPartilhadas.set(CONFIG_KEY, JSON.stringify({ cancelApprovalThreshold: Math.round(config.cancelApprovalThreshold * 100) / 100 }), actor.name);
    }

    // ── Dados de apoio ──────────────────────────────────────────────────────────────
    static async listPayments(): Promise<Payment[]> {
        return ServicoFinanceiro.getPaymentsForManagement();
    }

    /** Prestações de todos os contratos concedidos (base do "previsto" e do "em falta"). */
    static async loadSchedule(): Promise<ScheduleItem[]> {
        const rows = await db.all<any>(`SELECT i.creditId, c.clientId, c.clientName, i.installmentNumber, i.dueDate,
            i.principalMinor, i.interestMinor, i.lateInterestMinor, i.paidPrincipalMinor, i.paidInterestMinor, i.paidLateInterestMinor
            FROM credit_installments i JOIN credits c ON c.id = i.creditId
            WHERE c.deletedAt IS NULL AND c.status IN ('active', 'overdue', 'defaulted', 'renegotiated', 'paid')`).catch(() => []);
        return rows.map(row => ({
            creditId: row.creditId, clientId: row.clientId, clientName: row.clientName, number: Number(row.installmentNumber),
            dueDate: row.dueDate, principalMinor: Number(row.principalMinor) || 0, interestMinor: Number(row.interestMinor) || 0,
            lateInterestMinor: Number(row.lateInterestMinor) || 0, paidPrincipalMinor: Number(row.paidPrincipalMinor) || 0,
            paidInterestMinor: Number(row.paidInterestMinor) || 0, paidLateInterestMinor: Number(row.paidLateInterestMinor) || 0,
        }));
    }

    static async closedMonths(): Promise<Set<string>> {
        const rows = await db.all<{ id: string }>('SELECT id FROM closed_months').catch(() => []);
        return new Set(rows.map(row => String(row.id)));
    }

    // ── Pré-visualização da imputação (mora → juros → capital) ──────────────────────
    static async previewImputation(creditId: string, valueDateKey: string, amount?: number): Promise<ImputationPreview> {
        const row = await db.get<any>(`SELECT principalAmount, principalAmountMinor, currentBalance, currentBalanceMinor,
            accruedInterest, accruedInterestMinor, lateInterest, lateInterestMinor, status, version, lateInterestRate
            FROM credits WHERE id = ? AND deletedAt IS NULL`, [creditId]);
        if (!row) throw new Error('O contrato não foi encontrado.');
        const balances = creditBalancesFromRow(row);
        const schedule = await ServicoFinanceiro.getCreditInstallments(creditId);
        const valueDate = new Date(valueDateToIso(valueDateKey));
        // Mora calculada até à data-valor (a mesma regra que o registo aplica antes de imputar).
        let moraMinor = 0;
        const adjusted = schedule.map(item => ({ ...item }));
        if (PAYABLE.includes(String(row.status)) && Number(row.lateInterestRate) > 0) {
            const payments = await db.all<any>(`SELECT paymentDate, allocatedToPrincipalMinor, allocatedToInterestMinor, allocatedToLateInterestMinor
                FROM payments WHERE creditId = ? AND deletedAt IS NULL AND status = 'confirmed'`, [creditId]);
            const summary = calculateLateInterest({
                installments: schedule.map(item => ({ id: item.id, number: Number(item.installmentNumber), dueDate: item.dueDate, principalMinor: item.principalMinor, interestMinor: item.interestMinor })),
                payments: payments.map(payment => ({ date: payment.paymentDate, principalMinor: Number(payment.allocatedToPrincipalMinor) || 0, interestMinor: Number(payment.allocatedToInterestMinor) || 0, lateMinor: Number(payment.allocatedToLateInterestMinor) || 0 })),
                dailyRatePercent: Number(row.lateInterestRate), asOf: valueDate,
            });
            for (const item of summary.installments) {
                const target = adjusted.find(candidate => candidate.id === item.id);
                if (target && item.accruedMinor > target.lateInterestMinor) {
                    moraMinor += item.accruedMinor - target.lateInterestMinor;
                    target.lateInterestMinor = item.accruedMinor;
                }
            }
        }
        const current = { ...balances, lateInterestMinor: balances.lateInterestMinor + moraMinor };
        const totalDueMinor = current.balanceMinor + current.interestMinor + current.lateInterestMinor;
        const open: OpenInstallment[] = adjusted.map(item => {
            const principalMinor = item.principalMinor - item.paidPrincipalMinor;
            const interestMinor = item.interestMinor - item.paidInterestMinor;
            const lateMinor = item.lateInterestMinor - item.paidLateInterestMinor;
            const dueDateKey = luandaDateKey(item.dueDate);
            return { n: Number(item.installmentNumber), dueDateKey, principalMinor, interestMinor, lateMinor, owedMinor: principalMinor + interestMinor + lateMinor, overdue: dueDateKey < valueDateKey };
        }).filter(item => item.owedMinor > 0);
        const amountMinor = Math.round((Number(amount) || 0) * 100);
        if (!(amountMinor > 0)) {
            return { allocation: { principalMinor: 0, interestMinor: 0, lateInterestMinor: 0 }, detail: [], open, totalDueMinor, moraMinor, balanceAfterMinor: current.balanceMinor };
        }
        const allocation = schedule.length ? allocatePaymentByInstallments(adjusted, current, amountMinor) : {
            lateInterestMinor: Math.min(amountMinor, current.lateInterestMinor),
            interestMinor: Math.min(Math.max(0, amountMinor - current.lateInterestMinor), current.interestMinor),
            principalMinor: Math.max(0, amountMinor - current.lateInterestMinor - current.interestMinor),
        };
        // Prestações tocadas: conciliação antes e depois (mesma regra usada no registo).
        const sum = (key: 'paidPrincipalMinor' | 'paidInterestMinor' | 'paidLateInterestMinor') => adjusted.reduce((total, item) => total + item[key], 0);
        const base = { principalMinor: sum('paidPrincipalMinor'), interestMinor: sum('paidInterestMinor'), lateInterestMinor: sum('paidLateInterestMinor') };
        const forReconcile = adjusted.map(item => ({ id: item.id, dueDate: item.dueDate, principalMinor: item.principalMinor, interestMinor: item.interestMinor, lateInterestMinor: item.lateInterestMinor, version: item.version }));
        const before = reconcileInstallments(forReconcile, base, valueDate).installments;
        const after = reconcileInstallments(forReconcile, {
            principalMinor: base.principalMinor + allocation.principalMinor,
            interestMinor: base.interestMinor + allocation.interestMinor,
            lateInterestMinor: base.lateInterestMinor + allocation.lateInterestMinor,
        }, valueDate).installments;
        const detail = after.map(item => {
            const previous = before.find(candidate => candidate.id === item.id)!;
            const number = adjusted.find(candidate => candidate.id === item.id)?.installmentNumber;
            return {
                n: Number(number) || 0, settled: item.status === 'paid',
                principalMinor: item.paidPrincipalMinor - previous.paidPrincipalMinor,
                interestMinor: item.paidInterestMinor - previous.paidInterestMinor,
                lateMinor: item.paidLateInterestMinor - previous.paidLateInterestMinor,
            };
        }).filter(item => item.principalMinor || item.interestMinor || item.lateMinor);
        return { allocation, detail, open, totalDueMinor, moraMinor, balanceAfterMinor: current.balanceMinor - allocation.principalMinor };
    }

    // ── Regras do assistente ────────────────────────────────────────────────────────
    /**
     * Erros (bloqueiam) e avisos (exigem confirmação explícita) de um pagamento antes de o registar.
     */
    static async checkDraft(draft: PaymentDraft, actor: Actor, existing: Array<{ clientId: string; valueDateKey: string; total: number; status: string }>, clientId: string) {
        const errors: string[] = [];
        const warnings: string[] = [];
        const today = luandaTodayKey();
        const credit = await db.get<any>('SELECT id, status FROM credits WHERE id = ? AND deletedAt IS NULL', [draft.creditId]);
        if (!credit) errors.push('Escolha um contrato válido.');
        else if (!PAYABLE.includes(String(credit.status))) errors.push('Este contrato não está activo e não pode receber pagamentos.');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.valueDateKey)) errors.push('Indique a data-valor.');
        else {
            if (draft.valueDateKey > today) errors.push('A data-valor não pode ser futura.');
            const closed = await this.closedMonths();
            if (closed.has(draft.valueDateKey.slice(0, 7))) errors.push(`O período ${draft.valueDateKey.slice(5, 7)}/${draft.valueDateKey.slice(0, 4)} está fechado: não pode registar pagamentos com esta data-valor.`);
            if (draft.valueDateKey < today && !can(actor, 'pagamentos.data_retroativa')) errors.push('Datas retroactivas exigem a permissão «Pagamentos › Registar com data retroactiva».');
        }
        const amountMinor = Math.round((Number(draft.amount) || 0) * 100);
        if (!(amountMinor > 0)) errors.push('O valor tem de ser maior que zero.');
        if (credit && amountMinor > 0 && /^\d{4}-\d{2}-\d{2}$/.test(draft.valueDateKey)) {
            const preview = await this.previewImputation(draft.creditId, draft.valueDateKey).catch(() => null);
            if (preview && amountMinor > preview.totalDueMinor) errors.push(`O valor excede a dívida total do contrato na data-valor (${(preview.totalDueMinor / 100).toLocaleString('pt-AO', { minimumFractionDigits: 2 })} Kz).`);
        }
        if (!PAYMENT_METHODS[draft.method]) errors.push('Escolha o método de pagamento.');
        // Alçada de recebimento em numerário (o mesmo controlo é repetido na transacção do registo).
        if (draft.method === 'cash' && amountMinor > 0) {
            const limitActor = await ServicoAlcadas.actorOf(actor.id);
            if (limitActor) {
                const plan = await ServicoAlcadas.plan({ actor: limitActor, operationType: 'cash_receipt', amountMinor, entityType: 'payment', entityId: 'rascunho' }).catch(() => null);
                if (plan && plan.evaluation.decision !== 'allow') errors.push(...plan.evaluation.reasons.map(reason => `${reason}.`));
            }
        }
        else if (PAYMENT_METHODS[draft.method].proofRequired && !draft.proof) errors.push(`O comprovativo é obrigatório para ${PAYMENT_METHODS[draft.method].label.toLowerCase()}.`);
        if (draft.proof && draft.proof.dataUrl.length > MAX_PROOF_BYTES * 1.4) errors.push('O comprovativo é demasiado grande (máximo 1,5 MB).');
        if (existing.some(row => row.status !== 'cancelled' && row.clientId === clientId && row.valueDateKey === draft.valueDateKey && Math.round(row.total * 100) === amountMinor)) {
            warnings.push('Já existe um pagamento deste cliente com o mesmo valor neste dia. Confirme que não é um duplicado.');
        }
        return { errors, warnings };
    }

    /** Dados comuns do pagamento a gravar (id e chave de idempotência vêm do assistente). */
    static buildPayment(draft: PaymentDraft, input: { id: string; idempotencyKey: string; clientName: string; actor: Actor; batchId?: string | null }): Payment {
        const needsValidation = PAYMENT_METHODS[draft.method]?.needsValidation;
        return {
            id: input.id, idempotencyKey: input.idempotencyKey, creditId: draft.creditId, clientName: input.clientName,
            amount: Math.round(Number(draft.amount) * 100) / 100, allocatedToPrincipal: 0, allocatedToInterest: 0, allocatedToLateInterest: 0,
            method: draft.method, reference: draft.reference?.trim() || undefined,
            paymentDate: new Date(valueDateToIso(draft.valueDateKey)), registeredAt: new Date().toISOString(),
            processedBy: input.actor.name, usuario_id: input.actor.id, status: needsValidation ? 'pending' : 'confirmed',
            batchId: input.batchId || null, hasProof: draft.proof ? 1 : 0,
        };
    }

    /** Transferências e depósitos: entram como pendentes de validação (sem imputação nem lançamento). */
    static async registerPending(payment: Payment, proof?: PaymentDraft['proof']) {
        await assertFinancialConnection('registar o pagamento');
        const existing = await db.get<{ id: string }>('SELECT id FROM payments WHERE idempotencyKey = ?', [payment.idempotencyKey || payment.id]);
        if (existing) return { duplicate: true };
        const now = new Date().toISOString();
        await db.transaction([
            {
                sql: `INSERT INTO payments (id, creditId, clientName, amount, amountMinor, paymentDate, method, reference,
                      allocatedToPrincipal, allocatedToPrincipalMinor, allocatedToInterest, allocatedToInterestMinor,
                      allocatedToLateInterest, allocatedToLateInterestMinor, idempotencyKey, processedBy, status, usuario_id,
                      registeredAt, batchId, hasProof)
                      VALUES (?,?,?,?,?,?,?,?,0,0,0,0,0,0,?,?,'pending',?,?,?,?)`,
                params: [payment.id, payment.creditId, payment.clientName, payment.amount, Math.round(payment.amount * 100),
                    new Date(payment.paymentDate).toISOString(), payment.method, payment.reference || null,
                    payment.idempotencyKey || payment.id, payment.processedBy, payment.usuario_id || null,
                    payment.registeredAt ? new Date(payment.registeredAt).toISOString() : now, payment.batchId || null, proof ? 1 : 0],
                expectChanges: 1,
            },
            ...(proof ? [this.proofStatement(payment.id, proof, payment.processedBy, now)] : []),
            auditStatement({ id: payment.usuario_id, name: payment.processedBy }, 'create',
                `Pagamento registado como pendente de validação no crédito ${payment.creditId}`,
                { paymentId: payment.id, creditId: payment.creditId, method: payment.method, amountMinor: Math.round(payment.amount * 100), idempotencyKey: payment.idempotencyKey || payment.id }, now),
        ]);
        return { duplicate: false };
    }

    private static proofStatement(paymentId: string, proof: NonNullable<PaymentDraft['proof']>, uploadedBy: string, when: string) {
        if (!/^data:(image\/(png|jpe?g|webp)|application\/pdf);base64,/.test(proof.dataUrl)) throw new Error('O comprovativo tem de ser uma imagem (PNG, JPG) ou um PDF.');
        return {
            sql: `INSERT OR REPLACE INTO payment_proofs (paymentId, fileName, mimeType, dataUrl, uploadedAt, uploadedBy) VALUES (?, ?, ?, ?, ?, ?)`,
            params: [paymentId, proof.fileName.slice(0, 200), proof.mimeType, proof.dataUrl, when, uploadedBy],
        };
    }

    /** Guarda o comprovativo de um pagamento confirmado (depois do registo, na mesma operação do assistente). */
    static async attachProof(paymentId: string, proof: NonNullable<PaymentDraft['proof']>, actor: Actor) {
        const now = new Date().toISOString();
        await db.transaction([
            this.proofStatement(paymentId, proof, actor.name, now),
            { sql: 'UPDATE payments SET hasProof = 1 WHERE id = ?', params: [paymentId] },
        ]);
    }

    static async getProof(paymentId: string) {
        return db.get<{ fileName: string; mimeType: string; dataUrl: string; uploadedAt: string; uploadedBy: string }>(
            'SELECT fileName, mimeType, dataUrl, uploadedAt, uploadedBy FROM payment_proofs WHERE paymentId = ?', [paymentId]).catch(() => undefined);
    }

    // ── Validação de transferências ─────────────────────────────────────────────────
    static async validatePending(paymentId: string, actor: Actor) {
        if (!can(actor, 'pagamentos.validar_transferencia')) throw new Error('Sem permissão para validar transferências (Pagamentos › Validar transferências).');
        const payment = (await this.listPayments()).find(item => item.id === paymentId);
        if (!payment || payment.status !== 'pending') throw new Error('O pagamento já não está pendente de validação.');
        const credit = await db.get<any>('SELECT clientId, version FROM credits WHERE id = ? AND deletedAt IS NULL', [payment.creditId]);
        if (!credit) throw new Error('O contrato do pagamento não foi encontrado.');
        return ServicoFinanceiro.addPaymentAndUpdateCredit({ ...payment, status: 'confirmed' }, Number(credit.version ?? 0), credit.clientId,
            { confirmPending: { id: actor.id, name: actor.name } });
    }

    // ── Anulação ────────────────────────────────────────────────────────────────────
    /**
     * Anula um pagamento: exige permissão própria, motivo e que quem anula não seja quem registou. Nada é
     * apagado: o pagamento fica "Anulado", é gerado o estorno e a imputação é revertida. Acima do limite
     * configurado, fica um pedido para outro administrador aprovar.
     */
    static async cancel(paymentId: string, reason: string, actor: Actor): Promise<{ status: 'cancelled' | 'requested' }> {
        const text = (reason || '').trim();
        await ServicoAuditoriaAvancada.assertJustification(text, actor.id);
        if (!can(actor, 'pagamentos.anular_pagamento')) throw new Error('Sem permissão para anular pagamentos (Pagamentos › Anular pagamento).');
        const payment = (await this.listPayments()).find(item => item.id === paymentId);
        if (!payment) throw new Error('Pagamento não encontrado.');
        if (payment.status === 'cancelled') throw new Error('Este pagamento já está anulado.');
        ServicoControloAcesso.verificarSegregacaoQuatroOlhos('anular_pagamento', actor as any, { processadoPorId: payment.usuario_id });
        const now = new Date().toISOString();
        if (payment.status === 'pending') {
            await db.transaction([
                {
                    sql: `UPDATE payments SET status = 'cancelled', cancelledAt = ?, cancelledBy = ?, cancelReason = ?
                          WHERE id = ? AND status = 'pending' AND deletedAt IS NULL`,
                    params: [now, actor.name, text, paymentId], expectChanges: 1,
                },
                auditStatement(actor, 'delete', `Anulou o pagamento pendente ${paymentId}`, { paymentId, creditId: payment.creditId, reason: text }, now),
            ]);
            return { status: 'cancelled' };
        }
        const config = await this.getConfig();
        // Alçada de anulação (valor e número por dia): acima dela, o pedido vai para um segundo administrador.
        const limitActor = await ServicoAlcadas.actorOf(actor.id);
        const limitPlan = limitActor ? await ServicoAlcadas.plan({ actor: limitActor, operationType: 'payment_reversal', amountMinor: Math.round(payment.amount * 100), entityType: 'payment', entityId: paymentId }) : null;
        const overLimit = limitPlan && limitPlan.evaluation.decision !== 'allow';
        if (payment.amount > config.cancelApprovalThreshold || overLimit) {
            await ServicoContabilidadeGeral.createRequest({
                kind: 'reversal', targetId: `payment:${paymentId}`, amountMinor: Math.round(payment.amount * 100),
                description: `Anulação do recibo ${receiptLabel(payment) || paymentId} de ${payment.clientName}${overLimit ? ` (${limitPlan!.evaluation.reasons[0]})` : ''}`, reason: text,
            }, { id: actor.id, name: actor.name, role: actor.role } as any);
            return { status: 'requested' };
        }
        await this.executeCancellation(payment, actor, text);
        return { status: 'cancelled' };
    }

    private static async executeCancellation(payment: Payment, actor: Actor, reason: string, requestId?: string) {
        const credit = (await ServicoFinanceiro.getAllCredits()).find(item => item.id === payment.creditId);
        if (!credit) throw new Error('O contrato do pagamento não foi encontrado.');
        await ServicoFinanceiro.reversePaymentAndUpdateCredit(payment, credit, actor.id, reason, requestId);
        // Sem este pagamento a dívida fica mais antiga: a mora é recalculada até hoje.
        await ServicoFinanceiro.postAccruedLateInterest(payment.creditId, new Date(), { id: actor.id, name: actor.name }).catch(() => undefined);
    }

    /** Pedidos de anulação à espera de um segundo administrador. */
    static async pendingCancellationRequests() {
        const requests = await ServicoContabilidadeGeral.listRequests();
        return requests.filter(request => request.status === 'pending' && request.kind === 'reversal' && String(request.targetId).startsWith('payment:'));
    }

    static async decideCancellation(request: any, approve: boolean, decisionReason: string, actor: Actor) {
        await ServicoContabilidadeGeral.decideRequest(request, approve, decisionReason, { id: actor.id, name: actor.name, role: actor.role } as any, {
            reversePayment: async () => undefined,
        });
        if (approve) {
            const paymentId = String(request.targetId).slice('payment:'.length);
            const payment = (await this.listPayments()).find(item => item.id === paymentId);
            if (payment) await ServicoFinanceiro.postAccruedLateInterest(payment.creditId, new Date(), { id: actor.id, name: actor.name }).catch(() => undefined);
        }
    }

    // ── Lotes de importação ─────────────────────────────────────────────────────────
    static async createBatch(fileName: string, actor: Actor): Promise<ImportBatch> {
        const year = luandaTodayKey().slice(0, 4);
        const last = await db.get<{ total: number }>('SELECT COUNT(*) AS total FROM payment_import_batches WHERE number LIKE ?', [`LT ${year}/%`]);
        const batch: ImportBatch = {
            id: crypto.randomUUID(), number: `LT ${year}/${String((Number(last?.total) || 0) + 1).padStart(4, '0')}`, fileName: fileName.slice(0, 200),
            createdAt: new Date().toISOString(), createdBy: actor.name, createdById: actor.id, rowsCount: 0, totalMinor: 0,
            status: 'active', cancelledAt: null, cancelledBy: null, cancelReason: null,
        };
        await db.transaction([
            {
                sql: `INSERT INTO payment_import_batches (id, number, fileName, createdAt, createdBy, createdById, rowsCount, totalMinor, status)
                      VALUES (?, ?, ?, ?, ?, ?, 0, 0, 'active')`,
                params: [batch.id, batch.number, batch.fileName, batch.createdAt, batch.createdBy, batch.createdById], expectChanges: 1,
            },
            auditStatement(actor, 'import', `Importação de pagamentos: lote ${batch.number} (${batch.fileName})`, { batchId: batch.id }, batch.createdAt),
        ]);
        return batch;
    }

    static async finishBatch(batchId: string, rowsCount: number, totalMinor: number) {
        await db.run('UPDATE payment_import_batches SET rowsCount = ?, totalMinor = ? WHERE id = ?', [rowsCount, totalMinor, batchId]);
    }

    static async listBatches(): Promise<ImportBatch[]> {
        return db.all<ImportBatch>('SELECT * FROM payment_import_batches ORDER BY createdAt DESC').catch(() => []);
    }

    /** Anula o lote inteiro (importado por engano): cada pagamento é anulado com estorno. */
    static async cancelBatch(batchId: string, reason: string, actor: Actor) {
        const text = (reason || '').trim();
        await ServicoAuditoriaAvancada.assertJustification(text, actor.id);
        if (!can(actor, 'pagamentos.anular_pagamento')) throw new Error('Sem permissão para anular pagamentos.');
        const batch = await db.get<ImportBatch>('SELECT * FROM payment_import_batches WHERE id = ?', [batchId]);
        if (!batch || batch.status !== 'active') throw new Error('O lote não existe ou já foi anulado.');
        ServicoControloAcesso.verificarSegregacaoQuatroOlhos('anular_pagamento', actor as any, { processadoPorId: batch.createdById || undefined });
        const payments = (await this.listPayments()).filter(item => item.batchId === batchId && item.status !== 'cancelled')
            .sort((a, b) => String(b.registeredAt || '').localeCompare(String(a.registeredAt || '')));
        const now = new Date().toISOString();
        for (const payment of payments) {
            if (payment.status === 'pending') {
                await db.run(`UPDATE payments SET status = 'cancelled', cancelledAt = ?, cancelledBy = ?, cancelReason = ?
                              WHERE id = ? AND status = 'pending' AND deletedAt IS NULL`, [now, actor.name, `Lote ${batch.number}: ${text}`, payment.id]);
            } else {
                await this.executeCancellation(payment, actor, `Lote ${batch.number}: ${text}`);
            }
        }
        await db.transaction([
            {
                sql: `UPDATE payment_import_batches SET status = 'cancelled', cancelledAt = ?, cancelledBy = ?, cancelReason = ?
                      WHERE id = ? AND status = 'active'`,
                params: [now, actor.name, text, batchId], expectChanges: 1,
            },
            auditStatement(actor, 'delete', `Anulou o lote de importação ${batch.number} (${payments.length} pagamento(s))`, { batchId, reason: text }, now),
        ]);
        return payments.length;
    }

    // ── Detalhe ─────────────────────────────────────────────────────────────────────
    static async auditTrail(paymentId: string) {
        return db.all<{ id: string; timestamp: string; userName: string; action: string; details: string; metadata: string }>(
            `SELECT id, timestamp, userName, action, details, metadata FROM audit_logs
             WHERE entity = 'payment' AND (metadata LIKE ? OR details LIKE ?) ORDER BY timestamp`,
            [`%"paymentId":"${paymentId}"%`, `%${paymentId}%`]).catch(() => []);
    }

    static async accountingEntries(paymentId: string) {
        return db.all<{ id: string; timestamp: string; type: string; description: string; debit: string; credit: string; amountTotal: number; justification: string | null }>(
            `SELECT id, timestamp, type, description, debit, credit, amountTotal, justification FROM accounting_entries
             WHERE paymentId = ? ORDER BY timestamp`, [paymentId]).catch(() => []);
    }

    /** Estado da conciliação com os extractos bancários importados em Contabilidade. */
    static async bankReconciliation(payment: Payment): Promise<{ state: 'not_applicable' | 'matched' | 'unmatched'; detail: string }> {
        if (payment.method === 'cash') return { state: 'not_applicable', detail: 'Numerário: conferido no fecho de caixa.' };
        if (payment.status !== 'confirmed') return { state: 'unmatched', detail: 'Ainda não confirmado.' };
        const imports = await db.all<{ fileName: string; movements: string }>('SELECT fileName, movements FROM accounting_bank_imports').catch(() => []);
        const dateKey = luandaDateKey(payment.paymentDate);
        const amountMinor = Math.round(payment.amount * 100);
        for (const item of imports) {
            try {
                const movements = JSON.parse(item.movements) as Array<{ date: string; amountMinor: number; reference: string }>;
                const found = movements.find(movement => String(movement.date).slice(0, 10) === dateKey && Number(movement.amountMinor) === amountMinor
                    && (!payment.reference || !movement.reference || String(movement.reference).toLowerCase().includes(payment.reference.toLowerCase()) || payment.reference.toLowerCase().includes(String(movement.reference).toLowerCase())));
                if (found) return { state: 'matched', detail: `Conciliado com o extracto «${item.fileName}».` };
            } catch { /* extracto ilegível: ignorado */ }
        }
        return { state: 'unmatched', detail: imports.length ? 'Sem movimento correspondente nos extractos importados.' : 'Nenhum extracto bancário importado em Contabilidade.' };
    }

    // ── Relatórios gerados ──────────────────────────────────────────────────────────
    static async saveReport(input: { reportType: string; title: string; format: 'pdf' | 'xlsx'; filters: Record<string, unknown>; fileName: string; dataUrl: string }, actor: Actor) {
        const now = new Date().toISOString();
        const id = crypto.randomUUID();
        // Ficheiros acima de ~6 MB não são guardados (o registo e a auditoria ficam na mesma).
        const data = input.dataUrl.length < 8_000_000 ? input.dataUrl : null;
        await db.transaction([
            {
                sql: `INSERT INTO report_history (id, reportType, title, format, filters, fileName, fileData, generatedAt, generatedBy, generatedById)
                      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                params: [id, input.reportType, input.title, input.format, JSON.stringify(input.filters), input.fileName, data, now, actor.name, actor.id],
            },
            {
                sql: `INSERT INTO audit_logs (id, timestamp, userId, userName, action, entity, details, metadata)
                      VALUES (?, ?, ?, ?, 'export', 'report', ?, ?)`,
                params: [crypto.randomUUID(), now, actor.id, actor.name, `Gerou o relatório «${input.title}» (${input.format.toUpperCase()})`,
                    JSON.stringify({ reportId: id, reportType: input.reportType, filters: input.filters })],
            },
        ]);
        return id;
    }

    static async listReports(): Promise<ReportHistoryItem[]> {
        return db.all<ReportHistoryItem>(`SELECT id, reportType, title, format, filters, fileName, generatedAt, generatedBy, generatedById
            FROM report_history ORDER BY generatedAt DESC LIMIT 200`).catch(() => []);
    }

    static async reportFile(id: string) {
        return db.get<{ fileName: string; fileData: string | null; format: string }>('SELECT fileName, fileData, format FROM report_history WHERE id = ?', [id]);
    }

    // ── Envio automático ────────────────────────────────────────────────────────────
    static async listSchedules(): Promise<ReportSchedule[]> {
        return db.all<ReportSchedule>('SELECT * FROM report_schedules ORDER BY createdAt').catch(() => []);
    }

    static async saveSchedule(input: { id?: string; reportType: string; recipients: string[]; enabled: boolean }, actor: Actor) {
        const recipients = input.recipients.map(item => item.trim()).filter(Boolean);
        if (!recipients.length) throw new Error('Indique pelo menos um destinatário.');
        if (recipients.some(email => !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email))) throw new Error('Há endereços de email inválidos.');
        const id = input.id || crypto.randomUUID();
        await db.run(`INSERT INTO report_schedules (id, reportType, recipients, enabled, createdAt, createdBy) VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET reportType = excluded.reportType, recipients = excluded.recipients, enabled = excluded.enabled`,
            [id, input.reportType, recipients.join(', '), input.enabled ? 1 : 0, new Date().toISOString(), actor.name]);
        return id;
    }

    static async deleteSchedule(id: string) {
        await db.run('DELETE FROM report_schedules WHERE id = ?', [id]);
    }

    static async markScheduleRun(id: string, monthKey: string, error: string | null) {
        await db.run('UPDATE report_schedules SET lastRunMonth = ?, lastRunAt = ?, lastError = ? WHERE id = ?',
            [error ? null : monthKey, new Date().toISOString(), error, id]);
    }
}
