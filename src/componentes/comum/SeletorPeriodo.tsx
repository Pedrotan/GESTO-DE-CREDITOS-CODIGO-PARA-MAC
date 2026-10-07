import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/componentes/ui/button';
import { Input } from '@/componentes/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/componentes/ui/select';
import { cn } from '@/bibliotecas/utils';
import { MONTH_SHORT, PERIOD_KIND_LABELS, defaultPeriod, type PeriodKind, type PeriodSelection } from '@/bibliotecas/periodos';

// Seletor de período com a faixa de meses igual à da página de Créditos, mais os modos diário, semanal,
// semestral, anual, personalizado e todo o período.

export function SeletorPeriodo({
    value, onChange, kinds = ['day', 'week', 'month', 'semester', 'year', 'custom', 'all'], monthsWithData,
}: {
    value: PeriodSelection;
    onChange: (value: PeriodSelection) => void;
    kinds?: PeriodKind[];
    /** Meses (do ano seleccionado) com registos: marcados com um ponto. */
    monthsWithData?: Set<number>;
}) {
    const now = new Date();
    const set = (changes: Partial<PeriodSelection>) => onChange({ ...value, ...changes });
    const showYear = ['month', 'quarter', 'semester', 'year'].includes(value.kind);
    const activeQuarter = value.quarter ?? (Math.floor(value.month / 3) + 1);

    return (
        <div className="flex flex-col gap-3 rounded-xl border bg-muted/40 p-3">
            <div className="flex flex-wrap items-center gap-2">
                <CalendarDays className="h-4 w-4 text-muted-foreground" />
                <Select value={value.kind} onValueChange={(kind) => set({ kind: kind as PeriodKind })}>
                    <SelectTrigger className="h-9 w-44 bg-background"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        {kinds.map(kind => <SelectItem key={kind} value={kind}>{PERIOD_KIND_LABELS[kind]}</SelectItem>)}
                    </SelectContent>
                </Select>
                {showYear && (
                    <div className="flex items-center gap-1 rounded-lg border bg-background px-1">
                        <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => set({ year: value.year - 1 })} aria-label="Ano anterior">
                            <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <span className="w-12 text-center text-sm font-bold">{value.year}</span>
                        <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => set({ year: value.year + 1 })} aria-label="Ano seguinte">
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                    </div>
                )}
                {value.kind === 'quarter' && ([1, 2, 3, 4] as const).map(quarter => (
                    <button
                        key={quarter} type="button" onClick={() => set({ quarter })}
                        className={cn('rounded-lg px-3 py-1.5 text-xs font-bold transition-colors',
                            activeQuarter === quarter ? 'bg-sidebar-primary text-sidebar-primary-foreground shadow' : 'bg-background hover:bg-muted')}
                    >
                        {quarter}.º trim.
                    </button>
                ))}
                {value.kind === 'semester' && ([1, 2] as const).map(semester => (
                    <button
                        key={semester} type="button" onClick={() => set({ semester })}
                        className={cn('rounded-lg px-3 py-1.5 text-xs font-bold transition-colors',
                            value.semester === semester ? 'bg-sidebar-primary text-sidebar-primary-foreground shadow' : 'bg-background hover:bg-muted')}
                    >
                        {semester}.º semestre
                    </button>
                ))}
                {(value.kind === 'day' || value.kind === 'week') && (
                    <Input type="date" value={value.day} onChange={event => set({ day: event.target.value })} className="h-9 w-44 bg-background" />
                )}
                {value.kind === 'custom' && (
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="text-muted-foreground">De</span>
                        <Input type="date" value={value.start} onChange={event => set({ start: event.target.value })} className="h-9 w-40 bg-background" />
                        <span className="text-muted-foreground">até</span>
                        <Input type="date" value={value.end} onChange={event => set({ end: event.target.value })} className="h-9 w-40 bg-background" />
                    </div>
                )}
                {value.kind !== 'all' && (
                    <Button type="button" variant="ghost" size="sm" className="ml-auto text-xs" onClick={() => onChange(defaultPeriod(now, value.kind))}>
                        Hoje
                    </Button>
                )}
            </div>
            {value.kind === 'month' && (
                <div className="flex gap-2 overflow-x-auto pb-1">
                    {MONTH_SHORT.map((name, month) => {
                        const active = month === value.month;
                        const current = month === now.getMonth() && value.year === now.getFullYear();
                        return (
                            <button
                                key={name} type="button" onClick={() => set({ month })}
                                className={cn('relative flex min-w-[52px] flex-col items-center rounded-lg px-3 py-1.5 text-xs font-semibold transition-all',
                                    active ? 'scale-[1.03] bg-sidebar-primary font-bold text-sidebar-primary-foreground shadow-gold'
                                        : 'bg-background text-foreground/80 shadow-sm hover:-translate-y-0.5 hover:shadow-md dark:bg-white/10',
                                    current && !active && 'ring-1 ring-sidebar-primary/60')}
                            >
                                {name}
                                <span className={cn('mt-0.5 h-1.5 w-1.5 rounded-full', monthsWithData?.has(month) ? (active ? 'bg-sidebar-primary-foreground' : 'bg-emerald-500') : 'bg-transparent')} />
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
