import React, { useState, useEffect } from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from '@/componentes/ui/dialog';
import { Button } from '@/componentes/ui/button';
import { Input } from '@/componentes/ui/input';
import { Label } from '@/componentes/ui/label';
import {
    Key,
    ShieldCheck,
    AlertCircle,
    Copy,
    CheckCircle2,
    Clock,
    Building2,
    KeyRound,
    Loader2,
    Rocket,
    Globe,
    Database,
    Laptop,
    Users,
} from 'lucide-react';
import { validateLicense, getMachineId, getLicenseTypeName } from '@/bibliotecas/licenciamento';
import { appAdapter } from '@/bibliotecas/adaptador-aplicacao';
import { useData } from '@/contextos/ContextoDados';
import { useToast } from '@/ganchos/usar-toast';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';

interface LicenseRenewalModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const LicenseRenewalModal: React.FC<LicenseRenewalModalProps> = ({ isOpen, onClose }) => {
    const { companySettings, updateCompanySettings } = useData();
    const { toast } = useToast();
    const [licenseKey, setLicenseKey] = useState('');
    const [isValidating, setIsValidating] = useState(false);
    const [machineId, setMachineId] = useState('');
    const [validationResult, setValidationResult] = useState<any>(null);
    const [step, setStep] = useState<'input' | 'success'>('input');

    useEffect(() => {
        const fetchMID = async () => {
            const mid = await getMachineId();
            setMachineId(mid);
        };
        fetchMID();
    }, []);

    const handleValidate = async () => {
        if (!licenseKey.trim()) {
            toast({
                title: "Chave em falta",
                description: "Por favor, insira a chave de licença para continuar.",
                variant: "destructive"
            });
            return;
        }

        setIsValidating(true);
        try {
            // 1. Validação Criptográfica (RSA/Hardware ID)
            const result = await validateLicense(licenseKey);

            if (result.isValid) {
                // 2. Validação de Uso Único (Rede/Sync)
                // Se houver uma URL de sincronização, verificamos se a chave já foi usada noutro MID
                if (companySettings.syncUrl) {
                    const activation = await appAdapter.activateLicense(
                        companySettings.syncUrl,
                        licenseKey.trim(),
                        machineId
                    );

                    if (!activation.success) {
                        toast({
                            title: "Ativação Negada",
                            description: activation.message,
                            variant: "destructive"
                        });
                        return;
                    }
                }

                setValidationResult(result);
                setStep('success');
            } else {
                toast({
                    title: "Licença Inválida",
                    description: result.message || "A chave inserida não é válida ou não corresponde a este hardware.",
                    variant: "destructive"
                });
            }
        } catch (error) {
            toast({
                title: "Erro de Validação",
                description: "Ocorreu um erro ao processar a assinatura digital.",
                variant: "destructive"
            });
        } finally {
            setIsValidating(false);
        }
    };

    const handleActivate = async () => {
        try {
            await updateCompanySettings({
                licenseKey: licenseKey
            });

            toast({
                title: "Licença Ativada",
                description: "O sistema foi atualizado com a nova licença.",
            });

            // Recarregar a página para garantir que todas as restrições sejam atualizadas
            setTimeout(() => {
                window.location.reload();
            }, 1500);

            onClose();
        } catch (error) {
            toast({
                title: "Erro ao Salvar",
                description: "Não foi possível persistir a nova licença.",
                variant: "destructive"
            });
        }
    };

