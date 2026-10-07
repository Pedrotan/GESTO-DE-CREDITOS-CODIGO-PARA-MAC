import { useEffect, useMemo, useState } from 'react';
import { CalendarX, Clock, Loader2, Save, ShieldCheck, Trash2, Undo2, Users } from 'lucide-react';
import { Button } from '@/componentes/ui/button';
import { Input } from '@/componentes/ui/input';
import { Switch } from '@/componentes/ui/switch';
import { useAuth } from '@/contextos/ContextoAutenticacao';
import { useData } from '@/contextos/ContextoDados';
import { useToast } from '@/ganchos/usar-toast';
import { cn } from '@/bibliotecas/utils';
import { ROLES } from '@/tipos/autenticacao';
import {
    MONTH_NAMES, WEEKDAY_NAMES, evaluateAccess, formatAccessMoment, validateAccessSchedule,
    type AccessSchedule, type UserAccessMode,
} from '@/bibliotecas/horario-acesso';

// Configuração do horário de acesso (só o super administrador). As regras são partilhadas pela nuvem e
// aplicadas no computador e na versão web.

const MODE_LABELS: Record<UserAccessMode, string> = {
    schedule: 'Segue o horário',
    always: 'Acesso livre',
    blocked: 'Bloqueado',
};
// Segunda a domingo, mais natural do que começar no domingo.
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

