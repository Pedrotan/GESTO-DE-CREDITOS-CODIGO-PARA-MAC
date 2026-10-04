import { useEffect, useState } from 'react';
import { Cloud, CloudOff, KeyRound, Loader2, ShieldCheck } from 'lucide-react';
import { Button } from '@/componentes/ui/button';
import { Input } from '@/componentes/ui/input';
import { Label } from '@/componentes/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/componentes/ui/dialog';
import { useAuth } from '@/contextos/ContextoAutenticacao';
import { useData } from '@/contextos/ContextoDados';
import { useToast } from '@/ganchos/usar-toast';
import { isCloudSyncUrl, type CloudSyncStatus } from '@/servicos/ServicoSincronizacaoCloud';
import { cleanCompanyNif, getCloudBaseUrl, fetchCloudCompanyStatus, verifyCloudCompany } from '@/servicos/ServicoLigacaoNuvem';

// App de computador: usa o NIF da empresa para a encontrar na nuvem (versão web) e, depois de confirmado
// o Código de Acesso uma única vez, passa a sincronizar automaticamente nos dois sentidos.

export const OPEN_CLOUD_LINK_EVENT = 'tango-open-cloud-link';
// "Agora não" só adia a janela automática; a faixa no topo continua visível até o computador ser ligado.
const POSTPONE_KEY = 'tango_cloud_link_postponed_until';
const POSTPONE_MS = 4 * 60 * 60 * 1000;

const canLink = (role?: string) => role === 'super_admin' || role === 'admin';

// A sincronização arranca quando as novas definições chegam ao ContextoDados; espera pela primeira ronda.
const waitForFirstSync = (timeoutMs = 90_000) => new Promise<CloudSyncStatus | null>(resolve => {
    const timer = setTimeout(() => { window.removeEventListener('tango-cloud-sync-status', handler); resolve(null); }, timeoutMs);
    function handler(event: Event) {
        const detail = (event as CustomEvent<CloudSyncStatus>).detail;
        if (!detail || !['synced', 'pending', 'error'].includes(detail.state) || detail.at === undefined) return;
        clearTimeout(timer);
        window.removeEventListener('tango-cloud-sync-status', handler);
        resolve(detail);
    }
    window.addEventListener('tango-cloud-sync-status', handler);
});

