import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BellRing, CalendarClock, Loader2, MessageSquare, UserCheck } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/componentes/ui/dialog';
import { Button } from '@/componentes/ui/button';
import { Input } from '@/componentes/ui/input';
import { Label } from '@/componentes/ui/label';
import { Textarea } from '@/componentes/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/componentes/ui/select';
import { cn } from '@/bibliotecas/utils';
import { formatAuditTimestamp, relativeTime, type AuditEvent, type Severity } from '@/bibliotecas/auditoria-analise';
import { ALERT_STATUS_LABELS, CLOSED_ALERT_STATUSES, ServicoAuditoriaAvancada, type AlertComment, type AlertStatus, type StoredAlert } from '@/servicos/ServicoAuditoriaAvancada';
import { SeverityBadge } from './TabelaAuditoria';

const STATUS_TONE: Record<AlertStatus, string> = {
    open: 'bg-red-500/10 text-red-700 border-red-300 dark:text-red-300', in_review: 'bg-amber-400/20 text-amber-800 border-amber-300 dark:text-amber-300',
    justified: 'bg-sky-500/10 text-sky-700 border-sky-300 dark:text-sky-300', false_positive: 'bg-slate-500/10 text-slate-700 border-slate-300 dark:text-slate-300',
    resolved: 'bg-emerald-500/10 text-emerald-700 border-emerald-300 dark:text-emerald-300',
};

