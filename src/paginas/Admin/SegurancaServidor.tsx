import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCheck, Loader2, RefreshCw, ShieldAlert, ShieldCheck } from 'lucide-react';
import { Button } from '@/componentes/ui/button';
import { Badge } from '@/componentes/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/componentes/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/componentes/ui/table';

// Painel Master › Segurança: tentativas de intrusão contra a API na nuvem (chave mestra errada, códigos
// de acesso errados, força bruta, sites não autorizados, excesso de pedidos) e contra este computador.

const URL_KEY = 'tango_master_cloud_url';
const SECRET_KEY = 'tango_master_cloud_secret';
const DEFAULT_URL = 'https://tangogestaoecreditos.tech';

type ServerEvent = {
    id: string; created_at: string; last_seen: string; type: string; severity: string; title: string; details: string;
    ip: string | null; path: string | null; subject: string | null; count: number; acknowledged: boolean;
};

const SEVERITY: Record<string, { label: string; className: string }> = {
    critical: { label: 'Crítico', className: 'border-red-600 bg-red-600 text-white' },
    high: { label: 'Alto', className: 'border-red-200 bg-red-100 text-red-700' },
    medium: { label: 'Médio', className: 'border-amber-200 bg-amber-100 text-amber-700' },
    low: { label: 'Baixo', className: 'border-slate-200 bg-slate-100 text-slate-600' },
};

const callTenants = async (action: string) => {
    let base = (localStorage.getItem(URL_KEY) || DEFAULT_URL).trim().replace(/\/+$/, '');
    if (base.includes('vercel.app')) base = DEFAULT_URL;
    const secret = (localStorage.getItem(SECRET_KEY) || 'TangoMaster#2026!ChaveForteHostinger').trim();
    if (!secret) throw new Error('Configure a Chave Mestra em "Empresas Cloud" para ver os alertas do servidor.');
    const headerSafe = /^[\x20-\x7e]*$/.test(secret);
    const response = await fetch(`${base}/api/tenants`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(headerSafe ? { Authorization: `Bearer ${secret}` } : {}) },
        body: JSON.stringify({ action, masterSecret: secret }),
        signal: AbortSignal.timeout(20_000),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.success) throw new Error(data.message || `Erro do servidor (${response.status}).`);
    return data;
};

const when = (value: string | null) => value ? new Date(value).toLocaleString('pt-AO', { dateStyle: 'short', timeStyle: 'medium' }) : '—';

