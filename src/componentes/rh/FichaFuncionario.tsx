// Ficha do funcionário numa só página (sem abas): cabeçalho fixo com indicadores, índice lateral que realça a secção
// visível, alerta de ficha incompleta e todas as secções por ordem. Cada secção tem «Editar» que abre o cadastro nessa secção.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/componentes/ui/dialog';
import { DropdownMenu, DropdownMenuTrigger } from '@/componentes/ui/dropdown-menu';
import { AlertTriangle, FolderOpen, MoreHorizontal, Pencil, Printer, Trash2, X } from 'lucide-react';
import { ServicoRH, type ActorRH, type Cargo, type Contrato, type Departamento, type Dependente, type DocumentoRH, type Funcionario, type FuncionarioRubrica, type HistoricoSalarial, type Rubrica } from '@/servicos/rh/ServicoRH';
import { ServicoTempoRH } from '@/servicos/rh/ServicoTempoRH';
import { estadoBI } from '@/bibliotecas/rh/bi-validade';
import { luandaTodayKey } from '@/bibliotecas/fuso-angola';
import { cn } from '@/bibliotecas/utils';
import { useAuth } from '@/contextos/ContextoAutenticacao';
import { useData } from '@/contextos/ContextoDados';
import { ArquivoDocumentos } from './ArquivoDocumentos';
import { SeccaoRH, SeloBI, SeloEstadoFuncionario, ValorRH, antiguidade, dataPt, executar, idade, iniciais, kz, useCarregar } from './comum-rh';
import { DialogoContrato, DialogoDependente, DialogoSubsidio } from './DialogosFuncionario';
import { imprimirFicha } from './accoes-funcionario';
import type { AlvoEdicao, SeccaoFormulario } from './FormularioFuncionario';

type Permissoes = { gerir: boolean; salarios: boolean; confidencial: boolean };
type Props = {
    funcionario: Funcionario; departamentos: Departamento[]; cargos: Cargo[]; rubricas: Rubrica[]; funcionarios: Funcionario[]; contratosTodos: Contrato[];
    actor: ActorRH | null; permissoes: Permissoes; maxMb: number; anosValidadeBI: number; onClose: () => void; onEditar: (alvo: AlvoEdicao) => void; onChange: () => void;
    /** O mesmo menu «⋯» da tabela de funcionários. */
    menuAccoes?: (f: Funcionario) => ReactNode;
};

const SECCOES: Array<{ id: string; titulo: string; salarial?: boolean }> = [
    { id: 'pessoais', titulo: 'Dados pessoais' }, { id: 'identificacao', titulo: 'Identificação' }, { id: 'contactos', titulo: 'Contactos e banco' },
    { id: 'empresa', titulo: 'Na empresa' }, { id: 'contrato', titulo: 'Contrato' }, { id: 'subsidios', titulo: 'Subsídios e abonos', salarial: true },
    { id: 'historico', titulo: 'Histórico salarial', salarial: true }, { id: 'dependentes', titulo: 'Dependentes' }, { id: 'documentos', titulo: 'Documentos' },
];

/** Campos obrigatórios ao processamento: em falta, a ficha mostra o alerta e «Completar agora» vai ao primeiro. */
const OBRIGATORIOS: Array<{ campo: keyof Funcionario; rotulo: string; seccao: SeccaoFormulario }> = [
    { campo: 'data_nascimento', rotulo: 'data de nascimento', seccao: 'pessoais' }, { campo: 'bi_numero', rotulo: 'BI', seccao: 'identificacao' },
    { campo: 'nif', rotulo: 'NIF', seccao: 'identificacao' }, { campo: 'numero_inss', rotulo: 'N.º INSS', seccao: 'identificacao' },
    { campo: 'banco', rotulo: 'banco', seccao: 'contactos' }, { campo: 'iban', rotulo: 'IBAN', seccao: 'contactos' },
];

const listaPt = (itens: string[]) => (itens.length <= 1 ? itens.join('') : `${itens.slice(0, -1).join(', ')} e ${itens[itens.length - 1]}`);
const Ligacao = ({ children, onClick }: { children: ReactNode; onClick: () => void }) =>
    <button type="button" onClick={onClick} className="text-[13px] font-semibold text-rh-link hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rh-link">{children}</button>;