function GerirAlerta({ alert, actor, responsibles, onClose, onSaved, events, onOpenEvent }: {
    alert: StoredAlert | null;
    actor: { id: string; name: string; role: string };
    responsibles: Array<{ id: string; name: string }>;
    onClose: () => void;
    onSaved: () => void;
    events: AuditEvent[];
    onOpenEvent: (event: AuditEvent) => void;
}) {
    const [status, setStatus] = useState<AlertStatus>('in_review');
    const [assignee, setAssignee] = useState('');
    const [due, setDue] = useState('');
    const [comment, setComment] = useState('');
    const [comments, setComments] = useState<AlertComment[]>([]);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    useEffect(() => {
        if (!alert) return;
        setStatus(alert.status === 'open' ? 'in_review' : alert.status); setAssignee(alert.assignedTo || ''); setDue(alert.dueAt ? alert.dueAt.slice(0, 10) : '');
        setComment(''); setError(''); setComments([]);
        ServicoAuditoriaAvancada.alertComments(alert.id).then(setComments).catch(() => setComments([]));
    }, [alert]);
    if (!alert) return null;
    const canManage = actor.role === 'super_admin';
    const ownAlert = alert.originUserId === actor.id;
    const linked = (() => { try { return (JSON.parse(alert.eventIds || '[]') as string[]).map(id => events.find(event => event.id === id)).filter(Boolean) as AuditEvent[]; } catch { return []; } })();
    const save = async () => {
        setBusy(true); setError('');
        try {
            const person = responsibles.find(item => item.id === assignee);
            await ServicoAuditoriaAvancada.updateAlert(alert, { status, assignedTo: person ? { id: person.id, name: person.name } : null, dueAt: due ? new Date(`${due}T23:59:00`).toISOString() : null, comment }, actor);
            onSaved(); onClose();
        } catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); } finally { setBusy(false); }
    };
    return (
        <Dialog open onOpenChange={value => { if (!value && !busy) onClose(); }}>
            <DialogContent className="max-h-[92vh] w-[96vw] max-w-3xl overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 pr-8"><BellRing className="h-5 w-5" /> {alert.title}</DialogTitle>
                    <DialogDescription>{formatAuditTimestamp(alert.occurredAt)} · originado por {alert.originUserName || '—'}</DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                    <div className="flex flex-wrap items-center gap-2">
                        <SeverityBadge severity={alert.severity as Severity} />
                        <span className={cn('rounded-full border px-2 py-0.5 text-[11px] font-bold', STATUS_TONE[alert.status])}>{ALERT_STATUS_LABELS[alert.status]}</span>
                        {alert.dueAt && <span className="flex items-center gap-1 text-xs text-muted-foreground"><CalendarClock className="h-3.5 w-3.5" /> Prazo {formatAuditTimestamp(alert.dueAt).slice(0, 10)}</span>}
                        {alert.assignedToName && <span className="flex items-center gap-1 text-xs text-muted-foreground"><UserCheck className="h-3.5 w-3.5" /> {alert.assignedToName}</span>}
                    </div>
                    <p className="rounded-lg border bg-muted/40 p-3 text-sm">{alert.description}</p>
                    {linked.length > 0 && (
                        <div className="space-y-1">
                            <p className="text-xs font-bold text-muted-foreground">Eventos que originaram o alerta</p>
                            {linked.map(event => (
                                <button key={event.id} type="button" onClick={() => onOpenEvent(event)} className="block w-full truncate rounded-md border px-2 py-1.5 text-left text-xs hover:bg-muted">
                                    <span className="font-mono text-muted-foreground">{formatAuditTimestamp(event.timestamp)}</span> · {event.userName} · {event.summary}
                                </button>
                            ))}
                        </div>
                    )}
                    <div className="space-y-2">
                        <p className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground"><MessageSquare className="h-3.5 w-3.5" /> Comentários ({comments.length})</p>
                        {comments.map(item => (
                            <div key={item.id} className="rounded-lg border p-2 text-xs">
                                <p className="font-semibold">{item.userName} · {formatAuditTimestamp(item.createdAt)}{item.status ? ` · ${ALERT_STATUS_LABELS[item.status as AlertStatus] || item.status}` : ''}</p>
                                <p className="text-muted-foreground">{item.comment}</p>
                            </div>
                        ))}
                        {!comments.length && <p className="text-xs text-muted-foreground">Ainda sem comentários.</p>}
                    </div>
                    {canManage ? (
                        <div className="space-y-3 rounded-xl border bg-muted/30 p-3">
                            <div className="grid gap-3 sm:grid-cols-3">
                                <div className="space-y-1.5">
                                    <Label className="text-xs">Estado</Label>
                                    <Select value={status} onValueChange={value => setStatus(value as AlertStatus)}>
                                        <SelectTrigger className="h-9 bg-background"><SelectValue /></SelectTrigger>
                                        <SelectContent>{(Object.keys(ALERT_STATUS_LABELS) as AlertStatus[]).map(key => (
                                            <SelectItem key={key} value={key} disabled={ownAlert && CLOSED_ALERT_STATUSES.includes(key)}>{ALERT_STATUS_LABELS[key]}{ownAlert && CLOSED_ALERT_STATUSES.includes(key) ? ' (não pode: originou o alerta)' : ''}</SelectItem>
                                        ))}</SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-xs">Responsável</Label>
                                    <Select value={assignee || 'none'} onValueChange={value => setAssignee(value === 'none' ? '' : value)}>
                                        <SelectTrigger className="h-9 bg-background"><SelectValue /></SelectTrigger>
                                        <SelectContent><SelectItem value="none">Sem responsável</SelectItem>{responsibles.map(person => <SelectItem key={person.id} value={person.id}>{person.name}</SelectItem>)}</SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-xs">Prazo</Label>
                                    <Input type="date" className="h-9 bg-background" value={due} onChange={event => setDue(event.target.value)} />
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-xs">Comentário {CLOSED_ALERT_STATUSES.includes(status) && '(justificação do fecho: 20+ caracteres, 3+ palavras)'}</Label>
                                <Textarea rows={3} value={comment} maxLength={1000} onChange={event => setComment(event.target.value)} placeholder="O que foi verificado e a conclusão." />
                            </div>
                            {error && <p className="flex gap-2 text-sm text-destructive"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{error}</p>}
                            <div className="flex justify-end gap-2">
                                <Button variant="ghost" onClick={onClose} disabled={busy}>Cancelar</Button>
                                <Button onClick={save} disabled={busy || comment.trim().length < 10} className="gap-2">{busy && <Loader2 className="h-4 w-4 animate-spin" />} Guardar</Button>
                            </div>
                        </div>
                    ) : <p className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">Acesso de leitura: só o Super Administrador gere os alertas.</p>}
                </div>
            </DialogContent>
        </Dialog>
    );
}

