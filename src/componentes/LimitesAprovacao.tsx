import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle2, ShieldCheck } from 'lucide-react';
import { Button } from '@/componentes/ui/button';
import { ServicoLimitesAprovacao } from '@/servicos/ServicoLimitesAprovacao';
import type { ApprovalLimits } from '@/bibliotecas/limites-aprovacao';

const formatKz = (minor: number) => {
    return new Intl.NumberFormat('pt-AO', {
        style: 'currency',
        currency: 'AOA',
        maximumFractionDigits: 0,
    }).format(minor / 100).replace('AOA', 'Kz');
};

/**
 * Exibe os limites de aprovação de crédito em vigor (integrados com o sistema de Alçadas)
 * e fornece acesso à gestão centralizada de limites, escalonamento e dupla aprovação.
 */
export function LimitesAprovacao() {
    const [limits, setLimits] = useState<ApprovalLimits | null>(null);

    useEffect(() => {
        ServicoLimitesAprovacao.load()
            .then(setLimits)
            .catch(() => setLimits(null));
    }, []);

    return (
        <section className="flex flex-col gap-4 rounded-lg border p-4 bg-card text-card-foreground shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <ShieldCheck className="h-8 w-8 shrink-0 text-primary" />
                <div className="flex-1">
                    <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-base">Limites de aprovação de créditos</h3>
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400">
                            <CheckCircle2 className="h-3 w-3" /> Política Ativa
                        </span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-0.5">
                        Integrado com o motor de Alçadas: alçadas por perfil e operação, limites por grupo económico, cadeia de escalonamento e dupla aprovação.
                    </p>
                </div>
                <Button asChild variant="outline" className="gap-1.5 shrink-0">
                    <Link to="/limites-utilizador">
                        Gerir Alçadas <ArrowRight className="h-4 w-4" />
                    </Link>
                </Button>
            </div>

            {limits && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t text-sm">
                    <div className="rounded-md border p-2.5 bg-muted/30">
                        <span className="text-xs text-muted-foreground block font-medium">Gestor de Crédito</span>
                        <span className="font-semibold text-foreground text-sm">{formatKz(limits.managerMinor)}</span>
                    </div>
                    <div className="rounded-md border p-2.5 bg-muted/30">
                        <span className="text-xs text-muted-foreground block font-medium">Administrador</span>
                        <span className="font-semibold text-foreground text-sm">{formatKz(limits.adminMinor)}</span>
                    </div>
                    <div className="rounded-md border p-2.5 bg-muted/30">
                        <span className="text-xs text-muted-foreground block font-medium">Diretor / Super Admin</span>
                        <span className="font-semibold text-foreground text-sm">{formatKz(limits.superAdminMinor)}</span>
                    </div>
                </div>
            )}
        </section>
    );
}

