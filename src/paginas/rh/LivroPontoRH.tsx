// Livro de ponto (especificação, fases 1 e 2): grelha a toda a largura com resumo, pesquisa e filtros, menu da
// célula e atalhos, painel do dia, resolver pendentes, acções em massa, validação/fecho/reabertura do mês,
// exportações e impressão; separadores «Hoje», «Justificações» e «Auditoria».
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlarmClock, ChevronLeft, ChevronRight, CircleHelp, Download, FileSpreadsheet, FileText, Lock, Printer, Settings, Tablet, TimerReset, TriangleAlert, Upload, UserCheck, Users, UserX, type LucideIcon } from 'lucide-react';
import { MainLayout } from '@/componentes/layout/MainLayout';
import { Button } from '@/componentes/ui/button';
import { Input } from '@/componentes/ui/input';
import { Switch } from '@/componentes/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/componentes/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/componentes/ui/popover';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/componentes/ui/tabs';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/componentes/ui/dropdown-menu';
import { cn } from '@/bibliotecas/utils';
import { luandaTodayKey } from '@/bibliotecas/fuso-angola';
import { formatarMinutos } from '@/bibliotecas/rh/ponto-calculo';
import type { LinhaGrelha } from '@/bibliotecas/rh/ponto-grelha';
import { gerarFolhasIndividuais, nomeDoMes, relatorioFaltas, relatorioHorasExtra, relatorioLivroMensal, relatorioPorDepartamento, relatorioRankingAtrasos, relatorioResumoAssiduidade } from '@/bibliotecas/rh/ponto-relatorios';
import { renderReportExcel, renderReportPdf, type ReportDef } from '@/bibliotecas/relatorios-pagamentos';
import { valorNumerico } from '@/bibliotecas/rh/parametros-rh';
import { ServicoPontoRH, type AcaoCelula, type Escopo } from '@/servicos/rh/ServicoPontoRH';
import { ServicoTempoRH } from '@/servicos/rh/ServicoTempoRH';
import { ServicoRH } from '@/servicos/rh/ServicoRH';
import { useActorRH } from '@/ganchos/usar-modulo-rh';
import { useData } from '@/contextos/ContextoDados';
import { NavegacaoRH, executar, useCarregar, Vazio } from '@/componentes/rh/comum-rh';
import { toast } from '@/ganchos/usar-toast';
import { useBaseRH } from './FuncionariosRH';
import { GrelhaPonto, type CampoDestaque } from '@/componentes/rh/ponto/GrelhaPonto';
import { BarraAccoesMassa, DialogoFalta, DialogoTexto, MenuCelula, ResolverPendentes, type AccaoMenu } from '@/componentes/rh/ponto/DialogosPonto';
import { PainelDiaPonto } from '@/componentes/rh/ponto/PainelDiaPonto';
import { AuditoriaPonto, ConfiguracaoPonto, DialogoPeriodo, ImportarPonto, JustificacoesPonto, PainelHojePonto, ROTULO_PERIODO } from '@/componentes/rh/ponto/SeccoesPonto';
import { BancoHorasPonto, EscalasPonto, RelogiosPonto } from '@/componentes/rh/ponto/ExtrasPonto';
import { ServicoRelogiosPonto } from '@/servicos/rh/ServicoRelogiosPonto';
import { ESTADOS, FILTROS_ESTADO, ORDENACOES, type FiltroEstado, type Ordenacao } from '@/componentes/rh/ponto/ponto-ui';

export const LIGACOES_TEMPO = [
    { path: '/rh/ponto', label: 'Livro de ponto' },
    { path: '/rh/ausencias', label: 'Dispensas e licenças' },
    { path: '/rh/calendario', label: 'Horários e calendário' },
];
const TODOS = '__todos__';
const CHAVE_HORAS = 'ponto_mostrar_horas';

