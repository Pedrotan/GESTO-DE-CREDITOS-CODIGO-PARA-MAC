import { Briefcase, CalendarDays, ChevronLeft, ChevronRight, Lock, PieChart } from 'lucide-react';
import { cn } from '@/bibliotecas/utils';
import { Button } from '@/componentes/ui/button';
import type { CarteiraState, CarteiraView } from './useCarteira';

const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
export const MONTHS_LONG = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const DOT = { green: 'bg-green-500', orange: 'bg-orange-500', grey: 'bg-slate-400' } as const;

const VIEWS: Array<{ id: CarteiraView; label: string; help: string; icon: typeof Briefcase }> = [
    { id: 'carteira', label: 'Carteira', help: 'Créditos em curso hoje, seja qual for o mês de concessão', icon: Briefcase },
    { id: 'producao', label: 'Produção do Período', help: 'Créditos concedidos no mês escolhido (a folha do mês)', icon: CalendarDays },
    { id: 'anual', label: 'Visão Anual', help: 'Meses × indicadores, com totais e gráfico', icon: PieChart },
];

export function CabecalhoCarteira({ state, years, closedMonths, taskMonths, onOpenTasks }: {
    state: CarteiraState; years: number[]; closedMonths: string[]; taskMonths: Set<string>; onOpenTasks: () => void;
}) {
    const index = years.indexOf(state.year);
    const today = state.today;
    const currentMonth = today.slice(0, 7);
    const title = state.view === 'carteira' ? 'Carteira de crédito em curso'
        : state.view === 'producao' ? `Produção de ${MONTHS_LONG[state.month]} de ${state.year}` : `Visão anual de ${state.year}`;
    return (
        <div className="mb-4 space-y-3">
            <div className="flex flex-col gap-3 rounded-lg border border-border/40 bg-muted/20 p-3 lg:flex-row lg:items-center lg:justify-between">
                <h2 className="text-base font-bold text-foreground md:text-lg">{title}</h2>
                <div className="flex flex-wrap items-center gap-2">
                    <div role="tablist" aria-label="Vistas" className="inline-flex rounded-lg border bg-background p-0.5">
                        {VIEWS.map(item => {
                            const Icon = item.icon;
                            return (
                                <button key={item.id} type="button" role="tab" aria-selected={state.view === item.id} title={item.help} onClick={() => { state.setView(item.id); state.setCard('all'); }}
                                    className={cn('flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors', state.view === item.id ? 'bg-primary text-primary-foreground shadow' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}>
                                    <Icon className="h-3.5 w-3.5" /> {item.label}
                                </button>
                            );
                        })}
                    </div>
                    {state.view !== 'carteira' && (
                        <div className="flex items-center gap-1 rounded-lg border bg-background p-0.5">
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" aria-label="Ano anterior" disabled={index <= 0} onClick={() => state.setYear(years[index - 1])}><ChevronLeft className="h-4 w-4" /></Button>
                            <span className="min-w-[40px] px-2 text-center text-xs font-bold">{state.year}</span>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" aria-label="Ano seguinte" disabled={index >= years.length - 1} onClick={() => state.setYear(years[index + 1])}><ChevronRight className="h-4 w-4" /></Button>
                        </div>
                    )}
                </div>
            </div>

            {state.view !== 'anual' && (
                <div>
                    <div className="flex gap-2.5 overflow-x-auto rounded-2xl border border-primary/15 bg-primary/10 p-2 shadow-sm" style={{ scrollbarWidth: 'thin' }}>
                        {MONTHS.map((name, monthIndex) => {
                            const key = `${state.year}-${String(monthIndex + 1).padStart(2, '0')}`;
                            const active = state.view === 'producao' && monthIndex === state.month;
                            const closed = closedMonths.includes(key);
                            const past = key < currentMonth;
                            const dot = state.dots[monthIndex];
                            return (
                                <button key={name} type="button"
                                    onClick={() => { if (active) onOpenTasks(); else { state.setMonth(monthIndex); state.setView('producao'); state.setCard('all'); } }}
                                    title={active ? 'Abrir agenda de tarefas do mês' : `Ver a produção de ${MONTHS_LONG[monthIndex]}`}
                                    className={cn('relative flex min-w-[64px] flex-col items-center gap-1 whitespace-nowrap rounded-xl px-3.5 py-2.5 text-xs transition-all duration-200',
                                        active ? (closed ? 'scale-[1.03] bg-slate-700 font-bold text-white shadow-md' : 'scale-[1.03] bg-sidebar-primary font-bold text-sidebar-primary-foreground shadow-gold')
                                            : closed ? 'bg-background/70 text-muted-foreground/60 shadow-sm hover:bg-muted/60'
                                                : 'bg-background text-foreground/80 shadow-sm hover:-translate-y-0.5 hover:shadow-md dark:bg-white/10 dark:hover:bg-white/15',
                                        !active && past && 'text-red-600 dark:text-red-400')}>
                                    {taskMonths.has(key) && <span className={cn('absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-amber-400 ring-2', active ? 'ring-primary' : 'ring-background')} title="Há tarefas agendadas neste mês" />}
                                    <span className="font-semibold tracking-wide">{name}</span>
                                    {closed ? <Lock className="h-3 w-3 opacity-70" /> : dot ? <span className={cn('inline-block h-1.5 w-1.5 rounded-full', DOT[dot], key === currentMonth && 'animate-pulse')} /> : <span className="inline-block h-1.5 w-1.5" />}
                                </button>
                            );
                        })}
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-[11px] text-muted-foreground">
                        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-green-500" /> Sem atrasos</span>
                        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-orange-500" /> Com prestações em atraso</span>
                        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-slate-400" /> Sem operações</span>
                        <span className="flex items-center gap-1.5"><Lock className="h-3 w-3" /> Mês fechado</span>
                        <span className="flex items-center gap-1.5"><span className="font-bold text-red-600 dark:text-red-400">Mês</span> já passado</span>
                        <span>Os meses futuros não têm ponto.</span>
                    </div>
                </div>
            )}
        </div>
    );
}