    const copyMID = () => {
        navigator.clipboard.writeText(machineId);
        toast({
            title: "Copiado",
            description: "ID da Máquina copiado para a área de transferência."
        });
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[500px] overflow-hidden p-0 border-none shadow-2xl">
                {step === 'input' ? (
                    <>
                        <div className="h-2 bg-gradient-to-r from-blue-600 to-indigo-600" />
                        <DialogHeader className="px-6 pt-6">
                            <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center mb-4">
                                <KeyRound className="h-6 w-6 text-blue-600" />
                            </div>
                            <DialogTitle className="text-2xl font-black tracking-tight">Renovar Licença</DialogTitle>
                            <DialogDescription>
                                Insira a nova Serial Key para prolongar o seu acesso ao sistema.
                            </DialogDescription>
                        </DialogHeader>

                        <div className="p-6 space-y-6">
                            <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between">
                                <div className="space-y-1">
                                    <Label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">ID Deste Computador (MID)</Label>
                                    <div className="font-mono text-sm font-bold text-slate-800">{machineId}</div>
                                </div>
                                <Button variant="ghost" size="icon" onClick={copyMID} className="h-8 w-8 text-blue-600">
                                    <Copy className="h-4 w-4" />
                                </Button>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="license-key" className="font-bold">Chave de Ativação (Serial Key)</Label>
                                <Input
                                    id="license-key"
                                    placeholder="Cole aqui a sua chave..."
                                    className="font-mono text-sm h-12 bg-white border-slate-200 focus:ring-blue-500"
                                    value={licenseKey}
                                    onChange={(e) => setLicenseKey(e.target.value)}
                                />
                                <p className="text-[10px] text-muted-foreground">
                                    A chave é vinculada ao ID da máquina acima. Chaves de outros computadores não funcionarão.
                                </p>
                            </div>

                            <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-100 rounded-lg">
                                <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5" />
                                <div className="text-[11px] text-amber-800 leading-tight">
                                    <span className="font-bold block mb-1">Nota de Segurança:</span>
                                    Ao renovar, o sistema validará a assinatura digital RSA-2048. Certifique-se de que a chave foi fornecida pelo suporte oficial do Tango ERP.
                                </div>
                            </div>
                        </div>

                        <DialogFooter className="p-6 bg-slate-50 border-t flex flex-col sm:flex-row gap-3">
                            <Button variant="outline" onClick={onClose} className="sm:flex-1">Cancelar</Button>
                            <Button
                                onClick={handleValidate}
                                disabled={isValidating || !licenseKey}
                                className="sm:flex-1 bg-blue-600 hover:bg-blue-700"
                            >
                                {isValidating ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Validando...
                                    </>
                                ) : (
                                    <>
                                        <ShieldCheck className="mr-2 h-4 w-4" />
                                        Validar Chave
                                    </>
                                )}
                            </Button>
                        </DialogFooter>
                    </>
                ) : (
                    <div className="bg-white">
                        <div className="h-2 bg-emerald-500" />
                        <div className="p-8 text-center space-y-6">
                            <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-2 text-emerald-600 animate-in zoom-in duration-500">
                                <CheckCircle2 className="h-10 w-10" />
                            </div>

                            <div className="space-y-2">
                                <h2 className="text-2xl font-black text-slate-900">Parabéns!</h2>
                                <p className="text-slate-500">A sua nova licença foi validada com sucesso.</p>
                            </div>

                            <div className="grid grid-cols-2 gap-4 text-left">
                                <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                                    <div className="flex items-center gap-2 mb-2">
                                        <Building2 className="h-4 w-4 text-slate-400" />
                                        <span className="text-[10px] font-bold text-slate-400 uppercase">Plano Ativado</span>
                                    </div>
                                    <div className="text-sm font-bold text-slate-800 line-clamp-1">
                                        {getLicenseTypeName(validationResult.type, validationResult.tier, validationResult.maxDevices)}
                                    </div>
                                </div>
                                <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                                    <div className="flex items-center gap-2 mb-2">
                                        <Clock className="h-4 w-4 text-slate-400" />
                                        <span className="text-[10px] font-bold text-slate-400 uppercase">Válido Até</span>
                                    </div>
                                    <div className="text-sm font-bold text-slate-800">
                                        {format(validationResult.expirationDate, "dd 'de' MMM 'de' yyyy", { locale: pt })}
                                    </div>
                                </div>
                            </div>

                            {validationResult.tier === 'empresarial' ? (
                                <div className="space-y-4">
                                    <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 text-[11px] text-blue-800 text-center font-bold leading-relaxed">
                                        <div className="flex items-center justify-center gap-2 mb-2 text-blue-600">
                                            <Rocket className="h-4 w-4" />
                                            <span>UPGRADE EMPRESARIAL CONCLUÍDO</span>
                                        </div>
                                        As funcionalidades de Rede Local (Servidor/Cliente) foram desbloqueadas.
                                        Agora pode gerir a sua empresa em múltiplos terminais.
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <div className="flex items-center gap-2 text-[9px] font-bold text-slate-500 bg-slate-50 p-2 rounded-lg border border-slate-100">
                                            <Globe className="h-3 w-3 text-blue-500" />
                                            Sincronização Ativa
                                        </div>
                                        <div className="flex items-center gap-2 text-[9px] font-bold text-slate-500 bg-slate-50 p-2 rounded-lg border border-slate-100">
                                            <Users className="h-3 w-3 text-indigo-500" />
                                            Multi-Postos
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-100 text-xs text-emerald-800 text-center font-medium leading-relaxed">
                                    Todas as funcionalidades do sistema permanecem desbloqueadas.
                                    Obrigado por escolher o <span className="font-bold">Tango Gestão de Créditos</span>.
                                </div>
                            )}

                            <Button
                                onClick={handleActivate}
                                className="w-full bg-emerald-600 hover:bg-emerald-700 h-12 text-lg font-bold"
                            >
                                Concluir Ativação
                            </Button>
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
};
