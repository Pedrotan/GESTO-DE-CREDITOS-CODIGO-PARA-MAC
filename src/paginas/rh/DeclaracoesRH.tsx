import { useEffect, useMemo, useState } from 'react';
import { FileDown, FileText, Landmark, Plane, RefreshCw, Stamp } from 'lucide-react';
import { MainLayout } from '@/componentes/layout/MainLayout';
import { Button } from '@/componentes/ui/button';
import { Input } from '@/componentes/ui/input';
import { Label } from '@/componentes/ui/label';
import { Textarea } from '@/componentes/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/componentes/ui/tabs';
import { SearchableSelect } from '@/componentes/ui/SearchableSelect';
import { NavegacaoRH, dataPt, executar, useCarregar, Vazio } from '@/componentes/rh/comum-rh';
import { useActorRH } from '@/ganchos/usar-modulo-rh';
import { useData } from '@/contextos/ContextoDados';
import { luandaTodayKey } from '@/bibliotecas/fuso-angola';
import { dataPorExtenso, factosDoFuncionario, textoDeclaracaoInstituicao, textoDeclaracaoServico, type DadosServico } from '@/bibliotecas/rh/declaracoes';
import { gerarDeclaracaoEmpresaPdf, type DadosDeclaracaoEmpresa } from '@/bibliotecas/rh/pdf-rh';
import { ServicoTempoRH, type DocumentoEmitido } from '@/servicos/rh/ServicoTempoRH';
import { ServicoFeriasRH, type PlanoFeriasRH } from '@/servicos/rh/ServicoFeriasRH';
import { EMPRESA } from '@/servicos/rh/ServicoDocumentosRH';
import type { Funcionario } from '@/servicos/rh/ServicoRH';
import { emitirGuiaFerias } from '@/componentes/rh/guia-ferias';
import { useBaseRH } from './FuncionariosRH';

type Modelo = 'servico' | 'instituicao';
const MODELOS: Record<Modelo, { id: string; prefixo: string; titulo: string; subtitulo?: string }> = {
    servico: { id: 'declaracao_servico', prefixo: 'DS', titulo: 'Declaração de serviço e salário' },
    instituicao: { id: 'declaracao_instituicao', prefixo: 'DI', titulo: 'Modelo de declaração', subtitulo: 'Para apresentação a outras instituições' },
};

/**
 * Declarações do RH: «Declaração de serviço e salário» e «Declaração para outras instituições» (modelos da empresa),
 * preenchidas a partir da ficha e do contrato e editáveis antes de emitir, com número sequencial; e as guias de férias
 * dos planos aprovados. As emitidas ficam no histórico e voltam a descarregar-se tal como foram emitidas.
 */
