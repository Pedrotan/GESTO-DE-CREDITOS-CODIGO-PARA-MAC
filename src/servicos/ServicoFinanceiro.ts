import { formatCurrency } from '@/bibliotecas/formatters';
import type { LimitActor } from '@/bibliotecas/alcadas';
import { ServicoAlcadas } from '@/servicos/ServicoAlcadas';
import { assertFinancialConnection } from '@/bibliotecas/ligacao-financeira';
import { RepositorioCredito } from '@/repositorios/RepositorioCredito';
import { RepositorioPagamento } from '@/repositorios/RepositorioPagamento';
import { db } from '@/bibliotecas/bd';
import { AccountingEntry, Credit, Payment } from '@/tipos/credito';
import { CreditEntity } from '@/dominio/entidade/Credito';
import { buildChargeAdjustmentEntry, buildDisbursementAccountingEntry, buildJournalEntry, buildPaymentAccountingEntry, buildPaymentCorrectionEntry, type JournalLineInput } from '@/bibliotecas/ledger-financeiro';
import { toMinorUnits } from '@/bibliotecas/ledger-financeiro';
import { planearAjusteEncargos, type EncargoPrestacao } from '@/bibliotecas/ajuste-encargos';
import { buildInstallmentSchedule } from '@/bibliotecas/cronograma-prestacoes';
import { reconcileInstallments } from '@/bibliotecas/conciliacao-prestacoes';
import { planConsecutiveInstallments, type InstallmentBalance } from '@/bibliotecas/liquidacao-prestacoes';
import { calculateLateInterest, type LateInterestSummary } from '@/bibliotecas/juros-mora';
import {
    allocatePaymentByInstallments, allocatePaymentMinor, applyPaymentToBalances, creditBalancesFromRow, revertPaymentFromBalances,
    type AllocationMinor, type CreditBalancesAfter, type CreditBalancesMinor
} from '@/bibliotecas/saldo-credito';

/** Estado do crédito calculado pelo serviço a partir da base de dados após uma operação. */
export type CreditStateAfter = Pick<Credit, 'currentBalance' | 'accruedInterest' | 'lateInterest' | 'totalDue'
    | 'paidInstallments' | 'status' | 'version' | 'paidAt'>;

export type CreditApprovalRecord = {
    id: string; creditId: string; clientId?: string | null; clientName: string; principalAmount: number; interestRate: number;
    installments: number; decision: 'approved' | 'rejected'; reason?: string | null; requestedBy?: string | null;
    requestedAt?: string | null; decidedBy: string; decidedById?: string | null; decidedAt: string;
};

export type PaymentOperationResult = AccountingEntry & { paidInstallments: number; creditState: CreditStateAfter };

/** Parte de um pagamento imputada a uma prestação (cêntimos). */
export type InstallmentImputation = { n: number; principalMinor: number; interestMinor: number; lateMinor: number; settled: boolean };

/** Número do recibo apresentado: RC 2026/000123. */
export const formatReceiptNumber = (year?: number | null, seq?: number | null) =>
    year && seq ? `RC ${year}/${String(seq).padStart(6, '0')}` : '';

