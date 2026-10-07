import { useState, type ComponentType, type ReactNode } from 'react';
import { AlarmClock, AlertTriangle, ArrowUpRight, Briefcase, CalendarClock, CheckCircle2, Coins, Eye, EyeOff, HandCoins, Percent, TrendingUp, Users } from 'lucide-react';
import { cn } from '@/bibliotecas/utils';
import { formatCurrency } from '@/bibliotecas/formatters';
import type { CardFilter, CarteiraState } from './useCarteira';

const kz = (minor: number) => formatCurrency(minor / 100);
const HIDDEN = '••••••';
const readHidden = () => { try { return localStorage.getItem('creditos_ocultar_valores') === '1'; } catch { return false; } };

function Variation({ current, previous, inverse }: { current: number; previous: number; inverse?: boolean }) {
    const change = previous ? Math.round(((current - previous) / previous) * 1000) / 10 : current ? null : 0;
    if (change === null) return <span className="rounded-full bg-black/10 px-2 py-0.5 text-[10px] font-bold text-slate-900/70 dark:bg-white/10 dark:text-slate-300" title="Sem valor no mês anterior">novo</span>;
    const good = change === 0 ? null : inverse ? change < 0 : change > 0;
    return (
        <span title="Variação face ao mês anterior" className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold',
            good === null ? 'bg-black/10 text-slate-900/70 dark:bg-white/10 dark:text-slate-300' : good ? 'bg-emerald-700/15 text-emerald-900 dark:text-emerald-300' : 'bg-red-700/15 text-red-900 dark:text-red-300')}>
            {change === 0 ? '■' : change > 0 ? '▲' : '▼'} {Math.abs(change).toLocaleString('pt-AO', { maximumFractionDigits: 1 })}%
        </span>
    );
}

type CardDef = {
    key: CardFilter | 'cash'; css: string; icon: ComponentType<{ className?: string }>; group: string; title: string;
    value: ReactNode; footer: ReactNode; detail?: 'clients' | 'capital' | 'projected' | 'outstanding' | 'realized';
    variation?: { current: number; previous: number; inverse?: boolean };
};

