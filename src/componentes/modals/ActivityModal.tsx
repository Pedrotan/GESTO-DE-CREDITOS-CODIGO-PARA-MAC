import { useState } from 'react';
import { useAuth } from '@/contextos/ContextoAutenticacao';
import { useData } from '@/contextos/ContextoDados';
import { Button } from '@/componentes/ui/button';
import { Badge } from '@/componentes/ui/badge';
import { AlertModal } from '@/componentes/ui/AlertModal';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/componentes/ui/dialog';
import { History, Activity, Clock } from 'lucide-react';
import { formatDateTimeFull } from '@/bibliotecas/formatters';
import { cn } from '@/bibliotecas/utils';

const actionTranslations: Record<string, string> = {
    'create': 'CRIAÇÃO',
    'update': 'ATUALIZAÇÃO',
    'delete': 'ELIMINAÇÃO',
    'login': 'LOGIN',
    'logout': 'LOGOUT',
    'approve': 'APROVAÇÃO',
    'reject': 'REJEIÇÃO',
    'payment': 'PAGAMENTO',
    'system': 'SISTEMA',
    'accounting': 'CONTABILIDADE',
    'freeze': 'BLOQUEIO'
};

const entityTranslations: Record<string, string> = {
    'client': 'CLIENTE',
    'credit': 'CRÉDITO',
    'payment': 'PAGAMENTO',
    'user': 'UTILIZADOR',
    'system': 'SISTEMA',
    'auth': 'AUTENTICAÇÃO',
    'setting': 'CONFIGURAÇÃO',
    'accounting': 'CONTABILIDADE',
    'contract': 'CONTRATO'
};

/**
 * Atividade recente do utilizador autenticado (últimas 24 horas).
 * Aberto a partir do menu do perfil, no cabeçalho.
 */
