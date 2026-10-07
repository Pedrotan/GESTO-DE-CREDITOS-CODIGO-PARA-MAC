import { useMemo, useState } from 'react';
import type { ComponentType } from 'react';
import {
    Ban, CheckCircle2, Download, Eye, FilePlus2, KeyRound, LogIn, LogOut, Monitor, Pencil, RotateCcw, Settings, ShieldAlert, ShieldX, SlidersHorizontal,
    Trash2, Undo2, Upload, UserCog, XCircle, Banknote,
} from 'lucide-react';
import { Button } from '@/componentes/ui/button';
import { cn } from '@/bibliotecas/utils';
import { ACTION_LABELS, MODULE_LABELS, formatAuditTimestamp, timeline, type AuditAction, type AuditEvent } from '@/bibliotecas/auditoria-analise';
import { SeverityBadge } from './TabelaAuditoria';

const ICONS: Record<AuditAction, ComponentType<{ className?: string }>> = {
    create: FilePlus2, update: Pencil, delete: Trash2, view_sensitive: Eye, export: Download, login: LogIn, login_failed: KeyRound, logout: LogOut,
    approve: CheckCircle2, reject: XCircle, cancel: Ban, reversal: Undo2, permission_change: UserCog, settings_change: Settings, override: SlidersHorizontal,
    access_denied: ShieldX, security: ShieldAlert, view: Eye, import: Upload, restore: RotateCcw, disburse: Banknote,
};
const ICON_TONE: Partial<Record<AuditAction, string>> = {
    login_failed: 'bg-orange-500 text-white', access_denied: 'bg-red-600 text-white', security: 'bg-red-600 text-white', cancel: 'bg-red-500 text-white',
    reversal: 'bg-red-500 text-white', override: 'bg-orange-500 text-white', permission_change: 'bg-purple-600 text-white', settings_change: 'bg-indigo-600 text-white',
    login: 'bg-emerald-600 text-white', logout: 'bg-slate-500 text-white', approve: 'bg-emerald-600 text-white', reject: 'bg-red-500 text-white',
};

export function ActionIcon({ action, className }: { action: AuditAction; className?: string }) {
    const Icon = ICONS[action] || Pencil;
    return <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-full', ICON_TONE[action] || 'bg-primary/10 text-primary', className)}><Icon className="h-3.5 w-3.5" /></span>;
}

const dayLabel = (key: string) => new Date(`${key}T12:00:00Z`).toLocaleDateString('pt-AO', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });

export function LinhaTempoAuditoria({ events, onOpen, compact }: { events: AuditEvent[]; onOpen: (event: AuditEvent) => void; compact?: boolean }) {
    const [limit, setLimit] = useState(15);
    const days = useMemo(() => timeline(events), [events]);
    if (!events.length) return <p className="rounded-xl border py-12 text-center text-sm text-muted-foreground">Sem eventos no período.</p>;
    return (
        <div className={cn('space-y-6', !compact && 'card-elevated p-5')}>
            {days.slice(0, limit).map(day => (
                <section key={day.dateKey}>
                    <h3 className="sticky top-0 z-10 mb-3 bg-background/95 py-1 text-sm font-black capitalize">{dayLabel(day.dateKey)}</h3>
                    <div className="space-y-3">
                        {day.sessions.map(session => (
                            <div key={session.sessionId} className="rounded-xl border bg-muted/20">
                                <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2 text-xs">
                                    <span className="font-bold">{session.userName}</span>
                                    <span className="flex flex-wrap items-center gap-3 text-muted-foreground">
                                        <span>{formatAuditTimestamp(session.start).slice(11)} → {formatAuditTimestamp(session.end).slice(11)}</span>
                                        {session.ip && <span className="font-mono">IP {session.ip}</span>}
                                        {session.device && <span className="flex items-center gap-1"><Monitor className="h-3 w-3" />{session.device}</span>}
                                        <span>{session.events.length} evento(s)</span>
                                    </span>
                                </div>
                                <ol className="relative ml-6 border-l py-2">
                                    {session.events.map(event => (
                                        <li key={event.id} className="relative -ml-[14px] flex cursor-pointer items-start gap-3 rounded-lg px-2 py-1.5 hover:bg-muted/60" onClick={() => onOpen(event)}>
                                            <ActionIcon action={event.action} />
                                            <div className="min-w-0 flex-1">
                                                <p className="flex flex-wrap items-center gap-2 text-xs">
                                                    <span className="font-mono text-muted-foreground">{formatAuditTimestamp(event.timestamp).slice(11)}</span>
                                                    <span className="font-bold">{ACTION_LABELS[event.action]}</span>
                                                    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px]">{MODULE_LABELS[event.module]}</span>
                                                    {event.severity !== 'info' && event.severity !== 'low' && <SeverityBadge severity={event.severity} />}
                                                </p>
                                                <p className="line-clamp-2 text-xs text-muted-foreground">{event.summary}</p>
                                            </div>
                                        </li>
                                    ))}
                                </ol>
                            </div>
                        ))}
                    </div>
                </section>
            ))}
            {days.length > limit && <div className="text-center"><Button variant="outline" size="sm" onClick={() => setLimit(value => value + 15)}>Mostrar mais dias ({days.length - limit})</Button></div>}
        </div>
    );
}