export default function DeclaracoesRH() {
    const { actor, gerir } = useActorRH();
    const { companySettings } = useData();
    const base = useBaseRH();
    const ferias = useCarregar(async () => ({
        planos: await ServicoFeriasRH.planos(), horarios: await ServicoTempoRH.horarios(), feriados: await ServicoTempoRH.feriados(),
    }), { planos: [] as PlanoFeriasRH[], horarios: [] as Awaited<ReturnType<typeof ServicoTempoRH.horarios>>, feriados: [] as Awaited<ReturnType<typeof ServicoTempoRH.feriados>> });
    const emitidos = useCarregar(() => ServicoTempoRH.documentosEmitidos(), [] as DocumentoEmitido[]);
    const config = companySettings as { name?: string; nif?: string; address?: string; location?: string };
    const empresa = (config?.name || 'A empresa').toUpperCase();
    const local = (config?.location || config?.address || '').split(/[,-]/u)[0].trim() || 'Luanda';

    const [modelo, setModelo] = useState<Modelo>('servico');
    const [funcionarioId, setFuncionarioId] = useState('');
    const [campos, setCampos] = useState({ nif: '', instituicao: '', ac: '', assunto: '', morada: config?.address || '', representante: '', cargo: '', factos: '', finalidade: '', anexos: '' });
    const [texto, setTexto] = useState('');
    const [editado, setEditado] = useState(false);

    const funcionarios = base.dados.funcionarios.filter(f => f.estado !== 'cessado');
    const f = funcionarios.find(x => x.id === funcionarioId) || null;
    const dadosServico = useMemo<DadosServico | null>(() => {
        if (!f) return null;
        const contrato = base.dados.contratos.find(c => c.funcionario_id === f.id && c.estado === 'activo');
        return {
            empresa, sexo: f.sexo, nome: f.nome, bi: f.bi_numero, nif: campos.nif || f.nif, admissao: f.data_admissao, numero: f.numero_mecanografico,
            cargo: base.dados.cargos.find(c => c.id === f.cargo_id)?.nome, departamento: base.dados.departamentos.find(d => d.id === f.departamento_id)?.nome,
            tipoContrato: contrato?.tipo, salarioBaseMinor: contrato?.salario_base_minor ?? null,
        };
    }, [f, base.dados, empresa, campos.nif]);

    const textoSugerido = useMemo(() => (modelo === 'servico'
        ? (dadosServico ? textoDeclaracaoServico(dadosServico) : '')
        : textoDeclaracaoInstituicao({ empresa, morada: campos.morada, nifEmpresa: config?.nif, representante: campos.representante, cargoRepresentante: campos.cargo,
            factos: campos.factos, instituicao: campos.instituicao, finalidade: campos.finalidade, anexos: campos.anexos })), [modelo, dadosServico, campos, empresa, config?.nif]);
    // O texto segue os campos até o utilizador o editar à mão; «Repor texto do modelo» volta a ligá-los.
    useEffect(() => { if (!editado) setTexto(textoSugerido); }, [textoSugerido, editado]);
    useEffect(() => {
        setEditado(false);
        if (modelo === 'instituicao' && dadosServico && !campos.factos) setCampos(c => ({ ...c, factos: factosDoFuncionario(dadosServico) }));
    }, [modelo, funcionarioId]); // eslint-disable-line react-hooks/exhaustive-deps

    const set = (k: keyof typeof campos, v: string) => setCampos(c => ({ ...c, [k]: v }));
    const pdfDe = (dados: DadosDeclaracaoEmpresa) => gerarDeclaracaoEmpresaPdf(dados, companySettings, actor?.name || 'Sistema');

    const emitir = () => executar(async () => {
        if (!actor) return;
        if (modelo === 'servico' && !f) throw new Error('Escolha o funcionário.');
        if (texto.trim().length < 40) throw new Error('O texto da declaração está vazio.');
        const m = MODELOS[modelo];
        const dados: DadosDeclaracaoEmpresa = {
            titulo: m.titulo, subtitulo: m.subtitulo, referencia: null, texto, local, dataExtenso: dataPorExtenso(luandaTodayKey()),
            representante: campos.representante || null, cargoRepresentante: campos.cargo ? `Cargo: ${campos.cargo}` : null,
            destinatario: modelo === 'instituicao' ? { instituicao: campos.instituicao || '[NOME DA INSTITUIÇÃO / ENTIDADE]', ac: campos.ac, assunto: campos.assunto } : null,
        };
        const emitido = await ServicoTempoRH.emitirDocumento(f?.id || EMPRESA, m.id, m.prefixo, { pdf: dados }, actor);
        const final = { ...dados, referencia: emitido.numero };
        pdfDe(final);
        void emitidos.recarregar();
    }, 'Declaração emitida');

    const reemitir = (d: DocumentoEmitido) => executar(async () => {
        const guardado = JSON.parse(d.dados_json || '{}') as { pdf?: DadosDeclaracaoEmpresa };
        if (!guardado.pdf) throw new Error('Este documento foi emitido noutra página (Férias ou Recibos).');
        pdfDe({ ...guardado.pdf, referencia: d.numero });
    }, 'Declaração descarregada');

    const planosAprovados = ferias.dados.planos.filter(p => ['aprovado', 'em_gozo', 'gozado'].includes(p.estado) && (!funcionarioId || p.funcionario_id === funcionarioId))
        .sort((a, b) => (b.data_inicio || '').localeCompare(a.data_inicio || ''));
    const guia = (p: PlanoFeriasRH) => executar(async () => {
        if (!actor) return;
        await emitirGuiaFerias(p, { ...ferias.dados, funcionarios: base.dados.funcionarios, contratos: base.dados.contratos, parametros: base.dados.parametros,
            cargos: base.dados.cargos, departamentos: base.dados.departamentos }, companySettings, actor);
        void ferias.recarregar(); void emitidos.recarregar();
    }, 'Guia de férias emitida');

    const nomeDe = (id: string) => (id === EMPRESA ? 'Empresa' : base.dados.funcionarios.find(x => x.id === id)?.nome || '—');
    const historico = emitidos.dados.filter(d => ['declaracao_servico', 'declaracao_instituicao', 'guia_ferias'].includes(d.modelo));
    const escolherFuncionario = (
        <div>
            <Label className="text-xs font-bold">Funcionário{modelo === 'instituicao' ? ' (opcional)' : ''}</Label>
            <SearchableSelect value={funcionarioId} onValueChange={setFuncionarioId} placeholder="Escolher funcionário"
                options={[...(modelo === 'instituicao' ? [{ value: '', label: 'Sem funcionário (declaração da empresa)' }] : []),
                    ...funcionarios.map((x: Funcionario) => ({ value: x.id, label: x.nome, subLabel: `N.º ${x.numero_mecanografico}` }))]} />
        </div>
    );

    return (
        <MainLayout title="Declarações" subtitle="Declarações de serviço, para outras instituições e guias de férias">
            <NavegacaoRH />
            {!gerir && <p className="mb-3 rounded-xl bg-amber-50 px-4 py-2 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">Só consulta: emitir declarações exige a permissão «RH: Gerir funcionários».</p>}
            <Tabs defaultValue="declaracao" className="space-y-4">
                <TabsList>
                    <TabsTrigger value="declaracao"><FileText className="mr-1.5 h-4 w-4" /> Declarações</TabsTrigger>
                    <TabsTrigger value="ferias"><Plane className="mr-1.5 h-4 w-4" /> Guias de férias</TabsTrigger>
                    <TabsTrigger value="emitidas"><Stamp className="mr-1.5 h-4 w-4" /> Emitidas ({historico.length})</TabsTrigger>
                </TabsList>

                <TabsContent value="declaracao" className="mt-0">
                    <div className="grid gap-4 xl:grid-cols-[minmax(0,420px)_1fr]">
                        <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Modelo">
                                {(['servico', 'instituicao'] as Modelo[]).map(m => (
                                    <button key={m} type="button" role="radio" aria-checked={modelo === m} onClick={() => setModelo(m)}
                                        className={`flex items-center gap-2 rounded-xl border p-3 text-left text-sm font-bold ${modelo === m ? 'border-indigo-500 bg-indigo-50 text-indigo-900 dark:bg-slate-800 dark:text-white' : 'border-slate-200 dark:border-slate-700'}`}>
                                        {m === 'servico' ? <FileText className="h-4 w-4" /> : <Landmark className="h-4 w-4" />}
                                        {m === 'servico' ? 'Serviço e salário' : 'Outras instituições'}
                                    </button>
                                ))}
                            </div>
                            {escolherFuncionario}
                            {modelo === 'servico' ? (
                                <div><Label className="text-xs font-bold">NIF do funcionário (se a ficha não tiver)</Label><Input className="mt-1" value={campos.nif} onChange={e => set('nif', e.target.value)} placeholder={f?.nif || 'Fica em branco para preencher à mão'} /></div>
                            ) : (
                                <div className="grid gap-2 sm:grid-cols-2">
                                    <div className="sm:col-span-2"><Label className="text-xs font-bold">À(ao) — instituição / entidade</Label><Input className="mt-1" value={campos.instituicao} onChange={e => set('instituicao', e.target.value)} /></div>
                                    <div><Label className="text-xs font-bold">A/C</Label><Input className="mt-1" value={campos.ac} onChange={e => set('ac', e.target.value)} /></div>
                                    <div><Label className="text-xs font-bold">Assunto</Label><Input className="mt-1" value={campos.assunto} onChange={e => set('assunto', e.target.value)} /></div>
                                    <div className="sm:col-span-2"><Label className="text-xs font-bold">Sede da empresa</Label><Input className="mt-1" value={campos.morada} onChange={e => set('morada', e.target.value)} /></div>
                                    <div className="sm:col-span-2"><Label className="text-xs font-bold">Factos a declarar</Label><Textarea className="mt-1" rows={4} value={campos.factos} onChange={e => set('factos', e.target.value)} /></div>
                                    <div><Label className="text-xs font-bold">Para efeitos de</Label><Input className="mt-1" value={campos.finalidade} onChange={e => set('finalidade', e.target.value)} /></div>
                                    <div><Label className="text-xs font-bold">Anexos (opcional)</Label><Input className="mt-1" value={campos.anexos} onChange={e => set('anexos', e.target.value)} /></div>
                                </div>
                            )}
                            <div className="grid gap-2 sm:grid-cols-2">
                                <div><Label className="text-xs font-bold">Representante que assina</Label><Input className="mt-1" value={campos.representante} onChange={e => set('representante', e.target.value)} /></div>
                                <div><Label className="text-xs font-bold">Cargo do representante</Label><Input className="mt-1" value={campos.cargo} onChange={e => set('cargo', e.target.value)} /></div>
                            </div>
                        </section>
                        <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <div>
                                    <h2 className="font-black">{MODELOS[modelo].titulo}</h2>
                                    <p className="text-xs text-slate-500">{empresa} · {local}, {dataPorExtenso(luandaTodayKey())}. Edite o texto à vontade antes de emitir; cada parágrafo separa-se por uma linha em branco.</p>
                                </div>
                                {editado && <Button size="sm" variant="ghost" onClick={() => setEditado(false)}><RefreshCw className="mr-1.5 h-4 w-4" /> Repor texto do modelo</Button>}
                            </div>
                            {modelo === 'servico' && !f ? <Vazio>Escolha o funcionário para preencher a declaração.</Vazio> : (
                                <Textarea aria-label="Texto da declaração" rows={16} className="font-serif text-[15px] leading-relaxed" value={texto} onChange={e => { setTexto(e.target.value); setEditado(true); }} />
                            )}
                            <div className="flex flex-wrap justify-end gap-2">
                                <Button variant="outline" disabled={texto.trim().length < 40} onClick={() => pdfDe({ titulo: MODELOS[modelo].titulo, subtitulo: MODELOS[modelo].subtitulo, referencia: 'Pré-visualização', texto, local,
                                    dataExtenso: dataPorExtenso(luandaTodayKey()), representante: campos.representante, cargoRepresentante: campos.cargo ? `Cargo: ${campos.cargo}` : null,
                                    destinatario: modelo === 'instituicao' ? { instituicao: campos.instituicao, ac: campos.ac, assunto: campos.assunto } : null })}>
                                    <FileDown className="mr-1.5 h-4 w-4" /> Pré-visualizar
                                </Button>
                                {gerir && <Button className="bg-emerald-600 text-white hover:bg-emerald-700" disabled={texto.trim().length < 40 || (modelo === 'servico' && !f)} onClick={() => void emitir()}>
                                    <Stamp className="mr-1.5 h-4 w-4" /> Emitir declaração numerada
                                </Button>}
                            </div>
                        </section>
                    </div>
                </TabsContent>

                <TabsContent value="ferias" className="mt-0 space-y-3">
                    <div className="max-w-md">{escolherFuncionario}</div>
                    <p className="text-xs text-slate-500">Guia de férias segundo a Lei Geral do Trabalho (Lei n.º 12/23): período de gozo em dias úteis, data de regresso, saldo, subsídio de férias e assinaturas. Sai dos planos de férias aprovados; voltar a emitir repete o mesmo número.</p>
                    {planosAprovados.length === 0 ? <Vazio>Sem planos de férias aprovados{funcionarioId ? ' para este funcionário' : ''}. Aprove-os em «Férias».</Vazio> : (
                        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                            <table className="w-full text-sm">
                                <thead className="bg-slate-50 text-left text-[11px] uppercase text-slate-500 dark:bg-slate-950"><tr><th className="px-3 py-2">Funcionário</th><th className="px-3 py-2">Ano</th><th className="px-3 py-2">Período</th><th className="px-3 py-2">Dias úteis</th><th className="px-3 py-2">Estado</th><th /></tr></thead>
                                <tbody>{planosAprovados.map(p => (
                                    <tr key={p.id} className="border-t border-slate-100 dark:border-slate-800">
                                        <td className="px-3 py-2 font-semibold">{nomeDe(p.funcionario_id)}</td><td className="px-3 py-2">{p.ano}</td>
                                        <td className="px-3 py-2">{dataPt(p.data_inicio)} a {dataPt(p.data_fim)}</td><td className="px-3 py-2">{p.dias}</td>
                                        <td className="px-3 py-2">{p.estado.replace('_', ' ')}</td>
                                        <td className="px-3 py-2 text-right">{gerir && <Button size="sm" onClick={() => void guia(p)}><FileDown className="mr-1.5 h-4 w-4" /> {p.guia_id ? 'Descarregar guia' : 'Emitir guia'}</Button>}</td>
                                    </tr>
                                ))}</tbody>
                            </table>
                        </div>
                    )}
                </TabsContent>

                <TabsContent value="emitidas" className="mt-0">
                    {historico.length === 0 ? <Vazio>Ainda não foi emitida nenhuma declaração ou guia.</Vazio> : (
                        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                            <table className="w-full text-sm">
                                <thead className="bg-slate-50 text-left text-[11px] uppercase text-slate-500 dark:bg-slate-950"><tr><th className="px-3 py-2">N.º</th><th className="px-3 py-2">Documento</th><th className="px-3 py-2">Funcionário</th><th className="px-3 py-2">Emitido</th><th /></tr></thead>
                                <tbody>{historico.map(d => (
                                    <tr key={d.id} className="border-t border-slate-100 dark:border-slate-800">
                                        <td className="px-3 py-2 font-mono text-xs font-bold">{d.numero}</td>
                                        <td className="px-3 py-2">{d.modelo === 'guia_ferias' ? 'Guia de férias' : d.modelo === 'declaracao_servico' ? 'Declaração de serviço e salário' : 'Declaração para outras instituições'}</td>
                                        <td className="px-3 py-2">{nomeDe(d.funcionario_id)}</td>
                                        <td className="px-3 py-2 text-xs text-slate-500">{dataPt(d.emitido_em)} · {d.emitido_por_nome || '—'}</td>
                                        <td className="px-3 py-2 text-right">{d.modelo !== 'guia_ferias' && <Button size="sm" variant="outline" onClick={() => void reemitir(d)}><FileDown className="mr-1.5 h-4 w-4" /> PDF</Button>}</td>
                                    </tr>
                                ))}</tbody>
                            </table>
                        </div>
                    )}
                </TabsContent>
            </Tabs>
        </MainLayout>
    );
}