export function ActivityModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
    const { user } = useAuth();
    const { logs } = useData();
    const [isHistoryWarningOpen, setIsHistoryWarningOpen] = useState(false);
    const [isFullHistoryOpen, setIsFullHistoryOpen] = useState(false);

    if (!user) return null;

    // Somente atividades das últimas 24 horas
    const recentLogs24h = logs
        .filter(l => l.userId === user.id)
        .filter(log => {
            const hoursDiff = (Date.now() - new Date(log.timestamp).getTime()) / (1000 * 60 * 60);
            return hoursDiff <= 24;
        })
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return (
        <>
            <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
                <DialogContent className="w-[95vw] max-w-2xl max-h-[85vh] flex flex-col overflow-hidden p-0 border-none bg-slate-50 dark:bg-slate-900 shadow-2xl rounded-2xl">
                    <DialogHeader className="p-8 pb-4 bg-slate-900 text-white rounded-t-2xl relative overflow-hidden shrink-0">
                        <div className="flex items-center gap-4 relative z-10">
                            <div className="bg-white/10 p-3 rounded-2xl backdrop-blur-sm">
                                <History className="h-8 w-8 text-white" />
                            </div>
                            <div>
                                <DialogTitle className="text-2xl font-bold text-white">Atividade Recente</DialogTitle>
                                <DialogDescription className="text-slate-300">
                                    Registos das últimas 24 horas.
                                </DialogDescription>
                            </div>
                        </div>
                    </DialogHeader>

                    <div className="flex-1 overflow-y-auto bg-card">
                        <div className="divide-y divide-border/50">
                            {recentLogs24h.slice(0, 5).length > 0 ? (
                                recentLogs24h.slice(0, 5).map((log) => (
                                    <div key={log.id} className="p-4 hover:bg-muted/30 transition-colors">
                                        <div className="flex gap-3">
                                            <div className={cn(
                                                "mt-0.5 p-1.5 rounded-full",
                                                log.action === 'create' ? "bg-green-100 text-green-700" :
                                                    log.action === 'update' ? "bg-blue-100 text-blue-700" :
                                                        log.action === 'delete' ? "bg-red-100 text-red-700" :
                                                            "bg-slate-100 text-slate-700"
                                            )}>
                                                <Activity className="h-3 w-3" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-xs font-semibold text-foreground leading-tight">{log.details}</p>
                                                <div className="flex items-center gap-2 mt-1">
                                                    <span className="text-[10px] text-muted-foreground">{formatDateTimeFull(log.timestamp)}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className="p-8 text-center">
                                    <Activity className="h-8 w-8 text-muted/30 mx-auto mb-2" />
                                    <p className="text-xs text-muted-foreground italic">Sem atividades recentes.</p>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="shrink-0 border-t border-border/50 bg-muted/10 p-3 flex justify-center">
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="text-[10px] font-bold uppercase tracking-widest h-auto py-1 text-primary hover:text-primary hover:bg-primary/5 transition-colors"
                            onClick={() => setIsHistoryWarningOpen(true)}
                        >
                            Ver Histórico Completo
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Aviso antes de abrir o histórico completo */}
            <AlertModal
                isOpen={isHistoryWarningOpen}
                onClose={() => setIsHistoryWarningOpen(false)}
                title="Aviso de Privacidade"
                description="O histórico exibido aqui é superficial e guarda apenas os registos das últimas 24 horas. Para um relatório completo e auditoria detalhada, por favor solicite ao Administrador do Sistema."
                type="warning"
                onConfirm={() => {
                    setIsHistoryWarningOpen(false);
                    setIsFullHistoryOpen(true);
                }}
            />

            {/* Histórico completo das 24h */}
            <Dialog open={isFullHistoryOpen} onOpenChange={setIsFullHistoryOpen}>
                <DialogContent className="w-[95vw] max-w-2xl max-h-[80vh] flex flex-col overflow-hidden p-0">
                    <DialogHeader className="px-6 pt-6 pb-6 space-y-2.5">
                        <DialogTitle className="flex items-center gap-2.5">
                            <History className="h-6 w-6" />
                            Atividade nas Últimas 24h
                        </DialogTitle>
                        <DialogDescription>
                            Lista de todas as acções realizadas por si no sistema desde ontem.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="flex-1 overflow-y-auto px-6 py-4">
                        <div className="space-y-4">
                            {recentLogs24h.length > 0 ? (
                                recentLogs24h.map((log) => (
                                    <div key={log.id} className="flex items-start gap-4 p-4 rounded-xl bg-muted/30 border border-border/50 hover:border-primary/20 transition-all">
                                        <div className={cn(
                                            "mt-1 p-2 rounded-lg",
                                            log.action === 'create' ? "bg-green-100 text-green-700" :
                                                log.action === 'update' ? "bg-blue-100 text-blue-700" :
                                                    log.action === 'delete' ? "bg-red-100 text-red-700" :
                                                        "bg-slate-100 text-slate-700"
                                        )}>
                                            <Activity className="h-4 w-4" />
                                        </div>
                                        <div className="flex-1">
                                            <div className="flex justify-between items-start mb-1">
                                                <p className="font-bold text-foreground">{log.details}</p>
                                                <Badge variant="outline" className="text-[10px] uppercase font-bold tracking-wider">
                                                    {entityTranslations[log.entity?.toLowerCase()] || log.entity}
                                                </Badge>
                                            </div>
                                            <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium">
                                                <Clock className="h-3.5 w-3.5" />
                                                <span>{formatDateTimeFull(log.timestamp)}</span>
                                                <span className="h-1 w-1 rounded-full bg-border" />
                                                <span className="text-primary font-bold">{actionTranslations[log.action?.toLowerCase()] || log.action}</span>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className="py-12 text-center">
                                    <History className="h-12 w-12 text-muted/20 mx-auto mb-4" />
                                    <p className="text-muted-foreground font-medium italic">
                                        Nenhuma atividade registada nas últimas 24 horas.
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="shrink-0 p-4 border-t border-border/50 flex justify-end">
                        <Button variant="default" onClick={() => setIsFullHistoryOpen(false)}>
                            Concluir Visualização
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}
