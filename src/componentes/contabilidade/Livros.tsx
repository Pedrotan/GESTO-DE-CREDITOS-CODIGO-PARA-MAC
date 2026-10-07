import { useMemo, useState } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import { Badge } from '@/componentes/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/componentes/ui/select';
import { Switch } from '@/componentes/ui/switch';
import { TableCell, TableRow } from '@/componentes/ui/table';
import { formatDateTime } from '@/bibliotecas/formatters';
import { ACCOUNT_CLASS_LABELS, CHART_OF_ACCOUNTS, accountCode, accountDefinition, accountName, entryTypeLabel } from '@/bibliotecas/plano-contas';
import {
    accountLedger, cashFlow, incomeStatement, receivablesForecast, trialBalanceForPeriod, type AccountMovement, type DateRange, type TrialBalanceRow,
} from '@/bibliotecas/relatorios-contabeis';
import { BotoesExportar, Indicador, SeccaoCabecalho, TabelaPaginada, type Coluna } from './comum';
import { money } from './formato';
import type { ContabilidadeData } from './useContabilidade';

/** Saldo com a indicação do lado: D (devedor) ou C (credor). */
const sided = (debitMinusCredit: number) => debitMinusCredit === 0 ? money(0) : `${money(Math.abs(debitMinusCredit))} ${debitMinusCredit > 0 ? 'D' : 'C'}`;

export function Balancete({ data, range, rangeLabel }: { data: ContabilidadeData; range: DateRange; rangeLabel: string }) {
    const [showEmpty, setShowEmpty] = useState(false);
    const [accountClass, setAccountClass] = useState('all');
    const result = useMemo(() => trialBalanceForPeriod(data.journal, range, showEmpty), [data.journal, range, showEmpty]);
    const rows = result.rows.filter(row => accountClass === 'all' || row.accountClass === accountClass);
    const diff = result.totals.debitMinor - result.totals.creditMinor;
    const columns: Coluna<TrialBalanceRow>[] = [
        { key: 'code', header: 'Código', render: row => <span className="font-mono text-xs">{accountCode(row.account, data.catalog)}</span> },
        { key: 'name', header: 'Conta', className: 'min-w-[220px]', render: row => <div><p className="font-medium">{accountName(row.account, data.catalog)}</p><p className="text-[11px] text-muted-foreground">{ACCOUNT_CLASS_LABELS[row.accountClass as keyof typeof ACCOUNT_CLASS_LABELS]} · natureza {row.nature === 'debit' ? 'devedora' : 'credora'}</p></div> },
        { key: 'opening', header: 'Saldo inicial', align: 'right', className: 'whitespace-nowrap font-mono', render: row => sided(row.openingMinor) },
        { key: 'debit', header: 'Débitos', align: 'right', className: 'whitespace-nowrap font-mono', render: row => money(row.debitMinor) },
        { key: 'credit', header: 'Créditos', align: 'right', className: 'whitespace-nowrap font-mono', render: row => money(row.creditMinor) },
        { key: 'closing', header: 'Saldo final', align: 'right', className: 'whitespace-nowrap font-mono font-bold', render: row => sided(row.closingMinor) },
    ];
    const footer = (
        <TableRow className="bg-muted/60 font-bold">
            <TableCell colSpan={2}>Totais</TableCell>
            <TableCell className="text-right font-mono text-xs">D {money(result.totals.openingDebitMinor)}<br />C {money(result.totals.openingCreditMinor)}</TableCell>
            <TableCell className="text-right font-mono">{money(result.totals.debitMinor)}</TableCell>
            <TableCell className="text-right font-mono">{money(result.totals.creditMinor)}</TableCell>
            <TableCell className="text-right font-mono text-xs">D {money(result.totals.closingDebitMinor)}<br />C {money(result.totals.closingCreditMinor)}</TableCell>
        </TableRow>
    );
    return (
        <div>
            <SeccaoCabecalho title="Balancete de Verificação" description={`Saldo inicial (movimentos anteriores), débitos e créditos de ${rangeLabel} e saldo final de cada conta do plano.`}
                actions={<BotoesExportar build={() => ({
                    title: 'Balancete de Verificação', subtitle: rangeLabel, fileName: `balancete-${rangeLabel}`, numericColumns: [3, 4, 5, 6],
                    head: ['Código', 'Conta', 'Classe', 'Saldo inicial', 'Débitos', 'Créditos', 'Saldo final'],
                    body: rows.map(row => [accountCode(row.account, data.catalog), accountName(row.account, data.catalog), ACCOUNT_CLASS_LABELS[row.accountClass as keyof typeof ACCOUNT_CLASS_LABELS], sided(row.openingMinor), money(row.debitMinor), money(row.creditMinor), sided(row.closingMinor)]),
                    footer: [['', 'Totais', '', '', money(result.totals.debitMinor), money(result.totals.creditMinor), result.balanced ? 'Equilibrado' : 'DESEQUILIBRADO']],
                })} />} />
            <div className="mb-4 grid gap-3 md:grid-cols-4">
                <Indicador label="Total dos débitos" value={money(result.totals.debitMinor)} />
                <Indicador label="Total dos créditos" value={money(result.totals.creditMinor)} />
                <Indicador label="Diferença" value={money(diff)} tone={diff === 0 ? 'good' : 'bad'} />
                <div className={`flex items-center gap-3 rounded-xl border p-3 ${result.balanced ? 'border-emerald-300 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/30' : 'border-red-300 bg-red-50/60 dark:border-red-900 dark:bg-red-950/30'}`}>
                    {result.balanced ? <CheckCircle2 className="h-7 w-7 text-emerald-600" /> : <XCircle className="h-7 w-7 text-red-600" />}
                    <div><p className="text-sm font-bold">{result.balanced ? 'Balancete equilibrado' : 'Balancete desequilibrado'}</p><p className="text-xs text-muted-foreground">Débitos = créditos nos saldos inicial, do período e final.</p></div>
                </div>
            </div>
            <div className="mb-3 flex flex-wrap items-center gap-4">
                <Select value={accountClass} onValueChange={setAccountClass}>
                    <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="all">Todas as classes</SelectItem>{Object.entries(ACCOUNT_CLASS_LABELS).map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}</SelectContent>
                </Select>
                <label className="flex items-center gap-2 text-sm"><Switch checked={showEmpty} onCheckedChange={setShowEmpty} />Mostrar contas sem movimentos</label>
            </div>
            <TabelaPaginada columns={columns} rows={rows} rowKey={row => row.account} pageSize={50} footer={footer} />
        </div>
    );
}

