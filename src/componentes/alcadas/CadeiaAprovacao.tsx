import { useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, Clock, Plus, Route, ShieldAlert, Trash2, Users2, X } from 'lucide-react';
import { cn } from '@/bibliotecas/utils';
import { Button } from '@/componentes/ui/button';
import { Input } from '@/componentes/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/componentes/ui/select';
import { formatKz, levelAmount, requiredLevelFor, type LimitPolicy } from '@/bibliotecas/alcadas';
import { MoneyCell, NumberCell } from './campos';
import { levelStyle } from './estilos-niveis';
import type { AlcadasState } from './useAlcadas';

/** Define a alçada de crédito de um nível em todos os seus perfis (valor por operação da aprovação de crédito). */
function setLevelAmount(policy: LimitPolicy, index: number, amount: number) {
    for (const id of policy.chain.levels[index].profileIds) {
        const profile = (policy.profiles[id] ||= { profileId: id, enabled: true, scope: 'user', ops: {} });
        profile.ops.credit_approval = { ...(profile.ops.credit_approval || { dailyMinor: null, monthlyMinor: null }), allowed: true, perOperationMinor: amount };
    }
    return policy;
}

export function CadeiaAprovacao({ state }: { state: AlcadasState }) {
    const draft = state.draft!;
    const levels = draft.chain.levels;
    const top = levels.length - 1;
    const used = new Set(levels.flatMap(level => level.profileIds));
    const available = state.profiles.filter(profile => !used.has(profile.id));
    const [test, setTest] = useState<{ amount: number | null; risk: string; effort: number | null }>({ amount: 100_000_000, risk: 'low', effort: null });
    const routed = test.amount != null ? requiredLevelFor(draft, test.amount, { riskLevel: test.risk, effortRate: test.effort }) : null;
    const move = (index: number, delta: number) => state.setDraft(policy => {
        const list = policy.chain.levels;
        const target = index + delta;
        if (target < 0 || target >= list.length) return policy;
        [list[index], list[target]] = [list[target], list[index]];
        return policy;
    });

    return (
        <div className="space-y-6">
            <section className="rounded-2xl border bg-card p-4 shadow-sm md:p-6">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                    <div>
                        <h3 className="flex items-center gap-2 text-lg font-bold"><Route className="h-5 w-5 text-primary" /> Cadeia de escalonamento</h3>
                        <p className="text-sm text-muted-foreground">Uma operação acima da alçada sobe ao nível seguinte. Acima do nível máximo, exige dupla aprovação.</p>
                    </div>
                    <Button variant="outline" size="sm" className="gap-1.5" onClick={() => state.setDraft(policy => {
                        policy.chain.levels.push({ id: `nivel-${Date.now().toString(36)}`, name: `Nível ${policy.chain.levels.length + 1}`, profileIds: [] });
                        return policy;
                    })}><Plus className="h-4 w-4" /> Adicionar nível</Button>
                </div>

                <div className="flex flex-col items-stretch gap-3 xl:flex-row xl:items-stretch">
                    {levels.map((level, index) => {
                        const style = levelStyle(index);
                        const amount = levelAmount(draft, index);
                        const below = index > 0 ? levelAmount(draft, index - 1) : 0;
                        return (
                            <div key={level.id} className="contents">
                                <div className={cn('flex min-w-0 flex-1 flex-col gap-3 rounded-xl border-2 border-l-8 bg-background p-3', style.accent)}>
                                    <div className="flex items-center justify-between gap-2">
                                        <span className={cn('rounded-full border px-2 py-0.5 text-[10px] font-black uppercase', style.badge)}>Nível {index + 1}</span>
                                        <div className="flex gap-0.5">
                                            <Button size="icon" variant="ghost" className="h-7 w-7" disabled={index === 0} title="Mover para baixo na cadeia" onClick={() => move(index, -1)}><ArrowLeft className="h-3.5 w-3.5" /></Button>
                                            <Button size="icon" variant="ghost" className="h-7 w-7" disabled={index === top} title="Mover para cima na cadeia" onClick={() => move(index, 1)}><ArrowRight className="h-3.5 w-3.5" /></Button>
                                            <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" disabled={levels.length <= 1} title="Remover nível"
                                                onClick={() => state.setDraft(policy => { policy.chain.levels.splice(index, 1); return policy; })}><Trash2 className="h-3.5 w-3.5" /></Button>
                                        </div>
                                    </div>
                                    <Input aria-label={`Nome do nível ${index + 1}`} value={level.name} className="h-9 font-bold"
                                        onChange={event => state.setDraft(policy => { policy.chain.levels[index].name = event.target.value; return policy; })} />
                                    <div>
                                        <p className="mb-1 text-[11px] font-semibold text-muted-foreground">Alçada de aprovação de crédito</p>
                                        <MoneyCell ariaLabel={`Alçada do nível ${level.name}`} allowEmpty={false} value={amount}
                                            invalid={index > 0 && amount < below ? `Menor do que o nível anterior (${formatKz(below)})` : null}
                                            onChange={value => value != null && state.setDraft(policy => setLevelAmount(policy, index, value))} />
                                        <p className="mt-1 text-[11px] text-muted-foreground">{index === 0 ? `Até ${formatKz(amount)}` : `De ${formatKz(below)} a ${formatKz(amount)}`}</p>
                                    </div>
                                    <div>
                                        <p className="mb-1 flex items-center gap-1 text-[11px] font-semibold text-muted-foreground"><Users2 className="h-3.5 w-3.5" /> Perfis deste nível</p>
                                        <div className="flex flex-wrap gap-1.5">
                                            {level.profileIds.map(id => (
                                                <span key={id} className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold', style.badge)}>
                                                    {state.profileName(id)}
                                                    <button type="button" aria-label={`Retirar ${state.profileName(id)}`} className="rounded-full hover:bg-black/10"
                                                        onClick={() => state.setDraft(policy => { policy.chain.levels[index].profileIds = policy.chain.levels[index].profileIds.filter(item => item !== id); return policy; })}><X className="h-3 w-3" /></button>
                                                </span>
                                            ))}
                                            {!level.profileIds.length && <span className="text-[11px] text-red-600">Sem perfis: ninguém pode aprovar neste nível.</span>}
                                        </div>
                                        {available.length > 0 && (
                                            <Select value="" onValueChange={id => state.setDraft(policy => { policy.chain.levels[index].profileIds.push(id); return policy; })}>
                                                <SelectTrigger className="mt-2 h-8 text-xs"><SelectValue placeholder="Adicionar perfil…" /></SelectTrigger>
                                                <SelectContent>{available.map(profile => <SelectItem key={profile.id} value={profile.id}>{profile.name}</SelectItem>)}</SelectContent>
                                            </Select>
                                        )}
                                    </div>
                                </div>
                                <div className="flex items-center justify-center text-muted-foreground" aria-hidden>
                                    <ArrowRight className="hidden h-6 w-6 xl:block" /><ArrowDown className="h-6 w-6 xl:hidden" />
                                </div>
                            </div>
                        );
                    })}
                    <div className="flex min-w-0 flex-1 flex-col justify-between gap-2 rounded-xl border-2 border-dashed border-rose-400 bg-rose-50 p-3 text-rose-950 dark:bg-rose-950/30 dark:text-rose-100">
                        <span className="w-fit rounded-full border border-rose-300 bg-rose-100 px-2 py-0.5 text-[10px] font-black uppercase text-rose-800 dark:bg-rose-900/50 dark:text-rose-200">Topo da cadeia</span>
                        <p className="flex items-center gap-2 text-base font-black"><ShieldAlert className="h-5 w-5" /> Dupla aprovação</p>
                        <p className="text-sm">Acima de <strong>{formatKz(levelAmount(draft, top))}</strong>: dois aprovadores <strong>diferentes</strong> do nível {levels[top]?.name || 'máximo'}.</p>
                        <p className="text-xs opacity-80">Também sempre no abate de crédito e quando a exposição ao cliente ou ao grupo excede o máximo.</p>
                    </div>
                </div>

                <div className="mt-5 flex flex-wrap items-center gap-3 rounded-xl bg-muted/40 p-3 text-sm">
                    <Clock className="h-5 w-5 text-primary" />
                    <span>Se ninguém decidir em</span>
                    <div className="w-24"><NumberCell ariaLabel="Horas até subir de nível" value={draft.chain.escalationHours} suffix="h" invalid={state.issueByPath.get('chain.escalationHours')}
                        onChange={value => state.setDraft(policy => { policy.chain.escalationHours = value ?? 0; return policy; })} /></div>
                    <span>horas, o pedido sobe automaticamente ao nível seguinte e os aprovadores recebem um lembrete.</span>
                </div>
            </section>

            <div className="grid gap-6 lg:grid-cols-2">
                <section className="space-y-4 rounded-2xl border bg-card p-4 shadow-sm md:p-6">
                    <div>
                        <h3 className="text-lg font-bold">Regras por risco</h3>
                        <p className="text-sm text-muted-foreground">O risco do cliente pode exigir um nível mais alto, seja qual for o valor.</p>
                    </div>
                    {([['highRiskLevelId', 'Cliente de risco Alto exige sempre'], ['mediumRiskLevelId', 'Cliente de risco Médio exige pelo menos']] as const).map(([key, label]) => (
                        <div key={key} className="grid items-center gap-2 sm:grid-cols-[1fr_200px]">
                            <span className="text-sm font-semibold">{label}</span>
                            <Select value={draft.risk[key] || 'none'} onValueChange={value => state.setDraft(policy => { policy.risk[key] = value === 'none' ? null : value; return policy; })}>
                                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">Sem regra (só o valor)</SelectItem>
                                    {levels.map(level => <SelectItem key={level.id} value={level.id}>{level.name}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                    ))}
                    <div className="grid items-center gap-2 sm:grid-cols-[1fr_200px]">
                        <span className="text-sm font-semibold">Taxa de esforço máxima</span>
                        <NumberCell ariaLabel="Taxa de esforço máxima" value={draft.risk.effortLimitPct} suffix="%" step={0.5} onChange={value => state.setDraft(policy => { policy.risk.effortLimitPct = value ?? 0; return policy; })} />
                    </div>
                    <div className="grid items-center gap-2 sm:grid-cols-[1fr_200px]">
                        <span className="text-sm font-semibold">Acima dela, sobe</span>
                        <Select value={String(draft.risk.effortBumpLevels)} onValueChange={value => state.setDraft(policy => { policy.risk.effortBumpLevels = Number(value); return policy; })}>
                            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                            <SelectContent>{[0, 1, 2].map(value => <SelectItem key={value} value={String(value)}>{value === 0 ? 'Não sobe' : `${value} nível${value > 1 ? 'is' : ''}`}</SelectItem>)}</SelectContent>
                        </Select>
                    </div>
                </section>

                <section className="space-y-4 rounded-2xl border bg-card p-4 shadow-sm md:p-6">
                    <div>
                        <h3 className="text-lg font-bold">Testar a cadeia</h3>
                        <p className="text-sm text-muted-foreground">Veja para onde vai um crédito com os valores em edição.</p>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-3">
                        <div className="sm:col-span-1"><p className="mb-1 text-xs font-semibold">Valor</p><MoneyCell ariaLabel="Valor de teste" allowEmpty value={test.amount} onChange={amount => setTest(previous => ({ ...previous, amount }))} /></div>
                        <div><p className="mb-1 text-xs font-semibold">Risco do cliente</p>
                            <Select value={test.risk} onValueChange={risk => setTest(previous => ({ ...previous, risk }))}>
                                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                                <SelectContent><SelectItem value="low">Baixo</SelectItem><SelectItem value="medium">Médio</SelectItem><SelectItem value="high">Alto</SelectItem></SelectContent>
                            </Select>
                        </div>
                        <div><p className="mb-1 text-xs font-semibold">Taxa de esforço</p><NumberCell ariaLabel="Taxa de esforço de teste" value={test.effort} suffix="%" step={0.5} onChange={effort => setTest(previous => ({ ...previous, effort }))} /></div>
                    </div>
                    {routed && (
                        <div className={cn('rounded-xl border-2 p-3', routed.dual ? 'border-rose-400 bg-rose-50 dark:bg-rose-950/30' : 'border-primary/40 bg-primary/5')}>
                            <p className="text-sm">Requer: <strong className="text-base">{routed.name}</strong></p>
                            {routed.reasons.length > 0 && <ul className="mt-1 list-disc pl-5 text-xs text-muted-foreground">{routed.reasons.map(reason => <li key={reason}>{reason}</li>)}</ul>}
                        </div>
                    )}
                </section>
            </div>
        </div>
    );
}
