import { useState, useMemo, useEffect } from 'react';
import { MainLayout } from '@/componentes/layout/MainLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/componentes/ui/card';
import { Input } from '@/componentes/ui/input';
import { Label } from '@/componentes/ui/label';
import { Button } from '@/componentes/ui/button';
import { Slider } from '@/componentes/ui/slider';
import { Badge } from '@/componentes/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/componentes/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/componentes/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/componentes/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/componentes/ui/table';
import { Calculator, TrendingUp, AlertTriangle, Download, DollarSign, Calendar, Percent, History, Brain, Trash2, CheckCircle2, XCircle, Info, Save, Search, FileSpreadsheet, Filter } from 'lucide-react';
import { AlertModal } from '@/componentes/ui/AlertModal';
import { formatCurrency } from '@/bibliotecas/formatters';
import { useData } from '@/contextos/ContextoDados';
import { useAuth } from '@/contextos/ContextoAutenticacao';
import { generateSimulationPDF } from '@/bibliotecas/pdf';
import { cn } from '@/bibliotecas/utils';
import { CurrencyInput } from '@/componentes/ui/CurrencyInput';
import { useToast } from '@/ganchos/usar-toast';
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
    AreaChart,
    Area
} from 'recharts';

interface AmortizationRow {
    month: number;
    payment: number;
    interest: number;
    amortization: number;
    balance: number;
}

