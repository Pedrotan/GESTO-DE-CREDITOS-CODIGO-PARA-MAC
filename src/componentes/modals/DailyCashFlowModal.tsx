import { useState, useMemo, useEffect } from 'react';
import { useData } from '@/contextos/ContextoDados';
import { useAuth } from '@/contextos/ContextoAutenticacao';
import { formatCurrency } from '@/bibliotecas/formatters';
import { generateDailyCashFlowPDF } from '@/bibliotecas/pdf';
import { getScopedLocalStorageItem, setScopedLocalStorageItem } from '@/bibliotecas/contas';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from '@/componentes/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/componentes/ui/tabs';
import { Button } from '@/componentes/ui/button';
import { Input } from '@/componentes/ui/input';
import { Label } from '@/componentes/ui/label';
import { Badge } from '@/componentes/ui/badge';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
    TableFooter
} from '@/componentes/ui/table';
import {
    ArrowDownUp,
    ArrowUpRight,
    ArrowDownLeft,
    Download,
    Calendar,
    Plus,
    Clock,
    Trash2,
    CheckCircle2,
    Wallet,
    Search,
    X,
    Filter,
    Coins,
    TrendingUp,
    FileText,
    Sparkles
} from 'lucide-react';
import { useToast } from '@/ganchos/usar-toast';

interface ManualEntry {
    id: string;
    date: string; // YYYY-MM-DD
    type: 'out' | 'in';
    description: string;
    amount: number;
    method: string;
    createdAt: string;
}

interface DailyCashFlowModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    initialDate?: string;
}

const STORAGE_KEY_MANUAL_ENTRIES = 'tango_daily_manual_cashflow';

