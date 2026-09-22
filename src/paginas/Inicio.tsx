import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { MainLayout } from '@/componentes/layout/MainLayout';
import { formatDateSafe } from '@/bibliotecas/utils';
import { applyBranding, getCompanySettings } from '@/bibliotecas/pdf';
import { cn } from '../bibliotecas/utils';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/componentes/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/componentes/ui/select';
import { useData } from '@/contextos/ContextoDados';
import { useAuth } from '@/contextos/ContextoAutenticacao';
import { formatCurrency } from '@/bibliotecas/formatters';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/componentes/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/componentes/ui/table";
import { Button } from '@/componentes/ui/button';
import { Input } from '@/componentes/ui/input';
import {
  Users,
  CreditCard,
  Wallet,
  TrendingUp,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
  Activity,
  Award,
  TrendingDown,
  Eye,
  Search,
  ShieldPlus,
  Download,
  EyeOff,
  FileText
} from 'lucide-react';
import { LicenseRenewalModal } from '@/componentes/dashboard/LicenseRenewalModal';
import { subDays, subMonths, isAfter, isBefore, format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, startOfQuarter, endOfQuarter, startOfYear, endOfYear } from 'date-fns';
import { validateLicense, getMachineId } from '@/bibliotecas/licenciamento';
import { useTangoAI } from '@/ganchos/usar-tango-ai';
import { Sparkles, ShieldCheck, Key, Clock, Lightbulb, Zap, Brain, Fingerprint, X, RotateCcw } from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
  Legend,
  LineChart,
  Line
} from 'recharts';

