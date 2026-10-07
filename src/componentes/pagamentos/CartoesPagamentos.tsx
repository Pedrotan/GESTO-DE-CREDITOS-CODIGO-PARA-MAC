import type { ComponentType } from 'react';
import { AlarmClock, Banknote, CalendarClock, CreditCard, Gauge, Receipt, Scale, UserX } from 'lucide-react';
import { formatCurrency } from '@/bibliotecas/formatters';
import { cn } from '@/bibliotecas/utils';
import { collectionRateTone, variation, type CardFilter, type PeriodKpis } from '@/bibliotecas/pagamentos-analise';

type CardKey = CardFilter | 'expected' | 'rate' | 'missing' | 'average';

type CardDef = {
    key: CardKey;
    css: string;
    icon: ComponentType<{ className?: string }>;
    overline: string;
    title: string;
    value: string;
    footer: string;
    change: number | null;
    /** true = subir é mau (ex.: valor em falta). */
    inverse?: boolean;
    /** Variação em pontos percentuais (taxa de cobrança). */
    points?: boolean;
    hint: string;
};

function Variation({ change, inverse, points }: { change: number | null; inverse?: boolean; points?: boolean }) {
    if (change === null) return <span className="rounded-full bg-black/10 px-2 py-0.5 text-[10px] font-bold text-slate-900/70 dark:bg-white/10 dark:text-slate-300">novo</span>;
    const up = change > 0;
    const flat = change === 0;
    const good = flat ? null : inverse ? !up : up;
    return (
        <span
            className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold',
                good === null ? 'bg-black/10 text-slate-900/70 dark:bg-white/10 dark:text-slate-300'
                    : good ? 'bg-emerald-700/15 text-emerald-900 dark:bg-emerald-400/15 dark:text-emerald-300'
                        : 'bg-red-700/15 text-red-900 dark:bg-red-400/15 dark:text-red-300')}
            title="Variação face ao período anterior"
        >
            {flat ? '■' : up ? '▲' : '▼'} {Math.abs(change).toLocaleString('pt-AO', { maximumFractionDigits: 1 })}{points ? ' p.p.' : '%'}
        </span>
    );
}

