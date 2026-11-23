import { useRef, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { MainLayout } from '@/componentes/layout/MainLayout';
import { Button } from '@/componentes/ui/button';
import { Input } from '@/componentes/ui/input';
import { Label } from '@/componentes/ui/label';
import { Textarea } from '@/componentes/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/componentes/ui/select';
import { ArrowLeft, FileUp, Gavel, Link2, Loader2, Lock, Paperclip, ScrollText, Send } from 'lucide-react';
import { Vazio, abrirDataUrl, dataPt, executar } from '@/componentes/rh/comum-rh';
import { NavegacaoCompliance, SeloAlerta, dataHoraPt, useActorCompliance, useCompliance } from '@/componentes/compliance/comum-compliance';
import { AVISO_SIGILO, SeloCaso, SeloPrioridade } from '@/componentes/compliance/casos-comum';
import {
    DECISOES_POR_TIPO, ROTULO_DECISAO, ROTULO_PRIORIDADE, ROTULO_TIPO_CASO, ROTULO_TIPO_DECISAO, faltaParaEncerrar,
    type Prioridade, type TipoDecisao,
} from '@/bibliotecas/compliance/casos';
import { ROTULO_ESTADO_ALERTA } from '@/bibliotecas/compliance/monitorizacao';
import {
    ROTULO_TIPO_EVIDENCIA, ROTULO_TIPO_LIGACAO, ServicoCasos, TAMANHO_MAXIMO_EVIDENCIA, type Caso, type DecisaoRegisto, type TipoEvidencia,
} from '@/servicos/compliance/ServicoCasos';
import type { ActorCompliance } from '@/servicos/compliance/ServicoCompliance';
import { cn } from '@/bibliotecas/utils';
import { useAuth } from '@/contextos/ContextoAutenticacao';

function Seccao({ titulo, icone: Icone, accao, children, className }: { titulo: string; icone: typeof Gavel; accao?: ReactNode; children: ReactNode; className?: string }) {
    return (
        <section className={cn('rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900', className)}>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-3.5 dark:border-slate-800">
                <h2 className="flex items-center gap-2 text-base font-bold"><Icone className="h-4 w-4 text-emerald-700 dark:text-emerald-400" aria-hidden />{titulo}</h2>
                {accao}
            </div>
            <div className="p-5">{children}</div>
        </section>
    );
}

export default function CasoCompliance() {
    const { id = '' } = useParams();
    const comp = useCompliance();
    const { actor, registar, decidir } = useActorCompliance();
    const { users } = useAuth() as { users?: Array<{ id: string; name: string; status?: string }> };
    const { casos, ligacoes, notas, evidencias, decisoes } = comp.dados.cas;
    const c = casos.find(x => x.id === id);
    const [nota, setNota] = useState('');
    const [aGuardar, setAGuardar] = useState(false);
    const recarregar = () => void comp.recarregar();

    if (!c) {
        return (
            <MainLayout title="Compliance" subtitle="Investigação">
                <NavegacaoCompliance />
                {comp.aCarregar ? <div className="flex items-center gap-2 p-8 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> A carregar…</div>
                    : <Vazio>Investigação não encontrada. <Link to="/compliance/casos" className="font-semibold underline">Voltar às investigações</Link></Vazio>}
            </MainLayout>
        );
    }
    const cliente = comp.clientes.find(x => x.id === c.client_id);
    const doCaso = decisoes.filter(d => d.caso_id === c.id);
    const falta = faltaParaEncerrar(c.estado, doCaso);
    const aberto = c.estado !== 'encerrado';
    const alertasCliente = comp.dados.alr.alertas.filter(a => a.client_id === c.client_id);
    const ligados = ligacoes.filter(l => l.caso_id === c.id);
    const alertasPorLigar = alertasCliente.filter(a => !ligados.some(l => l.tipo === 'alerta' && l.ref_id === a.id));

    const accao = async (fn: () => Promise<unknown>, msg: string) => {
        setAGuardar(true);
        const ok = await executar(fn, msg);
        setAGuardar(false);
        if (ok) { setNota(''); recarregar(); }
        return ok;
    };

    return (
        <MainLayout title="Compliance" subtitle={`Investigação ${c.numero}`}>
            <NavegacaoCompliance />
            <Link to="/compliance/casos" className="mb-1 inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:underline"><ArrowLeft className="h-3.5 w-3.5" /> Investigações</Link>
            <div className="mb-2 flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="font-mono text-xs text-slate-500">{c.numero}</p>
                    <h1 className="text-2xl font-extrabold">{c.titulo}</h1>
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                        <Link to={`/compliance/clientes/${c.client_id}`} className="font-semibold underline">{cliente?.name || 'Cliente'}</Link> · {ROTULO_TIPO_CASO[c.tipo]} · aberta em {dataHoraPt(c.aberto_em)} por {c.aberto_por_nome}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-3"><SeloCaso estado={c.estado} /><SeloPrioridade prioridade={c.prioridade} /><span className="text-xs text-slate-500">Prazo {dataPt(c.prazo)} · responsável {c.responsavel_nome || '—'}</span></div>
                </div>
                {aberto && registar && actor && (
                    <div className="flex flex-wrap gap-2">
                        {(c.estado === 'aberto' || c.estado === 'aguarda_decisao') && <Button size="sm" variant={c.estado === 'aberto' ? 'default' : 'outline'} disabled={aGuardar}
                            onClick={() => accao(() => ServicoCasos.mudarEstado(c, 'em_investigacao', nota, actor), c.estado === 'aberto' ? 'Investigação iniciada' : 'Voltou à investigação')}>
                            {c.estado === 'aberto' ? 'Iniciar investigação' : 'Voltar à investigação'}</Button>}
                        {c.estado === 'em_investigacao' && <Button size="sm" disabled={aGuardar} onClick={() => accao(() => ServicoCasos.mudarEstado(c, 'aguarda_decisao', nota, actor), 'Pronta para decisão')}>Passar à decisão</Button>}
                    </div>
                )}
            </div>
            <p className="mb-5 flex items-center gap-1.5 text-xs font-semibold text-violet-700 dark:text-violet-300"><Lock className="h-3.5 w-3.5" />{AVISO_SIGILO}</p>

            <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
                <div className="space-y-5">
                    <Seccao titulo="Motivo" icone={ScrollText}>
                        <p className="whitespace-pre-wrap text-sm">{c.descricao}</p>
                        {c.resumo_final && <div className="mt-3 rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-800/60"><strong>Resumo final</strong> ({c.encerrado_por_nome}, {dataHoraPt(c.encerrado_em)}): {c.resumo_final}</div>}
                    </Seccao>

                    <Seccao titulo="Registos ligados" icone={Link2}>
                        {!ligados.length ? <p className="text-sm text-slate-500">Nenhum registo ligado.</p> : (
                            <ul className="space-y-1.5 text-sm">
                                {ligados.map(l => {
                                    const a = l.tipo === 'alerta' ? alertasCliente.find(x => x.id === l.ref_id) : null;
                                    return <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2 dark:border-slate-800">
                                        <span><span className="text-xs font-bold uppercase text-slate-500">{ROTULO_TIPO_LIGACAO[l.tipo]}</span> · {l.descricao}</span>
                                        {a && <SeloAlerta estado={a.estado} />}
                                    </li>;
                                })}
                            </ul>
                        )}
                        {aberto && registar && actor && alertasPorLigar.length > 0 && (
                            <div className="mt-3 flex flex-wrap items-center gap-2">
                                <span className="text-xs text-slate-500">Ligar alerta do cliente:</span>
                                {alertasPorLigar.slice(0, 6).map(a => (
                                    <Button key={a.id} size="sm" variant="outline" disabled={aGuardar} onClick={() => accao(() => ServicoCasos.ligar(c, 'alerta', a.id, `${a.titulo} (${ROTULO_ESTADO_ALERTA[a.estado]})`, actor), 'Alerta ligado')}>{a.titulo}</Button>
                                ))}
                            </div>
                        )}
                    </Seccao>

                    <Evidencias caso={c} actor={actor} podeJuntar={aberto && registar} aoMudar={recarregar} evidencias={evidencias.filter(e => e.caso_id === c.id)} />

                    <Seccao titulo="Decisões" icone={Gavel}>
                        <div className="grid gap-4 lg:grid-cols-2">
                            <BlocoDecisao tipo="conclusao" caso={c} decisoes={doCaso} actor={actor} pode={aberto && decidir} aoMudar={recarregar}
                                ajuda="Conclusão interna da investigação. Quem abriu o caso não a regista." />
                            <BlocoDecisao tipo="medida" caso={c} decisoes={doCaso} actor={actor} pode={aberto && decidir} aoMudar={recarregar}
                                ajuda="Medidas aplicadas (pode registar várias). O bloqueio de operações passa a ser imposto no crédito na fase seguinte." />
                        </div>
                        <div className="mt-4 rounded-2xl border-2 border-dashed border-violet-300 p-4 dark:border-violet-800">
                            <BlocoDecisao tipo="uif" caso={c} decisoes={doCaso} actor={actor} pode={aberto && decidir && doCaso.some(d => d.tipo === 'conclusao')} aoMudar={recarregar}
                                ajuda="Decisão SEPARADA da conclusão interna. O sistema não envia nada à UIF: a comunicação faz-se pelos canais oficiais e aqui regista-se a decisão, o fundamento e a referência." />
                        </div>
                    </Seccao>

                    {aberto && decidir && actor && <Encerrar caso={c} falta={falta} decisoes={decisoes} actor={actor} aoMudar={recarregar} />}
                </div>

                <aside className="space-y-5">
                    {aberto && registar && actor && <Atribuir caso={c} utilizadores={(users || []).filter(u => u.status !== 'blocked')} actor={actor} aoMudar={recarregar} />}
                    <Seccao titulo="Histórico" icone={ScrollText}>
                        {aberto && registar && actor && (
                            <div className="mb-3 space-y-2">
                                <Textarea rows={2} value={nota} onChange={e => setNota(e.target.value)} placeholder="Nota da investigação (também usada ao mudar de estado)" />
                                <Button size="sm" variant="outline" disabled={aGuardar || !nota.trim()} onClick={() => accao(() => ServicoCasos.comentar(c, nota, actor), 'Nota registada')}><Send className="mr-1 h-3.5 w-3.5" />Registar nota</Button>
                            </div>
                        )}
                        <ol className="space-y-2 text-xs">
                            {notas.filter(n => n.caso_id === c.id).slice().reverse().map(n => (
                                <li key={n.id} className="border-l-2 border-slate-200 pl-2 dark:border-slate-700">
                                    <span className="text-slate-500">{dataHoraPt(n.em)} · {n.por_nome}</span>
                                    {n.texto && <span className="block whitespace-pre-wrap text-slate-800 dark:text-slate-200">{n.texto}</span>}
                                </li>
                            ))}
                        </ol>
                    </Seccao>
                </aside>
            </div>
        </MainLayout>
    );
}

function BlocoDecisao({ tipo, caso, decisoes, actor, pode, aoMudar, ajuda }: {
    tipo: TipoDecisao; caso: Caso; decisoes: DecisaoRegisto[]; actor: ActorCompliance | null; pode: boolean; aoMudar: () => void; ajuda: string;
}) {
    const [decisao, setDecisao] = useState('');
    const [fundamento, setFundamento] = useState('');
    const [referencia, setReferencia] = useState('');
    const [dataRef, setDataRef] = useState('');
    const [aGuardar, setAGuardar] = useState(false);
    const registadas = decisoes.filter(d => d.tipo === tipo);
    const unica = tipo !== 'medida';
    const guardar = async () => {
        if (!actor) return;
        setAGuardar(true);
        const ok = await executar(() => ServicoCasos.decidir(caso, { tipo, decisao, fundamento, referencia, dataReferencia: dataRef }, decisoes, actor), `${ROTULO_TIPO_DECISAO[tipo]} registada`);
        setAGuardar(false);
        if (ok) { setDecisao(''); setFundamento(''); setReferencia(''); setDataRef(''); aoMudar(); }
    };
    return (
        <div>
            <h3 className="text-sm font-bold">{ROTULO_TIPO_DECISAO[tipo]}</h3>
            <p className="mb-2 text-[11px] text-slate-500">{ajuda}</p>
            {registadas.map(d => (
                <div key={d.id} className="mb-2 rounded-lg bg-slate-50 p-2.5 text-xs dark:bg-slate-800/60">
                    <strong>{ROTULO_DECISAO[d.decisao as keyof typeof ROTULO_DECISAO]}</strong> — {d.decidido_por_nome}, {dataHoraPt(d.decidido_em)}
                    <p className="mt-0.5 whitespace-pre-wrap">{d.fundamento}</p>
                    {(d.referencia || d.data_referencia) && <p className="mt-0.5 text-slate-500">Referência: {d.referencia || '—'}{d.data_referencia ? ` · ${dataPt(d.data_referencia)}` : ''}</p>}
                </div>
            ))}
            {pode && (!unica || !registadas.length) && (
                <div className="space-y-2">
                    <Select value={decisao || undefined} onValueChange={setDecisao}>
                        <SelectTrigger><SelectValue placeholder="Escolha a decisão" /></SelectTrigger>
                        <SelectContent>{DECISOES_POR_TIPO[tipo].map(x => <SelectItem key={x} value={x}>{ROTULO_DECISAO[x as keyof typeof ROTULO_DECISAO]}</SelectItem>)}</SelectContent>
                    </Select>
                    <Textarea rows={3} value={fundamento} onChange={e => setFundamento(e.target.value)} placeholder="Fundamento (o que foi analisado e porquê)" />
                    {tipo === 'uif' && decisao === 'comunicar' && (
                        <div className="grid gap-2 sm:grid-cols-2">
                            <Input value={referencia} onChange={e => setReferencia(e.target.value)} placeholder="Referência da comunicação" />
                            <Input type="date" value={dataRef} onChange={e => setDataRef(e.target.value)} aria-label="Data da comunicação" />
                        </div>
                    )}
                    <Button size="sm" disabled={aGuardar || !decisao || fundamento.trim().length < 20} onClick={guardar}>Registar {ROTULO_TIPO_DECISAO[tipo].toLowerCase()}</Button>
                </div>
            )}
            {!pode && !registadas.length && <p className="text-xs text-slate-500">{tipo === 'uif' ? 'Disponível depois da conclusão interna (exige «Compliance: Decidir»).' : 'Ainda não registada.'}</p>}
        </div>
    );
}

function Evidencias({ caso, evidencias, actor, podeJuntar, aoMudar }: {
    caso: Caso; evidencias: Array<import('@/servicos/compliance/ServicoCasos').Evidencia>; actor: ActorCompliance | null; podeJuntar: boolean; aoMudar: () => void;
}) {
    const ficheiro = useRef<HTMLInputElement>(null);
    const [tipo, setTipo] = useState<TipoEvidencia>('documento');
    const [titulo, setTitulo] = useState('');
    const [descricao, setDescricao] = useState('');
    const [f, setF] = useState<File | null>(null);
    const [aGuardar, setAGuardar] = useState(false);
    const juntar = async () => {
        if (!actor) return;
        setAGuardar(true);
        const ok = await executar(() => ServicoCasos.juntarEvidencia(caso, { tipo, titulo, descricao, ficheiro: f }, actor), 'Evidência junta');
        setAGuardar(false);
        if (ok) { setTitulo(''); setDescricao(''); setF(null); if (ficheiro.current) ficheiro.current.value = ''; aoMudar(); }
    };
    const abrir = async (e: (typeof evidencias)[number]) => {
        if (!actor) return;
        await executar(async () => abrirDataUrl(await ServicoCasos.lerEvidencia(caso, e, actor), e.ficheiro_nome || 'evidencia'), 'Consulta registada na auditoria');
    };
    return (
        <Seccao titulo="Evidências" icone={Paperclip}>
            {!evidencias.length ? <p className="text-sm text-slate-500">Sem evidências.</p> : (
                <ul className="space-y-2">
                    {evidencias.map(e => (
                        <li key={e.id} className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-slate-100 p-3 text-sm dark:border-slate-800">
                            <div className="min-w-0">
                                <p className="font-semibold">{e.titulo} <span className="text-xs font-normal text-slate-500">· {ROTULO_TIPO_EVIDENCIA[e.tipo]}</span></p>
                                {e.descricao && <p className="text-xs text-slate-600 dark:text-slate-400">{e.descricao}</p>}
                                <p className="text-[11px] text-slate-500">{e.criado_por_nome}, {dataHoraPt(e.criado_em)}{e.ficheiro_nome ? ` · ${e.ficheiro_nome} (${Math.ceil((e.ficheiro_tamanho || 0) / 1024)} KB)` : ''}</p>
                                {e.ficheiro_hash && <p className="font-mono text-[10px] text-slate-400" title="Impressão digital SHA-256">{e.ficheiro_hash.slice(0, 24)}…</p>}
                            </div>
                            {e.ficheiro_nome && <Button size="sm" variant="outline" onClick={() => abrir(e)}>Abrir</Button>}
                        </li>
                    ))}
                </ul>
            )}
            {podeJuntar && (
                <div className="mt-4 space-y-2 border-t border-slate-100 pt-4 dark:border-slate-800">
                    <div className="grid gap-2 sm:grid-cols-[180px_1fr]">
                        <Select value={tipo} onValueChange={v => setTipo(v as TipoEvidencia)}><SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>{(Object.keys(ROTULO_TIPO_EVIDENCIA) as TipoEvidencia[]).map(t => <SelectItem key={t} value={t}>{ROTULO_TIPO_EVIDENCIA[t]}</SelectItem>)}</SelectContent></Select>
                        <Input value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="Título da evidência" />
                    </div>
                    <Textarea rows={2} value={descricao} onChange={e => setDescricao(e.target.value)} placeholder="Descrição (o que mostra e de onde vem)" />
                    <div className="flex flex-wrap items-center gap-2">
                        <input ref={ficheiro} type="file" className="hidden" onChange={e => setF(e.target.files?.[0] || null)} accept=".pdf,image/*,.txt,.csv,.xlsx,.docx" />
                        <Button size="sm" variant="outline" onClick={() => ficheiro.current?.click()}><FileUp className="mr-1 h-4 w-4" />{f ? f.name : 'Escolher ficheiro (até 5 MB)'}</Button>
                        {f && f.size > TAMANHO_MAXIMO_EVIDENCIA && <span className="text-xs text-red-600">Mais de 5 MB</span>}
                        <Button size="sm" disabled={aGuardar || !titulo.trim()} onClick={juntar}>Juntar evidência</Button>
                    </div>
                    <p className="text-[11px] text-slate-500">As evidências não se alteram nem se apagam; cada consulta fica registada na auditoria.</p>
                </div>
            )}
        </Seccao>
    );
}

function Atribuir({ caso, utilizadores, actor, aoMudar }: { caso: Caso; utilizadores: Array<{ id: string; name: string }>; actor: ActorCompliance; aoMudar: () => void }) {
    const [resp, setResp] = useState(caso.responsavel_id || actor.id);
    const [prioridade, setPrioridade] = useState<Prioridade>(caso.prioridade);
    const [prazo, setPrazo] = useState(caso.prazo || '');
    const [aGuardar, setAGuardar] = useState(false);
    const lista = utilizadores.some(u => u.id === actor.id) ? utilizadores : [{ id: actor.id, name: actor.name }, ...utilizadores];
    const mudou = resp !== caso.responsavel_id || prioridade !== caso.prioridade || prazo !== caso.prazo;
    const guardar = async () => {
        setAGuardar(true);
        const nome = lista.find(u => u.id === resp)?.name || resp;
        const ok = await executar(() => ServicoCasos.atribuir(caso, { responsavelId: resp, responsavelNome: nome, prioridade, prazo }, actor), 'Investigação actualizada');
        setAGuardar(false);
        if (ok) aoMudar();
    };
    return (
        <Seccao titulo="Responsável e prazo" icone={ScrollText}>
            <div className="space-y-2">
                <div className="space-y-1"><Label className="text-xs">Responsável</Label>
                    <Select value={resp} onValueChange={setResp}><SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{lista.map(u => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}</SelectContent></Select></div>
                <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1"><Label className="text-xs">Prioridade</Label>
                        <Select value={prioridade} onValueChange={v => setPrioridade(v as Prioridade)}><SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>{(Object.keys(ROTULO_PRIORIDADE) as Prioridade[]).map(p => <SelectItem key={p} value={p}>{ROTULO_PRIORIDADE[p]}</SelectItem>)}</SelectContent></Select></div>
                    <div className="space-y-1"><Label className="text-xs">Prazo</Label><Input type="date" value={prazo} onChange={e => setPrazo(e.target.value)} /></div>
                </div>
                <Button size="sm" variant="outline" disabled={aGuardar || !mudou} onClick={guardar}>Guardar</Button>
            </div>
        </Seccao>
    );
}

function Encerrar({ caso, falta, decisoes, actor, aoMudar }: { caso: Caso; falta: string[]; decisoes: DecisaoRegisto[]; actor: ActorCompliance; aoMudar: () => void }) {
    const [resumo, setResumo] = useState('');
    const [aGuardar, setAGuardar] = useState(false);
    const encerrar = async () => {
        setAGuardar(true);
        const ok = await executar(() => ServicoCasos.encerrar(caso, resumo, decisoes, actor), 'Investigação encerrada');
        setAGuardar(false);
        if (ok) aoMudar();
    };
    return (
        <Seccao titulo="Encerrar a investigação" icone={Lock} className="border-slate-300 dark:border-slate-700">
            {falta.length ? (
                <ul className="space-y-1 text-sm text-amber-800 dark:text-amber-300">{falta.map(f => <li key={f}>• {f}</li>)}</ul>
            ) : (
                <div className="space-y-2">
                    <Textarea rows={3} value={resumo} onChange={e => setResumo(e.target.value)} placeholder="Resumo final: o que se concluiu e o que foi feito" />
                    <Button disabled={aGuardar || resumo.trim().length < 20} onClick={encerrar}>Encerrar investigação</Button>
                    <p className="text-[11px] text-slate-500">Depois de encerrada, a investigação não se altera.</p>
                </div>
            )}
        </Seccao>
    );
}
