import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/componentes/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/componentes/ui/table';
import { formatCurrency } from '@/bibliotecas/formatters';
import { Credit, Client, Payment } from '@/tipos/credito';
import { Users, ArrowUpRight, TrendingUp, TrendingDown, ArrowDownLeft, Search } from 'lucide-react';
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
    credits,
    clients,
    payments,
    allPayments,
    companySettings
}: PeriodMetricDetailsModalProps) {
    const [searchTerm, setSearchTerm] = useState('');

    const currency = companySettings?.currency || 'AOA';

    const modalConfig = useMemo(() => {
        const term = searchTerm.toLowerCase().trim();

        switch (type) {
            case 'clients': {
                // Group by clients
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

                const list = Object.values(clientGroups).filter((g: any) =>
                    g.name.toLowerCase().includes(term) || g.nif.toLowerCase().includes(term)
                );

                const totalValue = Object.values(clientGroups).length;

                return {
                    title: 'Clientes do Período',
                    icon: <Users className="h-5 w-5 text-indigo-500" />,
                    formula: 'Clientes do Período = Contagem de clientes únicos com novos contratos iniciados no período selecionado.',
                    totalLabel: 'Total de Clientes Únicos',
                    totalValue: `${totalValue} Clientes`,
                    headers: ['Cliente', 'NIF', 'Telefone', 'Contratos Criados', 'Capital Emprestado'],
                    rows: list.map((g: any) => (
                        <TableRow key={g.id}>
                            <TableCell className="font-semibold text-xs">{g.name}</TableCell>
                            <TableCell className="text-xs">{g.nif}</TableCell>
                            <TableCell className="text-xs">{g.phone}</TableCell>
                            <TableCell className="text-xs font-bold text-center">{g.contractsCount}</TableCell>
                            <TableCell className="text-xs font-bold text-right">{formatCurrency(g.totalPrincipal, currency)}</TableCell>
                        </TableRow>
                    ))
                };
            }
            case 'capital': {
                const list = credits.filter(c =>
                    c.clientName.toLowerCase().includes(term) || c.id.toLowerCase().includes(term)
                );

                const getRemainingPrincipal = (c: Credit) => {
                    const paidPrincipal = allPayments
                        .filter(p => p.creditId === c.id && p.status !== 'cancelled' && !p.deletedAt)
                        .reduce((sum, p) => sum + Number(p.allocatedToPrincipal || 0), 0);
                    return Math.max(0, Number(c.principalAmount || 0) - paidPrincipal);
                };

                const getPaidPrincipal = (c: Credit) => {
                    return allPayments
                        .filter(p => p.creditId === c.id && p.status !== 'cancelled' && !p.deletedAt)
                        .reduce((sum, p) => sum + Number(p.allocatedToPrincipal || 0), 0);
                };

                const totalValue = credits.reduce((sum, c) => sum + getRemainingPrincipal(c), 0);

                return {
                    title: 'Capital Aplicado Ativo (Saídas Líquidas)',
                    icon: <ArrowUpRight className="h-5 w-5 text-red-500" />,
                    formula: 'Capital Aplicado Ativo = Soma do capital inicial dos créditos concedidos no período, deduzido de todos os pagamentos/amortizações de principal já efetuados para os mesmos créditos.',
                    totalLabel: 'Total Capital Ativo',
                    totalValue: formatCurrency(totalValue, currency),
                    headers: ['ID Crédito', 'Cliente', 'Capital Inicial', 'Capital Pago', 'Capital Restante'],
                    rows: list.map((c) => {
                        const paid = getPaidPrincipal(c);
                        const remaining = getRemainingPrincipal(c);
                        return (
                            <TableRow key={c.id}>
                                <TableCell className="font-bold text-xs text-primary">{c.id}</TableCell>
                                <TableCell className="text-xs">{c.clientName}</TableCell>
                                <TableCell className="text-xs font-semibold">{formatCurrency(c.principalAmount, currency)}</TableCell>
                                <TableCell className="text-xs text-green-600 font-semibold">{formatCurrency(paid, currency)}</TableCell>
                                <TableCell className="text-xs font-bold text-right text-red-600">{formatCurrency(remaining, currency)}</TableCell>
                            </TableRow>
                        );
                    })
                };
            }
            case 'projected': {
                const list = credits.filter(c =>
                    c.clientName.toLowerCase().includes(term) || c.id.toLowerCase().includes(term)
                );
                const totalValue = credits.reduce((sum, c) => sum + Number(c.accruedInterest || 0), 0);

                return {
                    title: 'Lucro Projetado (Juros Previstos)',
                    icon: <TrendingUp className="h-5 w-5 text-blue-500" />,
                    formula: 'Lucro Projetado = Soma dos juros iniciais contratuais de todos os créditos concedidos no período.',
                    totalLabel: 'Total Juros Previstos',
                    totalValue: formatCurrency(totalValue, currency),
                    headers: ['ID Crédito', 'Cliente', 'Prazo', 'Taxa Juro', 'Juros Projetados'],
                    rows: list.map((c) => (
                        <TableRow key={c.id}>
                            <TableCell className="font-bold text-xs text-primary">{c.id}</TableCell>
                            <TableCell className="text-xs">{c.clientName}</TableCell>
                            <TableCell className="text-xs">{c.installments} parcelas</TableCell>
                            <TableCell className="text-xs">{c.interestRate}%</TableCell>
                            <TableCell className="text-xs font-bold text-right text-blue-600">{formatCurrency(c.accruedInterest, currency)}</TableCell>
                        </TableRow>
                    ))
                };
            }
            case 'outstanding': {
                // For outstanding, we list credits from this period that are active, and subtract all their paid principal.
                const activePeriodCredits = credits.filter(c => c.status === 'active');
                const list = activePeriodCredits.filter(c =>
                    c.clientName.toLowerCase().includes(term) || c.id.toLowerCase().includes(term)
                );

                const getRemainingPrincipal = (c: Credit) => {
                    const paidPrincipal = allPayments
                        .filter(p => p.creditId === c.id && p.status !== 'cancelled' && !p.deletedAt)
                        .reduce((sum, p) => sum + Number(p.allocatedToPrincipal || 0), 0);
                    return Math.max(0, Number(c.principalAmount || 0) - paidPrincipal);
                };

                const totalValue = activePeriodCredits.reduce((sum, c) => sum + getRemainingPrincipal(c), 0);

                return {
                    title: 'Saldo em Aberto (Principal Restante)',
                    icon: <TrendingDown className="h-5 w-5 text-amber-500" />,
                    formula: 'Saldo em Aberto = Principal Inicial dos contratos ativos deste período - Principal Amortizado. Apenas reflete contratos em estado Ativo.',
                    totalLabel: 'Total Principal em Aberto',
                    totalValue: formatCurrency(totalValue, currency),
                    headers: ['ID Crédito', 'Cliente', 'Capital Inicial', 'Principal Amortizado', 'Saldo Restante'],
                    rows: list.map((c) => {
                        const paidPrincipal = allPayments
                            .filter(p => p.creditId === c.id && p.status !== 'cancelled' && !p.deletedAt)
                            .reduce((sum, p) => sum + Number(p.allocatedToPrincipal || 0), 0);
                        const remaining = Math.max(0, Number(c.principalAmount || 0) - paidPrincipal);

                        return (
                            <TableRow key={c.id}>
                                <TableCell className="font-bold text-xs text-primary">{c.id}</TableCell>
                                <TableCell className="text-xs">{c.clientName}</TableCell>
                                <TableCell className="text-xs font-semibold">{formatCurrency(c.principalAmount, currency)}</TableCell>
                                <TableCell className="text-xs text-green-600 font-semibold">{formatCurrency(paidPrincipal, currency)}</TableCell>
                                <TableCell className="text-xs font-bold text-right text-amber-600">{formatCurrency(remaining, currency)}</TableCell>
                            </TableRow>
                        );
                    })
                };
            }
            case 'realized': {
                // List of payments made inside the period
                const list = payments.filter(p =>
                    p.clientName.toLowerCase().includes(term) || (p.reference && p.reference.toLowerCase().includes(term))
                );
                const totalValue = payments.reduce((sum, p) => sum + Number(p.allocatedToInterest || 0) + Number(p.allocatedToLateInterest || 0), 0);

                return {
                    title: 'Lucro Recebido (Juros & Moras)',
                    icon: <ArrowDownLeft className="h-5 w-5 text-emerald-500" />,
                    formula: 'Lucro Recebido = Soma de todos os valores de juros e multas (juros de mora) cobrados em pagamentos recebidos dentro deste período específico (Regime de Caixa real).',
                    totalLabel: 'Total Juros & Multas Recebidos',
                    totalValue: formatCurrency(totalValue, currency),
                    headers: ['Recibo / Ref', 'Cliente', 'Data Pagamento', 'Juros Recebidos', 'Multas Recebidas', 'Total Recebido'],
                    rows: list.map((p) => {
                        const juros = Number(p.allocatedToInterest || 0);
                        const multas = Number(p.allocatedToLateInterest || 0);
                        const total = juros + multas;

                        return (
                            <TableRow key={p.id}>
                                <TableCell className="font-bold text-xs text-primary">{p.reference || p.id}</TableCell>
                                <TableCell className="text-xs">{p.clientName}</TableCell>
                                <TableCell className="text-xs">{new Date(p.paymentDate).toLocaleDateString()}</TableCell>
                                <TableCell className="text-xs font-semibold text-green-600 text-right">{formatCurrency(juros, currency)}</TableCell>
                                <TableCell className="text-xs font-semibold text-amber-600 text-right">{formatCurrency(multas, currency)}</TableCell>
                                <TableCell className="text-xs font-bold text-right text-emerald-600">{formatCurrency(total, currency)}</TableCell>
                            </TableRow>
                        );
                    })
                };
            }
            default:
                return {
                    title: '',
                    icon: null,
                    formula: '',
                    totalLabel: '',
                    totalValue: '',
                    headers: [],
                    rows: []
                };
        }
    }, [type, credits, clients, payments, allPayments, searchTerm, currency]);

    if (!type) return null;

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="flex flex-col w-[95vw] max-w-5xl max-h-[85vh]">
                <DialogHeader className="border-b pb-3">
                    <DialogTitle className="flex items-center gap-2 text-lg font-bold">
                        {modalConfig.icon}
                        {modalConfig.title}
                    </DialogTitle>
                    <DialogDescription className="text-xs font-semibold text-muted-foreground mt-1 text-left">
                        Período: {periodLabel}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-3 py-3 overflow-y-auto flex-1">
                    {/* Educational Card describing the formula */}
                    <div className="p-3 bg-muted/40 rounded-xl border text-xs leading-relaxed">
                        <strong className="text-foreground">Fórmula de Cálculo:</strong>
                        <p className="text-muted-foreground mt-1">{modalConfig.formula}</p>
                    </div>

                    {/* Stats overview and Search */}
                    <div className="grid gap-3 sm:grid-cols-2 items-center">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                placeholder="Pesquisar nesta listagem..."
                                className="pl-10 h-10"
                            />
                        </div>
                        <div className="bg-primary/5 rounded-lg border border-primary/10 px-4 py-2 flex justify-between items-center text-xs h-10">
                            <span className="font-medium text-muted-foreground">{modalConfig.totalLabel}:</span>
                            <span className="font-bold text-sm text-primary">{modalConfig.totalValue}</span>
                        </div>
                    </div>

                    {/* Table of items */}
                    <div className="border rounded-lg overflow-hidden bg-card">
                        <Table>
                            <TableHeader className="bg-muted/50 sticky top-0">
                                <TableRow>
                                    {modalConfig.headers.map((h, i) => (
                                        <TableHead key={i} className={i === modalConfig.headers.length - 1 ? 'text-right' : ''}>{h}</TableHead>
                                    ))}
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {modalConfig.rows.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={modalConfig.headers.length} className="text-center py-8 text-muted-foreground text-xs italic">
                                            Nenhum registo encontrado para os filtros ativos.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    modalConfig.rows
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
