import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contextos/ContextoAutenticacao';
import { useToast } from '@/componentes/ui/use-toast';
import { ToastAction } from '@/componentes/ui/toast';
import { canViewSecurity, type SecurityAlert } from '@/bibliotecas/seguranca';

/**
 * Recebe os alertas de intrusão do processo principal (desktop) e mostra-os de imediato aos
 * administradores. Os alertas graves ficam também no sino de notificações e no Centro de Segurança.
 */
export function MonitorSeguranca() {
    const { user } = useAuth();
    const { toast } = useToast();
    const navigate = useNavigate();
    const allowed = canViewSecurity(user as any);

    useEffect(() => {
        const api = (window as any).electronAPI;
        if (!allowed || typeof api?.onSecurityAlert !== 'function') return;
        return api.onSecurityAlert((alert: SecurityAlert) => {
            if (!alert || alert.severity === 'low') return;
            const grave = alert.severity === 'high' || alert.severity === 'critical';
            toast({
                title: `${grave ? '🚨 ' : '⚠️ '}Alerta de segurança: ${alert.title}`,
                description: `${alert.details}${alert.ip ? ` (origem ${alert.ip})` : ''}`,
                variant: grave ? 'destructive' : 'default',
                duration: grave ? 20_000 : 8_000,
                action: <ToastAction altText="Ver no Centro de Segurança" onClick={() => navigate('/seguranca')}>Ver</ToastAction>,
            });
        });
    }, [allowed, toast, navigate]);

    return null;
}
