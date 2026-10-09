import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { RefreshCcw } from 'lucide-react';
import { formatCurrency } from '@/bibliotecas/formatters';
import { Button } from '@/componentes/ui/button';
import { ServicoCarteira, type Restructuring } from '@/servicos/ServicoCarteira';
import { DecisaoReestruturacao, type Actor } from './OperacoesCredito';

/** Reestruturações pedidas na ficha do crédito que aguardam a decisão de outra pessoa (página de Aprovações). */
export function ReestruturacoesPendentes({ actor, clientNameOf }: { actor: Actor | null; clientNameOf: (creditId: string) => string }) {
    const navigate = useNavigate();
    const [items, setItems] = useState<Restructuring[]>([]);
    const [decision, setDecision] = useState<{ id: string; approve: boolean } | null>(null);
    const load = useCallback(() => { void ServicoCarteira.restructurings().then(list => setItems(list.filter(item => item.status === 'pending' && item.kind === 'restructure'))).catch(() => setItems([])); }, []);
    useEffect(load, [load]);
    if (!items.length) return null;
    const canDecide = ['admin', 'super_admin', 'credit_director'].includes(String(actor?.role));
    return (
        <div className="rounded-2xl border border-blue-300 bg-blue-50/60 p-4 dark:border-blue-900 dark:bg-blue-950/30">
            <p className="mb-2 flex items-center gap-2 text-sm font-bold"><RefreshCcw className="h-4 w-4" /> Reestruturações por aprovar ({items.length})</p>
            <div className="space-y-2">
                {items.map(item => (
                    <div key={item.id} className="flex flex-col gap-2 rounded-xl border bg-background p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                            <p className="font-semibold">{clientNameOf(item.creditId)} · {item.newPlan.length} prestações · {formatCurrency(item.newPlan.reduce((sum, entry) => sum + entry.totalMinor, 0) / 100)}</p>
                            <p className="text-xs text-muted-foreground">Pedida por {item.requestedByName} a {new Date(item.requestedAt).toLocaleDateString('pt-AO')} · {item.reason}</p>
                        </div>
                        <div className="flex shrink-0 gap-2">
                            <Button size="sm" variant="outline" onClick={() => navigate(`/creditos/${encodeURIComponent(item.creditId)}`)}>Abrir ficha</Button>
                            {canDecide && item.requestedBy !== actor?.id && <>
                                <Button size="sm" variant="outline" onClick={() => setDecision({ id: item.id, approve: false })}>Rejeitar</Button>
                                <Button size="sm" onClick={() => setDecision({ id: item.id, approve: true })}>Aprovar</Button>
                            </>}
                        </div>
                    </div>
                ))}
            </div>
            <DecisaoReestruturacao open={!!decision} requestId={decision?.id || null} approve={!!decision?.approve} actor={actor} onClose={() => setDecision(null)} onDecided={load} />
        </div>
    );
}
