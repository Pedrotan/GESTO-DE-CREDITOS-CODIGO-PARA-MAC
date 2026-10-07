import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { BarChart3, ChevronDown } from 'lucide-react';
import { formatCurrency } from '@/bibliotecas/formatters';
import { cn } from '@/bibliotecas/utils';
import { dailySeries, methodBreakdown, monthlyEvolution, sumRows, inKeyRange, type KeyRange, type PaymentRow, type ScheduleItem } from '@/bibliotecas/pagamentos-analise';

const STORAGE_KEY = 'pagamentos:graficos-abertos';
const COLORS = ['#10b981', '#f59e0b', '#ef4444', '#6366f1', '#0ea5e9', '#a855f7'];
const compact = (value: number) => new Intl.NumberFormat('pt-AO', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
const money = (value: unknown) => formatCurrency(Number(value) || 0);

function Panel({ title, subtitle, children, className }: { title: string; subtitle?: string; children: React.ReactNode; className?: string }) {
    return (
        <div className={cn('rounded-xl border bg-card p-4', className)}>
            <p className="text-sm font-bold text-foreground">{title}</p>
            {subtitle && <p className="mb-2 text-xs text-muted-foreground">{subtitle}</p>}
            <div className="h-64">{children}</div>
        </div>
    );
}

export function GraficosPagamentos({ rows, schedule, range, endMonthKey }: { rows: PaymentRow[]; schedule: ScheduleItem[]; range: KeyRange; endMonthKey: string }) {
    const [open, setOpen] = useState(() => { try { return localStorage.getItem(STORAGE_KEY) !== '0'; } catch { return true; } });
    const toggle = () => setOpen(value => { try { localStorage.setItem(STORAGE_KEY, value ? '0' : '1'); } catch { /* preferência local */ } return !value; });

    const daily = useMemo(() => dailySeries(rows, schedule, range), [rows, schedule, range]);
    const periodRows = useMemo(() => rows.filter(row => inKeyRange(row.valueDateKey, range)), [rows, range]);
    const composition = useMemo(() => {
        const totals = sumRows(periodRows.filter(row => row.status === 'confirmed'));
        return [{ name: 'Capital', value: totals.principal }, { name: 'Juros', value: totals.interest }, { name: 'Juros de mora', value: totals.late }, ...(totals.other ? [{ name: 'Selo e comissões', value: totals.other }] : [])]
            .filter(item => item.value > 0);
    }, [periodRows]);
    const methods = useMemo(() => methodBreakdown(periodRows), [periodRows]);
    const evolution = useMemo(() => monthlyEvolution(rows, schedule, endMonthKey), [rows, schedule, endMonthKey]);

    return (
        <div className="mb-6 rounded-xl border bg-muted/30">
            <button type="button" onClick={toggle} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left" aria-expanded={open}>
                <span className="flex items-center gap-2 text-sm font-bold"><BarChart3 className="h-4 w-4 text-primary" /> Gráficos de cobrança</span>
                <ChevronDown className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} />
            </button>
            {open && (
                <div className="grid gap-4 px-4 pb-4 lg:grid-cols-2">
                    <Panel title="Cobrado vs previsto por dia" subtitle={range ? 'Barras: cobrado e previsto em cada dia · linha: cobrado acumulado' : 'Escolha um período para ver a evolução diária'} className="lg:col-span-2">
                        {daily.length ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <ComposedChart data={daily} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                                    <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" minTickGap={8} />
                                    <YAxis yAxisId="day" tickFormatter={compact} tick={{ fontSize: 10 }} width={52} />
                                    <YAxis yAxisId="sum" orientation="right" tickFormatter={compact} tick={{ fontSize: 10 }} width={52} />
                                    <Tooltip formatter={(value, name) => [money(value), name]} />
                                    <Legend wrapperStyle={{ fontSize: 11 }} />
                                    <Bar yAxisId="day" dataKey="collected" name="Cobrado" fill="#10b981" radius={[3, 3, 0, 0]} />
                                    <Bar yAxisId="day" dataKey="expected" name="Previsto" fill="#93c5fd" radius={[3, 3, 0, 0]} />
                                    <Line yAxisId="sum" type="monotone" dataKey="cumulative" name="Cobrado acumulado" stroke="#0f172a" strokeWidth={2} dot={false} />
                                    <Line yAxisId="sum" type="monotone" dataKey="cumulativeExpected" name="Previsto acumulado" stroke="#2563eb" strokeDasharray="5 4" strokeWidth={1.5} dot={false} />
                                </ComposedChart>
                            </ResponsiveContainer>
                        ) : <p className="flex h-full items-center justify-center text-sm text-muted-foreground">Sem período definido.</p>}
                    </Panel>
                    <Panel title="Composição do arrecadado" subtitle="Capital, juros e mora dos pagamentos confirmados">
                        {composition.length ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie data={composition} dataKey="value" nameKey="name" innerRadius="45%" outerRadius="75%" paddingAngle={2}>
                                        {composition.map((item, index) => <Cell key={item.name} fill={COLORS[[3, 1, 2, 4][index] ?? index]} />)}
                                    </Pie>
                                    <Tooltip formatter={(value, name) => [money(value), name]} />
                                    <Legend wrapperStyle={{ fontSize: 11 }} />
                                </PieChart>
                            </ResponsiveContainer>
                        ) : <p className="flex h-full items-center justify-center text-sm text-muted-foreground">Sem pagamentos confirmados no período.</p>}
                    </Panel>
                    <Panel title="Arrecadado por método de pagamento" subtitle="Total e n.º de operações">
                        {methods.length ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={methods} layout="vertical" margin={{ top: 4, right: 12, left: 8, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                                    <XAxis type="number" tickFormatter={compact} tick={{ fontSize: 10 }} />
                                    <YAxis type="category" dataKey="label" width={130} tick={{ fontSize: 11 }} />
                                    <Tooltip formatter={(value, _name, item: any) => [`${money(value)} (${item?.payload?.count ?? 0} op.)`, 'Arrecadado']} />
                                    <Bar dataKey="amount" name="Arrecadado" radius={[0, 4, 4, 0]}>
                                        {methods.map((item, index) => <Cell key={item.method} fill={COLORS[index % COLORS.length]} />)}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        ) : <p className="flex h-full items-center justify-center text-sm text-muted-foreground">Sem pagamentos confirmados no período.</p>}
                    </Panel>
                    <Panel title="Evolução dos últimos 12 meses" subtitle="Cobrado e previsto por mês · linha: taxa de cobrança (%)" className="lg:col-span-2">
                        <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart data={evolution} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                                <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                                <YAxis yAxisId="kz" tickFormatter={compact} tick={{ fontSize: 10 }} width={52} />
                                <YAxis yAxisId="rate" orientation="right" domain={[0, (max: number) => Math.max(100, Math.ceil(max / 10) * 10)]} tickFormatter={value => `${value}%`} tick={{ fontSize: 10 }} width={44} />
                                <Tooltip formatter={(value, name) => name === 'Taxa de cobrança' ? [value === null ? 'n.d.' : `${value}%`, name] : [money(value), name]} />
                                <Legend wrapperStyle={{ fontSize: 11 }} />
                                <Bar yAxisId="kz" dataKey="collected" name="Cobrado" fill="#10b981" radius={[3, 3, 0, 0]} />
                                <Bar yAxisId="kz" dataKey="expected" name="Previsto" fill="#93c5fd" radius={[3, 3, 0, 0]} />
                                <Line yAxisId="rate" type="monotone" dataKey="rate" name="Taxa de cobrança" stroke="#f59e0b" strokeWidth={2} connectNulls />
                            </ComposedChart>
                        </ResponsiveContainer>
                    </Panel>
                </div>
            )}
        </div>
    );
}
