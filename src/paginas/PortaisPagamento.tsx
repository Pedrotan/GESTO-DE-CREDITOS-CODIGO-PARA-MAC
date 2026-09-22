import React, { useState } from 'react';
import { MainLayout } from '@/componentes/layout/MainLayout';
import { Button } from '@/componentes/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/componentes/ui/card';
import { Badge } from '@/componentes/ui/badge';
import { useData } from '@/contextos/ContextoDados';
import { useAuth } from '@/contextos/ContextoAutenticacao';
import { PaymentGateway, PaymentProvider, GATEWAY_TEMPLATES } from '@/tipos/pagamento';
import {
    Plus,
    Settings,
    Trash2,
    TestTube,
    CheckCircle2,
    XCircle,
    Clock,
    Edit,
    Power,
    PowerOff,
    Zap,
    Wallet,
    FileCheck,
    ShieldCheck,
    Landmark,
    ExternalLink
} from 'lucide-react';
import { AlertModal } from '@/componentes/ui/AlertModal';
import { GatewayModal } from '@/componentes/payment/GatewayModal';
import { TestConnectionModal } from '@/componentes/payment/TestConnectionModal';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/componentes/ui/tabs";
import { PendingPaymentsList } from '@/componentes/payment/PendingPaymentsList';
import { GeneratePaymentModal } from '@/componentes/payment/GeneratePaymentModal';
import { GatewayLogo } from '@/componentes/payment/LogosGateways';

