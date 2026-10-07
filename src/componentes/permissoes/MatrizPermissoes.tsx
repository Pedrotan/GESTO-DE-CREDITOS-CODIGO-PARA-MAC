import { useState } from 'react';
import { AlertTriangle, Check, ChevronDown, Minus } from 'lucide-react';
import { cn } from '@/bibliotecas/utils';
import { DESCRICOES_ACOES, MODULOS_SISTEMA, ROTULOS_AREAS, comporPermissao, type AcaoModulo } from '@/tipos/controlo-acesso';

const AREAS = ['comercial', 'credito', 'cobranca', 'financeiro', 'fiscal', 'relatorios', 'administracao'] as const;
const STANDARD: AcaoModulo[] = ['ver', 'criar', 'editar', 'eliminar', 'aprovar', 'exportar'];
const STANDARD_LABELS: Record<string, string> = { ver: 'Ver', criar: 'Criar', editar: 'Editar', eliminar: 'Eliminar', aprovar: 'Aprovar', exportar: 'Exportar' };

export type PermissionOrigin = 'perfil' | 'concedida' | 'revogada';

function Cell({ active, critical, changed, origin, title, onClick, disabled }: { active: boolean; critical?: boolean; changed?: boolean; origin?: PermissionOrigin; title: string; onClick: () => void; disabled?: boolean }) {
    return (
        <button type="button" onClick={onClick} disabled={disabled} title={title} aria-pressed={active} aria-label={title}
            className={cn('relative mx-auto flex h-7 w-7 items-center justify-center rounded-lg border-2 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                active
                    ? origin === 'concedida' ? 'border-emerald-600 bg-emerald-600 text-white' : critical ? 'border-amber-500 bg-amber-500 text-white' : 'border-primary bg-primary text-primary-foreground'
                    : origin === 'revogada' ? 'border-red-500 bg-red-50 text-red-600 dark:bg-red-500/10' : 'border-slate-300 bg-background hover:border-primary/60 dark:border-slate-600',
                changed && 'ring-2 ring-sky-400 ring-offset-1 ring-offset-background', disabled && 'cursor-not-allowed opacity-50')}>
            {active ? <Check className="h-4 w-4" strokeWidth={3} /> : origin === 'revogada' ? <Minus className="h-4 w-4" strokeWidth={3} /> : null}
            {changed && <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border-2 border-background bg-sky-500" />}
        </button>
    );
}

/**
 * Matriz de permissões por área: módulos nas linhas, ações padrão nas colunas e ações especiais em etiquetas.
 * Marca/desmarca célula, linha, coluna da área ou a área inteira; mostra a origem (perfil, exceção concedida
 * ou revogada), as ações críticas e o que mudou face ao estado original.
 */
export function MatrizPermissoes({ selected, onToggle, onSetMany, search = '', origin, baseline, readOnly }: {
    selected: Set<string>;
    onToggle: (permissionId: string) => void;
    onSetMany: (permissionIds: string[], active: boolean) => void;
    search?: string;
    origin?: (permissionId: string) => PermissionOrigin | undefined;
    baseline?: Set<string>;
    readOnly?: boolean;
}) {
    const [closed, setClosed] = useState<Record<string, boolean>>({});
    const term = search.trim().toLowerCase();
    return (
        <div className="space-y-4">
            {AREAS.map(area => {
                const modules = MODULOS_SISTEMA.filter(module => module.area === area && (!term || module.nome.toLowerCase().includes(term)
                    || module.acoesDisponiveis.some(action => (DESCRICOES_ACOES[action]?.nome || action).toLowerCase().includes(term))));
                if (!modules.length) return null;
                const all = modules.flatMap(module => module.acoesDisponiveis.map(action => comporPermissao(module.id, action)));
                const activeCount = all.filter(id => selected.has(id)).length;
                const changedCount = baseline ? all.filter(id => selected.has(id) !== baseline.has(id)).length : 0;
                const open = !closed[area];
                const info = ROTULOS_AREAS[area];
                const specialActions = (actions: AcaoModulo[]) => actions.filter(action => !STANDARD.includes(action));
                return (
                    <section key={area} className="overflow-hidden rounded-2xl border bg-card shadow-sm">
                        <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/40 px-4 py-3">
                            <button type="button" onClick={() => setClosed(previous => ({ ...previous, [area]: open }))} className="flex min-w-0 items-center gap-2 text-left">
                                <ChevronDown className={cn('h-4 w-4 shrink-0 transition-transform', !open && '-rotate-90')} />
                                <span className="font-bold">{info.nome}</span>
                                <span className="hidden truncate text-xs text-muted-foreground sm:inline">· {info.descricao}</span>
                            </button>
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="rounded-full bg-background px-2.5 py-1 text-[11px] font-bold">{activeCount} de {all.length} ativas</span>
                                {changedCount > 0 && <span className="rounded-full bg-sky-500/15 px-2.5 py-1 text-[11px] font-bold text-sky-700 dark:text-sky-300">{changedCount} alterada(s)</span>}
                                {!readOnly && <>
                                    <button type="button" className="rounded-md px-2 py-1 text-[11px] font-bold text-primary hover:bg-primary/10" onClick={() => onSetMany(all, true)}>Marcar área</button>
                                    <button type="button" className="rounded-md px-2 py-1 text-[11px] font-bold text-muted-foreground hover:bg-destructive/10 hover:text-destructive" onClick={() => onSetMany(all, false)}>Desmarcar área</button>
                                </>}
                            </div>
                        </div>
                        {open && (
                            <div className="overflow-x-auto">
                                <table className="w-full min-w-[860px] text-sm">
                                    <thead>
                                        <tr className="border-b text-xs text-muted-foreground">
                                            <th className="w-[230px] px-4 py-2 text-left font-semibold">Módulo</th>
                                            {STANDARD.map(action => {
                                                const column = modules.filter(module => module.acoesDisponiveis.includes(action)).map(module => comporPermissao(module.id, action));
                                                const allOn = column.length > 0 && column.every(id => selected.has(id));
                                                return (
                                                    <th key={action} className="w-[78px] px-1 py-2 text-center font-semibold">
                                                        <button type="button" disabled={readOnly || !column.length} onClick={() => onSetMany(column, !allOn)} title={`${allOn ? 'Desmarcar' : 'Marcar'} "${STANDARD_LABELS[action]}" em toda a área · ${DESCRICOES_ACOES[action]?.descricao || ''}`}
                                                            className="inline-flex items-center gap-1 rounded px-1 hover:text-foreground disabled:opacity-60">
                                                            {DESCRICOES_ACOES[action]?.critica && <AlertTriangle className="h-3 w-3 text-amber-500" />}{STANDARD_LABELS[action]}
                                                        </button>
                                                    </th>
                                                );
                                            })}
                                            <th className="px-3 py-2 text-left font-semibold">Ações especiais</th>
                                            {!readOnly && <th className="w-[70px] px-2 py-2 text-center font-semibold">Linha</th>}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                        {modules.map(module => {
                                            const row = module.acoesDisponiveis.map(action => comporPermissao(module.id, action));
                                            const rowOn = row.every(id => selected.has(id));
                                            return (
                                                <tr key={module.id} className="hover:bg-muted/30">
                                                    <td className="px-4 py-2.5">
                                                        <p className="font-semibold">{module.nome}</p>
                                                        {module.caminho && <p className="font-mono text-[10px] text-muted-foreground">{module.caminho}</p>}
                                                    </td>
                                                    {STANDARD.map(action => {
                                                        if (!module.acoesDisponiveis.includes(action)) return <td key={action} className="text-center text-slate-300 dark:text-slate-700">—</td>;
                                                        const id = comporPermissao(module.id, action);
                                                        const info = DESCRICOES_ACOES[action];
                                                        return (
                                                            <td key={action} className="px-1 py-1.5">
                                                                <Cell active={selected.has(id)} critical={info?.critica} changed={baseline ? selected.has(id) !== baseline.has(id) : false} origin={origin?.(id)}
                                                                    disabled={readOnly} onClick={() => onToggle(id)} title={`${module.nome} · ${info?.nome || action}: ${info?.descricao || ''}`} />
                                                            </td>
                                                        );
                                                    })}
                                                    <td className="px-3 py-1.5">
                                                        <div className="flex flex-wrap gap-1.5">
                                                            {specialActions(module.acoesDisponiveis).map(action => {
                                                                const id = comporPermissao(module.id, action);
                                                                const active = selected.has(id);
                                                                const info = DESCRICOES_ACOES[action];
                                                                const from = origin?.(id);
                                                                const changed = baseline ? active !== baseline.has(id) : false;
                                                                return (
                                                                    <button key={action} type="button" disabled={readOnly} onClick={() => onToggle(id)} title={`${info?.descricao || action}${info?.critica ? ' · ação crítica' : ''}`}
                                                                        className={cn('inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-bold transition-colors',
                                                                            active ? from === 'concedida' ? 'border-emerald-500 bg-emerald-500/15 text-emerald-800 dark:text-emerald-300'
                                                                                : info?.critica ? 'border-amber-400 bg-amber-400/20 text-amber-900 dark:text-amber-200' : 'border-primary/40 bg-primary/10 text-primary'
                                                                                : from === 'revogada' ? 'border-red-300 bg-red-50 text-red-700 line-through dark:bg-red-500/10' : 'border-dashed border-slate-300 text-muted-foreground hover:border-primary/50',
                                                                            changed && 'ring-2 ring-sky-400')}>
                                                                        {active ? <Check className="h-3 w-3" strokeWidth={3} /> : info?.critica ? <AlertTriangle className="h-3 w-3 text-amber-500" /> : null}
                                                                        {info?.nome || action}
                                                                    </button>
                                                                );
                                                            })}
                                                            {!specialActions(module.acoesDisponiveis).length && <span className="text-xs text-muted-foreground">—</span>}
                                                        </div>
                                                    </td>
                                                    {!readOnly && (
                                                        <td className="px-2 text-center">
                                                            <button type="button" onClick={() => onSetMany(row, !rowOn)} className="rounded-md px-2 py-1 text-[11px] font-bold text-primary hover:bg-primary/10">{rowOn ? 'Nenhuma' : 'Todas'}</button>
                                                        </td>
                                                    )}
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </section>
                );
            })}
        </div>
    );
}

export function LegendaPermissoes({ showOrigin }: { showOrigin?: boolean }) {
    const item = (box: string, label: string, inner?: React.ReactNode) => (
        <span className="flex items-center gap-1.5"><span className={cn('flex h-4 w-4 items-center justify-center rounded border-2', box)}>{inner}</span>{label}</span>
    );
    return (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
            {item('border-primary bg-primary text-primary-foreground', 'Ativa', <Check className="h-3 w-3" strokeWidth={3} />)}
            {item('border-amber-500 bg-amber-500 text-white', 'Ativa e crítica', <Check className="h-3 w-3" strokeWidth={3} />)}
            {showOrigin && item('border-emerald-600 bg-emerald-600 text-white', 'Exceção concedida', <Check className="h-3 w-3" strokeWidth={3} />)}
            {showOrigin && item('border-red-500 bg-red-50 text-red-600', 'Exceção revogada', <Minus className="h-3 w-3" strokeWidth={3} />)}
            {item('border-slate-300', 'Inativa')}
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-sky-500" />Alterada (por guardar)</span>
            <span className="flex items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5 text-amber-500" />Ação crítica</span>
        </div>
    );
}
