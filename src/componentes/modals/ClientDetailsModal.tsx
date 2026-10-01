import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/componentes/ui/dialog';
import { Button } from '@/componentes/ui/button';
import { Badge } from '@/componentes/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/componentes/ui/tabs';
import { Download, FileText, Landmark, Phone, Mail, MapPin, Calendar, CreditCard, Wallet, ShieldAlert, History, Receipt, MessageCircle } from 'lucide-react';
import { Client, Credit, Payment } from '@/tipos/credito';
import { formatCurrency, formatDate } from '@/bibliotecas/formatters';
import { generateClientProfilePDF, generateClientGeneralPaymentHistoryPDF, generateReceiptPDF } from '@/bibliotecas/pdf';
import { useToast } from '@/ganchos/usar-toast';
import { useData } from '@/contextos/ContextoDados';
import { useAuth } from '@/contextos/ContextoAutenticacao';
import { AlertModal, AlertModalType } from '@/componentes/ui/AlertModal';
import { PaymentSlipModal } from './PaymentSlipModal';
import { ClientCreditInstallments } from './ClientCreditInstallments';
import { useState } from 'react';

interface ClientDetailsModalProps {
    client: Client | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onGrantRemaining?: (client: Client) => void;
}

const limitConsumingCreditStatuses = new Set<Credit['status']>(['active', 'overdue', 'defaulted', 'renegotiated']);

