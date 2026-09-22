import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/componentes/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/componentes/ui/table';
import { Button } from '@/componentes/ui/button';
import { formatCurrency } from '@/bibliotecas/formatters';
import { Credit, Payment } from '@/tipos/credito';
import { Calendar, Download, Lock, CheckCircle2, FileText } from 'lucide-react';
import { useMemo } from 'react';
import { generateAnnualReportPDF, generateMonthlyConsolidationReport } from '@/bibliotecas/pdf';

interface AnnualReportModalProps {
    isOpen: boolean;
    onClose: () => void;
    year: number;
    credits: Credit[];
    payments: Payment[];
    closedMonths: any[];
    companySettings?: any;
    userName?: string;
}

const MONTH_FULL_NAMES = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

export function AnnualReportModal({
    isOpen,
    onClose,
    year,
    credits,
    payments,
    closedMonths,
    companySettings,
    userName
}: AnnualReportModalProps) {
    const currency = companySettings?.currency || 'AOA';

    const annualSummary = useMemo(() => {
        return MONTH_FULL_NAMES.map((monthLabel, monthIndex) => {
            const monthId = `${year}-${(monthIndex + 1).toString().padStart(2, '0')}`;
            const isClosed = closedMonths.some(m => m.id === monthId);
            const closedData = closedMonths.find(m => m.id === monthId);

            // Filter credits created in this month
            const periodCredits = credits.filter(c => {
                if (c.deletedAt) return false;
                if (c.targetMonthId) {
                    const [y, mStr] = c.targetMonthId.split('-');
                    return parseInt(y) === year && (parseInt(mStr) - 1) === monthIndex;
                }
                const d = new Date(c.startDate);
                return d.getMonth() === monthIndex && d.getFullYear() === year;
            });

            // Filter payments received in this month
            const periodPayments = payments.filter(p => {
                if (p.status === 'cancelled' || p.deletedAt) return false;
                const credit = credits.find(c => c.id === p.creditId);
                if (credit?.targetMonthId) {
                    const [y, mStr] = credit.targetMonthId.split('-');
                    return parseInt(y) === year && (parseInt(mStr) - 1) === monthIndex;
                }
                const d = new Date(p.paymentDate);
                return d.getMonth() === monthIndex && d.getFullYear() === year;
            });

            const capitalApplied = periodCredits.reduce((sum, c) => {
                const paidPrincipal = payments
                    .filter(p => p.creditId === c.id && p.status !== 'cancelled' && !p.deletedAt)
                    .reduce((pSum, p) => pSum + Number(p.allocatedToPrincipal || 0), 0);
                return sum + Math.max(0, Number(c.principalAmount || 0) - paidPrincipal);
            }, 0);
            const projectedProfit = periodCredits.reduce((sum, c) => sum + Number(c.accruedInterest || 0), 0);
            
            const outstandingCapital = periodCredits.reduce((sum, c) => {
                const paidPrincipal = payments
                    .filter(p => p.creditId === c.id && p.status !== 'cancelled' && !p.deletedAt)
                    .reduce((pSum, p) => pSum + Number(p.allocatedToPrincipal || 0), 0);
                return sum + Math.max(0, Number(c.principalAmount || 0) - paidPrincipal);
            }, 0);

            const realizedProfit = periodPayments.reduce((sum, p) => {
                return sum + Number(p.allocatedToInterest || 0) + Number(p.allocatedToLateInterest || 0);
            }, 0);

            const liquidationRate = capitalApplied > 0
                ? ((capitalApplied - outstandingCapital) / capitalApplied) * 100
                : 0;

            return {
                monthIndex,
                monthLabel,
                monthId,
                isClosed,
                closedData,
                capitalApplied,
                projectedProfit,
                realizedProfit,
                outstandingCapital,
                liquidationRate
            };
        });
    }, [year, credits, payments, closedMonths]);

    const totals = useMemo(() => {
        return annualSummary.reduce((acc, m) => {
            acc.capitalApplied += m.capitalApplied;
            acc.projectedProfit += m.projectedProfit;
            acc.realizedProfit += m.realizedProfit;
            acc.outstandingCapital += m.outstandingCapital;
            return acc;
        }, { capitalApplied: 0, projectedProfit: 0, realizedProfit: 0, outstandingCapital: 0 });
    }, [annualSummary]);

    const totalLiquidationRate = useMemo(() => {
        if (totals.capitalApplied <= 0) return 0;
        return ((totals.capitalApplied - totals.outstandingCapital) / totals.capitalApplied) * 100;
    }, [totals]);

    const handleDownloadAnnualReport = () => {
        generateAnnualReportPDF(year, annualSummary, credits, companySettings, userName);
    };

    const handleDownloadMonthReport = (m: typeof annualSummary[0]) => {
        if (m.isClosed && m.closedData) {
            generateMonthlyConsolidationReport(m.closedData, credits, companySettings, userName);
        } else {
            // For open month, generate draft report
            const draftData = {
                id: m.monthId,
                month: m.monthIndex,
                year,
                capitalApplied: m.capitalApplied,
                projectedProfit: m.projectedProfit,
                realizedProfit: m.realizedProfit,
                overdueAmount: credits.filter(c => (c.status === 'overdue' || c.status === 'defaulted') && new Date(c.startDate).getMonth() === m.monthIndex && new Date(c.startDate).getFullYear() === year).reduce((sum, c) => sum + c.currentBalance, 0),
                liquidationRate: m.liquidationRate,
                closedAt: new Date().toISOString(),
                closedBy: userName || 'Sistema'
            };
            generateMonthlyConsolidationReport(draftData, credits, companySettings, userName);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="flex flex-col w-[95vw] max-w-6xl max-h-[90vh]">
                <DialogHeader className="border-b pb-3 flex flex-row items-center justify-between gap-4">
                    <div>
                        <DialogTitle className="flex items-center gap-2 text-lg font-bold">
                            <Calendar className="h-5 w-5 text-indigo-500" />
                            Visão Geral Anual - {year}
                        </DialogTitle>
                        <DialogDescription className="text-xs text-muted-foreground mt-1">
                            Acompanhamento detalhado consolidado mês a mês do ano de {year}.
                        </DialogDescription>
                    </div>
                    <Button onClick={handleDownloadAnnualReport} className="gap-2 h-9 bg-primary hover:bg-primary/95 text-primary-foreground shrink-0">
                        <Download className="h-4 w-4" />
                        Relatório Anual PDF
                    </Button>
                </DialogHeader>

                <div className="space-y-4 py-3 overflow-y-auto flex-1">
                    {/* Annual Totals Cards */}
                    <div className="grid gap-3 grid-cols-2 md:grid-cols-5">
                        <div className="p-3 bg-muted/40 rounded-xl border">
                            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Capital Investido</span>
                            <p className="text-sm md:text-base font-bold text-red-500 mt-1">{formatCurrency(totals.capitalApplied, currency)}</p>
                        </div>
                        <div className="p-3 bg-muted/40 rounded-xl border">
                            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Lucro Projetado</span>
                            <p className="text-sm md:text-base font-bold text-blue-500 mt-1">{formatCurrency(totals.projectedProfit, currency)}</p>
                        </div>
                        <div className="p-3 bg-muted/40 rounded-xl border">
                            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Lucro Realizado</span>
                            <p className="text-sm md:text-base font-bold text-emerald-500 mt-1">{formatCurrency(totals.realizedProfit, currency)}</p>
                        </div>
                        <div className="p-3 bg-muted/40 rounded-xl border">
                            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Saldo devedor</span>
                            <p className="text-sm md:text-base font-bold text-amber-500 mt-1">{formatCurrency(totals.outstandingCapital, currency)}</p>
                        </div>
                        <div className="p-3 bg-muted/40 rounded-xl border">
                            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Tx. Liquidação</span>
                            <p className="text-sm md:text-base font-bold text-primary mt-1">{totalLiquidationRate.toFixed(2)}%</p>
                        </div>
                    </div>

                    {/* Table of Months */}
                    <div className="border rounded-xl overflow-hidden bg-card">
                        <Table>
                            <TableHeader className="bg-muted/50 sticky top-0">
                                <TableRow>
                                    <TableHead>Mês</TableHead>
                                    <TableHead>Estado</TableHead>
                                    <TableHead className="text-right">Capital Aplicado</TableHead>
                                    <TableHead className="text-right">Lucro Projetado</TableHead>
                                    <TableHead className="text-right">Lucro Realizado</TableHead>
                                    <TableHead className="text-right">Saldo em Aberto</TableHead>
                                    <TableHead className="text-right">Tx. Liquidação</TableHead>
                                    <TableHead className="w-20"></TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {annualSummary.map((m) => (
                                    <TableRow key={m.monthIndex} className={m.isClosed ? 'bg-slate-500/[0.02]' : ''}>
                                        <TableCell className="font-bold text-xs">{m.monthLabel}</TableCell>
                                        <TableCell>
                                            {m.isClosed ? (
                                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-500 uppercase">
                                                    <Lock className="h-3 w-3" />
                                                    Fechado
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-green-600 uppercase">
                                                    <CheckCircle2 className="h-3 w-3 animate-pulse" />
                                                    Aberto
                                                </span>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-xs text-right font-semibold text-red-500">{formatCurrency(m.capitalApplied, currency)}</TableCell>
                                        <TableCell className="text-xs text-right font-semibold text-blue-500">{formatCurrency(m.projectedProfit, currency)}</TableCell>
                                        <TableCell className="text-xs text-right font-semibold text-emerald-500">{formatCurrency(m.realizedProfit, currency)}</TableCell>
                                        <TableCell className="text-xs text-right font-semibold text-amber-500">{formatCurrency(m.outstandingCapital, currency)}</TableCell>
                                        <TableCell className="text-xs text-right font-bold text-primary">{m.liquidationRate.toFixed(2)}%</TableCell>
                                        <TableCell className="text-center">
                                            <Button
                                                onClick={() => handleDownloadMonthReport(m)}
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 text-primary hover:bg-primary/10"
                                                title={m.isClosed ? "Descarregar Relatório Consolidado" : "Visualizar Relatório Provisório"}
                                            >
                                                <FileText className="h-4 w-4" />
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
