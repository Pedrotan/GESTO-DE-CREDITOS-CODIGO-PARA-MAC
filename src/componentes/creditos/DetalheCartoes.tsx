// Detalhe de cada card (o ícone do olho): as linhas exatas que somam o valor mostrado, calculadas com a mesma
// biblioteca do card. O total no rodapé é sempre igual ao valor do card.
import { useMemo, type ReactNode } from 'react';
import * as XLSX from 'xlsx';
import { FileSpreadsheet } from 'lucide-react';
import { formatCurrency } from '@/bibliotecas/formatters';
import { luandaDateKey } from '@/bibliotecas/fuso-angola';
import { IN_PORTFOLIO, STAGES, type PortfolioRow } from '@/bibliotecas/carteira-credito';
import { buildPaymentRows, contractNumbers, inKeyRange } from '@/bibliotecas/pagamentos-analise';
import { Button } from '@/componentes/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/componentes/ui/sheet';
import type { CardDetail } from './CartoesCarteira';
import type { CarteiraState } from './useCarteira';

const kz = (minor: number) => formatCurrency(minor / 100);
const date = (key: string | null | undefined) => key ? key.split('-').reverse().join('/') : '—';
type Table = { title: string; description: string; head: string[]; numeric: number[]; rows: Array<{ id?: string; cells: ReactNode[]; raw: Array<string | number> }>; total: Array<ReactNode> };

