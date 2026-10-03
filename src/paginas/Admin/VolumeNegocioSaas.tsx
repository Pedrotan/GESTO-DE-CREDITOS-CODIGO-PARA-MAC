import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
    Activity, AlertTriangle, Banknote, Building2, Download, HandCoins, Loader2, RefreshCw, Smartphone, TrendingDown, TrendingUp, Users, Wallet,
} from 'lucide-react';
import { Button } from '@/componentes/ui/button';
import { Input } from '@/componentes/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/componentes/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/componentes/ui/table';
import {
    formatKz, overdueRate, summarizeUsage, usageToCsv, variation, type CompanyUsage,
} from '@/bibliotecas/volume-saas';

// Relatórios de volume de negócio das empresas que usam o Tango (SaaS). Os números chegam agregados
// por mês, enviados por cada empresa depois de sincronizar; o Master nunca vê dados de clientes.

const URL_KEY = 'tango_master_cloud_url';
const SECRET_KEY = 'tango_master_cloud_secret';
const DEFAULT_URL = 'https://tango-gestao-creditos.vercel.app';

const callUsageApi = async (period: string) => {
    const base = (localStorage.getItem(URL_KEY) || DEFAULT_URL).trim().replace(/\/+$/, '');
    const secret = (localStorage.getItem(SECRET_KEY) || '').trim();
    if (!secret) throw new Error('Configure a Chave Mestra em "Empresas Cloud" para ver os relatórios.');
    const headerSafe = /^[\x20-\x7e]*$/.test(secret);
    const response = await fetch(`${base}/api/tenants`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(headerSafe ? { Authorization: `Bearer ${secret}` } : {}) },
        body: JSON.stringify({ action: 'usage', period, masterSecret: secret }),
        signal: AbortSignal.timeout(20_000),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.success) throw new Error(data.message || `Erro do servidor (${response.status}).`);
    return data as { period: string; previousPeriod: string; companies: CompanyUsage[] };
};

const monthLabel = (period: string) => {
    const [year, month] = period.split('-').map(Number);
    return new Date(year, month - 1, 1).toLocaleDateString('pt-AO', { month: 'long', year: 'numeric' });
};
const formatDate = (value: string | null) => value ? new Date(value).toLocaleString('pt-AO', { dateStyle: 'short', timeStyle: 'short' }) : '—';
const compactKz = (minor: number) => {
    const value = minor / 100;
    if (value >= 1e9) return `${(value / 1e9).toFixed(1)} mM`;
    if (value >= 1e6) return `${(value / 1e6).toFixed(1)} M`;
    if (value >= 1e3) return `${(value / 1e3).toFixed(0)} mil`;
    return value.toFixed(0);
};

const Trend = ({ value }: { value: number | null }) => {
    if (value === null) return <span className="text-xs text-slate-400">sem mês anterior</span>;
    const up = value >= 0;
    const Icon = up ? TrendingUp : TrendingDown;
    return (
        <span className={`inline-flex items-center gap-1 text-xs font-bold ${up ? 'text-emerald-600' : 'text-red-500'}`}>
            <Icon className="h-3.5 w-3.5" /> {up ? '+' : ''}{value.toLocaleString('pt-AO')}% vs mês anterior
        </span>
    );
};

