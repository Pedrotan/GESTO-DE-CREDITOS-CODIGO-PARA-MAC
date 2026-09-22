import { AuditLog } from '@/tipos/credito';
import { RepositorioAuditoria } from '@/repositorios/RepositorioAuditoria';

export class ServicoAuditoria {
    static async addLog(
        action: AuditLog['action'],
        entity: AuditLog['entity'],
        details: string,
        userId: string,
        userName: string,
        previousState?: any,
        newState?: any,
        metadata?: any
    ): Promise<AuditLog> {
        const newLog: AuditLog = {
            id: crypto.randomUUID(),
            action,
            entity,
            details,
            userId: userId || 'system',
            userName: userName || 'Sistema',
            timestamp: new Date(),
            previousState: previousState ? JSON.stringify(previousState) : undefined,
            newState: newState ? JSON.stringify(newState) : undefined,
            metadata: metadata ? JSON.stringify(metadata) : undefined
        };

        await RepositorioAuditoria.insert(newLog);

        return newLog;
    }

    static async getLogs(limit: number = 400): Promise<AuditLog[]> {
        const rows = await RepositorioAuditoria.findLatest(limit);
        if (!rows) return [];
        return rows.map(l => ({ ...l, timestamp: new Date(l.timestamp) }));
    }

    static async getPagedLogs(limit: number = 50, lastTimestamp?: string, lastId?: string): Promise<AuditLog[]> {
        const rows = await RepositorioAuditoria.findPaged(limit, lastTimestamp, lastId);
        if (!rows) return [];
        return rows.map(l => ({ ...l, timestamp: new Date(l.timestamp) }));
    }

    static async deleteLog(id: string): Promise<void> {
        await RepositorioAuditoria.deleteById(id);
    }

    static async clearUserLogs(userId: string): Promise<void> {
        await RepositorioAuditoria.deleteByUserId(userId);
    }

    static async clearAllLogs(): Promise<void> {
        await RepositorioAuditoria.clearAll();
    }
}