export function LigacaoNuvemDesktop() {
    const { user } = useAuth();
    const { companySettings, updateCompanySettings, dbAdapterMode } = useData();
    const { toast } = useToast();
    const [open, setOpen] = useState(false);
    const [cloudActive, setCloudActive] = useState(false);
    const [cloudName, setCloudName] = useState('');
    const [accessCode, setAccessCode] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const isDesktop = typeof window !== 'undefined' && Boolean(window.electronAPI);
    const nif = cleanCompanyNif(companySettings.nif);
    const alreadyLinked = Boolean(companySettings.syncEnabled && isCloudSyncUrl(companySettings.syncUrl));
    // Computadores ligados a um servidor da rede local recebem os dados desse servidor, não da nuvem.
    const eligible = isDesktop && !!user && dbAdapterMode !== 'remote' && nif.length >= 9;
    const isAdmin = canLink(user?.role);

    // Detecção automática: se a empresa deste NIF existe na nuvem e este computador ainda não está ligado.
    useEffect(() => {
        if (!eligible || alreadyLinked || !navigator.onLine) { setCloudActive(false); return; }
        let cancelled = false;
        void fetchCloudCompanyStatus(nif).then(result => {
            if (cancelled || result?.status !== 'active') return;
            setCloudName(result.companyName || '');
            setCloudActive(true);
            if (isAdmin && Date.now() >= Number(localStorage.getItem(POSTPONE_KEY) || 0)) setOpen(true);
        });
        return () => { cancelled = true; };
    }, [eligible, alreadyLinked, nif, isAdmin]);

    // Abertura manual (indicador "Modo Local" no cabeçalho).
    useEffect(() => {
        const handler = async () => {
            if (!isDesktop) return;
            if (!user || !canLink(user.role)) {
                toast({ title: 'Ligação à nuvem', description: 'Só um administrador pode ligar este computador à versão web.' });
                return;
            }
            if (nif.length < 9) {
                toast({ title: 'NIF em falta', description: 'Indique o NIF da empresa nas Definições para a ligar à versão web.', variant: 'destructive' });
                return;
            }
            const result = await fetchCloudCompanyStatus(nif);
            if (!result) {
                toast({ title: 'Sem ligação ao servidor', description: 'Verifique a ligação à Internet e tente novamente.', variant: 'destructive' });
                return;
            }
            if (result.status !== 'active') {
                toast({
                    title: 'Empresa não disponível na nuvem',
                    description: result.status === 'not_registered'
                        ? `O NIF ${nif} ainda não está registado no Tango Master. Peça o registo da empresa para usar a versão web.`
                        : 'O acesso desta empresa à nuvem está suspenso ou expirado. Contacte o suporte.',
                    variant: 'destructive'
                });
                return;
            }
            setCloudName(result.companyName || '');
            setOpen(true);
        };
        window.addEventListener(OPEN_CLOUD_LINK_EVENT, handler);
        return () => window.removeEventListener(OPEN_CLOUD_LINK_EVENT, handler);
    }, [isDesktop, user, nif, toast]);

    const postpone = () => {
        localStorage.setItem(POSTPONE_KEY, String(Date.now() + POSTPONE_MS));
        setOpen(false);
        setError('');
    };

    const link = async (event: React.FormEvent) => {
        event.preventDefault();
        setBusy(true);
        setError('');
        try {
            const linked = await verifyCloudCompany(nif, accessCode);
            if (cleanCompanyNif(linked.tenantId) !== nif) throw new Error('O Código de Acesso pertence a outra empresa.');
            await updateCompanySettings({
                syncEnabled: true,
                syncUrl: getCloudBaseUrl(),
                syncPasskey: linked.syncPasskey,
                syncApiKey: linked.syncPasskey,
            }, user ? { id: user.id, name: user.name } : undefined);
            const firstSync = waitForFirstSync();
            localStorage.removeItem(POSTPONE_KEY);
            setOpen(false);
            setAccessCode('');
            toast({ title: 'Computador ligado à versão web', description: 'A sincronizar os dados da empresa...' });
            const result = await firstSync;
            toast({
                title: result?.state === 'error' ? 'Ligado, mas a primeira sincronização falhou' : 'Sincronização concluída',
                description: result?.state === 'error'
                    ? `${result.message || 'Erro de sincronização.'} Vai tentar de novo automaticamente.`
                    : result
                        ? `${result.pushed || 0} alterações enviadas e ${result.pulled || 0} recebidas. A partir de agora é automática.`
                        : 'A sincronização continua em segundo plano e passa a ser automática.',
                variant: result?.state === 'error' ? 'destructive' : undefined,
            });
        } catch (err: any) {
            setError(err?.message || 'Não foi possível ligar à nuvem.');
        } finally {
            setBusy(false);
        }
    };

    if (!eligible) return null;

    return (
        <>
        {cloudActive && !alreadyLinked && (
            <div role="alert" className="flex shrink-0 flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-amber-500 px-4 py-2 text-center text-xs font-bold text-slate-950 sm:text-sm">
                <CloudOff className="h-4 w-4 shrink-0" />
                <span>
                    Este computador não está ligado à versão web da empresa: o que fizer aqui não aparece na web, nem o da web aqui.
                    {!isAdmin && ' Peça a um administrador para o ligar.'}
                </span>
                {isAdmin && (
                    <button type="button" onClick={() => setOpen(true)} className="rounded-md bg-slate-950/15 px-2.5 py-1 text-xs font-bold hover:bg-slate-950/25">
                        Ligar agora
                    </button>
                )}
            </div>
        )}
        <Dialog open={open && isAdmin} onOpenChange={value => { if (!value && !busy) { setOpen(false); setError(''); } }}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Cloud className="h-5 w-5 text-secondary" /> Ligar à versão web
                    </DialogTitle>
                    <DialogDescription>
                        A empresa <strong>{cloudName || companySettings.name}</strong> (NIF {nif}) também está registada na versão web.
                        Ligue este computador para que os dados sincronizem automaticamente nos dois sentidos.
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={link} className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="cloud-access-code" className="flex items-center gap-1.5">
                            <KeyRound className="h-4 w-4" /> Código de Acesso da empresa
                        </Label>
                        <Input
                            id="cloud-access-code"
                            value={accessCode}
                            onChange={event => setAccessCode(event.target.value.toUpperCase())}
                            placeholder="Atribuído pelo Tango Master"
                            autoComplete="off"
                            autoFocus
                            className="font-mono tracking-widest"
                        />
                        <p className="text-xs text-muted-foreground">
                            É o mesmo código usado para entrar na versão web. Só é pedido uma vez neste computador.
                        </p>
                    </div>
                    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-300">{error}</p>}
                    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                        <Button type="button" variant="outline" onClick={postpone} disabled={busy}>Agora não</Button>
                        <Button type="submit" disabled={busy || accessCode.trim().length < 4} className="gap-2 bg-primary font-bold text-primary-foreground hover:bg-primary/90">
                            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                            Ligar e sincronizar
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
        </>
    );
}
