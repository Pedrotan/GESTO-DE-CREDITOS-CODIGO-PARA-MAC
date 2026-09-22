import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contextos/ContextoAutenticacao';
import { useData } from '@/contextos/ContextoDados';
import { AlertTriangle, Download, RefreshCw, ShieldAlert, Database } from 'lucide-react';
import { Button } from '@/componentes/ui/button';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from "@/componentes/ui/dialog";
import { useState } from 'react';

export function BackupReminder() {
    const { user } = useAuth();
    const { companySettings, addNotification, notifications, clients, credits, payments } = useData();
    const navigate = useNavigate();

    // Lógica de "Fluxo de Dados": Verificar se existem registros relevantes
    const hasDataFlow = clients.length > 0 || credits.length > 0 || payments.length > 0;

    useEffect(() => {
        if (!user || (user.role !== 'super_admin' && user.role !== 'admin')) return;

        const checkBackup = async () => {
            const lastBackup = companySettings.lastBackupDate;
            const installDate = companySettings.installDate;
            const now = new Date();
            let shouldWarn = false;

            // Data de referência: Último backup ou, se nunca feito, a data de instalação
            const referenceDateStr = lastBackup || installDate;
            if (!referenceDateStr) return;

            const referenceDate = new Date(referenceDateStr);
            if (isNaN(referenceDate.getTime())) return;

            const diffTime = Math.abs(now.getTime() - referenceDate.getTime());
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            if (diffDays >= 10) {
                if (!lastBackup) {
                    if (hasDataFlow) {
                        shouldWarn = true;
                    }
                } else {
                    shouldWarn = true;
                }
            }

            if (shouldWarn) {
                // Verificar se já existe uma notificação de backup não lida
                const alreadyNotified = (notifications || []).some(
                    n => n.title === 'Lembrete de Backup' && !n.read
                );

                if (!alreadyNotified) {
                    await addNotification({
                        id: crypto.randomUUID(),
                        title: 'Lembrete de Backup',
                        message: 'Já passaram 10 dias desde a última cópia de segurança manual. Por favor, realize um backup para garantir a segurança dos dados.',
                        type: 'warning',
                        timestamp: new Date(),
                        read: false
                    });
                }
            }
        };

        checkBackup();
    }, [user, companySettings.lastBackupDate, companySettings.installDate, notifications, hasDataFlow, addNotification]);

    const lastBackup = companySettings.lastBackupDate;
    const installDate = companySettings.installDate;
    const nowTime = new Date().getTime();

    const getSafeTime = (dateStr: string | undefined): number => {
        if (!dateStr) return 0;
        const time = new Date(dateStr).getTime();
        return isNaN(time) ? 0 : time;
    };

    const referenceTime = lastBackup ? getSafeTime(lastBackup) : getSafeTime(installDate);
    const msIn10Days = 10 * 24 * 60 * 60 * 1000;

    const [snoozeUntil, setSnoozeUntil] = useState<number>(() => {
        const stored = localStorage.getItem('backup_reminder_snooze_until');
        return stored ? parseInt(stored, 10) : 0;
    });

    // For the first backup (no lastBackup), we require 10 days since install AND data flow.
    // For subsequent backups, we just require 10 days since last backup.
    const isOverdue = referenceTime > 0 &&
        (nowTime - referenceTime >= msIn10Days) &&
        (lastBackup ? true : hasDataFlow);

    const isAdmin = user && (user.role === 'super_admin' || user.role === 'admin');

    const [isOpen, setIsOpen] = useState(false);

    // Initial check and periodic re-check
    useEffect(() => {
        const checkStatus = () => {
            const nowTime = Date.now();
            if (isOverdue && isAdmin && nowTime > snoozeUntil) {
                setIsOpen(true);
            }
        };

        checkStatus(); // Check immediately
        const interval = setInterval(checkStatus, 30000); // Check every 30 seconds

        return () => clearInterval(interval);
    }, [isOverdue, isAdmin, snoozeUntil]);

    // Handle snooze action
    const handleSnooze = () => {
        const newSnoozeTime = Date.now() + 5 * 60 * 1000; // 5 minutes
        setSnoozeUntil(newSnoozeTime);
        localStorage.setItem('backup_reminder_snooze_until', newSnoozeTime.toString());
        setIsOpen(false);
    };

    // Close if it's no longer overdue or if snooze is active (handled by checkStatus logic, but good for cleanup)
    useEffect(() => {
        if (!isOverdue && isOpen) {
            setIsOpen(false);
            localStorage.removeItem('backup_reminder_snooze_until');
            setSnoozeUntil(0);
        }
    }, [isOverdue, isOpen]);

    if (!isAdmin || (!isOverdue && snoozeUntil === 0)) return null;

    // Calculate days for display (rounding down to show full days passed)
    const diffDays = Math.floor((nowTime - referenceTime) / (1000 * 60 * 60 * 24));
    const daysText = lastBackup ? `${diffDays} dias` : `${diffDays} dias de uso`;

    const handleAction = () => {
        setIsOpen(false);
        navigate('/definicoes?tab=backup');
    };

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogContent className="sm:max-w-[500px] border-none shadow-2xl overflow-hidden p-0 bg-background [&>button]:text-white [&>button]:z-50 [&>button]:top-4 [&>button]:right-4">
                {/* Dark Header Section */}
                <div className="bg-[#0f172a] p-8 pb-10 relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-amber-400 via-amber-600 to-amber-400" />

                    <DialogHeader className="relative z-10">
                        <div className="flex items-center gap-5">
                            <div className="h-14 w-14 rounded-2xl bg-amber-500/20 flex items-center justify-center text-amber-500 shadow-inner">
                                <Database className="h-8 w-8" />
                            </div>
                            <div className="space-y-1 text-left">
                                <DialogTitle className="text-2xl font-black text-white tracking-tight uppercase">
                                    Segurança de Dados Requerida
                                </DialogTitle>
                                <DialogDescription className="text-amber-500/80 font-bold uppercase tracking-widest text-[10px]">
                                    Lembrete de cópia de segurança periódica
                                </DialogDescription>
                            </div>
                        </div>
                    </DialogHeader>

                    {/* Decorative elements */}
                    <div className="absolute -right-10 -bottom-10 opacity-10">
                        <ShieldAlert size={120} className="text-white" />
                    </div>
                </div>

                <div className="p-8 -mt-6 bg-background rounded-t-[32px] relative z-20">
                    <div className="space-y-6">
                        <div className="p-5 rounded-2xl bg-amber-50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/50 shadow-sm">
                            <div className="flex gap-4">
                                <div className="p-2 h-fit rounded-lg bg-amber-500/10 text-amber-600">
                                    <AlertTriangle className="h-5 w-5" />
                                </div>
                                <div className="text-sm text-slate-700 dark:text-slate-300 space-y-3 leading-relaxed">
                                    <p>
                                        Detetamos que já passaram <span className="font-extrabold text-amber-700 dark:text-amber-500 bg-amber-100 dark:bg-amber-900/40 px-1.5 py-0.5 rounded">{daysText}</span> desde o último backup realizado no sistema.
                                    </p>
                                    <p className="text-xs text-slate-500 dark:text-slate-400 font-medium italic">
                                        "A segurança dos seus registos financeiros é a nossa prioridade. Exporte agora um ficheiro de segurança para prevenir perda de dados."
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Softer Blue Info Box */}
                        <div className="flex items-center gap-3 p-4 rounded-xl border bg-sky-50/40 dark:bg-sky-950/10 border-sky-100/50 dark:border-sky-900/30">
                            <ShieldAlert className="h-4 w-4 text-sky-500 shrink-0" />
                            <p className="text-[11px] text-sky-700/80 dark:text-sky-400/80 font-bold uppercase tracking-tight">
                                Acção obrigatória para administradores a cada 10 dias.
                            </p>
                        </div>
                    </div>

                    <DialogFooter className="flex flex-col sm:flex-row gap-3 mt-10">
                        <Button
                            variant="ghost"
                            onClick={handleSnooze}
                            className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 font-bold text-xs uppercase"
                        >
                            Lembrar mais tarde
                        </Button>
                        <Button
                            onClick={handleAction}
                            className="bg-[#0f172a] hover:bg-slate-800 text-white gap-3 shadow-xl px-6 h-12 rounded-xl border border-white/10 transition-all active:scale-95 text-xs font-black uppercase tracking-widest"
                        >
                            <RefreshCw className="h-4 w-4" />
                            Realizar Backup Agora
                        </Button>
                    </DialogFooter>
                </div>
            </DialogContent>
        </Dialog>
    );
}

