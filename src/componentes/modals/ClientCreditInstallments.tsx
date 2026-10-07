import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/componentes/ui/button';
import { Badge } from '@/componentes/ui/badge';
import { Credit, Payment } from '@/tipos/credito';
import { formatCurrency, formatDate } from '@/bibliotecas/formatters';
import { planConsecutiveInstallments, type InstallmentBalance } from '@/bibliotecas/liquidacao-prestacoes';
import { ServicoFinanceiro } from '@/servicos/ServicoFinanceiro';
import { useData } from '@/contextos/ContextoDados';
import { useAuth } from '@/contextos/ContextoAutenticacao';
import { useToast } from '@/ganchos/usar-toast';

const payableStatuses = new Set<Credit['status']>(['active', 'overdue', 'defaulted', 'renegotiated']);
const money = (minor: number) => formatCurrency(minor / 100);

/**
 * Prestações com a mora acumulada até hoje: a mora ainda não lançada é somada à de cada prestação, para o valor
 * a pagar já a incluir (o serviço lança-a no mesmo pagamento).
 */
const loadScheduleWithLateInterest = async (creditId: string): Promise<InstallmentBalance[]> => {
    const [rows, mora] = await Promise.all([
        ServicoFinanceiro.getCreditInstallments(creditId),
        ServicoFinanceiro.getLateInterestSummary(creditId).catch(() => null),
    ]);
    if (!mora) return rows;
    return rows.map(item => {
        const accrued = mora.installments.find(entry => entry.id === item.id)?.accruedMinor ?? 0;
        return { ...item, lateInterestMinor: Math.max(item.lateInterestMinor, accrued) };
    });
};

function InstallmentRows({ schedule }: { schedule: InstallmentBalance[] }) {
    const firstOpen = schedule.findIndex(item => item.status !== 'cancelled' &&
        item.principalMinor + item.interestMinor + item.lateInterestMinor >
        item.paidPrincipalMinor + item.paidInterestMinor + item.paidLateInterestMinor);
    return <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[620px] text-sm">
            <thead className="bg-muted/50"><tr>
                <th className="p-2 text-left">Parcela</th><th className="p-2 text-left">Vencimento</th>
                <th className="p-2 text-right">Valor</th><th className="p-2 text-right">Mora</th><th className="p-2 text-right">Em aberto</th>
                <th className="p-2 text-left">Estado / pagamento</th>
            </tr></thead>
            <tbody>{schedule.map((item, index) => {
                const total = item.principalMinor + item.interestMinor + item.lateInterestMinor;
                const remaining = total - item.paidPrincipalMinor - item.paidInterestMinor - item.paidLateInterestMinor;
                const paid = remaining <= 0;
                const overdue = !paid && new Date(item.dueDate).getTime() < Date.now();
                return <tr key={item.id} className="border-t">
                    <td className="p-2 font-medium">{item.installmentNumber}/{schedule.length}</td>
                    <td className="p-2">{formatDate(item.dueDate)}</td>
                    <td className="p-2 text-right">{money(item.principalMinor + item.interestMinor)}</td>
                    <td className={`p-2 text-right ${item.lateInterestMinor > item.paidLateInterestMinor ? 'font-semibold text-destructive' : 'text-muted-foreground'}`}>
                        {item.lateInterestMinor > 0 ? money(item.lateInterestMinor) : '—'}
                    </td>
                    <td className="p-2 text-right">{money(Math.max(0, remaining))}</td>
                    <td className="p-2">
                        <Badge variant={paid ? 'success' : overdue ? 'destructive' : index === firstOpen ? 'warning' : 'outline'}>
                            {paid ? 'Pago' : index === firstOpen ? overdue ? 'Em atraso — próxima' : 'Pendente — próxima' : 'Bloqueada até liquidar as anteriores'}
                        </Badge>
                        {paid && item.paidAt && <span className="ml-2 text-xs text-muted-foreground">{formatDate(item.paidAt)}</span>}
                    </td>
                </tr>;
            })}</tbody>
        </table>
    </div>;
}

