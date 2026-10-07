import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle2, Fingerprint, History, Link2, ShieldAlert, UserSearch, Workflow } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/componentes/ui/sheet';
import { Button } from '@/componentes/ui/button';
import { cn } from '@/bibliotecas/utils';
import { ROLES } from '@/tipos/autenticacao';
import { ACTION_LABELS, MODULE_LABELS, RESULT_LABELS, formatAuditTimestamp, relatedEvents, relativeTime, type AuditEvent } from '@/bibliotecas/auditoria-analise';
import { SeverityBadge } from './TabelaAuditoria';
import { ActionIcon } from './LinhaTempoAuditoria';

export type InvestigationTarget = { mode: 'entity' | 'user' | 'session'; key: string; label: string };

function Field({ label, value, mono, wide }: { label: string; value: React.ReactNode; mono?: boolean; wide?: boolean }) {
    return (
        <div className={cn('min-w-0', wide && 'col-span-2')}>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
            <div className={cn('break-words text-sm font-medium', mono && 'font-mono text-xs')}>{value || '—'}</div>
        </div>
    );
}

function RelatedList({ title, list, onOpen }: { title: string; list: AuditEvent[]; onOpen: (event: AuditEvent) => void }) {
    if (!list.length) return null;
    return (
        <div className="space-y-1.5">
            <p className="text-xs font-bold text-muted-foreground">{title} ({list.length})</p>
            <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border p-1">
                {list.slice(0, 40).map(event => (
                    <button key={event.id} type="button" onClick={() => onOpen(event)} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-muted">
                        <ActionIcon action={event.action} className="h-6 w-6" />
                        <span className="w-[118px] shrink-0 font-mono text-[11px] text-muted-foreground">{formatAuditTimestamp(event.timestamp)}</span>
                        <span className="min-w-0 flex-1 truncate text-xs"><b>{ACTION_LABELS[event.action]}</b> · {event.summary}</span>
                    </button>
                ))}
            </div>
        </div>
    );
}

