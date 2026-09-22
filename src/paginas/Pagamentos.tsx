import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { MainLayout } from '@/componentes/layout/MainLayout';
import { useAuth } from '@/contextos/ContextoAutenticacao';
import { useData } from '@/contextos/ContextoDados';
import { formatCurrency, formatDateTime } from '@/bibliotecas/formatters';
import { Badge } from '@/componentes/ui/badge';
import { Button } from '@/componentes/ui/button';
import { Input } from '@/componentes/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/componentes/ui/select';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/componentes/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/componentes/ui/dialog';
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
  FileText,
  Download,
  CreditCard,
  Banknote,
  Building2,
  Receipt,
  Trash2,
  Upload,
  History,
  Filter,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { generateExcelTemplate, parseExcelFile } from '@/bibliotecas/ExcelHelper';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/componentes/ui/dropdown-menu';
import { PaymentForm } from '@/componentes/forms/PaymentForm';
import {
  generatePaymentReceipt,
  generateCreditPaymentHistoryPDF
} from '@/bibliotecas/pdf';
import { useToast } from '@/componentes/ui/use-toast';
import { Payment } from '@/tipos/credito';
import { v4 as uuidv4 } from 'uuid';
import { AlertModal, AlertModalType } from '@/componentes/ui/AlertModal';
import { ConfirmSharingModal } from '@/componentes/modals/ConfirmSharingModal';
import { JustificationModal } from '@/componentes/modals/JustificationModal';
import { PaymentFilterModal } from '@/componentes/modals/PaymentFilterModal';
import { openWhatsApp } from '@/bibliotecas/whatsapp';

type BadgeVariant = 'default' | 'primary' | 'secondary' | 'destructive' | 'success' | 'warning' | 'info' | 'outline';

const statusConfig: Record<string, { label: string; variant: BadgeVariant }> = {
  confirmed: { label: 'Confirmado', variant: 'success' },
  pending: { label: 'Pendente', variant: 'warning' },
  cancelled: { label: 'Cancelado', variant: 'destructive' },
};

const methodConfig = {
  cash: { label: 'Numerário', icon: Banknote },
  transfer: { label: 'Transferência', icon: Building2 },
  reference: { label: 'Referência', icon: Receipt },
};

