import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/componentes/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/componentes/ui/table';
import { formatCurrency } from '@/bibliotecas/formatters';
import { Credit, Client, Payment } from '@/tipos/credito';
import { Badge } from '@/componentes/ui/badge';
import {
    Users,
    ArrowUpRight,
    TrendingUp,
    TrendingDown,
    ArrowDownLeft,
    Search,
    X,
    Info,
    Coins,
    Clock,
    Wallet,
    Percent,
    Filter
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Input } from '@/componentes/ui/input';

interface PeriodMetricDetailsModalProps {
    isOpen: boolean;
    onClose: () => void;
    type: 'clients' | 'capital' | 'projected' | 'outstanding' | 'realized' | '';
    periodLabel: string;
    credits: Credit[];
    clients: Client[];
    payments: Payment[];
    allPayments: Payment[]; // Needed for outstanding calculation of all historical payments for active credits
    companySettings?: any;
}

export function PeriodMetricDetailsModal({
    isOpen,
    onClose,
    type,
    periodLabel,
    credits = [],
    clients = [],
    payments = [],
    allPayments = [],
    companySettings
}: PeriodMetricDetailsModalProps) {
    const [searchTerm, setSearchTerm] = useState('');
    const [methodFilter, setMethodFilter] = useState('all');

    const currency = companySettings?.currency || 'AOA';

    const modalConfig = useMemo(() => {
        const term = searchTerm.toLowerCase().trim();

        switch (type) {
            case 'clients': {
                const clientGroups = credits.reduce((acc, c) => {
                    const client = clients.find(cl => cl.id === c.clientId);
                    const key = c.clientId || c.clientName;
                    if (!acc[key]) {
                        acc[key] = {
                            id: key,
                            name: c.clientName,
                            nif: client?.nif || 'Não informado',
                            phone: client?.phone || 'Não informado',
                            contractsCount: 0,
                            totalPrincipal: 0
                        };
                    }
                    acc[key].contractsCount++;
                    acc[key].totalPrincipal += Number(c.principalAmount || 0);
                    return acc;
                }, {} as Record<string, any>);

                const allList = Object.values(clientGroups);
                const filteredList = allList.filter((g: any) =>
                    g.name.toLowerCase().includes(term) || g.nif.toLowerCase().includes(term) || g.phone.toLowerCase().includes(term)
                );

                const totalClientsCount = allList.length;
                const totalContractsCount = allList.reduce((sum: number, g: any) => sum + g.contractsCount, 0);
                const totalPrincipalAll = allList.reduce((sum: number, g: any) => sum + g.totalPrincipal, 0);
                const avgTicket = totalClientsCount > 0 ? totalPrincipalAll / totalClientsCount : 0;

                const filteredContractsSum = filteredList.reduce((sum: number, g: any) => sum + g.contractsCount, 0);
                const filteredPrincipalSum = filteredList.reduce((sum: number, g: any) => sum + g.totalPrincipal, 0);

                return {
                    title: 'Clientes do Período',
                    icon: <Users className="h-6 w-6 text-indigo-400" />,
                    formula: 'Clientes do Período = Contagem e listagem detalhada de clientes com novos contratos iniciados no período selecionado.',
                    statCards: [
                        {
                            label: 'Total Clientes Únicos',
                            value: `${totalClientsCount}`,
                            subtext: 'Clientes com créditos iniciados',
                            border: 'border-l-indigo-500',
                            textColor: 'text-indigo-600 dark:text-indigo-400',
                            icon: <Users className="h-4 w-4 text-indigo-500" />
                        },
                        {
                            label: 'Contratos Criados',
                            value: `${totalContractsCount}`,
                            subtext: 'Total de operações no período',
                            border: 'border-l-blue-500',
                            textColor: 'text-blue-600 dark:text-blue-400',
                            icon: <TrendingUp className="h-4 w-4 text-blue-500" />
                        },
                        {
                            label: 'Capital Total Financiado',
                            value: formatCurrency(totalPrincipalAll, currency),
                            subtext: 'Volume total concedido',
                            border: 'border-l-emerald-500',
                            textColor: 'text-emerald-600 dark:text-emerald-400',
                            icon: <Wallet className="h-4 w-4 text-emerald-500" />
                        },
                        {
                            label: 'Ticket Médio por Cliente',
                            value: formatCurrency(avgTicket, currency),
                            subtext: 'Média concedida por cliente',
                            border: 'border-l-amber-500',
                            textColor: 'text-amber-600 dark:text-amber-400',
                            icon: <Percent className="h-4 w-4 text-amber-500" />
                        }
                    ],
                    totalItemsCount: allList.length,
                    filteredCount: filteredList.length,
                    hasMethodFilter: false,
                    table: (
                        <Table>
                            <TableHeader className="bg-muted/70 sticky top-0 z-10">
                                <TableRow>
                                    <TableHead className="font-bold text-xs">Cliente</TableHead>
                                    <TableHead className="font-bold text-xs">NIF</TableHead>
                                    <TableHead className="font-bold text-xs">Telefone</TableHead>
                                    <TableHead className="font-bold text-xs text-center">Contratos Criados</TableHead>
                                    <TableHead className="font-bold text-xs text-right">Capital Emprestado</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody className="divide-y">
                                {filteredList.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={5} className="text-center py-10 text-muted-foreground text-xs italic">
                                            Nenhum cliente encontrado para os filtros ativos.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    filteredList.map((g: any) => (
                                        <TableRow key={g.id} className="hover:bg-muted/30 transition-colors">
                                            <TableCell className="font-bold text-xs text-foreground">{g.name}</TableCell>
                                            <TableCell className="text-xs font-mono text-muted-foreground">{g.nif}</TableCell>
                                            <TableCell className="text-xs font-mono text-muted-foreground">{g.phone}</TableCell>
                                            <TableCell className="text-xs font-bold text-center">
                                                <Badge variant="secondary" className="font-bold text-[10px]">
                                                    {g.contractsCount} {g.contractsCount === 1 ? 'contrato' : 'contratos'}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-xs font-black text-right text-emerald-600 dark:text-emerald-400">
                                                {formatCurrency(g.totalPrincipal, currency)}
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                            <TableFooter className="bg-muted/80 font-bold text-xs">
                                <TableRow>
                                    <TableCell colSpan={3} className="p-3 text-left">
                                        TOTAIS ({filteredList.length} clientes)
                                    </TableCell>
                                    <TableCell className="p-3 text-center text-foreground font-black">
                                        {filteredContractsSum}
                                    </TableCell>
                                    <TableCell className="p-3 text-right font-black text-emerald-600 dark:text-emerald-400">
                                        {formatCurrency(filteredPrincipalSum, currency)}
                                    </TableCell>
                                </TableRow>
                            </TableFooter>
                        </Table>
                    )
                };
            }
            case 'capital': {
                const getPaidPrincipal = (c: Credit) => {
                    return allPayments
                        .filter(p => p.creditId === c.id && p.status !== 'cancelled' && !p.deletedAt)
                        .reduce((sum, p) => sum + Number(p.allocatedToPrincipal || 0), 0);
                };

                const getRemainingPrincipal = (c: Credit) => {
                    const paid = getPaidPrincipal(c);
                    return Math.max(0, Number(c.principalAmount || 0) - paid);
                };

                const allList = credits.map(c => ({
                    credit: c,
                    paid: getPaidPrincipal(c),
                    remaining: getRemainingPrincipal(c)
                }));

                const filteredList = allList.filter(item =>
                    item.credit.clientName.toLowerCase().includes(term) || item.credit.id.toLowerCase().includes(term)
                );

                const totalPrincipalAll = credits.reduce((sum, c) => sum + Number(c.principalAmount || 0), 0);
                const totalPaidAll = allList.reduce((sum, item) => sum + item.paid, 0);
                const totalRemainingAll = allList.reduce((sum, item) => sum + item.remaining, 0);
                const recoveryRate = totalPrincipalAll > 0 ? Math.round((totalPaidAll / totalPrincipalAll) * 100) : 0;

                const filteredInitialSum = filteredList.reduce((s, i) => s + Number(i.credit.principalAmount || 0), 0);
                const filteredPaidSum = filteredList.reduce((s, i) => s + i.paid, 0);
                const filteredRemainingSum = filteredList.reduce((s, i) => s + i.remaining, 0);

                return {
                    title: 'Capital Aplicado Ativo (Saídas Líquidas)',
                    icon: <ArrowUpRight className="h-6 w-6 text-rose-400" />,
                    formula: 'Capital Aplicado Ativo = Soma do capital inicial dos créditos concedidos no período, deduzido de todos os pagamentos/amortizações de principal já efetuados para os mesmos créditos.',
                    statCards: [
                        {
                            label: 'Capital Restante Ativo',
                            value: formatCurrency(totalRemainingAll, currency),
                            subtext: 'Saldo pendente em carteira',
                            border: 'border-l-rose-500',
                            textColor: 'text-rose-600 dark:text-rose-400',
                            icon: <ArrowUpRight className="h-4 w-4 text-rose-500" />
                        },
                        {
                            label: 'Capital Inicial Concedido',
                            value: formatCurrency(totalPrincipalAll, currency),
                            subtext: `${credits.length} contratos concedidos`,
                            border: 'border-l-blue-500',
                            textColor: 'text-blue-600 dark:text-blue-400',
                            icon: <Wallet className="h-4 w-4 text-blue-500" />
                        },
                        {
                            label: 'Capital Já Amortizado',
                            value: formatCurrency(totalPaidAll, currency),
                            subtext: 'Principal recuperado até ao momento',
                            border: 'border-l-emerald-500',
                            textColor: 'text-emerald-600 dark:text-emerald-400',
                            icon: <ArrowDownLeft className="h-4 w-4 text-emerald-500" />
                        },
                        {
                            label: 'Taxa de Amortização',
                            value: `${recoveryRate}%`,
                            subtext: 'Percentual do principal recuperado',
                            border: 'border-l-teal-500',
                            textColor: 'text-teal-600 dark:text-teal-400',
                            icon: <Percent className="h-4 w-4 text-teal-500" />
                        }
                    ],
                    totalItemsCount: allList.length,
                    filteredCount: filteredList.length,
                    hasMethodFilter: false,
                    table: (
                        <Table>
                            <TableHeader className="bg-muted/70 sticky top-0 z-10">
                                <TableRow>
                                    <TableHead className="font-bold text-xs">ID Crédito</TableHead>
                                    <TableHead className="font-bold text-xs">Cliente</TableHead>
                                    <TableHead className="font-bold text-xs text-right">Capital Inicial</TableHead>
                                    <TableHead className="font-bold text-xs text-right">Capital Pago</TableHead>
                                    <TableHead className="font-bold text-xs text-right">Capital Restante</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody className="divide-y">
                                {filteredList.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={5} className="text-center py-10 text-muted-foreground text-xs italic">
                                            Nenhum registo encontrado para os filtros ativos.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    filteredList.map(({ credit: c, paid, remaining }) => (
                                        <TableRow key={c.id} className="hover:bg-muted/30 transition-colors">
                                            <TableCell className="p-3">
                                                <span className="font-mono text-[11px] font-semibold text-primary bg-primary/5 px-2 py-0.5 rounded-md border border-primary/20">
                                                    {c.id}
                                                </span>
                                            </TableCell>
                                            <TableCell className="p-3 font-bold text-xs text-foreground">{c.clientName}</TableCell>
                                            <TableCell className="p-3 text-xs font-semibold text-right text-foreground">
                                                {formatCurrency(c.principalAmount, currency)}
                                            </TableCell>
                                            <TableCell className="p-3 text-xs font-semibold text-right text-emerald-600 dark:text-emerald-400">
                                                {formatCurrency(paid, currency)}
                                            </TableCell>
                                            <TableCell className="p-3 text-xs font-black text-right text-rose-600 dark:text-rose-400">
                                                {formatCurrency(remaining, currency)}
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                            <TableFooter className="bg-muted/80 font-bold text-xs">
                                <TableRow>
                                    <TableCell colSpan={2} className="p-3 text-left">
                                        TOTAIS ({filteredList.length} contratos)
                                    </TableCell>
                                    <TableCell className="p-3 text-right text-foreground">
                                        {formatCurrency(filteredInitialSum, currency)}
                                    </TableCell>
                                    <TableCell className="p-3 text-right text-emerald-600 dark:text-emerald-400">
                                        {formatCurrency(filteredPaidSum, currency)}
                                    </TableCell>
                                    <TableCell className="p-3 text-right font-black text-rose-600 dark:text-rose-400">
                                        {formatCurrency(filteredRemainingSum, currency)}
                                    </TableCell>
                                </TableRow>
                            </TableFooter>
                        </Table>
                    )
                };
            }
            case 'projected': {
                const allList = credits;
                const filteredList = allList.filter(c =>
                    c.clientName.toLowerCase().includes(term) || c.id.toLowerCase().includes(term)
                );

                const totalInterestAll = credits.reduce((sum, c) => sum + Number(c.accruedInterest || 0), 0);
                const totalPrincipalAll = credits.reduce((sum, c) => sum + Number(c.principalAmount || 0), 0);
                const avgRate = credits.length > 0 ? (credits.reduce((sum, c) => sum + Number(c.interestRate || 0), 0) / credits.length).toFixed(1) : '0';

                const filteredPrincipalSum = filteredList.reduce((s, c) => s + Number(c.principalAmount || 0), 0);
                const filteredInterestSum = filteredList.reduce((s, c) => s + Number(c.accruedInterest || 0), 0);

                return {
                    title: 'Lucro Projetado (Juros Previstos)',
                    icon: <TrendingUp className="h-6 w-6 text-blue-400" />,
                    formula: 'Lucro Projetado = Soma dos juros iniciais contratuais de todos os créditos concedidos no período.',
                    statCards: [
                        {
                            label: 'Total Juros Previstos',
                            value: formatCurrency(totalInterestAll, currency),
                            subtext: 'Receita futura estimada',
                            border: 'border-l-blue-500',
                            textColor: 'text-blue-600 dark:text-blue-400',
                            icon: <TrendingUp className="h-4 w-4 text-blue-500" />
                        },
                        {
                            label: 'Capital Financiado Base',
                            value: formatCurrency(totalPrincipalAll, currency),
                            subtext: `${credits.length} contratos concedidos`,
                            border: 'border-l-indigo-500',
                            textColor: 'text-indigo-600 dark:text-indigo-400',
                            icon: <Wallet className="h-4 w-4 text-indigo-500" />
                        },
                        {
                            label: 'Taxa Média de Juro',
                            value: `${avgRate}%`,
                            subtext: 'Média contratual do período',
                            border: 'border-l-amber-500',
                            textColor: 'text-amber-600 dark:text-amber-400',
                            icon: <Percent className="h-4 w-4 text-amber-500" />
                        },
                        {
                            label: 'Retorno Previsto Total',
                            value: formatCurrency(totalPrincipalAll + totalInterestAll, currency),
                            subtext: 'Capital + Juros contratados',
                            border: 'border-l-emerald-500',
                            textColor: 'text-emerald-600 dark:text-emerald-400',
                            icon: <Coins className="h-4 w-4 text-emerald-500" />
                        }
                    ],
                    totalItemsCount: allList.length,
                    filteredCount: filteredList.length,
                    hasMethodFilter: false,
                    table: (
                        <Table>
                            <TableHeader className="bg-muted/70 sticky top-0 z-10">
                                <TableRow>
                                    <TableHead className="font-bold text-xs">ID Crédito</TableHead>
                                    <TableHead className="font-bold text-xs">Cliente</TableHead>
                                    <TableHead className="font-bold text-xs text-right">Capital Base</TableHead>
                                    <TableHead className="font-bold text-xs text-center">Prazo / Parcelas</TableHead>
                                    <TableHead className="font-bold text-xs text-center">Taxa de Juro</TableHead>
                                    <TableHead className="font-bold text-xs text-right">Juros Projetados</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody className="divide-y">
                                {filteredList.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={6} className="text-center py-10 text-muted-foreground text-xs italic">
                                            Nenhum registo encontrado para os filtros ativos.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    filteredList.map((c) => (
                                        <TableRow key={c.id} className="hover:bg-muted/30 transition-colors">
                                            <TableCell className="p-3">
                                                <span className="font-mono text-[11px] font-semibold text-primary bg-primary/5 px-2 py-0.5 rounded-md border border-primary/20">
                                                    {c.id}
                                                </span>
                                            </TableCell>
                                            <TableCell className="p-3 font-bold text-xs text-foreground">{c.clientName}</TableCell>
                                            <TableCell className="p-3 text-xs font-semibold text-right text-foreground">
                                                {formatCurrency(c.principalAmount, currency)}
                                            </TableCell>
                                            <TableCell className="p-3 text-xs text-center font-medium">
                                                {c.installments} parcelas
                                            </TableCell>
                                            <TableCell className="p-3 text-xs text-center font-bold text-indigo-600">
                                                {c.interestRate}%
                                            </TableCell>
                                            <TableCell className="p-3 text-xs font-black text-right text-blue-600 dark:text-blue-400">
                                                {formatCurrency(c.accruedInterest, currency)}
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                            <TableFooter className="bg-muted/80 font-bold text-xs">
                                <TableRow>
                                    <TableCell colSpan={2} className="p-3 text-left">
                                        TOTAIS ({filteredList.length} contratos)
                                    </TableCell>
                                    <TableCell className="p-3 text-right text-foreground font-bold">
                                        {formatCurrency(filteredPrincipalSum, currency)}
                                    </TableCell>
                                    <TableCell colSpan={2}></TableCell>
                                    <TableCell className="p-3 text-right font-black text-blue-600 dark:text-blue-400">
                                        {formatCurrency(filteredInterestSum, currency)}
                                    </TableCell>
                                </TableRow>
                            </TableFooter>
                        </Table>
                    )
                };
            }
            case 'outstanding': {
                const activePeriodCredits = credits.filter(c => c.status === 'active');

                const getPaidPrincipal = (c: Credit) => {
                    return allPayments
                        .filter(p => p.creditId === c.id && p.status !== 'cancelled' && !p.deletedAt)
                        .reduce((sum, p) => sum + Number(p.allocatedToPrincipal || 0), 0);
                };

                const getRemainingPrincipal = (c: Credit) => {
                    const paid = getPaidPrincipal(c);
                    return Math.max(0, Number(c.principalAmount || 0) - paid);
                };

                const allList = activePeriodCredits.map(c => ({
                    credit: c,
                    paid: getPaidPrincipal(c),
                    remaining: getRemainingPrincipal(c)
                }));

                const filteredList = allList.filter(item =>
                    item.credit.clientName.toLowerCase().includes(term) || item.credit.id.toLowerCase().includes(term)
                );

                const totalOutstandingAll = allList.reduce((sum, item) => sum + item.remaining, 0);
                const totalInitialActive = activePeriodCredits.reduce((sum, c) => sum + Number(c.principalAmount || 0), 0);
                const totalAmortizedActive = allList.reduce((sum, item) => sum + item.paid, 0);

                const filteredInitialSum = filteredList.reduce((s, i) => s + Number(i.credit.principalAmount || 0), 0);
                const filteredPaidSum = filteredList.reduce((s, i) => s + i.paid, 0);
                const filteredOutstandingSum = filteredList.reduce((s, i) => s + i.remaining, 0);

                return {
                    title: 'Saldo em Aberto (Principal Restante)',
                    icon: <TrendingDown className="h-6 w-6 text-amber-400" />,
                    formula: 'Saldo em Aberto = Principal Inicial dos contratos ativos deste período - Principal Amortizado. Apenas reflete contratos em estado Ativo.',
                    statCards: [
                        {
                            label: 'Total Principal em Aberto',
                            value: formatCurrency(totalOutstandingAll, currency),
                            subtext: 'Saldo pendente a receber',
                            border: 'border-l-amber-500',
                            textColor: 'text-amber-600 dark:text-amber-400',
                            icon: <TrendingDown className="h-4 w-4 text-amber-500" />
                        },
                        {
                            label: 'Capital Inicial Concedido',
                            value: formatCurrency(totalInitialActive, currency),
                            subtext: `${activePeriodCredits.length} contratos ativos`,
                            border: 'border-l-blue-500',
                            textColor: 'text-blue-600 dark:text-blue-400',
                            icon: <Wallet className="h-4 w-4 text-blue-500" />
                        },
                        {
                            label: 'Principal Já Amortizado',
                            value: formatCurrency(totalAmortizedActive, currency),
                            subtext: 'Recuperado dos contratos ativos',
                            border: 'border-l-emerald-500',
                            textColor: 'text-emerald-600 dark:text-emerald-400',
                            icon: <ArrowDownLeft className="h-4 w-4 text-emerald-500" />
                        },
                        {
                            label: 'Contratos Ativos',
                            value: `${activePeriodCredits.length} Contratos`,
                            subtext: 'Em regime de cobrança',
                            border: 'border-l-indigo-500',
                            textColor: 'text-indigo-600 dark:text-indigo-400',
                            icon: <Coins className="h-4 w-4 text-indigo-500" />
                        }
                    ],
                    totalItemsCount: allList.length,
                    filteredCount: filteredList.length,
                    hasMethodFilter: false,
                    table: (
                        <Table>
                            <TableHeader className="bg-muted/70 sticky top-0 z-10">
                                <TableRow>
                                    <TableHead className="font-bold text-xs">ID Crédito</TableHead>
                                    <TableHead className="font-bold text-xs">Cliente</TableHead>
                                    <TableHead className="font-bold text-xs text-right">Capital Inicial</TableHead>
                                    <TableHead className="font-bold text-xs text-right">Principal Amortizado</TableHead>
                                    <TableHead className="font-bold text-xs text-right">Saldo Restante</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody className="divide-y">
                                {filteredList.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={5} className="text-center py-10 text-muted-foreground text-xs italic">
                                            Nenhum contrato ativo encontrado para os filtros.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    filteredList.map(({ credit: c, paid, remaining }) => (
                                        <TableRow key={c.id} className="hover:bg-muted/30 transition-colors">
                                            <TableCell className="p-3">
                                                <span className="font-mono text-[11px] font-semibold text-primary bg-primary/5 px-2 py-0.5 rounded-md border border-primary/20">
                                                    {c.id}
                                                </span>
                                            </TableCell>
                                            <TableCell className="p-3 font-bold text-xs text-foreground">{c.clientName}</TableCell>
                                            <TableCell className="p-3 text-xs font-semibold text-right text-foreground">
                                                {formatCurrency(c.principalAmount, currency)}
                                            </TableCell>
                                            <TableCell className="p-3 text-xs font-semibold text-right text-emerald-600 dark:text-emerald-400">
                                                {formatCurrency(paid, currency)}
                                            </TableCell>
                                            <TableCell className="p-3 text-xs font-black text-right text-amber-600 dark:text-amber-400">
                                                {formatCurrency(remaining, currency)}
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                            <TableFooter className="bg-muted/80 font-bold text-xs">
                                <TableRow>
                                    <TableCell colSpan={2} className="p-3 text-left">
                                        TOTAIS ({filteredList.length} contratos)
                                    </TableCell>
                                    <TableCell className="p-3 text-right text-foreground">
                                        {formatCurrency(filteredInitialSum, currency)}
                                    </TableCell>
                                    <TableCell className="p-3 text-right text-emerald-600 dark:text-emerald-400">
                                        {formatCurrency(filteredPaidSum, currency)}
                                    </TableCell>
                                    <TableCell className="p-3 text-right font-black text-amber-600 dark:text-amber-400">
                                        {formatCurrency(filteredOutstandingSum, currency)}
                                    </TableCell>
                                </TableRow>
                            </TableFooter>
                        </Table>
                    )
                };
            }
            case 'realized': {
                // Pagamentos recebidos no período
                const allList = payments.filter(p => p.status !== 'cancelled' && !p.deletedAt);

                const filteredList = allList.filter(p => {
                    const matchesSearch = !term ||
                        p.clientName.toLowerCase().includes(term) ||
                        (p.reference && p.reference.toLowerCase().includes(term)) ||
                        p.id.toLowerCase().includes(term);

                    const methodLabel = p.method === 'cash' ? 'numerário' :
                        p.method === 'transfer' ? 'transferência' :
                        p.method === 'reference' ? 'multicaixa' :
                        p.method === 'deposit' ? 'depósito' :
                        String(p.method || 'numerário').toLowerCase();

                    const matchesMethod = methodFilter === 'all' || methodLabel === methodFilter.toLowerCase();

                    return matchesSearch && matchesMethod;
                });

                const totalInterestAll = allList.reduce((sum, p) => sum + Number(p.allocatedToInterest || 0), 0);
                const totalLateAll = allList.reduce((sum, p) => sum + Number(p.allocatedToLateInterest || 0), 0);
                const totalProfitAll = totalInterestAll + totalLateAll;
                const totalPrincipalAll = allList.reduce((sum, p) => sum + Number(p.allocatedToPrincipal || 0), 0);
                const totalVolumeAll = totalPrincipalAll + totalProfitAll;

                const filteredPrincipalSum = filteredList.reduce((s, p) => s + Number(p.allocatedToPrincipal || 0), 0);
                const filteredInterestSum = filteredList.reduce((s, p) => s + Number(p.allocatedToInterest || 0), 0);
                const filteredLateSum = filteredList.reduce((s, p) => s + Number(p.allocatedToLateInterest || 0), 0);
                const filteredProfitSum = filteredInterestSum + filteredLateSum;
                const filteredTotalSum = filteredList.reduce((s, p) => s + (Number(p.amount) || (Number(p.allocatedToPrincipal || 0) + Number(p.allocatedToInterest || 0) + Number(p.allocatedToLateInterest || 0))), 0);

                return {
                    title: 'Lucro Recebido (Juros & Moras)',
                    icon: <ArrowDownLeft className="h-6 w-6 text-emerald-400" />,
                    formula: 'Lucro Recebido = Soma de todos os valores de juros e multas (juros de mora) cobrados em pagamentos recebidos dentro deste período específico (Regime de Caixa real).',
                    statCards: [
                        {
                            label: 'Total Lucro Recebido',
                            value: formatCurrency(totalProfitAll, currency),
                            subtext: 'Juros contratuais + Moras cobradas',
                            border: 'border-l-emerald-500',
                            textColor: 'text-emerald-600 dark:text-emerald-400',
                            icon: <Coins className="h-4 w-4 text-emerald-500" />
                        },
                        {
                            label: 'Juros Contratuais Cobrados',
                            value: formatCurrency(totalInterestAll, currency),
                            subtext: 'Receita de juros ordinários realizada',
                            border: 'border-l-blue-500',
                            textColor: 'text-blue-600 dark:text-blue-400',
                            icon: <TrendingUp className="h-4 w-4 text-blue-500" />
                        },
                        {
                            label: 'Multas & Moras Recebidas',
                            value: formatCurrency(totalLateAll, currency),
                            subtext: 'Penalizações por atraso cobradas',
                            border: 'border-l-amber-500',
                            textColor: 'text-amber-600 dark:text-amber-400',
                            icon: <Clock className="h-4 w-4 text-amber-500" />
                        },
                        {
                            label: 'Volume Total Amortizado',
                            value: formatCurrency(totalVolumeAll, currency),
                            subtext: `${allList.length} pagamentos auditados no período`,
                            border: 'border-l-indigo-500',
                            textColor: 'text-indigo-600 dark:text-indigo-400',
                            icon: <Wallet className="h-4 w-4 text-indigo-500" />
                        }
                    ],
                    totalItemsCount: allList.length,
                    filteredCount: filteredList.length,
                    hasMethodFilter: true,
                    table: (
                        <Table>
                            <TableHeader className="bg-muted/70 sticky top-0 z-10">
                                <TableRow>
                                    <TableHead className="font-bold text-xs">Recibo / Ref</TableHead>
                                    <TableHead className="font-bold text-xs">Cliente</TableHead>
                                    <TableHead className="font-bold text-xs">Data Pagamento</TableHead>
                                    <TableHead className="font-bold text-xs">Método / Canal</TableHead>
                                    <TableHead className="font-bold text-xs text-right">Capital Amortizado</TableHead>
                                    <TableHead className="font-bold text-xs text-right">Juros Recebidos</TableHead>
                                    <TableHead className="font-bold text-xs text-right">Multas Recebidas</TableHead>
                                    <TableHead className="font-bold text-xs text-right">Lucro Total</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody className="divide-y">
                                {filteredList.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={8} className="text-center py-10 text-muted-foreground text-xs italic">
                                            Nenhum pagamento encontrado para os filtros ativos.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    filteredList.map((p) => {
                                        const principal = Number(p.allocatedToPrincipal || 0);
                                        const juros = Number(p.allocatedToInterest || 0);
                                        const multas = Number(p.allocatedToLateInterest || 0);
                                        const lucroTotal = juros + multas;

                                        const methodLabel = p.method === 'cash' ? 'Numerário' :
                                            p.method === 'transfer' ? 'Transferência' :
                                            p.method === 'reference' ? 'Multicaixa' :
                                            p.method === 'deposit' ? 'Depósito' :
                                            p.method || 'Numerário';

                                        const formattedDate = p.paymentDate
                                            ? new Date(p.paymentDate).toLocaleDateString('pt-PT')
                                            : '-';

                                        const receiptCode = p.reference
                                            ? (p.reference.startsWith('#') ? p.reference : `#${p.reference}`)
                                            : `#${p.id}`;

                                        return (
                                            <TableRow key={p.id} className="hover:bg-muted/30 transition-colors">
                                                <TableCell className="p-3">
                                                    <span className="font-mono text-[11px] font-semibold text-primary bg-primary/5 px-2 py-0.5 rounded-md border border-primary/20">
                                                        {receiptCode}
                                                    </span>
                                                </TableCell>
                                                <TableCell className="p-3 font-bold text-xs text-foreground">
                                                    {p.clientName}
                                                </TableCell>
                                                <TableCell className="p-3 text-xs font-mono text-muted-foreground">
                                                    {formattedDate}
                                                </TableCell>
                                                <TableCell className="p-3">
                                                    <Badge variant="secondary" className="text-[10px] font-semibold">
                                                        {methodLabel}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="p-3 text-xs font-medium text-right text-foreground/80">
                                                    {formatCurrency(principal, currency)}
                                                </TableCell>
                                                <TableCell className="p-3 text-xs font-semibold text-right text-emerald-600 dark:text-emerald-400">
                                                    {formatCurrency(juros, currency)}
                                                </TableCell>
                                                <TableCell className="p-3 text-xs font-semibold text-right text-amber-600 dark:text-amber-400">
                                                    {formatCurrency(multas, currency)}
                                                </TableCell>
                                                <TableCell className="p-3 text-xs font-black text-right text-emerald-700 dark:text-emerald-300">
                                                    {formatCurrency(lucroTotal, currency)}
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })
                                )}
                            </TableBody>
                            <TableFooter className="bg-muted/80 font-bold text-xs">
                                <TableRow>
                                    <TableCell colSpan={4} className="p-3 text-left">
                                        TOTAIS DO PERÍODO ({filteredList.length} pagamentos)
                                    </TableCell>
                                    <TableCell className="p-3 text-right text-foreground font-semibold">
                                        {formatCurrency(filteredPrincipalSum, currency)}
                                    </TableCell>
                                    <TableCell className="p-3 text-right text-emerald-600 dark:text-emerald-400 font-bold">
                                        {formatCurrency(filteredInterestSum, currency)}
                                    </TableCell>
                                    <TableCell className="p-3 text-right text-amber-600 dark:text-amber-400 font-bold">
                                        {formatCurrency(filteredLateSum, currency)}
                                    </TableCell>
                                    <TableCell className="p-3 text-right font-black text-emerald-700 dark:text-emerald-300">
                                        {formatCurrency(filteredProfitSum, currency)}
                                    </TableCell>
                                </TableRow>
                            </TableFooter>
                        </Table>
                    )
                };
            }
            default:
                return {
                    title: '',
                    icon: null,
                    formula: '',
                    statCards: [],
                    totalItemsCount: 0,
                    filteredCount: 0,
                    hasMethodFilter: false,
                    table: null
                };
        }
    }, [type, credits, clients, payments, allPayments, searchTerm, methodFilter, currency]);

    if (!type) return null;

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-6xl xl:max-w-7xl w-[96vw] max-h-[92vh] flex flex-col p-0 overflow-hidden border-none shadow-2xl rounded-2xl bg-background">
                {/* Cabeçalho Premium Alargado */}
                <div className="bg-gradient-to-r from-slate-950 via-slate-900 to-indigo-950 p-6 text-white shrink-0">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                        <div className="flex items-center gap-4">
                            <div className="h-12 w-12 rounded-xl bg-white/10 text-white border border-white/20 flex items-center justify-center shrink-0 shadow-inner">
                                {modalConfig.icon}
                            </div>
                            <div>
                                <DialogTitle className="text-xl font-black text-white tracking-tight flex items-center gap-2">
                                    {modalConfig.title}
                                </DialogTitle>
                                <DialogDescription className="text-indigo-200/80 text-xs mt-0.5 flex items-center gap-2">
                                    <span>Auditoria Detalhada • Período: <strong className="text-white font-bold">{periodLabel}</strong></span>
                                </DialogDescription>
                            </div>
                        </div>

                        {/* Indicador do Período */}
                        <div className="flex items-center gap-2">
                            <Badge className="bg-white/10 text-white border-white/20 px-3 py-1 text-xs font-semibold">
                                {periodLabel}
                            </Badge>
                        </div>
                    </div>
                </div>

                {/* Conteúdo com Barra de Rolagem */}
                <div className="p-6 overflow-y-auto space-y-5 flex-1">
                    {/* Cartão de Base Metodológica / Fórmula */}
                    <div className="p-4 rounded-xl border bg-muted/30 flex items-start gap-3 text-xs leading-relaxed">
                        <Info className="h-4 w-4 text-indigo-500 shrink-0 mt-0.5" />
                        <div>
                            <span className="font-bold text-foreground">Metodologia & Base de Cálculo:</span>
                            <p className="text-muted-foreground mt-0.5">{modalConfig.formula}</p>
                        </div>
                    </div>

                    {/* Cards de Resumo e Estatísticas da Métrica */}
                    {modalConfig.statCards && modalConfig.statCards.length > 0 && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                            {modalConfig.statCards.map((stat, idx) => (
                                <div key={idx} className={`p-4 rounded-xl border bg-card shadow-xs space-y-1.5 border-l-4 ${stat.border}`}>
                                    <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                        <span className="flex items-center gap-1.5">
                                            {stat.icon}
                                            {stat.label}
                                        </span>
                                    </div>
                                    <p className={`text-xl sm:text-2xl font-black tracking-tight whitespace-nowrap overflow-hidden text-ellipsis ${stat.textColor}`}>
                                        {stat.value}
                                    </p>
                                    <p className="text-[11px] text-muted-foreground">{stat.subtext}</p>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Barra de Filtros e Pesquisa */}
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-muted/20 p-3 rounded-xl border">
                        <div className="relative w-full sm:w-80">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                            <Input
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                placeholder="Pesquisar por cliente, recibo, id..."
                                className="pl-9 pr-8 h-9 text-xs"
                            />
                            {searchTerm && (
                                <button
                                    onClick={() => setSearchTerm('')}
                                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                >
                                    <X className="h-3.5 w-3.5" />
                                </button>
                            )}
                        </div>

                        <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
                            {modalConfig.hasMethodFilter && (
                                <div className="flex items-center gap-2">
                                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                        <Filter className="h-3.5 w-3.5" />
                                        <span>Método:</span>
                                    </div>
                                    <select
                                        value={methodFilter}
                                        onChange={(e) => setMethodFilter(e.target.value)}
                                        className="h-9 px-3 rounded-lg border bg-background text-xs font-medium focus:outline-hidden cursor-pointer"
                                    >
                                        <option value="all">Todos os Métodos</option>
                                        <option value="numerário">Numerário</option>
                                        <option value="transferência">Transferência</option>
                                        <option value="multicaixa">Multicaixa</option>
                                        <option value="depósito">Depósito</option>
                                    </select>
                                </div>
                            )}

                            <Badge variant="outline" className="text-[11px] font-semibold">
                                {modalConfig.filteredCount} de {modalConfig.totalItemsCount} registos
                            </Badge>
                        </div>
                    </div>

                    {/* Tabela de Itens Detalhados */}
                    <div className="border rounded-xl overflow-hidden bg-card shadow-xs">
                        {modalConfig.table}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
