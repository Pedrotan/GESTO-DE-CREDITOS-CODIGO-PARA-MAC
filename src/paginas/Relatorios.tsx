import { useRef, useEffect, useState, useCallback } from 'react';
import { MainLayout } from '@/componentes/layout/MainLayout';
import { useAuth } from '@/contextos/ContextoAutenticacao';
import { useData, AdvancedReportData } from '@/contextos/ContextoDados';
import { formatCurrency, formatDate } from '@/bibliotecas/formatters';
import { generateAnalyticalReportPDF } from '@/bibliotecas/pdf';
import { Button } from '@/componentes/ui/button';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/componentes/ui/table';
import { Badge } from '@/componentes/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/componentes/ui/card';
import { 
    FileDown, 
    Filter, 
    Image as ImageIcon, 
    RefreshCcw, 
    Calendar, 
    ChevronDown,
    DollarSign,
    Briefcase,
    Scale,
    Shield,
    TrendingUp,
    AlertTriangle,
    Clock,
    Users,
    CheckCircle,
    Activity,
    BookOpen,
    Info,
    ArrowUpRight,
    ArrowDownRight,
    Lock
} from 'lucide-react';
import { useToast } from '@/componentes/ui/use-toast';
import { AlertModal, AlertModalType } from '@/componentes/ui/AlertModal';
import html2canvas from 'html2canvas';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/componentes/ui/dropdown-menu';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
    PieChart,
    Pie,
    Cell,
    AreaChart,
    Area,
    LineChart,
    Line
} from 'recharts';

const COLORS = ['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#64748b'];

