import { db } from '@/bibliotecas/bd';

// Definições da empresa que valem em todos os dispositivos (computadores e versão web). Vivem em
// `shared_settings`, que é sincronizada pela nuvem: o que for guardado num dispositivo chega aos outros.

export const SHARED_SETTING_KEYS = {
    interestTiers: 'interest_tiers',
    licenseKey: 'license_key',
} as const;

// Upsert com "última alteração ganha": uma operação remota mais antiga não substitui uma mais recente.
const UPSERT_SHARED_SETTING = `
    INSERT INTO shared_settings (key, value, updatedAt, updatedBy) VALUES (?, ?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updatedAt = excluded.updatedAt, updatedBy = excluded.updatedBy
    WHERE excluded.updatedAt >= shared_settings.updatedAt
`;

export class ServicoDefinicoesPartilhadas {
    static async get(key: string): Promise<string | null> {
        const row = await db.get<{ value: string }>('SELECT value FROM shared_settings WHERE key = ?', [key]);
        return row?.value ?? null;
    }

    static async set(key: string, value: string, updatedBy?: string | null): Promise<void> {
        await db.run(UPSERT_SHARED_SETTING, [key, value, new Date().toISOString(), updatedBy ?? null]);
    }
}
