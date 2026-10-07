import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { cn } from '@/bibliotecas/utils';
import { formatCurrency } from '@/bibliotecas/formatters';
import { MONTHS_LONG } from './CabecalhoCarteira';
import type { CarteiraState } from './useCarteira';

const kz = (minor: number) => formatCurrency(minor / 100);
const short = (minor: number) => {
    const value = minor / 100;
    return Math.abs(value) >= 1_000_000 ? `${(value / 1_000_000).toLocaleString('pt-AO', { maximumFractionDigits: 1 })} M` : Math.abs(value) >= 1000 ? `${Math.round(value / 1000)} mil` : String(Math.round(value));
};

/** Meses × indicadores (concedido, desembolsado, recebido, juros, em atraso), com totais e gráfico. */
export function VisaoAnualCreditos({ state }: { state: CarteiraState }) {
    const { months, total } = state.annual;
    const current = state.today.slice(0, 7);
    const data = months.map(month => ({ name: MONTHS_LONG[month.index].slice(0, 3), Desembolsado: month.disbursedMinor / 100, Recebido: month.receivedMinor / 100, 'Em atraso': month.overdueMinor / 100 }));
    return (
        <div className="space-y-4">
            <div className="rounded-2xl border bg-card p-4 shadow-sm">
                <h3 className="mb-3 text-sm font-bold">Desembolsado, recebido e em atraso por mês — {state.year}</h3>
                <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                            <YAxis tick={{ fontSize: 11 }} tickFormatter={value => short(Number(value) * 100)} width={60} />
                            <Tooltip formatter={(value: number) => formatCurrency(value)} />
                            <Legend wrapperStyle={{ fontSize: 12 }} />
                            <Bar dataKey="Desembolsado" fill="#f37021" radius={[4, 4, 0, 0]} />
                            <Bar dataKey="Recebido" fill="#10b981" radius={[4, 4, 0, 0]} />
                            <Line dataKey="Em atraso" stroke="#dc2626" strokeWidth={2} dot={{ r: 3 }} />
                        </ComposedChart>
                    </ResponsiveContainer>
                </div>
            </div>
            <div className="card-elevated overflow-x-auto">
                <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                        <tr><th className="p-3 text-left">Mês</th><th className="p-3 text-right">Concedidos</th><th className="p-3 text-right">Capital concedido</th><th className="p-3 text-right">Desembolsado</th><th className="p-3 text-right">Recebido</th><th className="p-3 text-right">Juros recebidos</th><th className="p-3 text-right">Em atraso</th></tr>
                    </thead>
                    <tbody>
                        {months.map(month => (
                            <tr key={month.month} onClick={() => { state.setMonth(month.index); state.setView('producao'); }} title="Ver a produção deste mês"
                                className={cn('cursor-pointer border-t hover:bg-muted/40', month.month === current && 'bg-primary/5 font-semibold', month.month < current && 'text-foreground', month.month > current && 'text-muted-foreground')}>
                                <td className={cn('p-3', month.month < current && 'text-red-600 dark:text-red-400')}>{MONTHS_LONG[month.index]}</td>
                                <td className="p-3 text-right">{month.grantedCount}</td>
                                <td className="p-3 text-right">{kz(month.grantedMinor)}</td>
                                <td className="p-3 text-right">{kz(month.disbursedMinor)}</td>
                                <td className="p-3 text-right text-emerald-700 dark:text-emerald-400">{kz(month.receivedMinor)}</td>
                                <td className="p-3 text-right">{kz(month.interestMinor)}</td>
                                <td className={cn('p-3 text-right', month.overdueMinor > 0 && 'font-semibold text-red-700 dark:text-red-400')}>{kz(month.overdueMinor)}</td>
                            </tr>
                        ))}
                    </tbody>
                    <tfoot className="border-t-2 bg-muted/40 font-bold">
                        <tr><td className="p-3">Total {state.year}</td><td className="p-3 text-right">{total.grantedCount}</td><td className="p-3 text-right">{kz(total.grantedMinor)}</td><td className="p-3 text-right">{kz(total.disbursedMinor)}</td>
                            <td className="p-3 text-right">{kz(total.receivedMinor)}</td><td className="p-3 text-right">{kz(total.interestMinor)}</td><td className="p-3 text-right text-red-700 dark:text-red-400">{kz(total.overdueMinor)}</td></tr>
                    </tfoot>
                </table>
            </div>
            <p className="px-1 text-xs text-muted-foreground">Recebido = mesmos valores da página de Pagamentos (data-valor). Desembolsado = lançamentos do razão. Em atraso = prestações com vencimento no mês que continuam por pagar.</p>
        </div>
    );
}
