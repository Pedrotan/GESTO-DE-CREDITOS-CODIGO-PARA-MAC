import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CalendarClock, Loader2, RefreshCw, ShieldOff, X } from 'lucide-react';
import { Button } from '@/componentes/ui/button';
import { stopCloudSync } from '@/servicos/ServicoSincronizacaoCloud';
import { subscriptionState } from '@/bibliotecas/subscricao';
import Swal from 'sweetalert2';
import 'sweetalert2/dist/sweetalert2.min.css';

// Confirma periodicamente, no Tango Master, se a empresa ligada a este navegador continua autorizada.
// Empresa eliminada ou código alterado: desliga o navegador. Bloqueada ou expirada: bloqueia o uso até
// renovar. Perto de expirar: mostra um aviso para renovar a subscrição.

const CHECK_INTERVAL_MS = 10 * 60 * 1000;
const DISMISS_KEY = 'tango_subscription_warning_dismissed';
const TENANT_KEYS = ['tango_active_tenant_authorized', 'tango_active_tenant_code'];

type Blocked = { reason: 'blocked' | 'expired'; message: string };

const formatDate = (value: string) => new Date(value).toLocaleDateString('pt-AO', { day: '2-digit', month: 'long', year: 'numeric' });

export const GuardaSubscricaoWeb = () => {
    const [blocked, setBlocked] = useState<Blocked | null>(null);
    const [expiresAt, setExpiresAt] = useState<string | null>(null);
    const [isChecking, setIsChecking] = useState(false);
    const [dismissedToday, setDismissedToday] = useState(() => localStorage.getItem(DISMISS_KEY) === new Date().toDateString());

    const revokeBrowser = useCallback(async (title: string, message: string) => {
        stopCloudSync();
        TENANT_KEYS.forEach(key => localStorage.removeItem(key));
        await Swal.fire({
            title,
            text: message,
            icon: 'warning',
            confirmButtonText: 'Compreendi',
            confirmButtonColor: '#F37021',
            allowOutsideClick: false
        });
        window.location.hash = '#/';
        window.location.reload();
    }, []);

    const check = useCallback(async () => {
        const nif = localStorage.getItem('tango_active_tenant_id');
        const accessCode = localStorage.getItem('tango_active_tenant_code');
        if (!nif || !accessCode || !navigator.onLine) return;
        setIsChecking(true);
        try {
            const response = await fetch('/api/verify-company', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ nif, accessCode }),
                signal: AbortSignal.timeout(15_000)
            });
            const data = await response.json().catch(() => ({}));
            if (response.ok && data.success) {
                setBlocked(null);
                setExpiresAt(data.expiresAt || null);
                return;
            }
            // Erros temporários do servidor não devem bloquear quem trabalha offline.
            if (data.code === 'NOT_REGISTERED') {
                await revokeBrowser('Acesso removido',
                    'O registo desta empresa foi eliminado pelo administrador do Tango Master. Este navegador deixou de ter acesso ao sistema. Contacte o administrador para mais informações.');
            } else if (data.code === 'WRONG_CODE') {
                await revokeBrowser('Código de Acesso alterado',
                    'O Código de Acesso da empresa foi alterado pelo administrador. Inicie sessão novamente com o novo código.');
            } else if (data.code === 'BLOCKED') {
                setBlocked({ reason: 'blocked', message: data.message || 'O acesso desta empresa está suspenso.' });
            } else if (data.code === 'EXPIRED') {
                setBlocked({ reason: 'expired', message: data.message || 'A subscrição desta empresa expirou.' });
            }
        } catch (error) {
            console.warn('[GuardaSubscricaoWeb] Verificação da subscrição indisponível:', error);
        } finally {
            setIsChecking(false);
        }
    }, [revokeBrowser]);

    useEffect(() => {
        void check();
        const timer = setInterval(() => void check(), CHECK_INTERVAL_MS);
        const onFocus = () => void check();
        window.addEventListener('focus', onFocus);
        window.addEventListener('online', onFocus);
        return () => {
            clearInterval(timer);
            window.removeEventListener('focus', onFocus);
            window.removeEventListener('online', onFocus);
        };
    }, [check]);

    if (blocked) {
        return (
            <div role="alertdialog" aria-modal="true" aria-labelledby="subscription-blocked-title"
                className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-950/90 p-4 backdrop-blur-sm">
                <div className="w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl dark:bg-slate-900">
                    <div className="border-b-4 border-red-500 bg-[#2B2D2F] p-6 text-center text-white">
                        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-red-500">
                            {blocked.reason === 'expired' ? <CalendarClock className="h-6 w-6" /> : <ShieldOff className="h-6 w-6" />}
                        </div>
                        <h2 id="subscription-blocked-title" className="text-xl font-black">
                            {blocked.reason === 'expired' ? 'Subscrição expirada' : 'Acesso suspenso'}
                        </h2>
                    </div>
                    <div className="space-y-5 p-6 text-center">
                        <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">{blocked.message}</p>
                        <p className="text-xs text-slate-500">
                            Os seus dados continuam guardados. Depois de renovar com o administrador, clique em verificar para voltar a entrar.
                        </p>
                        <Button onClick={() => void check()} disabled={isChecking} className="h-11 w-full gap-2 rounded-xl bg-[#F37021] font-bold text-white hover:bg-orange-600">
                            {isChecking ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Verificar novamente
                        </Button>
                    </div>
                </div>
            </div>
        );
    }

    const state = subscriptionState(expiresAt);
    if (state.kind !== 'expiring' || dismissedToday || !expiresAt) return null;

    return (
        <div role="status" className="fixed inset-x-0 top-0 z-[10001] flex items-center justify-center gap-3 bg-amber-500 px-4 py-2 text-xs font-bold text-amber-950 shadow-md sm:text-sm">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>
                A subscrição da sua empresa expira {state.daysLeft === 1 ? 'amanhã' : `em ${state.daysLeft} dias`} ({formatDate(expiresAt)}).
                Contacte o administrador do Tango Master para renovar.
            </span>
            <button type="button" aria-label="Fechar aviso até amanhã"
                onClick={() => { localStorage.setItem(DISMISS_KEY, new Date().toDateString()); setDismissedToday(true); }}
                className="rounded-md p-1 hover:bg-amber-600/30">
                <X className="h-4 w-4" />
            </button>
        </div>
    );
};
