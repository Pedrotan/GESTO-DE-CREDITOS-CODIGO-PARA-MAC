import { useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { MainLayout } from '@/componentes/layout/MainLayout';
import { Button } from '@/componentes/ui/button';
import { Input } from '@/componentes/ui/input';
import { Label } from '@/componentes/ui/label';
import { Textarea } from '@/componentes/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/componentes/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/componentes/ui/dialog';
import { AlertTriangle, CheckCircle2, FileUp, ListChecks, Loader2, Plus, Radar, ShieldAlert } from 'lucide-react';
import { Indicador, Vazio, dataPt, executar } from '@/componentes/rh/comum-rh';
import { NavegacaoCompliance, SeloScreening, dataHoraPt, useActorCompliance, useCompliance, type LinhaCompliance } from '@/componentes/compliance/comum-compliance';
import { FONTES_OFICIAIS } from '@/bibliotecas/compliance/listas-xml';
import { ROTULO_FONTE_LISTA, ROTULO_PAPEL, type CategoriaInterna, type EstadoScreening } from '@/bibliotecas/compliance/screening';
import type { ClienteKyc } from '@/bibliotecas/compliance/kyc';
import { ROTULO_CATEGORIA, ServicoScreening, type EntradaInterna, type VersaoLista } from '@/servicos/compliance/ServicoScreening';
import { cn } from '@/bibliotecas/utils';
import { toast } from '@/ganchos/usar-toast';

const mensagemErro = (e: unknown) => (e instanceof Error ? e.message : String(e));

function Seccao({ titulo, descricao, accao, icone: Icone, children }: { titulo: string; descricao?: string; accao?: ReactNode; icone: typeof Radar; children: ReactNode }) {
    return (
        <section className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 dark:border-slate-800">
                <div className="flex min-w-0 items-center gap-2.5">
                    <Icone className="h-4 w-4 shrink-0 text-emerald-700 dark:text-emerald-400" aria-hidden />
                    <div className="min-w-0"><h2 className="text-base font-bold">{titulo}</h2>{descricao && <p className="text-[13px] text-slate-500 dark:text-slate-400">{descricao}</p>}</div>
                </div>
                {accao}
            </div>
            <div className="p-5">{children}</div>
        </section>
    );
}

const PRECISAM: EstadoScreening[] = ['nao_verificado', 'desactualizado', 'erro'];

export default function ScreeningCompliance() {
    const comp = useCompliance();
    const { actor, registar, configurar } = useActorCompliance();
    const scr = comp.dados.scr;
    const [interna, setInterna] = useState<Partial<EntradaInterna> | null>(null);
    const [progresso, setProgresso] = useState<{ feitos: number; total: number } | null>(null);
    const [verInactivas, setVerInactivas] = useState(false);

    const contagem = useMemo(() => {
        const c: Record<EstadoScreening, number> = { sem_correspondencia: 0, possivel: 0, confirmada: 0, erro: 0, nao_verificado: 0, desactualizado: 0 };
        for (const l of comp.linhas) c[l.screening.estado] += 1;
        return c;
    }, [comp.linhas]);
    const pendentes = comp.linhas.filter(l => l.screening.pendentes.length > 0);
    const aRastrear = comp.linhas.filter(l => PRECISAM.includes(l.screening.estado));
    const nenhumaLista = !scr.versoes.some(v => v.activa === 1) && !scr.interna.some(e => e.activa === 1);

    const rastrear = async (linhas: LinhaCompliance[]) => {
        if (!actor || !linhas.length) return;
        setProgresso({ feitos: 0, total: linhas.length });
        try {
            const r = await ServicoScreening.executarLote(linhas.map(l => ({ cliente: l.cliente as unknown as ClienteKyc, beneficiarios: l.perfil?.beneficiario_efectivo })),
                scr, contagem.desactualizado ? 'lista_actualizada' : 'manual', actor, (feitos, total) => setProgresso({ feitos, total }));
            toast({ title: `Screening concluído: ${linhas.length} cliente(s)`, description: [
                r.POTENTIAL_MATCH ? `${r.POTENTIAL_MATCH} com possíveis correspondências para decidir` : 'Nenhuma possível correspondência',
                r.ERROR ? `${r.ERROR} com erro (lista indisponível neste computador)` : '', r.NOT_CHECKED ? `${r.NOT_CHECKED} com listas por importar` : '',
            ].filter(Boolean).join(' · ') });
        } catch (e) { toast({ variant: 'destructive', title: 'Não foi possível concluir o screening', description: mensagemErro(e) }); }
        setProgresso(null);
        void comp.recarregar();
    };

    return (
        <MainLayout title="Compliance" subtitle="Screening de PEP e listas de sanções">
            <NavegacaoCompliance />
            <div className="mb-4">
                <h1 className="text-2xl font-extrabold">Screening de PEP e sanções</h1>
                <p className="max-w-3xl text-sm text-slate-600 dark:text-slate-400">
                    Os nomes dos clientes (e, nas empresas, do representante e dos beneficiários efectivos) são comparados com as listas oficiais importadas e
                    com a lista interna. Uma semelhança de nomes é sempre «possível correspondência» até um responsável decidir; uma lista em falta ou com erro
                    nunca conta como «sem correspondência».
                </p>
            </div>

            <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Indicador titulo="Por decidir" valor={contagem.possivel} nota="Clientes com possíveis correspondências" tom={contagem.possivel ? 'orange' : 'slate'} />
                <Indicador titulo="Sanções confirmadas" valor={contagem.confirmada} nota="Bloqueio e medidas restritivas" tom={contagem.confirmada ? 'red' : 'slate'} />
                <Indicador titulo="Por fazer ou desactualizado" valor={contagem.nao_verificado + contagem.desactualizado} nota={`${contagem.erro} com erro`} tom={contagem.nao_verificado + contagem.desactualizado + contagem.erro ? 'orange' : 'slate'} />
                <Indicador titulo="Sem correspondências" valor={contagem.sem_correspondencia} nota={`de ${comp.linhas.length} clientes`} tom="emerald" />
            </div>

            <div className="grid gap-5 xl:grid-cols-2">
                <div className="space-y-5">
                    <Seccao titulo="Listas oficiais" icone={ListChecks} descricao="Descarregue o ficheiro XML no site oficial e importe-o aqui. Cada computador importa o seu.">
                        <div className="space-y-3">
                            {(['ONU', 'OFAC'] as const).map(fonte => (
                                <CartaoLista key={fonte} fonte={fonte} versoes={scr.versoes.filter(v => v.fonte === fonte)} disponivel={v => ServicoScreening.disponivelAqui(scr, v)}
                                    podeImportar={registar} podeNova={configurar} aoImportar={async (conteudo, nome) => {
                                        if (!actor) return;
                                        try {
                                            const r = await ServicoScreening.importarLista(conteudo, nome, scr, actor);
                                            toast({ title: r.nova ? `Lista ${fonte} de ${dataPt(r.dataLista)} importada e activada` : `Lista ${fonte} carregada neste computador`,
                                                description: `${r.total.toLocaleString('pt-PT')} entradas.${r.nova ? ' Os screenings anteriores ficam desactualizados: execute o screening de novo.' : ' É a mesma versão já activa (mesma impressão digital).'}` });
                                        } catch (e) { toast({ variant: 'destructive', title: 'Não foi possível importar a lista', description: mensagemErro(e) }); }
                                        void comp.recarregar();
                                    }} />
                            ))}
                        </div>
                        <p className="mt-3 text-xs text-slate-500">
                            A lista da ONU é a de aplicação obrigatória em Angola (medidas restritivas do Conselho de Segurança). A da OFAC é opcional e útil para
                            relações com bancos correspondentes. As designações nacionais e os PEP registam-se na lista interna.
                        </p>
                    </Seccao>

                    <Seccao titulo="Executar screening" icone={Radar} descricao="Compara todos os clientes com as listas activas (em lotes de 200).">
                        {nenhumaLista ? <Vazio>Importe pelo menos uma lista oficial ou registe entradas na lista interna.</Vazio> : (
                            <div className="space-y-3">
                                <div className="flex flex-wrap gap-2">
                                    {(Object.keys(contagem) as EstadoScreening[]).filter(e => contagem[e]).map(e => (
                                        <span key={e} className="inline-flex items-center gap-1.5"><SeloScreening estado={e} /><span className="text-xs font-bold">{contagem[e]}</span></span>
                                    ))}
                                </div>
                                {progresso ? (
                                    <div>
                                        <div className="mb-1 flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" /> {progresso.feitos} de {progresso.total} clientes…</div>
                                        <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"><div className="h-full bg-emerald-600 transition-all" style={{ width: `${Math.round((progresso.feitos / progresso.total) * 100)}%` }} /></div>
                                    </div>
                                ) : registar && (
                                    <div className="flex flex-wrap gap-2">
                                        <Button onClick={() => rastrear(aRastrear)} disabled={!aRastrear.length}>Rastrear os que precisam ({aRastrear.length})</Button>
                                        <Button variant="outline" onClick={() => rastrear(comp.linhas)} disabled={!comp.linhas.length}>Rastrear todos ({comp.linhas.length})</Button>
                                    </div>
                                )}
                            </div>
                        )}
                    </Seccao>
                </div>

                <div className="space-y-5">
                    <Seccao titulo="Correspondências por decidir" icone={ShieldAlert} descricao="Cada possível correspondência é decidida na ficha do cliente, com fundamento.">
                        {!pendentes.length ? <p className="flex items-center gap-1.5 text-sm text-emerald-700 dark:text-emerald-400"><CheckCircle2 className="h-4 w-4" /> Nenhuma correspondência por decidir.</p> : (
                            <ul className="space-y-2">
                                {pendentes.map(l => (
                                    <li key={l.cliente.id} className="rounded-xl border border-amber-200 bg-amber-50/50 p-3 dark:border-amber-900 dark:bg-amber-950/20">
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                            <Link to={`/compliance/clientes/${l.cliente.id}#screening`} className="font-semibold hover:underline">{l.cliente.name}</Link>
                                            <span className="text-xs text-slate-500">{l.screening.pendentes.length} correspondência(s)</span>
                                        </div>
                                        <ul className="mt-1 space-y-0.5 text-xs text-slate-700 dark:text-slate-300">
                                            {l.screening.pendentes.slice(0, 3).map(p => (
                                                <li key={`${p.fonte}:${p.ref}:${p.pessoa.nome}`}>
                                                    {ROTULO_PAPEL[p.pessoa.papel]} «{p.pessoa.nome}» ↔ <strong>{p.nomeLista}</strong> · {ROTULO_FONTE_LISTA[p.fonte]} · {p.pontuacao}%
                                                </li>
                                            ))}
                                        </ul>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </Seccao>

                    <Seccao titulo="Lista interna" icone={AlertTriangle} descricao="PEP nacionais e designações registadas pela empresa, com a fonte oficial."
                        accao={registar && <Button size="sm" onClick={() => setInterna({ categoria: 'pep', tipo: 'pessoa' })}><Plus className="mr-1 h-4 w-4" />Acrescentar</Button>}>
                        {!scr.interna.length ? <Vazio>Sem entradas. Registe aqui, por exemplo, titulares de cargos públicos nomeados em Diário da República.</Vazio> : (
                            <>
                                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                                    {scr.interna.filter(e => verInactivas || e.activa === 1).map(e => (
                                        <li key={e.id} className={cn('flex flex-wrap items-center justify-between gap-2 py-2.5', e.activa !== 1 && 'opacity-50')}>
                                            <div className="min-w-0">
                                                <div className="text-sm font-semibold">{e.nome}{e.activa !== 1 && ' (desactivada)'}</div>
                                                <div className="text-xs text-slate-500">{ROTULO_CATEGORIA[e.categoria]}{e.funcao ? ` · ${e.funcao}` : ''} · {e.fonte_referencia}</div>
                                            </div>
                                            {registar && <Button size="sm" variant="ghost" onClick={() => setInterna(e)}>Editar</Button>}
                                        </li>
                                    ))}
                                </ul>
                                {scr.interna.some(e => e.activa !== 1) && <button type="button" className="mt-2 text-xs font-semibold text-slate-500 underline" onClick={() => setVerInactivas(v => !v)}>{verInactivas ? 'Esconder' : 'Mostrar'} desactivadas</button>}
                            </>
                        )}
                    </Seccao>
                </div>
            </div>

            {interna && actor && <DialogoInterna entrada={interna} onClose={() => setInterna(null)}
                onSave={e => ServicoScreening.guardarInterna(e, actor)} aoGuardar={() => void comp.recarregar()} />}
        </MainLayout>
    );
}

function CartaoLista({ fonte, versoes, disponivel, podeImportar, podeNova, aoImportar }: {
    fonte: 'ONU' | 'OFAC'; versoes: VersaoLista[]; disponivel: (v: VersaoLista) => boolean; podeImportar: boolean; podeNova: boolean;
    aoImportar: (conteudo: string, nome: string) => Promise<void>;
}) {
    const ficheiro = useRef<HTMLInputElement>(null);
    const [aImportar, setAImportar] = useState(false);
    const activa = versoes.find(v => v.activa === 1);
    const aqui = activa ? disponivel(activa) : false;
    const info = FONTES_OFICIAIS[fonte];
    const escolher = async (f: File | undefined) => {
        if (!f) return;
        setAImportar(true);
        try { await aoImportar(await f.text(), f.name); } finally { setAImportar(false); if (ficheiro.current) ficheiro.current.value = ''; }
    };
    return (
        <div className={cn('rounded-xl border p-4', activa && !aqui ? 'border-red-200 bg-red-50/50 dark:border-red-900 dark:bg-red-950/20' : 'border-slate-200 dark:border-slate-800')}>
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                    <h3 className="text-sm font-bold">{info.nome}</h3>
                    {activa ? (
                        <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">
                            Lista de {dataPt(activa.data_lista)} · {activa.total_entradas.toLocaleString('pt-PT')} entradas · importada em {dataHoraPt(activa.importada_em)} por {activa.importada_por_nome || '—'}
                            <span className="block font-mono text-[10px] text-slate-400" title="Impressão digital SHA-256 do ficheiro">{activa.hash.slice(0, 16)}…</span>
                        </p>
                    ) : <p className="mt-0.5 text-xs font-semibold text-slate-500">Ainda não importada: o screening regista «não verificado» para esta lista.</p>}
                    {activa && !aqui && <p className="mt-1 text-xs font-semibold text-red-700 dark:text-red-300">Não está disponível neste computador: importe o mesmo ficheiro aqui (o screening dá erro até lá).</p>}
                </div>
                {podeImportar && (
                    <>
                        <input ref={ficheiro} type="file" accept=".xml,text/xml,application/xml" className="hidden" onChange={e => void escolher(e.target.files?.[0])} />
                        <Button size="sm" variant={activa && aqui ? 'outline' : 'default'} disabled={aImportar} onClick={() => ficheiro.current?.click()}
                            title={!podeNova ? 'Sem permissão para activar versões novas: só pode carregar neste computador a versão já activa' : undefined}>
                            {aImportar ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <FileUp className="mr-1 h-4 w-4" />}{activa ? 'Importar ficheiro' : 'Importar lista'}
                        </Button>
                    </>
                )}
            </div>
            <p className="mt-2 break-all text-[11px] text-slate-500">Fonte oficial: <span className="font-mono">{info.url}</span> ({info.ficheiro})</p>
        </div>
    );
}

function DialogoInterna({ entrada, onClose, onSave, aoGuardar }: { entrada: Partial<EntradaInterna>; onClose: () => void; aoGuardar: () => void; onSave: (e: Partial<EntradaInterna>) => Promise<unknown> }) {
    const [e, setE] = useState<Partial<EntradaInterna>>(entrada);
    const [aGuardar, setAGuardar] = useState(false);
    const set = <K extends keyof EntradaInterna>(k: K) => (v: EntradaInterna[K]) => setE(x => ({ ...x, [k]: v }));
    const guardar = async (activa = e.activa ?? 1) => {
        setAGuardar(true);
        const ok = await executar(() => onSave({ ...e, activa }), activa ? 'Entrada guardada' : 'Entrada desactivada');
        setAGuardar(false);
        if (ok) { aoGuardar(); onClose(); }
    };
    return (
        <Dialog open onOpenChange={x => !x && onClose()}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle>{e.id ? 'Editar entrada da lista interna' : 'Nova entrada da lista interna'}</DialogTitle>
                    <DialogDescription>As entradas não se apagam (desactivam-se) e cada alteração fica na auditoria. Indique sempre a fonte oficial.</DialogDescription>
                </DialogHeader>
                <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1"><Label className="text-xs">Categoria</Label>
                        <Select value={e.categoria} onValueChange={v => set('categoria')(v as CategoriaInterna)}><SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>{(Object.keys(ROTULO_CATEGORIA) as CategoriaInterna[]).map(c => <SelectItem key={c} value={c}>{ROTULO_CATEGORIA[c]}</SelectItem>)}</SelectContent></Select></div>
                    <div className="space-y-1"><Label className="text-xs">Tipo</Label>
                        <Select value={e.tipo} onValueChange={v => set('tipo')(v as 'pessoa' | 'entidade')}><SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent><SelectItem value="pessoa">Pessoa</SelectItem><SelectItem value="entidade">Entidade</SelectItem></SelectContent></Select></div>
                    <div className="space-y-1 sm:col-span-2"><Label className="text-xs">Nome completo</Label><Input value={e.nome || ''} onChange={x => set('nome')(x.target.value)} /></div>
                    <div className="space-y-1 sm:col-span-2"><Label className="text-xs">Outros nomes (separados por «;»)</Label><Input value={e.aliases || ''} onChange={x => set('aliases')(x.target.value)} /></div>
                    {e.categoria === 'pep' && <div className="space-y-1 sm:col-span-2"><Label className="text-xs">Função pública</Label><Input value={e.funcao || ''} onChange={x => set('funcao')(x.target.value)} placeholder="Ex.: Administrador Municipal" /></div>}
                    {e.tipo !== 'entidade' && <div className="space-y-1"><Label className="text-xs">Nascimento (aaaa-mm-dd ou ano)</Label><Input value={e.nascimento || ''} onChange={x => set('nascimento')(x.target.value)} /></div>}
                    <div className="space-y-1"><Label className="text-xs">Nacionalidade</Label><Input value={e.nacionalidade || ''} onChange={x => set('nacionalidade')(x.target.value)} /></div>
                    <div className="space-y-1 sm:col-span-2"><Label className="text-xs">Fonte oficial</Label><Input value={e.fonte_referencia || ''} onChange={x => set('fonte_referencia')(x.target.value)} placeholder="Ex.: Diário da República, I Série n.º …, de …" /></div>
                    <div className="space-y-1 sm:col-span-2"><Label className="text-xs">Notas</Label><Textarea rows={2} value={e.notas || ''} onChange={x => set('notas')(x.target.value)} /></div>
                </div>
                <DialogFooter className="gap-2">
                    {e.id && e.activa === 1 && <Button variant="outline" className="text-red-700" disabled={aGuardar} onClick={() => guardar(0)}>Desactivar</Button>}
                    {e.id && e.activa === 0 && <Button variant="outline" disabled={aGuardar} onClick={() => guardar(1)}>Reactivar</Button>}
                    <Button variant="outline" onClick={onClose}>Cancelar</Button>
                    <Button onClick={() => guardar()} disabled={aGuardar}>Guardar</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

