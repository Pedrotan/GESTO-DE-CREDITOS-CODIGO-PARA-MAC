import { sqlite } from '@/bibliotecas/adaptador-sqlite';
import { getScopedLocalStorageItem, setScopedLocalStorageItem } from '@/bibliotecas/contas';
import { requireCompletedBackup } from '@/bibliotecas/resultado-backup';

export interface AutoBackupConfig {
    enabled: boolean;
    scheduleTime: string; // "startup", "08:00", "12:00", "18:00", "22:00"
    mode: 'silent' | 'interactive'; // 'silent': executa e avisa | 'interactive': exibe alerta diário para confirmar
    notifyOnSuccess: boolean;
    retentionDays: number; // 7, 15, 30
    lastAutoBackupDate?: string; // YYYY-MM-DD
    lastAutoBackupTimestamp?: string;
}

export interface AutoBackupLog {
    id: string;
    timestamp: string;
    status: 'success' | 'error';
    message: string;
    filePath?: string;
    size?: number;
    triggerType: 'scheduled' | 'manual_test' | 'startup';
}

const STORAGE_KEY_CONFIG = 'tango_auto_backup_config';
const STORAGE_KEY_LOGS = 'tango_auto_backup_logs';

const DEFAULT_CONFIG: AutoBackupConfig = {
    enabled: true,
    scheduleTime: '18:00',
    mode: 'silent',
    notifyOnSuccess: true,
    retentionDays: 15,
};

export class ServicoAutoBackup {
    static getConfig(): AutoBackupConfig {
        try {
            const raw = getScopedLocalStorageItem(STORAGE_KEY_CONFIG) || localStorage.getItem(STORAGE_KEY_CONFIG);
            if (raw) {
                return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
            }
        } catch (e) {
            console.warn('[AutoBackup] Falha ao ler configurações, usando padrão:', e);
        }
        return { ...DEFAULT_CONFIG };
    }

    static saveConfig(updates: Partial<AutoBackupConfig>): AutoBackupConfig {
        const current = this.getConfig();
        const updated = { ...current, ...updates };
        try {
            const str = JSON.stringify(updated);
            setScopedLocalStorageItem(STORAGE_KEY_CONFIG, str);
            localStorage.setItem(STORAGE_KEY_CONFIG, str);
        } catch (e) {
            console.error('[AutoBackup] Falha ao salvar configurações:', e);
        }
        return updated;
    }

    static getLogs(): AutoBackupLog[] {
        try {
            const raw = getScopedLocalStorageItem(STORAGE_KEY_LOGS) || localStorage.getItem(STORAGE_KEY_LOGS);
            if (raw) {
                return JSON.parse(raw);
            }
        } catch (e) {
            console.warn('[AutoBackup] Falha ao ler histórico de logs:', e);
        }
        return [];
    }

    static addLog(entry: Omit<AutoBackupLog, 'id'>): void {
        const logs = this.getLogs();
        const newLog: AutoBackupLog = {
            ...entry,
            id: `ab_log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
        };
        const config = this.getConfig();
        const maxLogs = Math.max(config.retentionDays * 3, 30);
        const trimmedLogs = [newLog, ...logs].slice(0, maxLogs);

        try {
            const str = JSON.stringify(trimmedLogs);
            setScopedLocalStorageItem(STORAGE_KEY_LOGS, str);
            localStorage.setItem(STORAGE_KEY_LOGS, str);
        } catch (e) {
            console.error('[AutoBackup] Falha ao salvar log:', e);
        }
    }

    static clearLogs(): void {
        try {
            setScopedLocalStorageItem(STORAGE_KEY_LOGS, JSON.stringify([]));
            localStorage.setItem(STORAGE_KEY_LOGS, JSON.stringify([]));
        } catch (e) {
            console.error('[AutoBackup] Falha ao limpar logs:', e);
        }
    }

    /**
     * Verifica se hoje já foi realizado o backup ou se está pendente.
     */
    static shouldTriggerToday(): boolean {
        const config = this.getConfig();
        if (!config.enabled) return false;

        const todayStr = new Date().toISOString().split('T')[0];
        if (config.lastAutoBackupDate === todayStr) {
            return false; // Já executou hoje
        }

        if (config.scheduleTime === 'startup') {
            return true;
        }

        // Se for horário marcado (ex: "18:00")
        const [targetHour, targetMinute] = config.scheduleTime.split(':').map(Number);
        const now = new Date();
        const currentHour = now.getHours();
        const currentMinute = now.getMinutes();

        if (currentHour > targetHour || (currentHour === targetHour && currentMinute >= (targetMinute || 0))) {
            return true;
        }

        return false;
    }

    /**
     * Executa o backup automático do sistema (Electron ou Web).
     */
    static async executeBackup(triggerType: 'scheduled' | 'manual_test' | 'startup' = 'scheduled'): Promise<{ success: boolean; message: string; filePath?: string }> {
        const nowIso = new Date().toISOString();
        const todayStr = nowIso.split('T')[0];

        try {
            let filePath: string | undefined;
            let size: number | undefined;

            // 1. Em ambiente Electron
            if ((window as any).electronAPI?.backupDatabase) {
                const res = await (window as any).electronAPI.backupDatabase();
                ({ filePath, size } = requireCompletedBackup(res));
            } else if ((window as any).electronAPI?.dbExport) {
                // Se não tiver backupDatabase direto, tenta exportar
                const exportRes = await (window as any).electronAPI.dbExport();
                ({ filePath, size } = requireCompletedBackup(exportRes));
            } else {
                // 2. Em ambiente Web / Navegador: exporta bytes reais da base local.
                const data = await sqlite.export();
                if (!data?.byteLength) throw new Error('A base de dados exportada está vazia.');
                filePath = `backup_automatico_web_${todayStr}.sqlite`;
                size = data.byteLength;
                const blob = new Blob([data as BlobPart], { type: 'application/vnd.sqlite3' });
                const href = URL.createObjectURL(blob);
                const anchor = document.createElement('a');
                anchor.href = href;
                anchor.download = filePath;
                anchor.click();
                URL.revokeObjectURL(href);
            }

            // Atualizar configuração com a data de sucesso
            this.saveConfig({
                lastAutoBackupDate: todayStr,
                lastAutoBackupTimestamp: nowIso
            });

            // Registar no histórico
            this.addLog({
                timestamp: nowIso,
                status: 'success',
                message: `Backup automático diário concluído com sucesso (${triggerType === 'manual_test' ? 'Teste Manual' : triggerType === 'startup' ? 'Abertura do Sistema' : 'Agendamento Diário'}).`,
                filePath,
                size,
                triggerType
            });

            return {
                success: true,
                message: `Cópia de segurança automática diária criada com sucesso em ${new Date().toLocaleTimeString()}.`,
                filePath
            };
        } catch (error: any) {
            const errorMsg = error?.message || 'Falha desconhecida durante o backup automático.';
            console.error('[AutoBackup] Erro ao executar backup automático:', error);

            this.addLog({
                timestamp: nowIso,
                status: 'error',
                message: `Falha no backup automático: ${errorMsg}`,
                triggerType
            });

            return {
                success: false,
                message: errorMsg
            };
        }
    }
}
