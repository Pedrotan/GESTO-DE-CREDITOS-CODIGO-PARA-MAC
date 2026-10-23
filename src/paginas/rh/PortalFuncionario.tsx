import { useState } from 'react';
import { MainLayout } from '@/componentes/layout/MainLayout';
import { Button } from '@/componentes/ui/button';
import { Input } from '@/componentes/ui/input';
import { Label } from '@/componentes/ui/label';
import { Switch } from '@/componentes/ui/switch';
import { Textarea } from '@/componentes/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/componentes/ui/select';
import { FileDown, Plane, Send } from 'lucide-react';
import { ServicoPortalRH } from '@/servicos/rh/ServicoPortalRH';
import { ServicoSalariosRH, ROTULO_TIPO } from '@/servicos/rh/ServicoSalariosRH';
import { ServicoFeriasRH } from '@/servicos/rh/ServicoFeriasRH';
import { ServicoTempoRH } from '@/servicos/rh/ServicoTempoRH';
import { ServicoRH } from '@/servicos/rh/ServicoRH';
import { estadoEfectivo, saldoFerias } from '@/bibliotecas/rh/ferias';
import { valorNumerico } from '@/bibliotecas/rh/parametros-rh';
import { gerarReciboPdf, periodoPt } from '@/bibliotecas/rh/pdf-rh';
import { luandaTodayKey } from '@/bibliotecas/fuso-angola';
import { useActorRH } from '@/ganchos/usar-modulo-rh';
import { useData } from '@/contextos/ContextoDados';
import { Indicador, dataPt, executar, kz, useCarregar, Vazio } from '@/componentes/rh/comum-rh';

