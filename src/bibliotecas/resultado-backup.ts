export type VerifiedBackupResult = { filePath: string; size: number };

/** A cancelled export must never advance the last successful backup date. */
export function requireCompletedBackup(result: unknown): VerifiedBackupResult {
    if (!result || typeof result !== 'object') throw new Error('O sistema não confirmou a criação do backup.');
    const value = result as Record<string, unknown>;
    if (value.canceled === true) throw new Error('A cópia de segurança foi cancelada.');
    if (value.success !== true) {
        throw new Error(typeof value.error === 'string' ? value.error : 'Falha ao criar a cópia de segurança.');
    }
    if (typeof value.filePath !== 'string' || !value.filePath.trim() ||
        typeof value.size !== 'number' || !Number.isSafeInteger(value.size) || value.size <= 0) {
        throw new Error('O backup não possui um ficheiro válido com tamanho confirmado.');
    }
    return { filePath: value.filePath, size: value.size };
}
