import { useState, useEffect, useMemo } from 'react';
import { clientCreditStanding, newCreditBlockReason } from '@/bibliotecas/regras-credito';
import { JurosMoraDialog } from '@/componentes/creditos/JurosMoraDialog';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { MainLayout } from '@/componentes/layout/MainLayout';
import { InvestigacaoAuditoria } from '@/componentes/auditoria/InvestigacaoAuditoria';
import type { InvestigationTarget } from '@/componentes/auditoria/DetalheAuditoria';
import { FileClock } from 'lucide-react';
import { ReinforcementModal } from '@/componentes/modals/ReinforcementModal';
import { useAuth } from '@/contextos/ContextoAutenticacao';
import { useData } from '@/contextos/ContextoDados';
import { formatCurrency, formatDate, formatPercentage } from '@/bibliotecas/formatters';
import { Badge } from '@/componentes/ui/badge';
import { Button } from '@/componentes/ui/button';
import { Input } from '@/componentes/ui/input';
import { Textarea } from '@/componentes/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/componentes/ui/table';

const MONTH_NAMES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const MONTH_FULL_NAMES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
import { Label } from '@/componentes/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/componentes/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/componentes/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/componentes/ui/alert-dialog";
import {
  Search,
  Plus,
  MoreVertical,
  Eye,
  Receipt,
  FileText,
  AlertCircle,
  Trash2,
  Calculator,
  PlusCircle,
  Percent,
  ListOrdered,
  X,
  Download,
  Upload,
  PenTool,
  History,
  ChevronLeft,
  ChevronRight,
  Calendar,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ArrowDownLeft,
  ArrowDownUp,
  Users,
  Lock,
  Unlock,
  AlarmClock,
} from 'lucide-react';
import { generateExcelTemplate, parseExcelFile } from '@/bibliotecas/ExcelHelper';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/componentes/ui/dropdown-menu';
import { Progress } from '@/componentes/ui/progress';
import { CreditForm } from '@/componentes/forms/CreditForm';
import { TabelaTaxasDialog } from '@/componentes/creditos/TabelaTaxasDialog';
import { PlanoPagamentoDialog } from '@/componentes/creditos/PlanoPagamentoDialog';
import { canManageInterestTiers } from '@/bibliotecas/taxas-juro';
import { monthClosureState, monthIdOf, monthLabel, parseMonthId } from '@/bibliotecas/fecho-mes';
import { getScopedLocalStorageItem } from '@/bibliotecas/contas';
import { CREDIT_DIALOG_CONTENT_CLASS, CREDIT_DIALOG_HEADER_CLASS } from '@/componentes/forms/credit-dialog-styles';
import { PaymentForm } from '@/componentes/forms/PaymentForm';
import { Credit } from '@/tipos/credito';
import { useToast } from '@/componentes/ui/use-toast';
import { generateContractPDF, generatePromessaContractPDF, generateMonthlyConsolidationReport, generatePeriodReportPDF } from '@/bibliotecas/pdf';
import { AlertModal, AlertModalType } from '@/componentes/ui/AlertModal';
import { ClientDetailsModal } from '@/componentes/modals/ClientDetailsModal';
import { ConfirmSharingModal } from '@/componentes/modals/ConfirmSharingModal';
import { JustificationModal } from '@/componentes/modals/JustificationModal';
import { openWhatsApp } from '@/bibliotecas/whatsapp';
import { DebtSettlementModal } from '@/componentes/modals/DebtSettlementModal';
import { PromessaDetailsModal } from '@/componentes/modals/PromessaDetailsModal';
import { CreditSummaryDetailsModal } from '@/componentes/modals/CreditSummaryDetailsModal';
import { PeriodMetricDetailsModal } from '@/componentes/modals/PeriodMetricDetailsModal';
import { AnnualReportModal } from '@/componentes/modals/AnnualReportModal';
import { DailyCashFlowModal } from '@/componentes/modals/DailyCashFlowModal';
import { CalendarTasksModal } from '@/componentes/modals/CalendarTasksModal';
import { PdfCanvasViewer } from '@/componentes/ui/PdfCanvasViewer';

type BadgeVariant = 'default' | 'primary' | 'secondary' | 'destructive' | 'success' | 'warning' | 'info' | 'outline';

const statusConfig: Record<string, { label: string; variant: BadgeVariant }> = {
  active: { label: 'Activo', variant: 'success' },
  overdue: { label: 'Em Atraso', variant: 'warning' },
  paid: { label: 'Crédito Pago', variant: 'destructive' },
  renegotiated: { label: 'Renegociado', variant: 'info' },
  defaulted: { label: 'Incumprimento', variant: 'destructive' },
  pending_approval: { label: 'Pendente', variant: 'warning' },
  rejected: { label: 'Rejeitado', variant: 'destructive' },
  cancelled: { label: 'Cancelado', variant: 'outline' },
};

const openCreditStatuses = new Set<Credit['status']>(['active', 'overdue', 'defaulted', 'renegotiated']);

const toNumber = (value: number | undefined | null) => Number(value || 0);

