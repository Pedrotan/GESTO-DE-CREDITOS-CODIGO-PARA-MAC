import { useEffect, useState } from 'react';
import { AlertTriangle, ArrowRight, CalendarClock, Loader2, Save, ShieldAlert, Sparkles, TrendingUp, Undo2, UsersRound } from 'lucide-react';
import { cn } from '@/bibliotecas/utils';
import { Button } from '@/componentes/ui/button';
import { Input } from '@/componentes/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/componentes/ui/dialog';
import { formatKz, simulateImpact } from '@/bibliotecas/alcadas';
import { formatLuandaDate, luandaDateKey, luandaToUtc } from '@/bibliotecas/fuso-angola';
import { ServicoAlcadas } from '@/servicos/ServicoAlcadas';
import { JustificationField } from './campos';
import type { AlcadasState } from './useAlcadas';

type Impact = ReturnType<typeof simulateImpact>;

/** Barra inferior fixa enquanto há alterações por guardar. */
export function BarraAlteracoes({ state, onSave }: { state: AlcadasState; onSave: () => void }) {
    if (!state.dirty) return null;
    return (
        <div className="sticky bottom-3 z-30 mt-6 animate-fade-in">
            <div className="flex flex-col gap-3 rounded-2xl border-2 border-primary/40 bg-card/95 p-3 shadow-2xl backdrop-blur md:flex-row md:items-center">
                <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold">{state.changes.length} alteração(ões) por guardar
                        {state.second.required && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:bg-amber-900/50 dark:text-amber-200">exige 2.º administrador</span>}
                        {state.issues.length > 0 && <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-800 dark:bg-red-900/50 dark:text-red-200">{state.issues.length} incoerência(s)</span>}</p>
                    <p className="truncate text-xs text-muted-foreground" title={state.changes.map(change => `${change.label}: ${change.before} → ${change.after}`).join('\n')}>
                        {state.changes.slice(0, 2).map(change => `${change.label}: ${change.before} → ${change.after}`).join(' · ')}{state.changes.length > 2 ? ` · e mais ${state.changes.length - 2}` : ''}
                    </p>
                </div>
                <div className="flex shrink-0 gap-2">
                    <Button variant="outline" className="gap-1.5" onClick={state.discard}><Undo2 className="h-4 w-4" /> Cancelar</Button>
                    <Button className="gap-1.5" disabled={state.issues.length > 0 || !state.canEdit} onClick={onSave} title={state.issues.length ? 'Corrija as incoerências antes de guardar' : undefined}><Save className="h-4 w-4" /> Guardar alterações</Button>
                </div>
            </div>
        </div>
    );
}

export function ModalGuardarLimites({ state, open, onClose, onSaved }: { state: AlcadasState; open: boolean; onClose: () => void; onSaved: (message: { title: string; description: string; pending: boolean }) => void }) {
    const [reason, setReason] = useState('');
    const [valid, setValid] = useState(false);
    const [when, setWhen] = useState<'now' | 'scheduled'>('now');
    const [date, setDate] = useState('');
    const [impact, setImpact] = useState<Impact | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!open || !state.policy || !state.draft || !state.data) return;
        setImpact(null); setError('');
        let cancelled = false;
        void ServicoAlcadas.recentOperations(state.data.users).then(operations => {
            if (cancelled) return;
            setImpact(simulateImpact({ before: state.policy!, after: state.draft!, operations, ledger: state.data!.ledger,
                users: state.data!.users.map(user => ({ id: user.id, name: user.name, role: user.role, branchId: user.branchId || null })) }));
        }).catch(() => setImpact(null));
        return () => { cancelled = true; };
    }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

    const save = async () => {
        if (!state.draft || !state.actor) return;
        if (when === 'scheduled' && !date) { setError('Escolha a data de entrada em vigor.'); return; }
        setBusy(true); setError('');
        try {
            const effectiveFrom = when === 'scheduled' ? luandaToUtc(date).toISOString() : null;
            const result = await ServicoAlcadas.propose({ policy: state.draft, reason: reason.trim(), effectiveFrom, actor: state.actor, profileName: state.profileName });
            await state.reload({ resetDraft: true });
            setReason('');
            onSaved(result.status === 'pending'
                ? { pending: true, title: 'Alteração enviada para aprovação', description: `A versão ${result.version} fica pendente até um segundo administrador aprovar (${result.second.reasons.length} motivo(s)). Os administradores foram notificados.` }
                : { pending: false, title: effectiveFrom ? 'Alteração agendada' : 'Limites atualizados', description: effectiveFrom ? `A versão ${result.version} entra em vigor a ${formatLuandaDate(effectiveFrom)} às 00:00 (hora de Angola).` : `A versão ${result.version} está em vigor. Ficou registada na Auditoria com gravidade Alta.` });
            onClose();
        } catch (cause: any) { setError(cause?.message || 'Não foi possível guardar.'); } finally { setBusy(false); }
    };

    const groups = [
        { kind: 'profile', title: 'Limites por perfil' }, { kind: 'chain', title: 'Cadeia de aprovação' }, { kind: 'override', title: 'Limites individuais' },
        { kind: 'global', title: 'Limites globais' }, { kind: 'risk', title: 'Regras por risco' }, { kind: 'governance', title: 'Governação' },
    ] as const;

    return (
        <Dialog open={open} onOpenChange={value => { if (!value && !busy) onClose(); }}>
            <DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2"><Save className="h-5 w-5 text-primary" /> Guardar alterações aos limites</DialogTitle>
                    <DialogDescription>Reveja as diferenças e o impacto antes de confirmar. A alteração fica registada na Auditoria com gravidade Alta e no histórico de versões.</DialogDescription>
                </DialogHeader>

                <section className="space-y-2">
                    <h4 className="text-sm font-bold">Resumo das diferenças ({state.changes.length})</h4>
                    <div className="max-h-64 space-y-3 overflow-y-auto rounded-xl border bg-muted/30 p-3">
                        {groups.map(group => {
                            const items = state.changes.filter(change => change.kind === group.kind);
                            if (!items.length) return null;
                            return (
                                <div key={group.kind}>
                                    <p className="mb-1 text-[11px] font-black uppercase tracking-wide text-muted-foreground">{group.title}</p>
                                    <ul className="space-y-1">{items.map(change => (
                                        <li key={change.path} className="flex flex-wrap items-center gap-1.5 text-sm">
                                            <span className="font-medium">{change.label}:</span>
                                            <span className="text-red-700 line-through decoration-red-400/60 dark:text-red-300">{change.before}</span>
                                            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                                            <strong className="text-emerald-700 dark:text-emerald-300">{change.after}</strong>
                                            {change.disables && <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-800 dark:bg-red-900/50 dark:text-red-200">desativação</span>}
                                            {change.increasePct !== null && <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800 dark:bg-amber-900/50 dark:text-amber-200">{change.increasePct === Infinity ? 'novo teto / sem teto' : `+${String(change.increasePct).replace('.', ',')}%`}</span>}
                                        </li>
                                    ))}</ul>
                                </div>
                            );
                        })}
                    </div>
                </section>

                {state.second.required && (
                    <div className="flex gap-3 rounded-xl border border-amber-400 bg-amber-50 p-3 text-sm text-amber-950 dark:bg-amber-950/30 dark:text-amber-100">
                        <ShieldAlert className="h-5 w-5 shrink-0 text-amber-600" />
                        <div><p className="font-bold">Exige a aprovação de um segundo administrador</p>
                            <p className="text-xs">Aumentos acima de {state.policy?.governance.secondApprovalIncreasePct}% ou desativações. Até lá continuam em vigor os limites atuais.</p>
                            <ul className="mt-1 list-disc pl-5 text-xs">{state.second.reasons.slice(0, 5).map(item => <li key={item}>{item}</li>)}</ul></div>
                    </div>
                )}

                <section className="space-y-2">
                    <h4 className="flex items-center gap-2 text-sm font-bold"><Sparkles className="h-4 w-4 text-primary" /> Simulação do impacto (últimos 30 dias)</h4>
                    {!impact ? <p className="flex items-center gap-2 rounded-xl border p-3 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> A reavaliar as operações dos últimos 30 dias…</p> : (
                        <div className="space-y-3 rounded-xl border p-3">
                            <div className="grid gap-2 sm:grid-cols-3">
                                {[
                                    { label: 'Aprovadas diretamente', before: impact.approvedBefore, after: impact.approvedAfter, css: 'text-emerald-700 dark:text-emerald-300' },
                                    { label: 'Escaladas', before: impact.escalatedBefore, after: impact.escalatedAfter, css: 'text-amber-700 dark:text-amber-300' },
                                    { label: 'Bloqueadas', before: 0, after: impact.blockedAfter, css: 'text-red-700 dark:text-red-300' },
                                ].map(item => (
                                    <div key={item.label} className="rounded-lg bg-muted/40 p-2.5">
                                        <p className="text-[11px] font-semibold text-muted-foreground">{item.label}</p>
                                        <p className={cn('text-lg font-black', item.css)}>{item.before} <ArrowRight className="inline h-4 w-4" /> {item.after}</p>
                                    </div>
                                ))}
                            </div>
                            <p className="text-xs text-muted-foreground">{impact.total} operação(ões) dos últimos 30 dias reavaliadas com os valores atuais e com os novos (só pelo valor, nível e risco).</p>
                            {impact.changed.length > 0 && (
                                <details><summary className="cursor-pointer text-xs font-semibold text-primary">{impact.changed.length} operação(ões) mudariam de resultado</summary>
                                    <ul className="mt-1 max-h-32 space-y-0.5 overflow-y-auto text-xs">{impact.changed.map(item => <li key={item.id}>{item.label}: {item.before} → <strong>{item.after}</strong></li>)}</ul></details>
                            )}
                            <div>
                                <p className="flex items-center gap-1.5 text-xs font-bold"><UsersRound className="h-3.5 w-3.5" /> Utilizadores que já ultrapassaram hoje o novo limite diário</p>
                                {impact.overToday.length ? (
                                    <ul className="mt-1 space-y-0.5 text-xs">{impact.overToday.map(item => (
                                        <li key={`${item.userId}-${item.operation}`} className="flex items-center gap-1.5 text-red-700 dark:text-red-300"><TrendingUp className="h-3.5 w-3.5" /> {item.userName} — {item.operation}: {formatKz(item.usedMinor)} usados, novo limite {formatKz(item.limitMinor)}</li>
                                    ))}</ul>
                                ) : <p className="mt-1 text-xs text-muted-foreground">Nenhum.</p>}
                            </div>
                        </div>
                    )}
                </section>

                <section className="space-y-2">
                    <h4 className="flex items-center gap-2 text-sm font-bold"><CalendarClock className="h-4 w-4 text-primary" /> Entrada em vigor</h4>
                    <div className="flex flex-wrap items-center gap-2">
                        {(['now', 'scheduled'] as const).map(option => (
                            <button key={option} type="button" onClick={() => setWhen(option)} className={cn('rounded-lg border px-3 py-2 text-sm font-semibold', when === option ? 'border-primary bg-primary/10 text-primary' : 'hover:bg-muted')}>
                                {option === 'now' ? 'Imediata' : 'Agendada'}
                            </button>
                        ))}
                        {when === 'scheduled' && <Input type="date" className="h-10 w-48" value={date} min={luandaDateKey(new Date(Date.now() + 86_400_000))} onChange={event => setDate(event.target.value)} aria-label="Data de entrada em vigor" />}
                        {when === 'scheduled' && date && <span className="text-xs text-muted-foreground">A partir de {date.split('-').reverse().join('/')} às 00:00 (hora de Angola).</span>}
                    </div>
                </section>

                <JustificationField value={reason} onChange={setReason} userId={state.user?.id} onValidity={setValid} />
                {error && <p className="flex items-start gap-2 whitespace-pre-line rounded-md bg-destructive/10 p-2 text-sm text-destructive"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{error}</p>}

                <DialogFooter>
                    <Button variant="outline" disabled={busy} onClick={onClose}>Cancelar</Button>
                    <Button disabled={busy || !valid || state.issues.length > 0} onClick={() => void save()} className="gap-1.5">
                        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Guardar alterações
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
