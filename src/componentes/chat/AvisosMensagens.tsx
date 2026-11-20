import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { MessageSquare, X } from 'lucide-react';
import { useAuth } from '@/contextos/ContextoAutenticacao';
import { useData } from '@/contextos/ContextoDados';
import { lojaAvisos, quandoAviso, type AvisoMensagem } from '@/bibliotecas/avisos-mensagens';
import { resumoMensagem } from '@/bibliotecas/chat-interno';
import { cn } from '@/bibliotecas/utils';

const DURACAO_MS = 8_000;

/** Toque curto e discreto (dois tons), sem ficheiro de som; em silêncio se o navegador não deixar. */
const tocar = () => {
    try {
        const Contexto = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Contexto) return;
        const audio = new Contexto();
        [880, 1320].forEach((frequencia, indice) => {
            const oscilador = audio.createOscillator();
            const volume = audio.createGain();
            const inicio = audio.currentTime + indice * 0.11;
            oscilador.frequency.value = frequencia;
            volume.gain.setValueAtTime(0.0001, inicio);
            volume.gain.exponentialRampToValueAtTime(0.06, inicio + 0.02);
            volume.gain.exponentialRampToValueAtTime(0.0001, inicio + 0.18);
            oscilador.connect(volume).connect(audio.destination);
            oscilador.start(inicio);
            oscilador.stop(inicio + 0.2);
        });
        setTimeout(() => void audio.close().catch(() => undefined), 600);
    } catch { /* sem som */ }
};

/** Com o programa ou o separador fora de vista, a notificação do próprio sistema operativo (Windows, macOS, Android). */
const notificacaoSistema = (aviso: { senderId: string; senderName: string; resumo: string }, abrir: () => void) => {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    if (document.visibilityState === 'visible' && document.hasFocus()) return;
    try {
        const nota = new Notification(aviso.senderName, { body: aviso.resumo, tag: `chat-${aviso.senderId}` });
        nota.onclick = () => { window.focus(); abrir(); nota.close(); };
    } catch { /* sem notificações do sistema */ }
};

/** Um aviso: com mais de uma mensagem da mesma pessoa, fica «empilhado» como no telemóvel. */
export function CartaoAviso({ aviso, onAbrir, onFechar }: { aviso: AvisoMensagem; onAbrir: () => void; onFechar: () => void }) {
    const [agora, setAgora] = useState(() => Date.now());
    useEffect(() => { const relogio = setInterval(() => setAgora(Date.now()), 30_000); return () => clearInterval(relogio); }, []);
    return (
        <div className={cn('relative', aviso.count > 1 && 'pb-3')}>
            {aviso.count > 1 && (
                <>
                    <div className="absolute inset-x-6 bottom-0 h-10 rounded-[20px] bg-white/55 shadow-md backdrop-blur-xl dark:bg-slate-700/55" />
                    <div className="absolute inset-x-3 bottom-1.5 h-10 rounded-[20px] bg-white/70 shadow-md backdrop-blur-xl dark:bg-slate-700/70" />
                </>
            )}
            <div role="button" tabIndex={0} onClick={onAbrir} onKeyDown={event => { if (event.key === 'Enter') onAbrir(); }}
                className="group relative cursor-pointer rounded-[22px] border border-white/50 bg-white/85 p-3.5 text-left shadow-[0_12px_32px_rgba(15,23,42,0.22)] backdrop-blur-2xl transition hover:bg-white/95 dark:border-white/10 dark:bg-slate-800/85 dark:hover:bg-slate-800/95">
                <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-[7px] bg-gradient-to-b from-emerald-400 to-emerald-600 shadow-sm">
                        <MessageSquare className="h-3.5 w-3.5 fill-white text-white" />
                    </span>
                    <span className="text-[13px] font-semibold text-slate-500 dark:text-slate-300">Mensagens</span>
                    <span className="ml-auto text-[12px] text-slate-400">{quandoAviso(aviso.at, agora)}</span>
                    <button type="button" aria-label="Fechar aviso" onClick={event => { event.stopPropagation(); onFechar(); }}
                        className="-mr-1 rounded-full p-0.5 text-slate-400 opacity-0 transition hover:bg-slate-200/70 hover:text-slate-600 group-hover:opacity-100 dark:hover:bg-slate-600/60">
                        <X className="h-3.5 w-3.5" />
                    </button>
                </div>
                <p className="mt-1.5 truncate text-[14px] font-bold text-slate-900 dark:text-white">
                    {aviso.senderName}{aviso.count > 1 && <span className="ml-1.5 text-[12px] font-semibold text-emerald-600">{aviso.count} mensagens</span>}
                </p>
                <p className="line-clamp-2 text-[13.5px] leading-snug text-slate-600 dark:text-slate-300">{aviso.resumo}</p>
            </div>
        </div>
    );
}

