import { useMemo, useState } from 'react';
import { Copy, FileDown, FolderOpen, History, Search, Trash2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/componentes/ui/card';
import { Input } from '@/componentes/ui/input';
import { Button } from '@/componentes/ui/button';
import { Badge } from '@/componentes/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/componentes/ui/select';
import { SeletorPeriodo } from '@/componentes/comum/SeletorPeriodo';
import { BotoesExportar, TabelaPaginada, type Coluna } from '@/componentes/contabilidade/comum';
import { defaultPeriod, isInPeriod, periodRange, type PeriodSelection } from '@/bibliotecas/periodos';
import { formatCurrency, formatDateTime, formatDecimal, formatPercent, formatDate } from '@/bibliotecas/formatters';
import { AMORTIZATION_LABELS } from '@/bibliotecas/simulador-credito';
import { RISK_LABELS } from '@/bibliotecas/risco-simulacao';
import type { Simulation } from '@/tipos/credito';
import { STATUS_LABELS, parseDetails, simulationStatus, type SimulationStatus } from './modelo';

type Row = { simulation: Simulation; status: SimulationStatus; productName: string; taeg: number | null; date: Date };

const STATUS_STYLE: Record<SimulationStatus, string> = {
    simulated: 'border-sky-200 bg-sky-100 text-sky-700 dark:border-sky-800 dark:bg-sky-950/50 dark:text-sky-300',
    converted: 'border-emerald-200 bg-emerald-100 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300',
    expired: 'border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400',
};
const RISK_STYLE: Record<string, string> = {
    low: 'border-emerald-200 bg-emerald-100 text-emerald-700', medium: 'border-amber-200 bg-amber-100 text-amber-700', high: 'border-red-200 bg-red-100 text-red-700',
};

type Props = {
    simulations: Simulation[];
    onReopen: (simulation: Simulation) => void;
    onDuplicate: (simulation: Simulation) => void;
    onPdf: (simulation: Simulation) => void;
    onDelete: (simulation: Simulation) => void;
};

/** Histórico de simulações: filtros por período, cliente e estado; reabrir, duplicar, PDF e eliminar. */
export function HistoricoSimulacoes({ simulations, onReopen, onDuplicate, onPdf, onDelete }: Props) {
    const [period, setPeriod] = useState<PeriodSelection>(() => ({ ...defaultPeriod(new Date(), 'all') }));
    const [search, setSearch] = useState('');
    const [status, setStatus] = useState<'all' | SimulationStatus>('all');

    const rows = useMemo<Row[]>(() => {
        const now = new Date();
        return simulations.map(simulation => {
            const details = parseDetails(simulation);
            return {
                simulation, status: simulationStatus(simulation, now), date: new Date(simulation.date),
                productName: details?.productName || '—', taeg: details?.summary.taeg ?? null,
            };
        }).sort((a, b) => b.date.getTime() - a.date.getTime());
    }, [simulations]);

    const range = useMemo(() => periodRange(period), [period]);
    const filtered = useMemo(() => {
        const term = search.trim().toLowerCase();
        return rows.filter(row => {
            if (!isInPeriod(row.date, range)) return false;
            if (status !== 'all' && row.status !== status) return false;
            if (!term) return true;
            const sim = row.simulation;
            return [sim.clientName, sim.reference, sim.verificationCode, row.productName].some(value => String(value || '').toLowerCase().includes(term));
        });
    }, [rows, range, status, search]);

    const counts = useMemo(() => filtered.reduce((acc, row) => ({ ...acc, [row.status]: (acc[row.status] || 0) + 1 }), {} as Record<SimulationStatus, number>), [filtered]);

    const columns: Coluna<Row>[] = [
        {
            key: 'ref', header: 'Referência / Data', render: row => (
                <div className="flex flex-col">
                    <span className="font-mono text-xs font-bold text-indigo-600 dark:text-indigo-400">{row.simulation.reference || '—'}</span>
                    <span className="text-[11px] text-muted-foreground">{formatDateTime(row.simulation.date)}</span>
                    {row.simulation.verificationCode && <span className="font-mono text-[10px] text-muted-foreground">Código {row.simulation.verificationCode}</span>}
                </div>
            ),
        },
        {
            key: 'client', header: 'Cliente', render: row => (
                <div className="flex flex-col">
                    <span className="font-semibold">{row.simulation.clientName}</span>
                    <span className="text-[11px] text-muted-foreground">{row.productName}</span>
                </div>
            ),
        },
        {
            key: 'amount', header: 'Montante / Prazo', align: 'right', render: row => (
                <div className="flex flex-col">
                    <span className="font-bold">{formatCurrency(row.simulation.amount)}</span>
                    <span className="text-[11px] text-muted-foreground">{row.simulation.term} meses · {AMORTIZATION_LABELS[row.simulation.method === 'sac' ? 'sac' : 'price']}</span>
                </div>
            ),
        },
        {
            key: 'payment', header: 'Prestação Mensal', align: 'right', render: row => (
                <div className="flex flex-col">
                    <span className="font-bold text-emerald-600">{formatCurrency(row.simulation.monthlyPayment)}</span>
                    <span className="text-[11px] text-muted-foreground">TAN {formatPercent(row.simulation.interestRate)}{row.taeg !== null ? ` · TAEG ${formatPercent(row.taeg)}` : ''}</span>
                </div>
            ),
        },
        { key: 'risk', header: 'Risco', align: 'center', render: row => <Badge variant="outline" className={RISK_STYLE[row.simulation.riskProfile] || ''}>{RISK_LABELS[row.simulation.riskProfile] || '—'}</Badge> },
        {
            key: 'status', header: 'Estado', align: 'center', render: row => (
                <div className="flex flex-col items-center gap-0.5">
                    <Badge variant="outline" className={STATUS_STYLE[row.status]}>{STATUS_LABELS[row.status]}</Badge>
                    {row.status === 'simulated' && row.simulation.expiresAt && <span className="text-[10px] text-muted-foreground">até {formatDate(row.simulation.expiresAt)}</span>}
                </div>
            ),
        },
        {
            key: 'actions', header: 'Acções', align: 'right', render: row => (
                <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-indigo-600 hover:bg-indigo-500/10" title="Reabrir no simulador" onClick={() => onReopen(row.simulation)}><FolderOpen className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-sky-600 hover:bg-sky-500/10" title="Duplicar como nova simulação" onClick={() => onDuplicate(row.simulation)}><Copy className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-emerald-600 hover:bg-emerald-500/10" title="Ficha de Simulação (PDF)" onClick={() => onPdf(row.simulation)}><FileDown className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-red-500/10" title="Eliminar" disabled={row.status === 'converted'} onClick={() => onDelete(row.simulation)}><Trash2 className="h-4 w-4" /></Button>
                </div>
            ),
        },
    ];

    return (
        <Card>
            <CardHeader className="space-y-4">
                <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
                    <div>
                        <CardTitle className="flex items-center gap-2"><History className="h-5 w-5 text-indigo-600" /> Histórico de Simulações</CardTitle>
                        <CardDescription>
                            {filtered.length} de {rows.length} simulações · {counts.simulated || 0} simuladas · {counts.converted || 0} convertidas em pedido · {counts.expired || 0} expiradas
                        </CardDescription>
                    </div>
                    <BotoesExportar disabled={!filtered.length} build={() => ({
                        title: 'Histórico de simulações de crédito', subtitle: `${range.label}${status !== 'all' ? ` · ${STATUS_LABELS[status]}` : ''}`, fileName: 'historico-simulacoes',
                        numericColumns: [4, 5, 6, 7],
                        head: ['Referência', 'Data', 'Cliente', 'Produto', 'Montante', 'Prazo (meses)', 'Prestação mensal', 'TAN (%)', 'Risco', 'Estado'],
                        body: filtered.map(row => [row.simulation.reference, formatDateTime(row.simulation.date), row.simulation.clientName, row.productName, formatDecimal(row.simulation.amount),
                            row.simulation.term, formatDecimal(row.simulation.monthlyPayment), formatDecimal(row.simulation.interestRate), RISK_LABELS[row.simulation.riskProfile] || '', STATUS_LABELS[row.status]]),
                    })} />
                </div>
                <SeletorPeriodo value={period} onChange={setPeriod} kinds={['day', 'week', 'month', 'year', 'custom', 'all']} />
                <div className="grid gap-3 md:grid-cols-[1fr_220px]">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input placeholder="Pesquisar por cliente, referência ou código de verificação…" value={search} onChange={event => setSearch(event.target.value)} className="h-9 bg-background pl-10" />
                    </div>
                    <Select value={status} onValueChange={value => setStatus(value as typeof status)}>
                        <SelectTrigger className="h-9 bg-background"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Todos os estados</SelectItem>
                            <SelectItem value="simulated">Simuladas</SelectItem>
                            <SelectItem value="converted">Convertidas em pedido</SelectItem>
                            <SelectItem value="expired">Expiradas</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </CardHeader>
            <CardContent>
                <TabelaPaginada columns={columns} rows={filtered} rowKey={row => row.simulation.id} pageSize={15}
                    empty={rows.length ? 'Nenhuma simulação corresponde aos filtros.' : 'Ainda não há simulações guardadas no histórico.'} />
            </CardContent>
        </Card>
    );
}
