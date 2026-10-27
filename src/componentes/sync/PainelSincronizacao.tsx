import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, Clock, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/componentes/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/componentes/ui/popover';
import { sqlite } from '@/bibliotecas/adaptador-sqlite';
import { conflictReason, entityLabel, type SyncConflict } from '@/bibliotecas/sync-conflitos';
import { getUserIdClashes, reprocessRetainedOperations, syncCloudNow, type CloudSyncStatus, type UserIdClash } from '@/servicos/ServicoSincronizacaoCloud';

const STATE_TITLE: Record<CloudSyncStatus['state'], string> = {
    synced: 'Sincronizado', pending: 'A sincronizar', syncing: 'A sincronizar', attention: 'Verificar', error: 'Sincronização com erro', idle: 'A verificar ligação',
};

/**
 * Ao clicar no ícone de sincronização: o estado real deste dispositivo (o que falta enviar, o que ficou retido, o que
 * não se lê, os conflitos por ver), os conflitos mais recentes com o motivo e o botão «Verificar agora».
 */
export function PainelSincronizacao({ status, canSeeAll, children }: { status: CloudSyncStatus; canSeeAll: boolean; children: ReactNode }) {
    const navigate = useNavigate();
    const [open, setOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const [recent, setRecent] = useState<SyncConflict[]>([]);
    const [clashes, setClashes] = useState<UserIdClash[]>([]);

    const loadRecent = useCallback(async () => {
        const rows = await sqlite.all<SyncConflict>(
            `SELECT id, entityType, entityId, operation, status, createdAt, resolutionNote, resolvedBy, resolvedAt FROM sync_conflicts WHERE status = 'pending' ORDER BY createdAt DESC LIMIT 5`,
        ).catch(() => [] as SyncConflict[]);
        setRecent(rows);
        setClashes(await getUserIdClashes().catch(() => []));
    }, []);
    useEffect(() => { if (open) void loadRecent(); }, [open, status.at, loadRecent]);

    const verifyNow = async () => {
        setBusy(true);
        try {
            await reprocessRetainedOperations(true);
            await syncCloudNow();
            await loadRecent();
        } finally {
            setBusy(false);
        }
    };

    const issues = status.issues || [];
    const attention = issues.filter(issue => issue.attention);
    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>{children}</PopoverTrigger>
            <PopoverContent align="end" className="w-[22rem] p-0">
                <div className="border-b p-4">
                    <p className="flex items-center gap-2 text-sm font-bold">
                        {status.state === 'synced' ? <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                            : status.state === 'error' || status.state === 'attention' ? <AlertTriangle className="h-4 w-4 text-orange-600" />
                                : <Clock className="h-4 w-4 text-amber-600" />}
                        {STATE_TITLE[status.state]}
                    </p>
                    {status.at && <p className="mt-1 text-xs text-muted-foreground">Última tentativa: {new Date(status.at).toLocaleString('pt-AO')}</p>}
                </div>
                <div className="max-h-[60vh] space-y-3 overflow-y-auto p-4 text-sm">
                    {status.state === 'error' && status.message && (
                        <p className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs font-semibold text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">{status.message}</p>
                    )}
                    {issues.length === 0 && status.state !== 'error' && (
                        <p className="text-xs text-muted-foreground">Nada por enviar, nada retido e nenhum conflito: este dispositivo tem tudo o que existe na nuvem.</p>
                    )}
                    {issues.map(issue => (
                        <div key={issue.kind} className={`rounded-lg border p-2.5 ${issue.attention ? 'border-orange-200 bg-orange-50/60 dark:border-orange-900 dark:bg-orange-950/20' : 'bg-muted/40'}`}>
                            <p className="text-xs font-bold">{issue.title}</p>
                            <p className="mt-0.5 text-[11px] text-muted-foreground">{issue.detail}</p>
                        </div>
                    ))}
                    {clashes.length > 0 && (
                        <div className="space-y-1.5">
                            <p className="text-[11px] font-bold uppercase text-muted-foreground">Mesma pessoa, outro ID noutro computador</p>
                            {clashes.map(clash => (
                                <div key={clash.email} className="rounded-md border p-2">
                                    <p className="text-xs font-semibold">{clash.name} <span className="font-normal text-muted-foreground">({clash.email})</span></p>
                                    <p className="font-mono text-[10px] text-muted-foreground">aqui {clash.localId.slice(0, 13)}… · noutro {clash.remoteId.slice(0, 13)}…</p>
                                </div>
                            ))}
                        </div>
                    )}
                    {recent.length > 0 && (
                        <div className="space-y-1.5">
                            <p className="text-[11px] font-bold uppercase text-muted-foreground">Conflitos mais recentes</p>
                            {recent.map(row => (
                                <div key={row.id} className="rounded-md border p-2">
                                    <p className="text-xs font-semibold">{entityLabel(row.entityType)}</p>
                                    <p className="text-[11px] text-muted-foreground">{conflictReason(row) || 'Sem motivo registado.'}</p>
                                </div>
                            ))}
                        </div>
                    )}
                    {attention.length > 0 && !canSeeAll && (
                        <p className="text-[11px] text-muted-foreground">A lista completa está nas Configurações, para o Super Administrador.</p>
                    )}
                </div>
                <div className="flex flex-wrap justify-end gap-2 border-t p-3">
                    {canSeeAll && attention.length > 0 && (
                        <Button variant="outline" size="sm" onClick={() => { setOpen(false); navigate('/definicoes?tab=conflicts'); }}>Ver todos</Button>
                    )}
                    <Button size="sm" className="gap-1.5" disabled={busy || status.state === 'syncing'} onClick={() => void verifyNow()}>
                        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Verificar agora
                    </Button>
                </div>
            </PopoverContent>
        </Popover>
    );
}
