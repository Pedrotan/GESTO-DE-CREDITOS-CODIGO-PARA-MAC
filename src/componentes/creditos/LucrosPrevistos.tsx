import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, TrendingUp } from 'lucide-react';
import { Button } from '@/componentes/ui/button';
import { formatCurrency } from '@/bibliotecas/formatters';
import { expectedProfitSummary } from '@/bibliotecas/carteira-credito';
import type { CarteiraState } from '@/componentes/creditos/useCarteira';

const kz = (minor: number) => formatCurrency(minor / 100);
const pct = (value: number) => `${(value * 100).toLocaleString('pt-AO', { maximumFractionDigits: 1 })}%`;

/**
 * Card de lucros previstos dos créditos concedidos: capital investido face ao lucro previsto pelas taxas de juro,
 * o lucro já recebido e o que falta receber, no total e crédito a crédito.
 */
export function LucrosPrevistos({ state }: { state: CarteiraState }) {
    const summary = useMemo(() => expectedProfitSummary(state.rows, state.payments || []), [state.rows, state.payments]);
    const [open, setOpen] = useState(false);
    const [showAll, setShowAll] = useState(false);
    if (!summary.count) return null;
    const receivedShare = summary.expectedProfitMinor > 0 ? summary.receivedProfitMinor / summary.expectedProfitMinor : 0;
    const rows = showAll ? summary.rows : summary.rows.slice(0, 10);

    const figures = [
        { label: 'Capital investido', value: kz(summary.capitalMinor), note: `${summary.count} crédito(s) concedido(s)` },
        { label: 'Lucro previsto', value: kz(summary.expectedProfitMinor), note: `${pct(summary.marginRate)} sobre o capital`, tone: 'text-emerald-600' },
        { label: 'Lucro já recebido', value: kz(summary.receivedProfitMinor), note: `${pct(receivedShare)} do lucro previsto`, tone: 'text-sky-600' },
        { label: 'Lucro por receber', value: kz(summary.toReceiveProfitMinor), note: 'Juros ainda por cobrar', tone: 'text-orange-600' },
        { label: 'Total a receber dos créditos', value: kz(summary.totalExpectedMinor), note: 'Capital + lucro previsto' },
    ];

    return (
        <section className="mb-6 rounded-2xl border bg-card p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h2 className="flex items-center gap-2 text-base font-black"><TrendingUp className="h-5 w-5 text-emerald-600" /> Lucros previstos dos créditos concedidos</h2>
                    <p className="text-xs text-muted-foreground">Os ganhos da empresa são os juros: calculados automaticamente pela taxa de cada crédito sobre o capital entregue ao cliente.</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => setOpen(value => !value)}>
                    {open ? <ChevronUp className="mr-1.5 h-4 w-4" /> : <ChevronDown className="mr-1.5 h-4 w-4" />} {open ? 'Esconder' : 'Ver'} por crédito
                </Button>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                {figures.map(figure => (
                    <div key={figure.label} className="rounded-xl border bg-background p-3">
                        <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{figure.label}</p>
                        <p className={`mt-1 text-lg font-black ${figure.tone || ''}`}>{figure.value}</p>
                        <p className="text-[11px] text-muted-foreground">{figure.note}</p>
                    </div>
                ))}
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted" title={`Lucro recebido: ${pct(receivedShare)}`}>
                <div className="h-full bg-emerald-500" style={{ width: `${Math.min(100, receivedShare * 100)}%` }} />
            </div>
            {open && (
                <div className="mt-4 overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="text-left text-[11px] uppercase text-muted-foreground">
                            <tr>
                                <th className="py-2">Contrato</th><th>Cliente</th><th className="text-right">Taxa</th><th className="text-right">Capital investido</th>
                                <th className="text-right">Lucro previsto</th><th className="text-right">Recebido</th><th className="text-right">Por receber</th><th className="text-right">Total a receber</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map(row => (
                                <tr key={row.id} className="border-t">
                                    <td className="whitespace-nowrap py-2 font-mono text-xs font-bold">{row.reference}</td>
                                    <td>{row.clientName}</td>
                                    <td className="text-right">{row.rate.toLocaleString('pt-AO')}%</td>
                                    <td className="whitespace-nowrap text-right">{kz(row.capitalMinor)}</td>
                                    <td className="whitespace-nowrap text-right font-bold text-emerald-600">{kz(row.expectedProfitMinor)} <span className="text-[10px] font-normal text-muted-foreground">({pct(row.marginRate)})</span></td>
                                    <td className="whitespace-nowrap text-right text-sky-600">{kz(row.receivedProfitMinor)}</td>
                                    <td className="whitespace-nowrap text-right font-bold text-orange-600">{kz(row.toReceiveProfitMinor)}</td>
                                    <td className="whitespace-nowrap text-right">{kz(row.totalExpectedMinor)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {summary.rows.length > 10 && (
                        <Button variant="ghost" size="sm" className="mt-2" onClick={() => setShowAll(value => !value)}>
                            {showAll ? 'Mostrar só os 10 maiores' : `Mostrar todos (${summary.rows.length})`}
                        </Button>
                    )}
                </div>
            )}
        </section>
    );
}
