import { app, BrowserWindow, ipcMain } from 'electron';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import {
    deferHours, nextCheckDelayMs, parseCheckReply, parseSseChunk, reconnectDelayMs, trustedUpdateServer,
    type UpdateRelease, type UpdateStatus,
} from '../src/bibliotecas/actualizacoes';

// Actualizador do Tango ERP (desktop). O servidor da VPS decide que versão este computador pode receber
// (equipa de desenvolvimento ou todos, conforme o interruptor no Tango Master) e o electron-updater descarrega
// e verifica o instalador (SHA-512 do feed e, com o executável assinado, o editor). Fluxo:
//   verificar (arranque, a cada ~4 h, aviso em tempo real) → modal «Atualizar agora» / «Mais tarde»
//   → descarregar com progresso → guardar o trabalho (cópia de segurança) → reiniciar e instalar → ACK.
// Os dados do utilizador ficam em userData e nunca fazem parte dos ficheiros substituídos.

type Deps = {
    /** Servidor da licença deste computador (o mesmo da activação); por omissão o oficial. */
    serverUrl: () => string;
    /** Token de licença assinado (identifica a empresa no servidor; nunca vai para o registo). */
    licenseToken: () => string | null;
    assertTrustedSender: (event: Electron.IpcMainInvokeEvent) => void;
    /** Guarda o trabalho antes de fechar (cópia de segurança da base de dados). */
    prepareForInstall: () => Promise<void>;
};

type StoredState = { deviceId: string; pending?: { version: string; at: string } | null; deferred?: { version: string; until: string } | null };

const STATUS_CHANNEL = 'updates:status-changed';
const ACK_DELAY_MS = 20_000;

let deps: Deps;
let installing = false;
let ackScheduled = false;
let eventsAbort: AbortController | null = null;
let periodicTimer: NodeJS.Timeout | null = null;
let status: UpdateStatus;
let updaterPromise: Promise<any> | null = null;

const statePath = () => path.join(app.getPath('userData'), 'actualizacoes.json');

const readStored = (): StoredState => {
    try {
        const parsed = JSON.parse(fs.readFileSync(statePath(), 'utf8'));
        if (/^[0-9a-f-]{36}$/.test(parsed?.deviceId)) return parsed;
    } catch { /* primeira vez */ }
    // Identificador aleatório desta instalação (não é uma impressão digital do computador).
    const fresh: StoredState = { deviceId: crypto.randomUUID(), pending: null, deferred: null };
    writeStored(fresh);
    return fresh;
};
const writeStored = (value: StoredState) => {
    try { fs.writeFileSync(statePath(), JSON.stringify(value), { mode: 0o600 }); } catch (error) { console.warn('[Actualizações] Não foi possível guardar o estado:', (error as Error)?.message); }
};

const server = () => trustedUpdateServer(deps.serverUrl(), !app.isPackaged) || trustedUpdateServer('https://tangogestaoecreditos.tech');
const platform = () => (process.platform === 'darwin' ? 'mac' : process.platform === 'win32' ? 'win' : null);

const setStatus = (changes: Partial<UpdateStatus>) => {
    status = { ...status, ...changes };
    for (const window of BrowserWindow.getAllWindows()) {
        if (!window.isDestroyed()) window.webContents.send(STATUS_CHANNEL, status);
    }
};

const api = async (route: string, init: { method?: 'GET' | 'POST'; body?: Record<string, unknown>; query?: Record<string, string> } = {}) => {
    const base = server();
    if (!base) throw new Error('Servidor de actualizações não autorizado.');
    const url = new URL(`/api/updates/${route}`, base);
    for (const [key, value] of Object.entries(init.query || {})) url.searchParams.set(key, value);
    const response = await fetch(url, {
        method: init.method || 'GET',
        headers: init.body ? { 'Content-Type': 'application/json' } : undefined,
        body: init.body ? JSON.stringify(init.body) : undefined,
        signal: AbortSignal.timeout(20_000),
    });
    const data: any = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.message || `O servidor de actualizações respondeu ${response.status}.`);
    return data;
};

