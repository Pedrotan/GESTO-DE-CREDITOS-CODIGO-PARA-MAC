import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, FileSpreadsheet, FileText, FileWarning, SearchX, X } from 'lucide-react';
import { Badge } from '@/componentes/ui/badge';
import { Button } from '@/componentes/ui/button';
import { Checkbox } from '@/componentes/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/componentes/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/componentes/ui/table';
import { CONTRACT_STATES, kz, sumContracts, type ContractRow } from '@/bibliotecas/contratos-analise';

const PAGE_SIZES = [10, 25, 50, 100];
const RISK_TONE: Record<string, string> = {
    A: 'border-emerald-300 text-emerald-700 dark:text-emerald-300',
    B: 'border-amber-300 text-amber-700 dark:text-amber-300',
    C: 'border-red-300 text-red-700 dark:text-red-300',
};
const dateText = (key: string | null) => key ? `${key.slice(8, 10)}/${key.slice(5, 7)}/${key.slice(0, 4)}` : '—';

function NextInstallment({ row }: { row: ContractRow }) {
    if (row.state === 'liquidado') return <span className="text-xs text-muted-foreground">Liquidado</span>;
    if (!row.nextDueKey || row.daysToNext === null) return <span className="text-xs text-muted-foreground">—</span>;
    const late = row.daysToNext < 0;
    const soon = !late && row.daysToNext <= 7;
    const tone = late ? 'text-red-600 dark:text-red-400' : soon ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground';
    const label = late ? `${Math.abs(row.daysToNext)} d em atraso` : row.daysToNext === 0 ? 'Hoje' : `em ${row.daysToNext} d`;
    return (
        <div className="whitespace-nowrap">
            <p className="text-xs font-semibold">{dateText(row.nextDueKey)}</p>
            <p className="text-xs">{kz(row.nextDueMinor)}</p>
            <p className={`text-[11px] font-bold ${tone}`}>{label}</p>
        </div>
    );
}

