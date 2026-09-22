import { RepositorioBase } from './RepositorioBase';
import { CalendarTask } from '@/tipos/credito';

export class RepositorioTarefaCalendario extends RepositorioBase {
    static async findAll(): Promise<any[]> {
        return await this.query('SELECT * FROM calendar_tasks ORDER BY date ASC');
    }

    static async insert(t: CalendarTask): Promise<void> {
        const sql = `INSERT INTO calendar_tasks (id, title, description, date, done, createdAt, usuario_id) VALUES (?,?,?,?,?,?,?)`;
        const params = [
            t.id, t.title, t.description || null, t.date,
            t.done ? 1 : 0, t.createdAt.toISOString(), t.usuario_id || null
        ];
        await this.execute(sql, params);
    }

    static async update(id: string, updates: Partial<CalendarTask>): Promise<void> {
        const fields = Object.keys(updates);
        if (fields.length === 0) return;
        const setClause = fields.map(f => `${f} = ?`).join(', ');
        const values = fields.map(f => {
            const value = (updates as any)[f];
            if (f === 'done') return value ? 1 : 0;
            if (value instanceof Date) return value.toISOString();
            return value;
        });
        await this.execute(`UPDATE calendar_tasks SET ${setClause} WHERE id = ?`, [...values, id]);
    }

    static async delete(id: string): Promise<void> {
        await this.execute('DELETE FROM calendar_tasks WHERE id = ?', [id]);
    }
}
