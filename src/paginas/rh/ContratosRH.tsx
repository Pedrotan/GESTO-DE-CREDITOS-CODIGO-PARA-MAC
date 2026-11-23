import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { MainLayout } from '@/componentes/layout/MainLayout';
import { Button } from '@/componentes/ui/button';
import { Input } from '@/componentes/ui/input';
import { Label } from '@/componentes/ui/label';
import { Switch } from '@/componentes/ui/switch';
import { Textarea } from '@/componentes/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/componentes/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/componentes/ui/dialog';
import { PdfCanvasViewer } from '@/componentes/ui/PdfCanvasViewer';
import { Edit, FilePlus2, FileSignature, Loader2, Plus, RefreshCw, Save, Search, Send, Stamp } from 'lucide-react';
import { ServicoContratosRH, type ContratoRH, type ModeloContrato } from '@/servicos/rh/ServicoContratosRH';
import type { Funcionario } from '@/servicos/rh/ServicoRH';
import { aplicarModelo } from '@/bibliotecas/rh/modelos-rh';
import { duracaoTexto, prazoContrato, VARIAVEIS_CONTRATO, type SituacaoContrato } from '@/bibliotecas/rh/contratos-rh';
import { dataPorExtenso } from '@/bibliotecas/rh/declaracoes';
import { gerarContratoTrabalhoPdf, type FicheiroPdf } from '@/bibliotecas/rh/pdf-rh';
import { valorNumerico } from '@/bibliotecas/rh/parametros-rh';
import { luandaTodayKey } from '@/bibliotecas/fuso-angola';
import { confirmar } from '@/bibliotecas/alerta';
import { cn } from '@/bibliotecas/utils';
import { useActorRH } from '@/ganchos/usar-modulo-rh';
import { useData } from '@/contextos/ContextoDados';
import { Indicador, NavegacaoRH, dataPt, executar, kz, useCarregar, Vazio } from '@/componentes/rh/comum-rh';
import { valoresModelo } from '@/componentes/rh/relatorios-pessoais';
import { arquivarPdf, descarregarPdf } from '@/componentes/rh/accoes-funcionario';
import { DialogoContrato } from '@/componentes/rh/DialogosFuncionario';
import { useBaseRH } from './FuncionariosRH';

const TODOS = '__todos__';
const ROTULO_TIPO: Record<string, string> = { indeterminado: 'Tempo indeterminado', determinado: 'Termo certo' };
const COR_SITUACAO: Record<SituacaoContrato, string> = {
    indeterminado: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200', por_iniciar: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
    em_vigor: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200', a_terminar: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
    expirado: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-200', terminado: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
};
const COR_BARRA: Record<SituacaoContrato, string> = { indeterminado: 'bg-sky-500', por_iniciar: 'bg-slate-300', em_vigor: 'bg-emerald-500', a_terminar: 'bg-amber-500', expirado: 'bg-red-500', terminado: 'bg-slate-400' };

