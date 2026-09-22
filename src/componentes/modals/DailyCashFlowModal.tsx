import { useState, useMemo, useEffect } from 'react';
import { useData } from '@/contextos/ContextoDados';
import { useAuth } from '@/contextos/ContextoAutenticacao';
import { formatCurrency, formatDate, formatDateTime } from '@/bibliotecas/formatters';
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
    ArrowDownUp,
    ArrowUpRight,
    ArrowDownLeft,
    Download,
    Calendar,
    Plus,
    Clock,
    Trash2,
    CheckCircle2,
    Building2,
    Wallet
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

export function DailyCashFlowModal({
    open,
    onOpenChange,
    initialDate
}: DailyCashFlowModalProps) {
    const { credits, payments, companySettings } = useData();
    const { user } = useAuth();
    const { toast } = useToast();

    // Data selecionada no calendário (por defeito hoje: YYYY-MM-DD)
    const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);
    const [selectedDate, setSelectedDate] = useState<string>(initialDate || todayStr);

    useEffect(() => {
        if (initialDate) setSelectedDate(initialDate);
    }, [initialDate]);

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

    // 1. Saídas do Dia Selecionado
    const dailyOutflows = useMemo(() => {
        const list: Array<{
            id: string;
            time?: string;
            clientName: string;
            creditId: string;
            amount: number;
            method?: string;
            isManual?: boolean;
        }> = [];

        // Créditos concedidos nesta data
        (credits || []).forEach(credit => {
            if (credit.deletedAt) return false;
            const rawDate = credit.startDate || credit.createdAt;
            const dateStr = rawDate ? (rawDate instanceof Date ? rawDate.toISOString() : String(rawDate)).split('T')[0] : '';
            if (dateStr === selectedDate) {
                const timeStr = credit.createdAt ? new Date(credit.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : undefined;
                list.push({
                    id: credit.id,
                    time: timeStr,
                    clientName: credit.clientName || 'Cliente',
                    creditId: credit.id,
                    amount: credit.principalAmount || 0,
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

    // 2. Entradas do Dia Selecionado
    const dailyInflows = useMemo(() => {
        const list: Array<{
            id: string;
            time?: string;
            clientName: string;
            receiptId: string;
            amount: number;
            method?: string;
            isManual?: boolean;
        }> = [];

        // Pagamentos recebidos nesta data
        (payments || []).forEach(payment => {
            if (payment.status === 'cancelled' || payment.deletedAt) return false;
            const dateStr = (payment.paymentDate instanceof Date
                ? payment.paymentDate.toISOString()
                : String(payment.paymentDate || '')).split('T')[0];

            if (dateStr === selectedDate) {
                const timeStr = payment.paymentDate
                    ? new Date(payment.paymentDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                    : undefined;

                const methodLabel = payment.method === 'cash' ? 'Numerário' :
                    payment.method === 'transfer' ? 'Transferência' :
                    payment.method === 'reference' ? 'Multicaixa' :
                    payment.method === 'deposit' ? 'Depósito' :
                    payment.method || 'Numerário';

                list.push({
                    id: payment.id,
                    time: timeStr,
                    clientName: payment.clientName || 'Cliente',
                    receiptId: `#${payment.id}`,
                    amount: payment.amount || 0,
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
                amount: m.amount,
                method: m.method,
                isManual: true
            });
        });

        return list;
    }, [payments, selectedDate, manualEntries]);

    // Totais do dia selecionado
    const totalOut = useMemo(() => dailyOutflows.reduce((sum, item) => sum + item.amount, 0), [dailyOutflows]);
    const totalIn = useMemo(() => dailyInflows.reduce((sum, item) => sum + item.amount, 0), [dailyInflows]);
    const netFlow = totalIn - totalOut;

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
            const d = rawDate ? (rawDate instanceof Date ? rawDate.toISOString() : String(rawDate)).split('T')[0] : '';
            if (d) datesSet.add(d);
        });

        (payments || []).forEach(p => {
            const d = (p.paymentDate instanceof Date ? p.paymentDate.toISOString() : String(p.paymentDate || '')).split('T')[0];
            if (d) datesSet.add(d);
        });

        manualEntries.forEach(m => {
            if (m.date) datesSet.add(m.date);
        });

        return Array.from(datesSet).sort().reverse().slice(0, 15);
    }, [credits, payments, manualEntries, todayStr]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-4xl max-h-[92vh] flex flex-col p-0 overflow-hidden border-none shadow-2xl rounded-2xl bg-background">
                {/* Cabeçalho */}
                <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-6 text-white shrink-0">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                        <div className="flex items-center gap-4">
                            <div className="h-12 w-12 rounded-xl bg-white/10 text-white border border-white/20 flex items-center justify-center shrink-0">
                                <ArrowDownUp className="h-6 w-6" />
                            </div>
                            <div>
                                <DialogTitle className="text-xl font-black text-white tracking-tight">
                                    Operações do Dia: Saídas vs Entradas
                                </DialogTitle>
                                <DialogDescription className="text-indigo-200 text-xs mt-0.5">
                                    Auditoria e conciliação do fluxo diário de tesouraria
                                </DialogDescription>
                            </div>
                        </div>

                        {/* Seletor de Data e Botão PDF */}
                        <div className="flex items-center gap-2">
                            <div className="flex items-center gap-1.5 bg-white/10 px-3 py-1.5 rounded-lg border border-white/20 text-xs">
                                <Calendar className="h-3.5 w-3.5 text-indigo-300" />
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
                                className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs"
                            >
                                <Download className="h-3.5 w-3.5" />
                                Baixar PDF
                            </Button>
                        </div>
                    </div>
                </div>

                <div className="p-6 overflow-y-auto space-y-5 flex-1">
                    {/* Cards de Resumo do Dia Selecionado */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        {/* 1. Saídas do Dia */}
                        <div className="p-4 rounded-xl border bg-card shadow-2xs space-y-1 border-l-4 border-l-rose-500">
                            <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                <span className="flex items-center gap-1.5">
                                    <ArrowUpRight className="h-4 w-4 text-rose-500" />
                                    Saídas de Hoje
                                </span>
                                <Badge variant="outline" className="text-[10px] text-rose-600 border-rose-200">
                                    {dailyOutflows.length} operações
                                </Badge>
                            </div>
                            <p className="text-2xl font-black text-rose-600 dark:text-rose-400">
                                {formatCurrency(totalOut, companySettings.currency)}
                            </p>
                            <p className="text-[11px] text-muted-foreground">Créditos desembolsados + saídas</p>
                        </div>

                        {/* 2. Entradas do Dia */}
                        <div className="p-4 rounded-xl border bg-card shadow-2xs space-y-1 border-l-4 border-l-emerald-500">
                            <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                <span className="flex items-center gap-1.5">
                                    <ArrowDownLeft className="h-4 w-4 text-emerald-500" />
                                    Entradas de Hoje
                                </span>
                                <Badge variant="outline" className="text-[10px] text-emerald-600 border-emerald-200">
                                    {dailyInflows.length} pagamentos
                                </Badge>
                            </div>
                            <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
                                {formatCurrency(totalIn, companySettings.currency)}
                            </p>
                            <p className="text-[11px] text-muted-foreground">Amortizações + recebimentos</p>
                        </div>

                        {/* 3. Saldo Líquido */}
                        <div className={`p-4 rounded-xl border bg-card shadow-2xs space-y-1 border-l-4 ${netFlow >= 0 ? 'border-l-teal-500' : 'border-l-amber-500'}`}>
                            <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                <span className="flex items-center gap-1.5">
                                    <Wallet className="h-4 w-4 text-primary" />
                                    Balanço Líquido
                                </span>
                                <Badge variant={netFlow >= 0 ? "success" : "destructive"} className="text-[10px]">
                                    {netFlow >= 0 ? 'Superávit' : 'Déficit'}
                                </Badge>
                            </div>
                            <p className={`text-2xl font-black ${netFlow >= 0 ? 'text-teal-600 dark:text-teal-400' : 'text-amber-600 dark:text-amber-400'}`}>
                                {formatCurrency(netFlow, companySettings.currency)}
                            </p>
                            <p className="text-[11px] text-muted-foreground">Entradas menos saídas do dia</p>
                        </div>
                    </div>

                    {/* Abas com Saídas, Entradas, Registar Avulso e Histórico */}
                    <Tabs defaultValue="outflows" className="w-full">
                        <TabsList className="grid w-full grid-cols-4">
                            <TabsTrigger value="outflows" className="gap-1.5 text-xs">
                                <ArrowUpRight className="h-3.5 w-3.5 text-rose-500" />
                                Saídas ({dailyOutflows.length})
                            </TabsTrigger>
                            <TabsTrigger value="inflows" className="gap-1.5 text-xs">
                                <ArrowDownLeft className="h-3.5 w-3.5 text-emerald-500" />
                                Entradas ({dailyInflows.length})
                            </TabsTrigger>
                            <TabsTrigger value="manual" className="gap-1.5 text-xs">
                                <Plus className="h-3.5 w-3.5 text-primary" />
                                Registar Movimento
                            </TabsTrigger>
                            <TabsTrigger value="history" className="gap-1.5 text-xs">
                                <Calendar className="h-3.5 w-3.5 text-indigo-500" />
                                Histórico de Dias
                            </TabsTrigger>
                        </TabsList>

                        {/* 1. Aba Saídas */}
                        <TabsContent value="outflows" className="mt-4 space-y-3">
                            {dailyOutflows.length === 0 ? (
                                <div className="text-center py-8 border-2 border-dashed rounded-xl bg-muted/10">
                                    <ArrowUpRight className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
                                    <p className="text-sm font-semibold text-muted-foreground">Nenhuma saída registada nesta data</p>
                                    <p className="text-xs text-muted-foreground/80 mt-0.5">
                                        Nenhum crédito foi desembolsado no dia {selectedDate}.
                                    </p>
                                </div>
                            ) : (
                                <div className="border rounded-xl overflow-hidden shadow-2xs">
                                    <table className="w-full text-xs">
                                        <thead className="bg-muted/60 text-muted-foreground font-semibold">
                                            <tr>
                                                <th className="p-3 text-left">Hora</th>
                                                <th className="p-3 text-left">Beneficiário / Descrição</th>
                                                <th className="p-3 text-left">Ref. Crédito</th>
                                                <th className="p-3 text-left">Canal</th>
                                                <th className="p-3 text-right">Valor Saído</th>
                                                <th className="p-3 text-center w-12"></th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y">
                                            {dailyOutflows.map((outflow) => (
                                                <tr key={outflow.id} className="hover:bg-muted/20 transition-colors">
                                                    <td className="p-3 font-mono text-muted-foreground">{outflow.time || '-'}</td>
                                                    <td className="p-3 font-semibold text-foreground">{outflow.clientName}</td>
                                                    <td className="p-3 font-mono text-primary text-[11px]">{outflow.creditId}</td>
                                                    <td className="p-3 text-muted-foreground">{outflow.method}</td>
                                                    <td className="p-3 text-right font-black text-rose-600 dark:text-rose-400">
                                                        {formatCurrency(outflow.amount, companySettings.currency)}
                                                    </td>
                                                    <td className="p-3 text-center">
                                                        {outflow.isManual && (
                                                            <Button
                                                                size="icon"
                                                                variant="ghost"
                                                                onClick={() => handleDeleteManual(outflow.id)}
                                                                className="h-6 w-6 text-muted-foreground hover:text-destructive"
                                                            >
                                                                <Trash2 className="h-3 w-3" />
                                                            </Button>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </TabsContent>

                        {/* 2. Aba Entradas */}
                        <TabsContent value="inflows" className="mt-4 space-y-3">
                            {dailyInflows.length === 0 ? (
                                <div className="text-center py-8 border-2 border-dashed rounded-xl bg-muted/10">
                                    <ArrowDownLeft className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
                                    <p className="text-sm font-semibold text-muted-foreground">Nenhuma entrada registada nesta data</p>
                                    <p className="text-xs text-muted-foreground/80 mt-0.5">
                                        Nenhum pagamento foi recebido no dia {selectedDate}.
                                    </p>
                                </div>
                            ) : (
                                <div className="border rounded-xl overflow-hidden shadow-2xs">
                                    <table className="w-full text-xs">
                                        <thead className="bg-muted/60 text-muted-foreground font-semibold">
                                            <tr>
                                                <th className="p-3 text-left">Hora</th>
                                                <th className="p-3 text-left">Cliente Pagador</th>
                                                <th className="p-3 text-left">Recibo</th>
                                                <th className="p-3 text-left">Método</th>
                                                <th className="p-3 text-right">Valor Recebido</th>
                                                <th className="p-3 text-center w-12"></th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y">
                                            {dailyInflows.map((inflow) => (
                                                <tr key={inflow.id} className="hover:bg-muted/20 transition-colors">
                                                    <td className="p-3 font-mono text-muted-foreground">{inflow.time || '-'}</td>
                                                    <td className="p-3 font-semibold text-foreground">{inflow.clientName}</td>
                                                    <td className="p-3 font-mono text-[11px] text-muted-foreground">{inflow.receiptId}</td>
                                                    <td className="p-3">
                                                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-muted text-foreground border">
                                                            {inflow.method}
                                                        </span>
                                                    </td>
                                                    <td className="p-3 text-right font-black text-emerald-600 dark:text-emerald-400">
                                                        {formatCurrency(inflow.amount, companySettings.currency)}
                                                    </td>
                                                    <td className="p-3 text-center">
                                                        {inflow.isManual && (
                                                            <Button
                                                                size="icon"
                                                                variant="ghost"
                                                                onClick={() => handleDeleteManual(inflow.id)}
                                                                className="h-6 w-6 text-muted-foreground hover:text-destructive"
                                                            >
                                                                <Trash2 className="h-3 w-3" />
                                                            </Button>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </TabsContent>

                        {/* 3. Registar Movimento Avulso do Dia */}
                        <TabsContent value="manual" className="mt-4">
                            <form onSubmit={handleAddManual} className="p-5 rounded-xl border bg-muted/20 space-y-4">
                                <div className="space-y-1">
                                    <h4 className="text-sm font-bold flex items-center gap-2">
                                        <Plus className="h-4 w-4 text-primary" />
                                        Lançamento Avulso do Dia ({selectedDate})
                                    </h4>
                                    <p className="text-xs text-muted-foreground">
                                        Registe saídas ou entradas operacionais extraordinárias (ex: taxa bancária, despesa urgente, estorno).
                                    </p>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className="space-y-1.5">
                                        <Label className="text-xs">Tipo de Movimento</Label>
                                        <div className="grid grid-cols-2 gap-2">
                                            <button
                                                type="button"
                                                onClick={() => setNewType('out')}
                                                className={`py-2 px-3 rounded-lg border text-xs font-bold transition-all ${newType === 'out' ? 'bg-rose-600 text-white border-rose-600' : 'bg-background text-foreground'}`}
                                            >
                                                Saída de Caixa
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setNewType('in')}
                                                className={`py-2 px-3 rounded-lg border text-xs font-bold transition-all ${newType === 'in' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-background text-foreground'}`}
                                            >
                                                Entrada de Caixa
                                            </button>
                                        </div>
                                    </div>

                                    <div className="space-y-1.5">
                                        <Label className="text-xs">Forma / Canal</Label>
                                        <Input
                                            value={newMethod}
                                            onChange={(e) => setNewMethod(e.target.value)}
                                            placeholder="Ex: Numerário, BAI, Transferência..."
                                            className="text-xs h-9"
                                        />
                                    </div>

                                    <div className="space-y-1.5 sm:col-span-2">
                                        <Label className="text-xs">Descrição do Lançamento</Label>
                                        <Input
                                            value={newDesc}
                                            onChange={(e) => setNewDesc(e.target.value)}
                                            placeholder="Ex: Pagamento de taxa de transferência, suprimento de caixa..."
                                            className="text-xs h-9"
                                            required
                                        />
                                    </div>

                                    <div className="space-y-1.5 sm:col-span-2">
                                        <Label className="text-xs">Montante ({companySettings.currency})</Label>
                                        <Input
                                            value={newAmount}
                                            onChange={(e) => setNewAmount(e.target.value)}
                                            placeholder="Ex: 25000"
                                            className="text-xs h-9 font-bold"
                                            required
                                        />
                                    </div>
                                </div>

                                <div className="flex justify-end pt-2">
                                    <Button type="submit" size="sm" className="gap-2 text-xs font-bold bg-primary">
                                        <CheckCircle2 className="h-4 w-4" />
                                        Registar Lançamento
                                    </Button>
                                </div>
                            </form>
                        </TabsContent>

                        {/* 4. Histórico de Dias Anteriores */}
                        <TabsContent value="history" className="mt-4 space-y-3">
                            <div className="border rounded-xl overflow-hidden shadow-2xs">
                                <table className="w-full text-xs">
                                    <thead className="bg-muted/60 text-muted-foreground font-semibold">
                                        <tr>
                                            <th className="p-3 text-left">Data do Calendário</th>
                                            <th className="p-3 text-right">Saídas</th>
                                            <th className="p-3 text-right">Entradas</th>
                                            <th className="p-3 text-center">Ação</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                        {recentHistoryDates.map((d) => {
                                            const isCurrent = d === selectedDate;
                                            return (
                                                <tr key={d} className={`hover:bg-muted/20 transition-colors ${isCurrent ? 'bg-primary/5 font-bold' : ''}`}>
                                                    <td className="p-3 font-mono flex items-center gap-2">
                                                        <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                                                        {d}
                                                        {d === todayStr && (
                                                            <Badge variant="outline" className="text-[9px] bg-emerald-500/10 text-emerald-600 border-emerald-200">
                                                                Hoje
                                                            </Badge>
                                                        )}
                                                    </td>
                                                    <td className="p-3 text-right text-rose-600 dark:text-rose-400 font-semibold">
                                                        {d === selectedDate ? formatCurrency(totalOut, companySettings.currency) : '-'}
                                                    </td>
                                                    <td className="p-3 text-right text-emerald-600 dark:text-emerald-400 font-semibold">
                                                        {d === selectedDate ? formatCurrency(totalIn, companySettings.currency) : '-'}
                                                    </td>
                                                    <td className="p-3 text-center">
                                                        <Button
                                                            size="sm"
                                                            variant={isCurrent ? "default" : "outline"}
                                                            onClick={() => setSelectedDate(d)}
                                                            className="h-7 text-[11px] px-3"
                                                        >
                                                            {isCurrent ? "A Selecionado" : "Carregar Dia"}
                                                        </Button>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </TabsContent>
                    </Tabs>
                </div>
            </DialogContent>
        </Dialog>
    );
}
