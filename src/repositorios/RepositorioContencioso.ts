import { db } from '@/bibliotecas/bd';
import { LegalCase } from '@/tipos/contencioso';
import { RepositorioBase } from './RepositorioBase';

export class RepositorioContencioso extends RepositorioBase<LegalCase> {
    constructor() {
        super('legal_cases');
    }

    async findAll(): Promise<LegalCase[]> {
        const rows = await db.all<any>('SELECT * FROM legal_cases WHERE deletedAt IS NULL ORDER BY createdAt DESC');
        return rows.map(row => ({
            ...row,
            debtAmount: this.parseDebtAmount(row)
        }));
    }

    async findDeleted(): Promise<LegalCase[]> {
        const rows = await db.all<any>('SELECT * FROM legal_cases WHERE deletedAt IS NOT NULL ORDER BY createdAt DESC');
        return rows.map(row => ({
            ...row,
            debtAmount: this.parseDebtAmount(row)
        }));
    }

    async findById(id: string): Promise<LegalCase | undefined> {
        const row = await db.get<any>('SELECT * FROM legal_cases WHERE id = ?', [id]);
        if (!row) return undefined;
        return {
            ...row,
            debtAmount: this.parseDebtAmount(row)
        };
    }

    async findByClientId(clientId: string): Promise<LegalCase[]> {
        const rows = await db.all<any>('SELECT * FROM legal_cases WHERE clientId = ?', [clientId]);
        return rows.map(row => ({
            ...row,
            debtAmount: this.parseDebtAmount(row)
        }));
    }

    async findByCreditId(creditId: string): Promise<LegalCase[]> {
        const rows = await db.all<any>('SELECT * FROM legal_cases WHERE creditId = ?', [creditId]);
        return rows.map(row => ({
            ...row,
            debtAmount: this.parseDebtAmount(row)
        }));
    }

    async insert(legalCase: LegalCase): Promise<void> {
        await db.run(
            `INSERT INTO legal_cases (id, clientId, creditId, stage, priority, debtAmount, lastAction, notes, createdAt, updatedAt, usuario_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                legalCase.id,
                legalCase.clientId,
                legalCase.creditId,
                legalCase.stage,
                legalCase.priority,
                legalCase.debtAmount,
                legalCase.lastAction || null,
                legalCase.notes || null,
                legalCase.createdAt,
                legalCase.updatedAt || null,
                legalCase.usuario_id
            ]
        );
    }

    async update(id: string, updates: Partial<LegalCase>): Promise<void> {
        const fields: string[] = [];
        const values: any[] = [];

        if (updates.stage !== undefined) {
            fields.push('stage = ?');
            values.push(updates.stage);
        }
        if (updates.priority !== undefined) {
            fields.push('priority = ?');
            values.push(updates.priority);
        }
        if (updates.debtAmount !== undefined) {
            fields.push('debtAmount = ?');
            values.push(updates.debtAmount);
        }
        if (updates.lastAction !== undefined) {
            fields.push('lastAction = ?');
            values.push(updates.lastAction);
        }
        if (updates.notes !== undefined) {
            fields.push('notes = ?');
            values.push(updates.notes);
        }
        if (updates.closedAt !== undefined) {
            fields.push('closedAt = ?');
            values.push(updates.closedAt);
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
                `UPDATE legal_cases SET ${fields.join(', ')} WHERE id = ?`,
                values
            );
        }
    }

    async softDelete(id: string, userId: string, originalState?: string): Promise<void> {
        await db.run('UPDATE legal_cases SET deletedAt = ?, deletedBy = ?, originalState = ? WHERE id = ?', [new Date().toISOString(), userId, originalState, id]);
    }

    async restore(id: string): Promise<void> {
        await db.run('UPDATE legal_cases SET deletedAt = NULL, restoredAt = ? WHERE id = ?', [new Date().toISOString(), id]);
    }

    async hardDelete(id: string): Promise<void> {
        await db.run('DELETE FROM legal_cases WHERE id = ?', [id]);
    }

    async getStatistics(): Promise<{
        critical: number;
        interpellated: number;
        mediation: number;
        court: number;
        totalDebt: number;
    }> {
        const critical = await db.get<{ count: number }>('SELECT COUNT(*) as count FROM legal_cases WHERE priority = ?', ['critical']);
        const interpellated = await db.get<{ count: number }>('SELECT COUNT(*) as count FROM legal_cases WHERE stage = ?', ['interpellated']);
        const mediation = await db.get<{ count: number }>('SELECT COUNT(*) as count FROM legal_cases WHERE stage = ?', ['mediation']);
        const court = await db.get<{ count: number }>('SELECT COUNT(*) as count FROM legal_cases WHERE stage = ?', ['court']);
        const totalDebtRow = await db.get<{ total: number }>('SELECT SUM(debtAmount) as total FROM legal_cases WHERE stage != ?', ['closed']);

        return {
            critical: critical?.count || 0,
            interpellated: interpellated?.count || 0,
            mediation: mediation?.count || 0,
            court: court?.count || 0,
            totalDebt: totalDebtRow?.total || 0
        };
    }

    private parseDebtAmount(row: any): number {
        // Handle both credit.amount and explicit debtAmount
        if (row.debtAmount !== undefined && row.debtAmount !== null) {
            return typeof row.debtAmount === 'string' ? parseFloat(row.debtAmount) : row.debtAmount;
        }
        return 0;
    }
}
