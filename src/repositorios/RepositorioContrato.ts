import { RepositorioBase } from './RepositorioBase';
import { Contract } from '@/tipos/credito';

export class RepositorioContrato extends RepositorioBase {
    static async findAll(): Promise<any[]> {
        return await this.query('SELECT * FROM contracts WHERE deletedAt IS NULL ORDER BY createdAt DESC');
    }

    static async findDeleted(): Promise<any[]> {
        return await this.query('SELECT * FROM contracts WHERE deletedAt IS NOT NULL ORDER BY createdAt DESC');
    }

    static async insert(contract: Contract): Promise<void> {
        const sql = `INSERT INTO contracts (id, clientId, clientName, title, value, startDate, endDate, status, terms, createdAt, usuario_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
        const params = [
            contract.id, contract.clientId, contract.clientName, contract.title, contract.value,
            (contract.startDate && !isNaN(contract.startDate.getTime())) ? contract.startDate.toISOString() : new Date().toISOString(),
            (contract.endDate && !isNaN(contract.endDate.getTime())) ? contract.endDate.toISOString() : null,
            contract.status,
            contract.terms,
            (contract.createdAt && !isNaN(contract.createdAt.getTime())) ? contract.createdAt.toISOString() : new Date().toISOString(),
            contract.usuario_id
        ];
        await this.execute(sql, params);
    }

    static async update(id: string, updates: Partial<Contract>): Promise<void> {
        const sql = `UPDATE contracts SET 
            clientId = COALESCE(?, clientId),
            clientName = COALESCE(?, clientName),
            title = COALESCE(?, title),
            value = COALESCE(?, value),
            startDate = COALESCE(?, startDate),
            endDate = COALESCE(?, endDate),
            status = COALESCE(?, status),
            terms = COALESCE(?, terms),
            usuario_id = COALESCE(?, usuario_id)
            WHERE id = ?`;

        const params = [
            updates.clientId ?? null,
            updates.clientName ?? null,
            updates.title ?? null,
            updates.value ?? null,
            (updates.startDate && !isNaN(new Date(updates.startDate).getTime())) ? new Date(updates.startDate).toISOString() : null,
            (updates.endDate && !isNaN(new Date(updates.endDate).getTime())) ? new Date(updates.endDate).toISOString() : null,
            updates.status ?? null,
            updates.terms ?? null,
            updates.usuario_id ?? null,
            id
        ];
        await this.execute(sql, params);
    }
    static async softDelete(id: string, userId: string, originalState?: string): Promise<void> {
        await this.execute('UPDATE contracts SET deletedAt = ?, deletedBy = ?, originalState = ? WHERE id = ?', [new Date().toISOString(), userId, originalState, id]);
    }

    static async restore(id: string): Promise<void> {
        await this.execute('UPDATE contracts SET deletedAt = NULL, restoredAt = ? WHERE id = ?', [new Date().toISOString(), id]);
    }

    static async hardDelete(id: string): Promise<void> {
        await this.execute('DELETE FROM contracts WHERE id = ?', [id]);
    }
}
