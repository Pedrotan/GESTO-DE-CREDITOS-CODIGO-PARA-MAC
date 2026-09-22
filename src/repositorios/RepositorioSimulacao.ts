import { RepositorioBase } from './RepositorioBase';
import { Simulation } from '@/tipos/credito';

export class RepositorioSimulacao extends RepositorioBase {
    static async findAll(): Promise<any[]> {
        return await this.query('SELECT * FROM simulations ORDER BY date DESC');
    }

    static async insert(sim: Simulation): Promise<void> {
        const sql = `INSERT INTO simulations (
            id, reference, date, clientName, clientIncome, amount, term, 
            interestRate, method, riskProfile, totalPayment, monthlyPayment, 
            aiAnalysis, usuario_id, createdAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

        const params = [
            sim.id, sim.reference,
            typeof sim.date === 'string' ? sim.date : sim.date.toISOString(),
            sim.clientName, sim.clientIncome || 0, sim.amount || 0, sim.term || 0,
            sim.interestRate || 0, sim.method, sim.riskProfile,
            sim.totalPayment || 0, sim.monthlyPayment || 0,
            sim.aiAnalysis || null,
            sim.usuario_id,
            typeof sim.createdAt === 'string' ? sim.createdAt : sim.createdAt.toISOString()
        ];
        await this.execute(sql, params);
    }

    static async delete(id: string): Promise<void> {
        await this.execute('DELETE FROM simulations WHERE id = ?', [id]);
    }
}
