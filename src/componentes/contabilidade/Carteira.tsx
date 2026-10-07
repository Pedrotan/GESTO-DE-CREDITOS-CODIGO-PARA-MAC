import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/componentes/ui/button';
import { Badge } from '@/componentes/ui/badge';
import { Input } from '@/componentes/ui/input';
import { Textarea } from '@/componentes/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/componentes/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/componentes/ui/dialog';
import { useAuth } from '@/contextos/ContextoAutenticacao';
import { useData } from '@/contextos/ContextoDados';
import { useToast } from '@/componentes/ui/use-toast';
import { formatDateTime } from '@/bibliotecas/formatters';
import { agingPortfolio } from '@/bibliotecas/controlo-contabilistico';
import { balanceAt, type DateRange } from '@/bibliotecas/relatorios-contabeis';
import { profitability } from '@/bibliotecas/rentabilidade';
import { toDateKey } from '@/bibliotecas/periodos';
import { ServicoContabilidadeGeral } from '@/servicos/ServicoContabilidadeGeral';
import { CobrancaOperacional } from '@/componentes/CobrancaOperacional';
import { AvisoErro, BotoesExportar, Indicador, SeccaoCabecalho } from './comum';
import { isAdminRole, money } from './formato';
import type { ContabilidadeData } from './useContabilidade';
import type { JournalKind } from './formato';

const minor = (value: unknown, legacy: unknown) => value !== null && value !== undefined && value !== '' ? Number(value) : Math.round(Number(legacy || 0) * 100);

