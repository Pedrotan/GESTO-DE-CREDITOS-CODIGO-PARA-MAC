import { useEffect, useMemo, useState } from 'react';
import { History, Loader2, Monitor, Network, UserSearch, Workflow } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/componentes/ui/dialog';
import { useAuth } from '@/contextos/ContextoAutenticacao';
import { assignSessions, formatAuditTimestamp, toAuditEvent, type AuditEvent } from '@/bibliotecas/auditoria-analise';
import { ServicoAuditoriaAvancada } from '@/servicos/ServicoAuditoriaAvancada';
import { LinhaTempoAuditoria } from './LinhaTempoAuditoria';
import type { InvestigationTarget } from './DetalheAuditoria';

/**
 * Investigação: histórico completo de uma entidade (desde a criação, consulta directa à base de dados),
 * actividade de um utilizador sessão a sessão (login → ações → logout) ou a sequência de uma sessão.
 */
export function InvestigacaoAuditoria({ target, events, onClose, onOpen, extraTerms = [] }: {
    target: InvestigationTarget | null;
    events: AuditEvent[];
    onClose: () => void;
    onOpen?: (event: AuditEvent) => void;
    /** Outros identificadores da mesma entidade (ex.: n.º do recibo, nome do cliente). */
    extraTerms?: string[];
}) {
    const { users } = useAuth() as any;
    const [entityEvents, setEntityEvents] = useState<AuditEvent[] | null>(null);
    const [selected, setSelected] = useState<AuditEvent | null>(null);
    useEffect(() => {
        setSelected(null);
        if (target?.mode !== 'entity') { setEntityEvents(null); return; }
        let cancelled = false;
        setEntityEvents(null);
        const roles = new Map<string, string>((users || []).map((item: any) => [item.id, item.role]));
        ServicoAuditoriaAvancada.entityHistory(target.key, extraTerms).then(rows => {
            if (!cancelled) setEntityEvents(assignSessions(rows.map(row => toAuditEvent(row, { roles }))));
        }).catch(() => { if (!cancelled) setEntityEvents([]); });
        return () => { cancelled = true; };
    }, [target?.mode, target?.key]); // eslint-disable-line react-hooks/exhaustive-deps

    const list = useMemo(() => {
        if (!target) return [];
        if (target.mode === 'entity') return entityEvents || [];
        if (target.mode === 'user') return events.filter(event => event.userId === target.key);
        return events.filter(event => event.sessionId === target.key);
    }, [target, events, entityEvents]);
    const ips = [...new Set(list.map(event => event.ip).filter(Boolean))];
    const devices = [...new Set(list.map(event => event.device).filter(Boolean))];
    const sessions = new Set(list.map(event => event.sessionId)).size;
    const Icon = target?.mode === 'entity' ? History : target?.mode === 'user' ? UserSearch : Workflow;
    const open = (event: AuditEvent) => { if (onOpen) onOpen(event); else setSelected(event); };

    return (
        <Dialog open={Boolean(target)} onOpenChange={value => { if (!value) onClose(); }}>
            <DialogContent className="max-h-[92vh] w-[96vw] max-w-5xl overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2"><Icon className="h-5 w-5" />
                        {target?.mode === 'entity' ? `Histórico: ${target.label}` : target?.mode === 'user' ? `Atividade de ${target?.label}` : target?.label}
                    </DialogTitle>
                    <DialogDescription>
                        {target?.mode === 'entity' ? 'Todas as alterações registadas desde a criação (inclui o arquivo).' : target?.mode === 'user' ? 'Sessão a sessão: login, ações e logout, com IP e dispositivos usados.' : 'Sequência completa das ações desta sessão.'}
                    </DialogDescription>
                </DialogHeader>
                {target?.mode === 'entity' && entityEvents === null ? <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin" /></div> : (
                    <div className="space-y-4">
                        <div className="grid gap-2 text-sm sm:grid-cols-4">
                            <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Eventos</p><p className="text-xl font-black">{list.length}</p></div>
                            <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Sessões</p><p className="text-xl font-black">{sessions}</p></div>
                            <div className="rounded-lg border p-3"><p className="flex items-center gap-1 text-xs text-muted-foreground"><Network className="h-3 w-3" /> IP usados</p><p className="truncate font-mono text-xs font-semibold" title={ips.join(', ')}>{ips.join(', ') || '—'}</p></div>
                            <div className="rounded-lg border p-3"><p className="flex items-center gap-1 text-xs text-muted-foreground"><Monitor className="h-3 w-3" /> Dispositivos</p><p className="truncate text-xs font-semibold" title={devices.join(', ')}>{devices.join(', ') || '—'}</p></div>
                        </div>
                        {list.length > 0 && (() => {
                            const times = list.map(event => event.timestamp).sort();
                            return <p className="text-xs text-muted-foreground">De {formatAuditTimestamp(times[0])} a {formatAuditTimestamp(times[times.length - 1])}</p>;
                        })()}
                        <LinhaTempoAuditoria events={list} onOpen={open} compact />
                        {selected && (
                            <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                                <p className="font-semibold">{formatAuditTimestamp(selected.timestamp)} · {selected.userName}</p>
                                <p className="text-muted-foreground">{selected.summary}</p>
                                {selected.changes.map(change => <p key={change.field} className="text-xs"><b>{change.label}:</b> <span className="text-red-600">{change.before}</span> → <span className="text-emerald-600">{change.after}</span></p>)}
                            </div>
                        )}
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
