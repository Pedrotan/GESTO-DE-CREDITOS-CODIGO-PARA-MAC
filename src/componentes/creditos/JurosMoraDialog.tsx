import { useEffect, useMemo, useState } from 'react';
import { AlarmClock, CalendarClock, Loader2, TrendingUp } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/componentes/ui/dialog';
import { Input } from '@/componentes/ui/input';
import { cn } from '@/bibliotecas/utils';
import { formatCurrency, formatDate } from '@/bibliotecas/formatters';
import { CREDIT_DIALOG_CONTENT_CLASS, CREDIT_DIALOG_HEADER_CLASS } from '@/componentes/forms/credit-dialog-styles';
import { dayNumber, projectLateInterest, type LateInterestSummary } from '@/bibliotecas/juros-mora';
import { ServicoFinanceiro } from '@/servicos/ServicoFinanceiro';
import type { Credit } from '@/tipos/credito';

// Juros de mora de um crédito: acumulados até hoje (já cobrados e em dívida) e previstos se o atraso continuar.

const PROJECTION_DAYS = [7, 15, 30, 60, 90];
const money = (minor: number) => formatCurrency(minor / 100);

export function JurosMoraDialog({ credit, open, onOpenChange }: { credit: Credit | null; open: boolean; onOpenChange: (open: boolean) => void }) {
    const [summary, setSummary] = useState<LateInterestSummary | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [days, setDays] = useState(30);
    const [untilDate, setUntilDate] = useState('');

    useEffect(() => {
        if (!open || !credit) return;
        let cancelled = false;
        setLoading(true);
        setError('');
        ServicoFinanceiro.getLateInterestSummary(credit.id)
            .then(result => { if (!cancelled) setSummary(result); })
            .catch(reason => { if (!cancelled) setError(reason instanceof Error ? reason.message : 'Não foi possível calcular a mora.'); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [open, credit]);

    // Projecção por número de dias ou até uma data escolhida.
    const projectionDays = useMemo(() => {
        if (!untilDate || !summary) return days;
        return Math.max(0, dayNumber(untilDate) - dayNumber(summary.asOf));
    }, [days, untilDate, summary]);
    const projection = useMemo(() => (summary ? projectLateInterest(summary, projectionDays) : null), [summary, projectionDays]);
    const rate = Number(credit?.lateInterestRate || 0);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className={cn(CREDIT_DIALOG_CONTENT_CLASS, 'max-w-5xl')}>
                <DialogHeader className={CREDIT_DIALOG_HEADER_CLASS}>
                    <DialogTitle className="flex items-center gap-2 text-xl font-bold tracking-tight text-white">
                        <AlarmClock className="h-5 w-5 text-secondary" /> Juros de Mora
                    </DialogTitle>
                    <DialogDescription className="mt-1 text-sm text-white/75">
                        {credit ? `${credit.clientName} · ${credit.id}` : ''} — juro diário de {rate.toLocaleString('pt-AO')}% sobre o valor em atraso de cada prestação,
                        a partir do dia seguinte ao vencimento e até ao pagamento.
                    </DialogDescription>
                </DialogHeader>

                <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
                    {loading && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> A calcular...</div>}
                    {error && <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
                    {!rate && !loading && (
                        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                            Este crédito não tem taxa de mora definida (0%/dia): não gera juros de mora.
                        </p>
                    )}

                    {summary && projection && (
                        <>
                            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
                                {[
                                    { label: 'Valor em atraso', value: money(summary.overdueMinor), tone: summary.overdueMinor > 0 ? 'text-destructive' : '' },
                                    { label: 'Mora acumulada (até hoje)', value: money(summary.accruedMinor), tone: '' },
                                    { label: 'Mora já cobrada', value: money(summary.paidLateMinor), tone: 'text-emerald-700 dark:text-emerald-400' },
                                    { label: 'Mora em dívida', value: money(summary.owedMinor), tone: summary.owedMinor > 0 ? 'text-destructive' : '' },
                                    { label: 'Mora por cada dia a mais', value: money(summary.dailyMinor), tone: summary.dailyMinor > 0 ? 'text-amber-700 dark:text-amber-400' : '' },
                                ].map(card => (
                                    <div key={card.label} className="rounded-xl border bg-card p-3">
                                        <p className="text-[11px] font-semibold uppercase text-muted-foreground">{card.label}</p>
                                        <p className={cn('mt-1 text-lg font-black', card.tone)}>{card.value}</p>
                                    </div>
                                ))}
                            </div>

                            <div className="flex flex-col gap-3 rounded-xl border border-secondary/40 bg-secondary/10 p-4 lg:flex-row lg:items-center lg:justify-between">
                                <div className="flex items-center gap-2 text-sm font-semibold">
                                    <TrendingUp className="h-4 w-4" /> Previsão se o atraso continuar
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                    {PROJECTION_DAYS.map(option => (
                                        <button
                                            key={option} type="button"
                                            onClick={() => { setDays(option); setUntilDate(''); }}
                                            className={cn('rounded-lg border px-2.5 py-1 text-xs font-semibold',
                                                !untilDate && days === option ? 'border-primary bg-primary text-primary-foreground' : 'bg-background hover:bg-muted')}
                                        >
                                            +{option} dias
                                        </button>
                                    ))}
                                    <span className="flex items-center gap-1 text-xs text-muted-foreground"><CalendarClock className="h-3.5 w-3.5" /> até</span>
                                    <Input type="date" value={untilDate} onChange={event => setUntilDate(event.target.value)} className="h-8 w-40" />
                                </div>
                                <p className="text-sm">
                                    Em {projection.days} dias: <strong className="text-destructive">{money(projection.projectedOwedMinor)}</strong> de mora em dívida
                                    {' '}(+{money(projection.additionalMinor)}).
                                </p>
                            </div>

                            <div className="overflow-x-auto rounded-xl border">
                                <table className="w-full min-w-[860px] text-sm">
                                    <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                                        <tr>
                                            <th className="p-2 text-left">Nº</th>
                                            <th className="p-2 text-left">Vencimento</th>
                                            <th className="p-2 text-left">Mora desde</th>
                                            <th className="p-2 text-right">Dias de atraso</th>
                                            <th className="p-2 text-right">Em atraso</th>
                                            <th className="p-2 text-right">Mora / dia</th>
                                            <th className="p-2 text-right">Acumulada</th>
                                            <th className="p-2 text-right">Cobrada</th>
                                            <th className="p-2 text-right">Em dívida</th>
                                            <th className="p-2 text-right">Prevista (+{projection.days} d)</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {summary.installments.map(item => {
                                            const projected = projection.installments.find(entry => entry.id === item.id);
                                            const lateFrom = new Date(item.dueDate);
                                            lateFrom.setDate(lateFrom.getDate() + 1);
                                            return (
                                                <tr key={item.id} className={cn('border-t', item.daysLate > 0 && item.outstandingMinor > 0 && 'bg-destructive/5')}>
                                                    <td className="p-2 font-semibold">{item.number}</td>
                                                    <td className="p-2">{formatDate(item.dueDate)}</td>
                                                    <td className="p-2 text-muted-foreground">{item.daysLate > 0 ? formatDate(lateFrom) : '—'}</td>
                                                    <td className="p-2 text-right">{item.daysLate}</td>
                                                    <td className="p-2 text-right">{money(item.outstandingMinor)}</td>
                                                    <td className="p-2 text-right">{money(item.dailyMinor)}</td>
                                                    <td className="p-2 text-right">{money(item.accruedMinor)}</td>
                                                    <td className="p-2 text-right text-emerald-700 dark:text-emerald-400">{money(item.paidLateMinor)}</td>
                                                    <td className={cn('p-2 text-right font-semibold', item.owedMinor > 0 && 'text-destructive')}>{money(item.owedMinor)}</td>
                                                    <td className="p-2 text-right font-semibold">{money(projected?.projectedOwedMinor ?? item.owedMinor)}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                    <tfoot className="border-t bg-muted/40 font-bold">
                                        <tr>
                                            <td className="p-2" colSpan={4}>Total</td>
                                            <td className="p-2 text-right">{money(summary.installments.reduce((sum, item) => sum + item.outstandingMinor, 0))}</td>
                                            <td className="p-2 text-right">{money(summary.dailyMinor)}</td>
                                            <td className="p-2 text-right">{money(summary.accruedMinor)}</td>
                                            <td className="p-2 text-right">{money(summary.paidLateMinor)}</td>
                                            <td className="p-2 text-right">{money(summary.owedMinor)}</td>
                                            <td className="p-2 text-right">{money(projection.projectedOwedMinor)}</td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                            <p className="text-xs text-muted-foreground">
                                A mora é lançada no crédito no momento de cada pagamento, com o valor cobrado registado à parte no pagamento.
                                Uma prestação que vence no dia 26 começa a gerar mora no dia 27.
                            </p>
                        </>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
