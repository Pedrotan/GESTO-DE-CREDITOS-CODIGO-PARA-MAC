// Página de Créditos: o centro de gestão da carteira. Três vistas (Carteira, Produção do Período e Visão Anual),
// cards interativos, separadores por estado, tabela com filtros e ações em massa, alertas, importação, relatórios
// e o assistente de novo crédito. Todos os valores vêm de `useCarteira` (biblioteca carteira-credito), que lê da
// base os mesmos dados de Pagamentos e Contabilidade. As operações sobre um crédito estão na ficha (/creditos/:id).
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertCircle, ArrowDownUp, Calendar, Download, Eye, FileClock, FileText, History, ListOrdered, Lock, MoreVertical, Plus, PlusCircle,
  Receipt, Trash2, Upload,
} from 'lucide-react';
import { MainLayout } from '@/componentes/layout/MainLayout';
import { InvestigacaoAuditoria } from '@/componentes/auditoria/InvestigacaoAuditoria';
import type { InvestigationTarget } from '@/componentes/auditoria/DetalheAuditoria';
import { useAuth } from '@/contextos/ContextoAutenticacao';
import { useData } from '@/contextos/ContextoDados';
import { formatCurrency } from '@/bibliotecas/formatters';
import { luandaDateKey } from '@/bibliotecas/fuso-angola';
import { clientCreditStanding, newCreditBlockReason } from '@/bibliotecas/regras-credito';
import { buildPaymentRows, sumRows } from '@/bibliotecas/pagamentos-analise';
import { monthClosureState, monthIdOf, monthLabel } from '@/bibliotecas/fecho-mes';
import { getScopedLocalStorageItem } from '@/bibliotecas/contas';
import { generateExcelTemplate } from '@/bibliotecas/ExcelHelper';
import { generateMonthlyConsolidationReport } from '@/bibliotecas/pdf';
import type { PortfolioRow } from '@/bibliotecas/carteira-credito';
import { Badge } from '@/componentes/ui/badge';
import { Button } from '@/componentes/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/componentes/ui/dropdown-menu';
import { AlertModal, type AlertModalType } from '@/componentes/ui/AlertModal';
import { useToast } from '@/componentes/ui/use-toast';
import { JustificationModal } from '@/componentes/modals/JustificationModal';
import { DailyCashFlowModal } from '@/componentes/modals/DailyCashFlowModal';
import { CalendarTasksModal } from '@/componentes/modals/CalendarTasksModal';
import { useCarteira } from '@/componentes/creditos/useCarteira';
import { CabecalhoCarteira } from '@/componentes/creditos/CabecalhoCarteira';
import { CartoesCarteira, type CardDetail } from '@/componentes/creditos/CartoesCarteira';
import { TabelaCarteira } from '@/componentes/creditos/TabelaCarteira';
import { VisaoAnualCreditos } from '@/componentes/creditos/VisaoAnualCreditos';
import { AlertasCarteira } from '@/componentes/creditos/AlertasCarteira';
import { ImportacaoCreditos } from '@/componentes/creditos/ImportacaoCreditos';
import { RelatoriosCreditos } from '@/componentes/creditos/RelatoriosCreditos';
import { PlanoPagamentoDialog } from '@/componentes/creditos/PlanoPagamentoDialog';
import { DetalheCartoes } from '@/componentes/creditos/DetalheCartoes';
import { RegistarPagamentoCredito } from '@/componentes/creditos/RegistarPagamentoCredito';
import { AssistenteNovoCredito, type Renewal } from '@/componentes/creditos/AssistenteNovoCredito';