export function SimuladorCredito() {
    const { companySettings, clients, simulations, addSimulation, deleteSimulation } = useData();
    const { user } = useAuth();
    const { toast } = useToast();

    // --- State ---
    const [amount, setAmount] = useState<number>(0);
    const [term, setTerm] = useState<number>(0);
    const [clientName, setClientName] = useState<string>('');
    const [clientIncome, setClientIncome] = useState<number>(0);
    // Use defaults from settings or fallback
    const [interestRate, setInterestRate] = useState<number>(companySettings?.defaultSimulationInterestRate || 3.5);
    const [method, setMethod] = useState<'price' | 'sac'>('price');
    const [riskProfile, setRiskProfile] = useState<'low' | 'medium' | 'high'>('medium');

    // Additional Costs
    const [adminFee, setAdminFee] = useState<number>(companySettings?.defaultSimulationAdminFee || 2.0);
    const [iofRate, setIofRate] = useState<number>(companySettings?.defaultSimulationIof || 0.38);

    // --- History State ---
    const history = useMemo(() => simulations || [], [simulations]);
    const [historySearch, setHistorySearch] = useState('');
    const [minAmount, setMinAmount] = useState<number>(0);
    const [maxAmount, setMaxAmount] = useState<number>(0);
    const [selectedClientFilter, setSelectedClientFilter] = useState<string>('');

    const filteredHistory = useMemo(() => {
        let filtered = history;

        // Text search
        if (historySearch) {
            const search = historySearch.toLowerCase();
            filtered = filtered.filter(h =>
                (h.clientName && h.clientName.toLowerCase().includes(search)) ||
                (h.reference && h.reference.toLowerCase().includes(search))
            );
        }

        // Amount range filter
        if (minAmount > 0) {
            filtered = filtered.filter(h => h.amount >= minAmount);
        }
        if (maxAmount > 0) {
            filtered = filtered.filter(h => h.amount <= maxAmount);
        }

        // Client filter
        if (selectedClientFilter) {
            filtered = filtered.filter(h => h.clientName === selectedClientFilter);
        }

        return filtered;
    }, [history, historySearch, minAmount, maxAmount, selectedClientFilter]);

    // --- Modal States ---
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
    const [loadConfirmOpen, setLoadConfirmOpen] = useState(false);
    const [detailsModalOpen, setDetailsModalOpen] = useState(false);
    const [selectedHistoryEntry, setSelectedHistoryEntry] = useState<any>(null);
    const [saveSuccessOpen, setSaveSuccessOpen] = useState(false);

    useEffect(() => {
        // Histórico agora vem do useData() via refreshData() inicial
    }, []);

    const saveToHistory = async () => {
        // Generate a unique reference: SIM-YYYY-XXXX (last 4 of timestamp)
        const year = new Date().getFullYear();
        const random = Math.floor(Math.random() * 9000) + 1000;
        const reference = `SIM-${year}-${random}`;

        const newEntry = {
            id: crypto.randomUUID(),
            reference,
            date: new Date().toISOString(),
            clientName: clientName.trim() || 'Simulação Sem Nome',
            clientIncome,
            amount,
            term,
            interestRate,
            method,
            riskProfile,
            totalPayment: simulation.totalPayment,
            monthlyPayment: simulation.rows[0]?.payment || 0,
            aiAnalysis: JSON.stringify(aiResult),
            createdAt: new Date().toISOString()
        };

        await addSimulation(newEntry as any);

        // Show success modal and close after 2s
        setSaveSuccessOpen(true);
        setTimeout(() => setSaveSuccessOpen(false), 2000);
    };

    const deleteFromHistory = async (id: string) => {
        await deleteSimulation(id);
    };

    const loadFromHistory = (entry: any) => {
        setClientName(entry.clientName === 'Simulação Sem Nome' ? '' : entry.clientName);
        setClientIncome(entry.clientIncome);
        setAmount(entry.amount);
        setTerm(entry.term);
        setInterestRate(entry.interestRate);
        setMethod(entry.method);
        setRiskProfile(entry.riskProfile);
        // If it was loaded, entry already has aiAnalysis as object or string
    };

    // --- Confirmation Handlers ---
    const handleLoadFromHistory = (entry: any) => {
        setSelectedHistoryEntry(entry);
        setLoadConfirmOpen(true);
    };

    const confirmLoadFromHistory = () => {
        if (selectedHistoryEntry) {
            loadFromHistory(selectedHistoryEntry);
            setLoadConfirmOpen(false);
            // Open details modal after loading
            setDetailsModalOpen(true);
            // Keep selectedHistoryEntry for details modal
        }
    };

    const handleDeleteFromHistory = (entry: any) => {
        setSelectedHistoryEntry(entry);
        setDeleteConfirmOpen(true);
    };

    const confirmDeleteFromHistory = () => {
        if (selectedHistoryEntry) {
            deleteFromHistory(selectedHistoryEntry.id);
            setDeleteConfirmOpen(false);
            setSelectedHistoryEntry(null);
        }
    };

    // --- Risk Adjustment Effect ---
    useEffect(() => {
        // Only override if user hasn't started manually typing custom rates (simplified logic: check if it matches default/profile)
        // For now, let's keep it responsive to buttons for better UX
        const baseRate = companySettings?.defaultSimulationInterestRate || 3.5;

        switch (riskProfile) {
            case 'low':
                setInterestRate(baseRate - 1.0 > 0 ? baseRate - 1.0 : 1.0); // Simple heuristic
                break;
            case 'medium':
                setInterestRate(baseRate);
                break;
            case 'high':
                setInterestRate(baseRate + 1.5);
                break;
        }
    }, [riskProfile, companySettings?.defaultSimulationInterestRate]);

    // --- Calculations ---
    const simulation = useMemo(() => {
        const rows: AmortizationRow[] = [];
        let balance = amount;
        let totalInterest = 0;
        let totalPayment = 0;

        const i = interestRate / 100;
        const n = term;

        // Calculate upfront costs
        const adminFeeValue = amount * (adminFee / 100);
        const iofValue = amount * (iofRate / 100);
        const totalUpfrontCosts = adminFeeValue + iofValue;

        if (n <= 0 || amount <= 0) {
            return {
                rows: [],
                totalInterest: 0,
                totalPayment: 0,
                totalUpfrontCosts: 0,
                totalCost: 0,
                cetTotal: 0
            };
        }

        let monthlyPayment = 0;

        if (method === 'price') {
            // formula: PMT = PV * (i * (1+i)^n) / ((1+i)^n - 1)
            monthlyPayment = amount * (i * Math.pow(1 + i, n)) / (Math.pow(1 + i, n) - 1);
        }

        // Amortization Schedule
        for (let m = 1; m <= n; m++) {
            let interest = balance * i;
            let amortization = 0;
            let payment = 0;

            if (method === 'price') {
                payment = monthlyPayment;
                amortization = payment - interest;
            } else {
                // SAC: Constant Amortization
                amortization = amount / n;
                payment = amortization + interest;
            }

            balance -= amortization;
            if (balance < 0.01) balance = 0; // Floating point fix

            totalInterest += interest;
            totalPayment += payment;

            rows.push({
                month: m,
                payment,
                interest,
                amortization,
                balance
            });
        }

        const totalCost = totalPayment + totalUpfrontCosts;
        const cetTotal = ((totalCost / amount) - 1) * 100;

        return {
            rows,
            totalInterest,
            totalPayment,
            totalUpfrontCosts,
            totalCost,
            cetTotal
        };
    }, [amount, term, interestRate, method, adminFee, iofRate]);

    // --- AI Risk Analysis (Tango Expert v3) ---
    const aiResult = useMemo(() => {
        if (!clientIncome || clientIncome <= 0) return null;

        const firstPayment = simulation.rows[0]?.payment || 0;
        if (firstPayment <= 0) return null;

        const dti = (firstPayment / clientIncome) * 100; // Debt-to-Income ratio
        const totalInterestRatio = (simulation.totalInterest / amount) * 100;

        let status: 'safe' | 'warning' | 'danger' = 'safe';
        let message = '';
        let detailedAdvice = '';
        let suggestion = null;

        if (dti <= 30) {
            status = 'safe';
            message = `Análise Positiva: O rácio de endividamento (DTI) é de ${dti.toFixed(1)}%. Este valor está abaixo do limite prudencial de 30%, o que indica uma capacidade de pagamento confortável.`;
            detailedAdvice = "Com base neste perfil, o crédito é considerado de baixo risco. Sugerimos manter uma reserva de emergência equivalente a 6 meses de despesas para maior segurança contra imprevistos económicos.";
        } else if (dti <= 45) {
            status = 'warning';
            message = `Atenção Necessária: O seu DTI de ${dti.toFixed(1)}% entra na zona de alerta. Acima de 30%, a sua liquidez mensal para alimentação e saúde pode ser afectada por oscilações na economia ou inflação.`;
            detailedAdvice = "Recomendamos que verifique se possui outras dívidas ativas. Para maior saúde financeira, idealmente o montante da prestação não deveria exceder 30% da sua renda líquida.";
            const targetPayment = clientIncome * 0.30;
            const suggestedAmount = (amount * targetPayment) / firstPayment;
            suggestion = Math.floor(suggestedAmount / 1000) * 1000;
        } else {
            status = 'danger';
            message = `Risco Financeiro Elevado: A prestação compromete ${dti.toFixed(1)}% do seu rendimento líquido. Segundo os padrões bancários e de saúde financeira, isto coloca o cliente em alto risco de incumprimento.`;
            detailedAdvice = `O custo total dos juros representa ${totalInterestRatio.toFixed(1)}% do capital solicitado. Com este nível de endividamento, qualquer imprevisto pode levar ao default. Recomendamos vivamente a redução do montante ou o aumento do prazo (se possível).`;
            const targetPayment = clientIncome * 0.30;
            const suggestedAmount = (amount * targetPayment) / firstPayment;
            suggestion = Math.floor(suggestedAmount / 1000) * 1000;
        }

        return { dti, status, message, detailedAdvice, suggestion };
    }, [clientIncome, simulation.rows, amount, simulation.totalInterest]);

    const handleApplySuggestion = () => {
        if (aiResult?.suggestion) {
            setAmount(aiResult.suggestion);
        }
    };

    const handleExportPDF = () => {
        generateSimulationPDF(
            simulation,
            {
                name: clientName,
                income: clientIncome,
                requestedAmount: amount,
                term: term,
                interestRate: interestRate,
                method: method,
                reference: 'PROPOSTA-INDIVIDUAL'
            },
            companySettings,
            user?.name || 'Consultor',
            aiResult
        );
    };

    const handleDownloadHistoryPDF = (entry: any) => {
        // Reconstruct simulation data from history entry
        const reconstructedSimulation = {
            rows: [],
            totalInterest: 0,
            totalPayment: entry.totalPayment || 0,
            totalUpfrontCosts: 0,
            totalCost: entry.totalPayment || 0,
            cetTotal: 0
        };

        // Reconstruct amortization schedule
        let balance = entry.amount;
        const i = entry.interestRate / 100;
        const n = entry.term;
        let totalInterest = 0;

        if (entry.method === 'price') {
            const monthlyPayment = entry.amount * (i * Math.pow(1 + i, n)) / (Math.pow(1 + i, n) - 1);
            for (let m = 1; m <= n; m++) {
                const interest = balance * i;
                const amortization = monthlyPayment - interest;
                balance -= amortization;
                totalInterest += interest;
                reconstructedSimulation.rows.push({
                    month: m,
                    payment: monthlyPayment,
                    interest,
                    amortization,
                    balance: Math.max(0, balance)
                });
            }
        } else {
            const amortization = entry.amount / n;
            for (let m = 1; m <= n; m++) {
                const interest = balance * i;
                const payment = amortization + interest;
                balance -= amortization;
                totalInterest += interest;
                reconstructedSimulation.rows.push({
                    month: m,
                    payment,
                    interest,
                    amortization,
                    balance: Math.max(0, balance)
                });
            }
        }

        reconstructedSimulation.totalInterest = totalInterest;

        // Parse AI analysis if stored as string
        let aiAnalysis = entry.aiAnalysis;
        if (typeof aiAnalysis === 'string') {
            try {
                aiAnalysis = JSON.parse(aiAnalysis);
            } catch (e) {
                aiAnalysis = null;
            }
        }

        generateSimulationPDF(
            reconstructedSimulation,
            {
                name: entry.clientName,
                income: entry.clientIncome,
                requestedAmount: entry.amount,
                term: entry.term,
                interestRate: entry.interestRate,
                method: entry.method,
                reference: entry.reference || 'HISTÓRICO'
            },
            companySettings,
            user?.name || 'Consultor',
            aiAnalysis
        );
    };

    const handleExportClientHistory = async () => {
        if (!selectedClientFilter) return;

        const clientSimulations = history.filter(h => h.clientName === selectedClientFilter);

        if (clientSimulations.length === 0) {
            toast({
                title: 'Nenhuma simulação encontrada',
                description: `Não há simulações para ${selectedClientFilter}`,
                variant: 'destructive'
            });
            return;
        }

        // Generate Excel report
        const data = clientSimulations.map(s => {
            let aiStatus = 'N/A';
            if (s.aiAnalysis) {
                if (typeof s.aiAnalysis === 'string') {
                    try {
                        const parsed = JSON.parse(s.aiAnalysis) as any;
                        aiStatus = parsed.status || 'N/A';
                    } catch (e) {
                        aiStatus = 'N/A';
                    }
                } else {
                    aiStatus = (s.aiAnalysis as any).status || 'N/A';
                }
            }

            return {
                'Referência': s.reference || 'N/A',
                'Data': new Date(s.date).toLocaleString(),
                'Cliente': s.clientName,
                'Montante': s.amount,
                'Prazo (meses)': s.term,
                'Taxa (%)': s.interestRate,
                'Método': s.method.toUpperCase(),
                'Mensalidade': s.monthlyPayment,
                'Total a Pagar': s.totalPayment,
                'Risco': aiStatus
            };
        });

        const { exportToExcel } = await import('@/bibliotecas/ExcelHelper');
        exportToExcel(
            data,
            `Histórico_Simulações_${selectedClientFilter.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}`
        );
    };

    const handleExportAllHistory = async () => {
        if (filteredHistory.length === 0) {
            toast({
                title: 'Nenhuma simulação para exportar',
                description: 'O histórico está vazio ou os filtros não retornaram resultados.',
                variant: 'destructive'
            });
            return;
        }

        const data = filteredHistory.map(s => {
            let aiStatus = 'N/A';
            let dtiValue = 'N/A';

            if (s.aiAnalysis) {
                if (typeof s.aiAnalysis === 'string') {
                    try {
                        const parsed = JSON.parse(s.aiAnalysis);
                        aiStatus = parsed.status || 'N/A';
                        dtiValue = parsed.dti ? parsed.dti.toFixed(1) : 'N/A';
                    } catch (e) {
                        aiStatus = 'N/A';
                        dtiValue = 'N/A';
                    }
                } else {
                    aiStatus = (s.aiAnalysis as any).status || 'N/A';
                    dtiValue = (s.aiAnalysis as any).dti ? (s.aiAnalysis as any).dti.toFixed(1) : 'N/A';
                }
            }

            return {
                'Referência': s.reference || 'N/A',
                'Data': new Date(s.date).toLocaleString(),
                'Cliente': s.clientName,
                'Rendimento': s.clientIncome || 0,
                'Montante': s.amount,
                'Prazo (meses)': s.term,
                'Taxa (%)': s.interestRate,
                'Método': s.method.toUpperCase(),
                'Mensalidade': s.monthlyPayment,
                'Total a Pagar': s.totalPayment,
                'Risco IA': aiStatus,
                'DTI (%)': dtiValue
            };
        });

        const { exportToExcel } = await import('@/bibliotecas/ExcelHelper');
        exportToExcel(
            data,
            `Relatório_Completo_Simulações_${new Date().toISOString().split('T')[0]}`
        );

        toast({
            title: 'Relatório exportado',
            description: `${filteredHistory.length} simulações exportadas com sucesso.`,
            className: 'bg-emerald-50 border-emerald-200 text-emerald-800'
        });
    };

    return (
        <MainLayout title="Simulador de Crédito" subtitle="Ferramenta de Análise e Cálculo Financeiro">
            <Tabs defaultValue="simulator" className="w-full space-y-6">
                <div className="flex justify-between items-center">
                    <TabsList className="grid w-[480px] grid-cols-3">
                        <TabsTrigger value="simulator" className="data-[state=active]:bg-indigo-600 data-[state=active]:text-white">
                            <Calculator className="h-4 w-4 mr-2" />
                            Simulador
                        </TabsTrigger>
                        <TabsTrigger value="history">
                            <History className="h-4 w-4 mr-2" />
                            Histórico
                        </TabsTrigger>
                        <TabsTrigger value="guide">
                            <Info className="h-4 w-4 mr-2" />
                            Guia
                        </TabsTrigger>
                    </TabsList>
                </div>

                <TabsContent value="simulator">
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                        {/* --- CONTROLS --- */}
                        <div className="lg:col-span-1 space-y-6">
                            <Card className="card-elevated border-none shadow-lg bg-card">
                                <CardHeader className="bg-muted/50 border-b border-border rounded-t-xl pb-4">
                                    <CardTitle className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400">
                                        <Calculator className="h-5 w-5" /> Parâmetros da Simulação
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-6 pt-6">

                                    {/* Client Data (Optional) */}
                                    <div className="space-y-3 p-4 bg-muted/30 rounded-lg border border-border">
                                        <Label className="text-xs font-bold uppercase text-muted-foreground">Dados do Cliente</Label>

                                        <div className="space-y-2">
                                            <Label className="text-xs">Pesquisar Cliente Cadastrado</Label>
                                            <Select onValueChange={(val) => {
                                                const selected = clients.find(c => c.id === val);
                                                if (selected) {
                                                    setClientName(selected.name);
                                                    if (selected.monthlyIncome) {
                                                        setClientIncome(selected.monthlyIncome);
                                                    }
                                                }
                                            }}>
                                                <SelectTrigger className="h-9 bg-background">
                                                    <SelectValue placeholder="Selecione um cliente..." />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <div className="p-2 border-b">
                                                        <Input
                                                            placeholder="Filtrar..."
                                                            className="h-8 text-xs"
                                                            onChange={(e) => {
                                                                // Simple internal filter via CSS or local state if list is huge
                                                            }}
                                                        />
                                                    </div>
                                                    {clients.slice(0, 100).map(c => (
                                                        <SelectItem key={c.id} value={c.id}>
                                                            {c.name} - {c.nif}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>

                                        <div className="space-y-2">
                                            <Label className="text-xs font-bold">Nome Completo <span className="text-red-500">*</span></Label>
                                            <Input
                                                placeholder="Ex: João da Silva"
                                                value={clientName}
                                                onChange={e => setClientName(e.target.value)}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label className="text-xs">Rendimento Mensal</Label>
                                            <CurrencyInput
                                                value={clientIncome}
                                                onValueChange={(val) => setClientIncome(val)}
                                                placeholder="0,00 AOA"
                                            />
                                        </div>
                                    </div>

                                    {/* Amount */}
                                    <div className="space-y-3">
                                        <div className="flex justify-between">
                                            <Label>Valor Solicitado</Label>
                                            <span className="font-bold text-indigo-600">{formatCurrency(amount, companySettings?.currency)}</span>
                                        </div>
                                        <Slider
                                            value={[amount]}
                                            min={0}
                                            max={1000000}
                                            step={1000}
                                            onValueChange={([val]) => setAmount(val)}
                                            className="py-2"
                                        />
                                        <CurrencyInput
                                            value={amount}
                                            onValueChange={(val) => setAmount(val)}
                                            className="font-mono font-bold text-right"
                                        />
                                    </div>

                                    {/* Term */}
                                    <div className="space-y-3">
                                        <div className="flex justify-between">
                                            <Label>Prazo (Meses)</Label>
                                            <span className="font-bold text-indigo-600">{term} meses</span>
                                        </div>
                                        <Slider
                                            value={[term]}
                                            min={0}
                                            max={60}
                                            step={1}
                                            onValueChange={([val]) => setTerm(val)}
                                            className="py-2"
                                        />

                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <Label className="text-xs">Meses</Label>
                                                <Input
                                                    type="number"
                                                    value={term}
                                                    onChange={(e) => setTerm(Number(e.target.value))}
                                                    className="h-9"
                                                    min={0}
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <Label className="text-xs">Anos</Label>
                                                <Input
                                                    type="number"
                                                    value={(term / 12).toFixed(1)}
                                                    onChange={(e) => setTerm(Math.round(Number(e.target.value) * 12))}
                                                    className="h-9"
                                                    min={0}
                                                    step={0.5}
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Risk / Rate */}
                                    <div className="space-y-3 bg-muted/30 p-4 rounded-lg border border-border">
                                        <Label className="text-xs font-bold uppercase text-muted-foreground">Análise de Risco (Score)</Label>
                                        <div className="flex gap-2">
                                            {(['low', 'medium', 'high'] as const).map(r => (
                                                <button
                                                    key={r}
                                                    onClick={() => setRiskProfile(r)}
                                                    className={`flex-1 py-1.5 px-2 rounded text-xs font-bold transition-all border ${riskProfile === r
                                                        ? r === 'low' ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/50 ring-2 ring-emerald-500/20'
                                                            : r === 'medium' ? 'bg-amber-500/10 text-amber-600 border-amber-500/50 ring-2 ring-amber-500/20'
                                                                : 'bg-red-500/10 text-red-600 border-red-500/50 ring-2 ring-red-500/20'
                                                        : 'bg-background text-muted-foreground border-border hover:bg-muted'
                                                        }`}
                                                >
                                                    {r === 'low' ? 'Risco Baixo' : r === 'medium' ? 'Risco Médio' : 'Risco Alto'}
                                                </button>
                                            ))}
                                        </div>

                                        <div className="grid grid-cols-2 gap-3 pt-2">
                                            <div className="space-y-1">
                                                <Label className="text-[10px] h-3.5 flex items-center">Taxa Mensal (%)</Label>
                                                <div className="relative">
                                                    <Input
                                                        type="number"
                                                        value={interestRate}
                                                        onChange={(e) => setInterestRate(Number(e.target.value))}
                                                        className="h-8 text-right pr-6 bg-background"
                                                        step={0.1}
                                                    />
                                                    <Percent className="absolute right-2 top-2 h-3 w-3 text-muted-foreground" />
                                                </div>
                                            </div>
                                            <div className="space-y-1">
                                                <div className="flex items-center gap-1 h-3.5">
                                                    <Label className="text-[10px]">Taxa Admin / IOF (%)</Label>
                                                    <Info className="h-2.5 w-2.5 text-muted-foreground cursor-help" />
                                                </div>
                                                <div className="relative">
                                                    <Input
                                                        type="number"
                                                        value={adminFee + iofRate}
                                                        onChange={(e) => {
                                                            const total = Number(e.target.value);
                                                            // Split back into fees (simple 80/20 split or just adjust admin)
                                                            setAdminFee(total - iofRate);
                                                        }}
                                                        className="h-8 text-right pr-6 bg-emerald-500/5 border-emerald-500/20 text-emerald-600 font-bold opacity-100"
                                                        step={0.01}
                                                    />
                                                    <Percent className="absolute right-2 top-2 h-3 w-3 text-emerald-600/70" />
                                                </div>
                                            </div>
                                        </div>
                                        <p className="text-[9px] text-muted-foreground italic leading-tight mt-1">
                                            * Taxas fixas configuradas em: <span className="font-bold text-indigo-600">Definições &gt; Dados da Empresa</span>.
                                        </p>
                                    </div>

                                    {/* Method */}
                                    <div className="space-y-2">
                                        <Label>Sistema de Amortização</Label>
                                        <Tabs value={method} onValueChange={(v) => setMethod(v as 'price' | 'sac')} className="w-full">
                                            <TabsList className="w-full grid grid-cols-2">
                                                <TabsTrigger value="price">PRICE (Fixas)</TabsTrigger>
                                                <TabsTrigger value="sac">SAC (Decresc.)</TabsTrigger>
                                            </TabsList>
                                        </Tabs>
                                    </div>

                                    <Button
                                        className="w-full bg-indigo-600 hover:bg-indigo-700"
                                        onClick={saveToHistory}
                                        disabled={!clientName.trim()}
                                    >
                                        <Save className="h-4 w-4 mr-2" />
                                        Guardar no Histórico
                                    </Button>

                                </CardContent>
                            </Card>
                        </div>

                        {/* --- RESULTS --- */}
                        <div className="lg:col-span-2 space-y-6">

                            {/* Summary Cards */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                <div className="card-kpi-sky">
                                    <div className="flex items-center gap-2.5 min-w-0">
                                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/10 dark:bg-white/10 text-slate-950 dark:text-white shrink-0">
                                            <DollarSign className="h-5 w-5" />
                                        </div>
                                        <p className="text-[11px] font-bold text-slate-900/70 dark:text-slate-400 uppercase tracking-wider truncate">
                                            Primeira Parcela
                                        </p>
                                    </div>
                                    <div className="my-2">
                                        <p className="font-display text-2xl sm:text-3xl font-black tracking-tight text-slate-950 dark:text-white truncate">
                                            {formatCurrency(simulation.rows[0]?.payment || 0, companySettings?.currency)}
                                        </p>
                                    </div>
                                    <p className="text-xs font-semibold text-slate-900/75 dark:text-slate-400 truncate">
                                        {method === 'price' ? 'Parcelas Fixas' : 'Parcelas Decrescentes'}
                                    </p>
                                </div>
                                <div className="card-kpi-amber">
                                    <div className="flex items-center gap-2.5 min-w-0">
                                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/10 dark:bg-white/10 text-slate-950 dark:text-white shrink-0">
                                            <AlertTriangle className="h-5 w-5" />
                                        </div>
                                        <p className="text-[11px] font-bold text-slate-900/70 dark:text-slate-400 uppercase tracking-wider truncate">
                                            Total a Pagar
                                        </p>
                                    </div>
                                    <div className="my-2">
                                        <p className="font-display text-2xl sm:text-3xl font-black tracking-tight text-slate-950 dark:text-white truncate">
                                            {formatCurrency(simulation.totalPayment, companySettings?.currency)}
                                        </p>
                                    </div>
                                    <p className="text-xs font-semibold text-slate-900/75 dark:text-slate-400 truncate">
                                        {formatCurrency(simulation.totalInterest, companySettings?.currency)} de Juros
                                    </p>
                                </div>
                                <div className={cn(
                                    !aiResult ? "card-kpi-purple" :
                                        aiResult.status === 'safe' ? "card-kpi-mint" :
                                            aiResult.status === 'warning' ? "card-kpi-amber" : "card-kpi-coral"
                                )}>
                                    <div className="flex items-center gap-2.5 min-w-0">
                                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/10 dark:bg-white/10 text-slate-950 dark:text-white shrink-0">
                                            <Percent className="h-5 w-5" />
                                        </div>
                                        <p className="text-[11px] font-bold text-slate-900/70 dark:text-slate-400 uppercase tracking-wider truncate">
                                            Comprometimento de Renda
                                        </p>
                                    </div>
                                    <div className="my-2">
                                        <p className="font-display text-2xl sm:text-3xl font-black tracking-tight text-slate-950 dark:text-white truncate">
                                            {aiResult ? `${aiResult.dti.toFixed(1)}%` : "---"}
                                        </p>
                                    </div>
                                    <p className="text-xs font-semibold text-slate-900/75 dark:text-slate-400 truncate">
                                        {aiResult ? "Percentual do rendimento" : "Insira o rendimento para analisar"}
                                    </p>
                                </div>
                            </div>

                            {/* Tango AI Analysis Section */}
                            {aiResult && (
                                <Card className={cn(
                                    "border shadow-md",
                                    aiResult.status === 'safe' ? "bg-emerald-500/10 border-emerald-500/20 dark:bg-emerald-950/30 dark:border-emerald-800/40" :
                                        aiResult.status === 'warning' ? "bg-amber-500/10 border-amber-500/20 dark:bg-amber-950/30 dark:border-amber-800/40" : "bg-red-500/10 border-red-500/20 dark:bg-red-950/30 dark:border-red-800/40"
                                )}>
                                    <CardContent className="p-4 flex items-start gap-4">
                                        <div className={cn(
                                            "p-3 rounded-xl",
                                            aiResult.status === 'safe' ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300" :
                                                aiResult.status === 'warning' ? "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300" : "bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300"
                                        )}>
                                            <Brain className="h-6 w-6" />
                                        </div>
                                        <div className="flex-1 space-y-1">
                                            <div className="flex items-center justify-between">
                                                <h4 className="font-bold text-foreground flex items-center gap-2">
                                                    Análise Inteligente Tango
                                                    {aiResult.status === 'safe' ? <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" /> :
                                                        aiResult.status === 'warning' ? <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" /> :
                                                            <XCircle className="h-4 w-4 text-red-600 dark:text-red-400" />}
                                                </h4>
                                                <Badge variant="outline" className={cn(
                                                    "capitalize",
                                                    aiResult.status === 'safe' ? "border-emerald-200 text-emerald-700 bg-emerald-100/50 dark:border-emerald-800 dark:text-emerald-300 dark:bg-emerald-950/50" :
                                                        aiResult.status === 'warning' ? "border-amber-200 text-amber-700 bg-amber-100/50 dark:border-amber-800 dark:text-amber-300 dark:bg-amber-950/50" :
                                                            "border-red-200 text-red-700 bg-red-100/50 dark:border-red-800 dark:text-red-300 dark:bg-red-950/50"
                                                )}>
                                                    {aiResult.status === 'safe' ? 'Recomendado' : aiResult.status === 'warning' ? 'Atenção' : 'Alto Risco'}
                                                </Badge>
                                            </div>
                                            <p className="text-sm text-muted-foreground leading-relaxed font-medium">
                                                {aiResult.message}
                                            </p>
                                            <p className="text-xs text-muted-foreground italic mt-2 opacity-80 border-l-2 border-current pl-2">
                                                {aiResult.detailedAdvice}
                                            </p>
                                            {aiResult.suggestion && (
                                                <div className="mt-3 p-3 bg-background/50 rounded-lg border border-border flex items-center justify-between gap-4">
                                                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                                        <TrendingUp className="h-4 w-4 text-indigo-500" />
                                                        <span>Sugestão IA: Reduzir montante para <strong>{formatCurrency(aiResult.suggestion, companySettings?.currency)}</strong> para segurança financeira.</span>
                                                    </div>
                                                    <Button size="sm" variant="outline" className="h-7 text-[10px] bg-card hover:bg-indigo-500/10 border-indigo-500/30 text-indigo-600 dark:text-indigo-400" onClick={handleApplySuggestion}>
                                                        Aplicar Sugestão
                                                    </Button>
                                                </div>
                                            )}
                                        </div>
                                    </CardContent>
                                </Card>
                            )}

                            {/* Chart */}
                            <Card>
                                <CardHeader>
                                    <CardTitle className="text-base">Projeção da Dívida e Amortização</CardTitle>
                                </CardHeader>
                                <CardContent className="h-[300px]">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <AreaChart data={simulation.rows} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                                            <defs>
                                                <linearGradient id="colorBalance" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.1} />
                                                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                                                </linearGradient>
                                                <linearGradient id="colorAmort" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.1} />
                                                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                                                </linearGradient>
                                            </defs>
                                            <XAxis dataKey="month" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                                            <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(val) => `${val / 1000}k`} />
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                                            <Tooltip
                                                contentStyle={{ backgroundColor: 'hsl(var(--card))', borderRadius: '8px', border: '1px solid hsl(var(--border))', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                                                itemStyle={{ color: 'hsl(var(--foreground))' }}
                                                formatter={(value: number) => formatCurrency(value, companySettings?.currency)}
                                            />
                                            <Legend />
                                            <Area type="monotone" dataKey="balance" name="Saldo Devedor" stroke="#ef4444" fillOpacity={1} fill="url(#colorBalance)" />
                                            <Area type="monotone" dataKey="payment" name="Parcela" stroke="#6366f1" fillOpacity={0} fill="#6366f1" />
                                        </AreaChart>
                                    </ResponsiveContainer>
                                </CardContent>
                            </Card>

                            {/* Table */}
                            <Card>
                                <CardHeader className="pb-2">
                                    <div className="flex items-center justify-between">
                                        <CardTitle className="text-base">Cronograma de Pagamentos</CardTitle>
                                        <Button variant="outline" size="sm" className="h-8 gap-2 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-500/20 border-indigo-500/20" onClick={handleExportPDF}>
                                            <Download className="h-4 w-4" /> Baixar Ficha de Simulação (PDF)
                                        </Button>
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    <div className="relative overflow-auto max-h-[400px]">
                                        <Table>
                                            <TableHeader className="sticky top-0 bg-card z-10 shadow-sm">
                                                <TableRow>
                                                    <TableHead className="w-[80px]">Mês</TableHead>
                                                    <TableHead className="text-right">Prestação</TableHead>
                                                    <TableHead className="text-right">Juros</TableHead>
                                                    <TableHead className="text-right">Amortização</TableHead>
                                                    <TableHead className="text-right">Saldo Devedor</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {simulation.rows.map((row) => (
                                                    <TableRow key={row.month} className="hover:bg-muted/50 border-border">
                                                        <TableCell className="font-mono text-xs">{row.month}º</TableCell>
                                                        <TableCell className="text-right font-bold text-foreground">
                                                            {formatCurrency(row.payment, companySettings?.currency)}
                                                        </TableCell>
                                                        <TableCell className="text-right text-red-500 text-xs">
                                                            {formatCurrency(row.interest, companySettings?.currency)}
                                                        </TableCell>
                                                        <TableCell className="text-right text-emerald-500 text-xs">
                                                            {formatCurrency(row.amortization, companySettings?.currency)}
                                                        </TableCell>
                                                        <TableCell className="text-right text-muted-foreground text-xs font-medium">
                                                            {formatCurrency(row.balance, companySettings?.currency)}
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </div>
                                </CardContent>
                            </Card>

                        </div>
                    </div>
                </TabsContent>

                <TabsContent value="history">
                    <Card>
                        <CardHeader className="space-y-4">
                            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                                <div>
                                    <CardTitle className="flex items-center gap-2">
                                        <History className="h-5 w-5 text-indigo-600" />
                                        Histórico de Simulações
                                    </CardTitle>
                                    <CardDescription>Consulte todas as simulações guardadas. Total: {history.length}</CardDescription>
                                </div>
                                <div className="flex gap-2">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="gap-2 h-9"
                                        onClick={handleExportAllHistory}
                                        disabled={filteredHistory.length === 0}
                                    >
                                        <FileSpreadsheet className="h-4 w-4" />
                                        Exportar Relatório ({filteredHistory.length})
                                    </Button>
                                    {selectedClientFilter && (
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="gap-2 h-9 bg-indigo-50 text-indigo-600 border-indigo-200"
                                            onClick={handleExportClientHistory}
                                        >
                                            <Download className="h-4 w-4" />
                                            Exportar Cliente
                                        </Button>
                                    )}
                                </div>
                            </div>

                            {/* Filters Row */}
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 p-4 bg-muted/30 rounded-lg border">
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                    <Input
                                        placeholder="Procurar..."
                                        value={historySearch}
                                        onChange={(e) => setHistorySearch(e.target.value)}
                                        className="pl-10 h-9 bg-background"
                                    />
                                </div>
                                <div>
                                    <Select value={selectedClientFilter} onValueChange={setSelectedClientFilter}>
                                        <SelectTrigger className="h-9 bg-background">
                                            <SelectValue placeholder="Filtrar por cliente..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="__all__">Todos os Clientes</SelectItem>
                                            {Array.from(new Set(history.map(h => h.clientName))).sort().map(name => (
                                                <SelectItem key={name} value={name}>{name}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div>
                                    <CurrencyInput
                                        value={minAmount}
                                        onValueChange={setMinAmount}
                                        placeholder="Valor mínimo"
                                        className="h-9 bg-background"
                                    />
                                </div>
                                <div>
                                    <CurrencyInput
                                        value={maxAmount}
                                        onValueChange={setMaxAmount}
                                        placeholder="Valor máximo"
                                        className="h-9 bg-background"
                                    />
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent>
                            {history.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                                    <History className="h-12 w-12 mb-4 opacity-20" />
                                    <p>Nenhuma simulação guardada no histórico.</p>
                                </div>
                            ) : filteredHistory.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                                    <Search className="h-12 w-12 mb-4 opacity-20" />
                                    <p>Nenhuma simulação encontrada para "{historySearch}".</p>
                                </div>
                            ) : (
                                <div className="rounded-xl border border-border">
                                    <Table>
                                        <TableHeader>
                                            <TableRow className="bg-muted/50">
                                                <TableHead>Referência / Data</TableHead>
                                                <TableHead>Cliente</TableHead>
                                                <TableHead className="text-right">Montante / Prazo</TableHead>
                                                <TableHead className="text-right">Mensalidade</TableHead>
                                                <TableHead className="text-center">Risco IA</TableHead>
                                                <TableHead className="text-right pr-4">Ações</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {filteredHistory.map((entry) => (
                                                <TableRow key={entry.id} className="hover:bg-muted/30 transition-colors">
                                                    <TableCell>
                                                        <div className="flex flex-col">
                                                            <span className="font-bold text-indigo-600 dark:text-indigo-400 font-mono text-xs">
                                                                {entry.reference || 'N/A'}
                                                            </span>
                                                            <span className="text-[10px] text-muted-foreground">
                                                                {new Date(entry.date).toLocaleString()}
                                                            </span>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell>
                                                        <span className="font-semibold text-foreground">{entry.clientName}</span>
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        <div className="flex flex-col">
                                                            <span className="font-bold text-foreground">
                                                                {formatCurrency(entry.amount, companySettings?.currency)}
                                                            </span>
                                                            <span className="text-[10px] text-muted-foreground">
                                                                {entry.term} m @ {entry.interestRate}%
                                                            </span>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        <div className="flex flex-col">
                                                            <span className="font-bold text-emerald-500">
                                                                {formatCurrency(entry.monthlyPayment, companySettings?.currency)}
                                                            </span>
                                                            <span className="text-[10px] text-muted-foreground uppercase">
                                                                {entry.method}
                                                            </span>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="text-center">
                                                        <Badge className={cn(
                                                            "text-[10px] h-5",
                                                            (() => {
                                                                let status = 'unknown';
                                                                if (entry.aiAnalysis) {
                                                                    if (typeof entry.aiAnalysis === 'string') {
                                                                        try {
                                                                            const parsed = JSON.parse(entry.aiAnalysis);
                                                                            status = parsed.status || 'unknown';
                                                                        } catch (e) {
                                                                            status = 'unknown';
                                                                        }
                                                                    } else {
                                                                        status = (entry.aiAnalysis as any).status || 'unknown';
                                                                    }
                                                                }
                                                                return status === 'safe' ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-emerald-200" :
                                                                    status === 'warning' ? "bg-amber-100 text-amber-700 hover:bg-amber-100 border-amber-200" :
                                                                        "bg-red-100 text-red-700 hover:bg-red-100 border-red-200";
                                                            })()
                                                        )}>
                                                            {(() => {
                                                                if (!entry.aiAnalysis) return 'N/A';
                                                                let status = 'unknown';
                                                                if (typeof entry.aiAnalysis === 'string') {
                                                                    try {
                                                                        const parsed = JSON.parse(entry.aiAnalysis);
                                                                        status = parsed.status || 'unknown';
                                                                    } catch (e) {
                                                                        status = 'unknown';
                                                                    }
                                                                } else {
                                                                    status = (entry.aiAnalysis as any).status || 'unknown';
                                                                }
                                                                return status === 'safe' ? 'BAIXO' : status === 'warning' ? 'MÉDIO' : 'ALTO';
                                                            })()}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell className="text-right pr-2">
                                                        <div className="flex justify-end gap-1">
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                className="h-8 w-8 text-emerald-500 hover:text-emerald-600 hover:bg-emerald-500/10"
                                                                onClick={() => handleDownloadHistoryPDF(entry)}
                                                                title="Baixar PDF"
                                                            >
                                                                <Download className="h-4 w-4" />
                                                            </Button>
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                className="h-8 w-8 text-indigo-500 hover:text-indigo-600 hover:bg-indigo-500/10"
                                                                onClick={() => handleLoadFromHistory(entry)}
                                                                title="Visualizar e Carregar"
                                                            >
                                                                <Calculator className="h-4 w-4" />
                                                            </Button>
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                className="h-8 w-8 text-destructive hover:bg-red-500/10 hover:text-destructive"
                                                                onClick={() => handleDeleteFromHistory(entry)}
                                                                title="Remover"
                                                            >
                                                                <Trash2 className="h-4 w-4" />
                                                            </Button>
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="guide">
                    <Card>
                        <CardHeader>
                            <CardTitle>Guia do Simulador de Crédito</CardTitle>
                            <CardDescription>Entenda como projetar cenários e analisar custos para o seu cliente.</CardDescription>
                        </CardHeader>
                        <CardContent className="prose prose-slate max-w-none dark:prose-invert">
                            <h3 className="text-indigo-800 dark:text-indigo-400 font-bold">1. Parâmetros da Simulação</h3>
                            <p>No painel esquerdo, você pode ajustar as condições do crédito:</p>
                            <ul>
                                <li><strong>Dados do Cliente:</strong> Preencha para personalizar a Ficha de Simulação (PDF).</li>
                                <li><strong>Valor Solicitado:</strong> Use o controle deslizante ou digite o valor exato.</li>
                                <li><strong>Prazo:</strong> Defina o número limite de parcelas.</li>
                                <li><strong>Score de Risco:</strong> Ajusta automaticamente a taxa de juros (Baixo, Médio, Alto).</li>
                                <li><strong>Sistema de Amortização:</strong>
                                    <ul>
                                        <li><strong>PRICE:</strong> Parcelas fixas do início ao fim.</li>
                                        <li><strong>SAC:</strong> Parcelas que começam mais altas e diminuem (amortização constante).</li>
                                    </ul>
                                </li>
                            </ul>

                            <h3 className="text-indigo-800 dark:text-indigo-400 font-bold">2. Resultados e Métricas</h3>
                            <ul>
                                <li><strong>Primeira Parcela:</strong> O valor inicial que o cliente pagará.</li>
                                <li><strong>CET (Custo Efetivo Total):</strong> A taxa real anual incluindo custos extras. Item obrigatório para comparação justa.</li>
                            </ul>

                            <h3 className="text-indigo-800 dark:text-indigo-400 font-bold">3. Passos para Emissão de Proposta</h3>
                            <ol>
                                <li>Preencha o <strong>Nome do Cliente</strong> e o <strong>Rendimento</strong> (opcional).</li>
                                <li>Ajuste o valor e prazo conforme a necessidade.</li>
                                <li>Selecione o perfil de risco adequado (consulte o Score do cliente se disponível).</li>
                                <li>Verifique se a parcela cabe no orçamento (regra dos 30%).</li>
                                <li>Clique em <strong>"Baixar Ficha de Simulação"</strong> para gerar o documento PDF oficial para assinatura ou envio.</li>
                            </ol>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>

            {/* Confirmation Modals */}
            <AlertModal
                isOpen={loadConfirmOpen}
                onClose={() => setLoadConfirmOpen(false)}
                onConfirm={confirmLoadFromHistory}
                showCancel={true}
                title="Visualizar Detalhes da Simulação?"
                description={selectedHistoryEntry ? `Deseja visualizar os detalhes completos da simulação de "${selectedHistoryEntry.clientName}" de ${new Date(selectedHistoryEntry.date).toLocaleString()}? Os dados também serão carregados no simulador.` : ''}
                type="info"
            />

            <AlertModal
                isOpen={deleteConfirmOpen}
                onClose={() => setDeleteConfirmOpen(false)}
                onConfirm={confirmDeleteFromHistory}
                showCancel={true}
                title="Eliminar Simulação?"
                description={selectedHistoryEntry ? `Tem a certeza que deseja eliminar permanentemente a simulação de "${selectedHistoryEntry.clientName}" de ${new Date(selectedHistoryEntry.date).toLocaleString()}? Esta ação não pode ser desfeita.` : ''}
                type="error"
            />

            {/* Details Modal */}
            <Dialog open={detailsModalOpen} onOpenChange={(open) => {
                setDetailsModalOpen(open);
                if (!open) setSelectedHistoryEntry(null);
            }}>
                <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-xl">
                            <Info className="h-5 w-5 text-primary" />
                            Detalhes da Simulação Carregada
                        </DialogTitle>
                        <DialogDescription>
                            Informações completas da simulação de crédito
                        </DialogDescription>
                    </DialogHeader>

                    {selectedHistoryEntry && (
                        <div className="space-y-6 mt-4">
                            {/* Client Information */}
                            <div className="p-4 rounded-xl border border-border bg-muted/20">
                                <h3 className="text-sm font-bold uppercase text-muted-foreground mb-3 flex items-center gap-2">
                                    <DollarSign className="h-4 w-4" />
                                    Informações do Cliente
                                </h3>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <p className="text-xs text-muted-foreground">Nome do Cliente</p>
                                        <p className="font-bold text-foreground">{selectedHistoryEntry.clientName}</p>
                                    </div>
                                    <div>
                                        <p className="text-xs text-muted-foreground">Rendimento Mensal</p>
                                        <p className="font-bold text-foreground">
                                            {selectedHistoryEntry.clientIncome > 0
                                                ? formatCurrency(selectedHistoryEntry.clientIncome, companySettings?.currency)
                                                : 'Não informado'}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Credit Details */}
                            <div className="p-4 rounded-xl border border-border bg-muted/20">
                                <h3 className="text-sm font-bold uppercase text-muted-foreground mb-3 flex items-center gap-2">
                                    <Calculator className="h-4 w-4" />
                                    Detalhes do Crédito
                                </h3>
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                    <div>
                                        <p className="text-xs text-muted-foreground">Valor Solicitado</p>
                                        <p className="font-bold text-primary text-lg">
                                            {formatCurrency(selectedHistoryEntry.amount, companySettings?.currency)}
                                        </p>
                                    </div>
                                    <div>
                                        <p className="text-xs text-muted-foreground">Prazo</p>
                                        <p className="font-bold text-foreground">{selectedHistoryEntry.term} meses</p>
                                    </div>
                                    <div>
                                        <p className="text-xs text-muted-foreground">Taxa de Juros</p>
                                        <p className="font-bold text-foreground">{selectedHistoryEntry.interestRate}% ao mês</p>
                                    </div>
                                    <div>
                                        <p className="text-xs text-muted-foreground">Sistema de Amortização</p>
                                        <p className="font-bold text-foreground uppercase">{selectedHistoryEntry.method}</p>
                                    </div>
                                    <div>
                                        <p className="text-xs text-muted-foreground">Perfil de Risco</p>
                                        <Badge variant={
                                            selectedHistoryEntry.riskProfile === 'low' ? 'success' :
                                                selectedHistoryEntry.riskProfile === 'medium' ? 'warning' : 'destructive'
                                        }>
                                            {selectedHistoryEntry.riskProfile === 'low' ? 'BAIXO' :
                                                selectedHistoryEntry.riskProfile === 'medium' ? 'MÉDIO' : 'ALTO'}
                                        </Badge>
                                    </div>
                                    <div>
                                        <p className="text-xs text-muted-foreground">Data da Simulação</p>
                                        <p className="font-medium text-foreground text-sm">
                                            {new Date(selectedHistoryEntry.date).toLocaleString()}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Payment Information */}
                            <div className="p-4 rounded-xl border border-border bg-gradient-to-br from-emerald-50 to-white dark:from-emerald-950/20 dark:to-background">
                                <h3 className="text-sm font-bold uppercase text-emerald-700 dark:text-emerald-400 mb-3 flex items-center gap-2">
                                    <Calendar className="h-4 w-4" />
                                    Informações de Pagamento
                                </h3>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <p className="text-xs text-muted-foreground">Parcela Mensal</p>
                                        <p className="font-bold text-emerald-600 dark:text-emerald-400 text-xl">
                                            {formatCurrency(selectedHistoryEntry.monthlyPayment, companySettings?.currency)}
                                        </p>
                                    </div>
                                    <div>
                                        <p className="text-xs text-muted-foreground">Total a Pagar</p>
                                        <p className="font-bold text-foreground text-xl">
                                            {formatCurrency(selectedHistoryEntry.totalPayment, companySettings?.currency)}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* AI Analysis */}
                            {selectedHistoryEntry.aiAnalysis && (
                                <div className={cn(
                                    "p-4 rounded-xl border",
                                    selectedHistoryEntry.aiAnalysis.status === 'safe'
                                        ? "border-emerald-200 bg-emerald-50/50 dark:border-emerald-800 dark:bg-emerald-950/20"
                                        : selectedHistoryEntry.aiAnalysis.status === 'warning'
                                            ? "border-amber-200 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-950/20"
                                            : "border-red-200 bg-red-50/50 dark:border-red-800 dark:bg-red-950/20"
                                )}>
                                    <h3 className={cn(
                                        "text-sm font-bold uppercase mb-3 flex items-center gap-2",
                                        selectedHistoryEntry.aiAnalysis.status === 'safe' ? "text-emerald-700 dark:text-emerald-400" :
                                            selectedHistoryEntry.aiAnalysis.status === 'warning' ? "text-amber-700 dark:text-amber-400" :
                                                "text-red-700 dark:text-red-400"
                                    )}>
                                        <Brain className="h-4 w-4" />
                                        Análise de Risco IA
                                    </h3>
                                    <div className="space-y-2">
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs text-muted-foreground">Status:</span>
                                            <Badge className={cn(
                                                selectedHistoryEntry.aiAnalysis.status === 'safe'
                                                    ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-emerald-200"
                                                    : selectedHistoryEntry.aiAnalysis.status === 'warning'
                                                        ? "bg-amber-100 text-amber-700 hover:bg-amber-100 border-amber-200"
                                                        : "bg-red-100 text-red-700 hover:bg-red-100 border-red-200"
                                            )}>
                                                {selectedHistoryEntry.aiAnalysis.status === 'safe' ? 'BAIXO RISCO' :
                                                    selectedHistoryEntry.aiAnalysis.status === 'warning' ? 'RISCO MÉDIO' : 'ALTO RISCO'}
                                            </Badge>
                                        </div>
                                        {selectedHistoryEntry.aiAnalysis.message && (
                                            <p className="text-sm text-foreground leading-relaxed">
                                                {selectedHistoryEntry.aiAnalysis.message}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Action Buttons */}
                            <div className="flex justify-between gap-2 pt-4 border-t border-border">
                                <Button
                                    variant="outline"
                                    className="gap-2"
                                    onClick={() => {
                                        if (selectedHistoryEntry) {
                                            // Recalculate simulation with history data
                                            const rows: AmortizationRow[] = [];
                                            let balance = selectedHistoryEntry.amount;
                                            const i = selectedHistoryEntry.interestRate / 100;
                                            const n = selectedHistoryEntry.term;

                                            if (selectedHistoryEntry.method === 'price') {
                                                const pmt = (selectedHistoryEntry.amount * i * Math.pow(1 + i, n)) / (Math.pow(1 + i, n) - 1);
                                                for (let month = 1; month <= n; month++) {
                                                    const interest = balance * i;
                                                    const amortization = pmt - interest;
                                                    balance -= amortization;
                                                    rows.push({
                                                        month,
                                                        payment: pmt,
                                                        interest,
                                                        amortization,
                                                        balance: Math.max(0, balance)
                                                    });
                                                }
                                            } else {
                                                const amortization = selectedHistoryEntry.amount / n;
                                                for (let month = 1; month <= n; month++) {
                                                    const interest = balance * i;
                                                    const payment = amortization + interest;
                                                    balance -= amortization;
                                                    rows.push({
                                                        month,
                                                        payment,
                                                        interest,
                                                        amortization,
                                                        balance: Math.max(0, balance)
                                                    });
                                                }
                                            }

                                            const totalInterest = rows.reduce((sum, row) => sum + row.interest, 0);
                                            const totalPayment = rows.reduce((sum, row) => sum + row.payment, 0);

                                            const simulationData = {
                                                rows,
                                                totalInterest,
                                                totalPayment,
                                                totalUpfrontCosts: 0,
                                                totalCost: totalPayment,
                                                cetTotal: 0
                                            };

                                            generateSimulationPDF(
                                                simulationData,
                                                {
                                                    name: selectedHistoryEntry.clientName,
                                                    income: selectedHistoryEntry.clientIncome,
                                                    requestedAmount: selectedHistoryEntry.amount,
                                                    term: selectedHistoryEntry.term,
                                                    interestRate: selectedHistoryEntry.interestRate,
                                                    method: selectedHistoryEntry.method,
                                                    reference: selectedHistoryEntry.reference
                                                },
                                                companySettings,
                                                user?.name || 'Consultor',
                                                selectedHistoryEntry.aiAnalysis
                                            );
                                        }
                                    }}
                                >
                                    <Download className="h-4 w-4" />
                                    Baixar PDF Completo
                                </Button>
                                <div className="flex gap-2">
                                    <Button
                                        variant="outline"
                                        onClick={() => {
                                            setDetailsModalOpen(false);
                                            setSelectedHistoryEntry(null);
                                        }}
                                    >
                                        Fechar
                                    </Button>
                                    <Button
                                        className="gap-2"
                                        onClick={() => {
                                            setDetailsModalOpen(false);
                                            setSelectedHistoryEntry(null);
                                            // Switch to simulator tab
                                            const simulatorTab = document.querySelector('[value="simulator"]') as HTMLElement;
                                            simulatorTab?.click();
                                        }}
                                    >
                                        <Calculator className="h-4 w-4" />
                                        Ir para Simulador
                                    </Button>
                                </div>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
            {/* Modal de Sucesso (Auto-fechamento) */}
            <Dialog open={saveSuccessOpen} onOpenChange={setSaveSuccessOpen}>
                <DialogContent className="sm:max-w-md text-center py-10 bg-white dark:bg-slate-900 border-none shadow-2xl">
                    <div className="flex flex-col items-center gap-4">
                        <div className="h-20 w-20 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center animate-bounce">
                            <CheckCircle2 className="h-12 w-12 text-emerald-600 dark:text-emerald-400" />
                        </div>
                        <div className="space-y-2">
                            <h3 className="text-2xl font-bold text-foreground">Guardado com Sucesso!</h3>
                            <p className="text-muted-foreground">O histórico de simulação foi atualizado e está disponível na aba "Histórico".</p>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </MainLayout>
    );
}

export default SimuladorCredito;
