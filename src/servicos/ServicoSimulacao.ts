import { Simulation } from '@/tipos/credito';
import { RepositorioSimulacao } from '@/repositorios/RepositorioSimulacao';

export class ServicoSimulacao {
    static async getAll(): Promise<Simulation[]> {
        const rows = await RepositorioSimulacao.findAll();
        return rows.map(row => this.mapRowToSimulation(row));
    }

    private static mapRowToSimulation(row: any): Simulation {
        let aiAnalysis = row.aiAnalysis;
        try { aiAnalysis = row.aiAnalysis ? JSON.parse(row.aiAnalysis) : undefined; } catch { aiAnalysis = undefined; }
        return {
            ...row,
            date: new Date(row.date),
            createdAt: new Date(row.createdAt || row.date),
            expiresAt: row.expiresAt ? new Date(row.expiresAt) : null,
            updatedAt: row.updatedAt ? new Date(row.updatedAt) : null,
            status: row.status === 'converted' ? 'converted' : 'simulated',
            aiAnalysis
        };
    }

    static async add(sim: Simulation): Promise<void> {
        await RepositorioSimulacao.insert(sim);
    }

    static async updateStatus(id: string, status: 'simulated' | 'converted', convertedCreditId: string | null = null): Promise<void> {
        await RepositorioSimulacao.updateStatus(id, status, convertedCreditId);
    }

    static async delete(id: string): Promise<void> {
        await RepositorioSimulacao.delete(id);
    }
}
