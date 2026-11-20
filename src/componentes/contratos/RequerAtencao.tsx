import { useState } from 'react';
import { AlertTriangle, BellRing, CalendarClock, ChevronDown, ChevronUp, FileWarning, IdCard, Settings2, Upload, type LucideIcon } from 'lucide-react';
import { Button } from '@/componentes/ui/button';
import { Input } from '@/componentes/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/componentes/ui/popover';
import type { AttentionItem, AttentionKind } from '@/bibliotecas/contratos-analise';

const KIND_STYLE: Record<AttentionKind, { icon: LucideIcon; tone: string; actionIcon: LucideIcon }> = {
    overdue: { icon: AlertTriangle, tone: 'text-orange-600 bg-orange-100 dark:bg-orange-900/40 dark:text-orange-300', actionIcon: BellRing },
    due_soon: { icon: CalendarClock, tone: 'text-amber-600 bg-amber-100 dark:bg-amber-900/40 dark:text-amber-300', actionIcon: BellRing },
    missing_contract: { icon: FileWarning, tone: 'text-sky-600 bg-sky-100 dark:bg-sky-900/40 dark:text-sky-300', actionIcon: Upload },
    id_expiring: { icon: IdCard, tone: 'text-violet-600 bg-violet-100 dark:bg-violet-900/40 dark:text-violet-300', actionIcon: IdCard },
};

const COLLAPSED = 6;

/** Painel «Requer atenção»: alertas de toda a carteira em vigor, cada um com a acção directa. */
export function RequerAtencao({ items, soonDays, onSoonDaysChange, onAction, onOpen }: {
    items: AttentionItem[];
    soonDays: number;
    onSoonDaysChange: (days: number) => void;
    onAction: (item: AttentionItem) => void;
    onOpen: (item: AttentionItem) => void;
}) {
    const [expanded, setExpanded] = useState(false);
    const [draft, setDraft] = useState(String(soonDays));
    const shown = expanded ? items : items.slice(0, COLLAPSED);
    const counts = items.reduce<Record<string, number>>((acc, item) => ({ ...acc, [item.kind]: (acc[item.kind] || 0) + 1 }), {});

    return (
        <section className="card-elevated mb-6 p-4" aria-label="Requer atenção">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                    <h2 className="flex items-center gap-2 text-base font-bold"><AlertTriangle className="h-4 w-4 text-orange-500" /> Requer atenção</h2>
                    <p className="text-xs text-muted-foreground">
                        Contratos em vigor de toda a carteira · {counts.overdue || 0} em atraso · {counts.due_soon || 0} a vencer · {counts.missing_contract || 0} sem contrato assinado · {counts.id_expiring || 0} com BI a expirar
                    </p>
                </div>
                <Popover>
                    <PopoverTrigger asChild>
                        <Button variant="ghost" size="sm" className="gap-1.5 text-xs"><Settings2 className="h-3.5 w-3.5" /> Configurar regras de alerta</Button>
                    </PopoverTrigger>
                    <PopoverContent align="end" className="w-72 space-y-2">
                        <p className="text-sm font-bold">Regras de alerta</p>
                        <label htmlFor="contract-soon-days" className="text-xs text-muted-foreground">Avisar vencimentos com quantos dias de antecedência?</label>
                        <div className="flex gap-2">
                            <Input id="contract-soon-days" type="number" min={1} max={60} className="h-9" value={draft} onChange={event => setDraft(event.target.value)} />
                            <Button size="sm" onClick={() => { const days = Math.min(60, Math.max(1, Math.round(Number(draft) || 7))); setDraft(String(days)); onSoonDaysChange(days); }}>Aplicar</Button>
                        </div>
                        <p className="text-[11px] text-muted-foreground">Fica guardado neste computador. Também muda o cartão e o filtro «Vence em N dias».</p>
                    </PopoverContent>
                </Popover>
            </div>

            {items.length === 0 ? (
                <p className="rounded-lg bg-muted/30 py-6 text-center text-sm text-muted-foreground">Sem alertas: todos os contratos em vigor estão em dia e com a documentação completa.</p>
            ) : (
                <>
                    <ul className="grid gap-2 md:grid-cols-2 2xl:grid-cols-3">
                        {shown.map(item => {
                            const style = KIND_STYLE[item.kind];
                            const Icon = style.icon;
                            const ActionIcon = style.actionIcon;
                            return (
                                <li key={item.id} className="flex items-center gap-3 rounded-lg border p-3">
                                    <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${style.tone}`}><Icon className="h-4 w-4" /></div>
                                    <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onOpen(item)} title="Abrir o detalhe do contrato">
                                        <p className="truncate text-sm font-bold">{item.row.clientName}</p>
                                        <p className="truncate text-xs text-muted-foreground"><span className="font-semibold text-foreground/80">{item.title}</span> · {item.row.number}</p>
                                        <p className="truncate text-xs text-muted-foreground">{item.detail}</p>
                                    </button>
                                    <Button size="sm" variant="outline" className="h-8 shrink-0 gap-1.5 text-xs" onClick={() => onAction(item)}>
                                        <ActionIcon className="h-3.5 w-3.5" /> {item.action}
                                    </Button>
                                </li>
                            );
                        })}
                    </ul>
                    {items.length > COLLAPSED && (
                        <div className="mt-2 flex justify-center">
                            <Button variant="ghost" size="sm" className="gap-1 text-xs" onClick={() => setExpanded(value => !value)}>
                                {expanded ? <><ChevronUp className="h-3.5 w-3.5" /> Mostrar menos</> : <><ChevronDown className="h-3.5 w-3.5" /> Ver todos ({items.length})</>}
                            </Button>
                        </div>
                    )}
                </>
            )}
        </section>
    );
}