/**
 * Avisos de mensagens novas em qualquer página (montado no layout). Um clique abre a conversa com quem escreveu.
 * Fora de vista, a notificação do sistema operativo; o som é discreto.
 */
export function AvisosMensagens() {
    const { user } = useAuth();
    const { messages } = useData();
    const navigate = useNavigate();
    const avisos = useSyncExternalStore(lojaAvisos.subscribe, lojaAvisos.get, lojaAvisos.get);
    const [pausado, setPausado] = useState(false);
    const temporizadores = useRef(new Map<string, ReturnType<typeof setTimeout>>());

    const abrir = (senderId: string, id?: string) => {
        if (id) lojaAvisos.fechar(id);
        navigate(`/chat?com=${encodeURIComponent(senderId)}`);
    };

    useEffect(() => {
        if (!user) return;
        const novas = lojaAvisos.receber(messages, user.id);
        if (!novas.length) return;
        tocar();
        const ultima = novas[novas.length - 1];
        notificacaoSistema({ senderId: ultima.senderId, senderName: ultima.senderName, resumo: resumoMensagem(ultima) }, () => abrir(ultima.senderId));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [messages, user]);

    // Cada aviso sai sozinho ao fim de 8 s (o tempo recomeça quando chega outra mensagem da mesma pessoa); parado com o rato em cima.
    useEffect(() => {
        const mapa = temporizadores.current;
        for (const [id, temporizador] of mapa) {
            if (pausado || !avisos.some(aviso => aviso.id === id)) { clearTimeout(temporizador); mapa.delete(id); }
        }
        if (pausado) return;
        for (const aviso of avisos) {
            const chave = aviso.id;
            if (mapa.has(chave)) clearTimeout(mapa.get(chave)!);
            mapa.set(chave, setTimeout(() => { mapa.delete(chave); lojaAvisos.fechar(chave); }, Math.max(1_000, DURACAO_MS - (Date.now() - aviso.at))));
        }
    }, [avisos, pausado]);
    useEffect(() => () => { for (const temporizador of temporizadores.current.values()) clearTimeout(temporizador); }, []);

    if (!user || typeof document === 'undefined') return null;
    return createPortal(
        <div className="pointer-events-none fixed right-3 top-3 z-[200] flex w-[370px] max-w-[calc(100vw-1.5rem)] flex-col gap-2.5 sm:right-5 sm:top-5"
            onMouseEnter={() => setPausado(true)} onMouseLeave={() => setPausado(false)}>
            <AnimatePresence initial={false}>
                {avisos.length > 1 && (
                    <motion.div key="limpar" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="pointer-events-auto flex justify-end">
                        <button type="button" onClick={() => lojaAvisos.limpar()}
                            className="rounded-full bg-slate-700/70 px-3.5 py-1.5 text-[12px] font-semibold text-white shadow-lg backdrop-blur-xl transition hover:bg-slate-700/85">
                            Limpar
                        </button>
                    </motion.div>
                )}
                {avisos.map(aviso => (
                    <motion.div key={aviso.id} layout initial={{ opacity: 0, y: -24, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, x: 60, transition: { duration: 0.18 } }} transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                        className="pointer-events-auto">
                        <CartaoAviso aviso={aviso} onAbrir={() => abrir(aviso.senderId, aviso.id)} onFechar={() => lojaAvisos.fechar(aviso.id)} />
                    </motion.div>
                ))}
            </AnimatePresence>
        </div>,
        document.body,
    );
}
