import { RepositorioBase } from './RepositorioBase';
import { Simulation } from '@/tipos/credito';

const iso = (value: Date | string | null | undefined) => value ? (typeof value === 'string' ? value : value.toISOString()) : null;

export class RepositorioSimulacao extends RepositorioBase {
    static async findAll(): Promise<any[]> {
        return await this.query('SELECT * FROM simulations ORDER BY date DESC');
    }

    static async insert(sim: Simulation): Promise<void> {
        const sql = `INSERT INTO simulations (
            id, reference, date, clientName, clientIncome, amount, term,
            interestRate, method, riskProfile, totalPayment, monthlyPayment,
            aiAnalysis, usuario_id, createdAt, status, clientId, productId, verificationCode, expiresAt, details, convertedCreditId, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

        const params = [
            sim.id, sim.reference, iso(sim.date),
            sim.clientName, sim.clientIncome || 0, sim.amount || 0, sim.term || 0,
            sim.interestRate || 0, sim.method, sim.riskProfile,
            sim.totalPayment || 0, sim.monthlyPayment || 0,
            sim.aiAnalysis || null,
            sim.usuario_id,
            iso(sim.createdAt),
            sim.status || 'simulated', sim.clientId || null, sim.productId || null, sim.verificationCode || null,
            iso(sim.expiresAt), sim.details || null, sim.convertedCreditId || null, iso(sim.updatedAt) || iso(sim.createdAt)
        ];
        await this.execute(sql, params);
    }

    static async updateStatus(id: string, status: 'simulated' | 'converted', convertedCreditId: string | null): Promise<void> {
        await this.execute('UPDATE simulations SET status = ?, convertedCreditId = ?, updatedAt = ? WHERE id = ?', [status, convertedCreditId, new Date().toISOString(), id]);
    }

    static async delete(id: string): Promise<void> {
        await this.execute('DELETE FROM simulations WHERE id = ?', [id]);
    }
}
