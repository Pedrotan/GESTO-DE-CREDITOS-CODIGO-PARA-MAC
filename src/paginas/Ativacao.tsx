import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '@/contextos/ContextoDados';
import { Button } from '@/componentes/ui/button';
import { Input } from '@/componentes/ui/input';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/componentes/ui/card';
import { validateLicense, getLicenseTypeName, getMachineId, resolveLicenseKey, setGlobalLicenseKey } from '@/bibliotecas/licenciamento';
import { ShieldCheck, Key, Lock, Phone, Copy, Check } from 'lucide-react';
import { toast } from '@/ganchos/usar-toast';
import { differenceInDays, parseISO, isValid } from 'date-fns';

export default function Ativacao() {
    const { companySettings, updateCompanySettings } = useData();
    const navigate = useNavigate();
    const [key, setKey] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [status, setStatus] = useState<'initial' | 'valid' | 'invalid'>('initial');
    const [licenseInfo, setLicenseInfo] = useState<any>(null);
    const [machineId, setMachineId] = useState<string>('Carregando ID...');
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        getMachineId().then(id => setMachineId(id));
    }, []);

    const handleCopyId = () => {
        navigator.clipboard.writeText(machineId);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        toast({
            title: "ID Copiado",
            description: "O ID da máquina foi copiado para a área de transferência."
        });
    };

    useEffect(() => {
        const checkCurrent = async () => {
            const isPackaged = (window as any).electronAPI?.isPackaged;
            const IS_DEV = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || !isPackaged;

            // Bypass in Dev
            if (IS_DEV) {
                navigate('/', { replace: true });
                return;
            }

            // Check if already valid
            const currentLicenseKey = resolveLicenseKey(companySettings?.licenseKey);
            if (currentLicenseKey) {
                const info = await validateLicense(currentLicenseKey);
                if (info.isValid) {
                    navigate('/', { replace: true });
                    return;
                }
            }

            // Check if in 3-day trial period
            if (companySettings?.installDate) {
                try {
                    const installDate = parseISO(companySettings.installDate);
                    if (isValid(installDate)) {
                        const daysSinceInstall = differenceInDays(new Date(), installDate);
                        if (daysSinceInstall < 3) {
                            navigate('/', { replace: true });
                        }
                    } else {
                        console.warn("[Ativacao] Data de instalação inválida.");
                    }
                } catch (e) {
                    console.error("Erro ao validar trial em Ativacao:", e);
                }
            }
        };
        checkCurrent();
    }, [companySettings, navigate]);

    const handleActivate = async () => {
        if (!key.trim()) return;

        setIsLoading(true);
        try {
            const validation = await validateLicense(key.trim());

            if (validation.isValid) {
                setStatus('valid');
                setLicenseInfo(validation);
                setGlobalLicenseKey(key.trim());

                await updateCompanySettings({
                    ...companySettings,
                    licenseKey: key.trim()
                });

                toast({
                    title: "Licença Ativada!",
                    description: `O software foi ativado com sucesso para uso ${getLicenseTypeName(validation.type)}.`,
                    duration: 5000,
                });

                setTimeout(() => {
                    navigate('/');
                }, 1500);
            } else {
                setStatus('invalid');
                setLicenseInfo(validation);
                toast({
                    title: "Chave Inválida",
                    description: validation.message,
                    variant: "destructive"
                });
            }
        } catch (error) {
            console.error(error);
            toast({
                title: "Erro",
                description: "Falha ao processar a ativação.",
                variant: "destructive"
            });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-100 dark:bg-slate-900 flex items-center justify-center p-4">
            <Card className="w-full max-w-md shadow-2xl border-none">
                <CardHeader className="text-center space-y-4 pb-2">
                    <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-2">
                        <Lock className="h-10 w-10 text-primary" />
                    </div>
                    <CardTitle className="text-xl font-black text-slate-900 uppercase tracking-tighter">Tango Gestão de Créditos</CardTitle>
                    <CardTitle className="text-2xl font-bold">Ativação do Sistema</CardTitle>
                    <CardDescription className="text-base">
                        Este software requer uma licença válida para ser utilizado.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6 pt-4">
                    {status === 'invalid' && (
                        <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm flex items-center gap-2 border border-red-100">
                            <ShieldCheck className="h-4 w-4" />
                            {licenseInfo?.message || 'A chave inserida não é válida.'}
                        </div>
                    )}

                    {status === 'valid' && (
                        <div className="bg-green-50 text-green-600 p-3 rounded-lg text-sm flex items-center gap-2 border border-green-100">
                            <ShieldCheck className="h-4 w-4" />
                            Ativação concluída! Redirecionando...
                        </div>
                    )}

                    <div className="space-y-2">
                        <label className="text-sm font-medium">Chave de Licença</label>
                        <div className="relative">
                            <Key className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Insira a chave de ativação..."
                                className="pl-9 font-mono uppercase tracking-wider h-11"
                                value={key}
                                onChange={(e) => setKey(e.target.value)}
                            />
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                            A chave é composta por caracteres alfanuméricos fornecidos pelo administrador.
                        </p>
                    </div>

                    <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-tight">ID desta Máquina (Forneça ao Suporte)</label>
                        <div className="flex items-center gap-2">
                            <div className="flex-1 bg-slate-50 border border-slate-200 rounded-lg p-2 font-mono text-xs font-bold text-slate-600 truncate">
                                {machineId}
                            </div>
                            <Button
                                variant="outline"
                                size="icon"
                                className="h-9 w-9 shrink-0"
                                onClick={handleCopyId}
                                title="Copiar ID"
                            >
                                {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                            </Button>
                        </div>
                    </div>

                    <div className="rounded-lg bg-blue-50 dark:bg-blue-900/20 p-4 space-y-2">
                        <h4 className="text-sm font-semibold text-blue-700 dark:text-blue-300 flex items-center gap-2">
                            <Phone className="h-4 w-4" />
                            Precisa de renovar?
                        </h4>
                        <p className="text-xs text-blue-600/80 dark:text-blue-200/80">
                            Entre em contacto com o suporte técnico para adquirir uma nova chave ou renovar a sua subscrição mensal, trimestral ou anual.
                        </p>
                        <p className="text-xs font-bold text-blue-700 dark:text-blue-300 pt-1">
                            WhatsApp: +244 942537486
                        </p>
                    </div>
                </CardContent>
                <CardFooter>
                    <Button
                        className="w-full h-11 text-base font-bold shadow-lg"
                        onClick={handleActivate}
                        disabled={isLoading || !key}
                    >
                        {isLoading ? 'Verificando...' : 'Ativar Licença'}
                    </Button>
                </CardFooter>
            </Card>
        </div>
    );
}