export function CartoesCarteira({ state, onDetails, cashFlowCard }: {
    state: CarteiraState;
    onDetails: (type: 'clients' | 'capital' | 'projected' | 'outstanding' | 'realized') => void;
    cashFlowCard: ReactNode;
}) {
    const [hidden, setHidden] = useState(readHidden);
    const show = (value: string) => hidden ? HIDDEN : value;
    const { kpis, figures, previousFigures } = state;
    const pct = (value: number | null) => value === null ? '—' : `${value.toLocaleString('pt-AO', { maximumFractionDigits: 1 })}%`;
    const cards: CardDef[] = state.view === 'carteira' ? [
        { key: 'carteira', css: 'card-kpi-sky', icon: Briefcase, group: 'Carteira', title: 'Carteira Ativa', value: show(kz(kpis.activeMinor)), footer: `${kpis.activeCount} crédito(s) em curso · capital em dívida`, detail: 'outstanding' },
        { key: 'atraso', css: 'card-kpi-coral', icon: AlertTriangle, group: 'Risco', title: 'Em Atraso', value: show(kz(kpis.overdueMinor)), footer: <>{kpis.overdueCount} crédito(s) · <strong>PAR30 {pct(kpis.par30)}</strong> da carteira</> },
        { key: 'vence7', css: 'card-kpi-amber', icon: CalendarClock, group: 'Cobrança', title: 'A Vencer em 7 Dias', value: show(kz(kpis.dueSoonMinor)), footer: `${kpis.dueSoonCount} prestação(ões) até ${new Date(Date.now() + 7 * 86_400_000).toLocaleDateString('pt-AO')}` },
        { key: 'mora', css: 'card-kpi-purple', icon: AlarmClock, group: 'Mora', title: 'Mora Acumulada', value: show(kz(kpis.moraMinor)), footer: 'Juros de mora por cobrar' },
        { key: 'incumprimento', css: 'card-kpi-flow', icon: Percent, group: 'Qualidade', title: 'Taxa de Incumprimento', value: show(pct(kpis.defaultRate)), footer: 'Capital com mais de 90 dias de atraso' },
        { key: 'juros', css: 'card-kpi-mint', icon: TrendingUp, group: 'Expectativa', title: 'Juros por Receber', value: show(kz(kpis.futureInterestMinor)), footer: 'Juros futuros dos créditos em curso', detail: 'projected' },
    ] : [
        { key: 'concedidos', css: 'card-kpi-sky', icon: Users, group: 'Produção', title: 'Créditos Concedidos', value: show(String(figures.grantedCount)), footer: `${figures.grantedClients} cliente(s) · ${show(kz(figures.grantedMinor))}`, detail: 'clients', variation: { current: figures.grantedCount, previous: previousFigures.grantedCount } },
        { key: 'all', css: 'card-kpi-coral', icon: ArrowUpRight, group: 'Desembolso', title: 'Capital Desembolsado', value: show(kz(figures.disbursedMinor)), footer: 'Saídas de Caixa/Banco registadas no razão', detail: 'capital', variation: { current: figures.disbursedMinor, previous: previousFigures.disbursedMinor } },
        { key: 'all', css: 'card-kpi-purple', icon: Coins, group: 'Contrato', title: 'Juros Contratados', value: show(kz(figures.contractedInterestMinor)), footer: 'Juros dos créditos concedidos no mês', detail: 'projected', variation: { current: figures.contractedInterestMinor, previous: previousFigures.contractedInterestMinor } },
        { key: 'all', css: 'card-kpi-mint', icon: HandCoins, group: 'Realizado', title: 'Recebido no Período', value: show(formatCurrency(figures.received.total)),
            footer: <>Capital {show(formatCurrency(figures.received.principal))} · Juros {show(formatCurrency(figures.received.interest))} · Mora {show(formatCurrency(figures.received.late))}</>, detail: 'realized',
            variation: { current: figures.received.total, previous: previousFigures.received.total } },
        { key: 'liquidados_periodo', css: 'card-kpi-amber', icon: CheckCircle2, group: 'Fecho', title: 'Liquidados no Período', value: show(String(figures.paidOffCount)), footer: 'Créditos totalmente pagos no mês', variation: { current: figures.paidOffCount, previous: previousFigures.paidOffCount } },
    ];
    return (
        <div className="mb-6">
            <div className="mb-2 flex justify-end">
                <button type="button" onClick={() => { const next = !hidden; setHidden(next); try { localStorage.setItem('creditos_ocultar_valores', next ? '1' : '0'); } catch { /* sem armazenamento */ } }}
                    className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground">
                    {hidden ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />} {hidden ? 'Mostrar valores' : 'Ocultar valores'}
                </button>
            </div>
            {state.stale && (
                <p role="status" className="mb-3 flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                    <AlertTriangle className="h-4 w-4" /> A sincronizar com o servidor: os valores podem estar desatualizados até a sincronização terminar.
                </p>
            )}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                {cards.map(card => {
                    const Icon = card.icon;
                    const active = card.key !== 'all' && card.key !== 'cash' && state.card === card.key;
                    return (
                        <div key={card.title} role="button" tabIndex={0} aria-pressed={active}
                            onClick={() => card.key !== 'cash' && state.setCard(active ? 'all' : card.key as CardFilter)}
                            onKeyDown={event => { if (event.key === 'Enter' && card.key !== 'cash') state.setCard(active ? 'all' : card.key as CardFilter); }}
                            className={cn(card.css, 'group cursor-pointer hover:scale-[1.02] active:scale-[0.99]', active && 'ring-4 ring-primary/60 ring-offset-2 ring-offset-background')}>
                            <div className="flex items-center justify-between gap-2">
                                <div className="flex min-w-0 items-center gap-2.5">
                                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-black/10 text-slate-950 transition-transform group-hover:scale-105 dark:bg-white/10 dark:text-white"><Icon className="h-5 w-5" /></div>
                                    <div className="min-w-0">
                                        <p className="truncate text-[11px] font-bold uppercase tracking-wider text-slate-900/70 dark:text-slate-400">{card.group}</p>
                                        <p className="truncate text-sm font-bold tracking-tight text-slate-950 dark:text-white sm:text-base" title={card.title}>{card.title}</p>
                                    </div>
                                </div>
                                {card.detail && (
                                    <button type="button" title="Ver o detalhe" aria-label={`Ver o detalhe de ${card.title}`}
                                        onClick={event => { event.stopPropagation(); onDetails(card.detail!); }}
                                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-black/10 text-slate-950 shadow-2xs transition-all hover:scale-110 hover:bg-black/20 dark:bg-white/10 dark:text-white dark:hover:bg-white/20">
                                        <Eye className="h-3.5 w-3.5" />
                                    </button>
                                )}
                            </div>
                            <div className="my-2 flex items-center gap-2">
                                {state.loading ? <div className="h-8 w-24 animate-pulse rounded-md bg-black/10 dark:bg-white/10" />
                                    : <p className="truncate font-display text-2xl font-black tracking-tight text-slate-950 dark:text-white sm:text-3xl" title={typeof card.value === 'string' ? card.value : undefined}>{card.value}</p>}
                                {card.variation && !hidden && <Variation {...card.variation} />}
                            </div>
                            <p className="line-clamp-2 text-xs font-semibold text-slate-900/75 dark:text-slate-400">{active ? 'A filtrar a tabela · clique para limpar' : card.footer}</p>
                        </div>
                    );
                })}
                {state.view === 'producao' && cashFlowCard}
            </div>
        </div>
    );
}
