import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCheck, CheckCircle2, Loader2, RefreshCw, Search, ShieldAlert, ShieldCheck, ShieldX, XCircle } from 'lucide-react';
import { MainLayout } from '@/componentes/layout/MainLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/componentes/ui/card';
import { Button } from '@/componentes/ui/button';
import { Badge } from '@/componentes/ui/badge';
import { Input } from '@/componentes/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/componentes/ui/select';
import { BotoesExportar, TabelaPaginada, type Coluna } from '@/componentes/contabilidade/comum';
import { useToast } from '@/componentes/ui/use-toast';
import { formatDateTime } from '@/bibliotecas/formatters';
import { cn } from '@/bibliotecas/utils';
import type { SecurityAlert } from '@/bibliotecas/seguranca';

type StoredEvent = SecurityAlert & { channel?: string | null; acknowledged?: number | boolean; acknowledgedBy?: string | null };
type Protection = { label: string; ok: boolean; detail: string };

const SEVERITY: Record<string, { label: string; className: string; rank: number }> = {
    critical: { label: 'Crítico', className: 'border-red-600 bg-red-600 text-white', rank: 3 },
    high: { label: 'Alto', className: 'border-red-200 bg-red-100 text-red-700 dark:border-red-900 dark:bg-red-950/60 dark:text-red-300', rank: 2 },
    medium: { label: 'Médio', className: 'border-amber-200 bg-amber-100 text-amber-700 dark:border-amber-900 dark:bg-amber-950/60 dark:text-amber-300', rank: 1 },
    low: { label: 'Baixo', className: 'border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300', rank: 0 },
};

/** Protecções verificáveis no navegador (versão web). */
const webProtections = (): Protection[] => {
    const meta = document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute('content') || '';
    let framed = true;
    try { framed = window.top !== window.self; } catch { framed = true; }
    return [
        { label: 'Ligação cifrada (HTTPS)', ok: window.isSecureContext, detail: window.isSecureContext ? 'Todo o tráfego é cifrado.' : 'A página não está numa ligação segura.' },
        { label: 'Política de conteúdo (CSP)', ok: /script-src 'self'/.test(meta), detail: 'Só é executado código da própria aplicação; scripts externos são recusados.' },
        { label: 'Protecção contra incorporação', ok: !framed, detail: framed ? 'A aplicação está dentro de outra página!' : 'A aplicação não pode ser aberta dentro de outro site.' },
        { label: 'Alertas do servidor', ok: true, detail: 'Tentativas contra a API (chaves erradas, força bruta, sites não autorizados) ficam no Painel Master › Segurança.' },
    ];
};