export function CartoesPagamentos({ kpis, previous, periodLabel, active, onSelect, onShowMissing, loading }: {
    kpis: PeriodKpis;
    previous: PeriodKpis | null;
    periodLabel: string;
    active: CardFilter;
    onSelect: (card: CardFilter) => void;
    onShowMissing: () => void;
    loading?: boolean;
}) {
    const change = (current: number, before?: number) => previous ? variation(current, before ?? 0) : null;
    const tone = collectionRateTone(kpis.rate);
    const cards: CardDef[] = [
        { key: 'collected', css: 'card-kpi-mint', icon: Receipt, overline: `Pagamentos de ${periodLabel}`, title: 'Valor Arrecadado', value: formatCurrency(kpis.collected),
            footer: `${kpis.count} ${kpis.count === 1 ? 'pagamento confirmado' : 'pagamentos confirmados'}${kpis.pendingCount ? ` · ${kpis.pendingCount} por validar` : ''}`,
            change: change(kpis.collected, previous?.collected), hint: 'Mostrar só os pagamentos confirmados' },
        { key: 'expected', css: 'card-kpi-sky', icon: CalendarClock, overline: 'Plano de prestações', title: 'Previsto no Período', value: formatCurrency(kpis.expected),
            footer: 'Prestações que venciam no período', change: change(kpis.expected, previous?.expected), hint: 'Ver as prestações em falta do período' },
        { key: 'rate', css: 'card-kpi-flow', icon: Gauge, overline: 'Eficácia', title: 'Taxa de Cobrança', value: kpis.rate === null ? 'n.d.' : `${kpis.rate.toLocaleString('pt-AO', { maximumFractionDigits: 1 })}%`,
            footer: 'Arrecadado ÷ previsto', change: previous && kpis.rate !== null && previous.rate !== null ? Math.round((kpis.rate - previous.rate) * 10) / 10 : null, points: true,
            hint: 'Verde ≥ 95% · amarelo 80–94% · vermelho < 80%' },
        { key: 'interest', css: 'card-kpi-amber', icon: CreditCard, overline: 'Rendimento', title: 'Juros Cobrados', value: formatCurrency(kpis.interest),
            footer: 'Juros remuneratórios recebidos', change: change(kpis.interest, previous?.interest), hint: 'Mostrar só os pagamentos com juros' },
        { key: 'late', css: 'card-kpi-coral', icon: AlarmClock, overline: 'Atrasos', title: 'Juros de Mora Cobrados', value: formatCurrency(kpis.late),
            footer: 'Mora cobrada por atraso no pagamento', change: change(kpis.late, previous?.late), hint: 'Mostrar só os pagamentos com juros de mora' },
        { key: 'principal', css: 'card-kpi-purple', icon: Banknote, overline: 'Recuperação', title: 'Capital Amortizado', value: formatCurrency(kpis.principal),
            footer: 'Amortização do capital cedido', change: change(kpis.principal, previous?.principal), hint: 'Mostrar só os pagamentos com capital' },
        { key: 'missing', css: 'card-kpi-coral', icon: UserX, overline: 'Cobrança', title: 'Em Falta no Período', value: formatCurrency(kpis.missingAmount),
            footer: `${kpis.missingClients} ${kpis.missingClients === 1 ? 'cliente' : 'clientes'} · ${kpis.missing.length} prestação(ões) vencida(s)`,
            change: change(kpis.missingAmount, previous?.missingAmount), inverse: true, hint: 'Abrir a lista de prestações vencidas e não pagas' },
        { key: 'average', css: 'card-kpi-flow', icon: Scale, overline: 'Ticket médio', title: 'Valor Médio por Pagamento', value: formatCurrency(kpis.average),
            footer: 'Arrecadado ÷ n.º de pagamentos', change: change(kpis.average, previous?.average), hint: 'Mostrar só os pagamentos confirmados' },
    ];

    const handle = (key: CardKey) => {
        if (key === 'missing' || key === 'expected') { onShowMissing(); return; }
        const filter: CardFilter = key === 'rate' || key === 'average' ? 'collected' : key as CardFilter;
        onSelect(active === filter ? 'all' : filter);
    };

    return (
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {cards.map(card => {
                const Icon = card.icon;
                const filterKey = card.key === 'rate' || card.key === 'average' ? 'collected' : card.key;
                const pressed = active !== 'all' && active === filterKey;
                return (
                    <button
                        key={card.key}
                        type="button"
                        onClick={() => handle(card.key)}
                        aria-pressed={pressed}
                        title={card.hint}
                        className={cn(card.css, 'cursor-pointer text-left transition-transform hover:scale-[1.02] active:scale-[0.99]',
                            pressed && 'ring-4 ring-primary/60 ring-offset-2 ring-offset-background')}
                    >
                        <div className="flex items-start justify-between gap-2">
                            <div className="flex min-w-0 items-center gap-3">
                                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-black/10 text-slate-950 dark:bg-white/10 dark:text-white">
                                    <Icon className="h-5 w-5" />
                                </div>
                                <div className="min-w-0">
                                    <p className="truncate text-[11px] font-bold uppercase tracking-wider text-slate-900/70 dark:text-slate-400">{card.overline}</p>
                                    <p className="truncate text-sm font-bold tracking-tight text-slate-950 dark:text-white sm:text-base">{card.title}</p>
                                </div>
                            </div>
                            <Variation change={card.change} inverse={card.inverse} points={card.points} />
                        </div>
                        <div className="my-2">
                            {loading ? <div className="h-8 w-40 animate-pulse rounded-md bg-black/10 dark:bg-white/10" /> : (
                                <p className="truncate font-display text-2xl font-black tracking-tight text-slate-950 dark:text-white sm:text-3xl" title={card.value}>{card.value}</p>
                            )}
                            {card.key === 'rate' && (
                                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/10" aria-hidden>
                                    <div
                                        className={cn('h-full rounded-full transition-all', tone === 'good' ? 'bg-emerald-600' : tone === 'warning' ? 'bg-amber-500' : tone === 'bad' ? 'bg-red-600' : 'bg-slate-400')}
                                        style={{ width: `${Math.min(100, Math.max(0, kpis.rate ?? 0))}%` }}
                                    />
                                </div>
                            )}
                        </div>
                        <p className="truncate text-xs font-semibold text-slate-900/75 dark:text-slate-400">
                            {pressed ? 'A filtrar a tabela · clique para limpar' : card.footer}
                        </p>
                    </button>
                );
            })}
        </div>
    );
}
