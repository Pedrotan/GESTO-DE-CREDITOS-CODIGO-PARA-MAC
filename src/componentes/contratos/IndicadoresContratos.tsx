import { AlertTriangle, BadgeCheck, CalendarClock, FileCheck2, FileText, Wallet } from 'lucide-react';
import { kz, type ContractKpis, type QuickFilter } from '@/bibliotecas/contratos-analise';

/** Seis indicadores do período, com o dinheiro em risco. Clicar filtra a tabela (clicar de novo limpa). */
export function IndicadoresContratos({ kpis, periodLabel, soonDays, active, onSelect }: {
    kpis: ContractKpis;
    periodLabel: string;
    soonDays: number;
    active: QuickFilter;
    onSelect: (filter: QuickFilter) => void;
}) {
    const share = kpis.inForce.share === null ? '—' : `${kpis.inForce.share.toFixed(1).replace('.', ',')}% da carteira do período`;
    const cards: Array<{ key: string; filter: QuickFilter; css: string; icon: typeof FileText; overline: string; title: string; value: string; unit?: string; support: string }> = [
        { key: 'period', filter: 'todos', css: 'card-kpi-sky', icon: FileText, overline: `Contratos de ${periodLabel}`, title: 'Contratos no período',
            value: String(kpis.period.count), unit: kpis.period.count === 1 ? 'contrato' : 'contratos', support: `Valor contratado: ${kz(kpis.period.amountMinor)}` },
        { key: 'force', filter: 'vigor', css: 'card-kpi-mint', icon: FileCheck2, overline: 'Em vigor', title: 'Contratos activos',
            value: String(kpis.inForce.count), unit: kpis.inForce.count === 1 ? 'contrato' : 'contratos', support: share },
        { key: 'balance', filter: 'vigor', css: 'card-kpi-info', icon: Wallet, overline: 'Por receber', title: 'Saldo em dívida',
            value: kz(kpis.inForce.outstandingMinor), support: `Já reembolsado: ${kz(kpis.period.repaidMinor)}` },
        { key: 'overdue', filter: 'atraso', css: 'card-kpi-coral', icon: AlertTriangle, overline: 'Risco', title: 'Com atraso',
            value: String(kpis.overdue.count), unit: kpis.overdue.count === 1 ? 'contrato' : 'contratos', support: `Vencido e não pago: ${kz(kpis.overdue.overdueMinor)}` },
        { key: 'soon', filter: 'vence7', css: 'card-kpi-amber', icon: CalendarClock, overline: `Próximos ${soonDays} dias`, title: `Vence em ${soonDays} dias`,
            value: String(kpis.dueSoon.installments), unit: kpis.dueSoon.installments === 1 ? 'prestação' : 'prestações', support: `A receber: ${kz(kpis.dueSoon.amountMinor)}` },
        { key: 'closed', filter: 'liquidados', css: 'card-kpi-purple', icon: BadgeCheck, overline: 'Encerrados', title: 'Liquidados · Terminados',
            value: `${kpis.paid.count} · ${kpis.closed.count}`, support: `Liquidados: ${kz(kpis.paid.amountMinor)} · Terminados: ${kz(kpis.closed.amountMinor)}` },
    ];
    return (
        <div className="mb-6 grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {cards.map(card => {
                const Icon = card.icon;
                const pressed = active === card.filter && card.filter !== 'todos';
                return (
                    <button
                        key={card.key}
                        type="button"
                        onClick={() => onSelect(pressed ? 'todos' : card.filter)}
                        aria-pressed={pressed}
                        title={card.filter === 'todos' ? 'Mostrar todos os contratos do período' : `Mostrar só: ${card.title.toLowerCase()}`}
                        className={`${card.css} cursor-pointer text-left transition-transform hover:scale-[1.02] active:scale-[0.99] ${pressed ? 'ring-4 ring-primary/60 ring-offset-2 ring-offset-background' : ''}`}
                    >
                        <div className="flex items-center gap-3 min-w-0">
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/10 dark:bg-white/10 text-slate-950 dark:text-white shrink-0">
                                <Icon className="h-5 w-5" />
                            </div>
                            <div className="min-w-0">
                                <p className="text-[11px] font-bold text-slate-900/70 dark:text-slate-400 uppercase tracking-wider truncate">{card.overline}</p>
                                <p className="text-sm sm:text-base font-bold text-slate-950 dark:text-white truncate tracking-tight">{card.title}</p>
                            </div>
                        </div>
                        <div className="my-2 flex items-baseline gap-2 min-w-0">
                            <p className={`font-display font-black tracking-tight text-slate-950 dark:text-white truncate ${card.unit ? 'text-3xl' : 'text-xl'}`} title={card.value}>{card.value}</p>
                            {card.unit && <p className="text-xs font-semibold text-slate-900/70 dark:text-slate-400">{card.unit}</p>}
                        </div>
                        <p className="text-xs font-semibold text-slate-900/75 dark:text-slate-400 truncate" title={card.support}>
                            {pressed ? 'A filtrar a tabela · clique para limpar' : card.support}
                        </p>
                    </button>
                );
            })}
        </div>
    );
}
