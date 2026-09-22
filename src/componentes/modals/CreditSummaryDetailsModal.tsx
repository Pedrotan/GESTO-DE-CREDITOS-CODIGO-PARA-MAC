import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/componentes/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/componentes/ui/card';
import { Badge } from '@/componentes/ui/badge';
import { Button } from '@/componentes/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/componentes/ui/collapsible';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/componentes/ui/table';
import { formatCurrency, formatPercentage, formatDate } from '@/bibliotecas/formatters';
import { Credit, Client, Payment } from '@/tipos/credito';
import { TrendingUp, DollarSign, AlertCircle, PieChart, Calculator, Clock, Download, Eye, Layers, Users, Search } from 'lucide-react';
import { useMemo, useState, useEffect } from 'react';
import { ClientDetailsModal } from './ClientDetailsModal';
import { Input } from '@/componentes/ui/input';


interface CreditSummaryDetailsModalProps {
    isOpen: boolean;
    onClose: () => void;
    credits: Credit[];
    clients?: Client[];
    payments?: Payment[];
    type: 'total' | 'value' | 'interest' | 'lateFees';
    companySettings?: any;
}

interface ClientCreditGroup {
    key: string;
    clientId: string;
    clientName: string;
    clientNif?: string;
    clientPhone?: string;
    clientEmail?: string;
    clientAddress?: string;
    credits: Credit[];
    totalPrincipal: number;
    totalReturn: number;
    totalBalance: number;
    totalInterest: number;
    totalLateFees: number;
    averageInterestRate: number;
    client?: Client;
}

const toNumber = (value: number | undefined | null) => Number(value || 0);

const getCreditReturnAmount = (credit: Credit) => {
    const storedTotalDue = toNumber(credit.totalDue);
    if (storedTotalDue > 0) return storedTotalDue;
    return toNumber(credit.principalAmount) + toNumber(credit.accruedInterest) + toNumber(credit.lateInterest);
};

const openCreditStatuses = new Set<Credit['status']>(['active', 'overdue', 'defaulted', 'renegotiated']);

const isOpenCredit = (credit: Credit) =>
    openCreditStatuses.has(credit.status) &&
    toNumber(credit.currentBalance) > 0.1 &&
    !credit.deletedAt;

const getCreditPayments = (creditId: string, payments: Payment[]) =>
    payments.filter((payment) => payment.creditId === creditId && payment.status !== 'cancelled' && !payment.deletedAt);

