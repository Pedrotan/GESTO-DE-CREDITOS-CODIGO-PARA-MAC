// Ficha do crédito (Parte F): cabeçalho com os valores principais, oito separadores (resumo, plano, pagamentos,
// garantias, documentos, cobrança, contabilidade e histórico) e as ações permitidas pelo estado, pelas permissões e
// pelas alçadas. Os valores vêm da mesma biblioteca da página de Créditos (a linha da carteira) e dos serviços
// existentes; nada é recalculado com fórmulas próprias.
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Area, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
    AlarmClock, ArrowLeft, Ban, CalendarClock, CheckCircle2, ExternalLink, FileText, FileUp, Gavel, HandCoins, History, Loader2, MoreHorizontal,
    Phone, PlusCircle, Printer, Receipt, RefreshCcw, Scale, Send, ShieldCheck, Trash2, UserCog, Wallet,
} from 'lucide-react';
import { MainLayout } from '@/componentes/layout/MainLayout';
import { useAuth } from '@/contextos/ContextoAutenticacao';
import { useData } from '@/contextos/ContextoDados';
import { useCarteira } from '@/componentes/creditos/useCarteira';
import { RegistarPagamentoCredito } from '@/componentes/creditos/RegistarPagamentoCredito';
import {
    AbateDialog, ContenciosoDialog, DecisaoReestruturacao, ExtratoDialog, LiquidacaoAntecipadaDialog, ReestruturacaoDialog, TransferirGestorDialog,
} from '@/componentes/creditos/OperacoesCredito';
import { JurosMoraDialog } from '@/componentes/creditos/JurosMoraDialog';
import { ReinforcementModal } from '@/componentes/modals/ReinforcementModal';
import { PdfCanvasViewer } from '@/componentes/ui/PdfCanvasViewer';
import { Button } from '@/componentes/ui/button';
import { Input } from '@/componentes/ui/input';
import { Textarea } from '@/componentes/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/componentes/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/componentes/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/componentes/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/componentes/ui/select';
import { useToast } from '@/componentes/ui/use-toast';
import { STAGES, AGING_LABELS, type InstallmentRow } from '@/bibliotecas/carteira-credito';
import { buildPaymentRows } from '@/bibliotecas/pagamentos-analise';
import { projectLateInterest, type LateInterestSummary } from '@/bibliotecas/juros-mora';
import { monthlyIrr } from '@/bibliotecas/simulador-credito';
import { clientCreditStanding, newCreditBlockReason } from '@/bibliotecas/regras-credito';
import { formatCurrency } from '@/bibliotecas/formatters';
import { luandaDateKey } from '@/bibliotecas/fuso-angola';
import { generateContractPDF } from '@/bibliotecas/pdf';
import { cn } from '@/bibliotecas/utils';
import { downloadReceipt } from '@/componentes/pagamentos/acoes-recibo';
import { ServicoCarteira, type Restructuring } from '@/servicos/ServicoCarteira';
import { ServicoCobrancaOperacional } from '@/servicos/ServicoCobrancaOperacional';
import { ServicoConfigSimulador } from '@/servicos/ServicoConfigSimulador';
import { ServicoControloAcesso } from '@/servicos/ServicoControloAcesso';

const kz = (minor: number) => formatCurrency(minor / 100);
const dateLabel = (value?: string | Date | null) => value ? luandaDateKey(value).split('-').reverse().join('/') : '—';
const num = (value: unknown) => Number(value) || 0;
const RISK: Record<string, string> = { low: 'Baixo', medium: 'Médio', high: 'Alto' };
const DOC_KINDS: Record<string, string> = { contrato: 'Contrato', livranca: 'Livrança', bi: 'Bilhete de Identidade', comprovativo: 'Comprovativo', outro: 'Outro' };
const ENTRY_TYPES: Record<string, string> = {
    disbursement: 'Desembolso', payment: 'Recebimento', interest_accrual: 'Juros', late_interest: 'Juros de mora', adjustment: 'Ajuste de encargos',
    reversal: 'Estorno', writeoff: 'Abate', journal_reversal: 'Estorno de lançamento', manual: 'Lançamento manual',
};
const COLLECTION_KINDS: Record<string, string> = { contact: 'Contacto', promise: 'Promessa de pagamento', promise_kept: 'Promessa cumprida', promise_broken: 'Promessa falhada', assignment: 'Atribuição de gestor', target: 'Meta' };

type FileData = Awaited<ReturnType<typeof ServicoCarteira.loadCreditFile>>;

