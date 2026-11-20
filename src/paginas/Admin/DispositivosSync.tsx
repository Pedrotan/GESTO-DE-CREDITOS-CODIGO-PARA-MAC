import { useEffect, useState } from 'react';
import { Loader2, MonitorSmartphone, RefreshCw } from 'lucide-react';
import { Button } from '@/componentes/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/componentes/ui/dialog';

export type SyncDevice = {
    deviceId: string; platform: 'desktop' | 'web' | null; appVersion: string | null; userAgent: string | null;
    firstSeenAt: string; lastSeenAt: string; lastSyncAt: string | null; lastCursor: number | null;
    pending: number | null; oversized: number | null; waiting: number | null; unreadable: number | null; conflicts: number | null; otherVersion: number | null;
    rejected413: number; last413At: string | null; lastError: string | null; lastErrorAt: string | null; clockSkewMs: number | null;
    userClashes: number | null; users: number; balanceMismatches: number | null;
    integrityAt: string | null; integrityMissing: string[] | null; integrityContent: string[] | null;
};
/** O mesmo utilizador (hash do email) com IDs diferentes entre dispositivos. */
export type UserIdDivergence = { userHash: string; ids: Array<{ id: string; deviceIds: string[] }> };

const when = (value: string | null) => (value ? new Date(value).toLocaleString('pt-AO') : '—');
const ago = (value: string | null, now: number) => {
    if (!value) return 'nunca';
    const minutes = Math.round((now - Date.parse(value)) / 60_000);
    if (minutes < 1) return 'agora';
    if (minutes < 60) return `há ${minutes} min`;
    const hours = Math.round(minutes / 60);
    return hours < 48 ? `há ${hours} h` : `há ${Math.round(hours / 24)} dias`;
};
const skew = (ms: number | null) => {
    if (ms === null) return '—';
    const seconds = Math.round(ms / 1000);
    if (Math.abs(seconds) < 60) return 'certo';
    const minutes = Math.round(Math.abs(seconds) / 60);
    return `${minutes} min ${seconds > 0 ? 'adiantado' : 'atrasado'}`;
};
const compareVersions = (a: string, b: string) => {
    const pa = a.split('.').map(Number); const pb = b.split('.').map(Number);
    for (let index = 0; index < Math.max(pa.length, pb.length); index++) {
        const diff = (pa[index] || 0) - (pb[index] || 0);
        if (diff) return diff;
    }
    return 0;
};

/**
 * Tango Master › empresa › «Dispositivos»: para cada computador e navegador, a versão real da app, a última
 * sincronização, o cursor, o que está por enviar ou retido, ilegíveis, recusas 413, o último erro e o relógio.
 */
