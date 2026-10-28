import { useMemo, useState } from 'react';
import { MainLayout } from '@/componentes/layout/MainLayout';
import { useData } from '@/contextos/ContextoDados';
import { useAuth } from '@/contextos/ContextoAutenticacao';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/componentes/ui/table';
import { Badge } from '@/componentes/ui/badge';
import { Button } from '@/componentes/ui/button';
import { Input } from '@/componentes/ui/input';
import { Label } from '@/componentes/ui/label';
import { Textarea } from '@/componentes/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/componentes/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/componentes/ui/select';
import {
    Search, Scale, FileWarning, Gavel, History, MoreHorizontal, Pencil, Trash, Download, ArrowRight,
    MessageSquarePlus, FileText, CheckCircle2, Clock, AlertTriangle, Handshake, Mail, TrendingUp,
} from 'lucide-react';
import { formatCurrency } from '@/bibliotecas/formatters';
import { cn } from '@/bibliotecas/utils';
import { exportToExcel } from '@/bibliotecas/ExcelHelper';
import { toast } from '@/componentes/ui/use-toast';
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/componentes/ui/dropdown-menu';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/componentes/ui/dialog';
import { LegalCaseForm } from '@/componentes/forms/LegalCaseForm';
import { LegalCase } from '@/tipos/contencioso';
import { ServicoContencioso } from '@/servicos/ServicoContencioso';
import { porMaisRecente } from '@/bibliotecas/ordenacao';
import {
    legalCandidates, legalCaseMetrics, nextLegalStage, appendTimelineEntry, parseTimeline, daysBetween,
    eligibleCollateralValue, LEGAL_STAGES, LEGAL_STALE_DAYS, LEGAL_NON_RECOVERY_OUTCOMES,
} from '@/bibliotecas/risco-carteira';

const STAGE_META: Record<LegalCase['stage'], { label: string; short: string; icon: React.ReactNode; badge: 'warning' | 'secondary' | 'destructive' | 'success'; tone: string }> = {
    interpellated: { label: 'Interpelação', short: 'Interpelação', icon: <Mail className="h-4 w-4" />, badge: 'warning', tone: 'border-amber-300/60 bg-amber-50 dark:bg-amber-500/10' },
    mediation: { label: 'Mediação / CMC', short: 'Mediação', icon: <Handshake className="h-4 w-4" />, badge: 'secondary', tone: 'border-fuchsia-300/60 bg-fuchsia-50 dark:bg-fuchsia-500/10' },
    court: { label: 'Tribunal / Comarca', short: 'Tribunal', icon: <Gavel className="h-4 w-4" />, badge: 'destructive', tone: 'border-rose-300/60 bg-rose-50 dark:bg-rose-500/10' },
    closed: { label: 'Fechado', short: 'Fechado', icon: <CheckCircle2 className="h-4 w-4" />, badge: 'success', tone: 'border-emerald-300/60 bg-emerald-50 dark:bg-emerald-500/10' },
};

