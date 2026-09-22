import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { useData } from '@/contextos/ContextoDados';
import { formatCurrency } from '@/bibliotecas/formatters';

export function CashFlowChart() {
  const { credits, payments } = useData();

  // Aggregate by month (last 6 months)
  const last6Months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    return {
      month: d.getMonth(),
      year: d.getFullYear(),
      name: d.toLocaleString('pt-AO', { month: 'short' }),
      entradas: 0,
      saidas: 0
    };
  }).reverse();

  last6Months.forEach(m => {
    m.entradas = payments.reduce((acc, p) => {
      const pDate = new Date(p.paymentDate);
      return (pDate.getMonth() === m.month && pDate.getFullYear() === m.year) ? acc + p.amount : acc;
    }, 0);
    m.saidas = credits.reduce((acc, c) => {
      const cDate = new Date(c.createdAt);
      return (cDate.getMonth() === m.month && cDate.getFullYear() === m.year) ? acc + c.principalAmount : acc;
    }, 0);
  });

  const cashFlowData = last6Months;
  return (
    <div className="card-elevated p-6">
      <div className="mb-6">
        <h3 className="font-display text-lg font-semibold text-foreground">Fluxo de Caixa</h3>
        <p className="text-sm text-muted-foreground">Entradas e saídas mensais</p>
      </div>
      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={cashFlowData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="colorEntradas" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--success))" stopOpacity={0.3} />
                <stop offset="95%" stopColor="hsl(var(--success))" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="colorSaidas" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--chart-2))" stopOpacity={0.3} />
                <stop offset="95%" stopColor="hsl(var(--chart-2))" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis
              dataKey="name"
              tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
              axisLine={{ stroke: 'hsl(var(--border))' }}
              tickLine={{ stroke: 'hsl(var(--border))' }}
            />
            <YAxis
              tickFormatter={(value) => formatCurrency(value)}
              tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
              axisLine={{ stroke: 'hsl(var(--border))' }}
              tickLine={{ stroke: 'hsl(var(--border))' }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '0.75rem',
                boxShadow: 'var(--shadow-lg)',
              }}
              labelStyle={{ color: 'hsl(var(--foreground))', fontWeight: 600 }}
              formatter={(value: number) => [formatCurrency(value), '']}
            />
            <Legend
              wrapperStyle={{ paddingTop: '20px' }}
              formatter={(value) => (
                <span style={{ color: 'hsl(var(--foreground))' }}>
                  {value === 'entradas' ? 'Entradas' : 'Saídas'}
                </span>
              )}
            />
            <Area
              type="monotone"
              dataKey="entradas"
              stroke="hsl(var(--success))"
              strokeWidth={2}
              fillOpacity={1}
              fill="url(#colorEntradas)"
            />
            <Area
              type="monotone"
              dataKey="saidas"
              stroke="hsl(var(--chart-2))"
              strokeWidth={2}
              fillOpacity={1}
              fill="url(#colorSaidas)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