export function DispositivosSync({ tenant, onClose, load }: {
    tenant: { tenantId: string; name: string } | null;
    onClose: () => void;
    load: (tenantId: string) => Promise<{ devices: SyncDevice[]; serverTime: string; userIdDivergences?: UserIdDivergence[] }>;
}) {
    const [devices, setDevices] = useState<SyncDevice[]>([]);
    const [divergences, setDivergences] = useState<UserIdDivergence[]>([]);
    const [serverTime, setServerTime] = useState(Date.now());
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const refresh = async () => {
        if (!tenant) return;
        setBusy(true); setError('');
        try {
            const data = await load(tenant.tenantId);
            setDevices(data.devices || []);
            setDivergences(data.userIdDivergences || []);
            setServerTime(Date.parse(data.serverTime) || Date.now());
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'Não foi possível ler os dispositivos.');
        } finally {
            setBusy(false);
        }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => { if (tenant) void refresh(); else setDevices([]); }, [tenant?.tenantId]);

    const newest = devices.map(device => device.appVersion).filter((value): value is string => !!value && /^\d+(\.\d+)*$/.test(value))
        .sort(compareVersions).at(-1);
    const bad = 'font-bold text-red-600';
    return (
        <Dialog open={!!tenant} onOpenChange={open => { if (!open) onClose(); }}>
            <DialogContent className="max-w-6xl max-h-[92vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2"><MonitorSmartphone className="h-5 w-5" /> Dispositivos de {tenant?.name}</DialogTitle>
                    <DialogDescription>
                        Estado da sincronização de cada computador e navegador da empresa, enviado em cada sincronização. Só números e o último erro: os dados da empresa continuam cifrados.
                    </DialogDescription>
                </DialogHeader>
                <div className="flex justify-end">
                    <Button variant="outline" size="sm" className="gap-1.5" disabled={busy} onClick={() => void refresh()}>
                        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Actualizar
                    </Button>
                </div>
                {error && <p className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-sm text-red-700">{error}</p>}
                {!busy && !error && devices.length === 0 && (
                    <p className="text-sm text-muted-foreground">Ainda nenhum dispositivo enviou diagnóstico (só a partir desta versão do servidor e dos programas).</p>
                )}
                {devices.length > 0 && (
                    <div className="overflow-x-auto rounded-xl border">
                        <table className="w-full text-xs">
                            <thead className="bg-muted/60 text-left">
                                <tr>{['Dispositivo', 'Versão', 'Última sincronização', 'Cursor', 'Por enviar', 'Grandes demais', 'Conflitos', 'Outra versão', 'Ilegíveis', 'IDs diferentes', 'Saldos ≠ prestações', 'Integridade', 'Recusas 413', 'Relógio', 'Último erro'].map(head => <th key={head} className="whitespace-nowrap px-2 py-2 font-bold">{head}</th>)}</tr>
                            </thead>
                            <tbody>
                                {devices.map(device => {
                                    const stale = !device.lastSyncAt || serverTime - Date.parse(device.lastSyncAt) > 60 * 60_000;
                                    const oldVersion = !!newest && !!device.appVersion && compareVersions(device.appVersion, newest) < 0;
                                    const clockOff = device.clockSkewMs !== null && Math.abs(device.clockSkewMs) > 2 * 60_000;
                                    return (
                                        <tr key={device.deviceId} className="border-t align-top">
                                            <td className="px-2 py-2">
                                                <p className="font-semibold">{device.platform === 'desktop' ? 'Computador' : device.platform === 'web' ? 'Navegador' : '—'}</p>
                                                <p className="font-mono text-[10px] text-muted-foreground" title={device.userAgent || ''}>{device.deviceId.slice(0, 12)}…</p>
                                                <p className="text-[10px] text-muted-foreground">visto {ago(device.lastSeenAt, serverTime)}</p>
                                            </td>
                                            <td className={`px-2 py-2 ${oldVersion ? bad : ''}`} title={oldVersion ? `Mais recente em uso: ${newest}` : undefined}>{device.appVersion || '—'}</td>
                                            <td className={`whitespace-nowrap px-2 py-2 ${stale ? bad : ''}`} title={when(device.lastSyncAt)}>{ago(device.lastSyncAt, serverTime)}</td>
                                            <td className="px-2 py-2 font-mono">{device.lastCursor ?? '—'}</td>
                                            <td className="px-2 py-2">{device.pending ?? '—'}</td>
                                            <td className={`px-2 py-2 ${device.oversized ? bad : ''}`}>{device.oversized ?? '—'}</td>
                                            <td className={`px-2 py-2 ${device.conflicts ? bad : ''}`}>{device.conflicts ?? '—'}</td>
                                            <td className={`px-2 py-2 ${device.otherVersion ? bad : ''}`}>{device.otherVersion ?? '—'}</td>
                                            <td className={`px-2 py-2 ${device.unreadable ? bad : ''}`}>{device.unreadable ?? '—'}</td>
                                            <td className={`px-2 py-2 ${device.userClashes ? bad : ''}`} title={`${device.users} utilizador(es) neste dispositivo`}>{device.userClashes ?? '—'}</td>
                                            <td className={`px-2 py-2 ${device.balanceMismatches ? bad : ''}`} title="Créditos cujo total gravado não é a soma das prestações neste dispositivo">{device.balanceMismatches ?? '—'}</td>
                                            <td className={`max-w-[12rem] px-2 py-2 text-[11px] ${device.integrityMissing?.length ? bad : ''}`} title={device.integrityAt ? `Último resumo: ${when(device.integrityAt)}` : 'Ainda sem resumo'}>
                                                {!device.integrityMissing ? '—' : device.integrityMissing.length === 0 && !device.integrityContent?.length ? 'igual'
                                                    : [device.integrityMissing.length ? `registos diferentes: ${device.integrityMissing.join(', ')}` : '', device.integrityContent?.length ? `conteúdo: ${device.integrityContent.join(', ')}` : ''].filter(Boolean).join(' · ')}
                                            </td>
                                            <td className={`px-2 py-2 ${device.rejected413 ? bad : ''}`} title={device.last413At ? `Última: ${when(device.last413At)}` : undefined}>{device.rejected413}</td>
                                            <td className={`whitespace-nowrap px-2 py-2 ${clockOff ? bad : ''}`}>{skew(device.clockSkewMs)}</td>
                                            <td className="max-w-[16rem] px-2 py-2 text-[11px]">{device.lastError ? <><p>{device.lastError}</p><p className="text-muted-foreground">{when(device.lastErrorAt)}</p></> : '—'}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
                {divergences.length > 0 && (
                    <div className="space-y-2 rounded-xl border border-red-200 bg-red-50/60 p-3 dark:border-red-900 dark:bg-red-950/20">
                        <p className="text-sm font-bold text-red-700 dark:text-red-300">{divergences.length} utilizador(es) com IDs diferentes entre dispositivos</p>
                        <p className="text-xs text-muted-foreground">
                            A mesma pessoa (mesmo email) foi criada em separado. As mensagens do chat e o histórico de um ID não aparecem a quem entra com o outro.
                            O nome aparece no ícone de sincronização de cada um destes dispositivos (aqui só se vê o hash do email).
                        </p>
                        {divergences.map(item => (
                            <div key={item.userHash} className="rounded-lg border bg-background p-2 text-xs">
                                <p className="font-mono font-semibold">Utilizador #{item.userHash.slice(0, 10)}</p>
                                {item.ids.map(entry => (
                                    <p key={entry.id} className="mt-0.5">
                                        ID <span className="font-mono">{entry.id.slice(0, 13)}…</span> em {entry.deviceIds.map(deviceId => {
                                            const device = devices.find(candidate => candidate.deviceId === deviceId);
                                            return `${device?.platform === 'desktop' ? 'Computador' : device?.platform === 'web' ? 'Navegador' : 'Dispositivo'} ${deviceId.slice(0, 8)}`;
                                        }).join(', ')}
                                    </p>
                                ))}
                            </div>
                        ))}
                    </div>
                )}
                <p className="text-[11px] text-muted-foreground">
                    A vermelho: versão mais antiga do que a mais recente em uso, sem sincronizar há mais de 1 hora, relógio com mais de 2 minutos de diferença, ou alterações retidas, ilegíveis, grandes demais e recusas.
                </p>
            </DialogContent>
        </Dialog>
    );
}
