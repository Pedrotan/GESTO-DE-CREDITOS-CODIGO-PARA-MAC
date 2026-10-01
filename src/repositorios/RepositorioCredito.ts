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
                   lateInterestMinor, totalDueMinor, version, amortizationMethod
            FROM credits 
            WHERE deletedAt IS NULL
        `);
    }

    static async findDeleted(): Promise<any[]> {
        return await this.query(`
            SELECT id, clientId, clientName, principalAmount, currentBalance, interestRate, 
                   lateInterestRate, installments, status, deletedAt, deletedBy, createdAt
            FROM credits 
            WHERE deletedAt IS NOT NULL
        `);
    }

    static async insert(credit: Credit): Promise<void> {
        const statement = this.buildInsertStatement(credit);
        await db.transaction([{ ...statement, expectChanges: 1 }]);
    }

    static buildInsertStatement(credit: Credit) {
        const sql = `INSERT INTO credits (id, clientId, clientName, principalAmount, principalAmountMinor, interestRate, lateInterestRate, installments, paidInstallments, currentBalance, currentBalanceMinor, accruedInterest, accruedInterestMinor, lateInterest, lateInterestMinor, totalDue, totalDueMinor, version, amortizationMethod, startDate, dueDate, status, creditNumber, createdAt, requestedBy, requestedAt, approvedBy, approvalNotes, usuario_id, targetMonthId, supplierId, supplierProfitRate) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`;
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
            credit.supplierProfitRate ?? null
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

    static async softDelete(id: string, userId: string, originalState?: string): Promise<void> {
        await this.execute('UPDATE credits SET deletedAt = ?, deletedBy = ?, originalState = ? WHERE id = ?', [new Date().toISOString(), userId, originalState, id]);
    }

    static async restore(id: string): Promise<void> {
        await this.execute('UPDATE credits SET deletedAt = NULL, restoredAt = ? WHERE id = ?', [new Date().toISOString(), id]);
    }

    static async hardDelete(id: string): Promise<void> {
        await this.execute('DELETE FROM credits WHERE id = ?', [id]);
    }
}




