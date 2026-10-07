import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
    BookOpen, BookText, CalendarCheck, ClipboardCheck, FileClock, FilePlus2, HandCoins, History, Landmark, LayoutDashboard, ListChecks,
    Loader2, PiggyBank, RefreshCw, Scale, ScrollText, Settings2, ShieldCheck, TrendingUp, Users, Wallet, Waves, BookMarked, Receipt,
} from 'lucide-react';
import { MainLayout } from '@/componentes/layout/MainLayout';
import { Button } from '@/componentes/ui/button';
import { Badge } from '@/componentes/ui/badge';
import { SeletorPeriodo } from '@/componentes/comum/SeletorPeriodo';
import { defaultPeriod, periodRange, type PeriodSelection } from '@/bibliotecas/periodos';
import { formatDateTime } from '@/bibliotecas/formatters';
import { cn } from '@/bibliotecas/utils';
import { useContabilidade } from '@/componentes/contabilidade/useContabilidade';
import { CartoesContabeis, PainelContabil, type SeccaoContabil } from '@/componentes/contabilidade/PainelContabil';
import { DiarioGeral } from '@/componentes/contabilidade/DiarioGeral';
import { Balancete, FluxoCaixa, RazaoConta, Resultados } from '@/componentes/contabilidade/Livros';
import { CaixaPorOperador, DialogoLancamento, LancamentosManuais, ReconciliacaoBancaria } from '@/componentes/contabilidade/Tesouraria';
import type { JournalKind } from '@/componentes/contabilidade/formato';
import { CarteiraProvisoes, Cobranca, Rentabilidade } from '@/componentes/contabilidade/Carteira';
import { AuditoriaExecucao, HistoricoAuditorias } from '@/componentes/contabilidade/AuditoriaContabil';
import { FechoPeriodo, PedidosAprovacao, TrilhaUtilizadores } from '@/componentes/contabilidade/ControloContabil';
import { PlanoContas, RegrasContabeis } from '@/componentes/contabilidade/Configuracao';
import { BotaoPanico } from '@/componentes/contabilidade/ControloPanico';
import { GuiaContabil } from '@/componentes/contabilidade/GuiaContabil';
import { AvisoErro } from '@/componentes/contabilidade/comum';
import type { AuditKind } from '@/bibliotecas/auditoria-contabil';

type NavItem = { id: SeccaoContabil; label: string; icon: any };
const NAVIGATION: Array<{ group: string; items: NavItem[] }> = [
    { group: 'Visão geral', items: [{ id: 'painel', label: 'Painel', icon: LayoutDashboard }] },
    {
        group: 'Livros contabilísticos', items: [
            { id: 'diario', label: 'Diário Geral', icon: BookText },
            { id: 'balancete', label: 'Balancete', icon: Scale },
            { id: 'razao', label: 'Razão por Conta', icon: BookOpen },
            { id: 'resultados', label: 'Demonstração de Resultados', icon: TrendingUp },
            { id: 'fluxo', label: 'Fluxo de Caixa', icon: Waves },
        ],
    },
    {
        group: 'Tesouraria', items: [
            { id: 'lancamentos', label: 'Lançamentos', icon: FilePlus2 },
            { id: 'reconciliacao', label: 'Reconciliação Bancária', icon: Landmark },
            { id: 'caixa', label: 'Caixa por Operador', icon: Wallet },
        ],
    },
    {
        group: 'Carteira', items: [
            { id: 'carteira', label: 'Carteira e Provisões', icon: PiggyBank },
            { id: 'cobranca', label: 'Cobrança e Gestores', icon: HandCoins },
            { id: 'rentabilidade', label: 'Rentabilidade', icon: Receipt },
        ],
    },
    {
        group: 'Auditoria e controlo', items: [
            { id: 'auditoria', label: 'Auditorias', icon: ShieldCheck },
            { id: 'historico', label: 'Histórico de Auditorias', icon: History },
            { id: 'pedidos', label: 'Pedidos de Aprovação', icon: ListChecks },
            { id: 'trilha', label: 'Trilha de Utilizadores', icon: Users },
            { id: 'fecho', label: 'Fecho de Período', icon: CalendarCheck },
        ],
    },
    {
        group: 'Configuração', items: [
            { id: 'plano', label: 'Plano de Contas', icon: ScrollText },
            { id: 'regras', label: 'Regras de Controlo', icon: Settings2 },
            { id: 'guia', label: 'Guia', icon: BookMarked },
        ],
    },
];
const ALL_SECTIONS = new Set(NAVIGATION.flatMap(group => group.items.map(item => item.id)));

