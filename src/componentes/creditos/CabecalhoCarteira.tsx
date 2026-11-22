import { Briefcase, CalendarDays, ChevronLeft, ChevronRight, PieChart } from 'lucide-react';
import { cn } from '@/bibliotecas/utils';
import { Button } from '@/componentes/ui/button';
import { FaixaMeses } from '@/componentes/comum/FaixaMeses';
import { MONTH_LONG as MONTHS_LONG } from '@/bibliotecas/periodos';
import type { CarteiraState, CarteiraView } from './useCarteira';


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
                <FaixaMeses
                    year={state.year}
                    activeMonth={state.view === 'producao' ? state.month : null}
                    today={today}
                    dots={state.dots}
                    closedMonths={closedMonths}
                    taskMonths={taskMonths}
                    titleFor={(monthIndex, active) => active ? 'Abrir agenda de tarefas do mês' : `Ver a produção de ${MONTHS_LONG[monthIndex]}`}
                    onSelect={(monthIndex, active) => { if (active) onOpenTasks(); else { state.setMonth(monthIndex); state.setView('producao'); state.setCard('all'); } }}
                />
            )}
        </div>
    );
}