/** Centro de Segurança: estado das protecções e histórico de tentativas de intrusão. */
export default function CentroSeguranca() {
    const api = (window as any).electronAPI;
    const desktop = typeof api?.securityEventsList === 'function';
    const { toast } = useToast();
    const [events, setEvents] = useState<StoredEvent[]>([]);
    const [protections, setProtections] = useState<Protection[]>([]);
    const [loading, setLoading] = useState(false);
    const [severity, setSeverity] = useState('all');
    const [query, setQuery] = useState('');

    const load = useCallback(async () => {
        setLoading(true);
        try {
            if (desktop) {
                const [list, status] = await Promise.all([api.securityEventsList(), api.securityStatus()]);
                setEvents(Array.isArray(list) ? list : []);
                setProtections([
                    { label: 'Isolamento da interface (sandbox)', ok: !!status?.sandbox, detail: status?.sandbox ? 'A interface corre num processo isolado, sem acesso directo ao computador.' : (status?.sandboxFallbackReason ? `Desactivado neste computador: ${status.sandboxFallbackReason} Para o reactivar, desactive a protecção de "hooks" do antivírus para esta aplicação ou adicione-a às excepções.` : 'Desactivado em modo de desenvolvimento.') },
                    { label: 'Isolamento de contexto', ok: !!status?.contextIsolation && !status?.nodeIntegration, detail: 'O código da página não consegue usar funções internas do sistema.' },
                    { label: 'Origens de confiança', ok: !!status?.trustedOriginsOnly, detail: 'Só as páginas da própria aplicação podem pedir dados; ficheiros externos são recusados.' },
                    { label: 'Ferramentas de programador bloqueadas', ok: !!status?.devToolsBlocked || !status?.packaged, detail: status?.packaged ? 'Não é possível inspeccionar ou alterar a aplicação instalada.' : 'Modo de desenvolvimento.' },
                    { label: 'Política de conteúdo (CSP)', ok: !!status?.contentSecurityPolicy, detail: 'Scripts externos e incorporação noutras páginas são recusados.' },
                    { label: 'Comandos de base de dados autorizados', ok: true, detail: 'Cada alteração é validada contra uma lista fechada de operações do sistema.' },
                    { label: 'Protecção da rede local', ok: !!status?.lanBruteForceProtection, detail: status?.lanServerRunning ? 'Servidor activo: 5 chaves erradas bloqueiam o endereço durante 30 minutos.' : 'Servidor de rede local desligado.' },
                    { label: 'Segredos cifrados pelo sistema', ok: !!status?.encryptedSecrets, detail: 'Códigos 2FA e chaves de recuperação ficam cifrados pelo Windows.' },
                ]);
            } else {
                setProtections(webProtections());
            }
        } catch (error: any) {
            toast({ title: 'Não foi possível carregar a segurança', description: error?.message, variant: 'destructive' });
        } finally { setLoading(false); }
    }, [api, desktop, toast]);

    useEffect(() => { void load(); }, [load]);
    useEffect(() => {
        if (typeof api?.onSecurityAlert !== 'function') return;
        return api.onSecurityAlert((alert: SecurityAlert) => setEvents(prev => [alert, ...prev.filter(item => item.id !== alert.id)]));
    }, [api]);

    const acknowledge = async () => {
        try {
            await api.securityEventsAck();
            toast({ title: 'Alertas marcados como vistos' });
            await load();
        } catch (error: any) {
            toast({ title: 'Não foi possível actualizar', description: error?.message, variant: 'destructive' });
        }
    };

    const filtered = useMemo(() => {
        const term = query.trim().toLowerCase();
        return events.filter(event => (severity === 'all' || event.severity === severity)
            && (!term || [event.title, event.details, event.ip, event.type].some(value => String(value || '').toLowerCase().includes(term))));
    }, [events, severity, query]);

    const open = events.filter(event => !event.acknowledged);
    const openGrave = open.filter(event => event.severity === 'high' || event.severity === 'critical').length;
    const protectionsOk = protections.every(item => item.ok);

    const columns: Coluna<StoredEvent>[] = [
        { key: 'when', header: 'Data / hora', render: row => <span className="whitespace-nowrap text-xs">{formatDateTime(row.timestamp)}</span> },
        { key: 'severity', header: 'Gravidade', render: row => <Badge variant="outline" className={SEVERITY[row.severity]?.className}>{SEVERITY[row.severity]?.label || row.severity}</Badge> },
        {
            key: 'event', header: 'Evento', render: row => (
                <div className="max-w-xl">
                    <p className="font-semibold">{row.title}</p>
                    <p className="text-xs text-muted-foreground">{row.details}</p>
                </div>
            ),
        },
        { key: 'origin', header: 'Origem', render: row => <span className="text-xs text-muted-foreground">{row.ip || row.source || '—'}</span> },
        { key: 'count', header: 'Ocorrências', align: 'center', render: row => <span className="font-mono text-xs">{row.count || 1}</span> },
        { key: 'state', header: 'Estado', align: 'center', render: row => row.acknowledged ? <Badge variant="outline">Visto</Badge> : <Badge className="bg-red-600 text-white hover:bg-red-600">Novo</Badge> },
    ];

    return (
        <MainLayout title="Centro de Segurança" subtitle="Protecções activas e tentativas de intrusão detectadas">
            <div className="space-y-6">
                <div className="grid gap-4 md:grid-cols-3">
                    <div className={cn('rounded-2xl border p-5', protectionsOk ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-red-500/30 bg-red-500/5')}>
                        <div className="flex items-center gap-3">
                            {protectionsOk ? <ShieldCheck className="h-9 w-9 text-emerald-600" /> : <ShieldX className="h-9 w-9 text-red-600" />}
                            <div>
                                <p className="text-sm text-muted-foreground">Protecções</p>
                                <p className="text-2xl font-black">{protections.filter(item => item.ok).length}/{protections.length} activas</p>
                            </div>
                        </div>
                    </div>
                    <div className={cn('rounded-2xl border p-5', openGrave ? 'border-red-500/30 bg-red-500/5' : 'bg-card')}>
                        <div className="flex items-center gap-3">
                            <ShieldAlert className={cn('h-9 w-9', openGrave ? 'text-red-600' : 'text-muted-foreground')} />
                            <div>
                                <p className="text-sm text-muted-foreground">Alertas graves por ver</p>
                                <p className="text-2xl font-black">{openGrave}</p>
                            </div>
                        </div>
                    </div>
                    <div className="rounded-2xl border bg-card p-5">
                        <p className="text-sm text-muted-foreground">Eventos registados</p>
                        <p className="text-2xl font-black">{events.length}</p>
                        <p className="text-xs text-muted-foreground">{open.length} por ver · {desktop ? 'neste computador' : 'na web os alertas do servidor estão no Painel Master'}</p>
                    </div>
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-emerald-600" /> Protecções do sistema</CardTitle>
                        <CardDescription>Verificadas agora, neste {desktop ? 'computador' : 'navegador'}.</CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-3 md:grid-cols-2">
                        {protections.map(item => (
                            <div key={item.label} className="flex items-start gap-3 rounded-xl border p-3">
                                {item.ok ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" /> : <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />}
                                <div>
                                    <p className="font-semibold">{item.label}</p>
                                    <p className="text-sm text-muted-foreground">{item.detail}</p>
                                </div>
                            </div>
                        ))}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="space-y-4">
                        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                            <div>
                                <CardTitle className="flex items-center gap-2"><ShieldAlert className="h-5 w-5 text-red-600" /> Tentativas de intrusão e eventos suspeitos</CardTitle>
                                <CardDescription>Pedidos de origem não autorizada, comandos bloqueados, palavras-passe e chaves erradas repetidas, ficheiros fora das pastas permitidas.</CardDescription>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                <Button variant="outline" size="sm" className="gap-2" disabled={loading} onClick={() => void load()}>
                                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Actualizar
                                </Button>
                                {desktop && <Button size="sm" className="gap-2" disabled={!open.length} onClick={() => void acknowledge()}><CheckCheck className="h-4 w-4" /> Marcar como vistos</Button>}
                                <BotoesExportar disabled={!filtered.length} build={() => ({
                                    title: 'Eventos de segurança', fileName: 'eventos-seguranca', subtitle: severity === 'all' ? 'Todas as gravidades' : `Gravidade: ${SEVERITY[severity]?.label}`,
                                    head: ['Data / hora', 'Gravidade', 'Evento', 'Detalhes', 'Origem', 'Ocorrências', 'Estado'],
                                    body: filtered.map(row => [formatDateTime(row.timestamp), SEVERITY[row.severity]?.label || row.severity, row.title, row.details, row.ip || row.source || '', row.count || 1, row.acknowledged ? 'Visto' : 'Novo']),
                                })} />
                            </div>
                        </div>
                        <div className="grid gap-3 md:grid-cols-[1fr_200px]">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                <Input className="pl-10" placeholder="Pesquisar por evento, detalhe ou endereço…" value={query} onChange={event => setQuery(event.target.value)} />
                            </div>
                            <Select value={severity} onValueChange={setSeverity}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Todas as gravidades</SelectItem>
                                    <SelectItem value="critical">Crítico</SelectItem>
                                    <SelectItem value="high">Alto</SelectItem>
                                    <SelectItem value="medium">Médio</SelectItem>
                                    <SelectItem value="low">Baixo</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <TabelaPaginada columns={columns} rows={filtered} rowKey={row => row.id} pageSize={20}
                            rowClassName={row => (!row.acknowledged && (row.severity === 'critical' || row.severity === 'high')) ? 'bg-red-500/5' : undefined}
                            empty={desktop ? 'Nenhuma tentativa de intrusão registada. O sistema está a vigiar.' : 'Na versão web, os alertas do servidor estão no Painel Master › Segurança.'} />
                    </CardContent>
                </Card>
            </div>
        </MainLayout>
    );
}
