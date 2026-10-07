import { normalizeSimulatorConfig, type SimulatorConfig } from '@/bibliotecas/config-simulador';
import { SHARED_SETTING_KEYS, ServicoDefinicoesPartilhadas } from '@/servicos/ServicoDefinicoesPartilhadas';

// Produtos e parâmetros do simulador vivem nas definições partilhadas pela nuvem: o que o administrador
// guardar num computador ou navegador vale para todos os dispositivos da mesma empresa.

export const SIMULATOR_CONFIG_EVENT = 'tango:simulator-config';

export class ServicoConfigSimulador {
    static async load(): Promise<SimulatorConfig> {
        const raw = await ServicoDefinicoesPartilhadas.get(SHARED_SETTING_KEYS.simulatorConfig).catch(() => null);
        if (!raw) return normalizeSimulatorConfig({});
        try { return normalizeSimulatorConfig(JSON.parse(raw)); } catch { return normalizeSimulatorConfig({}); }
    }

    static async save(config: SimulatorConfig, updatedBy?: string): Promise<SimulatorConfig> {
        const normalized = normalizeSimulatorConfig(config);
        if (!normalized.products.some(product => product.active)) throw new Error('Mantenha pelo menos um produto activo.');
        const ids = new Set<string>();
        for (const product of normalized.products) {
            if (!product.name.trim()) throw new Error('Todos os produtos precisam de um nome.');
            if (ids.has(product.id)) throw new Error(`Identificador de produto repetido: ${product.id}.`);
            ids.add(product.id);
        }
        await ServicoDefinicoesPartilhadas.set(SHARED_SETTING_KEYS.simulatorConfig, JSON.stringify(normalized), updatedBy);
        window.dispatchEvent(new CustomEvent(SIMULATOR_CONFIG_EVENT, { detail: normalized }));
        return normalized;
    }
}
