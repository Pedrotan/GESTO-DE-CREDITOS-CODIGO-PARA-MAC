import type { ComponentType } from 'react';
import { BellRing, Fingerprint, KeyRound, ListChecks, ShieldAlert, ShieldCheck, ShieldX, Users } from 'lucide-react';
import { cn } from '@/bibliotecas/utils';
import type { AuditKpis } from '@/bibliotecas/auditoria-analise';

export type AuditCard = 'all' | 'criticalHigh' | 'alerts' | 'loginFailed' | 'accessDenied' | 'activeToday' | 'integrity';

function Variation({ current, previous, inverse }: { current: number; previous: number | null; inverse?: boolean }) {
    if (previous === null) return null;
    const change = previous ? Math.round(((current - previous) / previous) * 1000) / 10 : current ? null : 0;
    if (change === null) return <span className="rounded-full bg-black/10 px-2 py-0.5 text-[10px] font-bold text-slate-900/70 dark:bg-white/10 dark:text-slate-300">novo</span>;
    const good = change === 0 ? null : inverse ? change < 0 : change > 0;
    return (
        <span title="Variação face ao período anterior" className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold',
            good === null ? 'bg-black/10 text-slate-900/70 dark:bg-white/10 dark:text-slate-300'
                : good ? 'bg-emerald-700/15 text-emerald-900 dark:text-emerald-300' : 'bg-red-700/15 text-red-900 dark:text-red-300')}>
            {change === 0 ? '■' : change > 0 ? '▲' : '▼'} {Math.abs(change).toLocaleString('pt-AO', { maximumFractionDigits: 1 })}%
        </span>
    );
}

export function CartoesAuditoria({ kpis, previous, openAlerts, integrity, active, onSelect, loading }: {
    kpis: AuditKpis;
    previous: AuditKpis | null;
    openAlerts: number;
    integrity: { ok: boolean | null; label: string; detail: string };
    active: AuditCard;
    onSelect: (card: AuditCard) => void;
    loading?: boolean;
}) {
    const cards: Array<{ key: AuditCard; css: string; icon: ComponentType<{ className?: string }>; title: string; value: string; footer: string; current?: number; before?: number | null; inverse?: boolean }> = [
        { key: 'all', css: 'card-kpi-sky', icon: ListChecks, title: 'Total de Registos', value: kpis.total.toLocaleString('pt-AO'), footer: 'Ações auditadas no período', current: kpis.total, before: previous?.total ?? null },
        { key: 'criticalHigh', css: 'card-kpi-coral', icon: ShieldAlert, title: 'Eventos Críticos e Altos', value: kpis.criticalHigh.toLocaleString('pt-AO'), footer: 'Gravidade crítica ou alta', current: kpis.criticalHigh, before: previous?.criticalHigh ?? null, inverse: true },
        { key: 'alerts', css: 'card-kpi-amber', icon: BellRing, title: 'Alertas Abertos', value: openAlerts.toLocaleString('pt-AO'), footer: 'Abertos ou em análise no Centro de Alertas' },
        { key: 'loginFailed', css: 'card-kpi-purple', icon: KeyRound, title: 'Logins Falhados', value: kpis.loginFailed.toLocaleString('pt-AO'), footer: 'Palavra-passe ou código errados', current: kpis.loginFailed, before: previous?.loginFailed ?? null, inverse: true },
        { key: 'accessDenied', css: 'card-kpi-flow', icon: ShieldX, title: 'Acessos Negados', value: kpis.accessDenied.toLocaleString('pt-AO'), footer: 'Operações recusadas por permissão', current: kpis.accessDenied, before: previous?.accessDenied ?? null, inverse: true },
        { key: 'activeToday', css: 'card-kpi-mint', icon: Users, title: 'Utilizadores Ativos Hoje', value: kpis.activeUsersToday.toLocaleString('pt-AO'), footer: 'Com pelo menos uma ação hoje' },
        { key: 'integrity', css: integrity.ok === false ? 'card-kpi-coral' : 'card-kpi-mint', icon: integrity.ok === false ? Fingerprint : ShieldCheck, title: 'Estado da Integridade', value: integrity.label, footer: integrity.detail },
    ];
    return (
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-7">
            {cards.map(card => {
                const Icon = card.icon;
                const pressed = active === card.key && card.key !== 'all';
                return (
                    <button key={card.key} type="button" onClick={() => onSelect(active === card.key ? 'all' : card.key)} aria-pressed={pressed}
                        className={cn(card.css, 'cursor-pointer text-left transition-transform hover:scale-[1.02] active:scale-[0.99]', pressed && 'ring-4 ring-primary/60 ring-offset-2 ring-offset-background')}>
                        <div className="flex items-start justify-between gap-2">
                            <div className="flex min-w-0 items-center gap-2.5">
                                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-black/10 text-slate-950 dark:bg-white/10 dark:text-white"><Icon className="h-5 w-5" /></div>
                                <p className="text-sm font-bold leading-tight tracking-tight text-slate-950 dark:text-white" title={card.title}>{card.title}</p>
                            </div>
                            {card.current !== undefined && <Variation current={card.current} previous={card.before ?? null} inverse={card.inverse} />}
                        </div>
                        <div className="my-2">
                            {loading ? <div className="h-8 w-24 animate-pulse rounded-md bg-black/10 dark:bg-white/10" /> : (
                                <p className={cn('truncate font-display font-black tracking-tight text-slate-950 dark:text-white', card.key === 'integrity' ? 'text-xl' : 'text-3xl')} title={card.value}>{card.value}</p>
                            )}
                        </div>
                        <p className="line-clamp-2 text-xs font-semibold text-slate-900/75 dark:text-slate-400" title={card.footer}>{pressed ? 'A filtrar · clique para limpar' : card.footer}</p>
                    </button>
                );
            })}
        </div>
    );
}
