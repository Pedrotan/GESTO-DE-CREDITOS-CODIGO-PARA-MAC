import { db } from '@/bibliotecas/bd';
import { InterestTier, normalizeInterestTiers, validateInterestTiers } from '@/bibliotecas/taxas-juro';

// A tabela de taxas vive em `shared_settings`, que é sincronizada pela nuvem: o que for guardado num
// computador ou navegador chega aos restantes dispositivos da mesma empresa.
const INTEREST_TIERS_KEY = 'interest_tiers';

// Upsert com "última alteração ganha": uma operação remota mais antiga não substitui uma mais recente.
const UPSERT_SHARED_SETTING = `
    INSERT INTO shared_settings (key, value, updatedAt, updatedBy) VALUES (?, ?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updatedAt = excluded.updatedAt, updatedBy = excluded.updatedBy
    WHERE excluded.updatedAt >= shared_settings.updatedAt
`;

export class ServicoTaxasJuro {
    static async load(): Promise<InterestTier[]> {
        const row = await db.get<{ value: string }>('SELECT value FROM shared_settings WHERE key = ?', [INTEREST_TIERS_KEY]);
        return normalizeInterestTiers(row?.value);
    }

    static async save(tiers: InterestTier[], updatedBy?: string): Promise<InterestTier[]> {
        const error = validateInterestTiers(tiers);
        if (error) throw new Error(error);
        const sorted = [...tiers].sort((a, b) => a.minMonths - b.minMonths);
        await db.run(UPSERT_SHARED_SETTING, [INTEREST_TIERS_KEY, JSON.stringify(sorted), new Date().toISOString(), updatedBy ?? null]);
        return sorted;
    }
}