const getOutstandingParts = (credit: Credit, payments: Payment[]) => {
    const creditPayments = getCreditPayments(credit.id, payments);
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

const getDateTime = (date: Credit['startDate'] | Credit['dueDate'] | Credit['createdAt'] | undefined) => {
    if (!date) return 0;
    const parsed = new Date(date).getTime();
    return Number.isNaN(parsed) ? 0 : parsed;
};

const normalizeText = (value: string | undefined | null) =>
    (value || 'Cliente sem nome').trim().toLowerCase().replace(/\s+/g, ' ');

const normalizeKeyPart = (value: string | undefined | null) =>
    (value || '').trim().toLowerCase().replace(/\s+/g, ' ');

const sanitizeFilename = (value: string) =>
    normalizeText(value)
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'credito';

export function CreditSummaryDetailsModal({
    isOpen,
    onClose,
    credits,
    clients = [],
    payments = [],
    type,
    companySettings
}: CreditSummaryDetailsModalProps) {

    const [searchTerm, setSearchTerm] = useState('');
    const [selectedDetailClient, setSelectedDetailClient] = useState<Client | null>(null);
    const [isClientDetailsOpen, setIsClientDetailsOpen] = useState(false);

    useEffect(() => {
        setSearchTerm('');
    }, [type, isOpen]);

    const visibleCredits = useMemo(() => credits.filter(isOpenCredit), [credits]);

    const analysis = useMemo(() => {
        const clientsById = new Map(clients.map((client) => [client.id, client]));
        const clientsByName = new Map(clients.map((client) => [normalizeText(client.name), client]));

        // Status breakdown
        const byStatus = visibleCredits.reduce((acc, credit) => {
            const status = credit.status;
            const parts = getOutstandingParts(credit, payments);
            if (!acc[status]) {
                acc[status] = {
                    count: 0,
                    totalPrincipal: 0,
                    totalBalance: 0,
                    totalInterest: 0,
                    totalLateFees: 0
                };
            }
            acc[status].count++;
            acc[status].totalPrincipal += parts.principal;
            acc[status].totalBalance += toNumber(credit.currentBalance);
            acc[status].totalInterest += parts.interest;
            acc[status].totalLateFees += parts.lateInterest;
            return acc;
        }, {} as Record<string, any>);

        const clientGroups = Array.from(
            visibleCredits.reduce((acc, credit) => {
                const matchedClient = clientsById.get(credit.clientId) || clientsByName.get(normalizeText(credit.clientName));
                const clientName = matchedClient?.name || credit.clientName || 'Cliente sem nome';
                const clientDataKey = [
                    normalizeKeyPart(clientName),
                    normalizeKeyPart(matchedClient?.nif),
                    normalizeKeyPart(matchedClient?.phone),
                    normalizeKeyPart(matchedClient?.email),
                    normalizeKeyPart(matchedClient?.address)
                ].join('|');
                const key = matchedClient
                    ? `dados:${clientDataKey}`
                    : credit.clientId
                        ? `id:${credit.clientId}`
                        : `nome:${normalizeText(clientName)}`;

                if (!acc.has(key)) {
                    acc.set(key, {
                        key,
                        clientId: matchedClient?.id || credit.clientId,
                        clientName,
                        clientNif: matchedClient?.nif,
                        clientPhone: matchedClient?.phone,
                        clientEmail: matchedClient?.email,
                        clientAddress: matchedClient?.address,
                        credits: [],
                        totalPrincipal: 0,
                        totalReturn: 0,
                        totalBalance: 0,
                        totalInterest: 0,
                        totalLateFees: 0,
                        averageInterestRate: 0,
                        client: matchedClient
                    });
                }

                const group = acc.get(key)!;
                const parts = getOutstandingParts(credit, payments);
                group.credits.push(credit);
                group.totalPrincipal += parts.principal;
                group.totalReturn += toNumber(credit.currentBalance);
                group.totalBalance += toNumber(credit.currentBalance);
                group.totalInterest += parts.interest;
                group.totalLateFees += parts.lateInterest;
                group.averageInterestRate += toNumber(credit.interestRate);

                return acc;
            }, new Map<string, ClientCreditGroup>()).values()
        )
            .map((group) => ({
                ...group,
                averageInterestRate: group.credits.length > 0 ? group.averageInterestRate / group.credits.length : 0,
                credits: [...group.credits].sort((a, b) => {
                    const dateA = getDateTime(a.startDate) || getDateTime(a.createdAt);
                    const dateB = getDateTime(b.startDate) || getDateTime(b.createdAt);
                    return dateA - dateB || a.id.localeCompare(b.id);
                })
            }))
            .sort((a, b) => a.clientName.localeCompare(b.clientName));

        // Interest breakdown
        const interestAnalysis = visibleCredits.map((credit) => {
            const parts = getOutstandingParts(credit, payments);
            return {
                id: credit.id,
                clientName: credit.clientName,
                principal: parts.principal,
                rate: toNumber(credit.interestRate),
                accruedInterest: parts.interest,
                calculatedInterest: (parts.principal * toNumber(credit.interestRate)) / 100,
                startDate: credit.startDate,
                term: credit.installments
            };
        });

        // Late fees breakdown
        const lateFeeAnalysis = visibleCredits
            .map((credit) => {
                const parts = getOutstandingParts(credit, payments);
                return {
                    id: credit.id,
                    clientName: credit.clientName,
                    daysOverdue: credit.daysOverdue,
                    lateRate: credit.lateInterestRate,
                    lateFees: parts.lateInterest,
                    balance: toNumber(credit.currentBalance),
                    calculatedDaily: (toNumber(credit.currentBalance) * toNumber(credit.lateInterestRate)) / 100
                };
            })
            .filter((item) => item.lateFees > 0)
            .sort((a, b) => b.lateFees - a.lateFees);

        const remainingPrincipalTotal = visibleCredits.reduce((sum, credit) => sum + getOutstandingParts(credit, payments).principal, 0);
        const dinheiroAtivo = remainingPrincipalTotal;
        const principalOriginalTotal = visibleCredits.reduce((sum, credit) => sum + toNumber(credit.principalAmount), 0);
        const principalPaidTotal = visibleCredits.reduce((sum, credit) => {
            return sum + getCreditPayments(credit.id, payments).reduce((paidSum, payment) => paidSum + toNumber(payment.allocatedToPrincipal), 0);
        }, 0);

        // Calculate most applied rates
        const interestRateFrequencies = visibleCredits.reduce((acc, c) => {
            const rate = toNumber(c.interestRate);
            acc[rate] = (acc[rate] || 0) + 1;
            return acc;
        }, {} as Record<number, number>);

        const sortedRates = Object.entries(interestRateFrequencies)
            .map(([rate, count]) => ({ rate: parseFloat(rate), count }))
            .sort((a, b) => b.count - a.count || b.rate - a.rate);

        const topRatesStr = sortedRates.length > 0 
            ? sortedRates.slice(0, 3).map(item => formatPercentage(item.rate)).join(', ') 
            : '0.00%';

        // Totals
        const totals = {
            count: visibleCredits.length,
            clients: clientGroups.length,
            principal: remainingPrincipalTotal,
            balance: visibleCredits.reduce((sum, c) => sum + toNumber(c.currentBalance), 0),
            returnAmount: visibleCredits.reduce((sum, c) => sum + toNumber(c.currentBalance), 0),
            interest: visibleCredits.reduce((sum, c) => sum + getOutstandingParts(c, payments).interest, 0),
            lateFees: visibleCredits.reduce((sum, c) => sum + getOutstandingParts(c, payments).lateInterest, 0),
            paid: visibleCredits.reduce((sum, credit) => {
                return sum + getCreditPayments(credit.id, payments).reduce((paidSum, payment) => paidSum + toNumber(payment.amount), 0);
            }, 0),
            remainingPrincipalTotal,
            dinheiroAtivo,
            principalOriginalTotal,
            principalPaidTotal,
            topRatesStr
        };

        return {
            byStatus,
            clientGroups,
            interestAnalysis,
            lateFeeAnalysis,
            totals
        };
    }, [visibleCredits, clients, payments]);

    const statusConfig: Record<string, { label: string; color: string }> = {
        active: { label: 'Activo', color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
        overdue: { label: 'Em Atraso', color: 'bg-amber-100 text-amber-700 border-amber-200' },
        paid: { label: 'Crédito Pago', color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
        renegotiated: { label: 'Renegociado', color: 'bg-blue-100 text-blue-700 border-blue-200' },
        defaulted: { label: 'Incumprimento', color: 'bg-red-100 text-red-700 border-red-200' },
        pending_approval: { label: 'Pendente', color: 'bg-purple-100 text-purple-700 border-purple-200' },
        rejected: { label: 'Rejeitado', color: 'bg-red-100 text-red-700 border-red-200' },
        cancelled: { label: 'Cancelado', color: 'bg-slate-100 text-slate-700 border-slate-200' },
    };

    const downloadCreditDetails = (credit: Credit, group: ClientCreditGroup, creditIndex: number) => {
        const statusLabel = statusConfig[credit.status]?.label || credit.status;
        const currency = companySettings?.currency || 'AOA';
        const parts = getOutstandingParts(credit, payments);
        const lines = [
            'DETALHE DA TRANSACAO DE CREDITO',
            '',
            `Empresa: ${companySettings?.name || 'Tango Gestao de Creditos'}`,
            `Moeda: ${currency}`,
            `Data de emissao: ${formatDate(new Date())}`,
            '',
            'CLIENTE',
            `Nome: ${group.clientName}`,
            `ID do cliente: ${group.clientId || 'N/A'}`,
            `NIF: ${group.clientNif || 'N/A'}`,
            `Telefone: ${group.clientPhone || 'N/A'}`,
            `Email: ${group.clientEmail || 'N/A'}`,
            `Endereco: ${group.clientAddress || 'N/A'}`,
            '',
            `CREDITO No ${creditIndex + 1}`,
            `Referencia: ${credit.id}`,
            `Status: ${statusLabel}`,
            `Data de cedencia: ${formatDate(credit.startDate)}`,
            `Data de vencimento: ${formatDate(credit.dueDate)}`,
            `Prestacoes: ${credit.paidInstallments || 0}/${credit.installments || 0}`,
            '',
            'VALORES',
            `Valor cedido original: ${formatCurrency(credit.principalAmount, currency)}`,
            `Valor cedido em aberto: ${formatCurrency(parts.principal, currency)}`,
            `Taxa de juros: ${formatPercentage(toNumber(credit.interestRate))}`,
            `Juros em aberto: ${formatCurrency(parts.interest, currency)}`,
            `Taxa de mora: ${formatPercentage(toNumber(credit.lateInterestRate))}`,
            `Mora em aberto: ${formatCurrency(parts.lateInterest, currency)}`,
            `Valor contratado a devolver: ${formatCurrency(getCreditReturnAmount(credit), currency)}`,
            `Valor a devolver em aberto: ${formatCurrency(credit.currentBalance, currency)}`,
            `Saldo actual: ${formatCurrency(credit.currentBalance, currency)}`,
            '',
            'COMPOSICAO',
            `Principal em aberto + juros em aberto + mora em aberto: ${formatCurrency(parts.principal + parts.interest + parts.lateInterest, currency)}`,
            `Dias em atraso: ${credit.daysOverdue || 0}`,
        ];

        const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `detalhe-transacao-${sanitizeFilename(group.clientName)}-credito-${creditIndex + 1}-${sanitizeFilename(credit.id)}.txt`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };
    const renderClientCreditGroups = (variant: 'value' | 'interest') => {
        const filteredGroups = analysis.clientGroups.filter(group => {
            if (!searchTerm) return true;
            const searchLower = searchTerm.trim().toLowerCase();
            return (
                group.clientName.toLowerCase().includes(searchLower) ||
                (group.clientNif || '').toLowerCase().includes(searchLower) ||
                (group.clientPhone || '').toLowerCase().includes(searchLower) ||
                (group.clientEmail || '').toLowerCase().includes(searchLower) ||
                group.credits.some((credit) => {
                    const statusLabel = statusConfig[credit.status]?.label || credit.status;
                    return [
                        credit.id,
                        formatDate(credit.startDate),
                        formatDate(credit.dueDate),
                        statusLabel
                    ].some((value) => value.toLowerCase().includes(searchLower));
                })
            );
        });

        return (
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        {variant === 'interest' ? <Calculator className="h-5 w-5" /> : <Layers className="h-5 w-5" />}
                        Créditos ativos agrupados por cliente
                    </CardTitle>
                    <DialogDescription>
                        Cada cliente aparece uma vez, com a quantidade de créditos ativos e os detalhes numerados.
                    </DialogDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                    <div className="relative mb-2">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            placeholder="Pesquisar cliente, NIF, telefone, referência, início ou vencimento..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-10"
                        />
                    </div>

                    {filteredGroups.length === 0 ? (
                        <div className="rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">
                            Nenhum cliente correspondente encontrado.
                        </div>
                    ) : (
                        filteredGroups.map((group) => {
                            const remainingPrincipal = group.totalPrincipal;
                            const subtotalDinheiroInvestido = group.totalPrincipal;

                            return (
                                <Collapsible key={group.key} className="rounded-xl border bg-white shadow-sm">
                                    <div className="space-y-4 p-4">
                                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                            <div className="min-w-0 flex-1">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <CollapsibleTrigger asChild>
                                                        <h3 className="truncate text-base font-bold text-slate-900 cursor-pointer hover:underline" title="Clique para ver a lista de créditos">
                                                            {group.clientName}
                                                        </h3>
                                                    </CollapsibleTrigger>
                                                    <Badge variant="outline">{group.credits.length} crédito{group.credits.length === 1 ? '' : 's'}</Badge>
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        className="h-8 gap-2"
                                                        onClick={() => {
                                                            const clientObj = group.client || {
                                                                id: group.clientId || 'N/A',
                                                                name: group.clientName,
                                                                nif: group.clientNif || 'N/A',
                                                                phone: group.clientPhone || 'N/A',
                                                                email: group.clientEmail || 'N/A',
                                                                address: group.clientAddress || 'N/A',
                                                                creditLimit: 0,
                                                                usedCredit: 0,
                                                                availableCredit: 0,
                                                                status: 'active',
                                                                riskLevel: 'medium',
                                                                createdAt: new Date()
                                                            } as Client;
                                                            setSelectedDetailClient(clientObj);
                                                            setIsClientDetailsOpen(true);
                                                        }}
                                                    >
                                                        <Eye className="h-4 w-4" />
                                                        Ver detalhes
                                                    </Button>
                                                </div>
                                                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                                                    <span>Grupo: {group.clientId ? `ID ${group.clientId}` : 'nome normalizado'}</span>
                                                    {group.clientNif && <span>NIF: {group.clientNif}</span>}
                                                    {group.clientPhone && <span>Telefone: {group.clientPhone}</span>}
                                                    {group.clientEmail && <span>Email: {group.clientEmail}</span>}
                                                </div>
                                            </div>

                                            <div className="rounded-lg border bg-slate-50 px-4 py-3 text-sm lg:min-w-[180px]">
                                                <p className="text-xs text-muted-foreground">Créditos ativos</p>
                                                <p className="text-2xl font-bold text-slate-900">{group.credits.length}</p>
                                            </div>
                                        </div>
                                    </div>

                                    <CollapsibleContent>
                                        <div className="border-t bg-slate-50/60 p-4">
                                            <div className="overflow-x-auto">
                                                <Table>
                                                    <TableHeader>
                                                        <TableRow>
                                                            <TableHead>Crédito</TableHead>
                                                            <TableHead>Referência</TableHead>
                                                            <TableHead>Início</TableHead>
                                                            <TableHead>Término</TableHead>
                                                            <TableHead>Status</TableHead>
                                                            <TableHead className="text-right">Valor em aberto</TableHead>
                                                            {variant !== 'value' && (
                                                                <>
                                                                    <TableHead className="text-right">Taxa</TableHead>
                                                                    <TableHead className="text-right">Juros</TableHead>
                                                                    <TableHead className="text-right">Valor a devolver</TableHead>
                                                                </>
                                                            )}
                                                            <TableHead className="text-right">
                                                                {variant === 'value' ? 'Dinheiro Investido' : 'Saldo actual'}
                                                            </TableHead>
                                                            <TableHead className="text-right">Ações</TableHead>
                                                        </TableRow>
                                                    </TableHeader>
                                                    <TableBody>
                                                        {group.credits.map((credit, index) => {
                                                            const crParts = getOutstandingParts(credit, payments);
                                                            const crRemainingPrincipal = crParts.principal;

                                                            return (
                                                                <TableRow key={credit.id}>
                                                                    <TableCell className="font-bold">Crédito ativo de {group.clientName} Nº {index + 1}</TableCell>
                                                                    <TableCell className="font-mono text-xs">{credit.id}</TableCell>
                                                                    <TableCell>{formatDate(credit.startDate)}</TableCell>
                                                                    <TableCell>{formatDate(credit.dueDate)}</TableCell>
                                                                    <TableCell>
                                                                        <Badge className={statusConfig[credit.status]?.color || 'bg-gray-100'}>
                                                                            {statusConfig[credit.status]?.label || credit.status}
                                                                        </Badge>
                                                                    </TableCell>
                                                                    <TableCell className="text-right font-medium">
                                                                        {formatCurrency(
                                                                            crRemainingPrincipal,
                                                                            companySettings?.currency
                                                                        )}
                                                                    </TableCell>
                                                                    {variant !== 'value' && (
                                                                        <>
                                                                            <TableCell className="text-right">
                                                                                {formatPercentage(toNumber(credit.interestRate))}
                                                                            </TableCell>
                                                                            <TableCell className="text-right font-medium text-emerald-600">
                                                                                {formatCurrency(crParts.interest, companySettings?.currency)}
                                                                            </TableCell>
                                                                            <TableCell className="text-right font-bold">
                                                                                {formatCurrency(credit.currentBalance, companySettings?.currency)}
                                                                            </TableCell>
                                                                        </>
                                                                    )}
                                                                    <TableCell className="text-right">
                                                                        {formatCurrency(
                                                                            variant === 'value' ? crRemainingPrincipal : credit.currentBalance,
                                                                            companySettings?.currency
                                                                        )}
                                                                    </TableCell>
                                                                    <TableCell className="text-right">
                                                                        <Button
                                                                            variant="outline"
                                                                            size="sm"
                                                                            className="h-8 gap-2"
                                                                            onClick={() => downloadCreditDetails(credit, group, index)}
                                                                        >
                                                                            <Download className="h-4 w-4" />
                                                                            Baixar
                                                                        </Button>
                                                                    </TableCell>
                                                                </TableRow>
                                                            );
                                                        })}
                                                        <TableRow className="bg-white font-bold">
                                                            <TableCell colSpan={5}>Subtotal do cliente</TableCell>
                                                            <TableCell className="text-right">
                                                                {formatCurrency(
                                                                    variant === 'value' ? remainingPrincipal : group.totalPrincipal,
                                                                    companySettings?.currency
                                                                )}
                                                            </TableCell>
                                                            {variant !== 'value' && (
                                                                <>
                                                                    <TableCell className="text-right">
                                                                        {formatPercentage(group.averageInterestRate)}
                                                                    </TableCell>
                                                                    <TableCell className="text-right text-emerald-600">
                                                                        {formatCurrency(group.totalInterest, companySettings?.currency)}
                                                                    </TableCell>
                                                                    <TableCell className="text-right">
                                                                        {formatCurrency(group.totalReturn, companySettings?.currency)}
                                                                    </TableCell>
                                                                </>
                                                            )}
                                                            <TableCell className="text-right">
                                                                {formatCurrency(
                                                                    variant === 'value' ? subtotalDinheiroInvestido : group.totalBalance,
                                                                    companySettings?.currency
                                                                )}
                                                            </TableCell>
                                                            <TableCell />
                                                        </TableRow>
                                                    </TableBody>
                                                </Table>
                                            </div>
                                        </div>
                                    </CollapsibleContent>
                                </Collapsible>
                            );
                        })
                    )}
                </CardContent>
            </Card>
        );
    };

    const renderTotalCreditsBreakdown = () => (
        <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid gap-4 md:grid-cols-4">
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-muted-foreground">Total de Créditos Ativos</p>
                                <p className="text-3xl font-bold">{analysis.totals.count}</p>
                            </div>
                            <Layers className="h-8 w-8 text-indigo-500" />
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-muted-foreground">Clientes Agrupados</p>
                                <p className="text-3xl font-bold">{analysis.totals.clients}</p>
                            </div>
                            <Eye className="h-8 w-8 text-blue-500" />
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-muted-foreground">Valor Cedido em Aberto</p>
                                <p className="text-2xl font-bold">{formatCurrency(analysis.totals.remainingPrincipalTotal, companySettings?.currency)}</p>
                                <p className="text-[10px] text-muted-foreground mt-1 leading-tight">
                                    Fruto do dinheiro emprestado, reduzindo de acordo com os pagamentos dos clientes.
                                </p>
                                <p className="text-[10px] text-slate-400 font-medium mt-0.5">
                                    Original: {formatCurrency(analysis.totals.principalOriginalTotal, companySettings?.currency)}
                                </p>
                            </div>
                            <TrendingUp className="h-8 w-8 text-emerald-500" />
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-muted-foreground">Dinheiro Ativo</p>
                                <p className="text-2xl font-bold">{formatCurrency(analysis.totals.dinheiroAtivo, companySettings?.currency)}</p>
                                <p className="text-[10px] text-muted-foreground mt-1 leading-tight">
                                    Valor principal pendente dos créditos ativos.
                                </p>
                                <p className="text-[10px] text-emerald-600 font-medium mt-0.5">
                                    Valor Pago: {formatCurrency(analysis.totals.principalPaidTotal, companySettings?.currency)}
                                </p>
                            </div>
                            <Calculator className="h-8 w-8 text-amber-500" />
                        </div>
                    </CardContent>
                </Card>
            </div>

            {renderClientCreditGroups('value')}

            {/* Breakdown by Status */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <PieChart className="h-5 w-5" />
                        Distribuição por Status
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Status</TableHead>
                                <TableHead className="text-right">Quantidade</TableHead>
                                <TableHead className="text-right">%</TableHead>
                                <TableHead className="text-right">Valor Principal</TableHead>
                                <TableHead className="text-right">
                                    {type === 'value' || type === 'total' ? 'Dinheiro Investido' : 'Saldo Actual'}
                                </TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {Object.entries(analysis.byStatus).map(([status, data]: [string, any]) => (
                                <TableRow key={status}>
                                    <TableCell>
                                        <Badge className={statusConfig[status]?.color || 'bg-gray-100'}>
                                            {statusConfig[status]?.label || status}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-right font-bold">{data.count}</TableCell>
                                    <TableCell className="text-right">
                                        {analysis.totals.count > 0 ? ((data.count / analysis.totals.count) * 100).toFixed(1) : '0.0'}%
                                    </TableCell>
                                    <TableCell className="text-right font-medium">
                                        {formatCurrency(data.totalPrincipal, companySettings?.currency)}
                                    </TableCell>
                                    <TableCell className="text-right font-medium">
                                        {formatCurrency(
                                            type === 'value' || type === 'total'
                                                ? Math.max(0, data.totalBalance - data.totalInterest - data.totalLateFees)
                                                : data.totalBalance,
                                            companySettings?.currency
                                        )}
                                    </TableCell>
                                </TableRow>
                            ))}
                            <TableRow className="bg-muted/50 font-bold">
                                <TableCell>TOTAL</TableCell>
                                <TableCell className="text-right">{analysis.totals.count}</TableCell>
                                <TableCell className="text-right">{analysis.totals.count > 0 ? '100%' : '0%'}</TableCell>
                                <TableCell className="text-right">
                                    {formatCurrency(analysis.totals.principal, companySettings?.currency)}
                                </TableCell>
                                <TableCell className="text-right">
                                    {formatCurrency(
                                        type === 'value' || type === 'total' ? analysis.totals.remainingPrincipalTotal : analysis.totals.balance,
                                        companySettings?.currency
                                    )}
                                </TableCell>
                            </TableRow>
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );

    const renderInterestDetails = () => (
        <div className="space-y-6">
            {/* Summary */}
            <div className="grid grid-cols-3 gap-4">
                <Card>
                    <CardContent className="pt-6">
                        <p className="text-sm text-muted-foreground">Juros em Aberto</p>
                        <p className="text-2xl font-bold text-emerald-600">
                            {formatCurrency(analysis.totals.interest, companySettings?.currency)}
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-6">
                        <p className="text-sm text-muted-foreground">Taxas Mais Aplicadas</p>
                        <p className="text-xl md:text-2xl font-bold truncate" title={analysis.totals.topRatesStr}>
                            {analysis.totals.topRatesStr}
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-6">
                        <p className="text-sm text-muted-foreground">Créditos Ativos com Juros</p>
                        <p className="text-2xl font-bold">
                            {analysis.interestAnalysis.filter(item => item.accruedInterest > 0).length}
                        </p>
                    </CardContent>
                </Card>
            </div>

            {renderClientCreditGroups('interest')}

            <div className="rounded-xl border bg-emerald-50/60 p-4 text-sm text-emerald-900 space-y-2">
                <p>
                    Fórmula de referência: Juros = (Valor cedido × Taxa) ÷ 100. Cada linha mostra o juro acumulado, a percentagem aplicada e o valor a devolver do crédito específico.
                </p>
                <p className="font-medium">
                    ⚠️ Atenção: Os juros apresentados aqui irão subir ou descer de acordo com os pagamentos das dívidas. Ou seja, os juros que aparecem aqui são fruto do dinheiro que ainda não foi pago (dinheiro por receber).
                </p>
            </div>
        </div>
    );

    const renderLateFeeDetails = () => (
        <div className="space-y-6">
            {/* Summary */}
            <div className="grid grid-cols-3 gap-4">
                <Card>
                    <CardContent className="pt-6">
                        <p className="text-sm text-muted-foreground">Mora em Aberto</p>
                        <p className="text-2xl font-bold text-amber-600">
                            {formatCurrency(analysis.totals.lateFees, companySettings?.currency)}
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-6">
                        <p className="text-sm text-muted-foreground">Créditos em Atraso</p>
                        <p className="text-2xl font-bold text-red-600">
                            {analysis.lateFeeAnalysis.length}
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-6">
                        <p className="text-sm text-muted-foreground">Dias Médios de Atraso</p>
                        <p className="text-2xl font-bold">
                            {analysis.lateFeeAnalysis.length > 0
                                ? Math.round(
                                    analysis.lateFeeAnalysis.reduce((sum, item) => sum + item.daysOverdue, 0) /
                                    analysis.lateFeeAnalysis.length
                                )
                                : 0}
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* Late Fee Breakdown */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Clock className="h-5 w-5" />
                        Detalhamento de Mora
                    </CardTitle>
                    <DialogDescription>
                        Fórmula: Mora Diária = (Saldo × Taxa Mora) ÷ 100 × Dias em Atraso
                    </DialogDescription>
                </CardHeader>
                <CardContent>
                    {analysis.lateFeeAnalysis.length === 0 ? (
                        <div className="py-8 text-center text-muted-foreground">
                            <AlertCircle className="h-12 w-12 mx-auto mb-2 opacity-20" />
                            <p>Nenhum crédito ativo com mora em aberto</p>
                        </div>
                    ) : (
                        <div className="max-h-96 overflow-y-auto">
                            <Table>
                                <TableHeader className="sticky top-0 bg-background">
                                    <TableRow>
                                        <TableHead>Crédito</TableHead>
                                        <TableHead>Cliente</TableHead>
                                        <TableHead className="text-right">Dias Atraso</TableHead>
                                        <TableHead className="text-right">Taxa Mora/Dia</TableHead>
                                        <TableHead className="text-right">Saldo</TableHead>
                                        <TableHead className="text-right">Mora Acumulada</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {analysis.lateFeeAnalysis.map((item) => (
                                        <TableRow key={item.id}>
                                            <TableCell className="font-mono text-xs">{item.id}</TableCell>
                                            <TableCell className="font-medium">{item.clientName}</TableCell>
                                            <TableCell className="text-right">
                                                <Badge variant="destructive" className="font-mono">
                                                    {item.daysOverdue} dias
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-right">{formatPercentage(item.lateRate)}</TableCell>
                                            <TableCell className="text-right">
                                                {formatCurrency(item.balance, companySettings?.currency)}
                                            </TableCell>
                                            <TableCell className="text-right font-bold text-amber-600">
                                                {formatCurrency(item.lateFees, companySettings?.currency)}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    <TableRow className="bg-muted/50 font-bold">
                                        <TableCell colSpan={5} className="text-right">TOTAL MORA</TableCell>
                                        <TableCell className="text-right text-amber-600">
                                            {formatCurrency(analysis.totals.lateFees, companySettings?.currency)}
                                        </TableCell>
                                    </TableRow>
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );

    const titles = {
        total: 'Detalhes: Créditos Ativos',
        value: 'Detalhes: Valor Ativo',
        interest: 'Detalhes: Juros em Aberto',
        lateFees: 'Detalhes: Mora em Aberto'
    };

    return (
        <>
            <Dialog open={isOpen} onOpenChange={onClose}>
                <DialogContent className="max-w-6xl max-h-[92vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="text-2xl">{titles[type]}</DialogTitle>
                        <DialogDescription>
                            Análise apenas dos créditos ainda ativos, agrupados por cliente, com início, término, valores em aberto e detalhe para baixar.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="mt-4">
                        {type === 'total' && renderTotalCreditsBreakdown()}
                        {type === 'value' && renderTotalCreditsBreakdown()}
                        {type === 'interest' && renderInterestDetails()}
                        {type === 'lateFees' && renderLateFeeDetails()}
                    </div>
                </DialogContent>
            </Dialog>

            <ClientDetailsModal
                client={selectedDetailClient}
                open={isClientDetailsOpen}
                onOpenChange={setIsClientDetailsOpen}
            />
        </>
    );
}
