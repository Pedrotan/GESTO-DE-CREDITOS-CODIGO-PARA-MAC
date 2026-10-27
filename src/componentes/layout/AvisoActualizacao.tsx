import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Download, Loader2, RefreshCw, Rocket } from 'lucide-react';
import { Button } from '@/componentes/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/componentes/ui/dialog';
import { Progress } from '@/componentes/ui/progress';
import { formatBytes, parseSseChunk, type UpdateStatus } from '@/bibliotecas/actualizacoes';
import { UPDATE_DIALOG_ATTR, flushPendingWork, hasOpenEditor, openEditorTitle } from '@/bibliotecas/trabalho-aberto';

// Aviso de versão nova do Tango ERP.
//  - Desktop: o processo principal verifica (arranque, ~4 h, aviso em tempo real) e este modal mostra versão,
//    notas e progresso, com «Atualizar agora» / «Mais tarde». Antes de reiniciar guarda o trabalho.
//  - Web: compara a build aberta com /version.json do servidor e oferece recarregar sem perder o que está aberto.


const WEB_CHECK_MS = 2 * 60_000;
const OPEN_UPDATE_EVENT = 'tango:abrir-actualizacao';

const editorBlockMessage = () => {
    const title = openEditorTitle();
    return `Tem um formulário aberto${title ? ` («${title}»)` : ''}. Guarde-o ou feche-o primeiro; a actualização espera por si.`;
};

