import { useData } from '@/contextos/ContextoDados';
import { Badge } from '@/componentes/ui/badge';
import { cn } from '@/bibliotecas/utils';
import { formatCurrency } from '@/bibliotecas/formatters';

type BadgeVariant = 'default' | 'primary' | 'secondary' | 'destructive' | 'success' | 'warning' | 'info' | 'outline';

const statusConfig: Record<string, { label: string; variant: BadgeVariant }> = {
  active: { label: 'Activo', variant: 'success' },
  overdue: { label: 'Em Atraso', variant: 'warning' },
  paid: { label: 'Crédito Pago', variant: 'success' },
  renegotiated: { label: 'Renegociado', variant: 'info' },
  defaulted: { label: 'Incumprimento', variant: 'destructive' },
  pending_approval: { label: 'Pendente', variant: 'warning' },
  rejected: { label: 'Rejeitado', variant: 'destructive' },
  cancelled: { label: 'Cancelado', variant: 'outline' },
};

export function RecentCredits() {
  const { credits } = useData();
  const recentCredits = [...credits].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 5);
  return (
    <div className="card-elevated p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h3 className="font-display text-lg font-semibold text-foreground">Créditos Recentes</h3>
          <p className="text-sm text-muted-foreground">Últimas operações de crédito</p>
        </div>
        <button className="text-sm font-medium text-primary hover:underline">Ver todos</button>
      </div>
      <div className="space-y-4">
        {recentCredits.map((credit, index) => (
          <div
            key={credit.id}
            className={cn(
              'flex items-center justify-between rounded-lg border border-border bg-muted/30 p-4 transition-all duration-200 hover:bg-muted/50',
              'animate-fade-in'
            )}
            style={{ animationDelay: `${index * 100}ms` }}
          >
            <div className="flex-1">
              <div className="flex items-center gap-3">
                <span className="font-mono text-sm font-medium text-muted-foreground">{credit.id}</span>
                <Badge variant={statusConfig[credit.status]?.variant || 'default'}>
                  {credit.status === 'active' && credit.paidInstallments > 0 ? 'Em Liquidação' : (statusConfig[credit.status]?.label || credit.status)}
                </Badge>
              </div>
              <p className="mt-1 font-medium text-foreground">{credit.clientName}</p>
            </div>
            <div className="text-right">
              <p className="font-display text-lg font-semibold text-foreground">
                {formatCurrency(credit.totalDue)}
              </p>
              <p className="text-sm text-muted-foreground">
                {credit.paidInstallments}/{credit.installments} prestações
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