export default function Reports() {
    const { user } = useAuth();
    const { 
        credits, 
        payments, 
        getAdvancedReport, 
        companySettings, 
        refreshData, 
        warranties, 
        legalCases,
        clients
    } = useData();
    const { toast } = useToast();
    const reportRef = useRef<HTMLDivElement>(null);
    const [reportData, setReportData] = useState<AdvancedReportData | null>(null);
    const [loading, setLoading] = useState(false);
    const [selectedPeriod, setSelectedPeriod] = useState<string>('total');
    const [dateRange, setDateRange] = useState<{ start?: Date; end?: Date }>({});
    const [activeTab, setActiveTab] = useState<'financeiro' | 'carteira' | 'cobranca' | 'garantias'>('financeiro');

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

    const getPeriodDates = (period: string) => {
        const now = new Date();
        let start: Date | undefined;
        let end: Date | undefined = new Date();

        switch (period) {
            case 'hoje':
                start = new Date(now.setHours(0, 0, 0, 0));
                end = new Date(now.setHours(23, 59, 59, 999));
                break;
            case 'mes':
                start = new Date(now.getFullYear(), now.getMonth(), 1);
                break;
            case 'trimestre':
                start = new Date(now.getFullYear(), now.getMonth() - 2, 1);
                break;
            case 'ano':
                start = new Date(now.getFullYear(), 0, 1);
                break;
            case 'total':
            default:
                start = undefined;
                end = undefined;
                break;
        }
        return { start, end };
    };

    // Filtragem de dados com base nas datas selecionadas
    const filteredPayments = dateRange.start && dateRange.end
        ? payments.filter(p => {
            const date = new Date(p.paymentDate);
            return date >= dateRange.start! && date <= dateRange.end!;
          })
        : payments;

    const filteredCredits = dateRange.start && dateRange.end
        ? credits.filter(c => {
            const date = new Date(c.createdAt);
            return date >= dateRange.start! && date <= dateRange.end!;
          })
        : credits;

    const filteredLegalCases = dateRange.start && dateRange.end
        ? legalCases.filter(lc => {
            const date = new Date(lc.createdAt);
            return date >= dateRange.start! && date <= dateRange.end!;
          })
        : legalCases;

    const filteredWarranties = dateRange.start && dateRange.end
        ? warranties.filter(w => {
            const date = new Date(w.createdAt);
            return date >= dateRange.start! && date <= dateRange.end!;
          })
        : warranties;

    // --- COMPUTAÇÃO DE MÉTRICAS DETALHADAS ---
    
    // 1. Métricas Gerais & Financeiras
    const totalDisbursed = filteredCredits.reduce((acc, c) => acc + c.principalAmount, 0);
    const totalReceived = filteredPayments.reduce((acc, p) => acc + p.amount, 0);
    const pendingCredits = credits.filter(c => c.status === 'active' || c.status === 'overdue');
    const totalPending = pendingCredits.reduce((acc, c) => acc + c.currentBalance, 0);
    const overdueCredits = credits.filter(c => c.status === 'overdue');
    const totalOverdueBalance = overdueCredits.reduce((acc, c) => acc + c.currentBalance, 0);
    const countOverdue = overdueCredits.length;

    // Juros e Mora Recebidos
    const totalInterestReceived = filteredPayments.reduce((acc, p) => acc + (p.allocatedToInterest || 0) + (p.allocatedToLateInterest || 0), 0);
    // Capital Recuperado
    const totalPrincipalRecovered = filteredPayments.reduce((acc, p) => acc + (p.allocatedToPrincipal || 0), 0);
    // Ticket Médio de Recebimento
    const averagePaymentAmount = filteredPayments.length > 0 ? totalReceived / filteredPayments.length : 0;

    // 2. Métricas de Carteira
    // Ticket Médio do Crédito Concedido
    const averageCreditGranted = filteredCredits.length > 0 ? totalDisbursed / filteredCredits.length : 0;
    // Portfolio at Risk (PAR) Rate = Total Overdue Balance / Total Outstanding Balance
    const portfolioAtRiskRate = totalPending > 0 ? (totalOverdueBalance / totalPending) * 100 : 0;
    const totalActiveContracts = filteredCredits.filter(c => c.status === 'active' || c.status === 'overdue').length;

    // 3. Métricas de Cobrança
    const activeLegalCases = filteredLegalCases.filter(lc => lc.stage !== 'closed');
    const totalLegalDebt = activeLegalCases.reduce((acc, lc) => acc + lc.debtAmount, 0);
    const averageDaysOverdue = overdueCredits.length > 0 
        ? overdueCredits.reduce((acc, c) => acc + (c.daysOverdue || 0), 0) / overdueCredits.length 
        : 0;

    // 4. Métricas de Garantias
    const activeWarranties = filteredWarranties.filter(w => w.status === 'active');
    const totalWarrantyValue = activeWarranties.reduce((acc, w) => acc + w.marketValue, 0);
    const averageWarrantyValue = activeWarranties.length > 0 ? totalWarrantyValue / activeWarranties.length : 0;
    const countSeizedWarranties = filteredWarranties.filter(w => w.status === 'seized').length;

    // --- CONSTRUÇÃO DOS DADOS DOS GRÁFICOS ---
    
    // Gráfico 1: Fluxo de Caixa Mensal (Desembolsos vs Recebimentos) - Últimos 12 Meses
    const monthFormatter = new Intl.DateTimeFormat('pt-AO', { month: 'short', year: '2-digit' });
    const last12Months = Array.from({ length: 12 }, (_, index) => {
        const date = new Date();
        date.setMonth(date.getMonth() - (11 - index));
        return {
            key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
            month: monthFormatter.format(date),
            received: 0,
            disbursed: 0
        };
    });
    
    const flowMap = new Map(last12Months.map(item => [item.key, item]));
    
    payments.forEach(p => {
        const date = new Date(p.paymentDate);
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        const bucket = flowMap.get(key);
        if (bucket) {
            bucket.received += Number(p.amount || 0);
        }
    });

    credits.forEach(c => {
        if (c.status !== 'pending_approval' && c.status !== 'rejected' && c.status !== 'cancelled') {
            const date = new Date(c.createdAt);
            const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            const bucket = flowMap.get(key);
            if (bucket) {
                bucket.disbursed += Number(c.principalAmount || 0);
            }
        }
    });
    const cashFlowData = Array.from(flowMap.values());

    // Gráfico 2: Métodos de Pagamento
    const paymentMethodsMap = new Map<string, { name: string; value: number }>();
    const methodLabels: Record<string, string> = {
        cash: 'Dinheiro',
        transfer: 'Transferência',
        reference: 'Referência'
    };
    filteredPayments.forEach(p => {
        const label = methodLabels[p.method] || p.method || 'Outro';
        const current = paymentMethodsMap.get(label) || { name: label, value: 0 };
        current.value += Number(p.amount || 0);
        paymentMethodsMap.set(label, current);
    });
    const paymentMethodsData = Array.from(paymentMethodsMap.values());

    // Gráfico 3: Processos por Fase de Contencioso
    const stageLabels: Record<string, string> = {
        interpellated: 'Interpelado',
        mediation: 'Mediação',
        court: 'Tribunal',
        closed: 'Fechado'
    };
    const casesByStageMap = new Map<string, { stage: string; count: number; value: number }>();
    filteredLegalCases.forEach(lc => {
        const label = stageLabels[lc.stage] || lc.stage;
        const current = casesByStageMap.get(label) || { stage: label, count: 0, value: 0 };
        current.count += 1;
        current.value += Number(lc.debtAmount || 0);
        casesByStageMap.set(label, current);
    });
    const casesByStageData = Array.from(casesByStageMap.values());

    // Gráfico 4: Aging da Carteira (Faixas de Atraso)
    const agingBrackets = [
        { name: '1-30 dias', count: 0, amount: 0 },
        { name: '31-60 dias', count: 0, amount: 0 },
        { name: '61-90 dias', count: 0, amount: 0 },
        { name: '>90 dias', count: 0, amount: 0 }
    ];
    overdueCredits.forEach(c => {
        const days = c.daysOverdue || 0;
        if (days <= 30) {
            agingBrackets[0].count += 1;
            agingBrackets[0].amount += Number(c.currentBalance || 0);
        } else if (days <= 60) {
            agingBrackets[1].count += 1;
            agingBrackets[1].amount += Number(c.currentBalance || 0);
        } else if (days <= 90) {
            agingBrackets[2].count += 1;
            agingBrackets[2].amount += Number(c.currentBalance || 0);
        } else {
            agingBrackets[3].count += 1;
            agingBrackets[3].amount += Number(c.currentBalance || 0);
        }
    });

    // Gráfico 5: Distribuição por Perfil de Risco de Clientes
    const riskLabels: Record<string, string> = {
        low: 'Risco Baixo',
        medium: 'Risco Médio',
        high: 'Risco Alto'
    };
    const clientsByRiskMap = new Map<string, { name: string; value: number }>();
    filteredCredits.forEach(c => {
        const client = clients.find(cl => cl.id === c.clientId);
        const risk = client?.riskLevel || 'medium';
        const label = riskLabels[risk] || risk;
        const current = clientsByRiskMap.get(label) || { name: label, value: 0 };
        current.value += 1;
        clientsByRiskMap.set(label, current);
    });
    const riskDistributionData = Array.from(clientsByRiskMap.values());

    const fetchAdvancedData = useCallback(async (start?: Date, end?: Date) => {
        setLoading(true);
        try {
            const data = await getAdvancedReport(start, end);
            setReportData(data);
        } catch (error) {
            console.error("Failed to fetch report data", error);
        } finally {
            setLoading(false);
        }
    }, [getAdvancedReport]);

    const handleRefresh = async () => {
        setLoading(true);
        try {
            await refreshData();
            await fetchAdvancedData(dateRange.start, dateRange.end);
            setAlertConfig({
                isOpen: true,
                title: "Sincronizado",
                description: "Dados estatísticos atualizados com sucesso.",
                type: "success"
            });
        } catch (error) {
            setAlertConfig({
                isOpen: true,
                title: "Erro",
                description: "Falha ao sincronizar dados do servidor.",
                type: "error"
            });
        } finally {
            setLoading(false);
        }
    };

    const handlePeriodChange = (period: string) => {
        setSelectedPeriod(period);
        const range = getPeriodDates(period);
        setDateRange(range);
        fetchAdvancedData(range.start, range.end);
    };

    useEffect(() => {
        const range = getPeriodDates(selectedPeriod);
        fetchAdvancedData(range.start, range.end);
    }, [fetchAdvancedData, selectedPeriod]);

    const exportToPDF = async () => {
        try {
            setAlertConfig({
                isOpen: true,
                title: "Iniciando exportação...",
                description: "Aguarde enquanto processamos o PDF detalhado.",
                type: "success"
            });

            let imgData = undefined;
            if (reportRef.current) {
                try {
                    const canvas = await html2canvas(reportRef.current, {
                        scale: 2.0,
                        useCORS: true,
                        allowTaint: true,
                        logging: false,
                        backgroundColor: '#ffffff'
                    });
                    imgData = canvas.toDataURL('image/jpeg', 0.9);
                } catch (e) {
                    console.error("Erro ao capturar gráficos:", e);
                }
            }

            const periodLabels: Record<string, string> = {
                'total': 'TODO O TEMPO',
                'hoje': 'HOJE',
                'mes': 'ESTE MÊS',
                'trimestre': 'ÚLTIMOS 3 MESES',
                'ano': 'ESTE ANO'
            };

            generateAnalyticalReportPDF({
                title: `RELATÓRIO GERENCIAL COMPLETO - ${periodLabels[selectedPeriod]}`,
                summary: [
                    { label: 'Total Desembolsado', value: formatCurrency(totalDisbursed) },
                    { label: 'Total Recebido', value: formatCurrency(totalReceived) },
                    { label: 'Juros e Mora Recebidos', value: formatCurrency(totalInterestReceived) },
                    { label: 'Capital Amortizado', value: formatCurrency(totalPrincipalRecovered) },
                    { label: 'Saldo em Aberto (Carteira)', value: formatCurrency(totalPending) },
                    { label: 'Créditos em Atraso (Qtd)', value: countOverdue.toString() },
                    { label: 'Taxa de Inadimplência (PAR)', value: `${portfolioAtRiskRate.toFixed(2)}%` },
                    { label: 'Processos de Cobrança Ativos', value: activeLegalCases.length.toString() },
                    { label: 'Garantias Ativas (Qtd)', value: activeWarranties.length.toString() },
                    { label: 'Valor Estimado de Garantias', value: formatCurrency(totalWarrantyValue) }
                ],
                credits: pendingCredits,
                visualImg: imgData
            }, companySettings, user?.name);

            setAlertConfig({
                isOpen: true,
                title: "Sucesso",
                description: "Relatório gerencial PDF gerado e baixado.",
                type: "success"
            });
        } catch (error) {
            console.error("Erro fatal na geração do PDF:", error);
            setAlertConfig({
                isOpen: true,
                title: "Erro na exportação",
                description: "Não foi possível gerar o PDF. Verifique se há dados.",
                type: "error"
            });
        }
    };

    const exportToJPG = async () => {
        if (!reportRef.current) return;

        setAlertConfig({
            isOpen: true,
            title: "Gerando Imagem...",
            description: "Capturando imagem do relatório.",
            type: "success"
        });
        try {
            const canvas = await html2canvas(reportRef.current, { scale: 2 });
            const link = document.createElement('a');
            link.download = `Painel_Relatorios_${new Date().getTime()}.jpg`;
            link.href = canvas.toDataURL('image/jpeg', 0.9);
            link.click();
            setAlertConfig({
                isOpen: true,
                title: "Sucesso",
                description: "Imagem salva na sua pasta de downloads.",
                type: "success"
            });
        } catch (e) {
            setAlertConfig({
                isOpen: true,
                title: "Erro",
                description: "Falha ao exportar imagem.",
                type: "error"
            });
        }
    };

    return (
        <MainLayout title="Relatórios Analíticos" subtitle="Análise detalhada, métricas de carteira e exportação">
            {/* Filtros e Ações de Topo */}
            <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2">
                    <Button variant="outline" className="gap-2" onClick={handleRefresh} disabled={loading}>
                        <RefreshCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                    </Button>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="outline" className="gap-2">
                                <Calendar className="h-4 w-4" />
                                {selectedPeriod === 'total' && 'Todo o Tempo'}
                                {selectedPeriod === 'hoje' && 'Hoje'}
                                {selectedPeriod === 'mes' && 'Este Mês'}
                                {selectedPeriod === 'trimestre' && 'Últimos 3 Meses'}
                                {selectedPeriod === 'ano' && 'Este Ano'}
                                <ChevronDown className="h-4 w-4 opacity-50" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="w-[200px]">
                            <DropdownMenuItem onClick={() => handlePeriodChange('total')}>Todo o Tempo</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handlePeriodChange('hoje')}>Hoje</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handlePeriodChange('mes')}>Este Mês</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handlePeriodChange('trimestre')}>Últimos 3 Meses</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handlePeriodChange('ano')}>Este Ano</DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" className="gap-2 border-slate-200 hover:bg-slate-50 transition-colors" onClick={exportToJPG}>
                        <ImageIcon className="h-4 w-4" />
                        Baixar Gráficos (JPG)
                    </Button>
                    <Button className="gap-2 bg-blue-600 hover:bg-blue-700 text-white shadow-md transition-all" onClick={exportToPDF}>
                        <FileDown className="h-4 w-4" />
                        Exportar Relatório (PDF)
                    </Button>
                </div>
            </div>

            {/* Menu de Abas Avançadas */}
            <div className="flex border-b border-slate-200 mb-6 overflow-x-auto whitespace-nowrap scrollbar-none">
                <button 
                    className={`pb-3 px-1 text-sm font-bold flex items-center gap-2 border-b-2 transition-all ${activeTab === 'financeiro' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
                    onClick={() => setActiveTab('financeiro')}
                >
                    <DollarSign className="h-4 w-4" />
                    Financeiro & Caixa
                </button>
                <button 
                    className={`pb-3 px-1 text-sm font-bold flex items-center gap-2 border-b-2 transition-all ${activeTab === 'carteira' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
                    onClick={() => setActiveTab('carteira')}
                >
                    <Briefcase className="h-4 w-4" />
                    Carteira & Créditos
                </button>
                <button 
                    className={`pb-3 px-1 text-sm font-bold flex items-center gap-2 border-b-2 transition-all ${activeTab === 'cobranca' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
                    onClick={() => setActiveTab('cobranca')}
                >
                    <Scale className="h-4 w-4" />
                    Cobrança & Contencioso
                    {countOverdue > 0 && (
                        <span className="bg-red-100 text-red-600 text-[10px] px-2 py-0.5 rounded-full font-black ml-1 border border-red-200">
                            {countOverdue}
                        </span>
                    )}
                </button>
                <button 
                    className={`pb-3 px-1 text-sm font-bold flex items-center gap-2 border-b-2 transition-all ${activeTab === 'garantias' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
                    onClick={() => setActiveTab('garantias')}
                >
                    <Shield className="h-4 w-4" />
                    Garantias & Riscos
                    {activeWarranties.length > 0 && (
                        <span className="bg-blue-50 text-blue-600 text-[10px] px-2 py-0.5 rounded-full font-black ml-1 border border-blue-100">
                            {activeWarranties.length}
                        </span>
                    )}
                </button>
            </div>

            {/* Conteúdo Capturável para Relatórios */}
            <div ref={reportRef} className="space-y-6 bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
                
                {/* --- ABA FINANCEIRO & CAIXA --- */}
                {activeTab === 'financeiro' && (
                    <>
                        {/* Métricas da Aba Estilo Pastel Arredondado */}
                        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
                            {/* 1. Total Desembolsado (Azul Céu #82C9FF) */}
                            <div className="card-kpi-sky">
                                <div className="flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-2.5 min-w-0">
                                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/10 dark:bg-white/10 text-slate-950 dark:text-white shrink-0">
                                            <ArrowUpRight className="h-5 w-5" />
                                        </div>
                                        <p className="text-sm sm:text-base font-bold text-slate-950 dark:text-white truncate tracking-tight">
                                            Total Desembolsado
                                        </p>
                                    </div>
                                </div>

                                <div className="my-2">
                                    <p className="font-display text-3xl sm:text-4xl font-black tracking-tight text-slate-950 dark:text-white truncate" title={formatCurrency(totalDisbursed)}>
                                        {formatCurrency(totalDisbursed)}
                                    </p>
                                </div>

                                <p className="text-xs font-semibold text-slate-900/75 dark:text-slate-400 truncate">
                                    Créditos concedidos no período
                                </p>
                            </div>

                            {/* 2. Total Recebido (Verde Menta #86EFAC) */}
                            <div className="card-kpi-mint">
                                <div className="flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-2.5 min-w-0">
                                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/10 dark:bg-white/10 text-slate-950 dark:text-white shrink-0">
                                            <ArrowDownRight className="h-5 w-5" />
                                        </div>
                                        <p className="text-sm sm:text-base font-bold text-slate-950 dark:text-white truncate tracking-tight">
                                            Total Recebido (Caixa)
                                        </p>
                                    </div>
                                </div>

                                <div className="my-2">
                                    <p className="font-display text-3xl sm:text-4xl font-black tracking-tight text-slate-950 dark:text-white truncate" title={formatCurrency(totalReceived)}>
                                        {formatCurrency(totalReceived)}
                                    </p>
                                </div>

                                <p className="text-xs font-semibold text-slate-900/75 dark:text-slate-400 truncate">
                                    Amortizações e juros cobrados
                                </p>
                            </div>

                            {/* 3. Juros & Mora Recebidos (Dourado / Âmbar #FED771) */}
                            <div className="card-kpi-amber">
                                <div className="flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-2.5 min-w-0">
                                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/10 dark:bg-white/10 text-slate-950 dark:text-white shrink-0">
                                            <TrendingUp className="h-5 w-5" />
                                        </div>
                                        <p className="text-sm sm:text-base font-bold text-slate-950 dark:text-white truncate tracking-tight">
                                            Juros & Mora Recebidos
                                        </p>
                                    </div>
                                </div>

                                <div className="my-2">
                                    <p className="font-display text-3xl sm:text-4xl font-black tracking-tight text-slate-950 dark:text-white truncate" title={formatCurrency(totalInterestReceived)}>
                                        {formatCurrency(totalInterestReceived)}
                                    </p>
                                </div>

                                <p className="text-xs font-semibold text-slate-900/75 dark:text-slate-400 truncate">
                                    Margem de lucro auferida
                                </p>
                            </div>

                            {/* 4. Capital Recuperado (Púrpura / Lavanda #E99EFE) */}
                            <div className="card-kpi-purple">
                                <div className="flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-2.5 min-w-0">
                                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/10 dark:bg-white/10 text-slate-950 dark:text-white shrink-0">
                                            <CheckCircle className="h-5 w-5" />
                                        </div>
                                        <p className="text-sm sm:text-base font-bold text-slate-950 dark:text-white truncate tracking-tight">
                                            Capital Recuperado
                                        </p>
                                    </div>
                                </div>

                                <div className="my-2">
                                    <p className="font-display text-3xl sm:text-4xl font-black tracking-tight text-slate-950 dark:text-white truncate" title={formatCurrency(totalPrincipalRecovered)}>
                                        {formatCurrency(totalPrincipalRecovered)}
                                    </p>
                                </div>

                                <p className="text-xs font-semibold text-slate-900/75 dark:text-slate-400 truncate">
                                    Retorno do montante emprestado
                                </p>
                            </div>
                        </div>

                        {/* Gráficos Financeiros */}
                        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-7">
                            {/* Fluxo de Caixa Mensal */}
                            <Card className="col-span-4 card-elevated">
                                <CardHeader>
                                    <CardTitle className="text-slate-800 font-bold text-base">Fluxo de Caixa Mensal (Últimos 12 Meses)</CardTitle>
                                </CardHeader>
                                <CardContent className="pl-2">
                                    <ResponsiveContainer width="100%" height={300}>
                                        <BarChart data={cashFlowData} margin={{ left: 45 }}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                            <XAxis dataKey="month" tickLine={false} axisLine={false} style={{ fontSize: '11px', fill: '#94a3b8' }} />
                                            <YAxis tickLine={false} axisLine={false} tickFormatter={(val) => val >= 1000000 ? `${(val / 1000000).toFixed(1)}M` : val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val} style={{ fontSize: '11px', fill: '#94a3b8' }} />
                                            <Tooltip formatter={(value) => formatCurrency(Number(value))} contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px' }} />
                                            <Legend iconType="circle" style={{ fontSize: '12px' }} />
                                            <Bar dataKey="disbursed" name="Saída (Desembolsos)" fill="#2563eb" radius={[4, 4, 0, 0]} />
                                            <Bar dataKey="received" name="Entrada (Recebimentos)" fill="#10b981" radius={[4, 4, 0, 0]} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </CardContent>
                            </Card>

                            {/* Métodos de Pagamento */}
                            <Card className="col-span-3 card-elevated">
                                <CardHeader>
                                    <CardTitle className="text-slate-800 font-bold text-base">Canais de Recebimento</CardTitle>
                                </CardHeader>
                                <CardContent className="flex justify-center items-center">
                                    {paymentMethodsData.length > 0 ? (
                                        <ResponsiveContainer width="100%" height={300}>
                                            <PieChart>
                                                <Pie
                                                    data={paymentMethodsData}
                                                    cx="50%"
                                                    cy="50%"
                                                    labelLine={false}
                                                    innerRadius={65}
                                                    outerRadius={95}
                                                    paddingAngle={3}
                                                    dataKey="value"
                                                    nameKey="name"
                                                >
                                                    {paymentMethodsData.map((entry, index) => (
                                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                                    ))}
                                                </Pie>
                                                <Tooltip formatter={(val) => formatCurrency(Number(val))} />
                                                <Legend layout="horizontal" verticalAlign="bottom" align="center" iconType="circle" style={{ fontSize: '10px' }} />
                                            </PieChart>
                                        </ResponsiveContainer>
                                    ) : (
                                        <div className="text-center text-sm text-slate-400 py-20">Nenhum pagamento registado.</div>
                                    )}
                                </CardContent>
                            </Card>
                        </div>

                        {/* Tabela de Detalhes - Transações Recentes */}
                        <Card className="card-elevated">
                            <CardHeader className="flex flex-row items-center justify-between">
                                <CardTitle className="text-slate-800 font-bold text-base">Detalhamento dos Últimos 10 Recebimentos</CardTitle>
                                <Badge variant="outline" className="text-slate-500">Filtrado</Badge>
                            </CardHeader>
                            <CardContent>
                                <Table>
                                    <TableHeader>
                                        <TableRow className="bg-slate-50">
                                            <TableHead className="font-bold text-slate-700">Data</TableHead>
                                            <TableHead className="font-bold text-slate-700">Cliente</TableHead>
                                            <TableHead className="font-bold text-slate-700">Método</TableHead>
                                            <TableHead className="font-bold text-slate-700 text-right">Capital Pago</TableHead>
                                            <TableHead className="font-bold text-slate-700 text-right">Juros</TableHead>
                                            <TableHead className="font-bold text-slate-700 text-right">Mora</TableHead>
                                            <TableHead className="font-bold text-slate-700 text-right">Total Pago</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {filteredPayments.slice(0, 10).map((p) => (
                                            <TableRow key={p.id} className="hover:bg-slate-50/50">
                                                <TableCell className="text-xs">{formatDate(p.paymentDate)}</TableCell>
                                                <TableCell className="font-semibold text-slate-800 text-xs">{p.clientName}</TableCell>
                                                <TableCell className="text-xs">
                                                    <Badge variant="secondary" className="font-medium">
                                                        {methodLabels[p.method] || p.method}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="text-right text-xs">{formatCurrency(p.allocatedToPrincipal || 0)}</TableCell>
                                                <TableCell className="text-right text-xs">{formatCurrency(p.allocatedToInterest || 0)}</TableCell>
                                                <TableCell className="text-right text-xs text-red-500">{formatCurrency(p.allocatedToLateInterest || 0)}</TableCell>
                                                <TableCell className="text-right text-xs font-bold text-emerald-600">{formatCurrency(p.amount)}</TableCell>
                                            </TableRow>
                                        ))}
                                        {filteredPayments.length === 0 && (
                                            <TableRow>
                                                <TableCell colSpan={7} className="text-center text-slate-400 py-6">
                                                    Nenhum pagamento encontrado para o período selecionado.
                                                </TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>
                    </>
                )}

                {/* --- ABA CARTEIRA & CRÉDITOS --- */}
                {activeTab === 'carteira' && (
                    <>
                        {/* Métricas da Carteira Estilo Pastel Arredondado */}
                        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
                            {/* 1. Carteira Ativa em Aberto (Azul Céu #82C9FF) */}
                            <div className="card-kpi-sky">
                                <div className="flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-2.5 min-w-0">
                                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/10 dark:bg-white/10 text-slate-950 dark:text-white shrink-0">
                                            <Briefcase className="h-5 w-5" />
                                        </div>
                                        <p className="text-sm sm:text-base font-bold text-slate-950 dark:text-white truncate tracking-tight">
                                            Carteira Ativa em Aberto
                                        </p>
                                    </div>
                                </div>

                                <div className="my-2">
                                    <p className="font-display text-3xl sm:text-4xl font-black tracking-tight text-slate-950 dark:text-white truncate" title={formatCurrency(totalPending)}>
                                        {formatCurrency(totalPending)}
                                    </p>
                                </div>

                                <p className="text-xs font-semibold text-slate-900/75 dark:text-slate-400 truncate">
                                    Saldo devedor total em aberto
                                </p>
                            </div>

                            {/* 2. Ticket Médio Concedido (Púrpura / Lavanda #E99EFE) */}
                            <div className="card-kpi-purple">
                                <div className="flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-2.5 min-w-0">
                                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/10 dark:bg-white/10 text-slate-950 dark:text-white shrink-0">
                                            <TrendingUp className="h-5 w-5" />
                                        </div>
                                        <p className="text-sm sm:text-base font-bold text-slate-950 dark:text-white truncate tracking-tight">
                                            Ticket Médio Concedido
                                        </p>
                                    </div>
                                </div>

                                <div className="my-2">
                                    <p className="font-display text-3xl sm:text-4xl font-black tracking-tight text-slate-950 dark:text-white truncate" title={formatCurrency(averageCreditGranted)}>
                                        {formatCurrency(averageCreditGranted)}
                                    </p>
                                </div>

                                <p className="text-xs font-semibold text-slate-900/75 dark:text-slate-400 truncate">
                                    Média por contrato de crédito
                                </p>
                            </div>

                            {/* 3. Taxa de Inadimplência (Coral / Rosa #FDA4AF) */}
                            <div className="card-kpi-coral">
                                <div className="flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-2.5 min-w-0">
                                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/10 dark:bg-white/10 text-slate-950 dark:text-white shrink-0">
                                            <AlertTriangle className="h-5 w-5" />
                                        </div>
                                        <p className="text-sm sm:text-base font-bold text-slate-950 dark:text-white truncate tracking-tight">
                                            Taxa de Inadimplência (PAR)
                                        </p>
                                    </div>
                                </div>

                                <div className="my-2">
                                    <p className="font-display text-3xl sm:text-4xl font-black tracking-tight text-slate-950 dark:text-white truncate">
                                        {portfolioAtRiskRate.toFixed(2)}%
                                    </p>
                                </div>

                                <p className="text-xs font-semibold text-slate-900/75 dark:text-slate-400 truncate">
                                    Crédito vencido / Carteira ativa
                                </p>
                            </div>

                            {/* 4. Contratos Ativos (Verde Menta #86EFAC) */}
                            <div className="card-kpi-mint">
                                <div className="flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-2.5 min-w-0">
                                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/10 dark:bg-white/10 text-slate-950 dark:text-white shrink-0">
                                            <Activity className="h-5 w-5" />
                                        </div>
                                        <p className="text-sm sm:text-base font-bold text-slate-950 dark:text-white truncate tracking-tight">
                                            Contratos Ativos (Qtd)
                                        </p>
                                    </div>
                                </div>

                                <div className="my-2">
                                    <p className="font-display text-3xl sm:text-4xl font-black tracking-tight text-slate-950 dark:text-white truncate">
                                        {totalActiveContracts}
                                    </p>
                                </div>

                                <p className="text-xs font-semibold text-slate-900/75 dark:text-slate-400 truncate">
                                    Contratos vigentes no momento
                                </p>
                            </div>
                        </div>

                        {/* Gráficos de Carteira */}
                        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-7">
                            {/* Distribuição por Status */}
                            <Card className="col-span-4 card-elevated">
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-slate-800 font-bold text-base">Distribuição da Carteira por Status</CardTitle>
                                </CardHeader>
                                <CardContent className="flex justify-center items-center">
                                    {reportData && reportData.creditsByStatus.length > 0 ? (
                                        <ResponsiveContainer width="100%" height={300}>
                                            <PieChart>
                                                <Pie
                                                    data={reportData.creditsByStatus}
                                                    cx="50%"
                                                    cy="50%"
                                                    labelLine={true}
                                                    innerRadius={50}
                                                    outerRadius={85}
                                                    dataKey="count"
                                                    nameKey="status"
                                                    label={({ status, percent }) => `${status} (${(percent * 100).toFixed(0)}%)`}
                                                >
                                                    {reportData.creditsByStatus.map((entry, index) => (
                                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                                    ))}
                                                </Pie>
                                                <Tooltip formatter={(value, name, props) => [`${value} Contratos`, `Status: ${props.payload.status}`]} />
                                            </PieChart>
                                        </ResponsiveContainer>
                                    ) : (
                                        <div className="text-center text-sm text-slate-400 py-20">Aguardando dados...</div>
                                    )}
                                </CardContent>
                            </Card>

                            {/* Perfil de Risco de Clientes */}
                            <Card className="col-span-3 card-elevated">
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-slate-800 font-bold text-base">Perfil de Risco da Carteira</CardTitle>
                                </CardHeader>
                                <CardContent className="flex justify-center items-center">
                                    {riskDistributionData.length > 0 ? (
                                        <ResponsiveContainer width="100%" height={300}>
                                            <PieChart>
                                                <Pie
                                                    data={riskDistributionData}
                                                    cx="50%"
                                                    cy="50%"
                                                    innerRadius={60}
                                                    outerRadius={90}
                                                    paddingAngle={2}
                                                    dataKey="value"
                                                    nameKey="name"
                                                >
                                                    <Cell fill="#10b981" />
                                                    <Cell fill="#f59e0b" />
                                                    <Cell fill="#ef4444" />
                                                </Pie>
                                                <Tooltip />
                                                <Legend iconType="circle" />
                                            </PieChart>
                                        </ResponsiveContainer>
                                    ) : (
                                        <div className="text-center text-sm text-slate-400 py-20">Sem dados de risco associados.</div>
                                    )}
                                </CardContent>
                            </Card>
                        </div>

                        {/* Top 5 Clientes - Volume de Pagamentos */}
                        <div className="grid gap-6 md:grid-cols-2">
                            {/* Tabela de Top Clientes */}
                            <Card className="card-elevated">
                                <CardHeader>
                                    <CardTitle className="text-slate-800 font-bold text-base">Top 5 Clientes (Volume de Pagamentos)</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <Table>
                                        <TableHeader>
                                            <TableRow className="bg-slate-50">
                                                <TableHead className="font-bold text-slate-700">Cliente</TableHead>
                                                <TableHead className="font-bold text-slate-700 text-right">Total Pago</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {reportData && reportData.topClients.map((client, i) => (
                                                <TableRow key={i} className="hover:bg-slate-50/50">
                                                    <TableCell className="font-semibold text-slate-800 text-xs">{client.name}</TableCell>
                                                    <TableCell className="text-right text-emerald-600 font-black text-xs">
                                                        {formatCurrency(client.totalPaid)}
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                            {(!reportData || reportData.topClients.length === 0) && (
                                                <TableRow>
                                                    <TableCell colSpan={2} className="text-center text-slate-400 py-4">
                                                        Sem dados disponíveis.
                                                    </TableCell>
                                                </TableRow>
                                            )}
                                        </TableBody>
                                    </Table>
                                </CardContent>
                            </Card>

                            {/* Tabela de Amostra de Carteira */}
                            <Card className="card-elevated">
                                <CardHeader>
                                    <CardTitle className="text-slate-800 font-bold text-base">Amostra de Créditos Ativos/Overdue</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <Table>
                                        <TableHeader>
                                            <TableRow className="bg-slate-50">
                                                <TableHead className="font-bold text-slate-700">Cliente</TableHead>
                                                <TableHead className="font-bold text-slate-700 text-right">Principal</TableHead>
                                                <TableHead className="font-bold text-slate-700 text-right">Saldo Devedor</TableHead>
                                                <TableHead className="font-bold text-slate-700">Status</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {pendingCredits.slice(0, 5).map((c) => (
                                                <TableRow key={c.id} className="hover:bg-slate-50/50">
                                                    <TableCell className="font-semibold text-slate-800 text-xs">{c.clientName}</TableCell>
                                                    <TableCell className="text-right text-xs">{formatCurrency(c.principalAmount)}</TableCell>
                                                    <TableCell className="text-right text-xs font-bold text-slate-700">{formatCurrency(c.currentBalance)}</TableCell>
                                                    <TableCell className="text-xs">
                                                        <Badge variant={c.status === 'overdue' ? 'destructive' : 'default'} className="text-[10px]">
                                                            {c.status === 'overdue' ? 'Atrasado' : 'Ativo'}
                                                        </Badge>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                            {pendingCredits.length === 0 && (
                                                <TableRow>
                                                    <TableCell colSpan={4} className="text-center text-slate-400 py-4">
                                                        Nenhum crédito em aberto atualmente.
                                                    </TableCell>
                                                </TableRow>
                                            )}
                                        </TableBody>
                                    </Table>
                                </CardContent>
                            </Card>
                        </div>
                    </>
                )}

                {/* --- ABA COBRANÇA & CONTENCIOSO --- */}
                {activeTab === 'cobranca' && (
                    <>
                        {/* Métricas de Cobrança Estilo Pastel Arredondado */}
                        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
                            {/* 1. Créditos Atrasados (Coral / Rosa #FDA4AF) */}
                            <div className="card-kpi-coral">
                                <div className="flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-2.5 min-w-0">
                                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/10 dark:bg-white/10 text-slate-950 dark:text-white shrink-0">
                                            <AlertTriangle className="h-5 w-5" />
                                        </div>
                                        <p className="text-sm sm:text-base font-bold text-slate-950 dark:text-white truncate tracking-tight">
                                            Créditos Atrasados
                                        </p>
                                    </div>
                                </div>

                                <div className="my-2">
                                    <p className="font-display text-3xl sm:text-4xl font-black tracking-tight text-slate-950 dark:text-white truncate">
                                        {countOverdue}
                                    </p>
                                </div>

                                <p className="text-xs font-semibold text-slate-900/75 dark:text-slate-400 truncate">
                                    Contratos com pagamento vencido
                                </p>
                            </div>

                            {/* 2. Volume Total Atrasado (Coral / Rosa #FDA4AF) */}
                            <div className="card-kpi-coral">
                                <div className="flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-2.5 min-w-0">
                                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/10 dark:bg-white/10 text-slate-950 dark:text-white shrink-0">
                                            <DollarSign className="h-5 w-5" />
                                        </div>
                                        <p className="text-sm sm:text-base font-bold text-slate-950 dark:text-white truncate tracking-tight">
                                            Volume Total Atrasado
                                        </p>
                                    </div>
                                </div>

                                <div className="my-2">
                                    <p className="font-display text-3xl sm:text-4xl font-black tracking-tight text-slate-950 dark:text-white truncate" title={formatCurrency(totalOverdueBalance)}>
                                        {formatCurrency(totalOverdueBalance)}
                                    </p>
                                </div>

                                <p className="text-xs font-semibold text-slate-900/75 dark:text-slate-400 truncate">
                                    Dívida vencida total pendente
                                </p>
                            </div>

                            {/* 3. Processos em Contencioso (Púrpura / Lavanda #E99EFE) */}
                            <div className="card-kpi-purple">
                                <div className="flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-2.5 min-w-0">
                                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/10 dark:bg-white/10 text-slate-950 dark:text-white shrink-0">
                                            <Scale className="h-5 w-5" />
                                        </div>
                                        <p className="text-sm sm:text-base font-bold text-slate-950 dark:text-white truncate tracking-tight">
                                            Processos em Contencioso
                                        </p>
                                    </div>
                                </div>

                                <div className="my-2">
                                    <p className="font-display text-3xl sm:text-4xl font-black tracking-tight text-slate-950 dark:text-white truncate">
                                        {activeLegalCases.length}
                                    </p>
                                </div>

                                <p className="text-xs font-semibold text-slate-900/75 dark:text-slate-400 truncate">
                                    Casos judiciais e extrajudiciais ativos
                                </p>
                            </div>

                            {/* 4. Média de Dias de Atraso (Dourado / Âmbar #FED771) */}
                            <div className="card-kpi-amber">
                                <div className="flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-2.5 min-w-0">
                                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/10 dark:bg-white/10 text-slate-950 dark:text-white shrink-0">
                                            <Clock className="h-5 w-5" />
                                        </div>
                                        <p className="text-sm sm:text-base font-bold text-slate-950 dark:text-white truncate tracking-tight">
                                            Média Dias de Atraso
                                        </p>
                                    </div>
                                </div>

                                <div className="my-2">
                                    <p className="font-display text-3xl sm:text-4xl font-black tracking-tight text-slate-950 dark:text-white truncate">
                                        {Math.round(averageDaysOverdue)} Dias
                                    </p>
                                </div>

                                <p className="text-xs font-semibold text-slate-900/75 dark:text-slate-400 truncate">
                                    Média de dias de atraso dos vencidos
                                </p>
                            </div>
                        </div>

                        {/* Gráficos de Cobrança */}
                        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-7">
                            {/* Faixas de Aging */}
                            <Card className="col-span-4 card-elevated">
                                <CardHeader>
                                    <CardTitle className="text-slate-800 font-bold text-base">Aging da Carteira (Aging Portfolio)</CardTitle>
                                </CardHeader>
                                <CardContent className="pl-2">
                                    <ResponsiveContainer width="100%" height={300}>
                                        <BarChart data={agingBrackets} layout="vertical" margin={{ left: 20, right: 20 }}>
                                            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                                            <XAxis type="number" tickLine={false} axisLine={false} style={{ fontSize: '11px', fill: '#94a3b8' }} />
                                            <YAxis dataKey="name" type="category" tickLine={false} axisLine={false} style={{ fontSize: '11px', fill: '#94a3b8' }} />
                                            <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                                            <Bar dataKey="amount" name="Saldo Devedor Atrasado" fill="#ef4444" radius={[0, 4, 4, 0]} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </CardContent>
                            </Card>

                            {/* Contencioso por Fase */}
                            <Card className="col-span-3 card-elevated">
                                <CardHeader>
                                    <CardTitle className="text-slate-800 font-bold text-base">Fases dos Processos no Contencioso</CardTitle>
                                </CardHeader>
                                <CardContent className="flex justify-center items-center">
                                    {casesByStageData.length > 0 ? (
                                        <ResponsiveContainer width="100%" height={300}>
                                            <BarChart data={casesByStageData}>
                                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                                <XAxis dataKey="stage" tickLine={false} axisLine={false} style={{ fontSize: '10px' }} />
                                                <YAxis tickLine={false} axisLine={false} style={{ fontSize: '11px' }} />
                                                <Tooltip />
                                                <Bar dataKey="count" name="Casos" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                                            </BarChart>
                                        </ResponsiveContainer>
                                    ) : (
                                        <div className="text-center text-sm text-slate-400 py-20">Nenhum processo registado no contencioso.</div>
                                    )}
                                </CardContent>
                            </Card>
                        </div>

                        {/* Processos Ativos de Contencioso */}
                        <Card className="card-elevated">
                            <CardHeader>
                                <CardTitle className="text-slate-800 font-bold text-base">Ficha de Processos de Cobrança / Contencioso Activos</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <Table>
                                    <TableHeader>
                                        <TableRow className="bg-slate-50">
                                            <TableHead className="font-bold text-slate-700">Cliente</TableHead>
                                            <TableHead className="font-bold text-slate-700">ID Crédito</TableHead>
                                            <TableHead className="font-bold text-slate-700">Fase</TableHead>
                                            <TableHead className="font-bold text-slate-700">Prioridade</TableHead>
                                            <TableHead className="font-bold text-slate-700 text-right">Dívida Cobrança</TableHead>
                                            <TableHead className="font-bold text-slate-700">Última Acção</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {activeLegalCases.map((lc) => {
                                            const client = clients.find(cl => cl.id === lc.clientId);
                                            return (
                                                <TableRow key={lc.id} className="hover:bg-slate-50/50">
                                                    <TableCell className="font-semibold text-slate-800 text-xs">
                                                        {client ? client.name : 'Cliente Desconhecido'}
                                                    </TableCell>
                                                    <TableCell className="text-xs font-mono">{lc.creditId.slice(0, 8)}...</TableCell>
                                                    <TableCell className="text-xs">
                                                        <Badge className="font-semibold uppercase tracking-wider text-[9px] bg-purple-50 text-purple-700 border border-purple-200">
                                                            {stageLabels[lc.stage] || lc.stage}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell className="text-xs">
                                                        <Badge variant={
                                                            lc.priority === 'critical' ? 'destructive' : 
                                                            lc.priority === 'high' ? 'destructive' : 'secondary'
                                                        } className="text-[9px]">
                                                            {lc.priority.toUpperCase()}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell className="text-right text-xs font-bold text-red-600">
                                                        {formatCurrency(lc.debtAmount)}
                                                    </TableCell>
                                                    <TableCell className="text-xs max-w-[200px] truncate text-slate-500">
                                                        {lc.lastAction || 'Sem ações registadas'}
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })}
                                        {activeLegalCases.length === 0 && (
                                            <TableRow>
                                                <TableCell colSpan={6} className="text-center text-slate-400 py-6">
                                                    Nenhum processo de cobrança ativa no contencioso.
                                                </TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>
                    </>
                )}

                {/* --- ABA GARANTIAS & RISCOS --- */}
                {activeTab === 'garantias' && (
                    <>
                        {/* Métricas de Garantias Estilo Pastel Arredondado */}
                        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
                            {/* 1. Garantias Ativas (Azul Céu #82C9FF) */}
                            <div className="card-kpi-sky">
                                <div className="flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-2.5 min-w-0">
                                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/10 dark:bg-white/10 text-slate-950 dark:text-white shrink-0">
                                            <Shield className="h-5 w-5" />
                                        </div>
                                        <p className="text-sm sm:text-base font-bold text-slate-950 dark:text-white truncate tracking-tight">
                                            Garantias Ativas (Qtd)
                                        </p>
                                    </div>
                                </div>

                                <div className="my-2">
                                    <p className="font-display text-3xl sm:text-4xl font-black tracking-tight text-slate-950 dark:text-white truncate">
                                        {activeWarranties.length}
                                    </p>
                                </div>

                                <p className="text-xs font-semibold text-slate-900/75 dark:text-slate-400 truncate">
                                    Bens retidos sob garantia ativa
                                </p>
                            </div>

                            {/* 2. Valor de Mercado (Verde Menta #86EFAC) */}
                            <div className="card-kpi-mint">
                                <div className="flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-2.5 min-w-0">
                                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/10 dark:bg-white/10 text-slate-950 dark:text-white shrink-0">
                                            <TrendingUp className="h-5 w-5" />
                                        </div>
                                        <p className="text-sm sm:text-base font-bold text-slate-950 dark:text-white truncate tracking-tight">
                                            Valor de Mercado (Total)
                                        </p>
                                    </div>
                                </div>

                                <div className="my-2">
                                    <p className="font-display text-3xl sm:text-4xl font-black tracking-tight text-slate-950 dark:text-white truncate" title={formatCurrency(totalWarrantyValue)}>
                                        {formatCurrency(totalWarrantyValue)}
                                    </p>
                                </div>

                                <p className="text-xs font-semibold text-slate-900/75 dark:text-slate-400 truncate">
                                    Avaliação total dos bens em garantia
                                </p>
                            </div>

                            {/* 3. Média por Garantia (Púrpura / Lavanda #E99EFE) */}
                            <div className="card-kpi-purple">
                                <div className="flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-2.5 min-w-0">
                                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/10 dark:bg-white/10 text-slate-950 dark:text-white shrink-0">
                                            <Briefcase className="h-5 w-5" />
                                        </div>
                                        <p className="text-sm sm:text-base font-bold text-slate-950 dark:text-white truncate tracking-tight">
                                            Média por Garantia
                                        </p>
                                    </div>
                                </div>

                                <div className="my-2">
                                    <p className="font-display text-3xl sm:text-4xl font-black tracking-tight text-slate-950 dark:text-white truncate" title={formatCurrency(averageWarrantyValue)}>
                                        {formatCurrency(averageWarrantyValue)}
                                    </p>
                                </div>

                                <p className="text-xs font-semibold text-slate-900/75 dark:text-slate-400 truncate">
                                    Valor médio avaliado dos bens
                                </p>
                            </div>

                            {/* 4. Garantias Executadas (Coral / Rosa #FDA4AF) */}
                            <div className="card-kpi-coral">
                                <div className="flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-2.5 min-w-0">
                                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/10 dark:bg-white/10 text-slate-950 dark:text-white shrink-0">
                                            <Lock className="h-5 w-5" />
                                        </div>
                                        <p className="text-sm sm:text-base font-bold text-slate-950 dark:text-white truncate tracking-tight">
                                            Garantias Executadas (Qtd)
                                        </p>
                                    </div>
                                </div>

                                <div className="my-2">
                                    <p className="font-display text-3xl sm:text-4xl font-black tracking-tight text-slate-950 dark:text-white truncate">
                                        {countSeizedWarranties}
                                    </p>
                                </div>

                                <p className="text-xs font-semibold text-slate-900/75 dark:text-slate-400 truncate">
                                    Bens arrestados por incumprimento
                                </p>
                            </div>
                        </div>

                        {/* Relação de Garantias Registadas */}
                        <Card className="card-elevated">
                            <CardHeader className="flex flex-row items-center justify-between">
                                <CardTitle className="text-slate-800 font-bold text-base">Relação de Garantias de Crédito</CardTitle>
                                <Badge variant="secondary" className="bg-blue-50 text-blue-700">Segurança de Carteira</Badge>
                            </CardHeader>
                            <CardContent>
                                <Table>
                                    <TableHeader>
                                        <TableRow className="bg-slate-50">
                                            <TableHead className="font-bold text-slate-700">Descrição do Bem</TableHead>
                                            <TableHead className="font-bold text-slate-700">Tipo</TableHead>
                                            <TableHead className="font-bold text-slate-700">Cliente</TableHead>
                                            <TableHead className="font-bold text-slate-700 text-right">Valor Avaliado</TableHead>
                                            <TableHead className="font-bold text-slate-700">Estado</TableHead>
                                            <TableHead className="font-bold text-slate-700">ID Crédito</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {filteredWarranties.map((w) => {
                                            const client = clients.find(cl => cl.id === w.clientId);
                                            return (
                                                <TableRow key={w.id} className="hover:bg-slate-50/50">
                                                    <TableCell className="font-semibold text-slate-800 text-xs">{w.description}</TableCell>
                                                    <TableCell className="text-xs">
                                                        <Badge variant="outline" className="font-medium">
                                                            {w.type}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell className="text-xs">
                                                        {client ? client.name : 'Cliente Desconhecido'}
                                                    </TableCell>
                                                    <TableCell className="text-right text-xs font-bold text-emerald-600">
                                                        {formatCurrency(w.marketValue)}
                                                    </TableCell>
                                                    <TableCell className="text-xs">
                                                        <Badge variant={
                                                            w.status === 'seized' ? 'destructive' : 
                                                            w.status === 'active' ? 'default' : 'secondary'
                                                        } className="text-[10px]">
                                                            {w.status === 'seized' ? 'Arrestado/Executado' : 
                                                             w.status === 'active' ? 'Ativa' : 'Libertada'}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell className="text-xs font-mono text-slate-400">
                                                        {w.creditId ? `${w.creditId.slice(0, 8)}...` : 'N/A'}
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })}
                                        {filteredWarranties.length === 0 && (
                                            <TableRow>
                                                <TableCell colSpan={6} className="text-center text-slate-400 py-6">
                                                    Nenhuma garantia registada para o período analisado.
                                                </TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>
                    </>
                )}

            </div>

            <AlertModal
                isOpen={alertConfig.isOpen}
                onClose={() => setAlertConfig({ ...alertConfig, isOpen: false })}
                title={alertConfig.title}
                description={alertConfig.description}
                type={alertConfig.type}
            />
        </MainLayout>
    );
}
