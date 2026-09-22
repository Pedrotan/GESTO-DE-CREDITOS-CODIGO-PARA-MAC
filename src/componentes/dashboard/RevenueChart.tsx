import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { useData } from '@/contextos/ContextoDados';
import { formatCurrency } from '@/bibliotecas/formatters';

export function RevenueChart() {
  const { payments } = useData();

  // Aggregate by month (last 6 months)
  const last6Months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    return {
      month: d.getMonth(),
      year: d.getFullYear(),
      name: d.toLocaleString('pt-AO', { month: 'short' }),
      juros: 0,
      mora: 0
    };
  }).reverse();

  last6Months.forEach(m => {
    m.juros = payments.reduce((acc, p) => {
      const pDate = new Date(p.paymentDate);
      return (pDate.getMonth() === m.month && pDate.getFullYear() === m.year) ? acc + p.allocatedToInterest : acc;
    }, 0);
    m.mora = payments.reduce((acc, p) => {
      const pDate = new Date(p.paymentDate);
      return (pDate.getMonth() === m.month && pDate.getFullYear() === m.year) ? acc + p.allocatedToLateInterest : acc;
    }, 0);
  });

  const revenueData = last6Months;
  return (
    <div className="card-elevated p-6">
      <div className="mb-6">
        <h3 className="font-display text-lg font-semibold text-foreground">Rendimentos</h3>
        <p className="text-sm text-muted-foreground">Juros e mora por mês</p>
      </div>
      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={revenueData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis
              dataKey="name"
              tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
              axisLine={{ stroke: 'hsl(var(--border))' }}
              tickLine={{ stroke: 'hsl(var(--border))' }}
            />
            <YAxis
              tickFormatter={(valor: number) => formatCurrency(valor)}
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
                  {value === 'juros' ? 'Juros Correntes' : 'Juros de Mora'}
                </span>
              )}
            />
            <Bar dataKey="juros" fill="hsl(var(--chart-1))" radius={[4, 4, 0, 0]} />
            <Bar dataKey="mora" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

