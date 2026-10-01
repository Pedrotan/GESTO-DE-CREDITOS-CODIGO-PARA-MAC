
import React, { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/componentes/ui/dialog';
import { Button } from '@/componentes/ui/button';
import { Input } from '@/componentes/ui/input';
import { Label } from '@/componentes/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/componentes/ui/select';
import { useData } from '@/contextos/ContextoDados';
import { PaymentGateway, PaymentReference } from '@/tipos/pagamento';
import { generateBankQRCode, generateReferenceQRCode } from '@/bibliotecas/payment-qr';
import { openWhatsApp } from '@/bibliotecas/whatsapp';
import { Loader2, Printer, Share2, Wallet, QrCode } from 'lucide-react';
import { toast } from '@/ganchos/usar-toast';
import { GatewayLogo } from './LogosGateways';

interface GeneratePaymentModalProps {
    isOpen: boolean;
    onClose: () => void;
    preselectedCreditId?: string;
    preselectedAmount?: number;
}

export function GeneratePaymentModal({
    isOpen,
    onClose,
    preselectedCreditId,
    preselectedAmount
}: GeneratePaymentModalProps) {
    const { paymentGateways, createPaymentReference, credits, clients } = useData();
    const [step, setStep] = useState<'form' | 'result'>('form');
    const [loading, setLoading] = useState(false);

    // Form State
    const [amount, setAmount] = useState<number>(preselectedAmount || 0);
    const [gatewayId, setGatewayId] = useState<string>('');
    const [creditId, setCreditId] = useState<string>(preselectedCreditId || 'manual');
    const [selectedClientId, setSelectedClientId] = useState<string>('');
    const [searchClient, setSearchClient] = useState('');

    // Result State
    const [generatedRef, setGeneratedRef] = useState<PaymentReference | null>(null);
    const [qrCodeData, setQrCodeData] = useState<string | null>(null);

    // Filter active gateways
    const activeGateways = useMemo(() => paymentGateways.filter(g => g.status === 'active'), [paymentGateways]);

    // Filtered clients for search
    const filteredClients = searchClient
        ? clients.filter(c => c.name.toLowerCase().includes(searchClient.toLowerCase()) || c.nif.includes(searchClient))
        : clients.slice(0, 5); // Show first 5 if no search

    useEffect(() => {
        if (isOpen) {
            setStep('form');
            setAmount(preselectedAmount || 0);
            setCreditId(preselectedCreditId || 'manual');
            setGeneratedRef(null);
            setQrCodeData(null);
            setSearchClient('');

            // If credit is preselected, set client automatically
            if (preselectedCreditId) {
                const credit = credits.find(c => c.id === preselectedCreditId);
                if (credit) setSelectedClientId(credit.clientId);
            } else {
                setSelectedClientId('');
            }

            // Auto-select first bank gateway if available
            const bankGateway = activeGateways.find(g => g.provider === 'bank_transfer');
            if (bankGateway) {
                setGatewayId(bankGateway.id);
            }
        }
    }, [isOpen, preselectedAmount, preselectedCreditId, credits, activeGateways]);

    const handleGenerate = async () => {
        if (!amount || !gatewayId) {
            toast.error('Preencha o valor e selecione um método de pagamento');
            return;
        }

        if (creditId === 'manual' && !selectedClientId) {
            toast.error('Selecione um cliente para o pagamento');
            return;
        }

        setLoading(true);
        try {
            const gateway = paymentGateways.find(g => g.id === gatewayId);
            if (!gateway) throw new Error('Gateway não encontrado');

            const refCode = `REF-${Math.floor(Math.random() * 1000000).toString().padStart(6, '0')}`;

            // If manual credit, we still need to link it to a client if possible? 
            // The system seems to rely on creditId. If it's manual, we create a reference with creditId='manual' 
            // but we might want to store clientId somewhere. 
            // For now, consistent with existing logic:

            const newRef = await createPaymentReference({
                creditId: creditId,
                gatewayId: gateway.id,
                reference: refCode,
                amount: amount,
                entity: gateway.provider === 'bank_transfer' ? 'BANCO' : 'EMIS',
                expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
            });

            setGeneratedRef(newRef);

            // 2. Generate QR Code
            let qr = '';
            if (gateway.provider === 'bank_transfer' && gateway.config) {
                try {
                    const bankConfig = JSON.parse(gateway.config);
                    qr = await generateBankQRCode({
                        amount: amount,
                        reference: refCode,
                        bankName: bankConfig.bankName || 'Banco',
                        iban: bankConfig.iban || 'AO06...',
                        beneficiary: bankConfig.accountHolder || 'Empresa'
                    });
                } catch (e) {
                    console.error('Error parsing bank config for QR', e);
                    qr = await generateReferenceQRCode(refCode);
                }
            } else {
                qr = await generateReferenceQRCode(refCode);
            }

            setQrCodeData(qr);
            setStep('result');
            toast.success('Referência gerada com sucesso!');

        } catch (error) {
            console.error(error);
            toast.error('Erro ao gerar referência');
        } finally {
            setLoading(false);
        }
    };

    const handleWhatsAppShare = () => {
        if (!generatedRef || !qrCodeData) return;
        let phone = '';

        // Try to find phone from selected client directly
        if (selectedClientId) {
            const client = clients.find(c => c.id === selectedClientId);
            if (client?.phone) phone = client.phone;
        } else if (creditId && creditId !== 'manual') {
            const credit = credits.find(c => c.id === creditId);
            const client = clients.find(c => c.id === credit?.clientId);
            if (client?.phone) phone = client.phone;
        }

        const message = `Olá! Segue os dados para pagamento:\n\nReferência: *${generatedRef.reference}*\nValor: *${new Intl.NumberFormat('pt-AO', { style: 'currency', currency: 'AOA' }).format(generatedRef.amount)}*\n\nPor favor, envie o comprovativo após pagamento.`;
        openWhatsApp(phone, message);
    };

    const handlePrint = () => {
        window.print();
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Gerar Pagamento</DialogTitle>
                    <DialogDescription>
                        Crie uma referência ou código QR para o cliente.
                    </DialogDescription>
                </DialogHeader>

                {step === 'form' ? (
                    <div className="space-y-4 py-4">
                        {/* Client Search Section - Only show if not preselected credit */}
                        {!preselectedCreditId && (
                            <div className="space-y-2">
                                <Label>Cliente</Label>
                                <Select
                                    value={selectedClientId}
                                    onValueChange={(val) => {
                                        setSelectedClientId(val);
                                        // If client has active credits, maybe switch creditId to 'manual' or let user pick? 
                                        // keeping it manual for simplicity unless they pick a credit below
                                    }}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Pesquisar cliente..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <div className="p-2 sticky top-0 bg-background z-10">
                                            <Input
                                                placeholder="Nome ou NIF..."
                                                value={searchClient}
                                                onChange={(e) => setSearchClient(e.target.value)}
                                                className="h-8"
                                                onKeyDown={(e) => e.stopPropagation()}
                                            />
                                        </div>
                                        {filteredClients.map(client => (
                                            <SelectItem key={client.id} value={client.id}>
                                                {client.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        )}

                        <div className="space-y-2">
                            <Label>Método de Pagamento</Label>
                            <Select value={gatewayId} onValueChange={setGatewayId}>
                                <SelectTrigger className="h-10">
                                    <SelectValue placeholder="Selecione um método de pagamento..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {activeGateways.map(g => (
                                        <SelectItem key={g.id} value={g.id}>
                                            <div className="flex items-center gap-2.5">
                                                <div className="h-5 w-5 rounded-xs overflow-hidden shrink-0 border border-border/50">
                                                    <GatewayLogo provider={g.provider} className="h-5 w-5" />
                                                </div>
                                                <span className="font-semibold">{g.name}</span>
                                                <span className="text-[10px] text-muted-foreground">
                                                    ({g.type === 'transfer' ? 'Transferência IBAN' : g.type === 'reference' ? 'Referência EMIS' : 'Multicaixa Express'})
                                                </span>
                                            </div>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label>Valor a Pagar (AOA)</Label>
                            <Input
                                type="number"
                                value={amount}
                                onChange={(e) => setAmount(parseFloat(e.target.value))}
                                min={0}
                                placeholder="0,00"
                                className="text-lg font-bold"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label>Crédito Associado (Opcional)</Label>
                            <Select value={creditId} onValueChange={setCreditId}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Selecione..." />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="manual">Pagamento Avulso / Genérico</SelectItem>
                                    {credits
                                        .filter(c => (!selectedClientId || c.clientId === selectedClientId) && (c.status === 'active' || c.status === 'overdue'))
                                        .map(c => (
                                            <SelectItem key={c.id} value={c.id}>
                                                {c.clientName} - {new Intl.NumberFormat('pt-AO', { style: 'currency', currency: 'AOA' }).format(c.totalDue)}
                                            </SelectItem>
                                        ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                ) : (
                    <div className="py-4 flex flex-col items-center text-center animate-in fade-in zoom-in duration-300">
                        <div className="mb-4 p-4 bg-white rounded-lg shadow-sm border">
                            {qrCodeData ? (
                                <img src={qrCodeData} alt="QR Code" className="w-48 h-48 object-contain" />
                            ) : (
                                <QrCode className="w-48 h-48 text-muted-foreground opacity-20" />
                            )}
                        </div>

                        <h3 className="text-2xl font-bold tracking-tight mb-1">
                            {formattedCurrency(generatedRef?.amount || 0)}
                        </h3>
                        <p className="text-sm text-muted-foreground mb-4">
                            Ref: <span className="font-mono font-bold text-foreground">{generatedRef?.reference}</span>
                        </p>

                        <div className="w-full grid grid-cols-2 gap-2">
                            <Button variant="outline" onClick={handleWhatsAppShare} className="w-full">
                                <Share2 className="w-4 h-4 mr-2" />
                                WhatsApp
                            </Button>
                            <Button variant="outline" onClick={handlePrint} className="w-full">
                                <Printer className="w-4 h-4 mr-2" />
                                Imprimir
                            </Button>
                        </div>
                    </div>
                )}

                <DialogFooter>
                    {step === 'form' ? (
                        <>
                            <Button variant="ghost" onClick={onClose}>Cancelar</Button>
                            <Button onClick={handleGenerate} disabled={loading}>
                                {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <QrCode className="w-4 h-4 mr-2" />}
                                Gerar Referência
                            </Button>
                        </>
                    ) : (
                        <Button onClick={onClose} className="w-full">Concluir</Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function formattedCurrency(value: number) {
    return new Intl.NumberFormat('pt-AO', { style: 'currency', currency: 'AOA' }).format(value);
}

