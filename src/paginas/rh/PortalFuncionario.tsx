import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { MainLayout } from '@/componentes/layout/MainLayout';
import { Button } from '@/componentes/ui/button';
import { Input } from '@/componentes/ui/input';
import { Label } from '@/componentes/ui/label';
import { Switch } from '@/componentes/ui/switch';
import { Textarea } from '@/componentes/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/componentes/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/componentes/ui/dialog';
import { Banknote, Briefcase, CalendarCheck, CalendarDays, CheckCircle2, Clock, FileText, Inbox, LayoutDashboard, Mail, Network, Plane, Send, Users, Wallet, XCircle } from 'lucide-react';
import { cadeiaChefia, chefeDirecto, nomeNivel, subordinados } from '@/bibliotecas/rh/hierarquia-rh';
import { ServicoPortalRH } from '@/servicos/rh/ServicoPortalRH';
import { ServicoFeriasRH, type PlanoFeriasRH } from '@/servicos/rh/ServicoFeriasRH';
import { FeriasPortal } from '@/componentes/rh/FeriasPortal';
import { ServicoTempoRH } from '@/servicos/rh/ServicoTempoRH';
import { ServicoRH } from '@/servicos/rh/ServicoRH';
import { ServicoRecebimentoRH, ultimaPorRecibo } from '@/servicos/rh/ServicoRecebimentoRH';
import { ServicoReclamacoesRH } from '@/servicos/rh/ServicoReclamacoesRH';
import { ServicoPortalComunicacao, ROTULO_PEDIDO, destinatariosRH } from '@/servicos/rh/ServicoPortalComunicacao';
import { FolhaCorreccaoPortal } from '@/componentes/rh/FolhaCorreccaoPortal';
import { ServicoAdminPrincipal } from '@/servicos/ServicoAdminPrincipal';
import { estadoEfectivo, saldoFerias } from '@/bibliotecas/rh/ferias';
import { valorNumerico } from '@/bibliotecas/rh/parametros-rh';
import { periodoPt } from '@/bibliotecas/rh/pdf-rh';
import { luandaTodayKey } from '@/bibliotecas/fuso-angola';
import { cn } from '@/bibliotecas/utils';
import { useActorRH } from '@/ganchos/usar-modulo-rh';
import { useAuth } from '@/contextos/ContextoAutenticacao';
import { Indicador, dataPt, executar, kz, useCarregar, Vazio } from '@/componentes/rh/comum-rh';
import { MarcarPonto, MeuPonto } from '@/componentes/rh/ponto/PortalPonto';
import { MeusDocumentos } from '@/componentes/rh/MeusDocumentos';
import { FolhasFuncionario } from '@/componentes/rh/FolhasFuncionario';
import { ResumoDescontosFuncionario } from '@/componentes/rh/ResumoDescontosFuncionario';
import { CorreioInterno } from '@/componentes/rh/CorreioFuncionario';

/** Abas do portal do funcionário (o menu lateral do funcionário aponta para elas). */
export const ABAS_PORTAL = [
    { id: 'painel', rotulo: 'Painel', icone: LayoutDashboard },
    { id: 'ferias', rotulo: 'Férias', icone: CalendarDays },
    { id: 'pedidos', rotulo: 'Pedidos', icone: Plane },
    { id: 'salarios', rotulo: 'Salários', icone: Wallet },
    { id: 'documentos', rotulo: 'Documentos e contratos', icone: FileText },
    { id: 'correio', rotulo: 'Correio', icone: Mail },
    { id: 'ponto', rotulo: 'Ponto', icone: Clock },
    // Só aparece a quem é chefe directo de alguém.
    { id: 'equipa', rotulo: 'A minha equipa', icone: Users },
] as const;
type Aba = (typeof ABAS_PORTAL)[number]['id'];
const ROTULO_ESTADO_PEDIDO = { pendente: 'aguarda resposta', aprovado: 'aprovado', recusado: 'recusado' } as const;
const ROTULO_CONTRATO: Record<string, string> = { indeterminado: 'Sem termo', determinado: 'A termo certo', estagio: 'Estágio', prestacao: 'Prestação de serviços' };

