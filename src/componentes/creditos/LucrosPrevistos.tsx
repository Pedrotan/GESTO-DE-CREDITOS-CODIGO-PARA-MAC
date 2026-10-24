import { Fragment, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, ChevronUp, FileSpreadsheet, FileText, Loader2, TrendingUp } from 'lucide-react';
import { Button } from '@/componentes/ui/button';
import { formatCurrency } from '@/bibliotecas/formatters';
import { addDaysToKey } from '@/bibliotecas/fuso-angola';
import { expectedProfitSummary } from '@/bibliotecas/carteira-credito';
import { creditProfitBreakdown, profitForecastDetailReport } from '@/bibliotecas/relatorios-previsao';
import { useAuth } from '@/contextos/ContextoAutenticacao';
import { useData } from '@/contextos/ContextoDados';
import { generateReportFromDef } from '@/componentes/creditos/RelatoriosCreditos';
import type { CarteiraState } from '@/componentes/creditos/useCarteira';

const kz = (minor: number) => formatCurrency(minor / 100);
const pct = (value: number) => `${(value * 100).toLocaleString('pt-AO', { maximumFractionDigits: 1 })}%`;
const dateText = (key: string | null) => key ? key.split('-').reverse().join('/') : '—';
const SITUATION_TONE: Record<string, string> = { Paga: 'text-emerald-600', 'Em atraso': 'text-red-600', Parcial: 'text-amber-600', 'Por vencer': 'text-muted-foreground' };

/**
 * Card de lucros previstos dos créditos concedidos: capital investido face ao lucro previsto pelas taxas de juro,
 * o lucro já recebido e o que falta receber, no total e crédito a crédito (com as prestações de cada um), e o
 * relatório detalhado de como se chega à previsão.
 */
