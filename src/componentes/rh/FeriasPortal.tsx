// Portal do funcionário › Férias: o mesmo calendário anual (meses a cinzento, só o mês escolhido a verde), o saldo,
// o pedido (mês, início, dias úteis) com a data de regresso calculada ao vivo e a lista dos pedidos. O funcionário vê
// só as suas férias; o pedido segue para o chefe directo e depois para o RH.
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/componentes/ui/button';
import { Input } from '@/componentes/ui/input';
import { Label } from '@/componentes/ui/label';
import { Textarea } from '@/componentes/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/componentes/ui/select';
import { ChevronLeft, ChevronRight, Info, Send, X } from 'lucide-react';
import { CalendarioAnual, LegendaCalendario, MESES_PT, type PeriodoCalendario } from './CalendarioAnual';
import { calendarioDoAno, type FeriadoRegistado, type OpcoesCalendario } from '@/bibliotecas/rh/calendario-laboral';
import { simularFerias, type SaldoFerias } from '@/bibliotecas/rh/ferias';
import { HORARIO_OMISSAO, ehDiaUtil, somarDias, type Feriado, type Horario } from '@/bibliotecas/rh/ponto';
import { ServicoTempoRH } from '@/servicos/rh/ServicoTempoRH';
import { ServicoPortalRH } from '@/servicos/rh/ServicoPortalRH';
import { estadoVisivel, type EstadoVisivelFerias, type PlanoFeriasRH } from '@/servicos/rh/ServicoFeriasRH';
import type { ActorRH, Funcionario } from '@/servicos/rh/ServicoRH';
import { confirmar } from '@/bibliotecas/alerta';
import { cn } from '@/bibliotecas/utils';
import { dataPt, executar, useCarregar } from './comum-rh';

const SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const dataSemana = (d: string) => `${SEMANA[new Date(`${d}T12:00:00Z`).getUTCDay()]}, ${dataPt(d)}`;
const ROTULO: Record<EstadoVisivelFerias, string> = {
    previsto: 'Previsto pelo RH', pendente_chefe: 'Pendente do chefe', pendente_rh: 'Pendente do RH', aprovado: 'Aprovado', em_gozo: 'Em gozo', gozado: 'Gozado',
    recusado: 'Recusado', anulado: 'Cancelado', interrompido: 'Interrompido',
};
const COR: Record<EstadoVisivelFerias, string> = {
    previsto: 'bg-slate-100 text-slate-700', pendente_chefe: 'bg-orange-100 text-orange-800', pendente_rh: 'bg-orange-100 text-orange-800', aprovado: 'bg-emerald-100 text-emerald-800',
    em_gozo: 'bg-emerald-200 text-emerald-900', gozado: 'bg-emerald-50 text-emerald-700', recusado: 'bg-red-100 text-red-700', anulado: 'bg-slate-100 text-slate-500', interrompido: 'bg-sky-100 text-sky-800',
};