export function RazaoConta({ data, range, rangeLabel }: { data: ContabilidadeData; range: DateRange; rangeLabel: string }) {
    const accounts = useMemo(() => [...new Set([...CHART_OF_ACCOUNTS.map(item => item.account), ...data.journal.flatMap(entry => entry.lines.map(line => line.account))])], [data.journal]);
    const [account, setAccount] = useState('bank');
    const ledger = useMemo(() => accountLedger(data.journal, account, range), [data.journal, account, range]);
    const definition = accountDefinition(account);
    const debit = ledger.movements.reduce((sum, item) => sum + item.debitMinor, 0);
    const credit = ledger.movements.reduce((sum, item) => sum + item.creditMinor, 0);
    const columns: Coluna<AccountMovement>[] = [
        { key: 'seq', header: 'N.º', render: item => <span className="font-mono text-xs">{String(item.sequence).padStart(5, '0')}</span> },
        { key: 'date', header: 'Data', className: 'whitespace-nowrap', render: item => <span className="text-xs">{formatDateTime(item.timestamp)}</span> },
        { key: 'desc', header: 'Descrição', className: 'min-w-[240px]', render: item => <div><p>{item.description}</p><p className="text-[11px] text-muted-foreground">{entryTypeLabel(item.type)}{item.creditId ? ` · Contrato ${item.creditId}` : ''}</p></div> },
        { key: 'debit', header: 'Débito', align: 'right', className: 'whitespace-nowrap font-mono', render: item => item.debitMinor ? money(item.debitMinor) : '' },
        { key: 'credit', header: 'Crédito', align: 'right', className: 'whitespace-nowrap font-mono', render: item => item.creditMinor ? money(item.creditMinor) : '' },
        { key: 'balance', header: 'Saldo', align: 'right', className: 'whitespace-nowrap font-mono font-bold', render: item => <span className={item.balanceMinor < 0 ? 'text-red-600' : ''}>{money(item.balanceMinor)}</span> },
    ];
    return (
        <div>
            <SeccaoCabecalho title="Razão por Conta" description="Movimentos de uma conta com saldo inicial, saldo acumulado após cada lançamento e saldo final, sempre na natureza da conta (positivo = saldo normal)."
                actions={<BotoesExportar build={() => ({
                    title: `Razão — ${accountName(account, data.catalog)}`, subtitle: rangeLabel, fileName: `razao-${account}-${rangeLabel}`, numericColumns: [3, 4, 5],
                    head: ['N.º', 'Data', 'Descrição', 'Débito', 'Crédito', 'Saldo'],
                    body: [['', '', 'Saldo inicial', '', '', money(ledger.openingMinor)], ...ledger.movements.map(item => [String(item.sequence), formatDateTime(item.timestamp), item.description, item.debitMinor ? money(item.debitMinor) : '', item.creditMinor ? money(item.creditMinor) : '', money(item.balanceMinor)])],
                    footer: [['', '', 'Totais e saldo final', money(debit), money(credit), money(ledger.closingMinor)]],
                })} />} />
            <div className="mb-4 flex flex-wrap items-center gap-3">
                <Select value={account} onValueChange={setAccount}>
                    <SelectTrigger className="w-80"><SelectValue /></SelectTrigger>
                    <SelectContent>{accounts.map(item => <SelectItem key={item} value={item}>{accountCode(item, data.catalog)} · {accountName(item, data.catalog)}</SelectItem>)}</SelectContent>
                </Select>
                <Badge variant="outline">{ACCOUNT_CLASS_LABELS[definition.accountClass]} · natureza {definition.nature === 'debit' ? 'devedora' : 'credora'}</Badge>
            </div>
            <div className="mb-4 grid gap-3 md:grid-cols-4">
                <Indicador label="Saldo inicial" value={money(ledger.openingMinor)} />
                <Indicador label="Débitos do período" value={money(debit)} />
                <Indicador label="Créditos do período" value={money(credit)} />
                <Indicador label="Saldo final" value={money(ledger.closingMinor)} tone={ledger.closingMinor < 0 ? 'bad' : 'default'} hint={ledger.closingMinor < 0 ? 'Saldo contrário à natureza da conta' : undefined} />
            </div>
            <TabelaPaginada columns={columns} rows={[...ledger.movements].reverse()} rowKey={item => `${item.entryId}`} pageSize={25} empty="Sem movimentos nesta conta no período." />
        </div>
    );
}

