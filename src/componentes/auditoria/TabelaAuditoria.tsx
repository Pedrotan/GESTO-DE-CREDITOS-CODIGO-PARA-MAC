import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Columns3, Inbox } from 'lucide-react';
import { Button } from '@/componentes/ui/button';
import { Skeleton } from '@/componentes/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/componentes/ui/select';
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/componentes/ui/dropdown-menu';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/componentes/ui/table';
import { cn } from '@/bibliotecas/utils';
import { ACTION_LABELS, MODULE_LABELS, RESULT_LABELS, SEVERITY_LABELS, SEVERITY_ORDER, formatAuditTimestamp, relativeTime, type AuditEvent, type Severity } from '@/bibliotecas/auditoria-analise';
import { ROLES } from '@/tipos/autenticacao';

type ColumnId = 'seq' | 'timestamp' | 'user' | 'module' | 'action' | 'entity' | 'result' | 'severity' | 'ip' | 'summary';
const COLUMNS: Array<{ id: ColumnId; label: string; sort: (event: AuditEvent) => string | number }> = [
    { id: 'seq', label: 'N.º', sort: event => event.seq ?? 0 },
    { id: 'timestamp', label: 'Data/Hora', sort: event => event.timestamp },
    { id: 'user', label: 'Utilizador', sort: event => event.userName.toLowerCase() },
    { id: 'module', label: 'Módulo', sort: event => MODULE_LABELS[event.module] },
    { id: 'action', label: 'Ação', sort: event => ACTION_LABELS[event.action] },
    { id: 'entity', label: 'Entidade', sort: event => event.entity?.label || '' },
    { id: 'result', label: 'Resultado', sort: event => event.result },
    { id: 'severity', label: 'Gravidade', sort: event => SEVERITY_ORDER.indexOf(event.severity) },
    { id: 'ip', label: 'IP', sort: event => event.ip },
    { id: 'summary', label: 'Resumo', sort: event => event.summary },
];
const COLUMNS_KEY = 'auditoria:colunas';

const SEVERITY_STYLES: Record<Severity, string> = {
    critical: 'bg-red-600 text-white border-red-700',
    high: 'bg-orange-500/15 text-orange-800 border-orange-300 dark:text-orange-300',
    medium: 'bg-amber-400/20 text-amber-800 border-amber-300 dark:text-amber-300',
    low: 'bg-sky-500/10 text-sky-800 border-sky-200 dark:text-sky-300',
    info: 'bg-slate-500/10 text-slate-700 border-slate-200 dark:text-slate-300',
};
const RESULT_STYLES = { success: 'text-emerald-700 dark:text-emerald-400', denied: 'text-red-700 dark:text-red-400', failed: 'text-orange-700 dark:text-orange-400' };

export function SeverityBadge({ severity }: { severity: Severity }) {
    return <span className={cn('inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-bold', SEVERITY_STYLES[severity])}>{SEVERITY_LABELS[severity]}</span>;
}