const PRIORITY_META: Record<LegalCase['priority'], { label: string; className: string; rank: number }> = {
    critical: { label: 'Crítica', className: 'bg-rose-600 text-white', rank: 0 },
    high: { label: 'Alta', className: 'bg-orange-500 text-white', rank: 1 },
    normal: { label: 'Normal', className: 'bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-100', rank: 2 },
    low: { label: 'Baixa', className: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300', rank: 3 },
};

const DILIGENCE_TYPES = ['Telefonema', 'Visita ao devedor', 'Notificação escrita', 'Proposta de acordo', 'Acordo de pagamento', 'Audiência / sessão de mediação', 'Acção judicial', 'Penhora / execução', 'Outro'];
const CLOSE_OUTCOMES = ['Recuperado integralmente', 'Acordo de pagamento cumprido', 'Recuperação parcial', ...LEGAL_NON_RECOVERY_OUTCOMES.map(o => o === 'Incobrável' ? 'Incobrável (abate)' : 'Desistência')];
const todayISO = () => new Date().toISOString().slice(0, 10);
const fmtDate = (v?: string) => (v ? new Date(v).toLocaleDateString('pt-AO', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—');

function KpiCard({ variant, icon, title, value, hint }: { variant: string; icon: React.ReactNode; title: string; value: React.ReactNode; hint: string }) {
    return (
        <div className={variant}>
            <div className="flex items-center gap-2.5 min-w-0">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/10 dark:bg-white/10 text-slate-950 dark:text-white shrink-0">{icon}</div>
                <p className="text-sm sm:text-base font-bold text-slate-950 dark:text-white truncate tracking-tight">{title}</p>
            </div>
            <div className="my-2"><p className="font-display text-2xl sm:text-3xl font-black tracking-tight text-slate-950 dark:text-white truncate">{value}</p></div>
            <p className="text-xs font-semibold text-slate-900/75 dark:text-slate-400 truncate" title={hint}>{hint}</p>
        </div>
    );
}

export default function Contencioso() {
    const { clients, credits, warranties, legalCases, addLegalCase, updateLegalCase, deleteLegalCase } = useData();
    const { user } = useAuth();
    const actor = user ? { id: user.id, name: user.name } : undefined;

    const [searchTerm, setSearchTerm] = useState('');
    const [stageFilter, setStageFilter] = useState<'all' | 'open' | LegalCase['stage']>('open');
    const [priorityFilter, setPriorityFilter] = useState<'all' | LegalCase['priority']>('all');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingCase, setEditingCase] = useState<LegalCase | undefined>(undefined);
    const [prefill, setPrefill] = useState<Partial<LegalCase> | undefined>(undefined);

    const [diligenceFor, setDiligenceFor] = useState<LegalCase | null>(null);
    const [diligence, setDiligence] = useState({ date: todayISO(), type: DILIGENCE_TYPES[0], text: '' });
    const [closing, setClosing] = useState<LegalCase | null>(null);
    const [closeForm, setCloseForm] = useState({ outcome: CLOSE_OUTCOMES[0], text: '' });
    const [detailOf, setDetailOf] = useState<LegalCase | null>(null);
    const [busy, setBusy] = useState(false);

    const clientsById = useMemo(() => new Map(clients.map(c => [c.id, c])), [clients]);
    const metrics = useMemo(() => legalCaseMetrics(legalCases as any[]), [legalCases]);
    const candidates = useMemo(() => legalCandidates(credits as any[], legalCases as any[]), [credits, legalCases]);

    const collateralByClient = useMemo(() => {
        const map = new Map<string, number>();
        warranties.forEach(w => map.set(w.clientId, (map.get(w.clientId) || 0) + eligibleCollateralValue(w as any)));
        return map;
    }, [warranties]);

    const filteredCases = useMemo(() => {
        const term = searchTerm.trim().toLowerCase();
        return legalCases
            .filter(c => {
                if (stageFilter === 'open' && c.stage === 'closed') return false;
                if (stageFilter !== 'all' && stageFilter !== 'open' && c.stage !== stageFilter) return false;
                if (priorityFilter !== 'all' && c.priority !== priorityFilter) return false;
                if (!term) return true;
                const name = clientsById.get(c.clientId)?.name || '';
                return [name, c.creditId, c.id, c.lastAction].some(v => String(v || '').toLowerCase().includes(term));
            })
            .sort(porMaisRecente(c => c.createdAt));
    }, [legalCases, searchTerm, stageFilter, priorityFilter, clientsById]);

    // ------------------------------------------------------------- acções
    const withTimeline = (c: LegalCase, kind: string, text: string, date = todayISO()) =>
        appendTimelineEntry(c.notes, { date, kind, author: user?.name || 'Sistema', text });

    const openCreateModal = (fill?: Partial<LegalCase>) => {
        setEditingCase(undefined);
        setPrefill(fill);
        setIsModalOpen(true);
    };

    const handleSubmit = async (data: any) => {
        try {
            if (editingCase) {
                const updates: Partial<LegalCase> = { ...data };
                if (data.stage !== editingCase.stage) {
                    updates.notes = appendTimelineEntry(data.notes ?? editingCase.notes, {
                        date: todayISO(), kind: 'FASE', author: user?.name || 'Sistema',
                        text: `${STAGE_META[editingCase.stage].label} → ${STAGE_META[data.stage as LegalCase['stage']].label}`,
                    });
                    // Mantém a data de fecho coerente com a fase (usada no "Recuperado do mês")
                    if (data.stage === 'closed' && !editingCase.closedAt) updates.closedAt = new Date().toISOString();
                    if (data.stage !== 'closed' && editingCase.closedAt) updates.closedAt = null as any;
                }
                await updateLegalCase(editingCase.id, updates, actor);
            } else {
                const payload = { ...data };
                if (payload.stage === 'closed') payload.closedAt = new Date().toISOString();
                payload.notes = appendTimelineEntry(payload.notes, { date: todayISO(), kind: 'ABERTURA', author: user?.name || 'Sistema', text: `Processo aberto em ${STAGE_META[payload.stage as LegalCase['stage']].label} · ${formatCurrency(Number(payload.debtAmount || 0))}` });
                await addLegalCase(payload, actor);
            }
            setIsModalOpen(false);
            setEditingCase(undefined);
            setPrefill(undefined);
            toast({ title: editingCase ? 'Processo actualizado' : 'Processo aberto' });
        } catch (error) {
            console.error('Erro ao gravar processo:', error);
            toast({ title: 'Não foi possível gravar o processo', description: String((error as Error)?.message || error), variant: 'destructive' });
        }
    };

    const handleDelete = async (id: string) => {
        if (confirm('Deseja mover este processo para a lixeira? Poderá restaurá-lo mais tarde se necessário.')) {
            await deleteLegalCase(id, actor);
        }
    };

    const advanceStage = async (c: LegalCase) => {
        const next = nextLegalStage(c.stage);
        if (!next) return;
        if (next === 'closed') { setCloseForm({ outcome: CLOSE_OUTCOMES[0], text: '' }); setClosing(c); return; }
        if (!confirm(`Avançar o processo ${c.id} para "${STAGE_META[next].label}"?`)) return;
        await updateLegalCase(c.id, {
            stage: next,
            lastAction: `Avançou para ${STAGE_META[next].label}`,
            notes: withTimeline(c, 'FASE', `${STAGE_META[c.stage].label} → ${STAGE_META[next].label}`),
        }, actor);
        toast({ title: 'Fase actualizada', description: `${c.id} está agora em ${STAGE_META[next].label}.` });
    };

    const saveDiligence = async () => {
        if (!diligenceFor) return;
        if (diligence.text.trim().length < 5) {
            toast({ title: 'Descreva a diligência', description: 'O registo precisa de uma descrição (mínimo 5 caracteres).', variant: 'destructive' });
            return;
        }
        if (diligence.date > todayISO()) {
            toast({ title: 'Data inválida', description: 'A diligência não pode ter data futura.', variant: 'destructive' });
            return;
        }
        setBusy(true);
        try {
            const text = `${diligence.type}: ${diligence.text.trim()}`;
            await updateLegalCase(diligenceFor.id, { lastAction: text, notes: withTimeline(diligenceFor, 'DILIGÊNCIA', text, diligence.date) }, actor);
            toast({ title: 'Diligência registada' });
            setDiligenceFor(null);
        } finally {
            setBusy(false);
        }
    };

    const confirmClose = async () => {
        if (!closing) return;
        if (closeForm.text.trim().length < 10) {
            toast({ title: 'Justificação obrigatória', description: 'Indique o fundamento do encerramento (mínimo 10 caracteres).', variant: 'destructive' });
            return;
        }
        setBusy(true);
        try {
            const text = `${closeForm.outcome} — ${closeForm.text.trim()}`;
            await updateLegalCase(closing.id, {
                stage: 'closed',
                closedAt: new Date().toISOString(),
                lastAction: `Encerrado: ${closeForm.outcome}`,
                notes: withTimeline(closing, 'ENCERRAMENTO', text),
            }, actor);
            toast({ title: 'Processo encerrado' });
            setClosing(null);
        } finally {
            setBusy(false);
        }
    };

    const issueLetter = async (c: LegalCase) => {
        try {
            const filename = await ServicoContencioso.generateCollectionLetter(c.id);
            await updateLegalCase(c.id, { lastAction: 'Carta formal de cobrança emitida', notes: withTimeline(c, 'CARTA', `Carta formal de cobrança emitida (${filename})`) }, actor);
            toast({ title: 'Carta de cobrança emitida', description: filename });
        } catch (error) {
            toast({ title: 'Não foi possível emitir a carta', description: String((error as Error)?.message || error), variant: 'destructive' });
        }
    };

    const handleExport = () => {
        if (filteredCases.length === 0) { toast({ title: 'Nada para exportar' }); return; }
        const today = new Date();
        exportToExcel(filteredCases.map(c => ({
            'Processo': c.id,
            'Crédito': c.creditId,
            'Devedor': clientsById.get(c.clientId)?.name || '',
            'Fase': STAGE_META[c.stage].label,
            'Prioridade': PRIORITY_META[c.priority].label,
            'Dívida': Number(c.debtAmount || 0),
            'Garantias elegíveis': Math.round((collateralByClient.get(c.clientId) || 0) * 100) / 100,
            'Aberto em': fmtDate(c.createdAt),
            'Dias em processo': daysBetween(new Date(c.createdAt), c.closedAt ? new Date(c.closedAt) : today),
            'Última diligência': c.lastAction || '',
            'Actualizado em': fmtDate(c.updatedAt || c.createdAt),
            'Fechado em': fmtDate(c.closedAt),
        })), `contencioso_${todayISO()}`);
    };

    const detailTimeline = detailOf ? parseTimeline(detailOf.notes) : null;
    const stageIndex = (s: LegalCase['stage']) => LEGAL_STAGES.indexOf(s);

    return (
        <MainLayout title="Contencioso Jurídico" subtitle="Recuperação extrajudicial e judicial de créditos em incumprimento">
            <div className="flex flex-col gap-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="relative w-full max-w-sm">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input placeholder="Pesquisar devedor, crédito, processo ou diligência..." className="pl-10" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <Button variant="outline" className="gap-2" onClick={handleExport}><Download className="h-4 w-4" /> Exportar Excel</Button>
                        <Button className="gap-2 bg-red-600 hover:bg-red-700 text-white" onClick={() => openCreateModal()}><Scale className="h-4 w-4" /> Novo Processo</Button>
                    </div>
                </div>

                {/* KPIs */}
                <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
                    <KpiCard variant="card-kpi-coral" icon={<FileWarning className="h-5 w-5" />} title="Processos Activos"
                        value={metrics.openCount} hint={`${metrics.criticalCount} críticos · ${metrics.staleIds.size} sem diligência há +${LEGAL_STALE_DAYS} dias`} />
                    <KpiCard variant="card-kpi-amber" icon={<Scale className="h-5 w-5" />} title="Dívida em Litígio"
                        value={formatCurrency(metrics.litigatedAmount)} hint={`Idade média: ${metrics.avgAgeDays} dias`} />
                    <KpiCard variant="card-kpi-mint" icon={<History className="h-5 w-5" />} title="Recuperado (Mês)"
                        value={formatCurrency(metrics.recoveredThisMonth)} hint="Processos encerrados com recuperação neste mês" />
                    <KpiCard variant="card-kpi-sky" icon={<TrendingUp className="h-5 w-5" />} title="Taxa de Recuperação"
                        value={`${(metrics.recoveryRate * 100).toFixed(1)}%`} hint="Valor recuperado ÷ valor total em contencioso" />
                </div>

                {/* Pipeline por fase */}
                <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
                    {metrics.byStage.map(s => {
                        const meta = STAGE_META[s.stage as LegalCase['stage']];
                        const active = stageFilter === s.stage;
                        return (
                            <button
                                key={s.stage}
                                type="button"
                                onClick={() => setStageFilter(active ? 'open' : s.stage as LegalCase['stage'])}
                                className={cn('text-left rounded-xl border p-3 transition-all hover:shadow-md', meta.tone, active && 'ring-2 ring-primary')}
                            >
                                <div className="flex items-center justify-between text-xs font-black uppercase tracking-wider">
                                    <span className="flex items-center gap-1.5">{meta.icon}{meta.short}</span>
                                    <span className="text-lg">{s.count}</span>
                                </div>
                                <p className="mt-1 text-sm font-bold tabular-nums">{formatCurrency(s.amount)}</p>
                            </button>
                        );
                    })}
                </div>

                {/* Candidatos */}
                {candidates.length > 0 && (
                    <Card className="card-elevated border-rose-200/70 dark:border-rose-500/20">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-rose-600" /> Candidatos a contencioso ({candidates.length})</CardTitle>
                            <CardDescription>Créditos com +90 dias de atraso ou em incumprimento que ainda não têm processo aberto.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="grid gap-2 md:grid-cols-2 max-h-[240px] overflow-y-auto pr-1">
                                {candidates.slice(0, 20).map(({ credit, dpd, totalDue }) => (
                                    <div key={credit.id} className="flex items-center justify-between gap-3 rounded-lg border p-2.5">
                                        <div className="min-w-0">
                                            <p className="text-sm font-semibold truncate">{clientsById.get(credit.clientId)?.name || credit.clientName}</p>
                                            <p className="text-[11px] text-muted-foreground truncate">
                                                {credit.id} · <span className="font-bold text-rose-600">{dpd} dias</span> · {formatCurrency(totalDue)}
                                                {(collateralByClient.get(credit.clientId) || 0) > 0 && <> · garantia {formatCurrency(collateralByClient.get(credit.clientId) || 0)}</>}
                                            </p>
                                        </div>
                                        <Button size="sm" variant="outline" className="shrink-0 h-8 gap-1.5 border-rose-300 text-rose-700 hover:bg-rose-50"
                                            onClick={() => openCreateModal({ clientId: credit.clientId, creditId: credit.id, debtAmount: totalDue, priority: dpd > 180 ? 'critical' : 'high', stage: 'interpellated' })}>
                                            <Scale className="h-3.5 w-3.5" /> Abrir processo
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* Filtros */}
                <div className="flex flex-wrap items-center gap-2">
                    <Select value={stageFilter} onValueChange={(v) => setStageFilter(v as any)}>
                        <SelectTrigger className="w-[190px] h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="open">Processos em curso</SelectItem>
                            <SelectItem value="all">Todos (inclui fechados)</SelectItem>
                            {LEGAL_STAGES.map(s => <SelectItem key={s} value={s}>{STAGE_META[s].label}</SelectItem>)}
                        </SelectContent>
                    </Select>
                    <Select value={priorityFilter} onValueChange={(v) => setPriorityFilter(v as any)}>
                        <SelectTrigger className="w-[210px] h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Todas as prioridades</SelectItem>
                            {(['critical', 'high', 'normal', 'low'] as const).map(p => <SelectItem key={p} value={p}>{PRIORITY_META[p].label}</SelectItem>)}
                        </SelectContent>
                    </Select>
                    <span className="text-xs text-muted-foreground ml-auto">{filteredCases.length} de {legalCases.length} processos</span>
                </div>

                {/* Tabela */}
                <div className="card-elevated overflow-x-auto">
                    <Table>
                        <TableHeader>
                            <TableRow className="bg-muted/30">
                                <TableHead>Ref / Crédito</TableHead>
                                <TableHead>Devedor</TableHead>
                                <TableHead className="text-right">Dívida</TableHead>
                                <TableHead>Fase</TableHead>
                                <TableHead>Prioridade</TableHead>
                                <TableHead>Idade</TableHead>
                                <TableHead>Última Diligência</TableHead>
                                <TableHead className="text-right">Ações</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredCases.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={8} className="text-center py-10 text-muted-foreground">
                                        {legalCases.length === 0
                                            ? (candidates.length > 0 ? 'Nenhum processo aberto. Veja acima os créditos que já justificam contencioso.' : 'Nenhum processo de contencioso — nenhum crédito com atraso superior a 90 dias.')
                                            : 'Nenhum processo corresponde aos filtros.'}
                                    </TableCell>
                                </TableRow>
                            ) : filteredCases.map(c => {
                                const client = clientsById.get(c.clientId);
                                const today = new Date();
                                const age = daysBetween(new Date(c.createdAt), c.closedAt ? new Date(c.closedAt) : today);
                                const sinceUpdate = daysBetween(new Date(c.updatedAt || c.createdAt), today);
                                const stale = metrics.staleIds.has(c.id);
                                const next = nextLegalStage(c.stage);
                                const collateral = collateralByClient.get(c.clientId) || 0;
                                return (
                                    <TableRow key={c.id} className="hover:bg-red-50/20 transition-colors">
                                        <TableCell>
                                            <button type="button" className="flex flex-col text-left hover:underline" onClick={() => setDetailOf(c)}>
                                                <span className="font-bold text-xs">{c.id}</span>
                                                <span className="text-[11px] text-muted-foreground uppercase">{c.creditId}</span>
                                            </button>
                                        </TableCell>
                                        <TableCell>
                                            <p className="font-semibold">{client?.name || 'Cliente removido'}</p>
                                            {client?.phone && <p className="text-[11px] text-muted-foreground">{client.phone}</p>}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <p className="font-mono text-red-600 font-bold">{formatCurrency(Number(c.debtAmount || 0))}</p>
                                            {collateral > 0 && <p className="text-[11px] text-muted-foreground">garantia {formatCurrency(collateral)}</p>}
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant={STAGE_META[c.stage].badge} className="text-[10px] uppercase">{STAGE_META[c.stage].label}</Badge>
                                            <div className="mt-1.5 flex gap-0.5" aria-label="Progresso do processo">
                                                {LEGAL_STAGES.map((s, i) => (
                                                    <span key={s} className={cn('h-1 w-5 rounded-full', i <= stageIndex(c.stage) ? 'bg-primary' : 'bg-muted')} />
                                                ))}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <span className={cn('rounded px-2 py-0.5 text-[10px] font-bold uppercase', PRIORITY_META[c.priority].className)}>{PRIORITY_META[c.priority].label}</span>
                                        </TableCell>
                                        <TableCell className="text-xs tabular-nums">{age} dias</TableCell>
                                        <TableCell className="max-w-[220px]">
                                            <p className="truncate text-xs italic text-slate-500" title={c.lastAction}>{c.lastAction || '—'}</p>
                                            {c.stage !== 'closed' && (
                                                <p className={cn('text-[10px] flex items-center gap-1', stale ? 'text-rose-600 font-bold' : 'text-muted-foreground')}>
                                                    <Clock className="h-3 w-3" /> {sinceUpdate === 0 ? 'hoje' : `há ${sinceUpdate} dias`}{stale && ' · parado'}
                                                </p>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Ações"><MoreHorizontal className="h-4 w-4" /></Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end">
                                                    <DropdownMenuItem className="gap-2" onClick={() => setDetailOf(c)}><History className="h-4 w-4" /> Ver processo e histórico</DropdownMenuItem>
                                                    {c.stage !== 'closed' && (
                                                        <>
                                                            <DropdownMenuItem className="gap-2" onClick={() => { setDiligence({ date: todayISO(), type: DILIGENCE_TYPES[0], text: '' }); setDiligenceFor(c); }}>
                                                                <MessageSquarePlus className="h-4 w-4" /> Registar diligência
                                                            </DropdownMenuItem>
                                                            {next && (
                                                                <DropdownMenuItem className="gap-2" onClick={() => advanceStage(c)}>
                                                                    <ArrowRight className="h-4 w-4" /> {next === 'closed' ? 'Encerrar processo' : `Avançar para ${STAGE_META[next].short}`}
                                                                </DropdownMenuItem>
                                                            )}
                                                            {(c.stage === 'interpellated' || c.stage === 'mediation') && (
                                                                <DropdownMenuItem className="gap-2" onClick={() => issueLetter(c)}><FileText className="h-4 w-4" /> Emitir carta de cobrança (PDF)</DropdownMenuItem>
                                                            )}
                                                        </>
                                                    )}
                                                    <DropdownMenuItem className="gap-2" onClick={() => { setPrefill(undefined); setEditingCase(c); setIsModalOpen(true); }}><Pencil className="h-4 w-4" /> Editar</DropdownMenuItem>
                                                    <DropdownMenuSeparator />
                                                    <DropdownMenuItem className="gap-2 text-red-600 focus:text-red-600" onClick={() => handleDelete(c.id)}><Trash className="h-4 w-4" /> Remover</DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </div>
            </div>

            {/* Criar / editar */}
            <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>{editingCase ? 'Editar Processo' : 'Novo Processo'}</DialogTitle>
                        <DialogDescription>{editingCase ? 'Actualize o estado e as diligências do processo.' : 'Inicie um novo processo de contencioso para recuperação de crédito.'}</DialogDescription>
                    </DialogHeader>
                    <LegalCaseForm
                        key={editingCase?.id || prefill?.creditId || 'new'}
                        onSubmit={handleSubmit}
                        onCancel={() => setIsModalOpen(false)}
                        clients={clients}
                        credits={credits}
                        initialData={editingCase}
                        prefill={prefill}
                    />
                </DialogContent>
            </Dialog>

            {/* Diligência */}
            <Dialog open={!!diligenceFor} onOpenChange={(o) => !o && setDiligenceFor(null)}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle>Registar diligência</DialogTitle>
                        <DialogDescription>{diligenceFor?.id} · {clientsById.get(diligenceFor?.clientId || '')?.name}</DialogDescription>
                    </DialogHeader>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label>Data</Label>
                            <Input type="date" max={todayISO()} value={diligence.date} onChange={e => setDiligence(s => ({ ...s, date: e.target.value }))} />
                        </div>
                        <div className="space-y-1.5">
                            <Label>Tipo</Label>
                            <Select value={diligence.type} onValueChange={v => setDiligence(s => ({ ...s, type: v }))}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>{DILIGENCE_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                            </Select>
                        </div>
                        <div className="col-span-2 space-y-1.5">
                            <Label>Descrição</Label>
                            <Textarea rows={3} value={diligence.text} onChange={e => setDiligence(s => ({ ...s, text: e.target.value }))} placeholder="Ex.: devedor comprometeu-se a pagar 50.000 Kz até 30/10" />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDiligenceFor(null)}>Cancelar</Button>
                        <Button onClick={saveDiligence} disabled={busy}>Gravar</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Encerramento */}
            <Dialog open={!!closing} onOpenChange={(o) => !o && setClosing(null)}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle>Encerrar processo</DialogTitle>
                        <DialogDescription>{closing?.id} · {formatCurrency(Number(closing?.debtAmount || 0))}</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3">
                        <div className="space-y-1.5">
                            <Label>Resultado</Label>
                            <Select value={closeForm.outcome} onValueChange={v => setCloseForm(s => ({ ...s, outcome: v }))}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>{CLOSE_OUTCOMES.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                            </Select>
                            <p className="text-[11px] text-muted-foreground">"Incobrável" e "Desistência" não contam como valor recuperado.</p>
                        </div>
                        <div className="space-y-1.5">
                            <Label>Fundamentação (obrigatória)</Label>
                            <Textarea rows={3} value={closeForm.text} onChange={e => setCloseForm(s => ({ ...s, text: e.target.value }))} placeholder="Ex.: pagamento integral recebido, recibo RC 2026/210" />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setClosing(null)}>Cancelar</Button>
                        <Button onClick={confirmClose} disabled={busy}>Encerrar processo</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Detalhe / histórico */}
            <Dialog open={!!detailOf} onOpenChange={(o) => !o && setDetailOf(null)}>
                <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
                    {detailOf && detailTimeline && (
                        <>
                            <DialogHeader>
                                <DialogTitle className="flex items-center gap-2">{detailOf.id} <Badge variant={STAGE_META[detailOf.stage].badge} className="text-[10px] uppercase">{STAGE_META[detailOf.stage].label}</Badge></DialogTitle>
                                <DialogDescription>{clientsById.get(detailOf.clientId)?.name} · crédito {detailOf.creditId}</DialogDescription>
                            </DialogHeader>
                            <div className="grid grid-cols-3 gap-2 text-center">
                                <div className="rounded-lg bg-muted/50 p-2"><p className="text-[10px] uppercase text-muted-foreground font-bold">Dívida</p><p className="font-bold text-sm">{formatCurrency(Number(detailOf.debtAmount || 0))}</p></div>
                                <div className="rounded-lg bg-muted/50 p-2"><p className="text-[10px] uppercase text-muted-foreground font-bold">Aberto em</p><p className="font-bold text-sm">{fmtDate(detailOf.createdAt)}</p></div>
                                <div className="rounded-lg bg-muted/50 p-2"><p className="text-[10px] uppercase text-muted-foreground font-bold">Garantias</p><p className="font-bold text-sm">{formatCurrency(collateralByClient.get(detailOf.clientId) || 0)}</p></div>
                            </div>
                            <div className="space-y-3">
                                <p className="text-xs font-black uppercase tracking-wider text-muted-foreground">Cronologia</p>
                                {detailTimeline.entries.length === 0 && <p className="text-sm text-muted-foreground">Sem diligências registadas.</p>}
                                <ol className="relative border-l pl-4 space-y-3">
                                    {detailTimeline.entries.map((e, i) => (
                                        <li key={i} className="text-sm">
                                            <span className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full border-2 border-background bg-primary" />
                                            <p className="text-[11px] text-muted-foreground"><b className="text-foreground">{e.kind}</b> · {e.date.split('-').reverse().join('/')} · {e.author}</p>
                                            <p>{e.text}</p>
                                        </li>
                                    ))}
                                </ol>
                                {detailTimeline.freeText && <div className="rounded-lg bg-muted/50 p-3 text-xs whitespace-pre-wrap"><b>Notas:</b> {detailTimeline.freeText}</div>}
                            </div>
                        </>
                    )}
                </DialogContent>
            </Dialog>
        </MainLayout>
    );
}
