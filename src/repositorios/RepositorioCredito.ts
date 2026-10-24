import { RepositorioBase } from './RepositorioBase';
import { Credit } from '@/tipos/credito';
import { db } from '@/bibliotecas/bd';
import { toMinorUnits } from '@/bibliotecas/ledger-financeiro';

export class RepositorioCredito extends RepositorioBase {
    static async findAll(): Promise<any[]> {
        return await this.query(`
            SELECT id, clientId, clientName, principalAmount, currentBalance, interestRate, 
                   lateInterestRate, installments, paidInstallments, startDate, dueDate, 
                   status, daysOverdue, accruedInterest, lateInterest, totalDue, createdAt,
                   requestedBy, requestedAt, approvedBy, approvalNotes, creditNumber, paidAt,
                   usuario_id, targetMonthId, supplierId, supplierProfitRate,
                   principalAmountMinor, currentBalanceMinor, accruedInterestMinor,
                   lateInterestMinor, totalDueMinor, version, amortizationMethod, productId
            FROM credits 
            WHERE deletedAt IS NULL
        `);
    }

    static async findDeleted(): Promise<any[]> {
        return await this.query(`
            SELECT id, clientId, clientName, principalAmount, currentBalance, interestRate, 
                   lateInterestRate, installments, status, deletedAt, deletedBy, createdAt
            FROM credits 
            WHERE deletedAt IS NOT NULL AND COALESCE(deletedBy, '') NOT LIKE 'purged:%'
        `);
    }

    static async insert(credit: Credit): Promise<void> {
        const statement = this.buildInsertStatement(credit);
        await db.transaction([{ ...statement, expectChanges: 1 }]);
    }

    static buildInsertStatement(credit: Credit) {
        const sql = `INSERT INTO credits (id, clientId, clientName, principalAmount, principalAmountMinor, interestRate, lateInterestRate, installments, paidInstallments, currentBalance, currentBalanceMinor, accruedInterest, accruedInterestMinor, lateInterest, lateInterestMinor, totalDue, totalDueMinor, version, amortizationMethod, startDate, dueDate, status, creditNumber, createdAt, requestedBy, requestedAt, approvedBy, approvalNotes, usuario_id, targetMonthId, supplierId, supplierProfitRate, productId) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`;
        const params = [
            credit.id, credit.clientId, credit.clientName, credit.principalAmount, toMinorUnits(credit.principalAmount), credit.interestRate,
            credit.lateInterestRate, credit.installments, credit.paidInstallments, credit.currentBalance, toMinorUnits(credit.currentBalance),
            credit.accruedInterest, toMinorUnits(credit.accruedInterest), credit.lateInterest, toMinorUnits(credit.lateInterest),
            credit.totalDue, toMinorUnits(credit.totalDue), 0, credit.amortizationMethod || 'FLAT',
            (credit.startDate && !isNaN(new Date(credit.startDate).getTime())) ? new Date(credit.startDate).toISOString() : new Date().toISOString(),
            (credit.dueDate && !isNaN(new Date(credit.dueDate).getTime())) ? new Date(credit.dueDate).toISOString() : new Date().toISOString(),
            credit.status,
            credit.creditNumber || 1,
            (credit.createdAt && !isNaN(new Date(credit.createdAt).getTime())) ? new Date(credit.createdAt).toISOString() : new Date().toISOString(),
            credit.requestedBy || 'Sistema',
            (credit.requestedAt && !isNaN(new Date(credit.requestedAt).getTime())) ? new Date(credit.requestedAt).toISOString() : new Date().toISOString(),
            credit.approvedBy || null,
            credit.approvalNotes || null,
            credit.usuario_id,
            credit.targetMonthId || null,
            credit.supplierId || null,
            credit.supplierProfitRate ?? null,
            credit.productId || null
        ];
        return { sql, params };
    }

    static async update(id: string, updates: Partial<Credit>): Promise<void> {
        await db.transaction([{
            sql: `UPDATE credits SET targetMonthId = ?, version = version + 1
                  WHERE id = ? AND version = ?`,
            params: [updates.targetMonthId ?? null, id, updates.version ?? 0], expectChanges: 1
        }]);
    }

    /** Envia o crédito e o contrato dele (mesmo identificador) para a lixeira. */
    static async softDelete(id: string, userId: string, originalState?: string): Promise<void> {
        const now = new Date().toISOString();
        await db.transaction([
            { sql: 'UPDATE credits SET deletedAt = ?, deletedBy = ?, originalState = ? WHERE id = ?', params: [now, userId, originalState, id] },
            { sql: 'UPDATE contracts SET deletedAt = ?, deletedBy = ? WHERE id = ? AND deletedAt IS NULL', params: [now, userId, id] },
        ]);
    }

    static async restore(id: string): Promise<void> {
        const now = new Date().toISOString();
        await db.transaction([
            { sql: 'UPDATE credits SET deletedAt = NULL, restoredAt = ? WHERE id = ?', params: [now, id] },
            { sql: 'UPDATE contracts SET deletedAt = NULL, restoredAt = ? WHERE id = ? AND deletedAt IS NOT NULL', params: [now, id] },
        ]);
    }

    /** «Apagar definitivamente»: o crédito e o contrato saem da lixeira sem restauro (o razão fica guardado, imutável). */
    static async purge(id: string, userId: string): Promise<void> {
        const marker = `purged:${userId}`;
        await db.transaction([
            { sql: 'UPDATE credits SET deletedBy = ?, originalState = NULL WHERE id = ? AND deletedAt IS NOT NULL', params: [marker, id], expectChanges: 1 },
            { sql: 'UPDATE contracts SET deletedAt = COALESCE(deletedAt, ?), deletedBy = ?, originalState = NULL WHERE id = ?', params: [new Date().toISOString(), marker, id] },
        ]);
    }
}




