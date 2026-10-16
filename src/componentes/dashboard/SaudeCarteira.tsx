import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useData } from '@/contextos/ContextoDados';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/componentes/ui/card';
import { formatCurrency } from '@/bibliotecas/formatters';
import { cn } from '@/bibliotecas/utils';
import {
    computePortfolioRisk,
    buildRiskAlerts,
    upcomingDue,
    creditTotalDue,
    type RiskAlert,
} from '@/bibliotecas/risco-carteira';
import {
    ShieldAlert,
    AlertTriangle,
    Info,
    CalendarClock,
    Gauge,
    Landmark,
    PiggyBank,
    ShieldCheck,
    Users,
    ChevronRight,
    CheckCircle2,
    Wallet,
} from 'lucide-react';

const pct = (v: number, digits = 1) => `${(v * 100).toFixed(digits)}%`;

type Tone = 'good' | 'warn' | 'bad' | 'neutral';
const toneClasses: Record<Tone, string> = {
    good: 'text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200/70 dark:border-emerald-500/20',
    warn: 'text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-500/10 border-amber-200/70 dark:border-amber-500/20',
    bad: 'text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-500/10 border-rose-200/70 dark:border-rose-500/20',
    neutral: 'text-slate-700 dark:text-slate-200 bg-slate-50 dark:bg-white/5 border-slate-200/70 dark:border-white/10',
};

/** Limiar em que um rácio passa de bom → atenção → mau (rácios mais altos = pior). */
const toneFor = (value: number, warnAt: number, badAt: number): Tone =>
    value >= badAt ? 'bad' : value >= warnAt ? 'warn' : 'good';

function Indicator({ icon, label, value, hint, tone, title }: {
    icon: React.ReactNode; label: string; value: string; hint: string; tone: Tone; title?: string;
}) {
    return (
        <div className={cn('rounded-xl border p-3 flex flex-col gap-1 min-w-0', toneClasses[tone])} title={title}>
            <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider opacity-90">
                {icon}
                <span className="truncate">{label}</span>
            </div>
            <span className="text-xl font-black leading-tight truncate">{value}</span>
            <span className="text-[10px] font-semibold opacity-80 truncate">{hint}</span>
        </div>
    );
}

const severityStyle: Record<RiskAlert['severity'], { icon: React.ReactNode; dot: string }> = {
    critical: { icon: <ShieldAlert className="h-4 w-4 text-rose-600" />, dot: 'bg-rose-500' },
    warning: { icon: <AlertTriangle className="h-4 w-4 text-amber-600" />, dot: 'bg-amber-500' },
    info: { icon: <Info className="h-4 w-4 text-sky-600" />, dot: 'bg-sky-500' },
};

/**
 * Saúde da Carteira: indicadores prudenciais (PAR, NPL, provisões, cobertura,
 * concentração), envelhecimento da dívida, alertas de controlo e vencimentos.
 */
