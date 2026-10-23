import { useMemo } from 'react';
import { useData } from '@/contextos/ContextoDados';
import { useAuth } from '@/contextos/ContextoAutenticacao';
import { useLicenseInfo } from '@/ganchos/usar-estado-rede';
import { licenseAllowsFeature } from '@/bibliotecas/licenciamento';
import { ServicoControloAcesso } from '@/servicos/ServicoControloAcesso';
import type { ActorRH } from '@/servicos/rh/ServicoRH';

/**
 * O módulo de Recursos Humanos é activado pela licença (funcionalidade «rh» do plano no Tango Master Gen),
 * como a intranet e o Multi-Empresas. Em desenvolvimento fica sempre disponível, para poder ser testado
 * sem uma licença emitida.
 */
export function useModuloRH(): { activo: boolean; aCarregar: boolean } {
    const { companySettings } = useData();
    const licenca = useLicenseInfo(companySettings?.licenseKey);
    if (import.meta.env.DEV) return { activo: true, aCarregar: false };
    return { activo: licenseAllowsFeature(licenca, 'rh'), aCarregar: licenca === null };
}

/** Utilizador actual como actor das operações de RH e as permissões do módulo. */
export function useActorRH() {
    const { user } = useAuth();
    return useMemo(() => {
        const pode = (permissao: string) => ServicoControloAcesso.temPermissao(user, permissao);
        const actor: ActorRH | null = user ? { id: user.id, name: user.name, role: user.role, permissions: user.permissions } : null;
        return {
            actor,
            pode,
            ver: pode('hr_view') || pode('hr_manage'),
            gerir: pode('hr_manage'),
            salarios: pode('hr_view_salaries'),
            confidencial: pode('hr_confidential'),
            calcular: pode('hr_payroll'),
            aprovar: pode('hr_payroll_approve'),
            configurar: pode('hr_settings'),
        };
    }, [user]);
}
