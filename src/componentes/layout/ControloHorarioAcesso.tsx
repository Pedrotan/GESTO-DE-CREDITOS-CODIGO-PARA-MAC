import { useEffect, useMemo, useRef, useState } from 'react';
import { Clock, LogOut } from 'lucide-react';
import { Button } from '@/componentes/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/componentes/ui/dialog';
import { useAuth } from '@/contextos/ContextoAutenticacao';
import { useData } from '@/contextos/ContextoDados';
import { describeDenial, evaluateAccess, formatAccessMoment, nextOpening } from '@/bibliotecas/horario-acesso';
import { ACCESS_DENIED_MESSAGE_KEY } from '@/servicos/ServicoHorarioAcesso';

// Aplica o horário de acesso durante a sessão: avisa antes da hora de fim, mostra a contagem decrescente
// e termina a sessão à hora exacta, indicando quando o utilizador pode voltar. Vale no computador e na web.

const TICK_MS = 15_000;
const hhmm = (date: Date) => `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

export function ControloHorarioAcesso() {
    const { user, logout } = useAuth();
    const { accessSchedule } = useData();
    const [now, setNow] = useState(() => new Date());
    const [warningOpen, setWarningOpen] = useState(false);
    const warnedFor = useRef<string | null>(null);
    const lastMinuteWarnedFor = useRef<string | null>(null);
    const endingRef = useRef(false);

    useEffect(() => {
        const timer = setInterval(() => setNow(new Date()), TICK_MS);
        // Separadores em segundo plano têm temporizadores abrandados: ao voltar, reavalia de imediato.
        const refresh = () => { if (document.visibilityState === 'visible') setNow(new Date()); };
        document.addEventListener('visibilitychange', refresh);
        window.addEventListener('focus', refresh);
        return () => {
            clearInterval(timer);
            document.removeEventListener('visibilitychange', refresh);
            window.removeEventListener('focus', refresh);
        };
    }, []);

    const decision = useMemo(
        () => (user ? evaluateAccess(accessSchedule, { id: user.id, role: user.role }, now) : null),
        [accessSchedule, user, now]
    );
    const endsAt = decision?.allowed ? decision.endsAt : null;
    const returnAt = useMemo(() => (endsAt ? nextOpening(accessSchedule, endsAt) : null), [accessSchedule, endsAt]);
    const remainingMs = endsAt ? endsAt.getTime() - now.getTime() : null;
    const warnMs = accessSchedule.warnMinutes * 60_000;
    const inWarning = remainingMs !== null && remainingMs <= warnMs;

    // Acorda exactamente à hora de fim (o intervalo de 15 s não basta para terminar no minuto certo).
    useEffect(() => {
        if (!endsAt) return;
        const delay = endsAt.getTime() - Date.now();
        if (delay <= 0 || delay > 24 * 60 * 60 * 1000) return;
        const timer = setTimeout(() => setNow(new Date()), delay + 250);
        return () => clearTimeout(timer);
    }, [endsAt]);

    // Contagem ao segundo durante o último minuto.
    useEffect(() => {
        if (remainingMs === null || remainingMs > 60_000) return;
        const timer = setInterval(() => setNow(new Date()), 1_000);
        return () => clearInterval(timer);
    }, [remainingMs !== null && remainingMs <= 60_000]); // eslint-disable-line react-hooks/exhaustive-deps

    // Avisos: um ao entrar na janela de aviso e outro no último minuto.
    useEffect(() => {
        if (!endsAt || !inWarning) return;
        const key = endsAt.toISOString();
        if (warnedFor.current !== key) {
            warnedFor.current = key;
            setWarningOpen(true);
        } else if (remainingMs !== null && remainingMs <= 60_000 && lastMinuteWarnedFor.current !== key) {
            lastMinuteWarnedFor.current = key;
            setWarningOpen(true);
        }
    }, [endsAt, inWarning, remainingMs]);

    // Fora do horário (ou bloqueado pelo administrador): termina a sessão e explica quando pode voltar.
    useEffect(() => {
        if (!user || !decision || decision.allowed || endingRef.current) return;
        endingRef.current = true;
        localStorage.setItem(ACCESS_DENIED_MESSAGE_KEY,
            `A sua sessão terminou: ${describeDenial(decision, now)}`);
        void logout().finally(() => { endingRef.current = false; });
    }, [decision, logout, now, user]);

    if (!user || !endsAt || !inWarning || remainingMs === null || remainingMs <= 0) return null;

    const minutesLeft = Math.ceil(remainingMs / 60_000);
    const countdown = remainingMs <= 60_000 ? `${Math.ceil(remainingMs / 1000)} s` : `${minutesLeft} min`;
    const returnText = returnAt ? `Pode voltar a entrar ${formatAccessMoment(returnAt, now)}.` : 'Contacte o administrador para voltar a ter acesso.';

    return (
        <>
            <div role="alert" className="flex shrink-0 flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-amber-500 px-4 py-2 text-center text-xs font-bold text-slate-950 sm:text-sm">
                <Clock className="h-4 w-4 shrink-0" />
                <span>
                    O horário de acesso termina às {hhmm(endsAt)}: a sessão fecha dentro de {countdown}. Guarde o seu trabalho. {returnText}
                </span>
            </div>
            <Dialog open={warningOpen} onOpenChange={setWarningOpen}>
                <DialogContent className="max-w-[390px] sm:max-w-[430px] p-0 border-none bg-transparent shadow-none overflow-visible">
                    <div className="relative bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-7 pt-12 shadow-2xl border border-slate-100 dark:border-slate-800 text-center animate-in zoom-in-95 duration-200">
                        {/* Badge superior amarelo/âmbar com ícone de triângulo de aviso (padrão exato da imagem) */}
                        <div className="absolute -top-10 left-1/2 -translate-x-1/2 w-20 h-20 rounded-2xl bg-amber-500 flex items-center justify-center shadow-lg shadow-amber-500/35 border-4 border-white dark:border-slate-900 transition-transform hover:scale-105">
                            <Clock className="h-10 w-10 text-white stroke-[2.5]" />
                        </div>

                        {/* Botão fechar (X) discreto */}
                        <button
                            type="button"
                            onClick={() => setWarningOpen(false)}
                            className="absolute top-4 right-4 h-7 w-7 rounded-full border border-slate-200 dark:border-slate-700 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:border-slate-300 dark:hover:border-slate-600 flex items-center justify-center transition-colors focus:outline-none"
                            aria-label="Fechar"
                        >
                            <span className="text-xs font-bold">✕</span>
                        </button>

                        {/* Título centralizado */}
                        <h3 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white uppercase tracking-tight mt-2">
                            {remainingMs <= 60_000 ? 'SESSÃO TERMINA EM 1 MINUTO?' : 'HORÁRIO DE ACESSO A TERMINAR?'}
                        </h3>

                        {/* Linha divisória horizontal */}
                        <div className="w-full border-t border-slate-100 dark:border-slate-800 my-4" />

                        {/* Mensagem explícita */}
                        <div className="space-y-3 px-1 text-slate-600 dark:text-slate-300 text-xs sm:text-sm leading-relaxed">
                            <p>
                                O seu horário de acesso definido pelo sistema termina às <strong className="text-slate-900 dark:text-white font-bold">{hhmm(endsAt)}</strong> (restam <strong className="text-amber-600 dark:text-amber-400 font-bold">{countdown}</strong>). Nessa hora a sua sessão será encerrada automaticamente para segurança das operações.
                            </p>

                            <div className="rounded-xl bg-amber-50 dark:bg-amber-950/40 p-3 text-xs font-semibold text-amber-900 dark:text-amber-300 border border-amber-200/70 dark:border-amber-900/50">
                                ⚠️ Guarde imediatamente o que estiver a fazer para evitar perda de dados.
                            </div>

                            <p className="font-semibold text-slate-800 dark:text-slate-200 pt-1">
                                Se necessita de mais horário de trabalho para concluir as suas tarefas, por favor contacte o <span className="text-amber-600 dark:text-amber-400 font-bold">Administrador do Sistema</span> para solicitar uma extensão de acesso.
                            </p>
                        </div>

                        {/* Dois botões inferiores no padrão exato da imagem */}
                        <div className="flex items-center gap-3 mt-6">
                            {/* Botão Esquerdo: Borda amarela / Fundo branco */}
                            <button
                                type="button"
                                onClick={() => setWarningOpen(false)}
                                className="flex-1 h-12 rounded-xl border-2 border-amber-500 bg-white hover:bg-amber-50/70 text-amber-600 dark:bg-slate-900 dark:text-amber-400 dark:hover:bg-amber-950/30 font-bold text-sm transition-all focus:outline-none active:scale-[0.98]"
                            >
                                Compreendi
                            </button>

                            {/* Botão Direito: Amarelo preenchido sólido */}
                            <button
                                type="button"
                                onClick={() => {
                                    const texto = encodeURIComponent(`Olá Administrador, o meu horário de acesso ao Tango ERP termina às ${hhmm(endsAt)} (dentro de ${countdown}). Solicito por favor uma extensão de horário.`);
                                    window.open(`https://wa.me/244941537486?text=${texto}`, '_blank', 'noopener,noreferrer');
                                }}
                                className="flex-1 h-12 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-sm transition-all shadow-md shadow-amber-500/25 flex items-center justify-center gap-1.5 focus:outline-none active:scale-[0.98]"
                            >
                                Contactar Admin
                            </button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}
