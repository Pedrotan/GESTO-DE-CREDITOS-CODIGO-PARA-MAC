import { RepositorioContrato } from '@/repositorios/RepositorioContrato';
import { Contract } from '@/tipos/credito';

export class ServicoContrato {
    static async getAll(): Promise<Contract[]> {
        const rows = await RepositorioContrato.findAll();
        return rows.map(c => ({
            ...c,
            startDate: new Date(c.startDate),
            endDate: c.endDate ? new Date(c.endDate) : null,
            createdAt: new Date(c.createdAt)
        }));
    }

    static async add(contract: Contract): Promise<void> {
        await RepositorioContrato.insert(contract);
    }

    static async update(id: string, updates: Partial<Contract>): Promise<void> {
        await RepositorioContrato.update(id, updates);
    }
}




