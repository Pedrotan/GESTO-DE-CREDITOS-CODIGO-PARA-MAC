import { presenceUserKey, sendPresence, type PresenceEntry } from '@/servicos/ServicoSincronizacaoCloud';

// Quem está ligado ao sistema em todos os dispositivos da empresa (computadores e navegadores), como num chat. Cada
// dispositivo com sessão iniciada envia um sinal por minuto ao servidor; a resposta traz a lista de quem está online.
// Sem ligação à nuvem fica só o próprio dispositivo (o estado local de sempre).

const INTERVAL_MS = 60_000;

export type RemotePresence = { online: boolean; lastSeen: string | null; devices: number; platforms: Array<'pc' | 'web'> };
type Snapshot = { tenantId: string; entries: Map<string, PresenceEntry>; receivedAt: number } | null;

let snapshot: Snapshot = null;
let timer: ReturnType<typeof setInterval> | null = null;
let currentUser: string | null = null;
// Última vez que cada utilizador apareceu online nesta sessão (para «visto há 5 min» depois de sair).
const lastSeenByKey = new Map<string, string>();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach(listener => listener());

const beat = async () => {
    if (!currentUser) return;
    try {
        const result = await sendPresence(currentUser, true);
        if (!result) return;
        for (const entry of result.online) if (entry.lastSeen) lastSeenByKey.set(entry.userKey, entry.lastSeen);
        snapshot = { tenantId: result.tenantId, entries: new Map(result.online.map(entry => [entry.userKey, entry])), receivedAt: Date.now() };
        notify();
    } catch (error) {
        console.warn('[Presença] Sinal não enviado:', error);
    }
};

const onVisible = () => { if (typeof document !== 'undefined' && document.visibilityState === 'visible') void beat(); };
// Janela ou separador fechado (ou programa terminado) sem terminar sessão: avisa já o servidor, em vez de continuar
// «online» até o sinal expirar (150 s). Ao voltar (página restaurada) o sinal recomeça.
const onPageHide = () => { if (currentUser) void sendPresence(currentUser, false).catch(() => undefined); };
const onPageShow = (event: PageTransitionEvent) => { if (event.persisted) void beat(); };

export const ServicoPresenca = {
    /** Começa a enviar o sinal deste utilizador (idempotente). */
    start(userId: string) {
        if (currentUser === userId && timer) return;
        this.stop(false);
        currentUser = userId;
        void beat();
        timer = setInterval(() => void beat(), INTERVAL_MS);
        if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisible);
        if (typeof window !== 'undefined') {
            window.addEventListener('pagehide', onPageHide);
            window.addEventListener('pageshow', onPageShow);
        }
    },
    /** Pára o sinal; com `announce`, avisa o servidor (fim de sessão: deixa de aparecer logo). */
    stop(announce = true) {
        if (timer) clearInterval(timer);
        timer = null;
        if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisible);
        if (typeof window !== 'undefined') {
            window.removeEventListener('pagehide', onPageHide);
            window.removeEventListener('pageshow', onPageShow);
        }
        const leaving = currentUser;
        currentUser = null;
        if (announce && leaving) void sendPresence(leaving, false).catch(() => undefined);
    },
    refresh: () => beat(),
    subscribe(listener: () => void) {
        listeners.add(listener);
        return () => { listeners.delete(listener); };
    },
    /** Estado de presença dos utilizadores indicados (null = sem dados da nuvem). */
    async resolve(userIds: string[]): Promise<Map<string, RemotePresence> | null> {
        if (!snapshot) return null;
        const result = new Map<string, RemotePresence>();
        for (const id of userIds) {
            const key = await presenceUserKey(snapshot.tenantId, id);
            const entry = snapshot.entries.get(key);
            result.set(id, entry
                ? { online: true, lastSeen: entry.lastSeen, devices: entry.devices, platforms: entry.platforms }
                : { online: false, lastSeen: lastSeenByKey.get(key) || null, devices: 0, platforms: [] });
        }
        return result;
    },
    /** Há dados de presença da nuvem (sem eles não se sabe quem está ligado noutros dispositivos). */
    available: () => Boolean(snapshot),
};