export default function Credits() {
  const [reinforcementCredit, setReinforcementCredit] = useState<any>(null);
  const { user } = useAuth();
  const { credits, clients, addCredit, adjustCreditCharges, deleteCredit, addPayment, companySettings, payments, closedMonths, closeMonth, reopenMonth, suppliers, calendarTasks, addCalendarTask, deleteCalendarTask } = useData();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState(searchParams.get('search') || '');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [isCloseModalOpen, setIsCloseModalOpen] = useState(false);
  const [isTaskCalendarOpen, setIsTaskCalendarOpen] = useState(false);
  
  // Fornecedores/Parceiros selection states
  const [isSupplierSelectOpen, setIsSupplierSelectOpen] = useState(false);
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>('propriocapit');
  const [supplierProfitRate, setSupplierProfitRate] = useState<number>(0);
  const [pendingCreditData, setPendingCreditData] = useState<any>(null);
  
  const itemsPerPage = 10;

  // Estado do Regime de Competência Mensal
  const [selectedMonth, setSelectedMonth] = useState(() => new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(() => new Date().getFullYear());

  // Determinar o intervalo de anos disponíveis (desde o primeiro crédito)
  const availableYears = useMemo(() => {
    const currentYear = new Date().getFullYear();
    if (credits.length === 0) return [currentYear];
    const years = credits.map(c => new Date(c.createdAt).getFullYear());
    const minYear = Math.min(...years);
    const maxYear = Math.max(currentYear, Math.max(...years));
    const result: number[] = [];
    for (let y = minYear; y <= maxYear; y++) result.push(y);
    return result;
  }, [credits]);

  // Estado de Filtragem por Período
  const [periodType, setPeriodType] = useState<'monthly' | 'weekly' | 'daily' | 'custom'>('monthly');
  const [startDateFilter, setStartDateFilter] = useState('');
  const [endDateFilter, setEndDateFilter] = useState('');

  // Modais de Auditoria
  const [periodMetricModal, setPeriodMetricModal] = useState<{ isOpen: boolean, type: 'clients' | 'capital' | 'projected' | 'outstanding' | 'realized' | '' }>({ isOpen: false, type: '' });
  const [annualReportOpen, setAnnualReportOpen] = useState(false);

  // Saídas vs Entradas de Hoje (pega do calendário o dia em que estamos)
  const [isDailyCashFlowOpen, setIsDailyCashFlowOpen] = useState(false);
  const todayCalendarDate = useMemo(() => new Date().toISOString().split('T')[0], []);

  const todayCashFlowSummary = useMemo(() => {
    const todayStr = new Date().toISOString().split('T')[0];

    // Saídas de hoje: créditos concedidos hoje
    const outList = (credits || []).filter(c => {
      if (c.deletedAt) return false;
      const rawDate = c.startDate || c.createdAt;
      const d = rawDate ? (rawDate instanceof Date ? rawDate.toISOString() : String(rawDate)).split('T')[0] : '';
      return d === todayStr;
    });
    const totalOut = outList.reduce((sum, c) => sum + (c.principalAmount || 0), 0);

    // Entradas de hoje: pagamentos recebidos hoje
    const inList = (payments || []).filter(p => {
      if (p.status === 'cancelled' || p.deletedAt) return false;
      const d = (p.paymentDate instanceof Date ? p.paymentDate.toISOString() : String(p.paymentDate || '')).split('T')[0];
      return d === todayStr;
    });
    const totalIn = inList.reduce((sum, p) => sum + (p.amount || 0), 0);

    return {
      todayDate: todayStr,
      totalOut,
      totalIn,
      outCount: outList.length,
      inCount: inList.length,
      net: totalIn - totalOut
    };
  }, [credits, payments]);

  const activePeriodRange = useMemo(() => {
    const today = new Date();
    if (periodType === 'monthly') {
      const start = new Date(selectedYear, selectedMonth, 1);
      const end = new Date(selectedYear, selectedMonth + 1, 0, 23, 59, 59, 999);
      return {
        start,
        end,
        label: `${MONTH_FULL_NAMES[selectedMonth]} de ${selectedYear}`
      };
    }
    if (periodType === 'weekly') {
      const start = new Date();
      start.setDate(today.getDate() - 7);
      start.setHours(0, 0, 0, 0);
      const end = new Date();
      end.setHours(23, 59, 59, 999);
      return { start, end, label: 'Últimos 7 dias' };
    }
    if (periodType === 'daily') {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const end = new Date();
      end.setHours(23, 59, 59, 999);
      return { start, end, label: 'Hoje' };
    }
    if (periodType === 'custom') {
      const start = startDateFilter ? new Date(startDateFilter + 'T00:00:00') : null;
      const end = endDateFilter ? new Date(endDateFilter + 'T23:59:59') : null;
      const label = start || end
        ? `${start ? start.toLocaleDateString() : 'Início'} a ${end ? end.toLocaleDateString() : 'Fim'}`
        : 'Período Personalizado';
      return { start, end, label };
    }
    return { start: null, end: null, label: 'Indefinido' };
  }, [periodType, selectedMonth, selectedYear, startDateFilter, endDateFilter]);

  // Créditos filtrados pelo período (Regime de Competência)
  const periodCredits = useMemo(() => {
    return credits.filter(credit => {
      if (credit.deletedAt) return false;
      if (credit.targetMonthId && periodType === 'monthly' && activePeriodRange.start) {
        const [yearStr, monthStr] = credit.targetMonthId.split('-');
        return parseInt(yearStr) === selectedYear && (parseInt(monthStr) - 1) === selectedMonth;
      }
      const d = new Date(credit.startDate || credit.createdAt);
      if (activePeriodRange.start && d < activePeriodRange.start) return false;
      if (activePeriodRange.end && d > activePeriodRange.end) return false;
      return true;
    });
  }, [credits, activePeriodRange, periodType, selectedMonth, selectedYear]);

  // Pagamentos filtrados pelo período
  const monthlyPayments = useMemo(() => {
    return payments.filter(p => {
      if (p.status === 'cancelled' || p.deletedAt) return false;
      
      const credit = credits.find(c => c.id === p.creditId);
      if (credit?.targetMonthId && periodType === 'monthly' && activePeriodRange.start) {
        const [yearStr, monthStr] = credit.targetMonthId.split('-');
        return parseInt(yearStr) === selectedYear && (parseInt(monthStr) - 1) === selectedMonth;
      }
      
      const d = new Date(p.paymentDate);
      if (activePeriodRange.start && d < activePeriodRange.start) return false;
      if (activePeriodRange.end && d > activePeriodRange.end) return false;
      return true;
    });
  }, [payments, credits, activePeriodRange, periodType, selectedMonth, selectedYear]);

  // Resumo de desempenho mensal
  const monthlySummary = useMemo(() => {
    const uniqueClients = new Set(periodCredits.map(c => c.clientId)).size;

    // Capital Aplicado: only credits that are NOT fully paid (exclude status 'paid')
    // Subtract principal already paid back by clients
    const capitalApplied = periodCredits
      .filter(c => c.status !== 'paid')
      .reduce((sum, c) => {
        const paidPrincipal = payments
          .filter(p => p.creditId === c.id && p.status !== 'cancelled' && !p.deletedAt)
          .reduce((pSum, p) => pSum + toNumber(p.allocatedToPrincipal), 0);
        return sum + Math.max(0, toNumber(c.principalAmount) - paidPrincipal);
      }, 0);

    // Lucro Projetado: remaining interest that hasn't been collected yet
    // Only count credits that are NOT fully paid
    const projectedProfit = periodCredits
      .filter(c => c.status !== 'paid')
      .reduce((sum, c) => {
        const totalContractInterest = toNumber(c.accruedInterest) + toNumber(c.lateInterest);
        const collectedInterest = payments
          .filter(p => p.creditId === c.id && p.status !== 'cancelled' && !p.deletedAt)
          .reduce((pSum, p) => pSum + toNumber(p.allocatedToInterest) + toNumber(p.allocatedToLateInterest), 0);
        return sum + Math.max(0, totalContractInterest - collectedInterest);
      }, 0);
    
    const outstandingCapital = periodCredits
      .filter(c => c.status === 'active')
      .reduce((sum, c) => {
        const paidPrincipal = payments
          .filter(p => p.creditId === c.id && p.status !== 'cancelled' && !p.deletedAt)
          .reduce((pSum, p) => pSum + toNumber(p.allocatedToPrincipal), 0);
        return sum + Math.max(0, toNumber(c.principalAmount) - paidPrincipal);
      }, 0);

    // Valores Recebidos: total amount collected from client payments (principal + interest + late interest)
    const realizedProfit = monthlyPayments.reduce((sum, p) => {
      return sum + toNumber(p.allocatedToInterest) + toNumber(p.allocatedToLateInterest);
    }, 0);

    return {
      uniqueClients,
      capitalApplied,
      projectedProfit,
      outstandingCapital,
      realizedProfit
    };
  }, [periodCredits, monthlyPayments, payments]);

  const totalCapitalPaid = useMemo(() => {
    return periodCredits.reduce((sum, c) => {
      const paidPrincipal = payments
        .filter(p => p.creditId === c.id && p.status !== 'cancelled' && !p.deletedAt)
        .reduce((pSum, p) => pSum + toNumber(p.allocatedToPrincipal), 0);
      return sum + paidPrincipal;
    }, 0);
  }, [periodCredits, payments]);

  const liquidationRate = useMemo(() => {
    if (monthlySummary.capitalApplied === 0) return 0;
    return (totalCapitalPaid / monthlySummary.capitalApplied) * 100;
  }, [totalCapitalPaid, monthlySummary.capitalApplied]);

  const overdueAmount = useMemo(() => {
    return periodCredits
      .filter(c => (c.status === 'overdue' || c.status === 'defaulted') && !c.deletedAt)
      .reduce((sum, c) => sum + toNumber(c.currentBalance), 0);
  }, [periodCredits]);

  const monthId = `${selectedYear}-${(selectedMonth + 1).toString().padStart(2, '0')}`;
  const isMonthClosed = closedMonths.some(m => m.id === monthId);
  const closedMonthData = closedMonths.find(m => m.id === monthId);

  const handleConfirmCloseMonth = async () => {
    try {
      await closeMonth(
        monthId,
        selectedMonth,
        selectedYear,
        monthlySummary.capitalApplied,
        monthlySummary.projectedProfit,
        monthlySummary.realizedProfit,
        overdueAmount,
        liquidationRate,
        user?.name || 'Administrador'
      );
      
      const closedMonthObj = {
        id: monthId,
        month: selectedMonth,
        year: selectedYear,
        capitalApplied: monthlySummary.capitalApplied,
        projectedProfit: monthlySummary.projectedProfit,
        realizedProfit: monthlySummary.realizedProfit,
        overdueAmount: overdueAmount,
        liquidationRate: liquidationRate,
        closedAt: new Date().toISOString(),
        closedBy: user?.name || 'Administrador'
      };

      generateMonthlyConsolidationReport(closedMonthObj, credits, companySettings, user?.name);
      setIsCloseModalOpen(false);
      
      toast({
        title: "Mês Consolidado com Sucesso",
        description: `A folha de ${MONTH_FULL_NAMES[selectedMonth]} de ${selectedYear} foi fechada e o relatório PDF gerado.`,
        variant: "default",
      });
    } catch (error) {
      console.error("Erro ao fechar mês:", error);
      toast({
        title: "Erro ao fechar mês",
        description: "Ocorreu um erro ao gravar o encerramento no banco de dados.",
        variant: "destructive",
      });
    }
  };

  const handleReopenMonth = async () => {
    if (!window.confirm(`Tem a certeza que deseja reabrir a folha de ${MONTH_FULL_NAMES[selectedMonth]} de ${selectedYear}? Novos créditos poderão ser adicionados.`)) {
      return;
    }
    try {
      const reason = window.prompt('Justifique a reabertura deste período (pelo menos 10 caracteres):');
      if (!reason) return;
      await reopenMonth(monthId, reason);
      toast({
        title: "Mês Reaberto",
        description: `A folha de ${MONTH_FULL_NAMES[selectedMonth]} de ${selectedYear} foi reaberta.`,
        variant: "default",
      });
    } catch (error) {
      console.error("Erro ao reabrir mês:", error);
      toast({
        title: "Erro ao reabrir mês",
        description: "Ocorreu um erro ao excluir a consolidação na base de dados.",
        variant: "destructive",
      });
    }
  };

  const handleDownloadCloseReport = () => {
    if (closedMonthData) {
      generateMonthlyConsolidationReport(closedMonthData, credits, companySettings, user?.name);
    }
  };

  useEffect(() => {
    const query = searchParams.get('search');
    if (query) {
      setSearchTerm(query);
    }
  }, [searchParams]);

  // Estados das Modais
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  // "Solicitar novo crédito" depois de o cliente liquidar o anterior: valor mínimo = crédito anterior.
  const [renewalRequest, setRenewalRequest] = useState<{ clientId: string; clientName: string; minAmount: number } | null>(null);
  const [moraCredit, setMoraCredit] = useState<Credit | null>(null);
  const [isRatesDialogOpen, setIsRatesDialogOpen] = useState(false);
  const [isPaymentPlanOpen, setIsPaymentPlanOpen] = useState(false);
  const [isPaymentDialogOpen, setIsPaymentDialogOpen] = useState(false);
  const [isDetailsDialogOpen, setIsDetailsDialogOpen] = useState(false);
  const [isAdjustmentDialogOpen, setIsAdjustmentDialogOpen] = useState(false);
  const [isDeleteAlertOpen, setIsDeleteAlertOpen] = useState(false);

  // Estado da Modal de Liquidação
  const [settlementModal, setSettlementModal] = useState<{
    isOpen: boolean;
    clientName: string;
    creditId: string;
    amountPaid: number;
  }>({
    isOpen: false,
    clientName: '',
    creditId: '',
    amountPaid: 0
  });

  const [selectedCredit, setSelectedCredit] = useState<Credit | undefined>(undefined);
  // Histórico de auditoria do crédito (todas as alterações desde a criação).
  const [auditTarget, setAuditTarget] = useState<InvestigationTarget | null>(null);
  const [previewPdfUrl, setPreviewPdfUrl] = useState<string | null>(null);
  const { toast } = useToast();

  // Estado da Modal de Alerta
  const [alertConfig, setAlertConfig] = useState<{
    isOpen: boolean;
    title: string;
    description: string;
    type: AlertModalType;
  }>({
    isOpen: false,
    title: '',
    description: '',
    type: 'success'
  });

  const [sharingModal, setSharingModal] = useState<{
    isOpen: boolean;
    clientName: string;
    creditId: string;
    clientId: string;
  }>({
    isOpen: false,
    clientName: '',
    creditId: '',
    clientId: ''
  });

  const [justificationModal, setJustificationModal] = useState<{
    isOpen: boolean;
    creditId: string | null;
  }>({
    isOpen: false,
    creditId: null
  });

  const [promessaModal, setPromessaModal] = useState<{
    isOpen: boolean;
    credit: Credit | null;
    client: any | null;
  }>({
    isOpen: false,
    credit: null,
    client: null
  });

  const [detailsModal, setDetailsModal] = useState<{
    isOpen: boolean;
    type: 'total' | 'value' | 'interest' | 'lateFees';
  }>({
    isOpen: false,
    type: 'total'
  });

  const filteredCredits = periodCredits.filter(
    (credit) => {
      const matchesSearch = credit.clientName.toLowerCase().includes(searchTerm.toLowerCase()) || credit.id.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = statusFilter === 'all' || credit.status === statusFilter;
      return matchesSearch && matchesStatus;
    }
  );

  const totalPages = Math.max(1, Math.ceil(filteredCredits.length / itemsPerPage));
  const paginatedCredits = useMemo(() => {
    const actualPage = Math.min(currentPage, totalPages);
    const startIndex = (actualPage - 1) * itemsPerPage;
    return filteredCredits.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredCredits, currentPage, totalPages]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter, selectedMonth, selectedYear]);

  const openCredits = periodCredits.filter((credit) =>
    openCreditStatuses.has(credit.status) &&
    toNumber(credit.currentBalance) > 0.1 &&
    !credit.deletedAt
  );

  const getOutstandingParts = (credit: Credit) => {
    const creditPayments = payments.filter((payment) => payment.creditId === credit.id && payment.status !== 'cancelled' && !payment.deletedAt);
    const paidLateInterest = creditPayments.reduce((sum, payment) => sum + toNumber(payment.allocatedToLateInterest), 0);
    const paidInterest = creditPayments.reduce((sum, payment) => sum + toNumber(payment.allocatedToInterest), 0);
    const remainingLateInterest = Math.max(0, toNumber(credit.lateInterest) - paidLateInterest);
    const remainingInterest = Math.max(0, toNumber(credit.accruedInterest) - paidInterest);
    const remainingPrincipal = Math.max(0, toNumber(credit.currentBalance) - remainingInterest - remainingLateInterest);

    return {
      principal: Math.min(toNumber(credit.principalAmount), remainingPrincipal),
      interest: remainingInterest,
      lateInterest: remainingLateInterest,
    };
  };

  const openCreditTotals = openCredits.reduce((acc, credit) => {
    const parts = getOutstandingParts(credit);
    acc.principal += parts.principal;
    acc.interest += parts.interest;
    acc.lateInterest += parts.lateInterest;
    return acc;
  }, { principal: 0, interest: 0, lateInterest: 0 });

  const handleDownloadTemplate = () => {
    generateExcelTemplate(
      ['NIF Cliente', 'Montante', 'Data Início (AAAA-MM-DD)', 'Prazo (Meses)', 'Taxa Juro (%)'],
      'Modelo_Importacao_Creditos'
    );
    setAlertConfig({
      isOpen: true,
      title: "Modelo baixado",
      description: "O modelo Excel foi salvo no seu computador.",
      type: "success"
    });
  };

  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isMonthClosed) {
      toast({
        title: "Período Consolidado",
        description: "Este mês foi fechado. Não é possível importar créditos neste período.",
        variant: "destructive"
      });
      e.target.value = '';
      return;
    }
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const data = await parseExcelFile(file);
      let importedCount = 0;
      let errorCount = 0;

      for (const row of data) {
        try {
          if (!row['NIF Cliente'] || !row['Montante']) continue;

          // Procurar Cliente
          const client = clients.find(c => c.nif === String(row['NIF Cliente']));
          if (!client) {
            errorCount++;
            continue;
          }

          const principal = Number(row['Montante']);
          const interestRate = Number(row['Taxa Juro (%)']) || client.defaultInterestRate || 10;
          const installments = Number(row['Prazo (Meses)']) || 1;
          const startDate = row['Data Início (AAAA-MM-DD)'] ? new Date(row['Data Início (AAAA-MM-DD)']) : new Date();
          const dueDate = new Date(startDate);
          dueDate.setMonth(dueDate.getMonth() + installments);

          const totalInterest = (principal * interestRate) / 100;
          const totalToReturn = principal + totalInterest;
          const clientCredits = credits.filter(c => c.clientId === client.id && c.status !== 'rejected' && c.status !== 'cancelled');

          await addCredit({
            id: `CR-${crypto.randomUUID()}`,
            clientId: client.id,
            clientName: client.name,
            principalAmount: principal,
            currentBalance: principal,
            interestRate: interestRate,
            lateInterestRate: 0.5, // Padrão
            installments: installments,
            paidInstallments: 0,
            startDate: startDate,
            dueDate: dueDate,
            status: 'active',
            daysOverdue: 0,
            accruedInterest: totalInterest,
            lateInterest: 0,
            totalDue: totalToReturn,
            createdAt: new Date(),
            creditNumber: clientCredits.length + 1
          }, user ? { id: user.id, name: user.name } : undefined);

          importedCount++;
        } catch (e) {
          errorCount++;
        }
      }

      setAlertConfig({
        isOpen: true,
        title: "Importação Concluída",
        description: `${importedCount} créditos importados com sucesso. ${errorCount} erros/clientes não encontrados.`,
        type: importedCount > 0 ? 'success' : 'warning'
      });

    } catch (error) {
      setAlertConfig({
        isOpen: true,
        title: "Erro na Importação",
        description: "Falha ao ler o arquivo Excel.",
        type: 'error'
      });
    }

    // Limpar input
    e.target.value = '';
  };

  // Fecho do mês obrigatório: com um mês anterior por fechar não se emitem novos créditos.
  const pendingClosure = useMemo(() => {
    const state = monthClosureState(new Date(), closedMonths.map(m => m.id),
      getScopedLocalStorageItem('month_close_enforced_since') || monthIdOf(new Date()));
    return state.kind === 'overdue' ? state : null;
  }, [closedMonths]);

  const openMonthClosing = (targetMonthId: string) => {
    const parsed = parseMonthId(targetMonthId);
    if (!parsed) return;
    setPeriodType('monthly');
    setSelectedYear(parsed.year);
    setSelectedMonth(parsed.monthIndex);
    setIsCloseModalOpen(true);
  };

  // Vindo do lembrete (#/creditos?fecharMes=AAAA-MM): abre logo o fecho desse mês.
  useEffect(() => {
    const target = searchParams.get('fecharMes');
    if (!target) return;
    if (user?.role === 'super_admin' || user?.role === 'admin') openMonthClosing(target);
    const next = new URLSearchParams(searchParams);
    next.delete('fecharMes');
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const handleAddNew = () => {
    if (pendingClosure) {
      const canClose = user?.role === 'super_admin' || user?.role === 'admin';
      toast({
        title: "Fecho do mês pendente",
        description: canClose
          ? `Faça primeiro o fecho de ${monthLabel(pendingClosure.monthId)} para registar novos créditos.`
          : `O fecho de ${monthLabel(pendingClosure.monthId)} ainda não foi feito. Peça ao administrador para o fazer.`,
        variant: "destructive"
      });
      if (canClose) openMonthClosing(pendingClosure.monthId);
      return;
    }
    if (isMonthClosed) {
      toast({
        title: "Período Consolidado",
        description: "Este mês foi fechado. Não é possível criar novos créditos retroativos.",
        variant: "destructive"
      });
      return;
    }
    setIsCreateDialogOpen(true);
  };

  const handleViewDetails = (credit: Credit) => {
    setSelectedCredit(credit);
    setIsDetailsDialogOpen(true);
  };

  const handleRegisterPayment = (credit: Credit) => {
    setSelectedCredit(credit);
    setIsDetailsDialogOpen(false);
    setIsPaymentDialogOpen(true);
  };

  const handleViewHistory = (id: string) => {
    navigate(`/pagamentos?search=${encodeURIComponent(id)}`);
  };

  const handleViewPromessaContract = (credit: Credit) => {
    const client = clients.find(c => c.id === credit.clientId);
    setPromessaModal({
      isOpen: true,
      credit,
      client: client || null
    });
  };

  const handleViewContract = (credit: Credit) => {
    try {
      const creditPayments = payments.filter(p => p.creditId === credit.id);
      const url = generateContractPDF(credit, companySettings, creditPayments, 'blob', user?.name);
      if (url) {
        setPreviewPdfUrl(url as any);
        setSelectedCredit(credit); // Garante que o crédito selecionado é definido para o botão de download na modal
      }
    } catch (e) {
      setAlertConfig({
        isOpen: true,
        title: "Erro!",
        description: "Falha ao gerar o contrato em PDF.",
        type: "error"
      });
    }
  };

  // Estado da Modal de Detalhes do Cliente
  const [clientForDetails, setClientForDetails] = useState<any>(null);
  const [isClientDetailsOpen, setIsClientDetailsOpen] = useState(false);

  const handleViewClientProfile = (clientId: string) => {
    const client = clients.find(c => c.id === clientId);
    if (client) {
      setClientForDetails(client);
      setIsClientDetailsOpen(true);
    }
  };

  const handleAdjustmentClick = (credit: Credit) => {
    setSelectedCredit(credit);
    setAdjustments({
      accruedInterest: credit.accruedInterest,
      lateInterest: credit.lateInterest,
    });
    setAdjustmentReason('');
    setAdjustmentKey(crypto.randomUUID());
    setIsAdjustmentDialogOpen(true);
  };

  const [adjustments, setAdjustments] = useState({ accruedInterest: 0, lateInterest: 0 });
  const [adjustmentReason, setAdjustmentReason] = useState('');
  const [adjustmentKey, setAdjustmentKey] = useState(() => crypto.randomUUID());

  const handleAdjustmentSubmit = async () => {
    if (!selectedCredit) return;

    try {
      await adjustCreditCharges(selectedCredit.id, adjustments.accruedInterest, adjustments.lateInterest,
        adjustmentReason, adjustmentKey, user ? { id: user.id, name: user.name } : undefined);
      setAlertConfig({ isOpen: true, title: 'Ajuste registado',
        description: 'O ajuste foi lançado no livro contabilístico com a justificação indicada.', type: 'success' });
      setIsAdjustmentDialogOpen(false);
    } catch (error) {
      setAlertConfig({ isOpen: true, title: 'Ajuste recusado',
        description: error instanceof Error ? error.message : 'Não foi possível registar o ajuste.', type: 'error' });
    }
  };

  const handleDeleteClick = (credit: Credit) => {
    setSelectedCredit(credit);
    setJustificationModal({ isOpen: true, creditId: credit.id });
  };

  const handleConfirmDelete = async (justification: string) => {
    if (selectedCredit) {
      try {
        await deleteCredit(selectedCredit.id, user ? { id: user.id, name: user.name } : undefined, justification);
        setAlertConfig({
          isOpen: true,
          title: "Excluído!",
          description: "O lançamento de crédito foi removido e auditado com sucesso.",
          type: "success"
        });
        setJustificationModal({ isOpen: false, creditId: null });
        setSelectedCredit(undefined);
      } catch (e: any) {
        setAlertConfig({
          isOpen: true,
          title: "Não é possível excluir!",
          description: e.message || "Este crédito possui saldo devedor pendente.",
          type: "warning"
        });
        setJustificationModal({ isOpen: false, creditId: null });
        setSelectedCredit(undefined);
      }
    }
  };

  const handleCreateSubmit = async (data: any) => {
    try {
      const client = clients.find((d) => d.id === data.clientId);
      if (!client) {
        setAlertConfig({
          isOpen: true,
          title: "Erro ao criar crédito",
          description: "Cliente selecionado não encontrado. Tente recarregar a página.",
          type: "error"
        });
        return;
      }

      const totalInterest = (data.principalAmount * data.interestRate) / 100;
      const totalToReturn = data.principalAmount + totalInterest;
      const clientCredits = credits.filter(c => c.clientId === client.id && c.status !== 'rejected' && c.status !== 'cancelled');
      const hasUnpaidCredits = clientCredits.some(c => c.status !== 'paid' && (Number(c.currentBalance) || 0) > 0.1);

      if (renewalRequest?.clientId === client.id && data.principalAmount < renewalRequest.minAmount) {
        setAlertConfig({
          isOpen: true,
          title: "Valor abaixo do mínimo",
          description: `O novo crédito tem de ser igual ou superior ao anterior (${formatCurrency(renewalRequest.minAmount)}).`,
          type: "warning"
        });
        return;
      }

      if (clientCredits.length > 0 && !hasUnpaidCredits && renewalRequest?.clientId !== client.id) {
        setAlertConfig({
          isOpen: true,
          title: "Novo ciclo requer decisão de limite",
          description: "Este cliente liquidou todos os créditos. Inicie o novo ciclo no perfil do cliente para escolher entre aumentar ou manter o limite.",
          type: "warning"
        });
        return;
      }

      // Check if suppliers module is enabled and there are active suppliers
      const activeSuppliers = (suppliers || []).filter(s => s.status === 'active');
      const hasSuppliers = companySettings.enableSuppliersModule !== false && activeSuppliers.length > 0;

      if (hasSuppliers) {
        setPendingCreditData({ ...data, client, totalInterest, totalToReturn, clientCredits });
        setSelectedSupplierId('propriocapit');
        setSupplierProfitRate(0);
        setIsSupplierSelectOpen(true);
        return;
      }

      await executeCreditSave(data, client, totalInterest, totalToReturn, clientCredits);

    } catch (error: any) {
      console.error("Error in handleCreateSubmit:", error);
      setAlertConfig({
        isOpen: true,
        title: "Falha ao Salvar",
        description: error.message || "Ocorreu um erro ao tentar registar o empréstimo.",
        type: "error"
      });
    }
  };

  const handleConfirmSupplier = async () => {
    if (!pendingCreditData) return;
    setIsSupplierSelectOpen(false);
    
    const supplierId = selectedSupplierId === 'propriocapit' ? undefined : selectedSupplierId;
    const finalSupplierRate = supplierId ? supplierProfitRate : undefined;
    const { client, totalInterest, totalToReturn, clientCredits, ...data } = pendingCreditData;
    
    setPendingCreditData(null);
    await executeCreditSave({ ...data, supplierId, supplierProfitRate: finalSupplierRate }, client, totalInterest, totalToReturn, clientCredits);
  };

  const executeCreditSave = async (data: any, client: any, totalInterest: number, totalToReturn: number, clientCredits: any[]) => {
    try {
      const generatedId = `CR-${crypto.randomUUID()}`;
      const canApprove = user?.role === 'super_admin' || user?.permissions?.includes('approve_loans');
      const requiresApproval =
        !canApprove ||
        data.principalAmount > client.availableCredit ||
        client.status !== 'active' ||
        client.riskLevel === 'high';
      const finalStatus = requiresApproval ? 'pending_approval' : 'active';

      const saved = await addCredit({
        ...data,
        startDate: new Date(data.startDate),
        dueDate: new Date(data.dueDate),
        id: generatedId,
        clientName: client.name,
        currentBalance: data.principalAmount,
        paidInstallments: 0,
        daysOverdue: 0,
        accruedInterest: totalInterest,
        lateInterest: 0,
        totalDue: totalToReturn,
        createdAt: new Date(),
        status: finalStatus,
        requestedBy: user?.name || 'Sistema',
        requestedAt: new Date(),
        creditNumber: clientCredits.length + 1
      }, user ? { id: user.id, name: user.name } : undefined);

      setIsCreateDialogOpen(false);
      setRenewalRequest(null);
      // O crédito aparece na folha do seu mês de competência: abre essa folha para o ver de imediato na lista.
      const competence = /^\d{4}-\d{2}$/.test(String(data.targetMonthId || ''))
        ? String(data.targetMonthId)
        : new Date(data.startDate).toISOString().slice(0, 7);
      const [competenceYear, competenceMonth] = competence.split('-').map(Number);
      if (periodType !== 'monthly' || competenceYear !== selectedYear || competenceMonth - 1 !== selectedMonth) {
        setPeriodType('monthly');
        setSelectedYear(competenceYear);
        setSelectedMonth(competenceMonth - 1);
        toast({
          title: 'Crédito registado',
          description: `Está na folha de ${new Date(competenceYear, competenceMonth - 1, 1).toLocaleDateString('pt-PT', { month: 'long', year: 'numeric' })} (mês de competência escolhido).`,
        });
      }
      setStatusFilter('all');

      // O estado final vem das alçadas: um crédito pedido como activo pode subir na cadeia de aprovação.
      if (saved.status === 'pending_approval') {
        setAlertConfig({
          isOpen: true,
          title: "Crédito enviado para aprovação",
          description: saved.escalationReason
            ? `${saved.escalationReason}. O pedido ficou na fila de Aprovações e os aprovadores desse nível foram notificados.`
            : "A solicitação ficou pendente por regra de limite, risco ou permissão.",
          type: "warning"
        });
        return;
      }

      // Abrir automaticamente a modal de partilha após o sucesso
      setSharingModal({
        isOpen: true,
        clientName: client.name,
        creditId: generatedId,
        clientId: client.id
      });
    } catch (error: any) {
      console.error("Error in executeCreditSave:", error);
      setAlertConfig({
        isOpen: true,
        title: "Falha ao Salvar",
        description: error.message || "Ocorreu um erro ao tentar registar o empréstimo.",
        type: "error"
      });
    }
  };

  const handleShareConfirm = async (method: 'whatsapp' | 'email' | 'both' | 'none') => {
    const { creditId, clientId, clientName } = sharingModal;
    setSharingModal(prev => ({ ...prev, isOpen: false }));

    if (method === 'none') return;

    const credit = credits.find(c => c.id === creditId) || credits[0]; // Fallback para o recém-criado
    const client = clients.find(c => c.id === clientId);

    if (!credit || !client) return;

    try {

      if (method === 'whatsapp') {
        const message = `Olá ${clientName}, segue o comprovativo do seu novo crédito ${creditId} na ${companySettings.name}. Valor: ${formatCurrency(credit.principalAmount)}.`;
        openWhatsApp(client.phone || '', message);
      } else if (method === 'email' && client.email) {
        const subject = encodeURIComponent(`Comprovativo de Crédito - ${companySettings.name}`);
        const body = encodeURIComponent(`Olá ${clientName},\n\nSegue o comprovativo do seu crédito ${creditId}.\n\nAtenciosamente,\n${companySettings.name}`);
        window.open(`mailto:${client.email}?subject=${subject}&body=${body}`, '_blank');
      }

      setAlertConfig({
        isOpen: true,
        title: "Acção Iniciada",
        description: "O canal de envio foi aberto.",
        type: "success"
      });
    } catch (e) {
      console.error("Error sharing:", e);
      setAlertConfig({
        isOpen: true,
        title: "Erro",
        description: "Não foi possível preparar o documento para envio.",
        type: "error"
      });
    }
  };

  const handlePaymentSubmit = async (data: any) => {
    const credit = credits.find(c => c.id === data.creditId);
    if (!credit) return;

    // Lógica simplificada para alocação
    const lateInterest = credit.lateInterest;
    const interest = credit.accruedInterest;

    let remainingAmount = data.amount;
    const allocatedToLateInterest = Math.min(remainingAmount, lateInterest);
    remainingAmount -= allocatedToLateInterest;

    const allocatedToInterest = Math.min(remainingAmount, interest);
    remainingAmount -= allocatedToInterest;

    const allocatedToPrincipal = remainingAmount;

    // Check if debt is fully paid
    // Current total due might be updated after payment, but we can simulate:
    const remainingDebt = credit.totalDue - credit.currentBalance - data.amount; // Approximate logic

    try {
      await addPayment({
        ...data,
        id: `PAGAMENTO${Math.floor(Math.random() * 10000)}`, // Changed from PAY to PAGAMENTO
        paymentDate: new Date(data.paymentDate), // Converter string para Date
        creditId: credit.id,
        clientName: credit.clientName,
        allocatedToLateInterest,
        allocatedToInterest,
        allocatedToPrincipal,
        processedBy: user?.name || 'Sistema',
        status: 'confirmed',
      }, user ? { id: user.id, name: user.name } : undefined);

      setIsPaymentDialogOpen(false);
      setSelectedCredit(undefined);

      // Check if fully paid to show celebration modal
      const isFullyPaid = (credit.currentBalance - data.amount) <= 0.1;

      if (isFullyPaid) {
        // Show celebration modal for full payment
        setSettlementModal({
          isOpen: true,
          clientName: credit.clientName,
          creditId: credit.id,
          amountPaid: credit.totalDue
        });
      } else {
        // Show regular payment confirmation for partial payment
        setAlertConfig({
          isOpen: true,
          title: "Pagamento Recebido!",
          description: "O pagamento foi registado e o saldo do crédito atualizado.",
          type: "success"
        });
      }

    } catch (error: any) {
      setAlertConfig({
        isOpen: true,
        title: "Falha no Pagamento",
        description: error.message || "Não foi possível registar o pagamento.",
        type: "error"
      });
    }
  };


  return (
    <MainLayout title="Créditos" subtitle="Gestão de operações de crédito">
      {/* === REGIME DE COMPETÊNCIA MENSAL === */}

      {/* Seletor de Ano e Filtros */}
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between bg-muted/20 p-3 rounded-lg border border-border/40">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Calendar className="h-5 w-5 text-primary" />
            {calendarTasks.some(t => {
              const [y, m] = t.date.split('-').map(Number);
              return y === selectedYear && (m - 1) === selectedMonth;
            }) && (
              <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-amber-500 border border-background" />
            )}
          </div>
          <h2 className="text-base md:text-lg font-bold text-foreground">
            {periodType === 'monthly' ? `Folha de ${MONTH_FULL_NAMES[selectedMonth]} de ${selectedYear}` : `Operações: ${activePeriodRange.label}`}
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Seletor de Tipo de Período */}
          <Select value={periodType} onValueChange={(val: any) => setPeriodType(val)}>
            <SelectTrigger className="h-9 w-[140px] bg-background">
              <SelectValue placeholder="Tipo de Período" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="monthly">Mensal</SelectItem>
              <SelectItem value="weekly">Semanal</SelectItem>
              <SelectItem value="daily">Hoje</SelectItem>
              <SelectItem value="custom">Personalizado</SelectItem>
            </SelectContent>
          </Select>

          {periodType === 'custom' && (
            <div className="flex items-center gap-2">
              <Input
                type="date"
                value={startDateFilter}
                onChange={(e) => setStartDateFilter(e.target.value)}
                className="h-9 w-[130px] bg-background py-1 px-2 text-xs"
              />
              <span className="text-xs text-muted-foreground">a</span>
              <Input
                type="date"
                value={endDateFilter}
                onChange={(e) => setEndDateFilter(e.target.value)}
                className="h-9 w-[130px] bg-background py-1 px-2 text-xs"
              />
            </div>
          )}

          {periodType === 'monthly' && (
            <div className="flex items-center gap-1 bg-background rounded-lg p-0.5 border">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => {
                  const idx = availableYears.indexOf(selectedYear);
                  if (idx > 0) setSelectedYear(availableYears[idx - 1]);
                }}
                disabled={availableYears.indexOf(selectedYear) === 0}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="px-2 text-xs font-bold text-foreground min-w-[40px] text-center">{selectedYear}</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => {
                  const idx = availableYears.indexOf(selectedYear);
                  if (idx < availableYears.length - 1) setSelectedYear(availableYears[idx + 1]);
                }}
                disabled={availableYears.indexOf(selectedYear) === availableYears.length - 1}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}

          <Button
            onClick={() => setAnnualReportOpen(true)}
            variant="outline"
            size="sm"
            className="h-9 gap-1 text-xs border-primary/20 hover:bg-primary/5 text-primary"
          >
            <Calendar className="h-4 w-4" />
            Visão Anual
          </Button>

          {/* Download Period Report Button */}
          {periodType !== 'monthly' && (
            <Button
              onClick={() => generatePeriodReportPDF(activePeriodRange.label, periodCredits, monthlyPayments, companySettings, user?.name)}
              disabled={periodType === 'custom' && (!startDateFilter || !endDateFilter)}
              size="sm"
              className="h-9 gap-1 text-xs"
            >
              <Download className="h-4 w-4" />
              Baixar Relatório
            </Button>
          )}
        </div>
      </div>

      {/* Abas dos 12 Meses */}
      {periodType === 'monthly' && (
        <div className="mb-5 flex gap-2.5 overflow-x-auto rounded-2xl border border-primary/15 bg-primary/10 p-2 shadow-sm scrollbar-thin" style={{ scrollbarWidth: 'thin' }}>
          {MONTH_NAMES.map((name, index) => {
            const isActive = index === selectedMonth;
            const currentDate = new Date();
            const isCurrent = index === currentDate.getMonth() && selectedYear === currentDate.getFullYear();
            const loopMonthId = `${selectedYear}-${(index + 1).toString().padStart(2, '0')}`;
            const loopIsMonthClosed = closedMonths.some(m => m.id === loopMonthId);
            const loopHasTasks = calendarTasks.some(t => {
              const [y, m] = t.date.split('-').map(Number);
              return y === selectedYear && (m - 1) === index;
            });

            let tabStyle = "";
            if (isActive) {
              if (loopIsMonthClosed) {
                tabStyle = "bg-slate-700 dark:bg-slate-700 text-white shadow-md scale-[1.03] font-bold";
              } else {
                tabStyle = "bg-sidebar-primary text-sidebar-primary-foreground shadow-gold scale-[1.03] font-bold";
              }
            } else {
              if (loopIsMonthClosed) {
                tabStyle = "bg-background/70 text-muted-foreground/60 shadow-sm hover:bg-muted/60 hover:text-foreground";
              } else {
                tabStyle = "bg-background text-foreground/80 shadow-sm hover:shadow-md hover:-translate-y-0.5 dark:bg-white/10 dark:hover:bg-white/15";
              }
            }

            return (
              <button
                key={index}
                onClick={() => isActive ? setIsTaskCalendarOpen(true) : setSelectedMonth(index)}
                title={isActive ? "Abrir agenda de tarefas do mês" : undefined}
                className={`
                  relative px-3.5 py-2.5 text-xs rounded-xl transition-all duration-200 whitespace-nowrap min-w-[64px] flex flex-col items-center gap-1
                  ${tabStyle}
                `}
              >
                {loopHasTasks && (
                  <span
                    className={`absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-amber-400 ring-2 ${isActive ? 'ring-primary' : 'ring-background'}`}
                    title="Há tarefas agendadas neste mês"
                  />
                )}
                <span className="font-semibold tracking-wide">{name}</span>
                {loopIsMonthClosed ? (
                  <Lock className="h-3 w-3 opacity-70" />
                ) : (
                  <span className={`inline-block h-1.5 w-1.5 rounded-full ${isActive ? 'bg-white/80' : 'bg-green-500'} ${isCurrent ? 'animate-pulse' : ''}`} />
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Ações do Cabeçalho */}
      <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between p-4 bg-muted/20 rounded-lg border border-border/50">
        <div className="flex flex-1 items-center gap-4">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Pesquisar por referência ou cliente..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="active">Activos</SelectItem>
              <SelectItem value="pending_approval">Pendentes</SelectItem>
              <SelectItem value="overdue">Em Atraso</SelectItem>
              <SelectItem value="paid">Liquidados</SelectItem>
              <SelectItem value="rejected">Rejeitados</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="gap-2" onClick={handleDownloadTemplate}>
            <Download className="h-4 w-4" />
            Modelo
          </Button>
          <Button variant="outline" className="gap-2 border-primary/30 text-primary hover:bg-primary/5" onClick={() => setIsPaymentPlanOpen(true)}>
            <ListOrdered className="h-4 w-4" />
            Plano de Pagamento
          </Button>
          {canManageInterestTiers(user?.role) && (
            <Button variant="outline" className="gap-2 border-primary/30 text-primary hover:bg-primary/5" onClick={() => setIsRatesDialogOpen(true)}>
              <Percent className="h-4 w-4" />
              Cadastrar Taxas de Juro
            </Button>
          )}
          {isMonthClosed ? (
            <>
              <Badge variant="success" className="gap-1.5 px-3 py-2 text-xs bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 shadow-sm">
                <Lock className="h-3.5 w-3.5" />
                Mês Consolidado
              </Badge>
              <Button variant="outline" className="gap-2 border-emerald-500/30 hover:bg-emerald-500/5 text-emerald-600 dark:text-emerald-400" onClick={handleDownloadCloseReport}>
                <FileText className="h-4 w-4" />
                Relatório de Fecho (PDF)
              </Button>
              {(user?.role === 'super_admin' || user?.role === 'admin') && (
                <Button variant="ghost" className="gap-2 text-red-500 hover:text-red-600 hover:bg-red-500/5" onClick={handleReopenMonth}>
                  <Unlock className="h-4 w-4" />
                  Reabrir Mês
                </Button>
              )}
            </>
          ) : (
            <>
              {(user?.role === 'super_admin' || user?.role === 'admin') && (
                <Button variant="outline" className="gap-2 border-indigo-500/30 hover:bg-indigo-500/5 text-indigo-600 dark:text-indigo-400" onClick={() => setIsCloseModalOpen(true)}>
                  <Calculator className="h-4 w-4" />
                  Fechar Mês
                </Button>
              )}
              <div className="relative">
                <Button variant="outline" className="gap-2 pointer-events-none">
                  <Upload className="h-4 w-4" />
                  Importar
                </Button>
                <Input
                  type="file"
                  accept=".xlsx, .xls"
                  className="absolute inset-0 opacity-0 cursor-pointer"
                  onChange={handleImportExcel}
                />
              </div>
              <Button className="gap-2" onClick={handleAddNew}>
                <Plus className="h-4 w-4" />
                Novo Crédito
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Resumo de Desempenho Mensal - 6 Indicadores com Estilo e Paleta de Login */}
      <div className="mb-6 grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {/* 1. Clientes (Azul Primário / Login Style) */}
        <div 
          onClick={() => setPeriodMetricModal({ isOpen: true, type: 'clients' })}
          className="card-kpi-sky cursor-pointer hover:scale-[1.02] active:scale-[0.99] group"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/10 dark:bg-white/10 text-slate-950 dark:text-white shrink-0 group-hover:scale-105 transition-transform">
                <Users className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[11px] font-bold text-slate-900/70 dark:text-slate-400 uppercase tracking-wider truncate">
                  Carteira
                </p>
                <p className="text-sm sm:text-base font-bold text-slate-950 dark:text-white truncate tracking-tight">
                  Clientes {periodType === 'monthly' ? 'do Mês' : 'do Período'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setPeriodMetricModal({ isOpen: true, type: 'clients' });
              }}
              title="Auditar Clientes"
              className="w-8 h-8 rounded-full bg-black/10 hover:bg-black/20 dark:bg-white/10 dark:hover:bg-white/20 flex items-center justify-center text-slate-950 dark:text-white transition-all hover:scale-110 active:scale-90 cursor-pointer shadow-2xs shrink-0"
            >
              <Eye className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="my-2">
            <p className="font-display text-3xl sm:text-4xl font-black tracking-tight text-slate-950 dark:text-white truncate">
              {monthlySummary.uniqueClients}
            </p>
          </div>

          <p className="text-xs font-semibold text-slate-900/75 dark:text-slate-400 truncate">
            {periodCredits.length} créditos registados
          </p>
        </div>

        {/* 2. Capital Aplicado (Coral / Rosa / Login Style) */}
        <div 
          onClick={() => setPeriodMetricModal({ isOpen: true, type: 'capital' })}
          className="card-kpi-coral cursor-pointer hover:scale-[1.02] active:scale-[0.99] group"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/10 dark:bg-white/10 text-slate-950 dark:text-white shrink-0 group-hover:scale-105 transition-transform">
                <ArrowUpRight className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[11px] font-bold text-slate-900/70 dark:text-slate-400 uppercase tracking-wider truncate">
                  Desembolso
                </p>
                <p className="text-sm sm:text-base font-bold text-slate-950 dark:text-white truncate tracking-tight">
                  Capital Aplicado
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setPeriodMetricModal({ isOpen: true, type: 'capital' });
              }}
              title="Auditar Capital Aplicado"
              className="w-8 h-8 rounded-full bg-black/10 hover:bg-black/20 dark:bg-white/10 dark:hover:bg-white/20 flex items-center justify-center text-slate-950 dark:text-white transition-all hover:scale-110 active:scale-90 cursor-pointer shadow-2xs shrink-0"
            >
              <Eye className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="my-2">
            <p className="font-display text-3xl sm:text-4xl font-black tracking-tight text-slate-950 dark:text-white truncate" title={formatCurrency(monthlySummary.capitalApplied)}>
              {formatCurrency(monthlySummary.capitalApplied)}
            </p>
          </div>

          <p className="text-xs font-semibold text-slate-900/75 dark:text-slate-400 truncate">
            Total de saídas desembolsadas
          </p>
        </div>

        {/* 3. Lucro Projetado (Índigo / Púrpura / Login Style) */}
        <div 
          onClick={() => setPeriodMetricModal({ isOpen: true, type: 'projected' })}
          className="card-kpi-purple cursor-pointer hover:scale-[1.02] active:scale-[0.99] group"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/10 dark:bg-white/10 text-slate-950 dark:text-white shrink-0 group-hover:scale-105 transition-transform">
                <TrendingUp className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[11px] font-bold text-slate-900/70 dark:text-slate-400 uppercase tracking-wider truncate">
                  Expectativa
                </p>
                <p className="text-sm sm:text-base font-bold text-slate-950 dark:text-white truncate tracking-tight">
                  Lucro Projetado
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setPeriodMetricModal({ isOpen: true, type: 'projected' });
              }}
              title="Auditar Lucro Projetado"
              className="w-8 h-8 rounded-full bg-black/10 hover:bg-black/20 dark:bg-white/10 dark:hover:bg-white/20 flex items-center justify-center text-slate-950 dark:text-white transition-all hover:scale-110 active:scale-90 cursor-pointer shadow-2xs shrink-0"
            >
              <Eye className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="my-2">
            <p className="font-display text-3xl sm:text-4xl font-black tracking-tight text-slate-950 dark:text-white truncate" title={formatCurrency(monthlySummary.projectedProfit)}>
              {formatCurrency(monthlySummary.projectedProfit)}
            </p>
          </div>

          <p className="text-xs font-semibold text-slate-900/75 dark:text-slate-400 truncate">
            Juros totais contratados
          </p>
        </div>

        {/* 4. Saldo em Aberto (Dourado / Âmbar / Login Style) */}
        <div 
          onClick={() => setPeriodMetricModal({ isOpen: true, type: 'outstanding' })}
          className="card-kpi-amber cursor-pointer hover:scale-[1.02] active:scale-[0.99] group"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/10 dark:bg-white/10 text-slate-950 dark:text-white shrink-0 group-hover:scale-105 transition-transform">
                <TrendingDown className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[11px] font-bold text-slate-900/70 dark:text-slate-400 uppercase tracking-wider truncate">
                  A Receber
                </p>
                <p className="text-sm sm:text-base font-bold text-slate-950 dark:text-white truncate tracking-tight">
                  Saldo em Aberto
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setPeriodMetricModal({ isOpen: true, type: 'outstanding' });
              }}
              title="Auditar Saldo em Aberto"
              className="w-8 h-8 rounded-full bg-black/10 hover:bg-black/20 dark:bg-white/10 dark:hover:bg-white/20 flex items-center justify-center text-slate-950 dark:text-white transition-all hover:scale-110 active:scale-90 cursor-pointer shadow-2xs shrink-0"
            >
              <Eye className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="my-2">
            <p className="font-display text-3xl sm:text-4xl font-black tracking-tight text-slate-950 dark:text-white truncate" title={formatCurrency(monthlySummary.outstandingCapital)}>
              {formatCurrency(monthlySummary.outstandingCapital)}
            </p>
          </div>

          <p className="text-xs font-semibold text-slate-900/75 dark:text-slate-400 truncate">
            Principal em cobrança ativa
          </p>
        </div>

        {/* 5. Lucro Recebido (Verde Esmeralda / Login Style) */}
        <div 
          onClick={() => setPeriodMetricModal({ isOpen: true, type: 'realized' })}
          className="card-kpi-mint cursor-pointer hover:scale-[1.02] active:scale-[0.99] group"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/10 dark:bg-white/10 text-slate-950 dark:text-white shrink-0 group-hover:scale-105 transition-transform">
                <ArrowDownLeft className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[11px] font-bold text-slate-900/70 dark:text-slate-400 uppercase tracking-wider truncate">
                  Realizado
                </p>
                <p className="text-sm sm:text-base font-bold text-slate-950 dark:text-white truncate tracking-tight">
                  Lucro Recebido
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setPeriodMetricModal({ isOpen: true, type: 'realized' });
              }}
              title="Auditar Lucro Recebido"
              className="w-8 h-8 rounded-full bg-black/10 hover:bg-black/20 dark:bg-white/10 dark:hover:bg-white/20 flex items-center justify-center text-slate-950 dark:text-white transition-all hover:scale-110 active:scale-90 cursor-pointer shadow-2xs shrink-0"
            >
              <Eye className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="my-2">
            <p className="font-display text-3xl sm:text-4xl font-black tracking-tight text-slate-950 dark:text-white truncate" title={formatCurrency(monthlySummary.realizedProfit)}>
              {formatCurrency(monthlySummary.realizedProfit)}
            </p>
          </div>

          <p className="text-xs font-semibold text-slate-900/75 dark:text-slate-400 truncate">
            {monthlyPayments.length} pagamentos realizados
          </p>
        </div>

        {/* 6. Saídas vs Entradas (Hoje - Pega do Calendário) */}
        <div 
          onClick={() => setIsDailyCashFlowOpen(true)}
          className="card-kpi-flow cursor-pointer hover:scale-[1.02] active:scale-[0.99] group"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/10 dark:bg-white/10 text-slate-950 dark:text-white shrink-0 group-hover:scale-105 transition-transform">
                <ArrowDownUp className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[11px] font-bold text-slate-900/70 dark:text-slate-300 uppercase tracking-wider truncate flex items-center gap-1">
                  <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  Hoje no Calendário
                </p>
                <p className="text-sm sm:text-base font-bold text-slate-950 dark:text-white truncate tracking-tight">
                  Saídas vs Entradas
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsDailyCashFlowOpen(true);
              }}
              title="Abrir Opções do Dia (Saídas vs Entradas)"
              className="w-8 h-8 rounded-full bg-black/10 hover:bg-black/20 dark:bg-white/10 dark:hover:bg-white/20 flex items-center justify-center text-slate-950 dark:text-white transition-all hover:scale-110 active:scale-90 cursor-pointer shadow-2xs shrink-0"
            >
              <Eye className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="my-2">
            <div className="flex items-baseline gap-2">
              <span className="text-[11px] font-bold text-rose-600 dark:text-rose-400">Saiu:</span>
              <p className="font-display text-2xl sm:text-3xl font-black tracking-tight text-rose-600 dark:text-rose-400 truncate">
                {formatCurrency(todayCashFlowSummary.totalOut)}
              </p>
            </div>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">Entrou:</span>
              <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 truncate">
                {formatCurrency(todayCashFlowSummary.totalIn)}
              </span>
            </div>
          </div>

          <p className="text-xs font-semibold text-slate-900/75 dark:text-slate-400 truncate">
            {todayCashFlowSummary.outCount} saídas / {todayCashFlowSummary.inCount} entradas hoje
          </p>
        </div>
      </div>

      {/* Tabela */}
      <div className="card-elevated overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead>Referência</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead className="text-right">Principal</TableHead>
              <TableHead className="text-right">Saldo Actual</TableHead>
              <TableHead>Taxa</TableHead>
              <TableHead>Progresso</TableHead>
              <TableHead>Vencimento</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredCredits.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-12 text-muted-foreground">
                  <div className="flex flex-col items-center gap-2">
                    <Calendar className="h-10 w-10 text-muted-foreground/40" />
                    <p className="text-base font-medium">Nenhuma operação registada</p>
                    <p className="text-sm">em {MONTH_FULL_NAMES[selectedMonth]} de {selectedYear}</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : paginatedCredits.map((credit, index) => (
              <TableRow
                key={credit.id}
                className="animate-fade-in"
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <TableCell>
                  <span className="font-mono font-medium text-foreground">{credit.id}</span>
                </TableCell>
                <TableCell>
                  <p className="font-medium text-foreground">{credit.clientName}</p>
                </TableCell>
                <TableCell className="text-right font-medium">
                  {formatCurrency(credit.principalAmount)}
                </TableCell>
                <TableCell className="text-right">
                  <div>
                    <p className="font-medium text-foreground">{formatCurrency(credit.currentBalance)}</p>
                    {credit.lateInterest > 0 && (
                      <p className="flex items-center justify-end gap-1 text-sm text-danger">
                        <AlertCircle className="h-3 w-3" />
                        +{formatCurrency(credit.lateInterest)} mora
                      </p>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="text-sm">
                    <p className="font-medium">{formatPercentage(credit.interestRate)}</p>
                    <p className="text-muted-foreground">Mora: {formatPercentage(credit.lateInterestRate)}/dia</p>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="w-32">
                    {(() => {
                      // Pago = pagamentos confirmados; o total é o que já foi pago mais o que ainda está em dívida.
                      const paidAmount = payments
                        .filter(payment => payment.creditId === credit.id && payment.status === 'confirmed' && !payment.deletedAt)
                        .reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0);
                      const outstanding = Math.max(0, Number(credit.totalDue) || 0);
                      const progress = credit.status === 'paid' ? 100
                        : paidAmount + outstanding > 0 ? Math.min(100, Math.round((paidAmount / (paidAmount + outstanding)) * 100)) : 0;
                      return (
                        <>
                          <div className="mb-1 flex justify-between text-[10px] font-bold">
                            <span className="text-muted-foreground">PAGO</span>
                            <span className={progress >= 100 ? "text-success" : "text-primary"}>{progress}%</span>
                          </div>
                          <Progress value={progress} className="h-1.5" />
                        </>
                      );
                    })()}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="text-sm">
                    <p className="font-medium">{formatDate(credit.dueDate)}</p>
                    {credit.daysOverdue > 0 && (
                      <p className="text-danger">{credit.daysOverdue} dias em atraso</p>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant={statusConfig[credit.status]?.variant || 'default'}>
                    {credit.status === 'active' && credit.paidInstallments > 0 ? 'Em Liquidação' : (statusConfig[credit.status]?.label || credit.status)}
                  </Badge>
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem className="gap-2" onClick={() => handleViewDetails(credit)}>
                        <Eye className="h-4 w-4" />
                        Ver Detalhes
                      </DropdownMenuItem>
                      <DropdownMenuItem className="gap-2" onClick={() => setAuditTarget({ mode: 'entity', key: credit.id, label: `Crédito de ${credit.clientName}` })}>
                        <FileClock className="h-4 w-4" />
                        Histórico de auditoria
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="gap-2"
                        onClick={() => handleRegisterPayment(credit)}
                        disabled={!['active', 'overdue', 'defaulted', 'renegotiated'].includes(credit.status) || credit.currentBalance <= 0}
                      >
                        <Receipt className="h-4 w-4" />
                        Registar Pagamento
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="gap-2"
                        onClick={() => setMoraCredit(credit)}
                        disabled={['pending_approval', 'rejected', 'cancelled'].includes(credit.status)}
                      >
                        <AlarmClock className="h-4 w-4 text-destructive" />
                        Juros de Mora
                      </DropdownMenuItem>
                      {credit.status === 'paid' && (() => {
                        const standing = clientCreditStanding(credit.clientId, credits);
                        const blocked = newCreditBlockReason(standing, (value) => formatCurrency(value));
                        return (
                          <DropdownMenuItem
                            className="flex-col items-start gap-0.5"
                            disabled={!!blocked}
                            title={blocked || undefined}
                            onClick={() => {
                              setRenewalRequest({
                                clientId: credit.clientId, clientName: credit.clientName,
                                minAmount: standing.lastPaidPrincipal || Number(credit.principalAmount) || 0,
                              });
                              handleAddNew();
                            }}
                          >
                            <span className="flex items-center gap-2 font-semibold text-emerald-700 dark:text-emerald-400">
                              <PlusCircle className="h-4 w-4" /> Solicitar Novo Crédito
                            </span>
                            {blocked && <span className="max-w-[230px] pl-6 text-[11px] leading-snug text-muted-foreground">{blocked}</span>}
                          </DropdownMenuItem>
                        );
                      })()}
                      <DropdownMenuItem className="gap-2" onClick={() => handleViewHistory(credit.id)}>
                        <History className="h-4 w-4" />
                        Ver Histórico
                      </DropdownMenuItem>
                      <DropdownMenuItem className="gap-2" onClick={() => handleViewContract(credit)}>
                        <FileText className="h-4 w-4" />
                        Ver Contrato
                      </DropdownMenuItem>
                      <DropdownMenuItem className="gap-2" onClick={() => handleViewPromessaContract(credit)}>
                        <PenTool className="h-4 w-4 text-primary" />
                        Ver Contrato-Promessa
                      </DropdownMenuItem>
                      <DropdownMenuItem className="gap-2" onClick={() => handleAdjustmentClick(credit)}>
                        <Calculator className="h-4 w-4" />
                        Ajustar Valores
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="gap-2"
                        onClick={() => setReinforcementCredit(credit)}
                        disabled={!['active', 'overdue'].includes(credit.status)}
                      >
                        <PlusCircle className="h-4 w-4 text-emerald-600" />
                        Reforço de Capital
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="gap-2 text-destructive focus:text-destructive"
                        onClick={() => handleDeleteClick(credit)}
                      >
                        <Trash2 className="h-4 w-4" />
                        Excluir
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {/* Controles de Paginação */}
        <div className="flex items-center justify-between border-t border-muted px-4 py-4 bg-muted/20">
          <div className="text-sm text-muted-foreground">
            Mostrando <span className="font-medium">{filteredCredits.length === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1}</span> a <span className="font-medium">{Math.min(filteredCredits.length, currentPage * itemsPerPage)}</span> de <span className="font-medium">{filteredCredits.length}</span> créditos
          </div>
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
              disabled={currentPage === 1}
              className="h-8 w-8 p-0"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-medium">
              Página {currentPage} de {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
              disabled={currentPage === totalPages}
              className="h-8 w-8 p-0"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Create Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={(open) => { setIsCreateDialogOpen(open); if (!open) setRenewalRequest(null); }}>
        <DialogContent className={CREDIT_DIALOG_CONTENT_CLASS}>
          <DialogHeader className={CREDIT_DIALOG_HEADER_CLASS}>
            <DialogTitle className="flex items-center gap-2 text-xl font-bold tracking-tight text-white">
              <PlusCircle className="h-5 w-5 text-secondary" />
              {renewalRequest ? 'Solicitar Novo Crédito' : 'Emissão de Novo Contrato'}
            </DialogTitle>
            <DialogDescription className="mt-1 text-sm text-white/75">
              {renewalRequest
                ? `${renewalRequest.clientName} liquidou o crédito anterior. Valor mínimo: ${formatCurrency(renewalRequest.minAmount)}; o pedido segue o fluxo normal de aprovação.`
                : 'Defina o cliente, as condições e confirme o plano de liquidação.'}
            </DialogDescription>
          </DialogHeader>
          <CreditForm
            key={renewalRequest?.clientId || 'novo'}
            prefillData={renewalRequest ? { clientId: renewalRequest.clientId, principalAmount: renewalRequest.minAmount } : undefined}
            minPrincipalAmount={renewalRequest?.minAmount}
            onSubmit={handleCreateSubmit}
            clients={clients}
            credits={credits}
            onCancel={() => setIsCreateDialogOpen(false)}
            submitLabel="Solicitar Homologação"
          />
        </DialogContent>
      </Dialog>

      <TabelaTaxasDialog open={isRatesDialogOpen} onOpenChange={setIsRatesDialogOpen} />
      <JurosMoraDialog credit={moraCredit} open={!!moraCredit} onOpenChange={(open) => { if (!open) setMoraCredit(null); }} />
      <PlanoPagamentoDialog open={isPaymentPlanOpen} onOpenChange={setIsPaymentPlanOpen} />

      {/* Supplier Selection Modal */}
      <Dialog open={isSupplierSelectOpen} onOpenChange={setIsSupplierSelectOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Origem do Capital</DialogTitle>
            <DialogDescription>
              Selecione o fornecedor/parceiro proprietário deste capital e defina a taxa de retorno acordada.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="supplier-select">Parceiro / Fornecedor</Label>
              <select
                id="supplier-select"
                value={selectedSupplierId}
                onChange={(e) => { setSelectedSupplierId(e.target.value); if (e.target.value === 'propriocapit') setSupplierProfitRate(0); }}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="propriocapit">Capital Próprio (Nenhum parceiro)</option>
                {(suppliers || []).filter(s => s.status === 'active').map((sup) => (
                  <option key={sup.id} value={sup.id}>
                    {sup.name} {sup.nif ? `(NIF: ${sup.nif})` : ''}
                  </option>
                ))}
              </select>
            </div>

            {selectedSupplierId !== 'propriocapit' && pendingCreditData && (
              <>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="supplier-rate">Taxa do Fornecedor (%)</Label>
                  <Input
                    id="supplier-rate"
                    type="number"
                    min={0}
                    max={pendingCreditData.interestRate || 100}
                    step={0.1}
                    value={supplierProfitRate}
                    onChange={(e) => setSupplierProfitRate(Math.min(Number(e.target.value) || 0, pendingCreditData.interestRate || 100))}
                    placeholder="Ex: 30"
                    className="h-10"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Percentagem sobre o valor principal que vai para o fornecedor como lucro. Máx: {pendingCreditData.interestRate}%
                  </p>
                </div>

                {/* Live Preview */}
                {(() => {
                  const principal = pendingCreditData.principalAmount || 0;
                  const clientRate = pendingCreditData.interestRate || 0;
                  const juroTotal = principal * (clientRate / 100);
                  const lucroFornecedor = principal * (supplierProfitRate / 100);
                  const lucroGestor = Math.max(0, juroTotal - lucroFornecedor);
                  const totalDevolverFornecedor = principal + lucroFornecedor;
                  return (
                    <div className="bg-slate-50 dark:bg-slate-900/30 border border-border/50 rounded-xl p-4 space-y-3">
                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Previsão de Divisão de Lucros</p>
                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div>
                          <p className="text-muted-foreground">Valor Principal</p>
                          <p className="font-bold text-slate-700 dark:text-slate-200">{formatCurrency(principal)}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Juro Total ({clientRate}%)</p>
                          <p className="font-bold text-blue-600">{formatCurrency(juroTotal)}</p>
                        </div>
                        <div className="border-t pt-2">
                          <p className="text-muted-foreground">Lucro Fornecedor ({supplierProfitRate}%)</p>
                          <p className="font-bold text-indigo-600">{formatCurrency(lucroFornecedor)}</p>
                        </div>
                        <div className="border-t pt-2">
                          <p className="text-muted-foreground">Lucro Conta Própria ({Math.max(0, clientRate - supplierProfitRate).toFixed(1)}%)</p>
                          <p className="font-bold text-emerald-600">{formatCurrency(lucroGestor)}</p>
                        </div>
                      </div>
                      <div className="border-t pt-2">
                        <p className="text-[10px] text-muted-foreground">Total a devolver ao Fornecedor</p>
                        <p className="text-sm font-black text-primary">{formatCurrency(totalDevolverFornecedor)}</p>
                      </div>
                    </div>
                  );
                })()}
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setIsSupplierSelectOpen(false);
              setPendingCreditData(null);
            }}>
              Cancelar
            </Button>
            <Button onClick={handleConfirmSupplier}>
              Confirmar e Criar Crédito
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Payment Dialog (Called from Credit Action) */}
      <Dialog open={isPaymentDialogOpen} onOpenChange={setIsPaymentDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Registar Pagamento</DialogTitle>
            <DialogDescription>
              Para o crédito {selectedCredit?.id} de {selectedCredit?.clientName}
            </DialogDescription>
          </DialogHeader>
          <PaymentForm
            onSubmit={handlePaymentSubmit}
            credits={credits}
            initialCreditId={selectedCredit?.id}
            onCancel={() => setIsPaymentDialogOpen(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Credit Details Dialog */}
      <Dialog open={isDetailsDialogOpen} onOpenChange={setIsDetailsDialogOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Detalhes do Crédito</DialogTitle>
            <DialogDescription>
              Informações completas sobre a operação {selectedCredit?.id}
            </DialogDescription>
          </DialogHeader>
          {selectedCredit && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4 border-b pb-4">
                <div>
                  <h4 className="text-sm font-semibold text-muted-foreground uppercase">Cliente</h4>
                  <div className="flex items-center justify-between">
                    <p className="text-lg font-bold">{selectedCredit.clientName}</p>
                    <Button variant="outline" size="sm" className="gap-2" onClick={() => handleViewClientProfile(selectedCredit.clientId)}>
                      <Eye className="h-4 w-4" />
                      Ver Perfil
                    </Button>
                  </div>
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-muted-foreground uppercase">Status</h4>
                  <Badge variant={statusConfig[selectedCredit.status]?.variant || 'default'} className="mt-1">
                    {statusConfig[selectedCredit.status]?.label || selectedCredit.status}
                  </Badge>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-6">
                <div>
                  <h4 className="text-xs text-muted-foreground uppercase">Montante Principal</h4>
                  <p className="text-xl font-bold">{formatCurrency(selectedCredit.principalAmount)}</p>
                </div>
                <div>
                  <h4 className="text-xs text-muted-foreground uppercase">Saldo em Dívida</h4>
                  <p className="text-xl font-bold text-primary">{formatCurrency(selectedCredit.currentBalance)}</p>
                </div>
                <div>
                  <h4 className="text-xs text-muted-foreground uppercase">Total com Juros</h4>
                  <p className="text-xl font-bold">{formatCurrency(selectedCredit.totalDue)}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6 p-4 bg-muted/30 rounded-lg border">
                <div>
                  <p className="text-xs text-muted-foreground">Juros Acumulados</p>
                  <p className="font-semibold">{formatCurrency(selectedCredit.accruedInterest)} ({formatPercentage(selectedCredit.interestRate)})</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Juros de Mora</p>
                  <p className="font-semibold text-danger">{formatCurrency(selectedCredit.lateInterest)} (+{formatPercentage(selectedCredit.lateInterestRate)}/dia)</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Data de Início</p>
                  <p className="font-semibold">{formatDate(selectedCredit.createdAt)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Vencimento Original</p>
                  <p className="font-semibold">{formatDate(selectedCredit.dueDate)}</p>
                </div>
                {companySettings.enableSuppliersModule && (
                  <div className="col-span-2 border-t pt-2 mt-2">
                    <p className="text-xs text-muted-foreground">Origem do Capital / Parceiro</p>
                    <p className="font-semibold text-primary">
                      {selectedCredit.supplierId 
                        ? (suppliers.find(s => s.id === selectedCredit.supplierId)?.name || 'Parceiro Associado') 
                        : 'Capital Próprio (Nenhum parceiro)'}
                    </p>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button variant="outline" onClick={() => setIsDetailsDialogOpen(false)}>Fechar</Button>
                {selectedCredit.status !== 'paid' && selectedCredit.currentBalance > 0 && (
                  <Button className="gap-2" onClick={() => handleRegisterPayment(selectedCredit)}>
                    <Receipt className="h-4 w-4" />
                    Registar Pagamento
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Adjustment Dialog */}
      <Dialog open={isAdjustmentDialogOpen} onOpenChange={setIsAdjustmentDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Ajuste Manual de Valores</DialogTitle>
            <DialogDescription>
              Ajuste manualmente os juros acumulados ou juros de mora para {selectedCredit?.id}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="adj-interest">Juros Acumulados (Correntes)</Label>
              <Input
                id="adj-interest"
                type="number"
                min="0"
                step="0.01"
                value={adjustments.accruedInterest}
                onChange={(e) => setAdjustments(prev => ({ ...prev, accruedInterest: Number(e.target.value) }))}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="adj-late">Juros de Mora (Penalidade)</Label>
              <Input
                id="adj-late"
                type="number"
                min="0"
                step="0.01"
                value={adjustments.lateInterest}
                onChange={(e) => setAdjustments(prev => ({ ...prev, lateInterest: Number(e.target.value) }))}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="adj-reason">Justificação obrigatória</Label>
              <Textarea id="adj-reason" value={adjustmentReason}
                onChange={event => setAdjustmentReason(event.target.value)}
                maxLength={1000} placeholder="Descreva o motivo e a evidência do ajuste." />
            </div>
            <div className="p-3 bg-muted rounded-lg text-sm">
              <p><strong>Novo Total a Pagar:</strong> {formatCurrency(selectedCredit ? selectedCredit.currentBalance + adjustments.accruedInterest + adjustments.lateInterest : 0)}</p>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setIsAdjustmentDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleAdjustmentSubmit}>Confirmar Ajuste</Button>
          </div>
        </DialogContent>
      </Dialog>

      <JustificationModal
        isOpen={justificationModal.isOpen}
        onClose={() => setJustificationModal({ isOpen: false, creditId: null })}
        onConfirm={handleConfirmDelete}
        title="Excluir Crédito"
        description="Esta ação removerá o crédito permanentemente (soft delete) e registrará a justificativa na auditoria. Esta ação não pode ser desfeita."
        confirmText="Confirmar Exclusão"
        actionType="destructive"
      />
      {/* Diálogo de Pré-visualização de PDF */}
      <Dialog open={!!previewPdfUrl} onOpenChange={(open) => !open && setPreviewPdfUrl(null)}>
        <DialogContent className="max-w-[94vw] w-full h-[92vh] p-0 gap-0 overflow-hidden bg-slate-100 border border-white/10 shadow-2xl rounded-2xl flex flex-col">
          <div className="min-h-[82px] px-6 py-4 pr-16 bg-slate-950 text-white border-b border-white/10 flex flex-row items-center justify-between gap-4 shrink-0 shadow-lg z-10 [&_.text-slate-900]:text-white [&_.text-slate-500]:text-white/70">
            <div>
              <DialogTitle className="text-lg font-bold text-slate-900">Visualização do Contrato</DialogTitle>
              <DialogDescription className="text-xs text-slate-500">Imprima ou salve este documento por aqui.</DialogDescription>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              {companySettings.digitalSignatureEnabled && user?.signature && (
                <Button
                  variant="outline"
                  className="gap-2 h-10 border-green-200 bg-white text-green-700 hover:bg-green-50 shadow-sm"
                  onClick={() => {
                    if (selectedCredit) {
                      const url = generateContractPDF(selectedCredit, companySettings, [], 'blob', user?.name, user.signature);
                      if (url) setPreviewPdfUrl(url as any);
                      toast({
                        title: 'Assinatura Aplicada',
                        description: 'O documento foi assinado eletronicamente.',
                      });
                    }
                  }}
                >
                  <PenTool className="h-4 w-4" />
                  Assinar
                </Button>
              )}
              <Button className="gap-2 h-10 bg-blue-600 text-white hover:bg-blue-700 shadow-sm" onClick={() => {
                const link = document.createElement('a');
                link.href = previewPdfUrl || '';
                link.download = `Contrato-${selectedCredit?.id || 'doc'}.pdf`;
                link.click();
              }}>
                <FileText className="h-4 w-4" />
                Baixar PDF
              </Button>
              <Button
                variant="outline"
                className="gap-2 h-10 border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white"
                onClick={() => setPreviewPdfUrl(null)}
              >
                <X className="h-4 w-4" />
                Fechar
              </Button>
            </div>
          </div>
          <div className="min-h-0 flex-1 w-full relative bg-slate-200/70 p-6 overflow-hidden">
            {previewPdfUrl ? (
              <PdfCanvasViewer source={previewPdfUrl} />
            ) : (
              <div className="flex items-center justify-center h-full">
                <p className="text-muted-foreground">Carregando visualização...</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AlertModal
        isOpen={alertConfig.isOpen}
        onClose={() => setAlertConfig({ ...alertConfig, isOpen: false })}
        title={alertConfig.title}
        description={alertConfig.description}
        type={alertConfig.type}
      />

      <ClientDetailsModal
        client={clientForDetails}
        open={isClientDetailsOpen}
        onOpenChange={setIsClientDetailsOpen}
      />

      <ConfirmSharingModal
        isOpen={sharingModal.isOpen}
        onClose={() => setSharingModal(prev => ({ ...prev, isOpen: false }))}
        onConfirm={handleShareConfirm}
        title="Crédito Registado!"
        description="O crédito foi criado com sucesso"
        clientName={sharingModal.clientName}
      />

      <DebtSettlementModal
        isOpen={settlementModal.isOpen}
        onClose={() => setSettlementModal(prev => ({ ...prev, isOpen: false }))}
        creditId={settlementModal.creditId}
        clientName={settlementModal.clientName}
        amountPaid={settlementModal.amountPaid}
        companySettings={companySettings}
      />

      <PromessaDetailsModal
        isOpen={promessaModal.isOpen}
        onClose={() => setPromessaModal({ isOpen: false, credit: null, client: null })}
        credit={promessaModal.credit}
        client={promessaModal.client}
        companySettings={companySettings}
        userName={user?.name}
      />

      {/* Dialog para Fecho de Mês */}
      <Dialog open={isCloseModalOpen} onOpenChange={setIsCloseModalOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calculator className="h-5 w-5 text-indigo-500" />
              Consolidação e Fecho de Mês
            </DialogTitle>
            <DialogDescription>
              Confirme os indicadores financeiros do período antes de realizar o encerramento.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 my-4 p-4 bg-muted/30 rounded-lg border">
            <div className="flex justify-between items-center pb-2 border-b border-border/60">
              <span className="text-sm font-semibold text-muted-foreground">Período de Referência</span>
              <span className="text-sm font-bold text-foreground">{MONTH_FULL_NAMES[selectedMonth]} de {selectedYear}</span>
            </div>
            
            <div className="flex justify-between items-center py-1">
              <span className="text-sm text-muted-foreground">Capital Total Aplicado:</span>
              <span className="text-sm font-bold text-red-500">{formatCurrency(monthlySummary.capitalApplied)}</span>
            </div>

            <div className="flex justify-between items-center py-1">
              <span className="text-sm text-muted-foreground">Lucro Projetado (Juros):</span>
              <span className="text-sm font-bold text-blue-500">{formatCurrency(monthlySummary.projectedProfit)}</span>
            </div>

            <div className="flex justify-between items-center py-1">
              <span className="text-sm text-muted-foreground">Lucro Recebido (Realizado):</span>
              <span className="text-sm font-bold text-emerald-500">{formatCurrency(monthlySummary.realizedProfit)}</span>
            </div>

            <div className="flex justify-between items-center py-1">
              <span className="text-sm text-muted-foreground">Saldo em Aberto (Pendente):</span>
              <span className="text-sm font-bold text-amber-500">{formatCurrency(monthlySummary.outstandingCapital)}</span>
            </div>

            <div className="flex justify-between items-center py-1">
              <span className="text-sm text-muted-foreground">Créditos em Incumprimento / Atraso:</span>
              <span className="text-sm font-bold text-red-600">{formatCurrency(overdueAmount)}</span>
            </div>

            <div className="flex justify-between items-center pt-2 border-t border-border/60">
              <span className="text-sm font-semibold text-muted-foreground">Taxa de Liquidação de Capital</span>
              <span className="text-sm font-bold text-foreground">{liquidationRate.toFixed(2)}%</span>
            </div>
          </div>

          <div className="bg-amber-500/10 p-3 rounded-lg border border-amber-500/20 text-xs text-amber-600 dark:text-amber-400 space-y-1">
            <p className="font-bold flex items-center gap-1.5">
              <AlertCircle className="h-4 w-4" />
              Atenção
            </p>
            <p>Após confirmar o fecho do mês, não será possível conceder ou importar créditos neste período. Um relatório oficial consolidado em PDF será gerado automaticamente.</p>
          </div>

          <div className="flex justify-end gap-3 mt-4">
            <Button variant="outline" onClick={() => setIsCloseModalOpen(false)}>
              Cancelar
            </Button>
            <Button className="bg-indigo-600 hover:bg-indigo-700 text-white" onClick={handleConfirmCloseMonth}>
              Confirmar e Gerar Relatório
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Credit Summary Details Modal */}
      <CreditSummaryDetailsModal
        isOpen={detailsModal.isOpen}
        onClose={() => setDetailsModal({ ...detailsModal, isOpen: false })}
        credits={openCredits}
        clients={clients}
        payments={payments}
        type={detailsModal.type}
        companySettings={companySettings}
      />

      {/* Period Metric Details Modal */}
      <PeriodMetricDetailsModal
        isOpen={periodMetricModal.isOpen}
        onClose={() => setPeriodMetricModal({ ...periodMetricModal, isOpen: false })}
        type={periodMetricModal.type}
        periodLabel={activePeriodRange.label}
        credits={periodCredits}
        clients={clients}
        payments={monthlyPayments}
        allPayments={payments}
        companySettings={companySettings}
      />

      {/* Annual Report Modal */}
      <AnnualReportModal
        isOpen={annualReportOpen}
        onClose={() => setAnnualReportOpen(false)}
        year={selectedYear}
        credits={credits}
        payments={payments}
        closedMonths={closedMonths}
        companySettings={companySettings}
        userName={user?.name}
      />

      {/* Agenda de Tarefas do Calendário */}
      <ReinforcementModal
        isOpen={!!reinforcementCredit}
        onClose={() => setReinforcementCredit(null)}
        credit={reinforcementCredit}
      />

      <CalendarTasksModal
        open={isTaskCalendarOpen}
        onOpenChange={setIsTaskCalendarOpen}
        initialYear={selectedYear}
        initialMonth={selectedMonth}
        tasks={calendarTasks}
        onAddTask={(task) => addCalendarTask(task, user ? { id: user.id, name: user.name } : undefined)}
        onDeleteTask={(id) => deleteCalendarTask(id, user ? { id: user.id, name: user.name } : undefined)}
      />

      {/* Modal de Saídas vs Entradas do Dia (Fluxo de Caixa Diário) */}
      <DailyCashFlowModal
        open={isDailyCashFlowOpen}
        onOpenChange={setIsDailyCashFlowOpen}
        initialDate={todayCalendarDate}
      />
      <InvestigacaoAuditoria target={auditTarget} events={[]} onClose={() => setAuditTarget(null)} />
    </MainLayout >
  );
}
