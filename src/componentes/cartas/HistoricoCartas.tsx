import { useEffect, useMemo, useState } from 'react';
import { ArrowDownUp, ChevronLeft, ChevronRight, Download, Edit3, Eye, History, Printer, ScrollText, Search, Trash2 } from 'lucide-react';
import { Button } from '@/componentes/ui/button';
import { Badge } from '@/componentes/ui/badge';
import { Input } from '@/componentes/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/componentes/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/componentes/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/componentes/ui/dialog';
import { formatCurrency, formatDate, formatDateTime } from '@/bibliotecas/formatters';
import type { CartaTransferencia } from '@/servicos/ServicoCartasTransferencia';

type Grupo = {
    key: string;
    clientName: string;
    clientNif?: string;
    letters: CartaTransferencia[];
    banks: string[];
    last: CartaTransferencia;
};

type Ordenacao = 'recent' | 'name' | 'count';
const PAGE_SIZE = 10;

/**
 * Histórico das cartas agrupado por cliente: uma linha por cliente com o número de cartas emitidas e a
 * mais recente; "Ver histórico" abre todas as cartas desse cliente.
 */
export function HistoricoCartas({ letters, currency, onEdit, onDownload, onPrint, onDelete }: {
    letters: CartaTransferencia[];
    currency?: string;
    onEdit: (letter: CartaTransferencia) => void;
    onDownload: (letter: CartaTransferencia) => void;
    onPrint: (letter: CartaTransferencia) => void;
    onDelete: (letter: CartaTransferencia) => void;
}) {
    const [search, setSearch] = useState('');
    const [bank, setBank] = useState('all');
    const [order, setOrder] = useState<Ordenacao>('recent');
    const [page, setPage] = useState(1);
    const [openKey, setOpenKey] = useState<string | null>(null);

    const groups = useMemo<Grupo[]>(() => {
        const map = new Map<string, CartaTransferencia[]>();
        for (const letter of letters) {
            const key = letter.clientId || letter.clientNif || letter.clientName || letter.id;
            map.set(key, [...(map.get(key) || []), letter]);
        }
        return [...map.entries()].map(([key, list]) => {
            const sorted = [...list].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
            return {
                key, letters: sorted, last: sorted[0],
                clientName: sorted[0].clientName || 'Cliente',
                clientNif: sorted.find(letter => letter.clientNif)?.clientNif,
                banks: [...new Set(sorted.map(letter => letter.bankDestinationName).filter(Boolean))],
            };
        });
    }, [letters]);

    const banks = useMemo(() => [...new Set(letters.map(letter => letter.bankDestinationName).filter(Boolean))].sort(), [letters]);

    const rows = useMemo(() => {
        const query = search.trim().toLowerCase();
        return groups
            .filter(group => bank === 'all' || group.banks.includes(bank))
            .filter(group => !query || [group.clientName, group.clientNif, ...group.banks, ...group.letters.map(letter => letter.creditReference)]
                .filter(Boolean).join(' ').toLowerCase().includes(query))
            .sort((a, b) => order === 'name' ? a.clientName.localeCompare(b.clientName)
                : order === 'count' ? b.letters.length - a.letters.length
                    : new Date(b.last.createdAt).getTime() - new Date(a.last.createdAt).getTime());
    }, [groups, search, bank, order]);

    useEffect(() => { setPage(1); }, [search, bank, order]);
    const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    const visible = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
    const opened = groups.find(group => group.key === openKey) || null;

    if (letters.length === 0) {
        return (
            <div className="rounded-2xl border-2 border-dashed bg-muted/10 py-12 text-center">
                <ScrollText className="mx-auto mb-2 h-10 w-10 text-muted-foreground/40" />
                <p className="text-sm font-semibold text-muted-foreground">Nenhuma carta guardada ainda</p>
                <p className="mt-1 text-xs text-muted-foreground/80">Assim que elaborar uma carta e clicar em "Guardar no Histórico", ela ficará registada aqui.</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border bg-card p-3"><p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Clientes</p><p className="text-2xl font-black">{groups.length}</p></div>
                <div className="rounded-xl border bg-card p-3"><p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Cartas emitidas</p><p className="text-2xl font-black">{letters.length}</p></div>
                <div className="rounded-xl border bg-card p-3"><p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Bancos</p><p className="text-2xl font-black">{banks.length}</p></div>
            </div>
            <div className="grid gap-2 md:grid-cols-[1fr_260px_200px]">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input value={search} onChange={event => setSearch(event.target.value)} placeholder="Pesquisar por cliente, NIF, banco ou referência do contrato…" className="pl-9" />
                </div>
                <Select value={bank} onValueChange={setBank}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="all">Todos os bancos</SelectItem>{banks.map(item => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent>
                </Select>
                <Select value={order} onValueChange={value => setOrder(value as Ordenacao)}>
                    <SelectTrigger><ArrowDownUp className="mr-2 h-3.5 w-3.5" /><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="recent">Mais recentes</SelectItem><SelectItem value="name">Nome do cliente</SelectItem><SelectItem value="count">Mais cartas</SelectItem></SelectContent>
                </Select>
            </div>
            <div className="overflow-hidden rounded-2xl border bg-card">
                <div className="overflow-x-auto">
                    <Table>
                        <TableHeader>
                            <TableRow className="bg-muted/50">
                                <TableHead className="text-xs font-bold uppercase">Cliente</TableHead>
                                <TableHead className="text-xs font-bold uppercase">Banco domiciliário</TableHead>
                                <TableHead className="text-center text-xs font-bold uppercase">N.º de cartas</TableHead>
                                <TableHead className="text-xs font-bold uppercase">Última carta</TableHead>
                                <TableHead className="text-right text-xs font-bold uppercase">Prestação (última)</TableHead>
                                <TableHead className="text-right text-xs font-bold uppercase">Acções</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {visible.map(group => (
                                <TableRow key={group.key}>
                                    <TableCell><p className="font-semibold">{group.clientName}</p>{group.clientNif && <p className="text-[11px] text-muted-foreground">NIF: {group.clientNif}</p>}</TableCell>
                                    <TableCell><div className="flex flex-wrap gap-1">{group.banks.map(item => <Badge key={item} variant="outline" className="text-[10px]">{item}</Badge>)}</div></TableCell>
                                    <TableCell className="text-center"><Badge className="min-w-[2rem] justify-center">{group.letters.length}</Badge></TableCell>
                                    <TableCell className="whitespace-nowrap text-xs">{formatDate(group.last.createdAt)}<span className="block text-muted-foreground">Dia {group.last.dayOfMonth} de cada mês</span></TableCell>
                                    <TableCell className="whitespace-nowrap text-right font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(group.last.installmentAmount, currency)}</TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex justify-end gap-1">
                                            <Button size="sm" className="h-8 gap-1 text-xs" onClick={() => setOpenKey(group.key)}><Eye className="h-3.5 w-3.5" />Ver histórico</Button>
                                            <Button size="sm" variant="outline" className="h-8 w-8 p-0" title="Baixar a última carta em PDF" onClick={() => onDownload(group.last)}><Download className="h-3.5 w-3.5" /></Button>
                                            <Button size="sm" variant="outline" className="h-8 w-8 p-0" title="Imprimir a última carta" onClick={() => onPrint(group.last)}><Printer className="h-3.5 w-3.5" /></Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))}
                            {visible.length === 0 && <TableRow><TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">Nenhum cliente com estes filtros.</TableCell></TableRow>}
                        </TableBody>
                    </Table>
                </div>
                {rows.length > PAGE_SIZE && (
                    <div className="flex items-center justify-between border-t px-4 py-2 text-xs text-muted-foreground">
                        <span>{(page - 1) * PAGE_SIZE + 1}–{Math.min(rows.length, page * PAGE_SIZE)} de {rows.length} clientes</span>
                        <div className="flex items-center gap-1">
                            <Button variant="ghost" size="icon" className="h-8 w-8" disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label="Página anterior"><ChevronLeft className="h-4 w-4" /></Button>
                            <span className="px-2 font-semibold">{page} / {pages}</span>
                            <Button variant="ghost" size="icon" className="h-8 w-8" disabled={page >= pages} onClick={() => setPage(page + 1)} aria-label="Página seguinte"><ChevronRight className="h-4 w-4" /></Button>
                        </div>
                    </div>
                )}
            </div>

            <Dialog open={!!opened} onOpenChange={open => !open && setOpenKey(null)}>
                <DialogContent className="max-w-4xl">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2"><History className="h-5 w-5 text-primary" />Histórico de cartas — {opened?.clientName}</DialogTitle>
                        <DialogDescription>{opened ? `${opened.letters.length} ${opened.letters.length === 1 ? 'carta emitida' : 'cartas emitidas'}${opened.clientNif ? ` · NIF ${opened.clientNif}` : ''}` : ''}</DialogDescription>
                    </DialogHeader>
                    {opened && (
                        <div className="max-h-[60vh] overflow-auto rounded-xl border">
                            <Table>
                                <TableHeader>
                                    <TableRow className="bg-muted/50">
                                        <TableHead className="text-xs">#</TableHead>
                                        <TableHead className="text-xs">Criada / actualizada</TableHead>
                                        <TableHead className="text-xs">Banco e balcão</TableHead>
                                        <TableHead className="text-xs">Contrato</TableHead>
                                        <TableHead className="text-right text-xs">Prestação</TableHead>
                                        <TableHead className="text-center text-xs">Dia</TableHead>
                                        <TableHead className="text-right text-xs">Acções</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {opened.letters.map((letter, index) => (
                                        <TableRow key={letter.id}>
                                            <TableCell className="font-mono text-xs">{opened.letters.length - index}</TableCell>
                                            <TableCell className="whitespace-nowrap text-xs">{formatDateTime(letter.createdAt)}{letter.updatedAt && letter.updatedAt !== letter.createdAt && <span className="block text-muted-foreground">Actualizada {formatDateTime(letter.updatedAt)}</span>}</TableCell>
                                            <TableCell className="text-xs"><p className="font-medium">{letter.bankDestinationName}</p><p className="text-muted-foreground">{letter.destinationBranch || '—'}</p></TableCell>
                                            <TableCell className="font-mono text-xs">{letter.creditReference || '—'}</TableCell>
                                            <TableCell className="whitespace-nowrap text-right text-xs font-bold">{formatCurrency(letter.installmentAmount, currency)}</TableCell>
                                            <TableCell className="text-center text-xs">{letter.dayOfMonth}</TableCell>
                                            <TableCell className="text-right">
                                                <div className="flex justify-end gap-1">
                                                    <Button size="sm" variant="outline" className="h-7 gap-1 px-2 text-[11px]" onClick={() => { setOpenKey(null); onEdit(letter); }}><Edit3 className="h-3 w-3" />Editar</Button>
                                                    <Button size="sm" variant="outline" className="h-7 w-7 p-0" title="Baixar em PDF" onClick={() => onDownload(letter)}><Download className="h-3 w-3" /></Button>
                                                    <Button size="sm" variant="outline" className="h-7 w-7 p-0" title="Imprimir" onClick={() => onPrint(letter)}><Printer className="h-3 w-3" /></Button>
                                                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:bg-destructive/10" title="Excluir do histórico" onClick={() => onDelete(letter)}><Trash2 className="h-3.5 w-3.5" /></Button>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}
