import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { MainLayout } from '@/componentes/layout/MainLayout';
import { Button } from '@/componentes/ui/button';
import { Input } from '@/componentes/ui/input';
import { Label } from '@/componentes/ui/label';
import { Textarea } from '@/componentes/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/componentes/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/componentes/ui/dropdown-menu';
import { AlertTriangle, CalendarDays, Clock, Download, FileText, Inbox, Loader2, Phone, RefreshCw, Users, Wallet, XCircle } from 'lucide-react';
import { ServicoPainelRH, type DadosPainel, type PedidoPainel } from '@/servicos/rh/ServicoPainelRH';
import { ServicoAlertasRH, type AlertaRH } from '@/servicos/rh/ServicoAlertasRH';
import { ServicoPontoRH } from '@/servicos/rh/ServicoPontoRH';
import { ServicoFeriasRH, type PlanoFeriasRH } from '@/servicos/rh/ServicoFeriasRH';
import { ServicoTempoRH, type AusenciaRH } from '@/servicos/rh/ServicoTempoRH';
import { ServicoPortalComunicacao, type PedidoRH } from '@/servicos/rh/ServicoPortalComunicacao';
import { corDepartamento, ETAPAS_SALARIOS, ROTULO_PERIODO, type Periodo } from '@/bibliotecas/rh/painel-rh';
import { gerarRelatorioPainelPdf } from '@/bibliotecas/rh/pdf-rh';
import { luandaTodayKey } from '@/bibliotecas/fuso-angola';
import { confirmar } from '@/bibliotecas/alerta';
import { cn } from '@/bibliotecas/utils';
import { useActorRH } from '@/ganchos/usar-modulo-rh';
import { useData } from '@/contextos/ContextoDados';
import { NavegacaoRH, executar, kz } from '@/componentes/rh/comum-rh';
import { CaixaPortalRH } from '@/componentes/rh/CaixaPortalRH';
import { EVENTO_ALERTAS_RH } from '@/componentes/rh/TarefaDiariaRH';
import { GraficoAssiduidade, GraficoAusencias, GraficoDepartamentos, GraficoMassa, MapaPresenca } from '@/componentes/rh/painel/GraficosPainel';
import { useBaseRH } from './FuncionariosRH';

