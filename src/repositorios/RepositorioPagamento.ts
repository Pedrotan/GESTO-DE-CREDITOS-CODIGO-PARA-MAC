import { RepositorioBase } from './RepositorioBase';
import { Payment } from '@/tipos/credito';
import { toMinorUnits } from '@/bibliotecas/ledger-financeiro';

export class RepositorioPagamento extends RepositorioBase {
    static async findAll(): Promise<any[]> {
        return await this.query('SELECT * FROM payments WHERE deletedAt IS NULL');
    }

    static async findDeleted(): Promise<any[]> {
        return await this.query('SELECT * FROM payments WHERE deletedAt IS NOT NULL');
    }

    static async insert(payment: Payment): Promise<void> {
        const sql = `INSERT INTO payments (id, creditId, clientName, amount, amountMinor, paymentDate, method, reference,
            allocatedToPrincipal, allocatedToPrincipalMinor, allocatedToInterest, allocatedToInterestMinor,
            allocatedToLateInterest, allocatedToLateInterestMinor, idempotencyKey, processedBy, status, usuario_id)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`;
        const params = [
            payment.id, payment.creditId, payment.clientName, payment.amount, toMinorUnits(payment.amount),
            (payment.paymentDate && !isNaN(payment.paymentDate.getTime())) ? payment.paymentDate.toISOString() : new Date().toISOString(),
            payment.method, payment.reference,
            payment.allocatedToPrincipal, toMinorUnits(payment.allocatedToPrincipal),
            payment.allocatedToInterest, toMinorUnits(payment.allocatedToInterest),
            payment.allocatedToLateInterest, toMinorUnits(payment.allocatedToLateInterest),
            payment.idempotencyKey || payment.id,
            payment.processedBy, payment.status,
            payment.usuario_id
        ];
        await this.execute(sql, params);
    }

    static async softDelete(id: string, userId: string, originalState?: string): Promise<void> {
        await this.execute('UPDATE payments SET deletedAt = ?, deletedBy = ?, originalState = ? WHERE id = ?', [new Date().toISOString(), userId, originalState, id]);
    }

    static async restore(id: string): Promise<void> {
        await this.execute('UPDATE payments SET deletedAt = NULL, restoredAt = ? WHERE id = ?', [new Date().toISOString(), id]);
    }

    static async hardDelete(id: string): Promise<void> {
        await this.execute('DELETE FROM payments WHERE id = ?', [id]);
    }
}