export default function PaymentGateways() {
    const { user } = useAuth();
    const { paymentGateways, deletePaymentGateway, updatePaymentGateway, testGatewayConnection, paymentReferences } = useData();
    const [isGatewayModalOpen, setIsGatewayModalOpen] = useState(false);
    const [isTestModalOpen, setIsTestModalOpen] = useState(false);
    const [isGenerateModalOpen, setIsGenerateModalOpen] = useState(false);
    const [selectedGateway, setSelectedGateway] = useState<PaymentGateway | null>(null);
    const [initialProvider, setInitialProvider] = useState<PaymentProvider | undefined>(undefined);
    const [testResult, setTestResult] = useState<any>(null);
    const [isTesting, setIsTesting] = useState(false);
    const [alertConfig, setAlertConfig] = useState({
        isOpen: false,
        title: '',
        description: '',
        type: 'success' as any,
        onConfirm: () => { }
    });

    const isSuperAdmin = user?.role === 'super_admin';
    const pendingCount = paymentReferences?.filter(r => r.status === 'pending' || r.status === 'pending_validation').length || 0;

    const handleAddGateway = (provider?: PaymentProvider) => {
        setSelectedGateway(null);
        setInitialProvider(provider);
        setIsGatewayModalOpen(true);
    };

    const handleEditGateway = (gateway: PaymentGateway) => {
        setSelectedGateway(gateway);
        setInitialProvider(gateway.provider);
        setIsGatewayModalOpen(true);
    };

    const handleDeleteGateway = (gateway: PaymentGateway) => {
        setAlertConfig({
            isOpen: true,
            title: 'Eliminar Gateway',
            description: `Tem certeza que deseja eliminar o gateway "${gateway.name}"? Esta ação não pode ser desfeita.`,
            type: 'warning',
            onConfirm: async () => {
                await deletePaymentGateway(gateway.id);
                setAlertConfig({ ...alertConfig, isOpen: false });
            }
        });
    };

    const handleTestConnection = async (gateway: PaymentGateway) => {
        setSelectedGateway(gateway);
        setIsTesting(true);
        setIsTestModalOpen(true);

        const result = await testGatewayConnection(gateway.id);
        setTestResult(result);
        setIsTesting(false);
    };

    const handleToggleStatus = async (gateway: PaymentGateway) => {
        const newStatus = gateway.status === 'active' ? 'inactive' : 'active';
        await updatePaymentGateway(gateway.id, { status: newStatus });
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'active':
                return <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px]"><Power className="h-3 w-3 mr-1" />Ativo</Badge>;
            case 'inactive':
                return <Badge variant="secondary" className="font-bold text-[10px]"><PowerOff className="h-3 w-3 mr-1" />Inativo</Badge>;
            case 'testing':
                return <Badge className="bg-amber-500 hover:bg-amber-600 text-white font-bold text-[10px]"><Zap className="h-3 w-3 mr-1" />Homologação</Badge>;
            default:
                return <Badge variant="outline">{status}</Badge>;
        }
    };

    const getTestResultIcon = (result?: string) => {
        if (!result) return <Clock className="h-4 w-4 text-muted-foreground" />;
        if (result === 'success') return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
        return <XCircle className="h-4 w-4 text-red-500" />;
    };

    return (
        <MainLayout title="Gateways de Pagamento" subtitle="APIs e métodos de pagamento oficiais de Angola">
            <div className="space-y-6 pb-12">
                {/* Header */}
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-2">
                            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-foreground">
                                Gateways de Pagamento
                            </h1>
                            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30 text-xs font-bold gap-1">
                                <ShieldCheck className="h-3.5 w-3.5" /> Mercado Angolano
                            </Badge>
                        </div>
                        <p className="text-muted-foreground text-xs sm:text-sm mt-1">
                            Integração com APIs de Multicaixa Express, Referências EMIS, Carteiras Digitais e Transferências Bancárias (AO06).
                        </p>
                    </div>
                    <div className="flex items-center gap-2.5">
                        <Button
                            onClick={() => setIsGenerateModalOpen(true)}
                            className="bg-[#04432c] hover:bg-[#065f46] text-white font-bold rounded-xl h-10 shadow-xs gap-2"
                        >
                            <Wallet className="h-4 w-4" />
                            Receber Pagamento
                        </Button>
                        {isSuperAdmin && (
                            <Button
                                onClick={() => handleAddGateway()}
                                variant="outline"
                                className="rounded-xl h-10 font-semibold gap-2"
                            >
                                <Plus className="h-4 w-4" />
                                Adicionar Gateway
                            </Button>
                        )}
                    </div>
                </div>

                <Tabs defaultValue="gateways" className="w-full">
                    <TabsList className="grid w-full max-w-md grid-cols-2 rounded-xl h-10 p-1">
                        <TabsTrigger value="gateways" className="flex items-center gap-2 rounded-lg text-xs font-bold">
                            <Wallet className="h-4 w-4" />
                            Gateways ({paymentGateways.length})
                        </TabsTrigger>
                        <TabsTrigger value="validations" className="flex items-center gap-2 rounded-lg text-xs font-bold relative">
                            <FileCheck className="h-4 w-4" />
                            Validações
                            {pendingCount > 0 && (
                                <Badge variant="destructive" className="ml-1.5 h-4 min-w-4 px-1 rounded-full text-[10px] font-bold">
                                    {pendingCount}
                                </Badge>
                            )}
                        </TabsTrigger>
                    </TabsList>

                    {/* TAB: GATEWAYS CONFIGURADOS */}
                    <TabsContent value="gateways" className="space-y-6 mt-6">
                        
                        {/* Indicadores KPI */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                            <Card className="rounded-2xl border border-border shadow-xs">
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-xs font-bold text-muted-foreground uppercase">Total Gateways</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="text-2xl font-black text-foreground">{paymentGateways.length}</div>
                                </CardContent>
                            </Card>
                            <Card className="rounded-2xl border border-border shadow-xs">
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase">Ativos</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
                                        {paymentGateways.filter(g => g.status === 'active').length}
                                    </div>
                                </CardContent>
                            </Card>
                            <Card className="rounded-2xl border border-border shadow-xs">
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-xs font-bold text-amber-600 uppercase">Sandbox (Testes)</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="text-2xl font-black text-amber-600">
                                        {paymentGateways.filter(g => g.environment === 'sandbox').length}
                                    </div>
                                </CardContent>
                            </Card>
                            <Card className="rounded-2xl border border-border shadow-xs">
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-xs font-bold text-blue-600 uppercase">Produção Real</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="text-2xl font-black text-blue-600">
                                        {paymentGateways.filter(g => g.environment === 'production').length}
                                    </div>
                                </CardContent>
                            </Card>
                        </div>

                        {/* Gateways Configurados */}
                        {paymentGateways.length > 0 && (
                            <div className="space-y-3">
                                <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                                    Gateways Instalados no Sistema ({paymentGateways.length})
                                </h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                    {paymentGateways.map(gateway => {
                                        const template = GATEWAY_TEMPLATES[gateway.provider];
                                        return (
                                            <Card key={gateway.id} className="relative overflow-hidden rounded-2xl border border-border shadow-xs hover:shadow-md transition-shadow">
                                                <CardHeader className="pb-3">
                                                    <div className="flex items-start justify-between gap-3">
                                                        <div className="flex items-center gap-3 min-w-0">
                                                            <div className="h-12 w-12 rounded-xl overflow-hidden shadow-xs flex items-center justify-center shrink-0 border border-border/50 bg-background">
                                                                <GatewayLogo provider={gateway.provider} className="h-12 w-12" />
                                                            </div>
                                                            <div className="min-w-0">
                                                                <CardTitle className="text-base font-bold truncate text-foreground">{gateway.name}</CardTitle>
                                                                <CardDescription className="text-xs line-clamp-1">
                                                                    {template?.description || gateway.description}
                                                                </CardDescription>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </CardHeader>
                                                <CardContent className="space-y-4 pt-1">
                                                    {/* Status e Ambiente */}
                                                    <div className="flex items-center gap-2">
                                                        {getStatusBadge(gateway.status)}
                                                        <Badge variant="outline" className="text-[10px] font-bold">
                                                            {gateway.environment === 'sandbox' ? '🧪 Sandbox' : '🚀 Produção'}
                                                        </Badge>
                                                        <Badge variant="outline" className="text-[10px] font-bold uppercase ml-auto">
                                                            {gateway.type === 'express' ? 'Express' : gateway.type === 'reference' ? 'Referência' : gateway.type === 'transfer' ? 'IBAN AO06' : 'API'}
                                                        </Badge>
                                                    </div>

                                                    {/* Teste recente */}
                                                    {gateway.lastTestedAt && (
                                                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                                            {getTestResultIcon(gateway.lastTestResult || undefined)}
                                                            <span>
                                                                Testado: {new Date(gateway.lastTestedAt).toLocaleDateString('pt-PT')}
                                                            </span>
                                                        </div>
                                                    )}

                                                    {/* Botões de Ação */}
                                                    <div className="flex items-center gap-2 pt-3 border-t">
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            onClick={() => handleTestConnection(gateway)}
                                                            className="flex-1 h-8 rounded-lg text-xs font-semibold gap-1.5"
                                                        >
                                                            <TestTube className="h-3.5 w-3.5" />
                                                            Testar Conexão
                                                        </Button>
                                                        {isSuperAdmin && (
                                                            <>
                                                                <Button
                                                                    variant="outline"
                                                                    size="sm"
                                                                    onClick={() => handleEditGateway(gateway)}
                                                                    className="h-8 w-8 p-0 rounded-lg"
                                                                    title="Editar Configurações"
                                                                >
                                                                    <Edit className="h-3.5 w-3.5" />
                                                                </Button>
                                                                <Button
                                                                    variant="outline"
                                                                    size="sm"
                                                                    onClick={() => handleToggleStatus(gateway)}
                                                                    className={`h-8 w-8 p-0 rounded-lg ${gateway.status === 'active' ? 'text-emerald-600' : ''}`}
                                                                    title={gateway.status === 'active' ? 'Desativar' : 'Ativar'}
                                                                >
                                                                    {gateway.status === 'active' ? <Power className="h-3.5 w-3.5" /> : <PowerOff className="h-3.5 w-3.5" />}
                                                                </Button>
                                                                <Button
                                                                    variant="outline"
                                                                    size="sm"
                                                                    onClick={() => handleDeleteGateway(gateway)}
                                                                    className="h-8 w-8 p-0 rounded-lg text-red-600 hover:text-red-700"
                                                                    title="Eliminar Gateway"
                                                                >
                                                                    <Trash2 className="h-3.5 w-3.5" />
                                                                </Button>
                                                            </>
                                                        )}
                                                    </div>
                                                </CardContent>
                                            </Card>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* --- VITRINE DE GATEWAYS E APIS OFICIAIS DO MERCADO ANGOLANO --- */}
                        <div className="space-y-4 pt-4">
                            <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
                                <div>
                                    <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                                        <Landmark className="h-5 w-5 text-primary" />
                                        APIs de Pagamento Oficiais do Mercado Angolano
                                    </h3>
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                        Clique em qualquer provedor homologado em Angola para configurar credenciais de Sandbox ou Produção.
                                    </p>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                {Object.entries(GATEWAY_TEMPLATES)
                                    .filter(([k]) => k !== 'custom')
                                    .map(([key, template]) => {
                                        const isConfigured = paymentGateways.some(g => g.provider === key);
                                        return (
                                            <div
                                                key={key}
                                                className="group p-4 rounded-2xl border border-border bg-card hover:border-primary/50 hover:shadow-md transition-all flex flex-col justify-between"
                                            >
                                                <div className="space-y-3">
                                                    <div className="flex items-start justify-between gap-2">
                                                        <div className="h-12 w-12 rounded-xl overflow-hidden shadow-xs shrink-0 border border-border/40 group-hover:scale-105 transition-transform">
                                                            <GatewayLogo provider={key} className="h-12 w-12" />
                                                        </div>
                                                        {isConfigured ? (
                                                            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30 text-[10px] font-bold">
                                                                Instalado
                                                            </Badge>
                                                        ) : (
                                                            <Badge variant="outline" className="text-[10px] text-muted-foreground">
                                                                Disponível
                                                            </Badge>
                                                        )}
                                                    </div>
                                                    <div>
                                                        <h4 className="font-bold text-xs sm:text-sm text-foreground group-hover:text-primary transition-colors">
                                                            {template.name}
                                                        </h4>
                                                        <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2 leading-relaxed">
                                                            {template.description}
                                                        </p>
                                                    </div>
                                                </div>

                                                <div className="pt-4 mt-3 border-t border-border/50 flex items-center justify-between gap-2">
                                                    <div className="flex gap-1 flex-wrap">
                                                        {template.supportedMethods.map(m => (
                                                            <span key={m} className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                                                                {m.replace('_', ' ')}
                                                            </span>
                                                        ))}
                                                    </div>
                                                    <Button
                                                        size="sm"
                                                        variant={isConfigured ? "outline" : "default"}
                                                        onClick={() => handleAddGateway(key as PaymentProvider)}
                                                        className="h-7 px-2.5 text-[11px] font-bold rounded-lg shrink-0"
                                                    >
                                                        <Plus className="h-3 w-3 mr-1" />
                                                        {isConfigured ? 'Novo' : 'Configurar'}
                                                    </Button>
                                                </div>
                                            </div>
                                        );
                                    })}
                            </div>
                        </div>

                    </TabsContent>

                    {/* TAB: VALIDAÇÕES */}
                    <TabsContent value="validations" className="space-y-6 mt-6">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-xl font-bold">Pagamentos Pendentes de Validação</h2>
                            <Button variant="outline" size="sm" onClick={() => window.location.reload()} className="rounded-xl text-xs gap-1.5">
                                <Zap className="h-3.5 w-3.5" /> Atualizar
                            </Button>
                        </div>
                        <PendingPaymentsList />
                    </TabsContent>
                </Tabs>

                {/* Modais do Sistema */}
                {isGatewayModalOpen && (
                    <GatewayModal
                        isOpen={isGatewayModalOpen}
                        onClose={() => setIsGatewayModalOpen(false)}
                        gateway={selectedGateway}
                        initialProvider={initialProvider}
                    />
                )}

                {isTestModalOpen && selectedGateway && (
                    <TestConnectionModal
                        isOpen={isTestModalOpen}
                        onClose={() => setIsTestModalOpen(false)}
                        gateway={selectedGateway}
                        testResult={testResult}
                        isTesting={isTesting}
                    />
                )}

                {isGenerateModalOpen && (
                    <GeneratePaymentModal
                        isOpen={isGenerateModalOpen}
                        onClose={() => setIsGenerateModalOpen(false)}
                    />
                )}

                <AlertModal
                    isOpen={alertConfig.isOpen}
                    title={alertConfig.title}
                    description={alertConfig.description}
                    type={alertConfig.type}
                    onConfirm={alertConfig.onConfirm}
                    onClose={() => setAlertConfig({ ...alertConfig, isOpen: false })}
                />
            </div>
        </MainLayout>
    );
}
