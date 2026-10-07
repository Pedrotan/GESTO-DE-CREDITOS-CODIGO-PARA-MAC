import { useMemo, useState, type ReactNode } from 'react';
import { AlertOctagon, CalendarClock, Check, Clock3, Loader2, ShieldAlert, Timer, X } from 'lucide-react';
import { Button } from '@/componentes/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/componentes/ui/dialog';
import { activeExceptions, formatKz, OPERATION_LABELS } from '@/bibliotecas/alcadas';
import { formatLuandaDateTime } from '@/bibliotecas/fuso-angola';
import { ServicoAlcadas, type PolicyVersion } from '@/servicos/ServicoAlcadas';
import { JustificationField } from './campos';
import type { AlcadasState } from './useAlcadas';

/** Diálogo de decisão (aprovar/rejeitar/terminar) com motivo validado. */
export function DialogoDecisao({ open, title, description, confirmLabel, destructive, userId, onClose, onConfirm, children }: {
    open: boolean; title: string; description?: string; confirmLabel: string; destructive?: boolean; userId?: string | null;
    onClose: () => void; onConfirm: (reason: string) => Promise<void>; children?: ReactNode;
}) {
    const [reason, setReason] = useState('');
    const [valid, setValid] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const close = () => { if (busy) return; setReason(''); setError(''); onClose(); };
    return (
        <Dialog open={open} onOpenChange={value => { if (!value) close(); }}>
            <DialogContent className="max-w-xl">
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                    {description && <DialogDescription>{description}</DialogDescription>}
                </DialogHeader>
                {children}
                <JustificationField value={reason} onChange={setReason} userId={userId} onValidity={setValid} />
                {error && <p className="rounded-md bg-destructive/10 p-2 text-sm text-destructive">{error}</p>}
                <DialogFooter>
                    <Button variant="outline" onClick={close} disabled={busy}>Cancelar</Button>
                    <Button variant={destructive ? 'destructive' : 'default'} disabled={busy || !valid} onClick={async () => {
                        setBusy(true); setError('');
                        try { await onConfirm(reason.trim()); setReason(''); onClose(); }
                        catch (cause: any) { setError(cause?.message || 'Não foi possível concluir.'); }
                        finally { setBusy(false); }
                    }}>{busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}{confirmLabel}</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

/** Quando cada perfil ficou desativado (versão aprovada que o desativou), para o aviso permanente. */
function disabledSince(versions: PolicyVersion[], profileId: string) {
    const approved = versions.filter(item => item.status === 'approved' && new Date(item.effectiveFrom).getTime() <= Date.now())
        .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom) || a.version - b.version);
    let since: PolicyVersion | null = null;
    for (const version of approved) {
        const disabled = version.policy.profiles[profileId]?.enabled === false;
        if (disabled && !since) since = version;
        if (!disabled) since = null;
    }
    return since;
}

