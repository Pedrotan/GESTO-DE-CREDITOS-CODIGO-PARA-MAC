import { RepositorioMensagem } from '@/repositorios/RepositorioMensagem';
import { ChatMessage } from '@/tipos/credito';

export class ServicoMensagem {
    static async getAll(): Promise<ChatMessage[]> {
        const rows = await RepositorioMensagem.findAll();
        return rows.map(m => ({
            ...m,
            read: m.read === 1,
            timestamp: new Date(m.timestamp)
        }));
    }

    static async send(m: ChatMessage): Promise<void> {
        await RepositorioMensagem.insert(m);
    }

    static async markAsRead(id: string): Promise<void> {
        await RepositorioMensagem.markAsRead(id);
    }

    static async delete(id: string): Promise<void> {
        await RepositorioMensagem.delete(id);
    }

    static async clearChat(user1Id: string, user2Id: string): Promise<void> {
        await RepositorioMensagem.clearChat(user1Id, user2Id);
    }
}




