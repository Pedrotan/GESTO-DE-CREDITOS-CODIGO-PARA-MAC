import { RepositorioMensagem } from '@/repositorios/RepositorioMensagem';
import { ChatAttachment, ChatClientCard, ChatMessage } from '@/tipos/credito';

const json = <T>(value: unknown): T | undefined => {
    if (typeof value !== 'string' || !value) return undefined;
    try { return JSON.parse(value) as T; } catch { return undefined; }
};

export class ServicoMensagem {
    static async getAll(): Promise<ChatMessage[]> {
        const rows = await RepositorioMensagem.findAll();
        return rows.map(m => ({
            ...m,
            read: m.read === 1,
            timestamp: new Date(m.timestamp),
            attachments: json<ChatAttachment[]>(m.attachments) || [],
            clientCard: json<ChatClientCard>(m.clientCard) || null,
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




