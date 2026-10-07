import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
    Archive, ChevronDown, FileBarChart, FileSpreadsheet, FileText, Filter, Fingerprint, KeyRound, LayoutList, Loader2, Mail, Monitor, Network,
    Search, Settings2, ShieldCheck, Workflow,
} from 'lucide-react';
import { MainLayout } from '@/componentes/layout/MainLayout';
import { Button } from '@/componentes/ui/button';
import { Input } from '@/componentes/ui/input';
import { Label } from '@/componentes/ui/label';
import { Switch } from '@/componentes/ui/switch';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/componentes/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/componentes/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/componentes/ui/select';
import { useToast } from '@/componentes/ui/use-toast';
import { useData } from '@/contextos/ContextoDados';
import { cn } from '@/bibliotecas/utils';
import { luandaTodayKey } from '@/bibliotecas/fuso-angola';
import {
    ACTION_LABELS, ALERT_RULES, EMPTY_AUDIT_FILTERS, SEVERITY_LABELS, auditKpis, formatAuditTimestamp, inRange, matchesAuditFilters, periodToRange, previousRange,
    type AlertRuleId, type AuditAction, type AuditEvent, type AuditFilters, type AuditPeriod, type Severity,
} from '@/bibliotecas/auditoria-analise';
import { AUDIT_REPORTS, type AuditReportKey } from '@/bibliotecas/relatorios-auditoria';
import { ServicoAuditoriaAvancada, CLOSED_ALERT_STATUSES, type AuditConfig } from '@/servicos/ServicoAuditoriaAvancada';
import { ServicoPagamentos } from '@/servicos/ServicoPagamentos';
import { useAuditoria, integrityCard } from '@/componentes/auditoria/useAuditoria';
import { CartoesAuditoria, type AuditCard } from '@/componentes/auditoria/CartoesAuditoria';
import { GraficosAuditoria } from '@/componentes/auditoria/GraficosAuditoria';
import { FiltrosAuditoria, SeletorPeriodoAuditoria } from '@/componentes/auditoria/FiltrosAuditoria';
import { chipsOf, useSavedAuditFilters } from '@/componentes/auditoria/filtros-auditoria';
import { TabelaAuditoria } from '@/componentes/auditoria/TabelaAuditoria';
import { LinhaTempoAuditoria } from '@/componentes/auditoria/LinhaTempoAuditoria';
import { DetalheAuditoria, type InvestigationTarget } from '@/componentes/auditoria/DetalheAuditoria';
import { InvestigacaoAuditoria } from '@/componentes/auditoria/InvestigacaoAuditoria';
import { CentroAlertas } from '@/componentes/auditoria/CentroAlertas';
import { WEEKLY_AUDIT_REPORT, generateAuditReport } from '@/componentes/auditoria/gerar-relatorio-auditoria';

const DEFAULT_PERIOD: AuditPeriod = { preset: '30d', from: luandaTodayKey(), to: luandaTodayKey(), fromTime: '00:00', toTime: '23:59' };