export default function SegurancaServidor() {
    const [events, setEvents] = useState<ServerEvent[]>([]);
    const [localEvents, setLocalEvents] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const load = useCallback(async () => {
        setLoading(true); setError('');
        try {
            const data = await callTenants('security-events');
            setEvents(data.events || []);
        } catch (failure: any) { setError(failure?.message || 'Não foi possível obter os alertas do servidor.'); }
        try {
            const api = (window as any).electronAPI;
            if (typeof api?.securityEventsList === 'function') setLocalEvents(await api.securityEventsList());
        } catch { /* sessão Master expirada: os eventos locais ficam por mostrar */ }
        finally { setLoading(false); }
    }, []);

    useEffect(() => { void load(); }, [load]);
    useEffect(() => {
        const api = (window as any).electronAPI;
        if (typeof api?.onSecurityAlert !== 'function') return;
        return api.onSecurityAlert((alert: any) => setLocalEvents(prev => [alert, ...prev]));
    }, []);

    const acknowledge = async () => {
        try {
            await callTenants('security-events-ack');
            const api = (window as any).electronAPI;
            if (typeof api?.securityEventsAck === 'function') await api.securityEventsAck().catch(() => undefined);
            await load();
        } catch (failure: any) { setError(failure?.message || 'Não foi possível marcar os alertas.'); }
    };

    const open = useMemo(() => events.filter(event => !event.acknowledged), [events]);
    const grave = open.filter(event => event.severity === 'high' || event.severity === 'critical').length;

    const table = (rows: Array<{ id: string; time: string; severity: string; title: string; details: string; origin: string; count: number; seen: boolean }>, empty: string) => (
        <div className="overflow-x-auto rounded-xl border">
            <Table>
                <TableHeader>
                    <TableRow className="bg-slate-50 dark:bg-slate-900">
                        <TableHead>Última ocorrência</TableHead><TableHead>Gravidade</TableHead><TableHead>Evento</TableHead>
                        <TableHead>Origem</TableHead><TableHead className="text-center">Vezes</TableHead><TableHead className="text-center">Estado</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {rows.length === 0 ? (
                        <TableRow><TableCell colSpan={6} className="py-10 text-center text-sm text-slate-500">{empty}</TableCell></TableRow>
                    ) : rows.map(row => (
                        <TableRow key={row.id} className={!row.seen && (row.severity === 'high' || row.severity === 'critical') ? 'bg-red-50 dark:bg-red-950/20' : ''}>
                            <TableCell className="whitespace-nowrap text-xs">{when(row.time)}</TableCell>
                            <TableCell><Badge variant="outline" className={SEVERITY[row.severity]?.className}>{SEVERITY[row.severity]?.label || row.severity}</Badge></TableCell>
                            <TableCell className="max-w-xl"><p className="font-semibold">{row.title}</p><p className="text-xs text-slate-500">{row.details}</p></TableCell>
                            <TableCell className="text-xs text-slate-500">{row.origin}</TableCell>
                            <TableCell className="text-center font-mono text-xs">{row.count}</TableCell>
                            <TableCell className="text-center">{row.seen ? <Badge variant="outline">Visto</Badge> : <Badge className="bg-red-600 text-white hover:bg-red-600">Novo</Badge>}</TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    );

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                    <h2 className="flex items-center gap-2 text-2xl font-black"><ShieldAlert className="h-6 w-6 text-red-600" /> Segurança</h2>
                    <p className="text-sm text-slate-500">Tentativas de intrusão detectadas na nuvem e neste computador. Os ataques repetidos são bloqueados automaticamente.</p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" className="gap-2" disabled={loading} onClick={() => void load()}>{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Actualizar</Button>
                    <Button className="gap-2" disabled={!open.length} onClick={() => void acknowledge()}><CheckCheck className="h-4 w-4" /> Marcar como vistos</Button>
                </div>
            </div>
            {error && <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">{error}</div>}
            <div className="grid gap-4 md:grid-cols-3">
                <Card className={grave ? 'border-red-300' : ''}><CardContent className="p-5"><p className="text-sm text-slate-500">Alertas graves por ver</p><p className={`text-3xl font-black ${grave ? 'text-red-600' : ''}`}>{grave}</p></CardContent></Card>
                <Card><CardContent className="p-5"><p className="text-sm text-slate-500">Eventos no servidor (últimos 300)</p><p className="text-3xl font-black">{events.length}</p></CardContent></Card>
                <Card><CardContent className="flex items-center gap-3 p-5"><ShieldCheck className="h-8 w-8 text-emerald-600" /><div><p className="font-bold">Bloqueio automático activo</p><p className="text-xs text-slate-500">Chave mestra: 5 falhas bloqueiam o IP 1 hora. Códigos de empresa: 8 falhas bloqueiam o NIF 15 min.</p></div></CardContent></Card>
            </div>
            <Card>
                <CardHeader><CardTitle>Servidor na nuvem (API)</CardTitle><CardDescription>Chaves erradas, força bruta, sites não autorizados e excesso de pedidos contra a API.</CardDescription></CardHeader>
                <CardContent>{table(events.map(event => ({ id: event.id, time: event.last_seen, severity: event.severity, title: event.title, details: event.details, origin: [event.ip, event.path].filter(Boolean).join(' · ') || '—', count: event.count, seen: event.acknowledged })), 'Nenhuma tentativa registada no servidor.')}</CardContent>
            </Card>
            <Card>
                <CardHeader><CardTitle>Este computador (Tango Master)</CardTitle><CardDescription>Pedidos bloqueados pelo processo principal da aplicação.</CardDescription></CardHeader>
                <CardContent>{table(localEvents.map((event: any) => ({ id: event.id, time: event.timestamp, severity: event.severity, title: event.title, details: event.details, origin: event.ip || event.source || '—', count: event.count || 1, seen: !!event.acknowledged })), 'Nenhuma tentativa registada neste computador.')}</CardContent>
            </Card>
        </div>
    );
}
