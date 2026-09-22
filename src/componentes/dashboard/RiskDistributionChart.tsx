import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';
import { useData } from '@/contextos/ContextoDados';

const COLORS = ['hsl(var(--success))', 'hsl(var(--warning))', 'hsl(var(--danger))'];

export function RiskDistributionChart() {
  const { clients } = useData();

  const clientsByRiskData = [
    { name: 'Baixo', value: clients.filter(d => d.riskLevel === 'low').length },
    { name: 'Médio', value: clients.filter(d => d.riskLevel === 'medium').length },
    { name: 'Alto', value: clients.filter(d => d.riskLevel === 'high').length },
  ];
  return (
    <div className="card-elevated p-6">
      <div className="mb-6">
        <h3 className="font-display text-lg font-semibold text-foreground">Distribuição por Risco</h3>
        <p className="text-sm text-muted-foreground">Clientes por nível de risco</p>
      </div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={clientsByRiskData}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={90}
              paddingAngle={5}
              dataKey="value"
            >
              {clientsByRiskData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '0.75rem',
                boxShadow: 'var(--shadow-lg)',
              }}
              formatter={(value: number) => [`${value} clientes`, '']}
            />
            <Legend
              verticalAlign="bottom"
              formatter={(value) => (
                <span style={{ color: 'hsl(var(--foreground))' }}>{value}</span>
              )}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