export function FeriasPortal({ f, actor, planos, saldo, temChefe, destinatarios, hoje, onMudou }: {
    f: Funcionario; actor: ActorRH; planos: PlanoFeriasRH[]; saldo: SaldoFerias; temChefe: boolean; destinatarios: string[]; hoje: string; onMudou: () => void;
}) {
    const dados = useCarregar(async () => {
        const [horarios, feriados, registados, opcoes] = await Promise.all([ServicoTempoRH.horarios(), ServicoTempoRH.feriados(), ServicoTempoRH.feriadosRegistados(), ServicoTempoRH.opcoesCalendario()]);
        return { horarios, feriados, registados, opcoes };
    }, { horarios: [] as Horario[], feriados: [] as Feriado[], registados: [] as FeriadoRegistado[], opcoes: {} as OpcoesCalendario });
    const { horarios, feriados, registados, opcoes } = dados.dados;
    const horario = horarios.find(h => h.id === f.horario_id) || horarios.find(h => h.id === 'horario-normal') || HORARIO_OMISSAO;
    const primeiroUtil = (desde: string) => { let d = desde < hoje ? hoje : desde; for (let i = 0; i < 40 && !ehDiaUtil(d, horario, feriados); i++) d = somarDias(d, 1); return d; };
    const [ano, setAno] = useState(Number(hoje.slice(0, 4)));
    const [inicio, setInicio] = useState('');
    const [dias, setDias] = useState(Math.min(22, Math.max(1, saldo.saldo)));
    const [obs, setObs] = useState('');
    useEffect(() => { if (!inicio && feriados.length) setInicio(primeiroUtil(somarDias(hoje, 1))); // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [feriados.length]);
    const calendario = useMemo(() => calendarioDoAno(ano, registados, opcoes), [ano, registados, opcoes]);
    const simulacao = useMemo(() => {
        if (!/^\d{4}-\d{2}-\d{2}$/u.test(inicio) || dias < 1) return null;
        try { return simularFerias({ inicio, dias, horario, feriados, saldo: saldo.saldo }); } catch { return null; }
    }, [inicio, dias, horario, feriados, saldo.saldo]);
    const mes = simulacao ? Number(simulacao.inicio.slice(5, 7)) - 1 : null;
    const meus = planos.filter(p => p.funcionario_id === f.id);
    const periodos: PeriodoCalendario[] = [
        ...meus.filter(p => p.data_inicio && p.data_fim && !['anulado'].includes(p.estado)).map(p => {
            const e = estadoVisivel(p, hoje, temChefe);
            return { inicio: p.data_inicio!, ultimoDia: p.data_fim!, regresso: p.data_regresso, tipo: e.startsWith('pendente') ? 'pendente' as const : 'aprovado' as const, titulo: `Férias (${ROTULO[e].toLowerCase()})` };
        }),
        ...(simulacao ? [{ inicio: simulacao.inicio, ultimoDia: simulacao.ultimoDia, regresso: simulacao.regresso, dias: simulacao.dias, tipo: 'simulado' as const }] : []),
    ];
    const excede = Boolean(simulacao && simulacao.diasUteis > saldo.saldo);
    const sobreposto = simulacao && meus.find(p => p.estado !== 'anulado' && p.data_inicio && p.data_fim && p.data_inicio <= simulacao.ultimoDia && p.data_fim >= simulacao.inicio);
    const aprovadoNoMes = mes !== null && meus.some(p => ['aprovado', 'em_gozo', 'gozado'].includes(p.estado) && p.data_inicio && Number(p.data_inicio.slice(5, 7)) - 1 === mes && p.data_inicio.startsWith(String(ano)));

    const escolherMes = (m: number) => setInicio(primeiroUtil(`${ano}-${String(m + 1).padStart(2, '0')}-01`));
    const mudarAno = (delta: number) => {
        const novo = ano + delta;
        if (novo < Number(hoje.slice(0, 4))) return;
        setAno(novo);
        if (inicio) setInicio(primeiroUtil(`${novo}${inicio.slice(4).replace('-02-29', '-02-28')}`));
    };
    const enviar = () => void executar(() => ServicoPortalRH.pedirFerias(f, inicio, dias, obs, actor, destinatarios), 'Pedido de férias enviado').then(ok => { if (ok) { setObs(''); onMudou(); } });
    const cancelar = async (p: PlanoFeriasRH) => {
        if (!await confirmar(`Cancelar o pedido de férias de ${dataPt(p.data_inicio)} a ${dataPt(p.data_fim)}?`, { titulo: 'Cancelar pedido', confirmar: 'Sim, cancelar', perigo: true })) return;
        if (await executar(() => ServicoPortalRH.cancelarPedidoFerias(f, p.id, actor), 'Pedido cancelado')) onMudou();
    };

    return (
        <div className="space-y-4">
            <div>
                <h2 className="text-2xl font-extrabold">As minhas férias</h2>
                <p className="text-sm text-slate-600 dark:text-slate-400">Escolha o dia em que quer começar. O mês escolhido fica a verde e a data de regresso é calculada automaticamente (fins-de-semana, feriados e pontes não contam).</p>
            </div>
            <div className="flex flex-wrap items-start gap-4">
                <section className="min-w-0 flex-[999_1_720px] rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 sm:p-6">
                    <div className="mb-3 flex items-center justify-end gap-2">
                        <Button size="icon" variant="outline" aria-label="Ano anterior" disabled={ano <= Number(hoje.slice(0, 4))} onClick={() => mudarAno(-1)}><ChevronLeft className="h-4 w-4" /></Button>
                        <Button size="icon" variant="outline" aria-label="Ano seguinte" onClick={() => mudarAno(1)}><ChevronRight className="h-4 w-4" /></Button>
                    </div>
                    <CalendarioAnual ano={ano} calendario={calendario} hoje={hoje} modo="portal" mesEscolhido={mes} periodos={periodos}
                        onEscolher={d => { if (d >= hoje) setInicio(d); }} />
                    <div className="mt-5"><LegendaCalendario modo="portal" /></div>
                </section>

                <aside className="flex min-w-0 flex-[1_1_340px] flex-col gap-4 lg:max-w-[400px]">
                    <div className="grid grid-cols-3 gap-2 rounded-2xl border border-slate-200 bg-white p-4 text-center dark:border-slate-800 dark:bg-slate-900">
                        <div className="rounded-xl bg-slate-50 p-2 dark:bg-slate-800"><div className="text-[11px] text-slate-500">Direito</div><div className="text-xl font-extrabold">{saldo.direito}</div></div>
                        <div className="rounded-xl bg-slate-50 p-2 dark:bg-slate-800"><div className="text-[11px] text-slate-500">Transitados</div><div className="text-xl font-extrabold">{saldo.transitados}</div></div>
                        <div className="rounded-xl bg-[#ECFDF3] p-2 dark:bg-emerald-950"><div className="text-[11px] text-[#05603A] dark:text-emerald-300">Saldo</div><div className="text-xl font-extrabold text-[#054F31] dark:text-emerald-100">{saldo.saldo}</div></div>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                        <h3 className="mb-3 text-lg font-extrabold">Pedir férias</h3>
                        <Label htmlFor="portal-mes" className="text-xs font-bold">Mês pretendido</Label>
                        <Select value={mes === null ? '' : String(mes)} onValueChange={v => escolherMes(Number(v))}>
                            <SelectTrigger id="portal-mes" className="mt-1"><SelectValue placeholder="Escolha o mês" /></SelectTrigger>
                            <SelectContent>{MESES_PT.map((m, i) => <SelectItem key={m} value={String(i)} disabled={`${ano}-${String(i + 1).padStart(2, '0')}` < hoje.slice(0, 7)}>{m} de {ano}</SelectItem>)}</SelectContent>
                        </Select>
                        <div className="mt-3 grid grid-cols-2 gap-2.5">
                            <div><Label htmlFor="portal-inicio" className="text-xs font-bold">Início</Label>
                                <Input id="portal-inicio" className="mt-1" type="date" min={hoje} value={inicio} onChange={e => { setInicio(e.target.value); if (e.target.value) setAno(Number(e.target.value.slice(0, 4))); }} /></div>
                            <div><Label htmlFor="portal-dias" className="text-xs font-bold">Dias úteis</Label>
                                <Input id="portal-dias" className="mt-1 text-center font-bold" type="number" min={1} max={Math.max(1, saldo.saldo)} value={dias}
                                    onChange={e => setDias(Math.max(1, Math.min(Math.max(1, saldo.saldo), Number(e.target.value) || 1)))} /></div>
                        </div>
                        {simulacao && (
                            <div className="mt-4 rounded-xl border border-[#ABEFC6] bg-[#ECFDF3] p-4 dark:border-emerald-900 dark:bg-emerald-950/40" aria-live="polite">
                                <div className="text-xs font-bold uppercase tracking-wide text-[#05603A] dark:text-emerald-300">Volta ao trabalho</div>
                                <div className="mb-2 mt-1 text-2xl font-black text-[#054F31] dark:text-emerald-100">{dataSemana(simulacao.regresso)}</div>
                                {([['De', dataSemana(simulacao.inicio)], ['Até', dataSemana(simulacao.ultimoDia)], ['Feriados no período', simulacao.feriadosNoPeriodo.length], ['Saldo depois', simulacao.saldoDepois ?? '—']] as Array<[string, string | number]>).map(([r, v], i, a) => (
                                    <div key={r} className={cn('flex justify-between gap-2 py-1.5 text-sm', i < a.length - 1 && 'border-b border-emerald-900/10')}><span className="text-[#05603A] dark:text-emerald-300">{r}</span><strong>{v}</strong></div>
                                ))}
                            </div>
                        )}
                        {simulacao?.ajustado && <p className="mt-2 flex gap-2 rounded-lg bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-800 dark:bg-sky-950 dark:text-sky-200"><Info className="h-4 w-4 shrink-0" /> O dia escolhido não é dia útil. O início passou para {dataSemana(simulacao.inicio)}.</p>}
                        {excede && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">Pede mais dias do que o seu saldo ({saldo.saldo}).</p>}
                        {sobreposto && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">Já tem férias pedidas ou marcadas nesse período.</p>}
                        {aprovadoNoMes && <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800">Aprovado: já tem férias aprovadas neste mês.</p>}
                        <Label htmlFor="portal-obs" className="mt-3 block text-xs font-bold">Observação (opcional)</Label>
                        <Textarea id="portal-obs" className="mt-1" rows={2} value={obs} onChange={e => setObs(e.target.value)} />
                        <Button className="mt-3 w-full bg-[#067647] text-white hover:bg-[#05603A]" disabled={!simulacao || excede || Boolean(sobreposto) || saldo.saldo < 1} onClick={enviar}>
                            <Send className="mr-1.5 h-4 w-4" /> Enviar pedido
                        </Button>
                        <p className="mt-2 text-xs text-slate-500">{temChefe ? 'O pedido vai para o seu chefe directo e depois para os Recursos Humanos.' : 'O pedido vai para os Recursos Humanos.'} Recebe um aviso quando for decidido.</p>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                        <h3 className="mb-2 font-extrabold">Os meus pedidos</h3>
                        {meus.length === 0 ? <p className="text-sm text-slate-500">Ainda não fez pedidos de férias.</p> : (
                            <ul className="space-y-2">
                                {meus.map(p => {
                                    const e = estadoVisivel(p, hoje, temChefe);
                                    return (
                                        <li key={p.id} className="rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-800">
                                            <div className="flex items-center justify-between gap-2">
                                                <b>{p.data_inicio ? `${dataPt(p.data_inicio)} a ${dataPt(p.data_fim)}` : `Previsto em ${MESES_PT[(p.mes_previsto || 1) - 1]}`}</b>
                                                <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-bold', COR[e])}>{ROTULO[e]}</span>
                                            </div>
                                            <div className="mt-0.5 text-xs text-slate-500">{p.dias} dias úteis{p.data_regresso ? ` · regressa ${dataSemana(p.data_regresso)}` : ''}</div>
                                            {e === 'recusado' && p.motivo_recusa && <div className="mt-1 text-xs text-red-700">Motivo: {p.motivo_recusa}</div>}
                                            {p.estado === 'planeado' && p.pedido_funcionario ? (
                                                <Button size="sm" variant="ghost" className="mt-1 h-7 px-2 text-xs text-red-700" onClick={() => void cancelar(p)}><X className="mr-1 h-3.5 w-3.5" /> Cancelar pedido</Button>
                                            ) : null}
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </div>
                </aside>
            </div>
        </div>
    );
}
