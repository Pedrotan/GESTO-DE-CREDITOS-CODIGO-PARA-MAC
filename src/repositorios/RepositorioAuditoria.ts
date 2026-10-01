import { RepositorioBase } from './RepositorioBase';
import { AuditLog } from '@/tipos/credito';

export class RepositorioAuditoria extends RepositorioBase {
    private static schemaEnsured = false;

    static async insert(log: AuditLog): Promise<void> {
        // Ensure schema exists (lightweight check using try-catch inside ensureSchema or just run migration once at startup, 
        // but here we might want to be safe. For performance, we assume schema is migrated at app start, 
        // but we'll add the columns to the INSERT statement.)

        if (!this.schemaEnsured) {
            await this.ensureSchema();
            this.schemaEnsured = true;
        }

        const sql = `INSERT INTO audit_logs (id, timestamp, userId, userName, action, entity, details, previousState, newState, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
        const params = [
            log.id,
            (log.timestamp && !isNaN(log.timestamp.getTime())) ? log.timestamp.toISOString() : new Date().toISOString(),
            log.userId,
            log.userName,
            log.action,
            log.entity,
            log.details,
            log.previousState || null,
            log.newState || null,
            log.metadata || null
        ];
        await this.execute(sql, params);
    }

    static async ensureSchema(): Promise<void> {
        if (this.schemaEnsured) return;
        try {
            if (typeof window !== 'undefined' && (window as any).electronAPI?.userAuthStatus) {
                const status = await (window as any).electronAPI.userAuthStatus();
                if (!status?.authenticated) return;
            }
            // Check which columns exist
            const tableInfo = await this.query<{ name: string }>('PRAGMA table_info(audit_logs)');
            const existingColumns = new Set(tableInfo.map(col => col.name));

            // Only add columns if they don't exist
            if (!existingColumns.has('previousState')) {
                await this.execute("ALTER TABLE audit_logs ADD COLUMN previousState TEXT");
                console.log('✅ [RepositorioAuditoria] Coluna previousState adicionada');
            }

            if (!existingColumns.has('newState')) {
                await this.execute("ALTER TABLE audit_logs ADD COLUMN newState TEXT");
                console.log('✅ [RepositorioAuditoria] Coluna newState adicionada');
            }

            if (!existingColumns.has('metadata')) {
                await this.execute("ALTER TABLE audit_logs ADD COLUMN metadata TEXT");
                console.log('✅ [RepositorioAuditoria] Coluna metadata adicionada');
            }
            this.schemaEnsured = true;
        } catch (e) {
            console.warn('[RepositorioAuditoria] Erro ao verificar/adicionar colunas:', e);
        }
    }

    static async findLatest(limit: number): Promise<any[]> {
        return await this.query('SELECT * FROM audit_logs ORDER BY timestamp DESC, id DESC LIMIT ?', [limit]);
    }

    static async findPaged(limit: number, lastTimestamp?: string, lastId?: string): Promise<any[]> {
        if (!lastTimestamp || !lastId) {
            return await this.findLatest(limit);
        }

        const sql = `
            SELECT * FROM audit_logs 
            WHERE timestamp < ? OR (timestamp = ? AND id < ?)
            ORDER BY timestamp DESC, id DESC 
            LIMIT ?
        `;
        return await this.query(sql, [lastTimestamp, lastTimestamp, lastId, limit]);
    }

    static async deleteById(id: string): Promise<void> {
        await this.execute('DELETE FROM audit_logs WHERE id = ?', [id]);
    }

    static async deleteByUserId(userId: string): Promise<void> {
        await this.execute('DELETE FROM audit_logs WHERE userId = ?', [userId]);
    }

    static async clearAll(): Promise<void> {
        await this.execute('DELETE FROM audit_logs');
    }
}




