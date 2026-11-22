import { Lock } from 'lucide-react';
import { cn } from '@/bibliotecas/utils';
import { luandaTodayKey } from '@/bibliotecas/fuso-angola';
import { MONTH_LONG as MONTHS_LONG, MONTH_SHORT as MONTHS_SHORT } from '@/bibliotecas/periodos';


/** Estado de actividade de um mês: verde = sem atrasos, laranja = com atrasos, cinzento = sem operações. */
export type MonthDot = 'green' | 'orange' | 'grey' | null;
const DOT = { green: 'bg-green-500', orange: 'bg-orange-500', grey: 'bg-slate-400' } as const;

/**
 * Faixa de meses (Jan…Dez) da página de Créditos, partilhada pelas outras páginas: mês activo em destaque, ponto de
 * actividade por baixo, cadeado nos meses fechados, meses já passados a vermelho e marca de tarefas agendadas.
 */
export function FaixaMeses({
    year, activeMonth, onSelect, dots, closedMonths, taskMonths, today = luandaTodayKey(), titleFor, legend = true, ariaLabel = 'Meses',
}: {
    year: number;
    /** Mês em destaque (0 = Janeiro) ou null quando nenhum está seleccionado. */
    activeMonth: number | null;
    onSelect: (month: number, active: boolean) => void;
    dots?: MonthDot[];
    /** Meses fechados no formato AAAA-MM. */
    closedMonths?: string[];
    /** Meses com tarefas agendadas no formato AAAA-MM. */
    taskMonths?: Set<string>;
    /** Data de hoje AAAA-MM-DD (fuso de Angola). */
    today?: string;
    titleFor?: (month: number, active: boolean) => string;
    legend?: boolean;
    ariaLabel?: string;
}) {
    const currentMonth = today.slice(0, 7);
    return (
        <div>
            <div role="group" aria-label={ariaLabel} className="flex gap-2.5 overflow-x-auto rounded-2xl border border-primary/15 bg-primary/10 p-2 shadow-sm" style={{ scrollbarWidth: 'thin' }}>
                {MONTHS_SHORT.map((name, monthIndex) => {
                    const key = `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
                    const active = monthIndex === activeMonth;
                    const closed = closedMonths?.includes(key) ?? false;
                    const past = key < currentMonth;
                    const dot = dots?.[monthIndex];
                    return (
                        <button key={name} type="button" aria-pressed={active}
                            onClick={() => onSelect(monthIndex, active)}
                            title={titleFor ? titleFor(monthIndex, active) : `Ver ${MONTHS_LONG[monthIndex]} de ${year}`}
                            className={cn('relative flex min-w-[64px] flex-col items-center gap-1 whitespace-nowrap rounded-xl px-3.5 py-2.5 text-xs transition-all duration-200',
                                active ? (closed ? 'scale-[1.03] bg-slate-700 font-bold text-white shadow-md' : 'scale-[1.03] bg-sidebar-primary font-bold text-sidebar-primary-foreground shadow-gold')
                                    : closed ? 'bg-background/70 text-muted-foreground/60 shadow-sm hover:bg-muted/60'
                                        : 'bg-background text-foreground/80 shadow-sm hover:-translate-y-0.5 hover:shadow-md dark:bg-white/10 dark:hover:bg-white/15',
                                !active && past && 'text-red-600 dark:text-red-400')}>
                            {taskMonths?.has(key) && <span className={cn('absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-amber-400 ring-2', active ? 'ring-primary' : 'ring-background')} title="Há tarefas agendadas neste mês" />}
                            <span className="font-semibold tracking-wide">{name}</span>
                            {closed ? <Lock className="h-3 w-3 opacity-70" /> : dot ? <span className={cn('inline-block h-1.5 w-1.5 rounded-full', DOT[dot], key === currentMonth && 'animate-pulse')} /> : <span className="inline-block h-1.5 w-1.5" />}
                        </button>
                    );
                })}
            </div>
            {legend && (
                <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-[11px] text-muted-foreground">
                    <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-green-500" /> Sem atrasos</span>
                    <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-orange-500" /> Com prestações em atraso</span>
                    <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-slate-400" /> Sem operações</span>
                    {closedMonths && <span className="flex items-center gap-1.5"><Lock className="h-3 w-3" /> Mês fechado</span>}
                    <span className="flex items-center gap-1.5"><span className="font-bold text-red-600 dark:text-red-400">Mês</span> já passado</span>
                    <span>Os meses futuros não têm ponto.</span>
                </div>
            )}
        </div>
    );
}