export function DetalheCartoes({ state, type, onClose, onOpen, clients }: { state: CarteiraState; type: CardDetail | null; onClose: () => void; onOpen: (row: PortfolioRow) => void; clients: any[] }) {
    const table = useMemo((): Table | null => {
        if (!type) return null;
        const { rows, range, figures, kpis, monthKey } = state;
        const book = rows.filter(row => IN_PORTFOLIO.includes(row.stage));
        const granted = rows.filter(row => !['pedido', 'em_analise', 'rejeitado', 'cancelado'].includes(row.stage) && row.competenceMonth === monthKey);
        const credit = (row: PortfolioRow) => ({ id: row.id, base: [row.reference, row.clientName] as ReactNode[] });
        const month = `${date(range.start)} a ${date(range.end)}`;
        switch (type) {
            case 'clients':
            case 'projected': {
                const list = state.view === 'carteira' ? book : granted;
                const interest = state.view === 'carteira';
                return {
                    title: type === 'clients' ? 'Créditos Concedidos' : interest ? 'Juros por Receber' : 'Juros Contratados',
                    description: type === 'clients' ? `Créditos com mês de competência ${monthKey.split('-').reverse().join('/')}.` : interest ? 'Juros futuros dos créditos em curso.' : `Juros do plano dos créditos concedidos em ${monthKey.split('-').reverse().join('/')}.`,
                    head: ['Referência', 'Cliente', 'Concedido em', 'Capital concedido', interest ? 'Juros por receber' : 'Juros contratados', 'Estado'], numeric: [3, 4],
                    rows: list.map(row => ({ ...credit(row), cells: [...credit(row).base, date(row.grantedKey), kz(row.grantedMinor), kz(interest ? row.interestOutstandingMinor : row.contractedInterestMinor), STAGES[row.stage].label],
                        raw: [row.reference, row.clientName, row.grantedKey, row.grantedMinor / 100, (interest ? row.interestOutstandingMinor : row.contractedInterestMinor) / 100, STAGES[row.stage].label] })),
                    total: [`${list.length} crédito(s)`, `${new Set(list.map(row => row.clientId)).size} cliente(s)`, '', kz(list.reduce((sum, row) => sum + row.grantedMinor, 0)), kz(list.reduce((sum, row) => sum + (interest ? row.interestOutstandingMinor : row.contractedInterestMinor), 0)), ''],
                };
            }
            case 'interest': return { title: 'Juros por Receber', description: 'Juros futuros dos créditos em curso.', head: ['Referência', 'Cliente', 'Juros contratados', 'Juros por receber'], numeric: [2, 3],
                rows: book.map(row => ({ ...credit(row), cells: [...credit(row).base, kz(row.contractedInterestMinor), kz(row.interestOutstandingMinor)], raw: [row.reference, row.clientName, row.contractedInterestMinor / 100, row.interestOutstandingMinor / 100] })),
                total: ['Total', '', kz(book.reduce((sum, row) => sum + row.contractedInterestMinor, 0)), kz(kpis.futureInterestMinor)] };
            case 'outstanding': return { title: 'Carteira Ativa', description: 'Capital em dívida dos créditos em curso hoje (ativos, em atraso, reestruturados e em contencioso).', head: ['Referência', 'Cliente', 'Capital concedido', 'Capital em dívida', 'Estado'], numeric: [2, 3],
                rows: book.map(row => ({ ...credit(row), cells: [...credit(row).base, kz(row.grantedMinor), kz(row.outstandingMinor), STAGES[row.stage].label], raw: [row.reference, row.clientName, row.grantedMinor / 100, row.outstandingMinor / 100, STAGES[row.stage].label] })),
                total: [`${book.length} crédito(s)`, '', kz(book.reduce((sum, row) => sum + row.grantedMinor, 0)), kz(kpis.activeMinor), ''] };
            case 'overdue': {
                const list = book.filter(row => row.daysOverdue > 0).sort((a, b) => b.daysOverdue - a.daysOverdue);
                return { title: 'Em Atraso', description: `PAR30: ${kpis.par30 ?? '—'}% · Taxa de incumprimento (mais de 90 dias): ${kpis.defaultRate ?? '—'}%.`, head: ['Referência', 'Cliente', 'Dias', 'Em atraso', 'Capital em dívida', 'Mora'], numeric: [2, 3, 4, 5],
                    rows: list.map(row => ({ ...credit(row), cells: [...credit(row).base, row.daysOverdue, kz(row.overdueMinor), kz(row.outstandingMinor), kz(row.moraMinor)], raw: [row.reference, row.clientName, row.daysOverdue, row.overdueMinor / 100, row.outstandingMinor / 100, row.moraMinor / 100] })),
                    total: [`${list.length} crédito(s)`, '', '', kz(kpis.overdueMinor), kz(list.reduce((sum, row) => sum + row.outstandingMinor, 0)), kz(list.reduce((sum, row) => sum + row.moraMinor, 0))] };
            }
            case 'mora': {
                const list = book.filter(row => row.moraMinor > 0).sort((a, b) => b.moraMinor - a.moraMinor);
                return { title: 'Mora Acumulada', description: 'Juros de mora por cobrar (o mesmo cálculo da página de Pagamentos).', head: ['Referência', 'Cliente', 'Dias de atraso', 'Mora'], numeric: [2, 3],
                    rows: list.map(row => ({ ...credit(row), cells: [...credit(row).base, row.daysOverdue, kz(row.moraMinor)], raw: [row.reference, row.clientName, row.daysOverdue, row.moraMinor / 100] })),
                    total: [`${list.length} crédito(s)`, '', '', kz(kpis.moraMinor)] };
            }
            case 'due': {
                const ids = new Map(book.map(row => [row.id, row]));
                const limit = luandaDateKey(new Date(Date.now() + 7 * 86_400_000));
                const list = (state.context?.installments || []).filter(item => ids.has(item.creditId) && item.status !== 'cancelled'
                    && (Number(item.principalMinor) + Number(item.interestMinor)) > (Number(item.paidPrincipalMinor) + Number(item.paidInterestMinor))
                    && luandaDateKey(item.dueDate) >= state.today && luandaDateKey(item.dueDate) <= limit).sort((a, b) => luandaDateKey(a.dueDate).localeCompare(luandaDateKey(b.dueDate)));
                const owed = (item: typeof list[number]) => (Number(item.principalMinor) + Number(item.interestMinor)) - (Number(item.paidPrincipalMinor) + Number(item.paidInterestMinor));
                return { title: 'A Vencer em 7 Dias', description: `Prestações com vencimento até ${date(limit)}.`, head: ['Referência', 'Cliente', 'Prestação', 'Vencimento', 'Valor'], numeric: [4],
                    rows: list.map(item => { const row = ids.get(item.creditId)!; return { id: row.id, cells: [row.reference, row.clientName, `${item.installmentNumber}.ª`, date(luandaDateKey(item.dueDate)), kz(owed(item))], raw: [row.reference, row.clientName, item.installmentNumber, luandaDateKey(item.dueDate), owed(item) / 100] }; }),
                    total: [`${list.length} prestação(ões)`, '', '', '', kz(kpis.dueSoonMinor)] };
            }
            case 'capital': {
                const numbers = contractNumbers([...state.credits, ...(state.context?.deletedCredits || [])]);
                const list = state.entries.filter(entry => entry.type === 'disbursement' && inKeyRange(luandaDateKey(entry.timestamp), range));
                const byCredit = new Map(state.credits.map(item => [item.id, item]));
                return { title: 'Capital Desembolsado', description: `Lançamentos de desembolso do razão (Contabilidade) de ${month}.`, head: ['Data', 'Referência', 'Cliente', 'Descrição', 'Valor'], numeric: [4],
                    rows: list.map(entry => { const minor = entry.amountTotalMinor ?? Math.round(Number(entry.amountTotal) * 100); const target = entry.creditId ? byCredit.get(entry.creditId) : undefined;
                        return { id: entry.creditId, cells: [date(luandaDateKey(entry.timestamp)), numbers.get(entry.creditId || '') || '—', target?.clientName || '—', entry.description, kz(minor)], raw: [luandaDateKey(entry.timestamp), numbers.get(entry.creditId || '') || '', target?.clientName || '', entry.description, minor / 100] }; }),
                    total: [`${list.length} lançamento(s)`, '', '', '', kz(figures.disbursedMinor)] };
            }
            case 'realized': {
                const numbers = contractNumbers([...state.credits, ...(state.context?.deletedCredits || [])]);
                const list = buildPaymentRows({ payments: state.payments.filter(payment => !payment.deletedAt), credits: state.credits, clients, users: [], numbers })
                    .filter(row => row.status === 'confirmed' && inKeyRange(row.valueDateKey, range)).sort((a, b) => a.valueDateKey.localeCompare(b.valueDateKey));
                return { title: 'Recebido no Período', description: `Pagamentos confirmados com data-valor de ${month} — os mesmos da página de Pagamentos.`, head: ['Data-valor', 'Recibo', 'Referência', 'Cliente', 'Capital', 'Juros', 'Mora', 'Total'], numeric: [4, 5, 6, 7],
                    rows: list.map(row => ({ id: row.creditId, cells: [date(row.valueDateKey), row.receipt, row.contract, row.clientName, formatCurrency(row.principal), formatCurrency(row.interest), formatCurrency(row.late), formatCurrency(row.total)],
                        raw: [row.valueDateKey, row.receipt, row.contract, row.clientName, row.principal, row.interest, row.late, row.total] })),
                    total: [`${list.length} pagamento(s)`, '', '', '', formatCurrency(figures.received.principal), formatCurrency(figures.received.interest), formatCurrency(figures.received.late), formatCurrency(figures.received.total)] };
            }
            case 'paidoff': {
                const list = rows.filter(row => row.paidOffKey && inKeyRange(row.paidOffKey, range));
                return { title: 'Liquidados no Período', description: `Créditos totalmente pagos de ${month}.`, head: ['Referência', 'Cliente', 'Capital concedido', 'Liquidado em'], numeric: [2],
                    rows: list.map(row => ({ ...credit(row), cells: [...credit(row).base, kz(row.grantedMinor), date(row.paidOffKey)], raw: [row.reference, row.clientName, row.grantedMinor / 100, row.paidOffKey || ''] })),
                    total: [`${list.length} crédito(s)`, '', kz(list.reduce((sum, row) => sum + row.grantedMinor, 0)), ''] };
            }
        }
        return null;
    }, [type, state, clients]);

    const exportExcel = () => {
        if (!table) return;
        const sheet = XLSX.utils.aoa_to_sheet([table.head, ...table.rows.map(row => row.raw)]);
        const book = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(book, sheet, table.title.slice(0, 30));
        XLSX.writeFile(book, `${table.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${state.today}.xlsx`);
    };
    return (
        <Sheet open={!!table} onOpenChange={open => { if (!open) onClose(); }}>
            <SheetContent className="w-full overflow-y-auto sm:max-w-3xl">
                {table && (
                    <>
                        <SheetHeader>
                            <SheetTitle>{table.title}</SheetTitle>
                            <SheetDescription>{table.description}</SheetDescription>
                        </SheetHeader>
                        <div className="my-3 flex justify-end"><Button size="sm" variant="outline" className="gap-1.5" disabled={!table.rows.length} onClick={exportExcel}><FileSpreadsheet className="h-4 w-4 text-emerald-600" /> Exportar Excel</Button></div>
                        <div className="overflow-x-auto rounded-lg border">
                            <table className="w-full text-sm">
                                <thead className="bg-muted/50 text-xs uppercase text-muted-foreground"><tr>{table.head.map((head, index) => <th key={head} className={`whitespace-nowrap p-2 ${table.numeric.includes(index) ? 'text-right' : 'text-left'}`}>{head}</th>)}</tr></thead>
                                <tbody>
                                    {!table.rows.length && <tr><td colSpan={table.head.length} className="p-8 text-center text-muted-foreground">Sem registos.</td></tr>}
                                    {table.rows.map((row, index) => (
                                        <tr key={`${row.id || ''}-${index}`} className={`border-t ${row.id ? 'cursor-pointer hover:bg-muted/40' : ''}`} onClick={() => { const target = state.rows.find(item => item.id === row.id); if (target) onOpen(target); }}>
                                            {row.cells.map((cell, cellIndex) => <td key={cellIndex} className={`p-2 ${table.numeric.includes(cellIndex) ? 'whitespace-nowrap text-right' : ''}`}>{cell}</td>)}
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot className="border-t-2 bg-muted/40 font-bold"><tr>{table.total.map((cell, index) => <td key={index} className={`p-2 ${table.numeric.includes(index) ? 'whitespace-nowrap text-right' : ''}`}>{cell}</td>)}</tr></tfoot>
                            </table>
                        </div>
                    </>
                )}
            </SheetContent>
        </Sheet>
    );
}
