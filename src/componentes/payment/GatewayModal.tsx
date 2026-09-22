import React, { useState, useEffect } from 'react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/componentes/ui/dialog';
import { Button } from '@/componentes/ui/button';
import { Input } from '@/componentes/ui/input';
import { Label } from '@/componentes/ui/label';
import { Textarea } from '@/componentes/ui/textarea';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/componentes/ui/select';
import { useData } from '@/contextos/ContextoDados';
import { PaymentGateway, GATEWAY_TEMPLATES, PaymentProvider } from '@/tipos/pagamento';
import { Loader2, Key, Lock, Fingerprint, Eye, EyeOff, Building, CheckCircle2, ShieldCheck, HelpCircle } from 'lucide-react';
import { formatAngolanIBAN, identifyBankFromIBAN, validateAngolanIBAN } from '@/bibliotecas/ibanHelper';
import { GatewayLogo } from './LogosGateways';

interface GatewayModalProps {
    isOpen: boolean;
    onClose: () => void;
    gateway?: PaymentGateway | null;
    initialProvider?: PaymentProvider;
}

export function GatewayModal({ isOpen, onClose, gateway, initialProvider }: GatewayModalProps) {
    const { addPaymentGateway, updatePaymentGateway } = useData();
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({
        name: '',
        provider: 'multicaixa_express' as PaymentProvider,
        type: 'express' as PaymentGateway['type'],
        status: 'active' as PaymentGateway['status'],
        environment: 'sandbox' as PaymentGateway['environment'],
        apiKey: '',
        apiSecret: '',
        merchantId: '',
        webhookUrl: '',
        webhookSecret: '',
        transactionFee: 1.5,
        feeType: 'percentage' as PaymentGateway['feeType'],
        description: '',
    });

    const [bankConfig, setBankConfig] = useState({
        bankName: '',
        iban: '',
        accountHolder: ''
    });
    const [showApiKey, setShowApiKey] = useState(false);
    const [showApiSecret, setShowApiSecret] = useState(false);
    const [showWebhookSecret, setShowWebhookSecret] = useState(false);

    useEffect(() => {
        if (gateway) {
            setFormData({
                name: gateway.name,
                provider: gateway.provider,
                type: gateway.type,
                status: gateway.status,
                environment: gateway.environment,
                apiKey: gateway.apiKey || '',
                apiSecret: gateway.apiSecret || '',
                merchantId: gateway.merchantId || '',
                webhookUrl: gateway.webhookUrl || '',
                webhookSecret: gateway.webhookSecret || '',
                transactionFee: gateway.transactionFee,
                feeType: gateway.feeType,
                description: gateway.description || '',
            });

            if (gateway.provider === 'bank_transfer' && gateway.config) {
                try {
                    const parsed = JSON.parse(gateway.config);
                    setBankConfig({
                        bankName: parsed.bankName || '',
                        iban: parsed.iban || '',
                        accountHolder: parsed.accountHolder || ''
                    });
                } catch (e) {
                    console.error('Error parsing bank config', e);
                }
            }
        } else {
            const providerToUse = initialProvider || 'multicaixa_express';
            const template = GATEWAY_TEMPLATES[providerToUse] || GATEWAY_TEMPLATES['multicaixa_express'];
            
            let defaultType: PaymentGateway['type'] = 'express';
            if (providerToUse === 'bank_transfer') defaultType = 'transfer';
            else if (providerToUse === 'proxypay' || providerToUse === 'emis_gpo') defaultType = 'reference';
            else if (providerToUse === 'unitel_money' || providerToUse === 'afrimoney' || providerToUse === 'custom') defaultType = 'api';

            setFormData({
                name: template.name,
                provider: providerToUse,
                type: defaultType,
                status: 'active',
                environment: 'sandbox',
                apiKey: '',
                apiSecret: '',
                merchantId: '',
                webhookUrl: '',
                webhookSecret: '',
                transactionFee: providerToUse === 'bank_transfer' ? 0 : 2.0,
                feeType: 'percentage',
                description: template.description,
            });
            setBankConfig({ bankName: '', iban: '', accountHolder: '' });
        }
    }, [gateway, isOpen, initialProvider]);

    const handleProviderChange = (provider: PaymentProvider) => {
        const template = GATEWAY_TEMPLATES[provider];
        if (template) {
            let defaultType: PaymentGateway['type'] = 'express';
            if (provider === 'bank_transfer') defaultType = 'transfer';
            else if (provider === 'proxypay' || provider === 'emis_gpo') defaultType = 'reference';
            else if (provider === 'unitel_money' || provider === 'afrimoney' || provider === 'custom') defaultType = 'api';

            setFormData(prev => ({
                ...prev,
                provider,
                type: defaultType,
                name: template.name,
                description: template.description,
                transactionFee: provider === 'bank_transfer' ? 0 : prev.transactionFee
            }));
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            const gatewayData = {
                ...formData,
                logo: formData.provider,
                supportedMethods: JSON.stringify(GATEWAY_TEMPLATES[formData.provider]?.supportedMethods || []),
                config: formData.provider === 'bank_transfer' ? JSON.stringify(bankConfig) : undefined
            };

            if (gateway) {
                await updatePaymentGateway(gateway.id, gatewayData);
            } else {
                await addPaymentGateway(gatewayData);
            }

            onClose();
        } catch (error) {
            console.error('Failed to save gateway:', error);
        } finally {
            setLoading(false);
        }
    };

    // Rótulos inteligentes conforme a API oficial selecionada
    const getCredentialLabels = () => {
        switch (formData.provider) {
            case 'multicaixa_express':
                return {
                    key: 'Client ID / Chave da Aplicação (EMIS)',
                    secret: 'Client Secret / Chave Privada',
                    merchant: 'Terminal ID / Código de Comerciante EMIS'
                };
            case 'proxypay':
                return {
                    key: 'API Key (Token de Acesso ProxyPay)',
                    secret: 'Signature Secret (Validação de Webhook)',
                    merchant: 'Número da Entidade Multicaixa (ex: 00123)'
                };
            case 'appypay':
                return {
                    key: 'AppyPay Public Key (Chave Pública)',
                    secret: 'AppyPay Secret Key (Chave Secreta)',
                    merchant: 'Merchant Code / ID de Estabelecimento'
                };
            case 'emis_gpo':
                return {
                    key: 'Código de Entidade EMIS',
                    secret: 'Chave Criptográfica GPO',
                    merchant: 'ID de Estabelecimento Bancário'
                };
            case 'unitel_money':
                return {
                    key: 'Consumer Key (Unitel Open API)',
                    secret: 'Consumer Secret (Unitel)',
                    merchant: 'ShortCode / Número de Comerciante'
                };
            case 'afrimoney':
                return {
                    key: 'API User / Usuário Africell',
                    secret: 'API Secret / Chave Africell',
                    merchant: 'Merchant ID Afrimoney'
                };
            case 'bayqi':
                return {
                    key: 'API Key BayQi',
                    secret: 'Secret Key BayQi',
                    merchant: 'Partner ID / Identificador de Parceiro'
                };
            case 'kamba':
                return {
                    key: 'Chave Pública Kamba',
                    secret: 'Chave Privada Kamba',
                    merchant: 'Merchant Key / Chave da Loja'
                };
            default:
                return {
                    key: 'API Key (Chave Pública)',
                    secret: 'API Secret (Chave Secreta)',
                    merchant: 'Merchant ID (Identificador do Comerciante)'
                };
        }
    };

    const credLabels = getCredentialLabels();

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-2xl max-h-[92vh] flex flex-col p-0 gap-0 overflow-hidden rounded-2xl border shadow-2xl">
                {/* Cabeçalho da Modal com Logotipo Oficial */}
                <DialogHeader className="m-0 shrink-0 bg-[#0B1527] text-white px-6 pr-12 pt-6 pb-5 border-b border-white/10 space-y-1 relative shadow-none">
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-xl overflow-hidden shadow-md shrink-0 border border-white/15 bg-white/5 flex items-center justify-center">
                            <GatewayLogo provider={formData.provider} className="h-10 w-10" />
                        </div>
                        <div>
                            <DialogTitle className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
                                {gateway ? 'Editar Gateway' : 'Adicionar Gateway Oficial de Angola'}
                            </DialogTitle>
                            <DialogDescription className="text-xs text-white/75 leading-relaxed m-0">
                                Configure as credenciais oficiais da API de pagamentos para o mercado angolano.
                            </DialogDescription>
                        </div>
                    </div>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-hidden">
                    <div className="flex-1 overflow-y-auto p-6 space-y-5">
                        
                        {/* Seletor de Provedor Oficial de Angola */}
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <Label className="text-xs font-bold text-foreground">
                                    Provedor de Pagamento Oficial (Angola) *
                                </Label>
                                <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                                    <ShieldCheck className="h-3.5 w-3.5" />
                                    APIs Reais do Mercado Angolano
                                </span>
                            </div>
                            <Select
                                value={formData.provider}
                                onValueChange={(val: any) => handleProviderChange(val)}
                                disabled={!!gateway}
                            >
                                <SelectTrigger className="h-12 rounded-xl border-border bg-background shadow-2xs">
                                    <SelectValue>
                                        <div className="flex items-center gap-3">
                                            <div className="h-7 w-7 rounded-lg overflow-hidden shadow-xs shrink-0 border border-border/60">
                                                <GatewayLogo provider={formData.provider} className="h-7 w-7" />
                                            </div>
                                            <span className="font-bold text-xs text-foreground">
                                                {GATEWAY_TEMPLATES[formData.provider]?.name || formData.provider}
                                            </span>
                                        </div>
                                    </SelectValue>
                                </SelectTrigger>
                                <SelectContent className="max-h-72">
                                    {Object.entries(GATEWAY_TEMPLATES).map(([key, template]) => (
                                        <SelectItem key={key} value={key} className="py-2.5">
                                            <div className="flex items-center gap-3">
                                                <div className="h-7 w-7 rounded-lg overflow-hidden shadow-xs shrink-0 border border-border/40">
                                                    <GatewayLogo provider={key} className="h-7 w-7" />
                                                </div>
                                                <div>
                                                    <span className="font-bold text-xs block text-foreground">{template.name}</span>
                                                    <span className="text-[10px] text-muted-foreground line-clamp-1">{template.description}</span>
                                                </div>
                                            </div>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Nome e Tipo do Gateway */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <Label htmlFor="name" className="text-xs font-bold">Nome de Exibição *</Label>
                                <Input
                                    id="name"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    required
                                    className="h-9 text-xs rounded-xl"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="type" className="text-xs font-bold">Tipo de Operação *</Label>
                                <Select
                                    value={formData.type}
                                    onValueChange={(value: any) => setFormData({ ...formData, type: value })}
                                >
                                    <SelectTrigger className="h-9 text-xs rounded-xl">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="express">Multicaixa Express (Débito Direto)</SelectItem>
                                        <SelectItem value="reference">Pagamento por Referência EMIS</SelectItem>
                                        <SelectItem value="transfer">Transferência Bancária Direta</SelectItem>
                                        <SelectItem value="api">Carteira Digital / API Móvel</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        {/* Ambiente e Status */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <Label htmlFor="environment" className="text-xs font-bold">Ambiente de Operação</Label>
                                <Select
                                    value={formData.environment}
                                    onValueChange={(value: any) => setFormData({ ...formData, environment: value })}
                                >
                                    <SelectTrigger className="h-9 text-xs rounded-xl">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="sandbox">🧪 Sandbox (Ambiente de Testes)</SelectItem>
                                        <SelectItem value="production">🚀 Produção (Transações Reais)</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="status" className="text-xs font-bold">Estado do Gateway</Label>
                                <Select
                                    value={formData.status}
                                    onValueChange={(value: any) => setFormData({ ...formData, status: value })}
                                >
                                    <SelectTrigger className="h-9 text-xs rounded-xl">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="active">✅ Ativo (Disponível aos clientes)</SelectItem>
                                        <SelectItem value="inactive">⏸️ Inativo (Pausado)</SelectItem>
                                        <SelectItem value="testing">🛠️ Em Teste / Homologação</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        {/* Credenciais de API para Provedores Digitais */}
                        {formData.provider !== 'bank_transfer' && (
                            <div className="space-y-4 p-5 border rounded-2xl bg-muted/20 shadow-2xs">
                                <div className="flex items-center justify-between pb-2 border-b">
                                    <div className="flex items-center gap-2">
                                        <Key className="h-4 w-4 text-primary" />
                                        <h4 className="font-bold text-xs text-foreground">Credenciais da API Oficial</h4>
                                    </div>
                                    <span className="text-[10px] text-muted-foreground font-mono">Autenticação Segura</span>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-1.5">
                                        <Label htmlFor="apiKey" className="text-[11px] font-bold">{credLabels.key}</Label>
                                        <div className="relative">
                                            <Key className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                                            <Input
                                                id="apiKey"
                                                type={showApiKey ? "text" : "password"}
                                                value={formData.apiKey}
                                                onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
                                                placeholder="pk_live_... ou Token"
                                                className="pl-9 pr-10 h-9 text-xs rounded-xl font-mono"
                                            />
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon"
                                                className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                                                onClick={() => setShowApiKey(!showApiKey)}
                                            >
                                                {showApiKey ? (
                                                    <EyeOff className="h-4 w-4 text-muted-foreground" />
                                                ) : (
                                                    <Eye className="h-4 w-4 text-muted-foreground" />
                                                )}
                                            </Button>
                                        </div>
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label htmlFor="apiSecret" className="text-[11px] font-bold">{credLabels.secret}</Label>
                                        <div className="relative">
                                            <Lock className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                                            <Input
                                                id="apiSecret"
                                                type={showApiSecret ? "text" : "password"}
                                                value={formData.apiSecret}
                                                onChange={(e) => setFormData({ ...formData, apiSecret: e.target.value })}
                                                placeholder="sk_live_... ou Chave Privada"
                                                className="pl-9 pr-10 h-9 text-xs rounded-xl font-mono"
                                            />
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon"
                                                className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                                                onClick={() => setShowApiSecret(!showApiSecret)}
                                            >
                                                {showApiSecret ? (
                                                    <EyeOff className="h-4 w-4 text-muted-foreground" />
                                                ) : (
                                                    <Eye className="h-4 w-4 text-muted-foreground" />
                                                )}
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                                <div className="space-y-1.5">
                                    <Label htmlFor="merchantId" className="text-[11px] font-bold">{credLabels.merchant}</Label>
                                    <div className="relative">
                                        <Fingerprint className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                                        <Input
                                            id="merchantId"
                                            value={formData.merchantId}
                                            onChange={(e) => setFormData({ ...formData, merchantId: e.target.value })}
                                            placeholder="Ex: 00452 ou ID do Comerciante"
                                            className="pl-9 h-9 text-xs rounded-xl font-mono"
                                        />
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Dados Bancários de Angola (Para Transferência) */}
                        {formData.provider === 'bank_transfer' && (
                            <div className="space-y-4 p-5 border rounded-2xl bg-muted/20 shadow-2xs">
                                <div className="flex items-center justify-between pb-2 border-b">
                                    <div className="flex items-center gap-2">
                                        <Building className="h-4 w-4 text-primary" />
                                        <h4 className="font-bold text-xs text-foreground">Coordenadas Bancárias Angolanas</h4>
                                    </div>
                                    <span className="text-[10px] text-emerald-600 font-bold">Padrão BNA (AO06)</span>
                                </div>
                                <div className="space-y-1.5">
                                    <Label htmlFor="bankName" className="text-[11px] font-bold">Instituição Bancária</Label>
                                    <Input
                                        id="bankName"
                                        value={bankConfig.bankName}
                                        onChange={(e) => setBankConfig({ ...bankConfig, bankName: e.target.value })}
                                        placeholder="Ex: Banco Angolano de Investimentos (BAI)"
                                        className="h-9 text-xs rounded-xl"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <Label htmlFor="iban" className="text-[11px] font-bold">IBAN de Angola (AO06)</Label>
                                    <div className="space-y-2">
                                        <div className="relative">
                                            <Input
                                                id="iban"
                                                value={bankConfig.iban}
                                                onChange={(e) => {
                                                    const formatted = formatAngolanIBAN(e.target.value);
                                                    setBankConfig({ ...bankConfig, iban: formatted });
                                                }}
                                                placeholder="AO06 0000 0000 0000 0000 0000 0"
                                                className={`h-9 text-xs rounded-xl font-mono ${validateAngolanIBAN(bankConfig.iban) ? "border-emerald-500 bg-emerald-50/20" : ""}`}
                                            />
                                            {validateAngolanIBAN(bankConfig.iban) && (
                                                <div className="absolute right-3 top-2">
                                                    <div className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white shadow-xs">
                                                        <CheckCircle2 className="h-3.5 w-3.5" />
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        {bankConfig.iban && (
                                            <div className="flex items-center gap-2 p-2.5 rounded-xl border bg-background animate-in fade-in duration-200">
                                                <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center overflow-hidden shrink-0 font-black text-[10px] text-primary">
                                                    {identifyBankFromIBAN(bankConfig.iban)?.shortName || 'AO'}
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Banco Validado Automaticamente</p>
                                                    <p className="text-xs font-bold text-foreground truncate">
                                                        {identifyBankFromIBAN(bankConfig.iban)?.name || 'Banco Nacional'}
                                                    </p>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <div className="space-y-1.5">
                                    <Label htmlFor="accountHolder" className="text-[11px] font-bold">Titular da Conta Bancária</Label>
                                    <Input
                                        id="accountHolder"
                                        value={bankConfig.accountHolder}
                                        onChange={(e) => setBankConfig({ ...bankConfig, accountHolder: e.target.value })}
                                        placeholder="Ex: Empresa Exemplo, Lda."
                                        className="h-9 text-xs rounded-xl"
                                    />
                                </div>
                            </div>
                        )}

                        {/* Configuração de Webhook de Retorno Automático */}
                        {formData.provider !== 'bank_transfer' && (
                            <div className="space-y-4 p-5 border rounded-2xl bg-muted/20 shadow-2xs">
                                <div className="flex items-center justify-between pb-2 border-b">
                                    <h4 className="font-bold text-xs text-foreground">Webhooks para Confirmação Instantânea</h4>
                                    <span className="text-[10px] text-muted-foreground">Callbacks HTTP</span>
                                </div>
                                <div className="space-y-1.5">
                                    <Label htmlFor="webhookUrl" className="text-[11px] font-bold">URL do Endpoint de Notificação</Label>
                                    <Input
                                        id="webhookUrl"
                                        value={formData.webhookUrl}
                                        onChange={(e) => setFormData({ ...formData, webhookUrl: e.target.value })}
                                        placeholder="https://seu-sistema.ao/api/webhooks/pagamentos"
                                        className="h-9 text-xs rounded-xl font-mono"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <Label htmlFor="webhookSecret" className="text-[11px] font-bold">Webhook Secret / Assinatura HMAC</Label>
                                    <div className="relative">
                                        <Input
                                            id="webhookSecret"
                                            type={showWebhookSecret ? "text" : "password"}
                                            value={formData.webhookSecret}
                                            onChange={(e) => setFormData({ ...formData, webhookSecret: e.target.value })}
                                            placeholder="whsec_..."
                                            className="pr-10 h-9 text-xs rounded-xl font-mono"
                                        />
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                                            onClick={() => setShowWebhookSecret(!showWebhookSecret)}
                                        >
                                            {showWebhookSecret ? (
                                                <EyeOff className="h-4 w-4 text-muted-foreground" />
                                            ) : (
                                                <Eye className="h-4 w-4 text-muted-foreground" />
                                            )}
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Taxas do Gateway */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <Label htmlFor="transactionFee" className="text-xs font-bold">Taxa Cobrada pelo Gateway</Label>
                                <Input
                                    id="transactionFee"
                                    type="number"
                                    step="0.01"
                                    value={formData.transactionFee}
                                    onChange={(e) => setFormData({ ...formData, transactionFee: parseFloat(e.target.value) || 0 })}
                                    className="h-9 text-xs rounded-xl"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="feeType" className="text-xs font-bold">Tipo da Taxa</Label>
                                <Select
                                    value={formData.feeType}
                                    onValueChange={(value: any) => setFormData({ ...formData, feeType: value })}
                                >
                                    <SelectTrigger className="h-9 text-xs rounded-xl">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="percentage">Percentagem (%)</SelectItem>
                                        <SelectItem value="fixed">Valor Fixo (AOA)</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        {/* Descrição */}
                        <div className="space-y-1.5">
                            <Label htmlFor="description" className="text-xs font-bold">Descrição da Integração</Label>
                            <Textarea
                                id="description"
                                value={formData.description}
                                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                rows={2}
                                className="text-xs rounded-xl"
                            />
                        </div>
                    </div>

                    {/* Rodapé da Modal */}
                    <div className="flex shrink-0 justify-end gap-3 border-t border-border px-6 py-4 bg-muted/20">
                        <Button type="button" variant="outline" onClick={onClose} disabled={loading} className="rounded-xl text-xs">
                            Cancelar
                        </Button>
                        <Button type="submit" disabled={loading} className="rounded-xl text-xs font-bold bg-[#04432c] hover:bg-[#065f46] text-white">
                            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                            {gateway ? 'Atualizar Gateway' : 'Salvar e Ativar Gateway'}
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}
