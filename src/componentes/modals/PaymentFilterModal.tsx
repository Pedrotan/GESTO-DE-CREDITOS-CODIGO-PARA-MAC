import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/componentes/ui/dialog";
import { Button } from "@/componentes/ui/button";
import { Input } from "@/componentes/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/componentes/ui/select";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/componentes/ui/table";
import { Filter, Receipt, CreditCard, Banknote, Building2 } from "lucide-react";
import { formatCurrency, formatDateTime } from "@/bibliotecas/formatters";
import { Payment } from "@/tipos/credito";

const methodConfig: Record<string, { label: string; icon: any }> = {
    cash: { label: 'Dinheiro', icon: Banknote },
    transfer: { label: 'Transferência', icon: Building2 },
    card: { label: 'Cartão', icon: CreditCard },
    other: { label: 'Outro', icon: Receipt }
};

interface PaymentFilterModalProps {
    isOpen: boolean;
    onClose: () => void;
    payments: Payment[];
    dateFilter: 'today' | 'week' | 'month' | 'year' | 'custom' | 'all';
    setDateFilter: (value: 'today' | 'week' | 'month' | 'year' | 'custom' | 'all') => void;
    customDateRange: { start: string; end: string };
    setCustomDateRange: (value: { start: string; end: string }) => void;
}

export function PaymentFilterModal({
    isOpen,
    onClose,
    payments,
    dateFilter,
    setDateFilter,
    customDateRange,
    setCustomDateRange
}: PaymentFilterModalProps) {

    const getFilteredPayments = () => {
        const now = new Date();
        return payments.filter((p) => {
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
        }).sort((a, b) => new Date(b.paymentDate).getTime() - new Date(a.paymentDate).getTime());
    };

    const filteredPayments = getFilteredPayments();
    const totalAmount = filteredPayments.reduce((acc, p) => acc + p.amount, 0);

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-5xl max-h-[85vh] overflow-hidden flex flex-col">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Filter className="h-5 w-5 text-primary" />
                        Filtrar Pagamentos
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-4 py-4 flex-1 overflow-hidden flex flex-col">
                    {/* Filtros */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-muted/30 rounded-lg">
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Período</label>
                            <Select value={dateFilter} onValueChange={(value: any) => setDateFilter(value)}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="today">Hoje</SelectItem>
                                    <SelectItem value="week">Esta Semana</SelectItem>
                                    <SelectItem value="month">Este Mês</SelectItem>
                                    <SelectItem value="year">Este Ano</SelectItem>
                                    <SelectItem value="custom">Personalizado</SelectItem>
                                    <SelectItem value="all">Todos os Registos</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {dateFilter === 'custom' && (
                            <>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium">Data Inicial</label>
                                    <Input
                                        type="date"
                                        value={customDateRange.start}
                                        onChange={(e) => setCustomDateRange({ ...customDateRange, start: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-2 md:col-start-2">
                                    <label className="text-sm font-medium">Data Final</label>
                                    <Input
                                        type="date"
                                        value={customDateRange.end}
                                        onChange={(e) => setCustomDateRange({ ...customDateRange, end: e.target.value })}
                                    />
                                </div>
                            </>
                        )}
                    </div>

                    {/* Resultados */}
                    <div className="flex-1 overflow-hidden flex flex-col">
                        <div className="flex items-center justify-between mb-3 px-1">
                            <h3 className="text-sm font-semibold text-foreground">
                                Resultados do Filtro
                            </h3>
                            <p className="text-xs text-muted-foreground">
                                {filteredPayments.length} pagamento(s) encontrado(s)
                            </p>
                        </div>

                        <div className="border rounded-lg overflow-hidden flex-1">
                            <div className="overflow-y-auto max-h-[400px]">
                                <Table>
                                    <TableHeader className="sticky top-0 bg-muted/50 z-10">
                                        <TableRow>
                                            <TableHead className="font-bold">Referência</TableHead>
                                            <TableHead className="font-bold">Cliente</TableHead>
                                            <TableHead className="font-bold">Crédito</TableHead>
                                            <TableHead className="text-right font-bold">Valor</TableHead>
                                            <TableHead className="font-bold">Data & Hora</TableHead>
                                            <TableHead className="font-bold">Processado Por</TableHead>
                                            <TableHead className="font-bold">Método</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {filteredPayments.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                                                    Nenhum pagamento encontrado neste período
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            filteredPayments.map((payment) => {
                                                const MethodIcon = methodConfig[payment.method]?.icon || Receipt;
                                                return (
                                                    <TableRow key={payment.id} className="hover:bg-muted/20">
                                                        <TableCell>
                                                            <span className="font-mono text-sm font-medium">{payment.id}</span>
                                                        </TableCell>
                                                        <TableCell>
                                                            <span className="font-medium">{payment.clientName}</span>
                                                        </TableCell>
                                                        <TableCell>
                                                            <span className="font-mono text-xs text-muted-foreground">{payment.creditId}</span>
                                                        </TableCell>
                                                        <TableCell className="text-right">
                                                            <span className="font-bold text-green-600">{formatCurrency(payment.amount)}</span>
                                                        </TableCell>
                                                        <TableCell>
                                                            <span className="text-sm">{formatDateTime(payment.paymentDate)}</span>
                                                        </TableCell>
                                                        <TableCell>
                                                            <span className="text-sm">{payment.processedBy}</span>
                                                        </TableCell>
                                                        <TableCell>
                                                            <div className="flex items-center gap-2">
                                                                <MethodIcon className="h-4 w-4 text-muted-foreground" />
                                                                <span className="text-sm">{methodConfig[payment.method]?.label || payment.method}</span>
                                                            </div>
                                                        </TableCell>
                                                    </TableRow>
                                                );
                                            })
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                        </div>

                        {/* Resumo Total */}
                        <div className="mt-3 p-3 bg-primary/5 rounded-lg border border-primary/20">
                            <div className="flex items-center justify-between">
                                <span className="text-sm font-medium text-muted-foreground">Total do Período:</span>
                                <span className="text-lg font-bold text-primary">
                                    {formatCurrency(totalAmount)}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex gap-2 pt-4 border-t">
                    <Button
                        variant="outline"
                        className="flex-1"
                        onClick={() => {
                            setDateFilter('today');
                            setCustomDateRange({
                                start: new Date().toISOString().split('T')[0],
                                end: new Date().toISOString().split('T')[0]
                            });
                        }}
                    >
                        Limpar Filtros
                    </Button>
                    <Button
                        className="flex-1"
                        onClick={onClose}
                    >
                        Fechar
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
