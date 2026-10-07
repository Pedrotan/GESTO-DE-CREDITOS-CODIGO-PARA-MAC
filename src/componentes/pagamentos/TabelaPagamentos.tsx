import { Fragment, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDown, ArrowUp, ArrowUpDown, CheckCheck, ChevronDown, ChevronLeft, ChevronRight, Columns3, Download, Inbox, Plus, Send } from 'lucide-react';
import { Badge } from '@/componentes/ui/badge';
import { Button } from '@/componentes/ui/button';
import { Checkbox } from '@/componentes/ui/checkbox';
import { Skeleton } from '@/componentes/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/componentes/ui/select';
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/componentes/ui/dropdown-menu';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/componentes/ui/table';
import { formatCurrency } from '@/bibliotecas/formatters';
import { formatLuandaDate, formatLuandaDateTime, formatRegistration } from '@/bibliotecas/fuso-angola';
import { cn } from '@/bibliotecas/utils';
import { PAYMENT_STATUS, groupRows, sumRows, type PaymentGroup, type PaymentRow } from '@/bibliotecas/pagamentos-analise';

export type ViewMode = 'payment' | 'credit' | 'client';
type ColumnId = 'receipt' | 'valueDate' | 'client' | 'contract' | 'installments' | 'principal' | 'interest' | 'late' | 'total' | 'method' | 'operator' | 'status';

const COLUMNS: Array<{ id: ColumnId; label: string; numeric?: boolean; sort: (row: PaymentRow) => string | number }> = [
    { id: 'receipt', label: 'N.º do recibo', sort: row => row.receipt || `~${row.id}` },
    { id: 'valueDate', label: 'Data-valor', sort: row => `${row.valueDateKey}${row.registeredAt}` },
    { id: 'client', label: 'Cliente', sort: row => row.clientName.toLowerCase() },
    { id: 'contract', label: 'Contrato', sort: row => row.contract },
    { id: 'installments', label: 'Prestação(ões)', sort: row => row.installments[0]?.n ?? 0 },
    { id: 'principal', label: 'Capital', numeric: true, sort: row => row.principal },
    { id: 'interest', label: 'Juros', numeric: true, sort: row => row.interest },
    { id: 'late', label: 'Mora', numeric: true, sort: row => row.late },
    { id: 'total', label: 'Total', numeric: true, sort: row => row.total },
    { id: 'method', label: 'Método', sort: row => row.methodLabel },
    { id: 'operator', label: 'Operador', sort: row => row.operator.toLowerCase() },
    { id: 'status', label: 'Estado', sort: row => row.status },
];
const COLUMNS_KEY = 'pagamentos:colunas';
const PAGE_KEY = 'pagamentos:linhas-por-pagina';

function readColumns(): Set<ColumnId> {
    try {
        const saved = JSON.parse(localStorage.getItem(COLUMNS_KEY) || 'null');
        if (Array.isArray(saved) && saved.length) return new Set(saved.filter((id: string) => COLUMNS.some(column => column.id === id)));
    } catch { /* preferência local */ }
    return new Set(COLUMNS.map(column => column.id));
}

function StatusBadge({ row }: { row: PaymentRow }) {
    const config = PAYMENT_STATUS[row.status];
    return <Badge variant={config?.variant || 'default'} className="whitespace-nowrap">{config?.label || row.status}</Badge>;
}

function Cells({ row, visible }: { row: PaymentRow; visible: Set<ColumnId> }) {
    const cancelled = row.status === 'cancelled';
    const money = (value: number) => <span className={cn('whitespace-nowrap tabular-nums', cancelled && 'text-muted-foreground line-through')}>{formatCurrency(value)}</span>;
    return (
        <>
            {visible.has('receipt') && <TableCell><span className="whitespace-nowrap font-mono text-xs font-semibold">{row.receipt || <span className="text-amber-600">Por validar</span>}</span></TableCell>}
            {visible.has('valueDate') && (
                <TableCell>
                    <p className="whitespace-nowrap text-sm">{formatLuandaDate(`${row.valueDateKey}T12:00:00Z`)}</p>
                    <p className="whitespace-nowrap text-[11px] text-muted-foreground" title="Data/hora de registo (hora de Angola)">reg. {formatRegistration(row.registeredAt)}</p>
                </TableCell>
            )}
            {visible.has('client') && <TableCell><p className="max-w-[220px] truncate font-medium" title={row.clientName}>{row.clientName}</p></TableCell>}
            {visible.has('contract') && (
                <TableCell>
                    <Link to={`/creditos?search=${encodeURIComponent(row.creditId)}`} onClick={event => event.stopPropagation()}
                        className="whitespace-nowrap font-mono text-xs font-semibold text-primary hover:underline" title="Abrir o crédito">{row.contract}</Link>
                </TableCell>
            )}
            {visible.has('installments') && <TableCell className="whitespace-nowrap text-sm">{row.status === 'pending' ? <span className="text-muted-foreground">na validação</span> : row.installmentsLabel}</TableCell>}
            {visible.has('principal') && <TableCell className="text-right">{money(row.principal)}</TableCell>}
            {visible.has('interest') && <TableCell className="text-right">{money(row.interest)}</TableCell>}
            {visible.has('late') && <TableCell className="text-right">{money(row.late)}</TableCell>}
            {visible.has('total') && <TableCell className="text-right font-semibold">{money(row.total)}</TableCell>}
            {visible.has('method') && <TableCell className="whitespace-nowrap text-sm">{row.methodLabel}</TableCell>}
            {visible.has('operator') && <TableCell className="max-w-[160px] truncate text-sm" title={row.operator}>{row.operator}</TableCell>}
            {visible.has('status') && <TableCell><StatusBadge row={row} /></TableCell>}
        </>
    );
}

