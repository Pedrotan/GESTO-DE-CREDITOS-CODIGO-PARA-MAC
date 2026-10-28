// Regras partilhadas do actualizador (processo principal do Electron e interface): estados, validação do
// servidor de actualizações e leitura do canal de avisos em tempo real. Sem dependências do Electron.

export type UpdateState =
    | 'idle'          // ainda não verificou
    | 'checking'      // a perguntar ao servidor
    | 'up_to_date'    // nada novo para este computador
    | 'available'     // versão nova disponível (à espera de «Atualizar agora»)
    | 'deferred'      // o utilizador escolheu «Mais tarde»
    | 'downloading'   // a descarregar (com progresso)
    | 'downloaded'    // descarregada e verificada pelo electron-updater: pronta a instalar
    | 'installing'    // a guardar o trabalho e a reiniciar
    | 'error';

export type UpdateRelease = {
    releaseId: string;
    version: string;
    notes: string;
    mandatory: boolean;
    size: number | null;
    publishedAt: string | null;
};

export type UpdateStatus = {
    state: UpdateState;
    currentVersion: string;
    deviceId: string;
    channel: 'internal' | 'stable' | null;
    release: UpdateRelease | null;
    progress: { percent: number; transferred: number; total: number; bytesPerSecond: number } | null;
    error: string | null;
    deferredUntil: string | null;
    lastCheckAt: string | null;
    /** Só no executável instalado se pode descarregar e instalar (em desenvolvimento apenas se verifica). */
    canInstall: boolean;
};

/** Servidores de onde o desktop aceita actualizações: só HTTPS e só o domínio oficial. */
export const OFFICIAL_UPDATE_HOSTS = ['tangogestaoecreditos.tech', 'www.tangogestaoecreditos.tech'] as const;

/**
 * Endereço do servidor de actualizações, ou null se não for de confiança. Em desenvolvimento (não instalado)
 * aceita também http://localhost para testes.
 */
export const trustedUpdateServer = (value: unknown, allowLocal = false): string | null => {
    try {
        const url = new URL(String(value || '').trim());
        if (url.username || url.password || url.search || url.hash || (url.pathname && url.pathname !== '/')) return null;
        if (url.protocol === 'https:' && (OFFICIAL_UPDATE_HOSTS as readonly string[]).includes(url.hostname.toLowerCase()) && !url.port) return url.origin;
        if (allowLocal && url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)) return url.origin;
    } catch {
        return null;
    }
    return null;
};

const SEMVER = /^\d{1,5}\.\d{1,5}\.\d{1,5}(?:-[0-9A-Za-z.-]{1,40})?$/;

/** Valida a resposta de /api/updates/check (nada do servidor é usado sem passar por aqui). */
export const parseCheckReply = (data: any): { channel: 'internal' | 'stable'; release: UpdateRelease | null } | null => {
    if (!data || data.success !== true) return null;
    const channel = data.channel === 'internal' ? 'internal' : 'stable';
    if (!data.available || !data.release) return { channel, release: null };
    const release = data.release;
    if (!SEMVER.test(String(release.version || ''))) return null;
    return {
        channel,
        release: {
            releaseId: String(release.releaseId || '').slice(0, 80),
            version: String(release.version),
            notes: String(release.notes || '').slice(0, 8_000),
            mandatory: release.mandatory === true,
            size: Number.isSafeInteger(release.size) && release.size > 0 ? release.size : null,
            publishedAt: typeof release.publishedAt === 'string' ? release.publishedAt.slice(0, 40) : null,
        },
    };
};

/** «Mais tarde»: entre 1 e 72 horas (uma versão obrigatória volta a aparecer ao fim de 1 hora). */
export const deferHours = (value: unknown, mandatory: boolean) => {
    const hours = Math.round(Number(value));
    if (!Number.isFinite(hours) || hours < 1) return 1;
    return mandatory ? 1 : Math.min(72, hours);
};

/**
 * Lê blocos de um fluxo Server-Sent Events. Devolve os eventos completos e o resto ainda por terminar.
 * Só aceita JSON com um "type" conhecido: o aviso nunca traz endereços nem comandos.
 */
export const parseSseChunk = (buffer: string): { events: Array<{ type: string; version?: string; mandatory?: boolean }>; rest: string } => {
    const blocks = buffer.replace(/\r\n/g, '\n').split('\n\n');
    const rest = blocks.pop() ?? '';
    const events: Array<{ type: string; version?: string; mandatory?: boolean }> = [];
    for (const block of blocks) {
        const data = block.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trim()).join('\n');
        if (!data) continue;
        try {
            const parsed = JSON.parse(data);
            if (parsed?.type === 'update.available' || parsed?.type === 'connected') {
                events.push({ type: parsed.type, version: SEMVER.test(String(parsed.version || '')) ? parsed.version : undefined, mandatory: parsed.mandatory === true });
            }
        } catch { /* bloco inválido: ignorado */ }
    }
    return { events, rest: rest.length > 64_000 ? '' : rest };
};

/** Intervalo até à próxima verificação periódica: 4 horas ± 30 minutos (os computadores não perguntam todos ao mesmo tempo). */
export const nextCheckDelayMs = (random = Math.random()) => 4 * 3_600_000 + Math.round((random - 0.5) * 3_600_000);

/** Espera antes de voltar a ligar ao canal de avisos: 5 s, 10 s, 20 s… até 5 minutos. */
export const reconnectDelayMs = (attempt: number) => Math.min(300_000, 5_000 * 2 ** Math.max(0, Math.min(10, attempt)));

export const formatBytes = (bytes: number | null | undefined) => {
    if (!bytes || bytes <= 0) return '';
    return bytes >= 1_048_576 ? `${(bytes / 1_048_576).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`;
};