export class ServicoFinanceiro {
    private static async installmentReconciliationStatements(
        creditId: string,
        options: { add?: Payment; excludePaymentId?: string; includePaymentId?: string },
        timestamp: Date
    ) {
        const schedule = await db.all<any>(`SELECT id, installmentNumber, dueDate, principalMinor, interestMinor,
            lateInterestMinor, paidPrincipalMinor, paidInterestMinor, paidLateInterestMinor, status, paidAt, version
            FROM credit_installments WHERE creditId = ? ORDER BY installmentNumber`, [creditId]);
        if (schedule.length === 0) return { statements: [] as any[], paidInstallments: 0, detail: [] as InstallmentImputation[] };
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
        // Quanto cada prestação recebeu (ou perdeu) com esta operação: base da imputação mostrada no recibo.
        const detail: InstallmentImputation[] = reconciled.installments.map(item => {
            const before = schedule.find(previous => previous.id === item.id) || {};
            return {
                n: Number(before.installmentNumber) || 0,
                principalMinor: item.paidPrincipalMinor - Number(before.paidPrincipalMinor || 0),
                interestMinor: item.paidInterestMinor - Number(before.paidInterestMinor || 0),
                lateMinor: item.paidLateInterestMinor - Number(before.paidLateInterestMinor || 0),
                settled: item.status === 'paid',
            };
        }).filter(item => item.principalMinor !== 0 || item.interestMinor !== 0 || item.lateMinor !== 0);
        return {
            paidInstallments: reconciled.paidInstallments,
            detail,
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

    private static async paymentLedgerComponents(payment: Payment): Promise<Array<[string,string,number]>> {
        const rows = await db.all<{account:string;side:string;amountMinor:number}>(`SELECT l.account, l.side, l.amountMinor
            FROM ledger_lines l JOIN accounting_entries a ON a.id = l.transactionId
            WHERE a.creditId = ? AND l.account IN ('receivable_interest', 'receivable_late_interest')`, [payment.creditId]);
        const outstanding = (account:string) => Math.max(0,rows.filter(l=>l.account===account)
            .reduce((sum,l)=>sum+(l.side==='debit'?1:-1)*Number(l.amountMinor),0));
        const interest=toMinorUnits(payment.allocatedToInterest), late=toMinorUnits(payment.allocatedToLateInterest);
        const recognizedInterest=Math.min(interest,outstanding('receivable_interest'));
        const recognizedLate=Math.min(late,outstanding('receivable_late_interest'));
        // Crédito abatido ao activo: o capital recebido já não está na carteira e é proveito de recuperação.
        const writtenOff = await db.get<{ id: string }>('SELECT id FROM credit_writeoffs WHERE creditId = ? LIMIT 1', [payment.creditId]).catch(() => undefined);
        return [writtenOff ? ['recovery','revenue_recoveries',toMinorUnits(payment.allocatedToPrincipal)] : ['principal','portfolio',toMinorUnits(payment.allocatedToPrincipal)],
            ['interest_receivable','receivable_interest',recognizedInterest],
            ['interest','revenue_interest',interest-recognizedInterest],
            ['late_receivable','receivable_late_interest',recognizedLate],
            ['late_interest','revenue_late_interest',late-recognizedLate]];
    }
    private static async originalPaymentLedgerComponents(paymentId:string): Promise<Array<[string,string,number]> | undefined> {
        const lines=await db.all<{account:string;component:string;amountMinor:number}>(`SELECT account, component, amountMinor
            FROM ledger_lines WHERE transactionId = ? AND side = 'credit'`, ['payment:'+paymentId]);
        return lines.length ? lines.map(l=>[l.component,l.account,Number(l.amountMinor)] as [string,string,number]) : undefined;
    }
    private static ledgerStatements(entry: any) {
        if (Array.isArray(entry.journalLines)) {
            return [
                {
                    sql: `INSERT INTO ledger_transactions
                          (id, timestamp, type, sourceType, sourceId, description, totalDebitMinor,
                           totalCreditMinor, integrityHash, previousHash, hashVersion, usuario_id)
                          VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
                    params: [entry.id, entry.timestampIso, entry.type, entry.sourceType, entry.sourceId,
                        entry.description, entry.amountTotalMinor, entry.amountTotalMinor, entry.integrityHash,
                        entry.previousHash, entry.hashVersion || 2, entry.usuario_id || null]
                },
                ...entry.journalLines.map((line: JournalLineInput, index: number) => ({
                    sql: `INSERT INTO ledger_lines (id, transactionId, account, side, component, amountMinor)
                          VALUES (?,?,?,?,?,?)`,
                    params: [`${entry.id}:line:${index + 1}`, entry.id, line.account, line.side, line.component, line.amountMinor]
                }))
            ];
        }
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
                        VALUES (?,?,?,?,?,?)`, params: [`${entry.id}:line:2`, entry.id, entry.credit === 'bank' ? 'bank' : 'cash', 'credit', 'settlement', entry.amountTotalMinor] }
            ];
        }
        const isReversal = entry.type === 'reversal';
        const componentLines = (entry.ledgerComponents || [
            ['principal', 'portfolio', entry.amountPrincipalMinor],
            ['interest', 'revenue_interest', entry.amountInterestMinor],
            ['late_interest', 'revenue_late_interest', entry.amountLateInterestMinor]
        ]).filter(([, , amount]) => Number(amount) > 0);
        const lines = isReversal
            ? [...componentLines.map(([component, account, amount]) => ({ component, account, amount, side: 'debit' })),
                { component: 'settlement', account: entry.credit, amount: entry.amountTotalMinor, side: 'credit' }]
            : [{ component: 'settlement', account: entry.debit, amount: entry.amountTotalMinor, side: 'debit' },
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

    /** Lê os saldos persistidos do crédito; nunca usa os valores mantidos pela interface. */
    private static async loadCreditBalances(creditId: string, expectedVersion?: number): Promise<CreditBalancesMinor> {
        const row = await db.get<any>(`SELECT principalAmount, principalAmountMinor, currentBalance, currentBalanceMinor,
            accruedInterest, accruedInterestMinor, lateInterest, lateInterestMinor, status, version
            FROM credits WHERE id = ? AND deletedAt IS NULL`, [creditId]);
        if (!row) throw new Error('O crédito não foi encontrado.');
        const balances = creditBalancesFromRow(row);
        if (expectedVersion !== undefined && balances.version !== expectedVersion) {
            throw new Error('O crédito foi alterado por outra operação. Atualize os dados e tente novamente.');
        }
        return balances;
    }

    /** Estados em que o crédito já foi concedido e pode receber pagamentos e gerar mora. */
    static readonly PAYABLE_STATUSES = ['active', 'overdue', 'defaulted', 'renegotiated'];

    /** Juros de mora de um crédito, por prestação, até `asOf` (sem gravar nada). */
    static async getLateInterestSummary(creditId: string, asOf: Date = new Date()): Promise<LateInterestSummary> {
        const credit = await db.get<any>('SELECT lateInterestRate FROM credits WHERE id = ? AND deletedAt IS NULL', [creditId]);
        const installments = await this.getCreditInstallments(creditId);
        const payments = await db.all<any>(`SELECT paymentDate, allocatedToPrincipal, allocatedToPrincipalMinor,
            allocatedToInterest, allocatedToInterestMinor, allocatedToLateInterest, allocatedToLateInterestMinor
            FROM payments WHERE creditId = ? AND deletedAt IS NULL AND status = 'confirmed'`, [creditId]);
        const minor = (value: unknown, legacy: unknown) => value !== null && value !== undefined && value !== ''
            ? Number(value) : Math.round(Number(legacy || 0) * 100);
        return calculateLateInterest({
            installments: installments.map(item => ({
                id: item.id, number: Number(item.installmentNumber), dueDate: item.dueDate,
                principalMinor: item.principalMinor, interestMinor: item.interestMinor,
            })),
            payments: payments.map(payment => ({
                date: payment.paymentDate,
                principalMinor: minor(payment.allocatedToPrincipalMinor, payment.allocatedToPrincipal),
                interestMinor: minor(payment.allocatedToInterestMinor, payment.allocatedToInterest),
                lateMinor: minor(payment.allocatedToLateInterestMinor, payment.allocatedToLateInterest),
            })),
            dailyRatePercent: Number(credit?.lateInterestRate || 0),
            asOf,
        });
    }

    /**
     * Lança no crédito e nas prestações a mora acumulada até `asOf` que ainda não foi lançada, com o registo
     * contabilístico de juros de mora. Nunca reduz mora já lançada (por exemplo, por um ajuste manual).
     */
    static async postAccruedLateInterest(creditId: string, asOf: Date = new Date(), actor?: { id?: string; name?: string })
        : Promise<{ postedMinor: number; version: number | null; summary: LateInterestSummary | null }> {
        const credit = await db.get<any>('SELECT id, clientId, status, version, lateInterestRate FROM credits WHERE id = ? AND deletedAt IS NULL', [creditId]);
        if (!credit || !this.PAYABLE_STATUSES.includes(String(credit.status)) || !(Number(credit.lateInterestRate) > 0)) {
            return { postedMinor: 0, version: credit ? Number(credit.version ?? 0) : null, summary: null };
        }
        const summary = await this.getLateInterestSummary(creditId, asOf);
        const rows = await db.all<any>('SELECT id, lateInterestMinor, version FROM credit_installments WHERE creditId = ?', [creditId]);
        const changes = summary.installments
            .map(item => {
                const row = rows.find(candidate => candidate.id === item.id);
                return row ? {
                    id: String(row.id), version: Number(row.version), accruedMinor: item.accruedMinor,
                    deltaMinor: item.accruedMinor - Number(row.lateInterestMinor || 0)
                } : null;
            })
            .filter((change): change is NonNullable<typeof change> => Boolean(change && change.deltaMinor > 0));
        const postedMinor = changes.reduce((sum, change) => sum + change.deltaMinor, 0);
        if (postedMinor <= 0) return { postedMinor: 0, version: Number(credit.version ?? 0), summary };

        const current = await this.loadCreditBalances(creditId, Number(credit.version ?? 0));
        const lateAfterMinor = current.lateInterestMinor + postedMinor;
        const totalDueAfterMinor = current.balanceMinor + current.interestMinor + lateAfterMinor;
        const asOfKey = new Date(asOf).toISOString().slice(0, 10);
        const entry = await buildChargeAdjustmentEntry({
            id: `late-interest:${creditId}:${asOfKey}:${summary.accruedMinor}`,
            creditId, clientId: credit.clientId || undefined, component: 'late_interest', deltaMinor: postedMinor,
            processedBy: actor?.name || 'Sistema', usuario_id: actor?.id,
            justification: `Juros de mora de ${Number(credit.lateInterestRate)}% ao dia acumulados até ${asOfKey}`
        }, await this.previousAccountingHash(), new Date());
        await db.transaction([
            {
                sql: `UPDATE credits SET lateInterest = ?, lateInterestMinor = ?, totalDue = ?, totalDueMinor = ?,
                      version = version + 1 WHERE id = ? AND deletedAt IS NULL AND version = ?`,
                params: [lateAfterMinor / 100, lateAfterMinor, totalDueAfterMinor / 100, totalDueAfterMinor, creditId, current.version],
                expectChanges: 1
            },
            ...changes.map(change => ({
                sql: `UPDATE credit_installments SET lateInterestMinor = ?, version = version + 1 WHERE id = ? AND version = ?`,
                params: [change.accruedMinor, change.id, change.version],
                expectChanges: 1
            })),
            this.accountingInsert(entry),
            ...this.ledgerStatements(entry)
        ]);
        return { postedMinor, version: current.version + 1, summary };
    }

    private static async loadPaymentAllocation(paymentId: string): Promise<AllocationMinor> {
        const row = await db.get<any>(`SELECT allocatedToPrincipal, allocatedToPrincipalMinor, allocatedToInterest,
            allocatedToInterestMinor, allocatedToLateInterest, allocatedToLateInterestMinor
            FROM payments WHERE id = ?`, [paymentId]);
        if (!row) throw new Error('O pagamento não foi encontrado.');
        const minor = (value: unknown, legacy: unknown) => value !== null && value !== undefined
            ? Number(value) : Math.round(Number(legacy || 0) * 100);
        return {
            principalMinor: minor(row.allocatedToPrincipalMinor, row.allocatedToPrincipal),
            interestMinor: minor(row.allocatedToInterestMinor, row.allocatedToInterest),
            lateInterestMinor: minor(row.allocatedToLateInterestMinor, row.allocatedToLateInterest)
        };
    }

    private static creditBalanceStatement(creditId: string, after: CreditBalancesAfter, expectedVersion: number,
        paidInstallments: number, paidAt: string | null) {
        return {
            sql: `UPDATE credits SET currentBalance = ?, currentBalanceMinor = ?, accruedInterest = ?, accruedInterestMinor = ?,
                  lateInterest = ?, lateInterestMinor = ?, totalDue = ?, totalDueMinor = ?, paidInstallments = ?, status = ?,
                  paidAt = ?, version = version + 1 WHERE id = ? AND deletedAt IS NULL AND version = ?`,
            params: [after.balanceMinor / 100, after.balanceMinor, after.interestMinor / 100, after.interestMinor,
                after.lateInterestMinor / 100, after.lateInterestMinor, after.totalDueMinor / 100, after.totalDueMinor,
                paidInstallments, after.status, paidAt, creditId, expectedVersion],
            expectChanges: 1
        };
    }

    private static creditStateResult(after: CreditBalancesAfter, paidInstallments: number, version: number, paidAt: string | null): CreditStateAfter {
        return {
            currentBalance: after.balanceMinor / 100, accruedInterest: after.interestMinor / 100,
            lateInterest: after.lateInterestMinor / 100, totalDue: after.totalDueMinor / 100,
            paidInstallments, status: after.status, version, paidAt: paidAt ? new Date(paidAt) : undefined
        };
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

    /**
     * Regista um crédito. Com o utilizador que o regista (`actor`), aplica as alçadas: se pedir aprovação
     * directa e estiver dentro da sua alçada, o consumo do limite é verificado e registado na mesma transacção
     * (guarda na base de dados); acima da alçada, ou se o volume se esgotar entretanto por outra operação em
     * simultâneo, o crédito fica pendente na fila de Aprovações com o motivo e o nível exigido.
     */
    static async addCredit(credit: Credit, actor?: LimitActor | null, context: { productId?: string | null; effortRate?: number | null } = {}): Promise<Credit & { escalationReason?: string }> {
        await assertFinancialConnection('registar o crédito');
        if (!actor || !['active', 'pending_approval'].includes(credit.status)) return this.persistCredit(credit, []);
        const principalMinor = toMinorUnits(credit.principalAmount, 'Capital do crédito');
        const plan = async (forceEscalation: string | null) => ServicoAlcadas.plan({
            actor, operationType: 'credit_approval', extraConsumption: ['disbursement'], amountMinor: principalMinor,
            entityType: 'credit', entityId: credit.id, clientId: credit.clientId, productId: context.productId, effortRate: context.effortRate,
            cashAvailableMinor: credit.status === 'active' && (await this.getAccountingConfig()).cashGuard ? await this.cashAvailableMinor().catch(() => null) : null, forceEscalation,
        });
        const decide = async (forceEscalation: string | null) => {
            const result = await plan(forceEscalation);
            if (result.evaluation.decision === 'block') throw new Error(result.evaluation.reasons.join('. ') + '.');
            if (result.evaluation.decision === 'allow') return { status: credit.status, statements: result.statements, reason: undefined as string | undefined };
            return { status: 'pending_approval' as const, statements: result.escalation!.statements, reason: result.escalation!.reason };
        };
        const first = await decide(credit.status === 'pending_approval' ? 'Pedido sujeito a aprovação pela regra de crédito do cliente (limite disponível, estado ou permissão)' : null);
        try {
            const saved = await this.persistCredit({ ...credit, status: first.status as Credit['status'] }, first.statements);
            return { ...saved, escalationReason: first.reason };
        } catch (error: any) {
            // Guarda do limite: outra operação em simultâneo consumiu o volume. O crédito sobe na cadeia.
            if (first.status !== 'active' || !/conflito de concorr/i.test(String(error?.message))) throw error;
            const exists = await db.get<{ id: string }>('SELECT id FROM credits WHERE id = ?', [credit.id]).catch(() => undefined);
            if (exists) throw error;
            const retry = await decide('O volume disponível foi consumido por outra operação em simultâneo');
            const saved = await this.persistCredit({ ...credit, status: 'pending_approval' }, retry.statements);
            return { ...saved, escalationReason: retry.reason };
        }
    }

    /** Saldo de Caixa e Bancos disponível (cêntimos), para ligar os desembolsos ao dinheiro existente. */
    static async cashAvailableMinor(): Promise<number> {
        return (await this.liquidBalancesMinor()).total;
    }

    private static async persistCredit(credit: Credit, limitStatements: Array<{ sql: string; params: unknown[]; expectChanges?: number }>): Promise<Credit> {
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
        if (disbursed) {
            await this.assertNotFrozen();
            await this.assertCashAvailable(principalMinor, 'o desembolso deste crédito');
        }
        const entry: any = disbursed ? await buildDisbursementAccountingEntry({
            id: `origination:${normalizedCredit.id}`, creditId: normalizedCredit.id, clientId: normalizedCredit.clientId,
            amount: normalizedCredit.principalAmount, processedBy: normalizedCredit.requestedBy || 'Sistema',
            usuario_id: normalizedCredit.usuario_id, description: `Desembolso inicial do crédito ${normalizedCredit.id}`,
            fundingAccount: await this.fundingAccountForClient(normalizedCredit.clientId)
        }, await this.previousAccountingHash(), timestamp) : null;
        if (entry) { entry.sourceType = 'credit_origination'; entry.sourceId = normalizedCredit.id; }
        // Os guardas das alçadas vêm primeiro: se o volume se esgotou entretanto, a transacção falha logo aí.
        await db.transaction([
            ...limitStatements,
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
                    `Crédito de ${formatCurrency(normalizedCredit.principalAmount)} criado para ${normalizedCredit.clientName}.`, timestamp.toISOString()]
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
        await assertFinancialConnection('ajustar os encargos');
        if (!['active', 'overdue', 'defaulted', 'renegotiated'].includes(input.credit.status)) {
            throw new Error('Este crédito não aceita ajustes de encargos.');
        }
        await this.assertNotFrozen();
        const reason = input.reason.trim();
        if (reason.length < 10 || reason.length > 1000) throw new Error('Informe uma justificação entre 10 e 1000 caracteres.');
        if (!/^[a-zA-Z0-9:_-]{8,128}$/u.test(input.idempotencyKey)) throw new Error('Chave idempotente inválida.');
        const current = await this.loadCreditBalances(input.credit.id, input.credit.version ?? 0);
        const oldInterest = current.interestMinor;
        const oldLate = current.lateInterestMinor;
        const newInterest = toMinorUnits(input.accruedInterest);
        const newLate = toMinorUnits(input.lateInterest);
        const principal = current.balanceMinor;
        const deltaInterest = newInterest - oldInterest;
        const deltaLate = newLate - oldLate;
        if (deltaInterest === 0 && deltaLate === 0) throw new Error('Os encargos não foram alterados.');
        // Alçada de perdão de juros de mora / descontos (só quando os encargos baixam).
        const waivedMinor = Math.max(0, (oldInterest + oldLate) - (newInterest + newLate));
        const waiverActor = waivedMinor > 0 ? await ServicoAlcadas.actorOf(input.actorId) : null;
        const waiverStatements = waiverActor ? await ServicoAlcadas.enforce({ actor: waiverActor, operationType: 'interest_waiver', amountMinor: waivedMinor,
            percent: oldInterest + oldLate > 0 ? (waivedMinor / (oldInterest + oldLate)) * 100 : 100, entityType: 'credit', entityId: input.credit.id }) : [];

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
                    input.credit.id, current.version], expectChanges: 1
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
                        deltaInterest, deltaLate, reason, waivedMinor })]
            },
            ...waiverStatements
        ]);
        return entries as AccountingEntry[];
    }

    static async reinforceCredit(input: {
        idempotencyKey: string; credit: Credit; amount: number; interestAmount: number;
        processedBy: string; userId?: string; notes?: string;
    }): Promise<AccountingEntry> {
        await assertFinancialConnection('reforçar o crédito');
        if (!/^[a-zA-Z0-9:_-]{8,128}$/u.test(input.idempotencyKey)) throw new Error('Chave idempotente inválida.');
        const amountMinor = toMinorUnits(input.amount, 'Reforço');
        const interestMinor = toMinorUnits(input.interestAmount, 'Juro do reforço');
        await this.assertNotFrozen();
        await this.assertCashAvailable(amountMinor, 'o reforço de capital');
        const timestamp = new Date();
        const entry: any = await buildDisbursementAccountingEntry({
            id: input.idempotencyKey, creditId: input.credit.id, clientId: input.credit.clientId,
            amount: input.amount, processedBy: input.processedBy, usuario_id: input.userId,
            description: `Reforço de capital do crédito ${input.credit.id}`,
            justification: input.notes,
            fundingAccount: await this.fundingAccountForClient(input.credit.clientId)
        }, await this.previousAccountingHash(), timestamp);
        entry.sourceId = input.idempotencyKey;

        const schedule = await db.all<any>(`SELECT id, principalMinor, interestMinor, paidPrincipalMinor,
            paidInterestMinor, status, version FROM credit_installments
            WHERE creditId = ? ORDER BY installmentNumber`, [input.credit.id]);
        const open = schedule.filter(item => item.status !== 'paid');
        if (open.length === 0) throw new Error('O crédito não possui prestações abertas para receber o reforço.');
        const distribute = (total: number, index: number) => Math.floor(total / open.length) + (index < total % open.length ? 1 : 0);
        const auditId = crypto.randomUUID();
        const current = await this.loadCreditBalances(input.credit.id, input.credit.version ?? 0);
        const principalAfterMinor = current.principalMinor + amountMinor;
        const balanceAfterMinor = current.balanceMinor + amountMinor;
        const interestAfterMinor = current.interestMinor + interestMinor;
        const totalDueAfterMinor = balanceAfterMinor + interestAfterMinor + current.lateInterestMinor;
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
                      totalDueMinor = ?, reinforcedAmount = COALESCE(reinforcedAmount, 0) + ?, version = version + 1
                      WHERE id = ? AND deletedAt IS NULL AND version = ?`,
                params: [principalAfterMinor / 100, principalAfterMinor, balanceAfterMinor / 100, balanceAfterMinor,
                    interestAfterMinor / 100, interestAfterMinor, totalDueAfterMinor / 100, totalDueAfterMinor,
                    amountMinor / 100, input.credit.id, current.version], expectChanges: 1
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
    }): Promise<{ final: boolean; message?: string }> {
        await assertFinancialConnection(input.decision === 'approved' ? 'aprovar e desembolsar o crédito' : 'rejeitar o crédito');
        if (input.credit.status !== 'pending_approval') throw new Error('Apenas créditos pendentes podem ser decididos.');
        if (input.credit.requestedBy && input.credit.requestedBy === input.actorId) {
            throw new Error('O criador do crédito não pode aprovar ou rejeitar a própria operação.');
        }
        const approved = input.decision === 'approved';
        if (!approved && (input.notes || '').trim().length < 5) {
            throw new Error('Indique o motivo da rejeição (pelo menos 5 caracteres).');
        }
        // Alçadas: nível exigido pelo pedido (valor, risco, escalonamento) e dupla aprovação acima do nível máximo.
        const actorRow = await db.get<{ role: string; name: string; branchId?: string | null }>('SELECT role, name, branchId FROM users WHERE id = ?', [input.actorId]);
        if (!actorRow) throw new Error('Utilizador de aprovação não encontrado.');
        const actual = await db.get<{ principalAmountMinor: number; principalAmount: number }>('SELECT principalAmountMinor, principalAmount FROM credits WHERE id = ?', [input.credit.id]);
        if (!actual) throw new Error('Crédito não encontrado.');
        const limitDecision = await ServicoAlcadas.creditDecision({
            creditId: input.credit.id, clientId: input.credit.clientId, amountMinor: actual.principalAmountMinor ?? toMinorUnits(actual.principalAmount),
            actor: { id: input.actorId, name: input.actorName, role: actorRow.role, branchId: actorRow.branchId }, approve: approved, notes: input.notes,
        });
        if (!limitDecision.final) {
            const when = new Date().toISOString();
            await db.transaction([...limitDecision.statements, {
                sql: `INSERT INTO audit_logs (id, timestamp, userId, userName, action, entity, details, metadata)
                      VALUES (?, ?, ?, ?, 'update', 'credit', ?, ?)`,
                params: [input.auditId, when, input.actorId, input.actorName, `Primeira aprovação (dupla aprovação) do crédito de ${input.credit.clientName}`,
                    JSON.stringify({ creditId: input.credit.id, decision: 'first_approval', escalationId: limitDecision.escalation?.id, notes: input.notes })],
            }]);
            return { final: false, message: 'Primeira aprovação registada. A operação exige dupla aprovação: falta um segundo aprovador do nível máximo.' };
        }
        const nextStatus = approved ? 'active' : 'rejected';
        const timestamp = new Date().toISOString();
        const notes = input.notes?.trim() || (approved ? 'Aprovado sem observações adicionais.' : 'Rejeitado sem observações adicionais.');
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
        if (approved) {
            await this.assertNotFrozen();
            await this.assertCashAvailable(toMinorUnits(input.credit.principalAmount, 'Capital do crédito'), 'o desembolso deste crédito');
        }
        const entry: any = approved ? await buildDisbursementAccountingEntry({
            id: `origination:${input.credit.id}`, creditId: input.credit.id,
            clientId: input.credit.clientId, amount: input.credit.principalAmount,
            processedBy: input.actorName, usuario_id: input.actorId,
            description: `Desembolso inicial do crédito ${input.credit.id}`,
            fundingAccount: await this.fundingAccountForClient(input.credit.clientId)
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
                sql: `INSERT INTO credit_approvals (id, creditId, clientId, clientName, principalAmount, interestRate,
                      installments, decision, reason, requestedBy, requestedAt, decidedBy, decidedById, decidedAt)
                      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                params: [`approval:${input.credit.id}:${input.auditId}`, input.credit.id, input.credit.clientId || null,
                    input.credit.clientName, Number(input.credit.principalAmount) || 0, Number(input.credit.interestRate) || 0,
                    Number(input.credit.installments) || 0, input.decision, notes, input.credit.requestedBy || null,
                    input.credit.requestedAt ? new Date(input.credit.requestedAt).toISOString() : (input.credit.createdAt ? new Date(input.credit.createdAt).toISOString() : null),
                    input.actorName, input.actorId, timestamp]
            },
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
                    JSON.stringify({ decision: input.decision, notes, escalationId: limitDecision.escalation?.id, requiredLevel: limitDecision.required.name })]
            },
            ...limitDecision.statements
        ]).catch(error => {
            if (/conflito de concorr/i.test(String(error?.message)) && limitDecision.statements.some(statement => /limit_locks/.test(statement.sql)))
                throw new Error('O seu volume de aprovação foi consumido entretanto por outra operação. Peça a outro aprovador do mesmo nível ou superior.');
            throw error;
        });
        return { final: true };
    }

    /** Histórico das decisões de aprovação/rejeição (mais recentes primeiro). */
    static async getCreditApprovals(): Promise<CreditApprovalRecord[]> {
        const rows = await db.all<any>(`SELECT id, creditId, clientId, clientName, principalAmount, interestRate, installments,
            decision, reason, requestedBy, requestedAt, decidedBy, decidedById, decidedAt
            FROM credit_approvals ORDER BY decidedAt DESC`).catch(() => []);
        return rows.map(row => ({
            ...row,
            principalAmount: Number(row.principalAmount) || 0,
            interestRate: Number(row.interestRate) || 0,
            installments: Number(row.installments) || 0,
        }));
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

    /** Pagamentos para a página de gestão: confirmados, pendentes de validação e anulados. */
    static async getPaymentsForManagement(): Promise<Payment[]> {
        const rows = await RepositorioPagamento.findForManagement();
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

    /**
     * Regista um pagamento confirmado. A alocação e os novos saldos são calculados aqui, a partir
     * dos valores persistidos, e gravados na mesma transação com verificação de versão.
     */
    static async addPaymentAndUpdateCredit(
        input: Payment,
        expectedVersion: number,
        clientId?: string,
        options: { confirmPending?: { id: string; name: string } } = {}
    ): Promise<PaymentOperationResult & { payment: Payment }> {
        await assertFinancialConnection('registar o pagamento');
        if (input.status !== 'confirmed') throw new Error('Só pagamentos confirmados podem liquidar prestações.');
        if (!input.paymentDate || Number.isNaN(new Date(input.paymentDate).getTime())) throw new Error('Data de pagamento inválida.');
        if (!Number.isInteger(expectedVersion) || expectedVersion < 0) throw new Error('Versão de crédito inválida.');
        toMinorUnits(input.amount, 'Montante do pagamento');
        await this.assertNotFrozen();
        const creditState = await db.get<any>('SELECT status FROM credits WHERE id = ? AND deletedAt IS NULL', [input.creditId]);
        if (creditState && !this.PAYABLE_STATUSES.includes(String(creditState.status))) {
            throw new Error(creditState.status === 'pending_approval'
                ? 'Este crédito ainda está pendente de aprovação: só pode receber pagamentos depois de aprovado.'
                : 'Este crédito não está activo (rejeitado, cancelado ou liquidado) e não pode receber pagamentos.');
        }
        // Alçada de recebimento em numerário: acima do limite por operação só por transferência.
        const cashActor = input.method === 'cash' && !options.confirmPending ? await ServicoAlcadas.actorOf(input.usuario_id) : null;
        const cashLimitStatements = cashActor ? await ServicoAlcadas.enforce({ actor: cashActor, operationType: 'cash_receipt',
            amountMinor: toMinorUnits(input.amount, 'Montante do pagamento'), entityType: 'payment', entityId: input.id }) : [];
        // Mora acumulada até à data do pagamento: é lançada antes da alocação, para o pagamento a liquidar primeiro.
        const moraDate = input.paymentDate && !isNaN(new Date(input.paymentDate).getTime()) ? new Date(input.paymentDate) : new Date();
        const mora = await this.postAccruedLateInterest(input.creditId, moraDate, { id: input.usuario_id, name: input.processedBy });
        const current = await this.loadCreditBalances(input.creditId, expectedVersion + (mora.postedMinor > 0 ? 1 : 0));
        const amountMinor = toMinorUnits(input.amount, 'Montante do pagamento');
        let allocation: AllocationMinor;
        let plan: ReturnType<typeof planConsecutiveInstallments> | null = null;
        if (input.installmentCount != null) {
            plan = planConsecutiveInstallments(await this.getCreditInstallments(input.creditId), input.installmentCount);
            if (amountMinor !== plan.amountMinor) {
                throw new Error('O cronograma mudou. Atualize as prestações e tente novamente.');
            }
            allocation = { principalMinor: plan.principalMinor, interestMinor: plan.interestMinor, lateInterestMinor: plan.lateInterestMinor };
        } else {
            // Liquida prestação a prestação (mora, juro e capital da mais antiga primeiro); sem plano, por componente.
            const schedule = await this.getCreditInstallments(input.creditId);
            allocation = schedule.length
                ? allocatePaymentByInstallments(schedule, current, amountMinor)
                : allocatePaymentMinor(current, amountMinor);
        }
        const after = applyPaymentToBalances(current, allocation);
        if (plan && input.installmentCount === plan.open.length && after.status !== 'paid') {
            throw new Error('O saldo do crédito diverge do cronograma. A liquidação total foi recusada.');
        }
        if (plan && input.installmentCount! < plan.open.length && after.status === 'paid') {
            throw new Error('O saldo do crédito diverge do cronograma. Reveja as prestações antes de continuar.');
        }
        const payment: Payment = {
            ...input,
            allocatedToPrincipal: allocation.principalMinor / 100,
            allocatedToInterest: allocation.interestMinor / 100,
            allocatedToLateInterest: allocation.lateInterestMinor / 100
        };
        const paymentDate = payment.paymentDate && !isNaN(new Date(payment.paymentDate).getTime())
            ? new Date(payment.paymentDate).toISOString()
            : new Date().toISOString();
        const accountingEntry = await buildPaymentAccountingEntry({
            ...payment,
            clientId,
            processedBy: payment.processedBy || payment.usuario_id || 'system'
        }, await this.previousAccountingHash(), new Date());
        (accountingEntry as any).ledgerComponents = await this.paymentLedgerComponents(payment);
        const reconciliation = await this.installmentReconciliationStatements(payment.creditId, { add: payment }, new Date(paymentDate));
        const paidAt = after.status === 'paid' ? new Date().toISOString() : null;
        // Recibo sequencial por ano de emissão (hora de Angola), sem saltos: o número só é atribuído aqui,
        // dentro da operação que confirma o recebimento; o índice único impede números repetidos.
        const issuedAt = new Date();
        const receiptYear = new Date(issuedAt.getTime() + 3_600_000).getUTCFullYear();
        const lastReceipt = await db.get<{ last: number | null }>('SELECT MAX(receiptSeq) AS last FROM payments WHERE receiptYear = ?', [receiptYear]);
        const receiptSeq = (Number(lastReceipt?.last) || 0) + 1;
        const allocationDetail = JSON.stringify(reconciliation.detail);
        const registeredAt = input.registeredAt ? new Date(input.registeredAt).toISOString() : issuedAt.toISOString();
        Object.assign(payment, { receiptYear, receiptSeq, allocationDetail, balanceAfterMinor: after.balanceMinor, registeredAt });
        const confirm = options.confirmPending;
        if (confirm) Object.assign(payment, { validatedAt: issuedAt.toISOString(), validatedBy: confirm.name });
        const paymentStatement = confirm ? {
            sql: `UPDATE payments SET status = 'confirmed', paymentDate = ?,
                      allocatedToPrincipal = ?, allocatedToPrincipalMinor = ?, allocatedToInterest = ?, allocatedToInterestMinor = ?,
                      allocatedToLateInterest = ?, allocatedToLateInterestMinor = ?, receiptYear = ?, receiptSeq = ?,
                      allocationDetail = ?, balanceAfterMinor = ?, validatedAt = ?, validatedBy = ?
                  WHERE id = ? AND status = 'pending' AND deletedAt IS NULL`,
            params: [paymentDate, payment.allocatedToPrincipal || 0, toMinorUnits(payment.allocatedToPrincipal || 0),
                payment.allocatedToInterest || 0, toMinorUnits(payment.allocatedToInterest || 0),
                payment.allocatedToLateInterest || 0, toMinorUnits(payment.allocatedToLateInterest || 0),
                receiptYear, receiptSeq, allocationDetail, after.balanceMinor, issuedAt.toISOString(), confirm.name, payment.id],
            expectChanges: 1
        } : {
            sql: `INSERT INTO payments (id, creditId, clientName, amount, amountMinor, paymentDate, method, reference,
                      allocatedToPrincipal, allocatedToPrincipalMinor, allocatedToInterest, allocatedToInterestMinor,
                      allocatedToLateInterest, allocatedToLateInterestMinor, idempotencyKey, processedBy, status, usuario_id,
                      registeredAt, receiptYear, receiptSeq, allocationDetail, balanceAfterMinor, batchId, hasProof)
                  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            params: [
                payment.id, payment.creditId, payment.clientName, payment.amount, toMinorUnits(payment.amount), paymentDate,
                payment.method, payment.reference, payment.allocatedToPrincipal || 0, toMinorUnits(payment.allocatedToPrincipal || 0),
                payment.allocatedToInterest || 0, toMinorUnits(payment.allocatedToInterest || 0),
                payment.allocatedToLateInterest || 0, toMinorUnits(payment.allocatedToLateInterest || 0),
                payment.idempotencyKey || payment.id,
                payment.processedBy, payment.status, payment.usuario_id,
                registeredAt, receiptYear, receiptSeq, allocationDetail, after.balanceMinor, payment.batchId || null, payment.hasProof ? 1 : 0
            ]
        };
        await db.transaction([
            paymentStatement,
            this.creditBalanceStatement(payment.creditId, after, current.version, reconciliation.paidInstallments, paidAt),
            ...(after.status === 'paid' ? [{
                sql: `UPDATE contracts SET status = 'paid' WHERE id = ? AND status <> 'paid'`,
                params: [payment.creditId]
            }] : []),
            ...reconciliation.statements,
            this.accountingInsert(accountingEntry),
            ...this.ledgerStatements(accountingEntry),
            {
                sql: `INSERT INTO audit_logs (id, timestamp, userId, userName, action, entity, details, previousState, newState, metadata)
                      VALUES (?, ?, ?, ?, 'create', 'payment', ?, ?, ?, ?)`,
                params: [crypto.randomUUID(), accountingEntry.timestampIso, confirm ? confirm.id : payment.usuario_id || null,
                    confirm ? confirm.name : payment.processedBy,
                    `${confirm ? 'Transferência validada' : 'Pagamento registado'} no crédito ${payment.creditId} (${formatReceiptNumber(receiptYear, receiptSeq)})`,
                    // Antes/depois: estado do pagamento e saldo em dívida do contrato.
                    JSON.stringify({ status: confirm ? 'pending' : null, currentBalance: current.balanceMinor / 100 }),
                    JSON.stringify({ status: 'confirmed', amount: payment.amount, currentBalance: after.balanceMinor / 100,
                        receipt: formatReceiptNumber(receiptYear, receiptSeq) }),
                    JSON.stringify({ paymentId: payment.id, creditId: payment.creditId,
                        idempotencyKey: payment.idempotencyKey || payment.id,
                        amountMinor: toMinorUnits(payment.amount) })]
            },
            {
                sql: `INSERT INTO notifications (id, userId, title, message, type, read, timestamp)
                      VALUES (?, ?, 'Pagamento Recebido', ?, 'success', 0, ?)`,
                params: [`notification:payment:${payment.id}`, payment.usuario_id || null,
                    `Recebido pagamento de ${formatCurrency(payment.amount)} de ${payment.clientName}.`,
                    accountingEntry.timestampIso]
            },
            ...cashLimitStatements
        ]);
        return Object.assign(accountingEntry as AccountingEntry, {
            paidInstallments: reconciliation.paidInstallments, payment,
            creditState: this.creditStateResult(after, reconciliation.paidInstallments, current.version + 1, paidAt)
        });
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
        userId: string,
        justification?: string,
        requestId?: string
    ): Promise<PaymentOperationResult> {
        await assertFinancialConnection('anular o pagamento');
        await this.assertNotFrozen();
        const timestamp = new Date();
        const current = await this.loadCreditBalances(credit.id, credit.version ?? 0);
        const after = revertPaymentFromBalances(current, await this.loadPaymentAllocation(payment.id));
        const originalState = JSON.stringify(payment);
        const entry = await buildPaymentCorrectionEntry({ ...payment, clientId: credit.clientId, processedBy: userId },
            await this.previousAccountingHash(), 'reversal', timestamp);
        (entry as any).justification = justification || 'Estorno de pagamento';
        (entry as any).ledgerComponents = await this.originalPaymentLedgerComponents(payment.id);
        const reconciliation = await this.installmentReconciliationStatements(credit.id, { excludePaymentId: payment.id }, timestamp);
        const decision = requestId ? await this.reversalDecisionStatement(requestId, 'payment:' + payment.id, userId, entry.id, timestamp.toISOString()) : [];
        const actor = await db.get<{ name: string }>('SELECT name FROM users WHERE id = ?', [userId]).catch(() => undefined);
        const request = requestId ? await db.get<{ requestedBy: string }>('SELECT requestedBy FROM accounting_requests WHERE id = ?', [requestId]).catch(() => undefined) : undefined;
        const actorName = actor?.name || userId;
        const reversalActor = await ServicoAlcadas.actorOf(userId);
        const requestRow = requestId ? await db.get<{ requestedById: string }>('SELECT requestedById FROM accounting_requests WHERE id = ?', [requestId]).catch(() => undefined) : undefined;
        const reversalStatements = reversalActor ? await ServicoAlcadas.approverStatements({ actor: reversalActor, operationType: 'payment_reversal',
            amountMinor: toMinorUnits(payment.amount), entityType: 'payment', entityId: payment.id, requesterId: requestRow?.requestedById || null }) : [];
        await db.transaction([
            { sql: `UPDATE payments SET status = 'cancelled', cancelledAt = ?, cancelledBy = ?, cancelReason = ?, cancelApprovedBy = ?,
                    originalState = ? WHERE id = ? AND deletedAt IS NULL AND status = 'confirmed'`,
                params: [timestamp.toISOString(), request?.requestedBy || actorName, justification || 'Estorno de pagamento',
                    request ? actorName : null, originalState, payment.id], expectChanges: 1 },
            this.creditBalanceStatement(credit.id, after, current.version, reconciliation.paidInstallments, null),
            ...(current.status === 'paid' && after.status !== 'paid' ? [{
                sql: `UPDATE contracts SET status = 'active' WHERE id = ? AND status = 'paid'`, params: [credit.id]
            }] : []),
            ...reconciliation.statements,
            this.accountingInsert(entry),
            ...this.ledgerStatements(entry),
            ...decision,
            {
                sql: `INSERT INTO audit_logs (id, timestamp, userId, userName, action, entity, details, previousState, newState, metadata)
                      VALUES (?, ?, ?, ?, 'delete', 'payment', ?, ?, ?, ?)`,
                params: [crypto.randomUUID(), timestamp.toISOString(), userId, actorName,
                    `Anulação e estorno do pagamento ${formatReceiptNumber(payment.receiptYear, payment.receiptSeq) || payment.id}`,
                    JSON.stringify({ status: 'confirmed', amount: payment.amount, currentBalance: current.balanceMinor / 100 }),
                    JSON.stringify({ status: 'cancelled', amount: payment.amount, currentBalance: after.balanceMinor / 100 }),
                    JSON.stringify({ paymentId: payment.id, creditId: credit.id, justification: justification || 'Estorno de pagamento',
                        amountMinor: toMinorUnits(payment.amount), approvedBy: request ? actorName : undefined })]
            },
            ...reversalStatements
        ]);
        return Object.assign(entry as AccountingEntry, {
            paidInstallments: reconciliation.paidInstallments,
            creditState: this.creditStateResult(after, reconciliation.paidInstallments, current.version + 1, null)
        });
    }

    static async restorePaymentAndUpdateCredit(
        payment: Payment,
        credit: Credit,
        userId: string
    ): Promise<PaymentOperationResult> {
        await this.assertNotFrozen();
        const timestamp = new Date();
        const current = await this.loadCreditBalances(credit.id, credit.version ?? 0);
        const after = applyPaymentToBalances(current, await this.loadPaymentAllocation(payment.id));
        const paidAt = after.status === 'paid' ? timestamp.toISOString() : null;
        const entry = await buildPaymentCorrectionEntry({ ...payment, clientId: credit.clientId, processedBy: userId },
            await this.previousAccountingHash(), 'restore', timestamp);
        (entry as any).ledgerComponents = await this.originalPaymentLedgerComponents(payment.id);
        const reconciliation = await this.installmentReconciliationStatements(credit.id, { includePaymentId: payment.id }, timestamp);
        await db.transaction([
            { sql: `UPDATE payments SET deletedAt = NULL, deletedBy = NULL, restoredAt = ?
                    WHERE id = ? AND deletedAt IS NOT NULL`, params: [timestamp.toISOString(), payment.id], expectChanges: 1 },
            this.creditBalanceStatement(credit.id, after, current.version, reconciliation.paidInstallments, paidAt),
            ...(after.status === 'paid' ? [{
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
        return Object.assign(entry as AccountingEntry, {
            paidInstallments: reconciliation.paidInstallments,
            creditState: this.creditStateResult(after, reconciliation.paidInstallments, current.version + 1, paidAt)
        });
    }

    static async restorePayment(id: string): Promise<void> {
        await RepositorioPagamento.restore(id);
    }

    static async hardDeletePayment(id: string): Promise<void> {
        throw new Error(`A eliminação permanente de pagamentos financeiros foi desativada por política de retenção (${id}).`);
    }

    // ---------------------------------------------------------------------------------------------
    // Controlos contabilísticos: congelamento (pânico), saldo disponível, lançamentos manuais,
    // estornos de lançamentos e abate de créditos. Tudo em partidas dobradas e na cadeia de hashes.
    // ---------------------------------------------------------------------------------------------

    static readonly ACCOUNTING_CONFIG_KEY = 'accounting_config';
    static readonly PANIC_LOCK_KEY = 'accounting_panic_lock';
    /** Contas que só as operações de crédito movimentam (a carteira tem de bater com os contratos). */
    static readonly CREDIT_ONLY_ACCOUNTS = new Set(['portfolio', 'receivable_interest', 'receivable_late_interest', 'written_off_memo', 'written_off_memo_contra']);

    private static async sharedSetting(key: string): Promise<any> {
        const row = await db.get<{ value: string }>('SELECT value FROM shared_settings WHERE key = ?', [key]).catch(() => undefined);
        if (!row?.value) return null;
        try { return JSON.parse(row.value); } catch { return null; }
    }

    /** Bloqueio de desembolsos sem saldo: activo por omissão; só um administrador o pode desligar. */
    static async getAccountingConfig(): Promise<{ cashGuard: boolean }> {
        const parsed = await this.sharedSetting(this.ACCOUNTING_CONFIG_KEY);
        return { cashGuard: parsed?.cashGuard !== false };
    }

    static async getPanicLock(): Promise<{ active: true; reason: string; lockedBy: string; lockedById: string; lockedAt: string } | null> {
        const parsed = await this.sharedSetting(this.PANIC_LOCK_KEY);
        return parsed?.active === true ? parsed : null;
    }

    private static async assertNotFrozen() {
        const lock = await this.getPanicLock();
        if (lock) {
            throw new Error(`Movimentação financeira congelada por ${lock.lockedBy} em ${new Date(lock.lockedAt).toLocaleString('pt-AO')} (motivo: ${lock.reason}). Só outro administrador pode desbloquear, em Contabilidade.`);
        }
    }

    /** Saldos de Caixa e Bancos no razão (débitos − créditos), em cêntimos. */
    static async liquidBalancesMinor(): Promise<{ cash: number; bank: number; total: number }> {
        const rows = await db.all<{ account: string; side: string; total: number }>(`SELECT account, side, SUM(amountMinor) AS total
            FROM ledger_lines WHERE account IN ('cash', 'bank') GROUP BY account, side`);
        const balance = (account: string) => rows.filter(row => row.account === account)
            .reduce((sum, row) => sum + (row.side === 'debit' ? 1 : -1) * Number(row.total || 0), 0);
        const cash = balance('cash');
        const bank = balance('bank');
        return { cash, bank, total: cash + bank };
    }

    private static async accountBalanceMinor(account: string): Promise<number> {
        const rows = await db.all<{ side: string; total: number }>('SELECT side, SUM(amountMinor) AS total FROM ledger_lines WHERE account = ? GROUP BY side', [account]);
        return rows.reduce((sum, row) => sum + (row.side === 'debit' ? 1 : -1) * Number(row.total || 0), 0);
    }

    private static formatMinor(minor: number) {
        return (minor / 100).toLocaleString('pt-AO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    private static async assertCashAvailable(amountMinor: number, purpose: string) {
        if (!(await this.getAccountingConfig()).cashGuard) return;
        const balances = await this.liquidBalancesMinor();
        if (balances.total < amountMinor) {
            throw new Error(`Saldo de Caixa e Bancos insuficiente para ${purpose}: disponível ${this.formatMinor(balances.total)} Kz, necessário ${this.formatMinor(amountMinor)} Kz. Registe a entrada de capital ou o financiamento em Contabilidade › Lançamentos.`);
        }
    }

    /** O desembolso sai da caixa quando o cliente recebe em mão e do banco nos restantes casos. */
    private static async fundingAccountForClient(clientId?: string): Promise<'cash' | 'bank'> {
        if (!clientId) return 'bank';
        const row = await db.get<{ receiveMethod?: string }>('SELECT receiveMethod FROM clients WHERE id = ?', [clientId]).catch(() => undefined);
        return row?.receiveMethod === 'cash' ? 'cash' : 'bank';
    }

    private static journalAudit(entry: any, actorId: string, actorName: string, details: string, metadata: Record<string, unknown>) {
        return {
            sql: `INSERT INTO audit_logs (id, timestamp, userId, userName, action, entity, details, metadata)
                  VALUES (?, ?, ?, ?, 'create', 'accounting_entry', ?, ?)`,
            params: [crypto.randomUUID(), entry.timestampIso, actorId || null, actorName, details,
                JSON.stringify({ accountingEntryId: entry.id, amountTotalMinor: entry.amountTotalMinor, ...metadata })]
        };
    }

    /**
     * Lançamentos manuais: entrada de capital, financiamento obtido, despesa, transferência entre caixa e
     * banco, constituição/reversão de provisões e lançamento livre (só administradores). A chave
     * idempotente impede que um duplo clique registe o mesmo movimento duas vezes.
     */
    static async registerJournalEntry(input: {
        kind: 'capital_entry' | 'loan_received' | 'expense' | 'transfer' | 'provision' | 'provision_release' | 'custom';
        amount: number; description: string; idempotencyKey: string;
        actorId: string; actorName: string; actorRole?: string;
        liquidAccount?: 'cash' | 'bank'; debitAccount?: string; creditAccount?: string;
    }): Promise<AccountingEntry> {
        await this.assertNotFrozen();
        if (!/^[a-zA-Z0-9:_-]{8,128}$/u.test(input.idempotencyKey)) throw new Error('Chave idempotente inválida.');
        const amountMinor = toMinorUnits(input.amount, 'Valor do lançamento');
        if (amountMinor <= 0) throw new Error('O valor do lançamento deve ser superior a zero.');
        const description = input.description?.trim();
        if (!description || description.length < 5) throw new Error('Descreva o lançamento (pelo menos 5 caracteres).');
        const liquid = input.liquidAccount === 'cash' ? 'cash' : 'bank';
        const line = (account: string, side: 'debit' | 'credit', component: string): JournalLineInput => ({ account, side, amountMinor, component });
        let lines: JournalLineInput[];
        let sourceType = 'manual';
        switch (input.kind) {
            case 'capital_entry':
                lines = [line(liquid, 'debit', 'capital'), line('capital', 'credit', 'capital')];
                break;
            case 'loan_received':
                lines = [line(liquid, 'debit', 'manual'), line('loans_payable', 'credit', 'manual')];
                break;
            case 'expense':
                sourceType = 'expense';
                lines = [line('expenses', 'debit', 'expense'), line(liquid, 'credit', 'settlement')];
                break;
            case 'transfer': {
                const from = input.creditAccount === 'cash' ? 'cash' : 'bank';
                const to = from === 'cash' ? 'bank' : 'cash';
                lines = [line(to, 'debit', 'transfer'), line(from, 'credit', 'transfer')];
                break;
            }
            case 'provision':
                sourceType = 'provision';
                lines = [line('pdd', 'debit', 'provision'), line('provision', 'credit', 'provision')];
                break;
            case 'provision_release': {
                sourceType = 'provision';
                const available = -(await this.accountBalanceMinor('provision'));
                if (available < amountMinor) throw new Error(`Provisões disponíveis insuficientes: ${this.formatMinor(Math.max(0, available))} Kz.`);
                lines = [line('provision', 'debit', 'provision'), line('pdd', 'credit', 'provision')];
                break;
            }
            case 'custom': {
                if (!['admin', 'super_admin'].includes(String(input.actorRole))) throw new Error('Só administradores podem registar lançamentos livres.');
                const debit = String(input.debitAccount || ''), credit = String(input.creditAccount || '');
                if (!debit || !credit || debit === credit) throw new Error('Escolha contas diferentes a débito e a crédito.');
                if (this.CREDIT_ONLY_ACCOUNTS.has(debit) || this.CREDIT_ONLY_ACCOUNTS.has(credit)) {
                    throw new Error('A carteira e os juros a receber só são movimentados pelas operações de crédito e pagamento.');
                }
                lines = [line(debit, 'debit', 'manual'), line(credit, 'credit', 'manual')];
                break;
            }
            default:
                throw new Error('Tipo de lançamento desconhecido.');
        }
        // Saídas de caixa/banco nunca deixam as disponibilidades negativas (quando o controlo está activo).
        const liquidOut = lines.filter(item => item.side === 'credit' && (item.account === 'cash' || item.account === 'bank'));
        if (liquidOut.length && (await this.getAccountingConfig()).cashGuard) {
            const balances = await this.liquidBalancesMinor();
            for (const item of liquidOut) {
                const available = balances[item.account as 'cash' | 'bank'];
                if (available < item.amountMinor) {
                    throw new Error(`Saldo insuficiente em ${item.account === 'cash' ? 'Caixa' : 'Bancos'}${input.kind === 'transfer' ? '' : ' e disponibilidades'}: disponível ${this.formatMinor(available)} Kz.`);
                }
            }
        }
        const entry: any = await buildJournalEntry({
            id: `journal:${input.idempotencyKey}`, type: input.kind, description, lines,
            sourceType, sourceId: `journal:${input.idempotencyKey}`, processedBy: input.actorName, usuario_id: input.actorId,
        }, await this.previousAccountingHash(), new Date());
        await db.transaction([
            { ...this.accountingInsert(entry), expectChanges: 1 },
            ...this.ledgerStatements(entry),
            this.journalAudit(entry, input.actorId, input.actorName, `Lançamento manual: ${description}`, { kind: input.kind })
        ]);
        return entry as AccountingEntry;
    }

    /** Linhas e cabeçalho de uma transação do razão. */
    static async getLedgerTransaction(entryId: string) {
        const transaction = await db.get<any>('SELECT * FROM ledger_transactions WHERE id = ?', [entryId]);
        const lines = transaction ? await db.all<any>('SELECT * FROM ledger_lines WHERE transactionId = ? ORDER BY id', [entryId]) : [];
        return { transaction, lines };
    }

    /**
     * Estorno de um lançamento manual (entrada de capital, despesa, transferência, provisão): novo
     * lançamento com os lados trocados. Pagamentos e desembolsos estornam-se na operação de origem.
     */
    private static async reversalDecisionStatement(requestId: string, targetId: string, actorId: string, resultEntryId: string, now: string) {
        const request = await db.get<{requestedById:string;reason:string}>('SELECT requestedById, reason FROM accounting_requests WHERE id = ? AND kind = ? AND targetId = ? AND status = ?', [requestId, 'reversal', targetId, 'pending']);
        const actor = await db.get<{role:string;name:string}>('SELECT role, name FROM users WHERE id = ?', [actorId]);
        if (!request || request.requestedById === actorId || !actor || !['admin','super_admin'].includes(actor.role)) throw new Error('O estorno exige um pedido pendente e outro administrador.');
        return [{ sql: `UPDATE accounting_requests SET status = ?, decidedBy = ?, decidedById = ?, decidedAt = ?, decisionReason = ?, resultEntryId = ?
                        WHERE id = ? AND status = 'pending' AND requestedById <> ?`,
            params: ['approved',actor.name,actorId,now,request.reason,resultEntryId,requestId,actorId], expectChanges: 1 }];
    }

    static async reverseJournalEntry(input: { entryId: string; reason: string; actorId: string; actorName: string; approvedBy?: string; requestId?: string }): Promise<AccountingEntry> {
        await this.assertNotFrozen();
        const reason = input.reason?.trim() || '';
        if (reason.length < 10) throw new Error('Indique o motivo do estorno (pelo menos 10 caracteres).');
        const { transaction, lines } = await this.getLedgerTransaction(input.entryId);
        if (!transaction) throw new Error('Lançamento não encontrado no razão.');
        if (!['manual', 'expense', 'provision'].includes(String(transaction.sourceType))) {
            throw new Error('Este lançamento resulta de uma operação de crédito ou de pagamento: estorne-o na origem (por exemplo, Pagamentos › Estornar).');
        }
        const reversalId = `journal-reversal:${input.entryId}`;
        if (await db.get<any>('SELECT id FROM ledger_transactions WHERE id = ?', [reversalId])) throw new Error('Este lançamento já foi estornado.');
        const reversed: JournalLineInput[] = lines.map(item => ({
            account: item.account, side: item.side === 'debit' ? 'credit' : 'debit', amountMinor: Number(item.amountMinor), component: item.component,
        }));
        const liquidOut = reversed.filter(item => item.side === 'credit' && (item.account === 'cash' || item.account === 'bank'))
            .reduce((sum, item) => sum + item.amountMinor, 0);
        if (liquidOut > 0) await this.assertCashAvailable(liquidOut, 'o estorno deste lançamento');
        const entry: any = await buildJournalEntry({
            id: reversalId, type: 'journal_reversal', description: `Estorno: ${transaction.description || input.entryId}`, lines: reversed,
            sourceType: 'journal_reversal', sourceId: input.entryId, processedBy: input.actorName, usuario_id: input.actorId,
            justification: input.approvedBy ? `${reason} (aprovado por ${input.approvedBy})` : reason,
        }, await this.previousAccountingHash(), new Date());
        const decision = input.requestId ? await this.reversalDecisionStatement(input.requestId, input.entryId, input.actorId, entry.id, entry.timestampIso) : [];
        const reversalActor = await ServicoAlcadas.actorOf(input.actorId);
        const requestRow = input.requestId ? await db.get<{ requestedById: string }>('SELECT requestedById FROM accounting_requests WHERE id = ?', [input.requestId]).catch(() => undefined) : undefined;
        const reversalAmountMinor = Math.round(Number((entry as any).amount || 0) * 100);
        const reversalStatements = reversalActor && reversalAmountMinor > 0 ? await ServicoAlcadas.approverStatements({ actor: reversalActor, operationType: 'accounting_reversal',
            amountMinor: reversalAmountMinor, entityType: 'accounting_entry', entityId: input.entryId, requesterId: requestRow?.requestedById || null }) : [];
        await db.transaction([
            { ...this.accountingInsert(entry), expectChanges: 1 },
            ...this.ledgerStatements(entry),
            ...decision,
            ...reversalStatements,
            this.journalAudit(entry, input.actorId, input.actorName, `Estorno do lançamento ${input.entryId}`, { reversedEntryId: input.entryId, reason, approvedBy: input.approvedBy || null })
        ]);
        return entry as AccountingEntry;
    }

    /**
     * Abate de um crédito incobrável (depois de aprovado por outro administrador): usa as provisões
     * disponíveis, regista a perda pelo restante e retira o capital da carteira. O crédito continua em
     * cobrança; o que for recebido depois é proveito de recuperação.
     */
    /**
     * Substitui as prestações por vencer por um novo plano (reestruturação ou liquidação antecipada). As prestações
     * pagas e em atraso ficam como estão; as substituídas mantêm o id e o número (as que sobram ficam anuladas a
     * zero e as que faltam são acrescentadas). A diferença de juros vai ao razão com o mesmo lançamento de ajuste
     * de encargos. As imputações dos pagamentos continuam a ser feitas pela conciliação existente.
     */
    static async applyInstallmentPlan(input: {
        creditId: string; expectedVersion: number; replacedIds: string[];
        plan: Array<{ dueDate: string; principalMinor: number; interestMinor: number }>;
        markRestructured: boolean; reason: string; actorId: string; actorName: string;
        extraStatements?: Array<{ sql: string; params: unknown[]; expectChanges?: number }>;
    }) {
        await assertFinancialConnection(input.markRestructured ? 'reestruturar o crédito' : 'liquidar antecipadamente o crédito');
        await this.assertNotFrozen();
        const credit = await db.get<any>('SELECT id, clientId, status, version FROM credits WHERE id = ? AND deletedAt IS NULL', [input.creditId]);
        if (!credit) throw new Error('Crédito não encontrado.');
        if (!this.PAYABLE_STATUSES.includes(String(credit.status))) throw new Error('Só créditos em curso podem ser reestruturados ou liquidados antecipadamente.');
        if (Number(credit.version ?? 0) !== input.expectedVersion) throw new Error('O crédito foi alterado entretanto. Atualize a página e simule de novo.');
        const schedule = await this.getCreditInstallments(input.creditId);
        const replaced = schedule.filter(item => input.replacedIds.includes(item.id)).sort((a, b) => a.installmentNumber - b.installmentNumber);
        if (replaced.length !== input.replacedIds.length) throw new Error('O plano de prestações mudou entretanto. Simule de novo.');
        if (!input.plan.length) throw new Error('O novo plano não tem prestações.');
        const statements: Array<{ sql: string; params: unknown[]; expectChanges?: number }> = [];
        let maxNumber = Math.max(0, ...schedule.map(item => item.installmentNumber));
        // Uma prestação parcialmente paga fica fechada com o que já recebeu; o resto entra no novo plano.
        const slots = [...replaced];
        for (const item of replaced) {
            if (item.paidPrincipalMinor + item.paidInterestMinor > 0) {
                statements.push({ sql: `UPDATE credit_installments SET principalMinor = ?, interestMinor = ?, version = version + 1 WHERE id = ? AND version = ?`,
                    params: [item.paidPrincipalMinor, item.paidInterestMinor, item.id, item.version], expectChanges: 1 });
                slots.splice(slots.indexOf(item), 1);
            }
        }
        input.plan.forEach((planned, index) => {
            const slot = slots[index];
            if (slot) {
                statements.push({ sql: `UPDATE credit_installments SET dueDate = ?, principalMinor = ?, interestMinor = ?, status = 'pending', version = version + 1 WHERE id = ? AND version = ?`,
                    params: [new Date(planned.dueDate).toISOString(), planned.principalMinor, planned.interestMinor, slot.id, slot.version], expectChanges: 1 });
            } else {
                maxNumber += 1;
                statements.push({
                    sql: `INSERT INTO credit_installments
                      (id, creditId, installmentNumber, dueDate, principalMinor, interestMinor)
                      VALUES (?, ?, ?, ?, ?, ?)`,
                    params: [`${input.creditId}:installment:${maxNumber}`, input.creditId, maxNumber, new Date(planned.dueDate).toISOString(), planned.principalMinor, planned.interestMinor],
                    expectChanges: 1,
                });
            }
        });
        for (const slot of slots.slice(input.plan.length)) {
            statements.push({ sql: `UPDATE credit_installments SET principalMinor = 0, interestMinor = 0, status = 'cancelled', version = version + 1 WHERE id = ? AND version = ?`,
                params: [slot.id, slot.version], expectChanges: 1 });
        }
        // Totais do crédito depois da mudança: capital mantém-se; juros por receber passam a ser os do novo plano.
        const untouched = schedule.filter(item => !input.replacedIds.includes(item.id));
        const partialKept = replaced.filter(item => item.paidPrincipalMinor + item.paidInterestMinor > 0);
        const interestAfter = [...untouched.map(item => Math.max(0, item.interestMinor - item.paidInterestMinor)), ...input.plan.map(item => item.interestMinor), ...partialKept.map(() => 0)].reduce((sum, value) => sum + value, 0);
        const principalAfter = [...untouched.map(item => Math.max(0, item.principalMinor - item.paidPrincipalMinor)), ...input.plan.map(item => item.principalMinor)].reduce((sum, value) => sum + value, 0);
        const balances = await this.loadCreditBalances(input.creditId, input.expectedVersion);
        if (Math.abs(principalAfter - balances.balanceMinor) > input.plan.length) throw new Error('O novo plano não reparte exatamente o capital em dívida.');
        const delta = interestAfter - balances.interestMinor;
        const timestamp = new Date();
        const entry: any = delta !== 0 ? await buildChargeAdjustmentEntry({
            id: `restructure:${input.creditId}:${timestamp.getTime()}`, creditId: input.creditId, clientId: credit.clientId, component: 'interest',
            deltaMinor: delta, processedBy: input.actorName, usuario_id: input.actorId, justification: input.reason,
        }, await this.previousAccountingHash(), timestamp) : null;
        const lastDue = [...untouched.map(item => item.dueDate), ...input.plan.map(item => new Date(item.dueDate).toISOString())].sort().at(-1);
        const totalDue = balances.balanceMinor + interestAfter + balances.lateInterestMinor;
        statements.push({
            sql: `UPDATE credits SET accruedInterest = ?, accruedInterestMinor = ?, totalDue = ?, totalDueMinor = ?, dueDate = ?, status = ?, version = version + 1
                  WHERE id = ? AND deletedAt IS NULL AND version = ?`,
            params: [interestAfter / 100, interestAfter, totalDue / 100, totalDue, lastDue || null, input.markRestructured ? 'renegotiated' : credit.status, input.creditId, input.expectedVersion],
            expectChanges: 1,
        });
        if (entry) statements.push(this.accountingInsert(entry), ...this.ledgerStatements(entry));
        statements.push(...(input.extraStatements || []));
        await db.transaction(statements);
        return { interestDeltaMinor: delta, totalDueMinor: totalDue, entryId: entry?.id || null };
    }

    static async writeOffCredit(input: { creditId: string; reason: string; requestedBy: string; requestedById: string; approvedBy: string; approvedById: string; requestId: string; decisionReason?: string }): Promise<AccountingEntry> {
        await assertFinancialConnection('abater o crédito');
        await this.assertNotFrozen();
        const request = await db.get<{id:string;requestedById:string;reason:string}>('SELECT id, requestedById, reason FROM accounting_requests WHERE id = ? AND kind = ? AND targetId = ? AND status = ?', [input.requestId,'writeoff',input.creditId,'pending']);
        if (!request || request.requestedById !== input.requestedById || request.reason !== input.reason) throw new Error('Pedido de abate pendente não encontrado ou alterado.');
        if (input.requestedById === input.approvedById) throw new Error('O abate tem de ser aprovado por um administrador diferente de quem o pediu.');
        const reason = input.reason?.trim() || '';
        if (reason.length < 10) throw new Error('Indique o motivo do abate (pelo menos 10 caracteres).');
        const credit = await db.get<any>('SELECT id, clientId, clientName, status, version FROM credits WHERE id = ? AND deletedAt IS NULL', [input.creditId]);
        if (!credit) throw new Error('Crédito não encontrado.');
        if (!['overdue', 'defaulted'].includes(String(credit.status))) throw new Error('Só créditos em atraso ou em incumprimento podem ser abatidos.');
        if (await db.get<any>('SELECT id FROM credit_writeoffs WHERE creditId = ?', [input.creditId])) throw new Error('Este crédito já foi abatido ao activo.');
        const balances = await this.loadCreditBalances(input.creditId, Number(credit.version ?? 0));
        const receivables = await db.all<{ account: string; side: string; amountMinor: number }>(`SELECT l.account, l.side, l.amountMinor
            FROM ledger_lines l JOIN accounting_entries a ON a.id = l.transactionId
            WHERE a.creditId = ? AND l.account IN ('receivable_interest', 'receivable_late_interest')`, [input.creditId]);
        const outstanding = (account: string) => Math.max(0, receivables.filter(item => item.account === account)
            .reduce((sum, item) => sum + (item.side === 'debit' ? 1 : -1) * Number(item.amountMinor), 0));
        const principalMinor = balances.balanceMinor;
        const interestMinor = outstanding('receivable_interest');
        const lateMinor = outstanding('receivable_late_interest');
        const totalMinor = principalMinor + interestMinor + lateMinor;
        if (totalMinor <= 0) throw new Error('O crédito não tem saldo por abater.');
        const provisionAvailable = Math.max(0, -(await this.accountBalanceMinor('provision')));
        const provisionUsed = Math.min(provisionAvailable, totalMinor);
        const loss = totalMinor - provisionUsed;
        const lines: JournalLineInput[] = [
            { account: 'provision', side: 'debit', amountMinor: provisionUsed, component: 'writeoff' },
            { account: 'writeoff_loss', side: 'debit', amountMinor: loss, component: 'writeoff' },
            { account: 'portfolio', side: 'credit', amountMinor: principalMinor, component: 'principal' },
            { account: 'receivable_interest', side: 'credit', amountMinor: interestMinor, component: 'interest_receivable' },
            { account: 'receivable_late_interest', side: 'credit', amountMinor: lateMinor, component: 'late_receivable' },
            { account: 'written_off_memo', side: 'debit', amountMinor: totalMinor, component: 'writeoff' },
            { account: 'written_off_memo_contra', side: 'credit', amountMinor: totalMinor, component: 'writeoff' },
        ].filter(item => item.amountMinor > 0) as JournalLineInput[];
        const entry: any = await buildJournalEntry({
            id: `writeoff:${input.creditId}`, type: 'writeoff', description: `Abate do crédito ${input.creditId} (${credit.clientName})`, lines,
            sourceType: 'writeoff', sourceId: input.creditId, creditId: input.creditId, clientId: credit.clientId || undefined,
            processedBy: input.approvedBy, usuario_id: input.approvedById, justification: reason,
        }, await this.previousAccountingHash(), new Date());
        const writeOffActor = await ServicoAlcadas.actorOf(input.approvedById);
        const writeOffStatements = writeOffActor ? await ServicoAlcadas.approverStatements({ actor: writeOffActor, operationType: 'write_off',
            amountMinor: principalMinor + interestMinor + lateMinor, entityType: 'credit', entityId: input.creditId, requesterId: input.requestedById }) : [];
        await db.transaction([
            ...writeOffStatements,
            { ...this.accountingInsert(entry), expectChanges: 1 },
            ...this.ledgerStatements(entry),
            {
                sql: `INSERT INTO credit_writeoffs (id, creditId, principalMinor, interestMinor, provisionUsedMinor, lossMinor, reason,
                      requestedBy, requestedById, approvedBy, approvedById, entryId, createdAt)
                      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                params: [crypto.randomUUID(), input.creditId, principalMinor, interestMinor + lateMinor, provisionUsed, loss, reason,
                    input.requestedBy, input.requestedById, input.approvedBy, input.approvedById, entry.id, entry.timestampIso],
                expectChanges: 1
            },
            ...[{
                sql: `UPDATE credits SET status = 'defaulted', version = version + 1 WHERE id = ? AND deletedAt IS NULL AND version = ?`,
                params: [input.creditId, balances.version], expectChanges: 1
            }],
            { sql: `UPDATE accounting_requests SET status = ?, decidedBy = ?, decidedById = ?, decidedAt = ?, decisionReason = ?, resultEntryId = ?
                WHERE id = ? AND status = 'pending' AND requestedById <> ?`,
                params:['approved',input.approvedBy,input.approvedById,entry.timestampIso,input.decisionReason || reason,entry.id,input.requestId,input.approvedById],expectChanges:1 },
            this.journalAudit(entry, input.approvedById, input.approvedBy, `Abate do crédito ${input.creditId}`,
                { creditId: input.creditId, reason, requestedBy: input.requestedBy, provisionUsedMinor: provisionUsed, lossMinor: loss })
        ]);
        return entry as AccountingEntry;
    }
}