/** Estado da instalação comunicado ao servidor (sem dados pessoais). Falhas de rede não interrompem nada. */
const report = (state: string, extra: Record<string, unknown> = {}) =>
    api('status', { method: 'POST', body: { deviceId: status.deviceId, state, ...extra } }).catch(() => undefined);

const register = () => api('register', {
    method: 'POST',
    body: { deviceId: status.deviceId, kind: 'desktop', platform: platform(), arch: process.arch, version: status.currentVersion, licenseToken: deps.licenseToken() || undefined },
}).then(data => { if (data?.channel) setStatus({ channel: data.channel === 'internal' ? 'internal' : 'stable' }); }).catch(() => undefined);

/** electron-updater só é carregado no executável instalado (em desenvolvimento não há o que substituir). */
// require (e não import()): o pacote é CommonJS e é lido de dentro do app.asar.
const updater = () => updaterPromise ??= Promise.resolve().then(() => {
    const { autoUpdater } = require('electron-updater');
    autoUpdater.autoDownload = false;            // só depois de «Atualizar agora»
    autoUpdater.autoInstallOnAppQuit = false;    // só depois de guardar o trabalho
    autoUpdater.allowDowngrade = false;
    autoUpdater.allowPrerelease = false;
    autoUpdater.disableWebInstaller = true;
    // O servidor envia o instalador inteiro; o download diferencial (pedidos de vários intervalos) fica desligado.
    autoUpdater.disableDifferentialDownload = true;
    autoUpdater.logger = {
        info: (message: unknown) => console.log('[Actualizações]', message),
        warn: (message: unknown) => console.warn('[Actualizações]', message),
        error: (message: unknown) => console.error('[Actualizações]', message),
        debug: () => undefined,
    };
    autoUpdater.on('download-progress', (progress: any) => setStatus({
        state: 'downloading',
        progress: { percent: Math.max(0, Math.min(100, Number(progress?.percent) || 0)), transferred: Number(progress?.transferred) || 0, total: Number(progress?.total) || 0, bytesPerSecond: Number(progress?.bytesPerSecond) || 0 },
    }));
    autoUpdater.on('update-downloaded', () => {
        setStatus({ state: 'downloaded', progress: status.progress ? { ...status.progress, percent: 100 } : null, error: null });
        void report('downloaded', { targetVersion: status.release?.version });
    });
    autoUpdater.on('error', (error: Error) => {
        if (installing) return;
        setStatus({ state: 'error', error: friendlyError(error) });
        void report('failed', { reason: String(error?.message || error).slice(0, 300), targetVersion: status.release?.version });
    });
    return autoUpdater;
});

const friendlyError = (error: unknown) => {
    const message = String((error as Error)?.message || error || '');
    if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|ECONNRESET|net::|fetch failed|timeout/i.test(message)) return 'Sem ligação ao servidor de actualizações. Tente mais tarde.';
    if (/sha512|checksum/i.test(message)) return 'O ficheiro descarregado não confere com o publicado. A actualização foi recusada por segurança.';
    if (/signature|publisher|not signed/i.test(message)) return 'O instalador não está assinado pelo editor esperado. A actualização foi recusada por segurança.';
    if (/404/.test(message)) return 'Esta versão deixou de estar disponível para este computador.';
    return 'Não foi possível concluir a actualização. A versão actual continua a funcionar.';
};

