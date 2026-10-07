import { useMemo, useState } from 'react';
import { CalendarCheck, Lock, LockOpen, Search, ShieldAlert, ShieldCheck, ShieldQuestion } from 'lucide-react';
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
import { auditChainFindings } from '@/bibliotecas/cadeia-auditoria';
import { monthIdOf, monthLabel } from '@/bibliotecas/fecho-mes';
import { incomeStatement, receivablesForecast, type DateRange } from '@/bibliotecas/relatorios-contabeis';
import { ServicoContabilidadeGeral, type AccountingRequest } from '@/servicos/ServicoContabilidadeGeral';
import { AvisoErro, BotoesExportar, Indicador, SeccaoCabecalho, TabelaPaginada, type Coluna } from './comum';
import { isAdminRole, money } from './formato';
import type { ContabilidadeData } from './useContabilidade';
import { useNomeUtilizador } from './utilizadores';

const REQUEST_STATUS = { pending: 'Pendente', approved: 'Aprovado', rejected: 'Rejeitado' } as const;

export function PedidosAprovacao({ data }: { data: ContabilidadeData }) {
    const { user } = useAuth();
    const { refreshData } = useData();
    const { toast } = useToast();
    const [status, setStatus] = useState('pending');
    const [kind, setKind] = useState('all');
    const [reasons, setReasons] = useState<Record<string, string>>({});
    const [busy, setBusy] = useState('');
    const admin = isAdminRole(user?.role);
    const rows = data.requests.filter(request => (status === 'all' || request.status === status) && (kind === 'all' || request.kind === kind));

    const decide = async (request: AccountingRequest, approve: boolean) => {
        if (!user) return;
        setBusy(request.id);
        try {
            const resultEntryId = await ServicoContabilidadeGeral.decideRequest(request, approve, reasons[request.id] || '', { id: user.id, name: user.name, role: user.role },
                { reversePayment: async () => undefined });
            toast({ title: approve ? 'Pedido aprovado e contabilizado' : 'Pedido rejeitado', description: resultEntryId ? `Lançamento ${resultEntryId}` : undefined });
            await refreshData();
            await data.reload();
        } catch (error: any) {
            toast({ title: 'Não foi possível decidir o pedido', description: error?.message, variant: 'destructive' });
        } finally { setBusy(''); }
    };

    return (
        <div>
            <SeccaoCabecalho title="Pedidos de aprovação" description="Estornos de lançamentos e pagamentos e abates de créditos. Quem pede não pode aprovar: a decisão é de outro administrador e fica registada com o motivo."
                actions={<BotoesExportar build={() => ({
                    title: 'Pedidos de aprovação', subtitle: `${rows.length} pedido(s)`, fileName: 'pedidos-aprovacao', numericColumns: [3],
                    head: ['Data', 'Tipo', 'Descrição', 'Valor', 'Pedido por', 'Motivo', 'Estado', 'Decidido por', 'Decisão'],
                    body: rows.map(request => [formatDateTime(request.requestedAt), request.kind === 'reversal' ? 'Estorno' : 'Abate', request.description || request.targetId,
                        request.amountMinor ? money(request.amountMinor) : '', request.requestedBy, request.reason, REQUEST_STATUS[request.status], request.decidedBy || '', request.decisionReason || '']),
                })} />} />
            <div className="mb-3 flex flex-wrap gap-2">
                <Select value={status} onValueChange={setStatus}><SelectTrigger className="w-48"><SelectValue /></SelectTrigger><SelectContent>
                    <SelectItem value="pending">Pendentes</SelectItem><SelectItem value="approved">Aprovados</SelectItem><SelectItem value="rejected">Rejeitados</SelectItem><SelectItem value="all">Todos</SelectItem>
                </SelectContent></Select>
                <Select value={kind} onValueChange={setKind}><SelectTrigger className="w-48"><SelectValue /></SelectTrigger><SelectContent>
                    <SelectItem value="all">Estornos e abates</SelectItem><SelectItem value="reversal">Estornos</SelectItem><SelectItem value="writeoff">Abates</SelectItem>
                </SelectContent></Select>
            </div>
            <div className="space-y-3">
                {rows.map(request => {
                    const canDecide = admin && request.status === 'pending' && request.requestedById !== user?.id;
                    return (
                        <div key={request.id} className="rounded-xl border bg-card p-4">
                            <div className="flex flex-wrap items-start justify-between gap-2">
                                <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <Badge variant="outline">{request.kind === 'reversal' ? 'Estorno' : 'Abate'}</Badge>
                                        <Badge variant={request.status === 'pending' ? 'warning' : request.status === 'approved' ? 'success' : 'destructive'}>{REQUEST_STATUS[request.status]}</Badge>
                                        {request.amountMinor ? <span className="font-mono text-sm font-bold">{money(request.amountMinor)}</span> : null}
                                    </div>
                                    <p className="mt-1 font-semibold">{request.description || request.targetId}</p>
                                    <p className="text-xs text-muted-foreground">Pedido por {request.requestedBy} em {formatDateTime(request.requestedAt)} · referência <span className="font-mono">{request.targetId}</span></p>
                                    <p className="mt-1 text-sm"><span className="text-muted-foreground">Motivo:</span> {request.reason}</p>
                                    {request.decidedBy && <p className="mt-1 text-sm"><span className="text-muted-foreground">{REQUEST_STATUS[request.status]} por {request.decidedBy} em {formatDateTime(request.decidedAt || '')}:</span> {request.decisionReason || '—'}{request.resultEntryId ? ` · lançamento ${request.resultEntryId}` : ''}</p>}
                                </div>
                            </div>
                            {canDecide && (
                                <div className="mt-3 flex flex-col gap-2 md:flex-row">
                                    <Input value={reasons[request.id] || ''} onChange={event => setReasons(previous => ({ ...previous, [request.id]: event.target.value }))} placeholder="Motivo da decisão (mínimo 10 caracteres)" />
                                    <div className="flex gap-2">
                                        <Button disabled={busy === request.id || (reasons[request.id] || '').trim().length < 10} onClick={() => void decide(request, true)}>Aprovar e contabilizar</Button>
                                        <Button variant="outline" disabled={busy === request.id || (reasons[request.id] || '').trim().length < 10} onClick={() => void decide(request, false)}>Rejeitar</Button>
                                    </div>
                                </div>
                            )}
                            {request.status === 'pending' && request.requestedById === user?.id && <p className="mt-2 text-xs text-muted-foreground">Aguarda a decisão de outro administrador.</p>}
                        </div>
                    );
                })}
                {rows.length === 0 && <p className="rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground">Sem pedidos com estes filtros.</p>}
            </div>
        </div>
    );
}