export function LucrosPrevistos({ state }: { state: CarteiraState }) {
    const { user } = useAuth();
    const { companySettings } = useData();
    const installments = useMemo(() => state.context?.installments || [], [state.context]);
    const summary = useMemo(() => expectedProfitSummary(state.rows, state.payments || []), [state.rows, state.payments]);
    const byId = useMemo(() => new Map(state.rows.map(row => [row.id, row])), [state.rows]);
    const [open, setOpen] = useState(false);
    const [showAll, setShowAll] = useState(false);
    const [expanded, setExpanded] = useState<string | null>(null);
    const [busy, setBusy] = useState<'pdf' | 'xlsx' | null>(null);
    const [error, setError] = useState('');

    // Lucro dos próximos 30 dias e lucro em atraso (juros de prestações vencidas e por pagar).
    const timing = useMemo(() => {
        const limit = addDaysToKey(state.today, 30);
        let next30 = 0, late = 0;
        for (const item of summary.rows) {
            const row = byId.get(item.id);
            if (!row) continue;
            for (const line of creditProfitBreakdown(row, installments, state.today).lines) {
                if (line.toReceiveInterestMinor <= 0) continue;
                if (line.due < state.today) late += line.toReceiveInterestMinor;
                else if (line.due <= limit) next30 += line.toReceiveInterestMinor;
            }
        }
        return { next30, late };
    }, [summary.rows, byId, installments, state.today]);

    if (!summary.count) return null;
    const receivedShare = summary.expectedProfitMinor > 0 ? summary.receivedProfitMinor / summary.expectedProfitMinor : 0;
    const rows = showAll ? summary.rows : summary.rows.slice(0, 10);
    const averageRate = summary.capitalMinor > 0 ? summary.rows.reduce((sum, row) => sum + row.rate * row.capitalMinor, 0) / summary.capitalMinor : 0;

    const download = async (format: 'pdf' | 'xlsx') => {
        if (!user) return;
        setBusy(format); setError('');
        try {
            const def = profitForecastDetailReport({ rows: state.rows, installments, payments: state.payments || [], todayKey: state.today });
            await generateReportFromDef(def, companySettings, { id: user.id, name: user.name, role: user.role }, format);
        } catch (cause: any) { setError(cause?.message || 'Não foi possível gerar o relatório.'); } finally { setBusy(null); }
    };

    const figures = [
        { label: 'Capital investido', value: kz(summary.capitalMinor), note: `${summary.count} crédito(s) · taxa média ${averageRate.toLocaleString('pt-AO', { maximumFractionDigits: 1 })}%` },
        { label: 'Lucro previsto', value: kz(summary.expectedProfitMinor), note: `${pct(summary.marginRate)} sobre o capital`, tone: 'text-emerald-600' },
        { label: 'Lucro já recebido', value: kz(summary.receivedProfitMinor), note: `${pct(receivedShare)} do lucro previsto`, tone: 'text-sky-600' },
        { label: 'Lucro por receber', value: kz(summary.toReceiveProfitMinor), note: 'Juros ainda por cobrar', tone: 'text-orange-600' },
        { label: 'A receber nos próximos 30 dias', value: kz(timing.next30), note: 'Juros das prestações que vencem', tone: 'text-violet-600' },
        { label: 'Lucro em atraso', value: kz(timing.late), note: 'Juros de prestações vencidas', tone: timing.late > 0 ? 'text-red-600' : '' },
        { label: 'Total a receber dos créditos', value: kz(summary.totalExpectedMinor), note: 'Capital + lucro previsto' },
    ];

    return (
        <section className="mb-6 rounded-2xl border bg-card p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h2 className="flex items-center gap-2 text-base font-black"><TrendingUp className="h-5 w-5 text-emerald-600" /> Lucros previstos dos créditos concedidos</h2>
                    <p className="text-xs text-muted-foreground">Os ganhos da empresa são os juros: a soma dos juros de todas as prestações de cada crédito, calculados pela taxa do crédito sobre o capital entregue ao cliente.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" disabled={!!busy} onClick={() => void download('pdf')} title="Relatório detalhado: como se chega à previsão de cada crédito, prestação a prestação">
                        {busy === 'pdf' ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <FileText className="mr-1.5 h-4 w-4 text-red-600" />} Relatório detalhado (PDF)
                    </Button>
                    <Button variant="outline" size="sm" disabled={!!busy} onClick={() => void download('xlsx')}>
                        {busy === 'xlsx' ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <FileSpreadsheet className="mr-1.5 h-4 w-4 text-emerald-600" />} Excel
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setOpen(value => !value)}>
                        {open ? <ChevronUp className="mr-1.5 h-4 w-4" /> : <ChevronDown className="mr-1.5 h-4 w-4" />} {open ? 'Esconder' : 'Ver'} por crédito
                    </Button>
                </div>
            </div>
            {error && <p role="alert" className="mt-2 text-sm text-destructive">{error}</p>}
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
                {figures.map(figure => (
                    <div key={figure.label} className="rounded-xl border bg-background p-3">
                        <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{figure.label}</p>
                        <p className={`mt-1 text-lg font-black ${figure.tone || ''}`}>{figure.value}</p>
                        <p className="text-[11px] text-muted-foreground">{figure.note}</p>
                    </div>
                ))}
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted" title={`Lucro recebido: ${pct(receivedShare)}`}>
                <div className="h-full bg-emerald-500" style={{ width: `${Math.min(100, receivedShare * 100)}%` }} />
            </div>
            {open && (
                <div className="mt-4 overflow-x-auto">
                    <p className="mb-2 text-xs text-muted-foreground">Clique num crédito para ver as prestações e o juro (lucro) de cada uma.</p>
                    <table className="w-full text-sm">
                        <thead className="text-left text-[11px] uppercase text-muted-foreground">
                            <tr>
                                <th className="py-2" /><th>Contrato</th><th>Cliente</th><th className="text-right">Taxa</th><th className="text-center">Prestações</th><th>Próximo vencimento</th>
                                <th className="text-right">Capital investido</th><th className="text-right">Lucro previsto</th><th className="text-right">Recebido</th><th className="text-right">Por receber</th><th className="text-right">Total a receber</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map(item => {
                                const row = byId.get(item.id)!;
                                const detail = creditProfitBreakdown(row, installments, state.today);
                                const isOpen = expanded === item.id;
                                return (
                                    <Fragment key={item.id}>
                                        <tr className="cursor-pointer border-t hover:bg-muted/40" onClick={() => setExpanded(isOpen ? null : item.id)}>
                                            <td className="py-2 pr-1">{isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</td>
                                            <td className="whitespace-nowrap font-mono text-xs font-bold">{item.reference}</td>
                                            <td>{item.clientName}</td>
                                            <td className="text-right">{item.rate.toLocaleString('pt-AO')}%</td>
                                            <td className="text-center">{detail.paidCount}/{detail.lines.length || row.totalCount}</td>
                                            <td className="whitespace-nowrap">{dateText(detail.nextDue)}</td>
                                            <td className="whitespace-nowrap text-right">{kz(item.capitalMinor)}</td>
                                            <td className="whitespace-nowrap text-right font-bold text-emerald-600">{kz(item.expectedProfitMinor)} <span className="text-[10px] font-normal text-muted-foreground">({pct(item.marginRate)})</span></td>
                                            <td className="whitespace-nowrap text-right text-sky-600">{kz(item.receivedProfitMinor)}</td>
                                            <td className="whitespace-nowrap text-right font-bold text-orange-600">{kz(item.toReceiveProfitMinor)}</td>
                                            <td className="whitespace-nowrap text-right">{kz(item.totalExpectedMinor)}</td>
                                        </tr>
                                        {isOpen && (
                                            <tr className="bg-muted/30">
                                                <td colSpan={11} className="px-4 py-3">
                                                    <p className="mb-2 text-xs">
                                                        <strong>Como se chega à previsão:</strong> capital de {kz(item.capitalMinor)} à taxa de {item.rate.toLocaleString('pt-AO')}% em {detail.lines.length || row.totalCount} prestação(ões).
                                                        A soma dos juros das prestações dá o lucro previsto de <strong className="text-emerald-600">{kz(detail.expectedMinor)}</strong>;
                                                        já foram recebidos {kz(item.receivedProfitMinor)} e faltam <strong className="text-orange-600">{kz(item.toReceiveProfitMinor)}</strong>.
                                                    </p>
                                                    {detail.lines.length ? (
                                                        <table className="w-full text-xs">
                                                            <thead className="text-left text-[10px] uppercase text-muted-foreground">
                                                                <tr><th className="py-1">N.º</th><th>Vencimento</th><th className="text-right">Capital</th><th className="text-right">Juros (lucro)</th><th className="text-right">Prestação</th><th className="text-right">Juros recebidos</th><th className="text-right">Juros por receber</th><th className="pl-3">Situação</th></tr>
                                                            </thead>
                                                            <tbody>
                                                                {detail.lines.map(line => (
                                                                    <tr key={line.number} className="border-t border-border/60">
                                                                        <td className="py-1">{line.number}</td><td>{dateText(line.due)}</td><td className="text-right">{kz(line.principalMinor)}</td>
                                                                        <td className="text-right font-semibold text-emerald-600">{kz(line.interestMinor)}</td><td className="text-right">{kz(line.totalMinor)}</td>
                                                                        <td className="text-right text-sky-600">{kz(line.paidInterestMinor)}</td><td className="text-right text-orange-600">{kz(line.toReceiveInterestMinor)}</td>
                                                                        <td className={`pl-3 font-semibold ${SITUATION_TONE[line.situation] || ''}`}>{line.situation}</td>
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                    ) : <p className="text-xs text-muted-foreground">Crédito sem plano de prestações: lucro previsto = total a pagar − capital.</p>}
                                                </td>
                                            </tr>
                                        )}
                                    </Fragment>
                                );
                            })}
                        </tbody>
                    </table>
                    {summary.rows.length > 10 && (
                        <Button variant="ghost" size="sm" className="mt-2" onClick={() => setShowAll(value => !value)}>
                            {showAll ? 'Mostrar só os 10 maiores' : `Mostrar todos (${summary.rows.length})`}
                        </Button>
                    )}
                </div>
            )}
        </section>
    );
}
