import { useCallback, useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import {
    AlertCircle, ArrowDownUp, CalendarRange, Check, CheckCircle, ChevronLeft, ChevronRight, Clock, Eye, FileSpreadsheet,
    FileText, Hourglass, Loader2, Search, ThumbsDown, ThumbsUp, X, XCircle,
} from 'lucide-react';
import { MainLayout } from '@/componentes/layout/MainLayout';
import { useAuth } from '@/contextos/ContextoAutenticacao';
import { useData } from '@/contextos/ContextoDados';
import { formatCurrency, formatDate, formatDateTime } from '@/bibliotecas/formatters';
import { Button } from '@/componentes/ui/button';
import { Input } from '@/componentes/ui/input';
import { Textarea } from '@/componentes/ui/textarea';
import { Badge } from '@/componentes/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/componentes/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/componentes/ui/dialog';
import { AlertModal, AlertModalType } from '@/componentes/ui/AlertModal';
import { SeletorPeriodo } from '@/componentes/comum/SeletorPeriodo';
import { CREDIT_DIALOG_CONTENT_CLASS, CREDIT_DIALOG_HEADER_CLASS } from '@/componentes/forms/credit-dialog-styles';
import { MONTH_LONG, defaultPeriod, isInPeriod, periodRange, type PeriodSelection } from '@/bibliotecas/periodos';
import { generateApprovalsReportPDF, type ApprovalReportRow } from '@/bibliotecas/pdf';
import { cn } from '@/bibliotecas/utils';
import { ServicoFinanceiro, type CreditApprovalRecord } from '@/servicos/ServicoFinanceiro';
import { ServicoAlcadas, type Escalation, type EscalationApproval } from '@/servicos/ServicoAlcadas';
import type { InstallmentBalance } from '@/bibliotecas/liquidacao-prestacoes';
import type { Credit } from '@/tipos/credito';
import { ReestruturacoesPendentes } from '@/componentes/creditos/ReestruturacoesPendentes';

// Aprovações de crédito: pedidos pendentes e histórico de decisões (quem decidiu, quando e porquê), com filtros
// por período e estado, detalhes do pedido antes de decidir, exportação e relatórios mensais.

type RowStatus = 'pending' | 'approved' | 'rejected';
type ApprovalRow = ApprovalReportRow & { key: string; clientId?: string | null; credit?: Credit; legacy?: boolean };
type SortKey = 'requestedAt' | 'clientName' | 'amount' | 'status' | 'decidedAt';

const STATUS_LABEL: Record<RowStatus, string> = { pending: 'Pendente', approved: 'Aprovado', rejected: 'Rejeitado' };
const STATUS_VARIANT: Record<RowStatus, 'warning' | 'success' | 'destructive'> = { pending: 'warning', approved: 'success', rejected: 'destructive' };
const PENDING_ALERT_HOURS = 48;
const timeOf = (value?: Date | string | null) => (value ? new Date(value).getTime() || 0 : 0);
const hoursSince = (value?: Date | string | null) => (value ? (Date.now() - timeOf(value)) / 3_600_000 : 0);
const waitLabel = (hours: number) => (hours < 1 ? 'menos de 1 h' : hours < 48 ? `${Math.floor(hours)} h` : `${Math.floor(hours / 24)} dias`);

export default function Approvals() {
    const { user } = useAuth();
    const { credits, clients, approveCredit, rejectCredit, companySettings } = useData();
    const [history, setHistory] = useState<CreditApprovalRecord[]>([]);
    const [period, setPeriod] = useState<PeriodSelection>(() => defaultPeriod(new Date(), 'month'));
    const [statusFilter, setStatusFilter] = useState<'all' | RowStatus>('all');
    const [search, setSearch] = useState('');
    const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'requestedAt', dir: 'desc' });
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [details, setDetails] = useState<ApprovalRow | null>(null);
    const [decision, setDecision] = useState<{ row: ApprovalRow; kind: 'approve' | 'reject' } | null>(null);
    const [reason, setReason] = useState('');
    const [processing, setProcessing] = useState(false);
    const [alertConfig, setAlertConfig] = useState<{ isOpen: boolean; title: string; description: string; type: AlertModalType }>({
        isOpen: false, title: '', description: '', type: 'success',
    });

    // Fila das alçadas: motivo do escalonamento, nível exigido e aprovações já dadas (dupla aprovação).
    const [escalations, setEscalations] = useState<Escalation[]>([]);
    const [limitApprovals, setLimitApprovals] = useState<EscalationApproval[]>([]);
    const reloadHistory = useCallback(() => {
        ServicoFinanceiro.getCreditApprovals().then(setHistory).catch(() => setHistory([]));
        void ServicoAlcadas.processTimers().catch(() => 0).then(() => Promise.all([ServicoAlcadas.escalations(), ServicoAlcadas.approvals()]))
            .then(([list, approvals]) => { setEscalations(list); setLimitApprovals(approvals); }).catch(() => undefined);
    }, []);
    const escalationOf = useMemo(() => {
        const map = new Map<string, Escalation>();
        for (const item of escalations) if (item.entityType === 'credit' && !map.has(item.entityId)) map.set(item.entityId, item);
        return map;
    }, [escalations]);
    const approvalsOf = (escalationId?: string) => limitApprovals.filter(item => item.escalationId === escalationId && item.decision === 'approved');
    useEffect(() => { reloadHistory(); }, [reloadHistory, credits]);

    // Pedidos pendentes + decisões registadas (e decisões antigas, anteriores ao histórico, a partir dos créditos).
    const rows = useMemo<ApprovalRow[]>(() => {
        const pending: ApprovalRow[] = credits
            .filter(credit => credit.status === 'pending_approval' && !credit.deletedAt)
            .map(credit => ({
                key: `pending:${credit.id}`, creditId: credit.id, clientId: credit.clientId, clientName: credit.clientName,
                amount: Number(credit.principalAmount) || 0, rate: Number(credit.interestRate) || 0, installments: Number(credit.installments) || 0,
                status: 'pending', requestedBy: credit.requestedBy, requestedAt: credit.requestedAt || credit.createdAt, credit,
            }));
        const recorded = new Set(history.map(item => item.creditId));
        const decided: ApprovalRow[] = history.map(item => ({
            key: item.id, creditId: item.creditId, clientId: item.clientId, clientName: item.clientName, amount: item.principalAmount,
            rate: item.interestRate, installments: item.installments, status: item.decision, requestedBy: item.requestedBy,
            requestedAt: item.requestedAt, decidedBy: item.decidedBy, decidedAt: item.decidedAt, reason: item.reason,
            credit: credits.find(credit => credit.id === item.creditId),
        }));
        const legacy: ApprovalRow[] = credits
            .filter(credit => !credit.deletedAt && credit.approvedBy && credit.status !== 'pending_approval' && !recorded.has(credit.id) && credit.requestedAt)
            .map(credit => ({
                key: `legacy:${credit.id}`, creditId: credit.id, clientId: credit.clientId, clientName: credit.clientName,
                amount: Number(credit.principalAmount) || 0, rate: Number(credit.interestRate) || 0, installments: Number(credit.installments) || 0,
                status: credit.status === 'rejected' ? 'rejected' : 'approved', requestedBy: credit.requestedBy, requestedAt: credit.requestedAt,
                decidedBy: credit.approvedBy, decidedAt: null, reason: credit.approvalNotes, credit, legacy: true,
            }));
        return [...pending, ...decided, ...legacy];
    }, [credits, history]);

    const range = useMemo(() => periodRange(period), [period]);
    // Pendentes contam pela data do pedido; decisões pela data da decisão.
    const periodRows = useMemo(() => rows.filter(row => isInPeriod(row.status === 'pending' || !row.decidedAt ? row.requestedAt : row.decidedAt, range)), [rows, range]);
    const visibleRows = useMemo(() => {
        const term = search.trim().toLowerCase();
        const filtered = periodRows.filter(row => (statusFilter === 'all' || row.status === statusFilter)
            && (!term || [row.clientName, row.creditId, row.requestedBy, row.decidedBy, row.reason].some(value => String(value || '').toLowerCase().includes(term))));
        const value = (row: ApprovalRow) => sort.key === 'amount' ? row.amount
            : sort.key === 'clientName' ? row.clientName.toLowerCase()
                : sort.key === 'status' ? row.status
                    : timeOf(row[sort.key]);
        return [...filtered].sort((a, b) => {
            const left = value(a); const right = value(b);
            const order = left < right ? -1 : left > right ? 1 : 0;
            return sort.dir === 'asc' ? order : -order;
        });
    }, [periodRows, statusFilter, search, sort]);

    useEffect(() => { setPage(1); }, [period, statusFilter, search, pageSize]);
    const totalPages = Math.max(1, Math.ceil(visibleRows.length / pageSize));
    const pageRows = visibleRows.slice((Math.min(page, totalPages) - 1) * pageSize, Math.min(page, totalPages) * pageSize);

    const summary = useMemo(() => {
        const of = (status: RowStatus) => periodRows.filter(row => row.status === status);
        const approved = of('approved'); const rejected = of('rejected'); const pending = of('pending');
        const decidedWithTimes = [...approved, ...rejected].filter(row => row.requestedAt && row.decidedAt);
        const avgHours = decidedWithTimes.length
            ? decidedWithTimes.reduce((sum, row) => sum + (timeOf(row.decidedAt) - timeOf(row.requestedAt)) / 3_600_000, 0) / decidedWithTimes.length : null;
        const decided = approved.length + rejected.length;
        return {
            pending: pending.length, pendingValue: pending.reduce((sum, row) => sum + row.amount, 0),
            approved: approved.length, approvedValue: approved.reduce((sum, row) => sum + row.amount, 0),
            rejected: rejected.length, rejectedValue: rejected.reduce((sum, row) => sum + row.amount, 0),
            approvalRate: decided ? Math.round((approved.length / decided) * 1000) / 10 : null,
            avgHours, overdue: pending.filter(row => hoursSince(row.requestedAt) > PENDING_ALERT_HOURS).length,
        };
    }, [periodRows]);

    // Histórico agrupado por mês da decisão.
    const months = useMemo(() => {
        const map = new Map<string, { approved: number; rejected: number; value: number }>();
        for (const row of rows) {
            if (row.status === 'pending' || !row.decidedAt) continue;
            const date = new Date(row.decidedAt);
            const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            const entry = map.get(key) || { approved: 0, rejected: 0, value: 0 };
            if (row.status === 'approved') { entry.approved += 1; entry.value += row.amount; } else entry.rejected += 1;
            map.set(key, entry);
        }
        return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
    }, [rows]);

    const toggleSort = (key: SortKey) => setSort(current => ({ key, dir: current.key === key && current.dir === 'desc' ? 'asc' : 'desc' }));
    const exportRows = (list: ApprovalRow[]) => list.map(row => ({
        'Data do pedido': row.requestedAt ? formatDate(row.requestedAt) : '',
        Cliente: row.clientName,
        Crédito: row.creditId,
        Valor: row.amount,
        'Taxa (%)': row.rate,
        Prestações: row.installments,
        Estado: STATUS_LABEL[row.status],
        'Solicitado por': row.requestedBy || '',
        'Decidido por': row.decidedBy || '',
        'Data da decisão': row.decidedAt ? formatDateTime(row.decidedAt) : '',
        'Motivo / observações': row.reason || '',
    }));
    const fileBase = (label: string) => `aprovacoes-${label.replace(/[^\wÀ-ÿ]+/g, '-').toLowerCase()}`;
    const downloadExcel = (list: ApprovalRow[], label: string) => {
        const sheet = XLSX.utils.json_to_sheet(exportRows(list));
        const book = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(book, sheet, 'Aprovações');
        XLSX.writeFile(book, `${fileBase(label)}.xlsx`);
    };
    const downloadCsv = (list: ApprovalRow[], label: string) => {
        const data = exportRows(list);
        const headers = Object.keys(data[0] || { Cliente: '' });
        const escape = (value: unknown) => {
            const text = String(value ?? '');
            const safe = /^[=+\-@]/.test(text) ? `'${text}` : text; // evita fórmulas ao abrir no Excel
            return /[;"\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
        };
        const csv = [headers.join(';'), ...data.map(item => headers.map(header => escape((item as Record<string, unknown>)[header])).join(';'))].join('\n');
        const blob = new Blob([String.fromCharCode(0xFEFF) + csv], { type: 'text/csv;charset=utf-8' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `${fileBase(label)}.csv`;
        link.click();
        URL.revokeObjectURL(link.href);
    };
    const downloadPdf = (list: ApprovalRow[], label: string) => generateApprovalsReportPDF(list, {
        periodLabel: label, filterLabel: statusFilter === 'all' ? undefined : STATUS_LABEL[statusFilter],
    }, companySettings, user?.name);
    const monthRows = (key: string) => rows.filter(row => row.status !== 'pending' && row.decidedAt && new Date(row.decidedAt).toISOString().slice(0, 7) === key
        || (row.status === 'pending' && row.requestedAt && new Date(row.requestedAt).toISOString().slice(0, 7) === key));
    const monthLabel = (key: string) => `${MONTH_LONG[Number(key.slice(5, 7)) - 1]} de ${key.slice(0, 4)}`;

    const openDecision = (row: ApprovalRow, kind: 'approve' | 'reject') => { setReason(''); setDecision({ row, kind }); };
    const confirmDecision = async () => {
        if (!decision || !user) return;
        if (decision.kind === 'reject' && reason.trim().length < 5) return;
        setProcessing(true);
        try {
            if (decision.kind === 'approve') {
                const outcome = await approveCredit(decision.row.creditId, user.id, user.name, reason.trim() || undefined);
                if (!outcome.final) {
                    setAlertConfig({ isOpen: true, title: 'Primeira aprovação registada', type: 'info' as AlertModalType,
                        description: outcome.message || 'Falta a aprovação de um segundo aprovador do nível máximo.' });
                    setDecision(null); setDetails(null); reloadHistory();
                    return;
                }
            } else await rejectCredit(decision.row.creditId, user.id, user.name, reason.trim());
            setAlertConfig({
                isOpen: true,
                title: decision.kind === 'approve' ? 'Crédito aprovado' : 'Crédito rejeitado',
                description: `${decision.row.clientName} — ${formatCurrency(decision.row.amount)}. A decisão ficou registada no histórico.`,
                type: decision.kind === 'approve' ? 'success' : 'warning',
            });
            setDecision(null);
            setDetails(null);
            reloadHistory();
        } catch (error: any) {
            setAlertConfig({ isOpen: true, title: 'Erro', description: error?.message || 'Não foi possível registar a decisão.', type: 'error' });
        } finally {
            setProcessing(false);
        }
    };

    if (!['admin', 'super_admin', 'credit_director'].includes(String(user?.role))) {
        return (
            <MainLayout title="Aprovações" subtitle="Acesso restrito">
                <div className="flex h-[60vh] items-center justify-center">
                    <p className="text-muted-foreground">Acesso restrito a Administradores do Sistema.</p>
                </div>
            </MainLayout>
        );
    }

    const SortHead = ({ label, sortKey, className }: { label: string; sortKey: SortKey; className?: string }) => (
        <th className={cn('p-3 text-left', className)}>
            <button type="button" onClick={() => toggleSort(sortKey)} className="inline-flex items-center gap-1 font-semibold hover:text-foreground">
                {label} <ArrowDownUp className={cn('h-3 w-3', sort.key === sortKey ? 'text-primary' : 'opacity-40')} />
            </button>
        </th>
    );

    return (
        <MainLayout title="Aprovações de Crédito" subtitle="Pedidos pendentes e histórico de decisões">
            <div className="space-y-6">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight text-foreground">Aprovações</h1>
                        <p className="text-muted-foreground">Reveja cada pedido antes de decidir. Todas as decisões ficam registadas com autor, data e motivo.</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => downloadExcel(visibleRows, range.label)} disabled={!visibleRows.length}>
                            <FileSpreadsheet className="h-4 w-4 text-emerald-600" /> Excel
                        </Button>
                        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => downloadCsv(visibleRows, range.label)} disabled={!visibleRows.length}>
                            <FileText className="h-4 w-4" /> CSV
                        </Button>
                        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => downloadPdf(visibleRows, range.label)} disabled={!visibleRows.length}>
                            <FileText className="h-4 w-4 text-red-600" /> PDF
                        </Button>
                    </div>
                </div>

                <SeletorPeriodo value={period} onChange={setPeriod} kinds={['day', 'week', 'month', 'year', 'custom', 'all']} />

                <ReestruturacoesPendentes actor={user ? { id: user.id, name: user.name, role: user.role, permissions: user.permissions } : null}
                    clientNameOf={creditId => credits.find(item => item.id === creditId)?.clientName || creditId} />

                {/* Resumo do período */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    {[
                        { status: 'pending' as const, css: 'card-kpi-amber', icon: Hourglass, title: 'Pendentes', value: `${summary.pending}`, foot: `${formatCurrency(summary.pendingValue)}${summary.overdue ? ` · ${summary.overdue} há mais de 48 h` : ''}` },
                        { status: 'approved' as const, css: 'card-kpi-mint', icon: ThumbsUp, title: 'Aprovados', value: `${summary.approved}`, foot: summary.approvalRate !== null ? `Taxa de aprovação: ${summary.approvalRate.toLocaleString('pt-AO')}%` : 'Sem decisões no período' },
                        { status: 'rejected' as const, css: 'card-kpi-coral', icon: ThumbsDown, title: 'Rejeitados', value: `${summary.rejected}`, foot: formatCurrency(summary.rejectedValue) },
                        { status: 'all' as const, css: 'card-kpi-sky', icon: CheckCircle, title: 'Valor Total Aprovado', value: formatCurrency(summary.approvedValue), foot: summary.avgHours !== null ? `Tempo médio de decisão: ${waitLabel(summary.avgHours)}` : range.label },
                    ].map(card => {
                        const Icon = card.icon;
                        const active = statusFilter === card.status && card.status !== 'all';
                        return (
                            <button key={card.title} type="button" onClick={() => setStatusFilter(statusFilter === card.status ? 'all' : card.status)}
                                className={cn(card.css, 'cursor-pointer text-left transition-transform hover:scale-[1.02]', active && 'ring-4 ring-primary/60 ring-offset-2 ring-offset-background')}>
                                <div className="flex items-center gap-3">
                                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-black/10 text-slate-950 dark:bg-white/10 dark:text-white"><Icon className="h-5 w-5" /></div>
                                    <p className="text-sm font-bold tracking-tight text-slate-950 dark:text-white sm:text-base">{card.title}</p>
                                </div>
                                <p className="my-2 truncate font-display text-2xl font-black tracking-tight text-slate-950 dark:text-white sm:text-3xl">{card.value}</p>
                                <p className="truncate text-xs font-semibold text-slate-900/75 dark:text-slate-400">{card.foot}</p>
                            </button>
                        );
                    })}
                </div>

                {/* Tabela de dados */}
                <div className="card-elevated overflow-hidden">
                    <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="relative w-full sm:w-80">
                            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <Input value={search} onChange={event => setSearch(event.target.value)} placeholder="Pesquisar cliente, crédito, motivo..." className="pl-9" />
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-sm">
                            <Select value={statusFilter} onValueChange={value => setStatusFilter(value as typeof statusFilter)}>
                                <SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Todos os estados</SelectItem>
                                    <SelectItem value="pending">Pendentes</SelectItem>
                                    <SelectItem value="approved">Aprovados</SelectItem>
                                    <SelectItem value="rejected">Rejeitados</SelectItem>
                                </SelectContent>
                            </Select>
                            <Select value={String(pageSize)} onValueChange={value => setPageSize(Number(value))}>
                                <SelectTrigger className="h-9 w-28"><SelectValue /></SelectTrigger>
                                <SelectContent>{[10, 25, 50, 100].map(size => <SelectItem key={size} value={String(size)}>{size} / página</SelectItem>)}</SelectContent>
                            </Select>
                        </div>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[980px] text-sm">
                            <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                                <tr>
                                    <SortHead label="Pedido" sortKey="requestedAt" />
                                    <SortHead label="Cliente" sortKey="clientName" />
                                    <SortHead label="Valor" sortKey="amount" className="text-right" />
                                    <th className="p-3 text-left">Condições</th>
                                    <th className="p-3 text-left">Solicitado por</th>
                                    <SortHead label="Estado" sortKey="status" />
                                    <SortHead label="Decisão" sortKey="decidedAt" />
                                    <th className="p-3 text-right">Acções</th>
                                </tr>
                            </thead>
                            <tbody>
                                {pageRows.length === 0 ? (
                                    <tr><td colSpan={8} className="p-10 text-center text-muted-foreground">
                                        <CheckCircle className="mx-auto mb-2 h-10 w-10 text-success" />
                                        Nenhum pedido em {range.label}{statusFilter !== 'all' ? ` com o estado "${STATUS_LABEL[statusFilter]}"` : ''}.
                                    </td></tr>
                                ) : pageRows.map(row => {
                                    const waiting = row.status === 'pending' ? hoursSince(row.requestedAt) : 0;
                                    return (
                                        <tr key={row.key} className={cn('border-t', row.status === 'pending' && waiting > PENDING_ALERT_HOURS && 'bg-amber-50/60 dark:bg-amber-950/20')}>
                                            <td className="p-3">
                                                <p className="font-medium">{row.requestedAt ? formatDate(row.requestedAt) : '—'}</p>
                                                {row.status === 'pending' && <p className={cn('flex items-center gap-1 text-xs', waiting > PENDING_ALERT_HOURS ? 'font-semibold text-amber-700' : 'text-muted-foreground')}>
                                                    <Clock className="h-3 w-3" /> à espera há {waitLabel(waiting)}</p>}
                                            </td>
                                            <td className="p-3"><p className="font-semibold">{row.clientName}</p><p className="font-mono text-[11px] text-muted-foreground">{row.creditId}</p></td>
                                            <td className="p-3 text-right font-bold">{formatCurrency(row.amount)}</td>
                                            <td className="p-3 text-xs">{row.rate.toLocaleString('pt-AO')}% · {row.installments || '—'} prest.</td>
                                            <td className="p-3 text-xs">{row.requestedBy || '—'}</td>
                                            <td className="p-3">
                                                <Badge variant={STATUS_VARIANT[row.status]}>{STATUS_LABEL[row.status]}</Badge>
                                                {row.status === 'pending' && escalationOf.get(row.creditId)?.status === 'pending' && (() => {
                                                    const escalation = escalationOf.get(row.creditId)!;
                                                    const given = approvalsOf(escalation.id).length;
                                                    return <div className="mt-1 max-w-[240px] space-y-0.5">
                                                        <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-400" title={escalation.details.join(' · ')}>{escalation.reason}</p>
                                                        <p className="text-[11px] text-muted-foreground">Requer: <strong>{escalation.requiredLevelName}</strong>{escalation.dual ? ` · ${given}/2 aprovações` : ''}{escalation.escalationCount ? ` · subiu ${escalation.escalationCount}×` : ''}</p>
                                                    </div>;
                                                })()}
                                            </td>
                                            <td className="p-3 text-xs">
                                                {row.status === 'pending' ? '—' : <>
                                                    <p className="font-semibold">{row.decidedBy || '—'}</p>
                                                    <p className="text-muted-foreground">{row.decidedAt ? formatDateTime(row.decidedAt) : 'Registo anterior'}</p>
                                                    {row.reason && <p className="mt-0.5 max-w-[220px] truncate text-muted-foreground" title={row.reason}>"{row.reason}"</p>}
                                                </>}
                                            </td>
                                            <td className="p-3">
                                                <div className="flex justify-end gap-1.5">
                                                    <Button size="sm" variant="outline" className="h-8 gap-1" onClick={() => setDetails(row)}><Eye className="h-3.5 w-3.5" /> Ver detalhes</Button>
                                                    {row.status === 'pending' && <>
                                                        <Button size="sm" className="h-8 gap-1" onClick={() => openDecision(row, 'approve')}><Check className="h-3.5 w-3.5" /> Aprovar</Button>
                                                        <Button size="sm" variant="destructive" className="h-8 gap-1" onClick={() => openDecision(row, 'reject')}><X className="h-3.5 w-3.5" /> Rejeitar</Button>
                                                    </>}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                    <div className="flex items-center justify-between border-t px-4 py-3 text-sm text-muted-foreground">
                        <span>A mostrar {visibleRows.length ? (Math.min(page, totalPages) - 1) * pageSize + 1 : 0}–{Math.min(Math.min(page, totalPages) * pageSize, visibleRows.length)} de {visibleRows.length}</span>
                        <div className="flex items-center gap-2">
                            <Button variant="outline" size="icon" className="h-8 w-8" disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label="Página anterior"><ChevronLeft className="h-4 w-4" /></Button>
                            <span>Página {Math.min(page, totalPages)} de {totalPages}</span>
                            <Button variant="outline" size="icon" className="h-8 w-8" disabled={page >= totalPages} onClick={() => setPage(page + 1)} aria-label="Página seguinte"><ChevronRight className="h-4 w-4" /></Button>
                        </div>
                    </div>
                </div>

                {/* Histórico por mês e relatórios mensais */}
                <div className="card-elevated p-4">
                    <h2 className="mb-3 flex items-center gap-2 text-base font-bold"><CalendarRange className="h-4 w-4" /> Histórico de decisões por mês</h2>
                    {months.length === 0 ? <p className="text-sm text-muted-foreground">Ainda não há decisões registadas.</p> : (
                        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                            {months.map(([key, entry]) => (
                                <div key={key} className="flex items-center justify-between gap-2 rounded-xl border p-3">
                                    <button type="button" className="text-left" onClick={() => { setPeriod({ ...period, kind: 'month', year: Number(key.slice(0, 4)), month: Number(key.slice(5, 7)) - 1 }); setStatusFilter('all'); }}>
                                        <p className="font-semibold hover:text-primary">{monthLabel(key)}</p>
                                        <p className="text-xs text-muted-foreground">{entry.approved} aprovados · {entry.rejected} rejeitados · {formatCurrency(entry.value)}</p>
                                    </button>
                                    <div className="flex gap-1">
                                        <Button size="icon" variant="ghost" className="h-8 w-8" title="Relatório mensal em PDF" onClick={() => downloadPdf(monthRows(key), monthLabel(key))}><FileText className="h-4 w-4 text-red-600" /></Button>
                                        <Button size="icon" variant="ghost" className="h-8 w-8" title="Relatório mensal em Excel" onClick={() => downloadExcel(monthRows(key), monthLabel(key))}><FileSpreadsheet className="h-4 w-4 text-emerald-600" /></Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {details && <ApprovalDetailsDialog row={details} credits={credits} clients={clients} history={history}
                onClose={() => setDetails(null)} onDecide={kind => openDecision(details, kind)} />}

            {/* Confirmação da decisão (motivo obrigatório na rejeição) */}
            <Dialog open={!!decision} onOpenChange={open => { if (!open && !processing) setDecision(null); }}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            {decision?.kind === 'approve' ? <CheckCircle className="h-5 w-5 text-success" /> : <XCircle className="h-5 w-5 text-destructive" />}
                            {decision?.kind === 'approve' ? 'Aprovar crédito' : 'Rejeitar crédito'}
                        </DialogTitle>
                        <DialogDescription>
                            {decision ? `${decision.row.clientName} — ${formatCurrency(decision.row.amount)} (${decision.row.rate.toLocaleString('pt-AO')}%, ${decision.row.installments} prestações).` : ''}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-2">
                        <label className="text-sm font-semibold">{decision?.kind === 'reject' ? 'Motivo da rejeição (obrigatório)' : 'Observações (opcional)'}</label>
                        <Textarea value={reason} onChange={event => setReason(event.target.value)} rows={3}
                            placeholder={decision?.kind === 'reject' ? 'Ex.: capacidade de pagamento insuficiente para a prestação proposta.' : 'Ex.: aprovado após confirmação do rendimento.'} />
                        {decision?.kind === 'reject' && reason.trim().length > 0 && reason.trim().length < 5 && <p className="text-xs text-destructive">Escreva pelo menos 5 caracteres.</p>}
                        <p className="text-xs text-muted-foreground">Fica registado: {user?.name}, {formatDateTime(new Date())}.</p>
                    </div>
                    <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={() => setDecision(null)} disabled={processing}>Cancelar</Button>
                        <Button variant={decision?.kind === 'reject' ? 'destructive' : 'default'} onClick={confirmDecision}
                            disabled={processing || (decision?.kind === 'reject' && reason.trim().length < 5)} className="gap-1.5">
                            {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : decision?.kind === 'approve' ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
                            Confirmar {decision?.kind === 'approve' ? 'aprovação' : 'rejeição'}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            <AlertModal isOpen={alertConfig.isOpen} onClose={() => setAlertConfig(prev => ({ ...prev, isOpen: false }))}
                title={alertConfig.title} description={alertConfig.description} type={alertConfig.type} />
        </MainLayout>
    );
}

function ApprovalDetailsDialog({ row, credits, clients, history, onClose, onDecide }: {
    row: ApprovalRow; credits: Credit[]; clients: any[]; history: CreditApprovalRecord[];
    onClose: () => void; onDecide: (kind: 'approve' | 'reject') => void;
}) {
    const [installments, setInstallments] = useState<InstallmentBalance[]>([]);
    const credit = row.credit;
    const client = clients.find(item => item.id === (row.clientId || credit?.clientId));
    const previous = credits.filter(item => item.clientId === (row.clientId || credit?.clientId) && item.id !== row.creditId && !item.deletedAt)
        .sort((a, b) => timeOf(b.createdAt) - timeOf(a.createdAt));
    const decisions = history.filter(item => item.creditId === row.creditId);

    useEffect(() => {
        let cancelled = false;
        ServicoFinanceiro.getCreditInstallments(row.creditId).then(list => { if (!cancelled) setInstallments(list); }).catch(() => setInstallments([]));
        return () => { cancelled = true; };
    }, [row.creditId]);

    const money = (minor: number) => formatCurrency(minor / 100);
    const totalDue = installments.reduce((sum, item) => sum + item.principalMinor + item.interestMinor, 0);
    const field = (label: string, value: React.ReactNode) => (
        <div><p className="text-[11px] font-semibold uppercase text-muted-foreground">{label}</p><p className="font-semibold">{value}</p></div>
    );
    const statusPt: Record<string, string> = { active: 'Ativo', paid: 'Liquidado', overdue: 'Em atraso', pending_approval: 'Pendente', rejected: 'Rejeitado', cancelled: 'Cancelado', defaulted: 'Incumprimento', renegotiated: 'Renegociado' };

    return (
        <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
            <DialogContent className={cn(CREDIT_DIALOG_CONTENT_CLASS, 'max-w-4xl')}>
                <DialogHeader className={CREDIT_DIALOG_HEADER_CLASS}>
                    <DialogTitle className="flex items-center gap-2 text-xl font-bold text-white"><Eye className="h-5 w-5 text-secondary" /> Detalhes do pedido</DialogTitle>
                    <DialogDescription className="mt-1 text-sm text-white/75">{row.clientName} · {row.creditId} · {STATUS_LABEL[row.status]}</DialogDescription>
                </DialogHeader>
                <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
                    <section className="grid grid-cols-2 gap-4 rounded-xl border p-4 md:grid-cols-4">
                        <h3 className="col-span-full text-sm font-bold">Cliente</h3>
                        {field('Nome', row.clientName)}
                        {field('NIF / BI', client?.nif || '—')}
                        {field('Telefone', client?.phone || '—')}
                        {field('Risco', client?.riskLevel === 'high' ? 'Alto' : client?.riskLevel === 'low' ? 'Baixo' : 'Médio')}
                        {field('Limite de crédito', formatCurrency(Number(client?.creditLimit || 0)))}
                        {field('Disponível', formatCurrency(Number(client?.availableCredit || 0)))}
                        {field('Rendimento mensal', client?.monthlyIncome ? formatCurrency(Number(client.monthlyIncome)) : '—')}
                        {field('Estado do cliente', client?.status === 'active' ? 'Activo' : client?.status === 'blocked' ? 'Bloqueado' : client?.status || '—')}
                    </section>
                    <section className="grid grid-cols-2 gap-4 rounded-xl border p-4 md:grid-cols-4">
                        <h3 className="col-span-full text-sm font-bold">Crédito pedido</h3>
                        {field('Valor', formatCurrency(row.amount))}
                        {field('Taxa de juro', `${row.rate.toLocaleString('pt-AO')}%`)}
                        {field('Prazo', `${row.installments || '—'} prestações`)}
                        {field('Total a pagar', totalDue ? money(totalDue) : '—')}
                        {field('Juro de mora', credit ? `${Number(credit.lateInterestRate || 0).toLocaleString('pt-AO')}% / dia` : '—')}
                        {field('Início', credit?.startDate ? formatDate(credit.startDate) : '—')}
                        {field('Vencimento final', credit?.dueDate ? formatDate(credit.dueDate) : '—')}
                        {field('Solicitado por', `${row.requestedBy || '—'}${row.requestedAt ? ` · ${formatDate(row.requestedAt)}` : ''}`)}
                        {client && row.amount > Number(client.availableCredit || 0) && (
                            <p className="col-span-full flex items-center gap-2 rounded-lg bg-amber-50 p-2 text-xs font-semibold text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                                <AlertCircle className="h-4 w-4" /> O valor pedido excede o crédito disponível do cliente.
                            </p>
                        )}
                    </section>
                    <section className="rounded-xl border p-4">
                        <h3 className="mb-2 text-sm font-bold">Plano de prestações</h3>
                        {installments.length === 0 ? <p className="text-sm text-muted-foreground">Sem prestações registadas.</p> : (
                            <table className="w-full text-sm">
                                <thead className="text-xs uppercase text-muted-foreground"><tr><th className="p-1.5 text-left">Nº</th><th className="p-1.5 text-left">Vencimento</th><th className="p-1.5 text-right">Capital</th><th className="p-1.5 text-right">Juros</th><th className="p-1.5 text-right">Prestação</th></tr></thead>
                                <tbody>{installments.map(item => (
                                    <tr key={item.id} className="border-t">
                                        <td className="p-1.5">{item.installmentNumber}</td><td className="p-1.5">{formatDate(item.dueDate)}</td>
                                        <td className="p-1.5 text-right">{money(item.principalMinor)}</td><td className="p-1.5 text-right">{money(item.interestMinor)}</td>
                                        <td className="p-1.5 text-right font-semibold">{money(item.principalMinor + item.interestMinor)}</td>
                                    </tr>
                                ))}</tbody>
                            </table>
                        )}
                    </section>
                    <section className="rounded-xl border p-4">
                        <h3 className="mb-2 text-sm font-bold">Créditos anteriores do cliente ({previous.length})</h3>
                        {previous.length === 0 ? <p className="text-sm text-muted-foreground">Primeiro crédito deste cliente.</p> : (
                            <table className="w-full text-sm">
                                <thead className="text-xs uppercase text-muted-foreground"><tr><th className="p-1.5 text-left">Crédito</th><th className="p-1.5 text-left">Início</th><th className="p-1.5 text-right">Valor</th><th className="p-1.5 text-right">Em dívida</th><th className="p-1.5 text-left">Estado</th></tr></thead>
                                <tbody>{previous.map(item => (
                                    <tr key={item.id} className="border-t">
                                        <td className="p-1.5 font-mono text-xs">{item.id}</td>
                                        <td className="p-1.5">{item.startDate ? formatDate(item.startDate) : '—'}</td>
                                        <td className="p-1.5 text-right">{formatCurrency(Number(item.principalAmount) || 0)}</td>
                                        <td className="p-1.5 text-right">{formatCurrency(Number(item.totalDue ?? item.currentBalance) || 0)}</td>
                                        <td className="p-1.5">{statusPt[item.status] || item.status}</td>
                                    </tr>
                                ))}</tbody>
                            </table>
                        )}
                    </section>
                    {decisions.length > 0 && (
                        <section className="rounded-xl border p-4">
                            <h3 className="mb-2 text-sm font-bold">Registo de auditoria</h3>
                            <ul className="space-y-1 text-sm">{decisions.map(item => (
                                <li key={item.id}><strong>{item.decision === 'approved' ? 'Aprovado' : 'Rejeitado'}</strong> por {item.decidedBy} em {formatDateTime(item.decidedAt)}{item.reason ? ` — "${item.reason}"` : ''}</li>
                            ))}</ul>
                        </section>
                    )}
                </div>
                {row.status === 'pending' && (
                    <div className="flex justify-end gap-2 border-t p-4">
                        <Button variant="destructive" className="gap-1.5" onClick={() => onDecide('reject')}><X className="h-4 w-4" /> Rejeitar</Button>
                        <Button className="gap-1.5" onClick={() => onDecide('approve')}><Check className="h-4 w-4" /> Aprovar</Button>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
