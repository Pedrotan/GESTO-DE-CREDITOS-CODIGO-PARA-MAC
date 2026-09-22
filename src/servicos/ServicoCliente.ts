import { Client } from '@/tipos/credito';
import { RepositorioCliente } from '@/repositorios/RepositorioCliente';

export class ServicoCliente {
    private static safeStr(val: any): string {
        return JSON.stringify(val || []);
    }

    static async getAll(): Promise<Client[]> {
        const rows = await RepositorioCliente.findAll();
        return rows.map(c => this.mapRowToClient(c));
    }

    static async getDeleted(): Promise<Client[]> {
        const rows = await RepositorioCliente.findDeleted();
        return rows.map(c => this.mapRowToClient(c));
    }

    private static mapRowToClient(c: any): Client {
        return {
            ...c,
            createdAt: new Date(c.createdAt),
            deletedAt: c.deletedAt ? new Date(c.deletedAt) : undefined,
            restoredAt: c.restoredAt ? new Date(c.restoredAt) : undefined,
            documents: JSON.parse(c.documents || '[]'),
            bankCoordinates: JSON.parse(c.bankCoordinates || '[]'),
            receiveMethod: c.receiveMethod || 'transfer',
            lastContacted: c.lastContacted ? new Date(c.lastContacted) : undefined
        };
    }

    static async add(client: Client): Promise<void> {
        await RepositorioCliente.insert(client);
    }

    static async update(id: string, updates: Partial<Client>): Promise<void> {
        await RepositorioCliente.update(id, updates);
    }

    static async delete(id: string, userId: string): Promise<void> {
        const clients = await this.getAll();
        const client = clients.find(c => c.id === id);
        const originalState = client ? JSON.stringify(client) : undefined;
        await RepositorioCliente.softDelete(id, userId, originalState);
    }

    static async restore(id: string): Promise<void> {
        await RepositorioCliente.restore(id);
    }

    static async hardDelete(id: string): Promise<void> {
        await RepositorioCliente.hardDelete(id);
    }
}




