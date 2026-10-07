import { useEffect, useMemo, useState, type ReactNode } from 'react';
import * as XLSX from 'xlsx';
import { ArrowDownUp, BellRing, ChevronLeft, ChevronRight, Columns3, FileSpreadsheet, Loader2, Search, SlidersHorizontal, UserCog, X } from 'lucide-react';
import { cn } from '@/bibliotecas/utils';
import { formatCurrency } from '@/bibliotecas/formatters';
import { AGING_LABELS, STAGES, STAGE_TABS, type PortfolioRow } from '@/bibliotecas/carteira-credito';
import { getWhatsAppLink } from '@/bibliotecas/whatsapp';
import { Button } from '@/componentes/ui/button';
import { Input } from '@/componentes/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/componentes/ui/dialog';
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/componentes/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/componentes/ui/select';
import { Textarea } from '@/componentes/ui/textarea';
import { ServicoCarteira } from '@/servicos/ServicoCarteira';
import { FiltrosCarteira } from './FiltrosCarteira';
import type { CarteiraState } from './useCarteira';

const kz = (minor: number) => formatCurrency(minor / 100);
type ColumnId = 'reference' | 'client' | 'product' | 'manager' | 'granted' | 'outstanding' | 'rate' | 'installment' | 'progress' | 'nextDue' | 'days' | 'mora' | 'risk' | 'stage';
const COLUMNS: Array<{ id: ColumnId; label: string; numeric?: boolean; sort: (row: PortfolioRow) => string | number }> = [
    { id: 'reference', label: 'Referência', sort: row => row.reference },
    { id: 'client', label: 'Cliente', sort: row => row.clientName.toLowerCase() },
    { id: 'product', label: 'Produto', sort: row => row.product },
    { id: 'manager', label: 'Gestor', sort: row => row.managerName },
    { id: 'granted', label: 'Capital concedido', numeric: true, sort: row => row.grantedMinor },
    { id: 'outstanding', label: 'Capital em dívida', numeric: true, sort: row => row.outstandingMinor },
    { id: 'rate', label: 'TAN', numeric: true, sort: row => row.rate },
    { id: 'installment', label: 'Prestação', numeric: true, sort: row => row.installmentMinor },
    { id: 'progress', label: 'Progresso', sort: row => row.totalCount ? row.paidCount / row.totalCount : 0 },
    { id: 'nextDue', label: 'Próximo vencimento', sort: row => row.nextDueKey || '9999' },
    { id: 'days', label: 'Dias de atraso', numeric: true, sort: row => row.daysOverdue },
    { id: 'mora', label: 'Mora', numeric: true, sort: row => row.moraMinor },
    { id: 'risk', label: 'Risco', sort: row => ({ low: 0, medium: 1, high: 2 } as Record<string, number>)[row.riskLevel] ?? 0 },
    { id: 'stage', label: 'Estado', sort: row => STAGES[row.stage].label },
];
const RISK: Record<string, { label: string; css: string }> = {
    low: { label: 'Baixo', css: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200' },
    medium: { label: 'Médio', css: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200' },
    high: { label: 'Alto', css: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200' },
};
/** Escalões de atraso: 1–30, 31–60, 61–90 e mais de 90 dias. */
const AGING_ROW: Record<string, string> = {
    '1-30': 'bg-amber-50/70 border-l-4 border-l-amber-400 dark:bg-amber-950/20',
    '31-60': 'bg-orange-50/80 border-l-4 border-l-orange-500 dark:bg-orange-950/25',
    '61-90': 'bg-red-50/80 border-l-4 border-l-red-500 dark:bg-red-950/25',
    '90+': 'bg-red-100/80 border-l-4 border-l-red-800 dark:bg-red-950/50',
};
const STORAGE = 'creditos_colunas';
const readColumns = (): ColumnId[] => { try { const value = JSON.parse(localStorage.getItem(STORAGE) || 'null'); return Array.isArray(value) && value.length ? value : COLUMNS.map(item => item.id); } catch { return COLUMNS.map(item => item.id); } };
const dateLabel = (key: string | null) => key ? key.split('-').reverse().join('/') : '—';

export function TabelaCarteira({ state, renderActions, onOpen, clientsById, currentUser }: {
    state: CarteiraState;
    renderActions: (row: PortfolioRow) => ReactNode;
    onOpen: (row: PortfolioRow) => void;
    clientsById: Map<string, { phone?: string }>;
    currentUser: { id: string; name: string; role: string; permissions?: string[] } | null;
}) {
    const [columns, setColumns] = useState<ColumnId[]>(readColumns);
    const [sort, setSort] = useState<{ id: ColumnId; dir: 'asc' | 'desc' }>({ id: 'days', dir: 'desc' });
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(25);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [filtersOpen, setFiltersOpen] = useState(false);
    const [bulk, setBulk] = useState<'reminder' | 'assign' | null>(null);
    useEffect(() => { try { localStorage.setItem(STORAGE, JSON.stringify(columns)); } catch { /* sem armazenamento */ } }, [columns]);
    useEffect(() => { setPage(1); }, [state.filters, state.tab, state.card, state.view, state.month, state.year]);

    const sorted = useMemo(() => {
        const column = COLUMNS.find(item => item.id === sort.id)!;
        return [...state.visibleRows].sort((a, b) => {
            const left = column.sort(a), right = column.sort(b);
            const order = left < right ? -1 : left > right ? 1 : 0;
            return sort.dir === 'asc' ? order : -order;
        });
    }, [state.visibleRows, sort]);
    const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
    const current = Math.min(page, pages);
    const pageRows = sorted.slice((current - 1) * pageSize, current * pageSize);
    const totals = useMemo(() => sorted.reduce((sum, row) => ({ granted: sum.granted + row.grantedMinor, outstanding: sum.outstanding + row.outstandingMinor, mora: sum.mora + row.moraMinor, overdue: sum.overdue + row.overdueMinor }), { granted: 0, outstanding: 0, mora: 0, overdue: 0 }), [sorted]);
    const visible = COLUMNS.filter(item => columns.includes(item.id));
    const selectedRows = sorted.filter(row => selected.has(row.id));
    const allOnPage = pageRows.length > 0 && pageRows.every(row => selected.has(row.id));

    const exportRows = (rows: PortfolioRow[]) => {
        const data = rows.map(row => ({
            'Referência': row.reference, 'Cliente': row.clientName, 'Produto': row.product, 'Gestor': row.managerName, 'Agência': row.branchName,
            'Capital concedido (Kz)': row.grantedMinor / 100, 'Capital em dívida (Kz)': row.outstandingMinor / 100, 'TAN (%)': row.rate, 'Prestação (Kz)': row.installmentMinor / 100,
            'Prestações pagas': `${row.paidCount}/${row.totalCount}`, 'Próximo vencimento': dateLabel(row.nextDueKey), 'Dias de atraso': row.daysOverdue,
            'Escalão de atraso': AGING_LABELS[row.aging], 'Mora (Kz)': row.moraMinor / 100, 'Risco': RISK[row.riskLevel]?.label || row.riskLevel, 'Estado': STAGES[row.stage].label,
        }));
        const sheet = XLSX.utils.json_to_sheet(data);
        sheet['!cols'] = Object.keys(data[0] || { a: 1 }).map(key => ({ wch: Math.max(12, key.length + 2) }));
        const book = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(book, sheet, 'Créditos');
        XLSX.writeFile(book, `creditos-${state.view}-${state.today}.xlsx`);
    };
    const SortHead = ({ column }: { column: typeof COLUMNS[number] }) => (
        <th className={cn('whitespace-nowrap p-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground', column.numeric ? 'text-right' : 'text-left')}>
            <button type="button" onClick={() => setSort(previous => ({ id: column.id, dir: previous.id === column.id && previous.dir === 'desc' ? 'asc' : 'desc' }))} className="inline-flex items-center gap-1 hover:text-foreground">
                {column.label}<ArrowDownUp className={cn('h-3 w-3', sort.id === column.id ? 'text-primary' : 'opacity-40')} />
            </button>
        </th>
    );
    const cell = (row: PortfolioRow, id: ColumnId): ReactNode => {
        switch (id) {
            case 'reference': return <span className="font-mono text-xs font-semibold" title={row.id}>{row.reference}</span>;
            case 'client': return <span className="font-medium">{row.clientName}</span>;
            case 'product': return <span className="text-xs">{row.product}</span>;
            case 'manager': return <span className="text-xs">{row.managerName}</span>;
            case 'granted': return kz(row.grantedMinor);
            case 'outstanding': return <span className="font-semibold">{kz(row.outstandingMinor)}</span>;
            case 'rate': return `${row.rate.toLocaleString('pt-AO')}%`;
            case 'installment': return row.installmentMinor ? kz(row.installmentMinor) : '—';
            case 'progress': {
                const value = row.totalCount ? Math.round((row.paidCount / row.totalCount) * 100) : 0;
                return (
                    <div className="w-28" title={`${row.paidCount} de ${row.totalCount} prestações pagas`}>
                        <div className="mb-1 flex justify-between text-[10px] font-bold"><span className="text-muted-foreground">{row.paidCount}/{row.totalCount}</span><span className={value >= 100 ? 'text-success' : 'text-primary'}>{value}%</span></div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className={cn('h-full rounded-full', value >= 100 ? 'bg-emerald-500' : 'bg-primary')} style={{ width: `${value}%` }} /></div>
                    </div>
                );
            }
            case 'nextDue': return <span className="text-xs">{dateLabel(row.nextDueKey)}{row.nextDueMinor > 0 && <span className="block text-muted-foreground">{kz(row.nextDueMinor)}</span>}</span>;
            case 'days': return row.daysOverdue > 0 ? <span className="font-bold text-red-700 dark:text-red-400" title={AGING_LABELS[row.aging]}>{row.daysOverdue}</span> : <span className="text-muted-foreground">0</span>;
            case 'mora': return row.moraMinor > 0 ? <span className="font-semibold text-red-700 dark:text-red-400">{kz(row.moraMinor)}</span> : '—';
            case 'risk': return <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', RISK[row.riskLevel]?.css)}>{RISK[row.riskLevel]?.label || row.riskLevel}</span>;
            case 'stage': return <span className={cn('inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-bold', STAGES[row.stage].badge)}><span className={cn('h-1.5 w-1.5 rounded-full', STAGES[row.stage].dot)} />{STAGES[row.stage].label}</span>;
        }
    };

    return (
        <div className="space-y-3">
            <div className="flex gap-1.5 overflow-x-auto pb-1" role="tablist" aria-label="Estados">
                {STAGE_TABS.map(item => (
                    <button key={item.id} type="button" role="tab" aria-selected={state.tab === item.id} onClick={() => state.setTab(item.id)}
                        className={cn('whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors', state.tab === item.id ? 'border-primary bg-primary text-primary-foreground' : 'bg-card hover:bg-muted')}>
                        {item.label} <span className={cn('ml-1 rounded-full px-1.5 text-[10px]', state.tab === item.id ? 'bg-white/20' : 'bg-muted')}>{state.tabCounts[item.id] ?? 0}</span>
                    </button>
                ))}
            </div>

            <div className="flex flex-col gap-2 rounded-lg border border-border/50 bg-muted/20 p-3 md:flex-row md:items-center md:justify-between">
                <div className="flex flex-1 flex-wrap items-center gap-2">
                    <div className="relative w-full sm:w-80">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input value={state.filters.search} onChange={event => state.setFilters(previous => ({ ...previous, search: event.target.value }))} placeholder="Pesquisar referência, cliente, gestor ou produto…" className="pl-10" />
                    </div>
                    <Button variant="outline" size="sm" className="h-10 gap-1.5" onClick={() => setFiltersOpen(true)}><SlidersHorizontal className="h-4 w-4" /> Filtros</Button>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild><Button variant="outline" size="sm" className="h-10 gap-1.5"><Columns3 className="h-4 w-4" /> Colunas</Button></DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="w-56">
                            <DropdownMenuLabel>Colunas visíveis</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            {COLUMNS.map(item => (
                                <DropdownMenuCheckboxItem key={item.id} checked={columns.includes(item.id)} onSelect={event => event.preventDefault()}
                                    onCheckedChange={checked => setColumns(previous => checked ? COLUMNS.map(column => column.id).filter(id => previous.includes(id) || id === item.id) : previous.filter(id => id !== item.id))}>
                                    {item.label}
                                </DropdownMenuCheckboxItem>
                            ))}
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
                {selectedRows.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-1.5">
                        <span className="text-xs font-bold">{selectedRows.length} selecionado(s)</span>
                        <Button size="sm" variant="outline" className="h-8 gap-1" onClick={() => exportRows(selectedRows)}><FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" /> Exportar</Button>
                        <Button size="sm" variant="outline" className="h-8 gap-1" onClick={() => setBulk('reminder')}><BellRing className="h-3.5 w-3.5" /> Enviar lembretes</Button>
                        <Button size="sm" variant="outline" className="h-8 gap-1" onClick={() => setBulk('assign')}><UserCog className="h-3.5 w-3.5" /> Atribuir a gestor</Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Limpar seleção" onClick={() => setSelected(new Set())}><X className="h-4 w-4" /></Button>
                    </div>
                )}
            </div>

            {state.stale && <p role="status" className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">A sincronizar: a lista pode não mostrar as últimas alterações feitas noutros dispositivos.</p>}

            <div className="card-elevated overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-muted/50">
                            <tr>
                                <th className="w-10 p-3"><input type="checkbox" aria-label="Selecionar a página" checked={allOnPage} onChange={() => setSelected(previous => {
                                    const next = new Set(previous);
                                    if (allOnPage) pageRows.forEach(row => next.delete(row.id)); else pageRows.forEach(row => next.add(row.id));
                                    return next;
                                })} className="h-4 w-4 accent-[hsl(var(--primary))]" /></th>
                                {visible.map(column => <SortHead key={column.id} column={column} />)}
                                <th className="w-12" />
                            </tr>
                        </thead>
                        <tbody>
                            {state.loading && !pageRows.length ? (
                                <tr><td colSpan={visible.length + 2} className="p-12 text-center text-muted-foreground"><Loader2 className="mx-auto mb-2 h-6 w-6 animate-spin" /> A calcular a carteira…</td></tr>
                            ) : !pageRows.length ? (
                                <tr><td colSpan={visible.length + 2} className="p-12 text-center text-muted-foreground">
                                    <p className="text-base font-medium">Nenhum crédito com estes critérios</p>
                                    <p className="text-sm">{state.view === 'producao' ? 'Não há créditos concedidos neste mês.' : 'Ajuste os filtros, o separador ou o card selecionado.'}</p>
                                </td></tr>
                            ) : pageRows.map(row => (
                                <tr key={row.id} onClick={() => onOpen(row)} className={cn('cursor-pointer border-t transition-colors hover:bg-muted/40', AGING_ROW[row.aging])}>
                                    <td className="p-3" onClick={event => event.stopPropagation()}>
                                        <input type="checkbox" aria-label={`Selecionar ${row.reference}`} checked={selected.has(row.id)} className="h-4 w-4 accent-[hsl(var(--primary))]"
                                            onChange={() => setSelected(previous => { const next = new Set(previous); if (next.has(row.id)) next.delete(row.id); else next.add(row.id); return next; })} />
                                    </td>
                                    {visible.map(column => <td key={column.id} className={cn('p-3 align-middle', column.numeric && 'whitespace-nowrap text-right')}>{cell(row, column.id)}</td>)}
                                    <td className="p-2" onClick={event => event.stopPropagation()}>{renderActions(row)}</td>
                                </tr>
                            ))}
                        </tbody>
                        {sorted.length > 0 && (
                            <tfoot className="border-t-2 bg-muted/40 text-sm font-bold">
                                <tr>
                                    <td className="p-3" />
                                    {visible.map(column => (
                                        <td key={column.id} className={cn('p-3', column.numeric && 'whitespace-nowrap text-right')}>
                                            {column.id === 'reference' ? `${sorted.length} crédito(s)` : column.id === 'granted' ? kz(totals.granted) : column.id === 'outstanding' ? kz(totals.outstanding)
                                                : column.id === 'mora' ? kz(totals.mora) : column.id === 'days' ? <span className="text-xs font-semibold text-red-700 dark:text-red-400" title="Valor em atraso">{kz(totals.overdue)}</span> : null}
                                        </td>
                                    ))}
                                    <td />
                                </tr>
                            </tfoot>
                        )}
                    </table>
                </div>
                <div className="flex flex-col gap-2 border-t bg-muted/20 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm text-muted-foreground">Mostrando <strong>{sorted.length ? (current - 1) * pageSize + 1 : 0}</strong> a <strong>{Math.min(sorted.length, current * pageSize)}</strong> de <strong>{sorted.length}</strong> créditos</p>
                    <div className="flex items-center gap-2">
                        <Select value={String(pageSize)} onValueChange={value => setPageSize(Number(value))}>
                            <SelectTrigger className="h-8 w-[110px]"><SelectValue /></SelectTrigger>
                            <SelectContent>{[10, 25, 50, 100].map(size => <SelectItem key={size} value={String(size)}>{size} por página</SelectItem>)}</SelectContent>
                        </Select>
                        <Button variant="outline" size="sm" className="h-8 w-8 p-0" aria-label="Página anterior" disabled={current === 1} onClick={() => setPage(current - 1)}><ChevronLeft className="h-4 w-4" /></Button>
                        <span className="text-sm font-medium">Página {current} de {pages}</span>
                        <Button variant="outline" size="sm" className="h-8 w-8 p-0" aria-label="Página seguinte" disabled={current === pages} onClick={() => setPage(current + 1)}><ChevronRight className="h-4 w-4" /></Button>
                    </div>
                </div>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 px-1 text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1.5"><span className="h-3 w-1 rounded bg-amber-400" /> 1–30 dias</span>
                <span className="flex items-center gap-1.5"><span className="h-3 w-1 rounded bg-orange-500" /> 31–60 dias</span>
                <span className="flex items-center gap-1.5"><span className="h-3 w-1 rounded bg-red-500" /> 61–90 dias</span>
                <span className="flex items-center gap-1.5"><span className="h-3 w-1 rounded bg-red-800" /> Mais de 90 dias</span>
                <span>Clique numa linha para abrir a ficha do crédito.</span>
            </div>

            <FiltrosCarteira state={state} open={filtersOpen} onClose={() => setFiltersOpen(false)} />
            <AcoesEmMassa kind={bulk} rows={selectedRows} users={state.users} clientsById={clientsById} currentUser={currentUser}
                onClose={() => setBulk(null)} onDone={() => { setSelected(new Set()); setBulk(null); void state.reloadContext(); }} />
        </div>
    );
}

function AcoesEmMassa({ kind, rows, users, clientsById, currentUser, onClose, onDone }: {
    kind: 'reminder' | 'assign' | null; rows: PortfolioRow[]; users: Array<{ id: string; name: string; role: string }>;
    clientsById: Map<string, { phone?: string }>; currentUser: { id: string; name: string; role: string; permissions?: string[] } | null;
    onClose: () => void; onDone: () => void;
}) {
    const [channel, setChannel] = useState<'WhatsApp' | 'SMS'>('WhatsApp');
    const [target, setTarget] = useState('');
    const [reason, setReason] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [links, setLinks] = useState<Array<{ name: string; href: string }>>([]);
    const message = (row: PortfolioRow) => `Olá ${row.clientName}, lembramos que a prestação do seu crédito ${row.reference} ${row.daysOverdue > 0 ? `está em atraso há ${row.daysOverdue} dia(s)` : `vence a ${dateLabel(row.nextDueKey)}`}: ${kz(row.nextDueMinor || row.overdueMinor)}. Obrigado.`;
    const run = async () => {
        if (!currentUser) return;
        setBusy(true); setError('');
        try {
            if (kind === 'reminder') {
                await ServicoCarteira.recordReminders(rows.map(row => row.id), channel, currentUser);
                setLinks(rows.map(row => {
                    const phone = clientsById.get(row.clientId)?.phone || '';
                    return { name: row.clientName, href: channel === 'WhatsApp' ? getWhatsAppLink(phone, message(row)) : `sms:${phone}?body=${encodeURIComponent(message(row))}` };
                }));
            } else {
                const user = users.find(item => item.id === target);
                if (!user) throw new Error('Escolha o gestor.');
                await ServicoCarteira.transferManager(rows.map(row => row.id), user, reason, currentUser);
                onDone();
            }
        } catch (cause: any) { setError(cause?.message || 'Não foi possível concluir.'); } finally { setBusy(false); }
    };
    return (
        <Dialog open={!!kind} onOpenChange={open => { if (!open && !busy) { setLinks([]); setError(''); onClose(); } }}>
            <DialogContent className="max-w-xl">
                <DialogHeader>
                    <DialogTitle>{kind === 'reminder' ? 'Enviar lembretes de pagamento' : 'Atribuir a gestor'}</DialogTitle>
                    <DialogDescription>{rows.length} crédito(s) selecionado(s). {kind === 'reminder' ? 'Cada lembrete fica registado no histórico de cobrança (Hub de Cobrança).' : 'A transferência fica no histórico do crédito e na auditoria.'}</DialogDescription>
                </DialogHeader>
                {kind === 'reminder' ? (links.length ? (
                    <div className="max-h-72 space-y-1.5 overflow-y-auto">
                        <p className="text-sm font-semibold text-emerald-700">Lembretes registados. Abra cada mensagem para enviar:</p>
                        {links.map(link => <a key={link.name + link.href} href={link.href} target="_blank" rel="noreferrer" className="block rounded-md border px-3 py-2 text-sm hover:bg-muted">{link.name} — abrir {channel}</a>)}
                    </div>
                ) : (
                    <div className="space-y-2">
                        <Select value={channel} onValueChange={value => setChannel(value as 'WhatsApp' | 'SMS')}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent><SelectItem value="WhatsApp">WhatsApp</SelectItem><SelectItem value="SMS">SMS</SelectItem></SelectContent>
                        </Select>
                        <p className="rounded-md bg-muted/50 p-2 text-xs">Exemplo: {rows[0] ? message(rows[0]) : ''}</p>
                    </div>
                )) : (
                    <div className="space-y-3">
                        <Select value={target} onValueChange={setTarget}>
                            <SelectTrigger><SelectValue placeholder="Escolha o novo gestor" /></SelectTrigger>
                            <SelectContent>{users.map(user => <SelectItem key={user.id} value={user.id}>{user.name}</SelectItem>)}</SelectContent>
                        </Select>
                        <Textarea rows={3} value={reason} onChange={event => setReason(event.target.value)} placeholder="Motivo (obrigatório): ex.: redistribuição da carteira da agência Maianga por saída do gestor titular." />
                    </div>
                )}
                {error && <p className="text-sm text-destructive">{error}</p>}
                <DialogFooter>
                    {links.length ? <Button onClick={onDone}>Concluir</Button> : <>
                        <Button variant="outline" disabled={busy} onClick={onClose}>Cancelar</Button>
                        <Button disabled={busy || (kind === 'assign' && (!target || reason.trim().length < 20))} onClick={() => void run()}>{busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}{kind === 'reminder' ? 'Registar e preparar mensagens' : 'Atribuir'}</Button>
                    </>}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
