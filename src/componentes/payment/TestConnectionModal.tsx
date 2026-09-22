import React from 'react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/componentes/ui/dialog';
import { Button } from '@/componentes/ui/button';
import { PaymentGateway, GatewayTestResult } from '@/tipos/pagamento';
import { CheckCircle2, XCircle, Loader2, Zap, Clock } from 'lucide-react';

interface TestConnectionModalProps {
    isOpen: boolean;
    onClose: () => void;
    gateway: PaymentGateway | null;
    testResult: GatewayTestResult | null;
    isTesting: boolean;
}

export function TestConnectionModal({
    isOpen,
    onClose,
    gateway,
    testResult,
    isTesting,
}: TestConnectionModalProps) {
    if (!gateway) return null;

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Zap className="h-5 w-5 text-primary" />
                        Teste de Conexão
                    </DialogTitle>
                    <DialogDescription>
                        {gateway.name} ({gateway.environment})
                    </DialogDescription>
                </DialogHeader>

                <div className="py-8">
                    {isTesting ? (
                        <div className="flex flex-col items-center justify-center space-y-4">
                            <div className="relative">
                                <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center">
                                    <Loader2 className="h-10 w-10 text-primary animate-spin" />
                                </div>
                            </div>
                            <div className="text-center">
                                <p className="font-semibold text-lg">Testando conexão...</p>
                                <p className="text-sm text-muted-foreground mt-1">
                                    Aguarde enquanto verificamos as credenciais
                                </p>
                            </div>
                        </div>
                    ) : testResult ? (
                        <div className="flex flex-col items-center justify-center space-y-4">
                            {/* Icon */}
                            <div className="relative">
                                <div
                                    className={`h-20 w-20 rounded-full flex items-center justify-center ${testResult.success
                                            ? 'bg-green-50 dark:bg-green-950/30'
                                            : 'bg-red-50 dark:bg-red-950/30'
                                        }`}
                                >
                                    {testResult.success ? (
                                        <CheckCircle2 className="h-10 w-10 text-green-600 dark:text-green-400" />
                                    ) : (
                                        <XCircle className="h-10 w-10 text-red-600 dark:text-red-400" />
                                    )}
                                </div>
                            </div>

                            {/* Message */}
                            <div className="text-center space-y-2">
                                <h3
                                    className={`font-bold text-xl ${testResult.success
                                            ? 'text-green-700 dark:text-green-400'
                                            : 'text-red-700 dark:text-red-400'
                                        }`}
                                >
                                    {testResult.success ? 'Conexão Bem-sucedida!' : 'Falha na Conexão'}
                                </h3>
                                <p className="text-sm text-muted-foreground max-w-sm">
                                    {testResult.message}
                                </p>
                            </div>

                            {/* Details */}
                            {testResult.latency !== undefined && (
                                <div className="w-full p-4 bg-muted/30 rounded-lg space-y-2">
                                    <div className="flex items-center justify-between text-sm">
                                        <span className="text-muted-foreground flex items-center gap-1">
                                            <Clock className="h-3 w-3" />
                                            Latência
                                        </span>
                                        <span className="font-mono font-semibold">{testResult.latency}ms</span>
                                    </div>
                                    {testResult.details && (
                                        <>
                                            <div className="flex items-center justify-between text-sm">
                                                <span className="text-muted-foreground">Provedor</span>
                                                <span className="font-semibold">{testResult.details.provider}</span>
                                            </div>
                                            <div className="flex items-center justify-between text-sm">
                                                <span className="text-muted-foreground">Ambiente</span>
                                                <span className="font-semibold capitalize">
                                                    {testResult.details.environment}
                                                </span>
                                            </div>
                                        </>
                                    )}
                                </div>
                            )}

                            {/* Recommendations */}
                            {!testResult.success && (
                                <div className="w-full p-4 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                                    <p className="text-xs text-amber-800 dark:text-amber-400">
                                        <strong>Sugestões:</strong>
                                        <br />
                                        • Verifique se as credenciais API estão corretas
                                        <br />
                                        • Confirme se o ambiente (Sandbox/Produção) está correto
                                        <br />
                                        • Verifique a conectividade com a internet
                                        <br />• Consulte a documentação do provedor
                                    </p>
                                </div>
                            )}
                        </div>
                    ) : null}
                </div>

                <DialogFooter>
                    <Button onClick={onClose} className="w-full">
                        {testResult?.success ? 'Concluir' : 'Fechar'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