export function TabelaAuditoria({ events, loading, onOpen }: { events: AuditEvent[]; loading: boolean; onOpen: (event: AuditEvent) => void }) {
    const [visible, setVisible] = useState<Set<ColumnId>>(() => {
        try { const saved = JSON.parse(localStorage.getItem(COLUMNS_KEY) || 'null'); if (Array.isArray(saved) && saved.length) return new Set(saved); } catch { /* preferência local */ }
        return new Set<ColumnId>(['timestamp', 'user', 'module', 'action', 'entity', 'result', 'severity', 'ip', 'summary']);
    });
    const [sort, setSort] = useState<{ id: ColumnId; dir: 'asc' | 'desc' }>({ id: 'timestamp', dir: 'desc' });
    const [pageSize, setPageSize] = useState(25);
    const [page, setPage] = useState(1);
    useEffect(() => { setPage(1); }, [events, pageSize]);
    const sorted = useMemo(() => {
        const column = COLUMNS.find(item => item.id === sort.id)!;
        return [...events].sort((a, b) => {
            const x = column.sort(a); const y = column.sort(b);
            const result = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'pt');
            return sort.dir === 'asc' ? result : -result;
        });
    }, [events, sort]);
    const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
    const current = Math.min(page, totalPages);
    const start = (current - 1) * pageSize;
    const rows = sorted.slice(start, start + pageSize);
    const columns = COLUMNS.filter(column => visible.has(column.id));
    const toggle = (id: ColumnId) => {
        const next = new Set(visible);
        if (next.has(id)) { if (next.size > 3) next.delete(id); } else next.add(id);
        setVisible(next);
        try { localStorage.setItem(COLUMNS_KEY, JSON.stringify([...next])); } catch { /* preferência local */ }
    };
    const cell = (event: AuditEvent, id: ColumnId) => {
        switch (id) {
            case 'seq': return <span className="font-mono text-xs text-muted-foreground">{event.seq ?? '—'}</span>;
            case 'timestamp': return (
                <span className="whitespace-nowrap font-mono text-xs font-medium tabular-nums" title={`${relativeTime(event.timestamp)} · hora de Angola`}>{formatAuditTimestamp(event.timestamp)}</span>
            );
            case 'user': return (
                <div className="flex min-w-0 items-center gap-2" title={`${event.userName}${event.role ? ` · ${ROLES[event.role]?.label || event.role}` : ''}`}>
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold uppercase text-primary">{event.userName.split(' ').map(part => part[0]).join('').slice(0, 2)}</div>
                    <div className="min-w-0">
                        <p className="max-w-[170px] truncate text-xs font-semibold">{event.userName}</p>
                        {event.role && <p className="max-w-[170px] truncate text-[10px] text-muted-foreground">{ROLES[event.role]?.label || event.role}</p>}
                    </div>
                </div>
            );
            case 'module': return <span className="whitespace-nowrap rounded bg-muted px-2 py-0.5 text-xs font-medium">{MODULE_LABELS[event.module]}</span>;
            case 'action': return <span className="whitespace-nowrap text-xs font-semibold">{ACTION_LABELS[event.action]}</span>;
            case 'entity': return event.entity ? (
                event.entity.link
                    ? <Link to={event.entity.link} onClick={clickEvent => clickEvent.stopPropagation()} className="block max-w-[180px] truncate text-xs font-semibold text-primary hover:underline" title={event.entity.label}>{event.entity.label}</Link>
                    : <span className="block max-w-[180px] truncate text-xs" title={event.entity.label}>{event.entity.label}</span>
            ) : <span className="text-xs text-muted-foreground">—</span>;
            case 'result': return <span className={cn('text-xs font-bold', RESULT_STYLES[event.result])}>{RESULT_LABELS[event.result]}</span>;
            case 'severity': return <SeverityBadge severity={event.severity} />;
            case 'ip': return <span className="whitespace-nowrap font-mono text-xs text-muted-foreground">{event.ip || '—'}</span>;
            case 'summary': return <p className="line-clamp-2 max-w-[420px] text-xs text-muted-foreground" title={event.summary}>{event.summary}</p>;
        }
    };
    return (
        <div className="card-elevated overflow-hidden">
            <div className="flex items-center justify-between gap-2 border-b px-4 py-2.5">
                <p className="text-sm text-muted-foreground">Clique num registo para ver o detalhe, a comparação antes/depois e os eventos relacionados.</p>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild><Button size="sm" variant="outline" className="h-8 gap-1.5"><Columns3 className="h-3.5 w-3.5" /> Colunas</Button></DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-52">
                        <DropdownMenuLabel>Colunas visíveis</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        {COLUMNS.map(column => (
                            <DropdownMenuCheckboxItem key={column.id} checked={visible.has(column.id)} onCheckedChange={() => toggle(column.id)} onSelect={event => event.preventDefault()}>{column.label}</DropdownMenuCheckboxItem>
                        ))}
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
            <div className="overflow-x-auto">
                <Table>
                    <TableHeader>
                        <TableRow className="bg-muted/50">
                            {columns.map(column => {
                                const active = sort.id === column.id;
                                const Icon = !active ? ArrowUpDown : sort.dir === 'asc' ? ArrowUp : ArrowDown;
                                return (
                                    <TableHead key={column.id} className="whitespace-nowrap">
                                        <button type="button" className={cn('inline-flex items-center gap-1 font-semibold hover:text-foreground', active && 'text-foreground')}
                                            onClick={() => setSort(previous => ({ id: column.id, dir: previous.id === column.id && previous.dir === 'desc' ? 'asc' : 'desc' }))}>
                                            {column.label}<Icon className="h-3 w-3" />
                                        </button>
                                    </TableHead>
                                );
                            })}
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading ? Array.from({ length: 8 }, (_, index) => (
                            <TableRow key={index}><TableCell colSpan={columns.length}><Skeleton className="h-8 w-full" /></TableCell></TableRow>
                        )) : !rows.length ? (
                            <TableRow><TableCell colSpan={columns.length} className="py-14">
                                <div className="flex flex-col items-center gap-2 text-center text-muted-foreground"><Inbox className="h-10 w-10 opacity-60" /><p className="font-semibold text-foreground">Nenhum registo encontrado</p><p className="text-sm">Ajuste o período ou os filtros.</p></div>
                            </TableCell></TableRow>
                        ) : rows.map(event => (
                            <TableRow key={event.id} onClick={() => onOpen(event)} className={cn('cursor-pointer', event.severity === 'critical' && 'bg-red-50/60 dark:bg-red-500/5')}>
                                {columns.map(column => <TableCell key={column.id} className="py-2.5">{cell(event, column.id)}</TableCell>)}
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-muted/20 px-4 py-3">
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                    <span>Mostrando <b>{sorted.length ? start + 1 : 0}</b> a <b>{Math.min(sorted.length, start + pageSize)}</b> de <b>{sorted.length.toLocaleString('pt-AO')}</b> registos</span>
                    <Select value={String(pageSize)} onValueChange={value => setPageSize(Number(value))}>
                        <SelectTrigger className="h-8 w-[150px] bg-background"><SelectValue /></SelectTrigger>
                        <SelectContent>{[10, 25, 50, 100].map(size => <SelectItem key={size} value={String(size)}>{size} por página</SelectItem>)}</SelectContent>
                    </Select>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" className="h-8 w-8 p-0" disabled={current === 1} onClick={() => setPage(current - 1)} aria-label="Página anterior"><ChevronLeft className="h-4 w-4" /></Button>
                    <span className="text-sm font-medium">Página {current} de {totalPages}</span>
                    <Button variant="outline" size="sm" className="h-8 w-8 p-0" disabled={current === totalPages} onClick={() => setPage(current + 1)} aria-label="Página seguinte"><ChevronRight className="h-4 w-4" /></Button>
                </div>
            </div>
        </div>
    );
}