function ActiveCredit({ credit }: { credit: Credit }) {
    const { addPayment, payments } = useData();
    const { user } = useAuth();
    const { toast } = useToast();
    const [schedule, setSchedule] = useState<InstallmentBalance[]>([]);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);
    const [count, setCount] = useState(2);
    const [pendingCount, setPendingCount] = useState<number | null>(null);
    const [method, setMethod] = useState<'cash' | 'transfer' | 'reference'>('cash');
    const [saving, setSaving] = useState(false);
    const refresh = async () => {
        setSchedule(await loadScheduleWithLateInterest(credit.id));
    };
    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        loadScheduleWithLateInterest(credit.id)
            .then(rows => { if (!cancelled) { setSchedule(rows); setError(''); } })
            .catch(reason => { if (!cancelled) setError(reason instanceof Error ? reason.message : 'Falha ao ler prestações.'); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [credit.id, payments]);
    const openCount = schedule.filter(item => item.status !== 'cancelled' &&
        item.principalMinor + item.interestMinor + item.lateInterestMinor >
        item.paidPrincipalMinor + item.paidInterestMinor + item.paidLateInterestMinor).length;
    const planned = useMemo(() => {
        if (pendingCount == null || !schedule.length) return null;
        try { return planConsecutiveInstallments(schedule, pendingCount); } catch { return null; }
    }, [schedule, pendingCount]);
    const confirm = async () => {
        if (!planned || !pendingCount || saving) return;
        setSaving(true);
        try {
            const fresh = planConsecutiveInstallments(await loadScheduleWithLateInterest(credit.id), pendingCount);
            if (fresh.amountMinor !== planned.amountMinor || fresh.selected.some((item, index) =>
                item.id !== planned.selected[index].id || item.version !== planned.selected[index].version)) {
                await refresh();
                throw new Error('O cronograma foi alterado. Atualize e tente novamente.');
            }
            await addPayment({
                id: `PAG-${crypto.randomUUID()}`, creditId: credit.id, clientName: credit.clientName,
                amount: fresh.amountMinor / 100, installmentCount: pendingCount,
                allocatedToPrincipal: fresh.principalMinor / 100,
                allocatedToInterest: fresh.interestMinor / 100,
                allocatedToLateInterest: fresh.lateInterestMinor / 100,
                paymentDate: new Date(), method, processedBy: user?.name || 'Sistema', status: 'confirmed'
            }, user ? { id: user.id, name: user.name } : undefined);
            setPendingCount(null);
            await refresh();
            toast({ title: 'Pagamento registado', description: `${pendingCount} prestação(ões) consecutiva(s) liquidada(s).` });
        } catch (reason) {
            toast({ title: 'Pagamento não registado', description: reason instanceof Error ? reason.message : 'Falha inesperada.', variant: 'destructive' });
            await refresh().catch(() => undefined);
        } finally { setSaving(false); }
    };
    return <section className="space-y-4 rounded-xl border p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
            <div><h3 className="font-semibold">Crédito {credit.id}</h3>
                <p className="text-xs text-muted-foreground">Principal {formatCurrency(credit.principalAmount)} · {schedule.length} prestações · {credit.interestRate}% de juro</p></div>
            <Badge variant="primary">{schedule.length - openCount}/{schedule.length} pagas</Badge>
        </div>
        {loading ? <p>A carregar prestações…</p> : error ? <p role="alert" className="text-destructive">{error}</p> : schedule.length === 0 ?
            <p className="text-muted-foreground">Ainda não existe um cronograma para este crédito.</p> : <InstallmentRows schedule={schedule} />}
        {openCount > 0 && <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
                <Button type="button" size="sm" onClick={() => setPendingCount(1)}>Pagar mês mais antigo</Button>
                <label className="text-sm" htmlFor={`installment-count-${credit.id}`}>Consecutivas</label>
                <select id={`installment-count-${credit.id}`} className="rounded border bg-background p-2 text-sm" value={Math.min(count, openCount)}
                    onChange={event => setCount(Number(event.target.value))}>
                    {Array.from({ length: openCount }, (_, index) => index + 1).map(value => <option key={value} value={value}>{value}</option>)}
                </select>
                <Button type="button" size="sm" variant="outline" onClick={() => setPendingCount(Math.min(count, openCount))}>Pagar consecutivas</Button>
                <Button type="button" size="sm" variant="outline" onClick={() => setPendingCount(openCount)}>Liquidação total</Button>
            </div>
            {planned && <div className="rounded-lg border bg-muted/30 p-3 text-sm space-y-2">
                <p>Liquidar parcelas {planned.selected.map(item => item.installmentNumber).join(', ')}: <strong>{money(planned.amountMinor)}</strong></p>
                <label className="block">Método de pagamento <select className="ml-2 rounded border bg-background p-2" value={method}
                    onChange={event => setMethod(event.target.value as typeof method)}>
                    <option value="cash">Numerário</option><option value="transfer">Transferência</option><option value="reference">Referência</option>
                </select></label>
                <div className="flex gap-2"><Button type="button" size="sm" disabled={saving} onClick={confirm}>Confirmar pagamento</Button>
                    <Button type="button" size="sm" variant="ghost" disabled={saving} onClick={() => setPendingCount(null)}>Cancelar</Button></div>
            </div>}
        </div>}
    </section>;
}

