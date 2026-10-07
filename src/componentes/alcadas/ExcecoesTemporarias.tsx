import { useMemo, useState } from 'react';
import { CalendarClock, Check, History, Hourglass, Loader2, Plus, Timer, X, XCircle } from 'lucide-react';
import { cn } from '@/bibliotecas/utils';
import { Button } from '@/componentes/ui/button';
import { Input } from '@/componentes/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/componentes/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/componentes/ui/select';
import { FIELD_LABELS, OPERATION_LABELS, OPERATION_TYPES, effectiveLimit, formatLimitValue, isMoneyField, type LimitException, type LimitField, type OperationType } from '@/bibliotecas/alcadas';
import { formatLuandaDateTime, luandaDateKey, luandaParts, luandaToUtc } from '@/bibliotecas/fuso-angola';
import { ServicoAlcadas } from '@/servicos/ServicoAlcadas';
import { DialogoDecisao } from './AvisosAlcadas';
import { JustificationField, MoneyCell, NumberCell } from './campos';
import type { AlcadasState } from './useAlcadas';

const pad = (value: number) => String(value).padStart(2, '0');
/** "AAAA-MM-DDTHH:MM" na hora de Luanda (para os campos de data e hora). */
const luandaInput = (date: Date) => { const parts = luandaParts(date)!; return `${luandaDateKey(date)}T${pad(parts.hour)}:${pad(parts.minute)}`; };
const fromLuandaInput = (value: string) => {
    const [day, time = '00:00'] = value.split('T');
    const [hour, minute] = time.split(':').map(Number);
    return luandaToUtc(day, hour || 0, minute || 0).toISOString();
};
const EXCEPTION_FIELDS: Array<'perOperationMinor' | 'dailyMinor' | 'monthlyMinor' | 'dailyCount'> = ['perOperationMinor', 'dailyMinor', 'monthlyMinor', 'dailyCount'];

type Draft = { userId: string; operationType: OperationType; values: Partial<Record<LimitField, number | null>>; startsAt: string; endsAt: string; reason: string };