/** Portal do funcionário: os seus recibos, o saldo de férias e os pedidos de férias e de dispensa. */
export default function PortalFuncionario() {
    const { actor } = useActorRH();
    const { companySettings } = useData();
    const hoje = luandaTodayKey();
    const dados = useCarregar(async () => {
        if (!actor) return null;
        const f = await ServicoPortalRH.meuFuncionario(actor.id);
        if (!f) return { f: null };
        const [recibos, planos, ausencias, tipos, contratos, parametros] = await Promise.all([ServicoPortalRH.meusRecibos(f.id), ServicoFeriasRH.planos(), ServicoTempoRH.ausencias(),
            ServicoTempoRH.tiposAusencia(), ServicoRH.contratos(f.id), ServicoRH.parametros()]);
        // As férias aprovadas aparecem pelo plano (a ausência «Férias» que geram não se repete na lista).
        return { f, recibos, planos: planos.filter(p => p.funcionario_id === f.id), ausencias: ausencias.filter(a => a.funcionario_id === f.id && a.tipo_id !== 'ausencia-FE'), tipos, contratos, parametros };
    }, null as null | Record<string, any>, [actor?.id]);
    const [ferias, setFerias] = useState({ inicio: '', fim: '', obs: '' });
    const [dispensa, setDispensa] = useState({ tipo_id: 'ausencia-D', inicio: hoje, fim: hoje, porHoras: false, horas: 2, motivo: '' });

    if (!actor) return null;
    const d = dados.dados;
    if (!d) return <MainLayout title="Portal do funcionário"><Vazio>A carregar…</Vazio></MainLayout>;
    if (!d.f) return <MainLayout title="Portal do funcionário"><Vazio>A sua conta ainda não está ligada a uma ficha de funcionário. Peça ao RH para escolher a sua conta na ficha («Utilizador do sistema»).</Vazio></MainLayout>;
    const f = d.f;
    const ano = Number(hoje.slice(0, 4));
    const direito = d.contratos.find((c: any) => c.estado === 'activo')?.dias_ferias ?? valorNumerico(d.parametros, 'dias_ferias_ano', hoje, 22);
    const saldo = saldoFerias(d.planos, f.id, ano, direito, hoje, direito, f.data_admissao);
    const recarregar = () => void dados.recarregar();

    return (
        <MainLayout title="Portal do funcionário" subtitle={`${f.nome} · n.º ${f.numero_mecanografico}`}>
            <div className="grid gap-3 sm:grid-cols-4">
                <Indicador titulo="Saldo de férias" valor={`${saldo.saldo} dias`} nota={`Direito ${saldo.direito} + transitados ${saldo.transitados}`} tom="emerald" />
                <Indicador titulo="Marcados / gozados" valor={`${saldo.marcados} / ${saldo.gozados}`} />
                <Indicador titulo="Último líquido" valor={d.recibos[0] ? kz(d.recibos[0].liquido_minor) : '—'} nota={d.recibos[0] ? periodoPt(d.recibos[0].ano, d.recibos[0].mes) : ''} tom="sky" />
                <Indicador titulo="Pedidos pendentes" valor={d.planos.filter((p: any) => p.estado === 'planeado').length + d.ausencias.filter((a: any) => a.estado === 'pendente').length} tom="orange" />
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-2">
                <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                    <h2 className="mb-3 font-black">Os meus recibos</h2>
                    {d.recibos.length === 0 ? <Vazio>Ainda não há recibos aprovados.</Vazio> : d.recibos.map((r: any) => (
                        <div key={r.id} className="mb-1.5 flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-800">
                            <span><b>{periodoPt(r.ano, r.mes)}</b> · {ROTULO_TIPO[r.tipo as keyof typeof ROTULO_TIPO]}</span>
                            <span className="flex items-center gap-2 font-black">{kz(r.liquido_minor)}
                                <Button size="icon" variant="ghost" title="Recibo (PDF)" onClick={() => void ServicoSalariosRH.linhas(r.id).then(l => gerarReciboPdf(r, l, { ano: r.ano, mes: r.mes, tipoRotulo: ROTULO_TIPO[r.tipo as keyof typeof ROTULO_TIPO], estado: r.estado }, companySettings, actor.name))}>
                                    <FileDown className="h-4 w-4" />
                                </Button>
                            </span>
                        </div>
                    ))}
                </section>

                <section className="space-y-4">
                    <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                        <h2 className="mb-3 flex items-center gap-2 font-black"><Plane className="h-4 w-4" /> Pedir férias</h2>
                        <div className="grid gap-3 sm:grid-cols-2">
                            <div><Label className="text-xs font-bold">Início</Label><Input className="mt-1" type="date" min={hoje} value={ferias.inicio} onChange={e => setFerias(x => ({ ...x, inicio: e.target.value }))} /></div>
                            <div><Label className="text-xs font-bold">Fim</Label><Input className="mt-1" type="date" min={ferias.inicio || hoje} value={ferias.fim} onChange={e => setFerias(x => ({ ...x, fim: e.target.value }))} /></div>
                            <div className="sm:col-span-2"><Label className="text-xs font-bold">Observações</Label><Input className="mt-1" value={ferias.obs} onChange={e => setFerias(x => ({ ...x, obs: e.target.value }))} /></div>
                        </div>
                        <Button className="mt-3" onClick={() => void executar(() => ServicoPortalRH.pedirFerias(f, ferias.inicio, ferias.fim, ferias.obs, actor), 'Pedido de férias enviado ao RH').then(ok => { if (ok) { setFerias({ inicio: '', fim: '', obs: '' }); recarregar(); } })}>
                            <Send className="mr-1.5 h-4 w-4" /> Enviar pedido
                        </Button>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                        <h2 className="mb-3 font-black">Pedir dispensa</h2>
                        <div className="grid gap-3 sm:grid-cols-2">
                            <div className="sm:col-span-2"><Label className="text-xs font-bold">Tipo</Label>
                                <Select value={dispensa.tipo_id} onValueChange={v => setDispensa(x => ({ ...x, tipo_id: v }))}>
                                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                                    <SelectContent>{d.tipos.filter((t: any) => t.activo !== 0 && t.justificada && !t.desconta_ferias).map((t: any) => <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>)}</SelectContent>
                                </Select>
                            </div>
                            <label className="flex items-center gap-2 text-xs font-bold sm:col-span-2"><Switch checked={dispensa.porHoras} onCheckedChange={v => setDispensa(x => ({ ...x, porHoras: v }))} /> Só algumas horas</label>
                            <div><Label className="text-xs font-bold">{dispensa.porHoras ? 'Dia' : 'Início'}</Label><Input className="mt-1" type="date" value={dispensa.inicio} onChange={e => setDispensa(x => ({ ...x, inicio: e.target.value, fim: e.target.value > x.fim ? e.target.value : x.fim }))} /></div>
                            {dispensa.porHoras
                                ? <div><Label className="text-xs font-bold">Horas</Label><Input className="mt-1" type="number" min={0.5} step={0.5} value={dispensa.horas} onChange={e => setDispensa(x => ({ ...x, horas: Number(e.target.value) }))} /></div>
                                : <div><Label className="text-xs font-bold">Fim</Label><Input className="mt-1" type="date" min={dispensa.inicio} value={dispensa.fim} onChange={e => setDispensa(x => ({ ...x, fim: e.target.value }))} /></div>}
                            <div className="sm:col-span-2"><Label className="text-xs font-bold">Motivo</Label><Textarea className="mt-1" rows={2} value={dispensa.motivo} onChange={e => setDispensa(x => ({ ...x, motivo: e.target.value }))} /></div>
                        </div>
                        <Button className="mt-3" onClick={() => void executar(() => ServicoPortalRH.pedirDispensa(f, { tipo_id: dispensa.tipo_id, inicio: dispensa.inicio, fim: dispensa.fim, horas: dispensa.porHoras ? dispensa.horas : 0, motivo: dispensa.motivo }, actor), 'Pedido de dispensa enviado').then(ok => { if (ok) { setDispensa(x => ({ ...x, motivo: '' })); recarregar(); } })}>
                            <Send className="mr-1.5 h-4 w-4" /> Enviar pedido
                        </Button>
                    </div>
                </section>
            </div>

            <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                <h2 className="mb-3 font-black">Os meus pedidos</h2>
                {d.planos.length + d.ausencias.length === 0 ? <Vazio>Sem pedidos.</Vazio> : (
                    <table className="w-full text-sm">
                        <thead className="text-left text-[11px] uppercase text-slate-500"><tr><th className="py-1">Pedido</th><th>Período</th><th>Estado</th></tr></thead>
                        <tbody>
                            {d.planos.filter((p: any) => p.data_inicio).map((p: any) => (
                                <tr key={p.id} className="border-t border-slate-100 dark:border-slate-800"><td className="py-1.5">Férias ({p.dias} dias úteis)</td><td>{dataPt(p.data_inicio)} a {dataPt(p.data_fim)}</td>
                                    <td>{p.estado === 'planeado' ? 'aguarda aprovação' : estadoEfectivo(p, hoje).replace('_', ' ')}</td></tr>
                            ))}
                            {d.ausencias.map((a: any) => (
                                <tr key={a.id} className="border-t border-slate-100 dark:border-slate-800"><td className="py-1.5">{d.tipos.find((t: any) => t.id === a.tipo_id)?.nome || 'Ausência'}</td>
                                    <td>{dataPt(a.data_inicio)}{a.data_fim !== a.data_inicio ? ` a ${dataPt(a.data_fim)}` : ''}{a.horas ? ` (${a.horas} h)` : ''}</td><td>{a.estado}</td></tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </section>
        </MainLayout>
    );
}