export function AvisosAlcadas({ state, onOpenExceptions }: { state: AlcadasState; onOpenExceptions: () => void }) {
    const [deciding, setDeciding] = useState<{ version: PolicyVersion; approve: boolean } | null>(null);
    const data = state.data;
    const pending = useMemo(() => (data?.versions || []).filter(item => item.status === 'pending'), [data]);
    const scheduled = useMemo(() => (data?.versions || []).filter(item => item.status === 'approved' && new Date(item.effectiveFrom).getTime() > state.now.getTime()), [data, state.now]);
    const active = useMemo(() => activeExceptions(data?.exceptions || [], state.now), [data, state.now]);
    const pendingExceptions = (data?.exceptions || []).filter(item => item.status === 'pending');
    if (!data || !state.policy) return null;
    const disabled = state.summary?.disabled || [];
    return (
        <div className="space-y-3">
            {disabled.map(profile => {
                const since = disabledSince(data.versions, profile.profileId);
                return (
                    <div key={profile.profileId} role="alert" className="flex gap-3 rounded-xl border-2 border-red-500/60 bg-red-50 p-4 text-red-900 shadow-sm dark:bg-red-950/40 dark:text-red-200">
                        <AlertOctagon className="h-6 w-6 shrink-0 text-red-600" />
                        <div className="space-y-0.5 text-sm">
                            <p className="font-black uppercase tracking-wide">Limites desativados — {state.profileName(profile.profileId)}</p>
                            <p>Os limites deste perfil não estão a ser aplicados. Continuam em vigor os limites globais da empresa e a dupla aprovação acima do nível máximo.</p>
                            {since && <p className="text-xs opacity-80">Desde {formatLuandaDateTime(since.effectiveFrom)} · proposto por {since.createdByName}{since.decidedByName ? ` · aprovado por ${since.decidedByName}` : ''} · motivo: “{since.reason}”</p>}
                        </div>
                    </div>
                );
            })}
            {pending.map(version => {
                const mine = version.createdBy === state.user?.id;
                return (
                    <div key={version.id} className="flex flex-col gap-3 rounded-xl border border-amber-400/60 bg-amber-50 p-4 text-amber-950 dark:bg-amber-950/30 dark:text-amber-100 md:flex-row md:items-center">
                        <ShieldAlert className="h-6 w-6 shrink-0 text-amber-600" />
                        <div className="min-w-0 flex-1 space-y-0.5 text-sm">
                            <p className="font-bold">Versão {version.version} à espera de um segundo administrador</p>
                            <p className="text-xs">Proposta por {version.createdByName} em {formatLuandaDateTime(version.createdAt)} · {version.summary.length} alteração(ões) · motivo: “{version.reason}”</p>
                            <ul className="list-disc pl-5 text-xs">{version.secondApprovalReasons.slice(0, 3).map(reason => <li key={reason}>{reason}</li>)}</ul>
                        </div>
                        {state.isAdmin && !mine ? (
                            <div className="flex shrink-0 gap-2">
                                <Button size="sm" variant="outline" className="gap-1" onClick={() => setDeciding({ version, approve: false })}><X className="h-4 w-4" /> Rejeitar</Button>
                                <Button size="sm" className="gap-1" onClick={() => setDeciding({ version, approve: true })}><Check className="h-4 w-4" /> Aprovar</Button>
                            </div>
                        ) : <p className="shrink-0 text-xs font-semibold">{mine ? 'Proposta sua: outro administrador tem de aprovar.' : 'Só um administrador pode aprovar.'}</p>}
                    </div>
                );
            })}
            {scheduled.map(version => (
                <div key={version.id} className="flex items-center gap-3 rounded-xl border border-sky-300/60 bg-sky-50 p-3 text-sm text-sky-950 dark:bg-sky-950/30 dark:text-sky-100">
                    <CalendarClock className="h-5 w-5 shrink-0 text-sky-600" />
                    <p><strong>Versão {version.version}</strong> entra em vigor a <strong>{formatLuandaDateTime(version.effectiveFrom)}</strong> ({version.summary.length} alteração(ões), por {version.createdByName}).</p>
                </div>
            ))}
            {(active.length > 0 || pendingExceptions.length > 0) && (
                <div className="rounded-xl border bg-card p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                        <p className="flex items-center gap-2 text-sm font-bold"><Timer className="h-4 w-4 text-emerald-600" /> Exceções temporárias ativas ({active.length})
                            {pendingExceptions.length > 0 && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">{pendingExceptions.length} por aprovar</span>}</p>
                        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onOpenExceptions}>Ver todas</Button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {active.map(item => (
                            <span key={item.id} className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1 text-xs text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
                                <Clock3 className="h-3.5 w-3.5" /><strong>{item.userName}</strong> · {OPERATION_LABELS[item.operationType]}
                                {item.perOperationMinor != null && <> · {formatKz(item.perOperationMinor)}</>} · até {formatLuandaDateTime(item.endsAt)}
                            </span>
                        ))}
                        {!active.length && <span className="text-xs text-muted-foreground">Nenhuma exceção ativa neste momento.</span>}
                    </div>
                </div>
            )}
            <DialogoDecisao open={!!deciding} userId={state.user?.id}
                title={deciding?.approve ? `Aprovar a versão ${deciding?.version.version}` : `Rejeitar a versão ${deciding?.version.version}`}
                description={deciding ? `Proposta por ${deciding.version.createdByName}. A decisão fica registada na Auditoria com gravidade Alta.` : undefined}
                confirmLabel={deciding?.approve ? 'Aprovar alteração' : 'Rejeitar alteração'} destructive={!deciding?.approve}
                onClose={() => setDeciding(null)}
                onConfirm={async reason => {
                    if (!deciding || !state.actor) return;
                    await ServicoAlcadas.decideVersion(deciding.version.id, deciding.approve, reason, state.actor);
                    await state.reload({ resetDraft: !state.dirty });
                }}>
                {deciding && <ul className="max-h-48 space-y-1 overflow-y-auto rounded-md border bg-muted/40 p-3 text-xs">{deciding.version.summary.map(line => <li key={line}>{line}</li>)}</ul>}
            </DialogoDecisao>
        </div>
    );
}
