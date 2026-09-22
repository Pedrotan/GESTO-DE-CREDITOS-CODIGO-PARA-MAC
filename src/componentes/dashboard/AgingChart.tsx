import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { useData } from '@/contextos/ContextoDados';
import { formatCurrency } from '@/bibliotecas/formatters';

const COLORS = ['hsl(var(--success))', 'hsl(var(--warning))', 'hsl(var(--chart-2))', 'hsl(var(--danger))'];

export function AgingChart() {
  const { credits } = useData();

  const agingData = [
    { name: 'No Prazo', amount: credits.filter(c => c.daysOverdue === 0).reduce((acc, c) => acc + c.totalDue, 0) },
    { name: '1-30 Dias', amount: credits.filter(c => c.daysOverdue > 0 && c.daysOverdue <= 30).reduce((acc, c) => acc + c.totalDue, 0) },
    { name: '31-60 Dias', amount: credits.filter(c => c.daysOverdue > 30 && c.daysOverdue <= 60).reduce((acc, c) => acc + c.totalDue, 0) },
    { name: '90+ Dias', amount: credits.filter(c => c.daysOverdue > 60).reduce((acc, c) => acc + c.totalDue, 0) },
  ];
  return (
    <div className="card-elevated p-6">
      <div className="mb-6">
        <h3 className="font-display text-lg font-semibold text-foreground">Aging da Dívida</h3>
        <p className="text-sm text-muted-foreground">Distribuição por tempo de atraso</p>
      </div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={agingData} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
            <XAxis
              type="number"
              tickFormatter={(val) => formatCurrency(val)}
              tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
              axisLine={{ stroke: 'hsl(var(--border))' }}
              tickLine={{ stroke: 'hsl(var(--border))' }}
              domain={[0, 'auto']}
              dataKey="amount"
            />
            <YAxis
              type="category"
              dataKey="name"
              tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
              axisLine={{ stroke: 'hsl(var(--border))' }}
              tickLine={{ stroke: 'hsl(var(--border))' }}
              width={80}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '0.75rem',
                boxShadow: 'var(--shadow-lg)',
              }}
              formatter={(value: number, name: string) => {
                if (name === 'amount') return [formatCurrency(value), 'Valor'];
                return [`${value} créditos`, 'Quantidade'];
              }}
            />
            <Bar dataKey="amount" radius={[0, 4, 4, 0]}>
              {agingData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