export function ClientDetailsModal({ client, open, onOpenChange, onGrantRemaining }: ClientDetailsModalProps) {
    const { credits, payments, companySettings } = useData();
    const { user } = useAuth();
    const { toast } = useToast();
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

    const [isDownloadOptionsOpen, setIsDownloadOptionsOpen] = useState(false);
    const [includeInterest, setIncludeInterest] = useState(true);
    const [selectedPaymentForSlip, setSelectedPaymentForSlip] = useState<Payment | null>(null);
    const [isSlipOpen, setIsSlipOpen] = useState(false);

    if (!client) return null;

    // Defensive checks
    const safeCredits = Array.isArray(credits) ? credits : [];
    const safePayments = Array.isArray(payments) ? payments : [];

    const clientCredits = safeCredits.filter(c => c.clientId === client.id);
    const creditIds = clientCredits.map(c => c.id);
    const clientPayments = safePayments.filter(p => creditIds.includes(p.creditId));

    const totalLoaned = clientCredits.reduce((acc, c) => acc + (c.principalAmount || 0), 0);
    const totalDebt = clientCredits.reduce((acc, c) => acc + (c.currentBalance || 0), 0);
    const totalPaidSum = clientPayments.reduce((acc, p) => acc + (p.amount || 0), 0);
    const totalPrincipalPaidSum = clientPayments.reduce((acc, p) => acc + (p.allocatedToPrincipal || 0), 0);
    const totalInterestPaidSum = clientPayments.reduce((acc, p) => acc + (p.allocatedToInterest || 0) + (p.allocatedToLateInterest || 0), 0);

    const canGrantRemaining = (Number(client.availableCredit) || 0) > 0 && clientCredits.some(
        c => limitConsumingCreditStatuses.has(c.status) && (Number(c.currentBalance) || 0) > 0.1
    );

    const handleDownloadProfile = () => {
        setIsDownloadOptionsOpen(true);
    };

    const handleOpenSlip = (payment: Payment) => {
        setSelectedPaymentForSlip(payment);
        setIsSlipOpen(true);
    };

    const handleDownloadGeneralHistory = () => {
        try {
            generateClientGeneralPaymentHistoryPDF(
                client,
                clientCredits,
                clientPayments,
                companySettings,
                user?.name
            );
            setAlertConfig({
                isOpen: true,
                title: "Extrato Geral Gerado",
                description: "O histórico geral de pagamentos do cliente foi baixado em PDF com sucesso.",
                type: "success"
            });
        } catch (error: any) {
            console.error(error);
            setAlertConfig({
                isOpen: true,
                title: "Erro ao Gerar PDF",
                description: error?.message || "Falha ao gerar o histórico geral de pagamentos.",
                type: "error"
            });
        }
    };

    const confirmDownload = () => {
        try {
            generateClientProfilePDF(
                client,
                clientCredits,
                clientPayments,
                companySettings,
                user?.name,
                { includeInterest }
            );
            setIsDownloadOptionsOpen(false);
            setAlertConfig({
                isOpen: true,
                title: "PDF Gerado",
                description: "A ficha do cliente foi baixada com sucesso.",
                type: "success"
            });
        } catch (error) {
            console.error(error);
            setAlertConfig({
                isOpen: true,
                title: "Erro",
                description: "Falha ao gerar o PDF.",
                type: "error"
            });
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                <DialogHeader className="pr-12">
                    <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                            <DialogTitle className="text-2xl font-bold">{client.name}</DialogTitle>
                            <DialogDescription className="flex items-center gap-2 mt-1 flex-wrap">
                                <span>ID: {client.id}</span>
                                <Badge variant={client.status === 'active' ? 'success' : client.status === 'blocked' ? 'destructive' : 'warning'}>
                                    {client.status === 'active' ? 'Ativo' : client.status === 'blocked' ? 'Bloqueado' : 'Suspenso'}
                                </Badge>
                                <Badge variant={
                                    client.riskLevel === 'low' ? 'success' :
                                        client.riskLevel === 'medium' ? 'warning' : 'destructive'
                                }>
                                    Risco {client.riskLevel === 'low' ? 'Baixo' :
                                        client.riskLevel === 'medium' ? 'Médio' : 'Alto'}
                                </Badge>
                            </DialogDescription>
                        </div>
                        <Button onClick={handleDownloadProfile} className="gap-2 shrink-0">
                            <Download className="h-4 w-4" />
                            Baixar Ficha (PDF)
                        </Button>
                    </div>
                </DialogHeader>

                <Tabs defaultValue="overview" className="mt-6">
                    <div className="overflow-x-auto">
                    <TabsList className="flex w-max min-w-full justify-start">
                        <TabsTrigger value="overview">Visão Geral</TabsTrigger>
                        <TabsTrigger value="installments">Crédito Ativo</TabsTrigger>
                        <TabsTrigger value="credits">Histórico de Créditos</TabsTrigger>
                        <TabsTrigger value="payments">Extrato & Pagamentos</TabsTrigger>
                        <TabsTrigger value="documents">Documentos</TabsTrigger>
                    </TabsList>
                    </div>

                    <TabsContent value="overview" className="space-y-6 mt-4">
                        {/* Personal Info Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-4">
                                <h3 className="font-semibold flex items-center gap-2">
                                    <FileText className="h-4 w-4" /> Dados Pessoais
                                </h3>
                                <div className="grid gap-3 text-sm border p-4 rounded-lg bg-muted/20">
                                    <div className="flex items-center gap-3">
                                        <CreditCard className="h-4 w-4 text-muted-foreground" />
                                        <span className="font-medium min-w-[80px]">NIF:</span>
                                        <span>{client.nif || 'Não informado'}</span>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <Phone className="h-4 w-4 text-muted-foreground" />
                                        <span className="font-medium min-w-[80px]">Telefone:</span>
                                        <span>{client.phone}</span>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <Mail className="h-4 w-4 text-muted-foreground" />
                                        <span className="font-medium min-w-[80px]">Email:</span>
                                        <span>{client.email || 'Não informado'}</span>
                                    </div>
                                    {client.birthDate && (
                                        <div className="flex items-center gap-3">
                                            <Calendar className="h-4 w-4 text-muted-foreground" />
                                            <span className="font-medium min-w-[80px]">Nascimento:</span>
                                            <span>{client.birthDate} {client.age ? `(${client.age} anos)` : ''}</span>
                                        </div>
                                    )}
                                    {client.gender && (
                                        <div className="flex items-center gap-3">
                                            <FileText className="h-4 w-4 text-muted-foreground" />
                                            <span className="font-medium min-w-[80px]">Género:</span>
                                            <span>{client.gender === 'M' ? 'Masculino' : client.gender === 'F' ? 'Feminino' : client.gender}</span>
                                        </div>
                                    )}
                                    {client.issueDate && (
                                        <div className="flex items-center gap-3">
                                            <Calendar className="h-4 w-4 text-muted-foreground" />
                                            <span className="font-medium min-w-[80px]">Emissão BI:</span>
                                            <span>{client.issueDate}</span>
                                        </div>
                                    )}
                                    {client.expiryDate && (
                                        <div className="flex items-center gap-3">
                                            <Calendar className="h-4 w-4 text-muted-foreground" />
                                            <span className="font-medium min-w-[80px]">Validade BI:</span>
                                            <span>{client.expiryDate}</span>
                                        </div>
                                    )}
                                    <div className="flex items-center gap-3">
                                        <MapPin className="h-4 w-4 text-muted-foreground" />
                                        <span className="font-medium min-w-[80px]">Endereço:</span>
                                        <span>{client.address || 'Não informado'}</span>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <Calendar className="h-4 w-4 text-muted-foreground" />
                                        <span className="font-medium min-w-[80px]">Registo:</span>
                                        <span>{formatDate(client.createdAt)}</span>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <h3 className="font-semibold flex items-center gap-2">
                                    <Wallet className="h-4 w-4" /> Resumo Financeiro
                                </h3>
                                <div className="grid gap-3 text-sm border p-4 rounded-lg bg-muted/20">
                                    <div className="flex justify-between items-center py-1 border-b">
                                        <span className="text-muted-foreground">Limite de Crédito</span>
                                        <span className="font-bold">{formatCurrency(client.creditLimit)}</span>
                                    </div>
                                    <div className="flex justify-between items-center py-1 border-b">
                                        <span className="text-muted-foreground">Limite Usado</span>
                                        <span className="font-bold text-amber-600">{formatCurrency(client.usedCredit || 0)}</span>
                                    </div>
                                    <div className="flex justify-between items-center py-1 border-b">
                                        <span className="text-muted-foreground">Disponível</span>
                                        <span className="font-bold text-success">{formatCurrency(client.availableCredit)}</span>
                                    </div>
                                    <div className="flex justify-between items-center py-1 border-b">
                                        <span className="text-muted-foreground">Total Emprestado</span>
                                        <span className="font-bold">{formatCurrency(totalLoaned)}</span>
                                    </div>
                                    <div className="flex justify-between items-center py-1">
                                        <span className="text-muted-foreground">Dívida Atual</span>
                                        <span className="font-bold text-destructive">{formatCurrency(totalDebt)}</span>
                                    </div>
                                </div>
                                {canGrantRemaining && onGrantRemaining && (
                                    <Button
                                        onClick={() => {
                                            onOpenChange(false);
                                            onGrantRemaining(client);
                                        }}
                                        className="w-full mt-3 gap-2 bg-success text-white hover:bg-success/90 font-bold"
                                        size="sm"
                                    >
                                        <CreditCard className="h-4 w-4" />
                                        Conceder Restante do Valor
                                    </Button>
                                )}
                            </div>
                        </div>

                        {/* Bank Coordinates Section */}
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <h3 className="font-semibold flex items-center gap-2">
                                    <Landmark className="h-4 w-4" /> Coordenadas Bancárias & Recebimento
                                </h3>
                                <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20">
                                    {client.receiveMethod === 'cash' ? 'Recebe em Mão' : 'Transferência'}
                                </Badge>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {client.bankCoordinates && client.bankCoordinates.length > 0 ? (
                                    client.bankCoordinates.map((iban) => (
                                        <div key={iban.id} className="flex flex-col gap-1 p-3 border rounded-lg bg-primary/5">
                                            <div className="flex items-center gap-2">
                                                <Landmark className="h-3 w-3 text-primary" />
                                                <span className="font-bold text-sm uppercase">{iban.bankName}</span>
                                            </div>
                                            <span className="font-mono text-xs text-primary font-bold">{iban.iban}</span>
                                            <span className="text-[10px] text-muted-foreground italic truncate">Titular: {iban.holder}</span>
                                        </div>
                                    ))
                                ) : (
                                    <div className="md:col-span-2 p-4 border border-dashed rounded-lg text-center bg-muted/20">
                                        <p className="text-xs text-muted-foreground">Nenhuma coordenada bancária registada.</p>
                                    </div>
                                )}
                            </div>

                            {client.receiveMethod === 'cash' && (
                                <div className="flex items-start gap-3 p-4 border border-amber-200 bg-amber-50 rounded-lg">
                                    <ShieldAlert className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                                    <div className="space-y-1">
                                        <p className="text-sm font-bold text-amber-800">Compromisso de Recebimento em Mão</p>
                                        <p className="text-xs text-amber-700">
                                            O cliente optou por receber o valor em numerário. A comprovação do recebimento será feita através da assinatura do contrato físico.
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Recent Activity Mini-Table */}
                        <div>
                            <h3 className="font-semibold flex items-center gap-2 mb-3">
                                <History className="h-4 w-4" /> Atividade Recente
                            </h3>
                            {clientPayments.length > 0 ? (
                                <div className="border rounded-lg overflow-hidden">
                                    <table className="w-full text-sm">
                                        <thead className="bg-muted text-muted-foreground">
                                            <tr>
                                                <th className="p-3 text-left">Data</th>
                                                <th className="p-3 text-left">Referência</th>
                                                <th className="p-3 text-right">Valor</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {clientPayments.slice(0, 3).map(p => (
                                                <tr key={p.id} className="border-t">
                                                    <td className="p-3">{formatDate(p.paymentDate)}</td>
                                                    <td className="p-3">{p.id}</td>
                                                    <td className="p-3 text-right font-medium">{formatCurrency(p.amount)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                <p className="text-muted-foreground text-sm italic">Nenhum pagamento registado recentemente.</p>
                            )}
                        </div>
                    </TabsContent>

                    <TabsContent value="installments">
                        <ClientCreditInstallments credits={clientCredits} payments={clientPayments} />
                    </TabsContent>

                    <TabsContent value="credits">
                        <ClientCreditInstallments credits={clientCredits} payments={clientPayments} history />
                    </TabsContent>

                    {/* Extrato & Histórico Geral de Pagamentos */}
                    <TabsContent value="payments" className="space-y-4 mt-4">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-muted/20 p-4 rounded-xl border">
                            <div>
                                <h3 className="text-base font-bold flex items-center gap-2">
                                    <Receipt className="h-4 w-4 text-primary" />
                                    Histórico Geral de Pagamentos
                                </h3>
                                <p className="text-xs text-muted-foreground">
                                    Consolidado de todas as amortizações e pagamentos realizados pelo cliente em todos os créditos.
                                </p>
                            </div>
                            <Button
                                onClick={handleDownloadGeneralHistory}
                                className="gap-2 shrink-0 bg-primary text-primary-foreground font-semibold text-xs shadow-xs"
                                size="sm"
                            >
                                <Download className="h-3.5 w-3.5" />
                                Baixar Extrato Geral (PDF)
                            </Button>
                        </div>

                        {/* Cartões de Indicadores de Pagamentos */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            <div className="p-3 rounded-xl border bg-card text-card-foreground shadow-2xs">
                                <span className="text-[10px] uppercase font-bold text-muted-foreground block">Total Liquidado</span>
                                <span className="text-base font-black text-emerald-600 dark:text-emerald-400">
                                    {formatCurrency(totalPaidSum, companySettings.currency)}
                                </span>
                            </div>
                            <div className="p-3 rounded-xl border bg-card text-card-foreground shadow-2xs">
                                <span className="text-[10px] uppercase font-bold text-muted-foreground block">Amortização Capital</span>
                                <span className="text-base font-black text-foreground">
                                    {formatCurrency(totalPrincipalPaidSum, companySettings.currency)}
                                </span>
                            </div>
                            <div className="p-3 rounded-xl border bg-card text-card-foreground shadow-2xs">
                                <span className="text-[10px] uppercase font-bold text-muted-foreground block">Juros & Encargos</span>
                                <span className="text-base font-black text-amber-600 dark:text-amber-400">
                                    {formatCurrency(totalInterestPaidSum, companySettings.currency)}
                                </span>
                            </div>
                            <div className="p-3 rounded-xl border bg-card text-card-foreground shadow-2xs">
                                <span className="text-[10px] uppercase font-bold text-muted-foreground block">Saldo Devedor</span>
                                <span className="text-base font-black text-destructive">
                                    {formatCurrency(totalDebt, companySettings.currency)}
                                </span>
                            </div>
                        </div>

                        {/* Tabela de Pagamentos */}
                        {clientPayments.length === 0 ? (
                            <div className="text-center py-10 border-2 border-dashed rounded-xl bg-muted/10">
                                <Receipt className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
                                <p className="text-sm font-semibold text-muted-foreground">Nenhum pagamento registado para este cliente</p>
                                <p className="text-xs text-muted-foreground/80 mt-1">
                                    Assim que forem efetuados pagamentos ou amortizações, o histórico completo aparecerá aqui com as respetivas fichas.
                                </p>
                            </div>
                        ) : (
                            <div className="border rounded-xl overflow-hidden shadow-2xs">
                                <table className="w-full text-xs">
                                    <thead className="bg-muted/60 text-muted-foreground font-semibold">
                                        <tr>
                                            <th className="p-3 text-left">Data</th>
                                            <th className="p-3 text-left">Crédito</th>
                                            <th className="p-3 text-left">Recibo</th>
                                            <th className="p-3 text-left">Método</th>
                                            <th className="p-3 text-right">Amortização</th>
                                            <th className="p-3 text-right">Juros/Mora</th>
                                            <th className="p-3 text-right">Total Pago</th>
                                            <th className="p-3 text-center w-28">Ficha / Ações</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                        {[...clientPayments]
                                            .sort((a, b) => new Date(b.paymentDate).getTime() - new Date(a.paymentDate).getTime())
                                            .map((payment) => {
                                                const relatedCredit = clientCredits.find(c => c.id === payment.creditId);
                                                const methodLabel = payment.method === 'cash' ? 'Numerário' :
                                                    payment.method === 'transfer' ? 'Transferência' :
                                                    payment.method === 'reference' ? 'Multicaixa' :
                                                    payment.method === 'deposit' ? 'Depósito' :
                                                    payment.method || 'Numerário';

                                                return (
                                                    <tr key={payment.id} className="hover:bg-muted/25 transition-colors">
                                                        <td className="p-3 font-medium whitespace-nowrap">
                                                            {formatDate(payment.paymentDate)}
                                                        </td>
                                                        <td className="p-3 font-mono text-[11px] text-primary">
                                                            {payment.creditId}
                                                        </td>
                                                        <td className="p-3 font-mono text-[11px]">
                                                            #{payment.id}
                                                        </td>
                                                        <td className="p-3">
                                                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-muted text-foreground border">
                                                                {methodLabel}
                                                            </span>
                                                        </td>
                                                        <td className="p-3 text-right font-medium">
                                                            {formatCurrency(payment.allocatedToPrincipal || 0, companySettings.currency)}
                                                        </td>
                                                        <td className="p-3 text-right text-muted-foreground">
                                                            {formatCurrency((payment.allocatedToInterest || 0) + (payment.allocatedToLateInterest || 0), companySettings.currency)}
                                                        </td>
                                                        <td className="p-3 text-right font-black text-emerald-600 dark:text-emerald-400">
                                                            {formatCurrency(payment.amount, companySettings.currency)}
                                                        </td>
                                                        <td className="p-3 text-center whitespace-nowrap">
                                                            <div className="flex items-center justify-center gap-1">
                                                                <Button
                                                                    size="sm"
                                                                    variant="outline"
                                                                    onClick={() => handleOpenSlip(payment)}
                                                                    className="h-7 px-2 text-[10px] gap-1 text-primary hover:bg-primary/10"
                                                                    title="Ver Ficha de Pagamento e Mensagem WhatsApp"
                                                                >
                                                                    <MessageCircle className="h-3 w-3" />
                                                                    Ficha
                                                                </Button>
                                                                <Button
                                                                    size="sm"
                                                                    variant="ghost"
                                                                    onClick={() => {
                                                                        try {
                                                                            generateReceiptPDF(
                                                                                payment,
                                                                                relatedCredit || {
                                                                                    id: payment.creditId,
                                                                                    clientId: client.id,
                                                                                    clientName: client.name,
                                                                                    principalAmount: payment.amount,
                                                                                    currentBalance: 0
                                                                                },
                                                                                companySettings,
                                                                                user?.name
                                                                            );
                                                                        } catch (err: any) {
                                                                            console.error(err);
                                                                        }
                                                                    }}
                                                                    className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                                                                    title="Baixar Recibo PDF"
                                                                >
                                                                    <Download className="h-3.5 w-3.5" />
                                                                </Button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </TabsContent>

                    <TabsContent value="documents">
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-4">
                            {Array.isArray(client.documents) && client.documents.length > 0 ? (
                                client.documents.map((doc, idx) => (
                                    <div key={idx} className="border rounded-lg p-3 flex flex-col gap-2 hover:bg-muted/20">
                                        <div className="h-24 bg-muted/50 rounded flex items-center justify-center overflow-hidden">
                                            {doc.type === 'image' ? (
                                                <img src={doc.data} alt={doc.title} className="w-full h-full object-cover" />
                                            ) : (
                                                <FileText className="h-10 w-10 text-muted-foreground" />
                                            )}
                                        </div>
                                        <div>
                                            <p className="font-medium text-sm truncate" title={doc.title}>{doc.title}</p>
                                            <p className="text-xs text-muted-foreground">{formatDate(new Date(doc.createdAt))}</p>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className="col-span-full py-8 text-center text-muted-foreground border-2 border-dashed rounded-lg">
                                    <p>Nenhum documento anexado.</p>
                                </div>
                            )}
                        </div>
                    </TabsContent>
                </Tabs>
                <AlertModal
                    isOpen={alertConfig.isOpen}
                    onClose={() => setAlertConfig({ ...alertConfig, isOpen: false })}
                    title={alertConfig.title}
                    description={alertConfig.description}
                    type={alertConfig.type}
                />

                <PaymentSlipModal
                    client={client}
                    payment={selectedPaymentForSlip}
                    credit={clientCredits.find(c => c.id === selectedPaymentForSlip?.creditId)}
                    open={isSlipOpen}
                    onOpenChange={setIsSlipOpen}
                />

                {/* Novo Diálogo de Opções de Download */}
                <Dialog open={isDownloadOptionsOpen} onOpenChange={setIsDownloadOptionsOpen}>
                    <DialogContent className="sm:max-w-[425px]">
                        <DialogHeader>
                            <DialogTitle>Opções de Download</DialogTitle>
                            <DialogDescription>
                                Escolha o que deseja incluir na ficha do cliente.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-4 py-4">
                            <div className="flex items-center space-x-2 border p-3 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                                onClick={() => setIncludeInterest(!includeInterest)}>
                                <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${includeInterest ? 'bg-primary border-primary' : 'bg-background border-input'}`}>
                                    {includeInterest && <div className="w-2.5 h-2.5 bg-white rounded-sm" />}
                                </div>
                                <div className="flex-1">
                                    <p className="text-sm font-medium leading-none">Incluir Informações de Juros</p>
                                    <p className="text-xs text-muted-foreground mt-1">Exibe taxa de juro padrão e de mora.</p>
                                </div>
                            </div>
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setIsDownloadOptionsOpen(false)}>Cancelar</Button>
                            <Button onClick={confirmDownload}>Gerar PDF</Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </DialogContent>
        </Dialog>
    );
}