/** Portal do funcionário: painel, férias (calendário e pedido), pedidos (subsídio, dispensas), salários, documentos e contratos, correio e ponto. */
export default function PortalFuncionario() {
    const { actor } = useActorRH();
    const { users } = useAuth();
    const [params, setParams] = useSearchParams();
    const aba = (ABAS_PORTAL.some(a => a.id === params.get('aba')) ? params.get('aba') : 'painel') as Aba;
    const irPara = (a: Aba) => setParams(a === 'painel' ? {} : { aba: a });
    const hoje = luandaTodayKey();
    const dados = useCarregar(async () => {
        if (!actor) return null;
        const f = await ServicoPortalRH.meuFuncionario(actor.id);
        if (!f) return { f: null };
        const [recibos, planos, ausencias, tipos, contratos, parametros, recebimentos, reclamacoes, pedidos, correio, correccao, departamentos, seccoes, cargos, funcionarios, pedidosTodos] = await Promise.all([
            ServicoPortalRH.meusRecibos(f.id), ServicoFeriasRH.planos(), ServicoTempoRH.ausencias(), ServicoTempoRH.tiposAusencia(), ServicoRH.contratos(f.id),
            ServicoRH.parametros(), ServicoRecebimentoRH.doFuncionario(f.id), ServicoReclamacoesRH.doFuncionario(f.id), ServicoPortalComunicacao.meusPedidos(f.id),
            ServicoPortalComunicacao.correioDoFuncionario(f.id), ServicoPortalRH.minhaFolhaCorreccao(f.id),
            ServicoRH.departamentos(), ServicoRH.seccoes(), ServicoRH.cargos(), ServicoRH.funcionarios(), ServicoPortalComunicacao.todosPedidos(),
        ]);
        // Hierarquia: o chefe directo (e a linha acima) e a equipa que responde a este funcionário.
        const estrutura = { departamentos, seccoes, cargos, funcionarios };
        const chefe = funcionarios.find(x => x.id === chefeDirecto(f, estrutura).id) || null;
        const equipa = subordinados(f.id, estrutura);
        const idsEquipa = new Set(equipa.map(x => x.id));
        // As férias aprovadas aparecem pelo plano (a ausência «Férias» que geram não se repete na lista).
        return { f, recibos, planos: planos.filter(p => p.funcionario_id === f.id), ausencias: ausencias.filter(a => a.funcionario_id === f.id && a.tipo_id !== 'ausencia-FE'),
            tipos, contratos, parametros, recebimentos, reclamacoes, pedidos, correio, correccao, chefe, cadeia: cadeiaChefia(f.id, estrutura), equipa, cargos,
            departamentos, seccoes,
            equipaPedidos: [
                ...planos.filter(p => idsEquipa.has(p.funcionario_id) && p.estado === 'planeado' && p.pedido_funcionario).map(p => ({ id: p.id, funcionario_id: p.funcionario_id, o: `Férias de ${dataPt(p.data_inicio)} a ${dataPt(p.data_fim)} (${p.dias} dias úteis${p.data_regresso ? `, regressa ${dataPt(p.data_regresso)}` : ''})${p.chefe_aprovado_em ? ' · já aprovado por si, aguarda o RH' : ''}`, plano: p as PlanoFeriasRH })),
                ...ausencias.filter(a => idsEquipa.has(a.funcionario_id) && a.estado === 'pendente').map(a => ({ id: a.id, funcionario_id: a.funcionario_id, o: `Dispensa ${dataPt(a.data_inicio)}${a.motivo ? ` · ${a.motivo}` : ''}` })),
                ...pedidosTodos.filter(p => idsEquipa.has(p.funcionario_id) && p.estado === 'pendente').map(p => ({ id: p.id, funcionario_id: p.funcionario_id, o: `${ROTULO_PEDIDO[p.tipo]}: ${p.assunto}` })),
            ] };
    }, null as null | Record<string, any>, [actor?.id]);
    // Quem recebe os avisos dos pedidos e das mensagens: o RH e o Administrador principal.
    const [destinatarios, setDestinatarios] = useState<string[]>([]);
    useEffect(() => { void ServicoAdminPrincipal.obter().then(p => setDestinatarios(destinatariosRH(users as never, p?.userId))); }, [users]);
    // Os pedidos também avisam o chefe directo (se tiver conta no sistema).
    const chefeUtilizador: string | null = dados.dados?.chefe?.utilizador_id || null;
    const avisarPedidos = chefeUtilizador && chefeUtilizador !== actor?.id ? [...new Set([...destinatarios, chefeUtilizador])] : destinatarios;
    const [recusarFerias, setRecusarFerias] = useState<PlanoFeriasRH | null>(null);
    const [motivoRecusa, setMotivoRecusa] = useState('');
    const [subsidio, setSubsidio] = useState({ ano: Number(hoje.slice(0, 4)), obs: '' });
    const [outro, setOutro] = useState({ assunto: '', descricao: '' });
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
    const recebidos = [...ultimaPorRecibo(d.recebimentos).values()].filter((r: any) => r.estado === 'recebido').length;
    const pendentes = d.planos.filter((p: any) => p.estado === 'planeado').length + d.ausencias.filter((a: any) => a.estado === 'pendente').length + d.pedidos.filter((p: any) => p.estado === 'pendente').length;
    const porLer = d.correio.filter((m: any) => m.sentido === 'para_funcionario' && !m.lida).length;

    return (
        <MainLayout title="Portal do funcionário" subtitle={`${f.nome} · n.º ${f.numero_mecanografico}`}>
            <nav aria-label="Secções do portal" className="mb-4 flex flex-wrap gap-1.5">
                {ABAS_PORTAL.filter(a => a.id !== 'equipa' || d.equipa.length > 0).map(a => {
                    const Icone = a.icone;
                    return (
                        <button key={a.id} type="button" onClick={() => irPara(a.id)} aria-current={aba === a.id ? 'page' : undefined}
                            className={cn('flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-bold transition',
                                aba === a.id ? 'border-rh-navy bg-rh-navy text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300')}>
                            <Icone className="h-4 w-4" /> {a.rotulo}
                            {a.id === 'correio' && porLer > 0 && <span className="rounded-full bg-sky-500 px-1.5 text-[10px] text-white">{porLer}</span>}
                            {a.id === 'equipa' && d.equipaPedidos.length > 0 && <span className="rounded-full bg-amber-500 px-1.5 text-[10px] text-white">{d.equipaPedidos.length}</span>}
                        </button>
                    );
                })}
            </nav>

            {aba === 'painel' && (
                <>
                    <FolhaCorreccaoPortal f={f} actor={actor} correio={d.correio} onMudou={recarregar}
                        destinatarios={[...destinatarios, ...(users as Array<{ id: string; role?: unknown; status?: unknown }>).filter(u => String(u.role) === 'super_admin' && !['blocked', 'inactive'].includes(String(u.status || 'active'))).map(u => u.id)]} />
                    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                        <Indicador titulo="Saldo de férias" valor={`${saldo.saldo} dias`} nota={`Direito ${saldo.direito} + transitados ${saldo.transitados}`} tom="emerald" />
                        <Indicador titulo="Férias marcadas / gozadas" valor={`${saldo.marcados} / ${saldo.gozados}`} />
                        <Indicador titulo="Dispensas pedidas" valor={d.ausencias.length} nota={`${d.ausencias.filter((a: any) => a.estado === 'aprovada' || a.estado === 'aprovado').length} aprovada(s)`} />
                        <Indicador titulo="Pedidos por responder" valor={pendentes} tom="orange" />
                        <Indicador titulo="Salários processados" valor={d.recibos.length + d.correccao.length} nota={d.correccao.length ? `${d.correccao.length} por aprovar` : 'todos aprovados'} tom="sky" />
                        <Indicador titulo="Salários recebidos" valor={recebidos} nota="confirmados por si" tom="emerald" />
                        <Indicador titulo="Último líquido" valor={d.recibos[0] ? kz(d.recibos[0].liquido_minor) : '—'} nota={d.recibos[0] ? periodoPt(d.recibos[0].ano, d.recibos[0].mes) : ''} tom="sky" />
                        <Indicador titulo="Mensagens por ler" valor={porLer} tom={porLer ? 'orange' : undefined} />
                    </div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        {([['pedidos', Plane, 'Pedir férias, subsídio ou dispensa'], ['salarios', Banknote, d.correccao.length ? 'Conferir a folha de correcção' : 'Ver as folhas de salário'],
                            ['documentos', Briefcase, 'O meu contrato e documentos'], ['correio', Inbox, porLer ? `${porLer} mensagem(ns) por ler` : 'Escrever ao RH']] as const).map(([a, Icone, texto]) => (
                            <button key={a} type="button" onClick={() => irPara(a)} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left text-sm font-bold hover:border-rh-navy dark:border-slate-800 dark:bg-slate-900">
                                <Icone className="h-5 w-5 text-rh-navy dark:text-indigo-300" /> {texto}
                            </button>
                        ))}
                    </div>
                    <div className="mt-4 grid gap-4 lg:grid-cols-2">
                        <MarcarPonto f={f} actor={actor} />
                        <section className="rounded-2xl border border-slate-200 bg-white p-4 text-sm dark:border-slate-800 dark:bg-slate-900">
                            <h2 className="mb-2 flex items-center gap-2 font-black"><Network className="h-4 w-4" /> O meu lugar na empresa</h2>
                            <p><span className="text-slate-500">Departamento:</span> <b>{d.departamentos.find((x: any) => x.id === f.departamento_id)?.nome || '—'}</b>
                                {f.seccao_id && d.seccoes.find((x: any) => x.id === f.seccao_id) ? <> · <span className="text-slate-500">Secção:</span> <b>{d.seccoes.find((x: any) => x.id === f.seccao_id).nome}</b></> : null}</p>
                            <p className="mt-1"><span className="text-slate-500">Cargo:</span> <b>{d.cargos.find((c: any) => c.id === f.cargo_id)?.nome || '—'}</b>{d.cargos.find((c: any) => c.id === f.cargo_id)?.nivel ? ` · ${nomeNivel(d.cargos.find((c: any) => c.id === f.cargo_id).nivel)}` : ''}</p>
                            <p className="mt-1"><span className="text-slate-500">Chefe directo:</span> <b>{d.chefe?.nome || 'Sem chefe directo'}</b>{d.chefe ? ` (${d.cargos.find((c: any) => c.id === d.chefe.cargo_id)?.nome || 'sem cargo'})` : ''}</p>
                            {d.cadeia.length > 1 && <p className="mt-1 text-xs text-slate-500">Linha de chefia: {d.cadeia.map((x: any) => x.nome).join(' → ')}</p>}
                            {d.equipa.length > 0 && <Button size="sm" variant="outline" className="mt-3" onClick={() => irPara('equipa')}><Users className="mr-1.5 h-4 w-4" /> A minha equipa ({d.equipa.length})</Button>}
                        </section>
                    </div>
                </>
            )}

            {aba === 'ferias' && (
                <FeriasPortal f={f} actor={actor} planos={d.planos} saldo={saldo} temChefe={Boolean(d.chefe)} destinatarios={avisarPedidos} hoje={hoje} onMudou={recarregar} />
            )}

            {aba === 'pedidos' && (
                <>
                    <div className="grid gap-4 lg:grid-cols-3">
                        <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                            <h2 className="mb-3 flex items-center gap-2 font-black"><Plane className="h-4 w-4" /> Pedir férias</h2>
                            <p className="text-sm text-slate-600 dark:text-slate-300">Escolha o início no calendário anual: os dias úteis, o último dia e a data de regresso são calculados automaticamente.</p>
                            <p className="mt-2 text-xs text-slate-500">Saldo disponível: {saldo.saldo} dias.</p>
                            <Button className="mt-3" onClick={() => irPara('ferias')}><CalendarDays className="mr-1.5 h-4 w-4" /> Abrir o calendário de férias</Button>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                            <h2 className="mb-3 flex items-center gap-2 font-black"><Banknote className="h-4 w-4" /> Pedir subsídio de férias</h2>
                            <Label className="text-xs font-bold">Ano</Label>
                            <Select value={String(subsidio.ano)} onValueChange={v => setSubsidio(x => ({ ...x, ano: Number(v) }))}>
                                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                                <SelectContent>{[ano - 1, ano, ano + 1].map(a => <SelectItem key={a} value={String(a)}>{a}</SelectItem>)}</SelectContent>
                            </Select>
                            <Label className="mt-3 block text-xs font-bold">Observações</Label>
                            <Textarea className="mt-1" rows={2} value={subsidio.obs} onChange={e => setSubsidio(x => ({ ...x, obs: e.target.value }))} placeholder="Ex.: vou gozar as férias em Dezembro." />
                            <Button className="mt-3" onClick={() => void executar(() => ServicoPortalComunicacao.pedir(f, { tipo: 'subsidio_ferias', ano: subsidio.ano, descricao: subsidio.obs }, actor, avisarPedidos), 'Pedido de subsídio enviado ao RH').then(ok => { if (ok) { setSubsidio(x => ({ ...x, obs: '' })); recarregar(); } })}>
                                <Send className="mr-1.5 h-4 w-4" /> Enviar pedido
                            </Button>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                            <h2 className="mb-3 flex items-center gap-2 font-black"><CalendarCheck className="h-4 w-4" /> Pedir dispensa</h2>
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
                            <Button className="mt-3" onClick={() => void executar(() => ServicoPortalRH.pedirDispensa(f, { tipo_id: dispensa.tipo_id, inicio: dispensa.inicio, fim: dispensa.fim, horas: dispensa.porHoras ? dispensa.horas : 0, motivo: dispensa.motivo }, actor, avisarPedidos), 'Pedido de dispensa enviado').then(ok => { if (ok) { setDispensa(x => ({ ...x, motivo: '' })); recarregar(); } })}>
                                <Send className="mr-1.5 h-4 w-4" /> Enviar pedido
                            </Button>
                        </div>
                    </div>
                    <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                        <h2 className="mb-3 font-black">Outro pedido ao RH</h2>
                        <div className="grid gap-3 sm:grid-cols-[260px_1fr_auto] sm:items-end">
                            <div><Label className="text-xs font-bold">Assunto</Label><Input className="mt-1" value={outro.assunto} onChange={e => setOutro(x => ({ ...x, assunto: e.target.value }))} placeholder="Ex.: declaração para o banco" /></div>
                            <div><Label className="text-xs font-bold">Explique o pedido</Label><Input className="mt-1" value={outro.descricao} onChange={e => setOutro(x => ({ ...x, descricao: e.target.value }))} /></div>
                            <Button disabled={!outro.assunto.trim()} onClick={() => void executar(() => ServicoPortalComunicacao.pedir(f, { tipo: /declara/i.test(outro.assunto) ? 'declaracao' : 'outro', assunto: outro.assunto, descricao: outro.descricao }, actor, avisarPedidos), 'Pedido enviado ao RH').then(ok => { if (ok) { setOutro({ assunto: '', descricao: '' }); recarregar(); } })}>
                                <Send className="mr-1.5 h-4 w-4" /> Enviar
                            </Button>
                        </div>
                    </div>
                    <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                        <h2 className="mb-3 font-black">Os meus pedidos</h2>
                        {d.planos.length + d.ausencias.length + d.pedidos.length === 0 ? <Vazio>Sem pedidos.</Vazio> : (
                            <table className="w-full text-sm">
                                <thead className="text-left text-[11px] uppercase text-slate-500"><tr><th className="py-1">Pedido</th><th>Período / pedido em</th><th>Estado</th></tr></thead>
                                <tbody>
                                    {d.pedidos.map((p: any) => (
                                        <tr key={p.id} className="border-t border-slate-100 align-top dark:border-slate-800">
                                            <td className="py-1.5">{p.assunto}{p.descricao ? <div className="text-xs text-slate-500">{p.descricao}</div> : null}</td><td>{dataPt(p.criado_em)}</td>
                                            <td>{ROTULO_ESTADO_PEDIDO[p.estado as keyof typeof ROTULO_ESTADO_PEDIDO]}{p.resposta ? <div className="text-xs text-slate-500">RH: {p.resposta}</div> : null}</td>
                                        </tr>
                                    ))}
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
                </>
            )}

            {aba === 'salarios' && (
                <>
                    <FolhasFuncionario f={f} actor={actor} finais={d.recibos} />
                    <ResumoDescontosFuncionario finais={d.recibos} />
                </>
            )}

            {aba === 'documentos' && (
                <>
                    <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                        <h2 className="mb-3 flex items-center gap-2 font-black"><Briefcase className="h-4 w-4" /> Os meus contratos</h2>
                        {d.contratos.length === 0 ? <Vazio>Sem contrato registado.</Vazio> : (
                            <div className="grid gap-2 sm:grid-cols-2">
                                {d.contratos.map((c: any) => (
                                    <div key={c.id} className={cn('rounded-xl border px-3 py-2 text-sm', c.estado === 'activo' ? 'border-emerald-200 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/20' : 'border-slate-200 dark:border-slate-800')}>
                                        <div className="flex items-center justify-between"><b>{ROTULO_CONTRATO[c.tipo] || c.tipo}</b><span className="text-xs font-bold uppercase text-slate-500">{c.estado}</span></div>
                                        <div className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                                            {dataPt(c.inicio)}{c.fim ? ` a ${dataPt(c.fim)}` : ' · sem data de fim'} · {c.horas_semanais} h/semana · {c.dias_ferias} dias de férias
                                        </div>
                                        <div className="mt-0.5 text-xs">Salário base: <b>{kz(c.salario_base_minor)}</b></div>
                                    </div>
                                ))}
                            </div>
                        )}
                        <p className="mt-2 text-xs text-slate-500">O documento assinado do contrato está na pasta «Contratos» abaixo (quando o RH o carregou).</p>
                    </section>
                    <MeusDocumentos f={f} actor={actor} />
                </>
            )}

            {aba === 'correio' && (
                <CorreioInterno lado="funcionario" mensagens={d.correio} onMudou={recarregar} vazio="Ainda não há mensagens. Escreva ao RH quando precisar."
                    onEnviar={(assunto, corpo, respostaA) => executar(() => ServicoPortalComunicacao.escreverAoRH(f, assunto, corpo, actor, destinatarios, respostaA), 'Mensagem enviada ao RH')} />
            )}

            {aba === 'equipa' && d.equipa.length > 0 && (
                <div className="grid gap-4 lg:grid-cols-2">
                    <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                        <h2 className="mb-3 flex items-center gap-2 font-black"><Users className="h-4 w-4" /> Respondem a si ({d.equipa.length})</h2>
                        <ul className="space-y-1.5 text-sm">
                            {d.equipa.map((x: any) => {
                                const cargo = d.cargos.find((c: any) => c.id === x.cargo_id);
                                return <li key={x.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-1.5 dark:border-slate-800">
                                    <span className="min-w-0 truncate"><b>{x.nome}</b> · {cargo?.nome || 'sem cargo'}</span>
                                    {cargo?.nivel ? <span className="shrink-0 text-xs text-slate-500">{nomeNivel(cargo.nivel)}</span> : null}
                                </li>;
                            })}
                        </ul>
                    </section>
                    <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                        <h2 className="mb-1 flex items-center gap-2 font-black"><Inbox className="h-4 w-4" /> Pedidos da equipa por decidir</h2>
                        <p className="mb-3 text-xs text-slate-500">Recebe um aviso de cada pedido da sua equipa. Nas férias dá o seu parecer (aprovar ou recusar) e o RH aprova no fim.</p>
                        {d.equipaPedidos.length === 0 ? <Vazio>Sem pedidos pendentes.</Vazio> : (
                            <ul className="space-y-1.5 text-sm">
                                {d.equipaPedidos.map((p: any) => <li key={p.id} className="rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-1.5 dark:border-amber-900 dark:bg-amber-950/20">
                                    <b>{d.equipa.find((x: any) => x.id === p.funcionario_id)?.nome}</b> · {p.o}
                                    {p.plano && !p.plano.chefe_aprovado_em && (
                                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                                            <Button size="sm" className="h-7 bg-[#067647] px-2 text-xs text-white hover:bg-[#05603A]" onClick={() => void executar(() => ServicoFeriasRH.aprovarComoChefe(p.plano, actor, destinatarios), 'Pedido aprovado: segue para o RH').then(ok => ok && recarregar())}>
                                                <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Aprovar
                                            </Button>
                                            <Button size="sm" variant="outline" className="h-7 px-2 text-xs text-red-700" onClick={() => setRecusarFerias(p.plano)}><XCircle className="mr-1 h-3.5 w-3.5" /> Recusar</Button>
                                        </div>
                                    )}
                                </li>)}
                            </ul>
                        )}
                    </section>
                </div>
            )}

            {aba === 'ponto' && (
                <div className="grid gap-4 lg:grid-cols-2">
                    <MarcarPonto f={f} actor={actor} />
                    <MeuPonto f={f} actor={actor} />
                </div>
            )}
            {recusarFerias && (
                <Dialog open onOpenChange={v => { if (!v) { setRecusarFerias(null); setMotivoRecusa(''); } }}>
                    <DialogContent className="max-w-md">
                        <DialogHeader><DialogTitle>Recusar pedido de férias</DialogTitle><DialogDescription>O funcionário recebe um aviso com o motivo.</DialogDescription></DialogHeader>
                        <Label htmlFor="motivo-recusa" className="text-xs font-bold">Motivo</Label>
                        <Textarea id="motivo-recusa" rows={3} value={motivoRecusa} onChange={e => setMotivoRecusa(e.target.value)} />
                        <DialogFooter><Button variant="outline" onClick={() => { setRecusarFerias(null); setMotivoRecusa(''); }}>Cancelar</Button>
                            <Button variant="destructive" onClick={() => void executar(() => ServicoFeriasRH.recusar(recusarFerias, motivoRecusa, actor, true), 'Pedido recusado').then(ok => { if (ok) { setRecusarFerias(null); setMotivoRecusa(''); recarregar(); } })}>Recusar</Button></DialogFooter>
                    </DialogContent>
                </Dialog>
            )}
        </MainLayout>
    );
}
