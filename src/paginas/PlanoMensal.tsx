import { useMemo, useState } from 'react';
import { MainLayout } from '@/componentes/layout/MainLayout';
import { useData } from '@/contextos/ContextoDados';
import { Button } from '@/componentes/ui/button';
import { Input } from '@/componentes/ui/input';
import { Badge } from '@/componentes/ui/badge';
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/componentes/ui/table';
import { ChevronLeft, ChevronRight, CalendarDays, Search, CalendarClock } from 'lucide-react';
import { formatCurrency } from '@/bibliotecas/formatters';
import { cn } from '@/bibliotecas/utils';

const MESES = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

/** Estados de um vencimento no mês apresentado. */
type Estado = 'pago' | 'vencido' | 'hoje' | 'aVencer';

const ESTILO_ESTADO: Record<Estado, { rotulo: string; classe: string }> = {
    pago: { rotulo: 'Pago', classe: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
    vencido: { rotulo: 'Em mora', classe: 'bg-rose-100 text-rose-700 border-rose-200' },
    hoje: { rotulo: 'Vence hoje', classe: 'bg-amber-100 text-amber-700 border-amber-200' },
    aVencer: { rotulo: 'A vencer', classe: 'bg-sky-100 text-sky-700 border-sky-200' },
};

export default function PlanoMensal() {
    const { credits } = useData();
    const hoje = new Date();
    const [ano, setAno] = useState(hoje.getFullYear());
    const [mes, setMes] = useState(hoje.getMonth());
    const [procura, setProcura] = useState('');

    const mudarMes = (delta: number) => {
        const d = new Date(ano, mes + delta, 1);
        setAno(d.getFullYear());
        setMes(d.getMonth());
    };

    const vencimentos = useMemo(() => {
        const inicioMes = new Date(ano, mes, 1);
        const fimMes = new Date(ano, mes + 1, 0, 23, 59, 59);
        const hojeISO = new Date().toISOString().slice(0, 10);

        return credits
            // Créditos cancelados ou rejeitados não têm vencimentos a cumprir.
            .filter((c) => !['cancelled', 'rejected', 'pending_approval'].includes(c.status))
            .map((c) => {
                // Usa-se a próxima data de vencimento quando existe; caso
                // contrário, a data final do contrato.
                const bruto = c.nextDueDate || c.dueDate;
                const data = bruto ? new Date(bruto) : null;
                return { credito: c, data };
            })
            .filter(({ data }) => data && data >= inicioMes && data <= fimMes)
            .map(({ credito, data }) => {
                const iso = (data as Date).toISOString().slice(0, 10);
                let estado: Estado = 'aVencer';
                if (credito.status === 'paid') estado = 'pago';
                else if (iso < hojeISO) estado = 'vencido';
                else if (iso === hojeISO) estado = 'hoje';

                return {
                    id: credito.id,
                    cliente: credito.clientName,
                    data: data as Date,
                    valor: credito.totalDue || credito.currentBalance || 0,
                    diasMora: credito.daysOverdue || 0,
                    estado,
                };
            })
            .filter((v) => {
                const q = procura.trim().toLowerCase();
                if (!q) return true;
                return v.cliente?.toLowerCase().includes(q) || v.id.toLowerCase().includes(q);
            })
            .sort((a, b) => a.data.getTime() - b.data.getTime());
    }, [credits, ano, mes, procura]);

    const totais = useMemo(() => ({
        quantidade: vencimentos.length,
        valor: vencimentos.reduce((s, v) => s + v.valor, 0),
        emMora: vencimentos.filter((v) => v.estado === 'vencido').length,
        pagos: vencimentos.filter((v) => v.estado === 'pago').length,
    }), [vencimentos]);

    const ehMesAtual = ano === hoje.getFullYear() && mes === hoje.getMonth();

    return (
        <MainLayout title="Plano Mensal" subtitle="Vencimentos previstos mês a mês">
            <div className="flex flex-col gap-6">
                {/* Navegação de mês */}
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => mudarMes(-1)} className="h-9 w-9 p-0" title="Mês anterior">
                            <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <div className="min-w-52 text-center">
                            <p className="font-display text-xl font-black tracking-tight text-foreground">
                                {MESES[mes]} {ano}
                            </p>
                            {!ehMesAtual && (
                                <button
                                    type="button"
                                    onClick={() => { setAno(hoje.getFullYear()); setMes(hoje.getMonth()); }}
                                    className="text-xs font-semibold text-primary hover:underline"
                                >
                                    Voltar ao mês actual
                                </button>
                            )}
                        </div>
                        <Button variant="outline" size="sm" onClick={() => mudarMes(1)} className="h-9 w-9 p-0" title="Mês seguinte">
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                    </div>

                    <div className="relative w-full sm:w-72">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            placeholder="Procurar por cliente ou crédito…"
                            value={procura}
                            onChange={(e) => setProcura(e.target.value)}
                            className="pl-10"
                        />
                    </div>
                </div>

                {/* Resumo do mês */}
                <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
                    <div className="card-kpi-sky">
                        <div className="flex items-center gap-2.5">
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/10 text-slate-950 shrink-0 dark:bg-white/10 dark:text-white">
                                <CalendarDays className="h-5 w-5" />
                            </div>
                            <p className="text-sm font-bold tracking-tight text-slate-950 dark:text-white sm:text-base">Vencimentos</p>
                        </div>
                        <div className="my-2">
                            <p className="font-display text-3xl font-black tracking-tight text-slate-950 dark:text-white sm:text-4xl">
                                {totais.quantidade}
                            </p>
                        </div>
                        <p className="text-xs font-semibold text-slate-900/75 dark:text-slate-400">Neste mês</p>
                    </div>

                    <div className="card-kpi-amber">
                        <div className="flex items-center gap-2.5">
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/10 text-slate-950 shrink-0 dark:bg-white/10 dark:text-white">
                                <CalendarClock className="h-5 w-5" />
                            </div>
                            <p className="text-sm font-bold tracking-tight text-slate-950 dark:text-white sm:text-base">Valor Previsto</p>
                        </div>
                        <div className="my-2">
                            <p className="font-display truncate text-3xl font-black tracking-tight text-slate-950 dark:text-white sm:text-4xl">
                                {formatCurrency(totais.valor)}
                            </p>
                        </div>
                        <p className="text-xs font-semibold text-slate-900/75 dark:text-slate-400">Total a receber</p>
                    </div>

                    <div className="card-kpi-coral">
                        <div className="flex items-center gap-2.5">
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/10 text-slate-950 shrink-0 dark:bg-white/10 dark:text-white">
                                <CalendarClock className="h-5 w-5" />
                            </div>
                            <p className="text-sm font-bold tracking-tight text-slate-950 dark:text-white sm:text-base">Em Mora</p>
                        </div>
                        <div className="my-2">
                            <p className="font-display text-3xl font-black tracking-tight text-slate-950 dark:text-white sm:text-4xl">
                                {totais.emMora}
                            </p>
                        </div>
                        <p className="text-xs font-semibold text-slate-900/75 dark:text-slate-400">Já vencidos</p>
                    </div>

                    <div className="card-kpi-mint">
                        <div className="flex items-center gap-2.5">
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/10 text-slate-950 shrink-0 dark:bg-white/10 dark:text-white">
                                <CalendarDays className="h-5 w-5" />
                            </div>
                            <p className="text-sm font-bold tracking-tight text-slate-950 dark:text-white sm:text-base">Liquidados</p>
                        </div>
                        <div className="my-2">
                            <p className="font-display text-3xl font-black tracking-tight text-slate-950 dark:text-white sm:text-4xl">
                                {totais.pagos}
                            </p>
                        </div>
                        <p className="text-xs font-semibold text-slate-900/75 dark:text-slate-400">Já pagos</p>
                    </div>
                </div>

                {/* Lista de vencimentos */}
                <div className="card-elevated overflow-hidden">
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-muted/40 hover:bg-muted/40">
                                    <TableHead className="w-28">Data</TableHead>
                                    <TableHead>Cliente</TableHead>
                                    <TableHead className="w-32">Crédito</TableHead>
                                    <TableHead className="text-right">Valor</TableHead>
                                    <TableHead className="w-32 text-right">Estado</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {vencimentos.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={5} className="py-12 text-center text-sm text-muted-foreground">
                                            Sem vencimentos em {MESES[mes]} de {ano}.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    vencimentos.map((v) => {
                                        const estilo = ESTILO_ESTADO[v.estado];
                                        return (
                                            <TableRow key={v.id}>
                                                <TableCell className="font-semibold tabular-nums">
                                                    {String(v.data.getDate()).padStart(2, '0')}/{String(v.data.getMonth() + 1).padStart(2, '0')}
                                                </TableCell>
                                                <TableCell className="font-medium">{v.cliente}</TableCell>
                                                <TableCell className="text-xs text-muted-foreground">{v.id}</TableCell>
                                                <TableCell className="text-right font-display font-black tabular-nums">
                                                    {formatCurrency(v.valor)}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <Badge variant="outline" className={cn('text-[10px] font-bold', estilo.classe)}>
                                                        {estilo.rotulo}
                                                        {v.estado === 'vencido' && v.diasMora > 0 && ` · ${v.diasMora}d`}
                                                    </Badge>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </div>
            </div>
        </MainLayout>
    );
}
