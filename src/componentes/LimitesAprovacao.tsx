import { Link } from 'react-router-dom';
import { ArrowRight, ShieldCheck } from 'lucide-react';
import { Button } from '@/componentes/ui/button';

/** Os limites de aprovação passaram para Utilizadores › Limites (alçadas por perfil, cadeia e dupla aprovação). */
export function LimitesAprovacao() {
    return <section className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center">
        <ShieldCheck className="h-8 w-8 shrink-0 text-primary" />
        <div className="flex-1">
            <h3 className="font-semibold">Limites de aprovação de créditos</h3>
            <p className="text-sm text-muted-foreground">As alçadas são geridas em Utilizadores › Limites: limites por perfil e por operação, cadeia de aprovação com dupla aprovação acima do nível máximo, exceções temporárias e consumo em tempo real.</p>
        </div>
        <Button asChild variant="outline" className="gap-1.5"><Link to="/limites-utilizador">Abrir Limites <ArrowRight className="h-4 w-4" /></Link></Button>
    </section>;
}
