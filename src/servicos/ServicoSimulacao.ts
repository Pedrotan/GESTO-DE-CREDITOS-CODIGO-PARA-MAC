import { Simulation } from '@/tipos/credito';
import { RepositorioSimulacao } from '@/repositorios/RepositorioSimulacao';

export class ServicoSimulacao {
    static async getAll(): Promise<Simulation[]> {
        const rows = await RepositorioSimulacao.findAll();
        return rows.map(row => this.mapRowToSimulation(row));
    }

    private static mapRowToSimulation(row: any): Simulation {
        return {
            ...row,
            date: new Date(row.date),
            createdAt: new Date(row.createdAt),
            aiAnalysis: row.aiAnalysis ? JSON.parse(row.aiAnalysis) : undefined
        };
    }

    static async add(sim: Simulation): Promise<void> {
        await RepositorioSimulacao.insert(sim);
    }

    static async delete(id: string): Promise<void> {
        await RepositorioSimulacao.delete(id);
    }
}
