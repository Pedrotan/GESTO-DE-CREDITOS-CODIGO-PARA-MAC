import { useMemo } from 'react';
import {
    AlertTriangle, Banknote, BookOpen, CheckCircle2, ClipboardList, Coins, Landmark, PiggyBank, ShieldAlert, ShieldCheck, TrendingDown, TrendingUp, Wallet,
} from 'lucide-react';
import { Bar, CartesianGrid, ComposedChart, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Button } from '@/componentes/ui/button';
import { Badge } from '@/componentes/ui/badge';
import { formatCurrency, formatDateTime } from '@/bibliotecas/formatters';
import { monthlySeries, type DateRange } from '@/bibliotecas/relatorios-contabeis';
import { useIndicadores } from './indicadores';
import { AUDIT_KIND_LABELS, SEVERITY_LABELS, groupFindings } from '@/bibliotecas/auditoria-contabil';
import { cn } from '@/bibliotecas/utils';
import { money } from './formato';
import type { ContabilidadeData } from './useContabilidade';

export type SeccaoContabil =
    | 'painel' | 'diario' | 'balancete' | 'razao' | 'resultados' | 'fluxo'
    | 'lancamentos' | 'reconciliacao' | 'caixa' | 'carteira' | 'abates' | 'cobranca' | 'rentabilidade'
    | 'auditoria' | 'historico' | 'pedidos' | 'trilha' | 'fecho' | 'plano' | 'regras' | 'guia';

export function CartoesContabeis({ data, range, rangeLabel, onOpen }: { data: ContabilidadeData; range: DateRange; rangeLabel: string; onOpen: (section: SeccaoContabil) => void }) {
    const kpi = useIndicadores(data, range);
    const cards: Array<{ key: string; css: string; icon: any; overline: string; title: string; value: number; footer: string; section: SeccaoContabil; negative?: boolean }> = [
        { key: 'liquid', css: 'card-kpi-sky', icon: Landmark, overline: 'Disponibilidades', title: 'Caixa e Bancos', value: kpi.liquid, footer: `Caixa ${money(kpi.cash)} · Bancos ${money(kpi.bank)}`, section: 'fluxo', negative: kpi.liquid < 0 },
        { key: 'portfolio', css: 'card-kpi-mint', icon: Wallet, overline: 'Activo', title: 'Carteira de Crédito', value: kpi.portfolio, footer: 'Capital em dívida dos clientes', section: 'carteira' },
        { key: 'interest', css: 'card-kpi-amber', icon: Coins, overline: rangeLabel, title: 'Receita de Juros', value: kpi.interest, footer: kpi.otherRevenue ? `Outros proveitos: ${money(kpi.otherRevenue)}` : 'Juros remuneratórios', section: 'resultados' },
        { key: 'late', css: 'card-kpi-coral', icon: TrendingUp, overline: rangeLabel, title: 'Receita de Mora', value: kpi.late, footer: 'Juros por atraso no pagamento', section: 'resultados' },
        { key: 'overdue', css: kpi.overdue > 0 ? 'card-kpi-coral' : 'card-kpi-mint', icon: AlertTriangle, overline: 'Hoje', title: 'Valor em Atraso', value: kpi.overdue, footer: `${kpi.overdueCount} ${kpi.overdueCount === 1 ? 'prestação vencida' : 'prestações vencidas'}`, section: 'carteira' },
        { key: 'result', css: kpi.result >= 0 ? 'card-kpi-mint' : 'card-kpi-coral', icon: kpi.result >= 0 ? TrendingUp : TrendingDown, overline: rangeLabel, title: 'Resultado', value: kpi.result, footer: `Proveitos ${money(kpi.revenue)} · Custos ${money(kpi.expenses)}`, section: 'resultados', negative: kpi.result < 0 },
        { key: 'provisions', css: 'card-kpi-purple', icon: PiggyBank, overline: 'Contabilizadas', title: 'Provisões', value: kpi.provisions, footer: 'Saldo da conta de provisões (PDD)', section: 'carteira' },
        { key: 'findings', css: kpi.criticalOpen ? 'card-kpi-coral' : kpi.openFindings.length ? 'card-kpi-amber' : 'card-kpi-mint', icon: kpi.criticalOpen ? ShieldAlert : ShieldCheck, overline: 'Auditoria', title: 'Apontamentos Abertos', value: kpi.openFindings.length, footer: kpi.criticalOpen ? `${kpi.criticalOpen} crítico(s) por resolver` : kpi.openFindings.length ? 'Sem críticos; rever os restantes' : 'Sem apontamentos por resolver', section: 'auditoria' },
    ];
    return (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {cards.map(card => {
                const Icon = card.icon;
                return (
                    <button key={card.key} type="button" onClick={() => onOpen(card.section)} title="Abrir o detalhe"
                        className={cn(card.css, 'cursor-pointer text-left transition-transform hover:scale-[1.02] active:scale-[0.99]')}>
                        <div className="flex min-w-0 items-center gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-black/10 text-slate-950 dark:bg-white/10 dark:text-white"><Icon className="h-5 w-5" /></div>
                            <div className="min-w-0">
                                <p className="truncate text-[11px] font-bold uppercase tracking-wider text-slate-900/70 dark:text-slate-400">{card.overline}</p>
                                <p className="truncate text-sm font-bold tracking-tight text-slate-950 dark:text-white sm:text-base">{card.title}</p>
                            </div>
                        </div>
                        <p className={cn('my-2 truncate font-display text-2xl font-black tracking-tight sm:text-3xl', card.negative ? 'text-red-700 dark:text-red-400' : 'text-slate-950 dark:text-white')}>
                            {card.key === 'findings' ? card.value : formatCurrency(card.value / 100)}
                        </p>
                        <p className="truncate text-xs font-semibold text-slate-900/75 dark:text-slate-400" title={card.footer}>{card.footer}</p>
                    </button>
                );
            })}
        </div>
    );
}

