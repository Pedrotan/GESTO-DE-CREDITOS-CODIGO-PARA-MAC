import { RepositorioBase } from './RepositorioBase';

export class RepositorioDefinicoesEmpresa extends RepositorioBase {
    static async findById(id: number = 1): Promise<any | null> {
        return await this.get('SELECT * FROM company_settings WHERE id = ?', [id]);
    }

    static async update(id: number, sql: string, params: any[]): Promise<void> {
        await this.execute(sql, params);
    }

    static async executeDirect(sql: string): Promise<void> {
        await this.execute(sql, []);
    }
}