export function DetalheAuditoria({ event, events, brokenSeq, onClose, onOpen, onInvestigate }: {
    event: AuditEvent | null;
    events: AuditEvent[];
    brokenSeq: number | null;
    onClose: () => void;
    onOpen: (event: AuditEvent) => void;
    onInvestigate: (target: InvestigationTarget) => void;
}) {
    if (!event) return null;
    const related = relatedEvents(event, events);
    const integrityOk = !brokenSeq || (event.seq !== null && event.seq < brokenSeq);
    const meta = event.metadata;
    return (
        <Sheet open={Boolean(event)} onOpenChange={open => { if (!open) onClose(); }}>
            <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-2xl">
                <SheetHeader className="pr-8 text-left">
                    <div className="flex flex-wrap items-center gap-2">
                        <ActionIcon action={event.action} />
                        <SheetTitle className="text-lg">{ACTION_LABELS[event.action]} · {MODULE_LABELS[event.module]}</SheetTitle>
                        <SeverityBadge severity={event.severity} />
                    </div>
                    <SheetDescription>{formatAuditTimestamp(event.timestamp)} (hora de Angola) · {relativeTime(event.timestamp)}</SheetDescription>
                </SheetHeader>

                <div className="mt-5 space-y-6">
                    <p className="rounded-lg border bg-muted/40 p-3 text-sm leading-relaxed">{event.summary}</p>

                    <section className="grid grid-cols-2 gap-3 rounded-lg border p-3">
                        <Field label="N.º sequencial" value={event.seq ?? 'Anterior à cadeia'} mono />
                        <Field label="Data/hora (UTC)" value={event.timestamp} mono />
                        <Field label="Utilizador" value={`${event.userName}${event.role ? ` · ${ROLES[event.role]?.label || event.role}` : ''}`} />
                        <Field label="ID do utilizador" value={event.userId} mono />
                        <Field label="Resultado" value={RESULT_LABELS[event.result]} />
                        <Field label="Módulo / ação" value={`${MODULE_LABELS[event.module]} · ${ACTION_LABELS[event.action]}`} />
                        <Field label="Sessão" value={event.sessionId.startsWith('s-') ? 'Inferida (registo antigo)' : event.sessionId} mono />
                        <Field label="Endereço IP" value={event.ip} mono />
                        <Field label="Dispositivo / navegador" value={event.device} />
                        <Field label="Localização aproximada" value={event.location || 'Não determinada (sem geolocalização por IP)'} />
                        <Field label="Entidade afetada" wide value={event.entity ? (event.entity.link ? <Link to={event.entity.link} className="inline-flex items-center gap-1 text-primary hover:underline"><Link2 className="h-3.5 w-3.5" />{event.entity.label}</Link> : event.entity.label) : '—'} />
                        {event.justification && <Field label="Justificação" wide value={<span className="italic">«{event.justification}»</span>} />}
                    </section>

                    <section className="space-y-2">
                        <h3 className="text-sm font-bold">Valores antes e depois</h3>
                        {event.changes.length ? (
                            <div className="overflow-hidden rounded-lg border text-sm">
                                <div className="grid grid-cols-[minmax(110px,0.8fr)_1fr_auto_1fr] gap-0 bg-muted/60 text-[11px] font-bold uppercase text-muted-foreground">
                                    <span className="p-2">Campo</span><span className="p-2">Antes</span><span className="p-2" /><span className="p-2">Depois</span>
                                </div>
                                {event.changes.map(change => (
                                    <div key={change.field} className="grid grid-cols-[minmax(110px,0.8fr)_1fr_auto_1fr] items-start border-t">
                                        <span className="p-2 text-xs font-semibold">{change.label}</span>
                                        <span className="break-words bg-red-50 p-2 font-mono text-xs text-red-700 dark:bg-red-500/10 dark:text-red-300">{change.before}</span>
                                        <span className="p-2 text-muted-foreground"><ArrowRight className="h-3.5 w-3.5" /></span>
                                        <span className="break-words bg-emerald-50 p-2 font-mono text-xs text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">{change.after}</span>
                                    </div>
                                ))}
                            </div>
                        ) : <p className="text-sm text-muted-foreground">Esta operação não altera valores (ou é um registo antigo sem o estado anterior guardado).</p>}
                    </section>

                    <section className="space-y-2">
                        <h3 className="text-sm font-bold">Integridade do registo</h3>
                        <div className={cn('flex items-start gap-2 rounded-lg p-3 text-sm', integrityOk ? 'bg-emerald-50 text-emerald-900 dark:bg-emerald-500/10 dark:text-emerald-200' : 'bg-red-50 text-red-900 dark:bg-red-500/10 dark:text-red-200')}>
                            {integrityOk ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />}
                            <div className="min-w-0">
                                <p className="font-semibold">{event.hash ? (integrityOk ? 'Hash válido ✓ (cadeia íntegra até à última verificação)' : `A cadeia está quebrada a partir do registo n.º ${brokenSeq}`) : 'Registo anterior à cadeia de integridade'}</p>
                                {event.hash && <p className="break-all font-mono text-[11px] opacity-80"><Fingerprint className="mr-1 inline h-3 w-3" />{event.hash}</p>}
                                {event.raw.previousHash && <p className="break-all font-mono text-[11px] opacity-60">anterior: {event.raw.previousHash}</p>}
                            </div>
                        </div>
                    </section>

                    <section className="space-y-3">
                        <h3 className="text-sm font-bold">Eventos relacionados</h3>
                        <RelatedList title="Mesma sessão" list={related.session} onOpen={onOpen} />
                        <RelatedList title="Outras alterações à mesma entidade" list={related.entity} onOpen={onOpen} />
                        {!related.session.length && !related.entity.length && <p className="text-sm text-muted-foreground">Sem eventos relacionados no período carregado.</p>}
                        <div className="flex flex-wrap gap-2 pt-1">
                            {event.entity && <Button size="sm" variant="outline" className="gap-1.5" onClick={() => onInvestigate({ mode: 'entity', key: event.entity!.id, label: event.entity!.label })}><History className="h-4 w-4" /> Histórico da entidade</Button>}
                            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => onInvestigate({ mode: 'user', key: event.userId, label: event.userName })}><UserSearch className="h-4 w-4" /> Atividade do utilizador</Button>
                            {event.sessionId && <Button size="sm" variant="outline" className="gap-1.5" onClick={() => onInvestigate({ mode: 'session', key: event.sessionId, label: `Sessão de ${event.userName}` })}><Workflow className="h-4 w-4" /> Sessão completa</Button>}
                        </div>
                    </section>

                    {Object.keys(meta).length > 0 && (
                        <details className="rounded-lg border p-3 text-xs">
                            <summary className="cursor-pointer font-semibold">Metadados técnicos</summary>
                            <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded bg-slate-900 p-3 text-slate-50">{JSON.stringify(meta, null, 2)}</pre>
                        </details>
                    )}
                    <p className="pb-4 text-[11px] text-muted-foreground">ID do registo: <span className="font-mono">{event.id}</span></p>
                </div>
            </SheetContent>
        </Sheet>
    );
}
