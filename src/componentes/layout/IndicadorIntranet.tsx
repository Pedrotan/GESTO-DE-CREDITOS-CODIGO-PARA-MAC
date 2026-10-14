import { Network, Unplug } from 'lucide-react';
import { cn } from '@/bibliotecas/utils';
import { useData } from '@/contextos/ContextoDados';
import { remoteServerAddress } from '@/bibliotecas/adaptador-bd-remoto';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/componentes/ui/hover-card';
import { licenseAllowsIntranet, useIntranetClientStatus, useLicenseInfo } from '@/ganchos/usar-estado-rede';

/**
 * Ícone da rede local (intranet), ao lado do da Internet. Só aparece quando a licença permite que outros
 * computadores se liguem a este pela rede local (escalão empresarial ou módulo «intranet» no plano).
 * Mostra se este computador é o servidor ou um posto cliente e se a ligação à rede local está activa;
 * ao passar o rato: postos ligados e endereço do servidor.
 */
export function IndicadorIntranet() {
    const { serverInfo, connectedClients, dbAdapterMode, companySettings } = useData() as any;
    const license = useLicenseInfo(companySettings?.licenseKey);
    const isServer = Boolean(serverInfo?.isRunning);
    const isClient = !isServer && dbAdapterMode === 'remote';
    const clientState = useIntranetClientStatus(isClient);
    if (!licenseAllowsIntranet(license)) return null;

    const posts = Array.isArray(connectedClients) ? connectedClients.filter((item: any) => item?.status !== 'offline') : [];
    const serverAddress = isServer
        ? `${serverInfo.ip || serverInfo.ips?.[0] || serverInfo.hostname}:${serverInfo.port}`
        : isClient ? remoteServerAddress().replace(/^https?:\/\//, '') : '';
    const connected = isServer || (isClient && clientState === 'connected');
    const role = isServer ? 'Servidor' : isClient ? 'Posto cliente' : 'Rede local desligada';
    const stateLabel = isServer ? `Servidor activo · ${posts.length} posto${posts.length === 1 ? '' : 's'}`
        : isClient ? (clientState === 'connected' ? 'Ligado ao servidor' : clientState === 'checking' ? 'A verificar…' : 'Sem ligação ao servidor')
            : 'Não configurada';

    return (
        <HoverCard openDelay={150}>
            <HoverCardTrigger asChild>
                <div
                    tabIndex={0}
                    aria-label={`Intranet: ${role} — ${stateLabel}`}
                    className={cn(
                        'flex cursor-default flex-col items-center gap-1 rounded-xl border-2 px-2 py-2 transition-all duration-300 2xl:px-3',
                        connected
                            ? 'border-indigo-300 bg-indigo-50 text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950/30 dark:text-indigo-300'
                            : isClient
                                ? 'animate-pulse border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-400'
                                : 'border-slate-200 bg-slate-50 text-slate-400 dark:border-slate-800 dark:bg-slate-900/30 dark:text-slate-500',
                    )}
                >
                    {connected ? <Network className="h-5 w-5 2xl:h-6 2xl:w-6" /> : <Unplug className="h-5 w-5 2xl:h-6 2xl:w-6" />}
                    <span className="hidden whitespace-nowrap text-[10px] font-semibold 2xl:inline">
                        {isServer ? `Intranet · Servidor (${posts.length})` : isClient ? `Intranet · ${clientState === 'connected' ? 'Posto' : 'Offline'}` : 'Intranet'}
                    </span>
                </div>
            </HoverCardTrigger>
            <HoverCardContent align="end" className="w-72 text-sm">
                <p className="font-bold">Rede local (intranet)</p>
                <dl className="mt-2 space-y-1 text-xs">
                    <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Este computador</dt><dd className="font-semibold">{role}</dd></div>
                    <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Estado</dt><dd className={cn('font-semibold', connected ? 'text-emerald-600' : 'text-red-600')}>{stateLabel}</dd></div>
                    {serverAddress && <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Servidor</dt><dd className="font-mono">{serverAddress}</dd></div>}
                    {isServer && <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Postos ligados</dt><dd className="font-semibold">{posts.length}</dd></div>}
                </dl>
                {isServer && posts.length > 0 && (
                    <ul className="mt-2 max-h-32 space-y-0.5 overflow-y-auto border-t pt-2 text-xs">
                        {posts.map((item: any, index: number) => <li key={item.id || item.ip || index} className="flex justify-between gap-2"><span className="truncate">{item.name || item.hostname || 'Posto'}</span><span className="font-mono text-muted-foreground">{item.ip}</span></li>)}
                    </ul>
                )}
                {!isServer && !isClient && <p className="mt-2 text-xs text-muted-foreground">Configure o servidor ou o posto cliente em Definições › Sincronização com a Nuvem / Rede Local. Os computadores da mesma rede trabalham juntos mesmo sem Internet.</p>}
            </HoverCardContent>
        </HoverCard>
    );
}