/** Indicador da barra de resumo: ícone de linha numa pastilha com a cor do indicador, valor em destaque e legenda. */
const TONS_METRICA = {
    slate: 'bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700',
    emerald: 'bg-emerald-50 text-emerald-600 ring-emerald-100 dark:bg-emerald-950/50 dark:text-emerald-400 dark:ring-emerald-900',
    rose: 'bg-rose-50 text-rose-600 ring-rose-100 dark:bg-rose-950/50 dark:text-rose-400 dark:ring-rose-900',
    amber: 'bg-amber-50 text-amber-600 ring-amber-100 dark:bg-amber-950/50 dark:text-amber-400 dark:ring-amber-900',
    violet: 'bg-violet-50 text-violet-600 ring-violet-100 dark:bg-violet-950/50 dark:text-violet-400 dark:ring-violet-900',
    orange: 'bg-orange-50 text-orange-600 ring-orange-100 dark:bg-orange-950/50 dark:text-orange-400 dark:ring-orange-900',
} as const;
function MetricaResumo({ icone: Icone, tom, valor, unidade, rotulo }: { icone: LucideIcon; tom: keyof typeof TONS_METRICA; valor: string | number; unidade?: string; rotulo: string }) {
    return (
        <div className="flex items-center gap-2.5">
            <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset print:hidden', TONS_METRICA[tom])}>
                <Icone className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden />
            </span>
            <span className="leading-tight">
                <span className="block text-base font-black tabular-nums text-slate-900 dark:text-white">{valor}{unidade && <span className="ml-0.5 text-xs font-semibold text-slate-500">{unidade}</span>}</span>
                <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">{rotulo}</span>
            </span>
        </div>
    );
}
const lerHoras = () => { try { return localStorage.getItem(CHAVE_HORAS) === '1'; } catch { return false; } };

type Pedido =
    | { tipo: 'menu'; funcionarioId: string; data: string; alvo: HTMLElement }
    | { tipo: 'painel'; funcionarioId: string; data: string }
    | { tipo: 'falta'; funcionarioId: string; data: string }
    | { tipo: 'texto'; modo: 'limpar' | 'observacao' | 'massa'; celulas: Array<{ funcionarioId: string; data: string }>; acao?: AcaoCelula }
    | { tipo: 'pendentes' } | { tipo: 'importar' } | { tipo: 'configuracao' } | { tipo: 'periodo'; modo: 'validar' | 'fechar' | 'reabrir' }
    | null;