export default function ContratosRH() {
    const { actor, gerir } = useActorRH();
    const { companySettings } = useData();
    const [url, setUrl] = useSearchParams();
    const base = useBaseRH();
    const hoje = luandaTodayKey();
    const dados = useCarregar(async () => ({ contratos: await ServicoContratosRH.contratos(), modelos: await ServicoContratosRH.modelos() }),
        { contratos: [] as ContratoRH[], modelos: [] as ModeloContrato[] });
    const { contratos, modelos } = dados.dados;
    const recarregar = () => { void dados.recarregar(); void base.recarregar(); };
    const aba = url.get('aba') === 'modelos' ? 'modelos' : 'contratos';
    const destacado = url.get('contrato');
    const [pesquisa, setPesquisa] = useState('');
    const [situacao, setSituacao] = useState<string>(TODOS);
    const [estado, setEstado] = useState<'activo' | 'terminado' | typeof TODOS>('activo');
    const [editar, setEditar] = useState<ContratoRH | null>(null);
    const [renovar, setRenovar] = useState<Funcionario | null>(null);
    const [novoPara, setNovoPara] = useState<boolean>(false);
    const [modelo, setModelo] = useState<Partial<ModeloContrato> | null>(null);
    const alertaDias = valorNumerico(base.dados.parametros, 'alerta_contrato_dias', hoje, 60);
    const funcionario = (id: string) => base.dados.funcionarios.find(f => f.id === id);

    const linhas = useMemo(() => contratos.map(c => ({ c, f: funcionario(c.funcionario_id), prazo: prazoContrato(c, hoje, alertaDias) }))
        .filter(l => l.f && (estado === TODOS || l.c.estado === estado) && (situacao === TODOS || l.prazo.situacao === situacao)
            && (!pesquisa.trim() || [l.f.nome, l.f.numero_mecanografico].some(v => v?.toLowerCase().includes(pesquisa.trim().toLowerCase()))))
        .sort((a, b) => (a.prazo.restantes ?? 99999) - (b.prazo.restantes ?? 99999)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [contratos, base.dados.funcionarios, estado, situacao, pesquisa, hoje, alertaDias]);
    const activos = contratos.filter(c => c.estado === 'activo').map(c => prazoContrato(c, hoje, alertaDias));
    useEffect(() => { if (destacado) document.getElementById(`contrato-${destacado}`)?.scrollIntoView({ block: 'center' }); }, [destacado, linhas.length]);

    return (
        <MainLayout title="Contratos" subtitle="Contratos de trabalho, prazos, alertas de fim e modelos de contrato">
            <NavegacaoRH />
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-extrabold">Contratos</h1>
                    <p className="text-sm text-slate-600 dark:text-slate-400">Escreva e emita o contrato de cada funcionário a partir de um modelo e acompanhe o prazo de cada um.</p>
                </div>
                {gerir && (
                    <div className="flex flex-wrap gap-2">
                        <Button variant="outline" onClick={() => { setUrl({ aba: 'modelos' }); setModelo({ tipo_contrato: 'todos', conteudo: '' }); }}><FilePlus2 className="mr-1.5 h-4 w-4" /> Novo modelo</Button>
                        <Button className="bg-rh-navy text-white hover:bg-rh-navy-2" onClick={() => setNovoPara(true)}><Plus className="mr-1.5 h-4 w-4" /> Novo contrato</Button>
                    </div>
                )}
            </div>

            <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
                <Indicador titulo="Contratos activos" valor={activos.length} />
                <Indicador titulo="Tempo indeterminado" valor={activos.filter(p => p.situacao === 'indeterminado').length} tom="sky" />
                <Indicador titulo="Termo certo" valor={activos.filter(p => p.totalDias !== null).length} tom="emerald" />
                <Indicador titulo={`A terminar (${alertaDias} dias)`} valor={activos.filter(p => p.situacao === 'a_terminar').length} tom="orange" />
                <Indicador titulo="Prazo ultrapassado" valor={activos.filter(p => p.situacao === 'expirado').length} nota="renove ou termine" tom="red" />
            </div>

            <div role="tablist" aria-label="Contratos" className="mb-3 flex gap-1.5">
                {([['contratos', 'Contratos'], ['modelos', `Modelos de contrato (${modelos.length})`]] as const).map(([id, rotulo]) => (
                    <button key={id} type="button" role="tab" aria-selected={aba === id} onClick={() => setUrl(id === 'contratos' ? {} : { aba: id })}
                        className={cn('rounded-full border px-3.5 py-1.5 text-sm font-bold', aba === id ? 'border-rh-navy bg-rh-navy text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300')}>{rotulo}</button>
                ))}
            </div>

            {aba === 'contratos' ? (
                <section className="rounded-xl border border-rh-border bg-white dark:border-slate-800 dark:bg-slate-900">
                    <div className="flex flex-wrap items-center gap-2.5 border-b border-rh-border p-4 dark:border-slate-800">
                        <label className="relative min-w-[240px] flex-1">
                            <span className="sr-only">Pesquisar</span>
                            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" aria-hidden="true" />
                            <Input className="h-10 pl-9" placeholder="Pesquisar por nome ou n.º" value={pesquisa} onChange={e => setPesquisa(e.target.value)} />
                        </label>
                        <Select value={situacao} onValueChange={setSituacao}>
                            <SelectTrigger className="h-10 w-52" aria-label="Situação"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value={TODOS}>Todas as situações</SelectItem><SelectItem value="a_terminar">A terminar</SelectItem><SelectItem value="expirado">Prazo ultrapassado</SelectItem>
                                <SelectItem value="em_vigor">Em vigor (termo certo)</SelectItem><SelectItem value="indeterminado">Indeterminados</SelectItem><SelectItem value="por_iniciar">Por iniciar</SelectItem>
                            </SelectContent>
                        </Select>
                        <Select value={estado} onValueChange={v => setEstado(v as typeof estado)}>
                            <SelectTrigger className="h-10 w-40" aria-label="Estado"><SelectValue /></SelectTrigger>
                            <SelectContent><SelectItem value="activo">Activos</SelectItem><SelectItem value="terminado">Terminados</SelectItem><SelectItem value={TODOS}>Todos</SelectItem></SelectContent>
                        </Select>
                    </div>
                    {linhas.length === 0 ? <div className="p-6"><Vazio>{contratos.length ? 'Nenhum contrato corresponde aos filtros.' : 'Ainda não há contratos registados.'}</Vazio></div> : (
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[1150px] text-sm">
                                <thead className="border-b border-rh-border bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
                                    <tr><th className="w-px whitespace-nowrap py-3 pl-4 pr-3">N.º</th><th className="px-3 py-3">Funcionário</th><th className="px-3 py-3">Tipo</th><th className="px-3 py-3">Início</th><th className="px-3 py-3">Fim</th>
                                        <th className="px-3 py-3">Duração</th><th className="min-w-[190px] px-3 py-3">Prazo</th><th className="px-3 py-3">Texto</th><th className="px-4 py-3 text-right">Acções</th></tr>
                                </thead>
                                <tbody>{linhas.map(({ c, f, prazo }) => (
                                    <tr key={c.id} id={`contrato-${c.id}`} className={cn('border-b border-slate-100 dark:border-slate-800', c.id === destacado ? 'bg-amber-50 dark:bg-amber-950/30' : 'hover:bg-slate-50 dark:hover:bg-slate-800/40')}>
                                        <td className="w-px whitespace-nowrap py-3 pl-4 pr-3"><span className="rounded-md border border-indigo-200 bg-indigo-50 px-2 py-0.5 font-mono text-xs font-bold tracking-wider text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950 dark:text-indigo-200">{f!.numero_mecanografico}</span></td>
                                        <td className="px-3 py-3"><div className="font-semibold">{f!.nome}</div><div className="text-xs text-slate-500">{base.dados.cargos.find(x => x.id === f!.cargo_id)?.nome || '—'}{gerir ? ` · ${kz(c.salario_base_minor)}` : ''}</div></td>
                                        <td className="px-3 py-3">{ROTULO_TIPO[c.tipo] || c.tipo}</td>
                                        <td className="px-3 py-3 tabular-nums">{dataPt(c.inicio)}</td>
                                        <td className="px-3 py-3 tabular-nums">{c.tipo === 'indeterminado' || !c.fim ? <span className="font-semibold text-sky-700 dark:text-sky-300">Indeterminado</span> : dataPt(c.fim)}</td>
                                        <td className="px-3 py-3">{prazo.duracao}</td>
                                        <td className="px-3 py-3">
                                            <span className={cn('inline-block rounded-full px-2 py-0.5 text-[11px] font-bold', COR_SITUACAO[prazo.situacao])}>{prazo.rotulo}</span>
                                            {prazo.pct !== null && (
                                                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800" role="progressbar" aria-valuenow={prazo.pct} aria-valuemin={0} aria-valuemax={100} aria-label="Tempo decorrido do contrato">
                                                    <div className={cn('h-full rounded-full', COR_BARRA[prazo.situacao])} style={{ width: `${prazo.pct}%` }} />
                                                </div>
                                            )}
                                            {prazo.totalDias !== null && <div className="mt-1 text-[11px] text-slate-500">{Math.min(prazo.decorridos, prazo.totalDias)} de {prazo.totalDias} dias</div>}
                                        </td>
                                        <td className="px-3 py-3 text-xs">{c.texto ? <span className="font-semibold text-emerald-700 dark:text-emerald-300">Escrito{c.texto_actualizado_em ? ` · ${dataPt(c.texto_actualizado_em)}` : ''}</span> : <span className="text-slate-400">Por escrever</span>}</td>
                                        <td className="px-4 py-3">
                                            <div className="flex justify-end gap-1">
                                                <Button size="sm" variant="outline" className="h-8" onClick={() => setEditar(c)}><FileSignature className="mr-1.5 h-4 w-4" /> {c.texto ? 'Ver / editar' : 'Escrever'}</Button>
                                                {gerir && c.estado === 'activo' && <Button size="icon" variant="outline" className="h-8 w-8" title="Renovar / novo contrato" aria-label={`Renovar contrato de ${f!.nome}`} onClick={() => setRenovar(f!)}><RefreshCw className="h-4 w-4" /></Button>}
                                            </div>
                                        </td>
                                    </tr>
                                ))}</tbody>
                            </table>
                        </div>
                    )}
                    <p className="border-t border-rh-border px-4 py-3 text-xs text-slate-500 dark:border-slate-800">
                        O prazo conta-se automaticamente entre o início e o fim de cada contrato a termo. O Centro de Alertas avisa o RH 60, 30 e 7 dias antes do fim e quando o prazo passa sem renovação.
                    </p>
                </section>
            ) : (
                <ListaModelos modelos={modelos} gerir={gerir} onEditar={setModelo} />
            )}

            {editar && actor && <EditorContrato contrato={editar} f={funcionario(editar.funcionario_id)!} modelos={modelos} gerir={gerir} base={base.dados} settings={companySettings}
                actor={actor} onClose={() => setEditar(null)} onSaved={recarregar} />}
            {modelo && actor && <EditorModelo modelo={modelo} actor={actor} settings={companySettings} onClose={() => setModelo(null)} onSaved={recarregar} />}
            {renovar && actor && <DialogoContrato funcionarioId={renovar.id} actual={contratos.find(c => c.funcionario_id === renovar.id && c.estado === 'activo')} actor={actor}
                onClose={() => setRenovar(null)} onSaved={recarregar} />}
            {novoPara && <EscolherFuncionario funcionarios={base.dados.funcionarios.filter(f => f.estado !== 'cessado')} onClose={() => setNovoPara(false)} onEscolher={f => { setNovoPara(false); setRenovar(f); }} />}
        </MainLayout>
    );
}

function EscolherFuncionario({ funcionarios, onClose, onEscolher }: { funcionarios: Funcionario[]; onClose: () => void; onEscolher: (f: Funcionario) => void }) {
    const [id, setId] = useState('');
    return (
        <Dialog open onOpenChange={v => !v && onClose()}>
            <DialogContent className="max-w-md">
                <DialogHeader><DialogTitle>Novo contrato</DialogTitle><DialogDescription>Escolha o funcionário. Se já tiver contrato activo, esse termina e fica no histórico.</DialogDescription></DialogHeader>
                <Label htmlFor="novo-contrato-f" className="text-xs font-bold">Funcionário</Label>
                <Select value={id} onValueChange={setId}>
                    <SelectTrigger id="novo-contrato-f"><SelectValue placeholder="Escolha" /></SelectTrigger>
                    <SelectContent>{funcionarios.map(f => <SelectItem key={f.id} value={f.id}>{f.nome} ({f.numero_mecanografico})</SelectItem>)}</SelectContent>
                </Select>
                <DialogFooter><Button variant="outline" onClick={onClose}>Cancelar</Button><Button disabled={!id} onClick={() => onEscolher(funcionarios.find(f => f.id === id)!)}>Continuar</Button></DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

type BaseDados = ReturnType<typeof useBaseRH>['dados'];

/** Valores das variáveis para um contrato concreto (o do funcionário, não necessariamente o activo). */
function valoresContrato(f: Funcionario, c: ContratoRH, base: BaseDados, settings: unknown, representante: string, cargoRepresentante: string) {
    const empresa = (settings || {}) as { location?: string; address?: string };
    return {
        ...valoresModelo(f, { cargos: base.cargos, departamentos: base.departamentos, contratos: base.contratos }, settings),
        tipo_contrato: c.tipo === 'indeterminado' ? 'por tempo indeterminado' : `a termo certo até ${dataPt(c.fim)}`,
        salario_base: kz(c.salario_base_minor),
        data_nascimento: f.data_nascimento ? dataPt(f.data_nascimento) : null, estado_civil: f.estado_civil?.toLowerCase(),
        morada: [f.morada, f.municipio, f.provincia].filter(Boolean).join(', ') || null,
        data_inicio: dataPt(c.inicio), data_fim: c.fim ? dataPt(c.fim) : null, duracao: c.fim ? duracaoTexto(c.inicio, c.fim) : 'tempo indeterminado',
        periodo_experimental: c.periodo_experiencia_fim ? dataPt(c.periodo_experiencia_fim) : null,
        horas_semanais: String(c.horas_semanais), dias_ferias: String(c.dias_ferias),
        local_trabalho: (empresa.location || empresa.address || '').split(/[,-]/u)[0].trim() || null,
        representante: representante.trim() || null, cargo_representante: cargoRepresentante.trim() || null,
    };
}

/** Janela para escrever o contrato: modelo, texto editável e pré-visualização ao vivo; guardar ou emitir numerado. */
function EditorContrato({ contrato, f, modelos, gerir, base, settings, actor, onClose, onSaved }: {
    contrato: ContratoRH; f: Funcionario; modelos: ModeloContrato[]; gerir: boolean; base: BaseDados; settings: unknown;
    actor: NonNullable<ReturnType<typeof useActorRH>['actor']>; onClose: () => void; onSaved: () => void;
}) {
    const disponiveis = modelos.filter(m => m.activo !== 0 && (m.tipo_contrato === 'todos' || m.tipo_contrato === contrato.tipo));
    const inicial = modelos.find(m => m.id === contrato.modelo_id) || disponiveis[0];
    const [modeloId, setModeloId] = useState(inicial?.id || '');
    const [representante, setRepresentante] = useState('');
    const [cargoRep, setCargoRep] = useState('');
    const gerar = (m = modelos.find(x => x.id === modeloId), rep = representante, cargo = cargoRep) => (m ? aplicarModelo(m.conteudo, valoresContrato(f, contrato, base, settings, rep, cargo)) : '');
    const [titulo, setTitulo] = useState(contrato.titulo || inicial?.titulo || 'CONTRATO DE TRABALHO');
    const [texto, setTexto] = useState(contrato.texto || gerar(inicial));
    const [editado, setEditado] = useState(Boolean(contrato.texto));
    const [pdf, setPdf] = useState<string | null>(null);
    const [aGuardar, setAGuardar] = useState(false);
    const config = (settings || {}) as { location?: string; address?: string };
    const local = (config.location || config.address || '').split(/[,-]/u)[0].trim() || 'Luanda';
    const dadosPdf = (referencia: string | null, minuta: boolean) => ({
        titulo, referencia, texto, local, dataExtenso: dataPorExtenso(luandaTodayKey()), minuta,
        empregador: { representante, cargo: cargoRep }, trabalhador: { nome: f.nome, bi: f.bi_numero },
    });
    const primeira = useRef(true);
    useEffect(() => {
        const t = setTimeout(() => {
            try { setPdf(gerarContratoTrabalhoPdf(dadosPdf(null, true), settings, actor.name, 'datauri').dataUrl); } catch { /* texto a meio da edição */ }
        }, primeira.current ? 0 : 400);
        primeira.current = false;
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [titulo, texto, representante, cargoRep]);
    const mudarModelo = async (id: string) => {
        if (editado && !await confirmar('Substituir o texto escrito pelo texto do modelo escolhido?', { titulo: 'Trocar de modelo', confirmar: 'Sim, substituir' })) return;
        const m = modelos.find(x => x.id === id);
        setModeloId(id); setTitulo(m?.titulo || titulo); setTexto(gerar(m)); setEditado(false);
    };
    // Sem edições à mão, o representante entra logo no texto.
    useEffect(() => { if (!editado) setTexto(gerar()); // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [representante, cargoRep]);
    const guardar = async () => {
        setAGuardar(true);
        const ok = await executar(() => ServicoContratosRH.guardarTexto(contrato, { modelo_id: modeloId || null, titulo, texto }, actor), 'Texto do contrato guardado');
        setAGuardar(false);
        if (ok) onSaved();
    };
    const emitir = async () => {
        if (!await confirmar(`Emitir o contrato numerado de ${f.nome}? O PDF fica na pasta pessoal (Contratos) e é descarregado.`, { titulo: 'Emitir contrato', confirmar: 'Emitir' })) return;
        setAGuardar(true);
        let ficheiro: FicheiroPdf | null = null;
        const ok = await executar(async () => {
            const emitido = await ServicoContratosRH.emitir(contrato, { modelo_id: modeloId || null, titulo, texto }, actor);
            ficheiro = gerarContratoTrabalhoPdf(dadosPdf(emitido.numero, false), settings, actor.name, 'datauri');
            await arquivarPdf(f.id, 'contratos', `Contrato de trabalho ${emitido.numero}`, ficheiro, 'contrato', actor);
        }, 'Contrato emitido e arquivado na pasta pessoal');
        setAGuardar(false);
        if (ok && ficheiro) { descarregarPdf(ficheiro); onSaved(); onClose(); }
    };
    return (
        <Dialog open onOpenChange={v => !v && onClose()}>
            <DialogContent className="flex h-[94vh] max-w-7xl flex-col gap-3">
                <DialogHeader><DialogTitle>Contrato de {f.nome}</DialogTitle>
                    <DialogDescription>{ROTULO_TIPO[contrato.tipo]} · início {dataPt(contrato.inicio)} · {contrato.fim ? `fim ${dataPt(contrato.fim)} (${duracaoTexto(contrato.inicio, contrato.fim)})` : 'sem data de fim'} · {kz(contrato.salario_base_minor)}</DialogDescription></DialogHeader>
                <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                    <div className="flex min-h-0 flex-col gap-2.5 overflow-y-auto pr-1">
                        <div className="grid gap-2.5 sm:grid-cols-2">
                            <div className="sm:col-span-2"><Label htmlFor="ct-modelo" className="text-xs font-bold">Modelo</Label>
                                <Select value={modeloId} onValueChange={v => void mudarModelo(v)} disabled={!gerir}>
                                    <SelectTrigger id="ct-modelo" className="mt-1"><SelectValue placeholder="Escolha o modelo" /></SelectTrigger>
                                    <SelectContent>{disponiveis.map(m => <SelectItem key={m.id} value={m.id}>{m.nome}</SelectItem>)}</SelectContent>
                                </Select>
                            </div>
                            <div className="sm:col-span-2"><Label htmlFor="ct-titulo" className="text-xs font-bold">Título</Label><Input id="ct-titulo" className="mt-1" value={titulo} disabled={!gerir} onChange={e => setTitulo(e.target.value)} /></div>
                            <div><Label htmlFor="ct-rep" className="text-xs font-bold">Representante da empresa</Label><Input id="ct-rep" className="mt-1" value={representante} disabled={!gerir} onChange={e => setRepresentante(e.target.value)} placeholder="Nome de quem assina" /></div>
                            <div><Label htmlFor="ct-cargo" className="text-xs font-bold">Cargo do representante</Label><Input id="ct-cargo" className="mt-1" value={cargoRep} disabled={!gerir} onChange={e => setCargoRep(e.target.value)} placeholder="Ex.: Gerente" /></div>
                        </div>
                        <Label htmlFor="ct-texto" className="text-xs font-bold">Texto do contrato</Label>
                        <Textarea id="ct-texto" className="min-h-[320px] flex-1 font-serif text-sm leading-relaxed" value={texto} disabled={!gerir} onChange={e => { setTexto(e.target.value); setEditado(true); }} />
                        <p className="text-xs text-slate-500">Separe as cláusulas com uma linha em branco. A primeira linha que começa por «CLÁUSULA» sai a negrito. Os «—» no texto são dados que faltam na ficha do funcionário.</p>
                        {gerir && editado && <Button variant="ghost" size="sm" className="self-start" onClick={() => { setTexto(gerar()); setEditado(false); }}>Repor o texto do modelo</Button>}
                    </div>
                    <div className="min-h-[300px] overflow-hidden rounded-xl border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-950">
                        {pdf ? <PdfCanvasViewer source={pdf} className="h-full" /> : <div className="flex h-full items-center justify-center text-sm text-slate-500"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> A preparar a pré-visualização…</div>}
                    </div>
                </div>
                <DialogFooter className="gap-2">
                    <Button variant="outline" onClick={onClose}>Fechar</Button>
                    {gerir && <Button variant="outline" disabled={aGuardar} onClick={() => void guardar()}><Save className="mr-1.5 h-4 w-4" /> Guardar texto</Button>}
                    {gerir && <Button className="bg-rh-navy text-white hover:bg-rh-navy-2" disabled={aGuardar || !texto.trim()} onClick={() => void emitir()}><Stamp className="mr-1.5 h-4 w-4" /> Emitir contrato numerado</Button>}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function ListaModelos({ modelos, gerir, onEditar }: { modelos: ModeloContrato[]; gerir: boolean; onEditar: (m: ModeloContrato) => void }) {
    if (!modelos.length) return <Vazio>Ainda não há modelos de contrato.</Vazio>;
    return (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {modelos.map(m => (
                <article key={m.id} className={cn('flex flex-col rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900', m.activo === 0 && 'opacity-60')}>
                    <div className="flex items-start justify-between gap-2">
                        <div>
                            <h3 className="font-extrabold">{m.nome}</h3>
                            <p className="text-xs text-slate-500">{m.tipo_contrato === 'todos' ? 'Qualquer contrato' : ROTULO_TIPO[m.tipo_contrato]}{m.sistema ? ' · modelo inicial' : ''}{m.activo === 0 ? ' · desactivado' : ''}</p>
                        </div>
                        {gerir && <Button size="icon" variant="ghost" aria-label={`Editar ${m.nome}`} onClick={() => onEditar(m)}><Edit className="h-4 w-4" /></Button>}
                    </div>
                    <p className="mt-2 line-clamp-5 whitespace-pre-line text-xs text-slate-600 dark:text-slate-400">{m.conteudo}</p>
                </article>
            ))}
        </div>
    );
}

/** Editor do modelo: texto com variáveis (clique para inserir) e exemplo preenchido ao lado. */
function EditorModelo({ modelo, actor, settings, onClose, onSaved }: { modelo: Partial<ModeloContrato>; actor: NonNullable<ReturnType<typeof useActorRH>['actor']>; settings: unknown; onClose: () => void; onSaved: () => void }) {
    const [m, setM] = useState<Partial<ModeloContrato>>(modelo);
    const area = useRef<HTMLTextAreaElement>(null);
    const [pdf, setPdf] = useState<string | null>(null);
    // Exemplo: dados de amostra do trabalhador e os dados reais da empresa configurada.
    const exemplo = useMemo(() => {
        const empresa = (settings || {}) as { name?: string; nif?: string; address?: string; location?: string };
        return { ...Object.fromEntries(VARIAVEIS_CONTRATO.map(v => [v.chave, v.exemplo])),
            ...(empresa.name ? { empresa: empresa.name } : {}), ...(empresa.nif ? { nif_empresa: empresa.nif } : {}),
            ...(empresa.address || empresa.location ? { morada_empresa: empresa.address || empresa.location } : {}) } as Record<string, string>;
    }, [settings]);
    useEffect(() => {
        const t = setTimeout(() => {
            try {
                setPdf(gerarContratoTrabalhoPdf({ titulo: m.titulo || m.nome || 'Contrato de trabalho', texto: aplicarModelo(m.conteudo || '', exemplo), local: 'Luanda', dataExtenso: dataPorExtenso(luandaTodayKey()),
                    minuta: true, empregador: { representante: exemplo.representante, cargo: exemplo.cargo_representante }, trabalhador: { nome: exemplo.nome, bi: exemplo.bi } }, settings, actor.name, 'datauri').dataUrl);
            } catch { /* texto a meio da edição */ }
        }, 400);
        return () => clearTimeout(t);
    }, [m.conteudo, m.titulo, m.nome, exemplo, settings, actor.name]);
    const inserir = (chave: string) => {
        const el = area.current;
        const valor = m.conteudo || '';
        const pos = el ? el.selectionStart : valor.length;
        const novo = `${valor.slice(0, pos)}{{${chave}}}${valor.slice(el ? el.selectionEnd : pos)}`;
        setM(x => ({ ...x, conteudo: novo }));
        requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(pos + chave.length + 4, pos + chave.length + 4); });
    };
    return (
        <Dialog open onOpenChange={v => !v && onClose()}>
            <DialogContent className="flex h-[94vh] max-w-7xl flex-col gap-3">
                <DialogHeader><DialogTitle>{m.id ? `Modelo: ${m.nome}` : 'Novo modelo de contrato'}</DialogTitle>
                    <DialogDescription>Escreva o texto com as variáveis entre chavetas; ao escrever o contrato, são trocadas pelos dados do funcionário, do contrato e da empresa.</DialogDescription></DialogHeader>
                <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                    <div className="flex min-h-0 flex-col gap-2.5 overflow-y-auto pr-1">
                        <div className="grid gap-2.5 sm:grid-cols-2">
                            <div><Label htmlFor="md-nome" className="text-xs font-bold">Nome</Label><Input id="md-nome" className="mt-1" value={m.nome || ''} onChange={e => setM(x => ({ ...x, nome: e.target.value }))} /></div>
                            <div><Label htmlFor="md-tipo" className="text-xs font-bold">Para contratos</Label>
                                <Select value={m.tipo_contrato || 'todos'} onValueChange={v => setM(x => ({ ...x, tipo_contrato: v as ModeloContrato['tipo_contrato'] }))}>
                                    <SelectTrigger id="md-tipo" className="mt-1"><SelectValue /></SelectTrigger>
                                    <SelectContent><SelectItem value="todos">Qualquer tipo</SelectItem><SelectItem value="indeterminado">Tempo indeterminado</SelectItem><SelectItem value="determinado">Termo certo</SelectItem></SelectContent>
                                </Select>
                            </div>
                            <div className="sm:col-span-2"><Label htmlFor="md-titulo" className="text-xs font-bold">Título</Label><Input id="md-titulo" className="mt-1" value={m.titulo || ''} onChange={e => setM(x => ({ ...x, titulo: e.target.value }))} placeholder="CONTRATO DE TRABALHO…" /></div>
                        </div>
                        <div>
                            <p className="text-xs font-bold">Variáveis (clique para inserir)</p>
                            <div className="mt-1 flex flex-wrap gap-1">{VARIAVEIS_CONTRATO.map(v => (
                                <button key={v.chave} type="button" title={`${v.descricao} (ex.: ${v.exemplo})`} onClick={() => inserir(v.chave)}
                                    className="rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-[11px] text-slate-700 hover:border-indigo-300 hover:bg-indigo-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">{`{{${v.chave}}}`}</button>
                            ))}</div>
                        </div>
                        <Label htmlFor="md-texto" className="text-xs font-bold">Texto do modelo</Label>
                        <Textarea id="md-texto" ref={area} className="min-h-[300px] flex-1 font-mono text-xs leading-relaxed" value={m.conteudo || ''} onChange={e => setM(x => ({ ...x, conteudo: e.target.value }))} />
                        <p className="text-xs text-slate-500">{'Blocos opcionais: {{#periodo_experimental}}…{{/periodo_experimental}} só aparecem quando há valor.'}</p>
                        {m.id && <label className="flex items-center gap-2 text-xs font-bold"><Switch checked={m.activo !== 0} onCheckedChange={v => setM(x => ({ ...x, activo: v ? 1 : 0 }))} /> Activo</label>}
                    </div>
                    <div className="min-h-[300px] overflow-hidden rounded-xl border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-950">
                        {pdf ? <PdfCanvasViewer source={pdf} className="h-full" /> : <div className="flex h-full items-center justify-center text-sm text-slate-500">Escreva o texto para ver o exemplo.</div>}
                    </div>
                </div>
                <DialogFooter><Button variant="outline" onClick={onClose}>Cancelar</Button>
                    <Button onClick={() => void executar(() => ServicoContratosRH.guardarModelo(m, actor), 'Modelo guardado').then(ok => { if (ok) { onSaved(); onClose(); } })}><Send className="mr-1.5 h-4 w-4" /> Guardar modelo</Button></DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
