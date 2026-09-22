import { useState } from 'react';
import { Client, Credit, Payment } from '@/tipos/credito';
import { formatCurrency, formatDateTime } from '@/bibliotecas/formatters';
import { openWhatsApp } from '@/bibliotecas/whatsapp';
import { generateReceiptPDF } from '@/bibliotecas/pdf';
import { useData } from '@/contextos/ContextoDados';
import { useAuth } from '@/contextos/ContextoAutenticacao';
import { useToast } from '@/ganchos/usar-toast';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from '@/componentes/ui/dialog';
import { Button } from '@/componentes/ui/button';
import { Badge } from '@/componentes/ui/badge';
import {
    Receipt,
    Copy,
    Check,
    MessageCircle,
    Download,
    CreditCard,
    Calendar,
    Wallet,
    CheckCircle2
} from 'lucide-react';

interface PaymentSlipModalProps {
    client: Client | null;
    payment: Payment | null;
    credit?: Credit | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function PaymentSlipModal({
    client,
    payment,
    credit,
    open,
    onOpenChange
}: PaymentSlipModalProps) {
    const { companySettings } = useData();
    const { user } = useAuth();
    const { toast } = useToast();
    const [copied, setCopied] = useState(false);

    if (!client || !payment) return null;

    const paymentMethodLabel = payment.method === 'cash' ? 'Numerário (Em Mão)' :
        payment.method === 'transfer' ? 'Transferência Bancária' :
        payment.method === 'reference' ? 'Multicaixa Express' :
        payment.method === 'deposit' ? 'Depósito Bancário' :
        payment.method || 'Numerário';

    const currentBalance = credit ? formatCurrency(credit.currentBalance, companySettings.currency) : 'N/D';

    // Montagem da mensagem formatada para WhatsApp/SMS
    const message = [
        `🧾 *COMPROVATIVO DE PAGAMENTO* 🧾`,
        `*${companySettings.name || 'Tango Créditos'}*`,
        `----------------------------------------`,
        `👤 *Cliente:* ${client.name}`,
        `🆔 *NIF:* ${client.nif || 'Não informado'}`,
        `📄 *Recibo Nº:* #${payment.id}`,
        `💳 *Ref. Crédito:* ${payment.creditId}`,
        `📅 *Data:* ${formatDateTime(payment.paymentDate)}`,
        `💰 *Valor Pago:* ${formatCurrency(payment.amount, companySettings.currency)}`,
        `🏦 *Método:* ${paymentMethodLabel}`,
        `📉 *Amortização de Capital:* ${formatCurrency(payment.allocatedToPrincipal || 0, companySettings.currency)}`,
        `📊 *Juros / Encargos:* ${formatCurrency((payment.allocatedToInterest || 0) + (payment.allocatedToLateInterest || 0), companySettings.currency)}`,
        `⚖️ *Saldo Devedor Restante:* ${currentBalance}`,
        `----------------------------------------`,
        `_Agradecemos a sua preferência e pontualidade!_`
    ].join('\n');

    const handleCopy = () => {
        navigator.clipboard.writeText(message);
        setCopied(true);
        toast({
            title: "Mensagem Copiada!",
            description: "Texto pronto para colar no WhatsApp ou enviar por SMS."
        });
        setTimeout(() => setCopied(false), 2500);
    };

    const handleSendWhatsApp = () => {
        if (!client.phone) {
            toast({
                title: "Telefone não registado",
                description: "O cliente não possui contacto de telefone cadastrado.",
                variant: "destructive"
            });
            return;
        }
        openWhatsApp(client.phone, message);
    };

    const handleDownloadReceipt = () => {
        try {
            if (!credit) {
                // Objeto mínimo para gerar recibo caso o crédito não venha carregado
                const fallbackCredit: any = {
                    id: payment.creditId,
                    clientId: client.id,
                    clientName: client.name,
                    principalAmount: payment.amount,
                    currentBalance: 0
                };
                generateReceiptPDF(payment, fallbackCredit, companySettings, user?.name);
            } else {
                generateReceiptPDF(payment, credit, companySettings, user?.name);
            }
            toast({
                title: "Recibo Baixado",
                description: "O ficheiro PDF do recibo foi gerado com sucesso."
            });
        } catch (e: any) {
            toast({
                title: "Erro ao Gerar PDF",
                description: e?.message || "Falha ao gerar recibo.",
                variant: "destructive"
            });
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[550px] p-0 overflow-hidden border-none shadow-2xl rounded-2xl bg-background">
                {/* Header estilizado */}
                <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 p-6 text-white relative">
                    <div className="flex items-center gap-4">
                        <div className="h-12 w-12 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center shrink-0">
                            <Receipt className="h-6 w-6" />
                        </div>
                        <div className="space-y-0.5">
                            <div className="flex items-center gap-2">
                                <DialogTitle className="text-xl font-bold text-white tracking-tight">
                                    Ficha de Pagamento
                                </DialogTitle>
                                <Badge variant="outline" className="text-[10px] text-amber-400 border-amber-400/40">
                                    #{payment.id}
                                </Badge>
                            </div>
                            <DialogDescription className="text-slate-300 text-xs">
                                Comprovativo e mensagem pronta para partilha
                            </DialogDescription>
                        </div>
                    </div>
                </div>

                <div className="p-6 space-y-5">
                    {/* Cartão de Resumo Financeiro da Ficha */}
                    <div className="grid grid-cols-2 gap-3 p-4 rounded-xl bg-muted/25 border text-xs">
                        <div>
                            <span className="text-muted-foreground block text-[11px]">Cliente</span>
                            <strong className="text-sm font-bold text-foreground truncate block">{client.name}</strong>
                            <span className="text-[10px] text-muted-foreground">NIF: {client.nif || 'S/NIF'}</span>
                        </div>
                        <div className="text-right">
                            <span className="text-muted-foreground block text-[11px]">Valor Pago</span>
                            <strong className="text-base font-black text-emerald-600 dark:text-emerald-400 block">
                                {formatCurrency(payment.amount, companySettings.currency)}
                            </strong>
                            <Badge variant="secondary" className="text-[10px]">
                                {paymentMethodLabel}
                            </Badge>
                        </div>

                        <div className="pt-2 border-t mt-1">
                            <span className="text-muted-foreground block text-[10px]">Data & Horário</span>
                            <span className="font-semibold">{formatDateTime(payment.paymentDate)}</span>
                        </div>
                        <div className="pt-2 border-t mt-1 text-right">
                            <span className="text-muted-foreground block text-[10px]">Saldo Devedor Restante</span>
                            <span className="font-semibold text-destructive">{currentBalance}</span>
                        </div>
                    </div>

                    {/* Caixa com Mensagem Formatada para WhatsApp / SMS */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-bold flex items-center gap-1.5 text-foreground">
                                <MessageCircle className="h-3.5 w-3.5 text-emerald-600" />
                                Mensagem Pronta para WhatsApp / SMS:
                            </span>
                            <Button
                                size="sm"
                                variant="ghost"
                                onClick={handleCopy}
                                className="h-7 text-xs gap-1.5 text-primary hover:bg-primary/10"
                            >
                                {copied ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                                {copied ? "Copiado!" : "Copiar Texto"}
                            </Button>
                        </div>
                        <div className="p-3.5 rounded-xl bg-muted/40 border font-mono text-[11px] leading-relaxed text-slate-800 dark:text-slate-200 whitespace-pre-wrap select-all max-h-48 overflow-y-auto">
                            {message}
                        </div>
                    </div>

                    {/* Botões de Ação */}
                    <DialogFooter className="gap-2 sm:gap-2 flex-col sm:flex-row pt-2">
                        <Button
                            variant="outline"
                            onClick={handleDownloadReceipt}
                            className="gap-2 text-xs w-full sm:w-auto"
                        >
                            <Download className="h-3.5 w-3.5 text-primary" />
                            Baixar Recibo (PDF)
                        </Button>

                        <Button
                            onClick={handleSendWhatsApp}
                            className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs w-full sm:w-auto"
                        >
                            <MessageCircle className="h-4 w-4" />
                            Enviar via WhatsApp
                        </Button>
                    </DialogFooter>
                </div>
            </DialogContent>
        </Dialog>
    );
}
