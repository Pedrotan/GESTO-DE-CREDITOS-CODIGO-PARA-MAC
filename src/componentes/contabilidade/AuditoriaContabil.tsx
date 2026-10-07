import { useEffect, useMemo, useState } from 'react';
import {
    Banknote, ChevronDown, ChevronRight, ClipboardCheck, Copy, FileWarning, KeyRound, Loader2, Play, ScrollText, ShieldCheck, Users, Wallet,
} from 'lucide-react';
import { Button } from '@/componentes/ui/button';
import { Badge } from '@/componentes/ui/badge';
import { Input } from '@/componentes/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/componentes/ui/select';
import { useAuth } from '@/contextos/ContextoAutenticacao';
import { useToast } from '@/componentes/ui/use-toast';
import { formatDateTime } from '@/bibliotecas/formatters';
import {
    AUDIT_GROUP_LABELS, AUDIT_KIND_LABELS, SEVERITY_LABELS, SEVERITY_ORDER, groupFindings, type AuditFinding, type AuditKind, type AuditResult,
} from '@/bibliotecas/auditoria-contabil';
import { ServicoContabilidadeGeral, type AuditRunRecord } from '@/servicos/ServicoContabilidadeGeral';
import { ServicoDivergencias, type DivergenceDecision, type DivergenceState } from '@/servicos/ServicoDivergencias';
import { ServicoIntegridadeContabilistica } from '@/servicos/ServicoIntegridadeContabilistica';
import { ServicoCadeiaAuditoria } from '@/servicos/ServicoCadeiaAuditoria';
import { cn } from '@/bibliotecas/utils';
import { AvisoErro, BotoesExportar, Indicador, SeccaoCabecalho } from './comum';
import { isAdminRole, money } from './formato';
import type { ContabilidadeData } from './useContabilidade';

const KIND_INFO: Array<{ kind: AuditKind; icon: any; description: string }> = [
    { kind: 'full', icon: ClipboardCheck, description: 'Todas as regras: integridade, saldos, caixa, pagamentos, contratos e utilizadores.' },
    { kind: 'integrity', icon: ShieldCheck, description: 'Cadeia SHA-256, conteúdo dos lançamentos, partidas dobradas e selos HMAC.' },
    { kind: 'balances', icon: ScrollText, description: 'Débito = crédito, contas do activo, carteira = capital em dívida, saldo contratual calculado.' },
    { kind: 'cash', icon: Banknote, description: 'Fuga monetária, desembolsos sem saldo e diferenças nos fechos de caixa.' },
    { kind: 'payments', icon: Wallet, description: 'Pagamentos sem contrato ou sem lançamento, alocações e registos fora do expediente.' },
    { kind: 'contracts', icon: FileWarning, description: 'Contratos sem plano de prestações e créditos concedidos sem desembolso.' },
    { kind: 'users', icon: Users, description: 'Segregação de funções, estornos em série, reaberturas e cadeia da trilha de utilizadores.' },
];

const SEVERITY_VARIANT = { critical: 'destructive', high: 'warning', medium: 'secondary', low: 'outline' } as const;
const STATE_LABELS: Record<DivergenceState, string> = { pending: 'Por resolver', justified: 'Justificado', resolved: 'Resolvido' };

