import { InterestTier, normalizeInterestTiers, validateInterestTiers } from '@/bibliotecas/taxas-juro';
import { SHARED_SETTING_KEYS, ServicoDefinicoesPartilhadas } from '@/servicos/ServicoDefinicoesPartilhadas';

// A tabela de taxas vive nas definições partilhadas pela nuvem: o que for guardado num computador ou
// navegador chega aos restantes dispositivos da mesma empresa.

export class ServicoTaxasJuro {
    static async load(): Promise<InterestTier[]> {
        return normalizeInterestTiers(await ServicoDefinicoesPartilhadas.get(SHARED_SETTING_KEYS.interestTiers));
    }

    static async save(tiers: InterestTier[], updatedBy?: string): Promise<InterestTier[]> {
        const error = validateInterestTiers(tiers);
        if (error) throw new Error(error);
        const sorted = [...tiers].sort((a, b) => a.minMonths - b.minMonths);
        await ServicoDefinicoesPartilhadas.set(SHARED_SETTING_KEYS.interestTiers, JSON.stringify(sorted), updatedBy);
        return sorted;
    }
}