const getLocalDateStr = (d: any): string => {
    if (!d) return '';
    if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d.trim())) return d.trim();
    const dateObj = d instanceof Date ? d : new Date(d);
    if (isNaN(dateObj.getTime())) return '';
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const day = String(dateObj.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

export function DailyCashFlowModal({
    open,
    onOpenChange,
    initialDate
}: DailyCashFlowModalProps) {
    const { credits, payments, companySettings } = useData();
    const { user } = useAuth();
    const { toast } = useToast();

    const currency = companySettings?.currency || 'AOA';

    // Data selecionada no calendário (por defeito hoje: YYYY-MM-DD)
    const todayStr = useMemo(() => getLocalDateStr(new Date()), []);
    const [selectedDate, setSelectedDate] = useState<string>(initialDate || todayStr);

    useEffect(() => {
        if (initialDate) setSelectedDate(initialDate);
    }, [initialDate]);

    // Filtros de pesquisa nas abas
    const [searchInflow, setSearchInflow] = useState('');
    const [methodFilterInflow, setMethodFilterInflow] = useState('all');
    const [searchOutflow, setSearchOutflow] = useState('');
    const [typeFilterOutflow, setTypeFilterOutflow] = useState('all');

    // Movimentos manuais avulsos (guardados por conta no localStorage)
    const [manualEntries, setManualEntries] = useState<ManualEntry[]>(() => {
        try {
            const raw = getScopedLocalStorageItem(STORAGE_KEY_MANUAL_ENTRIES) || localStorage.getItem(STORAGE_KEY_MANUAL_ENTRIES);
            return raw ? JSON.parse(raw) : [];
        } catch {
            return [];
        }
    });

    const saveManualEntries = (updated: ManualEntry[]) => {
        setManualEntries(updated);
        try {
            const str = JSON.stringify(updated);
            setScopedLocalStorageItem(STORAGE_KEY_MANUAL_ENTRIES, str);
            localStorage.setItem(STORAGE_KEY_MANUAL_ENTRIES, str);
        } catch (e) {
            console.error('Falha ao salvar movimentos manuais:', e);
        }
    };

    // Formulário de novo registo avulso
    const [newDesc, setNewDesc] = useState('');
    const [newAmount, setNewAmount] = useState('');
    const [newType, setNewType] = useState<'out' | 'in'>('out');
    const [newMethod, setNewMethod] = useState('Transferência');

    // 1. Saídas do Dia Selecionado (com detalhes contratuais e financeiros)
    const dailyOutflows = useMemo(() => {
        const list: Array<{
            id: string;
            time?: string;
            clientName: string;
            creditId: string;
            amount: number;
            interestRate?: number;
            installments?: number;
            method?: string;
            isManual?: boolean;
        }> = [];

        // Créditos concedidos nesta data
        (credits || []).forEach(credit => {
            if (credit.deletedAt) return;
            const rawDate = credit.startDate || credit.createdAt;
            const dateStr = getLocalDateStr(rawDate);
            if (dateStr === selectedDate) {
                const timeStr = credit.createdAt ? new Date(credit.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : undefined;
                list.push({
                    id: credit.id,
                    time: timeStr,
                    clientName: credit.clientName || 'Cliente',
                    creditId: credit.id,
                    amount: credit.principalAmount || 0,
                    interestRate: credit.interestRate,
                    installments: credit.installments,
                    method: 'Desembolso de Crédito',
                    isManual: false
                });
            }
        });

        // Saídas avulsas manuais
        manualEntries.filter(m => m.date === selectedDate && m.type === 'out').forEach(m => {
            list.push({
                id: m.id,
                time: new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                clientName: m.description,
                creditId: 'Avulso',
                amount: m.amount,
                method: m.method,
                isManual: true
            });
        });

        return list;
    }, [credits, selectedDate, manualEntries]);

    // 2. Entradas do Dia Selecionado (com separação de Capital Amortizado, Juros e Multas)
    const dailyInflows = useMemo(() => {
        const list: Array<{
            id: string;
            time?: string;
            clientName: string;
            receiptId: string;
            creditId?: string;
            amount: number;
            principal: number;
            interest: number;
            lateInterest: number;
            method: string;
            isManual?: boolean;
        }> = [];

        // Pagamentos recebidos nesta data
        (payments || []).forEach(payment => {
            if (payment.status === 'cancelled' || payment.deletedAt) return;
            const dateStr = getLocalDateStr(payment.paymentDate);

            if (dateStr === selectedDate) {
                const timeStr = payment.paymentDate
                    ? new Date(payment.paymentDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                    : undefined;

                const methodLabel = payment.method === 'cash' ? 'Numerário' :
                    payment.method === 'transfer' ? 'Transferência' :
                    payment.method === 'reference' ? 'Multicaixa' :
                    payment.method === 'deposit' ? 'Depósito' :
                    payment.method || 'Numerário';

                const principal = Number(payment.allocatedToPrincipal || 0);
                const interest = Number(payment.allocatedToInterest || 0);
                const lateInterest = Number(payment.allocatedToLateInterest || 0);
                const totalCalculated = principal + interest + lateInterest;
                const totalAmount = payment.amount > 0 ? payment.amount : totalCalculated;

                list.push({
                    id: payment.id,
                    time: timeStr,
                    clientName: payment.clientName || 'Cliente',
                    receiptId: payment.reference ? (payment.reference.startsWith('#') ? payment.reference : `#${payment.reference}`) : `#${payment.id}`,
                    creditId: payment.creditId,
                    amount: totalAmount,
                    principal: principal > 0 ? principal : (totalAmount - interest - lateInterest),
                    interest,
                    lateInterest,
                    method: methodLabel,
                    isManual: false
                });
            }
        });

        // Entradas avulsas manuais
        manualEntries.filter(m => m.date === selectedDate && m.type === 'in').forEach(m => {
            list.push({
                id: m.id,
                time: new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                clientName: m.description,
                receiptId: 'Avulso',
                creditId: '-',
                amount: m.amount,
                principal: m.amount,
                interest: 0,
                lateInterest: 0,
                method: m.method,
                isManual: true
            });
        });

        return list;
    }, [payments, selectedDate, manualEntries]);

    // Totais e Métricas Detalhadas do Dia Selecionado
    const totalOut = useMemo(() => dailyOutflows.reduce((sum, item) => sum + item.amount, 0), [dailyOutflows]);
    const totalCreditsOut = useMemo(() => dailyOutflows.filter(i => !i.isManual).reduce((sum, item) => sum + item.amount, 0), [dailyOutflows]);
    const totalManualOut = useMemo(() => dailyOutflows.filter(i => i.isManual).reduce((sum, item) => sum + item.amount, 0), [dailyOutflows]);
    const countCreditsOut = useMemo(() => dailyOutflows.filter(i => !i.isManual).length, [dailyOutflows]);
    const countManualOut = useMemo(() => dailyOutflows.filter(i => i.isManual).length, [dailyOutflows]);

    const totalIn = useMemo(() => dailyInflows.reduce((sum, item) => sum + item.amount, 0), [dailyInflows]);
    const totalPrincipalIn = useMemo(() => dailyInflows.reduce((sum, item) => sum + item.principal, 0), [dailyInflows]);
    const totalInterestIn = useMemo(() => dailyInflows.reduce((sum, item) => sum + item.interest, 0), [dailyInflows]);
    const totalLateIn = useMemo(() => dailyInflows.reduce((sum, item) => sum + item.lateInterest, 0), [dailyInflows]);
    const totalProfitIn = useMemo(() => totalInterestIn + totalLateIn, [totalInterestIn, totalLateIn]);

    const netFlow = totalIn - totalOut;
    const coverageRatio = useMemo(() => {
        if (totalOut === 0) return totalIn > 0 ? 100 : 0;
        return Math.round((totalIn / totalOut) * 100);
    }, [totalIn, totalOut]);

    // Filtragem em tempo real das tabelas
    const filteredInflows = useMemo(() => {
        const q = searchInflow.toLowerCase().trim();
        return dailyInflows.filter(item => {
            const matchesQuery = !q ||
                item.clientName.toLowerCase().includes(q) ||
                item.receiptId.toLowerCase().includes(q) ||
                (item.creditId && item.creditId.toLowerCase().includes(q)) ||
                item.method.toLowerCase().includes(q);

            const matchesMethod = methodFilterInflow === 'all' || item.method.toLowerCase() === methodFilterInflow.toLowerCase();

            return matchesQuery && matchesMethod;
        });
    }, [dailyInflows, searchInflow, methodFilterInflow]);

    const filteredOutflows = useMemo(() => {
        const q = searchOutflow.toLowerCase().trim();
        return dailyOutflows.filter(item => {
            const matchesQuery = !q ||
                item.clientName.toLowerCase().includes(q) ||
                item.creditId.toLowerCase().includes(q) ||
                (item.method && item.method.toLowerCase().includes(q));

            const matchesType = typeFilterOutflow === 'all' ||
                (typeFilterOutflow === 'credits' && !item.isManual) ||
                (typeFilterOutflow === 'manual' && item.isManual);

            return matchesQuery && matchesType;
        });
    }, [dailyOutflows, searchOutflow, typeFilterOutflow]);

    // Adicionar movimento manual avulso
    const handleAddManual = (e: React.FormEvent) => {
        e.preventDefault();
        const amt = parseFloat(newAmount.replace(/\s/g, '').replace(',', '.'));
        if (!newDesc.trim() || isNaN(amt) || amt <= 0) {
            toast({
                title: "Dados Inválidos",
                description: "Preencha uma descrição e um valor válido.",
                variant: "destructive"
            });
            return;
        }

        const newEntry: ManualEntry = {
            id: `manual_${Date.now()}`,
            date: selectedDate,
            type: newType,
            description: newDesc.trim(),
            amount: amt,
            method: newMethod,
            createdAt: new Date().toISOString()
        };

        saveManualEntries([newEntry, ...manualEntries]);
        setNewDesc('');
        setNewAmount('');
        toast({
            title: "Movimento Registado",
            description: `${newType === 'out' ? 'Saída' : 'Entrada'} registada com sucesso para ${selectedDate}.`
        });
    };

    const handleDeleteManual = (id: string) => {
        saveManualEntries(manualEntries.filter(m => m.id !== id));
        toast({
            title: "Registo Removido",
            description: "O movimento avulso foi excluído."
        });
    };

    // Baixar PDF do dia
    const handleDownloadPDF = () => {
        try {
            const formattedDate = new Date(selectedDate + 'T00:00:00').toLocaleDateString('pt-PT', {
                weekday: 'long',
                day: '2-digit',
                month: 'long',
                year: 'numeric'
            });

            generateDailyCashFlowPDF(
                formattedDate,
                dailyOutflows,
                dailyInflows,
                { totalOut, totalIn, net: netFlow },
                companySettings,
                user?.name
            );

            toast({
                title: "Relatório Diário Gerado",
                description: `PDF do fluxo de ${selectedDate} descarregado com sucesso.`
            });
        } catch (e: any) {
            toast({
                title: "Erro ao Gerar PDF",
                description: e?.message || "Falha ao gerar relatório diário.",
                variant: "destructive"
            });
        }
    };

    // Histórico de datas recentes que tiveram movimentações
    const recentHistoryDates = useMemo(() => {
        const datesSet = new Set<string>();
        datesSet.add(todayStr);

        (credits || []).forEach(c => {
            const rawDate = c.startDate || c.createdAt;
            const d = getLocalDateStr(rawDate);
            if (d) datesSet.add(d);
        });

        (payments || []).forEach(p => {
            const d = getLocalDateStr(p.paymentDate);
            if (d) datesSet.add(d);
        });

        manualEntries.forEach(m => {
            if (m.date) datesSet.add(m.date);
        });

        return Array.from(datesSet).sort().reverse().slice(0, 15);
    }, [credits, payments, manualEntries, todayStr]);

    const formattedHeaderDate = useMemo(() => {
        try {
            return new Date(selectedDate + 'T00:00:00').toLocaleDateString('pt-PT', {
                weekday: 'long',
                day: '2-digit',
                month: 'long',
                year: 'numeric'
            });
        } catch {
            return selectedDate;
        }
    }, [selectedDate]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-6xl xl:max-w-7xl w-[96vw] max-h-[92vh] flex flex-col p-0 overflow-hidden border-none shadow-2xl rounded-2xl bg-background">
                {/* Cabeçalho Premium Alargado */}
                <div className="bg-gradient-to-r from-slate-950 via-slate-900 to-indigo-950 p-6 text-white shrink-0">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                        <div className="flex items-center gap-4">
                            <div className="h-12 w-12 rounded-xl bg-white/10 text-white border border-white/20 flex items-center justify-center shrink-0 shadow-inner">
                                <ArrowDownUp className="h-6 w-6 text-indigo-300" />
                            </div>
                            <div>
                                <DialogTitle className="text-xl font-black text-white tracking-tight flex items-center gap-2">
                                    Operações do Dia: Saídas vs Entradas
                                    {selectedDate === todayStr && (
                                        <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30 text-[10px] font-bold">
                                            Hoje
                                        </Badge>
                                    )}
                                </DialogTitle>
                                <DialogDescription className="text-indigo-200/80 text-xs mt-0.5 capitalize">
                                    {formattedHeaderDate} • Auditoria e conciliação do fluxo diário de tesouraria
                                </DialogDescription>
                            </div>
                        </div>

                        {/* Seletor de Data e Ações */}
                        <div className="flex flex-wrap items-center gap-2">
                            {selectedDate !== todayStr && (
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => setSelectedDate(todayStr)}
                                    className="h-8 text-xs bg-white/10 hover:bg-white/20 text-white border-white/20"
                                >
                                    Ir para Hoje
                                </Button>
                            )}
                            <div className="flex items-center gap-2 bg-white/10 px-3 py-1.5 rounded-lg border border-white/20 text-xs">
                                <Calendar className="h-4 w-4 text-indigo-300" />
                                <input
                                    type="date"
                                    value={selectedDate}
                                    onChange={(e) => e.target.value && setSelectedDate(e.target.value)}
                                    className="bg-transparent text-white font-mono text-xs focus:outline-hidden cursor-pointer"
                                />
                            </div>
                            <Button
                                size="sm"
                                onClick={handleDownloadPDF}
                                className="h-8 gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md"
                            >
                                <Download className="h-3.5 w-3.5" />
                                Baixar PDF
                            </Button>
                        </div>
                    </div>
                </div>

                {/* Conteúdo Principal com Barra de Rolagem */}
                <div className="p-6 overflow-y-auto space-y-6 flex-1">
                    {/* 4 Cards de Resumo Executivo e Financeiro com Informações Ricas */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        {/* 1. Saídas de Hoje */}
                        <div className="p-4 rounded-xl border bg-card shadow-xs space-y-2 border-l-4 border-l-rose-500">
                            <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                <span className="flex items-center gap-1.5">
                                    <ArrowUpRight className="h-4 w-4 text-rose-500" />
                                    Saídas de Hoje
                                </span>
                                <Badge variant="outline" className="text-[10px] text-rose-600 border-rose-200 font-bold">
                                    {dailyOutflows.length} operações
                                </Badge>
                            </div>
                            <p className="text-xl sm:text-2xl font-black text-rose-600 dark:text-rose-400 tracking-tight whitespace-nowrap overflow-hidden text-ellipsis">
                                {formatCurrency(totalOut, currency)}
                            </p>
                            <div className="pt-1.5 border-t border-muted/60 space-y-1 text-[11px] text-muted-foreground">
                                <div className="flex justify-between items-center">
                                    <span>Créditos Desembolsados:</span>
                                    <span className="font-bold text-foreground">{countCreditsOut} ({formatCurrency(totalCreditsOut, currency)})</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span>Despesas / Avulsos:</span>
                                    <span className="font-semibold">{countManualOut} ({formatCurrency(totalManualOut, currency)})</span>
                                </div>
                            </div>
                        </div>

                        {/* 2. Entradas de Hoje */}
                        <div className="p-4 rounded-xl border bg-card shadow-xs space-y-2 border-l-4 border-l-emerald-500">
                            <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                <span className="flex items-center gap-1.5">
                                    <ArrowDownLeft className="h-4 w-4 text-emerald-500" />
                                    Entradas de Hoje
                                </span>
                                <Badge variant="outline" className="text-[10px] text-emerald-600 border-emerald-200 font-bold">
                                    {dailyInflows.length} recebimentos
                                </Badge>
                            </div>
                            <p className="text-xl sm:text-2xl font-black text-emerald-600 dark:text-emerald-400 tracking-tight whitespace-nowrap overflow-hidden text-ellipsis">
                                {formatCurrency(totalIn, currency)}
                            </p>
                            <div className="pt-1.5 border-t border-muted/60 space-y-1 text-[11px] text-muted-foreground">
                                <div className="flex justify-between items-center">
                                    <span>Capital Amortizado:</span>
                                    <span className="font-bold text-foreground">{formatCurrency(totalPrincipalIn, currency)}</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span>Lucro (Juros/Moras):</span>
                                    <span className="font-bold text-emerald-600">{formatCurrency(totalProfitIn, currency)}</span>
                                </div>
                            </div>
                        </div>

                        {/* 3. Lucro Realizado do Dia (Juros & Multas) */}
                        <div className="p-4 rounded-xl border bg-card shadow-xs space-y-2 border-l-4 border-l-indigo-500">
                            <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                <span className="flex items-center gap-1.5">
                                    <Coins className="h-4 w-4 text-indigo-500" />
                                    Lucro Realizado
                                </span>
                                <Badge variant="outline" className="text-[10px] text-indigo-600 border-indigo-200 font-bold">
                                    Regime Caixa
                                </Badge>
                            </div>
                            <p className="text-xl sm:text-2xl font-black text-indigo-600 dark:text-indigo-400 tracking-tight whitespace-nowrap overflow-hidden text-ellipsis">
                                {formatCurrency(totalProfitIn, currency)}
                            </p>
                            <div className="pt-1.5 border-t border-muted/60 space-y-1 text-[11px] text-muted-foreground">
                                <div className="flex justify-between items-center">
                                    <span>Juros Cobrados:</span>
                                    <span className="font-semibold text-foreground">{formatCurrency(totalInterestIn, currency)}</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span>Multas & Moras:</span>
                                    <span className="font-semibold text-amber-600">{formatCurrency(totalLateIn, currency)}</span>
                                </div>
                            </div>
                        </div>

                        {/* 4. Balanço Líquido do Dia */}
                        <div className={`p-4 rounded-xl border bg-card shadow-xs space-y-2 border-l-4 ${netFlow >= 0 ? 'border-l-teal-500' : 'border-l-amber-500'}`}>
                            <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                <span className="flex items-center gap-1.5">
                                    <Wallet className="h-4 w-4 text-primary" />
                                    Balanço Líquido
                                </span>
                                <Badge variant={netFlow >= 0 ? "success" : "destructive"} className="text-[10px] font-bold">
                                    {netFlow >= 0 ? 'SUPERÁVIT' : 'DÉFICIT'}
                                </Badge>
                            </div>
                            <p className={`text-xl sm:text-2xl font-black tracking-tight whitespace-nowrap overflow-hidden text-ellipsis ${netFlow >= 0 ? 'text-teal-600 dark:text-teal-400' : 'text-amber-600 dark:text-amber-400'}`}>
                                {formatCurrency(netFlow, currency)}
                            </p>
                            <div className="pt-1.5 border-t border-muted/60 space-y-1 text-[11px] text-muted-foreground">
                                <div className="flex justify-between items-center">
                                    <span>Taxa de Cobertura:</span>
                                    <span className="font-bold text-foreground">{coverageRatio}%</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span>Resultado:</span>
                                    <span className="font-semibold">{netFlow >= 0 ? 'Fluxo Positivo de Caixa' : 'Necessidade de Tesouraria'}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Abas com Saídas, Entradas, Registar Avulso e Histórico */}
                    <Tabs defaultValue="inflows" className="w-full">
                        <TabsList className="grid w-full grid-cols-4 bg-muted/60 p-1 rounded-xl">
                            <TabsTrigger value="inflows" className="gap-1.5 text-xs font-bold py-2">
                                <ArrowDownLeft className="h-3.5 w-3.5 text-emerald-500" />
                                Entradas ({dailyInflows.length})
                            </TabsTrigger>
                            <TabsTrigger value="outflows" className="gap-1.5 text-xs font-bold py-2">
                                <ArrowUpRight className="h-3.5 w-3.5 text-rose-500" />
                                Saídas ({dailyOutflows.length})
                            </TabsTrigger>
                            <TabsTrigger value="manual" className="gap-1.5 text-xs font-bold py-2">
                                <Plus className="h-3.5 w-3.5 text-primary" />
                                Registar Movimento
                            </TabsTrigger>
                            <TabsTrigger value="history" className="gap-1.5 text-xs font-bold py-2">
                                <Calendar className="h-3.5 w-3.5 text-indigo-500" />
                                Histórico de Dias
                            </TabsTrigger>
                        </TabsList>

                        {/* 1. Aba Entradas (Melhorada e com colunas discriminadas) */}
                        <TabsContent value="inflows" className="mt-4 space-y-3">
                            {/* Barra de Pesquisa e Filtro de Métodos */}
                            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-muted/20 p-3 rounded-xl border">
                                <div className="relative w-full sm:w-80">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                                    <Input
                                        value={searchInflow}
                                        onChange={(e) => setSearchInflow(e.target.value)}
                                        placeholder="Pesquisar por cliente, recibo, crédito..."
                                        className="pl-9 pr-8 h-9 text-xs"
                                    />
                                    {searchInflow && (
                                        <button
                                            onClick={() => setSearchInflow('')}
                                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                        >
                                            <X className="h-3.5 w-3.5" />
                                        </button>
                                    )}
                                </div>
                                <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
                                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                        <Filter className="h-3.5 w-3.5" />
                                        <span>Método:</span>
                                    </div>
                                    <select
                                        value={methodFilterInflow}
                                        onChange={(e) => setMethodFilterInflow(e.target.value)}
                                        className="h-9 px-3 rounded-lg border bg-background text-xs font-medium focus:outline-hidden cursor-pointer"
                                    >
                                        <option value="all">Todos os Métodos</option>
                                        <option value="numerário">Numerário</option>
                                        <option value="transferência">Transferência</option>
                                        <option value="multicaixa">Multicaixa</option>
                                        <option value="depósito">Depósito</option>
                                    </select>
                                    <Badge variant="outline" className="text-[11px] font-semibold">
                                        {filteredInflows.length} de {dailyInflows.length}
                                    </Badge>
                                </div>
                            </div>

                            {filteredInflows.length === 0 ? (
                                <div className="text-center py-12 border-2 border-dashed rounded-xl bg-muted/10 space-y-2">
                                    <ArrowDownLeft className="h-10 w-10 text-muted-foreground/30 mx-auto" />
                                    <p className="text-sm font-bold text-muted-foreground">Nenhuma entrada encontrada para os filtros selecionados</p>
                                    <p className="text-xs text-muted-foreground/80">
                                        {dailyInflows.length === 0
                                            ? `Nenhum pagamento foi registado no dia ${selectedDate}.`
                                            : 'Tente alterar os termos de pesquisa ou o filtro de método.'}
                                    </p>
                                </div>
                            ) : (
                                <div className="border rounded-xl overflow-hidden shadow-xs bg-card">
                                    <Table>
                                        <TableHeader className="bg-muted/70">
                                            <TableRow>
                                                <TableHead className="w-20 font-bold text-xs">Hora</TableHead>
                                                <TableHead className="font-bold text-xs">Cliente Pagador</TableHead>
                                                <TableHead className="font-bold text-xs">Recibo / Ref</TableHead>
                                                <TableHead className="font-bold text-xs">Ref. Crédito</TableHead>
                                                <TableHead className="font-bold text-xs">Método / Canal</TableHead>
                                                <TableHead className="font-bold text-xs text-right">Capital Amortizado</TableHead>
                                                <TableHead className="font-bold text-xs text-right">Juros & Moras</TableHead>
                                                <TableHead className="font-bold text-xs text-right">Total Recebido</TableHead>
                                                <TableHead className="w-12 text-center"></TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody className="divide-y">
                                            {filteredInflows.map((inflow) => (
                                                <TableRow key={inflow.id} className="hover:bg-muted/30 transition-colors">
                                                    <td className="p-3 font-mono text-xs text-muted-foreground">{inflow.time || '-'}</td>
                                                    <td className="p-3">
                                                        <span className="font-bold text-xs text-foreground block">{inflow.clientName}</span>
                                                    </td>
                                                    <td className="p-3">
                                                        <span className="font-mono text-[11px] font-semibold text-primary bg-primary/5 px-2 py-0.5 rounded-md border border-primary/20">
                                                            {inflow.receiptId}
                                                        </span>
                                                    </td>
                                                    <td className="p-3">
                                                        <span className="font-mono text-[11px] text-muted-foreground">
                                                            {inflow.creditId || '-'}
                                                        </span>
                                                    </td>
                                                    <td className="p-3">
                                                        <Badge variant="secondary" className="text-[10px] font-semibold">
                                                            {inflow.method}
                                                        </Badge>
                                                    </td>
                                                    <td className="p-3 text-right font-medium text-xs text-foreground/80">
                                                        {formatCurrency(inflow.principal, currency)}
                                                    </td>
                                                    <td className="p-3 text-right font-semibold text-xs text-indigo-600 dark:text-indigo-400">
                                                        {formatCurrency(inflow.interest + inflow.lateInterest, currency)}
                                                    </td>
                                                    <td className="p-3 text-right font-black text-xs text-emerald-600 dark:text-emerald-400">
                                                        {formatCurrency(inflow.amount, currency)}
                                                    </td>
                                                    <td className="p-3 text-center">
                                                        {inflow.isManual && (
                                                            <Button
                                                                size="icon"
                                                                variant="ghost"
                                                                onClick={() => handleDeleteManual(inflow.id)}
                                                                className="h-6 w-6 text-muted-foreground hover:text-destructive"
                                                                title="Excluir lançamento avulso"
                                                            >
                                                                <Trash2 className="h-3 w-3" />
                                                            </Button>
                                                        )}
                                                    </td>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                        <TableFooter className="bg-muted/80 font-bold text-xs">
                                            <TableRow>
                                                <TableCell colSpan={5} className="p-3 text-left">
                                                    TOTAIS DAS ENTRADAS ({filteredInflows.length} operações)
                                                </TableCell>
                                                <TableCell className="p-3 text-right text-foreground">
                                                    {formatCurrency(filteredInflows.reduce((s, i) => s + i.principal, 0), currency)}
                                                </TableCell>
                                                <TableCell className="p-3 text-right text-indigo-600 dark:text-indigo-400">
                                                    {formatCurrency(filteredInflows.reduce((s, i) => s + (i.interest + i.lateInterest), 0), currency)}
                                                </TableCell>
                                                <TableCell className="p-3 text-right font-black text-emerald-600 dark:text-emerald-400">
                                                    {formatCurrency(filteredInflows.reduce((s, i) => s + i.amount, 0), currency)}
                                                </TableCell>
                                                <TableCell></TableCell>
                                            </TableRow>
                                        </TableFooter>
                                    </Table>
                                </div>
                            )}
                        </TabsContent>

                        {/* 2. Aba Saídas (Melhorada e com detalhes de crédito) */}
                        <TabsContent value="outflows" className="mt-4 space-y-3">
                            {/* Barra de Pesquisa e Filtro de Tipo */}
                            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-muted/20 p-3 rounded-xl border">
                                <div className="relative w-full sm:w-80">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                                    <Input
                                        value={searchOutflow}
                                        onChange={(e) => setSearchOutflow(e.target.value)}
                                        placeholder="Pesquisar saída por beneficiário, crédito, canal..."
                                        className="pl-9 pr-8 h-9 text-xs"
                                    />
                                    {searchOutflow && (
                                        <button
                                            onClick={() => setSearchOutflow('')}
                                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                        >
                                            <X className="h-3.5 w-3.5" />
                                        </button>
                                    )}
                                </div>
                                <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
                                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                        <Filter className="h-3.5 w-3.5" />
                                        <span>Tipo:</span>
                                    </div>
                                    <select
                                        value={typeFilterOutflow}
                                        onChange={(e) => setTypeFilterOutflow(e.target.value)}
                                        className="h-9 px-3 rounded-lg border bg-background text-xs font-medium focus:outline-hidden cursor-pointer"
                                    >
                                        <option value="all">Todas as Saídas</option>
                                        <option value="credits">Créditos Desembolsados</option>
                                        <option value="manual">Despesas / Lançamentos Avulsos</option>
                                    </select>
                                    <Badge variant="outline" className="text-[11px] font-semibold">
                                        {filteredOutflows.length} de {dailyOutflows.length}
                                    </Badge>
                                </div>
                            </div>

                            {filteredOutflows.length === 0 ? (
                                <div className="text-center py-12 border-2 border-dashed rounded-xl bg-muted/10 space-y-2">
                                    <ArrowUpRight className="h-10 w-10 text-muted-foreground/30 mx-auto" />
                                    <p className="text-sm font-bold text-muted-foreground">Nenhuma saída encontrada para os filtros selecionados</p>
                                    <p className="text-xs text-muted-foreground/80">
                                        {dailyOutflows.length === 0
                                            ? `Nenhum desembolso ou saída foi registada no dia ${selectedDate}.`
                                            : 'Tente alterar os termos de pesquisa ou o filtro.'}
                                    </p>
                                </div>
                            ) : (
                                <div className="border rounded-xl overflow-hidden shadow-xs bg-card">
                                    <Table>
                                        <TableHeader className="bg-muted/70">
                                            <TableRow>
                                                <TableHead className="w-20 font-bold text-xs">Hora</TableHead>
                                                <TableHead className="font-bold text-xs">Beneficiário / Descrição</TableHead>
                                                <TableHead className="font-bold text-xs">Ref. Crédito</TableHead>
                                                <TableHead className="font-bold text-xs">Condições / Prazo</TableHead>
                                                <TableHead className="font-bold text-xs">Canal / Categoria</TableHead>
                                                <TableHead className="font-bold text-xs text-right">Montante Desembolsado</TableHead>
                                                <TableHead className="w-12 text-center"></TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody className="divide-y">
                                            {filteredOutflows.map((outflow) => (
                                                <TableRow key={outflow.id} className="hover:bg-muted/30 transition-colors">
                                                    <td className="p-3 font-mono text-xs text-muted-foreground">{outflow.time || '-'}</td>
                                                    <td className="p-3">
                                                        <span className="font-bold text-xs text-foreground block">{outflow.clientName}</span>
                                                    </td>
                                                    <td className="p-3">
                                                        <span className="font-mono text-[11px] font-semibold text-primary bg-primary/5 px-2 py-0.5 rounded-md border border-primary/20">
                                                            {outflow.creditId}
                                                        </span>
                                                    </td>
                                                    <td className="p-3 text-xs text-muted-foreground">
                                                        {outflow.installments ? (
                                                            <span className="font-medium text-foreground">
                                                                {outflow.installments} parcelas • {outflow.interestRate || 0}% juro
                                                            </span>
                                                        ) : (
                                                            <span className="italic text-[11px]">Movimento Avulso</span>
                                                        )}
                                                    </td>
                                                    <td className="p-3">
                                                        <Badge variant="outline" className={`text-[10px] font-semibold ${outflow.isManual ? 'bg-amber-500/10 text-amber-700 border-amber-300' : 'bg-rose-500/10 text-rose-700 border-rose-300'}`}>
                                                            {outflow.method}
                                                        </Badge>
                                                    </td>
                                                    <td className="p-3 text-right font-black text-xs text-rose-600 dark:text-rose-400">
                                                        {formatCurrency(outflow.amount, currency)}
                                                    </td>
                                                    <td className="p-3 text-center">
                                                        {outflow.isManual && (
                                                            <Button
                                                                size="icon"
                                                                variant="ghost"
                                                                onClick={() => handleDeleteManual(outflow.id)}
                                                                className="h-6 w-6 text-muted-foreground hover:text-destructive"
                                                                title="Excluir lançamento avulso"
                                                            >
                                                                <Trash2 className="h-3 w-3" />
                                                            </Button>
                                                        )}
                                                    </td>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                        <TableFooter className="bg-muted/80 font-bold text-xs">
                                            <TableRow>
                                                <TableCell colSpan={5} className="p-3 text-left">
                                                    TOTAIS DAS SAÍDAS ({filteredOutflows.length} operações)
                                                </TableCell>
                                                <TableCell className="p-3 text-right font-black text-rose-600 dark:text-rose-400">
                                                    {formatCurrency(filteredOutflows.reduce((s, i) => s + i.amount, 0), currency)}
                                                </TableCell>
                                                <TableCell></TableCell>
                                            </TableRow>
                                        </TableFooter>
                                    </Table>
                                </div>
                            )}
                        </TabsContent>

                        {/* 3. Registar Movimento Avulso do Dia */}
                        <TabsContent value="manual" className="mt-4">
                            <form onSubmit={handleAddManual} className="p-6 rounded-xl border bg-muted/20 space-y-5">
                                <div className="space-y-1">
                                    <h4 className="text-sm font-bold flex items-center gap-2">
                                        <Plus className="h-4 w-4 text-primary" />
                                        Lançamento Avulso do Dia ({selectedDate})
                                    </h4>
                                    <p className="text-xs text-muted-foreground">
                                        Registe saídas ou entradas extraordinárias que afetam o caixa diário (ex: taxa bancária, despesa administrativa, suprimento de caixa).
                                    </p>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className="space-y-1.5">
                                        <Label className="text-xs font-semibold">Tipo de Movimento</Label>
                                        <div className="grid grid-cols-2 gap-2">
                                            <button
                                                type="button"
                                                onClick={() => setNewType('out')}
                                                className={`py-2 px-3 rounded-lg border text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${newType === 'out' ? 'bg-rose-600 text-white border-rose-600 shadow-sm' : 'bg-background text-foreground hover:bg-muted'}`}
                                            >
                                                <ArrowUpRight className="h-3.5 w-3.5" />
                                                Saída de Caixa
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setNewType('in')}
                                                className={`py-2 px-3 rounded-lg border text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${newType === 'in' ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm' : 'bg-background text-foreground hover:bg-muted'}`}
                                            >
                                                <ArrowDownLeft className="h-3.5 w-3.5" />
                                                Entrada de Caixa
                                            </button>
                                        </div>
                                    </div>

                                    <div className="space-y-1.5">
                                        <Label className="text-xs font-semibold">Forma / Canal de Pagamento</Label>
                                        <Input
                                            value={newMethod}
                                            onChange={(e) => setNewMethod(e.target.value)}
                                            placeholder="Ex: Numerário, Banco BAI, Transferência..."
                                            className="text-xs h-9"
                                        />
                                    </div>

                                    <div className="space-y-1.5 sm:col-span-2">
                                        <Label className="text-xs font-semibold">Descrição do Lançamento</Label>
                                        <Input
                                            value={newDesc}
                                            onChange={(e) => setNewDesc(e.target.value)}
                                            placeholder="Ex: Pagamento de taxa de transferência, suprimento de caixa, combustível..."
                                            className="text-xs h-9"
                                            required
                                        />
                                    </div>

                                    <div className="space-y-1.5 sm:col-span-2">
                                        <Label className="text-xs font-semibold">Montante ({currency})</Label>
                                        <Input
                                            value={newAmount}
                                            onChange={(e) => setNewAmount(e.target.value)}
                                            placeholder="Ex: 50000"
                                            className="text-xs h-9 font-bold"
                                            required
                                        />
                                    </div>
                                </div>

                                <div className="flex justify-end pt-2">
                                    <Button type="submit" size="sm" className="gap-2 text-xs font-bold bg-primary hover:bg-primary/90 text-primary-foreground px-5 shadow-sm">
                                        <CheckCircle2 className="h-4 w-4" />
                                        Registar Lançamento no Fluxo
                                    </Button>
                                </div>
                            </form>
                        </TabsContent>

                        {/* 4. Histórico de Dias Anteriores */}
                        <TabsContent value="history" className="mt-4 space-y-3">
                            <div className="border rounded-xl overflow-hidden shadow-xs bg-card">
                                <Table>
                                    <TableHeader className="bg-muted/70">
                                        <TableRow>
                                            <TableHead className="font-bold text-xs">Data do Calendário</TableHead>
                                            <TableHead className="font-bold text-xs text-right">Saídas</TableHead>
                                            <TableHead className="font-bold text-xs text-right">Entradas</TableHead>
                                            <TableHead className="font-bold text-xs text-center w-36">Ação</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody className="divide-y">
                                        {recentHistoryDates.map((d) => {
                                            const isCurrent = d === selectedDate;
                                            return (
                                                <TableRow key={d} className={`hover:bg-muted/30 transition-colors ${isCurrent ? 'bg-primary/5 font-bold' : ''}`}>
                                                    <td className="p-3 font-mono text-xs flex items-center gap-2">
                                                        <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                                                        {d}
                                                        {d === todayStr && (
                                                            <Badge variant="outline" className="text-[9px] bg-emerald-500/10 text-emerald-600 border-emerald-200">
                                                                Hoje
                                                            </Badge>
                                                        )}
                                                    </td>
                                                    <td className="p-3 text-right text-xs text-rose-600 dark:text-rose-400 font-semibold">
                                                        {d === selectedDate ? formatCurrency(totalOut, currency) : '-'}
                                                    </td>
                                                    <td className="p-3 text-right text-xs text-emerald-600 dark:text-emerald-400 font-semibold">
                                                        {d === selectedDate ? formatCurrency(totalIn, currency) : '-'}
                                                    </td>
                                                    <td className="p-3 text-center">
                                                        <Button
                                                            size="sm"
                                                            variant={isCurrent ? "default" : "outline"}
                                                            onClick={() => setSelectedDate(d)}
                                                            className="h-7 text-[11px] px-3 font-semibold"
                                                        >
                                                            {isCurrent ? "Selecionado" : "Carregar Dia"}
                                                        </Button>
                                                    </td>
                                                </TableRow>
                                            );
                                        })}
                                    </TableBody>
                                </Table>
                            </div>
                        </TabsContent>
                    </Tabs>
                </div>
            </DialogContent>
        </Dialog>
    );
}