export function SaudeCarteira() {
    const { clients, credits, payments, warranties, legalCases } = useData();

    const { portfolio, alerts, dueSoon } = useMemo(() => {
        const today = new Date();
        const input = { credits: credits as any[], warranties: warranties as any[], legalCases: legalCases as any[], clients: clients as any[], payments: payments as any[] };
        const portfolio = computePortfolioRisk(input, today);
        return {
            portfolio,
            alerts: buildRiskAlerts(input, portfolio, today),
            dueSoon: upcomingDue(credits as any[], today, 7).slice(0, 8),
        };
    }, [clients, credits, payments, warranties, legalCases]);

    const top = portfolio.concentration.top[0];
    const empty = portfolio.openCredits === 0;

    return (
        <div className="grid gap-4 lg:grid-cols-7 mb-6 items-stretch">
            {/* Indicadores prudenciais + aging */}
            <Card className="lg:col-span-4 card-elevated">
                <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                        <div className="p-1 bg-indigo-500/10 rounded"><Gauge className="h-4 w-4 text-indigo-600" /></div>
                        Saúde da Carteira
                    </CardTitle>
                    <CardDescription>Indicadores de risco de crédito calculados sobre os créditos desembolsados e em aberto</CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        <Indicator
                            icon={<Wallet className="h-3.5 w-3.5" />}
                            label="Carteira em dívida"
                            value={formatCurrency(portfolio.totalExposure)}
                            hint={`${portfolio.openCredits} ${portfolio.openCredits === 1 ? 'crédito em aberto' : 'créditos em aberto'}`}
                            tone="neutral"
                        />
                        <Indicator
                            icon={<AlertTriangle className="h-3.5 w-3.5" />}
                            label="PAR 30"
                            value={pct(portfolio.par30)}
                            hint={`${formatCurrency(portfolio.par30Amount)} com +30 dias`}
                            tone={empty ? 'neutral' : toneFor(portfolio.par30, 0.05, 0.1)}
                            title="Portfolio at Risk: % da carteira com mais de 30 dias de atraso"
                        />
                        <Indicator
                            icon={<ShieldAlert className="h-3.5 w-3.5" />}
                            label="Crédito malparado (NPL)"
                            value={pct(portfolio.par90)}
                            hint={`${formatCurrency(portfolio.nplAmount)} com +90 dias`}
                            tone={empty ? 'neutral' : toneFor(portfolio.par90, 0.03, 0.07)}
                            title="Non-performing loans: % da carteira com mais de 90 dias de atraso"
                        />
                        <Indicator
                            icon={<PiggyBank className="h-3.5 w-3.5" />}
                            label="Provisões estimadas"
                            value={formatCurrency(portfolio.provisionNet)}
                            hint={`Bruto ${formatCurrency(portfolio.provisionGross)} · após garantias`}
                            tone={empty ? 'neutral' : toneFor(portfolio.totalExposure > 0 ? portfolio.provisionNet / portfolio.totalExposure : 0, 0.05, 0.1)}
                            title="Estimativa por escalão de atraso sobre a parte não coberta por garantias (matriz interna)"
                        />
                        <Indicator
                            icon={<ShieldCheck className="h-3.5 w-3.5" />}
                            label="Cobertura por garantias"
                            value={pct(portfolio.coverageRatio)}
                            hint={`Elegível ${formatCurrency(portfolio.collateralEligible)}`}
                            tone={empty ? 'neutral' : portfolio.coverageRatio >= 0.5 ? 'good' : portfolio.coverageRatio >= 0.2 ? 'warn' : 'bad'}
                            title="Parte da carteira coberta pelo valor elegível das garantias activas (valor de mercado − haircut)"
                        />
                        <Indicator
                            icon={<Users className="h-3.5 w-3.5" />}
                            label="Concentração top 5"
                            value={pct(portfolio.concentration.top5Share)}
                            hint={top ? `Maior: ${top.name.split(' ')[0]} (${pct(top.share, 0)})` : 'Sem exposição'}
                            tone={empty || portfolio.perClient.size < 5 ? 'neutral' : toneFor(portfolio.concentration.top5Share, 0.4, 0.6)}
                            title="Peso dos 5 maiores devedores na carteira"
                        />
                    </div>

                    {/* Envelhecimento da dívida */}
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-[11px] font-black uppercase tracking-wider text-muted-foreground">Envelhecimento da dívida (aging)</span>
                            <span className="text-[11px] text-muted-foreground">por valor em dívida</span>
                        </div>
                        <div className="flex h-3 w-full rounded-full overflow-hidden bg-muted" role="img" aria-label="Distribuição da carteira por dias de atraso">
                            {portfolio.aging.filter(a => a.exposure > 0).map(a => (
                                <div key={a.key} style={{ width: `${a.share * 100}%`, backgroundColor: a.color }} title={`${a.label}: ${formatCurrency(a.exposure)} (${pct(a.share)})`} />
                            ))}
                        </div>
                        <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1.5">
                            {portfolio.aging.map(a => (
                                <div key={a.key} className="flex items-center justify-between gap-2 text-xs min-w-0">
                                    <span className="flex items-center gap-1.5 min-w-0">
                                        <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: a.color }} />
                                        <span className="truncate text-muted-foreground">{a.label}</span>
                                    </span>
                                    <span className="font-semibold tabular-nums">{a.count} · {pct(a.share, 0)}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Alertas e vencimentos */}
            <Card className="lg:col-span-3 card-elevated flex flex-col">
                <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                        <div className="p-1 bg-rose-500/10 rounded"><Landmark className="h-4 w-4 text-rose-600" /></div>
                        Alertas de Risco e Controlo
                    </CardTitle>
                    <CardDescription>O que precisa de acção hoje</CardDescription>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col gap-4">
                    <div className="space-y-2 max-h-[230px] overflow-y-auto pr-1">
                        {alerts.length === 0 ? (
                            <div className="flex items-center gap-2 rounded-lg border border-emerald-200/70 dark:border-emerald-500/20 bg-emerald-50 dark:bg-emerald-500/10 p-3 text-sm text-emerald-800 dark:text-emerald-200">
                                <CheckCircle2 className="h-4 w-4 shrink-0" />
                                Sem alertas — carteira sob controlo.
                            </div>
                        ) : alerts.map(alert => (
                            <Link
                                key={alert.id}
                                to={alert.link}
                                className="group flex items-start gap-3 rounded-lg border p-2.5 hover:bg-muted/50 transition-colors"
                            >
                                <div className="mt-0.5 shrink-0">{severityStyle[alert.severity].icon}</div>
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="text-sm font-semibold truncate">{alert.title}</span>
                                        <span className="text-xs font-black tabular-nums shrink-0">{alert.count}</span>
                                    </div>
                                    <p className="text-[11px] text-muted-foreground leading-snug">
                                        {alert.description}
                                        {alert.amount !== undefined && alert.amount > 0 && <span className="font-semibold text-foreground"> · {formatCurrency(alert.amount)}</span>}
                                    </p>
                                </div>
                                <ChevronRight className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                            </Link>
                        ))}
                    </div>

                    <div className="border-t pt-3">
                        <div className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-muted-foreground mb-2">
                            <CalendarClock className="h-3.5 w-3.5" /> Vencimentos nos próximos 7 dias
                        </div>
                        {dueSoon.length === 0 ? (
                            <p className="text-xs text-muted-foreground py-2">Nenhuma prestação a vencer esta semana.</p>
                        ) : (
                            <ul className="space-y-1.5">
                                {dueSoon.map(({ credit, dueDate, inDays }) => (
                                    <li key={credit.id} className="flex items-center justify-between gap-2 text-xs">
                                        <span className="truncate font-medium">{credit.clientName || credit.clientId}</span>
                                        <span className="flex items-center gap-2 shrink-0">
                                            <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-bold', inDays <= 1 ? 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200' : 'bg-muted text-muted-foreground')}>
                                                {inDays === 0 ? 'hoje' : inDays === 1 ? 'amanhã' : `em ${inDays} dias`} · {dueDate.toLocaleDateString('pt-AO', { day: '2-digit', month: '2-digit' })}
                                            </span>
                                            <span className="font-semibold tabular-nums" title="Dívida total do contrato">{formatCurrency(creditTotalDue(credit))}</span>
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