const Kpi = ({ icon: Icon, label, value, detail, tone = 'slate' }: {
    icon: React.ComponentType<{ className?: string }>; label: string; value: string; detail?: React.ReactNode;
    tone?: 'slate' | 'blue' | 'emerald' | 'amber' | 'red';
}) => {
    const tones = {
        slate: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
        blue: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
        emerald: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
        amber: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
        red: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
    };
    return (
        <Card className="border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <CardContent className="flex items-start gap-3 p-4">
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tones[tone]}`}>
                    <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
                    <p className="truncate text-xl font-black text-slate-900 dark:text-white">{value}</p>
                    {detail && <div className="mt-0.5 text-xs text-slate-500">{detail}</div>}
                </div>
            </CardContent>
        </Card>
    );
};

export default function VolumeNegocioSaas() {
    const [period, setPeriod] = useState(() => new Date().toISOString().slice(0, 7));
    const [companies, setCompanies] = useState<CompanyUsage[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [loadedAt, setLoadedAt] = useState<Date | null>(null);

    const load = useCallback(async () => {
        setIsLoading(true);
        setError('');
        try {
            const data = await callUsageApi(period);
            setCompanies(data.companies || []);
            setLoadedAt(new Date());
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'Não foi possível carregar os relatórios.');
        } finally {
            setIsLoading(false);
        }
    }, [period]);

    useEffect(() => { void load(); }, [load]);

    const summary = useMemo(() => summarizeUsage(companies), [companies]);
    const ranked = useMemo(() => [...companies].sort((a, b) =>
        (b.metrics?.creditsVolumeMinor || 0) - (a.metrics?.creditsVolumeMinor || 0)
        || (b.syncOperations - a.syncOperations)), [companies]);
    const chartData = useMemo(() => ranked.filter(c => c.metrics && (c.metrics.creditsVolumeMinor || c.metrics.paymentsVolumeMinor)).slice(0, 10)
        .map(c => ({
            name: c.name.length > 18 ? `${c.name.slice(0, 17)}…` : c.name,
            Concedido: (c.metrics?.creditsVolumeMinor || 0) / 100,
            Recebido: (c.metrics?.paymentsVolumeMinor || 0) / 100,
        })), [ranked]);

    const exportCsv = () => {
        const blob = new Blob([usageToCsv(ranked, period)], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `volume-negocio-tango-${period}.csv`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                    <h2 className="text-3xl font-black tracking-tight text-slate-800 dark:text-white">Volume de Negócio</h2>
                    <p className="mt-1 text-slate-500 dark:text-slate-400">
                        Operações das empresas que usam o Tango em <span className="font-semibold capitalize">{monthLabel(period)}</span>.
                        {loadedAt && <> Actualizado às {loadedAt.toLocaleTimeString('pt-AO', { hour: '2-digit', minute: '2-digit' })}.</>}
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <Input type="month" value={period} max={new Date().toISOString().slice(0, 7)} aria-label="Mês do relatório"
                        onChange={event => event.target.value && setPeriod(event.target.value)}
                        className="h-10 w-44 border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950" />
                    <Button variant="outline" onClick={() => void load()} disabled={isLoading} className="h-10 gap-2">
                        {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Actualizar
                    </Button>
                    <Button onClick={exportCsv} disabled={!companies.length} className="h-10 gap-2 bg-slate-800 font-bold text-white hover:bg-slate-700 dark:bg-slate-700">
                        <Download className="h-4 w-4" /> Exportar Excel (CSV)
                    </Button>
                </div>
            </div>

            {error && (
                <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
                </div>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <Kpi icon={Building2} label="Empresas" tone="blue" value={`${summary.activeCompanies} activas`}
                    detail={`${summary.companies} registadas · ${summary.reportingCompanies} com relatório`} />
                <Kpi icon={Banknote} label="Créditos concedidos" tone="emerald" value={formatKz(summary.creditsVolumeMinor)}
                    detail={<>{summary.creditsCount} créditos · <Trend value={variation(summary.creditsVolumeMinor, summary.previousCreditsVolumeMinor)} /></>} />
                <Kpi icon={HandCoins} label="Pagamentos recebidos" tone="emerald" value={formatKz(summary.paymentsVolumeMinor)}
                    detail={<>{summary.paymentsCount} pagamentos · <Trend value={variation(summary.paymentsVolumeMinor, summary.previousPaymentsVolumeMinor)} /></>} />
                <Kpi icon={Wallet} label="Carteira activa" value={formatKz(summary.portfolioMinor)}
                    detail={`${summary.activeCredits} créditos activos`} />
                <Kpi icon={AlertTriangle} label="Em atraso" tone={overdueRate(summary) > 15 ? 'red' : 'amber'} value={formatKz(summary.overdueMinor)}
                    detail={`${summary.overdueCredits} créditos · ${overdueRate(summary).toLocaleString('pt-AO')}% da carteira`} />
                <Kpi icon={TrendingUp} label="Juros recebidos" tone="emerald" value={formatKz(summary.interestReceivedMinor)}
                    detail={`Juros contratados: ${formatKz(summary.expectedInterestMinor)}`} />
                <Kpi icon={Users} label="Clientes finais" value={summary.totalClients.toLocaleString('pt-AO')}
                    detail={`+${summary.newClients} novos · ${summary.users} utilizadores do sistema`} />
                <Kpi icon={Activity} label="Actividade" value={`${summary.syncOperations.toLocaleString('pt-AO')} operações`}
                    detail={<span className="inline-flex items-center gap-1"><Smartphone className="h-3 w-3" /> {summary.activeDevices} dispositivos nos últimos 30 dias</span>} />
            </div>

            {chartData.length > 0 && (
                <Card className="border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                    <CardHeader>
                        <CardTitle>Top empresas por volume</CardTitle>
                        <CardDescription>Créditos concedidos e pagamentos recebidos no mês (Kz).</CardDescription>
                    </CardHeader>
                    <CardContent className="h-72">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={chartData} margin={{ left: 8, right: 8 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#94a3b833" />
                                <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} />
                                <YAxis tickFormatter={value => compactKz(Number(value) * 100)} tick={{ fontSize: 11 }} width={56} />
                                <Tooltip formatter={(value: number) => formatKz(value * 100)} />
                                <Bar dataKey="Concedido" fill="#2563eb" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                                <Bar dataKey="Recebido" fill="#10b981" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                            </BarChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>
            )}

            <Card className="border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                <CardHeader>
                    <CardTitle>Detalhe por empresa</CardTitle>
                    <CardDescription>
                        Os números são enviados por cada empresa depois de sincronizar (no máximo de 6 em 6 horas).
                        "Sem relatório" indica uma empresa sem sincronização ligada ou ainda numa versão antiga.
                    </CardDescription>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Empresa</TableHead>
                                <TableHead className="text-right">Créditos</TableHead>
                                <TableHead className="text-right">Pagamentos</TableHead>
                                <TableHead className="text-right">Carteira</TableHead>
                                <TableHead className="text-right">Atraso</TableHead>
                                <TableHead className="text-right">Clientes</TableHead>
                                <TableHead className="text-right">Actividade</TableHead>
                                <TableHead>Último relatório</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {ranked.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={8} className="py-10 text-center text-slate-500">
                                        {isLoading ? 'A carregar…' : 'Ainda não há empresas registadas.'}
                                    </TableCell>
                                </TableRow>
                            )}
                            {ranked.map(company => {
                                const m = company.metrics;
                                return (
                                    <TableRow key={company.tenantId}>
                                        <TableCell>
                                            <div className="font-bold text-slate-900 dark:text-white">{company.name}</div>
                                            <div className="text-xs text-slate-500">
                                                NIF {company.tenantId} · {company.status === 'active' ? 'Activa' : 'Bloqueada'}
                                                {company.appVersion && <> · {company.appVersion}</>}
                                            </div>
                                        </TableCell>
                                        {m ? (
                                            <>
                                                <TableCell className="text-right">
                                                    <div className="font-mono font-bold">{formatKz(m.creditsVolumeMinor)}</div>
                                                    <div className="text-xs text-slate-500">{m.creditsCount} créditos</div>
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <div className="font-mono font-bold">{formatKz(m.paymentsVolumeMinor)}</div>
                                                    <div className="text-xs text-slate-500">{m.paymentsCount} pagamentos</div>
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <div className="font-mono">{formatKz(m.portfolioMinor)}</div>
                                                    <div className="text-xs text-slate-500">{m.activeCredits} activos</div>
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <div className={`font-mono ${overdueRate(m) > 15 ? 'font-bold text-red-600' : ''}`}>{formatKz(m.overdueMinor)}</div>
                                                    <div className="text-xs text-slate-500">{overdueRate(m).toLocaleString('pt-AO')}% · {m.overdueCredits} créd.</div>
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <div className="font-mono">{m.totalClients}</div>
                                                    <div className="text-xs text-slate-500">+{m.newClients} novos · {m.users} utiliz.</div>
                                                </TableCell>
                                            </>
                                        ) : (
                                            <TableCell colSpan={5} className="text-center text-sm italic text-slate-400">Sem relatório neste mês</TableCell>
                                        )}
                                        <TableCell className="text-right">
                                            <div className="font-mono">{company.syncOperations.toLocaleString('pt-AO')}</div>
                                            <div className="text-xs text-slate-500">{company.activeDevices} dispositivos</div>
                                        </TableCell>
                                        <TableCell className="text-xs text-slate-500">
                                            <div>{formatDate(company.reportedAt)}</div>
                                            <div>Sinc.: {formatDate(company.lastSyncAt)}</div>
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}
