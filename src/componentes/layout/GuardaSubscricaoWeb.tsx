import { useCallback, useEffect, useRef, useState } from 'react';
import { apagarChavesSincronizacao, apagarSegredo, guardarChavesSincronizacao, lerChavesSincronizacao, lerSegredo, SEGREDO_CHAVE_SINCRONIZACAO, SEGREDO_CODIGO_EMPRESA } from '@/bibliotecas/cofre-segredos';
import { getScopedLocalStorageItem } from '@/bibliotecas/contas';
import { AlertTriangle, CalendarClock, Loader2, RefreshCw, ShieldOff, X } from 'lucide-react';
import { Button } from '@/componentes/ui/button';
import { deriveWebSyncKeys, stopCloudSync } from '@/servicos/ServicoSincronizacaoCloud';
import { subscriptionState } from '@/bibliotecas/subscricao';
import { storeWebMultiTenant } from '@/servicos/ServicoIdentidadeEmpresa';
import Swal from 'sweetalert2';
import 'sweetalert2/dist/sweetalert2.min.css';
import { storeWebCompanyLicense } from '@/bibliotecas/licenca-nuvem-cliente';

// Confirma periodicamente, no Tango Master, se a empresa ligada a este navegador continua autorizada.
// Empresa eliminada ou código alterado: desliga o navegador. Bloqueada ou expirada: bloqueia o uso até
// renovar. Perto de expirar: mostra um aviso para renovar a subscrição.

const CHECK_INTERVAL_MS = 10 * 60 * 1000;
const DISMISS_KEY = 'tango_subscription_warning_dismissed';
// Ao focar a janela a verificação só se repete passado este tempo (limite de pedidos do servidor por IP).
const FOCUS_RECHECK_MS = 2 * 60 * 1000;
const TENANT_KEYS = ['tango_company_status', 'tango_active_tenant_authorized', 'tango_active_tenant_multi'];

type Blocked = { reason: 'blocked' | 'expired'; message: string };

const formatDate = (value: string) => new Date(value).toLocaleDateString('pt-AO', { day: '2-digit', month: 'long', year: 'numeric' });

export const GuardaSubscricaoWeb = () => {
    const [blocked, setBlocked] = useState<Blocked | null>(null);
    const [expiresAt, setExpiresAt] = useState<string | null>(null);
    const [isChecking, setIsChecking] = useState(false);
    const lastCheckRef = useRef(0);
    const [dismissedToday, setDismissedToday] = useState(() => localStorage.getItem(DISMISS_KEY) === new Date().toDateString());

    const revokeBrowser = useCallback(async (title: string, message: string) => {
        stopCloudSync();
        TENANT_KEYS.forEach(key => localStorage.removeItem(key));
        apagarSegredo(SEGREDO_CODIGO_EMPRESA);
        apagarSegredo(SEGREDO_CHAVE_SINCRONIZACAO);
        await apagarChavesSincronizacao();
        // Termina também a sessão HttpOnly no servidor (o cookie só o servidor o consegue apagar).
        await fetch('/api/verify-company', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ logout: true }) }).catch(() => undefined);
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
        // Ligação actual: confirma pela sessão HttpOnly, sem código. Navegadores ligados antes desta versão ainda
        // têm o código no cofre: enviam-no uma última vez para receber a sessão e esquecem-no (migração).
        const hasSession = Boolean(lerChavesSincronizacao(nif));
        const syncUrl = getScopedLocalStorageItem('sync_url') || window.location.origin;
        const sameOrigin = (() => { try { return new URL(syncUrl).origin === window.location.origin; } catch { return false; } })();
        const accessCode = hasSession ? null : lerSegredo(SEGREDO_CODIGO_EMPRESA);
        if (!nif || (!hasSession && !accessCode) || !navigator.onLine) return;
        lastCheckRef.current = Date.now();
        setIsChecking(true);
        try {
            const response = await fetch('/api/verify-company', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify(hasSession ? { nif, session: true } : { nif, accessCode }),
                signal: AbortSignal.timeout(15_000)
            });
            const data = await response.json().catch(() => ({}));
            if (response.ok && data.success) {
                setBlocked(null);
                // A empresa pode ter mudado o modo multi-empresa no executável: o layout acompanha.
                storeWebMultiTenant(data.multiTenant);
                // Migração: o servidor abriu a sessão HttpOnly; ficam só as chaves de cifra (não exportáveis).
                if (!hasSession && accessCode && sameOrigin) {
                    const serverCode = String(data.syncPasskey || lerSegredo(SEGREDO_CHAVE_SINCRONIZACAO) || accessCode);
                    await guardarChavesSincronizacao(await deriveWebSyncKeys(String(data.tenantId || nif), [serverCode, accessCode]));
                    apagarSegredo(SEGREDO_CODIGO_EMPRESA);
                    apagarSegredo(SEGREDO_CHAVE_SINCRONIZACAO);
                    window.dispatchEvent(new Event('tango_tenant_sync_key_changed'));
                }
                setExpiresAt(data.expiresAt || null);
                // Licença da empresa (a mesma do Desktop): mostrada nas Definições; a web não pede chave.
                storeWebCompanyLicense(data.license || null);
                return;
            }
            // Erros temporários do servidor não devem bloquear quem trabalha offline.
            if (data.code === 'NOT_REGISTERED') {
                await revokeBrowser('Acesso removido',
                    'O registo desta empresa foi eliminado pelo administrador do Tango Master. Este navegador deixou de ter acesso ao sistema. Contacte o administrador para mais informações.');
            } else if (data.code === 'SESSION_INVALID') {
                await revokeBrowser('Sessão terminada',
                    'Por segurança, a ligação deste navegador à empresa terminou (o Código de Acesso pode ter sido alterado). Introduza o Código de Acesso da empresa para continuar.');
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
        const onFocus = () => { if (Date.now() - lastCheckRef.current >= FOCUS_RECHECK_MS) void check(); };
        // A sincronização recusou o código: confirmar já (código alterado → volta ao pedido do código).
        const onSync = (event: Event) => { if ((event as CustomEvent<{ authFailed?: boolean }>).detail?.authFailed) void check(); };
        window.addEventListener('focus', onFocus);
        window.addEventListener('online', onFocus);
        window.addEventListener('tango-cloud-sync-status', onSync);
        return () => {
            clearInterval(timer);
            window.removeEventListener('focus', onFocus);
            window.removeEventListener('online', onFocus);
            window.removeEventListener('tango-cloud-sync-status', onSync);
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
