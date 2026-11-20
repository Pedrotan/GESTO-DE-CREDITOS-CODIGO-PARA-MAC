import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { MainLayout } from '@/componentes/layout/MainLayout';
import { cn } from '@/bibliotecas/utils';
import { Button } from '@/componentes/ui/button';
import { Input } from '@/componentes/ui/input';
import { Label } from '@/componentes/ui/label';
import { Textarea } from '@/componentes/ui/textarea';
import { CurrencyInput } from '@/componentes/ui/CurrencyInput';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/componentes/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/componentes/ui/dialog';
import { AlertTriangle, Calculator, CalendarDays, CalendarX, CheckCircle2, ChevronLeft, ChevronRight, Eye, FileDown, Lock, Play, Plus, Trash2, Undo2, Wallet, Banknote } from 'lucide-react';
import { ServicoSalariosRH, ROTULO_TIPO, type EntradaMes, type Processamento, type Recibo, type LinhaReciboRH, type RubricaPontual } from '@/servicos/rh/ServicoSalariosRH';
import { ServicoRH, type FuncionarioRubrica } from '@/servicos/rh/ServicoRH';
import { valorNumerico, valorTexto } from '@/bibliotecas/rh/parametros-rh';
import type { TipoProcessamento } from '@/bibliotecas/rh/motor-salarial';
import { ficheiroTransferencias, gerarFolhaPdf, gerarReciboPdf, gerarRecibosPdf, periodoPt } from '@/bibliotecas/rh/pdf-rh';
import { luandaTodayKey } from '@/bibliotecas/fuso-angola';
import { useActorRH } from '@/ganchos/usar-modulo-rh';
import { useData } from '@/contextos/ContextoDados';
import { ReclamacoesFolha } from '@/componentes/rh/ReclamacoesFolha';
import { RecepcaoSalarios } from '@/componentes/rh/RecepcaoSalarios';
import { NavegacaoRH, dataPt, executar, kz, paraMinor, useCarregar, Vazio } from '@/componentes/rh/comum-rh';
import { useBaseRH } from './FuncionariosRH';

export const LIGACOES_SALARIOS = [
    { path: '/rh/processamento', label: 'Processamento salarial' },
    { path: '/rh/recibos', label: 'Recibos e declarações' },
];
const CORES_ESTADO: Record<string, string> = {
    aberto: 'bg-slate-100 text-slate-700', calculado: 'bg-sky-100 text-sky-800', aprovado: 'bg-violet-100 text-violet-800',
    pago: 'bg-amber-100 text-amber-800', fechado: 'bg-emerald-100 text-emerald-800',
};
const ETAPAS = ['aberto', 'calculado', 'aprovado', 'pago', 'fechado'];

export const cabecalhoPdf = (p: Processamento) => {
    let irt: string | null = null;
    try { irt = p.parametros_json ? JSON.parse(p.parametros_json).irt_tabela : null; } catch { irt = null; }
    return { ano: p.ano, mes: p.mes, tipoRotulo: ROTULO_TIPO[p.tipo], estado: p.estado, irtTabela: irt };
};

const MESES_CURTOS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
type Fase = 'passado' | 'actual' | 'futuro';
/** Cores dos meses: passados a vermelho, o mês em aberto (o corrente) a verde e os que ainda não chegaram a amarelo. */
const CORES_FASE: Record<Fase, { cartao: string; activo: string; ponto: string; texto: string; rotulo: string }> = {
    passado: { cartao: 'border-red-200 bg-red-50/70 hover:bg-red-50 dark:border-red-900/60 dark:bg-red-950/30', activo: 'ring-2 ring-red-500', ponto: 'bg-red-500', texto: 'text-red-700 dark:text-red-300', rotulo: 'Encerrado' },
    actual: { cartao: 'border-emerald-300 bg-emerald-50 hover:bg-emerald-100/70 dark:border-emerald-800 dark:bg-emerald-950/40', activo: 'ring-2 ring-emerald-500', ponto: 'bg-emerald-500 animate-pulse', texto: 'text-emerald-700 dark:text-emerald-300', rotulo: 'Mês em aberto' },
    futuro: { cartao: 'border-amber-200 bg-amber-50/70 hover:bg-amber-50 dark:border-amber-900/60 dark:bg-amber-950/30', activo: 'ring-2 ring-amber-500', ponto: 'bg-amber-400', texto: 'text-amber-700 dark:text-amber-300', rotulo: 'Por chegar' },
};

