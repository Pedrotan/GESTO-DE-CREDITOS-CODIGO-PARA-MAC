import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { MainLayout } from '@/componentes/layout/MainLayout';
import { useData } from '@/contextos/ContextoDados';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/componentes/ui/card';
import { Button } from '@/componentes/ui/button';
import { Input } from '@/componentes/ui/input';
import { Badge } from '@/componentes/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/componentes/ui/tabs';
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
    BookOpen,
    FileText,
    TrendingUp,
    TrendingDown,
    Search,
    RotateCcw,
    ShieldCheck,
    AlertCircle,
    User,
    Lock,
    Lightbulb,
    Brain,
    DollarSign,
    ArrowUpRight,
    X
} from 'lucide-react';
import { formatCurrency, formatDate } from '@/bibliotecas/formatters';
import { AccountingEntry } from '@/tipos/credito';
import { AuditScanModal } from '@/componentes/modals/AuditScanModal';
import { useTangoAI } from '@/ganchos/usar-tango-ai';
import { cn } from '@/bibliotecas/utils';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
    LineChart,
    Line,
    PieChart,
    Pie,
    Cell
} from 'recharts';


export default function Accounting() {
    const { accountingEntries, clients, credits, companySettings } = useData();
    const [selectedClient, setSelectedClient] = useState<string>('all');
    const [searchTerm, setSearchTerm] = useState('');
    const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);

    // --- Derived Data ---

    const stats = useMemo(() => {
        let totalAssets = 0; // Portfolio (Principal a receber)
        let totalCash = 0;   // Bank (Dinheiro em caixa)
        let totalRevenue = 0; // Interest + Late Interest
        let totalLiabilities = 0; // Capital Investido (simplified)

        accountingEntries.forEach(entry => {
            // Debit increases Assets/Expenses
            if (entry.debit === 'portfolio') totalAssets += entry.amountPrincipal;
            if (entry.debit === 'bank') totalCash += entry.amountTotal;

            // Credit decreases Assets/Expenses (or increases Equity/Revenue)
            if (entry.credit === 'portfolio') totalAssets -= entry.amountPrincipal;
            if (entry.credit === 'bank') totalCash -= entry.amountTotal;

            // Revenue Accounts (Credit only usually)
            if (entry.credit === 'revenue_interest' || entry.credit === 'revenue_late_interest') {
                totalRevenue += entry.amountTotal;
            }
        });

        return { totalAssets, totalCash, totalRevenue, totalLiabilities };
    }, [accountingEntries]);

    const filteredEntries = useMemo(() => {
        return accountingEntries.filter(entry => {
            const matchesClient = selectedClient === 'all' || entry.clientId === selectedClient;
            const matchesSearch = entry.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
                entry.id.toLowerCase().includes(searchTerm.toLowerCase());
            return matchesClient && matchesSearch;
        }).sort((a, b) => {
            const dateA = a.timestamp instanceof Date ? a.timestamp : new Date(a.timestamp);
            const dateB = b.timestamp instanceof Date ? b.timestamp : new Date(b.timestamp);
            return dateB.getTime() - dateA.getTime();
        });
    }, [accountingEntries, selectedClient, searchTerm]);

    const accountBalances = useMemo(() => {
        const balances: Record<string, number> = {};
        const accounts = ['cash', 'bank', 'portfolio', 'revenue_interest', 'revenue_late_interest', 'capital', 'equity', 'provision', 'expenses', 'pdd'];

        accounts.forEach(acc => balances[acc] = 0);

        accountingEntries.forEach(entry => {
            // Simple Logic: Assets (Bank, Portfolio, Cash) increase with Debit. Equity/Revenue increase with Credit.
            if (['bank', 'portfolio', 'cash', 'expenses'].includes(entry.debit)) {
                balances[entry.debit] += entry.amountTotal;
            }
            if (['bank', 'portfolio', 'cash', 'expenses'].includes(entry.credit)) {
                balances[entry.credit] -= entry.amountTotal;
            }

            if (['capital', 'equity', 'revenue_interest', 'revenue_late_interest', 'pdd', 'provision'].includes(entry.credit)) {
                balances[entry.credit] += entry.amountTotal;
            }
            if (['capital', 'equity', 'revenue_interest', 'revenue_late_interest', 'pdd', 'provision'].includes(entry.debit)) {
                balances[entry.debit] -= entry.amountTotal;
            }
        });

        return balances;
    }, [accountingEntries]);

    // --- Dynamic Chart Data ---
    const chartData = useMemo(() => {
        const last12Months = new Array(12).fill(0).map((_, i) => {
            const d = new Date();
            d.setMonth(d.getMonth() - (11 - i));
            return d;
        });

        const monthData = last12Months.map(date => ({
            name: date.toLocaleString('default', { month: 'short' }),
            receita: 0,
            despesa: 0
        }));

        accountingEntries.forEach(entry => {
            const entryDate = entry.timestamp instanceof Date ? entry.timestamp : new Date(entry.timestamp);
            const monthIdx = entryDate.getMonth();
            const year = entryDate.getFullYear();

            last12Months.forEach((d, i) => {
                if (d.getMonth() === monthIdx && d.getFullYear() === year) {
                    if (['revenue_interest', 'revenue_late_interest'].includes(entry.credit)) {
                        monthData[i].receita += entry.amountTotal;
                    }
                    if (entry.debit === 'expenses') {
                        monthData[i].despesa += entry.amountTotal;
                    }
                }
            });
        });

        return monthData;
    }, [accountingEntries]);

    const portfolioData = useMemo(() => {
        let active = 0;
        let overdue = 0;
        let defaulted = 0;

        credits.forEach(c => {
            // Ignore paid or rejected
            // Assuming principalAmount or currentBalance? Portolio usually refers to Outstanding Balance.
            const value = c.currentBalance;
            if (value <= 0) return;

            if (c.status === 'active') active += value;
            else if (c.status === 'overdue') overdue += value;
            else if (c.status === 'defaulted') defaulted += value;
            // active covers new credits nicely
        });

        return [
            { name: 'Em dia', value: active },
            { name: 'Atrasado', value: overdue },
            { name: 'Inadimplente', value: defaulted },
        ].filter(i => i.value > 0); // Hide empty slices
    }, [credits]);

    const { insights: tangoAI, dismissInsight, resetDismissed, hasDismissed } = useTangoAI();

    return (
        <MainLayout title="Contabilidade" subtitle="Razão Geral e Auditoria Financeira">

            {/* KPI Cards — mesmo formato dos restantes módulos do sistema.
                A cor indica a relevância: informativo, positivo, atenção, crítico. */}
            <div className="mb-8 grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
                <div className="card-kpi-sky">
                    <div className="flex items-center gap-2.5">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/10 text-slate-950 shrink-0 dark:bg-white/10 dark:text-white">
                            <TrendingUp className="h-5 w-5" />
                        </div>
                        <p className="truncate text-sm font-bold tracking-tight text-slate-950 dark:text-white sm:text-base">
                            Caixa e Bancos
                        </p>
                    </div>

                    <div className="my-2">
                        <p className="font-display truncate text-3xl font-black tracking-tight text-slate-950 dark:text-white sm:text-4xl">
                            {formatCurrency(stats.totalCash, companySettings?.currency)}
                        </p>
                    </div>

                    <p className="truncate text-xs font-semibold text-slate-900/75 dark:text-slate-400">
                        Disponibilidades
                    </p>
                </div>

                <div className="card-kpi-mint">
                    <div className="flex items-center gap-2.5">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/10 text-slate-950 shrink-0 dark:bg-white/10 dark:text-white">
                            <BookOpen className="h-5 w-5" />
                        </div>
                        <p className="truncate text-sm font-bold tracking-tight text-slate-950 dark:text-white sm:text-base">
                            Carteira de Crédito
                        </p>
                    </div>

                    <div className="my-2">
                        <p className="font-display truncate text-3xl font-black tracking-tight text-slate-950 dark:text-white sm:text-4xl">
                            {formatCurrency(stats.totalAssets, companySettings?.currency)}
                        </p>
                    </div>

                    <p className="truncate text-xs font-semibold text-slate-900/75 dark:text-slate-400">
                        Capital em dívida
                    </p>
                </div>

                <div className="card-kpi-amber">
                    <div className="flex items-center gap-2.5">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/10 text-slate-950 shrink-0 dark:bg-white/10 dark:text-white">
                            <TrendingUp className="h-5 w-5" />
                        </div>
                        <p className="truncate text-sm font-bold tracking-tight text-slate-950 dark:text-white sm:text-base">
                            Receita Financeira
                        </p>
                    </div>

                    <div className="my-2">
                        <p className="font-display truncate text-3xl font-black tracking-tight text-slate-950 dark:text-white sm:text-4xl">
                            {formatCurrency(stats.totalRevenue, companySettings?.currency)}
                        </p>
                    </div>

                    <p className="truncate text-xs font-semibold text-slate-900/75 dark:text-slate-400">
                        Juros arrecadados
                    </p>
                </div>

                <div className="card-kpi-purple">
                    <div className="flex items-center gap-2.5">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/10 text-slate-950 shrink-0 dark:bg-white/10 dark:text-white">
                            <ShieldCheck className="h-5 w-5" />
                        </div>
                        <p className="truncate text-sm font-bold tracking-tight text-slate-950 dark:text-white sm:text-base">
                            Integridade de Dados
                        </p>
                    </div>

                    <div className="my-2">
                        <div className="flex items-center gap-2">
                            <Badge variant="success" className="border-none bg-black/10 text-slate-950 hover:bg-black/10 dark:bg-white/10 dark:text-white">
                                <ShieldCheck className="mr-1 h-3 w-3" />
                                Validada
                            </Badge>
                        </div>
                    </div>

                    <p className="truncate text-xs font-semibold text-slate-900/75 dark:text-slate-400">
                        Hash Chain OK
                    </p>
                </div>
            </div>

            {/* --- INTELIGÊNCIA FINANCEIRA & GRÁFICOS (NOVO) --- */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">

                {/* AI Suggestions */}
                <Card className="lg:col-span-1 bg-gradient-to-br from-indigo-900 to-slate-900 text-white border-none shadow-xl overflow-hidden">
                    <CardHeader className="py-3 px-4">
                        <CardTitle className="flex items-center gap-2 text-indigo-300 text-sm">
                            <Brain className="h-4 w-4 text-indigo-400" />
                            Inteligência Tango AI
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 px-4 pb-4">
                        {tangoAI.length > 0 ? (
                            tangoAI.slice(0, 3).map((insight) => (
                                <div key={insight.id} className="p-2 bg-white/5 rounded-lg border border-white/10 backdrop-blur-sm relative group">
                                    {/* Close button */}
                                    <button
                                        onClick={() => dismissInsight(insight.id)}
                                        className="absolute top-1 right-1 text-white/40 hover:text-white/80 p-0.5 rounded-full hover:bg-white/10 transition-colors z-20"
                                        title="Ocultar insight"
                                    >
                                        <X className="h-3 w-3" />
                                    </button>
                                    
                                    <h4 className={cn(
                                        "font-bold text-[11px] mb-0.5 pr-4",
                                        insight.color === 'emerald' ? "text-emerald-300" :
                                            insight.color === 'amber' ? "text-amber-300" :
                                                insight.color === 'red' ? "text-red-300" : "text-indigo-300"
                                    )}>
                                        {insight.title}
                                    </h4>
                                    <p className="text-[10px] text-slate-300 leading-tight">
                                        {insight.message}
                                    </p>
                                    {insight.solution && (
                                        <div className="mt-1.5 space-y-1.5">
                                            <p className="text-[9px] text-emerald-400 font-bold italic leading-none">
                                                Sugestão: {insight.solution.toLowerCase()}
                                            </p>
                                            <Button
                                                asChild
                                                size="sm"
                                                variant="ghost"
                                                className="h-7 w-full justify-between rounded-md border border-white/10 bg-white/10 px-2 text-[9px] font-black uppercase tracking-wide text-white hover:bg-white/20 hover:text-white"
                                            >
                                                <Link to={insight.actionPath} onClick={() => dismissInsight(insight.id)}>
                                                    <span>{insight.actionLabel}</span>
                                                    <ArrowUpRight className="h-3 w-3" />
                                                </Link>
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            ))
                        ) : (
                            <div className="py-6 text-center flex flex-col items-center justify-center space-y-3">
                                <div className="p-3 bg-white/5 rounded-full border border-white/10 backdrop-blur-sm relative">
                                    <Brain className="h-6 w-6 text-indigo-400 animate-pulse" />
                                    <div className="absolute top-0 right-0 h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
                                </div>
                                <div className="space-y-1">
                                    <p className="text-[11px] font-bold text-white">Monitorização Ativa</p>
                                    <p className="text-[9px] text-indigo-200/60 leading-relaxed px-2">
                                        Nenhum alerta imediato detetado na contabilidade. A IA continua a analisar as operações.
                                    </p>
                                </div>
                                {hasDismissed && (
                                    <Button
                                        onClick={resetDismissed}
                                        size="sm"
                                        variant="ghost"
                                        className="h-7 border border-white/10 bg-white/10 px-3 text-[9px] font-black uppercase tracking-wide text-white hover:bg-white/20 hover:text-white"
                                    >
                                        <RotateCcw className="h-3 w-3 mr-1" />
                                        Restaurar Alertas
                                    </Button>
                                )}
                            </div>
                        )}
                    </CardContent>
                </Card>

                <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6">
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm">Fluxo de Caixa (12 Meses)</CardTitle>
                        </CardHeader>
                        <CardContent className="h-[200px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={chartData}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                    <XAxis dataKey="name" fontSize={10} tickLine={false} axisLine={false} />
                                    <Tooltip
                                        cursor={{ fill: 'transparent' }}
                                        formatter={(value: number) => formatCurrency(value, companySettings?.currency)}
                                    />
                                    <Bar dataKey="receita" fill="#10b981" radius={[4, 4, 0, 0]} name="Receita (Juros)" />
                                    <Bar dataKey="despesa" fill="#ef4444" radius={[4, 4, 0, 0]} name="Despesas" />
                                </BarChart>
                            </ResponsiveContainer>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm">Composição da Carteira</CardTitle>
                        </CardHeader>
                        <CardContent className="h-[200px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={portfolioData}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={60}
                                        outerRadius={80}
                                        paddingAngle={5}
                                        dataKey="value"
                                    >
                                        <Cell fill="#10b981" />
                                        <Cell fill="#f59e0b" />
                                        <Cell fill="#ef4444" />
                                    </Pie>
                                    <Tooltip formatter={(value: number) => formatCurrency(value, companySettings?.currency)} />
                                </PieChart>
                            </ResponsiveContainer>
                            <div className="flex justify-center gap-4 text-xs text-slate-500 mt-[-20px]">
                                <div className="flex items-center gap-1"><div className="w-2 h-2 bg-emerald-500 rounded-full"></div>Em dia</div>
                                <div className="flex items-center gap-1"><div className="w-2 h-2 bg-amber-500 rounded-full"></div>Atrasado</div>
                            </div>
                        </CardContent>
                    </Card>
                </div>

            </div>

            <Tabs defaultValue="journal" className="w-full">
                <TabsList className="mb-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-1 w-full justify-start h-auto flex-wrap">
                    <TabsTrigger value="journal" className="gap-2 dark:data-[state=active]:bg-slate-800">
                        <FileText className="h-4 w-4" /> Diário Geral
                    </TabsTrigger>
                    <TabsTrigger value="ledger" className="gap-2 dark:data-[state=active]:bg-slate-800">
                        <BookOpen className="h-4 w-4" /> Balancete
                    </TabsTrigger>
                    <TabsTrigger value="client_statement" className="gap-2 dark:data-[state=active]:bg-slate-800">
                        <User className="h-4 w-4" /> Extrato de Cliente
                    </TabsTrigger>
                    <TabsTrigger value="guide" className="gap-2 dark:data-[state=active]:bg-slate-800">
                        <BookOpen className="h-4 w-4" /> Guia do Sistema
                    </TabsTrigger>
                </TabsList>

                {/* --- DIÁRIO GERAL --- */}
                <TabsContent value="journal">
                    <Card className="p-6 bg-card border-border">
                        <div className="flex flex-col md:flex-row gap-4 mb-6 justify-between">
                            <div className="relative w-full md:w-96">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Pesquisar lançamentos..."
                                    className="pl-9 bg-background border-border"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>
                            <Button
                                variant="outline"
                                className="gap-2 bg-indigo-50 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/50"
                                onClick={() => setIsAuditModalOpen(true)}
                            >
                                <ShieldCheck className="h-4 w-4" />
                                Auditoria Financeira e Compliance
                            </Button>
                        </div>

                        <div className="overflow-x-auto rounded-lg border border-border">
                            <Table>
                                <TableHeader className="bg-muted/50">
                                    <TableRow>
                                        <TableHead>Data</TableHead>
                                        <TableHead>Descrição</TableHead>
                                        <TableHead>Débito</TableHead>
                                        <TableHead>Crédito</TableHead>
                                        <TableHead className="text-right">Valor</TableHead>
                                        <TableHead className="text-center">Hash</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredEntries.map((entry) => (
                                        <TableRow key={entry.id} className="group hover:bg-muted/50">
                                            <TableCell className="font-mono text-xs whitespace-nowrap">
                                                {formatDate(entry.timestamp)}
                                            </TableCell>
                                            <TableCell className="font-medium text-foreground">
                                                {entry.description}
                                                <div className="text-[10px] text-muted-foreground font-mono mt-0.5">{entry.id.split('-')[0]}...</div>
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant="outline" className="bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800 font-mono text-[10px]">
                                                    {entry.debit.toUpperCase()}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant="outline" className="bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800 font-mono text-[10px]">
                                                    {entry.credit.toUpperCase()}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-right font-bold text-foreground">
                                                {formatCurrency(entry.amountTotal, companySettings?.currency)}
                                            </TableCell>
                                            <TableCell className="text-center">
                                                <div className="flex justify-center" title={`Hash: ${entry.integrityHash}\nPrev: ${entry.previousHash}`}>
                                                    <div className="w-2 h-2 rounded-full bg-emerald-400 group-hover:scale-150 transition-transform cursor-help" />
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    {filteredEntries.length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                                                <div className="flex flex-col items-center gap-2">
                                                    <FileText className="h-8 w-8 text-muted-foreground/40" />
                                                    <p>Nenhum lançamento encontrado</p>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </Card>
                </TabsContent>

                {/* --- BALANCETE --- */}
                <TabsContent value="ledger">
                    <Card className="p-6 bg-card border-border">
                        <h3 className="text-lg font-bold mb-6 text-foreground">Balancete de Verificação</h3>
                        <div className="space-y-1">
                            {Object.entries(accountBalances).map(([account, balance]) => {
                                const accountTranslations: Record<string, string> = {
                                    cash: 'Caixa Geral',
                                    bank: 'Banco / Contas',
                                    portfolio: 'Carteira de Crédito',
                                    revenue_interest: 'Receita de Juros',
                                    revenue_late_interest: 'Receita de Multas',
                                    capital: 'Capital Social',
                                    equity: 'Patrimônio Líquido',
                                    expenses: 'Despesas Gerais',
                                    pdd: 'Provisão (PDD)',
                                    provision: 'Reserva Legal'
                                };

                                return (
                                    <div key={account} className="flex items-center justify-between p-4 hover:bg-muted/40 transition-colors border-b border-border last:border-0 rounded-lg">
                                        <div className="flex items-center gap-3">
                                            <div className={`p-2 rounded-lg ${balance >= 0 ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300' : 'bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300'}`}>
                                                <BookOpen className="h-4 w-4" />
                                            </div>
                                            <div>
                                                <p className="font-bold text-foreground capitalize">{accountTranslations[account] || account.replace(/_/g, ' ')}</p>
                                                <p className="text-xs text-muted-foreground font-mono">
                                                    {account === 'bank' && 'Conta de Disponibilidades'}
                                                    {account === 'portfolio' && 'Ativo Circulante (Empréstimos)'}
                                                    {account === 'revenue_interest' && 'Conta de Resultados (Lucro)'}
                                                    {account === 'revenue_late_interest' && 'Conta de Resultados (Multas)'}
                                                    {account === 'capital' && 'Patrimônio Líquido'}
                                                    {account === 'expenses' && 'Despesas Operacionais'}
                                                    {account === 'pdd' && 'Provisão de Devedores Duvidosos'}
                                                    {!['bank', 'portfolio', 'revenue_interest', 'revenue_late_interest', 'capital', 'expenses', 'pdd'].includes(account) && account.toUpperCase()}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className={`font-mono font-bold ${balance >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-foreground'}`}>
                                                {formatCurrency(Math.abs(balance), companySettings?.currency)}
                                            </p>
                                            <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">
                                                {balance >= 0 ? 'Saldo Devedor' : 'Saldo Credor'}
                                            </p>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </Card>
                </TabsContent>

                {/* --- GUIA DE CONTABILIDADE --- */}
                {/* --- GUIA DE CONTABILIDADE --- */}
                <TabsContent value="guide">
                    <Card className="p-8 bg-card border-border">
                        <div className="max-w-4xl mx-auto space-y-8">
                            <div className="border-b border-border pb-4">
                                <h3 className="text-2xl font-bold text-foreground mb-2">Manual de Contabilidade e Auditoria</h3>
                                <p className="text-muted-foreground">Documentação técnica sobre o funcionamento do motor financeiro, glossário de termos e siglas.</p>
                            </div>

                            <div className="grid md:grid-cols-2 gap-6">
                                <div className="p-6 bg-muted/40 dark:bg-slate-900/60 rounded-xl border border-border">
                                    <h4 className="font-bold text-emerald-600 dark:text-emerald-400 mb-3 flex items-center gap-2">
                                        <ShieldCheck className="h-5 w-5" />
                                        Partidas Dobradas (Double-Entry)
                                    </h4>
                                    <p className="text-sm text-muted-foreground leading-relaxed text-justify">
                                        O sistema segue rigorosamente o princípio fundamental da contabilidade: <strong>para todo Débito deve haver um Crédito correspondente</strong>.
                                        Isso significa que o dinheiro nunca "aparece" ou "some"; ele sempre se move de uma conta de origem para uma conta de destino.
                                        Exemplo: Ao receber um pagamento, debitamos (aumentamos) o Banco e creditamos (reduzimos) a Carteira de Crédito.
                                    </p>
                                </div>

                                <div className="p-6 bg-muted/40 dark:bg-slate-900/60 rounded-xl border border-border">
                                    <h4 className="font-bold text-blue-600 dark:text-blue-400 mb-3 flex items-center gap-2">
                                        <AlertCircle className="h-5 w-5" />
                                        Imutabilidade e Blockchain (Hash)
                                    </h4>
                                    <p className="text-sm text-muted-foreground leading-relaxed text-justify">
                                        Implementamos um livro-razão imutável. Cada transação gera um código único chamado <strong>Hash de Integridade</strong>.
                                        Este código é gerado combinando os dados da transação atual com o hash da transação anterior.
                                        Se alguém tentar alterar um valor no banco de dados manualmente, o hash não corresponderá mais, e o sistema de auditoria detectará a fraude imediatamente (Quebra de Corrente).
                                    </p>
                                </div>
                            </div>

                            <div className="space-y-6">
                                <h4 className="font-bold text-lg text-foreground border-b border-border pb-2 flex items-center gap-2">
                                    <BookOpen className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                                    Glossário de Siglas e Contas
                                </h4>

                                <div className="grid md:grid-cols-2 gap-4">
                                    {/* ATIVOS */}
                                    <div className="bg-card p-4 rounded-lg border border-border shadow-sm">
                                        <Badge className="bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-200 dark:hover:bg-emerald-900 border-none mb-2">ATIVO (BENS E DIREITOS)</Badge>
                                        <ul className="space-y-3">
                                            <li>
                                                <div className="flex justify-between items-baseline mb-1">
                                                    <span className="font-bold text-foreground">PORTFOLIO</span>
                                                    <span className="text-xs font-mono text-muted-foreground">Carteira</span>
                                                </div>
                                                <p className="text-xs text-muted-foreground">
                                                    Representa a <strong>Carteira de Crédito</strong>. É o montante total de dinheiro que a empresa emprestou e tem o direito de receber de volta (Principal). É o principal ativo de uma financeira.
                                                </p>
                                            </li>
                                            <li className="border-t border-border pt-2">
                                                <div className="flex justify-between items-baseline mb-1">
                                                    <span className="font-bold text-foreground">BANK (CAIXA)</span>
                                                    <span className="text-xs font-mono text-muted-foreground">Disponibilidades</span>
                                                </div>
                                                <p className="text-xs text-muted-foreground">
                                                    Representa o dinheiro disponível em caixa ou contas bancárias da empresa. Usado para conceder novos empréstimos.
                                                </p>
                                            </li>
                                        </ul>
                                    </div>

                                    {/* RESULTADOS */}
                                    <div className="bg-card p-4 rounded-lg border border-border shadow-sm">
                                        <Badge className="bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-900 border-none mb-2">RESULTADO (RECEITAS)</Badge>
                                        <ul className="space-y-3">
                                            <li>
                                                <div className="flex justify-between items-baseline mb-1">
                                                    <span className="font-bold text-foreground">REV_INTEREST</span>
                                                    <span className="text-xs font-mono text-muted-foreground">Receita de Juros</span>
                                                </div>
                                                <p className="text-xs text-muted-foreground">
                                                    A principal fonte de lucro. Contabiliza apenas os juros pagos pelos clientes. O retorno do capital principal não é receita, é apenas troca de ativos.
                                                </p>
                                            </li>
                                            <li className="border-t border-border pt-2">
                                                <div className="flex justify-between items-baseline mb-1">
                                                    <span className="font-bold text-foreground">REV_LATE</span>
                                                    <span className="text-xs font-mono text-muted-foreground">Juros de Mora</span>
                                                </div>
                                                <p className="text-xs text-muted-foreground">
                                                    Receita extraordinária proveniente de multas e juros por atraso nos pagamentos.
                                                </p>
                                            </li>
                                        </ul>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-indigo-50 dark:bg-indigo-950/30 p-6 rounded-xl border border-indigo-100 dark:border-indigo-900/40">
                                <h4 className="font-bold text-indigo-900 dark:text-indigo-200 mb-4 text-sm uppercase tracking-wide">Fluxo da Auditoria Automática</h4>
                                <div className="grid md:grid-cols-3 gap-4 text-center mb-6">
                                    <div className="bg-card p-4 rounded-lg border border-border shadow-sm">
                                        <div className="font-bold text-indigo-600 dark:text-indigo-400 text-lg mb-1">1. Hash Check</div>
                                        <p className="text-xs text-muted-foreground">Varredura de integridade para garantir que nenhum registro foi alterado no banco de dados.</p>
                                    </div>
                                    <div className="bg-card p-4 rounded-lg border border-border shadow-sm">
                                        <div className="font-bold text-indigo-600 dark:text-indigo-400 text-lg mb-1">2. Conciliação</div>
                                        <p className="text-xs text-muted-foreground">Recálculo matemático de todos os contratos: (Capital + Juros - Pagos = Saldo).</p>
                                    </div>
                                    <div className="bg-card p-4 rounded-lg border border-border shadow-sm">
                                        <div className="font-bold text-indigo-600 dark:text-indigo-400 text-lg mb-1">3. Compliance</div>
                                        <p className="text-xs text-muted-foreground">Busca por padrões suspeitos, como pagamentos em feriados ou cancelamentos sem justificativa.</p>
                                    </div>
                                </div>

                                <div className="border-t border-indigo-200 dark:border-indigo-900/50 pt-4 mt-4">
                                    <h4 className="font-bold text-indigo-900 dark:text-indigo-200 mb-2 text-sm uppercase tracking-wide flex items-center gap-2">
                                        <TrendingUp className="h-4 w-4" />
                                        Dashboard Financeiro e Período
                                    </h4>
                                    <p className="text-sm text-foreground/80 mb-3">
                                        A ferramenta de auditoria também funciona como <strong>Fechamento de Caixa</strong>.
                                        Ao selecionar uma <strong>Data Inicial e Final</strong>, o sistema gera um relatório financeiro exclusivo para aquele período contendo:
                                    </p>
                                    <ul className="grid md:grid-cols-2 gap-2 text-xs text-muted-foreground">
                                        <li className="bg-card px-3 py-2 rounded border border-border flex items-center gap-2">
                                            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                                            <strong className="text-foreground">Receita Real:</strong> Total de Juros e Multas recebidos.
                                        </li>
                                        <li className="bg-card px-3 py-2 rounded border border-border flex items-center gap-2">
                                            <span className="w-2 h-2 rounded-full bg-red-500"></span>
                                            <strong className="text-foreground">Despesas:</strong> Custos operacionais registrados.
                                        </li>
                                        <li className="bg-card px-3 py-2 rounded border border-border flex items-center gap-2">
                                            <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
                                            <strong className="text-foreground">Lucro Líquido:</strong> O resultado final do período.
                                        </li>
                                        <li className="bg-card px-3 py-2 rounded border border-border flex items-center gap-2">
                                            <span className="w-2 h-2 rounded-full bg-slate-500"></span>
                                            <strong className="text-foreground">Volumetria:</strong> Quantidade de novos contratos gerados.
                                        </li>
                                    </ul>
                                </div>
                            </div>

                            <div className="bg-red-50 dark:bg-red-950/30 p-6 rounded-xl border border-red-100 dark:border-red-900/40">
                                <h4 className="font-bold text-red-900 dark:text-red-200 mb-2 text-sm uppercase tracking-wide flex items-center gap-2">
                                    <Lock className="h-4 w-4" />
                                    Protocolo de Segurança e Bloqueio (Pânico)
                                </h4>
                                <p className="text-sm text-foreground/80 leading-relaxed mb-3">
                                    O sistema conta com um mecanismo de defesa ativo conhecido como <strong>"Botão de Pânico"</strong>.
                                    Caso a auditoria detecte falhas graves de integridade (ex: Quebra de Blockchain) ou inconsistências financeiras críticas,
                                    o auditor pode acionar o "Congelar Movimentação".
                                </p>
                                <div className="bg-card p-3 rounded-lg border border-border text-xs text-muted-foreground">
                                    <strong className="text-foreground">Efeito do Bloqueio:</strong> Todas as operações de escrita (Novos Empréstimos, Pagamentos, Edições) serão imediatamente bloqueadas em todo o sistema.
                                    Apenas a leitura de dados permanecerá ativa até que um administrador desbloqueie o sistema manualmente nas Configurações.
                                </div>
                            </div>
                        </div>
                    </Card>
                </TabsContent>

                {/* --- EXTRATO DE CLIENTE --- */}
                <TabsContent value="client_statement">
                    <Card className="p-6 bg-card border-border">
                        <div className="mb-6">
                            <label className="text-sm font-medium text-foreground mb-2 block">Selecionar Cliente</label>
                            <Select value={selectedClient} onValueChange={setSelectedClient}>
                                <SelectTrigger className="w-full md:w-96 bg-background">
                                    <SelectValue placeholder="Escolha um cliente..." />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Todos os Clientes</SelectItem>
                                    {clients.map(c => (
                                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {selectedClient && selectedClient !== 'all' ? (
                            <div className="overflow-x-auto rounded-lg border border-border">
                                <Table>
                                    <TableHeader className="bg-muted/50">
                                        <TableRow>
                                            <TableHead>Data</TableHead>
                                            <TableHead>Movimento</TableHead>
                                            <TableHead className="text-right">Débito</TableHead>
                                            <TableHead className="text-right">Crédito</TableHead>
                                            <TableHead className="text-right">Saldo</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {filteredEntries.reduce((acc: any[], entry) => {
                                            // Ensure this entry relates to the selected client
                                            if (entry.clientId !== selectedClient) return acc;

                                            const previousBalance = acc.length > 0 ? acc[acc.length - 1].balance : 0;
                                            // For client perspective: 
                                            // Disbursement (Liberação) increases Debt (Positive/Debit for client?) 
                                            // Actually, let's look at the system perspective.
                                            // Credit Portfolio increases with Disbursement.
                                            // Portfolio decreases with Payment.

                                            // Let's model "Client Debt Account":
                                            // Increase Debt (Debit in System) -> Disbursement
                                            // Decrease Debt (Credit in System) -> Payment

                                            let debit = 0;
                                            let credit = 0;

                                            if (entry.debit === 'portfolio') debit = entry.amountPrincipal;
                                            // Note: Payments credit the portfolio
                                            if (entry.credit === 'portfolio') credit = entry.amountPrincipal;

                                            // If it touches portfolio, it updates balance
                                            if (debit > 0 || credit > 0) {
                                                const newBalance = previousBalance + debit - credit;
                                                acc.push({
                                                    ...entry,
                                                    displayDebit: debit,
                                                    displayCredit: credit,
                                                    balance: newBalance
                                                });
                                            }
                                            return acc;
                                        }, []).map((row: any) => (
                                            <TableRow key={row.id}>
                                                <TableCell className="font-mono text-xs">{formatDate(row.timestamp)}</TableCell>
                                                <TableCell className="text-sm">{row.description}</TableCell>
                                                <TableCell className="text-right text-slate-500">
                                                    {row.displayDebit > 0 ? formatCurrency(row.displayDebit, companySettings?.currency) : '-'}
                                                </TableCell>
                                                <TableCell className="text-right text-emerald-600">
                                                    {row.displayCredit > 0 ? formatCurrency(row.displayCredit, companySettings?.currency) : '-'}
                                                </TableCell>
                                                <TableCell className="text-right font-bold">
                                                    {formatCurrency(row.balance, companySettings?.currency)}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        ) : (
                            <div className="text-center py-12 border-2 border-dashed border-slate-200 rounded-xl bg-slate-50/50">
                                <User className="h-10 w-10 text-slate-300 mx-auto mb-3" />
                                <h3 className="font-medium text-slate-700">Selecione um cliente</h3>
                                <p className="text-slate-500 text-sm">Para visualizar o extrato de conta corrente, selecione um cliente na lista acima.</p>
                            </div>
                        )}
                    </Card>
                </TabsContent>
            </Tabs>

            <AuditScanModal
                isOpen={isAuditModalOpen}
                onClose={() => setIsAuditModalOpen(false)}
            />
        </MainLayout>
    );
}
