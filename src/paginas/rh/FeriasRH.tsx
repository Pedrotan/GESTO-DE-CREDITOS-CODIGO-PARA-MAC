import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { MainLayout } from '@/componentes/layout/MainLayout';
import { Button } from '@/componentes/ui/button';
import { Input } from '@/componentes/ui/input';
import { Label } from '@/componentes/ui/label';
import { Textarea } from '@/componentes/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/componentes/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/componentes/ui/dialog';
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Edit, FileDown, Info, Minus, PauseCircle, Plus, Receipt, Save, Undo2, XCircle } from 'lucide-react';
import { ServicoFeriasRH, estadoVisivel, type EstadoVisivelFerias, type PlanoFeriasRH } from '@/servicos/rh/ServicoFeriasRH';
import { ServicoTempoRH, type AusenciaRH } from '@/servicos/rh/ServicoTempoRH';
import { avisosFerias, conflitoDepartamento, estadoEfectivo, saldoFerias, simularFerias, type ResultadoFerias } from '@/bibliotecas/rh/ferias';
import { calendarioDoAno, type FeriadoRegistado, type OpcoesCalendario } from '@/bibliotecas/rh/calendario-laboral';
import { chefeDirecto } from '@/bibliotecas/rh/hierarquia-rh';
import { HORARIO_OMISSAO, ehDiaUtil, somarDias, type Feriado, type Horario } from '@/bibliotecas/rh/ponto';
import { valorNumerico } from '@/bibliotecas/rh/parametros-rh';
import { gerarMapaFeriasPdf } from '@/bibliotecas/rh/pdf-rh';
import { emitirGuiaFerias } from '@/componentes/rh/guia-ferias';
import { CalendarioAnual, LegendaCalendario, MESES_PT, type PeriodoCalendario } from '@/componentes/rh/CalendarioAnual';
import { luandaTodayKey } from '@/bibliotecas/fuso-angola';
import { cn } from '@/bibliotecas/utils';
import { useActorRH } from '@/ganchos/usar-modulo-rh';
import { useData } from '@/contextos/ContextoDados';
import { Indicador, NavegacaoRH, dataPt, executar, useCarregar, Vazio } from '@/componentes/rh/comum-rh';
import { toast } from '@/ganchos/usar-toast';
import type { ActorRH, Funcionario } from '@/servicos/rh/ServicoRH';
import { useBaseRH } from './FuncionariosRH';

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const TODOS = '__todos__';
const ROTULO: Record<EstadoVisivelFerias, string> = {
    previsto: 'previsto', pendente_chefe: 'pendente chefe', pendente_rh: 'pendente RH', aprovado: 'aprovado', em_gozo: 'em gozo', gozado: 'gozado',
    recusado: 'recusado', anulado: 'anulado', interrompido: 'interrompido',
};
const COR: Record<EstadoVisivelFerias, string> = {
    previsto: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200', pendente_chefe: 'bg-orange-100 text-orange-800', pendente_rh: 'bg-orange-100 text-orange-800',
    aprovado: 'bg-emerald-100 text-emerald-800', em_gozo: 'bg-emerald-200 text-emerald-900', gozado: 'bg-emerald-50 text-emerald-700',
    recusado: 'bg-red-100 text-red-700', anulado: 'bg-slate-100 text-slate-500', interrompido: 'bg-sky-100 text-sky-800',
};
const ATALHOS = [22, 15, 11, 7];
/** Data com o dia da semana (ex.: «Qua, 04/08/2027»). */
const dataSemana = (d: string) => `${SEMANA[new Date(`${d}T12:00:00Z`).getUTCDay()]}, ${dataPt(d)}`;