export function CentroAlertas({ alerts, actor, responsibles, onChanged, events, onOpenEvent }: {
    alerts: StoredAlert[];
    actor: { id: string; name: string; role: string };
    responsibles: Array<{ id: string; name: string }>;
    onChanged: () => void;
    events: AuditEvent[];
    onOpenEvent: (event: AuditEvent) => void;
}) {
    const [filter, setFilter] = useState<'active' | 'all' | AlertStatus>('active');
    const [selected, setSelected] = useState<StoredAlert | null>(null);
    const list = useMemo(() => alerts.filter(alert => filter === 'all' || (filter === 'active' ? !CLOSED_ALERT_STATUSES.includes(alert.status) : alert.status === filter))
        .sort((a, b) => ['critical', 'high', 'medium', 'low', 'info'].indexOf(a.severity) - ['critical', 'high', 'medium', 'low', 'info'].indexOf(b.severity) || b.occurredAt.localeCompare(a.occurredAt)), [alerts, filter]);
    const overdue = (alert: StoredAlert) => alert.dueAt && !CLOSED_ALERT_STATUSES.includes(alert.status) && alert.dueAt < new Date().toISOString();
    return (
        <div className="card-elevated p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p className="flex items-center gap-2 text-sm font-bold"><BellRing className="h-4 w-4 text-primary" /> Centro de Alertas</p>
                <div className="flex flex-wrap gap-1.5">
                    {([['active', 'Por tratar'], ['all', 'Todos'], ...Object.entries(ALERT_STATUS_LABELS)] as Array<[string, string]>).map(([key, label]) => (
                        <button key={key} type="button" onClick={() => setFilter(key as any)} aria-pressed={filter === key}
                            className={cn('rounded-full border px-2.5 py-1 text-xs font-semibold', filter === key ? 'border-primary bg-primary text-primary-foreground' : 'bg-background hover:bg-muted')}>{label}</button>
                    ))}
                </div>
            </div>
            {!list.length ? <p className="py-8 text-center text-sm text-muted-foreground">Sem alertas {filter === 'active' ? 'por tratar' : 'com este estado'}.</p> : (
                <div className="space-y-2">
                    {list.map(alert => (
                        <button key={alert.id} type="button" onClick={() => setSelected(alert)} className="flex w-full flex-wrap items-center gap-3 rounded-lg border bg-background px-3 py-2 text-left hover:bg-muted/50">
                            <SeverityBadge severity={alert.severity as Severity} />
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-semibold">{alert.title}</p>
                                <p className="truncate text-xs text-muted-foreground" title={alert.description || ''}>{alert.description}</p>
                            </div>
                            <div className="flex flex-col items-end gap-1 text-xs">
                                <span className={cn('rounded-full border px-2 py-0.5 font-bold', STATUS_TONE[alert.status])}>{ALERT_STATUS_LABELS[alert.status]}</span>
                                <span className={cn('text-muted-foreground', overdue(alert) && 'font-bold text-destructive')}>{overdue(alert) ? 'Prazo ultrapassado' : relativeTime(alert.occurredAt)}</span>
                            </div>
                        </button>
                    ))}
                </div>
            )}
            <GerirAlerta alert={selected} actor={actor} responsibles={responsibles} onClose={() => setSelected(null)} onSaved={onChanged} events={events} onOpenEvent={event => { setSelected(null); onOpenEvent(event); }} />
        </div>
    );
}
