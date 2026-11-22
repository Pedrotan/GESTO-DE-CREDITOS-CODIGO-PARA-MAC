import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { MainLayout } from '@/componentes/layout/MainLayout';
import { Button } from '@/componentes/ui/button';
import { Input } from '@/componentes/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/componentes/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/componentes/ui/dropdown-menu';
import {
    Ban, Banknote, CalendarClock, Download, Eye, FileSignature, FileText, Folder, FolderOpen, MoreHorizontal, Pencil, Plus, Printer, RotateCcw, Search, UserX, Users, X,
} from 'lucide-react';
import { ServicoRH, type Contrato, type Funcionario, type Seccao } from '@/servicos/rh/ServicoRH';
import { ServicoTempoRH } from '@/servicos/rh/ServicoTempoRH';
import { estadoBI } from '@/bibliotecas/rh/bi-validade';
import { valorNumerico } from '@/bibliotecas/rh/parametros-rh';
import { luandaTodayKey } from '@/bibliotecas/fuso-angola';
import { RH_VINCULOS } from '@/bibliotecas/rh/esquema-rh';
import { cn } from '@/bibliotecas/utils';
import { useActorRH } from '@/ganchos/usar-modulo-rh';
import { useData } from '@/contextos/ContextoDados';
import { NavegacaoRH, SeloBI, SeloEstadoFuncionario, antiguidade, dataPt, executar, iniciais, kz, useCarregar, Vazio } from '@/componentes/rh/comum-rh';
import { FormularioFuncionario, type AlvoEdicao } from '@/componentes/rh/FormularioFuncionario';
import { FichaFuncionario } from '@/componentes/rh/FichaFuncionario';
import { DialogoContrato, DialogoDepartamento, DialogoSubsidio, DialogoSuspender, DialogoTerminar } from '@/componentes/rh/DialogosFuncionario';
import { emitirDeclaracaoServico, exportarFuncionarios, imprimirFicha } from '@/componentes/rh/accoes-funcionario';
import { DialogoRelatorioPessoal } from '@/componentes/rh/DialogoRelatorioPessoal';

const TODOS = '__todos__';

/** Dados de base partilhados pelas páginas de RH. */
export function useBaseRH() {
    return useCarregar(async () => {
        const [funcionarios, departamentos, cargos, rubricas, parametros, contratos, seccoes] = await Promise.all([
            ServicoRH.funcionarios(), ServicoRH.departamentos(), ServicoRH.cargos(), ServicoRH.rubricas(), ServicoRH.parametros(), ServicoRH.contratos(), ServicoRH.seccoes(),
        ]);
        return { funcionarios, departamentos, cargos, rubricas, parametros, contratos, seccoes };
    }, { funcionarios: [], departamentos: [], cargos: [], rubricas: [], parametros: [], contratos: [] as Contrato[], seccoes: [] as Seccao[] } as {
        funcionarios: Funcionario[]; departamentos: Awaited<ReturnType<typeof ServicoRH.departamentos>>; cargos: Awaited<ReturnType<typeof ServicoRH.cargos>>;
        rubricas: Awaited<ReturnType<typeof ServicoRH.rubricas>>; parametros: Awaited<ReturnType<typeof ServicoRH.parametros>>; contratos: Contrato[]; seccoes: Seccao[];
    });
}

type Dialogo =
    | { tipo: 'contrato' | 'salario' | 'terminar' | 'suspender'; funcionario: Funcionario }
    | { tipo: 'subsidio' | 'departamento' | 'relatorios'; ids: string[] };

/** Avatar com a fotografia ou as iniciais. */
export function AvatarFuncionario({ f, tamanho = 'h-10 w-10 text-[13px]', className }: { f: Pick<Funcionario, 'nome' | 'foto_url'>; tamanho?: string; className?: string }) {
    return f.foto_url
        ? <img src={f.foto_url} alt="" className={cn('shrink-0 rounded-full object-cover', tamanho, className)} />
        : <span aria-hidden="true" className={cn('flex shrink-0 items-center justify-center rounded-full bg-indigo-100 font-bold text-indigo-900 dark:bg-indigo-950 dark:text-indigo-200', tamanho, className)}>{iniciais(f.nome)}</span>;
}

