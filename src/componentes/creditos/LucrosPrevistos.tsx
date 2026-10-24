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
const MONTHS_LONG = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
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

    // Mês escolhido nos filtros (vista Produção): a previsão passa a ser a das prestações que vencem nesse mês.
    const period = state.view === 'producao' ? state.range : null;
    const periodLabel = period ? `${MONTHS_LONG[state.month]} de ${state.year}` : '';
    const monthly = useMemo(() => {
        if (!period) return null;
        const items = summary.rows.map(item => {
            const row = byId.get(item.id);
            if (!row) return null;
            const lines = creditProfitBreakdown(row, installments, state.today).lines.filter(line => line.due >= period.start && line.due <= period.end);
            if (!lines.length) return null;
            const sum = (pick: (line: typeof lines[number]) => number) => lines.reduce((total, line) => total + pick(line), 0);
            return {
                item, lines, principal: sum(line => line.principalMinor), interest: sum(line => line.interestMinor), received: sum(line => line.paidInterestMinor),
                toReceive: sum(line => line.toReceiveInterestMinor), total: sum(line => line.totalMinor),
                late: sum(line => (line.due < state.today ? line.toReceiveInterestMinor : 0)),
            };
        }).filter(Boolean) as Array<{ item: typeof summary.rows[number]; lines: ReturnType<typeof creditProfitBreakdown>['lines']; principal: number; interest: number; received: number; toReceive: number; total: number; late: number }>;
        const total = (key: 'principal' | 'interest' | 'received' | 'toReceive' | 'total' | 'late') => items.reduce((sum, entry) => sum + entry[key], 0);
        const granted = state.rows.filter(row => row.competenceMonth === state.monthKey && summary.rows.some(item => item.id === row.id));
        return {
            items: items.sort((a, b) => b.toReceive - a.toReceive || b.interest - a.interest),
            principal: total('principal'), interest: total('interest'), received: total('received'), toReceive: total('toReceive'), total: total('total'), late: total('late'),
            grantedCount: granted.length, grantedMinor: granted.reduce((sum, row) => sum + row.grantedMinor, 0),
            installments: items.reduce((sum, entry) => sum + entry.lines.length, 0),
        };
    }, [period, summary.rows, byId, installments, state.today, state.rows, state.monthKey]);

    if (!summary.count) return null;
    const receivedShare = monthly
        ? (monthly.interest > 0 ? monthly.received / monthly.interest : 0)
        : (summary.expectedProfitMinor > 0 ? summary.receivedProfitMinor / summary.expectedProfitMinor : 0);
    const averageRate = summary.capitalMinor > 0 ? summary.rows.reduce((sum, row) => sum + row.rate * row.capitalMinor, 0) / summary.capitalMinor : 0;
    // Linhas da tabela: a carteira inteira, ou só os créditos com prestações no mês (valores desse mês).
    const tableRows = monthly
        ? monthly.items.map(entry => ({ ...entry.item, expectedProfitMinor: entry.interest, receivedProfitMinor: entry.received, toReceiveProfitMinor: entry.toReceive,
            totalExpectedMinor: entry.total, monthLines: entry.lines, monthPrincipal: entry.principal }))
        : summary.rows.map(item => ({ ...item, monthLines: null as null | ReturnType<typeof creditProfitBreakdown>['lines'], monthPrincipal: 0 }));
    const rows = showAll ? tableRows : tableRows.slice(0, 10);

    const download = async (format: 'pdf' | 'xlsx') => {
        if (!user) return;
        setBusy(format); setError('');
        try {
            const def = profitForecastDetailReport({ rows: state.rows, installments, payments: state.payments || [], todayKey: state.today,
                creditIds: monthly ? monthly.items.map(entry => entry.item.id) : undefined });
            if (monthly) {
                if (!monthly.items.length) throw new Error(`Não há prestações a vencer em ${periodLabel}.`);
                def.subtitle = `Créditos com prestações em ${periodLabel} · ${def.subtitle}`;
                def.fileBase = `${def.fileBase}-${state.monthKey}`;
            }
            await generateReportFromDef(def, companySettings, { id: user.id, name: user.name, role: user.role }, format);
        } catch (cause: any) { setError(cause?.message || 'Não foi possível gerar o relatório.'); } finally { setBusy(null); }
    };

    const figures = monthly ? [
        { label: `Prestações de ${MONTHS_LONG[state.month]}`, value: String(monthly.installments), note: `${monthly.items.length} crédito(s) · ${monthly.grantedCount} concedido(s) no mês (${kz(monthly.grantedMinor)})` },
        { label: 'Capital a receber no mês', value: kz(monthly.principal), note: 'Capital das prestações do mês' },
        { label: 'Lucro previsto no mês', value: kz(monthly.interest), note: monthly.total > 0 ? `${pct(monthly.interest / monthly.total)} do valor a receber` : 'Juros das prestações do mês', tone: 'text-emerald-600' },
        { label: 'Lucro já recebido', value: kz(monthly.received), note: `${pct(receivedShare)} do lucro do mês`, tone: 'text-sky-600' },
        { label: 'Lucro por receber', value: kz(monthly.toReceive), note: 'Juros do mês ainda por cobrar', tone: 'text-orange-600' },
        { label: 'Lucro em atraso', value: kz(monthly.late), note: 'Juros do mês já vencidos', tone: monthly.late > 0 ? 'text-red-600' : '' },
        { label: 'Total a receber no mês', value: kz(monthly.total), note: 'Capital + lucro das prestações' },
    ] : [
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
                    <h2 className="flex items-center gap-2 text-base font-black"><TrendingUp className="h-5 w-5 text-emerald-600" /> {monthly ? `Lucros previstos em ${periodLabel}` : 'Lucros previstos dos créditos concedidos'}</h2>
                    <p className="text-xs text-muted-foreground">{monthly
                        ? `Os juros (lucro) e o capital das prestações que vencem em ${periodLabel}, de todos os créditos concedidos. Escolha outro mês nos filtros para ver a previsão desse mês.`
                        : 'Os ganhos da empresa são os juros: a soma dos juros de todas as prestações de cada crédito, calculados pela taxa do crédito sobre o capital entregue ao cliente.'}</p>
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
                    <p className="mb-2 text-xs text-muted-foreground">{monthly ? `Créditos com prestações em ${periodLabel}. Clique num crédito para ver as prestações do mês.` : 'Clique num crédito para ver as prestações e o juro (lucro) de cada uma.'}</p>
                    {monthly && !monthly.items.length && <p className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">Não há prestações a vencer em {periodLabel}.</p>}
                    <table className="w-full text-sm">
                        <thead className="text-left text-[11px] uppercase text-muted-foreground">
                            <tr>
                                <th className="py-2" /><th>Contrato</th><th>Cliente</th><th className="text-right">Taxa</th><th className="text-center">Prestações</th><th>Próximo vencimento</th>
                                <th className="text-right">{monthly ? 'Capital do mês' : 'Capital investido'}</th><th className="text-right">Lucro previsto</th><th className="text-right">Recebido</th><th className="text-right">Por receber</th><th className="text-right">Total a receber</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map(item => {
                                const row = byId.get(item.id)!;
                                const full = creditProfitBreakdown(row, installments, state.today);
                                const detail = item.monthLines ? { ...full, lines: item.monthLines } : full;
                                const isOpen = expanded === item.id;
                                return (
                                    <Fragment key={item.id}>
                                        <tr className="cursor-pointer border-t hover:bg-muted/40" onClick={() => setExpanded(isOpen ? null : item.id)}>
                                            <td className="py-2 pr-1">{isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</td>
                                            <td className="whitespace-nowrap font-mono text-xs font-bold">{item.reference}</td>
                                            <td>{item.clientName}</td>
                                            <td className="text-right">{item.rate.toLocaleString('pt-AO')}%</td>
                                            <td className="text-center">{item.monthLines ? `${item.monthLines.filter(line => line.situation === 'Paga').length}/${item.monthLines.length}` : `${detail.paidCount}/${detail.lines.length || row.totalCount}`}</td>
                                            <td className="whitespace-nowrap">{dateText(item.monthLines ? item.monthLines[0]?.due || null : detail.nextDue)}</td>
                                            <td className="whitespace-nowrap text-right">{kz(item.monthLines ? item.monthPrincipal : item.capitalMinor)}</td>
                                            <td className="whitespace-nowrap text-right font-bold text-emerald-600">{kz(item.expectedProfitMinor)} <span className="text-[10px] font-normal text-muted-foreground">({pct(item.marginRate)})</span></td>
                                            <td className="whitespace-nowrap text-right text-sky-600">{kz(item.receivedProfitMinor)}</td>
                                            <td className="whitespace-nowrap text-right font-bold text-orange-600">{kz(item.toReceiveProfitMinor)}</td>
                                            <td className="whitespace-nowrap text-right">{kz(item.totalExpectedMinor)}</td>
                                        </tr>
                                        {isOpen && (
                                            <tr className="bg-muted/30">
                                                <td colSpan={11} className="px-4 py-3">
                                                    <p className="mb-2 text-xs">
                                                        {item.monthLines && <><strong>Em {periodLabel}:</strong> {item.monthLines.length} prestação(ões) com {kz(item.expectedProfitMinor)} de juros. </>}
                                                        <strong>Como se chega à previsão:</strong> capital de {kz(item.capitalMinor)} à taxa de {item.rate.toLocaleString('pt-AO')}% em {full.lines.length || row.totalCount} prestação(ões).
                                                        A soma dos juros das prestações dá o lucro previsto de <strong className="text-emerald-600">{kz(full.expectedMinor)}</strong>{item.monthLines ? ' no crédito inteiro' : ''};
                                                        {item.monthLines ? "no mês, " : ""}já foram recebidos {kz(item.receivedProfitMinor)} e faltam <strong className="text-orange-600">{kz(item.toReceiveProfitMinor)}</strong>.
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
                    {tableRows.length > 10 && (
                        <Button variant="ghost" size="sm" className="mt-2" onClick={() => setShowAll(value => !value)}>
                            {showAll ? 'Mostrar só os 10 maiores' : `Mostrar todos (${tableRows.length})`}
                        </Button>
                    )}
                </div>
            )}
        </section>
    );
}
