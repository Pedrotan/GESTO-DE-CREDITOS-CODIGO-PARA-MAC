// Acções sobre funcionários partilhadas pela lista, pela ficha e pelos relatórios: imprimir a ficha individual,
// emitir a declaração de serviço (numerada) e exportar a lista filtrada em Excel ou PDF.
import { ServicoRH, CATEGORIAS_DOCUMENTO, type ActorRH, type Cargo, type Contrato, type Departamento, type Funcionario } from '@/servicos/rh/ServicoRH';
import { ServicoTempoRH } from '@/servicos/rh/ServicoTempoRH';
import { gerarDeclaracaoPdf, gerarFichaIndividualPdf, gerarRelatorioPdf } from '@/bibliotecas/rh/pdf-rh';
import { exportToExcel } from '@/bibliotecas/ExcelHelper';
import { estadoBI, ROTULO_ESTADO_BI } from '@/bibliotecas/rh/bi-validade';
import { luandaTodayKey } from '@/bibliotecas/fuso-angola';
import { antiguidade, dataPt, kz } from './comum-rh';

/** Guarda um PDF gerado pelo sistema na subpasta da pasta pessoal do funcionário (declarações, relatórios). */
export async function arquivarPdf(funcionarioId: string, chave: 'declaracoes' | 'relatorios' | 'recibos', nome: string, ficheiro: { fileName: string; dataUrl: string }, origem: string, actor: ActorRH) {
    await ServicoRH.carregarDocumento({ funcionario_id: funcionarioId, categoria: 'outros', nome, ficheiro_nome: ficheiro.fileName, data_url: ficheiro.dataUrl,
        pasta_id: `sys:${chave}`, origem }, 20, actor);
}

export type ContextoRH = { cargos: Cargo[]; departamentos: Departamento[]; contratos: Contrato[] };
const nome = (lista: Array<{ id: string; nome: string }>, id: string | null | undefined) => lista.find(x => x.id === id)?.nome || '—';
const ESTADO: Record<string, string> = { activo: 'Activo', suspenso: 'Suspenso', cessado: 'Terminado' };
const contratoActivo = (ctx: ContextoRH, id: string) => ctx.contratos.find(c => c.funcionario_id === id && c.estado === 'activo');

/** Ficha individual completa em PDF A4 (dados, contratos, subsídios, histórico, ausências e documentos). */
export async function imprimirFicha(f: Funcionario, ctx: ContextoRH, settings: unknown, actor: ActorRH, salarios: boolean) {
    const [contratos, historico, ausencias, documentos, tipos, fixas, rubricas, dependentes] = await Promise.all([
        ServicoRH.contratos(f.id), salarios ? ServicoRH.historicoSalarial(f.id) : Promise.resolve([]), ServicoTempoRH.ausencias(), ServicoRH.documentos(f.id),
        ServicoTempoRH.tiposAusencia(), salarios ? ServicoRH.rubricasFuncionario(f.id) : Promise.resolve([]), ServicoRH.rubricas(), ServicoRH.dependentes(f.id),
    ]);
    const pdf = gerarFichaIndividualPdf(f.nome, [
        { titulo: 'Dados pessoais e identificação', pares: [['N.º mecanográfico', f.numero_mecanografico], ['Data de nascimento', dataPt(f.data_nascimento)], ['BI', `${f.bi_numero || '—'} (validade ${dataPt(f.bi_validade)})`],
            ['NIF', f.nif || '—'], ['N.º INSS', f.numero_inss || '—'], ['Telefone / email', [f.telefone, f.telefone_alternativo, f.email].filter(Boolean).join(' · ') || '—'],
            ['Morada', [f.morada, f.municipio, f.provincia].filter(Boolean).join(', ') || '—'], ['IBAN', salarios ? f.iban || '—' : '•••']] },
        { titulo: 'Na empresa', pares: [['Cargo / departamento', `${nome(ctx.cargos, f.cargo_id)} · ${nome(ctx.departamentos, f.departamento_id)}`],
            ['Vínculo / carreira', [f.vinculo, f.carreira].filter(Boolean).join(' · ') || '—'], ['Categoria / escalão', [f.categoria, f.escalao].filter(Boolean).join(' · ') || '—'],
            ['Admissão / saída', `${dataPt(f.data_admissao)}${f.data_saida ? ` — ${dataPt(f.data_saida)}` : ''} (${antiguidade(f.data_admissao, f.data_saida || luandaTodayKey())})`], ['Estado', ESTADO[f.estado] || f.estado]] },
        { titulo: 'Contratos', tabela: { colunas: ['Tipo', 'Início', 'Fim', 'Salário base', 'Estado'], linhas: contratos.map(c => [c.tipo === 'indeterminado' ? 'Tempo indeterminado' : 'Termo certo', dataPt(c.inicio), dataPt(c.fim), salarios ? kz(c.salario_base_minor) : '•••', c.estado]) } },
        ...(salarios ? [
            { titulo: 'Subsídios e abonos', tabela: { colunas: ['Subsídio', 'Valor', 'Desde', 'Até'], linhas: fixas.map(x => { const r = rubricas.find(y => y.id === x.rubrica_id); return [r?.nome || '—', r?.forma === 'percentagem' ? `${Math.round(r.percentagem * 1000) / 10}% do salário base` : kz(x.valor_minor), dataPt(x.inicio), dataPt(x.fim)]; }) } },
            { titulo: 'Histórico salarial', tabela: { colunas: ['Data de efeito', 'Anterior', 'Novo', 'Motivo'], linhas: historico.map(h => [dataPt(h.data_efeito), h.salario_anterior_minor === null ? '—' : kz(h.salario_anterior_minor), kz(h.salario_novo_minor), h.motivo]) } },
        ] : []),
        { titulo: 'Dependentes', tabela: { colunas: ['Nome', 'Parentesco', 'Data de nascimento'], linhas: dependentes.map(d => [d.nome, d.parentesco || '—', dataPt(d.data_nascimento)]) } },
        { titulo: 'Ausências', tabela: { colunas: ['Tipo', 'Período', 'Dias / horas', 'Estado'], linhas: ausencias.filter(a => a.funcionario_id === f.id).map(a => [tipos.find(t => t.id === a.tipo_id)?.nome || '—', `${dataPt(a.data_inicio)} a ${dataPt(a.data_fim)}`, a.horas ? `${a.horas} h` : `${a.dias} d`, a.estado]) } },
        { titulo: 'Documentos', tabela: { colunas: ['Documento', 'Categoria', 'Validade', 'Estado'], linhas: documentos.filter(d => !d.confidencial).map(d => [d.nome, CATEGORIAS_DOCUMENTO.find(c => c.id === d.categoria)?.nome || d.categoria, dataPt(d.data_validade), d.estado]) } },
    ], settings, actor.name);
    // Arquivo automático na pasta pessoal › Relatórios pessoais (sem permissão de gestão, fica só a descarga).
    await arquivarPdf(f.id, 'relatorios', `Ficha individual ${dataPt(luandaTodayKey())}`, pdf, 'relatorio', actor).catch(() => undefined);
}