/** Pergunta ao servidor se há versão nova para este computador. */
export const checkForUpdates = async (reason: string) => {
    if (installing || ['downloading', 'downloaded', 'checking'].includes(status.state)) return status;
    const target = platform();
    if (!target) return status;
    const previous = status.state;
    setStatus({ state: 'checking', error: null });
    try {
        const data = await api('check', { query: { deviceId: status.deviceId, platform: target, arch: process.arch, version: status.currentVersion } });
        const parsed = parseCheckReply(data);
        if (!parsed) throw new Error('Resposta inválida do servidor de actualizações.');
        const stored = readStored();
        const deferred = parsed.release && stored.deferred?.version === parsed.release.version && Date.parse(stored.deferred.until) > Date.now()
            ? stored.deferred.until : null;
        setStatus({
            state: !parsed.release ? 'up_to_date' : deferred ? 'deferred' : 'available',
            channel: parsed.channel,
            release: parsed.release,
            deferredUntil: deferred,
            lastCheckAt: new Date().toISOString(),
        });
        if (parsed.release && !deferred && previous !== 'available') void report('available', { targetVersion: parsed.release.version });
    } catch (error) {
        console.warn(`[Actualizações] Verificação (${reason}) falhou:`, (error as Error)?.message);
        // Sem rede não é um erro para o utilizador: volta ao estado anterior e tenta na próxima.
        setStatus({ state: previous === 'checking' ? 'idle' : previous, lastCheckAt: new Date().toISOString() });
    }
    return status;
};

const downloadUpdate = async () => {
    if (!status.release || !['available', 'deferred', 'error'].includes(status.state)) throw new Error('Não há nenhuma actualização para descarregar.');
    if (!app.isPackaged) throw new Error('Em desenvolvimento só se verifica: descarregar e instalar exige o executável instalado.');
    const base = server();
    if (!base) throw new Error('Servidor de actualizações não autorizado.');
    const expected = status.release.version;
    setStatus({ state: 'downloading', progress: { percent: 0, transferred: 0, total: status.release.size || 0, bytesPerSecond: 0 }, error: null });
    void report('downloading', { targetVersion: expected });
    try {
        const autoUpdater = await updater();
        // O feed é próprio deste computador: o servidor só lá põe a versão que ele pode receber.
        autoUpdater.setFeedURL({ provider: 'generic', url: `${base}/api/updates/feed/${status.deviceId}/` });
        const result = await autoUpdater.checkForUpdates();
        const offered = result?.updateInfo?.version;
        if (offered !== expected) throw new Error(`O feed oferece ${offered || 'nenhuma versão'} em vez de ${expected}.`);
        await autoUpdater.downloadUpdate();
    } catch (error) {
        setStatus({ state: 'error', error: friendlyError(error) });
        void report('failed', { reason: String((error as Error)?.message || error).slice(0, 300), targetVersion: expected });
    }
    return status;
};

const installUpdate = async () => {
    if (status.state !== 'downloaded' || !status.release) throw new Error('A actualização ainda não está pronta a instalar.');
    installing = true;
    setStatus({ state: 'installing' });
    try {
        await deps.prepareForInstall();
    } catch (error) {
        installing = false;
        setStatus({ state: 'downloaded', error: `Não foi possível guardar o trabalho antes de reiniciar: ${(error as Error)?.message || error}` });
        throw error;
    }
    const stored = readStored();
    writeStored({ ...stored, pending: { version: status.release.version, at: new Date().toISOString() }, deferred: null });
    await report('installing', { targetVersion: status.release.version });
    const autoUpdater = await updater();
    // Instalador visível (pode pedir permissão de administrador no Windows); a aplicação volta a abrir no fim.
    setImmediate(() => autoUpdater.quitAndInstall(false, true));
    return status;
};

const deferUpdate = (hours: unknown) => {
    if (!status.release) return status;
    const until = new Date(Date.now() + deferHours(hours, status.release.mandatory) * 3_600_000).toISOString();
    writeStored({ ...readStored(), deferred: { version: status.release.version, until } });
    setStatus({ state: 'deferred', deferredUntil: until });
    void report('deferred', { targetVersion: status.release.version });
    setTimeout(() => { if (status.state === 'deferred') void checkForUpdates('fim do adiamento'); }, Date.parse(until) - Date.now() + 1_000).unref?.();
    return status;
};

