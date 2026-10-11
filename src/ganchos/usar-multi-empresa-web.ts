import { useEffect, useState } from 'react';
import { WEB_PROFILE_EVENT, webMultiTenantSetting } from '@/servicos/ServicoIdentidadeEmpresa';

/**
 * Modo multi-empresa definido centralmente para a empresa ligada a este navegador (true/false), ou null
 * quando ainda não é conhecido ou se está no executável — nesse caso vale a definição local da empresa.
 */
export function useWebMultiTenant(): boolean | null {
    const [value, setValue] = useState<boolean | null>(webMultiTenantSetting);
    useEffect(() => {
        const refresh = () => setValue(webMultiTenantSetting());
        window.addEventListener(WEB_PROFILE_EVENT, refresh);
        window.addEventListener('storage', refresh);
        return () => {
            window.removeEventListener(WEB_PROFILE_EVENT, refresh);
            window.removeEventListener('storage', refresh);
        };
    }, []);
    return value;
}
