import { RepositorioNotificacao } from '@/repositorios/RepositorioNotificacao';
import { Notification } from '@/tipos/credito';

export class ServicoNotificacao {
    static async getAll(limit: number = 50): Promise<Notification[]> {
        const rows = await RepositorioNotificacao.findAll(limit);
        return rows.map(n => ({
            ...n,
            read: n.read === 1,
            source: n.source || 'system',
            timestamp: new Date(n.timestamp)
        }));
    }

    static async add(n: Notification): Promise<void> {
        await RepositorioNotificacao.insert(n);
    }

    static async markAsRead(id: string): Promise<void> {
        await RepositorioNotificacao.markAsRead(id);
    }

    static async markAllAsRead(): Promise<void> {
        await RepositorioNotificacao.markAllAsRead();
    }

    static async delete(id: string): Promise<void> {
        await RepositorioNotificacao.delete(id);
    }

    static async clearAll(): Promise<void> {
        await RepositorioNotificacao.clearAll();
    }
}