const ACTION_LABELS: Record<string, string> = { create: 'Criação', update: 'Alteração', delete: 'Eliminação', login: 'Início de sessão', logout: 'Fim de sessão', login_failure: 'Falha de início de sessão', restore: 'Reposição', approve: 'Aprovação', reject: 'Rejeição', export: 'Exportação', mfa_disabled: '2FA desactivado' };
const MODULE_LABELS: Record<string, string> = { credit: 'Créditos', payment: 'Pagamentos', client: 'Clientes', accounting_entry: 'Contabilidade', system: 'Sistema', user: 'Utilizadores', expense: 'Despesas', company_settings: 'Definições', contract: 'Contratos', contencioso: 'Contencioso', garantia: 'Garantias', payment_gateway: 'Gateways' };

export function TrilhaUtilizadores({ data, range, rangeLabel }: { data: ContabilidadeData; range: DateRange; rangeLabel: string }) {
    const [search, setSearch] = useState('');
    const [userFilter, setUserFilter] = useState('all');
    const [moduleFilter, setModuleFilter] = useState('all');
    const [actionFilter, setActionFilter] = useState('all');
    const userName = useNomeUtilizador();
    const logs = useMemo(() => data.snapshot?.auditLogs || [], [data.snapshot]);
    const chainIssues = useMemo(() => {
        const issues = auditChainFindings(logs, data.snapshot?.auditChain || []);
        return {
            broken: new Set(issues.filter(item => item.severity === 'error').map(item => item.entityId)),
            unsealed: new Set(issues.filter(item => item.severity === 'warning').map(item => item.entityId)),
        };
    }, [logs, data.snapshot?.auditChain]);
    const users = useMemo(() => [...new Map(logs.filter(log => log.userId).map(log => [String(log.userId), String(log.userName || log.userId)])).entries()], [logs]);
    const rows = useMemo(() => {
        const query = search.trim().toLowerCase();
        return logs.filter(log => {
            const time = new Date(log.timestamp).getTime();
            if (range.start && time < range.start.getTime()) return false;
            if (range.end && time > range.end.getTime()) return false;
            if (userFilter !== 'all' && String(log.userId) !== userFilter) return false;
            if (moduleFilter !== 'all' && log.entity !== moduleFilter) return false;
            if (actionFilter !== 'all' && log.action !== actionFilter) return false;
            return !query || `${log.userName} ${log.details} ${log.entity} ${log.action}`.toLowerCase().includes(query);
        });
    }, [logs, range, search, userFilter, moduleFilter, actionFilter]);
    const chainOf = (id: string) => chainIssues.broken.has(id) ? 'broken' : chainIssues.unsealed.has(id) ? 'unsealed' : 'ok';
    const columns: Coluna<any>[] = [
        { key: 'date', header: 'Data e hora', className: 'whitespace-nowrap', render: log => <span className="text-xs">{formatDateTime(log.timestamp)}</span> },
        { key: 'user', header: 'Utilizador', render: log => <span className="font-medium">{userName(log.userName || log.userId)}</span> },
        { key: 'action', header: 'Acção', render: log => <Badge variant="outline">{ACTION_LABELS[log.action] || log.action}</Badge> },
        { key: 'module', header: 'Módulo', render: log => MODULE_LABELS[log.entity] || log.entity || '—' },
        { key: 'details', header: 'Detalhes', className: 'min-w-[320px]', render: log => <span className="text-sm">{log.details}</span> },
        {
            key: 'chain', header: 'Cadeia', render: log => {
                const state = chainOf(log.id);
                return state === 'ok' ? <ShieldCheck className="h-4 w-4 text-emerald-600" aria-label="Encadeado" /> : state === 'broken'
                    ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-600"><ShieldAlert className="h-4 w-4" />Alterado</span>
                    : <ShieldQuestion className="h-4 w-4 text-amber-500" aria-label="Sem selo (registo antigo)" />;
            }
        },
    ];
    return (
        <div>
            <SeccaoCabecalho title="Trilha de utilizadores" description={`Todas as acções registadas (${rangeLabel}). Cada registo é encadeado por hash: uma alteração ou eliminação fora da aplicação aparece como "Alterado".`}
                actions={<BotoesExportar build={() => ({
                    title: 'Trilha de utilizadores', subtitle: rangeLabel, fileName: `trilha-utilizadores-${rangeLabel}`,
                    head: ['Data e hora', 'Utilizador', 'Acção', 'Módulo', 'Detalhes', 'Cadeia'],
                    body: rows.map(log => [formatDateTime(log.timestamp), userName(log.userName || log.userId), ACTION_LABELS[log.action] || log.action, MODULE_LABELS[log.entity] || log.entity || '', log.details || '', chainOf(log.id) === 'ok' ? 'Encadeado' : chainOf(log.id) === 'broken' ? 'ALTERADO' : 'Sem selo']),
                })} />} />
            <div className="mb-3 grid gap-3 md:grid-cols-3">
                <Indicador label="Registos no período" value={rows.length} />
                <Indicador label="Registos alterados" value={chainIssues.broken.size} tone={chainIssues.broken.size ? 'bad' : 'good'} />
                <Indicador label="Registos antigos sem selo" value={chainIssues.unsealed.size} hint={chainIssues.unsealed.size ? 'Use "Encadear trilha antiga" na Auditoria' : undefined} />
            </div>
            <div className="mb-3 grid gap-2 md:grid-cols-4">
                <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={event => setSearch(event.target.value)} placeholder="Pesquisar detalhes…" className="pl-9" /></div>
                <Select value={userFilter} onValueChange={setUserFilter}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todos os utilizadores</SelectItem>{users.map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}</SelectContent></Select>
                <Select value={moduleFilter} onValueChange={setModuleFilter}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todos os módulos</SelectItem>{[...new Set(logs.map(log => String(log.entity || '')).filter(Boolean))].map(item => <SelectItem key={item} value={item}>{MODULE_LABELS[item] || item}</SelectItem>)}</SelectContent></Select>
                <Select value={actionFilter} onValueChange={setActionFilter}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todas as acções</SelectItem>{[...new Set(logs.map(log => String(log.action || '')).filter(Boolean))].map(item => <SelectItem key={item} value={item}>{ACTION_LABELS[item] || item}</SelectItem>)}</SelectContent></Select>
            </div>
            <TabelaPaginada columns={columns} rows={rows} rowKey={log => log.id} pageSize={30} rowClassName={log => chainOf(log.id) === 'broken' ? 'bg-red-50/70 dark:bg-red-950/20' : undefined} />
        </div>
    );
}

