import type { ComponentType } from 'react';
import { ArrowUpRight, Gauge, ShieldCheck, ShieldOff, Timer } from 'lucide-react';
import { cn } from '@/bibliotecas/utils';
import type { AlcadasState } from './useAlcadas';

export type LimitsTab = 'perfil' | 'cadeia' | 'individuais' | 'globais' | 'consumo' | 'excecoes' | 'historico';

/** Resumo do topo: cada cartão leva ao separador onde se vê o detalhe. */
export function CartoesAlcadas({ state, onSelect }: { state: AlcadasState; onSelect: (tab: LimitsTab) => void }) {
    const summary = state.summary;
    const disabled = summary?.disabled.length || 0;
    const cards: Array<{ tab: LimitsTab; css: string; icon: ComponentType<{ className?: string }>; title: string; value: number; footer: string }> = [
        { tab: 'perfil', css: 'card-kpi-sky', icon: ShieldCheck, title: 'Perfis com limites ativos', value: summary?.enabledProfiles || 0, footer: `${state.profiles.length} perfis de acesso no sistema` },
        { tab: 'consumo', css: 'card-kpi-amber', icon: Gauge, title: 'Utilizadores acima de 80% hoje', value: summary?.over80 || 0, footer: 'Do volume diário ou do número de operações' },
        { tab: 'historico', css: 'card-kpi-purple', icon: ArrowUpRight, title: 'Operações escaladas hoje', value: summary?.escalatedToday || 0, footer: 'Enviadas para a fila de Aprovações' },
        { tab: 'excecoes', css: 'card-kpi-mint', icon: Timer, title: 'Exceções temporárias ativas', value: summary?.activeExceptions || 0, footer: 'Aumentos com data e hora de fim' },
        { tab: 'perfil', css: disabled ? 'card-kpi-coral' : 'card-kpi-flow', icon: ShieldOff, title: 'Limites desativados', value: disabled, footer: disabled ? 'Atenção: há perfis sem limites aplicados' : 'Todos os limites estão ativos' },
    ];
    return (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
            {cards.map(card => {
                const Icon = card.icon;
                return (
                    <button key={card.title} type="button" onClick={() => onSelect(card.tab)}
                        className={cn(card.css, 'cursor-pointer text-left transition-transform hover:scale-[1.02] active:scale-[0.99]')}>
                        <div className="flex items-center gap-2.5">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-black/10 text-slate-950 dark:bg-white/10 dark:text-white"><Icon className="h-5 w-5" /></div>
                            <p className="text-sm font-bold leading-tight tracking-tight text-slate-950 dark:text-white">{card.title}</p>
                        </div>
                        <div className="my-2">
                            {state.loading && !state.data ? <div className="h-8 w-16 animate-pulse rounded-md bg-black/10 dark:bg-white/10" />
                                : <p className="font-display text-3xl font-black tracking-tight text-slate-950 dark:text-white">{card.value.toLocaleString('pt-AO')}</p>}
                        </div>
                        <p className="line-clamp-2 text-xs font-semibold text-slate-900/75 dark:text-slate-400">{card.footer}</p>
                    </button>
                );
            })}
        </div>
    );
}
