import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { MainLayout } from '@/componentes/layout/MainLayout';
import { Button } from '@/componentes/ui/button';
import { Input } from '@/componentes/ui/input';
import { Label } from '@/componentes/ui/label';
import { Textarea } from '@/componentes/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/componentes/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/componentes/ui/dialog';
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Edit, FileDown, Plus, Receipt, Undo2 } from 'lucide-react';
import { ServicoFeriasRH, type PlanoFeriasRH } from '@/servicos/rh/ServicoFeriasRH';
import { ServicoTempoRH } from '@/servicos/rh/ServicoTempoRH';
import { conflitoDepartamento, dataRegresso, diasDoPlano, estadoEfectivo, saldoFerias, type EstadoFerias } from '@/bibliotecas/rh/ferias';
import { HORARIO_OMISSAO, type Feriado, type Horario } from '@/bibliotecas/rh/ponto';
import { valorNumerico } from '@/bibliotecas/rh/parametros-rh';
import { gerarGuiaFeriasPdf } from '@/bibliotecas/rh/pdf-rh';
import { luandaTodayKey } from '@/bibliotecas/fuso-angola';
import { useActorRH } from '@/ganchos/usar-modulo-rh';
import { useData } from '@/contextos/ContextoDados';
import { NavegacaoRH, dataPt, executar, useCarregar, Vazio } from '@/componentes/rh/comum-rh';
import { toast } from '@/ganchos/usar-toast';
import type { ActorRH, Funcionario } from '@/servicos/rh/ServicoRH';
import { useBaseRH } from './FuncionariosRH';

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const CORES: Record<EstadoFerias, string> = {
    planeado: 'bg-slate-200 text-slate-700', aprovado: 'bg-sky-200 text-sky-900', em_gozo: 'bg-emerald-200 text-emerald-900', gozado: 'bg-emerald-100 text-emerald-600', anulado: '',
};
const ROTULO: Record<EstadoFerias, string> = { planeado: 'planeado', aprovado: 'aprovado', em_gozo: 'em gozo', gozado: 'gozado', anulado: 'anulado' };