const Tabela = ({ cabecalho, children, vazio, colunas }: { cabecalho: ReactNode; children: ReactNode; vazio?: string | false; colunas: number }) => (
    <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
            <thead><tr className="border-b border-rh-border bg-slate-50 text-left text-xs font-semibold text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">{cabecalho}</tr></thead>
            <tbody>{vazio ? <tr><td colSpan={colunas} className="px-5 py-6 text-center text-rh-muted dark:text-slate-400">{vazio}</td></tr> : children}</tbody>
        </table>
    </div>
);

export function FichaFuncionario({ funcionario: f, departamentos, cargos, rubricas, funcionarios, contratosTodos, actor, permissoes, maxMb, onClose, onEditar, onChange, menuAccoes }: Props) {
    const id = f.id;
    const navigate = useNavigate();
    const { users } = useAuth();
    const { companySettings } = useData();
    // Toda a ficha num único carregamento (com «esqueletos» enquanto chega).
    const dados = useCarregar(async () => {
        const [contratos, historico, fixas, dependentes, documentos, horarios] = await Promise.all([
            ServicoRH.contratos(id), permissoes.salarios ? ServicoRH.historicoSalarial(id) : Promise.resolve([] as HistoricoSalarial[]),
            permissoes.salarios ? ServicoRH.rubricasFuncionario(id) : Promise.resolve([] as FuncionarioRubrica[]), ServicoRH.dependentes(id), ServicoRH.documentos(id),
            ServicoTempoRH.horarios(),
        ]);
        return { contratos, historico, fixas, dependentes, documentos, horarios };
    }, { contratos: [] as Contrato[], historico: [] as HistoricoSalarial[], fixas: [] as FuncionarioRubrica[], dependentes: [] as Dependente[], documentos: [] as DocumentoRH[], horarios: [] as Array<{ id: string; nome: string; entrada?: string; saida?: string }> }, [id, permissoes.salarios]);
    const [dialogo, setDialogo] = useState<null | 'contrato' | 'salario' | 'subsidio' | 'dependente'>(null);
    const [anteriores, setAnteriores] = useState(false);
    const [visivel, setVisivel] = useState('pessoais');
    const corpo = useRef<HTMLDivElement>(null);
    const hoje = luandaTodayKey();
    const activo = dados.dados.contratos.find(c => c.estado === 'activo') || contratosTodos.find(c => c.funcionario_id === id && c.estado === 'activo');
    const carregado = !dados.aCarregar || dados.dados.contratos.length > 0;
    const seccoes = SECCOES.filter(s => !s.salarial || permissoes.salarios);
    const recarregar = () => { void dados.recarregar(); onChange(); };
    const cargo = cargos.find(c => c.id === f.cargo_id)?.nome;
    const departamento = departamentos.find(d => d.id === f.departamento_id)?.nome;
    const situacaoBI = estadoBI(f.bi_validade, hoje, 90);
    const emFalta = OBRIGATORIOS.filter(o => !f[o.campo]);
    const horario = dados.dados.horarios.find(h => h.id === f.horario_id) || dados.dados.horarios.find(h => h.id === 'horario-normal');
    const chefe = funcionarios.find(x => x.id === f.chefe_id);
    const utilizador = (users || []).find(u => u.id === f.utilizador_id);
    const tipoContrato = activo ? (activo.tipo === 'indeterminado' ? 'Tempo indeterminado' : 'Termo certo') : 'Sem contrato activo';
    const editar = (seccao: SeccaoFormulario, campo?: string) => permissoes.gerir && onEditar({ seccao, campo });
    const valorSubsidio = (x: FuncionarioRubrica, r?: Rubrica) => r?.forma === 'percentagem' ? Math.round((activo?.salario_base_minor || 0) * r.percentagem * (x.quantidade || 1)) : x.valor_minor;
    const subsidios = useMemo(() => dados.dados.fixas.map(x => ({ x, r: rubricas.find(y => y.id === x.rubrica_id) })), [dados.dados.fixas, rubricas]);

    // Realça no índice a secção visível dentro do corpo da ficha.
    useEffect(() => {
        const raiz = corpo.current;
        if (!raiz || typeof IntersectionObserver === 'undefined') return;
        const obs = new IntersectionObserver(entradas => {
            const visiveis = entradas.filter(e => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
            if (visiveis[0]) setVisivel(visiveis[0].target.id.replace('ficha-', ''));
        }, { root: raiz, rootMargin: '0px 0px -65% 0px', threshold: 0 });
        raiz.querySelectorAll('section[id^="ficha-"]').forEach(s => obs.observe(s));
        return () => obs.disconnect();
    }, [carregado, seccoes.length]);
    const irPara = (s: string) => corpo.current?.querySelector(`#ficha-${s}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

    const botaoEscuro = 'inline-flex h-10 items-center gap-2 rounded-lg border border-white/25 bg-white/10 px-3.5 text-sm font-semibold text-white transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white';
    const grelha = 'grid gap-x-6 gap-y-[18px] px-5 py-[18px] sm:grid-cols-2 lg:grid-cols-3';
    const esqueleto = <div className="space-y-3 px-5 py-5">{[0, 1].map(i => <div key={i} className="h-4 w-2/3 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />)}</div>;

    return (
        <Dialog open onOpenChange={v => !v && onClose()}>
            <DialogContent className="flex h-[calc(100vh-48px)] w-[calc(100vw-48px)] max-w-[1240px] flex-col gap-0 overflow-hidden rounded-2xl border-0 bg-rh-bg p-0 dark:bg-slate-950 [&>button]:hidden">
                {/* Cabeçalho fixo */}
                <div className="shrink-0 bg-rh-navy px-7 pt-6 text-white">
                    <div className="flex flex-wrap items-start gap-5">
                        {f.foto_url ? <img src={f.foto_url} alt="" className="h-[72px] w-[72px] rounded-2xl object-cover" />
                            : <span aria-hidden="true" className="flex h-[72px] w-[72px] items-center justify-center rounded-2xl bg-indigo-100 text-2xl font-extrabold text-indigo-900">{iniciais(f.nome)}</span>}
                        <div className="min-w-0 flex-[1_1_360px]">
                            <div className="flex flex-wrap items-center gap-2.5">
                                <DialogTitle className="text-2xl font-extrabold">{f.nome}</DialogTitle>
                                <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-bold">N.º {f.numero_mecanografico}</span>
                                <SeloEstadoFuncionario estado={f.estado} className="border-transparent" />
                            </div>
                            <DialogDescription className="mt-1.5 text-sm text-indigo-200">{[cargo, departamento, `admitido a ${dataPt(f.data_admissao)}`].filter(Boolean).join(' · ')}</DialogDescription>
                            <p className="mt-1 text-[13px] text-indigo-300">{[f.telefone, f.email].filter(Boolean).join(' · ') || 'Sem contactos'}</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {permissoes.gerir && <button type="button" className={botaoEscuro} onClick={() => editar('pessoais')}><Pencil className="h-4 w-4" /> Editar</button>}
                            {actor && <button type="button" className={botaoEscuro} onClick={() => void executar(() => imprimirFicha(f, { cargos, departamentos, contratos: contratosTodos }, companySettings, actor, permissoes.salarios), 'Ficha gerada')}><Printer className="h-4 w-4" /> Imprimir ficha</button>}
                            <button type="button" className={botaoEscuro} onClick={() => navigate(`/rh/documentos?funcionario=${id}`)}><FolderOpen className="h-4 w-4" /> Pasta</button>
                            {menuAccoes && (
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild><button type="button" className={cn(botaoEscuro, 'w-10 justify-center px-0')} aria-label="Mais acções" title="Mais acções"><MoreHorizontal className="h-4 w-4" /></button></DropdownMenuTrigger>
                                    {menuAccoes(f)}
                                </DropdownMenu>
                            )}
                            <button type="button" className={cn(botaoEscuro, 'w-10 justify-center px-0')} aria-label="Fechar a ficha" title="Fechar" onClick={onClose}><X className="h-4 w-4" /></button>
                        </div>
                    </div>
                    <div className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-t-xl bg-white/10 lg:grid-cols-4">
                        {[
                            ['Salário base', permissoes.salarios ? (activo ? kz(activo.salario_base_minor) : '—') : '•••'],
                            ['Antiguidade', antiguidade(f.data_admissao, f.data_saida || hoje)],
                            ['Contrato', tipoContrato],
                            ['Validade do BI', f.bi_validade ? dataPt(f.bi_validade) : 'Sem dados'],
                        ].map(([r, v]) => <div key={r} className="bg-rh-navy-2 px-[18px] py-3.5"><div className="text-xs text-indigo-300">{r}</div><div className="mt-1 text-lg font-extrabold tabular-nums">{v}</div></div>)}
                    </div>
                </div>

                {/* Índice em linha nos ecrãs estreitos */}
                <nav aria-label="Secções da ficha" className="flex shrink-0 gap-1 overflow-x-auto border-b border-rh-border bg-white px-4 py-2 min-[900px]:hidden dark:border-slate-800 dark:bg-slate-900">
                    {seccoes.map(s => <button key={s.id} type="button" onClick={() => irPara(s.id)} className={cn('whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold', visivel === s.id ? 'bg-indigo-50 text-indigo-900' : 'text-slate-600')}>{s.titulo}</button>)}
                </nav>

                <div ref={corpo} className="min-h-0 flex-1 overflow-y-auto">
                    <div className="flex items-start gap-6 px-7 pb-7 pt-6">
                        <aside aria-label="Índice da ficha" className="sticky top-6 hidden w-[220px] shrink-0 rounded-xl border border-rh-border bg-white p-2 min-[900px]:block dark:border-slate-800 dark:bg-slate-900">
                            {seccoes.map(s => (
                                <a key={s.id} href={`#ficha-${s.id}`} onClick={e => { e.preventDefault(); irPara(s.id); }} aria-current={visivel === s.id ? 'true' : undefined}
                                    className={cn('block rounded-lg px-3 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rh-link',
                                        visivel === s.id ? 'bg-indigo-50 font-bold text-indigo-900 dark:bg-slate-800 dark:text-white' : 'text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800')}>
                                    {s.titulo}
                                </a>
                            ))}
                        </aside>

                        <div className="flex min-w-0 flex-1 flex-col gap-4">
                            {emFalta.length > 0 && (
                                <div role="status" className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-rh-warn-bg px-4 py-3.5 dark:border-amber-900 dark:bg-amber-950/30">
                                    <AlertTriangle className="h-5 w-5 shrink-0 text-rh-warn" aria-hidden="true" />
                                    <p className="flex-1 text-sm text-amber-950 dark:text-amber-100">
                                        <b>Ficha incompleta:</b> {emFalta.length === 1 ? 'falta' : 'faltam'} {listaPt(emFalta.map(o => o.rotulo))}.
                                        {!f.iban && ' Sem IBAN, o salário não entra no ficheiro de transferência bancária.'}
                                    </p>
                                    {permissoes.gerir && <button type="button" className="h-9 rounded-lg border border-rh-input-border bg-white px-3.5 text-sm font-semibold text-slate-700 hover:bg-slate-50" onClick={() => editar(emFalta[0].seccao, emFalta[0].campo)}>Completar agora</button>}
                                </div>
                            )}

                            <SeccaoRH id="ficha-pessoais" titulo="Dados pessoais" accao={permissoes.gerir && <Ligacao onClick={() => editar('pessoais')}>Editar</Ligacao>}>
                                <div className={grelha}>
                                    <ValorRH rotulo="Nome completo" valor={f.nome} />
                                    <ValorRH rotulo="Data de nascimento" obrigatorio valor={f.data_nascimento && <>{dataPt(f.data_nascimento)} <span className="font-medium text-rh-muted">({idade(f.data_nascimento, hoje)} anos)</span></>} />
                                    <ValorRH rotulo="Sexo" valor={f.sexo === 'M' ? 'Masculino' : f.sexo === 'F' ? 'Feminino' : null} />
                                    <ValorRH rotulo="Estado civil" valor={f.estado_civil} />
                                    <ValorRH rotulo="Nacionalidade" valor={f.nacionalidade} />
                                    <ValorRH rotulo="Reformado no activo" valor={f.reformado ? 'Sim (INSS especial)' : 'Não'} />
                                </div>
                            </SeccaoRH>

                            <SeccaoRH id="ficha-identificacao" titulo="Identificação" accao={permissoes.gerir && <Ligacao onClick={() => editar('identificacao')}>Editar</Ligacao>}>
                                <div className={grelha}>
                                    <ValorRH rotulo="N.º do BI" obrigatorio mono valor={f.bi_numero} />
                                    <ValorRH rotulo="Emissão / validade" valor={f.bi_emissao || f.bi_validade ? `${dataPt(f.bi_emissao)} — ${dataPt(f.bi_validade)}` : null} />
                                    <div><div className="mb-1 text-xs text-rh-muted dark:text-slate-400">Situação do BI</div><SeloBI situacao={situacaoBI} detalhe /></div>
                                    <ValorRH rotulo="NIF" obrigatorio valor={f.nif} />
                                    <ValorRH rotulo="N.º INSS" obrigatorio valor={f.numero_inss} />
                                </div>
                            </SeccaoRH>

                            <SeccaoRH id="ficha-contactos" titulo="Contactos e banco" accao={permissoes.gerir && <Ligacao onClick={() => editar('contactos')}>Editar</Ligacao>}>
                                <div className={grelha}>
                                    <ValorRH rotulo="Telefone" valor={f.telefone} />
                                    <ValorRH rotulo="Telefone alternativo" valor={f.telefone_alternativo} />
                                    <ValorRH rotulo="Email" valor={f.email} />
                                    <ValorRH rotulo="Morada" className="sm:col-span-2" valor={[f.morada, f.municipio, f.provincia].filter(Boolean).join(', ')} />
                                    <ValorRH rotulo="Banco" obrigatorio valor={f.banco} />
                                    <ValorRH rotulo="IBAN" obrigatorio mono className="sm:col-span-2" valor={f.iban ? (permissoes.salarios ? f.iban : `${f.iban.slice(0, 4)} •••• ${f.iban.slice(-4)}`) : null} />
                                </div>
                            </SeccaoRH>

                            <SeccaoRH id="ficha-empresa" titulo="Na empresa" accao={permissoes.gerir && <Ligacao onClick={() => editar('empresa')}>Editar</Ligacao>}>
                                <div className={grelha}>
                                    <ValorRH rotulo="Cargo" obrigatorio valor={cargo} />
                                    <ValorRH rotulo="Departamento" valor={departamento} />
                                    <ValorRH rotulo="Data de admissão" valor={dataPt(f.data_admissao)} />
                                    <ValorRH rotulo="Horário" valor={horario ? `${horario.nome}${horario.entrada ? ` (${horario.entrada}–${horario.saida})` : ''}` : null} />
                                    <ValorRH rotulo="Vínculo / carreira" obrigatorio valor={[f.vinculo, f.carreira].filter(Boolean).join(' · ')} />
                                    <ValorRH rotulo="Categoria / escalão" valor={[f.categoria, f.escalao].filter(Boolean).join(' · ')} />
                                    <ValorRH rotulo="Unidade orgânica" valor={f.unidade_organica} />
                                    <ValorRH rotulo="Chefe directo" valor={chefe?.nome} />
                                    <ValorRH rotulo="Portal do funcionário" valor={utilizador ? `${utilizador.name}${utilizador.username ? ` (${utilizador.username})` : ''}` : 'Sem conta'} />
                                    {f.data_saida && <ValorRH rotulo="Data de saída" valor={dataPt(f.data_saida)} />}
                                    {f.observacoes && <ValorRH rotulo="Observações" className="sm:col-span-2 lg:col-span-3" valor={f.observacoes} />}
                                </div>
                            </SeccaoRH>

                            <SeccaoRH id="ficha-contrato" titulo="Contrato" accao={<div className="flex gap-3.5">
                                {dados.dados.contratos.some(c => c.estado !== 'activo') && <Ligacao onClick={() => setAnteriores(v => !v)}>{anteriores ? 'Esconder contratos anteriores' : 'Ver contratos anteriores'}</Ligacao>}
                                {permissoes.gerir && f.estado !== 'cessado' && <Ligacao onClick={() => setDialogo('contrato')}>{activo ? 'Renovar / novo contrato' : 'Registar contrato'}</Ligacao>}
                            </div>}>
                                {!carregado ? esqueleto : activo ? (
                                    <div className={grelha}>
                                        <ValorRH rotulo="Tipo" valor={tipoContrato} />
                                        <ValorRH rotulo="Início / fim" valor={`${dataPt(activo.inicio)} — ${activo.fim ? dataPt(activo.fim) : 'sem termo'}`} />
                                        <ValorRH rotulo="Período experimental" valor={activo.periodo_experiencia_fim ? `até ${dataPt(activo.periodo_experiencia_fim)}` : null} />
                                        <ValorRH rotulo="Horas semanais" valor={String(activo.horas_semanais)} />
                                        <ValorRH rotulo="Dias de férias / ano" valor={String(activo.dias_ferias)} />
                                        {permissoes.salarios && <ValorRH rotulo="Salário base" valor={kz(activo.salario_base_minor)} />}
                                    </div>
                                ) : <p className="px-5 py-6 text-center text-sm text-rh-muted">Sem contrato activo.</p>}
                                {anteriores && (
                                    <Tabela colunas={4} cabecalho={<><th className="px-5 py-2.5">Tipo</th><th className="px-5 py-2.5">Período</th><th className="px-5 py-2.5 text-right">Salário base</th><th className="px-5 py-2.5">Motivo do fim</th></>}>
                                        {dados.dados.contratos.filter(c => c.estado !== 'activo').map(c => (
                                            <tr key={c.id} className="border-b border-slate-100 dark:border-slate-800"><td className="px-5 py-3">{c.tipo === 'indeterminado' ? 'Tempo indeterminado' : 'Termo certo'}</td>
                                                <td className="px-5 py-3">{dataPt(c.inicio)} a {dataPt(c.fim)}</td><td className="px-5 py-3 text-right tabular-nums">{permissoes.salarios ? kz(c.salario_base_minor) : '•••'}</td><td className="px-5 py-3">{c.motivo_fim || '—'}</td></tr>
                                        ))}
                                    </Tabela>
                                )}
                            </SeccaoRH>

                            {permissoes.salarios && (
                                <SeccaoRH id="ficha-subsidios" titulo="Subsídios e abonos" accao={permissoes.gerir && f.estado !== 'cessado' && <Ligacao onClick={() => setDialogo('subsidio')}>+ Atribuir subsídio</Ligacao>}>
                                    <Tabela colunas={5} vazio={carregado && !subsidios.length && 'Nenhum subsídio atribuído. Os subsídios vêm do catálogo em Configurações › Subsídios e abonos.'}
                                        cabecalho={<><th className="px-5 py-2.5">Subsídio</th><th className="px-5 py-2.5">Cálculo</th><th className="px-5 py-2.5 text-right">Valor mensal</th><th className="px-5 py-2.5">Desde</th><th className="px-5 py-2.5" /></>}>
                                        {subsidios.map(({ x, r }) => (
                                            <tr key={x.id} className={cn('border-b border-slate-100 dark:border-slate-800', x.fim && x.fim < hoje && 'text-slate-400')}>
                                                <td className="px-5 py-3 font-semibold">{r?.nome || '—'}</td>
                                                <td className="px-5 py-3">{r?.forma === 'percentagem' ? `${Math.round(r.percentagem * 1000) / 10}% do salário base` : 'Valor fixo'}</td>
                                                <td className="px-5 py-3 text-right font-semibold tabular-nums">{kz(valorSubsidio(x, r))}</td>
                                                <td className="px-5 py-3">{dataPt(x.inicio)}{x.fim ? ` a ${dataPt(x.fim)}` : ''}</td>
                                                <td className="px-5 py-3 text-right">{permissoes.gerir && !x.fim && actor && (
                                                    <Ligacao onClick={() => void executar(() => ServicoRH.terminarRubrica(x.id, hoje, actor), 'Subsídio terminado hoje').then(ok => ok && recarregar())}>Terminar</Ligacao>
                                                )}</td>
                                            </tr>
                                        ))}
                                    </Tabela>
                                </SeccaoRH>
                            )}

                            {permissoes.salarios && (
                                <SeccaoRH id="ficha-historico" titulo="Histórico salarial" accao={permissoes.gerir && f.estado !== 'cessado' && activo && <Ligacao onClick={() => setDialogo('salario')}>+ Registar alteração</Ligacao>}>
                                    <Tabela colunas={4} vazio={carregado && !dados.dados.historico.length && 'Sem alterações salariais registadas.'}
                                        cabecalho={<><th className="px-5 py-2.5">Data</th><th className="px-5 py-2.5 text-right">Salário base</th><th className="px-5 py-2.5">Motivo</th><th className="px-5 py-2.5">Registado por</th></>}>
                                        {dados.dados.historico.map(h => (
                                            <tr key={h.id} className="border-b border-slate-100 dark:border-slate-800">
                                                <td className="px-5 py-3">{dataPt(h.data_efeito)}</td>
                                                <td className="px-5 py-3 text-right font-semibold tabular-nums">{kz(h.salario_novo_minor)}
                                                    {h.salario_anterior_minor ? <div className="text-[11px] font-normal text-rh-muted">antes {kz(h.salario_anterior_minor)} ({(((h.salario_novo_minor - h.salario_anterior_minor) / h.salario_anterior_minor) * 100).toFixed(1)}%)</div> : null}</td>
                                                <td className="px-5 py-3">{h.motivo}</td><td className="px-5 py-3 text-rh-muted">{h.criado_por_nome || '—'}</td>
                                            </tr>
                                        ))}
                                    </Tabela>
                                </SeccaoRH>
                            )}

                            <SeccaoRH id="ficha-dependentes" titulo="Dependentes" accao={permissoes.gerir && <Ligacao onClick={() => setDialogo('dependente')}>+ Adicionar dependente</Ligacao>}>
                                <Tabela colunas={5} vazio={carregado && !dados.dados.dependentes.length && 'Sem dependentes registados.'}
                                    cabecalho={<><th className="px-5 py-2.5">Nome</th><th className="px-5 py-2.5">Parentesco</th><th className="px-5 py-2.5">Data de nascimento</th><th className="px-5 py-2.5">Documento</th><th className="px-5 py-2.5" /></>}>
                                    {dados.dados.dependentes.map(d => (
                                        <tr key={d.id} className="border-b border-slate-100 dark:border-slate-800">
                                            <td className="px-5 py-3 font-semibold">{d.nome}</td><td className="px-5 py-3">{d.parentesco || '—'}</td>
                                            <td className="px-5 py-3">{dataPt(d.data_nascimento)}{d.data_nascimento ? <span className="text-rh-muted"> ({idade(d.data_nascimento, hoje)} anos)</span> : null}</td>
                                            <td className="px-5 py-3 text-rh-muted">—</td>
                                            <td className="px-5 py-3 text-right">{permissoes.gerir && actor && (
                                                <button type="button" aria-label={`Retirar ${d.nome}`} title="Retirar" className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-rh-danger"
                                                    onClick={() => void executar(() => ServicoRH.removerDependente(d.id, id, actor), 'Dependente retirado').then(ok => ok && recarregar())}><Trash2 className="h-4 w-4" /></button>
                                            )}</td>
                                        </tr>
                                    ))}
                                </Tabela>
                            </SeccaoRH>

                            <SeccaoRH id="ficha-documentos" titulo="Documentos" accao={<Ligacao onClick={() => navigate(`/rh/documentos?funcionario=${id}`)}>Abrir pasta completa →</Ligacao>}>
                                <div className="px-5 py-[18px]">
                                    <ArquivoDocumentos documentos={dados.dados.documentos} funcionarios={funcionarios} actor={actor} podeGerir={permissoes.gerir} zonaLargar
                                        podeConfidencial={permissoes.confidencial} maxMb={maxMb} funcionarioFixo={id} onChange={() => void dados.recarregar()} />
                                </div>
                            </SeccaoRH>
                        </div>
                    </div>
                </div>

                {actor && (dialogo === 'contrato' || dialogo === 'salario') && <DialogoContrato funcionarioId={id} actual={activo} apenasSalario={dialogo === 'salario'} actor={actor} onClose={() => setDialogo(null)} onSaved={recarregar} />}
                {actor && dialogo === 'subsidio' && <DialogoSubsidio funcionarioIds={[id]} rubricas={rubricas} salarioBaseMinor={activo?.salario_base_minor} actor={actor} onClose={() => setDialogo(null)} onSaved={recarregar} />}
                {actor && dialogo === 'dependente' && <DialogoDependente funcionarioId={id} actor={actor} onClose={() => setDialogo(null)} onSaved={recarregar} />}
            </DialogContent>
        </Dialog>
    );
}
