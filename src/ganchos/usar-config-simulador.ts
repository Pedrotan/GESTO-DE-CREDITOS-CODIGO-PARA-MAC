import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_SIMULATOR_CONFIG, type SimulatorConfig } from '@/bibliotecas/config-simulador';
import { SIMULATOR_CONFIG_EVENT, ServicoConfigSimulador } from '@/servicos/ServicoConfigSimulador';

/** Configuração do simulador (Definições › Simulador e Produtos), actualizada quando é guardada. */
export function useConfigSimulador() {
    const [config, setConfig] = useState<SimulatorConfig>(DEFAULT_SIMULATOR_CONFIG);
    const [loading, setLoading] = useState(true);

    const reload = useCallback(async () => {
        setLoading(true);
        try { setConfig(await ServicoConfigSimulador.load()); }
        finally { setLoading(false); }
    }, []);

    useEffect(() => {
        void reload();
        const onChange = (event: Event) => {
            const detail = (event as CustomEvent<SimulatorConfig>).detail;
            if (detail) setConfig(detail);
        };
        window.addEventListener(SIMULATOR_CONFIG_EVENT, onChange);
        return () => window.removeEventListener(SIMULATOR_CONFIG_EVENT, onChange);
    }, [reload]);

    return { config, loading, reload };
}