export function ExcecoesTemporarias({ state }: { state: AlcadasState }) {
    const users = state.data?.users || [];
    const list = useMemo(() => state.data?.exceptions || [], [state.data]);
    const now = state.now.getTime();
    const [creating, setCreating] = useState<Draft | null>(null);
    const [validReason, setValidReason] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [deciding, setDeciding] = useState<{ item: LimitException; kind: 'approve' | 'reject' | 'revoke' } | null>(null);
    const groups = useMemo(() => ({
        pending: list.filter(item => item.status === 'pending'),
        active: list.filter(item => item.status === 'approved' && new Date(item.startsAt).getTime() <= now && new Date(item.endsAt).getTime() > now),
        scheduled: list.filter(item => item.status === 'approved' && new Date(item.startsAt).getTime() > now),
        closed: list.filter(item => item.status === 'rejected' || item.status === 'revoked' || (item.status === 'approved' && new Date(item.endsAt).getTime() <= now)),
    }), [list, now]);
    const op = creating ? OPERATION_TYPES.find(item => item.id === creating.operationType)! : null;
    const targetUser = users.find(user => user.id === creating?.userId);
    const normal = targetUser && creating && state.policy ? effectiveLimit(state.policy, { id: targetUser.id, name: targetUser.name, role: targetUser.role, branchId: targetUser.branchId }, creating.operationType, []) : null;

    const submit = async () => {
        if (!creating || !targetUser || !state.actor) return;
        setBusy(true); setError('');
        try {
            await ServicoAlcadas.requestException({
                userId: targetUser.id, userName: targetUser.name, operationType: creating.operationType,
                perOperationMinor: creating.values.perOperationMinor ?? null, dailyMinor: creating.values.dailyMinor ?? null,
                monthlyMinor: creating.values.monthlyMinor ?? null, dailyCount: creating.values.dailyCount ?? null,
                startsAt: fromLuandaInput(creating.startsAt), endsAt: fromLuandaInput(creating.endsAt), reason: creating.reason.trim(),
            }, state.actor);
            setCreating(null);
            await state.reload({ silent: true });
        } catch (cause: any) { setError(cause?.message || 'Não foi possível pedir a exceção.'); } finally { setBusy(false); }
    };

    const values = (item: LimitException) => EXCEPTION_FIELDS.filter(field => item[field] != null).map(field => `${FIELD_LABELS[field]} ${formatLimitValue(field, item[field])}`).join(' · ');
    const Card = ({ item, tone }: { item: LimitException; tone: 'pending' | 'active' | 'scheduled' | 'closed' }) => {
        const start = new Date(item.startsAt).getTime(), end = new Date(item.endsAt).getTime();
        const progress = Math.min(100, Math.max(0, ((now - start) / (end - start)) * 100));
        const left = Math.max(0, end - now);
        const status = item.status === 'rejected' ? 'Rejeitada' : item.status === 'revoked' ? 'Terminada antes do prazo' : tone === 'closed' ? 'Expirada' : tone === 'pending' ? 'Por aprovar' : tone === 'scheduled' ? 'Agendada' : 'Ativa';
        return (
            <div className={cn('space-y-2 rounded-xl border bg-card p-4 shadow-sm', tone === 'active' && 'border-emerald-300 dark:border-emerald-800', tone === 'pending' && 'border-amber-300 dark:border-amber-800', tone === 'closed' && 'opacity-80')}>
                <div className="flex items-start justify-between gap-2">
                    <div><p className="font-bold">{item.userName}</p><p className="text-xs text-muted-foreground">{OPERATION_LABELS[item.operationType]}</p></div>
                    <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-black uppercase',
                        tone === 'active' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200' : tone === 'pending' ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200'
                            : tone === 'scheduled' ? 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200' : 'bg-muted text-muted-foreground')}>{status}</span>
                </div>
                <p className="text-sm font-semibold">{values(item)}</p>
                <p className="text-xs text-muted-foreground">De {formatLuandaDateTime(item.startsAt)} a <strong>{formatLuandaDateTime(item.endsAt)}</strong></p>
                {tone === 'active' && (
                    <div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full bg-emerald-500" style={{ width: `${progress}%` }} /></div>
                        <p className="mt-1 text-[11px] text-muted-foreground">Termina sozinha dentro de {left > 86_400_000 ? `${Math.floor(left / 86_400_000)} d ${Math.floor((left % 86_400_000) / 3_600_000)} h` : `${Math.floor(left / 3_600_000)} h ${Math.floor((left % 3_600_000) / 60_000)} min`}</p>
                    </div>
                )}
                <p className="text-xs"><span className="font-semibold">Motivo:</span> {item.reason}</p>
                <p className="text-[11px] text-muted-foreground">Pedido por {item.requestedByName} em {formatLuandaDateTime(item.requestedAt)}{item.decidedByName ? ` · ${item.status === 'rejected' ? 'rejeitada' : 'decidida'} por ${item.decidedByName}` : ''}{item.decisionReason ? ` — “${item.decisionReason}”` : ''}</p>
                <div className="flex flex-wrap justify-end gap-2 pt-1">
                    {tone === 'pending' && state.isAdmin && item.requestedBy !== state.user?.id && item.userId !== state.user?.id && <>
                        <Button size="sm" variant="outline" className="gap-1" onClick={() => setDeciding({ item, kind: 'reject' })}><X className="h-4 w-4" /> Rejeitar</Button>
                        <Button size="sm" className="gap-1" onClick={() => setDeciding({ item, kind: 'approve' })}><Check className="h-4 w-4" /> Aprovar</Button>
                    </>}
                    {tone === 'pending' && (item.requestedBy === state.user?.id || item.userId === state.user?.id) && <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-300">Tem de ser aprovada por outro administrador.</p>}
                    {(tone === 'active' || tone === 'scheduled') && state.canEdit && <Button size="sm" variant="outline" className="gap-1 text-destructive" onClick={() => setDeciding({ item, kind: 'revoke' })}><XCircle className="h-4 w-4" /> Terminar agora</Button>}
                </div>
            </div>
        );
    };

    const Section = ({ title, icon: Icon, items, tone, empty }: { title: string; icon: typeof Timer; items: LimitException[]; tone: 'pending' | 'active' | 'scheduled' | 'closed'; empty: string }) => (
        <section className="space-y-3">
            <h3 className="flex items-center gap-2 text-base font-bold"><Icon className="h-4 w-4 text-primary" /> {title} <span className="text-sm font-normal text-muted-foreground">({items.length})</span></h3>
            {items.length ? <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">{items.map(item => <Card key={item.id} item={item} tone={tone} />)}</div>
                : <p className="rounded-xl border border-dashed p-5 text-center text-sm text-muted-foreground">{empty}</p>}
        </section>
    );

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="max-w-3xl text-sm text-muted-foreground">Aumento temporário do limite de um utilizador (campanha, substituição de um colega), com data e hora de fim, motivo e aprovação de <strong>outro</strong> administrador. Termina sozinha na hora definida e o utilizador e o administrador são notificados.</p>
                {state.canEdit && <Button size="sm" className="gap-1.5" disabled={!users.length} onClick={() => {
                    setError('');
                    setCreating({ userId: users[0]?.id || '', operationType: 'credit_approval', values: {}, startsAt: luandaInput(new Date()), endsAt: luandaInput(new Date(Date.now() + 7 * 86_400_000)), reason: '' });
                }}><Plus className="h-4 w-4" /> Nova exceção temporária</Button>}
            </div>
            <Section title="Por aprovar" icon={Hourglass} items={groups.pending} tone="pending" empty="Nenhum pedido à espera de aprovação." />
            <Section title="Ativas" icon={Timer} items={groups.active} tone="active" empty="Nenhuma exceção ativa." />
            {groups.scheduled.length > 0 && <Section title="Agendadas" icon={CalendarClock} items={groups.scheduled} tone="scheduled" empty="" />}
            <Section title="Expiradas, terminadas e rejeitadas" icon={History} items={groups.closed.slice(0, 30)} tone="closed" empty="Ainda não há exceções terminadas." />

            <Dialog open={!!creating} onOpenChange={open => { if (!open && !busy) setCreating(null); }}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>Nova exceção temporária</DialogTitle>
                        <DialogDescription>Fica pendente até outro administrador aprovar. Os campos vazios mantêm o limite normal.</DialogDescription>
                    </DialogHeader>
                    {creating && op && (
                        <div className="space-y-4">
                            <div className="grid gap-3 sm:grid-cols-2">
                                <div><p className="mb-1 text-xs font-semibold">Utilizador</p>
                                    <Select value={creating.userId} onValueChange={userId => setCreating({ ...creating, userId })}>
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>{users.map(user => <SelectItem key={user.id} value={user.id}>{user.name} · {state.profileName(user.role)}</SelectItem>)}</SelectContent>
                                    </Select></div>
                                <div><p className="mb-1 text-xs font-semibold">Operação</p>
                                    <Select value={creating.operationType} onValueChange={value => setCreating({ ...creating, operationType: value as OperationType, values: {} })}>
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>{OPERATION_TYPES.filter(item => item.id !== 'write_off').map(item => <SelectItem key={item.id} value={item.id}>{item.label}</SelectItem>)}</SelectContent>
                                    </Select></div>
                            </div>
                            <div className="grid gap-3 sm:grid-cols-2">
                                {EXCEPTION_FIELDS.filter(field => op.fields.includes(field)).map(field => (
                                    <div key={field}>
                                        <p className="mb-1 text-xs font-semibold capitalize">{FIELD_LABELS[field]} <span className="font-normal text-muted-foreground">(normal: {normal?.allowed ? formatLimitValue(field, normal[field] as number | null) : 'bloqueada'})</span></p>
                                        {isMoneyField(field)
                                            ? <MoneyCell ariaLabel={FIELD_LABELS[field]} emptyLabel="Mantém o normal" value={creating.values[field] ?? null} onChange={value => setCreating({ ...creating, values: { ...creating.values, [field]: value } })} />
                                            : <NumberCell ariaLabel={FIELD_LABELS[field]} emptyLabel="Mantém o normal" value={creating.values[field] ?? null} onChange={value => setCreating({ ...creating, values: { ...creating.values, [field]: value } })} />}
                                    </div>
                                ))}
                            </div>
                            <div className="grid gap-3 sm:grid-cols-2">
                                <div><p className="mb-1 text-xs font-semibold">Início (hora de Angola)</p><Input type="datetime-local" value={creating.startsAt} onChange={event => setCreating({ ...creating, startsAt: event.target.value })} /></div>
                                <div><p className="mb-1 text-xs font-semibold">Fim (hora de Angola)</p><Input type="datetime-local" value={creating.endsAt} onChange={event => setCreating({ ...creating, endsAt: event.target.value })} /></div>
                            </div>
                            <JustificationField value={creating.reason} onChange={reason => setCreating({ ...creating, reason })} userId={state.user?.id} onValidity={setValidReason}
                                placeholder="Ex.: Substituição da gestora Maria Silva durante as férias, de 01/11 a 15/11." />
                            {error && <p className="rounded-md bg-destructive/10 p-2 text-sm text-destructive">{error}</p>}
                        </div>
                    )}
                    <DialogFooter>
                        <Button variant="outline" disabled={busy} onClick={() => setCreating(null)}>Cancelar</Button>
                        <Button disabled={busy || !validReason} onClick={() => void submit()}>{busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}Pedir aprovação</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <DialogoDecisao open={!!deciding} userId={state.user?.id}
                title={deciding?.kind === 'approve' ? 'Aprovar exceção temporária' : deciding?.kind === 'reject' ? 'Rejeitar exceção temporária' : 'Terminar exceção antes do prazo'}
                description={deciding ? `${deciding.item.userName} · ${OPERATION_LABELS[deciding.item.operationType]} · ${values(deciding.item)} · até ${formatLuandaDateTime(deciding.item.endsAt)}` : undefined}
                confirmLabel={deciding?.kind === 'approve' ? 'Aprovar' : deciding?.kind === 'reject' ? 'Rejeitar' : 'Terminar agora'} destructive={deciding?.kind !== 'approve'}
                onClose={() => setDeciding(null)}
                onConfirm={async reason => {
                    if (!deciding || !state.actor) return;
                    if (deciding.kind === 'revoke') await ServicoAlcadas.revokeException(deciding.item.id, reason, state.actor);
                    else await ServicoAlcadas.decideException(deciding.item.id, deciding.kind === 'approve', reason, state.actor);
                    await state.reload({ silent: true });
                }} />
        </div>
    );
}