function Stat({ label, value, tone, hint }: { label: string; value: ReactNode; tone?: 'red' | 'green' | 'amber'; hint?: string }) {
    return (
        <div className="min-w-0 rounded-xl border bg-background/70 p-3" title={hint}>
            <p className="truncate text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
            <p className={cn('truncate text-base font-black tracking-tight sm:text-lg', tone === 'red' && 'text-red-700 dark:text-red-400', tone === 'green' && 'text-emerald-700 dark:text-emerald-400', tone === 'amber' && 'text-amber-700 dark:text-amber-400')}>{value}</p>
        </div>
    );
}
function Empty({ children }: { children: ReactNode }) { return <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">{children}</p>; }
function Info({ label, value }: { label: string; value: ReactNode }) {
    return <div className="flex justify-between gap-4 border-b py-2 text-sm last:border-0"><span className="text-muted-foreground">{label}</span><span className="text-right font-semibold">{value}</span></div>;
}

export default function FichaCredito() {
    const { id = '' } = useParams();
    const creditId = decodeURIComponent(id);
    const navigate = useNavigate();
    const { user } = useAuth();
    const { clients, companySettings, users: contextUsers } = useData() as any;
    const carteira = useCarteira();
    const { toast } = useToast();
    const [file, setFile] = useState<FileData | null>(null);
    const [loadError, setLoadError] = useState('');
    const [moraDate, setMoraDate] = useState(() => luandaDateKey(new Date(Date.now() + 30 * 86_400_000)));
    const [stampRate, setStampRate] = useState(0.2);
    const [dialog, setDialog] = useState<null | 'pay' | 'early' | 'restructure' | 'legal' | 'writeoff' | 'transfer' | 'statement' | 'mora' | 'reinforce'>(null);
    const [decision, setDecision] = useState<{ id: string; approve: boolean } | null>(null);
    const [contractUrl, setContractUrl] = useState<string | null>(null);
    const [preview, setPreview] = useState<{ url: string; name: string; mime: string } | null>(null);

    const row = carteira.rows.find(item => item.id === creditId) || null;
    const credit = row?.credit || null;
    const client = clients.find((item: any) => item.id === credit?.clientId);
    const actor = useMemo(() => user ? { id: user.id, name: user.name, role: user.role, permissions: user.permissions } : null, [user]);
    const can = useCallback((permission: string) => ServicoControloAcesso.temPermissao(user as any, permission), [user]);
    const isApprover = ['admin', 'super_admin', 'credit_director'].includes(String(user?.role));

    const reload = useCallback(async () => {
        if (!creditId) return;
        try { setFile(await ServicoCarteira.loadCreditFile(creditId)); setLoadError(''); }
        catch (error: any) { setLoadError(error?.message || 'Não foi possível carregar a ficha do crédito.'); }
    }, [creditId]);
    useEffect(() => { void reload(); }, [reload, carteira.payments.length, carteira.credits]);
    useEffect(() => { void ServicoConfigSimulador.load().then(config => setStampRate(Number(config.stampDuty?.interest) || 0)).catch(() => undefined); }, []);
    const refreshAll = useCallback(async () => { await carteira.reloadContext(); await reload(); }, [carteira, reload]);

    const installments = useMemo(() => (file?.installments || []).map(item => ({ ...item, creditId }) as unknown as InstallmentRow), [file, creditId]);
    const visibleInstallments = installments.filter(item => item.status !== 'cancelled' && num(item.principalMinor) + num(item.interestMinor) > 0);
    const paymentRows = useMemo(() => credit ? buildPaymentRows({ payments: carteira.payments.filter(payment => payment.creditId === credit.id), credits: [credit], clients, users: contextUsers || [], numbers: new Map([[credit.id, row?.reference || credit.id]]) })
        .sort((a, b) => b.valueDateKey.localeCompare(a.valueDateKey)) : [], [credit, carteira.payments, clients, contextUsers, row?.reference]);

    // TAEG: a da simulação convertida (inclui comissões e impostos) ou, sem ela, a taxa interna dos fluxos do plano.
    const taeg = useMemo(() => {
        if (!credit || !visibleInstallments.length) return null;
        const irr = monthlyIrr([num(credit.principalAmount) * 100, ...visibleInstallments.map(item => -(num(item.principalMinor) + num(item.interestMinor)))]);
        return irr === null ? null : Math.round((Math.pow(1 + irr, 12) - 1) * 10000) / 100;
    }, [credit, visibleInstallments]);

    const moraProjection = useMemo(() => {
        if (!file?.mora) return null;
        const days = Math.round((Date.parse(`${moraDate}T00:00:00Z`) - Date.parse(`${carteira.today}T00:00:00Z`)) / 86_400_000);
        return days > 0 ? projectLateInterest(file.mora as LateInterestSummary, days) : null;
    }, [file, moraDate, carteira.today]);

    const chart = useMemo(() => {
        if (!credit) return [];
        const granted = num(credit.principalAmount) * 100;
        const confirmed = carteira.payments.filter(payment => payment.creditId === credit.id && payment.status === 'confirmed' && !payment.deletedAt);
        const points = [luandaDateKey(credit.startDate), ...visibleInstallments.map(item => luandaDateKey(item.dueDate))].sort();
        return [...new Set(points)].map(key => {
            const planned = visibleInstallments.filter(item => luandaDateKey(item.dueDate) <= key).reduce((sum, item) => sum + num(item.principalMinor), 0);
            const paid = confirmed.filter(payment => luandaDateKey(payment.paymentDate) <= key).reduce((sum, payment) => sum + Math.round(num(payment.allocatedToPrincipal) * 100), 0);
            return { name: key.split('-').reverse().join('/'), Previsto: Math.max(0, granted - planned) / 100, Real: key <= carteira.today ? Math.max(0, granted - paid) / 100 : null };
        });
    }, [credit, visibleInstallments, carteira.payments, carteira.today]);

    if (!row || !credit) {
        return (
            <MainLayout title="Ficha do Crédito" subtitle="Detalhe da operação">
                <Button variant="ghost" className="mb-4 gap-2" onClick={() => navigate('/creditos')}><ArrowLeft className="h-4 w-4" /> Voltar a Créditos</Button>
                {carteira.loading ? <div className="flex items-center gap-2 p-10 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> A carregar a ficha…</div>
                    : <Empty>Crédito não encontrado ou sem permissão para o ver ({creditId}).</Empty>}
            </MainLayout>
        );
    }

    const stage = STAGES[row.stage];
    const payable = ['active', 'overdue', 'defaulted', 'renegotiated'].includes(credit.status) && row.stage !== 'abatido' && row.outstandingMinor + row.interestOutstandingMinor + row.moraMinor > 0;
    const inBook = ['ativo', 'em_atraso', 'reestruturado'].includes(row.stage);
    const pendingRestructure = file?.restructurings.find(item => item.status === 'pending' && item.kind === 'restructure') || null;
    const pendingWriteoff = file?.writeoffRequests.find((item: any) => item.status === 'pending') || null;
    const standing = clientCreditStanding(credit.clientId, carteira.credits);
    const renewalBlocked = newCreditBlockReason(standing, value => formatCurrency(value));
    const actions = {
        pay: payable && can('pagamentos.criar'),
        early: payable && row.outstandingMinor > 0 && can('pagamentos.criar') && !pendingRestructure,
        restructure: inBook && (can('creditos.reestruturar') || can('creditos.editar')) && !pendingRestructure,
        legal: inBook && (isApprover || can('contencioso.aprovar')),
        writeoff: ['overdue', 'defaulted'].includes(credit.status) && row.stage !== 'abatido' && !pendingWriteoff && (isApprover || can('contabilidade.editar')),
        transfer: row.stage !== 'abatido' && (isApprover || can('creditos.editar')),
        renew: row.stage === 'liquidado' && can('creditos.criar'),
    };

    const openContract = () => {
        try {
            const url = generateContractPDF(credit, companySettings, carteira.payments.filter(payment => payment.creditId === credit.id), 'blob', user?.name);
            if (url) setContractUrl(url as unknown as string);
        } catch { toast({ title: 'Não foi possível gerar o contrato', variant: 'destructive' }); }
    };

    return (
        <MainLayout title="Ficha do Crédito" subtitle={`${row.reference} · ${credit.clientName}`}>
            <Button variant="ghost" className="mb-3 gap-2" onClick={() => navigate('/creditos')}><ArrowLeft className="h-4 w-4" /> Voltar a Créditos</Button>
            {loadError && <p className="mb-3 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{loadError}</p>}
            {carteira.stale && <p role="status" className="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">A sincronizar com o servidor: os valores podem estar desatualizados.</p>}

            {/* Cabeçalho */}
            <div className="mb-4 rounded-2xl border border-primary/15 bg-primary/5 p-4 shadow-sm">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                            <h2 className="truncate text-xl font-black tracking-tight">{credit.clientName}</h2>
                            <span className={cn('inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-bold', stage.badge)}><span className={cn('h-1.5 w-1.5 rounded-full', stage.dot)} />{stage.label}</span>
                            {row.daysOverdue > 0 && <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-800 dark:bg-red-900/40 dark:text-red-200">{AGING_LABELS[row.aging]}</span>}
                        </div>
                        <p className="mt-0.5 text-sm text-muted-foreground"><span className="font-mono font-semibold text-foreground" title={credit.id}>{row.reference}</span> · {row.product} · Gestor: {row.managerName}{client?.phone ? <> · <a className="inline-flex items-center gap-1 hover:underline" href={`tel:${client.phone}`}><Phone className="h-3 w-3" />{client.phone}</a></> : null}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {actions.pay && <Button className="gap-1.5" onClick={() => setDialog('pay')}><Receipt className="h-4 w-4" /> Registar pagamento</Button>}
                        {actions.renew && (
                            <Button className="gap-1.5 bg-emerald-600 hover:bg-emerald-700" disabled={!!renewalBlocked} title={renewalBlocked || undefined}
                                onClick={() => navigate(`/creditos?novoCredito=${encodeURIComponent(credit.clientId)}&renovacao=${encodeURIComponent(credit.id)}`)}>
                                <PlusCircle className="h-4 w-4" /> Solicitar novo crédito
                            </Button>
                        )}
                        <Button variant="outline" className="gap-1.5" onClick={() => setDialog('statement')}><Send className="h-4 w-4" /> Enviar extrato</Button>
                        <Button variant="outline" className="gap-1.5" onClick={openContract}><Printer className="h-4 w-4" /> Imprimir contrato</Button>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild><Button variant="outline" className="gap-1.5"><MoreHorizontal className="h-4 w-4" /> Mais ações</Button></DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-64">
                                <DropdownMenuItem disabled={!actions.early} className="gap-2" onClick={() => setDialog('early')}><HandCoins className="h-4 w-4" /> Simular e efetuar liquidação antecipada</DropdownMenuItem>
                                <DropdownMenuItem disabled={!actions.restructure} className="gap-2" onClick={() => setDialog('restructure')}><RefreshCcw className="h-4 w-4" /> Reestruturar</DropdownMenuItem>
                                <DropdownMenuItem disabled={!actions.transfer} className="gap-2" onClick={() => setDialog('transfer')}><UserCog className="h-4 w-4" /> Transferir para outro gestor</DropdownMenuItem>
                                <DropdownMenuItem disabled={!payable} className="gap-2" onClick={() => setDialog('mora')}><AlarmClock className="h-4 w-4" /> Juros de mora</DropdownMenuItem>
                                <DropdownMenuItem disabled={!['active', 'overdue'].includes(credit.status) || !can('creditos.editar')} className="gap-2" onClick={() => setDialog('reinforce')}><Wallet className="h-4 w-4" /> Reforço de capital</DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem disabled={!actions.legal} className="gap-2 text-rose-700 focus:text-rose-700" onClick={() => setDialog('legal')}><Gavel className="h-4 w-4" /> Enviar para contencioso</DropdownMenuItem>
                                <DropdownMenuItem disabled={!actions.writeoff} className="gap-2 text-destructive focus:text-destructive" onClick={() => setDialog('writeoff')}><Ban className="h-4 w-4" /> Abater (pedir aprovação)</DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                    <Stat label="Capital concedido" value={kz(row.grantedMinor)} />
                    <Stat label="Capital em dívida" value={kz(row.outstandingMinor)} tone={row.outstandingMinor ? undefined : 'green'} />
                    <Stat label="TAN / TAEG" value={`${row.rate.toLocaleString('pt-AO')}% / ${taeg === null ? '—' : `${taeg.toLocaleString('pt-AO')}%`}`} hint="TAEG calculada pelos fluxos do plano de prestações" />
                    <Stat label="Próxima prestação" value={row.nextDueKey ? `${dateLabel(row.nextDueKey)} · ${kz(row.nextDueMinor)}` : '—'} />
                    <Stat label="Dias de atraso" value={String(row.daysOverdue)} tone={row.daysOverdue ? 'red' : 'green'} />
                    <Stat label="Mora por cobrar" value={kz(row.moraMinor)} tone={row.moraMinor ? 'red' : undefined} />
                </div>
                {(pendingRestructure || pendingWriteoff) && (
                    <div className="mt-3 space-y-2">
                        {pendingRestructure && (
                            <div className="flex flex-col gap-2 rounded-lg border border-blue-300 bg-blue-50 p-3 text-sm text-blue-900 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-100 sm:flex-row sm:items-center sm:justify-between">
                                <span><strong>Reestruturação pendente</strong> · pedida por {pendingRestructure.requestedByName} a {dateLabel(pendingRestructure.requestedAt)}: {pendingRestructure.newPlan.length} prestações. Motivo: {pendingRestructure.reason}</span>
                                {isApprover && pendingRestructure.requestedBy !== user?.id && (
                                    <span className="flex gap-2">
                                        <Button size="sm" onClick={() => setDecision({ id: pendingRestructure.id, approve: true })}>Aprovar</Button>
                                        <Button size="sm" variant="outline" onClick={() => setDecision({ id: pendingRestructure.id, approve: false })}>Rejeitar</Button>
                                    </span>
                                )}
                            </div>
                        )}
                        {pendingWriteoff && <p className="rounded-lg border border-neutral-300 bg-neutral-50 p-3 text-sm dark:border-neutral-700 dark:bg-neutral-900/50"><strong>Abate pendente de aprovação</strong> na Contabilidade · pedido por {pendingWriteoff.requestedBy}: {pendingWriteoff.reason}</p>}
                    </div>
                )}
            </div>

            <Tabs defaultValue="resumo">
                <TabsList className="mb-3 flex h-auto flex-wrap justify-start gap-1">
                    {[['resumo', 'Resumo'], ['plano', 'Plano de Prestações'], ['pagamentos', `Pagamentos (${paymentRows.length})`], ['garantias', `Garantias (${file?.warranties.length || 0})`], ['documentos', `Documentos (${file?.documents.length || 0})`],
                        ['cobranca', `Cobrança (${file?.collection.length || 0})`], ['contabilidade', `Contabilidade (${file?.entries.length || 0})`], ['historico', 'Histórico']].map(([value, label]) => (
                        <TabsTrigger key={value} value={value}>{label}</TabsTrigger>
                    ))}
                </TabsList>

                {/* 1. Resumo */}
                <TabsContent value="resumo" className="grid gap-4 lg:grid-cols-3">
                    <div className="rounded-2xl border bg-card p-4">
                        <p className="mb-2 text-sm font-bold">Dados do contrato</p>
                        <Info label="Cliente" value={credit.clientName} />
                        <Info label="NIF" value={client?.nif || '—'} />
                        <Info label="Nível de risco" value={RISK[row.riskLevel] || row.riskLevel} />
                        <Info label="Concedido em" value={dateLabel(credit.startDate)} />
                        <Info label="Mês de competência" value={row.competenceMonth.split('-').reverse().join('/')} />
                        <Info label="Fim do contrato" value={dateLabel(credit.dueDate)} />
                        <Info label="Método" value={credit.amortizationMethod === 'PRICE' ? 'Prestação constante (PRICE)' : credit.amortizationMethod === 'SAC' ? 'Amortização constante (SAC)' : 'Taxa fixa (FLAT)'} />
                        <Info label="Prestações" value={`${row.paidCount} pagas de ${row.totalCount}`} />
                        <Info label="Juros contratados" value={kz(row.contractedInterestMinor)} />
                        <Info label="Juros por receber" value={kz(row.interestOutstandingMinor)} />
                        <Info label="Taxa de mora" value={`${num(credit.lateInterestRate).toLocaleString('pt-AO')}% ao dia`} />
                        <Info label="Pedido por" value={credit.requestedBy || '—'} />
                        <Info label="Aprovado por" value={credit.approvedBy || '—'} />
                        {row.paidOffKey && <Info label="Liquidado em" value={dateLabel(row.paidOffKey)} />}
                    </div>
                    <div className="rounded-2xl border bg-card p-4 lg:col-span-2">
                        <p className="mb-2 text-sm font-bold">Capital em dívida ao longo do tempo</p>
                        <div className="h-72">
                            <ResponsiveContainer width="100%" height="100%">
                                <ComposedChart data={chart} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                                    <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                                    <YAxis tick={{ fontSize: 10 }} width={70} tickFormatter={value => Number(value).toLocaleString('pt-AO', { notation: 'compact' })} />
                                    <Tooltip formatter={(value: number) => formatCurrency(value)} />
                                    <Legend wrapperStyle={{ fontSize: 12 }} />
                                    <Area type="stepAfter" dataKey="Previsto" stroke="#94a3b8" fill="#94a3b8" fillOpacity={0.15} />
                                    <Line type="stepAfter" dataKey="Real" stroke="#f37021" strokeWidth={2} dot={{ r: 3 }} connectNulls={false} />
                                </ComposedChart>
                            </ResponsiveContainer>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">Previsto: capital por amortizar segundo o plano. Real: capital por amortizar depois dos pagamentos registados.</p>
                    </div>
                </TabsContent>

                {/* 2. Plano de prestações */}
                <TabsContent value="plano" className="space-y-3">
                    <div className="grid gap-2 sm:grid-cols-3">
                        <Stat label="Mora acumulada (hoje)" value={kz(file?.mora?.owedMinor || 0)} tone={(file?.mora?.owedMinor || 0) > 0 ? 'red' : undefined} />
                        <div className="rounded-xl border bg-background/70 p-3">
                            <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Mora prevista se o atraso continuar até</p>
                            <div className="mt-1 flex items-center gap-2">
                                <Input type="date" className="h-8 w-40" value={moraDate} min={carteira.today} onChange={event => setMoraDate(event.target.value)} />
                                <span className="font-black text-red-700 dark:text-red-400">{moraProjection ? kz(moraProjection.projectedOwedMinor) : kz(file?.mora?.owedMinor || 0)}</span>
                            </div>
                        </div>
                        <Stat label="Mora por dia (agora)" value={kz(file?.mora?.dailyMinor || 0)} />
                    </div>
                    <div className="card-elevated overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                                <tr><th className="p-3 text-left">N.º</th><th className="p-3 text-left">Vencimento</th><th className="p-3 text-right">Capital</th><th className="p-3 text-right">Juros</th>
                                    <th className="p-3 text-right" title={`Informativo: ${stampRate.toLocaleString('pt-AO')}% sobre os juros (taxa do Simulador); não está incluído no valor da prestação.`}>Imposto do Selo*</th>
                                    <th className="p-3 text-right">Prestação</th><th className="p-3 text-right">Pago</th><th className="p-3 text-left">Estado</th><th className="p-3 text-left">Pago em</th><th className="p-3 text-right">Mora</th></tr>
                            </thead>
                            <tbody>
                                {visibleInstallments.map(item => {
                                    const total = num(item.principalMinor) + num(item.interestMinor);
                                    const paid = num(item.paidPrincipalMinor) + num(item.paidInterestMinor);
                                    const due = luandaDateKey(item.dueDate);
                                    const status = paid >= total ? 'Paga' : due < carteira.today ? 'Em atraso' : paid > 0 ? 'Parcial' : 'Futura';
                                    const mora = file?.mora?.installments.find(entry => entry.id === item.id);
                                    return (
                                        <tr key={item.id} className={cn('border-t', status === 'Em atraso' && 'bg-red-50/70 dark:bg-red-950/20')}>
                                            <td className="p-3">{item.installmentNumber}</td><td className="p-3">{dateLabel(item.dueDate)}</td>
                                            <td className="p-3 text-right">{kz(num(item.principalMinor))}</td><td className="p-3 text-right">{kz(num(item.interestMinor))}</td>
                                            <td className="p-3 text-right text-muted-foreground">{kz(Math.round(num(item.interestMinor) * stampRate / 100))}</td>
                                            <td className="p-3 text-right font-semibold">{kz(total)}</td><td className="p-3 text-right">{kz(paid)}</td>
                                            <td className="p-3"><span className={cn('rounded-full px-2 py-0.5 text-[11px] font-bold', status === 'Paga' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200' : status === 'Em atraso' ? 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200' : status === 'Parcial' ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200' : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200')}>{status}{status === 'Em atraso' && paid > 0 ? ' (parcial)' : ''}</span></td>
                                            <td className="p-3">{item.paidAt ? dateLabel(item.paidAt) : '—'}</td>
                                            <td className="p-3 text-right">{mora && mora.owedMinor > 0 ? <span className="font-semibold text-red-700 dark:text-red-400" title={`${mora.daysLate} dia(s) de atraso`}>{kz(mora.owedMinor)}</span> : '—'}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                            <tfoot className="border-t-2 bg-muted/40 font-bold">
                                <tr><td className="p-3" colSpan={2}>Total</td>
                                    <td className="p-3 text-right">{kz(visibleInstallments.reduce((sum, item) => sum + num(item.principalMinor), 0))}</td>
                                    <td className="p-3 text-right">{kz(visibleInstallments.reduce((sum, item) => sum + num(item.interestMinor), 0))}</td>
                                    <td className="p-3 text-right text-muted-foreground">{kz(visibleInstallments.reduce((sum, item) => sum + Math.round(num(item.interestMinor) * stampRate / 100), 0))}</td>
                                    <td className="p-3 text-right">{kz(visibleInstallments.reduce((sum, item) => sum + num(item.principalMinor) + num(item.interestMinor), 0))}</td>
                                    <td className="p-3 text-right">{kz(visibleInstallments.reduce((sum, item) => sum + num(item.paidPrincipalMinor) + num(item.paidInterestMinor), 0))}</td>
                                    <td colSpan={2} /><td className="p-3 text-right text-red-700 dark:text-red-400">{kz(file?.mora?.owedMinor || 0)}</td></tr>
                            </tfoot>
                        </table>
                    </div>
                    <p className="text-xs text-muted-foreground">* Imposto do Selo sobre os juros, à taxa configurada no Simulador ({stampRate.toLocaleString('pt-AO')}%): valor informativo, não incluído nas prestações deste contrato. A mora usa o mesmo cálculo da página de Pagamentos ({num(credit.lateInterestRate).toLocaleString('pt-AO')}% ao dia sobre a prestação em atraso).</p>
                </TabsContent>

                {/* 3. Pagamentos */}
                <TabsContent value="pagamentos" className="space-y-2">
                    <div className="flex justify-end"><Button variant="outline" size="sm" className="gap-1.5" onClick={() => navigate(`/pagamentos?search=${encodeURIComponent(row.reference)}`)}><ExternalLink className="h-4 w-4" /> Abrir em Pagamentos</Button></div>
                    {!paymentRows.length ? <Empty>Ainda não há pagamentos neste crédito.</Empty> : (
                        <div className="card-elevated overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="bg-muted/50 text-xs uppercase text-muted-foreground"><tr><th className="p-3 text-left">Recibo</th><th className="p-3 text-left">Data-valor</th><th className="p-3 text-left">Prestações</th><th className="p-3 text-right">Capital</th><th className="p-3 text-right">Juros</th><th className="p-3 text-right">Mora</th><th className="p-3 text-right">Total</th><th className="p-3 text-left">Método</th><th className="p-3 text-left">Estado</th><th className="p-3" /></tr></thead>
                                <tbody>{paymentRows.map(payment => (
                                    <tr key={payment.id} className="border-t">
                                        <td className="p-3 font-mono text-xs">{payment.receipt}</td><td className="p-3">{payment.valueDateKey.split('-').reverse().join('/')}</td><td className="p-3 text-xs">{payment.installmentsLabel}</td>
                                        <td className="p-3 text-right">{formatCurrency(payment.principal)}</td><td className="p-3 text-right">{formatCurrency(payment.interest)}</td><td className="p-3 text-right">{formatCurrency(payment.late)}</td>
                                        <td className="p-3 text-right font-semibold">{formatCurrency(payment.total)}</td><td className="p-3 text-xs">{payment.methodLabel}</td><td className="p-3 text-xs">{payment.statusLabel}</td>
                                        <td className="p-2">{payment.status === 'confirmed' && <Button size="sm" variant="ghost" className="h-8 gap-1" onClick={() => void downloadReceipt(payment, clients, companySettings, user?.name || '', 'a4').catch((error: any) => toast({ title: 'Recibo indisponível', description: error?.message, variant: 'destructive' }))}><FileText className="h-3.5 w-3.5" /> Recibo</Button>}</td>
                                    </tr>
                                ))}</tbody>
                                <tfoot className="border-t-2 bg-muted/40 font-bold"><tr><td className="p-3" colSpan={3}>Total confirmado</td>
                                    {(['principal', 'interest', 'late', 'total'] as const).map(key => <td key={key} className="p-3 text-right">{formatCurrency(paymentRows.filter(item => item.status === 'confirmed').reduce((sum, item) => sum + item[key], 0))}</td>)}<td colSpan={3} /></tr></tfoot>
                            </table>
                        </div>
                    )}
                </TabsContent>

                {/* 4. Garantias */}
                <TabsContent value="garantias" className="space-y-2">
                    <div className="flex justify-end"><Button variant="outline" size="sm" className="gap-1.5" onClick={() => navigate('/garantias')}><ShieldCheck className="h-4 w-4" /> Abrir módulo de Garantias</Button></div>
                    {!file?.warranties.length ? <Empty>Nenhuma garantia associada a este crédito. Registe-a no módulo de Garantias escolhendo este crédito.</Empty> : (
                        <div className="grid gap-2 md:grid-cols-2">
                            {file.warranties.map((item: any) => (
                                <div key={item.id} className="rounded-xl border bg-card p-3">
                                    <p className="font-semibold">{item.type} · {item.description}</p>
                                    <p className="text-sm text-muted-foreground">Valor de mercado: {formatCurrency(num(item.marketValue))} · Estado: {item.status === 'active' ? 'Ativa' : item.status === 'released' ? 'Libertada' : 'Executada'}</p>
                                    {item.location && <p className="text-xs text-muted-foreground">Local: {item.location}</p>}
                                </div>
                            ))}
                        </div>
                    )}
                    {file?.warranties.length ? <p className="text-xs text-muted-foreground">Cobertura: {formatCurrency(file.warranties.filter((item: any) => item.status === 'active').reduce((sum: number, item: any) => sum + num(item.marketValue), 0))} em garantias ativas para {kz(row.outstandingMinor)} de capital em dívida.</p> : null}
                </TabsContent>

                {/* 5. Documentos */}
                <TabsContent value="documentos">
                    <Documentos creditId={credit.id} documents={file?.documents || []} clientDocuments={client?.documents || []} actor={actor} onChanged={reload} onPreview={setPreview} />
                </TabsContent>

                {/* 6. Cobrança */}
                <TabsContent value="cobranca">
                    <Cobranca creditId={credit.id} events={file?.collection || []} actor={actor} onChanged={reload} phone={client?.phone} onOpenHub={() => navigate('/hub-whatsapp')} />
                </TabsContent>

                {/* 7. Contabilidade */}
                <TabsContent value="contabilidade" className="space-y-2">
                    <div className="flex justify-end"><Button variant="outline" size="sm" className="gap-1.5" onClick={() => navigate('/contabilidade')}><Scale className="h-4 w-4" /> Abrir a Contabilidade</Button></div>
                    {!file?.entries.length ? <Empty>Sem lançamentos para este crédito (os pedidos ainda não desembolsados não geram lançamentos).</Empty> : (
                        <div className="card-elevated overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="bg-muted/50 text-xs uppercase text-muted-foreground"><tr><th className="p-3 text-left">Data</th><th className="p-3 text-left">Tipo</th><th className="p-3 text-left">Descrição</th><th className="p-3 text-right">Capital</th><th className="p-3 text-right">Juros</th><th className="p-3 text-right">Mora</th><th className="p-3 text-right">Total</th><th className="p-3 text-left">Operador</th></tr></thead>
                                <tbody>{file.entries.map((entry: any) => (
                                    <tr key={entry.id} className="border-t">
                                        <td className="p-3">{dateLabel(entry.timestamp)}</td><td className="p-3 text-xs font-semibold">{ENTRY_TYPES[entry.type] || entry.type}</td><td className="p-3 text-xs">{entry.description}</td>
                                        <td className="p-3 text-right">{kz(num(entry.amountPrincipalMinor ?? Math.round(num(entry.amountPrincipal) * 100)))}</td>
                                        <td className="p-3 text-right">{kz(num(entry.amountInterestMinor ?? Math.round(num(entry.amountInterest) * 100)))}</td>
                                        <td className="p-3 text-right">{kz(num(entry.amountLateInterestMinor ?? Math.round(num(entry.amountLateInterest) * 100)))}</td>
                                        <td className="p-3 text-right font-semibold">{kz(num(entry.amountTotalMinor ?? Math.round(num(entry.amountTotal) * 100)))}</td><td className="p-3 text-xs">{entry.processedBy}</td>
                                    </tr>
                                ))}</tbody>
                            </table>
                        </div>
                    )}
                </TabsContent>

                {/* 8. Histórico */}
                <TabsContent value="historico" className="space-y-4">
                    {!!file?.restructurings.length && (
                        <div className="rounded-2xl border bg-card p-4">
                            <p className="mb-2 flex items-center gap-1.5 text-sm font-bold"><RefreshCcw className="h-4 w-4" /> Reestruturações e liquidações antecipadas</p>
                            {file.restructurings.map((item: Restructuring) => (
                                <details key={item.id} className="border-t py-2 text-sm first:border-0">
                                    <summary className="cursor-pointer">{dateLabel(item.requestedAt)} · {item.kind === 'restructure' ? 'Reestruturação' : 'Liquidação antecipada'} · {item.status === 'pending' ? 'Pendente' : item.status === 'approved' ? 'Aprovada' : 'Rejeitada'} · {item.requestedByName}{item.decidedByName ? ` → ${item.decidedByName}` : ''}</summary>
                                    <p className="mt-1 text-xs text-muted-foreground">Motivo: {item.reason}{item.decisionReason ? ` · Decisão: ${item.decisionReason}` : ''}</p>
                                    <p className="text-xs text-muted-foreground">Plano original: {item.originalPlan.filter(entry => num(entry.principalMinor) + num(entry.interestMinor) > 0).length} prestações · Novo plano: {item.newPlan.length} prestações ({kz(item.newPlan.reduce((sum, entry) => sum + entry.totalMinor, 0))})</p>
                                </details>
                            ))}
                        </div>
                    )}
                    {!!file?.transfers.length && (
                        <div className="rounded-2xl border bg-card p-4">
                            <p className="mb-2 flex items-center gap-1.5 text-sm font-bold"><UserCog className="h-4 w-4" /> Transferências de gestor</p>
                            {file.transfers.map((item: any) => <p key={item.id} className="border-t py-1.5 text-sm first:border-0">{dateLabel(item.createdAt)} · para {item.toUserName} · por {item.actorName} — {item.reason}</p>)}
                        </div>
                    )}
                    <div className="rounded-2xl border bg-card p-4">
                        <p className="mb-2 flex items-center gap-1.5 text-sm font-bold"><History className="h-4 w-4" /> Auditoria do crédito ({file?.audit.length || 0})</p>
                        {!file?.audit.length ? <Empty>Sem registos de auditoria.</Empty> : (
                            <ol className="space-y-0">
                                {file.audit.map((entry: any) => (
                                    <li key={entry.id} className="flex gap-3 border-t py-2 text-sm first:border-0">
                                        <span className="w-36 shrink-0 text-xs text-muted-foreground">{new Date(entry.timestamp).toLocaleString('pt-AO')}</span>
                                        <span className="min-w-0"><strong>{entry.userName || 'Sistema'}</strong> · {entry.details}</span>
                                    </li>
                                ))}
                            </ol>
                        )}
                    </div>
                </TabsContent>
            </Tabs>

            {/* Diálogos */}
            {dialog === 'pay' && <RegistarPagamentoCredito creditId={credit.id} onClose={() => setDialog(null)} onDone={() => void refreshAll()} />}
            {dialog === 'early' && <LiquidacaoAntecipadaDialog open credit={credit} row={row} installments={installments} actor={actor} onClose={() => setDialog(null)}
                onSettled={payNow => { toast({ title: 'Plano atualizado', description: `Registe agora o pagamento de ${kz(payNow)}.` }); void refreshAll().then(() => setDialog('pay')); }} />}
            {dialog === 'restructure' && <ReestruturacaoDialog open credit={credit} row={row} installments={installments} actor={actor} onClose={() => setDialog(null)}
                onRequested={() => { toast({ title: 'Reestruturação pedida', description: 'Fica pendente até ser aprovada.' }); void reload(); }} />}
            {dialog === 'legal' && <ContenciosoDialog open credit={credit} row={row} actor={actor} onClose={() => setDialog(null)} onDone={() => { toast({ title: 'Enviado para contencioso' }); void refreshAll(); }} />}
            {dialog === 'writeoff' && <AbateDialog open credit={credit} row={row} actor={actor} onClose={() => setDialog(null)} onDone={() => { toast({ title: 'Pedido de abate enviado', description: 'Aguarda aprovação na Contabilidade.' }); void reload(); }} />}
            {dialog === 'transfer' && <TransferirGestorDialog open row={row} users={carteira.users} actor={actor} onClose={() => setDialog(null)} onDone={() => { toast({ title: 'Crédito transferido' }); void refreshAll(); }} />}
            {dialog === 'statement' && <ExtratoDialog open row={row} rows={carteira.rows} installments={carteira.context?.installments || []} payments={carteira.payments} client={client} settings={companySettings} actor={actor} onClose={() => setDialog(null)} />}
            <JurosMoraDialog credit={dialog === 'mora' ? credit : null} open={dialog === 'mora'} onOpenChange={open => { if (!open) { setDialog(null); void refreshAll(); } }} />
            <ReinforcementModal isOpen={dialog === 'reinforce'} onClose={() => { setDialog(null); void refreshAll(); }} credit={dialog === 'reinforce' ? credit : null} />
            <DecisaoReestruturacao open={!!decision} requestId={decision?.id || null} approve={!!decision?.approve} actor={actor} onClose={() => setDecision(null)}
                onDecided={() => { toast({ title: decision?.approve ? 'Reestruturação aprovada' : 'Reestruturação rejeitada' }); void refreshAll(); }} />

            <Dialog open={!!contractUrl || !!preview} onOpenChange={open => { if (!open) { setContractUrl(null); setPreview(null); } }}>
                <DialogContent className="flex h-[92vh] w-full max-w-[94vw] flex-col gap-0 overflow-hidden p-0">
                    <DialogHeader className="flex flex-row items-center justify-between gap-3 border-b px-5 py-3 pr-14">
                        <div><DialogTitle>{contractUrl ? `Contrato · ${row.reference}` : preview?.name}</DialogTitle><DialogDescription>Pré-visualização. Pode descarregar ou imprimir.</DialogDescription></div>
                        <Button className="gap-1.5" onClick={() => { const link = document.createElement('a'); link.href = contractUrl || preview?.url || ''; link.download = contractUrl ? `Contrato-${row.reference}.pdf` : (preview?.name || 'documento'); link.click(); }}><FileText className="h-4 w-4" /> Descarregar</Button>
                    </DialogHeader>
                    <div className="relative min-h-0 flex-1 overflow-auto bg-slate-200/70 p-4">
                        {contractUrl ? <PdfCanvasViewer source={contractUrl} /> : preview?.mime === 'application/pdf' ? <PdfCanvasViewer source={preview.url} /> : preview ? <img src={preview.url} alt={preview.name} className="mx-auto max-h-full rounded shadow" /> : null}
                    </div>
                </DialogContent>
            </Dialog>
        </MainLayout>
    );
}

function Documentos({ creditId, documents, clientDocuments, actor, onChanged, onPreview }: {
    creditId: string; documents: Array<{ id: string; kind: string; fileName: string; mimeType: string; dataUrl: string; uploadedAt: string; uploadedByName: string | null }>;
    clientDocuments: Array<{ id: string; title: string; type: string; data: string }>; actor: { id: string; name: string; role: string } | null;
    onChanged: () => void; onPreview: (preview: { url: string; name: string; mime: string }) => void;
}) {
    const [kind, setKind] = useState('contrato');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const upload = async (selected: File | undefined) => {
        if (!selected || !actor) return;
        setBusy(true); setError('');
        try {
            const dataUrl = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error('Não foi possível ler o ficheiro.')); reader.readAsDataURL(selected); });
            await ServicoCarteira.addDocument({ creditId, kind, fileName: selected.name, mimeType: selected.type, dataUrl }, actor);
            onChanged();
        } catch (cause: any) { setError(cause?.message || 'Não foi possível carregar o documento.'); } finally { setBusy(false); }
    };
    const archive = async (id: string) => {
        if (!actor || !window.confirm('Arquivar este documento? Continua no histórico de auditoria.')) return;
        try { await ServicoCarteira.archiveDocument(id, creditId, actor); onChanged(); } catch (cause: any) { setError(cause?.message || 'Não foi possível arquivar.'); }
    };
    return (
        <div className="space-y-3">
            <div className="flex flex-wrap items-end gap-2 rounded-xl border bg-muted/20 p-3">
                <div className="w-48"><p className="mb-1 text-xs font-semibold">Tipo</p>
                    <Select value={kind} onValueChange={setKind}><SelectTrigger className="h-9"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(DOC_KINDS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select>
                </div>
                <label className={cn('inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground', (busy || !actor) && 'pointer-events-none opacity-60')}>
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />} Carregar (PDF, PNG ou JPG, até 2 MB)
                    <input type="file" accept="application/pdf,image/png,image/jpeg,image/webp" className="hidden" onChange={event => { void upload(event.target.files?.[0]); event.target.value = ''; }} />
                </label>
            </div>
            {error && <p className="rounded-md bg-destructive/10 p-2 text-sm text-destructive">{error}</p>}
            {!documents.length && !clientDocuments.length ? <Empty>Sem documentos. Carregue o contrato assinado, a livrança, o BI e os comprovativos.</Empty> : (
                <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                    {documents.map(item => (
                        <div key={item.id} className="flex items-center justify-between gap-2 rounded-xl border bg-card p-3">
                            <button type="button" className="min-w-0 text-left" onClick={() => onPreview({ url: item.dataUrl, name: item.fileName, mime: item.mimeType })}>
                                <p className="truncate text-sm font-semibold hover:underline">{item.fileName}</p>
                                <p className="text-xs text-muted-foreground">{DOC_KINDS[item.kind] || item.kind} · {dateLabel(item.uploadedAt)} · {item.uploadedByName || '—'}</p>
                            </button>
                            <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0 text-destructive" aria-label={`Arquivar ${item.fileName}`} onClick={() => void archive(item.id)}><Trash2 className="h-4 w-4" /></Button>
                        </div>
                    ))}
                    {clientDocuments.map(item => (
                        <button key={item.id} type="button" onClick={() => onPreview({ url: item.data, name: item.title, mime: item.type === 'pdf' ? 'application/pdf' : 'image/png' })} className="rounded-xl border border-dashed bg-card p-3 text-left">
                            <p className="truncate text-sm font-semibold hover:underline">{item.title}</p>
                            <p className="text-xs text-muted-foreground">Documento do cliente (ficha do cliente)</p>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

function Cobranca({ creditId, events, actor, onChanged, phone, onOpenHub }: {
    creditId: string; events: any[]; actor: { id: string; name: string; role: string } | null; onChanged: () => void; phone?: string; onOpenHub: () => void;
}) {
    const [kind, setKind] = useState<'contact' | 'promise'>('contact');
    const [notes, setNotes] = useState('');
    const [promisedDate, setPromisedDate] = useState('');
    const [amount, setAmount] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const record = async (input: Parameters<typeof ServicoCobrancaOperacional.record>[0]) => {
        if (!actor) return;
        setBusy(true); setError('');
        try { await ServicoCobrancaOperacional.record(input, actor); setNotes(''); setAmount(''); setPromisedDate(''); onChanged(); }
        catch (cause: any) { setError(cause?.message || 'Não foi possível registar.'); } finally { setBusy(false); }
    };
    const decided = new Set(events.filter(event => ['promise_kept', 'promise_broken'].includes(event.kind)).map(event => event.relatedId));
    return (
        <div className="grid gap-4 lg:grid-cols-3">
            <div className="space-y-2 rounded-2xl border bg-card p-4">
                <p className="text-sm font-bold">Registar contacto ou promessa</p>
                <Select value={kind} onValueChange={value => setKind(value as any)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="contact">Contacto realizado</SelectItem><SelectItem value="promise">Promessa de pagamento</SelectItem></SelectContent></Select>
                {kind === 'promise' && <div className="grid grid-cols-2 gap-2"><Input type="date" value={promisedDate} onChange={event => setPromisedDate(event.target.value)} aria-label="Data prometida" /><Input type="number" min={0} value={amount} onChange={event => setAmount(event.target.value)} placeholder="Valor (Kz)" /></div>}
                <Textarea rows={3} value={notes} onChange={event => setNotes(event.target.value)} placeholder="Ex.: liguei ao cliente; promete pagar na sexta-feira depois do salário." />
                {error && <p className="text-sm text-destructive">{error}</p>}
                <Button className="w-full" disabled={busy || !actor || notes.trim().length < 5} onClick={() => void record({ creditId, kind, notes, promisedDate: kind === 'promise' ? promisedDate : undefined, amount: kind === 'promise' ? Number(amount) : undefined })}>{busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}Registar</Button>
                <div className="flex gap-2">
                    {phone && <Button asChild variant="outline" size="sm" className="flex-1 gap-1"><a href={`tel:${phone}`}><Phone className="h-3.5 w-3.5" /> Ligar</a></Button>}
                    <Button variant="outline" size="sm" className="flex-1 gap-1" onClick={onOpenHub}><CalendarClock className="h-3.5 w-3.5" /> Hub de Cobrança</Button>
                </div>
            </div>
            <div className="rounded-2xl border bg-card p-4 lg:col-span-2">
                <p className="mb-2 text-sm font-bold">Histórico de cobrança</p>
                {!events.length ? <Empty>Sem contactos nem promessas registados.</Empty> : events.map(event => (
                    <div key={event.id} className="flex flex-col gap-1 border-t py-2 text-sm first:border-0 sm:flex-row sm:items-center sm:justify-between">
                        <span><strong>{COLLECTION_KINDS[event.kind] || event.kind}</strong> · {new Date(event.createdAt).toLocaleString('pt-AO')} · {event.actorName}
                            {event.promisedDate && <> · para {String(event.promisedDate).split('-').reverse().join('/')}</>}{event.amountMinor ? <> · {kz(num(event.amountMinor))}</> : null}
                            <span className="block text-xs text-muted-foreground">{event.notes}</span></span>
                        {event.kind === 'promise' && !decided.has(event.id) && actor && (
                            <span className="flex shrink-0 gap-1.5">
                                <Button size="sm" variant="outline" className="h-7 gap-1" disabled={busy} onClick={() => void record({ creditId, kind: 'promise_kept', relatedId: event.id, notes: 'Promessa cumprida' })}><CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> Cumprida</Button>
                                <Button size="sm" variant="outline" className="h-7 gap-1" disabled={busy} onClick={() => void record({ creditId, kind: 'promise_broken', relatedId: event.id, notes: 'Promessa falhada' })}><Ban className="h-3.5 w-3.5 text-red-600" /> Falhada</Button>
                            </span>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