/** Próximo aniversário (aaaa-mm-dd) a partir de hoje; 29/02 conta a 28/02 nos anos não bissextos. */
export function proximoAniversario(nascimento: string, hoje: string) {
    const [, m, d] = nascimento.split('-').map(Number);
    for (const ano of [Number(hoje.slice(0, 4)), Number(hoje.slice(0, 4)) + 1]) {
        const bissexto = (ano % 4 === 0 && ano % 100 !== 0) || ano % 400 === 0;
        const dia = m === 2 && d === 29 && !bissexto ? 28 : d;
        const chave = `${ano}-${String(m).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
        if (chave >= hoje) return chave;
    }
    return '';
}

const TODOS = '__todos__';
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const MESES_CURTOS = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
const dataPt = (d: string) => d.slice(0, 10).split('-').reverse().join('/');
const dataExtenso = (d: string, diaSemana: string) => `${diaSemana.charAt(0).toUpperCase()}${diaSemana.slice(1)}, ${Number(d.slice(8, 10))} de ${MESES[Number(d.slice(5, 7)) - 1]} de ${d.slice(0, 4)}`;
const iniciais = (nome: string) => nome.split(/\s+/u).filter(Boolean).map(p => p[0]).filter((_, i, a) => i === 0 || i === a.length - 1).join('').toUpperCase();
const horasMin = (min: number) => `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ''}`;
const ROTULO_ACCAO: Record<string, string> = {
    ponto_sem_marcacao: 'Resolver', contrato: 'Renovar', experiencia: 'Ver contrato', documento: 'Ver ficha', prazos: 'Abrir', fichas: 'Ver', portal: 'Abrir', ferias: 'Processar subsídio',
    natal: 'Processar subsídio', faltas_pendentes: 'Ver faltas', aniversario: 'Enviar mensagem', aniversario_proximo: 'Enviar mensagem',
};

const cartao = 'rounded-[14px] border border-[#E4E7EC] bg-white dark:border-slate-800 dark:bg-slate-900';
const botao = 'inline-flex h-[38px] items-center justify-center gap-[7px] whitespace-nowrap rounded-lg border border-[#D0D5DD] bg-white px-3 text-[13px] font-semibold text-[#344054] hover:bg-[#F9FAFB] disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800';
const ligacao = 'p-0 text-[13px] font-semibold text-[#1D4ED8] hover:underline dark:text-sky-400';
const campo = 'h-[38px] rounded-lg border border-[#D0D5DD] bg-white px-2.5 text-[13px] text-[#101828] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100';

export default function PainelRH() {
    const { actor, gerir, salarios, calcular } = useActorRH();
    const { companySettings } = useData();
    const navigate = useNavigate();
    const base = useBaseRH();
    const hoje = luandaTodayKey();
    const [departamento, setDepartamento] = useState(TODOS);
    const [periodo, setPeriodo] = useState<Periodo>('este_mes');
    const [personalizado, setPersonalizado] = useState({ de: `${hoje.slice(0, 7)}-01`, ate: hoje });
    const [dados, setDados] = useState<DadosPainel | null>(null);
    const [aCarregar, setACarregar] = useState(false);
    const [erro, setErro] = useState<string | null>(null);
    const [recusar, setRecusar] = useState<PedidoPainel | null>(null);
    const [correio, setCorreio] = useState(false);

    // Chefe de departamento sem «gerir RH»: vê só o seu departamento (validado também nas leituras do processo principal).
    const chefeDe = useMemo(() => base.dados.departamentos.filter(d => base.dados.funcionarios.find(f => f.id === d.responsavel_id)?.utilizador_id === actor?.id), [base.dados, actor?.id]);
    const restrito = !gerir && chefeDe.length > 0;
    const departamentoEfectivo = restrito ? (chefeDe.some(d => d.id === departamento) ? departamento : chefeDe[0].id) : departamento === TODOS ? null : departamento;

    const carregar = useCallback(async () => {
        setACarregar(true);
        try {
            setDados(await ServicoPainelRH.carregar({ departamentoId: departamentoEfectivo, periodo, de: personalizado.de, ate: personalizado.ate, salarios }));
            setErro(null);
        } catch (e) { setErro((e as Error).message); } finally { setACarregar(false); }
    }, [departamentoEfectivo, periodo, personalizado.de, personalizado.ate, salarios]);
    useEffect(() => { void carregar(); }, [carregar]);
    // Ao vivo: actualiza a cada 60 s e quando a tarefa diária gera alertas.
    useEffect(() => {
        const t = window.setInterval(() => void carregar(), 60_000);
        const evento = () => void carregar();
        window.addEventListener(EVENTO_ALERTAS_RH, evento);
        return () => { window.clearInterval(t); window.removeEventListener(EVENTO_ALERTAS_RH, evento); };
    }, [carregar]);

    const d = dados;
    const nomeDepartamento = departamentoEfectivo ? base.dados.departamentos.find(x => x.id === departamentoEfectivo)?.nome || '—' : 'Todos os departamentos';
    const rotuloPeriodo = d ? (periodo === 'personalizado' ? `${dataPt(d.intervalo.de)} a ${dataPt(d.intervalo.ate)}` : periodo === 'este_mes' || periodo === 'mes_passado'
        ? `${MESES[Number(d.intervalo.de.slice(5, 7)) - 1]} de ${d.intervalo.de.slice(0, 4)}` : ROTULO_PERIODO[periodo]) : ROTULO_PERIODO[periodo];

    const lancarFalta = async (lista: Array<{ id: string; nome: string }>) => {
        if (!actor || !lista.length) return;
        if (!await confirmar(lista.length === 1 ? `Lançar falta injustificada a ${lista[0].nome} hoje (${dataPt(hoje)})?` : `Lançar falta injustificada hoje a ${lista.length} funcionários sem marcação?`,
            { titulo: 'Lançar falta', confirmar: 'Sim, lançar falta', perigo: true })) return;
        const ok = await executar(() => ServicoPontoRH.acao({ celulas: lista.map(x => ({ funcionarioId: x.id, data: hoje })), acao: 'falta', massa: lista.length > 1,
            motivo: 'Sem marcação nem justificação à hora do alerta (lançado no Painel de RH)' }, actor), lista.length === 1 ? 'Falta lançada' : 'Faltas lançadas');
        if (ok) void carregar();
    };
    const aprovar = async (p: PedidoPainel) => {
        if (!actor) return;
        const ok = await executar(async () => {
            if (p.tipo === 'ferias') await ServicoFeriasRH.aprovar(p.origem as PlanoFeriasRH, actor);
            else if (p.tipo === 'dispensa') await ServicoTempoRH.aprovarAusencia(p.origem as AusenciaRH, actor);
            else if (p.tipo === 'justificacao') await ServicoPontoRH.decidirJustificacao(p.id, true, '', actor);
            else await ServicoPortalComunicacao.responderPedido(p.origem as PedidoRH, 'aprovado', 'Aprovado.', actor, base.dados.funcionarios.find(f => f.id === p.funcionarioId)?.utilizador_id || null);
        }, `${p.rotulo} aprovado(a)`);
        if (ok) void carregar();
    };
    const recusarPedido = async (p: PedidoPainel, motivo: string) => {
        if (!actor) return false;
        const ok = await executar(async () => {
            if (p.tipo === 'ferias') await ServicoFeriasRH.recusar(p.origem as PlanoFeriasRH, motivo, actor);
            else if (p.tipo === 'dispensa') await ServicoTempoRH.anularAusencia(p.origem as AusenciaRH, `Recusado: ${motivo}`, actor);
            else if (p.tipo === 'justificacao') await ServicoPontoRH.decidirJustificacao(p.id, false, motivo, actor);
            else await ServicoPortalComunicacao.responderPedido(p.origem as PedidoRH, 'recusado', motivo, actor, base.dados.funcionarios.find(f => f.id === p.funcionarioId)?.utilizador_id || null);
        }, `${p.rotulo} recusado(a)`);
        if (ok) void carregar();
        return ok;
    };
    const alertaAccao = (a: AlertaRH) => {
        if (actor && a.estado === 'novo') void ServicoAlertasRH.marcarLido(a.id, actor);
        if (a.tipo === 'ponto_sem_marcacao') navigate(`/rh/ponto?dia=${hoje}${a.funcionario_id ? `&funcionario=${a.funcionario_id}` : ''}`);
        else if (a.tipo.startsWith('aniversario') && a.funcionario_id) navigate('/rh/portal');
        else if (a.accao) navigate(a.accao);
    };
    const relatorio = () => d && void executar(async () => {
        const k = d.kpis;
        gerarRelatorioPainelPdf({
            titulo: 'Relatório mensal de Recursos Humanos', periodo: rotuloPeriodo, departamento: nomeDepartamento,
            kpis: [
                { rotulo: 'Funcionários activos', valor: String(k.activos), detalhe: `${k.suspensos} suspensos · ${k.admitidos} admitidos no período` },
                { rotulo: 'Massa salarial base', valor: k.massaSalarial !== null ? kz(k.massaSalarial) : '—', detalhe: 'soma dos salários base activos' },
                { rotulo: 'Salário base médio', valor: k.salarioMedio !== null ? kz(k.salarioMedio) : '—', detalhe: `massa salarial ÷ ${k.activos} funcionários` },
                { rotulo: 'Saldo de férias da equipa', valor: `${k.saldoFerias} dias`, detalhe: `${k.transitados} transitados · ${k.planeados} planeados` },
                { rotulo: 'Taxa de assiduidade', valor: k.assiduidade !== null ? `${k.assiduidade.toLocaleString('pt-PT')}%` : '—', detalhe: 'dias presentes ÷ dias úteis' },
                { rotulo: 'Faltas injustificadas', valor: String(k.faltas), detalhe: k.descontoFaltas !== null ? `desconto estimado: ${kz(k.descontoFaltas)}` : '' },
                { rotulo: 'Horas extra', valor: horasMin(k.minutosExtra), detalhe: k.custoExtra !== null ? `custo estimado: ${kz(k.custoExtra)}` : '' },
                { rotulo: 'Fichas incompletas', valor: String(k.fichasIncompletas), detalhe: 'sem NIF, INSS, IBAN, BI ou data de nascimento' },
            ],
            assiduidade: d.graficos.assiduidadeDiaria.map(x => ({ rotulo: x.data.slice(8, 10), valor: x.taxa })), meta: d.graficos.meta,
            massa: d.graficos.massaMensal.map((x, i, a) => ({ rotulo: x.rotulo, valor: x.total, destaque: i === a.length - 1 })),
            departamentos: d.graficos.porDepartamento.map(x => ({ rotulo: x.nome, valor: x.funcionarios, cor: corDepartamento(d.graficos.ordemDepartamentos, x.id || null) })),
            ausencias: [['Férias', d.graficos.ausenciasTipo.ferias, '#2a78d6'], ['F. justif.', d.graficos.ausenciasTipo.faltas_justificadas, '#1baf7a'], ['F. injustif.', d.graficos.ausenciasTipo.faltas_injustificadas, '#e34948'],
                ['Licenças', d.graficos.ausenciasTipo.licencas, '#6250d6'], ['Dispensas', d.graficos.ausenciasTipo.dispensas, '#eda100']].map(([rotulo, valor, cor]) => ({ rotulo: String(rotulo), valor: Number(valor), cor: String(cor) })),
        }, companySettings, actor?.name || '');
    }, 'Relatório gerado');

    const accoesRapidas: Array<{ rotulo: string; icone: ReactNode; fundo: string; cor: string; ir: () => void; mostrar: boolean }> = [
        { rotulo: 'Novo funcionário', icone: <Users className="h-[18px] w-[18px]" />, fundo: '#EEF2FF', cor: '#3538CD', ir: () => navigate('/rh/funcionarios?novo=1'), mostrar: gerir },
        { rotulo: 'Importar ponto (CSV)', icone: <Clock className="h-[18px] w-[18px]" />, fundo: '#ECFDF3', cor: '#067647', ir: () => navigate('/rh/ponto?importar=1'), mostrar: gerir },
        { rotulo: 'Planear férias', icone: <CalendarDays className="h-[18px] w-[18px]" />, fundo: '#F0F9FF', cor: '#026AA2', ir: () => navigate('/rh/ferias'), mostrar: gerir },
        { rotulo: 'Lançar falta', icone: <XCircle className="h-[18px] w-[18px]" />, fundo: '#FEF3F2', cor: '#B42318', ir: () => navigate('/rh/ausencias'), mostrar: gerir },
        { rotulo: 'Gerar declaração', icone: <FileText className="h-[18px] w-[18px]" />, fundo: '#FFFAEB', cor: '#B54708', ir: () => navigate('/rh/declaracoes'), mostrar: gerir },
        { rotulo: 'Processar salários', icone: <Wallet className="h-[18px] w-[18px]" />, fundo: '#F4F3FF', cor: '#5925DC', ir: () => navigate('/rh/processamento'), mostrar: calcular },
    ];

    return (
        <MainLayout title="Painel de RH" subtitle="Métricas, gráficos, alertas e acções do dia">
            <NavegacaoRH />
            <div className="flex flex-col gap-[18px]">
                {/* Cabeçalho com filtros */}
                <div className="flex flex-wrap items-end justify-between gap-3.5">
                    <div>
                        <h1 className="text-2xl font-extrabold">Painel de Recursos Humanos</h1>
                        <p className="mt-1 text-sm text-[#5B6474] dark:text-slate-400">
                            {d ? dataExtenso(d.hoje.data, d.hoje.diaSemana) : '…'}
                            {d && ` · actualizado às ${new Date(d.actualizadoEm).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Luanda' })}`}
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <select className={campo} aria-label="Departamento" value={restrito ? departamentoEfectivo || '' : departamento} onChange={e => setDepartamento(e.target.value)}>
                            {!restrito && <option value={TODOS}>Todos os departamentos</option>}
                            {(restrito ? chefeDe : base.dados.departamentos).map(x => <option key={x.id} value={x.id}>{x.nome}</option>)}
                        </select>
                        <select className={campo} aria-label="Período" value={periodo} onChange={e => setPeriodo(e.target.value as Periodo)}>
                            {(Object.keys(ROTULO_PERIODO) as Periodo[]).map(p => <option key={p} value={p}>{ROTULO_PERIODO[p]}</option>)}
                        </select>
                        {periodo === 'personalizado' && <>
                            <Input type="date" aria-label="De" className="h-[38px] w-[150px]" value={personalizado.de} onChange={e => setPersonalizado(x => ({ ...x, de: e.target.value }))} />
                            <Input type="date" aria-label="Até" className="h-[38px] w-[150px]" value={personalizado.ate} onChange={e => setPersonalizado(x => ({ ...x, ate: e.target.value }))} />
                        </>}
                        <button type="button" className={botao} aria-label="Actualizar" title="Actualizar" onClick={() => void carregar()}><RefreshCw className={cn('h-[15px] w-[15px]', aCarregar && 'animate-spin')} /></button>
                        <button type="button" className={botao} disabled={!d} onClick={relatorio}><Download className="h-[15px] w-[15px]" /> Relatório mensal (PDF)</button>
                    </div>
                </div>

                {/* Acções rápidas */}
                {accoesRapidas.some(a => a.mostrar) && (
                    <section aria-label="Acções rápidas" className="grid gap-2.5 [grid-template-columns:repeat(auto-fill,minmax(150px,1fr))]">
                        {accoesRapidas.filter(a => a.mostrar).map(a => (
                            <button key={a.rotulo} type="button" onClick={a.ir}
                                className="flex flex-col items-center justify-center gap-2 rounded-xl border border-[#E4E7EC] bg-white px-2 py-3.5 text-center text-[13px] font-semibold text-[#344054] hover:border-[#0F1B3D] dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200">
                                <span className="flex h-[38px] w-[38px] items-center justify-center rounded-[10px]" style={{ background: a.fundo, color: a.cor }}>{a.icone}</span>{a.rotulo}
                            </button>
                        ))}
                    </section>
                )}

                {erro && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">Não foi possível carregar o painel: {erro}</p>}
                {!d ? <div className={cn(cartao, 'flex items-center justify-center gap-2 p-10 text-sm text-[#5B6474]')}><Loader2 className="h-4 w-4 animate-spin" /> A carregar o painel…</div> : <>

                    {/* Faixa de alertas críticos */}
                    {d.semMarcacoes && (
                        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[#FEDF89] bg-[#FFFAEB] px-4 py-3" role="alert">
                            <AlertTriangle className="h-5 w-5 text-[#B54708]" aria-hidden="true" />
                            <div className="flex-1 text-sm text-[#7A2E0E]"><strong>Ainda não há marcações de ponto hoje.</strong> {d.hoje.devidos === 1 ? 'O funcionário aparece' : `Os ${d.hoje.devidos} funcionários aparecem`} como ausentes. Se o relógio biométrico já registou as entradas, importe o ficheiro.</div>
                            {gerir && <button type="button" className={cn(botao, 'h-[34px]')} onClick={() => navigate('/rh/ponto?importar=1')}>Importar CSV do relógio</button>}
                        </div>
                    )}

                    {/* Hoje + Portal */}
                    <div className="flex flex-wrap items-stretch gap-[18px]">
                        <section className={cn(cartao, 'min-w-0 flex-[999_1_640px] p-[18px]')}>
                            <div className="flex flex-wrap items-center justify-between gap-2.5">
                                <div><h2 className="text-base font-extrabold">Hoje · {dataPt(d.hoje.data)}</h2><p className="mt-0.5 text-xs text-[#5B6474] dark:text-slate-400">Situação em tempo real (actualiza a cada minuto)</p></div>
                                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#067647]"><span className="h-2 w-2 animate-pulse rounded-full bg-[#12B76A]" aria-hidden="true" />Ao vivo</span>
                            </div>
                            {d.hoje.feriado ? (
                                <p className="mt-4 rounded-xl bg-[#FDE3E0] px-4 py-3 text-sm font-semibold text-[#B42318]">Hoje é feriado: {d.hoje.feriado}. As ausências não contam.</p>
                            ) : !d.hoje.diaUtil ? (
                                <p className="mt-4 rounded-xl bg-[#F2F4F7] px-4 py-3 text-sm font-semibold text-[#475467] dark:bg-slate-800 dark:text-slate-300">Hoje não é dia de trabalho para a equipa ({d.hoje.diaSemana}). As ausências não contam.</p>
                            ) : null}
                            <div className="mt-4 flex flex-wrap items-center gap-[22px]">
                                <AnelPresenca valor={d.hoje.taxaPresenca} />
                                <div className="grid min-w-[300px] flex-1 grid-cols-2 gap-2.5 sm:grid-cols-5">
                                    {([['Presentes', d.hoje.presentes, '#F6FEF9', '#067647'], ['Atrasados', d.hoje.atrasados, '#FFFAEB', '#B54708'], ['Ausentes', d.hoje.ausentes, '#FEF3F2', '#B42318'],
                                        ['Férias', d.hoje.ferias, '#F0F9FF', '#026AA2'], ['Licença', d.hoje.licencas, '#F4F3FF', '#5925DC']] as const).map(([r, v, fundo, cor]) => (
                                        <button key={r} type="button" onClick={() => navigate(`/rh/ponto?dia=${d.hoje.data}`)} className="rounded-[10px] p-3 text-left dark:!bg-slate-800" style={{ background: fundo }}>
                                            <div className="text-xs font-semibold text-[#475467] dark:text-slate-400">{r}</div><div className="mt-1.5 text-2xl font-extrabold tabular-nums" style={{ color: cor }}>{v}</div>
                                        </button>
                                    ))}
                                </div>
                            </div>
                            {d.hoje.ausentesLista.length > 0 && <>
                                <div className="mt-3.5 flex items-center justify-between">
                                    <span className="text-xs font-semibold uppercase tracking-wider text-[#475467] dark:text-slate-400">Ausentes sem justificação (depois das {d.hoje.horaAlerta})</span>
                                    {gerir && <button type="button" className={ligacao} onClick={() => void lancarFalta(d.hoje.ausentesLista)}>Lançar falta a todos</button>}
                                </div>
                                {d.hoje.ausentesLista.map(a => (
                                    <div key={a.id} className="flex flex-wrap items-center gap-2.5 border-b border-[#F2F4F7] py-2.5 text-sm last:border-0 dark:border-slate-800">
                                        <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full bg-[#EEF2FF] text-[11px] font-bold text-[#1E3A8A]" aria-hidden="true">{iniciais(a.nome)}</span>
                                        <span className="min-w-0 flex-1"><strong className="font-semibold">{a.nome}</strong> <span className="text-[#5B6474]">· {a.departamento} · sem marcação</span></span>
                                        {a.telefone && <a className={cn(botao, 'h-[30px] text-xs')} href={`tel:${a.telefone.replace(/\s+/gu, '')}`}><Phone className="h-3.5 w-3.5" /> Ligar</a>}
                                        {gerir && <button type="button" className={cn(botao, 'h-[30px] text-xs')} onClick={() => navigate(`/rh/ponto?dia=${d.hoje.data}&funcionario=${a.id}`)}>Registar entrada</button>}
                                        {gerir && <button type="button" className={cn(botao, 'h-[30px] text-xs text-[#B42318]')} onClick={() => void lancarFalta([a])}>Falta</button>}
                                    </div>
                                ))}
                            </>}
                        </section>

                        <PortalCompacto portal={d.portal} gerir={gerir} onAprovar={p => void aprovar(p)} onRecusar={setRecusar} onCorreio={() => setCorreio(true)} onCriarAcessos={() => navigate('/rh/funcionarios')} />
                    </div>

                    {/* 8 indicadores */}
                    <section aria-label="Indicadores" className="grid gap-3.5 [grid-template-columns:repeat(auto-fill,minmax(230px,1fr))]">
                        <Kpi rotulo="Funcionários activos" valor={String(d.kpis.activos)} detalhe={`${d.kpis.suspensos} suspensos · ${d.kpis.admitidos} admitidos no período`} onClick={() => navigate('/rh/funcionarios')} />
                        {salarios && <Kpi rotulo="Massa salarial base" valor={kz(d.kpis.massaSalarial || 0)} detalhe="soma dos salários base activos" onClick={() => navigate('/rh/contratos')} />}
                        {salarios && <Kpi rotulo="Salário base médio" valor={d.kpis.salarioMedio !== null ? kz(d.kpis.salarioMedio) : '—'} detalhe={`massa salarial ÷ ${d.kpis.activos} funcionários`} onClick={() => navigate('/rh/contratos')} />}
                        <Kpi rotulo="Saldo de férias da equipa" valor={`${d.kpis.saldoFerias} dias`} detalhe={`${d.kpis.transitados} transitados · ${d.kpis.planeados} planeados`} onClick={() => navigate('/rh/ferias')} />
                        <Kpi rotulo={`Taxa de assiduidade (${periodo === 'este_mes' ? 'mês' : 'período'})`} valor={d.kpis.assiduidade !== null ? `${d.kpis.assiduidade.toLocaleString('pt-PT')}%` : '—'}
                            detalhe="dias presentes ÷ dias úteis" variacao={d.kpis.assiduidadeVariacao} unidade=" p.p." melhorSobe onClick={() => navigate('/rh/ponto')} />
                        <Kpi rotulo={`Faltas injustificadas (${periodo === 'este_mes' ? 'mês' : 'período'})`} valor={String(d.kpis.faltas)} detalhe={d.kpis.descontoFaltas !== null ? `desconto estimado: ${kz(d.kpis.descontoFaltas)}` : 'dias de falta injustificada'}
                            variacao={d.kpis.faltasVariacao} unidade="%" onClick={() => navigate('/rh/ausencias')} />
                        <Kpi rotulo={`Horas extra (${periodo === 'este_mes' ? 'mês' : 'período'})`} valor={horasMin(d.kpis.minutosExtra)} detalhe={d.kpis.custoExtra !== null ? `custo estimado: ${kz(d.kpis.custoExtra)}` : 'minutos acima do horário'}
                            variacao={d.kpis.extraVariacao} unidade="%" onClick={() => navigate('/rh/ponto')} />
                        <Kpi rotulo="Fichas incompletas" valor={String(d.kpis.fichasIncompletas)} cor={d.kpis.fichasIncompletas ? '#B54708' : undefined}
                            detalhe={d.kpis.fichasIncompletas ? `sem ${[...new Set(d.kpis.incompletos.flatMap(x => x.faltam))].slice(0, 3).join(', ')} · ver` : 'todas as fichas completas'} onClick={() => navigate('/rh/funcionarios?incompletas=1')} />
                    </section>

                    {/* Gráficos 2×2 */}
                    <div className="grid gap-[18px] [grid-template-columns:repeat(auto-fill,minmax(min(460px,100%),1fr))]">
                        <GraficoAssiduidade dados={d.graficos.assiduidadeDiaria} meta={d.graficos.meta} onDia={data => navigate(`/rh/ponto?dia=${data}`)} />
                        {salarios
                            ? <GraficoMassa dados={d.graficos.massaMensal} onMes={() => navigate('/rh/processamento')} />
                            : <section className={cn(cartao, 'flex items-center justify-center p-6 text-center text-sm text-[#5B6474]')}>A massa salarial só aparece a quem tem a permissão «RH: Ver salários».</section>}
                        <GraficoDepartamentos dados={d.graficos.porDepartamento} ordem={d.graficos.ordemDepartamentos} salarios={salarios} onDepartamento={id => !restrito && setDepartamento(id)} />
                        <GraficoAusencias tipos={d.graficos.ausenciasTipo} semana={d.graficos.ausenciasSemana} periodo={rotuloPeriodo} onTipo={() => navigate('/rh/ausencias')} />
                    </div>

                    <MapaPresenca mapa={d.graficos.mapa} dias={d.graficos.diasMapa} titulo={`${MESES[Number(d.graficos.mesMapa.slice(5, 7)) - 1]} ${d.graficos.mesMapa.slice(0, 4)}`}
                        onDia={(funcionarioId, data) => navigate(`/rh/ponto?dia=${data}&funcionario=${funcionarioId}`)} />

                    {/* Cartões inferiores */}
                    <div className="grid gap-[18px] [grid-template-columns:repeat(auto-fill,minmax(min(340px,100%),1fr))]">
                        <section className={cn(cartao, 'p-[18px]')}>
                            <div className="flex items-center justify-between"><h2 className="text-base font-extrabold">Alertas e lembretes</h2>
                                <span className="rounded-full bg-[#FEF0C7] px-2 py-0.5 text-xs font-bold text-[#93370D]">{d.alertas.length} aberto{d.alertas.length === 1 ? '' : 's'}</span></div>
                            {d.alertas.length === 0 ? <p className="py-6 text-center text-sm text-[#5B6474]">Sem alertas abertos.</p> : (
                                <ul className="max-h-[360px] overflow-y-auto">
                                    {d.alertas.map(a => (
                                        <li key={a.id} className="flex items-center gap-2.5 border-b border-[#F2F4F7] py-2.5 text-sm last:border-0 dark:border-slate-800">
                                            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: a.prioridade === 1 ? '#D92D20' : a.prioridade === 2 ? '#F79009' : '#98A2B3' }} aria-label={a.prioridade === 1 ? 'Prioridade alta' : a.prioridade === 2 ? 'Prioridade média' : 'Informativo'} />
                                            <span className={cn('min-w-0 flex-1', a.prioridade === 3 && 'text-[#5B6474]')}>{a.mensagem}</span>
                                            {(a.accao || a.tipo === 'ponto_sem_marcacao') && <button type="button" className={ligacao} onClick={() => alertaAccao(a)}>{ROTULO_ACCAO[a.tipo] || 'Abrir'}</button>}
                                            {actor && (
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild><button type="button" className="rounded px-1 text-xs font-semibold text-[#475467] hover:bg-[#F2F4F7] dark:text-slate-400" aria-label={`Resolver ou adiar: ${a.mensagem}`}>⋯</button></DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end">
                                                        <DropdownMenuItem onSelect={() => void ServicoAlertasRH.resolver(a.id, actor).then(carregar)}>Marcar como resolvido</DropdownMenuItem>
                                                        <DropdownMenuItem onSelect={() => void ServicoAlertasRH.adiar(a.id, 1, actor).then(carregar)}>Adiar 1 dia</DropdownMenuItem>
                                                        <DropdownMenuItem onSelect={() => void ServicoAlertasRH.adiar(a.id, 7, actor).then(carregar)}>Adiar 1 semana</DropdownMenuItem>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            )}
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </section>

                        <section className={cn(cartao, 'p-[18px]')}>
                            <h2 className="text-base font-extrabold">Próximos eventos</h2>
                            {d.eventos.map(e => (
                                <div key={`${e.tipo}-${e.data}-${e.titulo}`} className="flex items-center gap-2.5 border-b border-[#F2F4F7] py-2.5 text-sm last:border-0 dark:border-slate-800">
                                    <span className="w-11 shrink-0 text-center"><strong className="block text-lg leading-tight">{e.data.slice(8, 10)}</strong><span className="text-[11px] tabular-nums text-[#5B6474]">{MESES_CURTOS[Number(e.data.slice(5, 7)) - 1]}</span></span>
                                    <span className="min-w-0 flex-1"><strong className="font-semibold">{e.titulo}</strong><br /><span className="text-xs text-[#5B6474]">{e.detalhe}</span></span>
                                    {e.rota && <button type="button" className={ligacao} onClick={() => navigate(e.rota!)}>Abrir</button>}
                                </div>
                            ))}
                            {!d.eventos.some(e => e.tipo === 'ferias') && (
                                <div className="flex items-center gap-2.5 py-2.5 text-sm">
                                    <span className="w-11 shrink-0 text-center text-lg font-bold">—</span>
                                    <span className="flex-1 text-[#5B6474]">Sem férias marcadas nos próximos 30 dias</span>
                                    {gerir && <button type="button" className={ligacao} onClick={() => navigate('/rh/ferias')}>Planear</button>}
                                </div>
                            )}
                        </section>

                        <SalariosMes s={d.salariosMes} mes={MESES[Number(hoje.slice(5, 7)) - 1]} ano={hoje.slice(0, 4)} calcular={calcular} onAbrir={() => navigate(d.salariosMes?.processamentoId ? `/rh/processamento?id=${d.salariosMes.processamentoId}` : '/rh/processamento')} onPonto={() => navigate('/rh/ponto')} />
                    </div>
                </>}
            </div>

            {recusar && <DialogoRecusar pedido={recusar} onClose={() => setRecusar(null)} onConfirmar={m => recusarPedido(recusar, m)} />}
            {correio && actor && (
                <Dialog open onOpenChange={v => !v && setCorreio(false)}>
                    <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
                        <DialogHeader><DialogTitle>Portal dos funcionários</DialogTitle><DialogDescription>Pedidos e correio interno com os funcionários.</DialogDescription></DialogHeader>
                        <CaixaPortalRH actor={actor} podeResponder={gerir} />
                    </DialogContent>
                </Dialog>
            )}
        </MainLayout>
    );
}

function AnelPresenca({ valor }: { valor: number }) {
    const r = 54, perimetro = 2 * Math.PI * r;
    return (
        <div className="relative h-[132px] w-[132px] shrink-0">
            <svg width="132" height="132" viewBox="0 0 132 132" role="img" aria-label={`Taxa de presença hoje: ${valor}%`}>
                <circle cx="66" cy="66" r={r} fill="none" stroke="#F2F4F7" strokeWidth="14" className="dark:stroke-slate-800" />
                {valor > 0 && <circle cx="66" cy="66" r={r} fill="none" stroke="#12B76A" strokeWidth="14" strokeLinecap="round" strokeDasharray={`${(valor / 100) * perimetro} ${perimetro}`} transform="rotate(-90 66 66)" />}
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center"><strong className="text-[26px] tabular-nums">{valor}%</strong><span className="text-[11px] text-[#5B6474]">presença</span></div>
        </div>
    );
}

function Kpi({ rotulo, valor, detalhe, onClick, variacao, unidade = '%', melhorSobe = false, cor }: {
    rotulo: string; valor: string; detalhe: string; onClick: () => void; variacao?: number | null; unidade?: string; melhorSobe?: boolean; cor?: string;
}) {
    const sobe = (variacao ?? 0) > 0;
    const bom = variacao === null || variacao === undefined || variacao === 0 ? null : melhorSobe ? sobe : !sobe;
    return (
        <button type="button" onClick={onClick} className={cn(cartao, 'p-4 text-left transition-colors hover:border-[#0F1B3D]')}>
            <div className="text-xs font-semibold text-[#475467] dark:text-slate-400">{rotulo}</div>
            <div className="mt-1.5 flex items-baseline gap-2">
                <span className="text-2xl font-extrabold tabular-nums" style={cor ? { color: cor } : undefined}>{valor}</span>
                {variacao !== null && variacao !== undefined && (
                    <span className={cn('text-xs font-bold', bom === null ? 'text-[#475467]' : bom ? 'text-[#067647]' : 'text-[#B42318]')}>
                        {variacao === 0 ? '= igual' : `${sobe ? '▲' : '▼'} ${Math.abs(variacao).toLocaleString('pt-PT')}${unidade}`}<span className="sr-only"> face ao período anterior</span>
                    </span>
                )}
            </div>
            <div className="mt-1 text-xs text-[#5B6474] dark:text-slate-400">{detalhe}{variacao !== null && variacao !== undefined ? ' · vs. período anterior' : ''}</div>
        </button>
    );
}

function PortalCompacto({ portal, gerir, onAprovar, onRecusar, onCorreio, onCriarAcessos }: {
    portal: DadosPainel['portal']; gerir: boolean; onAprovar: (p: PedidoPainel) => void; onRecusar: (p: PedidoPainel) => void; onCorreio: () => void; onCriarAcessos: () => void;
}) {
    return (
        <section className={cn(cartao, 'flex min-w-0 flex-[1_1_360px] flex-col p-[18px] lg:max-w-[480px]')}>
            <div className="flex items-center justify-between gap-2"><h2 className="text-base font-extrabold">Portal dos funcionários</h2>
                <div className="flex gap-1">
                    <span className="inline-flex h-[30px] items-center gap-1.5 rounded-lg bg-[#0F1B3D] px-3 text-xs font-semibold text-white">Pedidos <span className="rounded-full bg-white/20 px-1.5">{portal.pendentes}</span></span>
                    <button type="button" className={cn(botao, 'h-[30px] text-xs')} onClick={onCorreio}>Correio</button>
                </div>
            </div>
            <div className="mt-3.5 grid grid-cols-2 gap-2">
                {([['Férias por aprovar', portal.ferias], ['Justificações', portal.justificacoes], ['Declarações pedidas', portal.declaracoes], ['Dispensas e outros', portal.outros]] as const).map(([r, v]) => (
                    <div key={r} className="rounded-[10px] bg-[#F9FAFB] p-2.5 dark:bg-slate-800"><div className="text-xs font-semibold text-[#475467] dark:text-slate-400">{r}</div><div className="text-xl font-extrabold tabular-nums">{v}</div></div>
                ))}
            </div>
            {portal.recentes.length === 0 ? (
                <div className="mt-3.5 flex flex-1 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[#D0D5DD] p-[22px] text-center dark:border-slate-700">
                    <Inbox className="h-7 w-7 text-[#98A2B3]" aria-hidden="true" />
                    <div className="text-sm font-semibold">Sem pedidos pendentes</div>
                    <div className="text-[13px] text-[#5B6474]">Os pedidos de férias, justificações e declarações feitos no portal aparecem aqui para aprovar com um clique.</div>
                </div>
            ) : (
                <ul className="mt-3.5 flex-1">
                    {portal.recentes.map(p => (
                        <li key={`${p.tipo}-${p.id}`} className="border-b border-[#F2F4F7] py-2.5 text-sm last:border-0 dark:border-slate-800">
                            <div className="flex items-start justify-between gap-2">
                                <span className="min-w-0"><strong className="font-semibold">{p.nome}</strong> · <span className="text-[#475467] dark:text-slate-400">{p.rotulo}</span><br /><span className="text-xs text-[#5B6474]">{p.detalhe}</span></span>
                                {gerir && <span className="flex shrink-0 gap-1">
                                    <button type="button" className="h-7 rounded-md bg-[#067647] px-2 text-xs font-semibold text-white hover:bg-[#05603A]" onClick={() => onAprovar(p)}>Aprovar</button>
                                    <button type="button" className="h-7 rounded-md border border-red-200 px-2 text-xs font-semibold text-[#B42318] hover:bg-red-50" onClick={() => onRecusar(p)}>Recusar</button>
                                </span>}
                            </div>
                        </li>
                    ))}
                </ul>
            )}
            <div className="mt-3 text-[13px] text-[#5B6474] dark:text-slate-400">Funcionários com acesso ao portal: <strong className="text-[#101828] dark:text-white">{portal.comAcesso} de {portal.total}</strong>
                {gerir && portal.comAcesso < portal.total && <> · <button type="button" className={ligacao} onClick={onCriarAcessos}>Criar acessos</button></>}</div>
        </section>
    );
}

function SalariosMes({ s, mes, ano, calcular, onAbrir, onPonto }: { s: DadosPainel['salariosMes']; mes: string; ano: string; calcular: boolean; onAbrir: () => void; onPonto: () => void }) {
    if (!s) return <section className={cn(cartao, 'flex items-center justify-center p-6 text-center text-sm text-[#5B6474]')}>Os salários do mês só aparecem a quem tem a permissão «RH: Ver salários».</section>;
    const indice = ETAPAS_SALARIOS.findIndex(e => e.id === s.etapa);
    const proxima = { ponto: 'Validar o ponto', processar: `Processar ${mes}`, aprovar: 'Aprovar o processamento', pagar: 'Registar o pagamento', recibos: 'Ver os recibos' }[s.etapa];
    return (
        <section className={cn(cartao, 'p-[18px]')}>
            <h2 className="text-base font-extrabold">Salários · {mes} {ano}</h2>
            <ol className="mb-4 mt-3.5 flex gap-1.5" aria-label="Etapas do processamento">
                {ETAPAS_SALARIOS.map((e, i) => (
                    <li key={e.id} className="flex-1" aria-current={i === indice ? 'step' : undefined}>
                        <div className={cn('h-1.5 rounded-[3px]', i < indice ? 'bg-[#12B76A]' : i === indice ? 'bg-[#2a78d6]' : 'bg-[#D0D5DD]')} />
                        <div className={cn('mt-1.5 text-[11px] tabular-nums', i === indice ? 'font-bold text-[#101828] dark:text-white' : 'text-[#5B6474]')}>{e.rotulo}</div>
                    </li>
                ))}
            </ol>
            {([['Salário base', kz(s.base)], ['Bruto (base + subsídios)', s.bruto !== null ? kz(s.bruto) : '—'], ['INSS (3%) + IRT', s.descontos !== null ? kz(s.descontos) : '—']] as const).map(([r, v]) => (
                <div key={r} className="flex items-center border-b border-[#F2F4F7] py-2.5 text-sm dark:border-slate-800"><span className="flex-1 text-[#5B6474]">{r}</span><strong className="tabular-nums">{v}</strong></div>
            ))}
            <div className="flex items-center py-2.5 text-sm"><span className="flex-1 font-semibold">Líquido a pagar</span><strong className="tabular-nums">{s.liquido !== null ? kz(s.liquido) : '—'}</strong></div>
            {s.bruto === null && <p className="text-xs text-[#5B6474]">Os valores do bruto, descontos e líquido aparecem depois de calcular o processamento.</p>}
            {(calcular || s.etapa === 'ponto') && <Button className="mt-2 w-full bg-[#0F1B3D] text-white hover:bg-[#0F1B3D]/90" onClick={s.etapa === 'ponto' ? onPonto : onAbrir}>{proxima}</Button>}
        </section>
    );
}

function DialogoRecusar({ pedido, onClose, onConfirmar }: { pedido: PedidoPainel; onClose: () => void; onConfirmar: (motivo: string) => Promise<boolean> }) {
    const [motivo, setMotivo] = useState('');
    return (
        <Dialog open onOpenChange={v => !v && onClose()}>
            <DialogContent className="max-w-md">
                <DialogHeader><DialogTitle>Recusar {pedido.rotulo.toLowerCase()}</DialogTitle><DialogDescription>{pedido.nome} · {pedido.detalhe}. O funcionário recebe o motivo.</DialogDescription></DialogHeader>
                <Label htmlFor="motivo-recusa-painel" className="text-xs font-bold">Motivo</Label>
                <Textarea id="motivo-recusa-painel" rows={3} value={motivo} onChange={e => setMotivo(e.target.value)} />
                <DialogFooter><Button variant="outline" onClick={onClose}>Cancelar</Button>
                    <Button variant="destructive" disabled={motivo.trim().length < 5} onClick={() => void onConfirmar(motivo.trim()).then(ok => ok && onClose())}>Recusar</Button></DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