/** Declaração de serviço e salário, numerada e registada nos documentos emitidos. */
export async function emitirDeclaracaoServico(f: Funcionario, ctx: ContextoRH, settings: unknown, actor: ActorRH, finalidade = '') {
    const contrato = contratoActivo(ctx, f.id);
    const emitido = await ServicoTempoRH.emitirDocumento(f.id, 'declaracao_servico', 'DS', { finalidade, salarioBaseMinor: contrato?.salario_base_minor }, actor);
    const pdf = gerarDeclaracaoPdf({
        numero: emitido.numero, modelo: 'servico', finalidade,
        funcionario: { nome: f.nome, numero: f.numero_mecanografico, bi: f.bi_numero, nif: f.nif, admissao: f.data_admissao, cargo: nome(ctx.cargos, f.cargo_id),
            departamento: nome(ctx.departamentos, f.departamento_id), salarioBaseMinor: contrato?.salario_base_minor,
            tipoContrato: contrato ? (contrato.tipo === 'indeterminado' ? 'por tempo indeterminado' : `a termo certo até ${dataPt(contrato.fim)}`) : undefined },
    }, settings, actor.name);
    // Arquivo automático na pasta pessoal › Declarações.
    await arquivarPdf(f.id, 'declaracoes', `Declaração de serviço ${emitido.numero}`, pdf, 'declaracao', actor);
}

/** Exporta a lista (filtrada ou seleccionada) em Excel ou PDF. */
export function exportarFuncionarios(lista: Funcionario[], ctx: ContextoRH, formato: 'excel' | 'pdf', settings: unknown, actor: ActorRH, salarios: boolean, filtros = '') {
    const hoje = luandaTodayKey();
    const linhas = lista.map(f => ({
        'N.º': f.numero_mecanografico, Nome: f.nome, Cargo: nome(ctx.cargos, f.cargo_id), Departamento: nome(ctx.departamentos, f.departamento_id), Vínculo: f.vinculo || '',
        Admissão: dataPt(f.data_admissao), Antiguidade: antiguidade(f.data_admissao, f.data_saida || hoje),
        ...(salarios ? { 'Salário base (Kz)': (contratoActivo(ctx, f.id)?.salario_base_minor || 0) / 100 } : {}),
        BI: f.bi_numero || '', 'Situação do BI': ROTULO_ESTADO_BI[estadoBI(f.bi_validade, hoje, 90).estado], Telefone: f.telefone || '', Email: f.email || '', Estado: ESTADO[f.estado] || f.estado,
    }));
    if (formato === 'excel') { exportToExcel(linhas, `funcionarios-${hoje}`); return; }
    const colunas = Object.keys(linhas[0] || { 'N.º': '', Nome: '' });
    gerarRelatorioPdf({
        titulo: 'Lista de funcionários', subtitulo: `${lista.length} funcionário(s) · ${dataPt(hoje)}`,
        colunas: colunas.map(c => ({ titulo: c, tipo: c.startsWith('Salário') ? 'numero' as const : 'texto' as const })),
        linhas: linhas.map(l => colunas.map(c => (l as Record<string, string | number>)[c] ?? '')),
    }, filtros, settings, actor.name);
}