export default function FuncionariosRH() {
    const { actor, gerir, salarios, confidencial } = useActorRH();
    const { companySettings } = useData();
    const navigate = useNavigate();
    const base = useBaseRH();
    const { funcionarios, departamentos, cargos, rubricas, parametros, contratos } = base.dados;
    const ctx = { cargos, departamentos, contratos };
    const [url, setUrl] = useSearchParams();
    // Filtros na URL (podem partilhar-se e o «voltar» do navegador repõe-nos).
    const filtro = (chave: string, omissao = TODOS) => url.get(chave) || omissao;
    const mudar = (chave: string, valor: string, omissao = TODOS) => setUrl(p => { const n = new URLSearchParams(p); if (valor && valor !== omissao) n.set(chave, valor); else n.delete(chave); return n; }, { replace: true });
    const estado = filtro('estado', 'activo');
    const departamento = filtro('departamento');
    const cargo = filtro('cargo');
    const vinculo = filtro('vinculo');
    const [pesquisaBruta, setPesquisaBruta] = useState(url.get('q') || '');
    useEffect(() => { const t = setTimeout(() => mudar('q', pesquisaBruta.trim(), ''), 300); return () => clearTimeout(t); }, [pesquisaBruta]); // eslint-disable-line react-hooks/exhaustive-deps
    const pesquisa = (url.get('q') || '').toLowerCase();

    const [formulario, setFormulario] = useState<{ aberto: boolean; funcionario: Funcionario | null; seccao?: AlvoEdicao }>({ aberto: false, funcionario: null });
    const fichaId = url.get('ficha');
    const abrirFicha = (id: string | null) => mudar('ficha', id || '', '');
    const [dialogo, setDialogo] = useState<Dialogo | null>(null);
    const [seleccao, setSeleccao] = useState<Set<string>>(new Set());
    const hoje = luandaTodayKey();
    const anosBI = valorNumerico(parametros, 'bi_anos_validade', hoje, 10);
    const maxMb = valorNumerico(parametros, 'documento_max_mb', hoje, 2);
    const horarios = useCarregar(() => ServicoTempoRH.horarios(), [] as Awaited<ReturnType<typeof ServicoTempoRH.horarios>>);

    const salarioActual = useMemo(() => new Map(contratos.filter(c => c.estado === 'activo').map(c => [c.funcionario_id, c.salario_base_minor])), [contratos]);
    const lista = useMemo(() => funcionarios.filter(f => (estado === TODOS || f.estado === estado) && (departamento === TODOS || f.departamento_id === departamento)
        && (cargo === TODOS || f.cargo_id === cargo) && (vinculo === TODOS || f.vinculo === vinculo)
        && (!pesquisa || [f.nome, f.numero_mecanografico, f.nif, f.bi_numero, f.telefone, f.email].some(v => v?.toLowerCase().includes(pesquisa)))),
    [funcionarios, pesquisa, estado, departamento, cargo, vinculo]);
    useEffect(() => { setSeleccao(s => new Set([...s].filter(id => lista.some(f => f.id === id)))); }, [lista]);
    const ficha = funcionarios.find(f => f.id === fichaId) || null;

    const activos = funcionarios.filter(f => f.estado === 'activo');
    const indicadores = [
        { rotulo: 'Funcionários activos', valor: String(activos.length) },
        { rotulo: 'Admitidos este mês', valor: String(funcionarios.filter(f => f.data_admissao?.slice(0, 7) === hoje.slice(0, 7)).length) },
        { rotulo: 'BI a expirar (90 dias)', valor: String(activos.filter(f => estadoBI(f.bi_validade, hoje, 90).estado === 'a_expirar').length) },
        ...(salarios ? [{ rotulo: 'Massa salarial base', valor: kz(activos.reduce((s, f) => s + (salarioActual.get(f.id) || 0), 0)) }] : []),
    ];
    const seleccionados = lista.filter(f => seleccao.has(f.id));
    const todosMarcados = lista.length > 0 && seleccionados.length === lista.length;
    const descricaoFiltros = [estado !== TODOS ? `Estado: ${estado === 'cessado' ? 'terminados' : estado}` : '', departamento !== TODOS ? `Departamento: ${departamentos.find(d => d.id === departamento)?.nome}` : '',
        cargo !== TODOS ? `Cargo: ${cargos.find(c => c.id === cargo)?.nome}` : '', vinculo !== TODOS ? `Vínculo: ${vinculo}` : '', pesquisa ? `Pesquisa: «${pesquisa}»` : ''].filter(Boolean).join(' · ');
    const exportar = (formato: 'excel' | 'pdf', alvo = lista) => actor && void executar(async () => exportarFuncionarios(alvo, ctx, formato, companySettings, actor, salarios, descricaoFiltros), 'Lista exportada');
    const declaracoes = (alvo: Funcionario[]) => actor && void executar(async () => { for (const f of alvo) await emitirDeclaracaoServico(f, ctx, companySettings, actor); }, alvo.length > 1 ? `${alvo.length} declarações geradas` : 'Declaração gerada');
    const recarregar = () => void base.recarregar();
    // Funcionários ainda com o número antigo passam à numeração com a sigla da empresa (uma vez, por quem gere o RH).
    const [conversaoFeita, setConversaoFeita] = useState(false);
    useEffect(() => {
        if (!actor || !gerir || conversaoFeita || !base.dados.funcionarios.length) return;
        setConversaoFeita(true);
        void ServicoRH.converterNumeracao(companySettings?.name, actor).then(n => { if (n > 0) void base.recarregar(); }).catch(error => console.warn('[RH] Nova numeração não aplicada:', error));
    }, [actor, gerir, conversaoFeita, base.dados.funcionarios.length]); // eslint-disable-line react-hooks/exhaustive-deps
    const vinculos = [...new Set([...RH_VINCULOS, ...funcionarios.map(f => f.vinculo).filter((v): v is string => Boolean(v))])];

    const menuAccoes = (f: Funcionario) => (
        <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuItem onSelect={() => abrirFicha(f.id)}><Eye className="mr-2 h-4 w-4" /> Ver ficha completa</DropdownMenuItem>
            {gerir && <DropdownMenuItem onSelect={() => setFormulario({ aberto: true, funcionario: f })}><Pencil className="mr-2 h-4 w-4" /> Editar dados</DropdownMenuItem>}
            {gerir && f.estado !== 'cessado' && <DropdownMenuItem onSelect={() => setDialogo({ tipo: 'contrato', funcionario: f })}><FileSignature className="mr-2 h-4 w-4" /> Novo contrato / renovar</DropdownMenuItem>}
            {gerir && salarios && f.estado !== 'cessado' && <DropdownMenuItem onSelect={() => setDialogo({ tipo: 'subsidio', ids: [f.id] })}><Plus className="mr-2 h-4 w-4" /> Atribuir subsídio</DropdownMenuItem>}
            {gerir && salarios && f.estado !== 'cessado' && <DropdownMenuItem onSelect={() => setDialogo({ tipo: 'salario', funcionario: f })}><Banknote className="mr-2 h-4 w-4" /> Registar alteração salarial</DropdownMenuItem>}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => navigate(`/rh/documentos?funcionario=${f.id}`)}><FolderOpen className="mr-2 h-4 w-4" /> Abrir pasta de documentos</DropdownMenuItem>
            {gerir && <DropdownMenuItem onSelect={() => declaracoes([f])}><FileText className="mr-2 h-4 w-4" /> Gerar declaração de serviço</DropdownMenuItem>}
            <DropdownMenuItem onSelect={() => actor && void executar(() => imprimirFicha(f, ctx, companySettings, actor, salarios), 'Ficha gerada')}><Printer className="mr-2 h-4 w-4" /> Imprimir ficha (PDF)</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setDialogo({ tipo: 'relatorios', ids: [f.id] })}><FileText className="mr-2 h-4 w-4" /> Relatórios pessoais…</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => navigate(`/rh/ponto?pesquisa=${encodeURIComponent(f.numero_mecanografico)}`)}><CalendarClock className="mr-2 h-4 w-4" /> Ver livro de ponto</DropdownMenuItem>
            {gerir && f.estado !== 'cessado' && <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => setDialogo({ tipo: 'suspender', funcionario: f })}>
                    {f.estado === 'suspenso' ? <><RotateCcw className="mr-2 h-4 w-4" /> Reactivar</> : <><Ban className="mr-2 h-4 w-4" /> Suspender</>}
                </DropdownMenuItem>
                <DropdownMenuItem className="text-rh-danger focus:bg-red-50 focus:text-rh-danger" onSelect={() => setDialogo({ tipo: 'terminar', funcionario: f })}><UserX className="mr-2 h-4 w-4" /> Terminar contrato</DropdownMenuItem>
            </>}
        </DropdownMenuContent>
    );

    const botaoIcone = 'inline-flex h-9 w-9 items-center justify-center rounded-lg border border-rh-border bg-white text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rh-link dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800';

    return (
        <MainLayout title="Funcionários" subtitle="Gerir fichas, contratos, subsídios e documentos de cada funcionário">
            <NavegacaoRH />
            <div className="space-y-5">
                <div className="flex flex-wrap items-end justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-extrabold text-rh-text dark:text-white">Funcionários</h1>
                        <p className="mt-1 text-sm text-rh-muted dark:text-slate-400">Gerir fichas, contratos, subsídios e documentos de cada funcionário.</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild><Button variant="outline" className="h-10"><Download className="mr-2 h-4 w-4" /> Exportar</Button></DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuItem onSelect={() => exportar('excel')}>Excel (lista filtrada)</DropdownMenuItem>
                                <DropdownMenuItem onSelect={() => exportar('pdf')}>PDF (lista filtrada)</DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                        {gerir && <Button className="h-10 bg-rh-navy hover:bg-rh-navy-2" onClick={() => setFormulario({ aberto: true, funcionario: null })}><Plus className="mr-2 h-4 w-4" /> Novo funcionário</Button>}
                    </div>
                </div>

                <div className={cn('grid grid-cols-2 gap-3 sm:gap-4', salarios ? 'xl:grid-cols-4' : 'xl:grid-cols-3')}>
                    {indicadores.map(i => (
                        <div key={i.rotulo} className="rounded-xl border border-rh-border bg-white px-5 py-4 dark:border-slate-800 dark:bg-slate-900">
                            <div className="text-[13px] text-rh-muted dark:text-slate-400">{i.rotulo}</div>
                            <div className="mt-1.5 break-words text-lg font-extrabold tabular-nums text-rh-text sm:text-2xl dark:text-white">{base.aCarregar && !funcionarios.length ? '…' : i.valor}</div>
                        </div>
                    ))}
                </div>

                <section className="rounded-xl border border-rh-border bg-white dark:border-slate-800 dark:bg-slate-900">
                    <div className="flex flex-wrap items-center gap-2.5 border-b border-rh-border p-4 dark:border-slate-800">
                        <label className="relative min-w-[240px] flex-1">
                            <span className="sr-only">Pesquisar funcionário</span>
                            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" aria-hidden="true" />
                            <Input className="h-10 pl-9" placeholder="Pesquisar por nome, n.º, BI, telefone ou email" value={pesquisaBruta} onChange={e => setPesquisaBruta(e.target.value)} />
                        </label>
                        <Select value={departamento} onValueChange={v => mudar('departamento', v)}>
                            <SelectTrigger className="h-10 w-56" aria-label="Departamento"><SelectValue /></SelectTrigger>
                            <SelectContent><SelectItem value={TODOS}>Todos os departamentos</SelectItem>{departamentos.map(d => <SelectItem key={d.id} value={d.id}>{d.nome}</SelectItem>)}</SelectContent>
                        </Select>
                        <Select value={cargo} onValueChange={v => mudar('cargo', v)}>
                            <SelectTrigger className="h-10 w-44" aria-label="Cargo"><SelectValue /></SelectTrigger>
                            <SelectContent><SelectItem value={TODOS}>Todos os cargos</SelectItem>{cargos.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}</SelectContent>
                        </Select>
                        <Select value={vinculo} onValueChange={v => mudar('vinculo', v)}>
                            <SelectTrigger className="h-10 w-44" aria-label="Vínculo"><SelectValue /></SelectTrigger>
                            <SelectContent><SelectItem value={TODOS}>Todos os vínculos</SelectItem>{vinculos.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent>
                        </Select>
                        <Select value={estado} onValueChange={v => mudar('estado', v, 'activo')}>
                            <SelectTrigger className="h-10 w-36" aria-label="Estado"><SelectValue /></SelectTrigger>
                            <SelectContent><SelectItem value="activo">Activos</SelectItem><SelectItem value="suspenso">Suspensos</SelectItem><SelectItem value="cessado">Terminados</SelectItem><SelectItem value={TODOS}>Todos</SelectItem></SelectContent>
                        </Select>
                    </div>

                    {seleccionados.length > 0 && (
                        <div className="flex flex-wrap items-center gap-2 border-b border-indigo-100 bg-indigo-50 px-4 py-2.5 text-sm dark:border-indigo-900 dark:bg-indigo-950/40">
                            <b className="mr-2 text-indigo-950 dark:text-indigo-100">{seleccionados.length} seleccionado(s)</b>
                            <Button size="sm" variant="outline" onClick={() => exportar('excel', seleccionados)}><Download className="mr-1.5 h-4 w-4" /> Exportar selecção</Button>
                            {gerir && <Button size="sm" variant="outline" onClick={() => declaracoes(seleccionados)}><FileText className="mr-1.5 h-4 w-4" /> Gerar declarações</Button>}
                            {gerir && salarios && <Button size="sm" variant="outline" onClick={() => setDialogo({ tipo: 'subsidio', ids: seleccionados.map(f => f.id) })}><Plus className="mr-1.5 h-4 w-4" /> Atribuir subsídio</Button>}
                            {gerir && <Button size="sm" variant="outline" onClick={() => setDialogo({ tipo: 'departamento', ids: seleccionados.map(f => f.id) })}><Users className="mr-1.5 h-4 w-4" /> Alterar departamento</Button>}
                            <Button size="sm" variant="outline" onClick={() => setDialogo({ tipo: 'relatorios', ids: seleccionados.map(f => f.id) })}><Printer className="mr-1.5 h-4 w-4" /> Gerar relatórios</Button>
                            <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setSeleccao(new Set())}><X className="mr-1 h-4 w-4" /> Limpar</Button>
                        </div>
                    )}

                    {base.aCarregar && funcionarios.length === 0 ? <div className="p-6"><Vazio>A carregar…</Vazio></div> : lista.length === 0 ? (
                        <div className="p-6"><Vazio>{funcionarios.length === 0 ? 'Ainda não há funcionários registados.' : 'Nenhum funcionário corresponde aos filtros.'}</Vazio></div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[1100px] border-collapse text-sm">
                                <thead>
                                    <tr className="border-b border-rh-border bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
                                        <th className="w-11 px-4 py-3"><input type="checkbox" aria-label="Seleccionar todos" checked={todosMarcados} onChange={() => setSeleccao(todosMarcados ? new Set() : new Set(lista.map(f => f.id)))} className="h-4 w-4 accent-rh-navy" /></th>
                                        <th className="px-4 py-3">N.º</th><th className="px-4 py-3">Funcionário</th><th className="px-4 py-3">Cargo / Departamento</th><th className="px-4 py-3">Admissão</th>
                                        {salarios && <th className="px-4 py-3 text-right">Salário base</th>}<th className="px-4 py-3">BI</th><th className="px-4 py-3">Estado</th><th className="px-4 py-3 text-right">Acções</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {lista.map(f => (
                                        <tr key={f.id} className={cn('border-b border-slate-100 align-middle dark:border-slate-800', seleccao.has(f.id) ? 'bg-indigo-50/60 dark:bg-indigo-950/20' : 'hover:bg-slate-50 dark:hover:bg-slate-800/40')}>
                                            <td className="px-4 py-3.5"><input type="checkbox" aria-label={`Seleccionar ${f.nome}`} checked={seleccao.has(f.id)} className="h-4 w-4 accent-rh-navy"
                                                onChange={() => setSeleccao(s => { const n = new Set(s); if (n.has(f.id)) n.delete(f.id); else n.add(f.id); return n; })} /></td>
                                            <td className="px-4 py-3.5 font-mono text-xs text-slate-600 dark:text-slate-400">{f.numero_mecanografico}</td>
                                            <td className="px-4 py-3.5">
                                                <button type="button" onClick={() => abrirFicha(f.id)} className="flex items-center gap-3 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rh-link">
                                                    <AvatarFuncionario f={f} />
                                                    <span className="min-w-0">
                                                        <span className="block font-semibold text-rh-text hover:underline dark:text-white">{f.nome}</span>
                                                        <span className="block text-xs text-rh-muted dark:text-slate-400">{[f.telefone, f.email].filter(Boolean).join(' · ') || '—'}</span>
                                                    </span>
                                                </button>
                                            </td>
                                            <td className="px-4 py-3.5"><div className="font-semibold">{cargos.find(c => c.id === f.cargo_id)?.nome || '—'}</div><div className="text-xs text-rh-muted dark:text-slate-400">{departamentos.find(d => d.id === f.departamento_id)?.nome || '—'}</div></td>
                                            <td className="px-4 py-3.5">{dataPt(f.data_admissao)}<div className="text-xs text-rh-muted dark:text-slate-400">{antiguidade(f.data_admissao, f.data_saida || hoje)}</div></td>
                                            {salarios && <td className="px-4 py-3.5 text-right font-semibold tabular-nums">{salarioActual.has(f.id) ? kz(salarioActual.get(f.id)) : '—'}</td>}
                                            <td className="px-4 py-3.5"><SeloBI situacao={estadoBI(f.bi_validade, hoje, 90)} /></td>
                                            <td className="px-4 py-3.5"><SeloEstadoFuncionario estado={f.estado} /></td>
                                            <td className="px-4 py-3.5">
                                                <div className="flex justify-end gap-1.5">
                                                    <button type="button" className={botaoIcone} aria-label={`Ver ficha de ${f.nome}`} title="Ver ficha" onClick={() => abrirFicha(f.id)}><Eye className="h-4 w-4" /></button>
                                                    {gerir && <button type="button" className={botaoIcone} aria-label={`Editar ${f.nome}`} title="Editar" onClick={() => setFormulario({ aberto: true, funcionario: f })}><Pencil className="h-4 w-4" /></button>}
                                                    <button type="button" className={botaoIcone} aria-label={`Documentos de ${f.nome}`} title="Documentos" onClick={() => navigate(`/rh/documentos?funcionario=${f.id}`)}><Folder className="h-4 w-4" /></button>
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger asChild>
                                                            <button type="button" className={cn(botaoIcone, 'bg-slate-100 dark:bg-slate-800')} aria-label={`Mais acções para ${f.nome}`} title="Mais acções"><MoreHorizontal className="h-4 w-4" /></button>
                                                        </DropdownMenuTrigger>
                                                        {menuAccoes(f)}
                                                    </DropdownMenu>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                    <div className="border-t border-rh-border px-4 py-3 text-[13px] text-rh-muted dark:border-slate-800 dark:text-slate-400">{lista.length} de {funcionarios.length} funcionário(s)</div>
                </section>
            </div>

            {actor && (
                <FormularioFuncionario open={formulario.aberto} funcionario={formulario.funcionario} seccaoInicial={formulario.seccao} actor={actor} departamentos={departamentos} cargos={cargos} seccoes={base.dados.seccoes}
                    funcionarios={funcionarios} contratos={contratos} rubricas={rubricas} anosValidadeBI={anosBI} maxMb={maxMb} horarios={horarios.dados}
                    onClose={() => setFormulario({ aberto: false, funcionario: null })} onSaved={recarregar} />
            )}
            {ficha && (
                <FichaFuncionario funcionario={ficha} departamentos={departamentos} cargos={cargos} seccoesOrg={base.dados.seccoes} rubricas={rubricas} funcionarios={funcionarios} contratosTodos={contratos} actor={actor}
                    permissoes={{ gerir, salarios, confidencial }} maxMb={maxMb} anosValidadeBI={anosBI} onClose={() => abrirFicha(null)}
                    onEditar={seccao => setFormulario({ aberto: true, funcionario: ficha, seccao })} onChange={recarregar} menuAccoes={menuAccoes} />
            )}
            {actor && dialogo && 'funcionario' in dialogo && (dialogo.tipo === 'contrato' || dialogo.tipo === 'salario') && (
                <DialogoContrato funcionarioId={dialogo.funcionario.id} actual={contratos.find(c => c.funcionario_id === dialogo.funcionario.id && c.estado === 'activo')}
                    apenasSalario={dialogo.tipo === 'salario'} actor={actor} onClose={() => setDialogo(null)} onSaved={recarregar} />
            )}
            {actor && dialogo?.tipo === 'terminar' && <DialogoTerminar funcionarioId={dialogo.funcionario.id} nome={dialogo.funcionario.nome} actor={actor} onClose={() => setDialogo(null)} onSaved={recarregar} />}
            {actor && dialogo?.tipo === 'suspender' && <DialogoSuspender funcionarioId={dialogo.funcionario.id} nome={dialogo.funcionario.nome} suspenso={dialogo.funcionario.estado === 'suspenso'} actor={actor} onClose={() => setDialogo(null)} onSaved={recarregar} />}
            {actor && dialogo?.tipo === 'subsidio' && <DialogoSubsidio funcionarioIds={dialogo.ids} rubricas={rubricas} salarioBaseMinor={dialogo.ids.length === 1 ? salarioActual.get(dialogo.ids[0]) : undefined} actor={actor} onClose={() => setDialogo(null)} onSaved={recarregar} />}
            {actor && dialogo?.tipo === 'relatorios' && <DialogoRelatorioPessoal funcionarios={funcionarios.filter(f => dialogo.ids.includes(f.id))} ctx={ctx} settings={companySettings} actor={actor}
                salarios={salarios} gerir={gerir} onClose={() => setDialogo(null)} onSaved={recarregar} />}
            {actor && dialogo?.tipo === 'departamento' && <DialogoDepartamento funcionarioIds={dialogo.ids} departamentos={departamentos} actor={actor} onClose={() => setDialogo(null)} onSaved={() => { setSeleccao(new Set()); recarregar(); }} />}
        </MainLayout>
    );
}