function AvisoDesktop() {
    const api = window.electronAPI?.updates;
    const [status, setStatus] = useState<UpdateStatus | null>(null);
    const [open, setOpen] = useState(false);
    const [notice, setNotice] = useState('');
    const [saving, setSaving] = useState(false);
    const shownFor = useRef<string | null>(null);

    useEffect(() => {
        if (!api) return;
        void api.getStatus().then(setStatus).catch(() => undefined);
        return api.onStatus(setStatus);
    }, [api]);

    // Definições › Sobre › «Ver actualização» reabre o modal depois de um «Mais tarde».
    useEffect(() => {
        const reopen = () => setOpen(true);
        window.addEventListener(OPEN_UPDATE_EVENT, reopen);
        return () => window.removeEventListener(OPEN_UPDATE_EVENT, reopen);
    }, []);

    // Abre sozinho uma vez por versão; depois só quando o estado avança (descarregada, erro).
    useEffect(() => {
        if (!status?.release) return;
        if (status.state === 'available' && shownFor.current !== status.release.version) {
            shownFor.current = status.release.version;
            setOpen(true);
        }
        if (status.state === 'downloaded' || status.state === 'error') setOpen(true);
    }, [status?.state, status?.release]);

    if (!api || !status?.release) return null;
    const { release, state, progress } = status;

    const later = async () => {
        setOpen(false);
        setNotice('');
        if (state === 'available' || state === 'error') await api.defer(release.mandatory ? 1 : 24).catch(() => undefined);
    };

    const restart = async () => {
        if (hasOpenEditor()) { setNotice(editorBlockMessage()); return; }
        setNotice(''); setSaving(true);
        try {
            const pending = await flushPendingWork();
            if (pending) setNotice(`${pending} alteração(ões) ainda por enviar para a nuvem ficam guardadas neste computador e seguem depois do reinício.`);
            await api.install();
        } catch (error) {
            setNotice((error as Error)?.message || 'Não foi possível reiniciar para instalar.');
        } finally { setSaving(false); }
    };

    const size = formatBytes(release.size);
    return (
        <Dialog open={open} onOpenChange={value => { if (!value && state !== 'installing') void later(); }}>
            <DialogContent {...{ [UPDATE_DIALOG_ATTR]: '' }} className="max-w-lg" onInteractOutside={event => event.preventDefault()}>
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2"><Rocket className="h-6 w-6" /> Nova versão {release.version}</DialogTitle>
                    <DialogDescription>
                        Está a usar a versão {status.currentVersion}.{size ? ` Transferência: ${size}.` : ''}
                        {status.channel === 'internal' ? ' (Canal da equipa de desenvolvimento.)' : ''}
                    </DialogDescription>
                </DialogHeader>
                {release.mandatory && (
                    <div className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> Actualização obrigatória: pode adiar uma hora de cada vez, mas deve instalá-la hoje.
                    </div>
                )}
                {release.notes && <div className="max-h-48 overflow-y-auto whitespace-pre-line rounded-xl bg-muted p-3 text-sm">{release.notes}</div>}

                {state === 'downloading' && (
                    <div className="space-y-2">
                        <Progress value={progress?.percent ?? 0} />
                        <p className="text-xs text-muted-foreground">
                            A descarregar… {Math.floor(progress?.percent ?? 0)}%
                            {progress?.total ? ` (${formatBytes(progress.transferred)} de ${formatBytes(progress.total)})` : ''}
                            {progress?.bytesPerSecond ? ` · ${formatBytes(progress.bytesPerSecond)}/s` : ''}. Pode continuar a trabalhar.
                        </p>
                    </div>
                )}
                {state === 'downloaded' && (
                    <p className="flex items-center gap-2 text-sm text-emerald-700"><CheckCircle2 className="h-4 w-4" /> Descarregada e verificada. Ao reiniciar, o trabalho é guardado (cópia de segurança) e a versão nova é instalada.</p>
                )}
                {state === 'installing' && <p className="flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" /> A guardar o trabalho e a reiniciar… O Windows pode pedir permissão para instalar.</p>}
                {state === 'error' && status.error && <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{status.error}</p>}
                {!status.canInstall && <p className="text-xs text-muted-foreground">Modo de desenvolvimento: só o executável instalado descarrega e instala.</p>}
                {notice && <p className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">{notice}</p>}

                <DialogFooter className="gap-2">
                    {state !== 'installing' && <Button variant="outline" onClick={() => void later()}>Mais tarde</Button>}
                    {(state === 'available' || state === 'deferred' || state === 'error') && (
                        <Button className="gap-2" disabled={!status.canInstall} onClick={() => { setNotice(''); void api.download(); }}>
                            {state === 'error' ? <RefreshCw className="h-4 w-4" /> : <Download className="h-4 w-4" />} {state === 'error' ? 'Tentar de novo' : 'Atualizar agora'}
                        </Button>
                    )}
                    {state === 'downloaded' && (
                        <Button className="gap-2" disabled={saving} onClick={() => void restart()}>
                            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Guardar e reiniciar
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function AvisoWeb() {
    const [newVersion, setNewVersion] = useState<string | null>(null);
    const [open, setOpen] = useState(false);
    const [notice, setNotice] = useState('');
    const [waiting, setWaiting] = useState(false);
    const currentBuild = typeof __TANGO_BUILD_ID__ === 'string' ? __TANGO_BUILD_ID__ : '';

    const check = useCallback(async () => {
        if (!currentBuild || document.visibilityState === 'hidden') return;
        try {
            const response = await fetch(`${import.meta.env.BASE_URL}version.json`, { cache: 'no-store' });
            if (!response.ok) return;
            const data = await response.json();
            if (typeof data?.buildId !== 'string' || data.buildId === currentBuild) return;
            // Página de entrada: ainda não há trabalho a perder — recarrega já, para a sessão começar na versão nova.
            // Uma vez por versão (se a página voltasse com a versão antiga, por uma cache, não fica a recarregar sem fim).
            let reloadedFor = '';
            try { reloadedFor = sessionStorage.getItem('tango_login_reload_build') || ''; } catch { /* sem armazenamento */ }
            if (/^#\/entrar\b/.test(window.location.hash) && reloadedFor !== data.buildId) {
                try { sessionStorage.setItem('tango_login_reload_build', data.buildId); } catch { /* sem armazenamento */ }
                await flushPendingWork(5_000);
                window.location.reload();
                return;
            }
            // Com sessão: a actualização é obrigatória (todos os dispositivos na mesma versão sincronizam sem
            // alterações retidas); só espera que um formulário aberto seja guardado.
            setNewVersion(String(data.version || 'nova'));
            setOpen(true);
        } catch { /* sem rede: tenta na próxima */ }
    }, [currentBuild]);

    useEffect(() => {
        if (!currentBuild) return;
        void check();
        const timer = window.setInterval(() => void check(), WEB_CHECK_MS);
        const onVisible = () => { if (document.visibilityState === 'visible') void check(); };
        const onBack = () => void check();
        document.addEventListener('visibilitychange', onVisible);
        window.addEventListener('focus', onBack);
        window.addEventListener('online', onBack);
        // Aviso em tempo real: só um sinal para voltar a ler /version.json.
        let source: EventSource | null = null;
        try {
            source = new EventSource('/api/updates/events');
            source.onmessage = (event) => {
                const { events } = parseSseChunk(`data: ${event.data}\n\n`);
                if (events.some(item => item.type === 'update.available')) window.setTimeout(() => void check(), Math.round(Math.random() * 30_000));
            };
            // Publicar na VPS reinicia o servidor: a ligação cai e volta a abrir, sinal de que pode haver build nova.
            let opened = false;
            source.onopen = () => {
                if (opened) window.setTimeout(() => void check(), 5_000 + Math.round(Math.random() * 20_000));
                opened = true;
            };
        } catch { /* sem EventSource: fica a verificação periódica */ }
        return () => {
            window.clearInterval(timer);
            document.removeEventListener('visibilitychange', onVisible);
            window.removeEventListener('focus', onBack);
            window.removeEventListener('online', onBack);
            source?.close();
        };
    }, [check, currentBuild]);

    // «Atualizar quando terminar»: recarrega logo que o formulário aberto for fechado.
    useEffect(() => {
        if (!waiting) return;
        const timer = window.setInterval(() => { if (!hasOpenEditor()) void reload(); }, 2_000);
        return () => window.clearInterval(timer);
    }, [waiting]);

    const reload = async (force = false) => {
        if (!force && hasOpenEditor()) { setNotice(editorBlockMessage()); setWaiting(true); return; }
        setWaiting(false);
        setNotice('A enviar alterações pendentes…');
        await flushPendingWork(15_000);
        window.location.reload();
    };

    if (!newVersion) return null;
    return (
        <Dialog open={open} onOpenChange={() => undefined}>
            <DialogContent {...{ [UPDATE_DIALOG_ATTR]: '' }} className="max-w-md [&>button]:hidden" onInteractOutside={event => event.preventDefault()} onEscapeKeyDown={event => event.preventDefault()}>
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2"><Rocket className="h-6 w-6" /> Nova versão disponível</DialogTitle>
                    <DialogDescription>
                        {newVersion === __TANGO_APP_VERSION__
                            ? `Foram publicadas correcções da versão ${newVersion} da aplicação web. Basta recarregar a página.`
                            : `Foi publicada a versão ${newVersion} da aplicação web (está a usar a ${__TANGO_APP_VERSION__}). Basta recarregar a página.`}
                    </DialogDescription>
                </DialogHeader>
                <p className="text-sm text-muted-foreground">A actualização é obrigatória para todos os dispositivos ficarem na mesma versão e sincronizarem em tempo real. Os dados já guardados não se perdem; se tiver um formulário aberto, guarde-o primeiro.</p>
                {notice && <p className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">{notice}</p>}
                <DialogFooter className="gap-2">
                    {waiting ? (
                        <>
                            <Button variant="outline" className="gap-2" disabled><Loader2 className="h-4 w-4 animate-spin" /> Atualiza quando terminar</Button>
                            <Button className="gap-2" onClick={() => void reload(true)}><RefreshCw className="h-4 w-4" /> Atualizar mesmo assim</Button>
                        </>
                    ) : (
                        <Button className="gap-2" onClick={() => void reload()}><RefreshCw className="h-4 w-4" /> Atualizar agora</Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

const STATE_TEXT: Record<UpdateStatus['state'], string> = {
    idle: 'Ainda não verificou', checking: 'A verificar…', up_to_date: 'Tem a versão mais recente', available: 'Há uma versão nova',
    deferred: 'Actualização adiada', downloading: 'A descarregar', downloaded: 'Pronta a instalar', installing: 'A instalar', error: 'Falhou a última tentativa',
};

/** Definições › Sobre: versão, canal e identificador deste computador (para o marcar como equipa no Tango Master). */
export function PainelActualizacoes() {
    const api = window.electronAPI?.updates;
    const [status, setStatus] = useState<UpdateStatus | null>(null);
    const [copied, setCopied] = useState(false);
    useEffect(() => {
        if (!api) return;
        void api.getStatus().then(setStatus).catch(() => undefined);
        return api.onStatus(setStatus);
    }, [api]);
    if (!api || !status) return null;
    return (
        <div className="space-y-3 rounded-2xl border bg-background p-5">
            <h3 className="flex items-center gap-2 text-lg font-bold"><Rocket className="h-5 w-5 text-primary" /> Actualizações</h3>
            <div className="grid gap-2 text-sm md:grid-cols-2">
                <p>Versão instalada: <b>{status.currentVersion}</b></p>
                <p>Estado: <b>{STATE_TEXT[status.state]}</b>{status.release && status.state !== 'up_to_date' ? ` (${status.release.version})` : ''}</p>
                <p>Canal: <b>{status.channel === 'internal' ? 'Equipa de desenvolvimento' : status.channel === 'stable' ? 'Todas as empresas' : '—'}</b></p>
                <p>Última verificação: <b>{status.lastCheckAt ? new Date(status.lastCheckAt).toLocaleString('pt-AO') : '—'}</b></p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                Identificador deste computador: <code className="rounded bg-muted px-2 py-1 font-mono">{status.deviceId}</code>
                <Button size="sm" variant="ghost" onClick={() => { void navigator.clipboard?.writeText(status.deviceId).then(() => setCopied(true)); }}>{copied ? 'Copiado' : 'Copiar'}</Button>
            </div>
            <Button variant="outline" className="gap-2" disabled={status.state === 'checking' || status.state === 'downloading' || status.state === 'installing'} onClick={() => void api.check()}>
                {status.state === 'checking' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Verificar agora
            </Button>
            {status.release && ['available', 'deferred', 'downloading', 'downloaded', 'error'].includes(status.state) && (
                <Button className="ml-2 gap-2" onClick={() => window.dispatchEvent(new Event(OPEN_UPDATE_EVENT))}>
                    <Rocket className="h-4 w-4" /> Ver actualização {status.release.version}
                </Button>
            )}
        </div>
    );
}

/** Aviso de versão nova: modal do actualizador no desktop, recarregar controlado na web. */
export function AvisoActualizacao() {
    return window.electronAPI ? <AvisoDesktop /> : <AvisoWeb />;
}
