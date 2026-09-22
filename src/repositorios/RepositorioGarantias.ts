import { db } from '@/bibliotecas/bd';
import { Warranty } from '@/tipos/contencioso';
import { RepositorioBase } from './RepositorioBase';

export class RepositorioGarantias extends RepositorioBase<Warranty> {
    constructor() {
        super('warranties');
    }

    async findAll(): Promise<Warranty[]> {
        const rows = await db.all<any>('SELECT * FROM warranties WHERE deletedAt IS NULL ORDER BY createdAt DESC');
        return rows.map(row => this.parseRow(row));
    }

    async findDeleted(): Promise<Warranty[]> {
        const rows = await db.all<any>('SELECT * FROM warranties WHERE deletedAt IS NOT NULL ORDER BY createdAt DESC');
        return rows.map(row => this.parseRow(row));
    }

    async findById(id: string): Promise<Warranty | undefined> {
        const row = await db.get<any>('SELECT * FROM warranties WHERE id = ?', [id]);
        if (!row) return undefined;
        return this.parseRow(row);
    }

    async findByClientId(clientId: string): Promise<Warranty[]> {
        const rows = await db.all<any>('SELECT * FROM warranties WHERE clientId = ?', [clientId]);
        return rows.map(row => this.parseRow(row));
    }

    async findByCreditId(creditId: string): Promise<Warranty[]> {
        const rows = await db.all<any>('SELECT * FROM warranties WHERE creditId = ?', [creditId]);
        return rows.map(row => this.parseRow(row));
    }

    async insert(warranty: Warranty): Promise<void> {
        await db.run(
            `INSERT INTO warranties (id, clientId, creditId, type, description, marketValue, status, location, photos, documents, notes, createdAt, updatedAt, usuario_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                warranty.id,
                warranty.clientId,
                warranty.creditId || null,
                warranty.type,
                warranty.description,
                warranty.marketValue,
                warranty.status,
                warranty.location || null,
                JSON.stringify(warranty.photos || []),
                JSON.stringify(warranty.documents || []),
                warranty.notes || null,
                warranty.createdAt,
                warranty.updatedAt || null,
                warranty.usuario_id
            ]
        );
    }

    async update(id: string, updates: Partial<Warranty>): Promise<void> {
        const fields: string[] = [];
        const values: any[] = [];

        if (updates.type !== undefined) {
            fields.push('type = ?');
            values.push(updates.type);
        }
        if (updates.description !== undefined) {
            fields.push('description = ?');
            values.push(updates.description);
        }
        if (updates.marketValue !== undefined) {
            fields.push('marketValue = ?');
            values.push(updates.marketValue);
        }
        if (updates.status !== undefined) {
            fields.push('status = ?');
            values.push(updates.status);
        }
        if (updates.location !== undefined) {
            fields.push('location = ?');
            values.push(updates.location);
        }
        if (updates.photos !== undefined) {
            fields.push('photos = ?');
            values.push(JSON.stringify(updates.photos));
        }
        if (updates.documents !== undefined) {
            fields.push('documents = ?');
            values.push(JSON.stringify(updates.documents));
        }
        if (updates.notes !== undefined) {
            fields.push('notes = ?');
            values.push(updates.notes);
        }
        if (updates.creditId !== undefined) {
            fields.push('creditId = ?');
            values.push(updates.creditId);
        }
        if (updates.usuario_id !== undefined) {
            fields.push('usuario_id = ?');
            values.push(updates.usuario_id);
        }

        fields.push('updatedAt = ?');
        values.push(new Date().toISOString());

        values.push(id);

        if (fields.length > 0) {
            await db.run(
                `UPDATE warranties SET ${fields.join(', ')} WHERE id = ?`,
                values
            );
        }
    }

    async softDelete(id: string, userId: string, originalState?: string): Promise<void> {
        await db.run('UPDATE warranties SET deletedAt = ?, deletedBy = ?, originalState = ? WHERE id = ?', [new Date().toISOString(), userId, originalState, id]);
    }

    async restore(id: string): Promise<void> {
        await db.run('UPDATE warranties SET deletedAt = NULL, restoredAt = ? WHERE id = ?', [new Date().toISOString(), id]);
    }

    async hardDelete(id: string): Promise<void> {
        await db.run('DELETE FROM warranties WHERE id = ?', [id]);
    }

    async getTotalValue(): Promise<number> {
        const result = await db.get<{ total: number }>('SELECT SUM(marketValue) as total FROM warranties WHERE status = ?', ['active']);
        return result?.total || 0;
    }

    async getStatistics(): Promise<{
        total: number;
        totalValue: number;
        byType: { type: string; count: number }[];
    }> {
        const total = await db.get<{ count: number }>('SELECT COUNT(*) as count FROM warranties WHERE status = ?', ['active']);
        const totalValue = await this.getTotalValue();
        const byType = await db.all<{ type: string; count: number }>('SELECT type, COUNT(*) as count FROM warranties WHERE status = ? GROUP BY type', ['active']);

        return {
            total: total?.count || 0,
            totalValue,
            byType: byType || []
        };
    }

    private parseRow(row: any): Warranty {
        return {
            ...row,
            marketValue: typeof row.marketValue === 'string' ? parseFloat(row.marketValue) : row.marketValue,
            photos: this.parseJSON(row.photos, []),
            documents: this.parseJSON(row.documents, [])
        };
    }

    private parseJSON(value: any, fallback: any): any {
        if (!value) return fallback;
        if (typeof value === 'string') {
            try {
                return JSON.parse(value);
            } catch {
                return fallback;
            }
        }
        return value;
    }
}
