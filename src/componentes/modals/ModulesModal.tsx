import { useAuth } from '@/contextos/ContextoAutenticacao';
import { AVAILABLE_PERMISSIONS } from '@/tipos/autenticacao';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/componentes/ui/dialog';
import { Shield, CheckCircle2, Lock } from 'lucide-react';
import { cn } from '@/bibliotecas/utils';

/**
 * Módulos e Acessos do utilizador autenticado.
 * Aberto a partir do menu do perfil, no cabeçalho.
 */
export function ModulesModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
    const { user } = useAuth();

    if (!user) return null;

    return (
        <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
            <DialogContent className="w-[95vw] max-w-5xl max-h-[85vh] flex flex-col overflow-hidden p-0 border-none bg-slate-50 dark:bg-slate-900 shadow-2xl rounded-2xl">
                <DialogHeader className="p-8 pb-4 bg-slate-900 text-white rounded-t-2xl relative overflow-hidden shrink-0">
                    <div className="flex items-center gap-4 relative z-10">
                        <div className="bg-white/10 p-3 rounded-2xl backdrop-blur-sm">
                            <Shield className="h-8 w-8 text-white" />
                        </div>
                        <div>
                            <DialogTitle className="text-2xl font-bold text-white">Módulos e Acessos</DialogTitle>
                            <DialogDescription className="text-slate-300">
                                Funcionalidades e módulos com acesso permitido.
                            </DialogDescription>
                        </div>
                    </div>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto p-6">
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {AVAILABLE_PERMISSIONS.map((perm) => {
                            const hasAccess = user.role === 'super_admin' || user.permissions?.includes(perm.id);
                            return (
                                <div
                                    key={perm.id}
                                    className={cn(
                                        "p-3 rounded-lg border transition-all duration-200",
                                        hasAccess
                                            ? "bg-primary/5 border-primary/20 shadow-sm"
                                            : "bg-muted/10 border-border/50 opacity-40 grayscale"
                                    )}
                                >
                                    <div className="flex items-start justify-between mb-1">
                                        <span className={cn(
                                            "text-[10px] font-bold uppercase tracking-wider truncate pr-2",
                                            hasAccess ? "text-primary" : "text-muted-foreground"
                                        )}>
                                            {perm.label}
                                        </span>
                                        {hasAccess ? (
                                            <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0" />
                                        ) : (
                                            <Lock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                        )}
                                    </div>
                                    <p className="text-[11px] text-muted-foreground leading-snug">
                                        {perm.description}
                                    </p>
                                    {user.role === 'super_admin' && hasAccess && (
                                        <div className="mt-1.5 pt-1.5 border-t border-primary/10">
                                            <span className="text-[9px] font-bold text-primary/60 uppercase">Acesso Total (Super Admin)</span>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