export function HorarioAcessoPanel() {
    const { users, user } = useAuth();
    const { accessSchedule, saveAccessSchedule } = useData();
    const { toast } = useToast();
    const [draft, setDraft] = useState<AccessSchedule>(accessSchedule);
    const [newDate, setNewDate] = useState('');
    const [saving, setSaving] = useState(false);

    useEffect(() => { setDraft(accessSchedule); }, [accessSchedule]);

    const dirty = JSON.stringify(draft) !== JSON.stringify(accessSchedule);
    const error = validateAccessSchedule(draft);
    const managedUsers = users.filter(item => item.role !== 'super_admin');
    const canEdit = user?.role === 'super_admin';

    // Estado actual para quem segue o horário.
    const preview = useMemo(() => {
        const decision = evaluateAccess({ ...draft, enabled: true }, { id: '__preview__', role: 'operator' });
        if (decision.allowed) return { open: true, text: `Agora: acesso permitido até às ${decision.endsAt ? decision.endsAt.toTimeString().slice(0, 5) : '—'}.` };
        return { open: false, text: `Agora: sem acesso. ${decision.nextAccessAt ? `Reabre ${formatAccessMoment(decision.nextAccessAt)}.` : 'Não há nenhum período de acesso no próximo ano.'}` };
    }, [draft]);

    const setDay = (day: number, changes: Partial<AccessSchedule['days'][number]>) =>
        setDraft(current => ({ ...current, days: current.days.map((rule, index) => index === day ? { ...rule, ...changes } : rule) }));
    const toggleMonth = (month: number) => setDraft(current => ({
        ...current,
        allowedMonths: current.allowedMonths.includes(month)
            ? current.allowedMonths.filter(item => item !== month)
            : [...current.allowedMonths, month].sort((a, b) => a - b),
    }));
    const setUserMode = (userId: string, mode: UserAccessMode) => setDraft(current => {
        const userModes = { ...current.userModes };
        if (mode === 'schedule') delete userModes[userId]; else userModes[userId] = mode;
        return { ...current, userModes };
    });
    const applyPreset = (preset: 'weekdays' | 'everyday') => setDraft(current => ({
        ...current,
        days: current.days.map((_, day) => ({
            allowed: preset === 'everyday' || (day >= 1 && day <= 5), start: '08:00', end: preset === 'everyday' ? '18:00' : '15:00',
        })),
    }));
    const addDate = () => {
        if (!newDate || draft.blockedDates.includes(newDate)) return;
        setDraft(current => ({ ...current, blockedDates: [...current.blockedDates, newDate].sort() }));
        setNewDate('');
    };

    const save = async () => {
        setSaving(true);
        try {
            await saveAccessSchedule(draft);
            toast({
                title: draft.enabled ? 'Horário de acesso guardado' : 'Horário de acesso desactivado',
                description: draft.enabled
                    ? 'As regras já se aplicam neste dispositivo e chegam aos restantes (computadores e web) na próxima sincronização.'
                    : 'Os utilizadores podem entrar a qualquer hora.',
            });
        } catch (err: any) {
            toast({ title: 'Não foi possível guardar', description: err?.message || 'Erro ao guardar o horário.', variant: 'destructive' });
        } finally {
            setSaving(false);
        }
    };

    return (
        <section className="card-elevated overflow-hidden">
            <div className="flex flex-col gap-3 border-b bg-sidebar px-5 py-4 text-white sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary/20 text-secondary">
                        <Clock className="h-5 w-5" />
                    </div>
                    <div>
                        <h2 className="text-base font-bold">Horário de Acesso ao Sistema</h2>
                        <p className="text-xs text-white/70">Dias, meses e horas em que os utilizadores podem entrar. O super administrador tem sempre acesso.</p>
                    </div>
                </div>
                <label className="flex items-center gap-2 text-sm font-semibold">
                    <Switch checked={draft.enabled} onCheckedChange={enabled => setDraft(current => ({ ...current, enabled }))} disabled={!canEdit} />
                    {draft.enabled ? 'Activo' : 'Desactivado'}
                </label>
            </div>

            <fieldset disabled={!canEdit} className={cn('grid gap-6 p-5 lg:grid-cols-2', !draft.enabled && 'opacity-60')}>
                {/* Dias e horas */}
                <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="text-sm font-bold">Dias e horas de acesso</h3>
                        <div className="flex gap-2">
                            <Button type="button" size="sm" variant="outline" onClick={() => applyPreset('weekdays')}>Seg–Sex, 08:00–15:00</Button>
                            <Button type="button" size="sm" variant="outline" onClick={() => applyPreset('everyday')}>Todos os dias</Button>
                        </div>
                    </div>
                    <div className="divide-y rounded-xl border">
                        {DAY_ORDER.map(day => {
                            const rule = draft.days[day];
                            return (
                                <div key={day} className="flex flex-wrap items-center gap-3 px-3 py-2">
                                    <Switch checked={rule.allowed} onCheckedChange={allowed => setDay(day, { allowed })} aria-label={`Acesso à ${WEEKDAY_NAMES[day]}`} />
                                    <span className={cn('w-32 text-sm font-semibold', !rule.allowed && 'text-muted-foreground')}>{WEEKDAY_NAMES[day]}</span>
                                    {rule.allowed ? (
                                        <div className="flex items-center gap-2 text-sm">
                                            <Input type="time" value={rule.start} onChange={event => setDay(day, { start: event.target.value })} className="h-8 w-28" aria-label={`Início ${WEEKDAY_NAMES[day]}`} />
                                            <span className="text-muted-foreground">às</span>
                                            <Input type="time" value={rule.end} onChange={event => setDay(day, { end: event.target.value })} className="h-8 w-28" aria-label={`Fim ${WEEKDAY_NAMES[day]}`} />
                                        </div>
                                    ) : (
                                        <span className="text-xs font-semibold uppercase text-destructive">Sem acesso</span>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                        <span>Avisar o utilizador</span>
                        <Input
                            type="number" min={1} max={120} value={draft.warnMinutes}
                            onChange={event => setDraft(current => ({ ...current, warnMinutes: Number(event.target.value) || 1 }))}
                            className="h-8 w-20"
                        />
                        <span>minutos antes de a sessão terminar.</span>
                    </div>
                </div>

                <div className="space-y-6">
                    {/* Meses */}
                    <div className="space-y-3">
                        <h3 className="text-sm font-bold">Meses com acesso</h3>
                        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                            {MONTH_NAMES.map((name, month) => {
                                const allowed = draft.allowedMonths.includes(month);
                                return (
                                    <button
                                        key={name} type="button" onClick={() => toggleMonth(month)} aria-pressed={allowed}
                                        className={cn('rounded-lg border px-2 py-1.5 text-xs font-semibold transition-colors',
                                            allowed ? 'border-primary bg-primary text-primary-foreground' : 'border-dashed text-muted-foreground line-through')}
                                    >
                                        {name}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Feriados */}
                    <div className="space-y-3">
                        <h3 className="flex items-center gap-2 text-sm font-bold"><CalendarX className="h-4 w-4" /> Dias sem acesso (feriados, encerramentos)</h3>
                        <div className="flex gap-2">
                            <Input type="date" value={newDate} onChange={event => setNewDate(event.target.value)} className="h-9 w-44" />
                            <Button type="button" size="sm" variant="outline" onClick={addDate} disabled={!newDate}>Adicionar</Button>
                        </div>
                        {draft.blockedDates.length > 0 ? (
                            <div className="flex flex-wrap gap-2">
                                {draft.blockedDates.map(date => (
                                    <span key={date} className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2.5 py-1 text-xs font-semibold text-destructive">
                                        {date.split('-').reverse().join('/')}
                                        <button type="button" onClick={() => setDraft(current => ({ ...current, blockedDates: current.blockedDates.filter(item => item !== date) }))} aria-label={`Remover ${date}`}>
                                            <Trash2 className="h-3 w-3" />
                                        </button>
                                    </span>
                                ))}
                            </div>
                        ) : <p className="text-xs text-muted-foreground">Nenhum dia adicionado.</p>}
                    </div>
                </div>

                {/* Regras por utilizador */}
                <div className="space-y-3 lg:col-span-2">
                    <h3 className="flex items-center gap-2 text-sm font-bold"><Users className="h-4 w-4" /> Regras por utilizador</h3>
                    {managedUsers.length === 0 ? (
                        <p className="text-xs text-muted-foreground">Ainda não há outros utilizadores além do super administrador.</p>
                    ) : (
                        <div className="divide-y rounded-xl border">
                            {managedUsers.map(item => {
                                const mode = draft.userModes[item.id] || 'schedule';
                                return (
                                    <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2">
                                        <div>
                                            <p className="text-sm font-semibold">{item.name}</p>
                                            <p className="text-xs text-muted-foreground">{ROLES[item.role]?.label || item.role} · {item.email}</p>
                                        </div>
                                        <div className="flex gap-1 rounded-lg bg-muted p-1">
                                            {(Object.keys(MODE_LABELS) as UserAccessMode[]).map(option => (
                                                <button
                                                    key={option} type="button" onClick={() => setUserMode(item.id, option)} aria-pressed={mode === option}
                                                    className={cn('rounded-md px-2.5 py-1 text-xs font-semibold transition-colors',
                                                        mode === option
                                                            ? option === 'blocked' ? 'bg-destructive text-destructive-foreground' : option === 'always' ? 'bg-emerald-600 text-white' : 'bg-background shadow-sm'
                                                            : 'text-muted-foreground hover:text-foreground')}
                                                >
                                                    {MODE_LABELS[option]}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </fieldset>

            <div className="flex flex-col gap-3 border-t bg-muted/30 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
                <p className={cn('flex items-center gap-2 text-xs font-semibold', error ? 'text-destructive' : preview.open ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400')}>
                    <ShieldCheck className="h-4 w-4" /> {error || preview.text}
                </p>
                {canEdit && (
                    <div className="flex gap-2">
                        <Button type="button" variant="outline" size="sm" onClick={() => setDraft(accessSchedule)} disabled={!dirty || saving} className="gap-1.5">
                            <Undo2 className="h-4 w-4" /> Desfazer
                        </Button>
                        <Button type="button" size="sm" onClick={save} disabled={!dirty || !!error || saving} className="gap-1.5 bg-primary font-bold text-primary-foreground hover:bg-primary/90">
                            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Guardar horário
                        </Button>
                    </div>
                )}
            </div>
        </section>
    );
}