export default function Credits() {
  const { user } = useAuth();
  const { clients, addCredit, deleteCredit, companySettings, closedMonths, calendarTasks, addCalendarTask, deleteCalendarTask, dataLoadIssues } = useData();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();

  const carteira = useCarteira({ search: searchParams.get('search') || '' });
  const actor = user ? { id: user.id, name: user.name, role: user.role, permissions: user.permissions } : null;

  const [importOpen, setImportOpen] = useState(false);
  const [reportsOpen, setReportsOpen] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const [detail, setDetail] = useState<CardDetail | null>(null);
  const [wizard, setWizard] = useState<{ open: boolean; renewal: Renewal | null }>({ open: false, renewal: null });
  const [payCreditId, setPayCreditId] = useState<string | null>(null);
  const [auditTarget, setAuditTarget] = useState<InvestigationTarget | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PortfolioRow | null>(null);
  const [isTaskCalendarOpen, setIsTaskCalendarOpen] = useState(false);
  const [isDailyCashFlowOpen, setIsDailyCashFlowOpen] = useState(false);
  const [alertConfig, setAlertConfig] = useState<{ isOpen: boolean; title: string; description: string; type: AlertModalType }>({ isOpen: false, title: '', description: '', type: 'success' });

  const taskMonths = useMemo(() => new Set((calendarTasks || []).map(task => String(task.date).slice(0, 7))), [calendarTasks]);
  const openCreditFile = (row: PortfolioRow) => navigate(`/creditos/${encodeURIComponent(row.id)}`);

  // Anos disponíveis no seletor (desde o primeiro crédito).
  const availableYears = useMemo(() => {
    const currentYear = Number(carteira.today.slice(0, 4));
    const years = carteira.rows.map(row => Number(row.competenceMonth.slice(0, 4))).filter(Boolean);
    const minYear = Math.min(currentYear, ...years);
    const maxYear = Math.max(currentYear, ...years);
    return Array.from({ length: maxYear - minYear + 1 }, (_, index) => minYear + index);
  }, [carteira.rows, carteira.today]);

  // Saídas vs Entradas de hoje: desembolsos do razão e pagamentos confirmados (data-valor), em hora de Angola.
  const todayCashFlow = useMemo(() => {
    const today = carteira.today;
    const out = carteira.entries.filter(entry => entry.type === 'disbursement' && luandaDateKey(entry.timestamp) === today);
    const received = buildPaymentRows({ payments: carteira.payments.filter(payment => !payment.deletedAt), credits: carteira.credits, clients, users: [] })
      .filter(row => row.status === 'confirmed' && row.valueDateKey === today);
    return {
      totalOut: out.reduce((sum, entry) => sum + (entry.amountTotalMinor ?? Math.round(Number(entry.amountTotal) * 100)), 0) / 100,
      totalIn: sumRows(received).total, outCount: out.length, inCount: received.length,
    };
  }, [carteira.entries, carteira.payments, carteira.credits, carteira.today, clients]);

  // Fecho do mês (feito na Contabilidade): com um mês anterior por fechar não se emitem novos créditos.
  const monthId = carteira.monthKey;
  const closedMonthData = closedMonths.find(m => m.id === monthId);
  const isMonthClosed = !!closedMonthData;
  const pendingClosure = useMemo(() => {
    const state = monthClosureState(new Date(), closedMonths.map(m => m.id), getScopedLocalStorageItem('month_close_enforced_since') || monthIdOf(new Date()));
    return state.kind === 'overdue' ? state : null;
  }, [closedMonths]);
  const isAdmin = user?.role === 'super_admin' || user?.role === 'admin';

  // Atalhos por endereço: ?fecharMes=AAAA-MM (lembrete) abre o fecho na Contabilidade; ?novoCredito=<cliente> abre o assistente.
  useEffect(() => {
    const close = searchParams.get('fecharMes');
    const clientId = searchParams.get('novoCredito');
    if (!close && !clientId) return;
    // O valor mínimo do novo crédito depende dos créditos do cliente: espera que a carteira esteja carregada.
    if (clientId && carteira.loading) return;
    const next = new URLSearchParams(searchParams);
    next.delete('fecharMes'); next.delete('novoCredito'); next.delete('renovacao');
    setSearchParams(next, { replace: true });
    if (close) { navigate(`/contabilidade?secao=fecho&mes=${encodeURIComponent(close)}`); return; }
    if (clientId) {
      const standing = clientCreditStanding(clientId, carteira.credits);
      openWizard(standing.hasCredits ? { clientId, minAmount: standing.lastPaidPrincipal, previousId: searchParams.get('renovacao') || undefined } : null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, carteira.loading]);

  const openWizard = (renewal: Renewal | null) => {
    if (pendingClosure) {
      toast({
        title: 'Fecho do mês pendente',
        description: isAdmin ? `Faça primeiro o fecho de ${monthLabel(pendingClosure.monthId)} na Contabilidade para registar novos créditos.` : `O fecho de ${monthLabel(pendingClosure.monthId)} ainda não foi feito. Peça ao administrador para o fazer.`,
        variant: 'destructive',
      });
      if (isAdmin) navigate(`/contabilidade?secao=fecho&mes=${encodeURIComponent(pendingClosure.monthId)}`);
      return;
    }
    setWizard({ open: true, renewal });
  };

  const handleDownloadTemplate = () => {
    generateExcelTemplate(['NIF Cliente', 'Montante', 'Data Início (AAAA-MM-DD)', 'Prazo (Meses)', 'Taxa Juro (%)'], 'Modelo_Importacao_Creditos');
    setAlertConfig({ isOpen: true, title: 'Modelo descarregado', description: 'O modelo Excel foi guardado no seu computador.', type: 'success' });
  };

  const handleConfirmDelete = async (justification: string) => {
    if (!deleteTarget) return;
    try {
      await deleteCredit(deleteTarget.id, user ? { id: user.id, name: user.name } : undefined, justification);
      setAlertConfig({ isOpen: true, title: 'Crédito excluído', description: 'O crédito foi enviado para a Lixeira e a exclusão ficou na auditoria.', type: 'success' });
    } catch (error: any) {
      setAlertConfig({ isOpen: true, title: 'Não é possível excluir', description: error?.message || 'Este crédito possui saldo devedor pendente.', type: 'warning' });
    } finally { setDeleteTarget(null); }
  };

  // Menu de ações da linha: o essencial; as restantes operações estão na ficha do crédito.
  const renderRowActions = (row: PortfolioRow) => {
    const credit = row.credit;
    const payable = ['active', 'overdue', 'defaulted', 'renegotiated'].includes(credit.status) && row.stage !== 'abatido' && row.outstandingMinor + row.interestOutstandingMinor + row.moraMinor > 0;
    const renewalBlocked = row.stage === 'liquidado' ? newCreditBlockReason(clientCreditStanding(credit.clientId, carteira.credits), value => formatCurrency(value)) : null;
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Ações de ${row.reference}`}><MoreVertical className="h-4 w-4" /></Button></DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuItem className="gap-2" onClick={() => openCreditFile(row)}><Eye className="h-4 w-4" /> Abrir ficha do crédito</DropdownMenuItem>
          <DropdownMenuItem className="gap-2" disabled={!payable} onClick={() => setPayCreditId(credit.id)}><Receipt className="h-4 w-4" /> Registar pagamento</DropdownMenuItem>
          {row.stage === 'liquidado' && (
            <DropdownMenuItem className="flex-col items-start gap-0.5" disabled={!!renewalBlocked} title={renewalBlocked || undefined}
              onClick={() => openWizard({ clientId: credit.clientId, minAmount: clientCreditStanding(credit.clientId, carteira.credits).lastPaidPrincipal || row.grantedMinor / 100, previousId: credit.id })}>
              <span className="flex items-center gap-2 font-semibold text-emerald-700 dark:text-emerald-400"><PlusCircle className="h-4 w-4" /> Solicitar novo crédito</span>
              {renewalBlocked && <span className="max-w-[220px] pl-6 text-[11px] leading-snug text-muted-foreground">{renewalBlocked}</span>}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem className="gap-2" onClick={() => navigate(`/pagamentos?search=${encodeURIComponent(row.reference)}`)}><History className="h-4 w-4" /> Ver pagamentos</DropdownMenuItem>
          <DropdownMenuItem className="gap-2" onClick={() => setAuditTarget({ mode: 'entity', key: credit.id, label: `Crédito ${row.reference} de ${credit.clientName}` })}><FileClock className="h-4 w-4" /> Histórico de auditoria</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="gap-2 text-destructive focus:text-destructive" onClick={() => setDeleteTarget(row)}><Trash2 className="h-4 w-4" /> Excluir</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  const cashFlowCard = (
    <div onClick={() => setIsDailyCashFlowOpen(true)} className="card-kpi-flow group cursor-pointer hover:scale-[1.02] active:scale-[0.99]">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-black/10 text-slate-950 transition-transform group-hover:scale-105 dark:bg-white/10 dark:text-white"><ArrowDownUp className="h-5 w-5" /></div>
          <div>
            <p className="flex items-center gap-1 truncate text-[11px] font-bold uppercase tracking-wider text-slate-900/70 dark:text-slate-300"><span className="inline-block h-2 w-2 animate-pulse rounded-full bg-emerald-500" /> Hoje no Calendário</p>
            <p className="truncate text-sm font-bold tracking-tight text-slate-950 dark:text-white sm:text-base">Saídas vs Entradas</p>
          </div>
        </div>
        <button type="button" onClick={event => { event.stopPropagation(); setIsDailyCashFlowOpen(true); }} title="Abrir opções do dia (Saídas vs Entradas)"
          className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full bg-black/10 text-slate-950 shadow-2xs transition-all hover:scale-110 hover:bg-black/20 active:scale-90 dark:bg-white/10 dark:text-white dark:hover:bg-white/20"><Eye className="h-3.5 w-3.5" /></button>
      </div>
      <div className="my-2">
        <div className="flex items-baseline gap-2"><span className="text-[11px] font-bold text-rose-600 dark:text-rose-400">Saiu:</span><p className="truncate font-display text-2xl font-black tracking-tight text-rose-600 dark:text-rose-400 sm:text-3xl">{formatCurrency(todayCashFlow.totalOut)}</p></div>
        <div className="mt-0.5 flex items-baseline gap-2"><span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">Entrou:</span><span className="truncate text-xs font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(todayCashFlow.totalIn)}</span></div>
      </div>
      <p className="truncate text-xs font-semibold text-slate-900/75 dark:text-slate-400">{todayCashFlow.outCount} saídas / {todayCashFlow.inCount} entradas hoje</p>
    </div>
  );

  return (
    <MainLayout title="Créditos" subtitle="Gestão da carteira de crédito">
      {/* Dados que não foi possível carregar: o resto continua disponível. */}
      {dataLoadIssues.length > 0 && (
        <div role="alert" className="mb-4 flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Não foi possível carregar: <strong>{dataLoadIssues.join(', ')}</strong>. A carteira é lida diretamente da base e continua disponível. Atualize a página; se continuar, contacte o suporte.</span>
        </div>
      )}
      {carteira.contextError && <p className="mb-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{carteira.contextError}</p>}

      <CabecalhoCarteira state={carteira} years={availableYears} closedMonths={closedMonths.map(m => m.id)} taskMonths={taskMonths} onOpenTasks={() => setIsTaskCalendarOpen(true)} />

      <AlertasCarteira alerts={carteira.alerts} phoneOf={clientId => clients.find(c => c.id === clientId)?.phone || ''} onPay={row => setPayCreditId(row.id)} onOpen={openCreditFile} actor={actor} />

      {/* Barra: Importação, Exportar/Relatórios e Novo Crédito. Taxas de juro em Configurações; fecho do mês na Contabilidade. */}
      <div className="mb-4 flex flex-wrap items-center justify-end gap-2">
        {carteira.view === 'producao' && isMonthClosed && (
          <>
            <Badge variant="success" className="gap-1.5 border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-600"><Lock className="h-3.5 w-3.5" /> Mês fechado</Badge>
            <Button variant="outline" className="gap-2" onClick={() => closedMonthData && generateMonthlyConsolidationReport(closedMonthData, carteira.credits, companySettings, user?.name)}><FileText className="h-4 w-4" /> Relatório de fecho (PDF)</Button>
          </>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button variant="outline" className="gap-2"><Upload className="h-4 w-4" /> Importação</Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem className="gap-2" onClick={handleDownloadTemplate}><Download className="h-4 w-4" /> Descarregar modelo</DropdownMenuItem>
            <DropdownMenuItem className="gap-2" onClick={() => setImportOpen(true)}><Upload className="h-4 w-4" /> Importar créditos (com pré-visualização)</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button variant="outline" className="gap-2"><FileText className="h-4 w-4" /> Exportar / Relatórios</Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem className="gap-2" onClick={() => setReportsOpen(true)}><FileText className="h-4 w-4" /> Relatórios da carteira (PDF e Excel)</DropdownMenuItem>
            <DropdownMenuItem className="gap-2" onClick={() => carteira.setView('anual')}><Calendar className="h-4 w-4" /> Visão anual (com exportação)</DropdownMenuItem>
            <DropdownMenuItem className="gap-2" onClick={() => setPlanOpen(true)}><ListOrdered className="h-4 w-4" /> Plano de pagamento</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button className="gap-2" onClick={() => openWizard(null)}><Plus className="h-4 w-4" /> Novo Crédito</Button>
      </div>

      {carteira.view === 'anual' ? (
        <VisaoAnualCreditos state={carteira} settings={companySettings} actor={actor} />
      ) : (
        <>
          <CartoesCarteira state={carteira} onDetails={setDetail} cashFlowCard={cashFlowCard} />
          <TabelaCarteira state={carteira} onOpen={openCreditFile} clientsById={new Map(clients.map(c => [c.id, { phone: c.phone }]))} currentUser={actor} renderActions={renderRowActions} />
        </>
      )}

      <AssistenteNovoCredito open={wizard.open} renewal={wizard.renewal} rows={carteira.rows} credits={carteira.credits} onClose={() => setWizard({ open: false, renewal: null })}
        onCreated={({ credit, pending }) => {
          setWizard({ open: false, renewal: null });
          void carteira.reloadContext();
          setAlertConfig(pending
            ? { isOpen: true, title: 'Pedido enviado para aprovação', description: credit.escalationReason ? `${credit.escalationReason}. O pedido ficou na fila de Aprovações e os aprovadores desse nível foram notificados.` : 'O pedido ficou pendente na fila de Aprovações.', type: 'warning' }
            : { isOpen: true, title: 'Crédito aprovado e desembolsado', description: `Dentro da sua alçada: o contrato foi gerado e o desembolso de ${formatCurrency(credit.principalAmount)} foi lançado na Contabilidade.`, type: 'success' });
          navigate(`/creditos/${encodeURIComponent(credit.id)}`);
        }} />
      <RegistarPagamentoCredito creditId={payCreditId} onClose={() => setPayCreditId(null)} onDone={() => void carteira.reloadContext()} />
      <DetalheCartoes state={carteira} type={detail} onClose={() => setDetail(null)} onOpen={row => { setDetail(null); openCreditFile(row); }} clients={clients} />
      <ImportacaoCreditos open={importOpen} onClose={() => setImportOpen(false)} clients={clients} credits={carteira.credits} actor={actor} addCredit={addCredit}
        onImported={message => { void carteira.reloadContext(); setAlertConfig({ isOpen: true, title: 'Importação de créditos', description: message, type: 'success' }); }} />
      <RelatoriosCreditos state={carteira} open={reportsOpen} onClose={() => setReportsOpen(false)} actor={actor} />
      <PlanoPagamentoDialog open={planOpen} onOpenChange={setPlanOpen} />

      <JustificationModal isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={handleConfirmDelete} title="Excluir crédito"
        description="O crédito vai para a Lixeira (exclusão lógica) e a justificação fica na auditoria. Créditos com saldo em dívida não podem ser excluídos." confirmText="Confirmar exclusão" actionType="destructive" />
      <AlertModal isOpen={alertConfig.isOpen} onClose={() => setAlertConfig({ ...alertConfig, isOpen: false })} title={alertConfig.title} description={alertConfig.description} type={alertConfig.type} />
      <CalendarTasksModal open={isTaskCalendarOpen} onOpenChange={setIsTaskCalendarOpen} initialYear={carteira.year} initialMonth={carteira.month} tasks={calendarTasks}
        onAddTask={task => addCalendarTask(task, user ? { id: user.id, name: user.name } : undefined)} onDeleteTask={id => deleteCalendarTask(id, user ? { id: user.id, name: user.name } : undefined)} />
      <DailyCashFlowModal open={isDailyCashFlowOpen} onOpenChange={setIsDailyCashFlowOpen} initialDate={carteira.today} />
      <InvestigacaoAuditoria target={auditTarget} events={[]} onClose={() => setAuditTarget(null)} />
    </MainLayout>
  );
}