export function PainelContabil({ data, range, onOpen, onCapital }: { data: ContabilidadeData; range: DateRange; onOpen: (section: SeccaoContabil) => void; onCapital: () => void }) {
    const kpi = useIndicadores(data, range);
    const series = useMemo(() => monthlySeries(data.journal, 12).map(item => ({
        ...item, receitas: item.revenueMinor / 100, custos: item.expensesMinor / 100, resultado: item.resultMinor / 100,
        disponibilidades: item.liquidMinor / 100, carteira: item.portfolioMinor / 100,
    })), [data.journal]);
    const lastFull = data.runs.find(run => run.kind === 'full');
    const lastClose = data.closes[0];
    const pending = data.requests.filter(request => request.status === 'pending');
    const groups = groupFindings(kpi.openFindings).slice(0, 5);
    const sealLabel = !data.seals ? 'Indisponível nesta versão (só no aplicativo desktop)'
        : data.evaluation?.summary.sealStatus === 'valid' ? `Válido (${data.seals.sealedCount} lançamentos selados)`
            : data.evaluation?.summary.sealStatus === 'partial' ? `${data.seals.unsealed.length} lançamento(s) sem selo`
                : 'Selos inválidos: ver auditoria';
    const currency = (value: number) => formatCurrency(value);
    return (
        <div className="space-y-6">
            {!kpi.hasCapital && (
                <div className="flex flex-col gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200 md:flex-row md:items-center md:justify-between">
                    <div className="flex gap-3">
                        <Banknote className="mt-0.5 h-5 w-5 shrink-0" />
                        <div>
                            <p className="font-bold">Registe o capital inicial da empresa</p>
                            <p className="text-sm">Os desembolsos só são aceites com saldo em Caixa e Bancos. Registe a realização do capital social (ou o financiamento obtido) para que a contabilidade e o controlo de saldo funcionem correctamente.</p>
                        </div>
                    </div>
                    <Button onClick={onCapital} className="shrink-0 bg-amber-600 text-white hover:bg-amber-700">Registar entrada de capital</Button>
                </div>
            )}

            <div className="grid gap-4 lg:grid-cols-3">
                <div className="rounded-xl border bg-card p-4 lg:col-span-2">
                    <p className="mb-3 text-sm font-bold">Proveitos, custos e resultado — últimos 12 meses</p>
                    <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart data={series}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                <XAxis dataKey="label" fontSize={11} tickLine={false} axisLine={false} />
                                <YAxis fontSize={10} tickLine={false} axisLine={false} width={70} tickFormatter={value => new Intl.NumberFormat('pt-AO', { notation: 'compact' }).format(Number(value))} />
                                <Tooltip formatter={(value: number) => currency(value)} />
                                <Legend />
                                <Bar dataKey="receitas" name="Proveitos" fill="#10b981" radius={[4, 4, 0, 0]} />
                                <Bar dataKey="custos" name="Custos" fill="#ef4444" radius={[4, 4, 0, 0]} />
                                <Line dataKey="resultado" name="Resultado" stroke="#6366f1" strokeWidth={2} dot={false} />
                            </ComposedChart>
                        </ResponsiveContainer>
                    </div>
                </div>
                <div className="rounded-xl border bg-card p-4">
                    <div className="mb-3 flex items-center justify-between">
                        <p className="text-sm font-bold">Cadeia de Integridade</p>
                        <Badge variant={kpi.criticalOpen ? 'destructive' : 'success'}>{kpi.criticalOpen ? 'Com críticos' : 'Íntegra'}</Badge>
                    </div>
                    <dl className="space-y-2 text-sm">
                        <div><dt className="text-xs text-muted-foreground">Última auditoria completa</dt>
                            <dd className="font-semibold">{lastFull ? `${formatDateTime(lastFull.finishedAt)} · ${lastFull.userName}` : 'Ainda não executada'}</dd>
                            {lastFull && <dd className={cn('text-xs font-semibold', lastFull.status === 'critical' ? 'text-red-600' : lastFull.status === 'warning' ? 'text-amber-600' : 'text-emerald-600')}>
                                {lastFull.status === 'critical' ? `${lastFull.criticalCount} crítico(s)` : lastFull.status === 'warning' ? `${lastFull.highCount + lastFull.mediumCount} aviso(s)` : 'Sem apontamentos'}</dd>}
                        </div>
                        <div><dt className="text-xs text-muted-foreground">Selo HMAC do razão</dt><dd className="font-semibold">{sealLabel}</dd></div>
                        <div><dt className="text-xs text-muted-foreground">Último fecho diário</dt><dd className="font-semibold">{lastClose ? `${lastClose.day} · ${lastClose.closedBy}` : 'Nenhum dia fechado'}</dd></div>
                        <div><dt className="text-xs text-muted-foreground">Lançamentos no razão</dt><dd className="font-semibold">{data.journal.length}</dd></div>
                    </dl>
                    <div className="mt-4 flex flex-wrap gap-2">
                        <Button size="sm" variant="outline" onClick={() => onOpen('auditoria')}>Abrir auditoria</Button>
                        <Button size="sm" variant="outline" onClick={() => onOpen('historico')}>Histórico</Button>
                    </div>
                </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
                <div className="rounded-xl border bg-card p-4 lg:col-span-2">
                    <p className="mb-3 text-sm font-bold">Disponibilidades e carteira — fim de cada mês</p>
                    <div className="h-56">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={series}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                <XAxis dataKey="label" fontSize={11} tickLine={false} axisLine={false} />
                                <YAxis fontSize={10} tickLine={false} axisLine={false} width={70} tickFormatter={value => new Intl.NumberFormat('pt-AO', { notation: 'compact' }).format(Number(value))} />
                                <Tooltip formatter={(value: number) => currency(value)} />
                                <Legend />
                                <Line dataKey="disponibilidades" name="Caixa e Bancos" stroke="#0ea5e9" strokeWidth={2} dot={false} />
                                <Line dataKey="carteira" name="Carteira de crédito" stroke="#f59e0b" strokeWidth={2} dot={false} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>
                <div className="space-y-4">
                    <div className="rounded-xl border bg-card p-4">
                        <div className="mb-2 flex items-center justify-between"><p className="text-sm font-bold">Apontamentos por resolver</p><ClipboardList className="h-4 w-4 text-muted-foreground" /></div>
                        {groups.length === 0 ? (
                            <p className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400"><CheckCircle2 className="h-4 w-4" /> Nenhum apontamento aberto.</p>
                        ) : (
                            <ul className="space-y-1.5 text-sm">
                                {groups.map(group => (
                                    <li key={group.rule} className="flex items-center justify-between gap-2">
                                        <span className="truncate">{group.title}</span>
                                        <Badge variant={group.severity === 'critical' ? 'destructive' : group.severity === 'high' ? 'warning' : 'secondary'}>{group.items.length} · {SEVERITY_LABELS[group.severity]}</Badge>
                                    </li>
                                ))}
                            </ul>
                        )}
                        <Button size="sm" variant="link" className="mt-1 px-0" onClick={() => onOpen('auditoria')}>Ver todos</Button>
                    </div>
                    <div className="rounded-xl border bg-card p-4">
                        <div className="mb-2 flex items-center justify-between"><p className="text-sm font-bold">Pedidos à espera de aprovação</p><BookOpen className="h-4 w-4 text-muted-foreground" /></div>
                        <p className="text-2xl font-black">{pending.length}</p>
                        <p className="text-xs text-muted-foreground">Estornos e abates precisam de outro administrador.</p>
                        <Button size="sm" variant="link" className="px-0" onClick={() => onOpen('pedidos')}>Abrir pedidos</Button>
                    </div>
                    <div className="rounded-xl border bg-card p-4">
                        <p className="mb-2 text-sm font-bold">Recebimentos previstos</p>
                        <ul className="space-y-1 text-sm">
                            {kpi.forecast.horizons.map(item => <li key={item.days} className="flex justify-between"><span>Próximos {item.days} dias</span><span className="font-semibold">{money(item.amountMinor)}</span></li>)}
                        </ul>
                        <Button size="sm" variant="link" className="px-0" onClick={() => onOpen('fluxo')}>Fluxo de caixa</Button>
                    </div>
                </div>
            </div>
            {lastFull && <p className="text-xs text-muted-foreground">Tipos de auditoria disponíveis: {Object.values(AUDIT_KIND_LABELS).join(' · ')}.</p>}
        </div>
    );
}
