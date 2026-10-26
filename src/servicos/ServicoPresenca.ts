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
const listeners = new Set<() => void>();
const notify = () => listeners.forEach(listener => listener());

const beat = async () => {
    if (!currentUser) return;
    try {
        const result = await sendPresence(currentUser, true);
        if (!result) return;
        snapshot = { tenantId: result.tenantId, entries: new Map(result.online.map(entry => [entry.userKey, entry])), receivedAt: Date.now() };
        notify();
    } catch (error) {
        console.warn('[Presença] Sinal não enviado:', error);
    }
};

const onVisible = () => { if (typeof document !== 'undefined' && document.visibilityState === 'visible') void beat(); };

export const ServicoPresenca = {
    /** Começa a enviar o sinal deste utilizador (idempotente). */
    start(userId: string) {
        if (currentUser === userId && timer) return;
        this.stop(false);
        currentUser = userId;
        void beat();
        timer = setInterval(() => void beat(), INTERVAL_MS);
        if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisible);
    },
    /** Pára o sinal; com `announce`, avisa o servidor (fim de sessão: deixa de aparecer logo). */
    stop(announce = true) {
        if (timer) clearInterval(timer);
        timer = null;
        if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisible);
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
            const entry = snapshot.entries.get(await presenceUserKey(snapshot.tenantId, id));
            result.set(id, entry
                ? { online: true, lastSeen: entry.lastSeen, devices: entry.devices, platforms: entry.platforms }
                : { online: false, lastSeen: null, devices: 0, platforms: [] });
        }
        return result;
    },
};
