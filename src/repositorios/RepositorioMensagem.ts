import { RepositorioBase } from './RepositorioBase';
import { ChatMessage } from '@/tipos/credito';

export class RepositorioMensagem extends RepositorioBase {
    static async findAll(): Promise<any[]> {
        return await this.query('SELECT * FROM internal_messages ORDER BY timestamp ASC');
    }

    static async insert(msg: ChatMessage): Promise<void> {
        const sql = `INSERT INTO internal_messages (id, senderId, senderName, receiverId, receiverName, content, timestamp, read) VALUES (?,?,?,?,?,?,?,?)`;
        const params = [
            msg.id, msg.senderId, msg.senderName, msg.receiverId, msg.receiverName,
            msg.content, msg.timestamp.toISOString(), msg.read ? 1 : 0
        ];
        await this.execute(sql, params);
    }

    static async markAsRead(id: string): Promise<void> {
        await this.execute('UPDATE internal_messages SET read = 1 WHERE id = ?', [id]);
    }

    static async delete(id: string): Promise<void> {
        await this.execute('DELETE FROM internal_messages WHERE id = ?', [id]);
    }

    static async clearChat(user1Id: string, user2Id: string): Promise<void> {
        await this.execute(
            'DELETE FROM internal_messages WHERE (senderId = ? AND receiverId = ?) OR (senderId = ? AND receiverId = ?)',
            [user1Id, user2Id, user2Id, user1Id]
        );
    }
}