export function TabelaPagamentos({ rows, view, loading, onOpen, onRegister, selected, onSelectedChange, onExportSelected, onSendReceipts, onValidateSelected, canValidate }: {
    rows: PaymentRow[];
    view: ViewMode;
    loading: boolean;
    onOpen: (row: PaymentRow) => void;
    onRegister: () => void;
    selected: Set<string>;
    onSelectedChange: (ids: Set<string>) => void;
    onExportSelected: (rows: PaymentRow[]) => void;
    onSendReceipts: (rows: PaymentRow[]) => void;
    onValidateSelected: (rows: PaymentRow[]) => void;
    canValidate: boolean;
}) {
    const [visible, setVisible] = useState<Set<ColumnId>>(readColumns);
    const [sort, setSort] = useState<{ id: ColumnId; dir: 'asc' | 'desc' }>({ id: 'valueDate', dir: 'desc' });
    const [pageSize, setPageSize] = useState(() => { try { return Number(localStorage.getItem(PAGE_KEY)) || 10; } catch { return 10; } });
    const [page, setPage] = useState(1);
    const [expanded, setExpanded] = useState<Set<string>>(new Set());

    useEffect(() => { setPage(1); }, [rows, view, pageSize]);
    const toggleColumn = (id: ColumnId) => {
        const next = new Set(visible);
        if (next.has(id)) { if (next.size > 2) next.delete(id); } else next.add(id);
        setVisible(next);
        try { localStorage.setItem(COLUMNS_KEY, JSON.stringify([...next])); } catch { /* preferência local */ }
    };

    const sorted = useMemo(() => {
        const column = COLUMNS.find(item => item.id === sort.id)!;
        return [...rows].sort((a, b) => {
            const x = column.sort(a); const y = column.sort(b);
            const result = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'pt');
            return sort.dir === 'asc' ? result : -result;
        });
    }, [rows, sort]);
    const groups: PaymentGroup[] = useMemo(() => view === 'payment' ? [] : groupRows(sorted, view === 'credit' ? 'credit' : 'client')
        .sort((a, b) => b.totals.total - a.totals.total), [sorted, view]);
    const units = view === 'payment' ? sorted.length : groups.length;
    const totalPages = Math.max(1, Math.ceil(units / pageSize));
    const current = Math.min(page, totalPages);
    const start = (current - 1) * pageSize;
    const pageRows = view === 'payment' ? sorted.slice(start, start + pageSize) : [];
    const pageGroups = view === 'payment' ? [] : groups.slice(start, start + pageSize);
    // Totais com os filtros aplicados: confirmados (iguais ao "Valor Arrecadado") e, à parte, os pendentes.
    const totals = useMemo(() => sumRows(rows.filter(row => row.status === 'confirmed')), [rows]);
    const pendingTotals = useMemo(() => sumRows(rows.filter(row => row.status === 'pending')), [rows]);
    const visibleColumns = COLUMNS.filter(column => visible.has(column.id));
    const firstNumeric = visibleColumns.findIndex(column => column.numeric);
    const selectedRows = rows.filter(row => selected.has(row.id));
    const pageIds = (view === 'payment' ? pageRows : pageGroups.flatMap(group => group.rows)).map(row => row.id);
    const allOnPage = pageIds.length > 0 && pageIds.every(id => selected.has(id));
    const setAll = (checked: boolean) => {
        const next = new Set(selected);
        for (const id of pageIds) { if (checked) next.add(id); else next.delete(id); }
        onSelectedChange(next);
    };
    const toggleRow = (id: string) => {
        const next = new Set(selected);
        if (next.has(id)) next.delete(id); else next.add(id);
        onSelectedChange(next);
    };
    const header = (id: ColumnId, label: string, numeric?: boolean) => {
        const active = sort.id === id;
        const Icon = !active ? ArrowUpDown : sort.dir === 'asc' ? ArrowUp : ArrowDown;
        return (
            <TableHead key={id} className={cn('whitespace-nowrap', numeric && 'text-right')}>
                <button type="button" className={cn('inline-flex items-center gap-1 font-semibold hover:text-foreground', active && 'text-foreground')}
                    onClick={() => setSort(previous => ({ id, dir: previous.id === id && previous.dir === 'desc' ? 'asc' : 'desc' }))}>
                    {label}<Icon className="h-3 w-3" />
                </button>
            </TableHead>
        );
    };
    const paymentRow = (row: PaymentRow, nested = false) => (
        <TableRow key={row.id} onClick={() => onOpen(row)} className={cn('cursor-pointer', nested && 'bg-muted/20', row.status === 'cancelled' && 'opacity-70')}
            data-state={selected.has(row.id) ? 'selected' : undefined}>
            <TableCell className="w-10" onClick={event => event.stopPropagation()}>
                <Checkbox checked={selected.has(row.id)} onCheckedChange={() => toggleRow(row.id)} aria-label={`Seleccionar ${row.receipt || row.id}`} />
            </TableCell>
            {view !== 'payment' && <TableCell className="w-8" />}
            <Cells row={row} visible={visible} />
        </TableRow>
    );
    const unitLabel = view === 'payment' ? 'pagamentos' : view === 'credit' ? 'contratos' : 'clientes';

    return (
        <div className="card-elevated overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5">
                {selectedRows.length ? (
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold">{selectedRows.length} seleccionado(s)</span>
                        <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => onExportSelected(selectedRows)}><Download className="h-3.5 w-3.5" /> Exportar seleccionados</Button>
                        <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => onSendReceipts(selectedRows)}><Send className="h-3.5 w-3.5" /> Enviar recibos</Button>
                        {canValidate && (
                            <Button size="sm" variant="outline" className="h-8 gap-1.5" disabled={!selectedRows.some(row => row.status === 'pending')} onClick={() => onValidateSelected(selectedRows.filter(row => row.status === 'pending'))}>
                                <CheckCheck className="h-3.5 w-3.5" /> Validar transferências pendentes
                            </Button>
                        )}
                        <Button size="sm" variant="ghost" className="h-8" onClick={() => onSelectedChange(new Set())}>Limpar selecção</Button>
                    </div>
                ) : <p className="text-sm text-muted-foreground">Clique numa linha para ver o detalhe, a imputação e o histórico.</p>}
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button size="sm" variant="outline" className="h-8 gap-1.5"><Columns3 className="h-3.5 w-3.5" /> Colunas</Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                        <DropdownMenuLabel>Colunas visíveis</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        {COLUMNS.map(column => (
                            <DropdownMenuCheckboxItem key={column.id} checked={visible.has(column.id)} onCheckedChange={() => toggleColumn(column.id)} onSelect={event => event.preventDefault()}>
                                {column.label}
                            </DropdownMenuCheckboxItem>
                        ))}
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
            <div className="overflow-x-auto">
                <Table>
                    <TableHeader>
                        <TableRow className="bg-muted/50">
                            <TableHead className="w-10"><Checkbox checked={allOnPage} onCheckedChange={value => setAll(Boolean(value))} aria-label="Seleccionar a página" /></TableHead>
                            {view !== 'payment' && <TableHead className="w-8" />}
                            {visibleColumns.map(column => header(column.id, column.label, column.numeric))}
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading ? Array.from({ length: 6 }, (_, index) => (
                            <TableRow key={`skeleton-${index}`}>
                                <TableCell colSpan={visibleColumns.length + 2}><Skeleton className="h-8 w-full" /></TableCell>
                            </TableRow>
                        )) : units === 0 ? (
                            <TableRow>
                                <TableCell colSpan={visibleColumns.length + 2} className="py-14">
                                    <div className="flex flex-col items-center gap-3 text-center">
                                        <Inbox className="h-10 w-10 text-muted-foreground/60" />
                                        <div>
                                            <p className="font-semibold">Nenhum pagamento encontrado</p>
                                            <p className="text-sm text-muted-foreground">Não há pagamentos no período e com os filtros escolhidos.</p>
                                        </div>
                                        <Button className="gap-2" onClick={onRegister}><Plus className="h-4 w-4" /> Registar pagamento</Button>
                                    </div>
                                </TableCell>
                            </TableRow>
                        ) : view === 'payment' ? pageRows.map(row => paymentRow(row)) : pageGroups.map(group => {
                            const open = expanded.has(group.key);
                            return (
                                <Fragment key={group.key}>
                                    <TableRow className="cursor-pointer bg-muted/40 hover:bg-muted/60" onClick={() => setExpanded(previous => { const next = new Set(previous); if (next.has(group.key)) next.delete(group.key); else next.add(group.key); return next; })}>
                                        <TableCell className="w-10" onClick={event => event.stopPropagation()}>
                                            <Checkbox checked={group.rows.every(row => selected.has(row.id))} aria-label={`Seleccionar ${group.label}`}
                                                onCheckedChange={value => { const next = new Set(selected); group.rows.forEach(row => value ? next.add(row.id) : next.delete(row.id)); onSelectedChange(next); }} />
                                        </TableCell>
                                        <TableCell className="w-8"><ChevronDown className={cn('h-4 w-4 transition-transform', !open && '-rotate-90')} /></TableCell>
                                        <TableCell colSpan={Math.max(1, firstNumeric < 0 ? visibleColumns.length : firstNumeric)}>
                                            <p className="font-semibold">{group.label}</p>
                                            <p className="text-xs text-muted-foreground">{group.sub ? `${group.sub} · ` : ''}{group.rows.length} pagamento(s)</p>
                                        </TableCell>
                                        {firstNumeric >= 0 && visibleColumns.slice(firstNumeric).map(column => (
                                            <TableCell key={column.id} className={cn(column.numeric && 'text-right font-semibold tabular-nums')}>
                                                {column.id === 'principal' ? formatCurrency(group.totals.principal) : column.id === 'interest' ? formatCurrency(group.totals.interest)
                                                    : column.id === 'late' ? formatCurrency(group.totals.late) : column.id === 'total' ? formatCurrency(group.totals.total) : ''}
                                            </TableCell>
                                        ))}
                                    </TableRow>
                                    {open && group.rows.map(row => paymentRow(row, true))}
                                </Fragment>
                            );
                        })}
                    </TableBody>
                    {!loading && units > 0 && (
                        <TableFooter>
                            {[{ label: `Total confirmado (${totals.count} ${totals.count === 1 ? 'pagamento' : 'pagamentos'})`, values: totals, muted: false },
                                ...(pendingTotals.count ? [{ label: `Pendentes de validação (${pendingTotals.count}) · não contam no arrecadado`, values: pendingTotals, muted: true }] : [])].map(line => (
                                <TableRow key={line.label} className={cn('bg-muted/60', line.muted ? 'text-sm font-medium text-muted-foreground' : 'font-bold')}>
                                    <TableCell colSpan={(view !== 'payment' ? 2 : 1) + Math.max(1, firstNumeric < 0 ? visibleColumns.length : firstNumeric)}>{line.label}</TableCell>
                                    {firstNumeric >= 0 && visibleColumns.slice(firstNumeric).map(column => (
                                        <TableCell key={column.id} className={cn(column.numeric && 'whitespace-nowrap text-right tabular-nums')}>
                                            {line.muted && column.id !== 'total' ? '' : column.id === 'principal' ? formatCurrency(line.values.principal) : column.id === 'interest' ? formatCurrency(line.values.interest)
                                                : column.id === 'late' ? formatCurrency(line.values.late) : column.id === 'total' ? formatCurrency(line.values.total) : ''}
                                        </TableCell>
                                    ))}
                                </TableRow>
                            ))}
                        </TableFooter>
                    )}
                </Table>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-muted bg-muted/20 px-4 py-3">
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                    <span>Mostrando <b>{units === 0 ? 0 : start + 1}</b> a <b>{Math.min(units, start + pageSize)}</b> de <b>{units}</b> {unitLabel}</span>
                    <Select value={String(pageSize)} onValueChange={value => { setPageSize(Number(value)); try { localStorage.setItem(PAGE_KEY, value); } catch { /* preferência local */ } }}>
                        <SelectTrigger className="h-8 w-[150px] bg-background"><SelectValue /></SelectTrigger>
                        <SelectContent>{[10, 25, 50, 100].map(size => <SelectItem key={size} value={String(size)}>{size} por página</SelectItem>)}</SelectContent>
                    </Select>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => setPage(Math.max(1, current - 1))} disabled={current === 1} aria-label="Página anterior"><ChevronLeft className="h-4 w-4" /></Button>
                    <span className="text-sm font-medium">Página {current} de {totalPages}</span>
                    <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => setPage(Math.min(totalPages, current + 1))} disabled={current === totalPages} aria-label="Página seguinte"><ChevronRight className="h-4 w-4" /></Button>
                </div>
            </div>
        </div>
    );
}
