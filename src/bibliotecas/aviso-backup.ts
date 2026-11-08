// Lembrete de backup partilhado pela empresa: a data do último backup sincroniza entre computadores e web, e basta
// um utilizador fazer o backup para o aviso desaparecer em todas as contas e dispositivos.
import { luandaDateKey } from './fuso-angola.ts';

export const BACKUP_REMINDER_TITLE = 'Lembrete de Backup';

/**
 * Identificador fixo por período: dois dispositivos atrasados criam o mesmo aviso, em vez de um aviso cada um.
 * A referência é a data do último backup (ou a da instalação, se ainda não houve nenhum).
 */
export const backupReminderId = (referenceDate: string) => `backup-reminder:${luandaDateKey(referenceDate)}`;

/** Avisos a remover: todos os lembretes, lidos ou não, logo que se saiba de um backup dentro do prazo. */
export function remindersToClear<T extends { id: string; title: string }>(notifications: readonly T[] | null | undefined, lastBackup: string | null | undefined, isOverdue: boolean): T[] {
    // Sem data (definições ainda a carregar ou nunca houve backup) não se apaga nada.
    if (!lastBackup || isOverdue) return [];
    return (notifications || []).filter(item => item.title === BACKUP_REMINDER_TITLE);
}

/** Já há um backup de hoje, feito neste ou noutro dispositivo: o pedido do backup diário deixa de fazer falta. */
export function backupDoneToday(lastBackup: string | null | undefined, now: Date = new Date()): boolean {
    if (!lastBackup || Number.isNaN(Date.parse(lastBackup))) return false;
    return luandaDateKey(lastBackup) === luandaDateKey(now);
}