export function CarteiraProvisoes({ data, onJournal }: { data: ContabilidadeData; onJournal: (kind: JournalKind, amount?: number) => void }) {
    const { user } = useAuth();
    const { toast } = useToast();
    const admin = isAdminRole(user?.role);
    const [rates, setRates] = useState<number[]>(data.config.provisionRates);
    const [savingRates, setSavingRates] = useState(false);
    const [writeOff, setWriteOff] = useState<any | null>(null);
    const [reason, setReason] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    useEffect(() => { setRates(data.config.provisionRates); }, [data.config.provisionRates]);

    const writtenOff = useMemo(() => new Set((data.snapshot?.writeoffs || []).map(item => String(item.creditId))), [data.snapshot]);
    const credits = useMemo(() => (data.snapshot?.credits || []).map(credit => ({
        ...credit, currentBalanceMinor: minor(credit.currentBalanceMinor, credit.currentBalance),
    })), [data.snapshot]);
    const aging = useMemo(() => agingPortfolio(credits.filter(credit => !writtenOff.has(credit.id)), rates), [credits, rates, writtenOff]);
    const required = aging.buckets.reduce((sum, bucket) => sum + bucket.provisionMinor, 0);
    const booked = -balanceAt(data.journal, 'provision', null);
    const gap = required - booked;
    const pendingWriteoffs = new Set(data.requests.filter(request => request.kind === 'writeoff' && request.status === 'pending').map(request => request.targetId));
    const eligible = credits.filter(credit => !credit.deletedAt && ['overdue', 'defaulted'].includes(String(credit.status)) && !writtenOff.has(credit.id) && credit.currentBalanceMinor > 0)
        .sort((a: any, b: any) => Number(b.daysOverdue || 0) - Number(a.daysOverdue || 0));

    const saveRates = async () => {
        if (!user) return;
        setSavingRates(true); setError('');
        try {
            await ServicoContabilidadeGeral.saveConfig({ ...data.config, provisionRates: rates }, { id: user.id, name: user.name, role: user.role });
            toast({ title: 'Percentagens de provisão guardadas', description: 'Ficam partilhadas por todos os dispositivos da empresa.' });
            await data.reload();
        } catch (failure: any) { setError(failure?.message); } finally { setSavingRates(false); }
    };
    const requestWriteOff = async () => {
        if (!user || !writeOff) return;
        setBusy(true); setError('');
        try {
            await ServicoContabilidadeGeral.createRequest({ kind: 'writeoff', targetId: writeOff.id, amountMinor: writeOff.currentBalanceMinor,
                description: `Abate do crédito ${writeOff.id} de ${writeOff.clientName}`, reason }, { id: user.id, name: user.name, role: user.role });
            toast({ title: 'Pedido de abate criado', description: 'Outro administrador tem de o aprovar em Pedidos de aprovação.' });
            setWriteOff(null); setReason('');
            await data.reload();
        } catch (failure: any) { setError(failure?.message); } finally { setBusy(false); }
    };

    return (
        <div className="space-y-5">
            <SeccaoCabecalho title="Carteira e provisões" description="Antiguidade dos atrasos (aging), carteira em risco (PAR30), provisões exigidas pelas percentagens configuradas e provisões já contabilizadas. Abates exigem aprovação de outro administrador."
                actions={<BotoesExportar build={() => ({
                    title: 'Carteira e provisões', subtitle: `PAR30 ${aging.par30.toFixed(2).replace('.', ',')}%`, fileName: 'carteira-provisoes', numericColumns: [2, 3, 4],
                    head: ['Escalão', 'Créditos', 'Capital em dívida', 'Taxa de provisão', 'Provisão exigida'],
                    body: aging.buckets.map(bucket => [bucket.label, bucket.count, money(bucket.principalMinor), `${bucket.rate}%`, money(bucket.provisionMinor)]),
                    footer: [['Total', aging.buckets.reduce((sum, bucket) => sum + bucket.count, 0), money(aging.totalMinor), '', money(required)], ['Provisões contabilizadas', '', '', '', money(booked)]],
                })} />} />
            <AvisoErro message={error} />
            <div className="grid gap-3 md:grid-cols-5">
                <Indicador label="Carteira (contratos)" value={money(aging.totalMinor)} />
                <Indicador label="PAR30" value={`${aging.par30.toFixed(2).replace('.', ',')}%`} tone={aging.par30 > 10 ? 'bad' : aging.par30 > 5 ? 'warn' : 'good'} hint="Capital com mais de 30 dias de atraso" />
                <Indicador label="Capital em atraso" value={`${aging.defaultRate.toFixed(2).replace('.', ',')}%`} />
                <Indicador label="Provisão exigida" value={money(required)} />
                <Indicador label="Provisão contabilizada" value={money(booked)} tone={gap > 0 ? 'warn' : 'good'} hint={gap > 0 ? `Faltam ${money(gap)}` : gap < 0 ? `Excesso de ${money(-gap)}` : 'Em linha com o exigido'} />
            </div>
            <div className="overflow-hidden rounded-xl border bg-card">
                <table className="w-full text-sm">
                    <thead><tr className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground"><th className="px-4 py-2 text-left">Escalão de atraso</th><th className="px-4 py-2 text-right">Créditos</th><th className="px-4 py-2 text-right">Capital em dívida</th><th className="px-4 py-2 text-right">% da carteira</th><th className="px-4 py-2 text-right">Taxa de provisão</th><th className="px-4 py-2 text-right">Provisão exigida</th></tr></thead>
                    <tbody>
                        {aging.buckets.map((bucket, index) => (
                            <tr key={bucket.label} className="border-t">
                                <td className="px-4 py-2 font-medium">{bucket.label}</td>
                                <td className="px-4 py-2 text-right">{bucket.count}</td>
                                <td className="px-4 py-2 text-right font-mono">{money(bucket.principalMinor)}</td>
                                <td className="px-4 py-2 text-right">{aging.totalMinor ? ((bucket.principalMinor / aging.totalMinor) * 100).toFixed(1).replace('.', ',') : '0,0'}%</td>
                                <td className="px-4 py-2 text-right">
                                    {admin ? <Input type="number" min={0} max={100} value={rates[index]} className="ml-auto h-8 w-20 text-right"
                                        onChange={event => { const value = Number(event.target.value); if (!Number.isFinite(value) || value < 0 || value > 100) return; setRates(previous => previous.map((rate, position) => position === index ? value : rate)); }} />
                                        : `${bucket.rate}%`}
                                </td>
                                <td className="px-4 py-2 text-right font-mono">{money(bucket.provisionMinor)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {admin && (
                    <div className="flex flex-wrap items-center justify-end gap-2 border-t px-4 py-3">
                        <Button size="sm" variant="outline" disabled={savingRates || JSON.stringify(rates) === JSON.stringify(data.config.provisionRates)} onClick={() => void saveRates()}>Guardar percentagens</Button>
                        {gap > 0 && <Button size="sm" onClick={() => onJournal('provision', gap / 100)}>Constituir provisão em falta ({money(gap)})</Button>}
                        {gap < 0 && <Button size="sm" variant="outline" onClick={() => onJournal('provision_release', -gap / 100)}>Reverter excesso ({money(-gap)})</Button>}
                    </div>
                )}
            </div>

            <div className="rounded-xl border bg-card p-4">
                <p className="mb-1 font-bold">Créditos candidatos a abate</p>
                <p className="mb-3 text-xs text-muted-foreground">O abate retira o crédito do activo (usando primeiro as provisões contabilizadas) mas conserva a dívida para cobrança. O que for recebido depois é proveito de recuperação.</p>
                {eligible.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum crédito em atraso ou incumprimento por abater.</p> : (
                    <div className="divide-y">
                        {eligible.map((credit: any) => (
                            <div key={credit.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                                <div><p className="font-semibold">{credit.clientName}</p><p className="font-mono text-xs text-muted-foreground">{credit.id} · {Number(credit.daysOverdue || 0)} dias de atraso</p></div>
                                <div className="flex items-center gap-3">
                                    <span className="font-mono font-semibold">{money(credit.currentBalanceMinor)}</span>
                                    {pendingWriteoffs.has(credit.id) ? <Badge variant="warning">Abate pendente</Badge>
                                        : admin && <Button size="sm" variant="outline" onClick={() => { setReason(''); setWriteOff(credit); }}>Pedir abate</Button>}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
            {(data.snapshot?.writeoffs || []).length > 0 && (
                <div className="rounded-xl border bg-card p-4">
                    <p className="mb-2 font-bold">Créditos abatidos ao activo</p>
                    <div className="divide-y text-sm">
                        {(data.snapshot?.writeoffs || []).map((item: any) => (
                            <div key={item.id} className="flex flex-wrap justify-between gap-2 py-2">
                                <div><p className="font-mono text-xs">{item.creditId}</p><p className="text-xs text-muted-foreground">Aprovado por {item.approvedBy} em {formatDateTime(item.createdAt)} · {item.reason}</p></div>
                                <div className="text-right text-xs"><p>Capital {money(Number(item.principalMinor))} · Juros {money(Number(item.interestMinor))}</p><p className="text-muted-foreground">Provisões usadas {money(Number(item.provisionUsedMinor))} · Perda {money(Number(item.lossMinor))}</p></div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
            <Dialog open={!!writeOff} onOpenChange={open => !open && setWriteOff(null)}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>Pedir abate do crédito</DialogTitle>
                        <DialogDescription>{writeOff ? `${writeOff.clientName} · ${writeOff.id} · ${money(writeOff.currentBalanceMinor)}` : ''}</DialogDescription>
                    </DialogHeader>
                    <Textarea rows={3} value={reason} onChange={event => setReason(event.target.value)} placeholder="Motivo e diligências de cobrança feitas (mínimo 10 caracteres)" />
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setWriteOff(null)}>Cancelar</Button>
                        <Button disabled={busy || reason.trim().length < 10} onClick={() => void requestWriteOff()}>Pedir aprovação</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

const keyOf = (date: Date | null, fallback: string) => date ? toDateKey(date) : fallback;

export function Rentabilidade({ data, range, rangeLabel }: { data: ContabilidadeData; range: DateRange; rangeLabel: string }) {
    const { users } = useData();
    const [dimension, setDimension] = useState<'method' | 'agent'>('method');
    const from = keyOf(range.start, '1900-01-01'), to = keyOf(range.end, toDateKey(new Date()));
    const rows = useMemo(() => {
        try { return profitability((data.snapshot?.credits || []) as any, (data.snapshot?.installments || []) as any, (data.snapshot?.payments || []) as any, data.journal, from, to, dimension); }
        catch { return []; }
    }, [data.snapshot, data.journal, from, to, dimension]);
    const methodLabel: Record<string, string> = { FLAT: 'Juro fixo (flat)', PRICE: 'Prestação constante (Price)', SAC: 'Amortização constante (SAC)' };
    const label = (key: string) => dimension === 'method' ? (methodLabel[key] || key) : (users.find((item: any) => item.id === key)?.name || key);
    const total = (field: 'expectedMinor' | 'receivedMinor' | 'revenueMinor' | 'expenseMinor' | 'marginMinor') => rows.reduce((sum, row) => sum + row[field], 0);
    return (
        <div className="space-y-4">
            <SeccaoCabecalho title="Rentabilidade" description={`Juros previstos (prestações a vencer em ${rangeLabel}), juros recebidos e margem do razão por modalidade ou por responsável pela concessão. Despesas gerais não são rateadas.`}
                actions={<BotoesExportar build={() => ({
                    title: 'Rentabilidade', subtitle: rangeLabel, fileName: `rentabilidade-${rangeLabel}`, numericColumns: [2, 3, 4, 5, 6],
                    head: ['Grupo', 'Créditos', 'Juros previstos', 'Juros recebidos', 'Receita no razão', 'Custos e perdas', 'Margem'],
                    body: rows.map(row => [label(row.key), row.credits, money(row.expectedMinor), money(row.receivedMinor), money(row.revenueMinor), money(row.expenseMinor), money(row.marginMinor)]),
                    footer: [['Total', rows.reduce((sum, row) => sum + row.credits, 0), money(total('expectedMinor')), money(total('receivedMinor')), money(total('revenueMinor')), money(total('expenseMinor')), money(total('marginMinor'))]],
                })} />} />
            <Select value={dimension} onValueChange={value => setDimension(value as 'method' | 'agent')}>
                <SelectTrigger className="w-72"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="method">Por modalidade de amortização</SelectItem><SelectItem value="agent">Por responsável pela concessão</SelectItem></SelectContent>
            </Select>
            <div className="grid gap-3 md:grid-cols-3">
                <Indicador label="Juros previstos" value={money(total('expectedMinor'))} />
                <Indicador label="Juros recebidos" value={money(total('receivedMinor'))} tone="good" hint={total('expectedMinor') ? `${((total('receivedMinor') / total('expectedMinor')) * 100).toFixed(1).replace('.', ',')}% do previsto` : undefined} />
                <Indicador label="Margem contabilística" value={money(total('marginMinor'))} tone={total('marginMinor') >= 0 ? 'good' : 'bad'} />
            </div>
            <div className="overflow-hidden rounded-xl border bg-card">
                <table className="w-full text-sm">
                    <thead><tr className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground"><th className="px-4 py-2 text-left">Grupo</th><th className="px-4 py-2 text-right">Créditos</th><th className="px-4 py-2 text-right">Juros previstos</th><th className="px-4 py-2 text-right">Juros recebidos</th><th className="px-4 py-2 text-right">Receita (razão)</th><th className="px-4 py-2 text-right">Custos</th><th className="px-4 py-2 text-right">Margem</th></tr></thead>
                    <tbody>
                        {rows.map(row => (
                            <tr key={row.key} className="border-t">
                                <td className="px-4 py-2 font-medium">{label(row.key)}</td><td className="px-4 py-2 text-right">{row.credits}</td>
                                <td className="px-4 py-2 text-right font-mono">{money(row.expectedMinor)}</td><td className="px-4 py-2 text-right font-mono">{money(row.receivedMinor)}</td>
                                <td className="px-4 py-2 text-right font-mono">{money(row.revenueMinor)}</td><td className="px-4 py-2 text-right font-mono">{money(row.expenseMinor)}</td>
                                <td className={`px-4 py-2 text-right font-mono font-bold ${row.marginMinor < 0 ? 'text-red-600' : ''}`}>{money(row.marginMinor)}</td>
                            </tr>
                        ))}
                        {rows.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">Sem dados no período.</td></tr>}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

export function Cobranca({ data, range, rangeLabel }: { data: ContabilidadeData; range: DateRange; rangeLabel: string }) {
    const from = keyOf(range.start, '1900-01-01'), to = keyOf(range.end, toDateKey(new Date()));
    return (
        <div>
            <SeccaoCabecalho title="Cobrança e gestores" description={`Fila de cobrança, contactos, promessas de pagamento, atribuição de gestores e metas (${rangeLabel}).`} />
            <div className="rounded-xl border bg-card p-4"><CobrancaOperacional installments={data.snapshot?.installments || []} from={from} to={to} /></div>
        </div>
    );
}