export default function Accounting() {
    const data = useContabilidade();
    const [searchParams, setSearchParams] = useSearchParams();
    const requested = searchParams.get('secao') as SeccaoContabil | null;
    const section: SeccaoContabil = requested && ALL_SECTIONS.has(requested) ? requested : 'painel';
    const [period, setPeriod] = useState<PeriodSelection>(() => defaultPeriod(new Date(), 'month'));
    const range = useMemo(() => periodRange(period), [period]);
    const [auditRequest, setAuditRequest] = useState<{ kind: AuditKind; nonce: number } | null>(null);
    const [journalDialog, setJournalDialog] = useState<{ open: boolean; kind: JournalKind; amount?: number }>({ open: false, kind: 'capital_entry' });

    const open = (next: SeccaoContabil) => {
        const params = new URLSearchParams(searchParams);
        params.set('secao', next);
        setSearchParams(params, { replace: true });
    };
    const openJournal = (kind: JournalKind = 'capital_entry', amount?: number) => setJournalDialog({ open: true, kind, amount });
    const monthsWithData = useMemo(() => new Set(data.journal.filter(entry => new Date(entry.timestamp).getFullYear() === period.year).map(entry => new Date(entry.timestamp).getMonth())), [data.journal, period.year]);
    const openFindings = (data.evaluation?.findings || []).filter(finding => finding.severity !== 'low' && (!finding.justification || finding.justification.state === 'pending'));
    const criticalOpen = openFindings.some(finding => finding.severity === 'critical');
    const pendingRequests = data.requests.filter(request => request.status === 'pending').length;
    const badgeFor = (id: SeccaoContabil) => id === 'auditoria' && openFindings.length ? { value: openFindings.length, tone: criticalOpen ? 'destructive' as const : 'warning' as const }
        : id === 'pedidos' && pendingRequests ? { value: pendingRequests, tone: 'warning' as const } : null;

    const props = { data, range, rangeLabel: range.label };
    const content = (() => {
        switch (section) {
            case 'diario': return <DiarioGeral {...props} />;
            case 'balancete': return <Balancete {...props} />;
            case 'razao': return <RazaoConta {...props} />;
            case 'resultados': return <Resultados {...props} />;
            case 'fluxo': return <FluxoCaixa {...props} />;
            case 'lancamentos': return <LancamentosManuais {...props} onNew={kind => openJournal(kind)} />;
            case 'reconciliacao': return <ReconciliacaoBancaria {...props} />;
            case 'caixa': return <CaixaPorOperador />;
            case 'carteira': return <CarteiraProvisoes data={data} onJournal={openJournal} />;
            case 'cobranca': return <Cobranca {...props} />;
            case 'rentabilidade': return <Rentabilidade {...props} />;
            case 'auditoria': return <AuditoriaExecucao data={data} pedido={auditRequest} onPedidoTratado={() => setAuditRequest(null)} />;
            case 'historico': return <HistoricoAuditorias data={data} />;
            case 'pedidos': return <PedidosAprovacao data={data} />;
            case 'trilha': return <TrilhaUtilizadores {...props} />;
            case 'fecho': return <FechoPeriodo data={data} />;
            case 'plano': return <PlanoContas data={data} />;
            case 'regras': return <RegrasContabeis data={data} />;
            case 'guia': return <GuiaContabil />;
            default: return <PainelContabil data={data} range={range} onOpen={open} onCapital={() => openJournal('capital_entry')} />;
        }
    })();

    return (
        <MainLayout title="Contabilidade" subtitle="Razão geral, auditoria e controlo financeiro">
            <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-start">
                <div className="min-w-0 flex-1"><SeletorPeriodo value={period} onChange={setPeriod} monthsWithData={monthsWithData} /></div>
                <div className="flex flex-wrap items-center gap-2 xl:pt-1">
                    <Button size="sm" variant="outline" className="gap-2" onClick={() => openJournal()}><FilePlus2 className="h-4 w-4" />Novo lançamento</Button>
                    <Button size="sm" className="gap-2" onClick={() => { setAuditRequest({ kind: 'integrity', nonce: Date.now() }); open('auditoria'); }}><ShieldCheck className="h-4 w-4" />Verificar integridade</Button>
                    <Button size="sm" variant="outline" className="gap-2" onClick={() => { setAuditRequest({ kind: 'full', nonce: Date.now() }); open('auditoria'); }}><ClipboardCheck className="h-4 w-4" />Auditoria completa</Button>
                    <BotaoPanico panic={data.panic} onChanged={data.reload} />
                    <Button size="icon" variant="ghost" className="h-9 w-9" title="Actualizar" onClick={() => void data.reload()} disabled={data.loading}>
                        {data.loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    </Button>
                </div>
            </div>
            <AvisoErro message={data.error} />
            <p className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
                <FileClock className="h-3.5 w-3.5" />
                {data.loadedAt ? `Razão lido em ${formatDateTime(data.loadedAt)} · ${data.journal.length} lançamentos · período: ${range.label}` : 'A ler o razão…'}
            </p>

            <CartoesContabeis data={data} range={range} rangeLabel={range.label} onOpen={open} />

            <div className="mt-6 grid gap-6 lg:grid-cols-[230px_minmax(0,1fr)]">
                <nav aria-label="Secções da contabilidade" className="lg:sticky lg:top-0 lg:self-start">
                    <div className="flex gap-2 overflow-x-auto pb-2 lg:flex-col lg:gap-4 lg:overflow-visible lg:pb-0">
                        {NAVIGATION.map(group => (
                            <div key={group.group} className="flex shrink-0 gap-2 lg:flex-col lg:gap-0.5">
                                <p className="hidden px-3 pb-1 text-[10px] font-black uppercase tracking-widest text-muted-foreground lg:block">{group.group}</p>
                                {group.items.map(item => {
                                    const Icon = item.icon;
                                    const badge = badgeFor(item.id);
                                    const active = section === item.id;
                                    return (
                                        <button key={item.id} type="button" onClick={() => open(item.id)} aria-current={active ? 'page' : undefined}
                                            className={cn('flex shrink-0 items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors',
                                                active ? 'bg-sidebar text-white shadow' : 'border bg-card text-foreground hover:bg-muted lg:border-transparent lg:bg-transparent')}>
                                            <Icon className={cn('h-4 w-4 shrink-0', active ? 'text-amber-300' : 'text-muted-foreground')} />
                                            <span className="flex-1">{item.label}</span>
                                            {badge && <Badge variant={badge.tone} className="h-5 px-1.5 text-[10px]">{badge.value}</Badge>}
                                        </button>
                                    );
                                })}
                            </div>
                        ))}
                    </div>
                </nav>
                <section className="min-w-0 rounded-2xl border bg-card/40 p-4 md:p-6">{content}</section>
            </div>

            <DialogoLancamento open={journalDialog.open} initialKind={journalDialog.kind} initialAmount={journalDialog.amount} data={data}
                onOpenChange={value => setJournalDialog(previous => ({ ...previous, open: value }))} />
        </MainLayout>
    );
}
