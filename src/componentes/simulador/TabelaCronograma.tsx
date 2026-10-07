import { CalendarClock } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/componentes/ui/card';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/componentes/ui/table';
import { Badge } from '@/componentes/ui/badge';
import { BotoesExportar } from '@/componentes/contabilidade/comum';
import { cn } from '@/bibliotecas/utils';
import { formatCurrency, formatDate, formatDecimal } from '@/bibliotecas/formatters';
import type { SimulationResult } from '@/bibliotecas/simulador-credito';

const HEAD = ['Nº', 'Data de Vencimento', 'Capital em Dívida (início)', 'Juros', 'Imposto do Selo s/ Juros', 'Amortização de Capital', 'Comissões / Seguro', 'Prestação Total', 'Capital em Dívida (fim)'];
const day = (key: string) => formatDate(`${key}T12:00:00`);

/** Cronograma completo com totais e exportação em PDF/Excel. */
export function TabelaCronograma({ result, title, subtitle }: { result: SimulationResult; title: string; subtitle: string }) {
    const rows = result.rows;
    const total = (pick: (row: SimulationResult['rows'][number]) => number) => rows.reduce((sum, row) => sum + pick(row), 0);
    const totals = {
        interest: total(row => row.interest), stamp: total(row => row.stampDutyInterest), amortization: total(row => row.amortization),
        charges: total(row => row.charges), payment: total(row => row.payment),
    };

    return (
        <Card>
            <CardHeader className="pb-3">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                        <CardTitle className="flex items-center gap-2 text-base"><CalendarClock className="h-5 w-5 text-indigo-600" /> Cronograma de Prestações</CardTitle>
                        <CardDescription>Vencimentos ajustados ao dia útil seguinte (fins-de-semana e feriados de Angola). Valores em Kz.</CardDescription>
                    </div>
                    <BotoesExportar disabled={!rows.length} build={() => ({
                        title, subtitle, fileName: title, numericColumns: [2, 3, 4, 5, 6, 7, 8], head: HEAD,
                        body: rows.map(row => [`${row.number}${row.grace ? ' (carência)' : ''}`, day(row.dueDate), formatDecimal(row.openingBalance), formatDecimal(row.interest),
                            formatDecimal(row.stampDutyInterest), formatDecimal(row.amortization), formatDecimal(row.charges), formatDecimal(row.payment), formatDecimal(row.closingBalance)]),
                        footer: [['', 'Totais', '', formatDecimal(totals.interest), formatDecimal(totals.stamp), formatDecimal(totals.amortization), formatDecimal(totals.charges), formatDecimal(totals.payment), '']],
                    })} />
                </div>
            </CardHeader>
            <CardContent>
                <div className="relative max-h-[460px] overflow-auto rounded-lg border">
                    <Table>
                        <TableHeader className="sticky top-0 z-10 bg-card shadow-sm">
                            <TableRow>
                                {HEAD.map((label, index) => (
                                    <TableHead key={label} className={cn('whitespace-nowrap text-[11px]', index > 1 ? 'text-right' : index === 0 ? 'w-12 text-center' : '')}>{label}</TableHead>
                                ))}
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {rows.map(row => (
                                <TableRow key={row.number} className={cn('border-border text-xs tabular-nums hover:bg-muted/50', row.grace && 'bg-amber-500/5')}>
                                    <TableCell className="text-center font-mono">{row.number}{row.grace && <Badge variant="outline" className="ml-1 h-4 px-1 text-[9px]">C</Badge>}</TableCell>
                                    <TableCell className="whitespace-nowrap">{day(row.dueDate)}</TableCell>
                                    <TableCell className="text-right text-muted-foreground">{formatCurrency(row.openingBalance)}</TableCell>
                                    <TableCell className="text-right text-red-500">{formatCurrency(row.interest)}</TableCell>
                                    <TableCell className="text-right text-amber-600">{formatCurrency(row.stampDutyInterest)}</TableCell>
                                    <TableCell className="text-right text-emerald-600">{formatCurrency(row.amortization)}</TableCell>
                                    <TableCell className="text-right text-muted-foreground">{formatCurrency(row.charges)}</TableCell>
                                    <TableCell className="text-right font-bold text-foreground">{formatCurrency(row.payment)}</TableCell>
                                    <TableCell className="text-right font-medium">{formatCurrency(row.closingBalance)}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                        <TableFooter className="sticky bottom-0 bg-muted">
                            <TableRow className="text-xs font-bold tabular-nums">
                                <TableCell />
                                <TableCell>Totais</TableCell>
                                <TableCell />
                                <TableCell className="text-right">{formatCurrency(totals.interest)}</TableCell>
                                <TableCell className="text-right">{formatCurrency(totals.stamp)}</TableCell>
                                <TableCell className="text-right">{formatCurrency(totals.amortization)}</TableCell>
                                <TableCell className="text-right">{formatCurrency(totals.charges)}</TableCell>
                                <TableCell className="text-right">{formatCurrency(totals.payment)}</TableCell>
                                <TableCell />
                            </TableRow>
                        </TableFooter>
                    </Table>
                </div>
                {rows.some(row => row.grace) && <p className="mt-2 text-xs text-muted-foreground"><Badge variant="outline" className="mr-1 h-4 px-1 text-[9px]">C</Badge> Prestação em período de carência.</p>}
            </CardContent>
        </Card>
    );
}
