import { KzIcon } from '@/componentes/ui/KzIcon';
import React, { useState, useMemo, useCallback } from 'react';
import { MainLayout } from '@/componentes/layout/MainLayout';
import { Button } from '@/componentes/ui/button';
import { Input } from '@/componentes/ui/input';
import { Label } from '@/componentes/ui/label';
import { Textarea } from '@/componentes/ui/textarea';
import { Switch } from '@/componentes/ui/switch';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from '@/componentes/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/componentes/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/componentes/ui/select";
import { useData } from '@/contextos/ContextoDados';
import { useAuth } from '@/contextos/ContextoAutenticacao';
import { 
  Handshake, 
  Phone, 
  Mail, 
  MapPin, 
  FileText, 
  Plus, 
  Edit, 
  Calendar, 
  Search, 
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  TrendingUp,
  Users,
  Eye
} from 'lucide-react';
import { toast } from '@/ganchos/usar-toast';
import { generateSupplierReportPDF } from '@/bibliotecas/pdf';
import { formatCurrency } from '@/bibliotecas/formatters';

export default function Fornecedores() {
  const { user } = useAuth();
  const { suppliers, addSupplier, updateSupplier, deleteSupplier, credits, payments, companySettings, clients } = useData();

  // Filter States
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMonth, setSelectedMonth] = useState<string>('all');
  const [selectedYear, setSelectedYear] = useState<string>(new Date().getFullYear().toString());

  // Pagination & List UI States
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 6;

  // Dialog States
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [currentSupplier, setCurrentSupplier] = useState<any>(null);

  // Form States
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [nif, setNif] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<'active' | 'inactive'>('active');
  const [expandedSupplier, setExpandedSupplier] = useState<string | null>(null);
  const [isCapitalAppliedModalOpen, setIsCapitalAppliedModalOpen] = useState(false);
  const [isJurosArrecadadosModalOpen, setIsJurosArrecadadosModalOpen] = useState(false);
  const [isCreditosPeriodoModalOpen, setIsCreditosPeriodoModalOpen] = useState(false);
  const [isSupplierDetailModalOpen, setIsSupplierDetailModalOpen] = useState(false);
  const [selectedSupplierForDetail, setSelectedSupplierForDetail] = useState<any>(null);

  const months = [
    { value: 'all', label: 'Todos os Meses' },
    { value: '0', label: 'Janeiro' },
    { value: '1', label: 'Fevereiro' },
    { value: '2', label: 'Março' },
    { value: '3', label: 'Abril' },
    { value: '4', label: 'Maio' },
    { value: '5', label: 'Junho' },
    { value: '6', label: 'Julho' },
    { value: '7', label: 'Agosto' },
    { value: '8', label: 'Setembro' },
    { value: '9', label: 'Outubro' },
    { value: '10', label: 'Novembro' },
    { value: '11', label: 'Dezembro' }
  ];

  const years = useMemo(() => {
    const list = [];
    const current = new Date().getFullYear();
    for (let y = current - 3; y <= current + 2; y++) {
      list.push(y.toString());
    }
    return list;
  }, []);

  // Helper to check if a credit falls into the selected period filter
  const isCreditInPeriod = useCallback((c: any) => {
    const d = new Date(c.startDate);
    const mMatch = selectedMonth === 'all' || d.getMonth().toString() === selectedMonth;
    const yMatch = d.getFullYear().toString() === selectedYear;
    return mMatch && yMatch;
  }, [selectedMonth, selectedYear]);

  // Helper to check if a payment falls into the selected period filter
  const isPaymentInPeriod = useCallback((p: any) => {
    const d = new Date(p.paymentDate);
    const mMatch = selectedMonth === 'all' || d.getMonth().toString() === selectedMonth;
    const yMatch = d.getFullYear().toString() === selectedYear;
    return mMatch && yMatch;
  }, [selectedMonth, selectedYear]);

  // Helper to calculate supplier profit division stats for a single credit
  const getCreditSupplierProfitStats = (c: any) => {
    const principal = Number(c.principalAmount || 0);
    const interestRate = Number(c.interestRate || 0);
    const supplierProfitRate = Number(c.supplierProfitRate || 0);

    const juroTotalGerado = Number(c.accruedInterest || 0);
    const lucroFornecedorTotal = principal * (supplierProfitRate / 100);
    const lucroGestorTotal = Math.max(0, juroTotalGerado - lucroFornecedorTotal);

    const creditPayments = payments.filter(p => p.creditId === c.id && p.status !== 'cancelled' && !p.deletedAt);
    const principalPaid = creditPayments.reduce((sum, p) => sum + Number(p.allocatedToPrincipal || 0), 0);
    const interestPaid = creditPayments.reduce((sum, p) => sum + Number(p.allocatedToInterest || 0) + Number(p.allocatedToLateInterest || 0), 0);

    const ratioFornecedor = interestRate > 0 ? (supplierProfitRate / interestRate) : 0;
    const lucroFornecedorArrecadado = interestPaid * ratioFornecedor;
    const lucroGestorArrecadado = interestPaid * (1 - ratioFornecedor);
    const totalRepassadoFornecedor = principalPaid + lucroFornecedorArrecadado;

    const principalRemaining = Math.max(0, principal - principalPaid);
    const lucroFornecedorRemaining = Math.max(0, lucroFornecedorTotal - lucroFornecedorArrecadado);
    const lucroGestorRemaining = Math.max(0, lucroGestorTotal - lucroGestorArrecadado);

    return {
      principal,
      juroTotalGerado,
      lucroFornecedorTotal,
      lucroGestorTotal,
      principalPaid,
      interestPaid,
      lucroFornecedorArrecadado,
      lucroGestorArrecadado,
      totalRepassadoFornecedor,
      principalRemaining,
      lucroFornecedorRemaining,
      lucroGestorRemaining
    };
  };

  // Helper to calculate supplier profit division stats across all credits of a supplier
  const getSupplierProfitDivision = (supId: string) => {
    const supplierCredits = credits.filter(c => c.supplierId === supId && !c.deletedAt);
    const periodCredits = supplierCredits.filter(isCreditInPeriod);

    let totalPrincipal = 0;
    let totalJuroGerado = 0;
    let totalLucroFornecedor = 0;
    let totalLucroGestor = 0;

    let totalPrincipalPaid = 0;
    let totalLucroFornecedorArrecadado = 0;
    let totalLucroGestorArrecadado = 0;
    let totalRepassadoFornecedor = 0;

    let totalPrincipalRemaining = 0;
    let totalLucroFornecedorRemaining = 0;
    let totalLucroGestorRemaining = 0;

    periodCredits.forEach(c => {
      const stats = getCreditSupplierProfitStats(c);
      totalPrincipal += stats.principal;
      totalJuroGerado += stats.juroTotalGerado;
      totalLucroFornecedor += stats.lucroFornecedorTotal;
      totalLucroGestor += stats.lucroGestorTotal;

      totalPrincipalPaid += stats.principalPaid;
      totalLucroFornecedorArrecadado += stats.lucroFornecedorArrecadado;
      totalLucroGestorArrecadado += stats.lucroGestorArrecadado;
      totalRepassadoFornecedor += stats.totalRepassadoFornecedor;

      totalPrincipalRemaining += stats.principalRemaining;
      totalLucroFornecedorRemaining += stats.lucroFornecedorRemaining;
      totalLucroGestorRemaining += stats.lucroGestorRemaining;
    });

    return {
      totalPrincipal,
      totalJuroGerado,
      totalLucroFornecedor,
      totalLucroGestor,
      totalPrincipalPaid,
      totalLucroFornecedorArrecadado,
      totalLucroGestorArrecadado,
      totalRepassadoFornecedor,
      totalPrincipalRemaining,
      totalLucroFornecedorRemaining,
      totalLucroGestorRemaining
    };
  };

  // Calculate Metrics for a specific supplier
  const getSupplierStats = useCallback((supId: string) => {
    // Filter credits belonging to this supplier & selected period
    const supplierCredits = credits.filter(c => c.supplierId === supId && !c.deletedAt);
    const periodCredits = supplierCredits.filter(isCreditInPeriod);

    // Sum of principal amount (invested)
    const investedTotal = periodCredits.reduce((sum, c) => sum + Number(c.principalAmount || 0), 0);
    
    // Sum of expected/accrued interest (projected gain)
    const projectedInterest = periodCredits.reduce((sum, c) => sum + Number(c.accruedInterest || 0), 0);

    // Sum of supplier's portion of realized interest from payments in the period
    let gainTotal = 0;
    supplierCredits.forEach(c => {
      const creditPayments = payments.filter(p => p.creditId === c.id && p.status !== 'cancelled' && !p.deletedAt && isPaymentInPeriod(p));
      const interestPaid = creditPayments.reduce((sum, p) => sum + Number(p.allocatedToInterest || 0) + Number(p.allocatedToLateInterest || 0), 0);
      const ratioFornecedor = Number(c.interestRate || 0) > 0 ? (Number(c.supplierProfitRate || 0) / Number(c.interestRate || 0)) : 0;
      gainTotal += interestPaid * ratioFornecedor;
    });

    // Client breakdown: group credits by client
    const clientMap = new Map<string, { clientName: string; totalApplied: number; totalPaid: number; creditsCount: number; status: string }>();
    periodCredits.forEach(c => {
      const existing = clientMap.get(c.clientId) || { clientName: c.clientName, totalApplied: 0, totalPaid: 0, creditsCount: 0, status: c.status };
      existing.totalApplied += Number(c.principalAmount || 0);
      existing.creditsCount += 1;
      
      const creditPayments = payments.filter(p => p.creditId === c.id && p.status !== 'cancelled' && !p.deletedAt);
      const principalPaid = creditPayments.reduce((sum, p) => sum + Number(p.allocatedToPrincipal || 0), 0);
      const interestPaid = creditPayments.reduce((sum, p) => sum + Number(p.allocatedToInterest || 0) + Number(p.allocatedToLateInterest || 0), 0);
      const ratioFornecedor = Number(c.interestRate || 0) > 0 ? (Number(c.supplierProfitRate || 0) / Number(c.interestRate || 0)) : 0;
      
      // Total received by supplier from payments for this client (principal + supplier's interest portion)
      existing.totalPaid += principalPaid + (interestPaid * ratioFornecedor);
      
      // Use worst status
      if (c.status === 'defaulted' || c.status === 'overdue') existing.status = c.status;
      else if (c.status === 'active' && existing.status === 'paid') existing.status = 'active';
      clientMap.set(c.clientId, existing);
    });
    const clientBreakdown = Array.from(clientMap.entries()).map(([clientId, data]) => ({
      clientId,
      ...data
    }));

    return {
      creditsCount: periodCredits.length,
      investedTotal,
      gainTotal,
      projectedInterest,
      clientBreakdown,
      uniqueClients: clientMap.size
    };
  }, [credits, isCreditInPeriod, isPaymentInPeriod, payments]);

  // Global Statistics (Aggregated across all suppliers in selected period)
  const globalStats = useMemo(() => {
    const activeSups = suppliers.filter(s => s.status === 'active');
    let totalInvested = 0;
    let totalGain = 0;
    let totalProjected = 0;
    let totalCreditsCount = 0;

    activeSups.forEach(sup => {
      const stats = getSupplierStats(sup.id);
      totalInvested += stats.investedTotal;
      totalGain += stats.gainTotal;
      totalProjected += stats.projectedInterest;
      totalCreditsCount += stats.creditsCount;
    });

    return {
      suppliersCount: activeSups.length,
      totalInvested,
      totalGain,
      totalProjected,
      totalCreditsCount
    };
  }, [suppliers, getSupplierStats]);

  // Filtered Suppliers List
  const filteredSuppliers = useMemo(() => {
    return suppliers.filter(sup => {
      const s = searchTerm.toLowerCase();
      return (
        sup.name.toLowerCase().includes(s) ||
        (sup.nif || '').toLowerCase().includes(s) ||
        (sup.phone || '').toLowerCase().includes(s)
      );
    });
  }, [suppliers, searchTerm]);

  // Pagination for Suppliers
  const totalPages = Math.ceil(filteredSuppliers.length / itemsPerPage);
  const paginatedSuppliers = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredSuppliers.slice(start, start + itemsPerPage);
  }, [filteredSuppliers, currentPage]);

  const formatNIFInput = (value: string) => {
    const cleanValue = value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    const hasLetters = /[A-Z]/.test(cleanValue);
    const isSingular = hasLetters || cleanValue.length > 10;

    if (!isSingular) {
      return cleanValue.slice(0, 10).replace(/[^0-9]/g, '');
    } else {
      let formatted = '';
      for (let i = 0; i < cleanValue.length && i < 14; i++) {
        const char = cleanValue[i];
        if (i < 9) {
          if (/[0-9]/.test(char)) formatted += char;
        } else if (i < 11) {
          if (/[A-Z]/.test(char)) formatted += char;
        } else {
          if (/[0-9]/.test(char)) formatted += char;
        }
      }
      return formatted;
    }
  };

  // Form Handlers
  const handleCreate = async () => {
    if (!name.trim()) {
      toast({
        title: "Campo Obrigatório",
        description: "O nome do fornecedor/parceiro é obrigatório.",
        variant: "destructive"
      });
      return;
    }

    try {
      await addSupplier({
        name: name.trim(),
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        nif: nif.trim() || undefined,
        address: address.trim() || undefined,
        notes: notes.trim() || undefined,
        status
      }, user ? { id: user.id, name: user.name } : undefined);

      toast({
        title: "Sucesso",
        description: "Fornecedor/Parceiro registado com sucesso."
      });
      setIsCreateOpen(false);
      resetForm();
    } catch (e: any) {
      toast({
        title: "Erro ao criar",
        description: e.message || "Não foi possível registar o fornecedor.",
        variant: "destructive"
      });
    }
  };

  const handleEditOpen = (sup: any) => {
    setCurrentSupplier(sup);
    setName(sup.name);
    setPhone(sup.phone || '');
    setEmail(sup.email || '');
    setNif(sup.nif || '');
    setAddress(sup.address || '');
    setNotes(sup.notes || '');
    setStatus(sup.status);
    setIsEditOpen(true);
  };

  const handleEdit = async () => {
    if (!name.trim()) {
      toast({
        title: "Campo Obrigatório",
        description: "O nome é obrigatório.",
        variant: "destructive"
      });
      return;
    }

    try {
      await updateSupplier(currentSupplier.id, {
        name: name.trim(),
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        nif: nif.trim() || undefined,
        address: address.trim() || undefined,
        notes: notes.trim() || undefined,
        status
      }, user ? { id: user.id, name: user.name } : undefined);

      toast({
        title: "Sucesso",
        description: "Cadastro de fornecedor/parceiro atualizado."
      });
      setIsEditOpen(false);
      resetForm();
    } catch (e: any) {
      toast({
        title: "Erro ao editar",
        description: e.message || "Não foi possível atualizar o fornecedor.",
        variant: "destructive"
      });
    }
  };

  const handleToggleStatus = async (sup: any) => {
    try {
      const nextStatus = sup.status === 'active' ? 'inactive' : 'active';
      await updateSupplier(sup.id, { status: nextStatus }, user ? { id: user.id, name: user.name } : undefined);
      toast({
        title: "Sucesso",
        description: `Fornecedor definido como ${nextStatus === 'active' ? 'Ativo' : 'Inativo'}.`
      });
    } catch (e: any) {
      toast({
        title: "Erro ao alterar estado",
        description: e.message || "Falha ao mudar estado do fornecedor.",
        variant: "destructive"
      });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Tem certeza de que deseja remover este fornecedor/parceiro? Os créditos já vinculados continuarão registados.")) return;

    try {
      await deleteSupplier(id, user ? { id: user.id, name: user.name } : undefined);
      toast({
        title: "Sucesso",
        description: "Fornecedor/Parceiro removido com sucesso."
      });
    } catch (e: any) {
      toast({
        title: "Erro ao remover",
        description: e.message || "Não foi possível remover o fornecedor.",
        variant: "destructive"
      });
    }
  };

  const resetForm = () => {
    setName('');
    setPhone('');
    setEmail('');
    setNif('');
    setAddress('');
    setNotes('');
    setStatus('active');
    setCurrentSupplier(null);
  };

  const handleDownloadReport = (sup: any) => {
    const supplierCredits = credits.filter(c => c.supplierId === sup.id);
    const periodCredits = supplierCredits.filter(isCreditInPeriod);
    const label = `${months.find(m => m.value === selectedMonth)?.label} / ${selectedYear}`;

    generateSupplierReportPDF(
      sup,
      periodCredits,
      payments,
      label,
      companySettings,
      user?.name
    );

    toast({
      title: "PDF Gerado",
      description: `O relatório para ${sup.name} foi baixado com sucesso.`
    });
  };

  return (
    <MainLayout title="Fornecedores & Parceiros" subtitle="Gestão de fornecedores e capital investido">
      <div className="flex flex-col gap-6 p-6 animate-in fade-in duration-500">
        
        {/* Header Block */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/40 pb-5">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-primary/10 text-primary rounded-2xl">
              <Handshake className="h-7 w-7" />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-slate-800 dark:text-slate-100 uppercase italic">
                Fornecedores & Parceiros
              </h1>
              <p className="text-xs text-muted-foreground">
                Registe os capitais disponibilizados por parceiros e rastreie os seus retornos.
              </p>
            </div>
          </div>
          <Button onClick={() => { resetForm(); setIsCreateOpen(true); }} className="gap-2 rounded-xl">
            <Plus className="h-4 w-4" /> Novo Fornecedor
          </Button>
        </div>

        {/* Filters Panel */}
        <div className="bg-card border border-border/50 rounded-2xl p-5 shadow-sm flex flex-col md:flex-row md:items-center gap-4 justify-between">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Pesquisar fornecedores por nome, telefone ou NIF..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 h-11 rounded-xl"
            />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800/50 p-1.5 rounded-xl border border-border">
              <select 
                value={selectedMonth} 
                onChange={(e) => { setSelectedMonth(e.target.value); setCurrentPage(1); }}
                className="bg-transparent border-none text-xs font-medium focus:ring-0 focus:ring-offset-0 h-8 px-2"
              >
                {months.map(m => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
              
              <select 
                value={selectedYear} 
                onChange={(e) => { setSelectedYear(e.target.value); setCurrentPage(1); }}
                className="bg-transparent border-none text-xs font-medium focus:ring-0 focus:ring-offset-0 h-8 px-2"
              >
                {years.map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Global Statistics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="rounded-2xl border-border/50 shadow-sm relative overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
                Parceiros Ativos
              </CardTitle>
              <Handshake className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-black tracking-tight">{globalStats.suppliersCount}</div>
              <p className="text-[10px] text-muted-foreground mt-1">Carga ativa no período selecionado</p>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-border/50 shadow-sm relative overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
                Capital Aplicado
              </CardTitle>
              <div className="flex items-center gap-1.5">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-emerald-600 hover:bg-emerald-500/10 rounded-full"
                  onClick={() => setIsCapitalAppliedModalOpen(true)}
                  title="Auditar Capital Aplicado"
                >
                  <Eye className="h-3.5 w-3.5" />
                </Button>
                <KzIcon className="h-4 w-4 text-emerald-500" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-black tracking-tight text-emerald-600 dark:text-emerald-400">
                {formatCurrency(globalStats.totalInvested, companySettings.currency)}
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">Investido por parceiros no período</p>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-border/50 shadow-sm relative overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
                Juros Arrecadados
              </CardTitle>
              <div className="flex items-center gap-1.5">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-indigo-600 hover:bg-indigo-500/10 rounded-full"
                  onClick={() => setIsJurosArrecadadosModalOpen(true)}
                  title="Auditar Divisão de Lucros"
                >
                  <Eye className="h-3.5 w-3.5" />
                </Button>
                <TrendingUp className="h-4 w-4 text-indigo-500" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-black tracking-tight text-indigo-600 dark:text-indigo-400">
                {formatCurrency(globalStats.totalGain, companySettings.currency)}
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">Retorno pago aos parceiros no período</p>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-border/50 shadow-sm relative overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
                Créditos do Período
              </CardTitle>
              <div className="flex items-center gap-1.5">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-amber-600 hover:bg-amber-500/10 rounded-full"
                  onClick={() => setIsCreditosPeriodoModalOpen(true)}
                  title="Auditar Créditos por Parceiro"
                >
                  <Eye className="h-3.5 w-3.5" />
                </Button>
                <FileText className="h-4 w-4 text-amber-500" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-black tracking-tight">{globalStats.totalCreditsCount}</div>
              <p className="text-[10px] text-muted-foreground mt-1">Contratos ativos originados por parceiros</p>
            </CardContent>
          </Card>
        </div>

        {/* Suppliers Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {paginatedSuppliers.length === 0 ? (
            <div className="col-span-full py-16 text-center text-slate-400">
              <Handshake className="h-12 w-12 mx-auto mb-3 opacity-20" />
              <p className="text-sm font-semibold">Nenhum fornecedor/parceiro registado ou correspondente à busca.</p>
            </div>
          ) : (
            paginatedSuppliers.map((sup) => {
              const stats = getSupplierStats(sup.id);
              return (
                <Card key={sup.id} className={`rounded-3xl border-border/50 shadow-sm overflow-hidden flex flex-col justify-between ${sup.status === 'inactive' ? 'opacity-65' : ''}`}>
                  <CardHeader className="bg-slate-50/50 dark:bg-slate-900/20 pb-4 border-b border-border/30">
                    <div className="flex justify-between items-start gap-2">
                      <div>
                        <CardTitle className="text-lg font-black tracking-tight text-slate-700 dark:text-slate-200">
                          {sup.name}
                        </CardTitle>
                        <CardDescription className="text-xs mt-0.5">
                          {sup.nif ? `NIF: ${sup.nif}` : 'Sem NIF'}
                        </CardDescription>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-primary hover:bg-primary/10 rounded-full"
                          onClick={() => {
                            setSelectedSupplierForDetail(sup);
                            setIsSupplierDetailModalOpen(true);
                          }}
                          title="Ver Distribuição por Clientes"
                        >
                          <Eye className="h-4.5 w-4.5" />
                        </Button>
                        <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                          sup.status === 'active' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-red-500/10 text-red-500'
                        }`}>
                          {sup.status === 'active' ? 'Ativo' : 'Inativo'}
                        </span>
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="py-4 space-y-4">
                    {/* Metrics Section */}
                    <div className="grid grid-cols-2 gap-3 bg-slate-100/40 dark:bg-slate-800/10 p-3 rounded-2xl border border-border/30">
                      <div>
                        <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Capital Aplicado</div>
                        <div className="text-sm font-black text-slate-700 dark:text-slate-300">
                          {formatCurrency(stats.investedTotal, companySettings.currency)}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Retorno Recebido</div>
                        <div className="text-sm font-black text-emerald-600 dark:text-emerald-400">
                          {formatCurrency(stats.gainTotal, companySettings.currency)}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Créditos</div>
                        <div className="text-sm font-black text-slate-700 dark:text-slate-300">
                          {stats.creditsCount}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Clientes</div>
                        <div className="text-sm font-black text-indigo-600 dark:text-indigo-400">
                          {stats.uniqueClients}
                        </div>
                      </div>
                    </div>

                    {/* Basic Contacts */}
                    <div className="space-y-1.5 text-xs text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <Phone className="h-3.5 w-3.5 text-primary/70" />
                        <span>{sup.phone || 'Não informado'}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Mail className="h-3.5 w-3.5 text-primary/70" />
                        <span className="truncate">{sup.email || 'Não informado'}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <MapPin className="h-3.5 w-3.5 text-primary/70" />
                        <span className="truncate">{sup.address || 'Não informado'}</span>
                      </div>
                    </div>

                    {sup.notes && (
                      <p className="text-[11px] text-muted-foreground italic border-t pt-2 border-border/30">
                        {sup.notes}
                      </p>
                    )}
                  </CardContent>

                  <CardFooter className="bg-slate-50/20 dark:bg-slate-900/10 border-t border-border/30 py-3 flex gap-1.5 justify-end flex-wrap">
                    <Button variant="outline" size="sm" onClick={() => { setSelectedSupplierForDetail(sup); setIsSupplierDetailModalOpen(true); }} className="h-8 rounded-lg px-2 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-900/20 border-indigo-200 text-indigo-700 dark:text-indigo-300">
                      <Eye className="h-3.5 w-3.5 mr-1" /> Detalhes
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleEditOpen(sup)} className="h-8 rounded-lg px-2">
                      <Edit className="h-3.5 w-3.5 mr-1" /> Editar
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleToggleStatus(sup)} className={`h-8 rounded-lg px-2 ${sup.status === 'active' ? 'text-amber-600' : 'text-emerald-600'}`}>
                      {sup.status === 'active' ? 'Inativar' : 'Activar'}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => handleDownloadReport(sup)} className="h-8 rounded-lg px-2">
                      <FileText className="h-3.5 w-3.5 mr-1 text-primary" /> Relatório
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(sup.id)} className="h-8 text-red-500 rounded-lg px-2 hover:bg-red-50">
                      Excluir
                    </Button>
                  </CardFooter>
                </Card>
              );
            })
          )}
        </div>

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-border/40 pt-4 mt-2">
            <p className="text-xs text-muted-foreground">
              Mostrando {paginatedSuppliers.length} de {filteredSuppliers.length} fornecedores
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                className="h-8 w-8 p-0"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-xs font-bold text-slate-700">
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
        )}

        {/* Create Supplier Dialog */}
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Novo Fornecedor / Parceiro</DialogTitle>
              <DialogDescription>Preencha os dados do fornecedor de capital.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-3 py-3">
              <div className="grid gap-1">
                <Label htmlFor="name">Nome / Razão Social *</Label>
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: João da Silva / Investimentos Lda" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1">
                  <Label htmlFor="phone">Telefone</Label>
                  <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="9xx xxx xxx" />
                </div>
                <div className="grid gap-1">
                  <Label htmlFor="nif">NIF / BI</Label>
                  <Input id="nif" value={nif} onChange={(e) => setNif(formatNIFInput(e.target.value))} placeholder="000000000AA000" maxLength={14} />
                </div>
              </div>
              <div className="grid gap-1">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@exemplo.com" />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="address">Morada / Endereço</Label>
                <Input id="address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Ex: Edifício Fidelidade, Luanda" />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="notes">Notas / Condições</Label>
                <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notas adicionais, taxas preferenciais, etc." />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Cancelar</Button>
              <Button onClick={handleCreate}>Registar Fornecedor</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Supplier Dialog */}
        <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Editar Fornecedor / Parceiro</DialogTitle>
              <DialogDescription>Edite as informações cadastrais.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-3 py-3">
              <div className="grid gap-1">
                <Label htmlFor="edit-name">Nome / Razão Social *</Label>
                <Input id="edit-name" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1">
                  <Label htmlFor="edit-phone">Telefone</Label>
                  <Input id="edit-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
                </div>
                <div className="grid gap-1">
                  <Label htmlFor="edit-nif">NIF / BI</Label>
                  <Input id="edit-nif" value={nif} onChange={(e) => setNif(formatNIFInput(e.target.value))} placeholder="000000000AA000" maxLength={14} />
                </div>
              </div>
              <div className="grid gap-1">
                <Label htmlFor="edit-email">Email</Label>
                <Input id="edit-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="edit-address">Morada / Endereço</Label>
                <Input id="edit-address" value={address} onChange={(e) => setAddress(e.target.value)} />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="edit-notes">Notas / Condições</Label>
                <Textarea id="edit-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsEditOpen(false)}>Cancelar</Button>
              <Button onClick={handleEdit}>Gravar Alterações</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Capital Aplicado Detail Modal */}
        <Dialog open={isCapitalAppliedModalOpen} onOpenChange={setIsCapitalAppliedModalOpen}>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle>Distribuição do Capital Aplicado</DialogTitle>
              <DialogDescription>
                Capital total investido por cada fornecedor/parceiro no período selecionado.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4 space-y-4">
              <div className="border border-border/40 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-900/50 text-xs font-bold text-muted-foreground uppercase">
                    <tr>
                      <th className="px-4 py-3 text-left">Fornecedor</th>
                      <th className="px-4 py-3 text-right">Créditos</th>
                      <th className="px-4 py-3 text-right">Clientes</th>
                      <th className="px-4 py-3 text-right">Valor Aplicado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/30">
                    {suppliers.filter(s => s.status === 'active').map(sup => {
                      const stats = getSupplierStats(sup.id);
                      if (stats.investedTotal === 0) return null;
                      return (
                        <tr key={sup.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/10">
                          <td className="px-4 py-3 font-semibold">{sup.name}</td>
                          <td className="px-4 py-3 text-right">{stats.creditsCount}</td>
                          <td className="px-4 py-3 text-right">{stats.uniqueClients}</td>
                          <td className="px-4 py-3 text-right text-emerald-600 dark:text-emerald-400 font-bold">
                            {formatCurrency(stats.investedTotal, companySettings.currency)}
                          </td>
                        </tr>
                      );
                    })}
                    {suppliers.filter(s => s.status === 'active').every(s => getSupplierStats(s.id).investedTotal === 0) && (
                      <tr>
                        <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground italic">
                          Nenhum investimento registrado no período selecionado.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => setIsCapitalAppliedModalOpen(false)}>Fechar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Juros Arrecadados / Divisão de Lucros Modal */}
        <Dialog open={isJurosArrecadadosModalOpen} onOpenChange={setIsJurosArrecadadosModalOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Mapeamento de Lucros e Repasses</DialogTitle>
              <DialogDescription>
                Divisão exata dos lucros (arrecadados a partir de pagamentos) e saldos a repassar.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4 space-y-4">
              {/* Aggregated view */}
              {(() => {
                let aggPrincipal = 0;
                let aggJuroTotal = 0;
                let aggLucroFornecedor = 0;
                let aggLucroGestor = 0;
                let aggRepassadoFornecedor = 0;

                suppliers.forEach(sup => {
                  const div = getSupplierProfitDivision(sup.id);
                  aggPrincipal += div.totalPrincipal;
                  aggJuroTotal += div.totalJuroGerado;
                  aggLucroFornecedor += div.totalLucroFornecedorArrecadado;
                  aggLucroGestor += div.totalLucroGestorArrecadado;
                  aggRepassadoFornecedor += div.totalRepassadoFornecedor;
                });

                return (
                  <div className="grid grid-cols-3 gap-3 bg-slate-50 dark:bg-slate-900/30 p-4 rounded-xl border border-border/50 text-xs mb-2">
                    <div>
                      <span className="text-muted-foreground font-bold uppercase tracking-wider block mb-1">Repasse Total Fornecedores</span>
                      <p className="text-sm font-black text-indigo-600">{formatCurrency(aggRepassadoFornecedor, companySettings.currency)}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">Capital pago + Lucro deles</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground font-bold uppercase tracking-wider block mb-1">Lucro Puro Fornecedores</span>
                      <p className="text-sm font-black text-indigo-505">{formatCurrency(aggLucroFornecedor, companySettings.currency)}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">Juros repassados</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground font-bold uppercase tracking-wider block mb-1">Retenção Conta Própria (Gestor)</span>
                      <p className="text-sm font-black text-emerald-600">{formatCurrency(aggLucroGestor, companySettings.currency)}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">Margem de intermediação retida</p>
                    </div>
                  </div>
                );
              })()}

              <div className="border border-border/40 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-900/50 text-xs font-bold text-muted-foreground uppercase">
                    <tr>
                      <th className="px-4 py-3 text-left">Fornecedor</th>
                      <th className="px-4 py-3 text-right">Principal Aplicado</th>
                      <th className="px-4 py-3 text-right">Repassado (P + L)</th>
                      <th className="px-4 py-3 text-right">Lucro Forn. Arrec.</th>
                      <th className="px-4 py-3 text-right">Lucro Gestor Arrec.</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/30">
                    {suppliers.map(sup => {
                      const div = getSupplierProfitDivision(sup.id);
                      if (div.totalPrincipal === 0 && div.totalLucroFornecedorArrecadado === 0) return null;
                      return (
                        <tr key={sup.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/10">
                          <td className="px-4 py-3 font-semibold">{sup.name}</td>
                          <td className="px-4 py-3 text-right">{formatCurrency(div.totalPrincipal, companySettings.currency)}</td>
                          <td className="px-4 py-3 text-right text-indigo-600 font-bold">{formatCurrency(div.totalRepassadoFornecedor, companySettings.currency)}</td>
                          <td className="px-4 py-3 text-right text-indigo-500 font-semibold">{formatCurrency(div.totalLucroFornecedorArrecadado, companySettings.currency)}</td>
                          <td className="px-4 py-3 text-right text-emerald-600 font-bold">{formatCurrency(div.totalLucroGestorArrecadado, companySettings.currency)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => setIsJurosArrecadadosModalOpen(false)}>Fechar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Créditos do Período Modal */}
        <Dialog open={isCreditosPeriodoModalOpen} onOpenChange={setIsCreditosPeriodoModalOpen}>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>Créditos Concedidos no Período</DialogTitle>
              <DialogDescription>
                Lista completa de contratos ativos ou pagos vinculados a parceiros.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4 space-y-4">
              <div className="border border-border/40 rounded-xl overflow-hidden max-h-[400px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-900/50 text-xs font-bold text-muted-foreground uppercase sticky top-0">
                    <tr>
                      <th className="px-4 py-3 text-left">Contrato / Cliente</th>
                      <th className="px-4 py-3 text-left">Fornecedor</th>
                      <th className="px-4 py-3 text-right">Principal</th>
                      <th className="px-4 py-3 text-right">Taxa (C / F)</th>
                      <th className="px-4 py-3 text-right">Juro Total</th>
                      <th className="px-4 py-3 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/30">
                    {(() => {
                      const allCredits = credits.filter(c => c.supplierId && isCreditInPeriod(c) && !c.deletedAt);
                      if (allCredits.length === 0) {
                        return (
                          <tr>
                            <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground italic">
                              Nenhum crédito de parceiro registrado no período selecionado.
                            </td>
                          </tr>
                        );
                      }
                      return allCredits.map(c => {
                        const supName = suppliers.find(s => s.id === c.supplierId)?.name || 'Desconhecido';
                        return (
                          <tr key={c.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/10">
                            <td className="px-4 py-3">
                              <p className="font-bold">{c.id}</p>
                              <p className="text-[10px] text-muted-foreground">{c.clientName}</p>
                            </td>
                            <td className="px-4 py-3 text-xs font-medium">{supName}</td>
                            <td className="px-4 py-3 text-right font-semibold">{formatCurrency(c.principalAmount, companySettings.currency)}</td>
                            <td className="px-4 py-3 text-right text-xs">
                              {c.interestRate}% / {c.supplierProfitRate || 0}%
                            </td>
                            <td className="px-4 py-3 text-right font-semibold text-blue-600">{formatCurrency(c.accruedInterest, companySettings.currency)}</td>
                            <td className="px-4 py-3 text-center">
                              <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full ${
                                c.status === 'paid' ? 'bg-emerald-500/10 text-emerald-600' :
                                c.status === 'defaulted' ? 'bg-red-500/10 text-red-500' :
                                c.status === 'overdue' ? 'bg-amber-500/10 text-amber-600' :
                                'bg-blue-500/10 text-blue-600'
                              }`}>
                                {c.status === 'paid' ? 'Pago' : c.status === 'defaulted' ? 'Incumprido' : c.status === 'overdue' ? 'Atrasado' : 'Ativo'}
                              </span>
                            </td>
                          </tr>
                        );
                      });
                    })()}
                  </tbody>
                </table>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => setIsCreditosPeriodoModalOpen(false)}>Fechar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Supplier Detail Modal */}
        <Dialog open={isSupplierDetailModalOpen} onOpenChange={setIsSupplierDetailModalOpen}>
          <DialogContent className="max-w-3xl animate-in fade-in duration-300">
            <DialogHeader>
              <DialogTitle>Detalhamento de Distribuição — {selectedSupplierForDetail?.name}</DialogTitle>
              <DialogDescription>
                Distribuição detalhada do capital por cliente e regras de divisão de lucros.
              </DialogDescription>
            </DialogHeader>
            {selectedSupplierForDetail && (() => {
              const sup = selectedSupplierForDetail;
              const stats = getSupplierStats(sup.id);
              const div = getSupplierProfitDivision(sup.id);
              return (
                <div className="py-4 space-y-6">
                  {/* General Summary */}
                  <div className="grid grid-cols-4 gap-4 bg-slate-50 dark:bg-slate-900/30 p-4 rounded-xl border border-border/50 text-center">
                    <div>
                      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest block mb-1">Capital Aplicado</span>
                      <p className="text-lg font-black text-slate-700 dark:text-slate-200">{formatCurrency(stats.investedTotal, companySettings.currency)}</p>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest block mb-1">Total Devolvido</span>
                      <p className="text-lg font-black text-emerald-600">{formatCurrency(div.totalPrincipalPaid + div.totalLucroFornecedorArrecadado, companySettings.currency)}</p>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest block mb-1">Saldos Ativos</span>
                      <p className="text-lg font-black text-amber-600">{formatCurrency(Math.max(0, stats.investedTotal - div.totalPrincipalPaid), companySettings.currency)}</p>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest block mb-1">Clientes Vinculados</span>
                      <p className="text-lg font-black text-indigo-600">{stats.uniqueClients}</p>
                    </div>
                  </div>

                  {/* Profit Division Card */}
                  <div className="border border-border/40 rounded-xl p-4 bg-indigo-50/20 dark:bg-indigo-950/10 space-y-3">
                    <h4 className="text-xs font-bold text-indigo-700 dark:text-indigo-300 uppercase tracking-widest text-left">Divisão de Lucros Realizada (Parceiro vs Gestor)</h4>
                    <div className="grid grid-cols-3 gap-4 text-xs text-left">
                      <div className="bg-white dark:bg-slate-900 p-3 rounded-lg border border-border/30">
                        <span className="text-muted-foreground block mb-1">Lucro Bruto Recebido</span>
                        <p className="text-base font-bold text-slate-800 dark:text-slate-100">{formatCurrency(div.totalLucroFornecedorArrecadado + div.totalLucroGestorArrecadado, companySettings.currency)}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">Juros pagos pelos clientes</p>
                      </div>
                      <div className="bg-white dark:bg-slate-900 p-3 rounded-lg border border-border/30">
                        <span className="text-muted-foreground block mb-1">Repasse Fornecedor (Parceiro)</span>
                        <p className="text-base font-bold text-indigo-600">{formatCurrency(div.totalLucroFornecedorArrecadado, companySettings.currency)}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">Lucro líquido do parceiro</p>
                      </div>
                      <div className="bg-white dark:bg-slate-900 p-3 rounded-lg border border-border/30">
                        <span className="text-muted-foreground block mb-1">Retenção Conta Própria (Gestor)</span>
                        <p className="text-base font-bold text-emerald-600">{formatCurrency(div.totalLucroGestorArrecadado, companySettings.currency)}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">Retido institucionalmente</p>
                      </div>
                    </div>
                    <div className="border-t border-indigo-100 dark:border-indigo-900/50 pt-2 flex justify-between items-center text-xs">
                      <span className="font-semibold text-slate-700 dark:text-slate-300">Total Pago de Volta ao Parceiro (Capital + Retorno):</span>
                      <span className="text-sm font-black text-indigo-700 dark:text-indigo-400">{formatCurrency(div.totalRepassadoFornecedor, companySettings.currency)}</span>
                    </div>
                  </div>

                  {/* Client Breakdown List */}
                  <div className="space-y-2">
                    <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-widest text-left">Distribuição do Capital por Cliente</h4>
                    <div className="border border-border/40 rounded-xl overflow-hidden max-h-[300px] overflow-y-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50 dark:bg-slate-900/50 text-xs font-bold text-muted-foreground uppercase sticky top-0">
                          <tr>
                            <th className="px-4 py-2.5 text-left">Cliente</th>
                            <th className="px-4 py-2.5 text-right">Capital Aplicado</th>
                            <th className="px-4 py-2.5 text-right">Devolvido (P+L)</th>
                            <th className="px-4 py-2.5 text-right">A Receber</th>
                            <th className="px-4 py-2.5 text-center">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/30">
                          {stats.clientBreakdown.map((cb) => {
                            const remaining = Math.max(0, cb.totalApplied - cb.totalPaid);
                            return (
                              <tr key={cb.clientId} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/10">
                                <td className="px-4 py-3 font-semibold text-left">{cb.clientName}</td>
                                <td className="px-4 py-3 text-right">{formatCurrency(cb.totalApplied, companySettings.currency)}</td>
                                <td className="px-4 py-3 text-right text-emerald-600">{formatCurrency(cb.totalPaid, companySettings.currency)}</td>
                                <td className="px-4 py-3 text-right text-amber-600 font-semibold">{formatCurrency(remaining, companySettings.currency)}</td>
                                <td className="px-4 py-3 text-center">
                                  <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full ${
                                    cb.status === 'paid' ? 'bg-emerald-500/10 text-emerald-600' :
                                    cb.status === 'defaulted' ? 'bg-red-500/10 text-red-500' :
                                    cb.status === 'overdue' ? 'bg-amber-500/10 text-amber-600' :
                                    'bg-blue-500/10 text-blue-600'
                                  }`}>
                                    {cb.status === 'paid' ? 'Pago' : cb.status === 'defaulted' ? 'Incumprido' : cb.status === 'overdue' ? 'Atrasado' : 'Ativo'}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                          {stats.clientBreakdown.length === 0 && (
                            <tr>
                              <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground italic">
                                Nenhum cliente vinculado.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              );
            })()}
            <DialogFooter>
              <Button onClick={() => setIsSupplierDetailModalOpen(false)}>Fechar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

      </div>
    </MainLayout>
  );
}