export default function ProcessamentoRH() {
    const { actor, calcular, aprovar, salarios } = useActorRH();
    const { companySettings } = useData();
    const base = useBaseRH();
    const lista = useCarregar(async () => { await ServicoSalariosRH.unificarNormais().catch(() => 0); return ServicoSalariosRH.processamentos(); }, [] as Processamento[]);
    const fixas = useCarregar(() => ServicoRH.todasRubricasFuncionarios(), [] as FuncionarioRubrica[]);
    const hoje = luandaTodayKey();
    const anoActual = Number(hoje.slice(0, 4));
    const mesActual = Number(hoje.slice(5, 7));
    const [parametrosUrl] = useSearchParams();
    const [ano, setAno] = useState(anoActual);
    const [mesSel, setMesSel] = useState(mesActual);
    const [seleccionado, setSeleccionado] = useState<string | null>(parametrosUrl.get('id'));
    useEffect(() => { const id = parametrosUrl.get('id'); if (id) setSeleccionado(id); }, [parametrosUrl]);
    const [abrir, setAbrir] = useState(false);
    const normalDe = (a: number, m: number) => lista.dados.find(x => x.tipo === 'normal' && x.ano === a && x.mes === m) || null;
    const p = (seleccionado ? lista.dados.find(x => x.id === seleccionado) : null) || normalDe(ano, mesSel);
    useEffect(() => { const x = seleccionado ? lista.dados.find(y => y.id === seleccionado) : null; if (x) { setAno(x.ano); setMesSel(x.mes); } }, [seleccionado, lista.dados]);
    const detalhe = useCarregar(async () => (p ? { recibos: await ServicoSalariosRH.recibos(p.id), pontuais: await ServicoSalariosRH.pontuais(p.id), entradas: await ServicoSalariosRH.entradas(p.id) } : { recibos: [] as Recibo[], pontuais: [] as RubricaPontual[], entradas: [] as EntradaMes[] }),
        { recibos: [] as Recibo[], pontuais: [] as RubricaPontual[], entradas: [] as EntradaMes[] }, [p?.id, p?.estado, p?.calculado_em]);
    const [recibo, setRecibo] = useState<Recibo | null>(null);
    const [pontual, setPontual] = useState(false);
    const [reabrir, setReabrir] = useState(false);
    const [pagar, setPagar] = useState(false);
    const [faltasDe, setFaltasDe] = useState<string | null>(null);
    const [aCalcular, setACalcular] = useState(false);
    const recarregar = async () => { await lista.recarregar(); await detalhe.recarregar(); };
    const accao = (fn: () => Promise<unknown>, msg: string) => executar(fn, msg).then(ok => { if (ok) void recarregar(); return ok; });

    // Quando chega o mês, o processamento normal abre sozinho (uma vez por sessão, só para quem pode calcular).
    const abertoAuto = useRef(false);
    useEffect(() => {
        if (abertoAuto.current || lista.aCarregar || !actor || !calcular || normalDe(anoActual, mesActual)) return;
        abertoAuto.current = true;
        void ServicoSalariosRH.abrirAutomatico(anoActual, mesActual)
            .then(() => lista.recarregar())
            .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [lista.aCarregar, lista.dados, actor, calcular]);

    const fase = (a: number, m: number): Fase => (a < anoActual || (a === anoActual && m < mesActual) ? 'passado' : a === anoActual && m === mesActual ? 'actual' : 'futuro');
    const enquadramentoDe = (funcionarioId: string) => {
        const f = base.dados.funcionarios.find(x => x.id === funcionarioId);
        return f ? { vinculo: f.vinculo, carreira: f.carreira, categoria: f.categoria, escalao: f.escalao, unidade_organica: f.unidade_organica } : undefined;
    };
    const pdfFolhaDe = async (proc: Processamento) => {
        if (!actor) return;
        const [recibos, todas] = await Promise.all([ServicoSalariosRH.recibos(proc.id), ServicoSalariosRH.linhasProcessamento(proc.id)]);
        if (!recibos.length) { void executar(async () => { throw new Error('Este mês ainda não foi calculado.'); }, ''); return; }
        gerarFolhaPdf(recibos.map(r => ({ recibo: r, linhas: todas.filter(l => l.recibo_id === r.id), enquadramento: enquadramentoDe(r.funcionario_id) })), cabecalhoPdf(proc), companySettings, actor.name);
    };
    const pdfRecibos = async () => {
        if (!p || !actor) return;
        const todas = await ServicoSalariosRH.linhasProcessamento(p.id);
        gerarRecibosPdf(detalhe.dados.recibos.map(r => ({ recibo: r, linhas: todas.filter(l => l.recibo_id === r.id) })), cabecalhoPdf(p), companySettings, actor.name);
    };
    const transferencias = () => {
        if (!p) return;
        const csv = ficheiroTransferencias(detalhe.dados.recibos, `${ROTULO_TIPO[p.tipo]} ${String(p.mes).padStart(2, '0')}/${p.ano}`);
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
        a.download = `transferencias-${p.ano}-${String(p.mes).padStart(2, '0')}-${p.tipo}.csv`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
    };
    const correrCalculo = async (proc: Processamento) => {
        if (!actor) return false;
        setACalcular(true);
        const ok = await executar(() => ServicoSalariosRH.calcular(proc, actor), 'Salários calculados');
        setACalcular(false);
        await recarregar();
        return ok;
    };

    // Funcionários do mês com o salário do contrato (ou o lançado no mês), os abonos fixos do registo e o recibo calculado.
    const editavel = Boolean(p && actor && calcular && ['aberto', 'calculado'].includes(p.estado));
    const linhasFuncionarios = useMemo(() => {
        if (!p) return [];
        const inicio = `${p.ano}-${String(p.mes).padStart(2, '0')}-01`;
        const fim = `${p.ano}-${String(p.mes).padStart(2, '0')}-${String(new Date(Date.UTC(p.ano, p.mes, 0)).getUTCDate()).padStart(2, '0')}`;
        const escolhidos = p.funcionarios_json ? new Set<string>(JSON.parse(p.funcionarios_json)) : null;
        const doMes = base.dados.funcionarios.filter(f => (escolhidos ? escolhidos.has(f.id) : f.estado !== 'suspenso')
            && f.data_admissao <= fim && (!f.data_saida || f.data_saida >= inicio));
        const ids = new Set([...doMes.map(f => f.id), ...detalhe.dados.recibos.map(r => r.funcionario_id)]);
        return [...ids].map(id => {
            const f = base.dados.funcionarios.find(x => x.id === id);
            const r = detalhe.dados.recibos.find(x => x.funcionario_id === id) || null;
            const entrada = detalhe.dados.entradas.find(x => x.funcionario_id === id) || null;
            const contrato = base.dados.contratos.find(c => c.funcionario_id === id && c.estado === 'activo')
                || base.dados.contratos.filter(c => c.funcionario_id === id && c.inicio <= fim).sort((a, b) => b.inicio.localeCompare(a.inicio))[0];
            const salarioContrato = contrato?.salario_base_minor ?? 0;
            const salario = entrada?.salario_base_minor ?? (r ? r.salario_base_minor : salarioContrato);
            const abonos = fixas.dados.filter(x => x.funcionario_id === id && x.inicio <= fim && (!x.fim || x.fim >= inicio)).map(x => {
                const rub = base.dados.rubricas.find(y => y.id === x.rubrica_id);
                if (!rub || rub.tipo !== 'abono') return null;
                if (rub.periodicidade === 'pontual' || (rub.periodicidade === 'anual' && Number(rub.mes_pagamento) !== p.mes)) return null;
                const unit = x.valor_minor || rub.valor_padrao_minor || 0;
                const valor = rub.por_dia ? unit * 30 : rub.forma === 'percentagem' ? Math.round(salario * rub.percentagem * (x.quantidade || 1)) : rub.forma === 'quantidade' ? Math.round(unit * (x.quantidade || 1)) : unit;
                return { nome: rub.nome, valor };
            }).filter((x): x is { nome: string; valor: number } => Boolean(x));
            const resumo = r?.resumo_json ? (() => { try { return JSON.parse(r.resumo_json) as { faltasDescontaveis?: number }; } catch { return {}; } })() : {};
            const faltas = entrada?.faltas ?? resumo.faltasDescontaveis ?? 0;
            return {
                id, nome: f?.nome || r?.nome || '—', numero: f?.numero_mecanografico || r?.numero_mecanografico || '', iban: f?.iban || r?.iban || null,
                cargo: base.dados.cargos.find(c => c.id === f?.cargo_id)?.nome || r?.cargo || null,
                salario, salarioContrato, alterado: entrada?.salario_base_minor != null, abonos, faltas, recibo: r,
            };
        }).sort((a, b) => a.nome.localeCompare(b.nome, 'pt'));
    }, [p, base.dados, detalhe.dados, fixas.dados]);
    const desactualizado = Boolean(p && p.estado === 'aberto' && detalhe.dados.recibos.length);
    const valorFalta = valorNumerico(base.dados.parametros, 'valor_falta', luandaTodayKey(), 0);
    const divisorTexto = valorTexto(base.dados.parametros, 'divisor_dia', luandaTodayKey(), '30');
    const guardarEntrada = async (funcionarioId: string, valores: { salario_base_minor?: number | null; faltas?: number | null }) => {
        if (!p || !actor) return false;
        const jaCalculado = detalhe.dados.recibos.length > 0;
        const ok = await executar(async () => {
            await ServicoSalariosRH.guardarEntrada(p, funcionarioId, valores, actor);
            if (jaCalculado) await ServicoSalariosRH.calcular(p, actor);
        }, jaCalculado ? 'Guardado e salários recalculados' : 'Valor guardado');
        if (ok) await recarregar();
        return ok;
    };

    if (!salarios) return <MainLayout title="Processamento salarial"><NavegacaoRH extra={LIGACOES_SALARIOS} /><Vazio>Exige a permissão «RH: Ver salários».</Vazio></MainLayout>;

    const faseSel = fase(ano, mesSel);
    const outrosDoMes = lista.dados.filter(x => x.ano === ano && x.mes === mesSel && x.tipo !== 'normal');
    const funcionarioFaltas = linhasFuncionarios.find(x => x.id === faltasDe) || null;

    return (
        <MainLayout title="Processamento salarial" subtitle="Mês a mês: lançar salários e faltas, calcular, aprovar, pagar e fechar">
            <NavegacaoRH extra={LIGACOES_SALARIOS} />
            <div className="space-y-4">
                {/* Faixa de meses igual à da página de Contratos. */}
                <div className="space-y-3">
                    <div className="flex flex-col gap-3 rounded-lg border border-border/40 bg-muted/20 p-3 lg:flex-row lg:items-center lg:justify-between">
                        <h2 className="text-base font-bold text-foreground md:text-lg">Salários de {MESES_CURTOS[mesSel - 1]} de {ano}</h2>
                        <div className="flex flex-wrap items-center gap-2">
                            {calcular && <Button variant="outline" size="sm" className="h-9" onClick={() => setAbrir(true)}><Plus className="mr-1.5 h-4 w-4" /> Férias, Natal ou acerto</Button>}
                            <div className="flex items-center gap-1 rounded-lg border bg-background p-0.5">
                                <Button variant="ghost" size="sm" className="h-8 w-8 p-0" aria-label="Ano anterior" onClick={() => { setAno(a => a - 1); setSeleccionado(null); }}><ChevronLeft className="h-4 w-4" /></Button>
                                <span className="min-w-[40px] px-2 text-center text-xs font-bold">{ano}</span>
                                <Button variant="ghost" size="sm" className="h-8 w-8 p-0" aria-label="Ano seguinte" onClick={() => { setAno(a => a + 1); setSeleccionado(null); }}><ChevronRight className="h-4 w-4" /></Button>
                            </div>
                        </div>
                    </div>
                    <div>
                        <div className="flex gap-2.5 overflow-x-auto rounded-2xl border border-primary/15 bg-primary/10 p-2 shadow-sm" style={{ scrollbarWidth: 'thin' }}>
                            {MESES_CURTOS.map((nome, i) => {
                                const m = i + 1;
                                const f = fase(ano, m);
                                const proc = normalDe(ano, m);
                                const activo = mesSel === m && (!seleccionado || p?.tipo === 'normal');
                                const fechado = proc?.estado === 'fechado';
                                const ponto = proc ? (proc.num_recibos ? 'bg-green-500' : 'bg-orange-500') : f === 'actual' ? 'bg-slate-400' : null;
                                return (
                                    <button key={m} type="button" onClick={() => { setMesSel(m); setSeleccionado(null); }}
                                        title={proc ? `${nome}: ${proc.estado}${proc.num_recibos ? ` · ${proc.num_recibos} funcionário(s) · ${kz(proc.total_liquido_minor)}` : ''}` : `${nome}: ${CORES_FASE[f].rotulo}`}
                                        className={cn('relative flex min-w-[64px] flex-col items-center gap-1 whitespace-nowrap rounded-xl px-3.5 py-2.5 text-xs transition-all duration-200',
                                            activo ? (fechado ? 'scale-[1.03] bg-slate-700 font-bold text-white shadow-md' : 'scale-[1.03] bg-sidebar-primary font-bold text-sidebar-primary-foreground shadow-gold')
                                                : fechado ? 'bg-background/70 text-muted-foreground/60 shadow-sm hover:bg-muted/60'
                                                    : 'bg-background text-foreground/80 shadow-sm hover:-translate-y-0.5 hover:shadow-md dark:bg-white/10 dark:hover:bg-white/15',
                                            !activo && f === 'passado' && 'text-red-600 dark:text-red-400')}>
                                        <span className="font-semibold tracking-wide">{nome.slice(0, 3)}</span>
                                        {fechado ? <Lock className="h-3 w-3 opacity-70" /> : ponto ? <span className={cn('inline-block h-1.5 w-1.5 rounded-full', ponto, f === 'actual' && 'animate-pulse')} /> : <span className="inline-block h-1.5 w-1.5" />}
                                    </button>
                                );
                            })}
                        </div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-[11px] text-muted-foreground">
                            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-green-500" /> Salários calculados</span>
                            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-orange-500" /> Aberto, por calcular</span>
                            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-slate-400" /> Mês corrente por abrir</span>
                            <span className="flex items-center gap-1.5"><Lock className="h-3 w-3" /> Mês fechado</span>
                            <span className="flex items-center gap-1.5"><span className="font-bold text-red-600 dark:text-red-400">Mês</span> já passado</span>
                            <span>Os meses futuros não têm ponto.</span>
                        </div>
                    </div>
                </div>

                <section className="min-w-0 space-y-4">
                    {outrosDoMes.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                            <button type="button" onClick={() => setSeleccionado(null)} className={`rounded-full border px-3 py-1 text-xs font-bold ${!seleccionado || p?.tipo === 'normal' ? 'border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-900' : 'border-slate-200 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-900'}`}>Salário</button>
                            {outrosDoMes.map(x => <button key={x.id} type="button" onClick={() => setSeleccionado(x.id)} className={`rounded-full border px-3 py-1 text-xs font-bold ${seleccionado === x.id ? 'border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-900' : 'border-slate-200 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-900'}`}>{ROTULO_TIPO[x.tipo]}{x.descricao ? ` · ${x.descricao}` : ''}</button>)}
                        </div>
                    )}

                    {!p ? (
                        <div className={`rounded-2xl border p-8 text-center ${CORES_FASE[faseSel].cartao}`}>
                            <CalendarDays className={`mx-auto h-10 w-10 ${CORES_FASE[faseSel].texto}`} />
                            <h2 className="mt-3 text-xl font-black">Salário — {periodoPt(ano, mesSel)}</h2>
                            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                                {faseSel === 'futuro' ? 'Este mês ainda não chegou. Abre automaticamente no dia 1.' : faseSel === 'actual' ? 'O mês corrente está a abrir para processamento…' : 'Este mês não foi processado.'}
                            </p>
                            {actor && calcular && faseSel !== 'futuro' && (
                                <Button className="mt-4 bg-emerald-600 hover:bg-emerald-700" onClick={() => void executar(async () => { const id = await ServicoSalariosRH.abrir({ ano, mes: mesSel, tipo: 'normal' }, actor); await lista.recarregar(); setSeleccionado(id); }, 'Mês aberto para processamento')}>
                                    <Play className="mr-1.5 h-4 w-4" /> Abrir {MESES_CURTOS[mesSel - 1]} para processar
                                </Button>
                            )}
                        </div>
                    ) : (
                        <>
                            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div>
                                        <div className={`text-[11px] font-bold uppercase tracking-widest ${CORES_FASE[fase(p.ano, p.mes)].texto}`}>{CORES_FASE[fase(p.ano, p.mes)].rotulo}</div>
                                        <h2 className="text-2xl font-black tracking-tight">{ROTULO_TIPO[p.tipo]} — {periodoPt(p.ano, p.mes)}</h2>
                                    </div>
                                    <div className="flex flex-wrap gap-1">{ETAPAS.map(e => <span key={e} className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${ETAPAS.indexOf(e) <= ETAPAS.indexOf(p.estado) ? CORES_ESTADO[e] : 'bg-slate-50 text-slate-300 dark:bg-slate-800 dark:text-slate-600'}`}>{e}</span>)}</div>
                                </div>
                                <div className="mt-4 grid gap-2 sm:grid-cols-3 xl:grid-cols-6">
                                    {[['Bruto', p.total_bruto_minor, 'text-slate-900 dark:text-white'], ['INSS 3%', p.total_inss_trab_minor, 'text-slate-900 dark:text-white'], ['IRT', p.total_irt_minor, 'text-slate-900 dark:text-white'], ['Outros', p.total_outros_minor, 'text-slate-900 dark:text-white'], ['Líquido a pagar', p.total_liquido_minor, 'text-emerald-700 dark:text-emerald-300'], ['INSS empresa', p.total_inss_emp_minor, 'text-slate-900 dark:text-white']].map(([n, v, cor]) => (
                                        <div key={n as string} className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-800/60"><div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{n}</div><div className={`text-base font-black tabular-nums ${cor}`}>{kz(v as number)}</div></div>
                                    ))}
                                </div>
                                <p className="mt-2 text-xs text-slate-500">
                                    {p.calculado_por_nome && `Calculado por ${p.calculado_por_nome} (${dataPt(p.calculado_em)}). `}
                                    {p.aprovado_por_nome && `Aprovado por ${p.aprovado_por_nome} (${dataPt(p.aprovado_em)}). `}
                                    {p.pago_por_nome && `Pago por ${p.pago_por_nome} (${p.conta_pagamento === 'cash' ? 'caixa' : 'banco'}, ${dataPt(p.pago_em)}). `}
                                    {p.fechado_por_nome && `Fechado por ${p.fechado_por_nome} (${dataPt(p.fechado_em)}): lançamentos na contabilidade feitos.`}
                                </p>
                                <div className="mt-3 flex flex-wrap gap-2">
                                    {editavel && <Button className="bg-emerald-600 hover:bg-emerald-700" disabled={aCalcular} onClick={() => void correrCalculo(p)}><Calculator className="mr-1.5 h-4 w-4" /> {aCalcular ? 'A calcular…' : detalhe.dados.recibos.length ? 'Recalcular salários' : 'Processar salários'}</Button>}
                                    {editavel && <Button variant="outline" onClick={() => setPontual(true)}><Plus className="mr-1.5 h-4 w-4" /> Rubrica do mês</Button>}
                                    {actor && aprovar && p.estado === 'calculado' && <Button className="bg-violet-600 hover:bg-violet-700" onClick={() => void accao(() => ServicoSalariosRH.aprovar(p, actor), 'Processamento aprovado')}><CheckCircle2 className="mr-1.5 h-4 w-4" /> Aprovar</Button>}
                                    {actor && aprovar && p.estado === 'aprovado' && <Button className="bg-amber-600 hover:bg-amber-700" onClick={() => setPagar(true)}><Wallet className="mr-1.5 h-4 w-4" /> Pagar</Button>}
                                    {actor && aprovar && p.estado === 'pago' && <Button className="bg-emerald-700 hover:bg-emerald-800" onClick={() => void accao(() => ServicoSalariosRH.fechar(p, actor), 'Mês fechado e lançado na contabilidade')}><Lock className="mr-1.5 h-4 w-4" /> Fechar e lançar</Button>}
                                    {actor && ['calculado', 'aprovado', 'pago'].includes(p.estado) && (calcular || aprovar) && <Button variant="outline" onClick={() => setReabrir(true)}><Undo2 className="mr-1.5 h-4 w-4" /> Reabrir</Button>}
                                    {detalhe.dados.recibos.length > 0 && actor && <>
                                        <Button variant="outline" onClick={() => void pdfFolhaDe(p)}><FileDown className="mr-1.5 h-4 w-4" /> Baixar folha de salário</Button>
                                        <Button variant="outline" onClick={() => void pdfRecibos()}><FileDown className="mr-1.5 h-4 w-4" /> Todos os recibos</Button>
                                        {['aprovado', 'pago', 'fechado'].includes(p.estado) && <Button variant="outline" onClick={transferencias}><Banknote className="mr-1.5 h-4 w-4" /> Ficheiro de transferências</Button>}
                                    </>}
                                    {actor && calcular && p.estado === 'aberto' && <Button variant="ghost" className="ml-auto text-red-600 hover:bg-red-50 hover:text-red-700" onClick={() => void accao(() => ServicoSalariosRH.apagarAberto(p, actor), 'Processamento apagado').then(ok => ok && setSeleccionado(null))}><Trash2 className="mr-1.5 h-4 w-4" /> Apagar</Button>}
                                </div>
                            </div>

                            {desactualizado && editavel && (
                                <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                                    <AlertTriangle className="h-4 w-4 shrink-0" /> Há valores alterados desde o último cálculo. Carregue em «Recalcular salários».
                                </div>
                            )}

                            {(p.estado === 'pago' || p.estado === 'fechado') && <RecepcaoSalarios key={`rec-${p.id}`} processamentoId={p.id} recibos={detalhe.dados.recibos.map(r => ({ id: r.id, nome: r.nome }))} />}

                            <ReclamacoesFolha key={p.id} processamentoId={p.id} actor={actor} podeResponder={Boolean(calcular || aprovar)}
                                nomeDe={id => base.dados.funcionarios.find(f => f.id === id)?.nome || 'Funcionário'} onMudou={() => void recarregar()} />

                            {detalhe.dados.pontuais.length > 0 && (
                                <div className="rounded-2xl border border-slate-200 bg-white p-3 text-sm dark:border-slate-800 dark:bg-slate-900">
                                    <h3 className="mb-1 text-xs font-black uppercase text-slate-500">Rubricas do mês</h3>
                                    {detalhe.dados.pontuais.map(r => (
                                        <div key={r.id} className="flex items-center justify-between border-t border-slate-100 py-1 dark:border-slate-800">
                                            <span>{base.dados.funcionarios.find(f => f.id === r.funcionario_id)?.nome} · {base.dados.rubricas.find(x => x.id === r.rubrica_id)?.nome} · {kz(r.valor_minor)}{r.descricao ? ` · ${r.descricao}` : ''}</span>
                                            {editavel && actor && <Button size="icon" variant="ghost" onClick={() => void accao(() => ServicoSalariosRH.retirarPontual(p, r.id, actor), 'Rubrica retirada')}><Trash2 className="h-4 w-4" /></Button>}
                                        </div>
                                    ))}
                                </div>
                            )}

                            {linhasFuncionarios.length === 0 ? <Vazio>Não há funcionários activos neste mês. Registe-os em «Funcionários».</Vazio> : (
                                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
                                    <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-slate-800">
                                        <h3 className="text-sm font-black">Funcionários ({linhasFuncionarios.length})</h3>
                                        <span className="text-[11px] text-slate-500">{editavel ? 'Edite o salário do mês e as faltas; os abonos e descontos do registo entram sozinhos.' : 'Mês aprovado: só leitura.'}</span>
                                    </div>
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-sm">
                                            <thead className="bg-slate-50 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:bg-slate-950">
                                                <tr>
                                                    <th className="px-3 py-2">Funcionário</th><th className="px-3 py-2">IBAN</th><th className="px-3 py-2 text-right">Salário base</th>
                                                    <th className="px-3 py-2 text-right">Abonos fixos</th><th className="px-3 py-2 text-center">Faltas</th><th className="px-3 py-2 text-right">Desc. faltas</th>
                                                    <th className="px-3 py-2 text-right">INSS</th><th className="px-3 py-2 text-right">IRT</th><th className="px-3 py-2 text-right">Líquido</th><th className="px-2 py-2" />
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {linhasFuncionarios.map(l => {
                                                    const r = l.recibo;
                                                    const avisos: string[] = r?.avisos_json ? JSON.parse(r.avisos_json) : [];
                                                    const descFaltas = r?.total_descontos_minor != null ? r.total_descontos_minor - r.inss_minor - r.irt_minor - r.outros_descontos_minor : 0;
                                                    const totalAbonos = l.abonos.reduce((s, a) => s + a.valor, 0);
                                                    return (
                                                        <tr key={l.id} className={`border-t border-slate-100 align-middle dark:border-slate-800 ${avisos.length ? 'bg-amber-50/60 dark:bg-amber-950/20' : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'}`}>
                                                            <td className="px-3 py-2">
                                                                <div className="font-bold text-slate-900 dark:text-white">{l.nome}</div>
                                                                <div className="text-[11px] text-slate-500">{l.numero ? `N.º ${l.numero}` : ''}{l.cargo ? ` · ${l.cargo}` : ''}</div>
                                                                {avisos.length > 0 && <div className="mt-0.5 flex items-start gap-1 text-[11px] text-amber-800 dark:text-amber-300"><AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />{avisos.join(' ')}</div>}
                                                            </td>
                                                            <td className="px-3 py-2 font-mono text-[11px] text-slate-600 dark:text-slate-300">{l.iban || <span className="font-sans text-red-600">Sem IBAN</span>}</td>
                                                            <td className="px-3 py-2 text-right">
                                                                {editavel ? <CampoSalario valor={l.salario} alterado={l.alterado} contrato={l.salarioContrato} onGuardar={v => guardarEntrada(l.id, { salario_base_minor: v === l.salarioContrato ? null : v })} />
                                                                    : <span className="font-semibold tabular-nums">{kz(l.salario)}</span>}
                                                            </td>
                                                            <td className="px-3 py-2 text-right tabular-nums" title={l.abonos.map(a => `${a.nome}: ${kz(a.valor)}`).join('\n')}>
                                                                {totalAbonos ? <><div className="font-semibold">{kz(totalAbonos)}</div><div className="text-[10px] text-slate-500">{l.abonos.length} abono(s)</div></> : <span className="text-slate-400">—</span>}
                                                            </td>
                                                            <td className="px-3 py-2 text-center">
                                                                <button type="button" disabled={!editavel} onClick={() => setFaltasDe(l.id)}
                                                                    className={`inline-flex min-w-[64px] items-center justify-center gap-1 rounded-lg border px-2 py-1 text-xs font-bold transition ${l.faltas ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300' : 'border-slate-200 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'} ${editavel ? 'hover:border-slate-400' : 'cursor-default'}`}>
                                                                    <CalendarX className="h-3.5 w-3.5" />{l.faltas.toLocaleString('pt-PT')}
                                                                </button>
                                                            </td>
                                                            <td className="px-3 py-2 text-right tabular-nums text-red-700 dark:text-red-300">{r && descFaltas > 0 ? `-${kz(descFaltas)}` : <span className="text-slate-400">—</span>}</td>
                                                            <td className="px-3 py-2 text-right tabular-nums">{r ? kz(r.inss_minor) : <span className="text-slate-400">—</span>}</td>
                                                            <td className="px-3 py-2 text-right tabular-nums">{r ? kz(r.irt_minor) : <span className="text-slate-400">—</span>}</td>
                                                            <td className={`px-3 py-2 text-right font-black tabular-nums ${desactualizado ? 'text-slate-400' : 'text-emerald-700 dark:text-emerald-300'}`}>{r ? kz(r.liquido_minor) : <span className="font-normal text-slate-400">por calcular</span>}</td>
                                                            <td className="px-2 py-2">{r && <Button size="icon" variant="ghost" className="h-8 w-8" title="Ver recibo" onClick={() => setRecibo(r)}><Eye className="h-4 w-4" /></Button>}</td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </section>
            </div>

            {actor && abrir && <DialogoAbrir funcionarios={base.dados.funcionarios.filter(f => f.estado !== 'cessado')} onClose={() => setAbrir(false)}
                onConfirm={async input => { let id = ''; const ok = await executar(async () => { id = await ServicoSalariosRH.abrir(input, actor); }, 'Processamento aberto'); if (ok) { await lista.recarregar(); setSeleccionado(id); } return ok; }} />}
            {actor && p && recibo && <DialogoRecibo recibo={recibo} processamento={p} settings={companySettings} actorName={actor.name} onClose={() => setRecibo(null)} />}
            {actor && p && pontual && <DialogoPontual funcionarios={linhasFuncionarios.map(l => ({ id: l.id, nome: l.nome }))}
                rubricas={base.dados.rubricas.filter(r => r.activo && !r.sistema)} onClose={() => setPontual(false)}
                onConfirm={input => accao(() => ServicoSalariosRH.acrescentarPontual(p, input, actor), 'Rubrica acrescentada: recalcule os salários')} />}
            {actor && p && reabrir && <DialogoTexto titulo="Reabrir processamento" descricao={p.estado === 'calculado' ? 'Volta a «aberto» para corrigir o ponto ou as rubricas e recalcular.' : 'Só o Super Administrador reabre um processamento aprovado ou pago (volta a «calculado»). Indique a justificação.'}
                rotulo="Reabrir" onClose={() => setReabrir(false)} onConfirm={motivo => accao(() => ServicoSalariosRH.reabrir(p, motivo, actor), 'Processamento reaberto')} />}
            {actor && p && pagar && <DialogoPagar onClose={() => setPagar(false)} onConfirm={conta => accao(() => ServicoSalariosRH.pagar(p, conta, actor), 'Processamento marcado como pago')} />}
            {funcionarioFaltas && p && <DialogoFaltas nome={funcionarioFaltas.nome} faltas={funcionarioFaltas.faltas} salarioMinor={funcionarioFaltas.salario}
                valorFaltaKz={valorFalta} divisor={divisorTexto} onClose={() => setFaltasDe(null)}
                onConfirm={async n => { const ok = await guardarEntrada(funcionarioFaltas.id, { faltas: n }); if (ok) setFaltasDe(null); }} />}
        </MainLayout>
    );
}

/** Salário base do mês, editável: grava ao sair do campo ou com Enter. */
function CampoSalario({ valor, alterado, contrato, onGuardar }: { valor: number; alterado: boolean; contrato: number; onGuardar: (minor: number) => Promise<boolean> }) {
    const [rascunho, setRascunho] = useState(valor / 100);
    useEffect(() => setRascunho(valor / 100), [valor]);
    const gravar = () => { const novo = paraMinor(rascunho); if (novo !== valor) void onGuardar(novo); };
    return (
        <div className="ml-auto w-40" onBlur={gravar} onKeyDown={e => { if (e.key === 'Enter') { (e.target as HTMLElement).blur(); } }}>
            <CurrencyInput value={rascunho} onValueChange={setRascunho} className={`h-8 text-right text-sm font-semibold ${alterado ? 'border-sky-300 bg-sky-50 dark:border-sky-800 dark:bg-sky-950/40' : ''}`} />
            {alterado && <div className="mt-0.5 text-[10px] text-sky-700 dark:text-sky-300">Contrato: {kz(contrato)}</div>}
        </div>
    );
}

/** Número de faltas do mês: o desconto segue a configuração (valor por falta ou valor-dia). */
function DialogoFaltas({ nome, faltas, salarioMinor, valorFaltaKz, divisor, onClose, onConfirm }: { nome: string; faltas: number; salarioMinor: number; valorFaltaKz: number; divisor: string; onClose: () => void; onConfirm: (n: number) => Promise<void> }) {
    const [n, setN] = useState(String(faltas || ''));
    const qtd = Math.max(0, Math.min(31, Number(n.replace(',', '.')) || 0));
    const porFalta = valorFaltaKz > 0 ? Math.round(valorFaltaKz * 100) : Math.round(salarioMinor / (divisor === 'uteis' ? 22 : 30));
    return (
        <Dialog open onOpenChange={v => !v && onClose()}>
            <DialogContent className="max-w-sm">
                <DialogHeader>
                    <DialogTitle>Faltas — {nome}</DialogTitle>
                    <DialogDescription>{valorFaltaKz > 0 ? `Cada falta desconta ${kz(porFalta)} (configurado em RH › Configurações › valor_falta).` : `Cada falta desconta o valor-dia: salário base ÷ ${divisor === 'uteis' ? 'dias úteis do mês' : '30'}.`}</DialogDescription>
                </DialogHeader>
                <div className="flex items-center gap-2">
                    <Button type="button" variant="outline" size="icon" onClick={() => setN(String(Math.max(0, qtd - 1)))}>−</Button>
                    <Input autoFocus inputMode="decimal" className="h-12 text-center text-2xl font-black" value={n} onChange={e => setN(e.target.value.replace(/[^\d.,]/gu, ''))}
                        onKeyDown={e => { if (e.key === 'Enter') void onConfirm(qtd); }} />
                    <Button type="button" variant="outline" size="icon" onClick={() => setN(String(Math.min(31, qtd + 1)))}>+</Button>
                </div>
                <div className="rounded-xl bg-red-50 p-3 text-center text-sm text-red-800 dark:bg-red-950/40 dark:text-red-200">
                    Desconto {divisor === 'uteis' && !(valorFaltaKz > 0) ? 'aproximado' : ''}: <b>{kz(porFalta * qtd)}</b>
                </div>
                <DialogFooter><Button variant="outline" onClick={onClose}>Cancelar</Button><Button onClick={() => void onConfirm(qtd)}>Guardar faltas</Button></DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function DialogoAbrir({ funcionarios, onClose, onConfirm }: { funcionarios: Array<{ id: string; nome: string }>; onClose: () => void; onConfirm: (i: { ano: number; mes: number; tipo: TipoProcessamento; funcionarios?: string[]; descricao?: string }) => Promise<boolean> }) {
    const hoje = luandaTodayKey();
    const [ano, setAno] = useState(Number(hoje.slice(0, 4)));
    const [mes, setMes] = useState(Number(hoje.slice(5, 7)));
    const [tipo, setTipo] = useState<TipoProcessamento>('normal');
    const [descricao, setDescricao] = useState('');
    const [escolhidos, setEscolhidos] = useState<string[]>([]);
    return (
        <Dialog open onOpenChange={v => !v && onClose()}>
            <DialogContent className="max-w-lg">
                <DialogHeader><DialogTitle>Abrir processamento</DialogTitle><DialogDescription>O normal inclui todos os funcionários activos do mês; férias, Natal e acerto podem ser só de alguns.</DialogDescription></DialogHeader>
                <div className="grid gap-3 sm:grid-cols-3">
                    <div><Label className="text-xs font-bold">Ano</Label><Input className="mt-1" type="number" value={ano} onChange={e => setAno(Number(e.target.value))} /></div>
                    <div><Label className="text-xs font-bold">Mês</Label><Input className="mt-1" type="number" min={1} max={12} value={mes} onChange={e => setMes(Number(e.target.value))} /></div>
                    <div><Label className="text-xs font-bold">Tipo</Label>
                        <Select value={tipo} onValueChange={v => setTipo(v as TipoProcessamento)}>
                            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                            <SelectContent>{(Object.keys(ROTULO_TIPO) as TipoProcessamento[]).map(t => <SelectItem key={t} value={t}>{ROTULO_TIPO[t]}</SelectItem>)}</SelectContent>
                        </Select>
                    </div>
                    <div className="sm:col-span-3"><Label className="text-xs font-bold">Descrição (opcional)</Label><Input className="mt-1" value={descricao} onChange={e => setDescricao(e.target.value)} /></div>
                </div>
                {tipo !== 'normal' && (
                    <div>
                        <Label className="text-xs font-bold">Funcionários {tipo === 'acerto' ? '(obrigatório)' : '(vazio = todos os activos)'}</Label>
                        <div className="mt-1 grid max-h-40 gap-1 overflow-y-auto rounded-xl border border-slate-200 p-2 dark:border-slate-800">
                            {funcionarios.map(f => <label key={f.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={escolhidos.includes(f.id)} onChange={() => setEscolhidos(l => l.includes(f.id) ? l.filter(x => x !== f.id) : [...l, f.id])} /> {f.nome}</label>)}
                        </div>
                    </div>
                )}
                <DialogFooter><Button variant="outline" onClick={onClose}>Cancelar</Button>
                    <Button onClick={() => void onConfirm({ ano, mes, tipo, descricao, funcionarios: tipo === 'normal' ? undefined : escolhidos }).then(ok => ok && onClose())}>Abrir</Button></DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function DialogoRecibo({ recibo, processamento, settings, actorName, onClose }: { recibo: Recibo; processamento: Processamento; settings: unknown; actorName: string; onClose: () => void }) {
    const linhas = useCarregar(() => ServicoSalariosRH.linhas(recibo.id), [] as LinhaReciboRH[], [recibo.id]);
    const linha = (n: string, v: React.ReactNode, forte = false) => <div className={`flex justify-between py-0.5 ${forte ? 'font-black' : ''}`}><span className="text-slate-500">{n}</span><span>{v}</span></div>;
    return (
        <Dialog open onOpenChange={v => !v && onClose()}>
            <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
                <DialogHeader><DialogTitle>{recibo.nome}</DialogTitle><DialogDescription>Recibo {recibo.numero_recibo} · {ROTULO_TIPO[processamento.tipo]} · {periodoPt(processamento.ano, processamento.mes)}</DialogDescription></DialogHeader>
                <table className="w-full text-sm">
                    <thead className="text-left text-[11px] uppercase text-slate-500"><tr><th>Rubrica</th><th className="text-right">Qtd.</th><th className="text-right">Abonos</th><th className="text-right">Descontos</th></tr></thead>
                    <tbody>{linhas.dados.map(l => (
                        <tr key={l.id} className="border-t border-slate-100 dark:border-slate-800"><td className="py-1">{l.descricao}{l.isento_irt_minor ? <span className="ml-1 text-[10px] text-emerald-600">(isento IRT {kz(l.isento_irt_minor)})</span> : null}</td>
                            <td className="text-right">{l.quantidade !== 1 ? l.quantidade : ''}</td><td className="text-right">{l.tipo === 'abono' ? kz(l.valor_minor) : ''}</td><td className="text-right">{l.tipo === 'desconto' ? kz(l.valor_minor) : ''}</td></tr>
                    ))}</tbody>
                </table>
                <div className="grid gap-x-8 text-sm sm:grid-cols-2">
                    <div>{linha('Valor-dia', kz(recibo.valor_dia_minor))}{linha('Valor-hora', kz(recibo.valor_hora_minor))}{linha('Dias trabalhados', recibo.dias_trabalhados)}{linha('Remuneração bruta', kz(recibo.bruto_minor), true)}{linha('Base de INSS', kz(recibo.base_inss_minor))}</div>
                    <div>{linha('INSS do trabalhador', kz(recibo.inss_minor))}{linha('Parte isenta de IRT', kz(recibo.isento_irt_minor))}{linha('Matéria colectável', kz(recibo.base_irt_minor))}{linha(`IRT${recibo.escalao_irt ? ` (${recibo.escalao_irt}.º escalão)` : ''}`, kz(recibo.irt_minor))}{linha('Outros descontos', kz(recibo.outros_descontos_minor))}{linha('Líquido', kz(recibo.liquido_minor), true)}{linha('INSS da empresa', kz(recibo.inss_emp_minor))}{linha('Custo para a empresa', kz(recibo.custo_empresa_minor))}</div>
                </div>
                <DialogFooter><Button variant="outline" onClick={() => gerarReciboPdf(recibo, linhas.dados, cabecalhoPdf(processamento), settings, actorName)}><FileDown className="mr-1.5 h-4 w-4" /> Recibo (PDF)</Button></DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function DialogoPontual({ funcionarios, rubricas, onClose, onConfirm }: { funcionarios: Array<{ id: string; nome: string }>; rubricas: Array<{ id: string; nome: string; tipo: string }>; onClose: () => void; onConfirm: (i: { funcionario_id: string; rubrica_id: string; valor_minor: number; descricao: string }) => Promise<boolean> }) {
    const [funcionario, setFuncionario] = useState(funcionarios[0]?.id || '');
    const [rubrica, setRubrica] = useState(rubricas.find(r => r.nome.startsWith('Prémio'))?.id || rubricas[0]?.id || '');
    const [valor, setValor] = useState(0);
    const [descricao, setDescricao] = useState('');
    const ordenados = useMemo(() => [...rubricas].sort((a, b) => a.tipo.localeCompare(b.tipo)), [rubricas]);
    return (
        <Dialog open onOpenChange={v => !v && onClose()}>
            <DialogContent className="max-w-md">
                <DialogHeader><DialogTitle>Rubrica do mês</DialogTitle><DialogDescription>Prémio, adiantamento ou outra rubrica só deste processamento. Depois, recalcule.</DialogDescription></DialogHeader>
                <Select value={funcionario} onValueChange={setFuncionario}><SelectTrigger><SelectValue placeholder="Funcionário" /></SelectTrigger><SelectContent>{funcionarios.map(f => <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>)}</SelectContent></Select>
                <Select value={rubrica} onValueChange={setRubrica}><SelectTrigger><SelectValue placeholder="Rubrica" /></SelectTrigger><SelectContent>{ordenados.map(r => <SelectItem key={r.id} value={r.id}>{r.nome} ({r.tipo})</SelectItem>)}</SelectContent></Select>
                <CurrencyInput value={valor} onValueChange={setValor} />
                <Input placeholder="Descrição (opcional)" value={descricao} onChange={e => setDescricao(e.target.value)} />
                <DialogFooter><Button variant="outline" onClick={onClose}>Cancelar</Button><Button onClick={() => void onConfirm({ funcionario_id: funcionario, rubrica_id: rubrica, valor_minor: paraMinor(valor), descricao }).then(ok => ok && onClose())}>Acrescentar</Button></DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function DialogoTexto({ titulo, descricao, rotulo, onClose, onConfirm }: { titulo: string; descricao: string; rotulo: string; onClose: () => void; onConfirm: (t: string) => Promise<boolean> }) {
    const [texto, setTexto] = useState('');
    return (
        <Dialog open onOpenChange={v => !v && onClose()}>
            <DialogContent className="max-w-md">
                <DialogHeader><DialogTitle>{titulo}</DialogTitle><DialogDescription>{descricao}</DialogDescription></DialogHeader>
                <Textarea rows={3} placeholder="Motivo" value={texto} onChange={e => setTexto(e.target.value)} />
                <DialogFooter><Button variant="outline" onClick={onClose}>Cancelar</Button><Button onClick={() => void onConfirm(texto).then(ok => ok && onClose())}>{rotulo}</Button></DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function DialogoPagar({ onClose, onConfirm }: { onClose: () => void; onConfirm: (c: 'bank' | 'cash') => Promise<boolean> }) {
    const [conta, setConta] = useState<'bank' | 'cash'>('bank');
    return (
        <Dialog open onOpenChange={v => !v && onClose()}>
            <DialogContent className="max-w-md">
                <DialogHeader><DialogTitle>Pagar salários</DialogTitle><DialogDescription>Gere o ficheiro de transferências para o banco e marque como pago. Ao fechar, os lançamentos saem desta conta.</DialogDescription></DialogHeader>
                <Select value={conta} onValueChange={v => setConta(v as 'bank' | 'cash')}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="bank">Banco</SelectItem><SelectItem value="cash">Caixa</SelectItem></SelectContent></Select>
                <DialogFooter><Button variant="outline" onClick={onClose}>Cancelar</Button><Button onClick={() => void onConfirm(conta).then(ok => ok && onClose())}>Marcar como pago</Button></DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