export default function LivroPontoRH() {
    const { actor, gerir, ver } = useActorRH();
    const { companySettings } = useData();
    const base = useBaseRH();
    const navigate = useNavigate();
    const hoje = luandaTodayKey();
    const [ano, setAno] = useState(Number(hoje.slice(0, 4)));
    const [mes, setMes] = useState(Number(hoje.slice(5, 7)));
    const [departamento, setDepartamento] = useState(TODOS);
    const [cargo, setCargo] = useState(TODOS);
    const [pesquisaBruta, setPesquisaBruta] = useState('');
    const [pesquisa, setPesquisa] = useState('');
    const [filtro, setFiltro] = useState<FiltroEstado>('todos');
    const [ordem, setOrdem] = useState<Ordenacao>('nome');
    const [mostrarHoras, setMostrarHoras] = useState(lerHoras);
    const [selecao, setSelecao] = useState<Set<string>>(new Set());
    const [activa, setActiva] = useState<string | null>(null);
    const [destaque, setDestaque] = useState<{ funcionarioId: string; campo: CampoDestaque } | null>(null);
    const [pedido, setPedido] = useState<Pedido>(null);
    const [imprimir, setImprimir] = useState(false);
    const [vista, setVista] = useState('grelha');

    useEffect(() => { const t = window.setTimeout(() => setPesquisa(pesquisaBruta.trim().toLowerCase()), 300); return () => window.clearTimeout(t); }, [pesquisaBruta]);
    useEffect(() => { try { localStorage.setItem(CHAVE_HORAS, mostrarHoras ? '1' : '0'); } catch { /* sem armazenamento */ } }, [mostrarHoras]);

    const dados = useCarregar(async () => {
        const [resultado, escopo, processado] = await Promise.all([
            ServicoPontoRH.grelha(ano, mes), actor ? ServicoPontoRH.escopo(actor) : Promise.resolve(null),
            ServicoTempoRH.mesBloqueado(`${ano}-${String(mes).padStart(2, '0')}-01`),
        ]);
        return { ...resultado, escopo, processado };
    }, null as null | (Awaited<ReturnType<typeof ServicoPontoRH.grelha>> & { escopo: Escopo | null; processado: string | null }), [ano, mes, actor?.id]);
    const recarregar = useCallback(() => { void dados.recarregar(); }, [dados.recarregar]);
    useEffect(() => {
        if (!actor || !gerir) return;
        const recolher = () => void ServicoRelogiosPonto.recolher(actor, { seNecessario: true }).then(r => { if (r?.importadas) recarregar(); }).catch(() => undefined);
        recolher();
        const t = window.setInterval(recolher, 120_000);
        return () => window.clearInterval(t);
    }, [actor, gerir, recarregar]);
    const d = dados.dados;
    const escopo = d?.escopo || null;
    const periodoEmpresa = d?.periodos.find(p => !p.departamento_id) || null;
    const estadoMes = periodoEmpresa?.estado || 'aberto';
    const bloqueado = estadoMes === 'fechado' || Boolean(d?.processado);
    const chefeSo = Boolean(escopo && !escopo.rh && escopo.departamentos.size);
    const departamentosVisiveis = base.dados.departamentos.filter(x => !chefeSo || escopo!.departamentos.has(x.id));
    const nomesDep = useMemo(() => new Map(base.dados.departamentos.map(x => [x.id, x.nome])), [base.dados.departamentos]);
    const nomesCargo = useMemo(() => new Map(base.dados.cargos.map(x => [x.id, x.nome])), [base.dados.cargos]);
    const podeEditar = useCallback((l: LinhaGrelha) => Boolean(escopo && ServicoPontoRH.podeGerir(escopo, l.funcionario)), [escopo]);

    const linhas = useMemo(() => {
        if (!d) return [];
        const lista = d.grelha.linhas.filter(l => {
            const f = l.funcionario;
            if (chefeSo && !escopo!.departamentos.has(f.departamento_id || '')) return false;
            if (departamento !== TODOS && f.departamento_id !== departamento) return false;
            if (cargo !== TODOS && f.cargo_id !== cargo) return false;
            if (pesquisa && !`${f.nome} ${f.numero_mecanografico}`.toLowerCase().includes(pesquisa)) return false;
            const t = l.totais;
            return { todos: true, faltas: t.faltas + t.faltas_just > 0, atrasos: t.minutos_atraso > 0, pendentes: t.pendentes > 0, extra: t.minutos_extra > 0, incompletos: t.incompletos > 0 }[filtro];
        });
        const porNome = (a: LinhaGrelha, b: LinhaGrelha) => a.funcionario.nome.localeCompare(b.funcionario.nome, 'pt');
        return lista.sort((a, b) => ({
            nome: porNome(a, b),
            departamento: (nomesDep.get(a.funcionario.departamento_id || '') || '~').localeCompare(nomesDep.get(b.funcionario.departamento_id || '') || '~', 'pt') || porNome(a, b),
            faltas: b.totais.faltas - a.totais.faltas || porNome(a, b),
            atraso: b.totais.minutos_atraso - a.totais.minutos_atraso || porNome(a, b),
        }[ordem]));
    }, [d, chefeSo, escopo, departamento, cargo, pesquisa, filtro, ordem, nomesDep]);

    // Resumo do mês das linhas visíveis (F1.12).
    const resumo = useMemo(() => {
        const t = linhas.map(l => l.totais);
        const dias = linhas.flatMap(l => l.dias.filter(x => x.util && x.data <= hoje && !['FORA', 'Fe', 'L', 'D'].includes(x.estado)));
        return {
            funcionarios: linhas.length, presenca: dias.length ? Math.round(dias.filter(x => x.estado === 'P').length / dias.length * 100) : 0,
            faltas: Math.round(t.reduce((s, x) => s + x.faltas, 0) * 100) / 100, atraso: t.reduce((s, x) => s + x.minutos_atraso, 0),
            extra: t.reduce((s, x) => s + x.minutos_extra, 0), pendentes: t.reduce((s, x) => s + x.pendentes, 0), incompletos: t.reduce((s, x) => s + x.incompletos, 0),
        };
    }, [linhas, hoje]);

    const mover = (delta: number) => { const x = new Date(Date.UTC(ano, mes - 1 + delta, 1)); setAno(x.getUTCFullYear()); setMes(x.getUTCMonth() + 1); setSelecao(new Set()); setDestaque(null); };
    const linhaDe = (funcionarioId: string) => d?.grelha.linhas.find(l => l.funcionario.id === funcionarioId);
    const diaDe = (funcionarioId: string, data: string) => linhaDe(funcionarioId)?.dias.find(x => x.data === data);

    const correrAcao = async (celulas: Array<{ funcionarioId: string; data: string }>, acao: AcaoCelula, extra: { motivo?: string; massa?: boolean; tipoJustificadaId?: string; meioDia?: 'manha' | 'tarde' | null; documentoId?: string | null } = {}) => {
        if (!actor) return false;
        try {
            const r = await ServicoPontoRH.acao({ celulas, acao, ...extra }, actor);
            toast({
                title: r.alteradas ? `${r.alteradas} célula(s) alterada(s)` : 'Nada alterado',
                description: r.ignoradas.length ? `${r.ignoradas.length} ignorada(s): ${r.ignoradas.slice(0, 4).join('; ')}${r.ignoradas.length > 4 ? '…' : ''}` : undefined,
                variant: r.alteradas ? undefined : 'destructive',
            });
            setSelecao(new Set());
            recarregar();
            return r.alteradas > 0;
        } catch (error) {
            toast({ variant: 'destructive', title: 'Não foi possível concluir', description: (error as Error).message });
            return false;
        }
    };

    const escolher = (accao: AccaoMenu, funcionarioId: string, data: string) => {
        setPedido(null);
        const celula = [{ funcionarioId, data }];
        if (accao === 'presente' || accao === 'falta' || accao === 'dispensa' || accao === 'licenca' || accao === 'falta_justificada') void correrAcao(celula, accao);
        else if (accao === 'falta_dialogo') setPedido({ tipo: 'falta', funcionarioId, data });
        else if (accao === 'limpar') setPedido({ tipo: 'texto', modo: 'limpar', celulas: celula });
        else if (accao === 'observacao') setPedido({ tipo: 'texto', modo: 'observacao', celulas: celula });
        else setPedido({ tipo: 'painel', funcionarioId, data });
    };

    // Atalhos de teclado com a célula seleccionada (F1.8).
    const tecla = (t: string, chave: string) => {
        const [funcionarioId, data] = chave.split('|');
        const l = linhaDe(funcionarioId);
        const dia = diaDe(funcionarioId, data);
        if (!l || !dia || dia.estado === 'FORA') return;
        if (t === 'e') { setPedido({ tipo: 'painel', funcionarioId, data }); return; }
        if (!podeEditar(l) || bloqueado || dia.estado === 'FUTURO') return;
        escolher(({ p: 'presente', f: 'falta', j: 'falta_dialogo', delete: 'limpar' } as Record<string, AccaoMenu>)[t] || 'detalhes', funcionarioId, data);
    };

    const exportar = (gerar: (g: NonNullable<typeof d>['grelha']) => ReportDef, formato: 'pdf' | 'xlsx') => {
        if (!d) return;
        const grelhaFiltrada = { ...d.grelha, linhas };
        const def = gerar(grelhaFiltrada);
        if (formato === 'pdf') renderReportPdf(def, companySettings, actor?.name || '', 'save');
        else renderReportExcel(def, companySettings, actor?.name || '', 'save');
    };
    const contexto = { ano, mes, departamentos: nomesDep, filtro: departamento !== TODOS ? nomesDep.get(departamento) : undefined };
    const motivosAusencias = useMemo(() => new Map<string, string>(), []);

    if (!ver && !escopo?.departamentos.size) return <MainLayout title="Livro de ponto"><Vazio>Sem permissão para ver o livro de ponto.</Vazio></MainLayout>;

    return (
        <MainLayout title="Livro de ponto" subtitle="Assiduidade: marcações, faltas, atrasos, horas extra e fecho do mês">
            <div className="no-print"><NavegacaoRH extra={LIGACOES_TEMPO} /></div>
            <Tabs value={vista} onValueChange={setVista}>
                <TabsList className="no-print mb-3">
                    <TabsTrigger value="grelha">Grelha do mês</TabsTrigger>
                    <TabsTrigger value="hoje">Hoje</TabsTrigger>
                    <TabsTrigger value="justificacoes">Justificações</TabsTrigger>
                    <TabsTrigger value="escalas">Escalas</TabsTrigger>
                    {gerir && <TabsTrigger value="banco">Banco de horas</TabsTrigger>}
                    {gerir && <TabsTrigger value="relogios">Relógios</TabsTrigger>}
                    {gerir && <TabsTrigger value="auditoria">Auditoria</TabsTrigger>}
                </TabsList>

                <TabsContent value="grelha" className="ponto-impressao">
                    {/* Barra de ferramentas (5.1) */}
                    <div className="no-print mb-3 flex flex-wrap items-center gap-2">
                        <Button size="icon" variant="outline" onClick={() => mover(-1)} aria-label="Mês anterior"><ChevronLeft className="h-4 w-4" /></Button>
                        <span className="min-w-[170px] text-center font-black">{nomeDoMes(ano, mes)} {estadoMes === 'fechado' && <Lock className="ml-1 inline h-4 w-4 text-amber-600" aria-label="Mês fechado" />}</span>
                        <Button size="icon" variant="outline" onClick={() => mover(1)} aria-label="Mês seguinte"><ChevronRight className="h-4 w-4" /></Button>
                        <Select value={departamento} onValueChange={setDepartamento}>
                            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                            <SelectContent><SelectItem value={TODOS}>{chefeSo ? 'Os meus departamentos' : 'Todos os departamentos'}</SelectItem>{departamentosVisiveis.map(x => <SelectItem key={x.id} value={x.id}>{x.nome}</SelectItem>)}</SelectContent>
                        </Select>
                        <Select value={cargo} onValueChange={setCargo}>
                            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                            <SelectContent><SelectItem value={TODOS}>Todos os cargos</SelectItem>{base.dados.cargos.map(x => <SelectItem key={x.id} value={x.id}>{x.nome}</SelectItem>)}</SelectContent>
                        </Select>
                        <Input className="w-56" placeholder="Pesquisar nome ou n.º" value={pesquisaBruta} onChange={e => setPesquisaBruta(e.target.value)} />
                        <Select value={filtro} onValueChange={v => setFiltro(v as FiltroEstado)}>
                            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                            <SelectContent>{FILTROS_ESTADO.map(f => <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>)}</SelectContent>
                        </Select>
                        <Select value={ordem} onValueChange={v => setOrdem(v as Ordenacao)}>
                            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                            <SelectContent>{ORDENACOES.map(o => <SelectItem key={o.id} value={o.id}>Ordenar: {o.nome}</SelectItem>)}</SelectContent>
                        </Select>
                        <div className="ml-auto flex flex-wrap gap-2">
                            {gerir && !bloqueado && <Button variant="outline" onClick={() => setPedido({ tipo: 'importar' })}><Upload className="mr-1.5 h-4 w-4" /> Importar</Button>}
                            {gerir && <Button variant="outline" onClick={() => navigate('/rh/quiosque')}><Tablet className="mr-1.5 h-4 w-4" /> Quiosque</Button>}
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild><Button variant="outline"><Download className="mr-1.5 h-4 w-4" /> Exportar</Button></DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-64">
                                    <DropdownMenuLabel>Livro de ponto</DropdownMenuLabel>
                                    <DropdownMenuItem onClick={() => exportar(g => relatorioLivroMensal(g, contexto), 'xlsx')}><FileSpreadsheet className="mr-2 h-4 w-4" /> Excel (grelha + resumo)</DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => exportar(g => relatorioLivroMensal(g, contexto), 'pdf')}><FileText className="mr-2 h-4 w-4" /> PDF</DropdownMenuItem>
                                    <DropdownMenuItem disabled={!linhas.length} onClick={() => gerarFolhasIndividuais(linhas, { ...contexto, cargos: nomesCargo }, companySettings, actor?.name || '')}><FileText className="mr-2 h-4 w-4" /> Folhas individuais (PDF, para assinar)</DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuLabel>Relatórios (Excel)</DropdownMenuLabel>
                                    <DropdownMenuItem onClick={() => exportar(g => relatorioResumoAssiduidade(g, contexto), 'xlsx')}>Resumo de assiduidade</DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => exportar(g => relatorioPorDepartamento(g, contexto), 'xlsx')}>Assiduidade por departamento</DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => exportar(g => relatorioRankingAtrasos(g, contexto), 'xlsx')}>Ranking de atrasos</DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => exportar(g => relatorioHorasExtra(g, contexto), 'xlsx')}>Horas extra por tipo</DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => exportar(g => relatorioFaltas(g, contexto, motivosAusencias), 'xlsx')}>Faltas</DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuLabel>Relatórios (PDF)</DropdownMenuLabel>
                                    <DropdownMenuItem onClick={() => exportar(g => relatorioResumoAssiduidade(g, contexto), 'pdf')}>Resumo de assiduidade</DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => exportar(g => relatorioPorDepartamento(g, contexto), 'pdf')}>Assiduidade por departamento</DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => exportar(g => relatorioRankingAtrasos(g, contexto), 'pdf')}>Ranking de atrasos</DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => exportar(g => relatorioHorasExtra(g, contexto), 'pdf')}>Horas extra por tipo</DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => exportar(g => relatorioFaltas(g, contexto, motivosAusencias), 'pdf')}>Faltas</DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                            <Button variant="outline" onClick={() => { setImprimir(true); window.setTimeout(() => { window.print(); setImprimir(false); }, 150); }}><Printer className="mr-1.5 h-4 w-4" /> Imprimir</Button>
                            {gerir && actor && <Button size="icon" variant="outline" aria-label="Configuração do ponto" onClick={() => setPedido({ tipo: 'configuracao' })}><Settings className="h-4 w-4" /></Button>}
                        </div>
                    </div>

                    {/* Barra de resumo do mês (F1.12) */}
                    <div className="mb-3 flex flex-wrap items-center gap-x-6 gap-y-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm dark:border-slate-800 dark:bg-slate-900">
                        <span className="hidden font-black print:inline">Livro de ponto · {nomeDoMes(ano, mes)}</span>
                        <MetricaResumo icone={Users} tom="slate" valor={resumo.funcionarios} rotulo="Funcionários" />
                        <MetricaResumo icone={UserCheck} tom="emerald" valor={`${resumo.presenca}%`} rotulo="Presença" />
                        <MetricaResumo icone={UserX} tom="rose" valor={resumo.faltas} rotulo="Faltas" />
                        <MetricaResumo icone={AlarmClock} tom="amber" valor={resumo.atraso} unidade="min" rotulo="Atrasos" />
                        <MetricaResumo icone={TimerReset} tom="violet" valor={formatarMinutos(resumo.extra)} rotulo="Horas extra" />
                        {resumo.incompletos > 0 && <MetricaResumo icone={TriangleAlert} tom="orange" valor={resumo.incompletos} rotulo="Incompletos" />}
                        <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-black', resumo.pendentes ? 'bg-orange-500 text-white' : 'bg-slate-100 text-slate-500 dark:bg-slate-800')}>{resumo.pendentes} pendentes</span>
                        {resumo.pendentes > 0 && !bloqueado && <Button size="sm" variant="outline" className="no-print border-orange-300 text-orange-700" onClick={() => setPedido({ tipo: 'pendentes' })}>Resolver pendentes</Button>}
                        <span className="ml-auto flex items-center gap-2">
                            {bloqueado ? <Lock className="h-4 w-4 text-amber-600" /> : null}
                            <span className="text-xs">Estado: <b>{d?.processado ? `salário processado (${d.processado})` : ROTULO_PERIODO[estadoMes]}</b>
                                {(d?.periodos || []).filter(p => p.departamento_id).length > 0 && <span className="text-slate-500"> · {d!.periodos.filter(p => p.departamento_id && p.estado !== 'aberto').length} departamento(s) validado(s)</span>}</span>
                            {actor && !d?.processado && (
                                <span className="no-print flex gap-1.5">
                                    {estadoMes !== 'fechado' && (escopo?.rh || chefeSo) && <Button size="sm" variant="outline" onClick={() => setPedido({ tipo: 'periodo', modo: 'validar' })}>Validar mês</Button>}
                                    {estadoMes !== 'fechado' && escopo?.rh && <Button size="sm" onClick={() => setPedido({ tipo: 'periodo', modo: 'fechar' })}><Lock className="mr-1 h-3.5 w-3.5" /> Fechar mês</Button>}
                                    {estadoMes === 'fechado' && (gerir || actor.role === 'super_admin') && <Button size="sm" variant="outline" onClick={() => setPedido({ tipo: 'periodo', modo: 'reabrir' })}>Reabrir</Button>}
                                </span>
                            )}
                        </span>
                    </div>
                    {periodoEmpresa?.processamento_desactualizado ? <p className="mb-3 rounded-xl bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 dark:bg-red-950/30">⚠ O mês foi reaberto depois de o salário ter sido calculado: o processamento está desactualizado. Feche de novo o ponto e volte a calcular o salário.</p> : null}

                    {/* Legenda, modo horas e ajuda (F1.7, F1.16) */}
                    <div className="no-print mb-3 flex flex-wrap items-center gap-1.5 text-[11px]">
                        {ESTADOS.map(e => <span key={e.codigo} className={cn('rounded px-1.5 py-0.5 font-bold', e.cor)}>{e.codigo} {e.nome}</span>)}
                        <span className="ml-2 flex items-center gap-1 text-slate-500"><i className="h-2 w-2 rounded-full bg-red-500" /> atraso <i className="ml-1 h-2 w-2 rounded-full bg-orange-500" /> saída antecipada <i className="ml-1 h-2 w-2 rounded-full bg-blue-600" /> extra · ✏️ editado · ⚠ incompleto</span>
                        <label className="ml-auto flex items-center gap-2 text-xs font-bold"><Switch checked={mostrarHoras} onCheckedChange={setMostrarHoras} /> Mostrar horas</label>
                        <Popover>
                            <PopoverTrigger asChild><Button size="icon" variant="ghost" aria-label="Ajuda"><CircleHelp className="h-4 w-4" /></Button></PopoverTrigger>
                            <PopoverContent className="w-80 text-xs leading-relaxed">
                                <p className="mb-1.5 font-bold">Como usar o livro de ponto</p>
                                <p>Clique num dia para o menu de acções (marcar presente, lançar faltas, editar horas). Atalhos: <b>P</b> presente, <b>F</b> falta, <b>J</b> falta justificada, <b>E</b> editar, <b>Del</b> limpar, setas para navegar.</p>
                                <p className="mt-1.5">Seleccione várias células com <b>Shift</b> + clique, <b>Ctrl</b> + clique ou arrastando; clique no dia (cabeçalho) ou no nome para seleccionar a coluna ou a linha.</p>
                                <p className="mt-1.5">«?» é um dia útil passado sem registo: <b>nunca desconta</b> no salário. Só a falta lançada desconta. As marcações nunca se apagam: anulam-se com motivo, e tudo fica na auditoria.</p>
                                <p className="mt-1.5">No fim do mês: o chefe valida o departamento, o RH fecha o mês e os totais seguem para o processamento salarial.</p>
                            </PopoverContent>
                        </Popover>
                    </div>

                    {!d ? <Vazio>A carregar…</Vazio> : linhas.length === 0 ? <Vazio>Sem funcionários com estes filtros.</Vazio> : (
                        <GrelhaPonto grelha={d.grelha} linhas={linhas} semVirtualizacao={imprimir}
                            config={d.contexto.config} mostrarHoras={mostrarHoras} selecao={selecao} activa={activa} destaque={destaque}
                            bloqueado={bloqueado} podeEditar={l => podeEditar(l) && !bloqueado}
                            onAbrir={(funcionarioId, data, alvo) => setPedido({ tipo: 'menu', funcionarioId, data, alvo })}
                            onSelecao={setSelecao} onActiva={setActiva} onTecla={tecla} onDestaque={setDestaque} />
                    )}
                    {selecao.size > 0 && !bloqueado && <div className="no-print"><BarraAccoesMassa quantidade={selecao.size} onCancelar={() => setSelecao(new Set())}
                        onAccao={acao => setPedido({ tipo: 'texto', modo: 'massa', acao, celulas: [...selecao].map(k => { const [funcionarioId, data] = k.split('|'); return { funcionarioId, data }; }) })} /></div>}
                </TabsContent>

                <TabsContent value="hoje">
                    <PainelHojePonto actor={actor} gerir={gerir || chefeSo} onLancarFalta={async (funcionarioId, data) => { await correrAcao([{ funcionarioId, data }], 'falta'); }} />
                </TabsContent>
                <TabsContent value="justificacoes">
                    {actor && escopo && <JustificacoesPonto actor={actor} nomes={new Map(base.dados.funcionarios.map(f => [f.id, f.nome]))} onDecidido={recarregar}
                        podeDecidir={id => { const f = base.dados.funcionarios.find(x => x.id === id); return Boolean(f && ServicoPontoRH.podeGerir(escopo, f)); }} />}
                </TabsContent>
                <TabsContent value="escalas">
                    <EscalasPonto actor={actor} gerir={gerir} funcionarios={base.dados.funcionarios} departamentos={departamentosVisiveis} />
                </TabsContent>
                {gerir && <TabsContent value="banco">
                    <BancoHorasPonto actor={actor} gerir={gerir} config={d?.contexto.config || null} funcionarios={base.dados.funcionarios} settings={companySettings}
                        onAlterado={() => { recarregar(); void base.recarregar(); }} />
                </TabsContent>}
                {gerir && actor && <TabsContent value="relogios"><RelogiosPonto actor={actor} onRecebido={recarregar} /></TabsContent>}
                {gerir && <TabsContent value="auditoria"><AuditoriaPonto funcionarios={base.dados.funcionarios} settings={companySettings} userName={actor?.name || ''} /></TabsContent>}
            </Tabs>

            {/* Menus e diálogos */}
            {pedido?.tipo === 'menu' && (() => {
                const l = linhaDe(pedido.funcionarioId);
                const dia = diaDe(pedido.funcionarioId, pedido.data);
                if (!l || !dia) return null;
                return <MenuCelula alvo={pedido.alvo} dia={dia} nome={l.funcionario.nome} editavel={podeEditar(l) && !bloqueado}
                    onFechar={() => setPedido(null)} onEscolher={a => escolher(a, pedido.funcionarioId, pedido.data)} />;
            })()}
            {pedido?.tipo === 'painel' && actor && (
                <PainelDiaPonto funcionarioId={pedido.funcionarioId} data={pedido.data} actor={actor} onFechar={() => setPedido(null)} onAlterado={recarregar}
                    editavel={Boolean(linhaDe(pedido.funcionarioId) && podeEditar(linhaDe(pedido.funcionarioId)!) && !bloqueado && diaDe(pedido.funcionarioId, pedido.data)?.estado !== 'FUTURO')} />
            )}
            {pedido?.tipo === 'falta' && d && (
                <DialogoFalta dia={diaDe(pedido.funcionarioId, pedido.data)!} nome={linhaDe(pedido.funcionarioId)?.funcionario.nome || ''} tipos={d.contexto.tipos} permiteAnexo={gerir}
                    onFechar={() => setPedido(null)} onConfirmar={async v => {
                        let documentoId: string | null = null;
                        if (v.anexo && actor) {
                            try {
                                documentoId = String(await ServicoRH.carregarDocumento({ funcionario_id: pedido.funcionarioId, categoria: 'saude', nome: `Justificação de ${pedido.data.split('-').reverse().join('/')}`, ficheiro_nome: v.anexo.nome, data_url: v.anexo.dataUrl, confidencial: true },
                                    valorNumerico(base.dados.parametros, 'documento_max_mb', hoje, 2), actor));
                            } catch (error) { toast({ variant: 'destructive', title: 'Documento recusado', description: (error as Error).message }); return false; }
                        }
                        return correrAcao([{ funcionarioId: pedido.funcionarioId, data: pedido.data }], v.acao, { motivo: v.motivo || undefined, tipoJustificadaId: v.tipoId, meioDia: v.meioDia, documentoId });
                    }} />
            )}
            {pedido?.tipo === 'texto' && (
                pedido.modo === 'observacao' ? (
                    <DialogoTexto titulo="Observação do dia" descricao={`${linhaDe(pedido.celulas[0].funcionarioId)?.funcionario.nome} · ${pedido.celulas[0].data.split('-').reverse().join('/')}`} rotulo="Observação" obrigatorio={false}
                        inicial={linhaDe(pedido.celulas[0].funcionarioId)?.observacoes.get(pedido.celulas[0].data) || ''} confirmar="Guardar" onFechar={() => setPedido(null)}
                        onConfirmar={texto => executar(() => ServicoPontoRH.observacao(pedido.celulas[0].funcionarioId, pedido.celulas[0].data, texto, actor!), 'Observação guardada').then(ok => { if (ok) recarregar(); return ok; })} />
                ) : (
                    <DialogoTexto titulo={pedido.modo === 'limpar' ? 'Limpar o dia' : `Acção em massa: ${{ presente: 'marcar presentes', falta: 'lançar falta', falta_justificada: 'lançar falta justificada', dispensa: 'lançar dispensa', licenca: 'lançar licença', limpar: 'limpar' }[pedido.acao || 'limpar']}`}
                        descricao={pedido.modo === 'limpar' ? 'As marcações são anuladas (não apagadas) e uma falta de um só dia é anulada.' : `${pedido.celulas.length} célula(s) seleccionada(s). Feriados, fins de semana, férias, licenças e dias futuros são ignorados automaticamente.`}
                        rotulo="Motivo" perigo={pedido.modo === 'limpar' || pedido.acao === 'limpar'} confirmar={pedido.modo === 'limpar' ? 'Limpar' : `Aplicar a ${pedido.celulas.length}`}
                        onFechar={() => setPedido(null)} onConfirmar={motivo => correrAcao(pedido.celulas, pedido.modo === 'limpar' ? 'limpar' : pedido.acao!, { motivo, massa: pedido.modo === 'massa' }).then(() => true)} />
                )
            )}
            {pedido?.tipo === 'pendentes' && (
                <ResolverPendentes linhas={linhas} podeEditar={l => podeEditar(l) && !bloqueado} onFechar={() => setPedido(null)}
                    onEditar={(funcionarioId, data) => setPedido({ tipo: 'painel', funcionarioId, data })}
                    onAccao={async (celulas, acao) => { if (acao === 'falta_dialogo') setPedido({ tipo: 'falta', ...celulas[0] }); else await correrAcao(celulas, acao); }} />
            )}
            {pedido?.tipo === 'importar' && actor && <ImportarPonto actor={actor} funcionarios={base.dados.funcionarios} onFechar={() => setPedido(null)} onImportado={recarregar} />}
            {pedido?.tipo === 'configuracao' && actor && d && (
                <ConfiguracaoPonto config={d.contexto.config} actor={actor} funcionarios={base.dados.funcionarios} empresa={companySettings?.name || ''} ano={ano} mes={mes} onFechar={() => setPedido(null)}
                    onGuardado={() => { recarregar(); void base.recarregar(); }} />
            )}
            {pedido?.tipo === 'periodo' && actor && d && (() => {
                const doEscopo = linhas.filter(l => podeEditar(l));
                const problemas = {
                    pendentes: doEscopo.reduce((s, l) => s + l.totais.pendentes, 0),
                    incompletos: doEscopo.reduce((s, l) => s + l.totais.incompletos, 0),
                };
                return <DialogoPeriodo modo={pedido.modo} ano={ano} mes={mes} periodos={d.periodos} problemas={problemas} permiteConverter={d.contexto.config.lancar_falta_automatica}
                    departamentos={departamentosVisiveis} actor={actor} onFechar={() => setPedido(null)} onFeito={recarregar} />;
            })()}
        </MainLayout>
    );
}