/** Depois de instalar: confirma ao servidor só quando a interface nova abriu e ficou de pé alguns segundos. */
const scheduleAck = () => {
    if (ackScheduled) return;
    ackScheduled = true;
    const stored = readStored();
    if (!stored.pending) return;
    if (stored.pending.version !== status.currentVersion) {
        // O instalador não chegou ao fim (cancelado, sem permissão…): a versão anterior continua a funcionar.
        writeStored({ ...stored, pending: null });
        void report('failed', { reason: `A instalação da ${stored.pending.version} não terminou; continua a ${status.currentVersion}.`, targetVersion: stored.pending.version });
        return;
    }
    setTimeout(async () => {
        try {
            await api('ack', { method: 'POST', body: { deviceId: status.deviceId, version: status.currentVersion } });
            writeStored({ ...readStored(), pending: null });
        } catch { ackScheduled = false; /* repete no próximo arranque */ }
    }, ACK_DELAY_MS).unref?.();
};

/** Canal de avisos em tempo real (SSE). É só um sinal: ao receber, o computador volta a perguntar ao servidor. */
const listenForEvents = async (attempt = 0) => {
    const base = server();
    if (!base || installing) return;
    eventsAbort = new AbortController();
    let connected = false;
    try {
        const response = await fetch(`${base}/api/updates/events`, { headers: { Accept: 'text/event-stream' }, signal: eventsAbort.signal });
        if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const parsed = parseSseChunk(buffer);
            buffer = parsed.rest;
            for (const event of parsed.events) {
                if (event.type === 'connected') {
                    // Ao (re)ligar verifica logo: apanha o que foi publicado enquanto esteve sem rede.
                    if (attempt > 0 && !connected) void checkForUpdates('religação');
                    connected = true;
                    attempt = 0;
                }
                // Espera aleatória até 1 minuto: milhares de computadores não perguntam no mesmo segundo.
                if (event.type === 'update.available') setTimeout(() => void checkForUpdates('aviso em tempo real'), Math.round(Math.random() * 60_000)).unref?.();
            }
        }
    } catch (error) {
        if (eventsAbort?.signal.aborted) return;
        console.warn('[Actualizações] Canal de avisos indisponível:', (error as Error)?.message);
    }
    if (installing) return;
    setTimeout(() => void listenForEvents(attempt + 1), reconnectDelayMs(attempt)).unref?.();
};

export const isInstallingUpdate = () => installing;

/** Liga o actualizador (só no Tango ERP; o Tango Master não usa este canal). */
export const startUpdater = (options: Deps) => {
    deps = options;
    const stored = readStored();
    status = {
        state: 'idle', currentVersion: app.getVersion(), deviceId: stored.deviceId, channel: null, release: null as UpdateRelease | null,
        progress: null, error: null, deferredUntil: null, lastCheckAt: null, canInstall: app.isPackaged,
    };

    ipcMain.handle('updates:status', (event) => {
        deps.assertTrustedSender(event);
        scheduleAck(); // a interface pediu o estado: arrancou bem
        return status;
    });
    ipcMain.handle('updates:check', (event) => { deps.assertTrustedSender(event); return checkForUpdates('manual'); });
    ipcMain.handle('updates:download', (event) => { deps.assertTrustedSender(event); return downloadUpdate(); });
    ipcMain.handle('updates:install', (event) => { deps.assertTrustedSender(event); return installUpdate(); });
    ipcMain.handle('updates:defer', (event, hours) => { deps.assertTrustedSender(event); return deferUpdate(hours); });

    const schedule = () => {
        periodicTimer = setTimeout(async () => { await checkForUpdates('periódica'); schedule(); }, nextCheckDelayMs());
        periodicTimer.unref?.();
    };
    setTimeout(async () => {
        await register();
        await checkForUpdates('arranque');
        schedule();
        void listenForEvents();
    }, 10_000).unref?.();

    app.on('before-quit', () => eventsAbort?.abort());
};