/** Tabela completa de contratos: selecção, paginação e rodapé com os totais das linhas filtradas. */
export function TabelaContratos({ rows, onOpen, renderActions, onClearFilters, hasFilters, onExport }: {
    rows: ContractRow[];
    onOpen: (row: ContractRow) => void;
    renderActions: (row: ContractRow) => ReactNode;
    onClearFilters: () => void;
    hasFilters: boolean;
    onExport: (rows: ContractRow[], format: 'pdf' | 'xlsx') => void;
}) {
    const [pageSize, setPageSize] = useState(() => { try { return Number(localStorage.getItem('contratos:linhas')) || 25; } catch { return 25; } });
    const [page, setPage] = useState(0);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const pages = Math.max(1, Math.ceil(rows.length / pageSize));
    const current = Math.min(page, pages - 1);
    const pageRows = useMemo(() => rows.slice(current * pageSize, (current + 1) * pageSize), [rows, current, pageSize]);
    const totals = useMemo(() => sumContracts(rows), [rows]);
    const chosen = useMemo(() => rows.filter(row => selected.has(row.id)), [rows, selected]);

    useEffect(() => { setPage(0); setSelected(new Set()); }, [rows]);
    useEffect(() => { try { localStorage.setItem('contratos:linhas', String(pageSize)); } catch { /* preferência local */ } }, [pageSize]);

    const allOnPage = pageRows.length > 0 && pageRows.every(row => selected.has(row.id));
    const toggle = (id: string) => setSelected(previous => { const next = new Set(previous); if (next.has(id)) next.delete(id); else next.add(id); return next; });
    const togglePage = () => setSelected(previous => {
        const next = new Set(previous);
        pageRows.forEach(row => { if (allOnPage) next.delete(row.id); else next.add(row.id); });
        return next;
    });

    return (
        <div className="card-elevated overflow-hidden">
            {chosen.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 border-b bg-indigo-50 px-4 py-2 dark:bg-indigo-950/40">
                    <p className="mr-2 text-sm font-bold">{chosen.length} {chosen.length === 1 ? 'contrato seleccionado' : 'contratos seleccionados'}</p>
                    <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => onExport(chosen, 'pdf')}><FileText className="h-3.5 w-3.5" /> Exportar PDF</Button>
                    <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => onExport(chosen, 'xlsx')}><FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" /> Exportar Excel</Button>
                    {chosen.length < rows.length && <Button size="sm" variant="ghost" className="h-8" onClick={() => setSelected(new Set(rows.map(row => row.id)))}>Seleccionar os {rows.length}</Button>}
                    <Button size="sm" variant="ghost" className="h-8 gap-1" onClick={() => setSelected(new Set())}><X className="h-3.5 w-3.5" /> Limpar selecção</Button>
                </div>
            )}
            <div className="overflow-x-auto">
                <Table>
                    <TableHeader>
                        <TableRow className="bg-muted/50">
                            <TableHead className="w-10"><Checkbox checked={allOnPage} onCheckedChange={togglePage} aria-label="Seleccionar a página" /></TableHead>
                            <TableHead>Contrato</TableHead>
                            <TableHead>Cliente</TableHead>
                            <TableHead>Produto</TableHead>
                            <TableHead className="text-right">Montante</TableHead>
                            <TableHead className="min-w-[170px]">Reembolso</TableHead>
                            <TableHead>Próxima prestação</TableHead>
                            <TableHead>Estado</TableHead>
                            <TableHead className="text-right">Acções</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {rows.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={9} className="py-12 text-center">
                                    <SearchX className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
                                    <p className="text-sm font-semibold">Nenhum contrato corresponde aos filtros</p>
                                    {hasFilters && <Button variant="outline" size="sm" className="mt-3" onClick={onClearFilters}><X className="mr-1 h-4 w-4" /> Limpar filtros</Button>}
                                </TableCell>
                            </TableRow>
                        ) : pageRows.map(row => {
                            const progress = row.amountMinor > 0 ? Math.min(100, Math.round(((row.amountMinor - row.outstandingMinor) / row.amountMinor) * 100)) : 0;
                            return (
                                <TableRow key={row.id} data-state={selected.has(row.id) ? 'selected' : undefined} className="cursor-pointer" onClick={() => onOpen(row)}>
                                    <TableCell onClick={event => event.stopPropagation()}>
                                        <Checkbox checked={selected.has(row.id)} onCheckedChange={() => toggle(row.id)} aria-label={`Seleccionar ${row.number}`} />
                                    </TableCell>
                                    <TableCell className="whitespace-nowrap">
                                        <p className="font-mono text-xs font-bold" title={row.id}>{row.number}</p>
                                        <p className="text-[11px] text-muted-foreground">Início {dateText(row.startKey)}</p>
                                    </TableCell>
                                    <TableCell>
                                        <p className="font-semibold">{row.clientName}</p>
                                        <p className="text-[11px] text-muted-foreground">{row.nif || '—'}{row.phone ? ` · ${row.phone}` : ''}</p>
                                    </TableCell>
                                    <TableCell>
                                        <p className="text-xs font-semibold">{row.product}</p>
                                        <p className="text-[11px] text-muted-foreground">{row.rate ? `${String(row.rate).replace('.', ',')}%` : '—'} · {row.totalCount ? `${row.totalCount} prest.` : '—'}</p>
                                    </TableCell>
                                    <TableCell className="whitespace-nowrap text-right font-semibold">{kz(row.amountMinor)}</TableCell>
                                    <TableCell>
                                        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                                            <div className={`h-full rounded-full ${row.state === 'atraso' ? 'bg-orange-500' : 'bg-emerald-500'}`} style={{ width: `${progress}%` }} />
                                        </div>
                                        <p className="mt-1 text-[11px] text-muted-foreground">{row.totalCount ? `${row.paidCount}/${row.totalCount} pagas` : `${progress}%`} · saldo <span className="font-semibold text-foreground">{kz(row.outstandingMinor)}</span></p>
                                    </TableCell>
                                    <TableCell><NextInstallment row={row} /></TableCell>
                                    <TableCell>
                                        <div className="flex flex-wrap items-center gap-1">
                                            <span className={`rounded-md border px-2 py-0.5 text-[11px] font-bold ${CONTRACT_STATES[row.state].badge}`}>{CONTRACT_STATES[row.state].label}</span>
                                            <Badge variant="outline" className={`text-[10px] ${RISK_TONE[row.risk]}`} title="Classe de risco">Risco {row.risk}</Badge>
                                            {row.missingDocs.length > 0 && <span title={`Em falta: ${row.missingDocs.join(', ')}`}><FileWarning className="h-4 w-4 text-sky-600" /></span>}
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-right" onClick={event => event.stopPropagation()}>{renderActions(row)}</TableCell>
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-muted/30 px-4 py-3 text-xs">
                <p className="text-muted-foreground">
                    <span className="font-bold text-foreground">{totals.count}</span> {totals.count === 1 ? 'contrato' : 'contratos'} ·
                    contratado <span className="font-bold text-foreground">{kz(totals.amountMinor)}</span> ·
                    saldo <span className="font-bold text-foreground">{kz(totals.outstandingMinor)}</span> ·
                    em atraso <span className="font-bold text-orange-600">{kz(totals.overdueMinor)}</span>
                </p>
                <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Linhas</span>
                    <Select value={String(pageSize)} onValueChange={value => { setPageSize(Number(value)); setPage(0); }}>
                        <SelectTrigger className="h-8 w-20"><SelectValue /></SelectTrigger>
                        <SelectContent>{PAGE_SIZES.map(size => <SelectItem key={size} value={String(size)}>{size}</SelectItem>)}</SelectContent>
                    </Select>
                    <span className="text-muted-foreground">Página {current + 1} de {pages}</span>
                    <Button variant="outline" size="icon" className="h-8 w-8" disabled={current === 0} onClick={() => setPage(current - 1)} aria-label="Página anterior"><ChevronLeft className="h-4 w-4" /></Button>
                    <Button variant="outline" size="icon" className="h-8 w-8" disabled={current >= pages - 1} onClick={() => setPage(current + 1)} aria-label="Página seguinte"><ChevronRight className="h-4 w-4" /></Button>
                </div>
            </div>
        </div>
    );
}
