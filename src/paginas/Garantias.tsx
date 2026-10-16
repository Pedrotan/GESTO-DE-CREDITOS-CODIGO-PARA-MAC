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
    Search, Plus, ShieldCheck, FileText, Camera, MapPin, MoreHorizontal, Pencil, Trash, Download,
    ClipboardCheck, Lock, Unlock, History, AlertTriangle, ShieldAlert, Image as ImageIcon, FileCheck2,
} from 'lucide-react';
import { formatCurrency } from '@/bibliotecas/formatters';
import { cn } from '@/bibliotecas/utils';
import { exportToExcel } from '@/bibliotecas/ExcelHelper';
import { toast } from '@/componentes/ui/use-toast';
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/componentes/ui/dropdown-menu';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/componentes/ui/dialog';
import { WarrantyForm } from '@/componentes/forms/WarrantyForm';
import { Warranty } from '@/tipos/contencioso';
import {
    computePortfolioRisk, eligibleCollateralValue, warrantyHaircut, lastInspectionDate, needsInspection,
    warrantyDocumentationScore, appendTimelineEntry, parseTimeline, creditExposure, daysPastDue, isOpenCredit,
    WARRANTY_HAIRCUTS, INSPECTION_INTERVAL_MONTHS,
} from '@/bibliotecas/risco-carteira';

type StatusFilter = 'all' | 'active' | 'seized' | 'released' | 'inspection' | 'nodocs';
type SortKey = 'recent' | 'value' | 'ltv' | 'inspection';

const STATUS_LABEL: Record<Warranty['status'], string> = { active: 'Activa', seized: 'Apreendida', released: 'Libertada' };
const todayISO = () => new Date().toISOString().slice(0, 10);
const fmtDate = (d: Date) => d.toLocaleDateString('pt-AO', { day: '2-digit', month: '2-digit', year: 'numeric' });

function ltvTone(ltv: number | null) {
    if (ltv === null) return 'text-muted-foreground';
    if (ltv <= 0.6) return 'text-emerald-600 dark:text-emerald-400';
    if (ltv <= 0.8) return 'text-amber-600 dark:text-amber-400';
    return 'text-rose-600 dark:text-rose-400';
}

function KpiCard({ variant, icon, title, value, hint, valueTitle }: {
    variant: string; icon: React.ReactNode; title: string; value: React.ReactNode; hint: string; valueTitle?: string;
}) {
    return (
        <div className={variant}>
            <div className="flex items-center gap-2.5 min-w-0">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/10 dark:bg-white/10 text-slate-950 dark:text-white shrink-0">{icon}</div>
                <p className="text-sm sm:text-base font-bold text-slate-950 dark:text-white truncate tracking-tight">{title}</p>
            </div>
            <div className="my-2">
                <p className="font-display text-2xl sm:text-3xl font-black tracking-tight text-slate-950 dark:text-white truncate" title={valueTitle}>{value}</p>
            </div>
            <p className="text-xs font-semibold text-slate-900/75 dark:text-slate-400 truncate" title={hint}>{hint}</p>
        </div>
    );
}