function ApontamentosAgrupados({ findings, decisions, onDecided, canDecide }: {
    findings: AuditFinding[]; decisions: DivergenceDecision[]; onDecided: () => Promise<void>; canDecide: boolean;
}) {
    const { user } = useAuth();
    const { toast } = useToast();
    const [open, setOpen] = useState<Record<string, boolean>>({});
    const [reasons, setReasons] = useState<Record<string, string>>({});
    const [busy, setBusy] = useState('');
    const groups = useMemo(() => groupFindings(findings), [findings]);
    const latest = useMemo(() => {
        const map = new Map<string, DivergenceDecision>();
        for (const decision of decisions) if (!map.has(decision.issueKey)) map.set(decision.issueKey, decision);
        return map;
    }, [decisions]);
    const decide = async (finding: AuditFinding, state: DivergenceState) => {
        if (!user) return;
        setBusy(finding.id);
        try {
            const issueKey = `audit:${finding.id}`;
            await ServicoDivergencias.decide({
                issueKey, previousId: latest.get(issueKey)?.id || '', source: 'audit', description: `${finding.title}: ${finding.message}`,
                state, reason: reasons[finding.id] || '', actorId: user.id, actorName: user.name,
            });
            setReasons(previous => ({ ...previous, [finding.id]: '' }));
            await onDecided();
        } catch (error: any) {
            toast({ title: 'Decisão não registada', description: error?.message, variant: 'destructive' });
        } finally { setBusy(''); }
    };
    if (!groups.length) {
        return <div className="flex items-center gap-3 rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300"><ShieldCheck className="h-6 w-6" /><div><p className="font-bold">Nenhum apontamento</p><p className="text-sm">As regras executadas não encontraram irregularidades.</p></div></div>;
    }
    return (
        <div className="space-y-2">
            {groups.map(group => {
                const expanded = open[group.rule];
                const pending = group.items.filter(item => !item.justification || item.justification.state === 'pending').length;
                return (
                    <div key={group.rule} className={cn('overflow-hidden rounded-xl border bg-card', group.severity === 'critical' && pending ? 'border-red-300 dark:border-red-900' : '')}>
                        <button type="button" className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/40" onClick={() => setOpen(previous => ({ ...previous, [group.rule]: !expanded }))}>
                            {expanded ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                            <Badge variant={SEVERITY_VARIANT[group.severity]}>{SEVERITY_LABELS[group.severity]}</Badge>
                            <span className="flex-1 font-semibold">{group.title}</span>
                            <span className="text-xs text-muted-foreground">{AUDIT_GROUP_LABELS[group.group]}</span>
                            <Badge variant="outline">{group.items.length} {group.items.length === 1 ? 'ocorrência' : 'ocorrências'}{pending !== group.items.length ? ` · ${pending} por resolver` : ''}</Badge>
                            {group.amountMinor > 0 && <span className="hidden font-mono text-xs font-semibold md:inline">{money(group.amountMinor)}</span>}
                        </button>
                        {expanded && (
                            <ul className="divide-y border-t">
                                {[...group.items].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]).map(finding => (
                                    <li key={finding.id} className="space-y-2 px-4 py-3 text-sm">
                                        <div className="flex flex-wrap items-start justify-between gap-2">
                                            <p className="flex-1">{finding.message}</p>
                                            <Badge variant={finding.justification && finding.justification.state !== 'pending' ? 'success' : 'outline'}>{STATE_LABELS[finding.justification?.state || 'pending']}</Badge>
                                        </div>
                                        <div className="flex flex-wrap gap-1.5">
                                            {finding.references.map(reference => (
                                                <button key={`${reference.kind}:${reference.id}`} type="button" title="Copiar referência"
                                                    onClick={() => { void navigator.clipboard?.writeText(reference.id); toast({ title: 'Referência copiada', description: reference.id }); }}
                                                    className="inline-flex items-center gap-1 rounded bg-muted px-2 py-0.5 font-mono text-[11px] hover:bg-muted/70">
                                                    <Copy className="h-3 w-3" />{reference.kind === 'credit' ? 'Crédito' : reference.kind === 'payment' ? 'Pagamento' : reference.kind === 'entry' ? 'Lançamento' : reference.kind === 'account' ? 'Conta' : reference.kind === 'user' ? 'Registo' : 'Sessão'} {reference.label ? `${reference.label} · ` : ''}{reference.id}
                                                </button>
                                            ))}
                                            {finding.at && <span className="text-[11px] text-muted-foreground">{formatDateTime(finding.at)}</span>}
                                        </div>
                                        {finding.justification && finding.justification.state !== 'pending' && (
                                            <p className="text-xs text-muted-foreground">{STATE_LABELS[finding.justification.state]} por {finding.justification.actorName} em {formatDateTime(finding.justification.createdAt)}: {finding.justification.reason}</p>
                                        )}
                                        {canDecide && (
                                            <div className="flex flex-col gap-2 md:flex-row">
                                                <Input value={reasons[finding.id] || ''} onChange={event => setReasons(previous => ({ ...previous, [finding.id]: event.target.value }))} placeholder="Motivo da decisão (mínimo 10 caracteres)" className="h-9 text-xs" />
                                                <div className="flex gap-2">
                                                    {(['justified', 'resolved', 'pending'] as const).map(state => (
                                                        <Button key={state} size="sm" variant={state === 'justified' ? 'default' : 'outline'} className="h-9 text-xs"
                                                            disabled={busy === finding.id || (reasons[finding.id] || '').trim().length < 10 || (finding.justification?.state || 'pending') === state}
                                                            onClick={() => void decide(finding, state)}>{state === 'justified' ? 'Justificar' : state === 'resolved' ? 'Marcar resolvido' : 'Reabrir'}</Button>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                );
            })}
        </div>
    );
}

const findingsTable = (title: string, subtitle: string, findings: AuditFinding[]) => ({
    title, subtitle, fileName: `${title}-${subtitle}`,
    head: ['Gravidade', 'Regra', 'Grupo', 'Descrição', 'Referências', 'Valor', 'Estado'],
    numericColumns: [5],
    body: [...findings].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]).map(finding => [
        SEVERITY_LABELS[finding.severity], finding.title, AUDIT_GROUP_LABELS[finding.group], finding.message,
        finding.references.map(reference => reference.id).join(', '), finding.amountMinor ? money(finding.amountMinor) : '',
        STATE_LABELS[finding.justification?.state || 'pending'],
    ]),
});

export function AuditoriaExecucao({ data, pedido, onPedidoTratado }: { data: ContabilidadeData; pedido?: { kind: AuditKind; nonce: number } | null; onPedidoTratado?: () => void }) {
    const { user } = useAuth();
    const { toast } = useToast();
    const [running, setRunning] = useState<AuditKind | null>(null);
    const [last, setLast] = useState<{ run: AuditRunRecord; result: AuditResult } | null>(null);
    const [decisions, setDecisions] = useState<DivergenceDecision[]>([]);
    const [busy, setBusy] = useState('');
    const [error, setError] = useState('');
    const admin = isAdminRole(user?.role);
    const loadDecisions = async () => setDecisions(await ServicoDivergencias.list().catch(() => []));
    useEffect(() => { void loadDecisions(); }, []);

    const run = async (kind: AuditKind) => {
        if (!user) return;
        setRunning(kind); setError('');
        try {
            const { run, result } = await ServicoContabilidadeGeral.runAudit(kind, { id: user.id, name: user.name, role: user.role });
            setLast({ run, result });
            await data.reload();
            toast({
                title: `${AUDIT_KIND_LABELS[kind]} concluída`,
                description: run.status === 'critical' ? `${run.criticalCount} apontamento(s) crítico(s).` : run.status === 'warning' ? `${run.highCount + run.mediumCount} aviso(s) a rever.` : 'Sem apontamentos por resolver.',
                variant: run.status === 'critical' ? 'destructive' : undefined,
            });
        } catch (failure: any) {
            setError(failure?.message || 'A auditoria falhou.');
        } finally { setRunning(null); }
    };
    // Pedido vindo do topo da página (por exemplo, "Verificar integridade"): executa uma vez por pedido.
    useEffect(() => {
        if (!pedido) return;
        onPedidoTratado?.();
        void run(pedido.kind);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pedido?.nonce]);
    const tool = async (key: string, work: () => Promise<string>) => {
        setBusy(key); setError('');
        try { toast({ title: 'Concluído', description: await work() }); await data.reload(); }
        catch (failure: any) { setError(failure?.message || 'A operação falhou.'); }
        finally { setBusy(''); }
    };

    const findings = last?.result.findings || data.evaluation?.findings || [];
    const summary = last?.result.summary || data.evaluation?.summary;
    const counts = (severity: string) => findings.filter(finding => finding.severity === severity && (!finding.justification || finding.justification.state === 'pending')).length;

    return (
        <div className="space-y-5">
            <SeccaoCabecalho title="Auditoria contabilística" description="Cada auditoria fica gravada no histórico com o utilizador, a data, o resultado e os apontamentos. Os apontamentos podem ser justificados (por exemplo, um pagamento autorizado num feriado) sem deixarem de constar do histórico."
                actions={<BotoesExportar build={() => findingsTable('Apontamentos de auditoria', last ? `${AUDIT_KIND_LABELS[last.run.kind]} de ${formatDateTime(last.run.finishedAt)}` : 'Verificação automática', findings)} />} />
            <AvisoErro message={error} />
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {KIND_INFO.map(item => {
                    const Icon = item.icon;
                    const isRunning = running === item.kind;
                    return (
                        <button key={item.kind} type="button" disabled={!!running} onClick={() => void run(item.kind)}
                            className={cn('group flex flex-col gap-2 rounded-xl border p-4 text-left transition hover:border-primary hover:shadow-md disabled:opacity-60',
                                item.kind === 'full' ? 'border-primary/40 bg-primary/5 md:col-span-2 xl:col-span-1' : 'bg-card')}>
                            <div className="flex items-center gap-2">
                                <span className={cn('flex h-9 w-9 items-center justify-center rounded-lg', item.kind === 'full' ? 'bg-primary text-primary-foreground' : 'bg-muted')}>
                                    {isRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
                                </span>
                                <span className="font-bold">{AUDIT_KIND_LABELS[item.kind]}</span>
                                <Play className="ml-auto h-4 w-4 text-muted-foreground group-hover:text-primary" />
                            </div>
                            <p className="text-xs text-muted-foreground">{item.description}</p>
                        </button>
                    );
                })}
            </div>

            <div className="rounded-xl border bg-card p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div>
                        <p className="font-bold">{last ? `${AUDIT_KIND_LABELS[last.run.kind]} — ${formatDateTime(last.run.finishedAt)}` : 'Verificação automática (actualizada após cada movimento, não gravada)'}</p>
                        <p className="text-xs text-muted-foreground">{last ? `Executada por ${last.run.userName}` : data.loadedAt ? `Calculada em ${formatDateTime(data.loadedAt)}` : ''}</p>
                    </div>
                    {last && <Badge variant={last.run.status === 'critical' ? 'destructive' : last.run.status === 'warning' ? 'warning' : 'success'}>{last.run.status === 'critical' ? 'Crítico' : last.run.status === 'warning' ? 'Com avisos' : 'Sem apontamentos'}</Badge>}
                </div>
                <div className="mb-4 grid gap-3 md:grid-cols-5">
                    <Indicador label="Críticos" value={counts('critical')} tone={counts('critical') ? 'bad' : 'good'} />
                    <Indicador label="Altos" value={counts('high')} tone={counts('high') ? 'warn' : 'default'} />
                    <Indicador label="Médios" value={counts('medium')} />
                    <Indicador label="Caixa e Bancos (razão)" value={money(summary?.liquidMinor || 0)} />
                    <Indicador label="Carteira: razão / contratos" value={`${money(summary?.portfolioMinor || 0)}`} hint={`Contratos: ${money(summary?.contractsPortfolioMinor || 0)}`} tone={summary && summary.portfolioMinor !== summary.contractsPortfolioMinor ? 'bad' : 'default'} />
                </div>
                <ApontamentosAgrupados findings={findings} decisions={decisions} canDecide={admin}
                    onDecided={async () => { await loadDecisions(); await data.reload(); }} />
            </div>

            {admin && (
                <div className="rounded-xl border bg-card p-4">
                    <p className="mb-1 font-bold">Ferramentas de integridade</p>
                    <p className="mb-3 text-xs text-muted-foreground">Use-as só depois de rever os apontamentos: nenhuma altera lançamentos existentes.</p>
                    <div className="flex flex-wrap gap-2">
                        <Button variant="outline" size="sm" className="gap-2" disabled={!!busy || !window.electronAPI?.accountingSealPending}
                            title={window.electronAPI?.accountingSealPending ? '' : 'Disponível apenas no aplicativo desktop'}
                            onClick={() => void tool('seal', async () => `${await ServicoContabilidadeGeral.sealPending()} lançamento(s) selado(s) após revisão.`)}>
                            <KeyRound className="h-4 w-4" />Selar lançamentos pendentes
                        </Button>
                        <Button variant="outline" size="sm" disabled={!!busy}
                            onClick={() => void tool('migrate', async () => `${await ServicoIntegridadeContabilistica.migrateHistorical(user!.id, user!.name)} lançamento(s) histórico(s) com partidas dobradas geradas.`)}>
                            Gerar linhas históricas comprovadas
                        </Button>
                        <Button variant="outline" size="sm" disabled={!!busy}
                            onClick={() => void tool('chain', async () => `${await ServicoCadeiaAuditoria.migrateLegacy({ id: user!.id, name: user!.name, role: user!.role })} registo(s) da trilha encadeado(s).`)}>
                            Encadear trilha de utilizadores antiga
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}

export function HistoricoAuditorias({ data }: { data: ContabilidadeData }) {
    const [status, setStatus] = useState('all');
    const [kind, setKind] = useState('all');
    const [search, setSearch] = useState('');
    const [selected, setSelected] = useState<AuditRunRecord | null>(null);
    const rows = data.runs.filter(run => (status === 'all' || run.status === status) && (kind === 'all' || run.kind === kind)
        && (!search.trim() || `${run.userName} ${run.headEntryId || ''}`.toLowerCase().includes(search.trim().toLowerCase())));
    const label = (value: string) => value === 'critical' ? 'Crítico' : value === 'warning' ? 'Com avisos' : 'Sem apontamentos';
    return (
        <div>
            <SeccaoCabecalho title="Histórico de auditorias" description="Todas as auditorias executadas, imutáveis: quem, quando, que tipo, o resultado e o último lançamento verificado."
                actions={<BotoesExportar build={() => ({
                    title: 'Histórico de auditorias', subtitle: `${rows.length} execução(ões)`, fileName: 'historico-auditorias',
                    head: ['Data', 'Tipo', 'Utilizador', 'Estado', 'Críticos', 'Altos', 'Médios', 'Último lançamento', 'Selo HMAC'],
                    body: rows.map(run => [formatDateTime(run.finishedAt), AUDIT_KIND_LABELS[run.kind] || run.kind, run.userName, label(run.status), run.criticalCount, run.highCount, run.mediumCount, run.headEntryId || '—', run.sealStatus || '—']),
                })} />} />
            <div className="mb-3 grid gap-2 md:grid-cols-3">
                <Input value={search} onChange={event => setSearch(event.target.value)} placeholder="Utilizador ou lançamento…" />
                <Select value={status} onValueChange={setStatus}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>
                    <SelectItem value="all">Todos os estados</SelectItem><SelectItem value="critical">Crítico</SelectItem><SelectItem value="warning">Com avisos</SelectItem><SelectItem value="ok">Sem apontamentos</SelectItem>
                </SelectContent></Select>
                <Select value={kind} onValueChange={setKind}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>
                    <SelectItem value="all">Todos os tipos</SelectItem>{Object.entries(AUDIT_KIND_LABELS).map(([key, value]) => <SelectItem key={key} value={key}>{value}</SelectItem>)}
                </SelectContent></Select>
            </div>
            <div className="overflow-hidden rounded-xl border bg-card">
                <table className="w-full text-sm">
                    <thead><tr className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground"><th className="px-3 py-2 text-left">Data</th><th className="px-3 py-2 text-left">Tipo</th><th className="px-3 py-2 text-left">Utilizador</th><th className="px-3 py-2 text-left">Estado</th><th className="px-3 py-2 text-right">Crít./Altos/Méd.</th><th className="px-3 py-2 text-left">Selo</th><th /></tr></thead>
                    <tbody>
                        {rows.map(run => (
                            <tr key={run.id} className="border-t">
                                <td className="whitespace-nowrap px-3 py-2">{formatDateTime(run.finishedAt)}</td>
                                <td className="px-3 py-2">{AUDIT_KIND_LABELS[run.kind] || run.kind}</td>
                                <td className="px-3 py-2">{run.userName}</td>
                                <td className="px-3 py-2"><Badge variant={run.status === 'critical' ? 'destructive' : run.status === 'warning' ? 'warning' : 'success'}>{label(run.status)}</Badge></td>
                                <td className="px-3 py-2 text-right font-mono">{run.criticalCount} / {run.highCount} / {run.mediumCount}</td>
                                <td className="px-3 py-2 text-xs">{run.sealStatus === 'valid' ? 'Válido' : run.sealStatus === 'invalid' ? 'Inválido' : run.sealStatus === 'partial' ? 'Parcial' : 'Indisponível'}</td>
                                <td className="px-3 py-2 text-right"><Button size="sm" variant="outline" onClick={() => setSelected(run)}>Ver</Button></td>
                            </tr>
                        ))}
                        {rows.length === 0 && <tr><td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">Nenhuma auditoria com estes filtros. Execute uma em Auditoria.</td></tr>}
                    </tbody>
                </table>
            </div>
            {selected && (
                <div className="mt-4 rounded-xl border bg-card p-4">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                        <div><p className="font-bold">{AUDIT_KIND_LABELS[selected.kind]} de {formatDateTime(selected.finishedAt)}</p><p className="text-xs text-muted-foreground">Por {selected.userName} · último lançamento {selected.headEntryId || '—'} · hash {selected.headHash ? `${selected.headHash.slice(0, 16)}…` : '—'}</p></div>
                        <div className="flex gap-2">
                            <BotoesExportar build={() => findingsTable('Auditoria', `${AUDIT_KIND_LABELS[selected.kind]} de ${formatDateTime(selected.finishedAt)}`, selected.findings)} />
                            <Button size="sm" variant="ghost" onClick={() => setSelected(null)}>Fechar</Button>
                        </div>
                    </div>
                    <ApontamentosAgrupados findings={selected.findings} decisions={[]} canDecide={false} onDecided={async () => undefined} />
                </div>
            )}
        </div>
    );
}
