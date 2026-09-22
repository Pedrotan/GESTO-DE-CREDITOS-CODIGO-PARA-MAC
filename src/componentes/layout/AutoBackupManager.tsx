import { useEffect, useState, useRef } from 'react';
import { useAuth } from '@/contextos/ContextoAutenticacao';
import { useData } from '@/contextos/ContextoDados';
import { ServicoAutoBackup, AutoBackupConfig } from '@/servicos/ServicoAutoBackup';
import { Database, ShieldCheck, RefreshCw, Clock, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Button } from '@/componentes/ui/button';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from "@/componentes/ui/dialog";
import { useToast } from '@/ganchos/usar-toast';

export function AutoBackupManager() {
    const { user } = useAuth();
    const { addNotification } = useData();
    const { toast } = useToast();

    const [isPromptOpen, setIsPromptOpen] = useState(false);
    const [isExecuting, setIsExecuting] = useState(false);
    const isRunningRef = useRef(false);

    // Verificar e executar backup diário
    useEffect(() => {
        if (!user) return;

        const checkBackup = async () => {
            if (isRunningRef.current) return;
            const config: AutoBackupConfig = ServicoAutoBackup.getConfig();
            if (!config.enabled) return;

            const shouldTrigger = ServicoAutoBackup.shouldTriggerToday();
            if (!shouldTrigger) return;

            // Verificar se o utilizador adiou hoje
            const snoozeUntil = localStorage.getItem('auto_backup_snooze_until');
            if (snoozeUntil && Date.now() < parseInt(snoozeUntil, 10)) {
                return;
            }

            if (config.mode === 'interactive') {
                setIsPromptOpen(true);
            } else {
                // Modo silencioso: executa automaticamente
                isRunningRef.current = true;
                try {
                    const result = await ServicoAutoBackup.executeBackup('scheduled');
                    if (result.success) {
                        if (config.notifyOnSuccess) {
                            toast({
                                title: "Backup Automático Concluído",
                                description: "Cópia de segurança diária dos dados protegida com sucesso.",
                            });

                            await addNotification({
                                id: crypto.randomUUID(),
                                title: 'Backup Automático Concluído',
                                message: `A cópia de segurança diária foi executada automaticamente às ${new Date().toLocaleTimeString()}.`,
                                type: 'info',
                                timestamp: new Date(),
                                read: false
                            });
                        }
                    }
                } catch (e) {
                    console.error('[AutoBackupManager] Erro no backup automático silencioso:', e);
                } finally {
                    isRunningRef.current = false;
                }
            }
        };

        // Verifica imediatamente ao carregar
        checkBackup();

        // E verifica periodicamente a cada 1 minuto (para apanhar o horário marcado durante o dia)
        const interval = setInterval(checkBackup, 60000);
        return () => clearInterval(interval);
    }, [user, addNotification, toast]);

    const handleConfirmManual = async () => {
        setIsExecuting(true);
        isRunningRef.current = true;
        try {
            const result = await ServicoAutoBackup.executeBackup('scheduled');
            if (result.success) {
                toast({
                    title: "Backup Concluído!",
                    description: result.message,
                });
                await addNotification({
                    id: crypto.randomUUID(),
                    title: 'Backup Automático Concluído',
                    message: `Cópia diária realizada com sucesso às ${new Date().toLocaleTimeString()}.`,
                    type: 'success',
                    timestamp: new Date(),
                    read: false
                });
                setIsPromptOpen(false);
            } else {
                toast({
                    title: "Aviso no Backup",
                    description: result.message,
                    variant: "destructive"
                });
            }
        } catch (error: any) {
            toast({
                title: "Falha ao Executar Backup",
                description: error?.message || "Ocorreu um erro ao gerar a cópia de segurança.",
                variant: "destructive"
            });
        } finally {
            setIsExecuting(false);
            isRunningRef.current = false;
        }
    };

    const handleSnooze = () => {
        // Adia por 30 minutos
        const nextTime = Date.now() + 30 * 60 * 1000;
        localStorage.setItem('auto_backup_snooze_until', nextTime.toString());
        setIsPromptOpen(false);
    };

    return (
        <Dialog open={isPromptOpen} onOpenChange={setIsPromptOpen}>
            <DialogContent className="sm:max-w-[480px] p-0 overflow-hidden border-none shadow-2xl rounded-2xl bg-background">
                {/* Header estilizado com gradiente */}
                <div className="bg-gradient-to-r from-emerald-600 to-teal-700 p-6 text-white relative">
                    <div className="flex items-center gap-4">
                        <div className="h-12 w-12 rounded-xl bg-white/20 backdrop-blur-md flex items-center justify-center shrink-0">
                            <Database className="h-6 w-6 text-white" />
                        </div>
                        <div>
                            <DialogTitle className="text-xl font-bold text-white tracking-tight">
                                Backup Automático Diário
                            </DialogTitle>
                            <DialogDescription className="text-emerald-100 text-xs mt-0.5">
                                Cópia de segurança programada do sistema
                            </DialogDescription>
                        </div>
                    </div>
                </div>

                <div className="p-6 space-y-4">
                    <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/50 flex gap-3 text-emerald-900 dark:text-emerald-300">
                        <ShieldCheck className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
                        <div className="text-xs space-y-1">
                            <p className="font-semibold text-sm">Hora da cópia de segurança diária</p>
                            <p className="text-muted-foreground dark:text-emerald-400">
                                O sistema está pronto para realizar o backup automático de hoje, assegurando a integridade de todos os clientes, créditos e transações financeiras.
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Clock className="h-3.5 w-3.5 text-primary" />
                        <span>Data de hoje: <strong>{new Date().toLocaleDateString('pt-PT', { day: '2-digit', month: 'long', year: 'numeric' })}</strong></span>
                    </div>

                    <DialogFooter className="gap-2 sm:gap-0 mt-4">
                        <Button
                            variant="outline"
                            onClick={handleSnooze}
                            disabled={isExecuting}
                            className="text-xs"
                        >
                            Lembrar em 30 min
                        </Button>
                        <Button
                            onClick={handleConfirmManual}
                            disabled={isExecuting}
                            className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs"
                        >
                            {isExecuting ? (
                                <>
                                    <RefreshCw className="h-4 w-4 animate-spin" />
                                    A criar cópia de segurança...
                                </>
                            ) : (
                                <>
                                    <CheckCircle2 className="h-4 w-4" />
                                    Fazer Backup Agora
                                </>
                            )}
                        </Button>
                    </DialogFooter>
                </div>
            </DialogContent>
        </Dialog>
    );
}
