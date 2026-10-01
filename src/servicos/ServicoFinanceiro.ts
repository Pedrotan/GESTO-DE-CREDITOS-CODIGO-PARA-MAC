import { RepositorioCredito } from '@/repositorios/RepositorioCredito';
import { RepositorioPagamento } from '@/repositorios/RepositorioPagamento';
import { db } from '@/bibliotecas/bd';
import { AccountingEntry, Credit, Payment } from '@/tipos/credito';
import { CreditEntity } from '@/dominio/entidade/Credito';
import { buildChargeAdjustmentEntry, buildDisbursementAccountingEntry, buildPaymentAccountingEntry, buildPaymentCorrectionEntry } from '@/bibliotecas/ledger-financeiro';
import { toMinorUnits } from '@/bibliotecas/ledger-financeiro';
import { planearAjusteEncargos, type EncargoPrestacao } from '@/bibliotecas/ajuste-encargos';
import { buildInstallmentSchedule } from '@/bibliotecas/cronograma-prestacoes';
import { reconcileInstallments } from '@/bibliotecas/conciliacao-prestacoes';
import { planConsecutiveInstallments, type InstallmentBalance } from '@/bibliotecas/liquidacao-prestacoes';

export class ServicoFinanceiro {
    private static async installmentReconciliationStatements(
        creditId: string,
        options: { add?: Payment; excludePaymentId?: string; includePaymentId?: string },
        timestamp: Date
    ) {
        const schedule = await db.all<any>(`SELECT id, dueDate, principalMinor, interestMinor,
            lateInterestMinor, status, paidAt, version FROM credit_installments WHERE creditId = ? ORDER BY installmentNumber`, [creditId]);
        if (schedule.length === 0) return { statements: [] as any[], paidInstallments: 0 };
        const activePayments = await db.all<any>(`SELECT id, allocatedToPrincipalMinor, allocatedToInterestMinor,
            allocatedToLateInterestMinor, deletedAt, status FROM payments WHERE creditId = ?`, [creditId]);
        const selected = activePayments.filter(payment => {
            if (options.excludePaymentId && payment.id === options.excludePaymentId) return false;
            if (options.includePaymentId && payment.id === options.includePaymentId) return true;
            return !payment.deletedAt && payment.status === 'confirmed';
        });
        if (options.add) selected.push({
            id: options.add.id,
            allocatedToPrincipalMinor: toMinorUnits(options.add.allocatedToPrincipal || 0),
            allocatedToInterestMinor: toMinorUnits(options.add.allocatedToInterest || 0),
            allocatedToLateInterestMinor: toMinorUnits(options.add.allocatedToLateInterest || 0)
        });
        const totals = selected.reduce((sum, payment) => ({
            principalMinor: sum.principalMinor + Number(payment.allocatedToPrincipalMinor || 0),
            interestMinor: sum.interestMinor + Number(payment.allocatedToInterestMinor || 0),
            lateInterestMinor: sum.lateInterestMinor + Number(payment.allocatedToLateInterestMinor || 0)
        }), { principalMinor: 0, interestMinor: 0, lateInterestMinor: 0 });
        const reconciled = reconcileInstallments(schedule.map(item => ({
            ...item,
            principalMinor: Number(item.principalMinor),
            interestMinor: Number(item.interestMinor),
            lateInterestMinor: Number(item.lateInterestMinor),
            version: Number(item.version)
        })), totals, timestamp);
        return {
            paidInstallments: reconciled.paidInstallments,
            statements: reconciled.installments.map(item => ({
                sql: `UPDATE credit_installments SET paidPrincipalMinor = ?, paidInterestMinor = ?,
                      paidLateInterestMinor = ?, status = ?, paidAt = ?, version = version + 1
                      WHERE id = ? AND version = ?`,
                params: [item.paidPrincipalMinor, item.paidInterestMinor, item.paidLateInterestMinor,
                    item.status, item.status === 'paid' && schedule.find(previous => previous.id === item.id)?.status === 'paid'
                        ? schedule.find(previous => previous.id === item.id)?.paidAt || item.paidAt : item.paidAt,
                    item.id, item.version],
                expectChanges: 1
            }))
        };
    }