function HistoryCredit({ credit, payments }: { credit: Credit; payments: Payment[] }) {
    const [expanded, setExpanded] = useState(false);
    const [schedule, setSchedule] = useState<InstallmentBalance[]>([]);
    const [error, setError] = useState('');
    const ownPayments = payments.filter(item => item.creditId === credit.id && !item.deletedAt && item.status !== 'cancelled')
        .sort((a, b) => new Date(a.paymentDate).getTime() - new Date(b.paymentDate).getTime());
    const totalPaid = ownPayments.reduce((sum, item) => sum + item.amount, 0);
    const scheduledTotalMinor = schedule.reduce((sum, item) => sum + item.principalMinor + item.interestMinor, 0);
    useEffect(() => {
        let cancelled = false;
        ServicoFinanceiro.getCreditInstallments(credit.id)
            .then(rows => { if (!cancelled) { setSchedule(rows); setError(''); } })
            .catch(reason => { if (!cancelled) setError(reason instanceof Error ? reason.message : 'Falha ao ler cronograma.'); });
        return () => { cancelled = true; };
    }, [credit.id]);
    return <section className="space-y-3 rounded-xl border p-4">
        <div className="flex flex-wrap justify-between gap-3">
            <div><h3 className="font-semibold">Crédito {credit.id}</h3>
                <p className="text-sm">Principal: {formatCurrency(credit.principalAmount)} · Total a pagar: {schedule.length ? money(scheduledTotalMinor) : error ? 'Indisponível' : 'A carregar…'} · Total pago: {formatCurrency(totalPaid)}</p>
                <p className="text-xs text-muted-foreground">{credit.installments} prestações · Taxa {credit.interestRate}%</p></div>
            <Button type="button" variant="outline" size="sm" onClick={() => setExpanded(!expanded)}>{expanded ? 'Ocultar detalhes' : 'Ver detalhes de pagamento'}</Button>
        </div>
        {expanded && <div className="space-y-3">
            {error ? <p role="alert" className="text-destructive">{error}</p> : <InstallmentRows schedule={schedule} />}
            <h4 className="font-medium">Recibos do crédito</h4>
            {ownPayments.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum recibo encontrado.</p> :
                <ul className="space-y-1 text-sm">{ownPayments.map(item => <li key={item.id} className="flex justify-between border-b py-1">
                    <span>{formatDate(item.paymentDate)} · {item.id}</span><span>{formatCurrency(item.amount)}</span>
                </li>)}</ul>}
        </div>}
    </section>;
}

export function ClientCreditInstallments({ credits, payments, history = false }: {
    credits: Credit[]; payments: Payment[]; history?: boolean;
}) {
    const shown = credits.filter(item => history ? item.status === 'paid' : payableStatuses.has(item.status));
    return <div className="space-y-4 pt-4">{shown.length === 0 ?
        <p className="py-8 text-center text-muted-foreground">{history ? 'Nenhum crédito liquidado no histórico.' : 'Nenhum crédito ativo com prestações em aberto.'}</p> :
        shown.map(item => history ? <HistoryCredit key={item.id} credit={item} payments={payments} /> :
            <ActiveCredit key={item.id} credit={item} />)}</div>;
}