export default function FeriasRH() {
    const { actor, gerir, calcular } = useActorRH();
    const { companySettings } = useData();
    const navigate = useNavigate();
    const [parametrosUrl] = useSearchParams();
    const base = useBaseRH();
    const hoje = luandaTodayKey();
    const [ano, setAno] = useState(Number(hoje.slice(0, 4)));
    const dados = useCarregar(async () => {
        const [planos, horarios, feriados, registados, opcoes, ausencias] = await Promise.all([
            ServicoFeriasRH.planos(), ServicoTempoRH.horarios(), ServicoTempoRH.feriados(), ServicoTempoRH.feriadosRegistados(), ServicoTempoRH.opcoesCalendario(), ServicoTempoRH.ausencias(),
        ]);
        return { planos, horarios, feriados, registados, opcoes, ausencias };
    }, { planos: [] as PlanoFeriasRH[], horarios: [] as Horario[], feriados: [] as Feriado[], registados: [] as FeriadoRegistado[], opcoes: {} as OpcoesCalendario, ausencias: [] as AusenciaRH[] });
    const { planos, horarios, feriados, registados, opcoes, ausencias } = dados.dados;
    const recarregar = () => void dados.recarregar();
    const [anular, setAnular] = useState<PlanoFeriasRH | null>(null);
    const [recusar, setRecusar] = useState<PlanoFeriasRH | null>(null);
    const [interromper, setInterromper] = useState<PlanoFeriasRH | null>(null);
    const [departamento, setDepartamento] = useState(TODOS);
    const painel = useRef<HTMLDivElement>(null);

    const funcionarios = base.dados.funcionarios.filter(f => f.estado !== 'cessado');
    const parametros = base.dados.parametros;
    const direitoPadrao = valorNumerico(parametros, 'dias_ferias_ano', hoje, 22);
    const limiteConflito = valorNumerico(parametros, 'ferias_conflito_pct', hoje, 30);
    const periodoMinimo = valorNumerico(parametros, 'ferias_periodo_minimo', hoje, 15);
    const direitoDe = (fid: string) => base.dados.contratos.find(c => c.funcionario_id === fid && c.estado === 'activo')?.dias_ferias ?? direitoPadrao;
    const horarioDe = (f?: Funcionario) => horarios.find(h => h.id === f?.horario_id) || horarios.find(h => h.id === 'horario-normal') || HORARIO_OMISSAO;
    const estrutura = { departamentos: base.dados.departamentos, seccoes: base.dados.seccoes };
    const temChefe = (fid: string) => { const f = funcionarios.find(x => x.id === fid); return Boolean(f && chefeDirecto(f, estrutura).id); };
    const visivel = (p: PlanoFeriasRH) => estadoVisivel(p, hoje, temChefe(p.funcionario_id));
    const saldoDe = (f: Funcionario, a = ano) => saldoFerias(planos, f.id, a, direitoDe(f.id), hoje, direitoDe(f.id), f.data_admissao);
    const calendario = useMemo(() => calendarioDoAno(ano, registados, opcoes), [ano, registados, opcoes]);
    const doAno = planos.filter(p => p.ano === ano && p.estado !== 'anulado');

    // ── Painel «Planear férias» ──
    const [sel, setSel] = useState<string>('');
    const [inicio, setInicio] = useState('');
    const [dias, setDias] = useState(22);
    const [obs, setObs] = useState('');
    const [editar, setEditar] = useState<PlanoFeriasRH | null>(null);
    useEffect(() => { if (!sel && funcionarios[0]) setSel(funcionarios[0].id); }, [sel, funcionarios]);
    const f = funcionarios.find(x => x.id === sel);
    const horario = horarioDe(f);
    const primeiroUtil = (desde: string) => { let d = desde; for (let i = 0; i < 40 && !ehDiaUtil(d, horario, feriados); i++) d = somarDias(d, 1); return d; };
    useEffect(() => { if (!inicio && f) setInicio(primeiroUtil(ano === Number(hoje.slice(0, 4)) ? somarDias(hoje, 1) : `${ano}-07-01`)); // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [f?.id, feriados.length]);
    const saldo = f ? saldoDe(f, inicio ? Number(inicio.slice(0, 4)) : ano) : null;
    const simulacao: ResultadoFerias | null = useMemo(() => {
        if (!f || !/^\d{4}-\d{2}-\d{2}$/u.test(inicio) || dias < 1) return null;
        try { return simularFerias({ inicio, dias, horario, feriados, saldo: saldo?.saldo ?? null }); } catch { return null; }
    }, [f, inicio, dias, horario, feriados, saldo?.saldo]);
    const conflito = useMemo(() => (f && simulacao ? conflitoDepartamento({ inicio: simulacao.inicio, fim: simulacao.ultimoDia, funcionarioId: f.id, departamentoId: f.departamento_id, planos, funcionarios, limitePct: limiteConflito, hoje }) : null),
        [f, simulacao, planos, funcionarios, limiteConflito, hoje]);
    const avisos = f && simulacao && saldo ? avisosFerias({ resultado: simulacao, funcionarioId: f.id, planoId: editar?.id, saldo: saldo.saldo, hoje, planos, ausencias, conflito, limitePct: limiteConflito, periodoMinimo, direito: saldo.direito }) : [];
    const bloqueiaGuardar = avisos.some(a => a.nivel === 'erro');
    const bloqueiaAprovar = bloqueiaGuardar || avisos.some(a => a.codigo === 'excede');

    const escolherFuncionario = (id: string) => { setSel(id); setEditar(null); setObs(''); painel.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); };
    const mudarAno = (delta: number) => {
        setAno(a => a + delta);
        if (inicio) { const n = `${Number(inicio.slice(0, 4)) + delta}${inicio.slice(4)}`; setInicio(n.endsWith('02-29') ? n.replace('02-29', '02-28') : n); }
    };
    const editarPlano = (p: PlanoFeriasRH) => {
        setSel(p.funcionario_id); setEditar(p); setObs(p.observacoes || ''); setAno(p.ano);
        setInicio(p.data_inicio || primeiroUtil(`${p.ano}-${String(p.mes_previsto || 1).padStart(2, '0')}-01`));
        setDias(Number(p.dias) || 22);
        painel.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    const novo = () => { setEditar(null); setObs(''); setDias(22); painel.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
    const guardar = async (aprovar: boolean) => {
        if (!actor || !f || !simulacao) return;
        const ok = await executar(async () => {
            const id = await ServicoFeriasRH.guardar({ id: editar?.id, funcionario_id: f.id, ano: Number(simulacao.inicio.slice(0, 4)), mes_previsto: null, data_inicio: inicio, dias, observacoes: obs }, actor);
            if (aprovar) {
                const plano = (await ServicoFeriasRH.planos()).find(x => x.id === id);
                if (plano) await ServicoFeriasRH.aprovar(plano, actor);
            }
        }, aprovar ? 'Férias aprovadas e marcadas no livro de ponto' : 'Férias guardadas como previstas');
        if (ok) { setEditar(null); recarregar(); }
    };

    // Períodos mostrados no calendário: os do funcionário escolhido e o simulado.
    const periodos: PeriodoCalendario[] = [
        ...planos.filter(p => p.funcionario_id === sel && p.id !== editar?.id && p.estado !== 'anulado' && p.data_inicio && p.data_fim).map(p => {
            const e = visivel(p);
            return { inicio: p.data_inicio!, ultimoDia: p.data_fim!, regresso: p.data_regresso, tipo: e === 'previsto' ? 'previsto' as const : e.startsWith('pendente') ? 'pendente' as const : 'aprovado' as const,
                titulo: `Férias (${ROTULO[e]})` };
        }),
        ...(simulacao ? [{ inicio: simulacao.inicio, ultimoDia: simulacao.ultimoDia, regresso: simulacao.regresso, dias: simulacao.dias, tipo: 'simulado' as const }] : []),
    ];
    // Colegas do mesmo departamento de férias (aprovadas) em cada dia, e dias acima do limite.
    const { equipa, sobrecarga } = useMemo(() => {
        const mapa = new Map<string, number>();
        const acima = new Set<string>();
        if (!f?.departamento_id) return { equipa: mapa, sobrecarga: acima };
        const colegas = funcionarios.filter(x => x.departamento_id === f.departamento_id && x.estado === 'activo');
        const ids = new Set(colegas.map(x => x.id));
        for (const p of planos) {
            if (p.funcionario_id === f.id || !ids.has(p.funcionario_id) || !p.data_inicio || !p.data_fim || !['aprovado', 'em_gozo'].includes(estadoEfectivo(p, hoje))) continue;
            for (let d = p.data_inicio; d <= p.data_fim; d = somarDias(d, 1)) mapa.set(d, (mapa.get(d) || 0) + 1);
        }
        // Só os dias em que há colegas fora contam (num departamento pequeno o próprio já passaria o limite).
        if (colegas.length >= 2 && simulacao) for (const d of Object.keys(simulacao.dias)) if ((mapa.get(d) || 0) > 0 && (((mapa.get(d) || 0) + 1) / colegas.length) * 100 > limiteConflito) acima.add(d);
        return { equipa: mapa, sobrecarga: acima };
    }, [f, funcionarios, planos, hoje, simulacao, limiteConflito]);

    // Indicadores.
    const saldoTotal = funcionarios.reduce((s, x) => { const v = saldoDe(x); return { direito: s.direito + v.direito, transitados: s.transitados + v.transitados, saldo: s.saldo + v.saldo }; }, { direito: 0, transitados: 0, saldo: 0 });
    const diasAno = [...calendario.values()];
    const nFeriados = diasAno.filter(d => d.folga && d.activo && d.tipo !== 'ponte').length;
    const nPontes = diasAno.filter(d => d.tipo === 'ponte' && d.activo).length;
    const contagem = { previsto: 0, pendente: 0, aprovado: 0 };
    for (const p of doAno) { const e = visivel(p); if (e === 'previsto') contagem.previsto++; else if (e.startsWith('pendente')) contagem.pendente++; else if (['aprovado', 'em_gozo', 'gozado', 'interrompido'].includes(e)) contagem.aprovado++; }

    // Alerta «Processar subsídio» (?subsidio=plano): abre o processamento de férias deste funcionário.
    const processar = async (p: PlanoFeriasRH) => {
        if (!actor) return;
        try {
            const id = await ServicoFeriasRH.processarSubsidio(p, base.dados.funcionarios.find(x => x.id === p.funcionario_id)?.nome || '', actor);
            navigate(`/rh/processamento?id=${id}`);
        } catch (error) { toast({ variant: 'destructive', title: 'Não foi possível abrir o processamento', description: (error as Error).message }); }
    };
    useEffect(() => {
        const id = parametrosUrl.get('subsidio');
        const p = planos.find(x => x.id === id);
        if (p && calcular) void processar(p);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [parametrosUrl, planos.length]);

    const guia = async (p: PlanoFeriasRH) => {
        if (!actor || !p.data_inicio || !p.data_fim) return;
        try {
            await emitirGuiaFerias(p, { planos, horarios, feriados, funcionarios: base.dados.funcionarios, contratos: base.dados.contratos, parametros,
                cargos: base.dados.cargos, departamentos: base.dados.departamentos }, companySettings, actor);
            recarregar();
        } catch (error) { toast({ variant: 'destructive', title: 'Não foi possível emitir a guia', description: (error as Error).message }); }
    };
    const nomeDep = (id: string | null) => base.dados.departamentos.find(d => d.id === id)?.nome || '—';
    const mapaPdf = () => {
        const ferias = new Map<string, number>();
        for (const p of planos) if (p.data_inicio && p.data_fim && ['aprovado', 'em_gozo', 'gozado'].includes(estadoEfectivo(p, hoje)))
            for (let d = p.data_inicio; d <= p.data_fim; d = somarDias(d, 1)) if (d.startsWith(String(ano)) && ehDiaUtil(d, horarioDe(funcionarios.find(x => x.id === p.funcionario_id)), feriados)) ferias.set(d, (ferias.get(d) || 0) + 1);
        const linhas = funcionarios.filter(x => departamento === TODOS || x.departamento_id === departamento).map(x => {
            const meus = doAno.filter(p => p.funcionario_id === x.id && p.data_inicio);
            return { nome: x.nome, departamento: nomeDep(x.departamento_id), periodos: meus.map(p => `${dataPt(p.data_inicio)} a ${dataPt(p.data_fim)}`).join('; ') || '—',
                dias: meus.reduce((s, p) => s + (Number(p.dias) || 0), 0), regresso: meus.map(p => (p.data_regresso ? dataPt(p.data_regresso) : '—')).join('; ') || '—',
                saldo: saldoDe(x).saldo, estado: meus.map(p => ROTULO[visivel(p)]).join('; ') || '—' };
        });
        gerarMapaFeriasPdf({ ano, calendario: diasAno, ferias, linhas }, companySettings, actor?.name || '');
    };
    const aprovarAccao = (p: PlanoFeriasRH) => actor && void executar(() => ServicoFeriasRH.aprovar(p, actor), 'Férias aprovadas e marcadas no livro de ponto').then(ok => ok && recarregar());

    const listaFeriados = diasAno.filter(d => d.activo || d.tipo === 'ponte');
    const equipaFiltrada = funcionarios.filter(x => departamento === TODOS || x.departamento_id === departamento);

    return (
        <MainLayout title="Férias" subtitle="Calendário anual, plano de férias, saldos, guias e subsídio de férias">
            <NavegacaoRH extra={[{ path: '/rh/ferias', label: 'Férias' }]} />
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                    <Button size="icon" variant="outline" aria-label="Ano anterior" onClick={() => mudarAno(-1)}><ChevronLeft className="h-4 w-4" /></Button>
                    <h1 className="min-w-[170px] text-center text-2xl font-extrabold">Férias {ano}</h1>
                    <Button size="icon" variant="outline" aria-label="Ano seguinte" onClick={() => mudarAno(1)}><ChevronRight className="h-4 w-4" /></Button>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Button variant="outline" onClick={mapaPdf}><FileDown className="mr-1.5 h-4 w-4" /> Mapa de férias (PDF)</Button>
                    {gerir && <Button className="bg-rh-navy text-white hover:bg-rh-navy/90" onClick={novo}><Plus className="mr-1.5 h-4 w-4" /> Planear férias</Button>}
                </div>
            </div>

            <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Indicador titulo="Funcionários" valor={funcionarios.length} nota={`direito habitual de ${direitoPadrao} dias úteis`} />
                <Indicador titulo="Saldo total da equipa" valor={`${saldoTotal.saldo} dias`} nota={`${saldoTotal.direito} do ano + ${saldoTotal.transitados} transitados`} tom="emerald" />
                <Indicador titulo={`Feriados em ${ano}`} valor={nFeriados} nota={`${nPontes} ponte(s) prevista(s)`} tom="red" />
                <Indicador titulo={`Planos em ${ano}`} valor={doAno.length} nota={`${contagem.previsto} previsto(s) · ${contagem.pendente} pendente(s) · ${contagem.aprovado} aprovado(s)`} tom="sky" />
            </div>

            {funcionarios.length === 0 ? <Vazio>Sem funcionários.</Vazio> : (
                <div className="mb-5 flex flex-wrap items-start gap-4">
                    <section className="min-w-0 flex-[999_1_720px] rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 sm:p-6">
                        <CalendarioAnual ano={ano} calendario={calendario} hoje={hoje} periodos={periodos} equipa={equipa} sobrecarga={sobrecarga}
                            onEscolher={gerir ? d => setInicio(d) : undefined} />
                        <div className="mt-5"><LegendaCalendario /></div>
                        <p className="mt-3 text-center text-xs text-slate-500">Clique num dia para começar aí as férias de {f?.nome.split(' ')[0] || 'quem escolher'}. Passe o rato sobre um dia colorido para ver o feriado. O ponto lilás indica colegas do departamento de férias.</p>
                    </section>

                    <aside className="flex min-w-0 flex-[1_1_340px] flex-col gap-4 lg:max-w-[400px]">
                        <div ref={painel} className="scroll-mt-4 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                            <h2 className="mb-3 text-lg font-extrabold">{editar ? 'Alterar plano de férias' : 'Planear férias'}</h2>
                            <Label htmlFor="ferias-funcionario" className="text-xs font-bold">Funcionário</Label>
                            <Select value={sel} onValueChange={escolherFuncionario} disabled={Boolean(editar)}>
                                <SelectTrigger id="ferias-funcionario" className="mt-1"><SelectValue placeholder="Escolha" /></SelectTrigger>
                                <SelectContent>{funcionarios.map(x => <SelectItem key={x.id} value={x.id}>{x.nome}</SelectItem>)}</SelectContent>
                            </Select>
                            {saldo && (
                                <div className="my-3 grid grid-cols-3 gap-2 text-center">
                                    <div className="rounded-xl bg-slate-50 p-2 dark:bg-slate-800"><div className="text-[11px] text-slate-500">Direito</div><div className="text-lg font-extrabold">{saldo.direito}</div></div>
                                    <div className="rounded-xl bg-slate-50 p-2 dark:bg-slate-800"><div className="text-[11px] text-slate-500">Transitados</div><div className="text-lg font-extrabold">{saldo.transitados}</div></div>
                                    <div className="rounded-xl bg-indigo-50 p-2 dark:bg-indigo-950"><div className="text-[11px] text-indigo-700 dark:text-indigo-300">Saldo</div><div className="text-lg font-extrabold text-indigo-900 dark:text-indigo-100">{saldo.saldo}</div></div>
                                </div>
                            )}
                            <div className="grid grid-cols-2 gap-2.5">
                                <div><Label htmlFor="ferias-inicio" className="text-xs font-bold">Início</Label>
                                    <Input id="ferias-inicio" className="mt-1" type="date" value={inicio} disabled={!gerir} onChange={e => { setInicio(e.target.value); if (e.target.value) setAno(Number(e.target.value.slice(0, 4))); }} /></div>
                                <div><Label htmlFor="ferias-dias" className="text-xs font-bold">Dias úteis</Label>
                                    <div className="mt-1 flex gap-1">
                                        <Button type="button" variant="outline" size="icon" aria-label="Menos um dia" disabled={!gerir} onClick={() => setDias(d => Math.max(1, d - 1))}><Minus className="h-4 w-4" /></Button>
                                        <Input id="ferias-dias" type="number" min={1} max={60} className="text-center font-bold" value={dias} disabled={!gerir} onChange={e => setDias(Math.max(1, Math.min(60, Number(e.target.value) || 1)))} />
                                        <Button type="button" variant="outline" size="icon" aria-label="Mais um dia" disabled={!gerir} onClick={() => setDias(d => Math.min(60, d + 1))}><Plus className="h-4 w-4" /></Button>
                                    </div>
                                </div>
                            </div>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                                {ATALHOS.map(n => (
                                    <button key={n} type="button" disabled={!gerir} onClick={() => setDias(n)}
                                        className={cn('rounded-full border px-3 py-1 text-xs font-semibold', dias === n ? 'border-indigo-300 bg-indigo-50 text-indigo-900 dark:border-indigo-700 dark:bg-indigo-950 dark:text-indigo-100' : 'border-slate-300 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200')}>{n} dias</button>
                                ))}
                            </div>

                            {simulacao ? (
                                <div className="mt-4 rounded-xl border border-[#ABEFC6] bg-[#ECFDF3] p-4 dark:border-emerald-900 dark:bg-emerald-950/40" aria-live="polite">
                                    <div className="text-xs font-bold uppercase tracking-wide text-[#05603A] dark:text-emerald-300">Regressa ao trabalho</div>
                                    <div className="mb-2 mt-1 text-2xl font-black text-[#054F31] dark:text-emerald-100">{dataSemana(simulacao.regresso)}</div>
                                    {([['Primeiro dia de férias', dataSemana(simulacao.inicio)], ['Último dia de férias', dataSemana(simulacao.ultimoDia)], ['Dias úteis', simulacao.diasUteis],
                                        ['Dias de calendário', simulacao.diasCalendario], ['Feriados e pontes no período', simulacao.feriadosNoPeriodo.length], ['Saldo depois destas férias', simulacao.saldoDepois ?? '—']] as Array<[string, string | number]>).map(([r, v], i, a) => (
                                        <div key={r} className={cn('flex items-baseline justify-between gap-2 py-1.5 text-sm', i < a.length - 1 && 'border-b border-emerald-900/10')}>
                                            <span className="text-[#05603A] dark:text-emerald-300">{r}</span><strong className={cn(typeof v === 'number' && v < 0 && 'text-red-600')}>{v}</strong>
                                        </div>
                                    ))}
                                </div>
                            ) : <p className="mt-4 rounded-xl bg-slate-50 p-3 text-sm text-slate-500 dark:bg-slate-800">Escolha o funcionário, o início e os dias úteis.</p>}

                            {avisos.map(a => (
                                <p key={a.codigo} className={cn('mt-2 flex gap-2 rounded-lg px-3 py-2 text-xs font-semibold',
                                    a.nivel === 'erro' ? 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-200' : a.nivel === 'aviso' ? 'bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200' : 'bg-sky-50 text-sky-800 dark:bg-sky-950 dark:text-sky-200')}>
                                    {a.nivel === 'info' ? <Info className="h-4 w-4 shrink-0" /> : <AlertTriangle className="h-4 w-4 shrink-0" />} {a.texto}
                                </p>
                            ))}
                            {simulacao && simulacao.feriadosNoPeriodo.length > 0 && (
                                <div className="mt-3 text-xs text-slate-700 dark:text-slate-300"><strong>Não contam como férias:</strong>
                                    <ul className="mt-1 space-y-0.5">{simulacao.feriadosNoPeriodo.map(x => <li key={x.data}>{dataSemana(x.data)} · {x.nome}</li>)}</ul>
                                </div>
                            )}
                            {gerir && (
                                <>
                                    <Label htmlFor="ferias-obs" className="mt-3 block text-xs font-bold">Observações</Label>
                                    <Textarea id="ferias-obs" className="mt-1" rows={2} value={obs} onChange={e => setObs(e.target.value)} placeholder={avisos.some(a => a.codigo === 'passado') ? 'Motivo para registar férias no passado' : ''} />
                                    <div className="mt-3 grid grid-cols-2 gap-2">
                                        <Button variant="outline" disabled={!simulacao || bloqueiaGuardar} onClick={() => void guardar(false)}><Save className="mr-1.5 h-4 w-4" /> Guardar previsto</Button>
                                        <Button className="bg-[#067647] text-white hover:bg-[#05603A]" disabled={!simulacao || bloqueiaAprovar} onClick={() => void guardar(true)}><CheckCircle2 className="mr-1.5 h-4 w-4" /> Aprovar férias</Button>
                                    </div>
                                    {editar && <Button variant="ghost" size="sm" className="mt-1 w-full" onClick={() => setEditar(null)}>Cancelar a alteração</Button>}
                                    <p className="mt-2 text-xs text-slate-500">Previstas não descontam no saldo. Ao aprovar, os dias úteis passam a «Férias» no livro de ponto e o funcionário é avisado.</p>
                                </>
                            )}
                        </div>

                        <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                            <h2 className="mb-1 font-extrabold">Feriados e datas de {ano}</h2>
                            <ul className="max-h-[460px] overflow-y-auto pr-1 text-sm">
                                {listaFeriados.map(d => (
                                    <li key={d.data} className={cn('flex gap-2.5 border-b border-slate-100 py-1.5 last:border-0 dark:border-slate-800', !d.activo && 'opacity-50 line-through')}>
                                        <span aria-hidden="true" className={cn('mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full', d.tipo === 'ponte' ? 'bg-amber-500' : d.tipo === 'data_internacional' ? 'bg-[#4466AA]' : 'bg-[#D92D20]')} />
                                        <span className="w-[86px] shrink-0 tabular-nums text-slate-600 dark:text-slate-400">{dataPt(d.data).slice(0, 5)} · {SEMANA[new Date(`${d.data}T12:00:00Z`).getUTCDay()]}</span>
                                        <span className="min-w-0">{d.nome}{d.internacional ? ' (internacional)' : ''}{d.tipo === 'data_internacional' ? ' (data internacional)' : ''}</span>
                                    </li>
                                ))}
                            </ul>
                            <p className="mt-2 text-xs text-slate-500">Pontes pela Lei dos Feriados (feriado à terça → segunda; à quinta → sexta). Confirme-as todos os anos com o decreto do Governo em Configurações › Horários e calendário.</p>
                        </div>
                    </aside>
                </div>
            )}

            <section className="mb-5 overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 p-4 dark:border-slate-800">
                    <div><h2 className="text-lg font-extrabold">Mapa de férias da equipa · {ano}</h2><p className="text-xs text-slate-500">Clique num nome para o planear no calendário. Verde: aprovado · tracejado: previsto · laranja: pedido pendente.</p></div>
                    <Select value={departamento} onValueChange={setDepartamento}>
                        <SelectTrigger className="w-56" aria-label="Departamento"><SelectValue /></SelectTrigger>
                        <SelectContent><SelectItem value={TODOS}>Todos os departamentos</SelectItem>{base.dados.departamentos.map(d => <SelectItem key={d.id} value={d.id}>{d.nome}</SelectItem>)}</SelectContent>
                    </Select>
                </div>
                {doAno.length === 0 && (
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3 text-sm dark:border-slate-800 dark:bg-slate-950">
                        <span>Ainda não há férias planeadas em {ano}.</span>
                        {gerir && <Button size="sm" onClick={novo}><Plus className="mr-1.5 h-4 w-4" /> Planear férias</Button>}
                    </div>
                )}
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[1000px] text-sm">
                        <thead className="bg-slate-50 text-xs text-slate-600 dark:bg-slate-950 dark:text-slate-400">
                            <tr><th className="px-4 py-2.5 text-left">Funcionário</th>{MESES.map(m => <th key={m} className="px-0 py-2.5 font-semibold">{m}</th>)}
                                <th className="px-2">Direito</th><th className="px-2">Transit.</th><th className="px-2">Marcados</th><th className="px-2">Gozados</th><th className="px-3">Saldo</th></tr>
                        </thead>
                        <tbody>{equipaFiltrada.map(x => {
                            const s = saldoDe(x);
                            const meus = doAno.filter(p => p.funcionario_id === x.id);
                            return (
                                <tr key={x.id} className={cn('border-t border-slate-100 dark:border-slate-800', x.id === sel && 'bg-[#F6FEF9] dark:bg-emerald-950/20')}>
                                    <td className="px-4 py-2"><button type="button" className="text-left font-semibold hover:underline" onClick={() => escolherFuncionario(x.id)}>{x.nome}</button>
                                        <div className="text-[11px] text-slate-500">{nomeDep(x.departamento_id)}</div></td>
                                    {MESES.map((_, i) => {
                                        const mes = `${ano}-${String(i + 1).padStart(2, '0')}`;
                                        const p = meus.find(y => (y.data_inicio && y.data_fim ? y.data_inicio.slice(0, 7) <= mes && y.data_fim.slice(0, 7) >= mes : y.mes_previsto === i + 1));
                                        if (!p) return <td key={mes} className="px-0 py-2"><div className="h-5 border-l border-dashed border-slate-200 dark:border-slate-800" /></td>;
                                        const e = visivel(p);
                                        const primeiro = !p.data_inicio || p.data_inicio.slice(0, 7) === mes, ultimo = !p.data_fim || p.data_fim.slice(0, 7) === mes;
                                        return (
                                            <td key={mes} className="px-0 py-2">
                                                <button type="button" onClick={() => (gerir && p.estado === 'planeado' ? editarPlano(p) : escolherFuncionario(x.id))}
                                                    title={`${ROTULO[e]}${p.data_inicio ? ` · ${dataPt(p.data_inicio)} a ${dataPt(p.data_fim)}${p.data_regresso ? ` · regresso ${dataPt(p.data_regresso)}` : ''}` : ' · só o mês previsto'}`}
                                                    aria-label={`${x.nome}: férias ${ROTULO[e]} em ${MESES_PT[i]}`}
                                                    className={cn('block h-5 w-full', primeiro && 'ml-0.5 rounded-l-full', ultimo && 'rounded-r-full',
                                                        e === 'previsto' ? 'border-2 border-dashed border-[#12B76A] bg-[#D1FADF]' : e.startsWith('pendente') ? 'bg-orange-400' : 'bg-[#12B76A]')} />
                                            </td>
                                        );
                                    })}
                                    <td className="px-2 text-center">{s.direito}</td><td className="px-2 text-center">{s.transitados}</td>
                                    <td className="px-2 text-center font-semibold text-[#067647]">{s.marcados}</td><td className="px-2 text-center">{s.gozados}</td>
                                    <td className={cn('px-3 text-center font-black', s.saldo < 0 && 'text-red-600')}>{s.saldo}</td>
                                </tr>
                            );
                        })}</tbody>
                    </table>
                </div>
            </section>

            {doAno.length > 0 && (
                <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                    <h2 className="border-b border-slate-200 px-4 py-3 font-extrabold dark:border-slate-800">Pedidos e planos de {ano}</h2>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-50 text-left text-[11px] uppercase text-slate-500 dark:bg-slate-950"><tr><th className="px-3 py-2">Funcionário</th><th className="px-3 py-2">Período</th><th className="px-3 py-2">Regresso</th><th className="px-3 py-2">Dias úteis</th><th className="px-3 py-2">Estado</th><th className="px-3 py-2">Subsídio</th><th className="px-3 py-2 text-right">Acções</th></tr></thead>
                            <tbody>{doAno.map(p => {
                                const e = visivel(p);
                                const efectivo = estadoEfectivo(p, hoje);
                                return (
                                    <tr key={p.id} className="border-t border-slate-100 dark:border-slate-800">
                                        <td className="px-3 py-2 font-semibold">{base.dados.funcionarios.find(x => x.id === p.funcionario_id)?.nome || '—'}{p.pedido_funcionario ? <span className="ml-1 rounded bg-violet-100 px-1.5 text-[10px] font-bold text-violet-700">portal</span> : null}
                                            {p.chefe_aprovado_por_nome && p.estado === 'planeado' ? <div className="text-[11px] font-normal text-slate-500">Chefe: {p.chefe_aprovado_por_nome}</div> : null}</td>
                                        <td className="px-3 py-2">{p.data_inicio ? `${dataPt(p.data_inicio)} a ${dataPt(p.data_fim)}` : `previsto em ${MESES[(p.mes_previsto || 1) - 1]}`}</td>
                                        <td className="px-3 py-2">{p.data_regresso ? dataSemana(p.data_regresso) : '—'}</td>
                                        <td className="px-3 py-2">{p.dias || '—'}</td>
                                        <td className="px-3 py-2"><span className={cn('rounded-full px-2 py-0.5 text-[11px] font-bold', COR[e])}>{ROTULO[e]}</span></td>
                                        <td className="px-3 py-2 text-xs">{p.subsidio_processado ? 'processado' : p.processamento_id ? 'em processamento' : '—'}</td>
                                        <td className="whitespace-nowrap px-3 py-2 text-right">
                                            {gerir && p.estado === 'planeado' && <Button size="icon" variant="ghost" title="Alterar no calendário" aria-label="Alterar no calendário" onClick={() => editarPlano(p)}><Edit className="h-4 w-4" /></Button>}
                                            {gerir && actor && p.estado === 'planeado' && p.data_inicio && <Button size="icon" variant="ghost" title="Aprovar" aria-label="Aprovar" onClick={() => aprovarAccao(p)}><CheckCircle2 className="h-4 w-4 text-emerald-600" /></Button>}
                                            {gerir && p.estado === 'planeado' && p.pedido_funcionario ? <Button size="icon" variant="ghost" title="Recusar" aria-label="Recusar" onClick={() => setRecusar(p)}><XCircle className="h-4 w-4 text-red-600" /></Button> : null}
                                            {['aprovado', 'em_gozo', 'gozado'].includes(efectivo) && <Button size="icon" variant="ghost" title="Guia de férias (PDF)" aria-label="Guia de férias (PDF)" onClick={() => void guia(p)}><FileDown className="h-4 w-4" /></Button>}
                                            {calcular && !p.subsidio_processado && ['aprovado', 'em_gozo'].includes(efectivo) && <Button size="icon" variant="ghost" title="Processar subsídio de férias" aria-label="Processar subsídio de férias" onClick={() => void processar(p)}><Receipt className="h-4 w-4 text-violet-600" /></Button>}
                                            {gerir && ['aprovado', 'em_gozo'].includes(efectivo) && <Button size="icon" variant="ghost" title="Interromper (regresso antecipado)" aria-label="Interromper" onClick={() => setInterromper(p)}><PauseCircle className="h-4 w-4 text-sky-600" /></Button>}
                                            {gerir && ['planeado', 'aprovado'].includes(efectivo) && <Button size="icon" variant="ghost" title="Anular" aria-label="Anular" onClick={() => setAnular(p)}><Undo2 className="h-4 w-4 text-red-600" /></Button>}
                                        </td>
                                    </tr>
                                );
                            })}</tbody>
                        </table>
                    </div>
                </section>
            )}

            {actor && anular && <DialogoMotivo titulo="Anular plano de férias" descricao="Se já estava aprovado, a marcação de férias no livro de ponto também é anulada." botao="Anular"
                onClose={() => setAnular(null)} onConfirmar={m => executar(() => ServicoFeriasRH.anular(anular, m, actor), 'Plano anulado').then(ok => { if (ok) recarregar(); return ok; })} />}
            {actor && recusar && <DialogoMotivo titulo="Recusar pedido de férias" descricao="O funcionário recebe um aviso com o motivo." botao="Recusar"
                onClose={() => setRecusar(null)} onConfirmar={m => executar(() => ServicoFeriasRH.recusar(recusar, m, actor), 'Pedido recusado').then(ok => { if (ok) recarregar(); return ok; })} />}
            {actor && interromper && <DialogoInterromper plano={interromper} actor={actor} onClose={() => setInterromper(null)} onSaved={recarregar} />}
        </MainLayout>
    );
}

function DialogoMotivo({ titulo, descricao, botao, onClose, onConfirmar }: { titulo: string; descricao: string; botao: string; onClose: () => void; onConfirmar: (motivo: string) => Promise<boolean> }) {
    const [motivo, setMotivo] = useState('');
    return (
        <Dialog open onOpenChange={v => !v && onClose()}>
            <DialogContent className="max-w-md">
                <DialogHeader><DialogTitle>{titulo}</DialogTitle><DialogDescription>{descricao}</DialogDescription></DialogHeader>
                <Label htmlFor="motivo-ferias" className="text-xs font-bold">Motivo</Label>
                <Textarea id="motivo-ferias" rows={3} value={motivo} onChange={e => setMotivo(e.target.value)} />
                <DialogFooter><Button variant="outline" onClick={onClose}>Cancelar</Button>
                    <Button variant="destructive" onClick={() => void onConfirmar(motivo).then(ok => ok && onClose())}>{botao}</Button></DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function DialogoInterromper({ plano, actor, onClose, onSaved }: { plano: PlanoFeriasRH; actor: ActorRH; onClose: () => void; onSaved: () => void }) {
    const hoje = luandaTodayKey();
    const [ultimo, setUltimo] = useState(hoje < (plano.data_fim || hoje) && hoje >= (plano.data_inicio || hoje) ? hoje : plano.data_inicio || hoje);
    const [motivo, setMotivo] = useState('');
    return (
        <Dialog open onOpenChange={v => !v && onClose()}>
            <DialogContent className="max-w-md">
                <DialogHeader><DialogTitle>Interromper férias</DialogTitle>
                    <DialogDescription>Férias de {dataPt(plano.data_inicio)} a {dataPt(plano.data_fim)}. Os dias úteis depois do novo último dia voltam ao saldo e o livro de ponto é corrigido.</DialogDescription></DialogHeader>
                <div className="grid gap-3">
                    <div><Label htmlFor="int-ultimo" className="text-xs font-bold">Novo último dia de férias</Label>
                        <Input id="int-ultimo" className="mt-1" type="date" min={plano.data_inicio || undefined} max={plano.data_fim ? somarDias(plano.data_fim, -1) : undefined} value={ultimo} onChange={e => setUltimo(e.target.value)} /></div>
                    <div><Label htmlFor="int-motivo" className="text-xs font-bold">Motivo</Label><Textarea id="int-motivo" className="mt-1" rows={2} value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Ex.: regresso antecipado a pedido da direcção" /></div>
                </div>
                <DialogFooter><Button variant="outline" onClick={onClose}>Cancelar</Button>
                    <Button onClick={() => void executar(() => ServicoFeriasRH.interromper(plano, ultimo, motivo, actor), 'Férias interrompidas').then(ok => { if (ok) { onSaved(); onClose(); } })}>Interromper</Button></DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