    private static accountingInsert(entry: any) {
        return {
            sql: `INSERT INTO accounting_entries
                  (id, timestamp, type, description, clientId, creditId, paymentId, debit, credit,
                   amountPrincipal, amountInterest, amountLateInterest, amountTotal,
                   amountPrincipalMinor, amountInterestMinor, amountLateInterestMinor, amountTotalMinor,
                   processedBy, justification, integrityHash, previousHash, hashVersion, usuario_id)
                  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            params: [
                entry.id, entry.timestampIso, entry.type, entry.description, entry.clientId || null,
                entry.creditId, entry.paymentId, entry.debit, entry.credit, entry.amountPrincipal,
                entry.amountInterest, entry.amountLateInterest, entry.amountTotal,
                entry.amountPrincipalMinor, entry.amountInterestMinor, entry.amountLateInterestMinor,
                entry.amountTotalMinor, entry.processedBy, entry.justification || null,
                entry.integrityHash, entry.previousHash, entry.hashVersion || 2, entry.usuario_id || null
            ]
        };
    }

    private static ledgerStatements(entry: any) {
        if (entry.type === 'interest_accrual' || entry.type === 'late_interest') {
            return [
                {
                    sql: `INSERT INTO ledger_transactions
                          (id, timestamp, type, sourceType, sourceId, description, totalDebitMinor,
                           totalCreditMinor, integrityHash, previousHash, hashVersion, usuario_id)
                          VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
                    params: [entry.id, entry.timestampIso, entry.type, 'credit_adjustment', entry.id,
                        entry.description, entry.amountTotalMinor, entry.amountTotalMinor, entry.integrityHash,
                        entry.previousHash, entry.hashVersion || 2, entry.usuario_id || null]
                },
                { sql: `INSERT INTO ledger_lines (id, transactionId, account, side, component, amountMinor)
                        VALUES (?,?,?,?,?,?)`, params: [`${entry.id}:line:1`, entry.id, entry.debit, 'debit', entry.type, entry.amountTotalMinor] },
                { sql: `INSERT INTO ledger_lines (id, transactionId, account, side, component, amountMinor)
                        VALUES (?,?,?,?,?,?)`, params: [`${entry.id}:line:2`, entry.id, entry.credit, 'credit', entry.type, entry.amountTotalMinor] }
            ];
        }
        if (entry.type === 'disbursement') {
            return [
                {
                    sql: `INSERT INTO ledger_transactions
                          (id, timestamp, type, sourceType, sourceId, description, totalDebitMinor,
                           totalCreditMinor, integrityHash, previousHash, hashVersion, usuario_id)
                          VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
                    params: [entry.id, entry.timestampIso, entry.type, entry.sourceType || 'credit_reinforcement', entry.sourceId,
                        entry.description, entry.amountTotalMinor, entry.amountTotalMinor, entry.integrityHash,
                        entry.previousHash, entry.hashVersion || 2, entry.usuario_id || null]
                },
                { sql: `INSERT INTO ledger_lines (id, transactionId, account, side, component, amountMinor)
                        VALUES (?,?,?,?,?,?)`, params: [`${entry.id}:line:1`, entry.id, 'portfolio', 'debit', 'principal', entry.amountTotalMinor] },
                { sql: `INSERT INTO ledger_lines (id, transactionId, account, side, component, amountMinor)
                        VALUES (?,?,?,?,?,?)`, params: [`${entry.id}:line:2`, entry.id, 'cash', 'credit', 'settlement', entry.amountTotalMinor] }
            ];
        }
        const isReversal = entry.type === 'reversal';
        const componentLines = [
            ['principal', 'portfolio', entry.amountPrincipalMinor],
            ['interest', 'revenue_interest', entry.amountInterestMinor],
            ['late_interest', 'revenue_late_interest', entry.amountLateInterestMinor]
        ].filter(([, , amount]) => Number(amount) > 0);
        const lines = isReversal
            ? [...componentLines.map(([component, account, amount]) => ({ component, account, amount, side: 'debit' })),
                { component: 'settlement', account: 'cash', amount: entry.amountTotalMinor, side: 'credit' }]
            : [{ component: 'settlement', account: 'cash', amount: entry.amountTotalMinor, side: 'debit' },
                ...componentLines.map(([component, account, amount]) => ({ component, account, amount, side: 'credit' }))];
        return [
            {
                sql: `INSERT INTO ledger_transactions
                      (id, timestamp, type, sourceType, sourceId, description, totalDebitMinor,
                       totalCreditMinor, integrityHash, previousHash, hashVersion, usuario_id)
                      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
                params: [entry.id, entry.timestampIso, entry.type, 'payment', entry.paymentId,
                    entry.description, entry.amountTotalMinor, entry.amountTotalMinor,
                    entry.integrityHash, entry.previousHash, entry.hashVersion || 2, entry.usuario_id || null]
            },
            ...lines.map((line, index) => ({
                sql: `INSERT INTO ledger_lines (id, transactionId, account, side, component, amountMinor)
                      VALUES (?,?,?,?,?,?)`,
                params: [`${entry.id}:line:${index + 1}`, entry.id, line.account, line.side, line.component, line.amount]
            }))
        ];
    }

    private static async previousAccountingHash() {
        const lastEntry = await db.get<{ integrityHash?: string }>(
            'SELECT integrityHash FROM accounting_entries ORDER BY rowid DESC LIMIT 1'
        );
        return lastEntry?.integrityHash || '0'.repeat(64);
    }

    static async getCreditInstallments(creditId: string): Promise<InstallmentBalance[]> {
        const rows = await db.all<InstallmentBalance>(`SELECT id, installmentNumber, dueDate, principalMinor,
            interestMinor, lateInterestMinor, paidPrincipalMinor, paidInterestMinor,
            paidLateInterestMinor, status, paidAt, version
            FROM credit_installments WHERE creditId = ? ORDER BY installmentNumber`, [creditId]);
        return rows.map(item => ({ ...item,
            principalMinor: Number(item.principalMinor), interestMinor: Number(item.interestMinor),
            lateInterestMinor: Number(item.lateInterestMinor), paidPrincipalMinor: Number(item.paidPrincipalMinor),
            paidInterestMinor: Number(item.paidInterestMinor), paidLateInterestMinor: Number(item.paidLateInterestMinor),
            version: Number(item.version)
        }));
    }
    static async getAllCredits(): Promise<Credit[]> {
        const rows = await RepositorioCredito.findAll();
        return rows.map(c => this.mapRowToCredit(c));
    }

    static async getDeletedCredits(): Promise<Credit[]> {
        const rows = await RepositorioCredito.findDeleted();
        return rows.map(c => this.mapRowToCredit(c));
    }

    private static mapRowToCredit(c: any): Credit {
        const money = (minor: unknown, legacy: unknown) =>
            typeof minor === 'number' && Number.isSafeInteger(minor)
                ? minor / 100 : Number(legacy || 0);
        return {
            ...c,
            principalAmount: money(c.principalAmountMinor, c.principalAmount),
            currentBalance: money(c.currentBalanceMinor, c.currentBalance),
            accruedInterest: money(c.accruedInterestMinor, c.accruedInterest),
            lateInterest: money(c.lateInterestMinor, c.lateInterest),
            totalDue: money(c.totalDueMinor, c.totalDue),
            createdAt: new Date(c.createdAt),
            startDate: new Date(c.startDate),
            dueDate: new Date(c.dueDate),
            requestedAt: c.requestedAt ? new Date(c.requestedAt) : undefined,
            paidAt: c.paidAt ? new Date(c.paidAt) : undefined,
            deletedAt: c.deletedAt ? new Date(c.deletedAt) : undefined,
            restoredAt: c.restoredAt ? new Date(c.restoredAt) : undefined
        };
    }

    static async addCredit(credit: Credit): Promise<Credit> {
        const principalMinor = toMinorUnits(credit.principalAmount, 'Capital do crédito');
        if (principalMinor <= 0) throw new Error('O capital do crédito deve ser superior a zero.');
        const schedule = buildInstallmentSchedule({
            principalMinor,
            installments: credit.installments,
            startDate: credit.startDate,
            method: credit.amortizationMethod || 'FLAT',
            annualRatePercent: credit.interestRate,
            flatInterestMinor: toMinorUnits(Math.max(0, credit.accruedInterest || 0))
        });
        const interestMinor = schedule.reduce((sum, item) => sum + item.interestMinor, 0);
        const normalizedCredit: Credit = {
            ...credit, currentBalance: principalMinor / 100, accruedInterest: interestMinor / 100,
            lateInterest: 0, totalDue: (principalMinor + interestMinor) / 100,
            paidInstallments: 0, version: 0
        };
        const timestamp = new Date();
        const disbursed = !['pending_approval', 'rejected', 'cancelled'].includes(normalizedCredit.status);
        const entry: any = disbursed ? await buildDisbursementAccountingEntry({
            id: `origination:${normalizedCredit.id}`, creditId: normalizedCredit.id, clientId: normalizedCredit.clientId,
            amount: normalizedCredit.principalAmount, processedBy: normalizedCredit.requestedBy || 'Sistema',
            usuario_id: normalizedCredit.usuario_id, description: `Desembolso inicial do crédito ${normalizedCredit.id}`
        }, await this.previousAccountingHash(), timestamp) : null;
        if (entry) { entry.sourceType = 'credit_origination'; entry.sourceId = normalizedCredit.id; }
        await db.transaction([
            { ...RepositorioCredito.buildInsertStatement(normalizedCredit), expectChanges: 1 },
            ...schedule.map(item => ({
                sql: `INSERT INTO credit_installments
                      (id, creditId, installmentNumber, dueDate, principalMinor, interestMinor)
                      VALUES (?, ?, ?, ?, ?, ?)`,
                params: [`${normalizedCredit.id}:installment:${item.number}`, normalizedCredit.id, item.number, item.dueDate,
                    item.principalMinor, item.interestMinor],
                expectChanges: 1
            })),
            ...(!disbursed ? [] : [{
                sql: `INSERT OR IGNORE INTO contracts
                      (id, clientId, clientName, title, value, startDate, endDate, status, createdAt, usuario_id)
                      VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
                params: [normalizedCredit.id, normalizedCredit.clientId, normalizedCredit.clientName, `Contrato de Crédito ${normalizedCredit.id}`,
                    normalizedCredit.principalAmount, new Date(normalizedCredit.startDate).toISOString(), new Date(normalizedCredit.dueDate).toISOString(),
                    timestamp.toISOString(), normalizedCredit.usuario_id || null]
            }, this.accountingInsert(entry), ...this.ledgerStatements(entry)]),
            {
                sql: `INSERT INTO audit_logs (id, timestamp, userId, userName, action, entity, details, metadata)
                      VALUES (?, ?, ?, ?, 'create', 'credit', ?, ?)`,
                params: [crypto.randomUUID(), timestamp.toISOString(), normalizedCredit.usuario_id || null,
                    normalizedCredit.requestedBy || 'Sistema', `Crédito ${normalizedCredit.id} criado`,
                    JSON.stringify({ creditId: normalizedCredit.id, clientId: normalizedCredit.clientId,
                        principalMinor, status: normalizedCredit.status })]
            },
            {
                sql: `INSERT INTO notifications (id, userId, title, message, type, read, timestamp)
                      VALUES (?, ?, 'Novo Crédito', ?, 'success', 0, ?)`,
                params: [`notification:credit:${normalizedCredit.id}`, normalizedCredit.usuario_id || null,
                    `Crédito de ${normalizedCredit.principalAmount} AOA criado para ${normalizedCredit.clientName}.`, timestamp.toISOString()]
            }
        ]);
        return normalizedCredit;
    }

    static async updateCredit(id: string, updates: Partial<Credit>): Promise<void> {
        const requested = Object.keys(updates).filter(field => !['version', 'usuario_id'].includes(field));
        if (requested.length !== 1 || requested[0] !== 'targetMonthId') {
            throw new Error('Condições e estado de crédito exigem uma operação financeira própria e aprovação.');
        }
        await RepositorioCredito.update(id, updates);
    }

    static async adjustCreditCharges(input: {
        credit: Credit; accruedInterest: number; lateInterest: number;
        reason: string; actorId: string; actorName: string; idempotencyKey: string;
    }): Promise<AccountingEntry[]> {
        if (!['active', 'overdue', 'defaulted', 'renegotiated'].includes(input.credit.status)) {
            throw new Error('Este crédito não aceita ajustes de encargos.');
        }
        const reason = input.reason.trim();
        if (reason.length < 10 || reason.length > 1000) throw new Error('Informe uma justificação entre 10 e 1000 caracteres.');
        if (!/^[a-zA-Z0-9:_-]{8,128}$/u.test(input.idempotencyKey)) throw new Error('Chave idempotente inválida.');
        const oldInterest = toMinorUnits(input.credit.accruedInterest || 0);
        const oldLate = toMinorUnits(input.credit.lateInterest || 0);
        const newInterest = toMinorUnits(input.accruedInterest);
        const newLate = toMinorUnits(input.lateInterest);
        const principal = toMinorUnits(input.credit.currentBalance);
        const deltaInterest = newInterest - oldInterest;
        const deltaLate = newLate - oldLate;
        if (deltaInterest === 0 && deltaLate === 0) throw new Error('Os encargos não foram alterados.');

        const schedule = await db.all<EncargoPrestacao>(`SELECT id, status, interestMinor, lateInterestMinor,
            paidInterestMinor, paidLateInterestMinor, version FROM credit_installments
            WHERE creditId = ? ORDER BY installmentNumber`, [input.credit.id]);
        const changed = planearAjusteEncargos(schedule, deltaInterest, deltaLate);
        const timestamp = new Date();
        let previousHash = await this.previousAccountingHash();
        const entries: any[] = [];
        for (const [component, delta] of [['interest', deltaInterest], ['late_interest', deltaLate]] as const) {
            if (delta === 0) continue;
            const entry = await buildChargeAdjustmentEntry({
                id: `charge-adjustment:${input.idempotencyKey}:${component}`,
                creditId: input.credit.id, clientId: input.credit.clientId, component,
                deltaMinor: delta, processedBy: input.actorName, usuario_id: input.actorId,
                justification: reason
            }, previousHash, timestamp);
            entries.push(entry);
            previousHash = entry.integrityHash;
        }
        await db.transaction([
            {
                sql: `UPDATE credits SET accruedInterest = ?, accruedInterestMinor = ?, lateInterest = ?,
                      lateInterestMinor = ?, totalDue = ?, totalDueMinor = ?, version = version + 1
                      WHERE id = ? AND deletedAt IS NULL AND version = ?`,
                params: [newInterest / 100, newInterest, newLate / 100, newLate,
                    (principal + newInterest + newLate) / 100, principal + newInterest + newLate,
                    input.credit.id, input.credit.version ?? 0], expectChanges: 1
            },
            ...changed.map(item => ({
                sql: `UPDATE credit_installments SET interestMinor = ?, lateInterestMinor = ?,
                      version = version + 1 WHERE id = ? AND version = ?`,
                params: [item.interestMinor, item.lateInterestMinor, item.id, item.version], expectChanges: 1
            })),
            ...entries.flatMap(entry => [this.accountingInsert(entry), ...this.ledgerStatements(entry)]),
            {
                sql: `INSERT INTO audit_logs (id, timestamp, userId, userName, action, entity, details, metadata)
                      VALUES (?, ?, ?, ?, 'update', 'credit', ?, ?)`,
                params: [crypto.randomUUID(), timestamp.toISOString(), input.actorId, input.actorName,
                    `Ajuste justificado de encargos no crédito ${input.credit.id}`,
                    JSON.stringify({ creditId: input.credit.id, idempotencyKey: input.idempotencyKey,
                        deltaInterest, deltaLate, reason })]
            }
        ]);
        return entries as AccountingEntry[];
    }

    static async reinforceCredit(input: {
        idempotencyKey: string; credit: Credit; amount: number; interestAmount: number;
        processedBy: string; userId?: string; notes?: string;
    }): Promise<AccountingEntry> {
        if (!/^[a-zA-Z0-9:_-]{8,128}$/u.test(input.idempotencyKey)) throw new Error('Chave idempotente inválida.');
        const amountMinor = toMinorUnits(input.amount, 'Reforço');
        const interestMinor = toMinorUnits(input.interestAmount, 'Juro do reforço');
        const timestamp = new Date();
        const entry: any = await buildDisbursementAccountingEntry({
            id: input.idempotencyKey, creditId: input.credit.id, clientId: input.credit.clientId,
            amount: input.amount, processedBy: input.processedBy, usuario_id: input.userId,
            description: `Reforço de capital do crédito ${input.credit.id}`,
            justification: input.notes
        }, await this.previousAccountingHash(), timestamp);
        entry.sourceId = input.idempotencyKey;

        const schedule = await db.all<any>(`SELECT id, principalMinor, interestMinor, paidPrincipalMinor,
            paidInterestMinor, status, version FROM credit_installments
            WHERE creditId = ? ORDER BY installmentNumber`, [input.credit.id]);
        const open = schedule.filter(item => item.status !== 'paid');
        if (open.length === 0) throw new Error('O crédito não possui prestações abertas para receber o reforço.');
        const distribute = (total: number, index: number) => Math.floor(total / open.length) + (index < total % open.length ? 1 : 0);
        const auditId = crypto.randomUUID();
        const principalAfter = input.credit.principalAmount + input.amount;
        await db.transaction([
            {
                sql: `INSERT INTO credit_reinforcements
                      (id, creditId, amountMinor, interestMinor, idempotencyKey, notes, createdBy, createdAt)
                      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                params: [crypto.randomUUID(), input.credit.id, amountMinor, interestMinor, input.idempotencyKey,
                    input.notes || null, input.userId || null, timestamp.toISOString()], expectChanges: 1
            },
            {
                sql: `UPDATE credits SET principalAmount = ?, principalAmountMinor = ?, currentBalance = ?,
                      currentBalanceMinor = ?, accruedInterest = ?, accruedInterestMinor = ?, totalDue = ?,
                      totalDueMinor = ?, reinforcedAmount = ?, version = version + 1
                      WHERE id = ? AND deletedAt IS NULL AND version = ?`,
                params: [principalAfter, toMinorUnits(principalAfter), input.credit.currentBalance + input.amount,
                    toMinorUnits(input.credit.currentBalance + input.amount), input.credit.accruedInterest + input.interestAmount,
                    toMinorUnits(input.credit.accruedInterest + input.interestAmount), input.credit.totalDue + input.amount + input.interestAmount,
                    toMinorUnits(input.credit.totalDue + input.amount + input.interestAmount),
                    (input.credit.reinforcedAmount || 0) + input.amount, input.credit.id, input.credit.version ?? 0], expectChanges: 1
            },
            ...open.map((item, index) => ({
                sql: `UPDATE credit_installments SET principalMinor = ?, interestMinor = ?, version = version + 1
                      WHERE id = ? AND version = ?`,
                params: [Number(item.principalMinor) + distribute(amountMinor, index),
                    Number(item.interestMinor) + distribute(interestMinor, index), item.id, Number(item.version)], expectChanges: 1
            })),
            this.accountingInsert(entry),
            ...this.ledgerStatements(entry),
            {
                sql: `INSERT INTO audit_logs (id, timestamp, userId, userName, action, entity, details, metadata)
                      VALUES (?, ?, ?, ?, 'update', 'credit', ?, ?)`,
                params: [auditId, timestamp.toISOString(), input.userId || null, input.processedBy,
                    `Reforço de capital registado no crédito ${input.credit.id}`,
                    JSON.stringify({ creditId: input.credit.id, idempotencyKey: input.idempotencyKey, amountMinor, interestMinor })]
            }
        ]);
        return entry as AccountingEntry;
    }

    static async decideCredit(input: {
        credit: Credit; decision: 'approved' | 'rejected'; actorId: string; actorName: string;
        notes?: string; notificationId: string; auditId: string;
    }): Promise<void> {
        if (input.credit.status !== 'pending_approval') throw new Error('Apenas créditos pendentes podem ser decididos.');
        if (input.credit.requestedBy && input.credit.requestedBy === input.actorId) {
            throw new Error('O criador do crédito não pode aprovar ou rejeitar a própria operação.');
        }
        const approved = input.decision === 'approved';
        const nextStatus = approved ? 'active' : 'rejected';
        const timestamp = new Date().toISOString();
        const notes = input.notes || (approved ? 'Aprovado sem observações adicionais.' : 'Rejeitado sem observações adicionais.');
        const contractStatement = approved ? {
            sql: `INSERT OR IGNORE INTO contracts
                  (id, clientId, clientName, title, value, startDate, endDate, status, createdAt, usuario_id)
                  VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
            params: [input.credit.id, input.credit.clientId, input.credit.clientName,
                `Contrato de Crédito ${input.credit.id}`, input.credit.principalAmount,
                new Date(input.credit.startDate).toISOString(), new Date(input.credit.dueDate).toISOString(),
                timestamp, input.credit.usuario_id || input.actorId]
        } : {
            sql: `UPDATE contracts SET status = 'terminated' WHERE id = ? OR title LIKE ?`,
            params: [input.credit.id, `%${input.credit.id}%`]
        };
        const entry: any = approved ? await buildDisbursementAccountingEntry({
            id: `origination:${input.credit.id}`, creditId: input.credit.id,
            clientId: input.credit.clientId, amount: input.credit.principalAmount,
            processedBy: input.actorName, usuario_id: input.actorId,
            description: `Desembolso inicial do crédito ${input.credit.id}`
        }, await this.previousAccountingHash(), new Date(timestamp)) : null;
        if (entry) { entry.sourceType = 'credit_origination'; entry.sourceId = input.credit.id; }
        await db.transaction([
            {
                sql: `UPDATE credits SET status = ?, approvedBy = ?, approvalNotes = ?, version = version + 1
                      WHERE id = ? AND status = 'pending_approval' AND version = ?`,
                params: [nextStatus, input.actorName, notes, input.credit.id, input.credit.version ?? 0], expectChanges: 1
            },
            contractStatement,
            ...(entry ? [this.accountingInsert(entry), ...this.ledgerStatements(entry)] : []),
            {
                sql: `INSERT INTO notifications (id, userId, title, message, type, read, timestamp)
                      VALUES (?, ?, ?, ?, ?, 0, ?)`,
                params: [input.notificationId, input.credit.usuario_id || null,
                    approved ? 'Crédito Aprovado' : 'Crédito Rejeitado',
                    `O crédito de ${input.credit.clientName} foi ${approved ? 'aprovado' : 'rejeitado'} por ${input.actorName}.`,
                    approved ? 'success' : 'warning', timestamp]
            },
            {
                sql: `INSERT INTO audit_logs (id, timestamp, userId, userName, action, entity, details, previousState, newState, metadata)
                      VALUES (?, ?, ?, ?, 'update', 'credit', ?, ?, ?, ?)`,
                params: [input.auditId, timestamp, input.actorId, input.actorName,
                    `${approved ? 'Aprovou' : 'Rejeitou'} crédito de ${input.credit.clientName}`,
                    JSON.stringify(input.credit), JSON.stringify({ ...input.credit, status: nextStatus, approvedBy: input.actorName, approvalNotes: notes }),
                    JSON.stringify({ decision: input.decision, notes })]
            }
        ]);
    }

    static async deleteCredit(id: string, userId: string): Promise<void> {
        const credits = await this.getAllCredits();
        const credit = credits.find(c => c.id === id);
        const originalState = credit ? JSON.stringify(credit) : undefined;
        await RepositorioCredito.softDelete(id, userId, originalState);
    }

    static async restoreCredit(id: string): Promise<void> {
        await RepositorioCredito.restore(id);
    }

    static async hardDeleteCredit(id: string): Promise<void> {
        throw new Error(`A eliminação permanente de créditos financeiros foi desativada por política de retenção (${id}).`);
    }

    // Pagamentos
    static async getAllPayments(): Promise<Payment[]> {
        const rows = await RepositorioPagamento.findAll();
        return rows.map(p => this.mapRowToPayment(p));
    }

    static async getDeletedPayments(): Promise<Payment[]> {
        const rows = await RepositorioPagamento.findDeleted();
        return rows.map(p => this.mapRowToPayment(p));
    }

    private static mapRowToPayment(p: any): Payment {
        const money = (minor: unknown, legacy: unknown) =>
            typeof minor === 'number' && Number.isSafeInteger(minor)
                ? minor / 100 : Number(legacy || 0);
        return {
            ...p,
            amount: money(p.amountMinor, p.amount),
            allocatedToPrincipal: money(p.allocatedToPrincipalMinor, p.allocatedToPrincipal),
            allocatedToInterest: money(p.allocatedToInterestMinor, p.allocatedToInterest),
            allocatedToLateInterest: money(p.allocatedToLateInterestMinor, p.allocatedToLateInterest),
            paymentDate: new Date(p.paymentDate),
            deletedAt: p.deletedAt ? new Date(p.deletedAt) : undefined,
            restoredAt: p.restoredAt ? new Date(p.restoredAt) : undefined
        };
    }

    static async addPayment(payment: Payment): Promise<void> {
        await RepositorioPagamento.insert(payment);
    }

    static async addPaymentAndUpdateCredit(
        payment: Payment,
        creditUpdate: {
            currentBalance: number;
            accruedInterest: number;
            lateInterest: number;
            totalDue: number;
            paidInstallments: number;
            status: Credit['status'];
            paidAt?: string | null;
            expectedVersion: number;
        },
        clientId?: string
    ): Promise<AccountingEntry & { paidInstallments: number }> {
        if (payment.status !== 'confirmed') throw new Error('Só pagamentos confirmados podem liquidar prestações.');
        if (payment.installmentCount != null) {
            const plan = planConsecutiveInstallments(await this.getCreditInstallments(payment.creditId), payment.installmentCount);
            if (toMinorUnits(payment.amount) !== plan.amountMinor ||
                toMinorUnits(payment.allocatedToPrincipal) !== plan.principalMinor ||
                toMinorUnits(payment.allocatedToInterest) !== plan.interestMinor ||
                toMinorUnits(payment.allocatedToLateInterest) !== plan.lateInterestMinor) {
                throw new Error('O cronograma mudou. Atualize as prestações e tente novamente.');
            }
            if (payment.installmentCount === plan.open.length && creditUpdate.status !== 'paid') {
                throw new Error('O saldo do crédito diverge do cronograma. A liquidação total foi recusada.');
            }
            if (payment.installmentCount < plan.open.length && creditUpdate.status === 'paid') {
                throw new Error('O saldo do crédito diverge do cronograma. Reveja as prestações antes de continuar.');
            }
        }
        const paymentDate = payment.paymentDate && !isNaN(new Date(payment.paymentDate).getTime())
            ? new Date(payment.paymentDate).toISOString()
            : new Date().toISOString();
        const accountingEntry = await buildPaymentAccountingEntry({
            ...payment,
            clientId,
            processedBy: payment.processedBy || payment.usuario_id || 'system'
        }, await this.previousAccountingHash(), new Date());
        const reconciliation = await this.installmentReconciliationStatements(payment.creditId, { add: payment }, new Date(paymentDate));
        await db.transaction([
            {
                sql: `INSERT INTO payments (id, creditId, clientName, amount, amountMinor, paymentDate, method, reference,
                          allocatedToPrincipal, allocatedToPrincipalMinor, allocatedToInterest, allocatedToInterestMinor,
                          allocatedToLateInterest, allocatedToLateInterestMinor, idempotencyKey, processedBy, status, usuario_id)
                      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
                params: [
                    payment.id, payment.creditId, payment.clientName, payment.amount, toMinorUnits(payment.amount), paymentDate,
                    payment.method, payment.reference, payment.allocatedToPrincipal || 0, toMinorUnits(payment.allocatedToPrincipal || 0),
                    payment.allocatedToInterest || 0, toMinorUnits(payment.allocatedToInterest || 0),
                    payment.allocatedToLateInterest || 0, toMinorUnits(payment.allocatedToLateInterest || 0),
                    payment.idempotencyKey || payment.id,
                    payment.processedBy, payment.status, payment.usuario_id
                ]
            },
            {
                sql: `UPDATE credits
                      SET currentBalance = ?, currentBalanceMinor = ?, accruedInterest = ?, accruedInterestMinor = ?,
                          lateInterest = ?, lateInterestMinor = ?, totalDue = ?, totalDueMinor = ?,
                          paidInstallments = ?, status = ?, paidAt = ?, version = version + 1
                      WHERE id = ? AND deletedAt IS NULL AND version = ?`,
                params: [
                    creditUpdate.currentBalance, toMinorUnits(creditUpdate.currentBalance),
                    creditUpdate.accruedInterest, toMinorUnits(creditUpdate.accruedInterest),
                    creditUpdate.lateInterest, toMinorUnits(creditUpdate.lateInterest),
                    creditUpdate.totalDue, toMinorUnits(creditUpdate.totalDue), reconciliation.paidInstallments, creditUpdate.status,
                    creditUpdate.paidAt || null, payment.creditId, creditUpdate.expectedVersion
                ], expectChanges: 1
            },
            ...(creditUpdate.status === 'paid' ? [{
                sql: `UPDATE contracts SET status = 'paid' WHERE id = ? AND status <> 'paid'`,
                params: [payment.creditId]
            }] : []),
            ...reconciliation.statements,
            this.accountingInsert(accountingEntry),
            ...this.ledgerStatements(accountingEntry),
            {
                sql: `INSERT INTO audit_logs (id, timestamp, userId, userName, action, entity, details, metadata)
                      VALUES (?, ?, ?, ?, 'create', 'payment', ?, ?)`,
                params: [crypto.randomUUID(), accountingEntry.timestampIso, payment.usuario_id || null,
                    payment.processedBy, `Pagamento registado no crédito ${payment.creditId}`,
                    JSON.stringify({ paymentId: payment.id, creditId: payment.creditId,
                        idempotencyKey: payment.idempotencyKey || payment.id,
                        amountMinor: toMinorUnits(payment.amount) })]
            },
            {
                sql: `INSERT INTO notifications (id, userId, title, message, type, read, timestamp)
                      VALUES (?, ?, 'Pagamento Recebido', ?, 'success', 0, ?)`,
                params: [`notification:payment:${payment.id}`, payment.usuario_id || null,
                    `Recebido pagamento de ${payment.amount} AOA de ${payment.clientName}.`,
                    accountingEntry.timestampIso]
            }
        ]);
        return Object.assign(accountingEntry as AccountingEntry, { paidInstallments: reconciliation.paidInstallments });
    }

    static async deletePayment(id: string, userId: string): Promise<void> {
        const payments = await this.getAllPayments();
        const payment = payments.find(p => p.id === id);
        const originalState = payment ? JSON.stringify(payment) : undefined;
        await RepositorioPagamento.softDelete(id, userId, originalState);
    }

    static async reversePaymentAndUpdateCredit(
        payment: Payment,
        credit: Credit,
        creditUpdate: Pick<Credit, 'currentBalance' | 'accruedInterest' | 'lateInterest' | 'totalDue' | 'paidInstallments' | 'status'>,
        userId: string,
        justification?: string
    ): Promise<AccountingEntry & { paidInstallments: number }> {
        const timestamp = new Date();
        const originalState = JSON.stringify(payment);
        const entry = await buildPaymentCorrectionEntry({ ...payment, clientId: credit.clientId, processedBy: userId },
            await this.previousAccountingHash(), 'reversal', timestamp);
        (entry as any).justification = justification || 'Estorno de pagamento';
        const reconciliation = await this.installmentReconciliationStatements(credit.id, { excludePaymentId: payment.id }, timestamp);
        await db.transaction([
            { sql: `UPDATE payments SET deletedAt = ?, deletedBy = ?, originalState = ?
                    WHERE id = ? AND deletedAt IS NULL`, params: [timestamp.toISOString(), userId, originalState, payment.id], expectChanges: 1 },
            { sql: `UPDATE credits SET currentBalance = ?, currentBalanceMinor = ?, accruedInterest = ?, accruedInterestMinor = ?,
                    lateInterest = ?, lateInterestMinor = ?, totalDue = ?, totalDueMinor = ?, paidInstallments = ?, status = ?,
                    paidAt = NULL, version = version + 1 WHERE id = ? AND deletedAt IS NULL AND version = ?`,
              params: [creditUpdate.currentBalance, toMinorUnits(creditUpdate.currentBalance),
                  creditUpdate.accruedInterest, toMinorUnits(creditUpdate.accruedInterest), creditUpdate.lateInterest,
                  toMinorUnits(creditUpdate.lateInterest), creditUpdate.totalDue, toMinorUnits(creditUpdate.totalDue),
                  reconciliation.paidInstallments, creditUpdate.status, credit.id, credit.version ?? 0], expectChanges: 1 },
            ...(credit.status === 'paid' && creditUpdate.status !== 'paid' ? [{
                sql: `UPDATE contracts SET status = 'active' WHERE id = ? AND status = 'paid'`, params: [credit.id]
            }] : []),
            ...reconciliation.statements,
            this.accountingInsert(entry),
            ...this.ledgerStatements(entry),
            {
                sql: `INSERT INTO audit_logs (id, timestamp, userId, userName, action, entity, details, metadata)
                      VALUES (?, ?, ?, ?, 'delete', 'payment', ?, ?)`,
                params: [crypto.randomUUID(), timestamp.toISOString(), userId, userId,
                    `Estorno do pagamento ${payment.id}`,
                    JSON.stringify({ paymentId: payment.id, creditId: credit.id, justification: justification || 'Estorno de pagamento' })]
            }
        ]);
        return Object.assign(entry as AccountingEntry, { paidInstallments: reconciliation.paidInstallments });
    }

    static async restorePaymentAndUpdateCredit(
        payment: Payment,
        credit: Credit,
        creditUpdate: Pick<Credit, 'currentBalance' | 'accruedInterest' | 'lateInterest' | 'totalDue' | 'paidInstallments' | 'status'>,
        userId: string
    ): Promise<AccountingEntry & { paidInstallments: number }> {
        const timestamp = new Date();
        const entry = await buildPaymentCorrectionEntry({ ...payment, clientId: credit.clientId, processedBy: userId },
            await this.previousAccountingHash(), 'restore', timestamp);
        const reconciliation = await this.installmentReconciliationStatements(credit.id, { includePaymentId: payment.id }, timestamp);
        await db.transaction([
            { sql: `UPDATE payments SET deletedAt = NULL, deletedBy = NULL, restoredAt = ?
                    WHERE id = ? AND deletedAt IS NOT NULL`, params: [timestamp.toISOString(), payment.id], expectChanges: 1 },
            { sql: `UPDATE credits SET currentBalance = ?, currentBalanceMinor = ?, accruedInterest = ?, accruedInterestMinor = ?,
                    lateInterest = ?, lateInterestMinor = ?, totalDue = ?, totalDueMinor = ?, paidInstallments = ?, status = ?,
                    paidAt = ?, version = version + 1 WHERE id = ? AND deletedAt IS NULL AND version = ?`,
              params: [creditUpdate.currentBalance, toMinorUnits(creditUpdate.currentBalance),
                  creditUpdate.accruedInterest, toMinorUnits(creditUpdate.accruedInterest), creditUpdate.lateInterest,
                  toMinorUnits(creditUpdate.lateInterest), creditUpdate.totalDue, toMinorUnits(creditUpdate.totalDue),
                  reconciliation.paidInstallments, creditUpdate.status,
                  creditUpdate.status === 'paid' ? timestamp.toISOString() : null, credit.id, credit.version ?? 0], expectChanges: 1 },
            ...(creditUpdate.status === 'paid' ? [{
                sql: `UPDATE contracts SET status = 'paid' WHERE id = ? AND status <> 'paid'`, params: [credit.id]
            }] : []),
            ...reconciliation.statements,
            this.accountingInsert(entry),
            ...this.ledgerStatements(entry),
            {
                sql: `INSERT INTO audit_logs (id, timestamp, userId, userName, action, entity, details, metadata)
                      VALUES (?, ?, ?, ?, 'restore', 'payment', ?, ?)`,
                params: [crypto.randomUUID(), timestamp.toISOString(), userId, userId,
                    `Reposição do pagamento ${payment.id}`,
                    JSON.stringify({ paymentId: payment.id, creditId: credit.id })]
            }
        ]);
        return Object.assign(entry as AccountingEntry, { paidInstallments: reconciliation.paidInstallments });
    }

    static async restorePayment(id: string): Promise<void> {
        await RepositorioPagamento.restore(id);
    }

    static async hardDeletePayment(id: string): Promise<void> {
        throw new Error(`A eliminação permanente de pagamentos financeiros foi desativada por política de retenção (${id}).`);
    }
}