function previousRange(range: DateRange): DateRange | null {
    if (!range.start || !range.end) return null;
    const length = range.end.getTime() - range.start.getTime();
    return { start: new Date(range.start.getTime() - length - 1), end: new Date(range.start.getTime() - 1) };
}

export function Resultados({ data, range, rangeLabel }: { data: ContabilidadeData; range: DateRange; rangeLabel: string }) {
    const current = useMemo(() => incomeStatement(data.journal, range), [data.journal, range]);
    const prevRange = useMemo(() => previousRange(range), [range]);
    const previous = useMemo(() => prevRange ? incomeStatement(data.journal, prevRange) : null, [data.journal, prevRange]);
    const accounts = (kind: 'revenue' | 'expenses') => [...new Set([...current[kind].map(item => item.account), ...(previous?.[kind] || []).map(item => item.account)])];
    const amount = (list: Array<{ account: string; amountMinor: number }> | undefined, account: string) => list?.find(item => item.account === account)?.amountMinor || 0;
    const variation = (now: number, before: number) => before === 0 ? '—' : `${(((now - before) / Math.abs(before)) * 100).toFixed(1).replace('.', ',')}%`;
    const section = (title: string, kind: 'revenue' | 'expenses', total: number, previousTotal?: number) => (
        <div className="overflow-hidden rounded-xl border bg-card">
            <div className="flex items-center justify-between bg-muted/50 px-4 py-2"><p className="text-sm font-bold uppercase tracking-wide">{title}</p><p className="font-mono text-sm font-bold">{money(total)}</p></div>
            <table className="w-full text-sm">
                <thead><tr className="text-xs text-muted-foreground"><th className="px-4 py-2 text-left">Conta</th><th className="px-4 py-2 text-right">{rangeLabel}</th>{previous && <th className="px-4 py-2 text-right">Período anterior</th>}{previous && <th className="px-4 py-2 text-right">Variação</th>}</tr></thead>
                <tbody>
                    {accounts(kind).map(account => (
                        <tr key={account} className="border-t">
                            <td className="px-4 py-2">{accountCode(account, data.catalog)} · {accountName(account, data.catalog)}</td>
                            <td className="px-4 py-2 text-right font-mono">{money(amount(current[kind], account))}</td>
                            {previous && <td className="px-4 py-2 text-right font-mono text-muted-foreground">{money(amount(previous[kind], account))}</td>}
                            {previous && <td className="px-4 py-2 text-right text-xs">{variation(amount(current[kind], account), amount(previous[kind], account))}</td>}
                        </tr>
                    ))}
                    {accounts(kind).length === 0 && <tr><td className="px-4 py-3 text-muted-foreground" colSpan={4}>Sem movimentos.</td></tr>}
                </tbody>
                {previousTotal !== undefined && <tfoot><tr className="border-t font-semibold"><td className="px-4 py-2">Total</td><td className="px-4 py-2 text-right font-mono">{money(total)}</td><td className="px-4 py-2 text-right font-mono text-muted-foreground">{money(previousTotal)}</td><td className="px-4 py-2 text-right text-xs">{variation(total, previousTotal)}</td></tr></tfoot>}
            </table>
        </div>
    );
    return (
        <div className="space-y-4">
            <SeccaoCabecalho title="Demonstração de Resultados" description={`Proveitos menos custos reconhecidos no razão em ${rangeLabel}. Provisões só contam depois de contabilizadas. Documento interno de gestão, a validar pelo contabilista.`}
                actions={<BotoesExportar build={() => ({
                    title: 'Demonstração de Resultados', subtitle: rangeLabel, fileName: `resultados-${rangeLabel}`, numericColumns: [2, 3],
                    head: ['Grupo', 'Conta', rangeLabel, 'Período anterior'],
                    body: [
                        ...accounts('revenue').map(account => ['Proveitos', accountName(account, data.catalog), money(amount(current.revenue, account)), previous ? money(amount(previous.revenue, account)) : '—']),
                        ...accounts('expenses').map(account => ['Custos', accountName(account, data.catalog), money(amount(current.expenses, account)), previous ? money(amount(previous.expenses, account)) : '—']),
                    ],
                    footer: [['Total', 'Proveitos', money(current.revenueMinor), previous ? money(previous.revenueMinor) : '—'], ['Total', 'Custos', money(current.expensesMinor), previous ? money(previous.expensesMinor) : '—'], ['Resultado', 'Proveitos − custos', money(current.resultMinor), previous ? money(previous.resultMinor) : '—']],
                })} />} />
            <div className="grid gap-3 md:grid-cols-3">
                <Indicador label="Proveitos" value={money(current.revenueMinor)} tone="good" hint={previous ? `Anterior: ${money(previous.revenueMinor)}` : undefined} />
                <Indicador label="Custos" value={money(current.expensesMinor)} tone={current.expensesMinor > current.revenueMinor ? 'bad' : 'default'} hint={previous ? `Anterior: ${money(previous.expensesMinor)}` : undefined} />
                <Indicador label="Resultado do período" value={money(current.resultMinor)} tone={current.resultMinor >= 0 ? 'good' : 'bad'} hint={previous ? `Anterior: ${money(previous.resultMinor)}` : undefined} />
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
                {section('Proveitos', 'revenue', current.revenueMinor, previous?.revenueMinor)}
                {section('Custos', 'expenses', current.expensesMinor, previous?.expensesMinor)}
            </div>
        </div>
    );
}

