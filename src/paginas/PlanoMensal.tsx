import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { MainLayout } from '@/componentes/layout/MainLayout';
import { useData } from '@/contextos/ContextoDados';
import { Button } from '@/componentes/ui/button';
import { Input } from '@/componentes/ui/input';
import { ServicoFinanceiro } from '@/servicos/ServicoFinanceiro';
import { planFromStoredInstallments, INSTALLMENT_STATUS_LABEL, type InstallmentStatus } from '@/bibliotecas/plano-pagamento';
import { formatCurrency } from '@/bibliotecas/formatters';
import jsPDF from '@/bibliotecas/pdf-documento';
import autoTable from 'jspdf-autotable';
import { applyBranding, getCompanySettings } from '@/bibliotecas/pdf';
import { PlanoPagamentoDialog } from '@/componentes/creditos/PlanoPagamentoDialog';

type Row = { id: string; creditId: string; client: string; date: string; number: number; due: number; paid: number; status: InstallmentStatus; legacy?: boolean };

export default function PlanoMensal() {
    const { credits, payments, companySettings } = useData();
    const [month, setMonth] = useState(() => {
        const now = new Date();
        return now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
    });
    const [rows, setRows] = useState<Row[]>([]);
    const [search, setSearch] = useState('');
    const [status, setStatus] = useState('all');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [planOpen, setPlanOpen] = useState(false);
    const [refresh, setRefresh] = useState(0);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError('');
        Promise.all(credits.filter(c => !c.deletedAt && !['cancelled', 'rejected', 'pending_approval'].includes(c.status)).map(async c => {
            const installments = await ServicoFinanceiro.getCreditInstallments(c.id);
            if (installments.length) return planFromStoredInstallments(installments, Number(c.interestRate) || 0).installments.map(item => ({
                id: c.id + ':' + item.number, creditId: c.id, client: c.clientName || 'Cliente',
                date: item.dueDate.slice(0, 10), number: item.number, due: item.totalMinor / 100,
                paid: (item.paidMinor || 0) / 100, status: item.status || 'pending',
            }));
            const date = String(c.nextDueDate || c.dueDate || '').slice(0, 10);
            if (!date) return [];
            const now = new Date();
            const today = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
            // Não inventa um cronograma para créditos antigos sem prestações gravadas.
            return [{ id: c.id, creditId: c.id, client: c.clientName || 'Cliente', date, number: 0,
                due: Number(c.currentBalance || c.totalDue || 0), paid: c.status === 'paid' ? Number(c.totalDue || 0) : 0,
                status: (c.status === 'paid' ? 'paid' : date < today ? 'overdue' : 'pending') as InstallmentStatus, legacy: true }];
        })).then(groups => { if (!cancelled) setRows(groups.flat()); })
            .catch(() => { if (!cancelled) { setRows([]); setError('Não foi possível carregar as prestações. Tente atualizar.'); } })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [credits, payments, refresh]);

    const monthRows = useMemo(() => rows.filter(r => r.date.startsWith(month)), [rows, month]);
    const visible = useMemo(() => monthRows.filter(r => (status === 'all' || r.status === status) &&
        (r.client + ' ' + r.creditId).toLowerCase().includes(search.trim().toLowerCase())).sort((a, b) => a.date.localeCompare(b.date)), [monthRows, search, status]);
    const total = monthRows.reduce((s, r) => s + r.due, 0);
    const paid = monthRows.reduce((s, r) => s + r.paid, 0);
    const remaining = monthRows.reduce((s, r) => s + (r.status === 'paid' ? 0 : Math.max(0, r.due - r.paid)), 0);
    const overdue = monthRows.filter(r => r.status === 'overdue');
    const moveMonth = (delta: number) => {
        const [year, m] = month.split('-').map(Number);
        const date = new Date(year, m - 1 + delta, 1);
        setMonth(date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0'));
    };
    const exportPdf = () => {
        const doc = new jsPDF({ orientation: 'landscape' });
        applyBranding(doc, getCompanySettings(companySettings));
        doc.setFontSize(16);
        doc.text('Plano Mensal — ' + month, 15, 48);
        doc.setFontSize(10);
        doc.text('Previsto: ' + formatCurrency(total) + ' | Pago nas prestações: ' + formatCurrency(paid) + ' | Em falta: ' + formatCurrency(remaining), 15, 57);
        autoTable(doc, { startY: 64, head: [['Vencimento', 'Cliente', 'Crédito / Prestação', 'Previsto', 'Pago', 'Em falta', 'Estado']],
            body: visible.map(r => [r.date, r.client, r.creditId + ' / ' + (r.legacy ? 'Saldo antigo' : r.number),
                formatCurrency(r.due), formatCurrency(r.paid), formatCurrency(r.status === 'paid' ? 0 : Math.max(0, r.due - r.paid)), INSTALLMENT_STATUS_LABEL[r.status]]) });
        doc.save('Plano_Mensal_' + month + '.pdf');
    };

    return <MainLayout title="Plano Mensal" subtitle="Organização das cobranças e acompanhamento das prestações">
        <div className="space-y-5">
            <div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">
                Acompanhe as prestações com vencimento no mês selecionado, os pagamentos atribuídos a elas e o saldo por cobrar.
                Os valores pagos referem-se às prestações deste mês, mesmo quando o pagamento ocorreu noutra data.
            </div>
            <div className="flex flex-wrap items-center gap-3">
                <Button variant="outline" onClick={() => moveMonth(-1)}>Anterior</Button>
                <Input type="month" aria-label="Mês do plano" value={month} onChange={e => { if (e.target.value) setMonth(e.target.value); }} className="w-44" />
                <Button variant="outline" onClick={() => moveMonth(1)}>Seguinte</Button>
                <Button variant="outline" onClick={() => setRefresh(v => v + 1)}>Atualizar</Button>
                <Button onClick={() => setPlanOpen(true)}>Plano de pagamento</Button>
                <Button variant="outline" disabled={loading || !visible.length} onClick={exportPdf}>Exportar PDF</Button>
                <Button asChild variant="outline"><Link to="/pagamentos">Registar pagamento</Link></Button>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {[['Vencimentos', monthRows.length + ' prestações', 'card-kpi-sky'], ['Valor previsto', formatCurrency(total), 'card-kpi-amber'],
                    ['Pago nas prestações', formatCurrency(paid), 'card-kpi-mint'], ['Em falta', formatCurrency(remaining), 'card-kpi-coral']].map(([label, value, style]) =>
                    <div key={label} className={style}><p className="text-sm font-bold">{label}</p><p className="mt-2 text-2xl font-black">{loading ? 'A carregar…' : value}</p></div>)}
            </div>
            <div className="rounded-xl border bg-card p-4">
                <p className="mb-2 text-sm font-semibold">Cobrança das prestações do mês · {total > 0 ? Math.min(100, paid / total * 100).toFixed(1) : '0'}%</p>
                <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary" style={{ width: (total > 0 ? Math.min(100, paid / total * 100) : 0) + '%' }} /></div>
            </div>
            {!!overdue.length && <div role="status" className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
                {overdue.length} prestações em atraso no mês selecionado · {formatCurrency(overdue.reduce((sum, row) => sum + Math.max(0, row.due - row.paid), 0))} por cobrar.
            </div>}
            <div className="flex flex-wrap gap-3">
                <Input aria-label="Pesquisar cliente ou crédito" placeholder="Procurar cliente ou crédito…" value={search} onChange={e => setSearch(e.target.value)} className="max-w-sm" />
                <select aria-label="Filtrar estado" value={status} onChange={e => setStatus(e.target.value)} className="rounded-md border bg-background px-3">
                    <option value="all">Todos os estados</option>{Object.entries(INSTALLMENT_STATUS_LABEL).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                </select>
                <span className="self-center text-sm text-muted-foreground">{visible.length} resultados</span>
            </div>
            {error && <p role="alert" className="text-destructive">{error}</p>}
            <div className="overflow-x-auto rounded-xl border bg-card">
                <table className="w-full text-sm"><thead className="bg-muted/50"><tr>{['Vencimento', 'Cliente', 'Crédito / Prestação', 'Previsto', 'Pago', 'Em falta', 'Estado'].map(label => <th key={label} className="p-3 text-left">{label}</th>)}</tr></thead>
                    <tbody>{visible.map(r => <tr key={r.id} className="border-t">
                        <td className="p-3">{r.date.split('-').reverse().join('/')}</td><td className="p-3">{r.client}</td>
                        <td className="p-3"><Link to="/creditos" className="text-primary underline">{r.creditId}</Link><br />{r.legacy ? 'Saldo antigo · sem cronograma' : 'Prestação ' + r.number}</td>
                        <td className="p-3">{formatCurrency(r.due)}</td><td className="p-3">{formatCurrency(r.paid)}</td>
                        <td className="p-3 font-bold">{formatCurrency(r.status === 'paid' ? 0 : Math.max(0, r.due - r.paid))}</td>
                        <td className={'p-3 font-semibold ' + (r.status === 'overdue' ? 'text-destructive' : r.status === 'paid' ? 'text-emerald-600' : '')}>{INSTALLMENT_STATUS_LABEL[r.status]}</td>
                    </tr>)}{!visible.length && <tr><td colSpan={7} className="p-10 text-center text-muted-foreground">{loading ? 'A carregar prestações…' : error ? 'Dados indisponíveis.' : 'Sem prestações para este mês e estes filtros.'}</td></tr>}</tbody>
                </table>
            </div>
            <PlanoPagamentoDialog open={planOpen} onOpenChange={setPlanOpen} />
        </div>
    </MainLayout>;
}