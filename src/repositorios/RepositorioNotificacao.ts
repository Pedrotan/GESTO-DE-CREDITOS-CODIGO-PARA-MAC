import { RepositorioBase } from './RepositorioBase';
import { Notification } from '@/tipos/credito';

export class RepositorioNotificacao extends RepositorioBase {
    static async findAll(limit: number = 50): Promise<any[]> {
        return await this.query('SELECT * FROM notifications ORDER BY timestamp DESC LIMIT ?', [limit]);
    }

    static async insert(n: Notification): Promise<void> {
        const sql = `INSERT INTO notifications (id, userId, title, message, type, source, read, timestamp) VALUES (?,?,?,?,?,?,?,?)`;
        const params = [
            n.id, n.userId || 'system', n.title, n.message, n.type, n.source || 'system',
            n.read ? 1 : 0, n.timestamp.toISOString()
        ];
        await this.execute(sql, params);
    }

    static async markAsRead(id: string): Promise<void> {
        await this.execute('UPDATE notifications SET read = 1 WHERE id = ?', [id]);
    }

    static async markAllAsRead(): Promise<void> {
        await this.execute('UPDATE notifications SET read = 1 WHERE read = 0');
    }

    static async delete(id: string): Promise<void> {
        await this.execute('DELETE FROM notifications WHERE id = ?', [id]);
    }

    static async clearAll(): Promise<void> {
        await this.execute('DELETE FROM notifications');
    }
}