const pad = (value: number) => String(value).padStart(2, '0');
const todayKey = () => { const now = new Date(); return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`; };

export function FechoPeriodo({ data }: { data: ContabilidadeData }) {
    const { user } = useAuth();
    const { closedMonths, closeMonth, reopenMonth } = useData();
    const { toast } = useToast();
    const [day, setDay] = useState(todayKey());
    const [busy, setBusy] = useState('');
    const [error, setError] = useState('');
    const [reopen, setReopen] = useState<string | null>(null);
    const [reason, setReason] = useState('');
    const admin = isAdminRole(user?.role);
    const actor = user ? { id: user.id, name: user.name, role: user.role } : null;

    const months = useMemo(() => {
        const ids = new Set<string>([monthIdOf(new Date()), ...data.journal.map(entry => monthIdOf(new Date(entry.timestamp))), ...closedMonths.map((month: any) => String(month.id))]);
        return [...ids].sort().reverse();
    }, [data.journal, closedMonths]);

    const closeDay = async () => {
        if (!actor) return;
        setBusy('day'); setError('');
        try {
            const { close } = await ServicoContabilidadeGeral.closeDay(day, actor);
            toast({ title: `Dia ${close.day} fechado`, description: `${close.entryCount} lançamentos · auditoria sem críticos.` });
            await data.reload();
        } catch (failure: any) { setError(failure?.message || 'Não foi possível fechar o dia.'); }
        finally { setBusy(''); }
    };

    const closeMonthWithAudit = async (monthId: string) => {
        if (!actor) return;
        setBusy(monthId); setError('');
        try {
            const { run } = await ServicoContabilidadeGeral.runAudit('full', actor);
            if (run.status === 'critical') throw new Error(`A auditoria encontrou ${run.criticalCount} apontamento(s) crítico(s). Resolva-os ou justifique-os antes de fechar o mês.`);
            const [year, month] = monthId.split('-').map(Number);
            const range = { start: new Date(year, month - 1, 1), end: new Date(year, month, 0, 23, 59, 59, 999) };
            const inMonth = data.journal.filter(entry => { const time = new Date(entry.timestamp).getTime(); return time >= range.start.getTime() && time <= range.end.getTime(); });
            const disbursed = inMonth.filter(entry => entry.type === 'disbursement').flatMap(entry => entry.lines).filter(line => line.account === 'portfolio' && line.side === 'debit').reduce((sum, line) => sum + line.amountMinor, 0);
            const principalReceived = inMonth.filter(entry => entry.paymentId).flatMap(entry => entry.lines).filter(line => line.account === 'portfolio').reduce((sum, line) => sum + (line.side === 'credit' ? 1 : -1) * line.amountMinor, 0);
            const income = incomeStatement(data.journal, range);
            const projected = (data.snapshot?.installments || []).filter((item: any) => { const due = new Date(item.dueDate).getTime(); return due >= range.start.getTime() && due <= range.end.getTime(); })
                .reduce((sum: number, item: any) => sum + Number(item.interestMinor || 0), 0);
            const activeIds = new Set((data.snapshot?.credits || []).filter(credit => !credit.deletedAt && ['active', 'overdue', 'defaulted', 'renegotiated'].includes(String(credit.status))).map(credit => credit.id));
            const overdue = receivablesForecast((data.snapshot?.installments || []) as any, activeIds).overdueMinor;
            await closeMonth(monthId, month - 1, year, disbursed / 100, projected / 100, income.revenueMinor / 100, overdue / 100,
                disbursed ? Math.round((principalReceived / disbursed) * 10000) / 100 : 0, actor.name);
            toast({ title: `${monthLabel(monthId)} fechado`, description: 'Não são aceites novos lançamentos com data neste mês até ser reaberto por um administrador.' });
            await data.reload();
        } catch (failure: any) { setError(failure?.message || 'Não foi possível fechar o mês.'); }
        finally { setBusy(''); }
    };

    const confirmReopen = async () => {
        if (!reopen) return;
        setBusy(reopen); setError('');
        try {
            await reopenMonth(reopen, reason);
            toast({ title: `${monthLabel(reopen)} reaberto`, description: 'A reabertura ficou registada na trilha com a justificação.' });
            setReopen(null); setReason('');
            await data.reload();
        } catch (failure: any) { setError(failure?.message || 'Não foi possível reabrir o mês.'); }
        finally { setBusy(''); }
    };

    const closeColumns: Coluna<any>[] = [
        { key: 'day', header: 'Dia', render: close => <span className="font-semibold">{close.day}</span> },
        { key: 'entries', header: 'Lançamentos', align: 'right', render: close => close.entryCount },
        { key: 'debit', header: 'Débitos acumulados', align: 'right', className: 'font-mono', render: close => money(close.debitMinor) },
        { key: 'liquid', header: 'Caixa e Bancos', align: 'right', className: 'font-mono', render: close => money(close.liquidMinor) },
        { key: 'portfolio', header: 'Carteira', align: 'right', className: 'font-mono', render: close => money(close.portfolioMinor) },
        { key: 'hash', header: 'Último hash', render: close => <span className="font-mono text-xs" title={close.headHash || ''}>{close.headHash ? `${close.headHash.slice(0, 12)}…` : '—'}</span> },
        { key: 'seal', header: 'Selo', render: close => close.sealStatus === 'valid' ? 'Válido' : close.sealStatus === 'partial' ? 'Parcial' : close.sealStatus === 'invalid' ? 'Inválido' : 'Indisponível' },
        { key: 'by', header: 'Fechado por', render: close => <span className="text-xs">{close.closedBy} · {formatDateTime(close.closedAt)}</span> },
    ];

    return (
        <div className="space-y-6">
            <SeccaoCabecalho title="Fecho de período" description="Cada fecho executa a auditoria completa e só avança sem apontamentos críticos por resolver. O fecho diário guarda a fotografia do razão; o fecho mensal bloqueia novos lançamentos nesse mês." />
            <AvisoErro message={error} />
            <div className="rounded-xl border bg-card p-4">
                <p className="mb-1 flex items-center gap-2 font-bold"><CalendarCheck className="h-4 w-4" /> Fecho diário</p>
                <p className="mb-3 text-xs text-muted-foreground">Regista o último lançamento do dia, o hash da cadeia, os totais e o estado dos selos. Um dia fechado não pode ser alterado.</p>
                <div className="flex flex-wrap items-center gap-2">
                    <Input type="date" value={day} max={todayKey()} onChange={event => setDay(event.target.value)} className="w-44" />
                    <Button disabled={!!busy || !day} onClick={() => void closeDay()}>{busy === 'day' ? 'A auditar…' : 'Auditar e fechar o dia'}</Button>
                </div>
            </div>
            <TabelaPaginada columns={closeColumns} rows={data.closes} rowKey={close => close.day} pageSize={15} empty="Ainda não há dias fechados." />
            <div className="rounded-xl border bg-card p-4">
                <p className="mb-1 flex items-center gap-2 font-bold"><Lock className="h-4 w-4" /> Fecho mensal</p>
                <p className="mb-3 text-xs text-muted-foreground">Mês fechado = nenhum lançamento novo com data nesse mês. Só um administrador pode reabrir, com justificação registada.</p>
                <div className="divide-y">
                    {months.map(monthId => {
                        const closed = closedMonths.find((month: any) => month.id === monthId);
                        return (
                            <div key={monthId} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                                <div>
                                    <p className="font-semibold capitalize">{monthLabel(monthId)}</p>
                                    <p className="text-xs text-muted-foreground">{closed ? `Fechado por ${closed.closedBy} em ${formatDateTime(closed.closedAt)}` : 'Aberto'}</p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Badge variant={closed ? 'success' : 'outline'}>{closed ? 'Fechado' : 'Aberto'}</Badge>
                                    {!closed && <Button size="sm" disabled={!!busy} onClick={() => void closeMonthWithAudit(monthId)}>{busy === monthId ? 'A auditar…' : 'Auditar e fechar'}</Button>}
                                    {closed && admin && <Button size="sm" variant="outline" className="gap-1" disabled={!!busy} onClick={() => { setReason(''); setReopen(monthId); }}><LockOpen className="h-3.5 w-3.5" />Reabrir</Button>}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
            <Dialog open={!!reopen} onOpenChange={open => !open && setReopen(null)}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>Reabrir {reopen ? monthLabel(reopen) : ''}</DialogTitle>
                        <DialogDescription>A reabertura permite novos lançamentos nesse mês e fica registada na trilha de utilizadores com a justificação.</DialogDescription>
                    </DialogHeader>
                    <Textarea rows={3} value={reason} onChange={event => setReason(event.target.value)} placeholder="Justificação (mínimo 10 caracteres)" />
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setReopen(null)}>Cancelar</Button>
                        <Button disabled={!!busy || reason.trim().length < 10} onClick={() => void confirmReopen()}>Reabrir mês</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