export default function Garantias() {
    const { clients, credits, warranties, legalCases, addWarranty, updateWarranty, deleteWarranty } = useData();
    const { user } = useAuth();
    const actor = user ? { id: user.id, name: user.name } : undefined;

    const [searchTerm, setSearchTerm] = useState('');
    const [typeFilter, setTypeFilter] = useState<string>('all');
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
    const [sortBy, setSortBy] = useState<SortKey>('recent');

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingWarranty, setEditingWarranty] = useState<Warranty | undefined>(undefined);
    const [prefill, setPrefill] = useState<{ clientId?: string; creditId?: string } | undefined>(undefined);

    const [inspecting, setInspecting] = useState<Warranty | null>(null);
    const [inspection, setInspection] = useState({ date: todayISO(), condition: 'Bom', value: '', location: '', notes: '' });

    const [statusChange, setStatusChange] = useState<{ warranty: Warranty; to: 'seized' | 'released' } | null>(null);
    const [statusReason, setStatusReason] = useState('');
    const [historyOf, setHistoryOf] = useState<Warranty | null>(null);
    const [busy, setBusy] = useState(false);

    // ---------------------------------------------------------------- dados
    const clientsById = useMemo(() => new Map(clients.map(c => [c.id, c])), [clients]);
    const creditsById = useMemo(() => new Map(credits.map(c => [c.id, c])), [credits]);

    const portfolio = useMemo(
        () => computePortfolioRisk({ credits: credits as any[], warranties: warranties as any[], legalCases: legalCases as any[], clients: clients as any[] }),
        [credits, warranties, legalCases, clients]
    );

    const rows = useMemo(() => {
        const today = new Date();
        return warranties.map(w => {
            const client = clientsById.get(w.clientId);
            const credit = w.creditId ? creditsById.get(w.creditId) : undefined;
            const linkedOpen = credit && isOpenCredit(credit as any) ? credit : undefined;
            const exposure = linkedOpen ? creditExposure(linkedOpen as any) : (portfolio.perClient.get(w.clientId)?.exposure ?? 0);
            const market = Number(w.marketValue || 0);
            const lastVisit = lastInspectionDate(w as any);
            return {
                warranty: w,
                clientName: client?.name || 'Cliente removido',
                credit,
                exposure,
                dpd: linkedOpen ? daysPastDue(linkedOpen as any, today) : (portfolio.perClient.get(w.clientId)?.maxDpd ?? 0),
                eligible: eligibleCollateralValue(w as any),
                ltv: w.status === 'active' && exposure > 0 && market > 0 ? exposure / market : null,
                lastVisit,
                inspectionDue: needsInspection(w as any, today),
                docs: warrantyDocumentationScore(w as any),
            };
        });
    }, [warranties, clientsById, creditsById, portfolio]);

    const filteredRows = useMemo(() => {
        const term = searchTerm.trim().toLowerCase();
        const list = rows.filter(r => {
            const w = r.warranty;
            if (typeFilter !== 'all' && w.type !== typeFilter) return false;
            if (statusFilter === 'inspection' && !r.inspectionDue) return false;
            if (statusFilter === 'nodocs' && (w.status !== 'active' || r.docs.complete)) return false;
            if (['active', 'seized', 'released'].includes(statusFilter) && w.status !== statusFilter) return false;
            if (!term) return true;
            return [w.id, w.description, w.type, w.location, r.clientName, w.creditId].some(v => String(v || '').toLowerCase().includes(term));
        });
        const sorted = [...list];
        if (sortBy === 'value') sorted.sort((a, b) => Number(b.warranty.marketValue) - Number(a.warranty.marketValue));
        else if (sortBy === 'ltv') sorted.sort((a, b) => (b.ltv ?? -1) - (a.ltv ?? -1));
        else if (sortBy === 'inspection') sorted.sort((a, b) => a.lastVisit.getTime() - b.lastVisit.getTime());
        else sorted.sort((a, b) => String(b.warranty.createdAt).localeCompare(String(a.warranty.createdAt)));
        return sorted;
    }, [rows, searchTerm, typeFilter, statusFilter, sortBy]);

    const stats = useMemo(() => {
        const active = rows.filter(r => r.warranty.status === 'active');
        return {
            active: active.length,
            seized: rows.filter(r => r.warranty.status === 'seized').length,
            released: rows.filter(r => r.warranty.status === 'released').length,
            market: active.reduce((s, r) => s + Number(r.warranty.marketValue || 0), 0),
            eligible: active.reduce((s, r) => s + r.eligible, 0),
            inspections: rows.filter(r => r.inspectionDue).length,
            noDocs: active.filter(r => !r.docs.complete).length,
            byType: Object.keys(WARRANTY_HAIRCUTS).map(type => {
                const list = active.filter(r => r.warranty.type === type);
                return { type, count: list.length, value: list.reduce((s, r) => s + Number(r.warranty.marketValue || 0), 0) };
            }),
        };
    }, [rows]);

    // Créditos em aberto sem qualquer garantia elegível (prioridade aos mais atrasados)
    const uncoveredCredits = useMemo(() => {
        return [...portfolio.perCredit.values()]
            .filter(r => r.collateralEligible <= 0)
            .sort((a, b) => b.dpd - a.dpd || b.exposure - a.exposure)
            .map(r => ({ risk: r, credit: creditsById.get(r.creditId) }))
            .filter(r => r.credit);
    }, [portfolio, creditsById]);

    // ------------------------------------------------------------- acções
    const openCreateModal = (fill?: { clientId?: string; creditId?: string }) => {
        setEditingWarranty(undefined);
        setPrefill(fill);
        setIsModalOpen(true);
    };

    const openEditModal = (warranty: Warranty) => {
        setPrefill(undefined);
        setEditingWarranty(warranty);
        setIsModalOpen(true);
    };

    const handleSubmit = async (data: any) => {
        try {
            if (editingWarranty) await updateWarranty(editingWarranty.id, data, actor);
            else await addWarranty(data, actor);
            setIsModalOpen(false);
            setEditingWarranty(undefined);
            setPrefill(undefined);
            toast({ title: editingWarranty ? 'Garantia actualizada' : 'Garantia registada' });
        } catch (error) {
            console.error('Erro ao gravar garantia:', error);
            toast({ title: 'Não foi possível gravar a garantia', description: String((error as Error)?.message || error), variant: 'destructive' });
        }
    };

    const handleDelete = async (id: string) => {
        if (confirm('Deseja mover esta garantia para a lixeira? Poderá restaurá-la mais tarde se necessário.')) {
            await deleteWarranty(id, actor);
        }
    };

    const openInspection = (w: Warranty) => {
        setInspecting(w);
        setInspection({ date: todayISO(), condition: 'Bom', value: String(w.marketValue || ''), location: w.location || '', notes: '' });
    };

    const saveInspection = async () => {
        if (!inspecting) return;
        const newValue = Number(inspection.value);
        if (!inspection.date || inspection.date > todayISO()) {
            toast({ title: 'Data inválida', description: 'A data da vistoria não pode ser futura.', variant: 'destructive' });
            return;
        }
        if (!Number.isFinite(newValue) || newValue <= 0) {
            toast({ title: 'Valor inválido', description: 'Indique o valor de mercado apurado na vistoria.', variant: 'destructive' });
            return;
        }
        const old = Number(inspecting.marketValue || 0);
        const delta = old > 0 ? ((newValue - old) / old) * 100 : 0;
        const parts = [`Estado: ${inspection.condition}`];
        if (Math.abs(newValue - old) > 0.009) parts.push(`Reavaliação ${formatCurrency(old)} → ${formatCurrency(newValue)} (${delta >= 0 ? '+' : ''}${delta.toFixed(1)}%)`);
        if (inspection.location && inspection.location !== inspecting.location) parts.push(`Local: ${inspection.location}`);
        if (inspection.notes.trim()) parts.push(inspection.notes.trim());
        setBusy(true);
        try {
            await updateWarranty(inspecting.id, {
                marketValue: newValue,
                location: inspection.location || inspecting.location,
                notes: appendTimelineEntry(inspecting.notes, { date: inspection.date, kind: 'VISTORIA', author: user?.name || 'Sistema', text: parts.join(' · ') }),
            }, actor);
            toast({ title: 'Vistoria registada', description: delta < -20 ? 'Atenção: desvalorização superior a 20% — reveja a cobertura do crédito.' : undefined });
            setInspecting(null);
        } finally {
            setBusy(false);
        }
    };

    const linkedExposure = (w: Warranty) => rows.find(r => r.warranty.id === w.id)?.exposure ?? 0;

    const confirmStatusChange = async () => {
        if (!statusChange) return;
        const reason = statusReason.trim();
        if (reason.length < 10) {
            toast({ title: 'Justificação obrigatória', description: 'Descreva o motivo (mínimo 10 caracteres). Fica registado no histórico e na auditoria.', variant: 'destructive' });
            return;
        }
        const { warranty, to } = statusChange;
        setBusy(true);
        try {
            await updateWarranty(warranty.id, {
                status: to,
                notes: appendTimelineEntry(warranty.notes, { date: todayISO(), kind: to === 'seized' ? 'APREENSÃO' : 'LIBERTAÇÃO', author: user?.name || 'Sistema', text: reason }),
            }, actor);
            toast({ title: to === 'seized' ? 'Garantia apreendida' : 'Garantia libertada' });
            setStatusChange(null);
            setStatusReason('');
        } finally {
            setBusy(false);
        }
    };

    const handleExport = () => {
        if (filteredRows.length === 0) {
            toast({ title: 'Nada para exportar', description: 'A lista filtrada está vazia.' });
            return;
        }
        exportToExcel(filteredRows.map(r => ({
            'ID': r.warranty.id,
            'Tipo': r.warranty.type,
            'Cliente': r.clientName,
            'Crédito': r.warranty.creditId || '',
            'Descrição': r.warranty.description,
            'Valor de mercado': Number(r.warranty.marketValue || 0),
            'Haircut': `${Math.round(warrantyHaircut(r.warranty.type) * 100)}%`,
            'Valor elegível': Math.round(r.eligible * 100) / 100,
            'Exposição coberta': Math.round(r.exposure * 100) / 100,
            'LTV': r.ltv === null ? '' : `${(r.ltv * 100).toFixed(1)}%`,
            'Localização': r.warranty.location || '',
            'Última vistoria': fmtDate(r.lastVisit),
            'Vistoria pendente': r.inspectionDue ? 'Sim' : 'Não',
            'Fotos': r.docs.photos,
            'Documentos': r.docs.documents,
            'Estado': STATUS_LABEL[r.warranty.status],
        })), `garantias_${todayISO()}`);
    };

    const coverageVariant = portfolio.totalExposure === 0 ? 'card-kpi-sky' : portfolio.coverageRatio >= 0.5 ? 'card-kpi-mint' : portfolio.coverageRatio >= 0.2 ? 'card-kpi-amber' : 'card-kpi-coral';
    const timeline = historyOf ? parseTimeline(historyOf.notes) : null;

    return (
        <MainLayout title="Gestão de Garantias" subtitle="Colaterais, cobertura da carteira e vistorias">
            <div className="flex flex-col gap-6">
                {/* Barra de acções */}
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="relative w-full max-w-sm">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input placeholder="Pesquisar por bem, cliente, crédito ou local..." className="pl-10" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <Button variant="outline" className="gap-2" onClick={handleExport}>
                            <Download className="h-4 w-4" /> Exportar Excel
                        </Button>
                        <Button className="gap-2" onClick={() => openCreateModal()}>
                            <Plus className="h-4 w-4" /> Nova Garantia
                        </Button>
                    </div>
                </div>

                {/* KPIs */}
                <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
                    <KpiCard variant="card-kpi-sky" icon={<ShieldCheck className="h-5 w-5" />} title="Garantias Activas"
                        value={stats.active} hint={`${stats.seized} apreendidas · ${stats.released} libertadas · ${warranties.length} no total`} />
                    <KpiCard variant="card-kpi-mint" icon={<FileText className="h-5 w-5" />} title="Valor em Custódia"
                        value={formatCurrency(stats.market)} valueTitle={formatCurrency(stats.market)}
                        hint={`Elegível após haircut: ${formatCurrency(stats.eligible)}`} />
                    <KpiCard variant={coverageVariant} icon={<ShieldAlert className="h-5 w-5" />} title="Cobertura da Carteira"
                        value={`${(portfolio.coverageRatio * 100).toFixed(1)}%`}
                        hint={portfolio.totalExposure > 0 ? `Descoberto: ${formatCurrency(portfolio.totalExposure - portfolio.coveredExposure)}` : 'Sem créditos em aberto'} />
                    <KpiCard variant={stats.inspections > 0 ? 'card-kpi-amber' : 'card-kpi-mint'} icon={<Camera className="h-5 w-5" />} title="Vistorias Pendentes"
                        value={stats.inspections} hint={`Sem vistoria há +${INSPECTION_INTERVAL_MONTHS} meses · ${stats.noDocs} sem documentação completa`} />
                </div>

                {/* Créditos sem garantia + distribuição por tipo */}
                <div className="grid gap-4 lg:grid-cols-5">
                    <Card className="lg:col-span-3 card-elevated">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-600" /> Créditos em aberto sem garantia</CardTitle>
                            <CardDescription>Exposição sem colateral — ordenada pelo atraso. Registe uma garantia para reduzir o risco e as provisões.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            {uncoveredCredits.length === 0 ? (
                                <p className="text-sm text-muted-foreground py-4 text-center">Todos os créditos em aberto têm garantia associada.</p>
                            ) : (
                                <div className="space-y-2 max-h-[240px] overflow-y-auto pr-1">
                                    {uncoveredCredits.slice(0, 20).map(({ risk, credit }) => (
                                        <div key={risk.creditId} className="flex items-center justify-between gap-3 rounded-lg border p-2.5">
                                            <div className="min-w-0">
                                                <p className="text-sm font-semibold truncate">{clientsById.get(risk.clientId)?.name || credit?.clientName}</p>
                                                <p className="text-[11px] text-muted-foreground truncate">
                                                    {risk.creditId} · {formatCurrency(risk.exposure)} ·{' '}
                                                    <span className={cn('font-bold', risk.dpd > 30 ? 'text-rose-600' : risk.dpd > 0 ? 'text-amber-600' : 'text-emerald-600')}>
                                                        {risk.dpd > 0 ? `${risk.dpd} dias em atraso` : 'em dia'}
                                                    </span>
                                                </p>
                                            </div>
                                            <Button size="sm" variant="outline" className="shrink-0 gap-1.5 h-8" onClick={() => openCreateModal({ clientId: risk.clientId, creditId: risk.creditId })}>
                                                <Plus className="h-3.5 w-3.5" /> Garantia
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    <Card className="lg:col-span-2 card-elevated">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-base">Garantias activas por tipo</CardTitle>
                            <CardDescription>Valor de mercado e desconto prudencial (haircut) aplicado</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            {stats.byType.map(t => {
                                const share = stats.market > 0 ? (t.value / stats.market) * 100 : 0;
                                return (
                                    <div key={t.type}>
                                        <div className="flex items-center justify-between text-xs mb-1">
                                            <span className="font-semibold">{t.type} <span className="text-muted-foreground font-normal">· {t.count} · haircut {Math.round(warrantyHaircut(t.type) * 100)}%</span></span>
                                            <span className="font-bold tabular-nums">{formatCurrency(t.value)}</span>
                                        </div>
                                        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                                            <div className="h-full rounded-full bg-sky-500" style={{ width: `${share}%` }} />
                                        </div>
                                    </div>
                                );
                            })}
                        </CardContent>
                    </Card>
                </div>

                {/* Filtros */}
                <div className="flex flex-wrap items-center gap-2">
                    <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
                        <SelectTrigger className="w-[200px] h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Todos os estados</SelectItem>
                            <SelectItem value="active">Activas</SelectItem>
                            <SelectItem value="seized">Apreendidas</SelectItem>
                            <SelectItem value="released">Libertadas</SelectItem>
                            <SelectItem value="inspection">Vistoria pendente</SelectItem>
                            <SelectItem value="nodocs">Documentação incompleta</SelectItem>
                        </SelectContent>
                    </Select>
                    <Select value={typeFilter} onValueChange={setTypeFilter}>
                        <SelectTrigger className="w-[170px] h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Todos os tipos</SelectItem>
                            {Object.keys(WARRANTY_HAIRCUTS).map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                        </SelectContent>
                    </Select>
                    <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortKey)}>
                        <SelectTrigger className="w-[200px] h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="recent">Mais recentes</SelectItem>
                            <SelectItem value="value">Maior valor</SelectItem>
                            <SelectItem value="ltv">Maior LTV (mais risco)</SelectItem>
                            <SelectItem value="inspection">Vistoria mais antiga</SelectItem>
                        </SelectContent>
                    </Select>
                    <span className="text-xs text-muted-foreground ml-auto">{filteredRows.length} de {warranties.length} garantias</span>
                </div>

                {/* Tabela */}
                <div className="card-elevated overflow-x-auto">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Garantia</TableHead>
                                <TableHead>Cliente / Crédito</TableHead>
                                <TableHead>Descrição do Bem</TableHead>
                                <TableHead className="text-right">Valor de Mercado</TableHead>
                                <TableHead className="text-right" title="Exposição ÷ valor de mercado">LTV</TableHead>
                                <TableHead>Documentação</TableHead>
                                <TableHead>Última Vistoria</TableHead>
                                <TableHead>Estado</TableHead>
                                <TableHead className="text-right">Ações</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredRows.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={9} className="text-center py-10 text-muted-foreground">
                                        {warranties.length === 0 ? (
                                            <div className="flex flex-col items-center gap-2">
                                                <ShieldCheck className="h-8 w-8 opacity-40" />
                                                <p className="font-medium">Ainda não há garantias registadas.</p>
                                                <p className="text-xs">Registe imóveis, veículos ou equipamentos dados como colateral para proteger a carteira.</p>
                                                <Button size="sm" className="mt-2 gap-2" onClick={() => openCreateModal()}><Plus className="h-4 w-4" /> Registar primeira garantia</Button>
                                            </div>
                                        ) : 'Nenhuma garantia corresponde aos filtros.'}
                                    </TableCell>
                                </TableRow>
                            ) : filteredRows.map(r => {
                                const w = r.warranty;
                                return (
                                    <TableRow key={w.id}>
                                        <TableCell>
                                            <div className="flex flex-col">
                                                <span className="font-bold text-xs">{w.id}</span>
                                                <span className="text-[11px] text-muted-foreground uppercase">{w.type}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex flex-col">
                                                <span className="font-medium">{r.clientName}</span>
                                                <span className="text-[11px] text-muted-foreground">
                                                    {w.creditId ? w.creditId : 'Sem crédito associado'}
                                                    {r.dpd > 0 && <span className={cn('ml-1 font-bold', r.dpd > 30 ? 'text-rose-600' : 'text-amber-600')}>· {r.dpd}d atraso</span>}
                                                </span>
                                            </div>
                                        </TableCell>
                                        <TableCell className="max-w-[220px]">
                                            <p className="truncate" title={w.description}>{w.description}</p>
                                            <p className="flex items-center gap-1 text-[11px] text-muted-foreground"><MapPin className="h-3 w-3" />{w.location || 'Sem localização'}</p>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <p className="font-mono">{formatCurrency(Number(w.marketValue || 0))}</p>
                                            <p className="text-[11px] text-muted-foreground" title="Valor elegível após haircut">eleg. {formatCurrency(r.eligible)}</p>
                                        </TableCell>
                                        <TableCell className={cn('text-right font-bold tabular-nums', ltvTone(r.ltv))} title={r.ltv === null ? 'Sem exposição em aberto' : `Exposição ${formatCurrency(r.exposure)}`}>
                                            {r.ltv === null ? '—' : `${(r.ltv * 100).toFixed(0)}%`}
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-2 text-xs">
                                                <span className={cn('flex items-center gap-0.5', r.docs.photos ? 'text-foreground' : 'text-muted-foreground/60')} title="Fotos"><ImageIcon className="h-3.5 w-3.5" />{r.docs.photos}</span>
                                                <span className={cn('flex items-center gap-0.5', r.docs.documents ? 'text-foreground' : 'text-muted-foreground/60')} title="Documentos"><FileCheck2 className="h-3.5 w-3.5" />{r.docs.documents}</span>
                                                {!r.docs.complete && w.status === 'active' && <Badge variant="warning" className="text-[9px] px-1.5 py-0">Incompleta</Badge>}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex flex-col gap-0.5">
                                                <span className="text-xs">{fmtDate(r.lastVisit)}</span>
                                                {r.inspectionDue && <Badge variant="warning" className="text-[9px] w-fit px-1.5 py-0">Por revistar</Badge>}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant={w.status === 'active' ? 'success' : w.status === 'seized' ? 'destructive' : 'secondary'} className="text-[10px] uppercase">
                                                {STATUS_LABEL[w.status]}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Ações"><MoreHorizontal className="h-4 w-4" /></Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end">
                                                    <DropdownMenuItem className="gap-2" onClick={() => setHistoryOf(w)}><History className="h-4 w-4" /> Ver histórico</DropdownMenuItem>
                                                    <DropdownMenuItem className="gap-2" onClick={() => openEditModal(w)}><Pencil className="h-4 w-4" /> Editar</DropdownMenuItem>
                                                    {w.status === 'active' && (
                                                        <DropdownMenuItem className="gap-2" onClick={() => openInspection(w)}><ClipboardCheck className="h-4 w-4" /> Registar vistoria / reavaliação</DropdownMenuItem>
                                                    )}
                                                    <DropdownMenuSeparator />
                                                    {w.status === 'active' && (
                                                        <DropdownMenuItem className="gap-2 text-amber-700 focus:text-amber-700" onClick={() => { setStatusReason(''); setStatusChange({ warranty: w, to: 'seized' }); }}>
                                                            <Lock className="h-4 w-4" /> Executar / apreender
                                                        </DropdownMenuItem>
                                                    )}
                                                    {w.status !== 'released' && (
                                                        <DropdownMenuItem className="gap-2" onClick={() => { setStatusReason(''); setStatusChange({ warranty: w, to: 'released' }); }}>
                                                            <Unlock className="h-4 w-4" /> Libertar garantia
                                                        </DropdownMenuItem>
                                                    )}
                                                    <DropdownMenuItem className="gap-2 text-red-600 focus:text-red-600" onClick={() => handleDelete(w.id)}>
                                                        <Trash className="h-4 w-4" /> Remover
                                                    </DropdownMenuItem>
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

            {/* Formulário criar/editar */}
            <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>{editingWarranty ? 'Editar Garantia' : 'Nova Garantia'}</DialogTitle>
                        <DialogDescription>
                            {editingWarranty ? 'Actualize os detalhes da garantia / colateral.' : 'Registe um novo bem como garantia ou colateral.'}
                        </DialogDescription>
                    </DialogHeader>
                    <WarrantyForm
                        key={editingWarranty?.id || prefill?.creditId || 'new'}
                        onSubmit={handleSubmit}
                        onCancel={() => setIsModalOpen(false)}
                        clients={clients}
                        credits={credits}
                        initialData={editingWarranty}
                        prefill={prefill}
                    />
                </DialogContent>
            </Dialog>

            {/* Vistoria / reavaliação */}
            <Dialog open={!!inspecting} onOpenChange={(o) => !o && setInspecting(null)}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle>Registar vistoria</DialogTitle>
                        <DialogDescription>{inspecting?.description} — fica registado no histórico da garantia e na auditoria.</DialogDescription>
                    </DialogHeader>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label>Data da vistoria</Label>
                            <Input type="date" max={todayISO()} value={inspection.date} onChange={e => setInspection(s => ({ ...s, date: e.target.value }))} />
                        </div>
                        <div className="space-y-1.5">
                            <Label>Estado de conservação</Label>
                            <Select value={inspection.condition} onValueChange={v => setInspection(s => ({ ...s, condition: v }))}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {['Excelente', 'Bom', 'Razoável', 'Mau', 'Bem não localizado'].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <Label>Valor de mercado apurado (Kz)</Label>
                            <Input type="number" min={0} step="0.01" value={inspection.value} onChange={e => setInspection(s => ({ ...s, value: e.target.value }))} />
                        </div>
                        <div className="space-y-1.5">
                            <Label>Localização</Label>
                            <Input value={inspection.location} onChange={e => setInspection(s => ({ ...s, location: e.target.value }))} />
                        </div>
                        <div className="col-span-2 space-y-1.5">
                            <Label>Observações</Label>
                            <Textarea rows={3} value={inspection.notes} onChange={e => setInspection(s => ({ ...s, notes: e.target.value }))} placeholder="Danos, acessórios em falta, documentação verificada..." />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setInspecting(null)}>Cancelar</Button>
                        <Button onClick={saveInspection} disabled={busy}>Gravar vistoria</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Apreensão / libertação com justificação obrigatória */}
            <Dialog open={!!statusChange} onOpenChange={(o) => !o && setStatusChange(null)}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle>{statusChange?.to === 'seized' ? 'Executar / apreender garantia' : 'Libertar garantia'}</DialogTitle>
                        <DialogDescription>{statusChange?.warranty.description}</DialogDescription>
                    </DialogHeader>
                    {statusChange?.to === 'released' && linkedExposure(statusChange.warranty) > 0.01 && (
                        <div className="flex gap-2 rounded-lg border border-rose-200 bg-rose-50 dark:bg-rose-500/10 dark:border-rose-500/30 p-3 text-sm text-rose-800 dark:text-rose-200">
                            <ShieldAlert className="h-4 w-4 mt-0.5 shrink-0" />
                            <span>Atenção: o crédito/cliente ainda tem <b>{formatCurrency(linkedExposure(statusChange.warranty))}</b> em dívida. Libertar agora deixa essa exposição sem colateral.</span>
                        </div>
                    )}
                    {statusChange?.to === 'seized' && (
                        <p className="text-sm text-muted-foreground">Use quando o bem é executado para recuperação da dívida. A garantia deixa de contar para a cobertura da carteira.</p>
                    )}
                    <div className="space-y-1.5">
                        <Label>Justificação (obrigatória)</Label>
                        <Textarea rows={3} value={statusReason} onChange={e => setStatusReason(e.target.value)} placeholder="Ex.: crédito liquidado em 12/10/2026, recibo RC 2026/145" />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setStatusChange(null)}>Cancelar</Button>
                        <Button variant={statusChange?.to === 'seized' ? 'destructive' : 'default'} onClick={confirmStatusChange} disabled={busy}>Confirmar</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Histórico */}
            <Dialog open={!!historyOf} onOpenChange={(o) => !o && setHistoryOf(null)}>
                <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Histórico da garantia</DialogTitle>
                        <DialogDescription>{historyOf?.id} · {historyOf?.description}</DialogDescription>
                    </DialogHeader>
                    {timeline && (
                        <div className="space-y-3">
                            {timeline.entries.length === 0 && <p className="text-sm text-muted-foreground">Sem vistorias ou alterações de estado registadas.</p>}
                            <ol className="relative border-l pl-4 space-y-3">
                                {timeline.entries.map((e, i) => (
                                    <li key={i} className="text-sm">
                                        <span className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full border-2 border-background bg-primary" />
                                        <p className="text-[11px] text-muted-foreground"><b className="text-foreground">{e.kind}</b> · {e.date.split('-').reverse().join('/')} · {e.author}</p>
                                        <p>{e.text}</p>
                                    </li>
                                ))}
                            </ol>
                            {timeline.freeText && (
                                <div className="rounded-lg bg-muted/50 p-3 text-xs whitespace-pre-wrap"><b>Notas:</b> {timeline.freeText}</div>
                            )}
                            {historyOf && <p className="text-[11px] text-muted-foreground">Registada em {fmtDate(new Date(historyOf.createdAt))}{historyOf.updatedAt ? ` · actualizada em ${fmtDate(new Date(historyOf.updatedAt))}` : ''}</p>}
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </MainLayout>
    );
}
