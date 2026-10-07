import { useMemo, useState } from 'react';
import { AlertTriangle, Ban, Info, Lock, Plus, Unlock } from 'lucide-react';
import { cn } from '@/bibliotecas/utils';
import { Switch } from '@/componentes/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/componentes/ui/select';
import { FIELD_LABELS, OPERATION_TYPES, SCOPE_LABELS, isMoneyField, levelIndexOfProfile, type LimitField, type LimitScope, type LimitValues, type OperationType } from '@/bibliotecas/alcadas';
import { MoneyCell, NumberCell } from './campos';
import type { AlcadasState } from './useAlcadas';
import { levelStyle } from './estilos-niveis';

const SHORT: Record<LimitField, string> = {
    perOperationMinor: 'Por operação', dailyMinor: 'Diário', monthlyMinor: 'Mensal', perOperationCount: 'Registos/export.', dailyCount: 'Qtd./dia', maxPercent: '% máx.',
};

export function TabelaLimitesPerfil({ state }: { state: AlcadasState }) {
    const [focus, setFocus] = useState<OperationType | 'all'>('all');
    const draft = state.draft!;
    const base = state.policy!;
    const ops = OPERATION_TYPES.filter(op => focus === 'all' || op.id === focus);
    const rows = useMemo(() => [...state.profiles].sort((a, b) => {
        const la = levelIndexOfProfile(draft, a.id), lb = levelIndexOfProfile(draft, b.id);
        const ra = la < 0 ? 99 : la, rb = lb < 0 ? 99 : lb;
        return ra - rb || Number(!draft.profiles[a.id]) - Number(!draft.profiles[b.id]) || a.name.localeCompare(b.name);
    }), [state.profiles, draft]);

    const ensure = (policy: typeof draft, profileId: string) => (policy.profiles[profileId] ||= { profileId, enabled: true, scope: 'user', ops: {} });
    const updateOp = (profileId: string, op: OperationType, patch: Partial<LimitValues>) => state.setDraft(policy => {
        const profile = ensure(policy, profileId);
        profile.ops[op] = { ...(profile.ops[op] || { allowed: true }), ...patch } as LimitValues;
        return policy;
    });
    const allowOp = (profileId: string, op: OperationType, allowed: boolean) => state.setDraft(policy => {
        const profile = ensure(policy, profileId);
        const previous = base.profiles[profileId]?.ops[op];
        profile.ops[op] = allowed
            ? (previous?.allowed ? { ...previous } : { allowed: true, perOperationMinor: op === 'client_export' ? undefined : 0, dailyMinor: null, monthlyMinor: null, ...(op === 'client_export' ? { perOperationCount: 0, dailyCount: 1 } : {}) })
            : { ...(profile.ops[op] || {}), allowed: false } as LimitValues;
        return policy;
    });
    const changed = (profileId: string, op: OperationType, field: LimitField) => {
        const a = base.profiles[profileId]?.ops[op], b = draft.profiles[profileId]?.ops[op];
        return Boolean(a?.allowed) !== Boolean(b?.allowed) || (b?.allowed && (a?.[field] ?? null) !== (b?.[field] ?? null));
    };

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => setFocus('all')} className={cn('rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors', focus === 'all' ? 'border-primary bg-primary text-primary-foreground' : 'bg-card hover:bg-muted')}>Todas as operações</button>
                {OPERATION_TYPES.map(op => (
                    <button key={op.id} type="button" title={op.rule} onClick={() => setFocus(op.id)}
                        className={cn('rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors', focus === op.id ? 'border-primary bg-primary text-primary-foreground' : 'bg-card hover:bg-muted')}>{op.short}</button>
                ))}
            </div>

            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 rounded-lg border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5"><Info className="h-3.5 w-3.5 text-primary" /> Volume <strong>diário</strong>: dia civil, 00:00–23:59 (hora de Angola). <strong>Mensal</strong>: do dia 1 ao último dia do mês.</span>
                <span className="flex items-center gap-1.5"><Ban className="h-3.5 w-3.5" /> Sem limite definido = operação <strong>bloqueada</strong> por defeito.</span>
                <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-sky-200 dark:bg-sky-900" /> Alterado e por guardar</span>
                <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm border border-red-500 bg-red-50 dark:bg-red-950" /> Incoerente</span>
            </div>

            {state.issues.length > 0 && (
                <div role="alert" className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
                    <p className="mb-1 flex items-center gap-2 font-bold"><AlertTriangle className="h-4 w-4" /> {state.issues.length} incoerência(s) a corrigir antes de guardar</p>
                    <ul className="list-disc space-y-0.5 pl-6 text-xs">{state.issues.slice(0, 8).map(issue => <li key={issue.path + issue.message}>{issue.message}</li>)}</ul>
                    {state.issues.length > 8 && <p className="mt-1 text-xs">… e mais {state.issues.length - 8}.</p>}
                </div>
            )}

            <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
                <table className="w-full border-separate border-spacing-0 text-sm">
                    <thead>
                        <tr className="bg-muted/60 text-xs">
                            <th rowSpan={2} className="z-20 min-w-[230px] border-b border-r bg-muted md:sticky md:left-0 md:min-w-[270px] px-3 py-2 text-left font-bold uppercase tracking-wide text-muted-foreground">Perfil · nível · âmbito</th>
                            {ops.map(op => <th key={op.id} colSpan={op.fields.length + 1} title={op.rule} className="border-b border-r px-2 py-2 text-center font-bold text-foreground">{op.label}</th>)}
                        </tr>
                        <tr className="bg-muted/40 text-[11px] text-muted-foreground">
                            {ops.flatMap(op => [
                                <th key={`${op.id}-allow`} className="border-b px-2 py-1.5 text-center font-semibold">Estado</th>,
                                ...op.fields.map(field => <th key={`${op.id}-${field}`} className={cn('border-b px-2 py-1.5 text-right font-semibold', field === op.fields[op.fields.length - 1] && 'border-r')}>{SHORT[field]}</th>),
                            ])}
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map(profileInfo => {
                            const profile = draft.profiles[profileInfo.id];
                            const level = levelIndexOfProfile(draft, profileInfo.id);
                            const style = levelStyle(level);
                            const users = (state.data?.users || []).filter(user => user.role === profileInfo.id).length;
                            return (
                                <tr key={profileInfo.id} className={cn('group align-top', profile?.enabled === false && 'bg-red-50/60 dark:bg-red-950/20')}>
                                    <td className={cn('z-10 border-b border-l-4 border-r bg-card px-3 py-2.5 group-hover:bg-muted/40 md:sticky md:left-0', style.accent)}>
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="min-w-0">
                                                <p className="truncate font-bold" title={profileInfo.name}>{profileInfo.name}</p>
                                                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                                    <span className={cn('rounded-full border px-2 py-0.5 text-[10px] font-bold', style.badge)}>{level >= 0 ? draft.chain.levels[level].name : 'Fora da cadeia'}</span>
                                                    <span className="text-[10px] text-muted-foreground">{users} utilizador(es)</span>
                                                </div>
                                            </div>
                                            {profile && (
                                                <label className={cn('flex shrink-0 items-center gap-1.5 rounded-lg border px-2 py-1', profile.enabled === false ? 'border-red-400 bg-red-100 dark:bg-red-950' : 'bg-muted/40')}>
                                                    <span className={cn('text-[10px] font-black tracking-wider', profile.enabled === false ? 'text-red-700 dark:text-red-300' : 'text-emerald-700 dark:text-emerald-400')}>{profile.enabled === false ? 'DESATIVADO' : 'ATIVADO'}</span>
                                                    <Switch checked={profile.enabled !== false} aria-label={`Limites de ${profileInfo.name}`}
                                                        onCheckedChange={value => state.setDraft(policy => { ensure(policy, profileInfo.id).enabled = value; return policy; })} />
                                                </label>
                                            )}
                                        </div>
                                        {profile ? (
                                            <div className="mt-2">
                                                <Select value={profile.scope} onValueChange={value => state.setDraft(policy => { ensure(policy, profileInfo.id).scope = value as LimitScope; return policy; })}>
                                                    <SelectTrigger className="h-8 text-xs" aria-label={`Âmbito de ${profileInfo.name}`}><SelectValue /></SelectTrigger>
                                                    <SelectContent>{(Object.keys(SCOPE_LABELS) as LimitScope[]).map(scope => <SelectItem key={scope} value={scope}>{SCOPE_LABELS[scope]}</SelectItem>)}</SelectContent>
                                                </Select>
                                                {profile.enabled === false && <p className="mt-1 text-[10px] font-semibold text-red-700 dark:text-red-300">Desativar exige um segundo administrador.</p>}
                                            </div>
                                        ) : (
                                            <button type="button" onClick={() => state.setDraft(policy => { ensure(policy, profileInfo.id); return policy; })}
                                                className="mt-2 inline-flex items-center gap-1 rounded-md border border-dashed px-2 py-1 text-[11px] font-semibold text-primary hover:bg-primary/5">
                                                <Plus className="h-3 w-3" /> Definir limites (hoje tudo bloqueado)
                                            </button>
                                        )}
                                    </td>
                                    {ops.flatMap(op => {
                                        const values = profile?.ops[op.id];
                                        const allowed = Boolean(values?.allowed);
                                        const cells = [
                                            <td key={`${op.id}-allow`} className="border-b px-2 py-2.5 text-center">
                                                <button type="button" disabled={!profile} onClick={() => allowOp(profileInfo.id, op.id, !allowed)}
                                                    title={allowed ? 'Clique para bloquear esta operação' : 'Clique para permitir e definir os limites'}
                                                    className={cn('inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-bold transition-colors disabled:opacity-40',
                                                        allowed ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-200' : 'bg-slate-200 text-slate-700 hover:bg-slate-300 dark:bg-slate-800 dark:text-slate-300',
                                                        changed(profileInfo.id, op.id, op.fields[0]) && Boolean(base.profiles[profileInfo.id]?.ops[op.id]?.allowed) !== allowed && 'ring-2 ring-sky-400')}>
                                                    {allowed ? <Unlock className="h-3 w-3" /> : <Lock className="h-3 w-3" />}{allowed ? 'Permitida' : 'Bloqueada'}
                                                </button>
                                            </td>,
                                        ];
                                        for (const field of op.fields) {
                                            const path = `${profileInfo.id}.${op.id}.${field}`;
                                            const invalid = state.issueByPath.get(path) || null;
                                            const last = field === op.fields[op.fields.length - 1];
                                            cells.push(
                                                <td key={`${op.id}-${field}`} className={cn('border-b px-1.5 py-2', last && 'border-r', allowed && changed(profileInfo.id, op.id, field) && 'bg-sky-50 dark:bg-sky-950/30')}>
                                                    {!allowed ? <span className="block text-center text-xs text-muted-foreground">—</span>
                                                        : isMoneyField(field)
                                                            ? <MoneyCell ariaLabel={`${profileInfo.name} — ${op.label}, ${FIELD_LABELS[field]}`} value={values?.[field] as number | null} invalid={invalid}
                                                                allowEmpty={field !== 'perOperationMinor'} onChange={value => updateOp(profileInfo.id, op.id, { [field]: value })} />
                                                            : <NumberCell ariaLabel={`${profileInfo.name} — ${op.label}, ${FIELD_LABELS[field]}`} value={values?.[field] as number | null} invalid={invalid}
                                                                suffix={field === 'maxPercent' ? '%' : undefined} step={field === 'maxPercent' ? 0.5 : 1} onChange={value => updateOp(profileInfo.id, op.id, { [field]: value })} />}
                                                </td>,
                                            );
                                        }
                                        return cells;
                                    })}
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
            <p className="text-xs text-muted-foreground">
                <strong>Âmbito</strong>: <em>Por utilizador</em> — cada pessoa tem o seu volume; <em>Por agência</em> — o volume é partilhado pelos utilizadores do perfil na mesma agência;
                <em> Empresa toda</em> — um só volume para todos os utilizadores do perfil. Regras de coerência: por operação ≤ diário ≤ mensal, e um nível inferior nunca acima do superior.
            </p>
        </div>
    );
}