export default function FeriasRH() {
    const { actor, gerir, calcular } = useActorRH();
    const { companySettings } = useData();
    const navigate = useNavigate();
    const [parametrosUrl] = useSearchParams();
    const base = useBaseRH();
    const hoje = luandaTodayKey();
    const [ano, setAno] = useState(Number(hoje.slice(0, 4)));
    const dados = useCarregar(async () => ({ planos: await ServicoFeriasRH.planos(), horarios: await ServicoTempoRH.horarios(), feriados: await ServicoTempoRH.feriados() }),
        { planos: [] as PlanoFeriasRH[], horarios: [] as Horario[], feriados: [] as Feriado[] });
    const { planos, horarios, feriados } = dados.dados;
    const [dialogo, setDialogo] = useState<Partial<PlanoFeriasRH> | null>(null);
    const [anular, setAnular] = useState<PlanoFeriasRH | null>(null);
    const funcionarios = base.dados.funcionarios.filter(f => f.estado !== 'cessado');
    const direitoPadrao = valorNumerico(base.dados.parametros, 'dias_ferias_ano', hoje, 22);
    const limiteConflito = valorNumerico(base.dados.parametros, 'ferias_conflito_pct', hoje, 30);
    const direitoDe = (fid: string) => base.dados.contratos.find(c => c.funcionario_id === fid && c.estado === 'activo')?.dias_ferias ?? direitoPadrao;
    const horarioDe = (f?: Funcionario) => horarios.find(h => h.id === f?.horario_id) || horarios.find(h => h.id === 'horario-normal') || HORARIO_OMISSAO;
    const doAno = planos.filter(p => p.ano === ano && p.estado !== 'anulado');
    const recarregar = () => void dados.recarregar();

    // Alerta «Processar subsídio» (?subsidio=plano): abre o processamento de férias deste funcionário.
    const processar = async (p: PlanoFeriasRH) => {
        if (!actor) return;
        try {
            const id = await ServicoFeriasRH.processarSubsidio(p, base.dados.funcionarios.find(f => f.id === p.funcionario_id)?.nome || '', actor);
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
        const f = base.dados.funcionarios.find(x => x.id === p.funcionario_id);
        try {
            const saldo = saldoFerias(planos, p.funcionario_id, p.ano, direitoDe(p.funcionario_id), hoje, direitoDe(p.funcionario_id), f?.data_admissao).saldo;
            const regresso = dataRegresso(p.data_fim, horarioDe(f), feriados);
            const emitido = await ServicoFeriasRH.emitirGuia(p, { inicio: p.data_inicio, fim: p.data_fim, dias: p.dias, regresso, saldo }, actor);
            gerarGuiaFeriasPdf({ numero: emitido.numero, emitidoEm: emitido.emitido_em, ano: p.ano, inicio: p.data_inicio, fim: p.data_fim, dias: p.dias, regresso, saldoRestante: saldo,
                aprovadoPor: p.aprovado_por_nome, funcionario: { nome: f?.nome || '—', numero: f?.numero_mecanografico || '—',
                    cargo: base.dados.cargos.find(c => c.id === f?.cargo_id)?.nome, departamento: base.dados.departamentos.find(d => d.id === f?.departamento_id)?.nome } },
                companySettings, actor.name);
            recarregar();
        } catch (error) { toast({ variant: 'destructive', title: 'Não foi possível emitir a guia', description: (error as Error).message }); }
    };

    return (
        <MainLayout title="Férias" subtitle="Plano anual, saldos, guias e subsídio de férias">
            <NavegacaoRH extra={[{ path: '/rh/ferias', label: 'Férias' }]} />
            <div className="mb-4 flex flex-wrap items-center gap-2">
                <Button size="icon" variant="outline" onClick={() => setAno(a => a - 1)}><ChevronLeft className="h-4 w-4" /></Button>
                <span className="min-w-[80px] text-center text-lg font-black">{ano}</span>
                <Button size="icon" variant="outline" onClick={() => setAno(a => a + 1)}><ChevronRight className="h-4 w-4" /></Button>
                {gerir && <Button onClick={() => setDialogo({ ano, mes_previsto: null })}><Plus className="mr-1.5 h-4 w-4" /> Planear férias</Button>}
                <span className="text-xs text-slate-500">Os planos só previstos não descontam no saldo; ao aprovar, os dias ficam como Férias no livro de ponto.</span>
            </div>

            {funcionarios.length === 0 ? <Vazio>Sem funcionários.</Vazio> : (
                <div className="mb-5 overflow-x-auto rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                    <table className="w-full text-xs">
                        <thead className="bg-slate-50 dark:bg-slate-950">
                            <tr>
                                <th className="px-3 py-2 text-left">Funcionário</th>
                                {MESES.map(m => <th key={m} className="w-12 px-1 py-2 text-center">{m}</th>)}
                                <th className="px-2 text-center">Direito</th><th className="px-2 text-center">Transitados</th><th className="px-2 text-center">Marcados</th><th className="px-2 text-center">Gozados</th><th className="px-2 text-center">Saldo</th>
                            </tr>
                        </thead>
                        <tbody>{funcionarios.map(f => {
                            const s = saldoFerias(planos, f.id, ano, direitoDe(f.id), hoje, direitoDe(f.id), f.data_admissao);
                            const meus = doAno.filter(p => p.funcionario_id === f.id);
                            return (
                                <tr key={f.id} className="border-t border-slate-100 dark:border-slate-800">
                                    <td className="px-3 py-1.5 font-semibold">{f.nome}</td>
                                    {MESES.map((_, i) => {
                                        const chave = `${ano}-${String(i + 1).padStart(2, '0')}`;
                                        const p = meus.find(x => x.data_inicio && x.data_fim ? x.data_inicio.slice(0, 7) <= chave && x.data_fim.slice(0, 7) >= chave : x.mes_previsto === i + 1);
                                        const estado = p ? estadoEfectivo(p, hoje) : null;
                                        return (
                                            <td key={chave} className="p-0.5 text-center">
                                                <button type="button" disabled={!gerir} onClick={() => setDialogo(p || { ano, funcionario_id: f.id, mes_previsto: i + 1 })} title={p ? `${ROTULO[estado!]}${p.data_inicio ? ` · ${dataPt(p.data_inicio)} a ${dataPt(p.data_fim)}` : ' · só o mês previsto'}` : 'Planear'}
                                                    className={`h-7 w-full rounded text-[10px] font-bold ${estado ? CORES[estado] : 'hover:bg-slate-100 dark:hover:bg-slate-800'} ${p && !p.data_inicio ? 'border border-dashed border-slate-400' : ''}`}>
                                                    {p ? (p.dias ? `${p.dias}d` : '•') : ''}
                                                </button>
                                            </td>
                                        );
                                    })}
                                    <td className="px-2 text-center">{s.direito}</td><td className="px-2 text-center">{s.transitados}</td><td className="px-2 text-center">{s.marcados}</td>
                                    <td className="px-2 text-center">{s.gozados}</td><td className={`px-2 text-center font-black ${s.saldo < 0 ? 'text-red-600' : ''}`}>{s.saldo}</td>
                                </tr>
                            );
                        })}</tbody>
                    </table>
                </div>
            )}

            <h2 className="mb-2 font-black">Planos de {ano}</h2>
            {doAno.length === 0 ? <Vazio>Sem planos neste ano.</Vazio> : (
                <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-50 text-left text-[11px] uppercase text-slate-500 dark:bg-slate-950"><tr><th className="px-3 py-2">Funcionário</th><th className="px-3 py-2">Período</th><th className="px-3 py-2">Dias úteis</th><th className="px-3 py-2">Estado</th><th className="px-3 py-2">Subsídio</th><th className="px-3 py-2 text-right">Acções</th></tr></thead>
                        <tbody>{doAno.map(p => {
                            const estado = estadoEfectivo(p, hoje);
                            return (
                                <tr key={p.id} className="border-t border-slate-100 dark:border-slate-800">
                                    <td className="px-3 py-2 font-semibold">{base.dados.funcionarios.find(f => f.id === p.funcionario_id)?.nome || '—'}{p.pedido_funcionario ? <span className="ml-1 rounded bg-violet-100 px-1.5 text-[10px] font-bold text-violet-700">pedido do funcionário</span> : null}</td>
                                    <td className="px-3 py-2">{p.data_inicio ? `${dataPt(p.data_inicio)} a ${dataPt(p.data_fim)}` : `previsto em ${MESES[(p.mes_previsto || 1) - 1]}`}</td>
                                    <td className="px-3 py-2">{p.dias || '—'}</td>
                                    <td className="px-3 py-2"><span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${CORES[estado]}`}>{ROTULO[estado]}</span></td>
                                    <td className="px-3 py-2 text-xs">{p.subsidio_processado ? 'processado' : p.processamento_id ? 'em processamento' : '—'}</td>
                                    <td className="whitespace-nowrap px-3 py-2 text-right">
                                        {gerir && estado === 'planeado' && <Button size="icon" variant="ghost" title="Editar" onClick={() => setDialogo(p)}><Edit className="h-4 w-4" /></Button>}
                                        {gerir && actor && estado === 'planeado' && p.data_inicio && <Button size="icon" variant="ghost" title="Aprovar" onClick={() => void executar(() => ServicoFeriasRH.aprovar(p, actor), 'Férias aprovadas e marcadas no livro de ponto').then(ok => ok && recarregar())}><CheckCircle2 className="h-4 w-4 text-emerald-600" /></Button>}
                                        {['aprovado', 'em_gozo', 'gozado'].includes(estado) && <Button size="icon" variant="ghost" title="Guia de férias (PDF)" onClick={() => void guia(p)}><FileDown className="h-4 w-4" /></Button>}
                                        {calcular && !p.subsidio_processado && ['aprovado', 'em_gozo'].includes(estado) && <Button size="icon" variant="ghost" title="Processar subsídio de férias" onClick={() => void processar(p)}><Receipt className="h-4 w-4 text-violet-600" /></Button>}
                                        {gerir && ['planeado', 'aprovado'].includes(estado) && <Button size="icon" variant="ghost" title="Anular" onClick={() => setAnular(p)}><Undo2 className="h-4 w-4 text-red-600" /></Button>}
                                    </td>
                                </tr>
                            );
                        })}</tbody>
                    </table>
                </div>
            )}

            {actor && dialogo && <DialogoPlano plano={dialogo} funcionarios={funcionarios} planos={planos} horarios={horarios} feriados={feriados} limitePct={limiteConflito} hoje={hoje}
                actor={actor} onClose={() => setDialogo(null)} onSaved={recarregar} />}
            {actor && anular && <DialogoAnular plano={anular} actor={actor} onClose={() => setAnular(null)} onSaved={recarregar} />}
        </MainLayout>
    );
}

function DialogoPlano({ plano, funcionarios, planos, horarios, feriados, limitePct, hoje, actor, onClose, onSaved }: {
    plano: Partial<PlanoFeriasRH>; funcionarios: Funcionario[]; planos: PlanoFeriasRH[]; horarios: Horario[]; feriados: Feriado[]; limitePct: number; hoje: string;
    actor: ActorRH; onClose: () => void; onSaved: () => void;
}) {
    const [p, setP] = useState(plano);
    const somenteLeitura = Boolean(plano.id && plano.estado !== 'planeado');
    const f = funcionarios.find(x => x.id === p.funcionario_id);
    const horario = horarios.find(h => h.id === f?.horario_id) || horarios.find(h => h.id === 'horario-normal') || HORARIO_OMISSAO;
    const dias = p.data_inicio && p.data_fim ? diasDoPlano(p.data_inicio, p.data_fim, horario, feriados) : 0;
    const conflito = useMemo(() => (f && p.data_inicio && p.data_fim && p.data_fim >= p.data_inicio
        ? conflitoDepartamento({ inicio: p.data_inicio, fim: p.data_fim, funcionarioId: f.id, departamentoId: f.departamento_id, planos, funcionarios, limitePct, hoje }) : null),
    [f, p.data_inicio, p.data_fim, planos, funcionarios, limitePct, hoje]);
    return (
        <Dialog open onOpenChange={v => !v && onClose()}>
            <DialogContent className="max-w-lg">
                <DialogHeader><DialogTitle>{plano.id ? 'Plano de férias' : 'Planear férias'}</DialogTitle><DialogDescription>Escolha o mês previsto e, quando houver, as datas exactas. Contam só dias úteis (sem fins-de-semana nem feriados).</DialogDescription></DialogHeader>
                <div className="grid gap-3 sm:grid-cols-2">
                    <div className="sm:col-span-2"><Label className="text-xs font-bold">Funcionário</Label>
                        <Select value={p.funcionario_id || ''} onValueChange={v => setP(x => ({ ...x, funcionario_id: v }))} disabled={Boolean(plano.id)}>
                            <SelectTrigger className="mt-1"><SelectValue placeholder="Escolha" /></SelectTrigger>
                            <SelectContent>{funcionarios.map(x => <SelectItem key={x.id} value={x.id}>{x.nome}</SelectItem>)}</SelectContent>
                        </Select>
                    </div>
                    <div><Label className="text-xs font-bold">Mês previsto</Label>
                        <Select value={p.mes_previsto ? String(p.mes_previsto) : ''} onValueChange={v => setP(x => ({ ...x, mes_previsto: Number(v) }))} disabled={somenteLeitura}>
                            <SelectTrigger className="mt-1"><SelectValue placeholder="Mês" /></SelectTrigger>
                            <SelectContent>{MESES.map((m, i) => <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>)}</SelectContent>
                        </Select>
                    </div>
                    <div><Label className="text-xs font-bold">Dias úteis</Label><div className="mt-1 h-10 rounded-md border px-3 py-2 text-sm font-bold">{dias || '—'}</div></div>
                    <div><Label className="text-xs font-bold">Início</Label><Input className="mt-1" type="date" disabled={somenteLeitura} value={p.data_inicio || ''} onChange={e => setP(x => ({ ...x, data_inicio: e.target.value }))} /></div>
                    <div><Label className="text-xs font-bold">Fim</Label><Input className="mt-1" type="date" disabled={somenteLeitura} value={p.data_fim || ''} min={p.data_inicio || undefined} onChange={e => setP(x => ({ ...x, data_fim: e.target.value }))} /></div>
                    <div className="sm:col-span-2"><Label className="text-xs font-bold">Observações</Label><Textarea className="mt-1" rows={2} disabled={somenteLeitura} value={p.observacoes || ''} onChange={e => setP(x => ({ ...x, observacoes: e.target.value }))} /></div>
                </div>
                {conflito && <p className="flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800"><AlertTriangle className="h-4 w-4" /> Conflito: a {dataPt(conflito.dia)} ficariam {conflito.pct}% do departamento de férias (limite {limitePct}%).</p>}
                {!somenteLeitura && (
                    <DialogFooter><Button variant="outline" onClick={onClose}>Cancelar</Button>
                        <Button onClick={() => void executar(() => ServicoFeriasRH.guardar({ id: p.id, funcionario_id: p.funcionario_id || '', ano: p.ano || Number(hoje.slice(0, 4)), mes_previsto: p.mes_previsto || null, data_inicio: p.data_inicio || null, data_fim: p.data_fim || null, observacoes: p.observacoes || undefined }, actor), 'Plano de férias guardado').then(ok => { if (ok) { onSaved(); onClose(); } })}>Guardar</Button>
                    </DialogFooter>
                )}
            </DialogContent>
        </Dialog>
    );
}

function DialogoAnular({ plano, actor, onClose, onSaved }: { plano: PlanoFeriasRH; actor: ActorRH; onClose: () => void; onSaved: () => void }) {
    const [motivo, setMotivo] = useState('');
    return (
        <Dialog open onOpenChange={v => !v && onClose()}>
            <DialogContent className="max-w-md">
                <DialogHeader><DialogTitle>Anular plano de férias</DialogTitle><DialogDescription>Se já estava aprovado, a marcação de férias no livro de ponto também é anulada.</DialogDescription></DialogHeader>
                <Textarea rows={3} placeholder="Motivo" value={motivo} onChange={e => setMotivo(e.target.value)} />
                <DialogFooter><Button variant="outline" onClick={onClose}>Cancelar</Button>
                    <Button variant="destructive" onClick={() => void executar(() => ServicoFeriasRH.anular(plano, motivo, actor), 'Plano anulado').then(ok => { if (ok) { onSaved(); onClose(); } })}>Anular</Button></DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
