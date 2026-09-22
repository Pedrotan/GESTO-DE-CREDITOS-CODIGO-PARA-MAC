import { RepositorioTarefaCalendario } from '@/repositorios/RepositorioTarefaCalendario';
import { CalendarTask } from '@/tipos/credito';

export class ServicoTarefaCalendario {
    static async getAll(): Promise<CalendarTask[]> {
        const rows = await RepositorioTarefaCalendario.findAll();
        return rows.map(r => ({
            ...r,
            done: r.done === 1,
            createdAt: new Date(r.createdAt)
        }));
    }

    static async create(t: CalendarTask): Promise<void> {
        await RepositorioTarefaCalendario.insert(t);
    }

    static async update(id: string, updates: Partial<CalendarTask>): Promise<void> {
        await RepositorioTarefaCalendario.update(id, updates);
    }

    static async delete(id: string): Promise<void> {
        await RepositorioTarefaCalendario.delete(id);
    }
}