const ACTIVE = new Set(['active', 'overdue', 'defaulted', 'renegotiated']);

export function FluxoCaixa({ data, range, rangeLabel }: { data: ContabilidadeData; range: DateRange; rangeLabel: string }) {
    const flow = useMemo(() => cashFlow(data.journal, range), [data.journal, range]);
    const forecast = useMemo(() => {
        const ids = new Set((data.snapshot?.credits || []).filter(credit => !credit.deletedAt && ACTIVE.has(String(credit.status))).map(credit => credit.id));
        return receivablesForecast((data.snapshot?.installments || []) as any, ids);
    }, [data.snapshot]);
    const pendingApproval = (data.snapshot?.credits || []).filter(credit => credit.status === 'pending_approval' && !credit.deletedAt)
        .reduce((sum, credit) => sum + Number(credit.principalAmountMinor ?? Math.round(Number(credit.principalAmount || 0) * 100)), 0);
    return (
        <div className="space-y-5">
            <SeccaoCabecalho title="Fluxo de Caixa" description={`Entradas e saídas de Caixa e Bancos em ${rangeLabel}, por natureza, e previsão de recebimentos das prestações em aberto.`}
                actions={<BotoesExportar build={() => ({
                    title: 'Fluxo de Caixa', subtitle: rangeLabel, fileName: `fluxo-caixa-${rangeLabel}`, numericColumns: [1],
                    head: ['Rubrica', 'Valor'],
                    body: [['Saldo inicial de Caixa e Bancos', money(flow.openingMinor)], ...flow.items.map(item => [item.label, money(item.amountMinor)]),
                        ['Total de entradas', money(flow.inflowMinor)], ['Total de saídas', money(-flow.outflowMinor)],
                        ...forecast.horizons.map(item => [`Previsão: próximos ${item.days} dias (${item.count} prestações)`, money(item.amountMinor)]), ['Prestações já vencidas por receber', money(forecast.overdueMinor)]],
                    footer: [['Saldo final de Caixa e Bancos', money(flow.closingMinor)]],
                })} />} />
            <div className="grid gap-3 md:grid-cols-4">
                <Indicador label="Saldo inicial" value={money(flow.openingMinor)} />
                <Indicador label="Entradas" value={money(flow.inflowMinor)} tone="good" />
                <Indicador label="Saídas" value={money(flow.outflowMinor)} tone={flow.outflowMinor > flow.inflowMinor ? 'warn' : 'default'} />
                <Indicador label="Saldo final" value={money(flow.closingMinor)} tone={flow.closingMinor < 0 ? 'bad' : 'default'} />
            </div>
            <div className="overflow-hidden rounded-xl border bg-card">
                <table className="w-full text-sm">
                    <thead><tr className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground"><th className="px-4 py-2 text-left">Rubrica</th><th className="px-4 py-2 text-right">Valor</th></tr></thead>
                    <tbody>
                        <tr className="border-t font-semibold"><td className="px-4 py-2">Saldo inicial de Caixa e Bancos</td><td className="px-4 py-2 text-right font-mono">{money(flow.openingMinor)}</td></tr>
                        {flow.items.map(item => (
                            <tr key={item.category} className="border-t">
                                <td className="px-4 py-2 pl-8">{item.label}</td>
                                <td className={`px-4 py-2 text-right font-mono ${item.amountMinor < 0 ? 'text-red-600' : 'text-emerald-700 dark:text-emerald-400'}`}>{item.amountMinor > 0 ? '+' : ''}{money(item.amountMinor)}</td>
                            </tr>
                        ))}
                        {flow.items.length === 0 && <tr className="border-t"><td className="px-4 py-3 pl-8 text-muted-foreground" colSpan={2}>Sem movimentos de caixa no período.</td></tr>}
                        <tr className="border-t bg-muted/40 font-bold"><td className="px-4 py-2">Saldo final de Caixa e Bancos</td><td className="px-4 py-2 text-right font-mono">{money(flow.closingMinor)}</td></tr>
                    </tbody>
                </table>
            </div>
            <div>
                <p className="mb-2 text-sm font-bold">Previsão de recebimentos (prestações em aberto)</p>
                <div className="grid gap-3 md:grid-cols-5">
                    {forecast.horizons.map(item => <Indicador key={item.days} label={`Próximos ${item.days} dias`} value={money(item.amountMinor)} hint={`${item.count} prestação(ões)`} />)}
                    <Indicador label="Já vencido" value={money(forecast.overdueMinor)} tone={forecast.overdueMinor ? 'bad' : 'good'} hint={`${forecast.overdueCount} prestação(ões) em atraso`} />
                </div>
                {pendingApproval > 0 && <p className="mt-2 text-xs text-muted-foreground">Créditos por aprovar ({money(pendingApproval)}) ainda não saem da caixa e não estão deduzidos da previsão.</p>}
            </div>
        </div>
    );
}
