import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarCheck, Clock, Lock } from 'lucide-react';
import { Button } from '@/componentes/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/componentes/ui/dialog';
import { useAuth } from '@/contextos/ContextoAutenticacao';
import { useData } from '@/contextos/ContextoDados';
import { getScopedLocalStorageItem, setScopedLocalStorageItem } from '@/bibliotecas/contas';
import { closeMonthPath, monthClosureState, monthIdOf, monthLabel } from '@/bibliotecas/fecho-mes';

// Fecho do mês obrigatório: no último dia do mês lembra o fecho; depois de o mês acabar, enquanto não for
// fechado, o aviso volta a cada hora e fica uma faixa fixa no topo. Só administradores podem fechar.

const ENFORCED_SINCE_KEY = 'month_close_enforced_since';
const POSTPONE_KEY = 'tango_month_close_postponed_until';
const CHECK_INTERVAL_MS = 5 * 60 * 1000;

const canCloseMonth = (role?: string) => role === 'super_admin' || role === 'admin';

// A regra aplica-se a partir do mês em que esta versão foi aberta pela primeira vez nesta empresa.
const enforcedSince = () => {
    let value = getScopedLocalStorageItem(ENFORCED_SINCE_KEY);
    if (!value) {
        value = monthIdOf(new Date());
        setScopedLocalStorageItem(ENFORCED_SINCE_KEY, value);
    }
    return value;
};

export function LembreteFechoMes() {
    const { user } = useAuth();
    const { closedMonths } = useData();
    const navigate = useNavigate();
    const [now, setNow] = useState(() => new Date());
    const [postponedUntil, setPostponedUntil] = useState(() => Number(localStorage.getItem(POSTPONE_KEY) || 0));

    useEffect(() => {
        const timer = setInterval(() => setNow(new Date()), CHECK_INTERVAL_MS);
        return () => clearInterval(timer);
    }, []);

    const state = useMemo(
        () => monthClosureState(now, (closedMonths || []).map(month => month.id), enforcedSince()),
        [now, closedMonths]
    );

    if (!user || state.kind === 'none') return null;

    const isAdmin = canCloseMonth(user.role);
    const label = monthLabel(state.monthId);
    const showDialog = now.getTime() >= postponedUntil;
    const postpone = (hours: number) => {
        const until = Date.now() + hours * 60 * 60 * 1000;
        localStorage.setItem(POSTPONE_KEY, String(until));
        setPostponedUntil(until);
    };
    const goClose = () => {
        postpone(0.25);
        navigate(closeMonthPath(state.monthId));
    };

    return (
        <>
            {state.kind === 'overdue' && (
                <div role="alert" className="flex shrink-0 flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-red-600 px-4 py-2 text-center text-xs font-bold text-white sm:text-sm">
                    <Lock className="h-4 w-4 shrink-0" />
                    <span>
                        Fecho do mês pendente: {label}
                        {state.pendingMonthIds.length > 1 && ` (+${state.pendingMonthIds.length - 1})`}.
                        {isAdmin ? ' Novos créditos ficam bloqueados até fazer o fecho.' : ' Peça ao administrador para fazer o fecho.'}
                    </span>
                    {isAdmin && (
                        <button type="button" onClick={goClose} className="rounded-md bg-white/20 px-2.5 py-1 text-xs font-bold hover:bg-white/30">
                            Fazer o fecho
                        </button>
                    )}
                </div>
            )}

            <Dialog open={showDialog} onOpenChange={open => { if (!open) postpone(state.kind === 'overdue' ? 1 : 2); }}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <CalendarCheck className="h-5 w-5 text-secondary" />
                            {state.kind === 'overdue' ? 'Fecho do mês obrigatório' : 'Hoje é o último dia do mês'}
                        </DialogTitle>
                        <DialogDescription>
                            {state.kind === 'overdue'
                                ? <>O mês de <strong>{label}</strong> terminou e ainda não foi fechado. O fecho consolida os números do mês e é obrigatório antes de registar novos créditos.</>
                                : <>Faça o fecho de <strong>{label}</strong> antes de terminar o dia, depois de registar os últimos pagamentos do mês.</>}
                        </DialogDescription>
                    </DialogHeader>
                    {state.kind === 'overdue' && state.pendingMonthIds.length > 1 && (
                        <p className="text-sm text-muted-foreground">
                            Meses por fechar: {state.pendingMonthIds.map(monthLabel).join(', ')}.
                        </p>
                    )}
                    {!isAdmin && (
                        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                            Só um administrador pode fazer o fecho. Avise-o para o fazer.
                        </p>
                    )}
                    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                        <Button variant="outline" onClick={() => postpone(isAdmin ? (state.kind === 'overdue' ? 1 : 2) : 4)} className="gap-2">
                            <Clock className="h-4 w-4" />
                            {isAdmin ? (state.kind === 'overdue' ? 'Lembrar dentro de 1 hora' : 'Lembrar mais tarde') : 'Compreendi'}
                        </Button>
                        {isAdmin && (
                            <Button onClick={goClose} className="gap-2 bg-primary font-bold text-primary-foreground hover:bg-primary/90">
                                <Lock className="h-4 w-4" /> Fazer o fecho agora
                            </Button>
                        )}
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}
