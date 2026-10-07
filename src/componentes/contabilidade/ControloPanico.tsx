import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Lock, LockOpen, OctagonAlert } from 'lucide-react';
import { Button } from '@/componentes/ui/button';
import { Input } from '@/componentes/ui/input';
import { Textarea } from '@/componentes/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/componentes/ui/dialog';
import { useAuth } from '@/contextos/ContextoAutenticacao';
import { useData } from '@/contextos/ContextoDados';
import { useToast } from '@/componentes/ui/use-toast';
import { formatDateTime } from '@/bibliotecas/formatters';
import { ServicoContabilidadeGeral, type PanicLock } from '@/servicos/ServicoContabilidadeGeral';
import { AvisoErro } from './comum';
import { isAdminRole } from './formato';

/** Congelar / desbloquear a movimentação financeira (confirmação, motivo e palavra-passe). */
export function BotaoPanico({ panic, onChanged }: { panic: PanicLock | null; onChanged: () => Promise<void> }) {
    const { user } = useAuth();
    const { refreshData } = useData();
    const { toast } = useToast();
    const [open, setOpen] = useState(false);
    const [reason, setReason] = useState('');
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    if (!isAdminRole(user?.role)) return null;
    const unlocking = !!panic;
    const sameAdmin = unlocking && panic?.lockedById === user?.id;

    const submit = async () => {
        if (!user) return;
        setBusy(true); setError('');
        try {
            const actor = { id: user.id, name: user.name, role: user.role };
            if (unlocking) await ServicoContabilidadeGeral.unlockPanic(reason, password, actor);
            else await ServicoContabilidadeGeral.lockPanic(reason, password, actor);
            toast({
                title: unlocking ? 'Movimentação desbloqueada' : 'Movimentação financeira congelada',
                description: unlocking ? 'Pagamentos, desembolsos e lançamentos voltam a ser aceites.' : 'Nenhum pagamento, desembolso, estorno ou lançamento é aceite até outro administrador desbloquear.',
                variant: unlocking ? undefined : 'destructive',
            });
            setOpen(false); setReason(''); setPassword(''); setConfirm(false);
            window.dispatchEvent(new Event('tango-panic-changed'));
            await refreshData();
            await onChanged();
        } catch (failure: any) {
            setError(failure?.message || 'Não foi possível concluir.');
        } finally { setBusy(false); }
    };

    return (
        <>
            <Button variant={unlocking ? 'outline' : 'destructive'} size="sm" className="gap-2" onClick={() => { setError(''); setOpen(true); }}>
                {unlocking ? <LockOpen className="h-4 w-4" /> : <OctagonAlert className="h-4 w-4" />}{unlocking ? 'Desbloquear movimentação' : 'Pânico: congelar'}
            </Button>
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle className={unlocking ? '' : 'text-red-600'}>{unlocking ? 'Desbloquear a movimentação financeira' : 'Congelar toda a movimentação financeira'}</DialogTitle>
                        <DialogDescription>
                            {unlocking
                                ? `Congelada por ${panic?.lockedBy} em ${panic ? formatDateTime(panic.lockedAt) : ''}. Motivo: ${panic?.reason}. Só um administrador diferente pode desbloquear.`
                                : 'Use em caso de suspeita de fraude ou de adulteração. Ficam bloqueados pagamentos, desembolsos, estornos e lançamentos em todos os dispositivos, até outro administrador desbloquear. A consulta continua disponível.'}
                        </DialogDescription>
                    </DialogHeader>
                    <AvisoErro message={error} />
                    {sameAdmin ? <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">Foi o senhor(a) quem congelou a movimentação: o desbloqueio tem de ser feito por outro administrador.</p> : (
                        <div className="space-y-3">
                            <label className="block space-y-1"><span className="text-xs font-semibold text-muted-foreground">Motivo (mínimo 10 caracteres)</span>
                                <Textarea rows={3} value={reason} onChange={event => setReason(event.target.value)} placeholder={unlocking ? 'Ex.: divergência investigada e resolvida' : 'Ex.: diferença de caixa sem explicação e lançamento com hash inválido'} />
                            </label>
                            <label className="block space-y-1"><span className="text-xs font-semibold text-muted-foreground">Confirme a sua palavra-passe</span>
                                <Input type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} />
                            </label>
                            {!unlocking && <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={confirm} onChange={event => setConfirm(event.target.checked)} />Confirmo que quero congelar toda a movimentação financeira da empresa.</label>}
                        </div>
                    )}
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
                        {!sameAdmin && <Button variant={unlocking ? 'default' : 'destructive'} className="gap-2" disabled={busy || reason.trim().length < 10 || !password || (!unlocking && !confirm)} onClick={() => void submit()}>
                            {unlocking ? <LockOpen className="h-4 w-4" /> : <Lock className="h-4 w-4" />}{busy ? 'A confirmar…' : unlocking ? 'Desbloquear' : 'Congelar movimentação'}
                        </Button>}
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}

/** Faixa vermelha em todas as páginas enquanto a movimentação estiver congelada. */
export function BannerCongelamento() {
    const { user } = useAuth();
    const [panic, setPanic] = useState<PanicLock | null>(null);
    const check = useCallback(() => { void ServicoContabilidadeGeral.getPanicLock().then(setPanic).catch(() => undefined); }, []);
    useEffect(() => {
        if (!user) return;
        check();
        const timer = window.setInterval(check, 30_000);
        window.addEventListener('tango-panic-changed', check);
        window.addEventListener('focus', check);
        return () => { window.clearInterval(timer); window.removeEventListener('tango-panic-changed', check); window.removeEventListener('focus', check); };
    }, [user, check]);
    if (!panic) return null;
    return (
        <div role="alert" className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-red-600 px-4 py-2 text-center text-sm font-semibold text-white">
            <OctagonAlert className="h-4 w-4 shrink-0" />
            <span>Movimentação financeira CONGELADA por {panic.lockedBy} em {formatDateTime(panic.lockedAt)} — {panic.reason}</span>
            <Link to="/contabilidade" className="underline underline-offset-2">Só outro administrador pode desbloquear, em Contabilidade</Link>
        </div>
    );
}
