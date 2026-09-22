import { db } from '@/bibliotecas/bd';
import { Supplier } from '@/tipos/credito';

export class ServicoFornecedor {
    static async findAll(usuarioId?: string | null): Promise<Supplier[]> {
        let sql = "SELECT * FROM suppliers WHERE deletedAt IS NULL";
        const params: any[] = [];
        if (usuarioId) {
            sql += " AND (usuario_id = ? OR usuario_id IS NULL)";
            params.push(usuarioId);
        }
        sql += " ORDER BY name ASC";
        const rows = await db.query<any>(sql, params);
        return rows.map(ServicoFornecedor.mapRow);
    }

    static async findById(id: string): Promise<Supplier | null> {
        const row = await db.get<any>("SELECT * FROM suppliers WHERE id = ?", [id]);
        return row ? ServicoFornecedor.mapRow(row) : null;
    }

    static async create(supplier: Omit<Supplier, 'createdAt'>): Promise<void> {
        await db.run(
            `INSERT INTO suppliers (id, name, phone, email, nif, address, notes, status, createdAt, usuario_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)`,
            [
                supplier.id,
                supplier.name,
                supplier.phone || null,
                supplier.email || null,
                supplier.nif || null,
                supplier.address || null,
                supplier.notes || null,
                supplier.status || 'active',
                supplier.usuario_id || null
            ]
        );
    }

    static async update(id: string, updates: Partial<Supplier>): Promise<void> {
        const fields: string[] = [];
        const params: any[] = [];

        if (updates.name !== undefined) { fields.push("name = ?"); params.push(updates.name); }
        if (updates.phone !== undefined) { fields.push("phone = ?"); params.push(updates.phone); }
        if (updates.email !== undefined) { fields.push("email = ?"); params.push(updates.email); }
        if (updates.nif !== undefined) { fields.push("nif = ?"); params.push(updates.nif); }
        if (updates.address !== undefined) { fields.push("address = ?"); params.push(updates.address); }
        if (updates.notes !== undefined) { fields.push("notes = ?"); params.push(updates.notes); }
        if (updates.status !== undefined) { fields.push("status = ?"); params.push(updates.status); }

        if (fields.length === 0) return;
        params.push(id);
        await db.run(`UPDATE suppliers SET ${fields.join(', ')} WHERE id = ?`, params);
    }

    static async softDelete(id: string, deletedBy?: string): Promise<void> {
        await db.run(
            "UPDATE suppliers SET deletedAt = datetime('now'), deletedBy = ? WHERE id = ?",
            [deletedBy || null, id]
        );
    }

    private static mapRow(row: any): Supplier {
        return {
            id: row.id,
            name: row.name,
            phone: row.phone || undefined,
            email: row.email || undefined,
            nif: row.nif || undefined,
            address: row.address || undefined,
            notes: row.notes || undefined,
            status: row.status || 'active',
            createdAt: new Date(row.createdAt),
            deletedAt: row.deletedAt ? new Date(row.deletedAt) : undefined,
            deletedBy: row.deletedBy || undefined,
            usuario_id: row.usuario_id || undefined
        };
    }
}