export default function Dashboard() {
  const { clients, credits, payments, contracts, companySettings } = useData();
  const { user } = useAuth();

  // Estado para Ordenação dos Melhores Clientes
  const [clientSort, setClientSort] = useState<'desc' | 'asc'>('desc');

  // Estado para o Modal de Detalhes
  const [detailsModal, setDetailsModal] = useState<{
    isOpen: boolean;
    title: string;
    type: 'profits' | 'invested' | 'overdue' | 'risk' | null;
  }>({
    isOpen: false,
    title: '',
    type: null
  });
  const [profitSearchTerm, setProfitSearchTerm] = useState('');
  const [selectedProfitClient, setSelectedProfitClient] = useState<any | null>(null);
  const [investedSearchTerm, setInvestedSearchTerm] = useState('');
  const [investedPage, setInvestedPage] = useState(1);
  const [profitPeriod, setProfitPeriod] = useState<'all' | 'week' | 'month' | 'quarter' | 'year' | 'custom'>('all');
  const [profitStartDate, setProfitStartDate] = useState('');
  const [profitEndDate, setProfitEndDate] = useState('');
  const [investedPeriod, setInvestedPeriod] = useState<'all' | 'week' | 'month' | 'quarter' | 'year' | 'custom'>('all');
  const [investedStartDate, setInvestedStartDate] = useState('');
  const [investedEndDate, setInvestedEndDate] = useState('');
  const [investedCategoryFilter, setInvestedCategoryFilter] = useState<'all' | 'COMUM' | 'APOSENTADO' | 'ESTRANGEIRO'>('all');
  const [pendingFinancialReport, setPendingFinancialReport] = useState<{ clientRow?: any } | null>(null);

  // --- CONTROLO DE TRIAL E BOAS-VINDAS ---
  const [showWelcomeModal, setShowWelcomeModal] = useState(false);
  const [licenseInfo, setLicenseInfo] = useState<any>({ isValid: false, type: 'trial', daysRemaining: 0 });
  const [showExpirationWarning, setShowExpirationWarning] = useState(false);
  const [isLicenseRenewalOpen, setIsLicenseRenewalOpen] = useState(false);
  const [machineId, setMachineId] = useState('Carregando...');

  useEffect(() => {
    const checkLicenseStatus = async () => {
      try {
        const license = await validateLicense(companySettings?.licenseKey || '');
        setLicenseInfo(license);
        setMachineId(await getMachineId());

        // Welcome Modal Logic
        const hasSeenWelcome = localStorage.getItem('tango_welcome_seen');
        if (!hasSeenWelcome && license.type === 'trial' && license.isValid) {
          setShowWelcomeModal(true);
        }

        // Expiration Warning Logic
        if (license.isValid && license.type !== 'lifetime') {
          const hasSeenWarningToday = localStorage.getItem(`tango_exp_warning_${new Date().toDateString()}`);
          if (license.daysRemaining <= 3 && !hasSeenWarningToday) {
            setShowExpirationWarning(true);
          }
        }
      } catch (e) {
        console.error("License check error:", e);
      }
    };

    checkLicenseStatus();
  }, [companySettings?.licenseKey]);

  const handleCloseWelcome = () => {
    localStorage.setItem('tango_welcome_seen', 'true');
    setShowWelcomeModal(false);
  };

  const handleCloseWarning = () => {
    localStorage.setItem(`tango_exp_warning_${new Date().toDateString()}`, 'true');
    setShowExpirationWarning(false);
  };

  // Fallback para evitar ReferenceError caso exista botão chamando esta função
  const handleExportPDF = () => {
    // Implementação futura ou placeholder
    console.log("Exportar PDF clicado");
  };

  // --- Cálculos de Dados Dinâmicos ---

  const calculateTrend = (current: number, previous: number) => {
    if (previous === 0 && current === 0) return null;
    if (previous === 0) return current > 0 ? { value: 100, isPositive: true } : null;
    const diff = ((current - previous) / previous) * 100;
    if (diff === 0 && current === 0) return null;
    return { value: Math.abs(Math.round(diff * 10) / 10), isPositive: diff >= 0 };
  };

  const now = new Date();
  const last7Days = subDays(now, 7);
  const prev14Days = subDays(now, 14);

  const isValidDate = useCallback((d: any) => d && !isNaN(new Date(d).getTime()), []);

  const toDateInputValue = (date: Date) => format(date, 'yyyy-MM-dd');

  const parseDateInput = useCallback((value: string, endOfDay = false) => {
    if (!value) return null;
    const date = new Date(`${value}T${endOfDay ? '23:59:59' : '00:00:00'}`);
    return Number.isNaN(date.getTime()) ? null : date;
  }, []);

  type PeriodFilter = 'all' | 'week' | 'month' | 'quarter' | 'year' | 'custom';

  const buildPeriodRange = useCallback((period: PeriodFilter, startValue: string, endValue: string) => {
    const today = new Date();
    if (period === 'week') {
      return {
        start: startOfWeek(today, { weekStartsOn: 1 }),
        end: endOfWeek(today, { weekStartsOn: 1 }),
        label: 'Semana atual'
      };
    }
    if (period === 'month') {
      return { start: startOfMonth(today), end: endOfMonth(today), label: 'Mês atual' };
    }
    if (period === 'quarter') {
      return { start: startOfQuarter(today), end: endOfQuarter(today), label: 'Trimestre atual' };
    }
    if (period === 'year') {
      return { start: startOfYear(today), end: endOfYear(today), label: 'Ano atual' };
    }
    if (period === 'custom') {
      const start = parseDateInput(startValue, false);
      const end = parseDateInput(endValue, true);
      const label = start || end
        ? `${start ? format(start, 'dd/MM/yyyy') : 'Início'} a ${end ? format(end, 'dd/MM/yyyy') : 'Fim'}`
        : 'Período personalizado';
      return { start, end, label };
    }
    return { start: null, end: null, label: 'Todo o histórico' };
  }, [parseDateInput]);

  const profitDateRange = useMemo(() => {
    const today = new Date();
    if (profitPeriod === 'week') {
      return {
        start: startOfWeek(today, { weekStartsOn: 1 }),
        end: endOfWeek(today, { weekStartsOn: 1 }),
        label: 'Semana atual'
      };
    }
    if (profitPeriod === 'month') {
      return { start: startOfMonth(today), end: endOfMonth(today), label: 'Mês atual' };
    }
    if (profitPeriod === 'quarter') {
      return { start: startOfQuarter(today), end: endOfQuarter(today), label: 'Trimestre atual' };
    }
    if (profitPeriod === 'year') {
      return { start: startOfYear(today), end: endOfYear(today), label: 'Ano atual' };
    }
    if (profitPeriod === 'custom') {
      const start = parseDateInput(profitStartDate, false);
      const end = parseDateInput(profitEndDate, true);
      const label = start || end
        ? `${start ? format(start, 'dd/MM/yyyy') : 'Início'} a ${end ? format(end, 'dd/MM/yyyy') : 'Fim'}`
        : 'Período personalizado';
      return { start, end, label };
    }
    return { start: null, end: null, label: 'Todo o histórico' };
  }, [profitPeriod, profitStartDate, profitEndDate, parseDateInput]);

  const investedDateRange = useMemo(() => {
    return buildPeriodRange(investedPeriod, investedStartDate, investedEndDate);
  }, [investedPeriod, investedStartDate, investedEndDate, buildPeriodRange]);

  const isWithinProfitPeriod = useCallback((date: any) => {
    if (!isValidDate(date)) return false;
    const value = new Date(date);
    if (profitDateRange.start && isBefore(value, profitDateRange.start)) return false;
    if (profitDateRange.end && isAfter(value, profitDateRange.end)) return false;
    return true;
  }, [isValidDate, profitDateRange]);

  const isWithinInvestedPeriod = useCallback((date: any) => {
    if (!isValidDate(date)) return false;
    const value = new Date(date);
    if (investedDateRange.start && isBefore(value, investedDateRange.start)) return false;
    if (investedDateRange.end && isAfter(value, investedDateRange.end)) return false;
    return true;
  }, [investedDateRange, isValidDate]);

  const currentWeekPayments = payments.filter(p => isValidDate(p.paymentDate) && isAfter(new Date(p.paymentDate), last7Days));
  const previousWeekPayments = payments.filter(p =>
    isValidDate(p.paymentDate) && isAfter(new Date(p.paymentDate), prev14Days) && isBefore(new Date(p.paymentDate), last7Days)
  );

  const revenueCurrentWeek = currentWeekPayments.reduce((acc, p) => acc + p.allocatedToInterest + p.allocatedToLateInterest, 0);
  const revenuePreviousWeek = previousWeekPayments.reduce((acc, p) => acc + p.allocatedToInterest + p.allocatedToLateInterest, 0);
  const revenueTrend = calculateTrend(revenueCurrentWeek, revenuePreviousWeek);

  // 1. Cartões de KPI e Percentagens
  const totalClients = clients.length;
  const openCreditStatuses = useMemo(() => new Set(['active', 'overdue', 'defaulted', 'renegotiated']), []);
  const isCreditOpen = useCallback((credit: any) => {
    const balance = Number(credit.currentBalance || 0);
    const paidInstallments = Number(credit.paidInstallments || 0);
    const installments = Number(credit.installments || 0);
    return openCreditStatuses.has(credit.status) && (balance > 0.01 || (installments > 0 && paidInstallments < installments));
  }, [openCreditStatuses]);
  const activeCredits = credits.filter(c => c.status === 'active' && isCreditOpen(c));
  const overdueCredits = credits.filter(c => (c.status === 'overdue' || c.status === 'defaulted') && isCreditOpen(c));

  const historicalDisbursed = credits.reduce((acc, c) => acc + c.principalAmount, 0);
  const totalDisbursed = credits
    .filter(c => c.status === 'active' && !c.deletedAt && isCreditOpen(c))
    .reduce((sum, c) => {
      const paidPrincipal = payments
        .filter(p => p.creditId === c.id && p.status !== 'cancelled' && !p.deletedAt)
        .reduce((pSum, p) => pSum + Number(p.allocatedToPrincipal || 0), 0);
      return sum + Math.max(0, Number(c.principalAmount || 0) - paidPrincipal);
    }, 0);
  const totalProfit = payments.reduce((acc, p) => acc + p.allocatedToInterest + p.allocatedToLateInterest, 0);
  const totalCashTotal = payments.reduce((acc, p) => acc + p.amount, 0);
  const totalRecoveredCapital = payments.reduce((acc, p) => acc + Number(p.allocatedToPrincipal || 0), 0);
  const totalReceivedInterest = payments.reduce((acc, p) => acc + Number(p.allocatedToInterest || 0), 0);
  const totalReceivedLateInterest = payments.reduce((acc, p) => acc + Number(p.allocatedToLateInterest || 0), 0);
  const investmentReturnRate = historicalDisbursed > 0 ? (totalProfit / historicalDisbursed) * 100 : 0;
  // Total Outstanding not really used in new logic, but kept for cache? No, user wants Disbursed in card.
  const totalOutstanding = credits.reduce((acc, c) => acc + c.currentBalance, 0);

  // Overdue Interest defaults
  const totalOverdueInterest = overdueCredits.reduce((acc, c) => acc + c.lateInterest, 0);

  // Risk Calculation: Outstanding balance of overdue/defaulted credits
  const totalRiskValue = overdueCredits.reduce((acc, c) => acc + c.currentBalance, 0);
  const defaultRate = totalOutstanding > 0 ? (totalRiskValue / totalOutstanding) * 100 : 0;

  const paymentMethodLabels: Record<string, string> = {
    cash: 'Dinheiro',
    transfer: 'Transferência',
    reference: 'Referência',
    multicaixa: 'Multicaixa'
  };

  const receiveMethodLabels: Record<string, string> = {
    cash: 'Numerário',
    transfer: 'Transferência',
    reference: 'Referência',
    multicaixa: 'Multicaixa'
  };

  const creditStatusLabels: Record<string, { label: string; textColor: [number, number, number]; fillColor: [number, number, number] }> = {
    active: { label: 'Ativo', textColor: [22, 101, 52], fillColor: [220, 252, 231] },
    paid: { label: 'Pago', textColor: [29, 78, 216], fillColor: [219, 234, 254] },
    overdue: { label: 'Vencido', textColor: [185, 28, 28], fillColor: [254, 226, 226] },
    defaulted: { label: 'Incumprido', textColor: [127, 29, 29], fillColor: [254, 202, 202] },
    cancelled: { label: 'Cancelado', textColor: [75, 85, 99], fillColor: [243, 244, 246] },
    renegotiated: { label: 'Renegociado', textColor: [109, 40, 217], fillColor: [237, 233, 254] },
    pending_approval: { label: 'Pendente', textColor: [180, 83, 9], fillColor: [254, 243, 199] },
    rejected: { label: 'Rejeitado', textColor: [153, 27, 27], fillColor: [254, 226, 226] }
  };

  const profitPayments = useMemo(() => {
    return payments.filter(payment =>
      ((payment.allocatedToInterest || 0) + (payment.allocatedToLateInterest || 0)) > 0 &&
      isWithinProfitPeriod(payment.paymentDate)
    );
  }, [payments, isWithinProfitPeriod]);

  const profitClientRows = useMemo(() => {
    const grouped = new Map<string, any>();

    profitPayments
      .forEach(payment => {
        const credit = credits.find(c => c.id === payment.creditId);
        const client = clients.find(c => c.id === credit?.clientId || c.name === payment.clientName);
        const key = client?.id || credit?.clientId || payment.clientName;

        if (!grouped.has(key)) {
          grouped.set(key, {
            key,
            clientId: client?.id || credit?.clientId || '',
            clientName: client?.name || payment.clientName,
            registerNumber: client?.nif || client?.id || credit?.clientId || 'Sem registo',
            phone: client?.phone || '',
            email: client?.email || '',
            payments: [],
            totalPaid: 0,
            totalPrincipal: 0,
            totalInterest: 0,
            totalLateInterest: 0,
            totalProfit: 0,
            lastPaymentDate: payment.paymentDate
          });
        }

        const row = grouped.get(key);
        row.payments.push(payment);
        row.totalPaid += payment.amount || 0;
        row.totalPrincipal += payment.allocatedToPrincipal || 0;
        row.totalInterest += payment.allocatedToInterest || 0;
        row.totalLateInterest += payment.allocatedToLateInterest || 0;
        row.totalProfit += (payment.allocatedToInterest || 0) + (payment.allocatedToLateInterest || 0);

        if (isValidDate(payment.paymentDate) && (!isValidDate(row.lastPaymentDate) || new Date(payment.paymentDate) > new Date(row.lastPaymentDate))) {
          row.lastPaymentDate = payment.paymentDate;
        }
      });

    return Array.from(grouped.values()).sort((a, b) => b.totalProfit - a.totalProfit);
  }, [profitPayments, credits, clients, isValidDate]);

  const filteredProfitClientRows = useMemo(() => {
    const term = profitSearchTerm.trim().toLowerCase();
    if (!term) return profitClientRows;

    return profitClientRows.filter(row =>
      row.clientName.toLowerCase().includes(term) ||
      String(row.registerNumber).toLowerCase().includes(term) ||
      String(row.clientId).toLowerCase().includes(term) ||
      String(row.phone).toLowerCase().includes(term)
    );
  }, [profitClientRows, profitSearchTerm]);

  const investedByOrigin = useMemo(() => {
    const baseActive = credits.filter(c => c.status === 'active' && !c.deletedAt && isCreditOpen(c) && isWithinInvestedPeriod(c.startDate));

    const calcForCategory = (cat: 'COMUM' | 'APOSENTADO' | 'ESTRANGEIRO') => {
      const list = baseActive.filter(credit => {
        const client = clients.find(c => c.id === credit.clientId);
        return (client?.clientCategory || 'COMUM') === cat;
      });
      const amount = list.reduce((sum, credit) => {
        const paidPrincipal = payments
          .filter(p => p.creditId === credit.id && p.status !== 'cancelled' && !p.deletedAt)
          .reduce((pSum, p) => pSum + Number(p.allocatedToPrincipal || 0), 0);
        return sum + Math.max(0, Number(credit.principalAmount || 0) - paidPrincipal);
      }, 0);
      return { count: list.length, amount };
    };

    return {
      comum: calcForCategory('COMUM'),
      aposentado: calcForCategory('APOSENTADO'),
      estrangeiro: calcForCategory('ESTRANGEIRO')
    };
  }, [credits, clients, payments, isCreditOpen, isWithinInvestedPeriod]);

  const filteredInvestedCredits = useMemo(() => {
    const term = investedSearchTerm.trim().toLowerCase();
    const rows = [...credits]
      .filter(credit => {
        if (!(credit.status === 'active' && !credit.deletedAt && isCreditOpen(credit) && isWithinInvestedPeriod(credit.startDate))) {
          return false;
        }
        if (investedCategoryFilter !== 'all') {
          const client = clients.find(c => c.id === credit.clientId);
          const cat = client?.clientCategory || 'COMUM';
          if (cat !== investedCategoryFilter) return false;
        }
        return true;
      })
      .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());

    if (!term) return rows;

    return rows.filter(credit => {
      const client = clients.find(c => c.id === credit.clientId);
      return (
        credit.clientName.toLowerCase().includes(term) ||
        String(credit.id).toLowerCase().includes(term) ||
        String(client?.nif || '').toLowerCase().includes(term) ||
        String(client?.phone || '').toLowerCase().includes(term)
      );
    });
  }, [credits, clients, investedSearchTerm, investedCategoryFilter, isCreditOpen, isWithinInvestedPeriod]);

  const investedRowsPerPage = 10;
  const investedTotalPages = Math.max(1, Math.ceil(filteredInvestedCredits.length / investedRowsPerPage));
  const paginatedInvestedCredits = filteredInvestedCredits.slice(
    (investedPage - 1) * investedRowsPerPage,
    investedPage * investedRowsPerPage
  );

  useEffect(() => {
    if (investedPage > investedTotalPages) setInvestedPage(investedTotalPages);
  }, [investedPage, investedTotalPages]);

  const getClientForCredit = (credit: any) =>
    clients.find(client => client.id === credit?.clientId || client.name === credit?.clientName);

  const getCreditForPayment = (payment: any) =>
    credits.find(credit => credit.id === payment.creditId);

  const getClientForPayment = (payment: any) => {
    const credit = getCreditForPayment(payment);
    return clients.find(client => client.id === credit?.clientId || client.name === payment.clientName);
  };

  const getContractForCredit = (credit: any) =>
    contracts.find((contract: any) => contract.id === credit?.id || (
      contract.clientId === credit?.clientId &&
      Number(contract.value || 0) === Number(credit?.principalAmount || 0)
    ));

  const getClientScopeKeys = (row?: any) => {
    const keys = new Set<string>();
    const rows = row ? [row] : filteredProfitClientRows;

    rows.forEach(item => {
      if (item.clientId) keys.add(String(item.clientId));
      if (item.clientName) keys.add(String(item.clientName).toLowerCase());
      if (item.key) keys.add(String(item.key).toLowerCase());
    });

    return keys;
  };

  const isCreditInScope = (credit: any, keys: Set<string>) => {
    if (keys.size === 0) return true;
    const client = getClientForCredit(credit);
    return (
      keys.has(String(credit.clientId || '')) ||
      keys.has(String(client?.id || '')) ||
      keys.has(String(credit.clientName || '').toLowerCase()) ||
      keys.has(String(client?.name || '').toLowerCase())
    );
  };

  const isPaymentInScope = (payment: any, keys: Set<string>) => {
    if (keys.size === 0) return true;
    const credit = getCreditForPayment(payment);
    const client = getClientForPayment(payment);
    return (
      keys.has(String(credit?.clientId || '')) ||
      keys.has(String(client?.id || '')) ||
      keys.has(String(payment.clientName || '').toLowerCase()) ||
      keys.has(String(client?.name || '').toLowerCase())
    );
  };

  const buildFinancialMovements = (clientRow?: any) => {
    const keys = getClientScopeKeys(clientRow);

    const creditMovements = credits
      .filter(credit => isWithinProfitPeriod(credit.startDate) && isCreditInScope(credit, keys))
      .map(credit => {
        const client = getClientForCredit(credit);
        const contract = getContractForCredit(credit) as any;
        const contractMethod = contract?.receiveMethod || client?.receiveMethod || 'transfer';

        return {
          id: `credit-${credit.id}`,
          date: credit.startDate,
          operation: 'Empréstimo concedido',
          clientName: client?.name || credit.clientName,
          registerNumber: client?.nif || client?.id || credit.clientId || 'Sem registo',
          creditId: credit.id,
          contractModality: receiveMethodLabels[contractMethod] || contractMethod || 'N/A',
          paymentMethod: '-',
          loanedAmount: credit.principalAmount || 0,
          receivedAmount: 0,
          principalCollected: 0,
          interest: 0,
          lateInterest: 0,
          profit: 0,
          reference: credit.status || '-'
        };
      });

    const paymentMovements = payments
      .filter(payment => isWithinProfitPeriod(payment.paymentDate) && isPaymentInScope(payment, keys))
      .map(payment => {
        const credit = getCreditForPayment(payment);
        const client = getClientForPayment(payment);
        const contract = getContractForCredit(credit) as any;
        const contractMethod = contract?.receiveMethod || client?.receiveMethod || 'transfer';
        const profit = (payment.allocatedToInterest || 0) + (payment.allocatedToLateInterest || 0);

        return {
          id: `payment-${payment.id}`,
          date: payment.paymentDate,
          operation: 'Pagamento recebido',
          clientName: client?.name || payment.clientName,
          registerNumber: client?.nif || client?.id || credit?.clientId || 'Sem registo',
          creditId: payment.creditId,
          contractModality: receiveMethodLabels[contractMethod] || contractMethod || 'N/A',
          paymentMethod: paymentMethodLabels[payment.method] || payment.method || 'N/A',
          loanedAmount: credit?.principalAmount || 0,
          receivedAmount: payment.amount || 0,
          principalCollected: payment.allocatedToPrincipal || 0,
          interest: payment.allocatedToInterest || 0,
          lateInterest: payment.allocatedToLateInterest || 0,
          profit,
          reference: payment.reference || payment.id || '-'
        };
      });

    return [...creditMovements, ...paymentMovements]
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  };

  const openFinancialReportOptions = (clientRow?: any) => {
    setPendingFinancialReport({ clientRow });
  };

  const exportFinancialMovementsReport = (clientRow?: any, options: { includeProfit?: boolean } = {}) => {
    const includeProfit = options.includeProfit !== false;
    const movements = buildFinancialMovements(clientRow);
    const paymentRows = movements.filter(row => row.operation === 'Pagamento recebido');
    const creditRows = movements.filter(row => row.operation === 'Empréstimo concedido');
    const title = clientRow
      ? `Histórico financeiro - ${clientRow.clientName}`
      : includeProfit
        ? 'Relatório detalhado de movimentações e lucros'
        : 'Relatório detalhado de movimentações';
    const config = getCompanySettings(companySettings);
    const generatedBy = user?.name || 'Sistema';
    const currency = config.currency || companySettings?.currency || 'AOA';
    const primary = Array.isArray(config.primaryColor) ? config.primaryColor as [number, number, number] : [37, 99, 235] as [number, number, number];
    const dark = [15, 23, 42] as [number, number, number];
    const subtle = [248, 250, 252] as [number, number, number];
    const formatMoney = (value: number) => formatCurrency(value, currency);
    const getReferenceLabel = (reference: any) => {
      const raw = String(reference || '-');
      return creditStatusLabels[raw]?.label || raw;
    };

    const totals = {
      loaned: creditRows.reduce((acc, row) => acc + row.loanedAmount, 0),
      received: paymentRows.reduce((acc, row) => acc + row.receivedAmount, 0),
      principal: paymentRows.reduce((acc, row) => acc + row.principalCollected, 0),
      interest: paymentRows.reduce((acc, row) => acc + row.interest, 0),
      lateInterest: paymentRows.reduce((acc, row) => acc + row.lateInterest, 0),
      profit: paymentRows.reduce((acc, row) => acc + row.profit, 0)
    };

    const doc = new jsPDF({ orientation: 'landscape' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    
    // 1. Aplica cabeçalho institucional completo com Logo, Nome da Empresa, NIF, Telefone e Email
    applyBranding(doc, config, generatedBy, false);

    // 2. Título do Relatório posicionado harmoniosamente abaixo do cabeçalho institucional
    doc.setFillColor(dark[0], dark[1], dark[2]);
    doc.rect(10, 40, pageWidth - 20, 18, 'F');
    doc.setFillColor(primary[0], primary[1], primary[2]);
    doc.rect(10, 40, 4, 18, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(255, 255, 255);
    doc.text(title, 18, 48);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.text(`Período: ${profitDateRange.label}   |   Gerado em: ${format(new Date(), 'dd/MM/yyyy HH:mm')}   |   Gerado por: ${generatedBy}`, 18, 54);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.text(includeProfit ? 'MODELO COM LUCROS' : 'MODELO SEM LUCROS', pageWidth - 16, 48, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.text(config.name || 'Tango Gestão de Créditos', pageWidth - 16, 54, { align: 'right' });

    const summaryCards = includeProfit
      ? [
        ['Âmbito', clientRow ? clientRow.registerNumber : `${filteredProfitClientRows.length} cliente(s)`],
        ['Emprestado', formatMoney(totals.loaned)],
        ['Recebido', formatMoney(totals.received)],
        ['Capital recuperado', formatMoney(totals.principal)],
        ['Juros', formatMoney(totals.interest)],
        ['Juros de mora', formatMoney(totals.lateInterest)],
        ['Lucro total', formatMoney(totals.profit)]
      ]
      : [
        ['Âmbito', clientRow ? clientRow.registerNumber : `${filteredProfitClientRows.length} cliente(s)`],
        ['Emprestado', formatMoney(totals.loaned)],
        ['Recebido', formatMoney(totals.received)],
        ['Capital recuperado', formatMoney(totals.principal)],
        ['Movimentos', String(movements.length)]
      ];

    const cardGap = 3;
    const cardWidth = (pageWidth - 20 - (summaryCards.length - 1) * cardGap) / summaryCards.length;
    const cardY = 62;
    summaryCards.forEach(([label, value], index) => {
      const x = 10 + index * (cardWidth + cardGap);
      const isProfitCard = label === 'Lucro total';
      doc.setDrawColor(isProfitCard ? 22 : 226, isProfitCard ? 163 : 232, isProfitCard ? 74 : 240);
      doc.setFillColor(isProfitCard ? 240 : subtle[0], isProfitCard ? 253 : subtle[1], isProfitCard ? 244 : subtle[2]);
      doc.roundedRect(x, cardY, cardWidth, 15, 2, 2, 'FD');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.5);
      doc.setTextColor(100, 116, 139);
      doc.text(label.toUpperCase(), x + 2.2, cardY + 4.5);
      doc.setFontSize(cardWidth < 34 ? 6.5 : 7.2);
      doc.setTextColor(isProfitCard ? 21 : 15, isProfitCard ? 128 : 23, isProfitCard ? 61 : 42);
      doc.text(doc.splitTextToSize(value, cardWidth - 4), x + 2.2, cardY + 10.5);
    });

    const detailHead = includeProfit
      ? [[
        'Data',
        'Operação',
        'Cliente',
        'Registo',
        'Contrato',
        'Modalidade do contrato',
        'Método de recebimento',
        'Valor emprestado',
        'Valor recebido',
        'Capital',
        'Juros',
        'Juros de mora',
        'Lucro',
        'Referência/Estado'
      ]]
      : [[
        'Data',
        'Operação',
        'Cliente',
        'Registo',
        'Contrato',
        'Modalidade do contrato',
        'Método de recebimento',
        'Valor emprestado',
        'Valor recebido',
        'Capital',
        'Referência/Estado'
      ]];

    const detailBody = movements.length > 0
      ? movements.map(row => {
        const base = [
          isValidDate(row.date) ? format(new Date(row.date), 'dd/MM/yyyy') : '-',
          row.operation,
          row.clientName,
          row.registerNumber,
          row.creditId,
          row.contractModality,
          row.paymentMethod,
          formatMoney(row.loanedAmount),
          formatMoney(row.receivedAmount),
          formatMoney(row.principalCollected)
        ];

        return includeProfit
          ? [
            ...base,
            formatMoney(row.interest),
            formatMoney(row.lateInterest),
            formatMoney(row.profit),
            getReferenceLabel(row.reference)
          ]
          : [
            ...base,
            getReferenceLabel(row.reference)
          ];
      })
      : [includeProfit
        ? ['-', 'Sem movimentos no período selecionado', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-']
        : ['-', 'Sem movimentos no período selecionado', '-', '-', '-', '-', '-', '-', '-', '-', '-']
      ];

    autoTable(doc, {
      startY: 83,
      head: detailHead,
      body: detailBody,
      theme: 'striped',
      styles: { fontSize: 6.7, cellPadding: 1.35, overflow: 'linebreak', textColor: [71, 85, 105] },
      headStyles: { fillColor: dark, textColor: [255, 255, 255], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        2: { cellWidth: 30 },
        5: { cellWidth: 25 },
        6: { cellWidth: 24 },
        7: { halign: 'right' },
        8: { halign: 'right' },
        9: { halign: 'right' },
        ...(includeProfit ? {
          10: { halign: 'right' },
          11: { halign: 'right' },
          12: { halign: 'right' }
        } : {})
      },
      margin: { left: 10, right: 10, bottom: 24 },
      didParseCell: (data: any) => {
        if (data.section !== 'body') return;

        if (data.column.index === 1) {
          if (data.cell.raw === 'Pagamento recebido') {
            data.cell.styles.textColor = [22, 101, 52];
            data.cell.styles.fontStyle = 'bold';
          }
          if (data.cell.raw === 'Empréstimo concedido') {
            data.cell.styles.textColor = [29, 78, 216];
            data.cell.styles.fontStyle = 'bold';
          }
        }

        const statusColumnIndex = detailHead[0].length - 1;
        if (data.column.index === statusColumnIndex) {
          const statusInfo = Object.values(creditStatusLabels).find(item => item.label === data.cell.raw);
          if (statusInfo) {
            data.cell.styles.textColor = statusInfo.textColor;
            data.cell.styles.fillColor = statusInfo.fillColor;
            data.cell.styles.fontStyle = 'bold';
            data.cell.styles.halign = 'center';
          }
        }
      },
      didDrawPage: () => {
        applyBranding(doc, config, generatedBy, true);
      }
    });

    const fileClient = clientRow?.clientName ? `_${clientRow.clientName}` : '';
    const modelSuffix = includeProfit ? 'Com_Lucros' : 'Sem_Lucros';
    const cleanName = `${clientRow ? 'Historico_Cliente' : 'Relatorio_Movimentacoes'}${fileClient}_${modelSuffix}_${profitDateRange.label}`
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '_');
    doc.save(`${cleanName}.pdf`);
  };

  const getInvestmentSnapshot = (credit: any) => {
    const client = getClientForCredit(credit);
    const contract = getContractForCredit(credit) as any;
    const contractMethod = contract?.receiveMethod || client?.receiveMethod || 'transfer';
    const creditPayments = payments.filter(payment => payment.creditId === credit.id);
    const periodPayments = creditPayments.filter(payment => isWithinInvestedPeriod(payment.paymentDate));
    const realizedProfitInPeriod = periodPayments.reduce((acc, payment) =>
      acc + Number(payment.allocatedToInterest || 0) + Number(payment.allocatedToLateInterest || 0), 0);
    const realizedProfitTotal = creditPayments.reduce((acc, payment) =>
      acc + Number(payment.allocatedToInterest || 0) + Number(payment.allocatedToLateInterest || 0), 0);
    const effectiveStatus = openCreditStatuses.has(credit.status) && !isCreditOpen(credit) ? 'paid' : credit.status;
    const expectedProfit = Math.max(
      Number(credit.totalDue || 0) - Number(credit.principalAmount || 0),
      Number(credit.accruedInterest || 0) + Number(credit.lateInterest || 0),
      0
    );
    const remainingExpectedProfit = Math.max(expectedProfit - realizedProfitTotal, 0);
    const clientCategory = client?.clientCategory || 'COMUM';
    const categoryLabel = clientCategory === 'APOSENTADO' ? 'Aposentado' : clientCategory === 'ESTRANGEIRO' ? 'Estrangeiro' : 'Normal';

    return {
      credit,
      client,
      contract,
      clientCategory,
      categoryLabel,
      date: credit.startDate,
      monthKey: isValidDate(credit.startDate) ? format(new Date(credit.startDate), 'yyyy-MM') : 'Sem data',
      monthLabel: isValidDate(credit.startDate) ? format(new Date(credit.startDate), 'MM/yyyy') : 'Sem data',
      clientName: client?.name || credit.clientName,
      registerNumber: client?.nif || client?.id || credit.clientId || 'Sem registo',
      contractModality: receiveMethodLabels[contractMethod] || contractMethod || 'N/A',
      investedAmount: Number(credit.principalAmount || 0),
      paidPrincipal: creditPayments.reduce((acc, payment) => acc + Number(payment.allocatedToPrincipal || 0), 0),
      realizedProfitInPeriod,
      realizedProfitTotal,
      expectedProfit,
      remainingExpectedProfit,
      installments: `${credit.paidInstallments || 0}/${credit.installments || 0}`,
      status: creditStatusLabels[effectiveStatus]?.label || effectiveStatus || '-',
      dueDate: credit.dueDate
    };
  };

  const buildInvestmentRows = () => filteredInvestedCredits.map(getInvestmentSnapshot);

  const exportInvestmentReport = () => {
    const rows = buildInvestmentRows();
    const config = getCompanySettings(companySettings);
    const generatedBy = user?.name || 'Sistema';
    const currency = config.currency || companySettings?.currency || 'AOA';
    const formatMoney = (value: number) => formatCurrency(value, currency);
    const primary = Array.isArray(config.primaryColor) ? config.primaryColor as [number, number, number] : [37, 99, 235] as [number, number, number];
    const dark = [15, 23, 42] as [number, number, number];
    const pageTitle = 'Relatório de investimentos disponibilizados em créditos';

    const totals = {
      invested: rows.reduce((acc, row) => acc + row.investedAmount, 0),
      paidPrincipal: rows.reduce((acc, row) => acc + row.paidPrincipal, 0),
      realizedProfit: rows.reduce((acc, row) => acc + row.realizedProfitInPeriod, 0),
      expectedProfit: rows.reduce((acc, row) => acc + row.expectedProfit, 0),
      remainingProfit: rows.reduce((acc, row) => acc + row.remainingExpectedProfit, 0)
    };

    const monthlyRows = Array.from(rows.reduce((map, row) => {
      const current = map.get(row.monthKey) || {
        monthKey: row.monthKey,
        monthLabel: row.monthLabel,
        count: 0,
        invested: 0,
        realizedProfit: 0,
        expectedProfit: 0
      };
      current.count += 1;
      current.invested += row.investedAmount;
      current.realizedProfit += row.realizedProfitInPeriod;
      current.expectedProfit += row.expectedProfit;
      map.set(row.monthKey, current);
      return map;
    }, new Map<string, any>()).values()).sort((a, b) =>
      b.invested - a.invested || String(a.monthKey).localeCompare(String(b.monthKey))
    );

    const doc = new jsPDF({ orientation: 'landscape' });
    const pageWidth = doc.internal.pageSize.getWidth();
    
    // 1. Aplica cabeçalho institucional completo com Logo, Nome da Empresa, NIF, Telefone e Email
    applyBranding(doc, config, generatedBy, false);

    // 2. Título do Relatório posicionado abaixo do cabeçalho institucional
    doc.setFillColor(dark[0], dark[1], dark[2]);
    doc.rect(10, 40, pageWidth - 20, 18, 'F');
    doc.setFillColor(primary[0], primary[1], primary[2]);
    doc.rect(10, 40, 4, 18, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(255, 255, 255);
    doc.text(pageTitle, 18, 48);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.text(`Período: ${investedDateRange.label}   |   Gerado em: ${format(new Date(), 'dd/MM/yyyy HH:mm')}   |   Gerado por: ${generatedBy}`, 18, 54);

    const summaryCards = [
      ['Créditos', String(rows.length)],
      ['Investido', formatMoney(totals.invested)],
      ['Capital recuperado', formatMoney(totals.paidPrincipal)],
      ['Lucro realizado no período', formatMoney(totals.realizedProfit)],
      ['Lucro previsto total', formatMoney(totals.expectedProfit)],
      ['Lucro a realizar', formatMoney(totals.remainingProfit)]
    ];
    const cardGap = 3;
    const cardWidth = (pageWidth - 20 - (summaryCards.length - 1) * cardGap) / summaryCards.length;
    const cardY = 62;
    summaryCards.forEach(([label, value], index) => {
      const x = 10 + index * (cardWidth + cardGap);
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(x, cardY, cardWidth, 15, 2, 2, 'FD');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.5);
      doc.setTextColor(100, 116, 139);
      doc.text(label.toUpperCase(), x + 2, cardY + 4.5);
      doc.setFontSize(7.2);
      doc.setTextColor(15, 23, 42);
      doc.text(doc.splitTextToSize(value, cardWidth - 4), x + 2, cardY + 10.5);
    });

    autoTable(doc, {
      startY: 82,
      head: [['Mês', 'Créditos', 'Total investido', 'Lucro realizado no período', 'Lucro previsto total']],
      body: monthlyRows.length > 0
        ? monthlyRows.map(row => [
          row.monthLabel,
          String(row.count),
          formatMoney(row.invested),
          formatMoney(row.realizedProfit),
          formatMoney(row.expectedProfit)
        ])
        : [['-', '0', formatMoney(0), formatMoney(0), formatMoney(0)]],
      theme: 'grid',
      styles: { fontSize: 7, cellPadding: 1.5 },
      headStyles: { fillColor: [30, 64, 175], textColor: [255, 255, 255] },
      columnStyles: {
        2: { halign: 'right' },
        3: { halign: 'right' },
        4: { halign: 'right' }
      },
      margin: { left: 10, right: 10, bottom: 24 },
      didDrawPage: () => applyBranding(doc, config, generatedBy, true)
    });

    autoTable(doc, {
      startY: ((doc as any).lastAutoTable?.finalY || 86) + 7,
      head: [[
        'Data',
        'Cliente',
        'Origem',
        'Registo',
        'Contrato',
        'Modalidade',
        'Valor investido',
        'Capital recuperado',
        'Lucro realizado no período',
        'Lucro previsto total',
        'Lucro a realizar',
        'Parcelas',
        'Vencimento',
        'Estado'
      ]],
      body: rows.length > 0
        ? rows.map(row => [
          isValidDate(row.date) ? format(new Date(row.date), 'dd/MM/yyyy') : '-',
          row.clientName,
          row.categoryLabel || 'Normal',
          row.registerNumber,
          row.credit.id,
          row.contractModality,
          formatMoney(row.investedAmount),
          formatMoney(row.paidPrincipal),
          formatMoney(row.realizedProfitInPeriod),
          formatMoney(row.expectedProfit),
          formatMoney(row.remainingExpectedProfit),
          row.installments,
          isValidDate(row.dueDate) ? format(new Date(row.dueDate), 'dd/MM/yyyy') : '-',
          row.status
        ])
        : [['-', 'Sem investimentos no período selecionado', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-']],
      theme: 'striped',
      styles: { fontSize: 6.5, cellPadding: 1.25, overflow: 'linebreak', textColor: [71, 85, 105] },
      headStyles: { fillColor: dark, textColor: [255, 255, 255] },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        1: { cellWidth: 26 },
        2: { cellWidth: 18 },
        6: { halign: 'right' },
        7: { halign: 'right' },
        8: { halign: 'right' },
        9: { halign: 'right' },
        10: { halign: 'right' },
        13: { halign: 'center' }
      },
      margin: { left: 10, right: 10, bottom: 24 },
      didParseCell: (data: any) => {
        if (data.section !== 'body' || data.column.index !== 13) return;
        const statusInfo = Object.values(creditStatusLabels).find(item => item.label === data.cell.raw);
        if (statusInfo) {
          data.cell.styles.textColor = statusInfo.textColor;
          data.cell.styles.fillColor = statusInfo.fillColor;
          data.cell.styles.fontStyle = 'bold';
        }
      },
      didDrawPage: () => applyBranding(doc, config, generatedBy, true)
    });

    const cleanName = `Relatorio_Investimentos_${investedDateRange.label}`
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '_');
    doc.save(`${cleanName}.pdf`);
  };

  // 2. Tendências de Fluxo de Caixa (Últimos 6 Meses)
  const getCashFlowData = () => {
    const months = [];
    const today = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      months.push(d);
    }
    return months.map(date => {
      const monthStr = date.toLocaleString('default', { month: 'short' });
      const monthPayments = payments.filter(p => {
        if (p.status === 'cancelled' || p.deletedAt) return false;
        const credit = credits.find(c => c.id === p.creditId);
        if (credit?.targetMonthId) {
          const [yearStr, monthStr] = credit.targetMonthId.split('-');
          return parseInt(yearStr) === date.getFullYear() && (parseInt(monthStr) - 1) === date.getMonth();
        }
        if (!isValidDate(p.paymentDate)) return false;
        const pDate = new Date(p.paymentDate);
        return pDate.getMonth() === date.getMonth() && pDate.getFullYear() === date.getFullYear();
      });
      const monthCredits = credits.filter(c => {
        if (c.deletedAt) return false;
        if (c.targetMonthId) {
          const [yearStr, monthStr] = c.targetMonthId.split('-');
          return parseInt(yearStr) === date.getFullYear() && (parseInt(monthStr) - 1) === date.getMonth();
        }
        if (!isValidDate(c.startDate)) return false;
        const cDate = new Date(c.startDate);
        return cDate.getMonth() === date.getMonth() && cDate.getFullYear() === date.getFullYear();
      });

      const entry = monthPayments.reduce((acc, p) => acc + p.amount, 0);
      const output = monthCredits.reduce((acc, c) => acc + c.principalAmount, 0);

      // Cálculo do Ticket Médio
      const count = monthCredits.length;
      const avgTicket = count > 0 ? output / count : 0;

      return {
        name: monthStr,
        Entradas: entry,
        Saidas: output,
        TicketMedio: avgTicket,
      };
    });
  };
  const cashFlowData = getCashFlowData();

  const cashFlowTotals = useMemo(() => {
    const totalEntradas = cashFlowData.reduce((sum, item) => sum + (item.Entradas || 0), 0);
    const totalSaidas = cashFlowData.reduce((sum, item) => sum + (item.Saidas || 0), 0);
    const saldoLiquido = totalEntradas - totalSaidas;
    const mediaMensal = cashFlowData.length > 0 ? totalEntradas / cashFlowData.length : 0;
    return {
      totalEntradas,
      totalSaidas,
      saldoLiquido,
      mediaMensal
    };
  }, [cashFlowData]);

  const cashFlowDetailItems = [
    {
      label: 'Entradas no Período',
      value: cashFlowTotals.totalEntradas,
      description: 'Recebimentos e amortizações arrecadadas',
      color: 'bg-emerald-500',
      textColor: 'text-emerald-600 dark:text-emerald-400'
    },
    {
      label: 'Saídas no Período',
      value: cashFlowTotals.totalSaidas,
      description: 'Capital emprestado e liberado a clientes',
      color: 'bg-rose-500',
      textColor: 'text-rose-600 dark:text-rose-400'
    },
    {
      label: 'Saldo Operacional',
      value: cashFlowTotals.saldoLiquido,
      description: cashFlowTotals.saldoLiquido >= 0 ? 'Superávit líquido apurado no período' : 'Déficit líquido apurado no período',
      color: cashFlowTotals.saldoLiquido >= 0 ? 'bg-emerald-500' : 'bg-rose-500',
      textColor: cashFlowTotals.saldoLiquido >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
    },
    {
      label: 'Média Mensal Entradas',
      value: cashFlowTotals.mediaMensal,
      description: 'Volume médio mensal de entrada de caixa',
      color: 'bg-blue-500',
      textColor: 'text-blue-600 dark:text-blue-400'
    }
  ];

  // 3. Distribuição de Risco (Pie)
  const getRiskData = () => {
    const lowRisk = clients.filter(d => d.riskLevel === 'low').length;
    const mediumRisk = clients.filter(d => d.riskLevel === 'medium').length;
    const highRisk = clients.filter(d => d.riskLevel === 'high').length;
    return [
      { name: 'Baixo Risco', value: lowRisk, fill: '#22c55e' },
      { name: 'Médio Risco', value: mediumRisk, fill: '#eab308' },
      { name: 'Alto Risco', value: highRisk, fill: '#ef4444' },
    ].filter(i => i.value > 0);
  };
  const riskData = getRiskData();

  // 4. Revenue Breakdown (Donut) & Payment Methods
  const revenueBreakdown = [
    { name: 'Capital', value: totalRecoveredCapital, fill: '#3b82f6' },
    { name: 'Juros', value: totalReceivedInterest, fill: '#22c55e' },
    { name: 'Multas', value: totalReceivedLateInterest, fill: '#f97316' },
  ].filter(i => i.value > 0);

  const revenueDetailItems = [
    {
      label: 'Capital recuperado',
      value: totalRecoveredCapital,
      description: 'Parte dos pagamentos que voltou ao caixa',
      color: 'bg-blue-500'
    },
    {
      label: 'Juros recebidos',
      value: totalReceivedInterest,
      description: 'Rendimento direto dos contratos',
      color: 'bg-green-500'
    },
    {
      label: 'Multas recebidas',
      value: totalReceivedLateInterest,
      description: 'Juros de mora e penalizações recebidas',
      color: 'bg-orange-500'
    },
    {
      label: 'Investido em créditos',
      value: totalDisbursed,
      description: `${activeCredits.length} ${activeCredits.length === 1 ? 'crédito aberto' : 'créditos abertos'} · retorno ${investmentReturnRate.toFixed(1)}%`,
      color: 'bg-slate-900'
    }
  ];

  // 4. Revenue Breakdown (Donut) & Payment Methods
  const getPaymentMethodsData = () => {
    const cash = payments.filter(p => p.method === 'cash').length;
    const transfer = payments.filter(p => p.method === 'transfer').length;
    const reference = payments.filter(p => p.method === 'reference').length;

    return [
      { name: 'Dinheiro', value: cash, fill: '#22c55e' },
      { name: 'Transferência', value: transfer, fill: '#3b82f6' },
      { name: 'Referência', value: reference, fill: '#f59e0b' },
    ].filter(i => i.value > 0);
  };
  const paymentMethods = getPaymentMethodsData();

  // 5. Dados de Atividade (Últimos 7 Dias)
  const getActivityData = () => {
    const days = [];
    const weekdays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    for (let i = 6; i >= 0; i--) {
      const d = subDays(new Date(), i);
      const dayName = weekdays[d.getDay()];

      const dayPayments = payments.filter(p => {
        if (!isValidDate(p.paymentDate)) return false;
        const pDate = new Date(p.paymentDate);
        return pDate.toDateString() === d.toDateString();
      }).length;

      const dayCredits = credits.filter(c => {
        if (!isValidDate(c.startDate)) return false;
        const cDate = new Date(c.startDate);
        return cDate.toDateString() === d.toDateString();
      }).length;

      days.push({
        name: dayName,
        value: dayPayments + dayCredits,
        payments: dayPayments,
        credits: dayCredits
      });
    }
    return days;
  };
  const activityData = getActivityData();

  // 6. Melhores Clientes (Atualizado com Ordenação e Limite)
  const sortedClients = clients
    .map(d => {
      const dCredits = credits.filter(c => c.clientId === d.id);
      const debt = dCredits.reduce((acc, c) => acc + c.currentBalance, 0);
      return { ...d, debt };
    })
    .filter(d => d.debt > 0) // Mostrar apenas clientes com dívida
    .sort((a, b) => clientSort === 'desc' ? b.debt - a.debt : a.debt - b.debt);

  const topClients = sortedClients.slice(0, 50); // Mostrar até 50 para scroll

  // Calcular maxDebt para as barras baseando-se na maior dívida da vista atual
  const maxDebt = Math.max(...sortedClients.map(d => d.debt), 1);

  const { insights: tangoAI, dismissInsight, resetDismissed, hasDismissed } = useTangoAI();

  // 7. Volume de Crédito Concedido (Últimos 12 Meses)
  const getDisbursedVolumeData = () => {
    const months = [];
    const today = new Date();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      months.push(d);
    }
    return months.map(date => {
      const monthStr = date.toLocaleString('default', { month: 'short' });
      const yearStr = date.getFullYear().toString().slice(-2);
      const monthCredits = credits.filter(c => {
        if (c.deletedAt) return false;
        if (c.targetMonthId) {
          const [yearStr, monthStr] = c.targetMonthId.split('-');
          return parseInt(yearStr) === date.getFullYear() && (parseInt(monthStr) - 1) === date.getMonth();
        }
        if (!isValidDate(c.startDate)) return false;
        const cDate = new Date(c.startDate);
        return cDate.getMonth() === date.getMonth() && cDate.getFullYear() === date.getFullYear();
      });
      const volume = monthCredits.reduce((acc, c) => acc + c.principalAmount, 0);
      const count = monthCredits.length;
      return {
        name: `${monthStr}'${yearStr}`,
        Volume: volume,
        Contratos: count,
      };
    });
  };
  const disbursedVolumeData = getDisbursedVolumeData();

  // 8. Status dos Contratos (Pie/Donut)
  const getCreditStatusData = () => {
    const statusMap: Record<string, { label: string; fill: string }> = {
      active: { label: 'Ativos', fill: '#22c55e' },
      overdue: { label: 'Vencidos', fill: '#ef4444' },
      paid: { label: 'Pagos', fill: '#3b82f6' },
      defaulted: { label: 'Incumprimento', fill: '#dc2626' },
      renegotiated: { label: 'Renegociados', fill: '#f59e0b' },
      pending_approval: { label: 'Pendentes', fill: '#8b5cf6' },
      rejected: { label: 'Rejeitados', fill: '#6b7280' },
    };
    const counts: Record<string, number> = {};
    credits.forEach(c => {
      const status = openCreditStatuses.has(c.status) && !isCreditOpen(c) ? 'paid' : c.status;
      counts[status] = (counts[status] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([status, value]) => ({
        name: statusMap[status]?.label || status,
        value,
        fill: statusMap[status]?.fill || '#94a3b8',
      }))
      .filter(i => i.value > 0);
  };
  const creditStatusData = getCreditStatusData();

  // 9. Tendência de Novos Clientes (Últimos 6 Meses)
  const getNewClientsData = () => {
    const months = [];
    const today = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      months.push(d);
    }
    return months.map(date => {
      const monthStr = date.toLocaleString('default', { month: 'short' });
      const mStart = startOfMonth(date);
      const mEnd = endOfMonth(date);
      const newClients = clients.filter(cl => {
        if (!cl.createdAt) return false;
        const cDate = new Date(cl.createdAt);
        return isAfter(cDate, mStart) && isBefore(cDate, mEnd);
      }).length;
      return { name: monthStr, Clientes: newClients };
    });
  };
  const newClientsData = getNewClientsData();

  return (
    <MainLayout title="Painel Geral de Operações" subtitle="Visão geral e contextualizada das operações">

      {/* 1. Secção KPI - Modelo Pastel Arredondado */}
      <div className="mb-6 grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">

        {/* 1. Receita Total / Lucros - Verde Esmeralda (Login Style) */}
        <div 
          onClick={() => {
            setProfitSearchTerm('');
            setDetailsModal({ isOpen: true, title: 'Detalhes de Lucros Realizados', type: 'profits' });
          }}
          className="card-kpi-mint cursor-pointer hover:scale-[1.02] active:scale-[0.99] group"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/10 dark:bg-white/10 text-slate-950 dark:text-white shrink-0 group-hover:scale-105 transition-transform">
                <Wallet className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[11px] font-bold text-slate-900/70 dark:text-slate-400 uppercase tracking-wider truncate">
                  Faturação
                </p>
                <p className="text-sm sm:text-base font-bold text-slate-950 dark:text-white truncate tracking-tight">
                  Receita de Lucros
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setProfitSearchTerm('');
                setDetailsModal({ isOpen: true, title: 'Detalhes de Lucros Realizados', type: 'profits' });
              }}
              title="Ver Detalhes dos Lucros"
              className="w-8 h-8 rounded-full bg-black/10 hover:bg-black/20 dark:bg-white/10 dark:hover:bg-white/20 flex items-center justify-center text-slate-950 dark:text-white transition-all hover:scale-110 active:scale-90 cursor-pointer shadow-2xs shrink-0"
            >
              <Eye className="h-4 w-4" />
            </button>
          </div>

          <div className="my-2">
            <p className="font-display text-3xl sm:text-4xl font-black tracking-tight text-slate-950 dark:text-white truncate" title={formatCurrency(totalProfit)}>
              {formatCurrency(totalProfit)}
            </p>
          </div>

          <div className="flex items-center justify-between text-xs font-semibold text-slate-900/75 dark:text-slate-400 truncate">
            <span>Total de lucro arrecadado</span>
            {revenueTrend && (
              <span className="font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-200/60 dark:border-emerald-800/40">
                {revenueTrend.isPositive ? '+' : '-'}{revenueTrend.value}% semana
              </span>
            )}
          </div>
        </div>

        {/* 2. Dinheiro Investido em Créditos - Azul Primário (Login Style) */}
        <div 
          onClick={() => {
            setInvestedSearchTerm('');
            setInvestedPage(1);
            setInvestedPeriod('all');
            setInvestedStartDate('');
            setInvestedEndDate('');
            setDetailsModal({ isOpen: true, title: 'Detalhes do Dinheiro Investido em Créditos', type: 'invested' });
          }}
          className="card-kpi-sky cursor-pointer hover:scale-[1.02] active:scale-[0.99] group"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/10 dark:bg-white/10 text-slate-950 dark:text-white shrink-0 group-hover:scale-105 transition-transform">
                <CreditCard className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[11px] font-bold text-slate-900/70 dark:text-slate-400 uppercase tracking-wider truncate">
                  Carteira Ativa
                </p>
                <p className="text-sm sm:text-base font-bold text-slate-950 dark:text-white truncate tracking-tight">
                  Capital Investido
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setInvestedSearchTerm('');
                setInvestedPage(1);
                setInvestedPeriod('all');
                setInvestedStartDate('');
                setInvestedEndDate('');
                setDetailsModal({ isOpen: true, title: 'Detalhes do Dinheiro Investido em Créditos', type: 'invested' });
              }}
              title="Ver Detalhes do Capital Investido"
              className="w-8 h-8 rounded-full bg-black/10 hover:bg-black/20 dark:bg-white/10 dark:hover:bg-white/20 flex items-center justify-center text-slate-950 dark:text-white transition-all hover:scale-110 active:scale-90 cursor-pointer shadow-2xs shrink-0"
            >
              <Eye className="h-4 w-4" />
            </button>
          </div>

          <div className="my-2">
            <p className="font-display text-3xl sm:text-4xl font-black tracking-tight text-slate-950 dark:text-white truncate" title={formatCurrency(totalDisbursed)}>
              {formatCurrency(totalDisbursed)}
            </p>
          </div>

          <p className="text-xs font-semibold text-slate-900/75 dark:text-slate-400 truncate">
            {activeCredits.length === 1 ? '1 crédito ativo em circulação' : `${activeCredits.length} créditos ativos em circulação`}
          </p>
        </div>

        {/* 3. Juros em Atraso - Âmbar / Dourado (Login Style) */}
        <div 
          onClick={() => setDetailsModal({ isOpen: true, title: 'Detalhes de Juros em Atraso', type: 'overdue' })}
          className="card-kpi-amber cursor-pointer hover:scale-[1.02] active:scale-[0.99] group"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/10 dark:bg-white/10 text-slate-950 dark:text-white shrink-0 group-hover:scale-105 transition-transform">
                <Award className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[11px] font-bold text-slate-900/70 dark:text-slate-400 uppercase tracking-wider truncate">
                  Pendências
                </p>
                <p className="text-sm sm:text-base font-bold text-slate-950 dark:text-white truncate tracking-tight">
                  Juros em Atraso
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setDetailsModal({ isOpen: true, title: 'Detalhes de Juros em Atraso', type: 'overdue' });
              }}
              title="Ver Detalhes de Juros em Atraso"
              className="w-8 h-8 rounded-full bg-black/10 hover:bg-black/20 dark:bg-white/10 dark:hover:bg-white/20 flex items-center justify-center text-slate-950 dark:text-white transition-all hover:scale-110 active:scale-90 cursor-pointer shadow-2xs shrink-0"
            >
              <Eye className="h-4 w-4" />
            </button>
          </div>

          <div className="my-2">
            <p className="font-display text-3xl sm:text-4xl font-black tracking-tight text-slate-950 dark:text-white truncate" title={formatCurrency(totalOverdueInterest)}>
              {formatCurrency(totalOverdueInterest)}
            </p>
          </div>

          <p className="text-xs font-semibold text-slate-900/75 dark:text-slate-400 truncate">
            {overdueCredits.length === 1 ? '1 contrato com mora pendente' : `${overdueCredits.length} contratos com mora pendente`}
          </p>
        </div>

        {/* 4. Valores em Risco - Coral / Rosa (Login Style) */}
        <div 
          onClick={() => setDetailsModal({ isOpen: true, title: 'Detalhes de Valores em Risco', type: 'risk' })}
          className="card-kpi-coral cursor-pointer hover:scale-[1.02] active:scale-[0.99] group"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/10 dark:bg-white/10 text-slate-950 dark:text-white shrink-0 group-hover:scale-105 transition-transform">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[11px] font-bold text-slate-900/70 dark:text-slate-400 uppercase tracking-wider truncate">
                  Alerta Risco
                </p>
                <p className="text-sm sm:text-base font-bold text-slate-950 dark:text-white truncate tracking-tight">
                  Valores em Risco
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setDetailsModal({ isOpen: true, title: 'Detalhes de Valores em Risco', type: 'risk' });
              }}
              title="Ver Detalhes de Valores em Risco"
              className="w-8 h-8 rounded-full bg-black/10 hover:bg-black/20 dark:bg-white/10 dark:hover:bg-white/20 flex items-center justify-center text-slate-950 dark:text-white transition-all hover:scale-110 active:scale-90 cursor-pointer shadow-2xs shrink-0"
            >
              <Eye className="h-4 w-4" />
            </button>
          </div>

          <div className="my-2">
            <p className="font-display text-3xl sm:text-4xl font-black tracking-tight text-slate-950 dark:text-white truncate" title={formatCurrency(totalRiskValue)}>
              {formatCurrency(totalRiskValue)}
            </p>
          </div>

          <p className="text-xs font-semibold text-slate-900/75 dark:text-slate-400 truncate">
            Taxa de risco ({defaultRate.toFixed(1)}% da carteira)
          </p>
        </div>
      </div>

      {/* --- WIDGET INTELIGÊNCIA TANGO AI --- */}
      <div className="mb-4 animate-in fade-in slide-in-from-bottom-2 duration-1000">
        <Card className="border-none bg-[#1e224f] text-white shadow-xl relative overflow-hidden">
          {/* Background Decorative Elements */}
          <div className="absolute top-0 right-0 w-48 h-48 bg-indigo-500/10 rounded-full -mr-24 -mt-24 blur-3xl" />
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-primary/10 rounded-full -ml-24 -mb-24 blur-3xl" />

          <CardHeader className="relative z-10 py-3 px-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-indigo-500/20 rounded-lg backdrop-blur-sm border border-indigo-400/20">
                  <Brain className="h-4 w-4 text-indigo-400 fill-indigo-400/20" />
                </div>
                <div>
                  <CardTitle className="text-lg font-black bg-gradient-to-r from-white to-indigo-300 bg-clip-text text-transparent italic">
                    Inteligência Tango AI
                  </CardTitle>
                </div>
              </div>
              
              <div className="flex items-center gap-2 text-[9px] text-emerald-400 font-bold uppercase tracking-widest bg-emerald-500/10 px-2 py-1 rounded-full border border-emerald-500/20">
                <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Sistema Operacional
              </div>
            </div>
          </CardHeader>
          <CardContent className="relative z-10 py-0 px-5 pb-4">
            {tangoAI.length > 0 ? (
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
                {tangoAI.map((insight) => (
                  <div
                    key={insight.id}
                    className="group p-3 rounded-xl border border-white/5 bg-white/5 hover:bg-white/10 transition-all duration-300 backdrop-blur-md flex flex-col relative"
                  >
                    {/* Close button */}
                    <button
                      onClick={() => dismissInsight(insight.id)}
                      className="absolute top-2 right-2 text-white/40 hover:text-white/80 p-0.5 rounded-full hover:bg-white/10 transition-colors z-20"
                      title="Ocultar insight"
                    >
                      <X className="h-3 w-3" />
                    </button>

                    <div className="flex items-center gap-2 mb-1.5 pr-5">
                      <div className={cn(
                        "p-1 rounded-md",
                        insight.color === 'emerald' ? "bg-emerald-500/20" :
                          insight.color === 'amber' ? "bg-amber-500/20" :
                            insight.color === 'red' ? "bg-red-500/20" : "bg-indigo-500/20"
                      )}>
                        {insight.icon && React.isValidElement(insight.icon)
                          ? React.cloneElement(insight.icon as React.ReactElement<any>, { className: "h-3.5 w-3.5" })
                          : insight.icon}
                      </div>
                      <h4 className={cn(
                        "font-black text-[11px] uppercase tracking-tighter",
                        insight.color === 'emerald' ? "text-emerald-400" :
                          insight.color === 'amber' ? "text-amber-400" :
                            insight.color === 'red' ? "text-red-400" : "text-indigo-400"
                      )}>
                        {insight.title}
                      </h4>
                    </div>
                    <p className="text-[11px] text-indigo-50/90 leading-tight font-bold mb-2">
                      {insight.message}
                    </p>

                    {insight.details && insight.details.length > 0 && (
                      <div className="mb-2 space-y-1">
                        <p className="text-[9px] text-indigo-300/60 uppercase font-black tracking-widest">Envolvidos:</p>
                        <div className="flex flex-wrap gap-1">
                          {insight.details.map((name, i) => (
                            <span key={i} className="text-[9px] bg-white/10 px-1.5 py-0.5 rounded-md font-medium">
                              {name}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {insight.solution && (
                      <div className="mt-auto pt-2 border-t border-white/5">
                        <p className="text-[9px] text-emerald-400 font-black uppercase flex items-center gap-1 leading-none">
                          <Zap className="h-2.5 w-2.5" /> Ação:
                          <span className="text-indigo-100/70 font-medium italic normal-case ml-1 tracking-normal">
                            {insight.solution}
                          </span>
                        </p>
                        <Button
                          asChild
                          size="sm"
                          variant="ghost"
                          className="mt-2 h-7 w-full justify-between rounded-lg border border-white/10 bg-white/10 px-2 text-[10px] font-black uppercase tracking-wide text-white hover:bg-white/20 hover:text-white"
                        >
                          <Link to={insight.actionPath} onClick={() => dismissInsight(insight.id)}>
                            <span>{insight.actionLabel}</span>
                            <ArrowUpRight className="h-3 w-3" />
                          </Link>
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-6 flex flex-col md:flex-row items-center justify-between gap-4 border border-white/5 bg-white/5 rounded-xl p-4 backdrop-blur-md">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-white/5 rounded-full border border-white/10 relative shrink-0">
                    <Brain className="h-8 w-8 text-indigo-400 animate-pulse" />
                    <div className="absolute top-1 right-1 h-2.5 w-2.5 rounded-full bg-emerald-500 animate-ping" />
                  </div>
                  <div className="space-y-1">
                    <h4 className="text-sm font-bold text-white">Análise Preditiva Ativa</h4>
                    <p className="text-xs text-indigo-200/70 leading-relaxed max-w-xl">
                      A IA do Tango está a analisar a carteira de créditos e histórico de pagamentos. Não foram encontrados desvios ou riscos críticos no momento.
                    </p>
                  </div>
                </div>
                {hasDismissed && (
                  <Button
                    onClick={resetDismissed}
                    size="sm"
                    className="h-9 border border-white/10 bg-white/10 hover:bg-white/20 px-4 text-xs font-black uppercase tracking-wider text-white shrink-0 gap-2"
                  >
                    <RotateCcw className="h-4 w-4" />
                    Restaurar Alertas
                  </Button>
                )}
              </div>
            )}

            <div className="mt-4 flex items-center gap-2 text-[9px] text-indigo-300/40 font-bold uppercase tracking-widest">
              <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Análise em tempo real
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 2. Grelha Principal de Gráficos (Ajustados com mesmo tamanho e altura perfeitamente alinhada) */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7 mb-6 items-stretch">

        {/* Gráfico de Área de Fluxo de Caixa */}
        <Card className="col-span-4 card-elevated flex flex-col justify-between h-full">
          <CardHeader className="pb-0 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <div className="p-1.5 bg-primary/10 rounded-lg text-primary">
                  <TrendingUp className="h-5 w-5" />
                </div>
                Fluxo de Caixa
              </CardTitle>
              <CardDescription>Entradas vs Saídas nos últimos 6 meses</CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800">
                <ArrowUpRight className="h-3.5 w-3.5" />
                {formatCurrency(cashFlowTotals.totalEntradas)}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800">
                <ArrowDownRight className="h-3.5 w-3.5" />
                {formatCurrency(cashFlowTotals.totalSaidas)}
              </span>
            </div>
          </CardHeader>

          <CardContent className="flex flex-col gap-4 pt-4 flex-1 justify-between">
            <div className="relative h-[250px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={cashFlowData} margin={{ top: 10, right: 15, left: -10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorEntradas" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#22c55e" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#22c55e" stopOpacity={0.0} />
                    </linearGradient>
                    <linearGradient id="colorSaidas" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ef4444" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.15} />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tickMargin={8} fontSize={12} />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    fontSize={11}
                    tickFormatter={(val) => val >= 1000000 ? `${(val / 1000000).toFixed(1)}M` : val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val}
                  />
                  <Tooltip
                    formatter={(val: number) => [formatCurrency(val), '']}
                    contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 8px 24px rgba(0,0,0,0.08)' }}
                  />
                  <Legend verticalAlign="top" height={32} iconType="circle" />
                  <Area type="monotone" dataKey="Entradas" name="Entradas (Recebimentos)" stroke="#22c55e" fillOpacity={1} fill="url(#colorEntradas)" strokeWidth={2.5} />
                  <Area type="monotone" dataKey="Saidas" name="Saídas (Empréstimos)" stroke="#ef4444" fillOpacity={1} fill="url(#colorSaidas)" strokeWidth={2.5} />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {cashFlowDetailItems.map((item) => (
                <div key={item.label} className="rounded-xl border bg-slate-50/70 p-3 dark:bg-slate-900/40">
                  <div className="mb-2 flex items-center gap-2">
                    <span className={cn("h-2.5 w-2.5 rounded-full", item.color)} />
                    <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{item.label}</span>
                  </div>
                  <div className={cn("truncate text-base font-black", item.textColor || "text-foreground")} title={formatCurrency(item.value)}>
                    {formatCurrency(item.value)}
                  </div>
                  <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-muted-foreground">
                    {item.description}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Donut de Detalhamento de Receita */}
        <Card className="col-span-3 card-elevated flex flex-col justify-between h-full">
          <CardHeader className="pb-0">
            <CardTitle className="text-lg">Composição da Receita</CardTitle>
            <CardDescription>Distribuição dos recebimentos, juros e investimentos</CardDescription>
          </CardHeader>

          <CardContent className="flex flex-col gap-4 pt-4 flex-1 justify-between">
            <div className="relative h-[250px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={revenueBreakdown}
                    cx="50%"
                    cy="45%"
                    innerRadius={78}
                    outerRadius={102}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {revenueBreakdown.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} strokeWidth={0} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(val: number) => formatCurrency(val)} />
                  <Legend verticalAlign="bottom" height={32} iconType="circle" />
                </PieChart>
              </ResponsiveContainer>

              {/* Texto Central */}
              <div className="absolute top-[45%] left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none w-[160px]">
                <span className="text-xl font-black block leading-tight truncate px-2 text-foreground" title={formatCurrency(totalCashTotal)}>
                  {formatCurrency(totalCashTotal).replace(',00', '')}
                </span>
                <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-[0.15em] opacity-80">Total Recebido</span>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {revenueDetailItems.map((item) => (
                <div key={item.label} className="rounded-xl border bg-slate-50/70 p-3 dark:bg-slate-900/40">
                  <div className="mb-2 flex items-center gap-2">
                    <span className={cn("h-2.5 w-2.5 rounded-full", item.color)} />
                    <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{item.label}</span>
                  </div>
                  <div className="truncate text-base font-black text-foreground" title={formatCurrency(item.value)}>
                    {formatCurrency(item.value)}
                  </div>
                  <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-muted-foreground">
                    {item.description}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 3. Grelha de Métricas Secundárias */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-6 mb-6">

        {/* Gráfico de Ticket Médio */}
        <Card className="col-span-2 card-elevated h-[350px]">
          <CardHeader>
            <CardTitle className="text-base">Ticket Médio (Empréstimo)</CardTitle>
            <CardDescription>Valor médio liberado por mês</CardDescription>
          </CardHeader>
          <CardContent className="h-[270px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={cashFlowData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.1} />
                <XAxis dataKey="name" axisLine={false} tickLine={false} fontSize={12} />
                <Tooltip formatter={(val: number) => formatCurrency(val)} />
                <Line type="monotone" dataKey="TicketMedio" stroke="#8b5cf6" strokeWidth={3} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Métodos de Pagamento */}
        <Card className="col-span-2 card-elevated h-[350px]">
          <CardHeader>
            <CardTitle className="text-base">Métodos de Pagamento</CardTitle>
            <CardDescription>Preferência dos clientes</CardDescription>
          </CardHeader>
          <CardContent className="h-[270px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={paymentMethods} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} opacity={0.1} />
                <XAxis type="number" hide />
                <YAxis dataKey="name" type="category" width={150} axisLine={false} tickLine={false} fontSize={12} />
                <Tooltip cursor={{ fill: 'transparent' }} />
                <Bar dataKey="value" fill="#8b5cf6" radius={[0, 4, 4, 0]} barSize={30}>
                  {
                    paymentMethods.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))
                  }
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Ranking de Clientes - Melhorado com Filtro e Scroll */}
        <Card className="col-span-2 card-elevated h-[350px] overflow-hidden flex flex-col">
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-base">Ranking de Clientes</CardTitle>
              <CardDescription>Clientes com saldo em aberto (Top 50)</CardDescription>
            </div>
            <Select value={clientSort} onValueChange={(v: any) => setClientSort(v)}>
              <SelectTrigger className="w-[130px] h-8 text-xs">
                <SelectValue placeholder="Ordenar" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="desc">Maior Dívida</SelectItem>
                <SelectItem value="asc">Menor Dívida</SelectItem>
              </SelectContent>
            </Select>
          </CardHeader>
          <CardContent className="flex-1 overflow-hidden p-0">
            <div className="h-full overflow-y-auto p-4 pt-0 space-y-4">
              {topClients.map((d, i) => {
                const percent = (d.debt / maxDebt) * 100;

                return (
                  <div key={d.id} className="group flex flex-col gap-1 border-b pb-3 last:border-0 last:pb-0 hover:bg-muted/30 p-2 rounded transition-colors">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <div className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold ring-2 ring-offset-1 
                                       ${d.riskLevel === 'high' ? 'bg-red-100 text-red-700 ring-red-200' : 'bg-primary/10 text-primary ring-primary/20'}`}>
                          {i + 1}
                        </div>
                        <div>
                          <span className="text-sm font-semibold block leading-none">{d.name}</span>
                          <span className="text-[10px] text-muted-foreground">{d.phone} • {d.riskLevel === 'low' ? 'BAIXO' : d.riskLevel === 'medium' ? 'MÉDIO' : d.riskLevel === 'high' ? 'ALTO' : 'NORMAL'}</span>
                        </div>
                      </div>
                      <span className="font-bold text-sm text-destructive">{formatCurrency(d.debt)}</span>
                    </div>

                    {/* Barra Visual de Dívida */}
                    <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${d.riskLevel === 'high' ? 'bg-red-500' : 'bg-blue-500'}`}
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </div>
                )
              })}
              {topClients.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">Nenhum cliente com saldo em aberto.</p>}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 4. Linha Inferior: Risco e Atividade */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-6 mb-6">
        {/* Risco - Cartão Contextual */}
        <Card className="col-span-2 lg:col-span-2 card-elevated h-[300px] bg-red-50/50 border-red-100">
          <CardHeader>
            <CardTitle className="text-red-800">Risco da Carteira</CardTitle>
          </CardHeader>
          <CardContent className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={riskData}
                  cx="50%"
                  cy="50%"
                  innerRadius={40}
                  outerRadius={70}
                  dataKey="value"
                >
                  {riskData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} strokeWidth={0} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend iconType="circle" />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Atividade - Padrão */}
        <Card className="col-span-4 lg:col-span-4 card-elevated h-[300px]">
          <CardHeader>
            <CardTitle>Atividade Recente</CardTitle>
          </CardHeader>
          <CardContent className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={activityData} barSize={30}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.1} />
                <XAxis dataKey="name" axisLine={false} tickLine={false} />
                <Tooltip
                  cursor={{ fill: 'rgba(0,0,0,0.05)' }}
                  content={({ active, payload, label }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      return (
                        <div className="bg-white p-3 border rounded-lg shadow-lg text-xs">
                          <p className="font-bold mb-1 border-b pb-1">{label}</p>
                          <p className="text-blue-600">Créditos: {data.credits}</p>
                          <p className="text-green-600">Pagamentos: {data.payments}</p>
                          <p className="mt-1 pt-1 border-t font-bold">Total: {data.value}</p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Bar dataKey="value" name="Ações" fill="#64748b" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* 5. Volume de Crédito Concedido e Status dos Contratos */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-6 mb-6">

        {/* Volume de Crédito Concedido - Bar Chart 12 meses */}
        <Card className="col-span-4 card-elevated h-[350px]">
          <CardHeader className="pb-0">
            <CardTitle className="flex items-center gap-2 text-lg">
              <div className="p-1 bg-emerald-500/10 rounded">
                <TrendingUp className="h-5 w-5 text-emerald-600" />
              </div>
              Volume de Crédito Concedido
            </CardTitle>
            <CardDescription>Montantes desembolsados nos últimos 12 meses</CardDescription>
          </CardHeader>
          <CardContent className="h-[280px] pt-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={disbursedVolumeData} margin={{ top: 10, right: 10, left: 0, bottom: 20 }}>
                <defs>
                  <linearGradient id="colorVolume" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.9} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.3} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.1} />
                <XAxis dataKey="name" axisLine={false} tickLine={false} fontSize={10} tickMargin={8} />
                <YAxis axisLine={false} tickLine={false} fontSize={10} tickFormatter={(val: number) => val >= 1000000 ? `${(val / 1000000).toFixed(1)}M` : val >= 1000 ? `${(val / 1000).toFixed(0)}K` : val.toString()} />
                <Tooltip
                  formatter={(val: number, name: string) => [name === 'Volume' ? formatCurrency(val) : val, name === 'Volume' ? 'Volume' : 'Contratos']}
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                />
                <Legend verticalAlign="top" />
                <Bar dataKey="Volume" fill="url(#colorVolume)" radius={[4, 4, 0, 0]} barSize={24} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Status dos Contratos - Donut Chart */}
        <Card className="col-span-2 card-elevated h-[350px]">
          <CardHeader className="pb-0">
            <CardTitle className="text-lg flex items-center gap-2">
              <div className="p-1 bg-indigo-500/10 rounded">
                <Activity className="h-5 w-5 text-indigo-600" />
              </div>
              Status dos Contratos
            </CardTitle>
            <CardDescription>Distribuição por estado</CardDescription>
          </CardHeader>
          <CardContent className="h-[280px] flex flex-col items-center justify-center relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={creditStatusData}
                  cx="50%"
                  cy="45%"
                  innerRadius={55}
                  outerRadius={80}
                  paddingAngle={4}
                  dataKey="value"
                >
                  {creditStatusData.map((entry, index) => (
                    <Cell key={`status-cell-${index}`} fill={entry.fill} strokeWidth={0} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend verticalAlign="bottom" height={36} iconType="circle" />
              </PieChart>
            </ResponsiveContainer>
            {/* Centro do donut */}
            <div className="absolute top-[45%] left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none">
              <span className="text-2xl font-black block leading-tight">{credits.length}</span>
              <span className="text-[9px] text-muted-foreground font-bold uppercase tracking-[0.15em] opacity-80">Contratos</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 6. Tendência de Novos Clientes */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-6 mb-6">
        <Card className="col-span-3 card-elevated h-[300px]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <div className="p-1 bg-violet-500/10 rounded">
                <Users className="h-4 w-4 text-violet-600" />
              </div>
              Novos Clientes
            </CardTitle>
            <CardDescription>Clientes registados nos últimos 6 meses</CardDescription>
          </CardHeader>
          <CardContent className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={newClientsData}>
                <defs>
                  <linearGradient id="colorClientes" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.1} />
                <XAxis dataKey="name" axisLine={false} tickLine={false} fontSize={12} />
                <YAxis axisLine={false} tickLine={false} fontSize={12} allowDecimals={false} />
                <Tooltip />
                <Area type="monotone" dataKey="Clientes" stroke="#8b5cf6" fillOpacity={1} fill="url(#colorClientes)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Resumo Rápido - Cards informativos */}
        <Card className="col-span-3 card-elevated h-[300px] flex flex-col">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <div className="p-1 bg-amber-500/10 rounded">
                <Zap className="h-4 w-4 text-amber-600" />
              </div>
              Resumo Operacional
            </CardTitle>
            <CardDescription>Indicadores chave de performance</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 grid grid-cols-2 gap-3">
            <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800/30 flex flex-col justify-center">
              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold uppercase tracking-wider">Taxa de Recobrança</span>
              <span className="text-xl font-black text-emerald-800 dark:text-emerald-200">
                {totalDisbursed > 0 ? ((totalCashTotal / totalDisbursed) * 100).toFixed(1) : '0'}%
              </span>
              <span className="text-[10px] text-emerald-500 font-medium">Pagos / Concedidos</span>
            </div>
            <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800/30 flex flex-col justify-center">
              <span className="text-[10px] text-blue-600 dark:text-blue-400 font-bold uppercase tracking-wider">Ticket Médio</span>
              <span className="text-xl font-black text-blue-800 dark:text-blue-200 truncate" title={credits.length > 0 ? formatCurrency(totalDisbursed / credits.length) : '0'}>
                {credits.length > 0 ? formatCurrency(totalDisbursed / credits.length) : formatCurrency(0)}
              </span>
              <span className="text-[10px] text-blue-500 font-medium">Valor médio por crédito</span>
            </div>
            <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800/30 flex flex-col justify-center">
              <span className="text-[10px] text-amber-600 dark:text-amber-400 font-bold uppercase tracking-wider">Contratos/Cliente</span>
              <span className="text-xl font-black text-amber-800 dark:text-amber-200">
                {totalClients > 0 ? (credits.length / totalClients).toFixed(1) : '0'}
              </span>
              <span className="text-[10px] text-amber-500 font-medium">Média de contratos</span>
            </div>
            <div className="p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800/30 flex flex-col justify-center">
              <span className="text-[10px] text-red-600 dark:text-red-400 font-bold uppercase tracking-wider">Taxa de Incumprimento</span>
              <span className="text-xl font-black text-red-800 dark:text-red-200">
                {credits.length > 0 ? ((overdueCredits.length / credits.length) * 100).toFixed(1) : '0'}%
              </span>
              <span className="text-[10px] text-red-500 font-medium">Contratos em atraso</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Modal de Detalhes de KPIs */}
      <Dialog
        open={detailsModal.isOpen}
        onOpenChange={(open) => {
          setDetailsModal(prev => ({ ...prev, isOpen: open }));
          if (!open) setSelectedProfitClient(null);
        }}
      >
        <DialogContent className={cn(
          "flex flex-col",
          detailsModal.type === 'profits'
            ? "w-[95vw] max-w-6xl max-h-[88vh]"
            : detailsModal.type === 'invested'
              ? "w-[95vw] max-w-6xl max-h-[88vh]"
            : "max-w-4xl max-h-[80vh]"
        )}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-bold">
              <Search className="h-5 w-5 text-primary" />
              {detailsModal.title}
            </DialogTitle>
          </DialogHeader>

          {detailsModal.type === 'profits' ? (
            <>
              <div className="mt-4 space-y-3">
                <div className="grid gap-3 xl:grid-cols-[minmax(260px,1fr)_190px_150px_150px_auto] xl:items-center">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={profitSearchTerm}
                      onChange={(event) => setProfitSearchTerm(event.target.value)}
                      placeholder="Pesquisar por nome, numero de registo, telefone ou ID do cliente..."
                      className="h-11 pl-10"
                    />
                  </div>
                  <Select
                    value={profitPeriod}
                    onValueChange={(value: 'all' | 'week' | 'month' | 'quarter' | 'year' | 'custom') => {
                      setProfitPeriod(value);
                      if (value === 'custom' && !profitStartDate && !profitEndDate) {
                        setProfitStartDate(toDateInputValue(startOfMonth(new Date())));
                        setProfitEndDate(toDateInputValue(endOfMonth(new Date())));
                      }
                    }}
                  >
                    <SelectTrigger className="h-11">
                      <SelectValue placeholder="Período" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todo histórico</SelectItem>
                      <SelectItem value="week">Semanal</SelectItem>
                      <SelectItem value="month">Mensal</SelectItem>
                      <SelectItem value="quarter">Trimestral</SelectItem>
                      <SelectItem value="year">Anual</SelectItem>
                      <SelectItem value="custom">Personalizado</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    type="date"
                    value={profitStartDate}
                    onChange={(event) => {
                      setProfitStartDate(event.target.value);
                      setProfitPeriod('custom');
                    }}
                    className="h-11"
                    disabled={profitPeriod !== 'custom'}
                  />
                  <Input
                    type="date"
                    value={profitEndDate}
                    onChange={(event) => {
                      setProfitEndDate(event.target.value);
                      setProfitPeriod('custom');
                    }}
                    className="h-11"
                    disabled={profitPeriod !== 'custom'}
                  />
                  <Button className="h-11 gap-2" onClick={() => openFinancialReportOptions()}>
                    <Download className="h-4 w-4" />
                    Baixar relatório
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className="rounded-md border bg-muted/40 px-3 py-2 font-semibold">
                    {filteredProfitClientRows.length} cliente(s)
                  </span>
                  <span className="rounded-md border bg-muted/40 px-3 py-2 font-semibold">
                    {profitDateRange.label}
                  </span>
                  <span className="rounded-md border bg-green-50 px-3 py-2 font-semibold text-green-700 dark:bg-green-950/30 dark:text-green-300">
                    {formatCurrency(filteredProfitClientRows.reduce((acc, row) => acc + row.totalProfit, 0))}
                  </span>
                </div>
              </div>

              <div className="mt-4 min-h-0 flex-1 overflow-auto rounded-lg border">
                <Table>
                  <TableHeader className="sticky top-0 bg-muted/50">
                    <TableRow>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Registro</TableHead>
                      <TableHead>Pagamentos</TableHead>
                      <TableHead>Valor Recebido</TableHead>
                      <TableHead className="text-green-600">Juros</TableHead>
                      <TableHead className="text-orange-600">Multas</TableHead>
                      <TableHead>Lucro Total</TableHead>
                      <TableHead>Último Pagamento</TableHead>
                      <TableHead className="text-right">Ação</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredProfitClientRows.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={9} className="h-32 text-center text-sm text-muted-foreground">
                          Nenhum cliente encontrado com lucro realizado.
                        </TableCell>
                      </TableRow>
                    )}
                    {filteredProfitClientRows.map(row => (
                      <TableRow key={row.key}>
                        <TableCell>
                          <div className="font-semibold">{row.clientName}</div>
                          <div className="text-[11px] text-muted-foreground">{row.phone || row.email || 'Sem contacto'}</div>
                        </TableCell>
                        <TableCell className="text-xs">{row.registerNumber}</TableCell>
                        <TableCell className="text-xs font-semibold">{row.payments.length}</TableCell>
                        <TableCell className="text-xs font-bold">{formatCurrency(row.totalPaid)}</TableCell>
                        <TableCell className="text-xs font-semibold text-green-600">{formatCurrency(row.totalInterest)}</TableCell>
                        <TableCell className="text-xs font-semibold text-orange-600">{formatCurrency(row.totalLateInterest)}</TableCell>
                        <TableCell className="text-xs font-black text-primary">{formatCurrency(row.totalProfit)}</TableCell>
                        <TableCell className="text-xs">
                          {isValidDate(row.lastPaymentDate) ? new Date(row.lastPaymentDate).toLocaleDateString() : '-'}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-2"
                              onClick={() => setSelectedProfitClient(row)}
                            >
                              <Eye className="h-4 w-4" />
                              Ver Detalhes
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-2"
                              onClick={() => openFinancialReportOptions(row)}
                              title="Baixar histórico deste cliente"
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          ) : (
          <>
          {detailsModal.type === 'invested' && (
            <div className="mt-4 space-y-3">
              <div className="grid gap-3 xl:grid-cols-[minmax(220px,1fr)_170px_160px_140px_140px_auto] xl:items-center">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={investedSearchTerm}
                    onChange={(event) => {
                      setInvestedSearchTerm(event.target.value);
                      setInvestedPage(1);
                    }}
                    placeholder="Pesquisar por cliente, contrato, NIF..."
                    className="h-11 pl-10"
                  />
                </div>
                <Select
                  value={investedCategoryFilter}
                  onValueChange={(value) => {
                    setInvestedCategoryFilter(value as any);
                    setInvestedPage(1);
                  }}
                >
                  <SelectTrigger className="h-11 font-medium">
                    <SelectValue placeholder="Origem do Cliente" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as Origens</SelectItem>
                    <SelectItem value="COMUM">Clientes Normais</SelectItem>
                    <SelectItem value="APOSENTADO">Clientes Aposentados</SelectItem>
                    <SelectItem value="ESTRANGEIRO">Clientes Estrangeiros</SelectItem>
                  </SelectContent>
                </Select>
                <Select
                  value={investedPeriod}
                  onValueChange={(value) => {
                    const nextPeriod = value as PeriodFilter;
                    setInvestedPeriod(nextPeriod);
                    setInvestedPage(1);
                    if (nextPeriod === 'custom' && !investedStartDate && !investedEndDate) {
                      setInvestedStartDate(toDateInputValue(startOfMonth(new Date())));
                      setInvestedEndDate(toDateInputValue(endOfMonth(new Date())));
                    }
                  }}
                >
                  <SelectTrigger className="h-11">
                    <SelectValue placeholder="Período" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todo histórico</SelectItem>
                    <SelectItem value="week">Semanal</SelectItem>
                    <SelectItem value="month">Mensal</SelectItem>
                    <SelectItem value="quarter">Trimestral</SelectItem>
                    <SelectItem value="year">Anual</SelectItem>
                    <SelectItem value="custom">Personalizado</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  type="date"
                  value={investedStartDate}
                  onChange={(event) => {
                    setInvestedStartDate(event.target.value);
                    setInvestedPeriod('custom');
                    setInvestedPage(1);
                  }}
                  className="h-11"
                  disabled={investedPeriod !== 'custom'}
                />
                <Input
                  type="date"
                  value={investedEndDate}
                  onChange={(event) => {
                    setInvestedEndDate(event.target.value);
                    setInvestedPeriod('custom');
                    setInvestedPage(1);
                  }}
                  className="h-11"
                  disabled={investedPeriod !== 'custom'}
                />
                <Button className="h-11 gap-2" onClick={exportInvestmentReport}>
                  <Download className="h-4 w-4" />
                  Baixar relatório
                </Button>
              </div>

              {/* Discriminação Detalhada por Origem do Crédito */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                <div 
                  onClick={() => {
                    setInvestedCategoryFilter(investedCategoryFilter === 'COMUM' ? 'all' : 'COMUM');
                    setInvestedPage(1);
                  }}
                  className={cn(
                    "p-3 rounded-xl border transition-all cursor-pointer",
                    investedCategoryFilter === 'COMUM'
                      ? "bg-blue-500/15 border-blue-500 ring-2 ring-blue-500/30 dark:bg-blue-950/40 shadow-xs"
                      : "bg-blue-50/60 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900/40 hover:bg-blue-100/60"
                  )}
                  title="Clique para filtrar apenas Clientes Normais"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-blue-700 dark:text-blue-300 uppercase tracking-wide">
                      Clientes Normais
                    </span>
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-200">
                      {investedByOrigin.comum.count} contratos
                    </span>
                  </div>
                  <div className="text-lg font-black text-slate-900 dark:text-white mt-1">
                    {formatCurrency(investedByOrigin.comum.amount)}
                  </div>
                  <span className="text-[10px] text-blue-600/80 dark:text-blue-400">
                    Origem: Créditos concedidos a particulares normais
                  </span>
                </div>

                <div 
                  onClick={() => {
                    setInvestedCategoryFilter(investedCategoryFilter === 'APOSENTADO' ? 'all' : 'APOSENTADO');
                    setInvestedPage(1);
                  }}
                  className={cn(
                    "p-3 rounded-xl border transition-all cursor-pointer",
                    investedCategoryFilter === 'APOSENTADO'
                      ? "bg-amber-500/15 border-amber-500 ring-2 ring-amber-500/30 dark:bg-amber-950/40 shadow-xs"
                      : "bg-amber-50/60 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/40 hover:bg-amber-100/60"
                  )}
                  title="Clique para filtrar apenas Clientes Aposentados"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-amber-700 dark:text-amber-300 uppercase tracking-wide">
                      Clientes Aposentados
                    </span>
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200">
                      {investedByOrigin.aposentado.count} contratos
                    </span>
                  </div>
                  <div className="text-lg font-black text-slate-900 dark:text-white mt-1">
                    {formatCurrency(investedByOrigin.aposentado.amount)}
                  </div>
                  <span className="text-[10px] text-amber-600/80 dark:text-amber-400">
                    Origem: Créditos concedidos a aposentados
                  </span>
                </div>

                <div 
                  onClick={() => {
                    setInvestedCategoryFilter(investedCategoryFilter === 'ESTRANGEIRO' ? 'all' : 'ESTRANGEIRO');
                    setInvestedPage(1);
                  }}
                  className={cn(
                    "p-3 rounded-xl border transition-all cursor-pointer",
                    investedCategoryFilter === 'ESTRANGEIRO'
                      ? "bg-purple-500/15 border-purple-500 ring-2 ring-purple-500/30 dark:bg-purple-950/40 shadow-xs"
                      : "bg-purple-50/60 dark:bg-purple-950/20 border-purple-200 dark:border-purple-900/40 hover:bg-purple-100/60"
                  )}
                  title="Clique para filtrar apenas Clientes Estrangeiros"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-purple-700 dark:text-purple-300 uppercase tracking-wide">
                      Clientes Estrangeiros
                    </span>
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 dark:bg-purple-900/60 dark:text-purple-200">
                      {investedByOrigin.estrangeiro.count} contratos
                    </span>
                  </div>
                  <div className="text-lg font-black text-slate-900 dark:text-white mt-1">
                    {formatCurrency(investedByOrigin.estrangeiro.amount)}
                  </div>
                  <span className="text-[10px] text-purple-600/80 dark:text-purple-400">
                    Origem: Créditos a cidadãos estrangeiros
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 text-xs">
                <span className="rounded-md border bg-muted/40 px-3 py-2 font-semibold">
                  {filteredInvestedCredits.length} contrato(s) ativo(s)
                </span>
                <span className="rounded-md border bg-muted/40 px-3 py-2 font-semibold">
                  {investedDateRange.label}
                </span>
                <span className="rounded-md border bg-blue-50 px-3 py-2 font-semibold text-blue-700 dark:bg-blue-950/30 dark:text-blue-300">
                  Total Capital Ativo Disponibilizado: {formatCurrency(filteredInvestedCredits.reduce((acc, credit) => {
                    const paidPrincipal = payments
                      .filter(p => p.creditId === credit.id && p.status !== 'cancelled' && !p.deletedAt)
                      .reduce((pSum, p) => pSum + Number(p.allocatedToPrincipal || 0), 0);
                    return acc + Math.max(0, Number(credit.principalAmount || 0) - paidPrincipal);
                  }, 0))}
                </span>
                <span className="rounded-md border bg-green-50 px-3 py-2 font-semibold text-green-700 dark:bg-green-950/30 dark:text-green-300">
                  Lucro realizado: {formatCurrency(filteredInvestedCredits.reduce((acc, credit) => acc + getInvestmentSnapshot(credit).realizedProfitInPeriod, 0))}
                </span>
              </div>

              <div className="p-3 bg-blue-50 dark:bg-blue-950/20 text-blue-800 dark:text-blue-200 text-xs rounded-lg border border-blue-200/50 dark:border-blue-900/30 space-y-1">
                <p className="font-bold">Fórmula de Cálculo Detalhada:</p>
                <p>
                  <strong>Capital Ativo Disponibilizado ({formatCurrency(filteredInvestedCredits.reduce((acc, credit) => {
                    const paidPrincipal = payments
                      .filter(p => p.creditId === credit.id && p.status !== 'cancelled' && !p.deletedAt)
                      .reduce((pSum, p) => pSum + Number(p.allocatedToPrincipal || 0), 0);
                    return acc + Math.max(0, Number(credit.principalAmount || 0) - paidPrincipal);
                  }, 0))})</strong> = 
                  Capital Inicial de Créditos Ativos ({formatCurrency(filteredInvestedCredits.reduce((acc, c) => acc + (c.principalAmount || 0), 0))}) - 
                  Principal Amortizado/Pago ({formatCurrency(filteredInvestedCredits.reduce((acc, c) => {
                    const paidPrincipal = payments
                      .filter(p => p.creditId === c.id && p.status !== 'cancelled' && !p.deletedAt)
                      .reduce((pSum, p) => pSum + Number(p.allocatedToPrincipal || 0), 0);
                    return acc + paidPrincipal;
                  }, 0))})
                </p>
                <p className="opacity-80">Nota: Esta métrica considera apenas os créditos em estado <strong>Ativo</strong>. Créditos pagos (liquidados), cancelados ou em risco (vencidos/incumprimento) não entram para esta soma de capital ativo disponibilizado.</p>
              </div>
            </div>
          )}
          <div className="flex-1 overflow-auto mt-4 border rounded-lg">
            <Table>
              <TableHeader className="bg-muted/50 sticky top-0">
                {detailsModal.type === 'invested' && (
                  <TableRow>
                    <TableHead>Data Início</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Origem</TableHead>
                    <TableHead>Valor investido</TableHead>
                    <TableHead>Capital recuperado</TableHead>
                    <TableHead className="text-green-600">Lucro realizado</TableHead>
                    <TableHead className="text-amber-600">Lucro previsto</TableHead>
                    <TableHead>Modalidade</TableHead>
                    <TableHead>Parcelas</TableHead>
                    <TableHead>Estado</TableHead>
                  </TableRow>
                )}
                {detailsModal.type === 'overdue' && (
                  <TableRow>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Montante Principal</TableHead>
                    <TableHead className="text-red-600">Juros em Atraso</TableHead>
                    <TableHead>Dias de Atraso</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                )}
                {detailsModal.type === 'risk' && (
                  <TableRow>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Montante Principal</TableHead>
                    <TableHead className="text-destructive font-bold">Saldo Devedor</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                )}
              </TableHeader>
              <TableBody>
                {detailsModal.type === 'invested' && paginatedInvestedCredits.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={10} className="h-32 text-center text-sm text-muted-foreground">
                      Nenhum investimento encontrado para os filtros selecionados.
                    </TableCell>
                  </TableRow>
                )}
                {detailsModal.type === 'invested' && paginatedInvestedCredits.map(c => {
                  const statusLabels: Record<string, string> = {
                    'active': 'Ativo',
                    'overdue': 'Vencido',
                    'paid': 'Pago',
                    'renegotiated': 'Renegociado',
                    'defaulted': 'Incumprimento',
                    'pending_approval': 'Pendente',
                    'rejected': 'Rejeitado'
                  };
                  const investment = getInvestmentSnapshot(c);
                  const effectiveStatus = openCreditStatuses.has(c.status) && !isCreditOpen(c) ? 'paid' : c.status;
                  const statusClassName =
                    effectiveStatus === 'paid'
                      ? 'border-green-200 bg-green-50 text-green-700 dark:border-green-900/50 dark:bg-green-950/30 dark:text-green-300'
                      : effectiveStatus === 'active'
                        ? 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-300'
                        : effectiveStatus === 'overdue' || effectiveStatus === 'defaulted'
                          ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300'
                          : 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300';

                  return (
                    <TableRow key={c.id}>
                      <TableCell className="text-xs">{new Date(c.startDate).toLocaleDateString()}</TableCell>
                      <TableCell className="text-xs">
                        <div className="font-semibold">{investment.clientName}</div>
                        <div className="text-[11px] text-muted-foreground">{investment.registerNumber}</div>
                      </TableCell>
                      <TableCell className="text-xs">
                        <span className={cn(
                          "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border",
                          investment.clientCategory === 'APOSENTADO'
                            ? "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border-amber-300/40"
                            : investment.clientCategory === 'ESTRANGEIRO'
                              ? "bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300 border-purple-300/40"
                              : "bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 border-blue-300/40"
                        )}>
                          {investment.categoryLabel}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs font-bold">{formatCurrency(investment.investedAmount)}</TableCell>
                      <TableCell className="text-xs font-semibold">{formatCurrency(investment.paidPrincipal)}</TableCell>
                      <TableCell className="text-xs font-semibold text-green-600">{formatCurrency(investment.realizedProfitInPeriod)}</TableCell>
                      <TableCell className="text-xs font-semibold text-amber-600">{formatCurrency(investment.remainingExpectedProfit)}</TableCell>
                      <TableCell className="text-xs">{investment.contractModality}</TableCell>
                      <TableCell className="text-xs">{investment.installments}</TableCell>
                      <TableCell>
                        <span className={cn("inline-flex rounded-full border px-2 py-1 text-[10px] font-black uppercase", statusClassName)}>
                          {statusLabels[effectiveStatus] || effectiveStatus}
                        </span>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {detailsModal.type === 'overdue' && overdueCredits.map(c => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium text-xs">{c.clientName}</TableCell>
                    <TableCell className="text-xs font-bold">{formatCurrency(c.principalAmount)}</TableCell>
                    <TableCell className="text-xs text-red-600 font-bold">{formatCurrency(c.lateInterest)}</TableCell>
                    <TableCell className="text-xs">{c.daysOverdue} dias</TableCell>
                    <TableCell className="text-[10px] uppercase font-bold text-red-600">Vencido</TableCell>
                  </TableRow>
                ))}
                {detailsModal.type === 'risk' && overdueCredits.map(c => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium text-xs">{c.clientName}</TableCell>
                    <TableCell className="text-xs font-bold">{formatCurrency(c.principalAmount)}</TableCell>
                    <TableCell className="text-xs text-destructive font-bold">{formatCurrency(c.currentBalance)}</TableCell>
                    <TableCell className="text-[10px] uppercase font-bold text-destructive">Alto Risco</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {detailsModal.type === 'invested' && filteredInvestedCredits.length > 0 && (
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-muted-foreground">
                Página {investedPage} de {investedTotalPages} - mostrando {paginatedInvestedCredits.length} de {filteredInvestedCredits.length} contrato(s)
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setInvestedPage(page => Math.max(1, page - 1))}
                  disabled={investedPage <= 1}
                >
                  Anterior
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setInvestedPage(page => Math.min(investedTotalPages, page + 1))}
                  disabled={investedPage >= investedTotalPages}
                >
                  Próxima
                </Button>
              </div>
            </div>
          )}
          </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!selectedProfitClient} onOpenChange={(open) => !open && setSelectedProfitClient(null)}>
        <DialogContent className="flex max-h-[86vh] w-[94vw] max-w-5xl flex-col">
          <DialogHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <DialogTitle className="flex items-center gap-2 text-lg font-bold">
                <Eye className="h-5 w-5 text-primary" />
                Detalhes de Pagamento - {selectedProfitClient?.clientName}
              </DialogTitle>
              {selectedProfitClient && (
                <Button className="gap-2" onClick={() => openFinancialReportOptions(selectedProfitClient)}>
                  <Download className="h-4 w-4" />
                  Baixar histórico
                </Button>
              )}
            </div>
          </DialogHeader>

          {selectedProfitClient && (
            <>
              <div className="mt-4 grid gap-3 md:grid-cols-4">
                <div className="rounded-lg border bg-muted/30 p-3">
                  <p className="text-[10px] font-bold uppercase text-muted-foreground">Registro</p>
                  <p className="mt-1 text-sm font-bold">{selectedProfitClient.registerNumber}</p>
                </div>
                <div className="rounded-lg border bg-muted/30 p-3">
                  <p className="text-[10px] font-bold uppercase text-muted-foreground">Valor Recebido</p>
                  <p className="mt-1 text-sm font-bold">{formatCurrency(selectedProfitClient.totalPaid)}</p>
                </div>
                <div className="rounded-lg border bg-green-50 p-3 text-green-700 dark:bg-green-950/30 dark:text-green-300">
                  <p className="text-[10px] font-bold uppercase">Juros</p>
                  <p className="mt-1 text-sm font-bold">{formatCurrency(selectedProfitClient.totalInterest)}</p>
                </div>
                <div className="rounded-lg border bg-orange-50 p-3 text-orange-700 dark:bg-orange-950/30 dark:text-orange-300">
                  <p className="text-[10px] font-bold uppercase">Multas</p>
                  <p className="mt-1 text-sm font-bold">{formatCurrency(selectedProfitClient.totalLateInterest)}</p>
                </div>
              </div>

              <div className="mt-4 min-h-0 flex-1 overflow-auto rounded-lg border">
                <Table>
                  <TableHeader className="sticky top-0 bg-muted/50">
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead>Crédito</TableHead>
                      <TableHead>Método</TableHead>
                      <TableHead>Referência</TableHead>
                      <TableHead>Pago</TableHead>
                      <TableHead>Capital</TableHead>
                      <TableHead className="text-green-600">Juros</TableHead>
                      <TableHead className="text-orange-600">Multas</TableHead>
                      <TableHead>Lucro</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[...selectedProfitClient.payments]
                      .sort((a: any, b: any) => new Date(b.paymentDate).getTime() - new Date(a.paymentDate).getTime())
                      .map((payment: any) => {
                        const credit = credits.find(c => c.id === payment.creditId);
                        const profit = (payment.allocatedToInterest || 0) + (payment.allocatedToLateInterest || 0);

                        return (
                          <TableRow key={payment.id}>
                            <TableCell className="text-xs">{isValidDate(payment.paymentDate) ? new Date(payment.paymentDate).toLocaleDateString() : '-'}</TableCell>
                            <TableCell className="text-xs">
                              <div className="font-semibold">{credit?.id || payment.creditId}</div>
                              <div className="text-[11px] text-muted-foreground">{credit ? formatCurrency(credit.principalAmount) : 'Contrato não encontrado'}</div>
                            </TableCell>
                            <TableCell className="text-xs">{paymentMethodLabels[payment.method] || payment.method}</TableCell>
                            <TableCell className="text-xs">{payment.reference || payment.id}</TableCell>
                            <TableCell className="text-xs font-bold">{formatCurrency(payment.amount)}</TableCell>
                            <TableCell className="text-xs">{formatCurrency(payment.allocatedToPrincipal || 0)}</TableCell>
                            <TableCell className="text-xs font-semibold text-green-600">{formatCurrency(payment.allocatedToInterest || 0)}</TableCell>
                            <TableCell className="text-xs font-semibold text-orange-600">{formatCurrency(payment.allocatedToLateInterest || 0)}</TableCell>
                            <TableCell className="text-xs font-black text-primary">{formatCurrency(profit)}</TableCell>
                          </TableRow>
                        );
                      })}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!pendingFinancialReport} onOpenChange={(open) => !open && setPendingFinancialReport(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              <FileText className="h-5 w-5 text-primary" />
              Escolher modelo do histórico
            </DialogTitle>
            <DialogDescription>
              Selecione como deseja baixar o histórico financeiro.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              className="rounded-lg border bg-background p-4 text-left shadow-sm transition hover:border-primary hover:bg-primary/5"
              onClick={() => {
                exportFinancialMovementsReport(pendingFinancialReport?.clientRow, { includeProfit: true });
                setPendingFinancialReport(null);
              }}
            >
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                <Eye className="h-5 w-5" />
              </div>
              <p className="text-sm font-black">Histórico detalhado com lucros</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Inclui juros, juros de mora, lucro por operação e lucro total.
              </p>
            </button>

            <button
              type="button"
              className="rounded-lg border bg-background p-4 text-left shadow-sm transition hover:border-primary hover:bg-primary/5"
              onClick={() => {
                exportFinancialMovementsReport(pendingFinancialReport?.clientRow, { includeProfit: false });
                setPendingFinancialReport(null);
              }}
            >
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 text-blue-700">
                <EyeOff className="h-5 w-5" />
              </div>
              <p className="text-sm font-black">Histórico detalhado sem lucros</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Mostra empréstimos, recebimentos e capital recuperado sem expor lucros.
              </p>
            </button>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingFinancialReport(null)}>
              Cancelar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* --- MODAL DE BOAS-VINDAS (TRIAL) --- */}
      <Dialog open={showWelcomeModal} onOpenChange={(open) => { if (!open) handleCloseWelcome(); }}>
        <DialogContent className="max-w-md p-0 overflow-hidden border-none shadow-2xl rounded-2xl animate-in zoom-in-95 duration-300">
          <div className="bg-gradient-to-br from-blue-600 via-indigo-600 to-primary p-8 text-white relative">
            <div className="absolute top-0 right-0 p-4 opacity-10">
              <Sparkles className="h-24 w-24" />
            </div>

            <div className="relative z-10 flex flex-col items-center text-center space-y-4">
              <div className="bg-white/20 p-4 rounded-3xl backdrop-blur-md">
                <ShieldCheck className="h-10 w-10 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-black tracking-tight mb-1">Seja Bem-vindo ao Tango Gestão de Créditos!</h2>
                <p className="text-blue-100 text-sm font-medium">Instalação concluída com sucesso.</p>
              </div>
            </div>
          </div>

          <div className="p-8 bg-background space-y-6">
            <div className="p-4 bg-muted/50 rounded-2xl border border-border/50 flex items-start gap-4">
              <div className="bg-blue-100 p-2 rounded-xl shrink-0">
                <Key className="h-5 w-5 text-blue-600" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-bold text-foreground italic">Período de Demonstração Ativo</p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Para garantir que conhece todas as potencialidades do sistema, ativamos uma licença de teste de <strong>3 dias</strong>.
                </p>
              </div>
            </div>

            <div className="space-y-3 text-center">
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-amber-50 text-amber-700 rounded-full text-[10px] font-black uppercase tracking-widest border border-amber-100">
                <Activity className="h-3 w-3" />
                Expira em: {formatDateSafe(licenseInfo.expirationDate, 'dd/MM/yyyy')}
              </div>

              <p className="text-[11px] text-muted-foreground">
                Aproveite para cadastrar seus primeiros clientes e realizar simulações de crédito. O suporte está disponível via WhatsApp se precisar.
              </p>
            </div>

            <Button
              onClick={handleCloseWelcome}
              className="w-full h-12 text-base font-bold shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
            >
              Começar a Explorar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* --- MODAL DE AVISO DE EXPIRAÇÃO --- */}
      <Dialog open={showExpirationWarning} onOpenChange={(open) => { if (!open) handleCloseWarning(); }}>
        <DialogContent className="max-w-md p-0 overflow-hidden border-none shadow-2xl rounded-2xl animate-in fade-in slide-in-from-bottom-4 duration-300">
          <div className="bg-amber-500 p-8 text-white relative">
            <div className="absolute top-0 right-0 p-4 opacity-10">
              <AlertTriangle className="h-24 w-24" />
            </div>
            <div className="relative z-10 flex flex-col items-center text-center space-y-4">
              <div className="bg-white/20 p-4 rounded-3xl backdrop-blur-md">
                <Clock className="h-10 w-10 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-black tracking-tight mb-1">A sua licença vai expirar!</h2>
                <p className="text-amber-100 text-sm font-medium">Restam apenas {licenseInfo.daysRemaining} dias de acesso.</p>
              </div>
            </div>
          </div>

          <div className="p-8 bg-background space-y-6">
            <div className="space-y-4 text-center">
              <p className="text-sm text-muted-foreground leading-relaxed">
                Para evitar a interrupção das suas atividades e o bloqueio do sistema no dia <strong>{formatDateSafe(licenseInfo.expirationDate, 'dd/MM/yyyy')}</strong>, recomendamos que renove a sua subscrição agora.
              </p>

              <div className="p-4 bg-muted/50 rounded-2xl border border-dashed border-amber-200 flex flex-col items-center gap-2">
                <p className="text-[10px] font-bold text-amber-700 uppercase tracking-widest">ID da sua Máquina</p>
                <code className="text-xs font-mono font-bold text-foreground bg-white px-3 py-1 rounded-md border">{machineId}</code>
              </div>
            </div>

            <div className="space-y-3">
              <Button
                onClick={() => {
                  window.open(`https://wa.me/244941537486?text=Olá, desejo renovar a minha licença do Tango Gestão de Créditos. ID da Máquina: ${machineId}`, '_blank');
                  handleCloseWarning();
                }}
                className="w-full h-12 text-base font-bold bg-amber-600 hover:bg-amber-700 shadow-lg shadow-amber-200 text-white"
              >
                Renovar via WhatsApp
              </Button>
              <Button
                onClick={() => {
                  setIsLicenseRenewalOpen(true);
                  handleCloseWarning();
                }}
                className="w-full h-12 text-base font-bold bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-200 text-white gap-2"
              >
                <ShieldPlus className="h-5 w-5" />
                Já tenho uma chave
              </Button>
              <Button
                variant="ghost"
                onClick={handleCloseWarning}
                className="w-full text-xs text-muted-foreground"
              >
                Lembrar-me mais tarde
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <LicenseRenewalModal
        isOpen={isLicenseRenewalOpen}
        onClose={() => setIsLicenseRenewalOpen(false)}
      />

    </MainLayout >
  );
}
