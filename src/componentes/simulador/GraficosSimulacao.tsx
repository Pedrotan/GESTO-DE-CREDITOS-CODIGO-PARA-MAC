import { Bar, CartesianGrid, Cell, ComposedChart, Legend, Line, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { BarChart3, PieChart as PieIcon } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/componentes/ui/card';
import { formatCurrency, formatCurrencyCompact, formatPercent } from '@/bibliotecas/formatters';
import type { SimulationResult } from '@/bibliotecas/simulador-credito';

const tooltipStyle = { backgroundColor: 'hsl(var(--card))', borderRadius: '8px', border: '1px solid hsl(var(--border))', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' };
const PIE_COLORS = ['#6366f1', '#ef4444', '#f59e0b', '#0ea5e9', '#10b981'];

/** Barras empilhadas (juros vs capital) com a linha do capital em dívida e a composição do MTIC. */
export function GraficosSimulacao({ result }: { result: SimulationResult }) {
    const data = result.rows.map(row => ({
        name: `${row.number}`,
        juros: row.interest,
        capital: row.amortization,
        encargos: row.stampDutyInterest + row.charges,
        divida: row.closingBalance,
    }));
    const composition = [
        { name: 'Capital', value: result.principal },
        { name: 'Juros', value: result.totalInterest },
        { name: 'Comissões', value: result.totalCommissions },
        { name: 'Impostos', value: result.totalTaxes },
        { name: 'Seguros', value: result.totalInsurance },
    ].filter(item => item.value > 0);

    return (
        <div className="grid gap-6 xl:grid-cols-3">
            <Card className="xl:col-span-2">
                <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-base"><BarChart3 className="h-5 w-5 text-indigo-600" /> Juros vs Capital por Prestação</CardTitle>
                    <CardDescription>Barras empilhadas (juros, amortização de capital e encargos) e linha do capital em dívida.</CardDescription>
                </CardHeader>
                <CardContent className="h-[320px]">
                    <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                            <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
                            <YAxis yAxisId="left" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} width={70} tickFormatter={value => formatCurrencyCompact(Number(value))} />
                            <YAxis yAxisId="right" orientation="right" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} width={70} tickFormatter={value => formatCurrencyCompact(Number(value))} />
                            <Tooltip contentStyle={tooltipStyle} itemStyle={{ color: 'hsl(var(--foreground))' }} labelFormatter={label => `Prestação n.º ${label}`} formatter={(value: number) => formatCurrency(value)} />
                            <Legend />
                            <Bar yAxisId="left" dataKey="capital" name="Amortização de capital" stackId="p" fill="#10b981" />
                            <Bar yAxisId="left" dataKey="juros" name="Juros" stackId="p" fill="#ef4444" />
                            <Bar yAxisId="left" dataKey="encargos" name="Impostos e encargos" stackId="p" fill="#f59e0b" radius={[3, 3, 0, 0]} />
                            <Line yAxisId="right" type="monotone" dataKey="divida" name="Capital em dívida" stroke="#6366f1" strokeWidth={2.5} dot={false} />
                        </ComposedChart>
                    </ResponsiveContainer>
                </CardContent>
            </Card>
            <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-base"><PieIcon className="h-5 w-5 text-indigo-600" /> Composição do MTIC</CardTitle>
                    <CardDescription>Total imputado ao cliente: {formatCurrency(result.mtic)}</CardDescription>
                </CardHeader>
                <CardContent className="h-[320px]">
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie data={composition} dataKey="value" nameKey="name" innerRadius="48%" outerRadius="78%" paddingAngle={2}>
                                {composition.map((item, index) => <Cell key={item.name} fill={PIE_COLORS[index % PIE_COLORS.length]} />)}
                            </Pie>
                            <Tooltip contentStyle={tooltipStyle} itemStyle={{ color: 'hsl(var(--foreground))' }}
                                formatter={(value: number, name: string) => [`${formatCurrency(value)} (${formatPercent(result.mtic ? (value / result.mtic) * 100 : 0, 1)})`, name]} />
                            <Legend />
                        </PieChart>
                    </ResponsiveContainer>
                </CardContent>
            </Card>
        </div>
    );
}