export default function AuditLogs() {
    const { companySettings } = useData() as any;
    const { toast } = useToast();
    const [searchParams] = useSearchParams();
    const [archive, setArchive] = useState(false);
    const data = useAuditoria({ archive });
    const [period, setPeriod] = useState<AuditPeriod>(DEFAULT_PERIOD);
    const [filters, setFilters] = useState<AuditFilters>(() => ({ ...EMPTY_AUDIT_FILTERS, entity: searchParams.get('entidade') || '' }));
    const [card, setCard] = useState<AuditCard>('all');
    const [view, setView] = useState<'table' | 'timeline'>('table');
    const [showFilters, setShowFilters] = useState(false);
    const [selected, setSelected] = useState<AuditEvent | null>(null);
    const [investigation, setInvestigation] = useState<InvestigationTarget | null>(null);
    const [verifying, setVerifying] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [configOpen, setConfigOpen] = useState(false);
    const [weeklyOpen, setWeeklyOpen] = useState(false);
    const alertsRef = useRef<HTMLDivElement>(null);
    const saved = useSavedAuditFilters(data.actor.id);

    const range = useMemo(() => periodToRange(period), [period]);
    const filtered = useMemo(() => data.events.filter(event => matchesAuditFilters(event, filters)), [data.events, filters]);
    const inPeriod = useMemo(() => filtered.filter(event => inRange(event, range)), [filtered, range]);
    const previousEvents = useMemo(() => { const prev = previousRange(range); return prev ? filtered.filter(event => inRange(event, prev)) : null; }, [filtered, range]);
    const kpis = useMemo(() => auditKpis(inPeriod), [inPeriod]);
    const previousKpis = useMemo(() => previousEvents ? auditKpis(previousEvents) : null, [previousEvents]);
    const alertEventIds = useMemo(() => new Set(data.alerts.filter(alert => !CLOSED_ALERT_STATUSES.includes(alert.status)).flatMap(alert => { try { return JSON.parse(alert.eventIds || '[]'); } catch { return []; } })), [data.alerts]);
    const shown = useMemo(() => inPeriod.filter(event => card === 'all' || card === 'integrity'
        || (card === 'criticalHigh' && (event.severity === 'critical' || event.severity === 'high'))
        || (card === 'loginFailed' && event.action === 'login_failed')
        || (card === 'accessDenied' && event.action === 'access_denied')
        || (card === 'activeToday' && event.dateKey === luandaTodayKey())
        || (card === 'alerts' && alertEventIds.has(event.id))), [inPeriod, card, alertEventIds]);
    const openAlerts = data.alerts.filter(alert => !CLOSED_ALERT_STATUSES.includes(alert.status)).length;
    const integrity = integrityCard(data.integrity, data.lastClose);
    const brokenSeq = data.integrity ? data.integrity.brokenSeq : data.lastClose?.status === 'broken' ? data.lastClose.brokenSeq : null;
    const userName = (id: string) => data.users.find((user: any) => user.id === id)?.name || id;
    const filterLabels = [...chipsOf(filters, userName).map(chip => chip.label), ...(card !== 'all' && card !== 'integrity' ? [`Cartão: ${card}`] : [])];
    const responsibles = data.users.filter((user: any) => user.role === 'super_admin' || user.role === 'internal_auditor').map((user: any) => ({ id: user.id, name: user.name }));
    const roleOptions = data.users.map((user: any) => ({ id: user.id, name: user.name, role: user.role }));

    useEffect(() => { const entity = searchParams.get('entidade'); if (entity) setFilters(previous => ({ ...previous, entity })); }, [searchParams]);

    const verify = async () => {
        setVerifying(true);
        try {
            const result = await data.verifyNow();
            toast(result.ok
                ? { title: 'Cadeia de auditoria íntegra', description: `${result.checked.toLocaleString('pt-AO')} registo(s) verificados${result.hmac ? ` · ${result.hmac.detail}` : ''}.` }
                : { title: 'Falha de integridade detectada', description: `${result.message}. Foi criado um alerta crítico no Centro de Alertas.`, variant: 'destructive' });
        } catch (error) {
            toast({ title: 'Não foi possível verificar', description: error instanceof Error ? error.message : String(error), variant: 'destructive' });
        } finally { setVerifying(false); }
    };

    const exportReport = async (key: AuditReportKey, format: 'pdf' | 'xlsx') => {
        setExporting(true);
        try {
            const integrityResult = key === 'auditor-externo' ? await data.verifyNow() : data.integrity;
            const alerts = data.alerts.filter(alert => !range || (alert.occurredAt >= range.fromIso && alert.occurredAt <= range.toIso));
            await generateAuditReport({ key, format, events: key === 'eventos' ? shown : inPeriod, periodLabel: range?.label || 'Todo o histórico carregado', filters: filterLabels, alerts, integrity: integrityResult, settings: companySettings, actor: data.actor });
            toast({ title: 'Relatório gerado', description: 'A exportação ficou registada na auditoria e no histórico de relatórios.' });
            data.reload();
        } catch (error) {
            toast({ title: 'Falha na exportação', description: error instanceof Error ? error.message : String(error), variant: 'destructive' });
        } finally { setExporting(false); }
    };

    const onCard = (next: AuditCard) => {
        setCard(next);
        if (next === 'alerts') setTimeout(() => alertsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
        if (next === 'integrity') void verify();
    };

    // ── Vista pessoal: só a própria atividade (logins, dispositivos e IP) ─────────────
    if (!data.full) {
        const mine = data.events.filter(event => inRange(event, range));
        const logins = mine.filter(event => event.action === 'login');
        const devices = [...new Set(mine.map(event => event.device).filter(Boolean))];
        const ips = [...new Set(mine.map(event => event.ip).filter(Boolean))];
        return (
            <MainLayout title="A minha atividade" subtitle="Os seus acessos e ações registados na auditoria (para detetar acessos indevidos à sua conta)">
                <div className="mb-4"><SeletorPeriodoAuditoria value={period} onChange={setPeriod} /></div>
                <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    {[
                        { css: 'card-kpi-mint', icon: LayoutList, title: 'Ações registadas', value: mine.length },
                        { css: 'card-kpi-sky', icon: ShieldCheck, title: 'Logins', value: logins.length },
                        { css: 'card-kpi-coral', icon: KeyRound, title: 'Logins falhados', value: mine.filter(event => event.action === 'login_failed').length },
                        { css: 'card-kpi-purple', icon: Monitor, title: 'Dispositivos', value: devices.length },
                    ].map(item => (
                        <div key={item.title} className={item.css}>
                            <div className="flex items-center gap-2.5"><div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/10 dark:bg-white/10"><item.icon className="h-5 w-5" /></div><p className="text-sm font-bold">{item.title}</p></div>
                            <p className="my-2 font-display text-3xl font-black">{item.value}</p>
                        </div>
                    ))}
                </div>
                <div className="mb-4 rounded-xl border bg-muted/30 p-4 text-sm">
                    <p className="flex items-center gap-2 font-semibold"><Network className="h-4 w-4" /> Endereços IP: <span className="font-mono">{ips.join(', ') || '—'}</span></p>
                    <p className="mt-1 flex items-center gap-2 font-semibold"><Monitor className="h-4 w-4" /> Dispositivos: {devices.join(', ') || '—'}</p>
                    <p className="mt-2 text-xs text-muted-foreground">Se reconhecer algum acesso que não fez, altere a palavra-passe e avise o administrador. A página completa de auditoria está reservada ao Super Administrador e ao Auditor Interno.</p>
                </div>
                <LinhaTempoAuditoria events={mine} onOpen={setSelected} />
                <DetalheAuditoria event={selected} events={mine} brokenSeq={null} onClose={() => setSelected(null)} onOpen={setSelected} onInvestigate={() => undefined} />
            </MainLayout>
        );
    }

    return (
        <MainLayout title="Auditoria" subtitle="Registo imutável de todas as ações, com integridade verificável, alertas e investigação">
            <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                <div className="relative w-full xl:w-96">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input className="pl-10" placeholder="Pesquisar no resumo, utilizador, IP ou justificação..." value={filters.search} onChange={event => setFilters(previous => ({ ...previous, search: event.target.value }))} />
                </div>
                <div className="flex flex-wrap gap-2">
                    <div className="flex rounded-lg border bg-background p-0.5">
                        {([['table', 'Tabela', LayoutList], ['timeline', 'Linha do tempo', Workflow]] as const).map(([key, label, Icon]) => (
                            <button key={key} type="button" onClick={() => setView(key)} aria-pressed={view === key}
                                className={cn('flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-bold', view === key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted')}>
                                <Icon className="h-3.5 w-3.5" />{label}
                            </button>
                        ))}
                    </div>
                    <Button variant={showFilters ? 'default' : 'outline'} className="gap-2" onClick={() => setShowFilters(value => !value)}><Filter className="h-4 w-4" /> Filtros{filterLabels.length ? ` (${filterLabels.length})` : ''}</Button>
                    <Button variant="outline" className="gap-2" onClick={verify} disabled={verifying}>{verifying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Fingerprint className="h-4 w-4" />} Verificar integridade</Button>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild><Button variant="outline" className="gap-2" disabled={exporting}>{exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileBarChart className="h-4 w-4" />} Exportar e relatórios <ChevronDown className="h-3.5 w-3.5" /></Button></DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-80">
                            <DropdownMenuLabel>Com o período e os filtros atuais</DropdownMenuLabel>
                            <DropdownMenuItem className="gap-2" onSelect={() => exportReport('eventos', 'pdf')}><FileText className="h-4 w-4" /> Exportar registos em PDF</DropdownMenuItem>
                            <DropdownMenuItem className="gap-2" onSelect={() => exportReport('eventos', 'xlsx')}><FileSpreadsheet className="h-4 w-4" /> Exportar registos em Excel</DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuLabel>Relatórios prontos (PDF)</DropdownMenuLabel>
                            {AUDIT_REPORTS.filter(report => report.key !== 'eventos').map(report => (
                                <DropdownMenuItem key={report.key} onSelect={() => exportReport(report.key, 'pdf')} className="flex flex-col items-start gap-0.5">
                                    <span className="font-semibold">{report.title}</span><span className="text-xs text-muted-foreground">{report.description}</span>
                                </DropdownMenuItem>
                            ))}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="gap-2" onSelect={() => setWeeklyOpen(true)}><Mail className="h-4 w-4" /> Envio semanal por email</DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                    {data.actor.role === 'super_admin' && <Button variant="ghost" size="icon" className="h-10 w-10" title="Regras da auditoria" aria-label="Regras da auditoria" onClick={() => setConfigOpen(true)}><Settings2 className="h-4 w-4" /></Button>}
                </div>
            </div>

            <div className="mb-4 flex flex-col gap-2 lg:flex-row lg:items-center">
                <div className="flex-1"><SeletorPeriodoAuditoria value={period} onChange={setPeriod} /></div>
                <label className="flex items-center gap-2 rounded-xl border bg-muted/40 px-3 py-3 text-xs font-semibold" title={`Registos com mais de ${data.config.visibleMonths} meses ficam em arquivo só de leitura (conservados ${data.config.retentionYears} anos).`}>
                    <Archive className="h-4 w-4" /> Incluir arquivo (&gt; {data.config.visibleMonths} meses)
                    <Switch checked={archive} onCheckedChange={setArchive} />
                </label>
            </div>

            <FiltrosAuditoria open={showFilters} filters={filters} onChange={changes => setFilters(previous => ({ ...previous, ...changes }))} users={roleOptions}
                saved={saved.saved} onSave={name => { saved.save(name, filters, period); toast({ title: 'Filtro guardado', description: `«${name}» fica em Filtros guardados.` }); }}
                onApplySaved={item => { setFilters({ ...EMPTY_AUDIT_FILTERS, ...item.filters }); setPeriod(item.period); }} onRemoveSaved={saved.remove} />

            <CartoesAuditoria kpis={kpis} previous={previousKpis} openAlerts={openAlerts} integrity={integrity} active={card} onSelect={onCard} loading={data.loading} />
            <GraficosAuditoria events={inPeriod} />

            <div ref={alertsRef} className="mb-6">
                <CentroAlertas alerts={data.alerts} actor={data.actor} responsibles={responsibles} events={data.events}
                    onChanged={() => ServicoAuditoriaAvancada.listAlerts().then(data.setAlerts)} onOpenEvent={setSelected} />
            </div>

            {view === 'table'
                ? <TabelaAuditoria events={shown} loading={data.loading} onOpen={setSelected} />
                : <LinhaTempoAuditoria events={shown} onOpen={setSelected} />}

            <p className="mt-3 text-xs text-muted-foreground">
                Registos só de inserção: ninguém (incluindo o Super Administrador) os pode alterar ou apagar. Cada registo está encadeado ao anterior (SHA-256){typeof (window as any).electronAPI?.auditSealVerify === 'function' ? ' e selado com HMAC no aplicativo desktop' : ''}.
                Período: {range?.label || 'todo o histórico'} · {shown.length.toLocaleString('pt-AO')} registo(s){data.integrity ? ` · última verificação ${formatAuditTimestamp(data.integrity.verifiedAt)}` : ''}.
            </p>

            <DetalheAuditoria event={selected} events={data.events} brokenSeq={brokenSeq} onClose={() => setSelected(null)} onOpen={setSelected}
                onInvestigate={target => { setSelected(null); setInvestigation(target); }} />
            <InvestigacaoAuditoria target={investigation} events={data.events} onClose={() => setInvestigation(null)} onOpen={event => { setInvestigation(null); setSelected(event); }} />
            <ConfigAuditoria open={configOpen} onOpenChange={setConfigOpen} config={data.config} actor={data.actor} onSaved={config => { data.setConfig(config); data.reload(); }} />
            <EnvioSemanal open={weeklyOpen} onOpenChange={setWeeklyOpen} actor={data.actor} smtp={Boolean(companySettings?.smtpHost && companySettings?.smtpUser && companySettings?.smtpPassword)} />
        </MainLayout>
    );
}

function ConfigAuditoria({ open, onOpenChange, config, actor, onSaved }: { open: boolean; onOpenChange: (open: boolean) => void; config: AuditConfig; actor: { id: string; name: string; role: string }; onSaved: (config: AuditConfig) => void }) {
    const [draft, setDraft] = useState<AuditConfig>(config);
    const [error, setError] = useState('');
    useEffect(() => { if (open) { setDraft(config); setError(''); } }, [open, config]);
    const numberField = (label: string, key: keyof AuditConfig['alerts'], hint?: string) => (
        <div className="space-y-1">
            <Label className="text-xs">{label}</Label>
            <Input type="number" min={0} value={Number(draft.alerts[key]) || 0} onChange={event => setDraft(previous => ({ ...previous, alerts: { ...previous.alerts, [key]: Number(event.target.value) || 0 } }))} />
            {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
        </div>
    );
    const configurable: AuditAction[] = ['override', 'cancel', 'reversal', 'permission_change', 'settings_change', 'export', 'access_denied', 'approve', 'disburse', 'login_failed', 'delete'];
    const save = async () => {
        try { await ServicoAuditoriaAvancada.saveConfig(draft, actor); onSaved(draft); onOpenChange(false); } catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); }
    };
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[92vh] w-[96vw] max-w-4xl overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Regras da auditoria</DialogTitle>
                    <DialogDescription>Gravidades, limiares das regras de alerta e conservação. Aplicam-se a todos os computadores e à versão web.</DialogDescription>
                </DialogHeader>
                <div className="space-y-5">
                    <section className="space-y-2">
                        <h3 className="text-sm font-bold">Limiares dos alertas</h3>
                        <div className="grid gap-3 sm:grid-cols-3">
                            {numberField('Logins falhados seguidos', 'failedLogins')}
                            {numberField('IP diferentes', 'multiIpCount')}
                            {numberField('… em minutos', 'multiIpMinutes')}
                            {numberField('Acessos negados por dia', 'deniedPerDay')}
                            {numberField('Exportação: registos acima de', 'exportThreshold')}
                            {numberField('Anulação/estorno acima de (Kz)', 'cancelAmountThreshold')}
                            {numberField('Anulações por dia acima de', 'cancelsPerDay')}
                            {numberField('Alteração revertida em (min)', 'revertMinutes')}
                            {numberField('Madrugada: até às (h)', 'nightEnd', 'Atividade financeira entre 00:00 e esta hora gera alerta')}
                        </div>
                    </section>
                    <section className="space-y-2">
                        <h3 className="text-sm font-bold">Regras ativas</h3>
                        <div className="grid gap-2 sm:grid-cols-2">
                            {(Object.keys(ALERT_RULES) as AlertRuleId[]).map(rule => (
                                <label key={rule} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs">
                                    <span>{ALERT_RULES[rule].label}</span>
                                    <Switch checked={!draft.alerts.disabledRules.includes(rule)} disabled={rule === 'integrity'}
                                        onCheckedChange={value => setDraft(previous => ({ ...previous, alerts: { ...previous.alerts, disabledRules: value ? previous.alerts.disabledRules.filter(item => item !== rule) : [...previous.alerts.disabledRules, rule] } }))} />
                                </label>
                            ))}
                        </div>
                    </section>
                    <section className="space-y-2">
                        <h3 className="text-sm font-bold">Gravidade por tipo de ação</h3>
                        <div className="grid gap-2 sm:grid-cols-2">
                            {configurable.map(action => (
                                <div key={action} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-1.5 text-xs">
                                    <span>{ACTION_LABELS[action]}</span>
                                    <Select value={draft.severityOverrides[action] || 'auto'} onValueChange={value => setDraft(previous => {
                                        const overrides = { ...previous.severityOverrides };
                                        if (value === 'auto') delete overrides[action]; else overrides[action] = value as Severity;
                                        return { ...previous, severityOverrides: overrides };
                                    })}>
                                        <SelectTrigger className="h-8 w-36"><SelectValue /></SelectTrigger>
                                        <SelectContent><SelectItem value="auto">Catálogo</SelectItem>{(Object.keys(SEVERITY_LABELS) as Severity[]).map(level => <SelectItem key={level} value={level}>{SEVERITY_LABELS[level]}</SelectItem>)}</SelectContent>
                                    </Select>
                                </div>
                            ))}
                        </div>
                    </section>
                    <section className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1"><Label className="text-xs">Meses visíveis na página</Label><Input type="number" min={1} value={draft.visibleMonths} onChange={event => setDraft(previous => ({ ...previous, visibleMonths: Math.max(1, Number(event.target.value) || 12) }))} /></div>
                        <div className="space-y-1"><Label className="text-xs">Prazo legal de conservação (anos)</Label><Input type="number" min={5} value={draft.retentionYears} onChange={event => setDraft(previous => ({ ...previous, retentionYears: Math.max(5, Number(event.target.value) || 10) }))} /><p className="text-[11px] text-muted-foreground">Confirme o prazo com o contabilista. Os registos nunca são apagados antes deste prazo.</p></div>
                    </section>
                    {error && <p className="text-sm text-destructive">{error}</p>}
                    <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button><Button onClick={save}>Guardar regras</Button></div>
                </div>
            </DialogContent>
        </Dialog>
    );
}

function EnvioSemanal({ open, onOpenChange, actor, smtp }: { open: boolean; onOpenChange: (open: boolean) => void; actor: { id: string; name: string; role: string }; smtp: boolean }) {
    const [schedule, setSchedule] = useState<{ id?: string; recipients: string; enabled: boolean; lastRunAt?: string | null; lastError?: string | null }>({ recipients: '', enabled: true });
    const [error, setError] = useState('');
    useEffect(() => {
        if (!open) return;
        setError('');
        ServicoPagamentos.listSchedules().then(list => {
            const found = list.find(item => item.reportType === WEEKLY_AUDIT_REPORT);
            setSchedule(found ? { id: found.id, recipients: found.recipients, enabled: Boolean(found.enabled), lastRunAt: found.lastRunAt, lastError: found.lastError } : { recipients: '', enabled: true });
        }).catch(() => undefined);
    }, [open]);
    const save = async () => {
        try {
            await ServicoPagamentos.saveSchedule({ id: schedule.id, reportType: WEEKLY_AUDIT_REPORT, recipients: schedule.recipients.split(/[,;\s]+/), enabled: schedule.enabled }, actor as any);
            onOpenChange(false);
        } catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); }
    };
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2"><Mail className="h-5 w-5" /> Resumo semanal de segurança por email</DialogTitle>
                    <DialogDescription>Todas as segundas-feiras, o resumo da semana anterior (eventos críticos, alertas, logins falhados e acessos fora de horas) é enviado em PDF.</DialogDescription>
                </DialogHeader>
                {!smtp && <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">O envio usa o servidor de email (SMTP) configurado em Definições e corre na aplicação desktop.</p>}
                <div className="space-y-1.5"><Label>Destinatários (separados por vírgula)</Label><Input value={schedule.recipients} onChange={event => setSchedule(previous => ({ ...previous, recipients: event.target.value }))} placeholder="auditoria@empresa.ao, direccao@empresa.ao" /></div>
                <label className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">Envio ativo <Switch checked={schedule.enabled} onCheckedChange={enabled => setSchedule(previous => ({ ...previous, enabled }))} /></label>
                {schedule.lastRunAt && <p className="text-xs text-muted-foreground">Último envio: {formatAuditTimestamp(schedule.lastRunAt)}{schedule.lastError ? ` · erro: ${schedule.lastError}` : ''}</p>}
                {error && <p className="text-sm text-destructive">{error}</p>}
                <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button><Button onClick={save} disabled={!schedule.recipients.trim()} className="gap-2">Guardar</Button></div>
            </DialogContent>
        </Dialog>
    );
}