export default function Payments() {
  const { user } = useAuth();
  const { payments, credits, addPayment, deletePayment, companySettings } = useData();
  const [searchParams] = useSearchParams();
  const [searchTerm, setSearchTerm] = useState(searchParams.get('search') || '');
  const [dateFilter, setDateFilter] = useState<'today' | 'week' | 'month' | 'year' | 'custom' | 'all'>('today');
  const [customDateRange, setCustomDateRange] = useState<{ start: string; end: string }>({
    start: new Date().toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0]
  });
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  useEffect(() => {
    const query = searchParams.get('search');
    if (query) {
      setSearchTerm(query);
    }
  }, [searchParams]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDetailsDialogOpen, setIsDetailsDialogOpen] = useState(false);
  const [isDeleteAlertOpen, setIsDeleteAlertOpen] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<Payment | undefined>(undefined);
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
  const [isHistoryDialogOpen, setIsHistoryDialogOpen] = useState(false);
  const [historyPayments, setHistoryPayments] = useState<Payment[]>([]);
  const [historyClientName, setHistoryClientName] = useState('');
  const [selectedCreditId, setSelectedCreditId] = useState<string | undefined>(undefined);
  const [justificationModal, setJustificationModal] = useState<{ isOpen: boolean; paymentId: string | null }>({
    isOpen: false,
    paymentId: null
  });
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);

  const [sharingModal, setSharingModal] = useState<{
    isOpen: boolean;
    clientName: string;
    paymentId: string;
    clientId: string;
    title?: string;
    description?: string;
  }>({
    isOpen: false,
    clientName: '',
    paymentId: '',
    clientId: ''
  });

  const filteredPayments = payments.filter(
    (payment) =>
      payment.clientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      payment.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      payment.creditId.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Grouping payments by creditId
  const groupedPayments = filteredPayments.reduce((acc, payment) => {
    if (!acc[payment.creditId]) {
      acc[payment.creditId] = {
        ...payment,
        totalPaid: 0,
        count: 0,
        lastPaymentDate: payment.paymentDate,
        allPayments: []
      };
    }
    acc[payment.creditId].totalPaid += payment.amount;
    acc[payment.creditId].count += 1;
    acc[payment.creditId].allPayments.push(payment);

    // Update to show the most recent payment date and details as representative
    if (new Date(payment.paymentDate) > new Date(acc[payment.creditId].lastPaymentDate)) {
      acc[payment.creditId].lastPaymentDate = payment.paymentDate;
      acc[payment.creditId].id = payment.id;
      acc[payment.creditId].method = payment.method;
      acc[payment.creditId].status = payment.status;
      acc[payment.creditId].processedBy = payment.processedBy;
    }

    return acc;
  }, {} as Record<string, any>);

  const displayPayments = Object.values(groupedPayments).sort((a, b) =>
    new Date(b.lastPaymentDate).getTime() - new Date(a.lastPaymentDate).getTime()
  );

  const totalPages = Math.max(1, Math.ceil(displayPayments.length / itemsPerPage));
  const paginatedPayments = useMemo(() => {
    const actualPage = Math.min(currentPage, totalPages);
    const startIndex = (actualPage - 1) * itemsPerPage;
    return displayPayments.slice(startIndex, startIndex + itemsPerPage);
  }, [displayPayments, currentPage, totalPages]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, dateFilter, customDateRange.start, customDateRange.end]);

  const handleDownloadTemplate = () => {
    generateExcelTemplate(
      ['ID Crédito', 'Montante', 'Data (AAAA-MM-DD)', 'Método (cash, transfer, reference)'],
      'Modelo_Importacao_Pagamentos'
    );
    setAlertConfig({
      isOpen: true,
      title: "Modelo baixado",
      description: "O modelo Excel foi salvo no seu computador.",
      type: "success"
    });
  };

  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const data = await parseExcelFile(file);
      let importedCount = 0;
      let errorCount = 0;

      for (const row of data) {
        try {
          if (!row['ID Crédito'] || !row['Montante']) continue;

          // Procurar Crédito
          const credit = credits.find(c => c.id === String(row['ID Crédito']));
          if (!credit) {
            errorCount++;
            continue;
          }

          const amount = Number(row['Montante']);
          const date = row['Data (AAAA-MM-DD)'] ? new Date(row['Data (AAAA-MM-DD)']) : new Date();
          const method = row['Método (cash, transfer, reference)'] || 'cash';

          // Alocação simplificada
          const lateInterest = credit.lateInterest;
          const interest = credit.accruedInterest;

          let remainingAmount = amount;
          const allocatedToLateInterest = Math.min(remainingAmount, lateInterest);
          remainingAmount -= allocatedToLateInterest;

          const allocatedToInterest = Math.min(remainingAmount, interest);
          remainingAmount -= allocatedToInterest;

          const allocatedToPrincipal = remainingAmount;

          await addPayment({
            id: `PAGAMENTO${Math.floor(Math.random() * 10000)}`,
            creditId: credit.id,
            clientName: credit.clientName,
            amount: amount,
            paymentDate: date,
            method: method as any,
            allocatedToLateInterest,
            allocatedToInterest,
            allocatedToPrincipal,
            processedBy: user?.name || 'Sistema',
            status: 'confirmed'
          }, user ? { id: user.id, name: user.name } : undefined);

          importedCount++;
        } catch (e) {
          errorCount++;
        }
      }

      setAlertConfig({
        isOpen: true,
        title: "Importação Concluída",
        description: `${importedCount} pagamentos importados com sucesso. ${errorCount} erros/créditos não encontrados.`,
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

  const handleDownloadHistory = (creditId: string) => {
    const creditPayments = payments.filter(p => p.creditId === creditId);
    if (creditPayments.length === 0) return;

    const lastPayment = creditPayments[0];
    generateCreditPaymentHistoryPDF(
      { id: creditId, clientName: lastPayment.clientName },
      creditPayments,
      companySettings,
      user?.name
    );
  };

  const handleAddNew = () => {
    setSelectedCreditId(undefined);
    setIsDialogOpen(true);
  };

  const handleRowPay = (creditId: string) => {
    setSelectedCreditId(creditId);
    setIsDialogOpen(true);
  };

  const handleViewDetails = (payment: Payment) => {
    setSelectedPayment(payment);
    setIsDetailsDialogOpen(true);
  };

  const handleViewHistory = (creditId: string, clientName: string) => {
    const history = payments.filter(p => p.creditId === creditId)
      .sort((a, b) => new Date(b.paymentDate).getTime() - new Date(a.paymentDate).getTime());
    setHistoryPayments(history);
    setHistoryClientName(clientName);
    setIsHistoryDialogOpen(true);
  };

  const handleDeleteClick = (payment: Payment) => {
    setSelectedPayment(payment);
    setJustificationModal({ isOpen: true, paymentId: payment.id });
  };

  const handleConfirmDelete = async (justification: string) => {
    if (selectedPayment) {
      await deletePayment(selectedPayment.id, user ? { id: user.id, name: user.name } : undefined, justification);
      setAlertConfig({
        isOpen: true,
        title: "Excluído!",
        description: "O registo de pagamento foi removido e estornado com sucesso.",
        type: "success"
      });
      setJustificationModal({ isOpen: false, paymentId: null });
      setSelectedPayment(undefined);
    }
  };

  const handleDownloadReceipt = (payment: any) => {
    const credit = credits.find((c) => c.id === payment.creditId) || { id: 'N/A' };
    try {
      generatePaymentReceipt(payment, credit, companySettings, user?.name);
      setAlertConfig({
        isOpen: true,
        title: "Recibo Gerado!",
        description: "O recibo do pagamento foi gerado com sucesso.",
        type: "success"
      });
    } catch (error) {
      setAlertConfig({
        isOpen: true,
        title: "Erro!",
        description: "Ocorreu um erro ao tentar gerar o recibo em PDF.",
        type: "error"
      });
    }
  };

  const handleSubmit = async (data: any) => {
    const credit = credits.find((c) => c.id === data.creditId);
    if (!credit) return;

    // Lógica simplificada para alocação (numa aplicação real, isto seria complexo)
    const lateInterest = credit.lateInterest;
    const interest = credit.accruedInterest;

    const currentBalance = credit.currentBalance;

    if (data.amount > currentBalance && currentBalance > 0) {
      setAlertConfig({
        isOpen: true,
        title: "Valor Excedido",
        description: `O valor máximo permitido para este pagamento é de ${formatCurrency(currentBalance)}.`,
        type: "error"
      });
      return;
    }

    if (currentBalance <= 0) {
      setAlertConfig({
        isOpen: true,
        title: "Crédito Liquidado",
        description: "Este contrato já se encontra totalmente pago.",
        type: "info"
      });
      return;
    }

    let remainingAmount = data.amount;
    const allocatedToLateInterest = Math.min(remainingAmount, lateInterest);
    remainingAmount -= allocatedToLateInterest;

    const allocatedToInterest = Math.min(remainingAmount, interest);
    remainingAmount -= allocatedToInterest;

    const allocatedToPrincipal = remainingAmount;

    const paymentId = `PAGAMENTO${Math.floor(Math.random() * 10000)}`;

    await addPayment({
      ...data,
      paymentDate: new Date(data.paymentDate),
      id: paymentId,
      clientName: credit.clientName,
      allocatedToLateInterest,
      allocatedToInterest,
      allocatedToPrincipal,
      processedBy: user?.name || 'Sistema',
      status: 'confirmed',
    }, user ? { id: user.id, name: user.name } : undefined);

    setIsDialogOpen(false);

    // Se o pagamento liquidou a dívida, avisar e abrir a partilha com o título/descrição de liquidação
    if (data.amount >= currentBalance) {
      setSharingModal({
        isOpen: true,
        clientName: credit.clientName,
        paymentId,
        clientId: credit.clientId,
        title: "Dívida Liquidada!",
        description: `O cliente ${credit.clientName} pagou a totalidade da sua dívida. O contrato foi encerrado com sucesso.`
      });
    } else {
      // Abrir automaticamente a modal de partilha após sucesso
      setSharingModal({
        isOpen: true,
        clientName: credit.clientName,
        paymentId,
        clientId: credit.clientId,
        title: "Pagamento Registado!",
        description: "O pagamento foi processado com sucesso"
      });
    }
  };

  const handleShareConfirm = async (method: 'whatsapp' | 'email' | 'both' | 'none') => {
    const { paymentId, clientId, clientName } = sharingModal;
    setSharingModal(prev => ({ ...prev, isOpen: false }));

    if (method === 'none') return;

    const payment = payments.find(p => p.id === paymentId) || payments[0];
    const credit = credits.find(c => c.id === payment?.creditId);

    // Num cenário real, precisaríamos do objeto cliente para telefone/email
    // Mas como o componente Payments não tem a lista de clientes direta, podemos precisar de uma solução alternativa
    // Por agora, vamos assumir que podemos encontrá-lo via crédito ou similar

    if (!payment) return;

    try {
      if (method === 'whatsapp') {
        const message = `Olá ${clientName}, segue o recibo do seu pagamento no valor de ${formatCurrency(payment.amount)} referente ao crédito ${payment.creditId}.`;
        window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank');
      } else if (method === 'email') {
        setAlertConfig({
          isOpen: true,
          title: "E-mail",
          description: "Recurso de e-mail será implementado em breve.",
          type: "warning"
        });
      }

      setAlertConfig({
        isOpen: true,
        title: "Canal aberto",
        description: "Siga as instruções no seu navegador.",
        type: "success"
      });
    } catch (e) {
      console.error("Error sharing:", e);
    }
  };

  return (
    <MainLayout title="Pagamentos" subtitle="Registo e gestão de pagamentos">
      {/* Ações do Cabeçalho */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:w-96">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Pesquisar por referência ou cliente..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2" onClick={handleDownloadTemplate}>
            <Download className="h-4 w-4" />
            Modelo
          </Button>
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
            Registar Pagamento
          </Button>
        </div>
      </div>

      {/* Cartões de Estatísticas com Estilo e Paleta de Login */}
      <div className="mb-6 grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        {/* 1. Pagamentos Efectuados (Azul Primário / Login Style) */}
        <div 
          onClick={() => setIsFilterModalOpen(true)}
          className="card-kpi-sky cursor-pointer hover:scale-[1.02] active:scale-[0.99] group"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/10 dark:bg-white/10 text-slate-950 dark:text-white shrink-0 group-hover:scale-105 transition-transform">
                <Receipt className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[11px] font-bold text-slate-900/70 dark:text-slate-400 uppercase tracking-wider truncate">
                  Volume
                </p>
                <p className="text-sm sm:text-base font-bold text-slate-950 dark:text-white truncate tracking-tight">
                  Pagamentos Efectuados
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsFilterModalOpen(true);
              }}
              title="Filtrar por Período"
              className="w-8 h-8 rounded-full bg-black/10 hover:bg-black/20 dark:bg-white/10 dark:hover:bg-white/20 flex items-center justify-center text-slate-950 dark:text-white transition-all hover:scale-110 active:scale-90 cursor-pointer shadow-2xs shrink-0"
            >
              <Filter className="h-4 w-4" />
            </button>
          </div>

          <div className="my-2">
            <p className="font-display text-3xl sm:text-4xl font-black tracking-tight text-slate-950 dark:text-white truncate">
              {(() => {
                const now = new Date();
                const filtered = payments.filter((p) => {
                  const paymentDate = new Date(p.paymentDate);

                  switch (dateFilter) {
                    case 'today':
                      return paymentDate.toDateString() === now.toDateString();
                    case 'week': {
                      const weekAgo = new Date(now);
                      weekAgo.setDate(now.getDate() - 7);
                      return paymentDate >= weekAgo && paymentDate <= now;
                    }
                    case 'month': {
                      return paymentDate.getMonth() === now.getMonth() &&
                        paymentDate.getFullYear() === now.getFullYear();
                    }
                    case 'year': {
                      return paymentDate.getFullYear() === now.getFullYear();
                    }
                    case 'custom': {
                      const start = new Date(customDateRange.start);
                      const end = new Date(customDateRange.end);
                      end.setHours(23, 59, 59, 999);
                      return paymentDate >= start && paymentDate <= end;
                    }
                    default:
                      return true;
                  }
                });
                return filtered.length;
              })()}
            </p>
          </div>

          <p className="text-xs font-semibold text-slate-900/75 dark:text-slate-400 truncate">
            {dateFilter === 'all' ? 'Todos os registros' : 'Registros no período ativo'}
          </p>
        </div>

        {/* 2. Valor Total (Verde Esmeralda / Login Style) */}
        <div className="card-kpi-mint">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/10 dark:bg-white/10 text-slate-950 dark:text-white shrink-0">
                <Banknote className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[11px] font-bold text-slate-900/70 dark:text-slate-400 uppercase tracking-wider truncate">
                  Total Arrecadado
                </p>
                <p className="text-sm sm:text-base font-bold text-slate-950 dark:text-white truncate tracking-tight">
                  Valor Total
                </p>
              </div>
            </div>
          </div>

          <div className="my-2">
            <p className="font-display text-3xl sm:text-4xl font-black tracking-tight text-slate-950 dark:text-white truncate" title={formatCurrency(payments.reduce((acc, p) => acc + p.amount, 0))}>
              {formatCurrency(payments.reduce((acc, p) => acc + p.amount, 0))}
            </p>
          </div>

          <p className="text-xs font-semibold text-slate-900/75 dark:text-slate-400 truncate">
            Montante global arrecadado
          </p>
        </div>

        {/* 3. Juros Recebidos (Dourado / Âmbar / Login Style) */}
        <div className="card-kpi-amber">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/10 dark:bg-white/10 text-slate-950 dark:text-white shrink-0">
                <CreditCard className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[11px] font-bold text-slate-900/70 dark:text-slate-400 uppercase tracking-wider truncate">
                  Rendimento
                </p>
                <p className="text-sm sm:text-base font-bold text-slate-950 dark:text-white truncate tracking-tight">
                  Juros Recebidos
                </p>
              </div>
            </div>
          </div>

          <div className="my-2">
            <p className="font-display text-3xl sm:text-4xl font-black tracking-tight text-slate-950 dark:text-white truncate" title={formatCurrency(payments.reduce((acc, p) => acc + p.allocatedToInterest + p.allocatedToLateInterest, 0))}>
              {formatCurrency(
                payments.reduce(
                  (acc, p) => acc + p.allocatedToInterest + p.allocatedToLateInterest,
                  0
                )
              )}
            </p>
          </div>

          <p className="text-xs font-semibold text-slate-900/75 dark:text-slate-400 truncate">
            Juros normais e de mora
          </p>
        </div>

        {/* 4. Principal Amortizado (Índigo / Púrpura / Login Style) */}
        <div className="card-kpi-purple">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/10 dark:bg-white/10 text-slate-950 dark:text-white shrink-0">
                <Building2 className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[11px] font-bold text-slate-900/70 dark:text-slate-400 uppercase tracking-wider truncate">
                  Recuperação
                </p>
                <p className="text-sm sm:text-base font-bold text-slate-950 dark:text-white truncate tracking-tight">
                  Principal Amortizado
                </p>
              </div>
            </div>
          </div>

          <div className="my-2">
            <p className="font-display text-3xl sm:text-4xl font-black tracking-tight text-slate-950 dark:text-white truncate" title={formatCurrency(payments.reduce((acc, p) => acc + p.allocatedToPrincipal, 0))}>
              {formatCurrency(payments.reduce((acc, p) => acc + p.allocatedToPrincipal, 0))}
            </p>
          </div>

          <p className="text-xs font-semibold text-slate-900/75 dark:text-slate-400 truncate">
            Amortização do capital cedido
          </p>
        </div>
      </div>

      {/* Tabela */}
      <div className="card-elevated overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead>Referência</TableHead>
              <TableHead>Crédito</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead>Alocação</TableHead>
              <TableHead>Método</TableHead>
              <TableHead>Data</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {displayPayments.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                  Nenhum pagamento encontrado.
                </TableCell>
              </TableRow>
            ) : paginatedPayments.map((payment, index) => {
              const MethodIcon = methodConfig[payment.method].icon;
              return (
                <TableRow
                  key={payment.creditId}
                  className="animate-fade-in"
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  <TableCell>
                    <span className="font-mono font-medium text-foreground">{payment.id}</span>
                  </TableCell>
                  <TableCell>
                    <span className="font-mono text-sm text-muted-foreground">{payment.creditId}</span>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-foreground">{payment.clientName}</p>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-primary hover:bg-primary/10"
                        onClick={() => handleViewHistory(payment.creditId, payment.clientName)}
                        title="Ver Histórico"
                      >
                        <History className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <p className="font-display text-lg font-semibold text-foreground">
                      {formatCurrency(payment.totalPaid)}
                    </p>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="gap-1.5 px-3 py-1 bg-slate-100/50 border-slate-200 text-slate-700 font-semibold shadow-sm">
                      {payment.count} {payment.count === 1 ? 'pagamento' : 'pagamentos'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <MethodIcon className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">{methodConfig[payment.method].label}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <p className="text-sm">{formatDateTime(payment.lastPaymentDate)}</p>
                    <p className="text-xs text-muted-foreground">por {payment.processedBy}</p>
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusConfig[payment.status]?.variant || 'default'}>
                      {statusConfig[payment.status]?.label || payment.status}
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
                        <DropdownMenuItem className="gap-2" onClick={() => handleViewDetails(payment)}>
                          <Eye className="h-4 w-4" />
                          Ver Detalhes
                        </DropdownMenuItem>
                        <DropdownMenuItem className="gap-2" onClick={() => handleViewHistory(payment.creditId, payment.clientName)}>
                          <History className="h-4 w-4" />
                          Ver Histórico
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="gap-2 text-primary focus:text-primary"
                          onClick={() => handleRowPay(payment.creditId)}
                          disabled={(() => {
                            const credit = credits.find(c => c.id === payment.creditId);
                            return credit?.status === 'paid' || (credit?.currentBalance || 0) <= 0;
                          })()}
                        >
                          <Plus className="h-4 w-4" />
                          Novo Pagamento
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="gap-2"
                          onClick={() => handleDownloadReceipt(payment)}
                        >
                          <FileText className="h-4 w-4" />
                          Emitir Recibo
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="gap-2"
                          onClick={() => handleDownloadHistory(payment.creditId)}
                        >
                          <Download className="h-4 w-4" />
                          Baixar Histórico de Pagamentos
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="gap-2 text-destructive focus:text-destructive"
                          onClick={() => handleDeleteClick(payment)}
                        >
                          <Trash2 className="h-4 w-4" />
                          Excluir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>

        {/* Controles de Paginação */}
        <div className="flex items-center justify-between border-t border-muted px-4 py-4 bg-muted/20">
          <div className="text-sm text-muted-foreground">
            Mostrando <span className="font-medium">{displayPayments.length === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1}</span> a <span className="font-medium">{Math.min(displayPayments.length, currentPage * itemsPerPage)}</span> de <span className="font-medium">{displayPayments.length}</span> créditos/pagamentos
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

      <Dialog open={isDetailsDialogOpen} onOpenChange={setIsDetailsDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Detalhes do Pagamento</DialogTitle>
          </DialogHeader>
          {selectedPayment && (
            <div className="space-y-6 py-4">
              <div className="flex items-center justify-between border-b pb-4">
                <div>
                  <p className="text-xs text-muted-foreground">Pagamento</p>
                  <p className="font-mono text-sm font-medium text-foreground">{selectedPayment.id}</p>
                </div>
                 <Badge variant={statusConfig[selectedPayment.status]?.variant || 'default'}>
                   {statusConfig[selectedPayment.status]?.label || selectedPayment.status}
                 </Badge>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Cliente</p>
                  <p className="font-medium">{selectedPayment.clientName}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Crédito</p>
                  <p className="font-mono text-sm">{selectedPayment.creditId}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Data do Pagamento</p>
                  <p className="text-sm">{formatDateTime(selectedPayment.paymentDate)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Processado por</p>
                  <p className="text-sm">{selectedPayment.processedBy}</p>
                </div>
              </div>

              <div className="rounded-lg bg-muted/50 p-4 space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Distribuição do Valor</p>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Amortização de Principal</span>
                    <span className="font-medium text-info">{formatCurrency(selectedPayment.allocatedToPrincipal)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Juros Ordinários</span>
                    <span className="font-medium text-warning">{formatCurrency(selectedPayment.allocatedToInterest)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Juros de Mora</span>
                    <span className="font-medium text-danger">{formatCurrency(selectedPayment.allocatedToLateInterest)}</span>
                  </div>
                  <div className="border-t pt-2 flex justify-between font-bold">
                    <span>Total Pago</span>
                    <span className="text-lg text-foreground">{formatCurrency(selectedPayment.amount)}</span>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Informações Adicionais</p>
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-medium">Método:</span>
                  <span>{methodConfig[selectedPayment.method].label}</span>
                </div>
                {selectedPayment.reference && (
                  <div className="flex items-center gap-2 text-sm">
                    <span className="font-medium">Ref. Bancária:</span>
                    <span className="font-mono">{selectedPayment.reference}</span>
                  </div>
                )}
              </div>

              <div className="flex gap-3 pt-2">
                <Button
                  className="w-full gap-2"
                  onClick={() => handleDownloadReceipt(selectedPayment)}
                >
                  <FileText className="h-4 w-4" />
                  Gerar Recibo
                </Button>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => setIsDetailsDialogOpen(false)}
                >
                  Fechar
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Registar Pagamento</DialogTitle>
          </DialogHeader>
          <PaymentForm
            onSubmit={handleSubmit}
            credits={credits}
            onCancel={() => setIsDialogOpen(false)}
            initialCreditId={selectedCreditId}
          />
        </DialogContent>
      </Dialog>

      {/* Modal de Histórico de Pagamentos */}
      <Dialog open={isHistoryDialogOpen} onOpenChange={setIsHistoryDialogOpen}>
        <DialogContent className="max-w-6xl w-[95vw] max-h-[90vh] overflow-y-auto">
          <DialogHeader className="flex flex-row items-center justify-between">
            <div className="space-y-0.5">
              <DialogTitle className="text-lg font-bold flex items-center gap-2">
                <History className="h-5 w-5 text-primary" />
                Histórico de Pagamentos
              </DialogTitle>
              <p className="text-sm text-muted-foreground">
                Todos os pagamentos registados para <span className="font-semibold text-foreground">{historyClientName}</span>
              </p>
            </div>
          </DialogHeader>

          <div className="mt-6 border rounded-xl overflow-hidden glass shadow-sm">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="w-12 font-bold text-center">#</TableHead>
                  <TableHead className="font-bold">Referência / Ordem</TableHead>
                  <TableHead className="text-right font-bold">Valor</TableHead>
                  <TableHead className="font-bold min-w-[160px]">Distribuição</TableHead>
                  <TableHead className="font-bold">Método</TableHead>
                  <TableHead className="font-bold">Data & Hora</TableHead>
                  <TableHead className="font-bold">Processado por</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {historyPayments.map((p, idx) => {
                  const MIcon = methodConfig[p.method].icon;
                  const ordinal = historyPayments.length - idx;
                  return (
                    <TableRow key={p.id} className="hover:bg-muted/20 transition-colors">
                      <TableCell className="text-center">
                        <Badge variant="outline" className="h-6 w-6 rounded-full p-0 flex items-center justify-center bg-background">
                          {ordinal}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-mono font-medium">{p.id}</span>
                          <span className="text-[10px] text-primary font-bold uppercase">{ordinal}º Pagamento</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-bold text-lg">{formatCurrency(p.amount)}</TableCell>
                      <TableCell className="min-w-[160px]">
                        <div className="text-xs space-y-0.5">
                          <p className="flex justify-between gap-4"><span>Principal:</span> <span className="font-medium text-info">{formatCurrency(p.allocatedToPrincipal)}</span></p>
                          <p className="flex justify-between gap-4"><span>Juros:</span> <span className="font-medium text-warning">{formatCurrency(p.allocatedToInterest)}</span></p>
                          {p.allocatedToLateInterest > 0 && (
                            <p className="flex justify-between gap-4"><span>Mora:</span> <span className="font-medium text-danger">{formatCurrency(p.allocatedToLateInterest)}</span></p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <MIcon className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm">{methodConfig[p.method].label}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{formatDateTime(p.paymentDate)}</TableCell>
                      <TableCell className="text-sm font-medium">{p.processedBy}</TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-primary hover:text-primary hover:bg-primary/10"
                          onClick={() => handleDownloadReceipt(p)}
                          title="Emitir Recibo"
                        >
                          <FileText className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <div className="mt-6 flex flex-col md:flex-row items-center justify-between gap-4 pt-4 border-t">
            <div className="flex items-center gap-4 bg-primary/5 px-6 py-3 rounded-xl border border-primary/10">
              <div className="flex flex-col">
                <span className="text-[10px] uppercase text-muted-foreground font-bold leading-tight">Total Liquidado no Histórico</span>
                <span className="text-2xl font-black text-primary leading-tight">
                  {formatCurrency(historyPayments.reduce((acc, p) => acc + p.amount, 0))}
                </span>
              </div>
              <div className="h-10 w-px bg-primary/20" />
              <div className="flex flex-col">
                <span className="text-[10px] uppercase text-muted-foreground font-bold leading-tight">Qtd. Pagamentos</span>
                <span className="text-2xl font-black text-foreground leading-tight">{historyPayments.length}</span>
              </div>
            </div>

            <Button variant="outline" onClick={() => setIsHistoryDialogOpen(false)} className="px-8 h-12 font-bold">
              Fechar Histórico
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <JustificationModal
        isOpen={justificationModal.isOpen}
        onClose={() => setJustificationModal({ isOpen: false, paymentId: null })}
        onConfirm={handleConfirmDelete}
        title="Excluir e Estornar Pagamento"
        description="Esta ação removerá o pagamento e criará um estorno contábil. Por favor, justifique esta operação."
        confirmText="Confirmar Estorno"
        actionType="destructive"
      />

      <AlertModal
        isOpen={alertConfig.isOpen}
        onClose={() => setAlertConfig({ ...alertConfig, isOpen: false })}
        title={alertConfig.title}
        description={alertConfig.description}
        type={alertConfig.type}
      />

      <ConfirmSharingModal
        isOpen={sharingModal.isOpen}
        onClose={() => setSharingModal(prev => ({ ...prev, isOpen: false }))}
        onConfirm={handleShareConfirm}
        title={sharingModal.title || "Pagamento Registado!"}
        description={sharingModal.description || "O pagamento foi processado com sucesso"}
        clientName={sharingModal.clientName}
      />


      <PaymentFilterModal
        isOpen={isFilterModalOpen}
        onClose={() => setIsFilterModalOpen(false)}
        payments={payments}
        dateFilter={dateFilter}
        setDateFilter={setDateFilter}
        customDateRange={customDateRange}
        setCustomDateRange={setCustomDateRange}
      />
    </MainLayout >


  );
}



