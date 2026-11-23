// Relatórios pessoais em PDF A4 com o logótipo e os dados da empresa: ficha individual, declaração de serviço (a partir
// de um modelo editável), histórico salarial, assiduidade anual, férias e relatório personalizado (secções e período).
// Cada relatório pode ser guardado na pasta pessoal (Relatórios pessoais ou Declarações) e/ou descarregado.
import { ServicoRH, CATEGORIAS_DOCUMENTO, type ActorRH, type Funcionario } from '@/servicos/rh/ServicoRH';
import { ServicoTempoRH } from '@/servicos/rh/ServicoTempoRH';
import { ServicoFeriasRH } from '@/servicos/rh/ServicoFeriasRH';
import { ServicoModelosRH } from '@/servicos/rh/ServicoModelosRH';
import { gerarDeclaracaoPdf, gerarFichaIndividualPdf, type FicheiroPdf, type SeccaoFicha } from '@/bibliotecas/rh/pdf-rh';
import { aplicarModelo, MODELO_DECLARACAO_SERVICO } from '@/bibliotecas/rh/modelos-rh';
import { saldoFerias } from '@/bibliotecas/rh/ferias';
import { valorNumerico } from '@/bibliotecas/rh/parametros-rh';
import { luandaTodayKey } from '@/bibliotecas/fuso-angola';
import { antiguidade, dataPt, kz } from './comum-rh';
import type { ContextoRH } from './accoes-funcionario';

export type TipoRelatorio = 'ficha' | 'declaracao' | 'historico' | 'assiduidade' | 'ferias' | 'personalizado';
export const RELATORIOS_PESSOAIS: Array<{ tipo: TipoRelatorio; nome: string; descricao: string; salarial?: boolean }> = [
    { tipo: 'ficha', nome: 'Ficha individual completa', descricao: 'Todas as secções da ficha do funcionário.' },
    { tipo: 'declaracao', nome: 'Declaração de serviço', descricao: 'A partir de um modelo editável em Configurações › Modelos de declaração.' },
    { tipo: 'historico', nome: 'Histórico salarial', descricao: 'Alterações do salário base e subsídios atribuídos.', salarial: true },
    { tipo: 'assiduidade', nome: 'Assiduidade anual', descricao: 'Por mês: presenças, faltas, atrasos e horas extra do livro de ponto.' },
    { tipo: 'ferias', nome: 'Férias gozadas e por gozar', descricao: 'Dias de direito, gozados e por gozar, por ano.' },
    { tipo: 'personalizado', nome: 'Relatório personalizado', descricao: 'Escolha as secções e o período; pode guardar como modelo.' },
];
export type SeccaoPersonalizada = 'dados' | 'empresa' | 'contratos' | 'subsidios' | 'historico' | 'assiduidade' | 'ferias' | 'ausencias' | 'dependentes' | 'documentos';
export const SECCOES_PERSONALIZADAS: Array<{ id: SeccaoPersonalizada; nome: string; salarial?: boolean }> = [
    { id: 'dados', nome: 'Dados pessoais e identificação' }, { id: 'empresa', nome: 'Na empresa' }, { id: 'contratos', nome: 'Contratos' },
    { id: 'subsidios', nome: 'Subsídios e abonos', salarial: true }, { id: 'historico', nome: 'Histórico salarial', salarial: true },
    { id: 'assiduidade', nome: 'Assiduidade' }, { id: 'ferias', nome: 'Férias' }, { id: 'ausencias', nome: 'Ausências e licenças' },
    { id: 'dependentes', nome: 'Dependentes' }, { id: 'documentos', nome: 'Documentos' },
];
export type OpcoesRelatorio = { ano?: number; de?: string; ate?: string; seccoes?: SeccaoPersonalizada[]; modeloId?: string; finalidade?: string };
export type RelatorioGerado = { pdf: FicheiroPdf; nome: string; chave: 'relatorios' | 'declaracoes'; origem: string };

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const nomeDe = (lista: Array<{ id: string; nome: string }>, id: string | null | undefined) => lista.find(x => x.id === id)?.nome || '—';
const ESTADO: Record<string, string> = { activo: 'Activo', suspenso: 'Suspenso', cessado: 'Terminado' };
const noPeriodo = (data: string | null | undefined, de?: string, ate?: string) => !data || ((!de || data.slice(0, 10) >= de) && (!ate || data.slice(0, 10) <= ate));

/** Valores das variáveis dos modelos de declaração para um funcionário. */
export function valoresModelo(f: Funcionario, ctx: ContextoRH, settings: unknown, finalidade = '') {
    const empresa = (settings || {}) as { name?: string; nif?: string; address?: string; location?: string };
    const contrato = ctx.contratos.find(c => c.funcionario_id === f.id && c.estado === 'activo');
    const hoje = luandaTodayKey();
    return {
        nome: f.nome, numero: f.numero_mecanografico, bi: f.bi_numero, nif: f.nif, nacionalidade: f.nacionalidade, cargo: nomeDe(ctx.cargos, f.cargo_id),
        departamento: ctx.departamentos.find(d => d.id === f.departamento_id)?.nome, vinculo: f.vinculo, categoria: f.categoria, data_admissao: dataPt(f.data_admissao),
        antiguidade: antiguidade(f.data_admissao, f.data_saida || hoje),
        tipo_contrato: contrato ? (contrato.tipo === 'indeterminado' ? 'por tempo indeterminado' : `a termo certo até ${dataPt(contrato.fim)}`) : null,
        salario_base: contrato ? kz(contrato.salario_base_minor) : null, finalidade, empresa: empresa.name, nif_empresa: empresa.nif,
        morada_empresa: empresa.address || empresa.location, data_hoje: dataPt(hoje),
    };
}

async function seccoes(f: Funcionario, ctx: ContextoRH, lista: SeccaoPersonalizada[], salarios: boolean, op: OpcoesRelatorio): Promise<SeccaoFicha[]> {
    const ano = op.ano || Number(luandaTodayKey().slice(0, 4));
    const hoje = luandaTodayKey();
    const pedidas = lista.filter(s => salarios || !SECCOES_PERSONALIZADAS.find(x => x.id === s)?.salarial);
    const precisa = (s: SeccaoPersonalizada) => pedidas.includes(s);
    const [contratos, historico, fixas, rubricas, ausencias, tipos, dependentes, documentos, planos, parametros] = await Promise.all([
        ServicoRH.contratos(f.id), precisa('historico') ? ServicoRH.historicoSalarial(f.id) : Promise.resolve([]),
        precisa('subsidios') || precisa('historico') ? ServicoRH.rubricasFuncionario(f.id) : Promise.resolve([]), ServicoRH.rubricas(),
        precisa('ausencias') ? ServicoTempoRH.ausencias() : Promise.resolve([]), ServicoTempoRH.tiposAusencia(),
        precisa('dependentes') ? ServicoRH.dependentes(f.id) : Promise.resolve([]), precisa('documentos') ? ServicoRH.documentos(f.id) : Promise.resolve([]),
        precisa('ferias') ? ServicoFeriasRH.planos() : Promise.resolve([]), ServicoRH.parametros(),
    ]);
    const saida: SeccaoFicha[] = [];
    for (const s of pedidas) {
        if (s === 'dados') saida.push({ titulo: 'Dados pessoais e identificação', pares: [['N.º mecanográfico', f.numero_mecanografico], ['Data de nascimento', dataPt(f.data_nascimento)],
            ['Nacionalidade', f.nacionalidade || '—'], ['BI', `${f.bi_numero || '—'} (validade ${dataPt(f.bi_validade)})`], ['NIF', f.nif || '—'], ['N.º INSS', f.numero_inss || '—'],
            ['Telefone / email', [f.telefone, f.telefone_alternativo, f.email].filter(Boolean).join(' · ') || '—'], ['Morada', [f.morada, f.municipio, f.provincia].filter(Boolean).join(', ') || '—'],
            ['Banco / IBAN', salarios ? [f.banco, f.iban].filter(Boolean).join(' · ') || '—' : '•••']] });
        if (s === 'empresa') saida.push({ titulo: 'Na empresa', pares: [['Cargo / departamento', `${nomeDe(ctx.cargos, f.cargo_id)} · ${nomeDe(ctx.departamentos, f.departamento_id)}`],
            ['Vínculo / carreira', [f.vinculo, f.carreira].filter(Boolean).join(' · ') || '—'], ['Categoria / escalão', [f.categoria, f.escalao].filter(Boolean).join(' · ') || '—'],
            ['Unidade orgânica', f.unidade_organica || '—'], ['Admissão / saída', `${dataPt(f.data_admissao)}${f.data_saida ? ` — ${dataPt(f.data_saida)}` : ''} (${antiguidade(f.data_admissao, f.data_saida || hoje)})`],
            ['Estado', ESTADO[f.estado] || f.estado]] });
        if (s === 'contratos') saida.push({ titulo: 'Contratos', tabela: { colunas: ['Tipo', 'Início', 'Fim', 'Salário base', 'Estado'],
            linhas: contratos.map(c => [c.tipo === 'indeterminado' ? 'Tempo indeterminado' : 'Termo certo', dataPt(c.inicio), dataPt(c.fim), salarios ? kz(c.salario_base_minor) : '•••', c.estado]) } });
        if (s === 'subsidios') saida.push({ titulo: 'Subsídios e abonos', tabela: { colunas: ['Subsídio', 'Cálculo / valor', 'Desde', 'Até'],
            linhas: fixas.map(x => { const r = rubricas.find(y => y.id === x.rubrica_id); return [r?.nome || '—', r?.forma === 'percentagem' ? `${Math.round(r.percentagem * 1000) / 10}% do salário base` : kz(x.valor_minor || r?.valor_padrao_minor || 0), dataPt(x.inicio), dataPt(x.fim)]; }) } });
        if (s === 'historico') {
            saida.push({ titulo: 'Histórico do salário base', tabela: { colunas: ['Data de efeito', 'Anterior', 'Novo', 'Variação', 'Motivo', 'Registado por'],
                linhas: historico.filter(h => noPeriodo(h.data_efeito, op.de, op.ate)).map(h => [dataPt(h.data_efeito), h.salario_anterior_minor === null ? '—' : kz(h.salario_anterior_minor), kz(h.salario_novo_minor),
                    h.salario_anterior_minor ? `${(((h.salario_novo_minor - h.salario_anterior_minor) / h.salario_anterior_minor) * 100).toFixed(1)}%` : '—', h.motivo, h.criado_por_nome || '—']) } });
            saida.push({ titulo: 'Subsídios (atribuições e fim)', tabela: { colunas: ['Subsídio', 'Desde', 'Até'],
                linhas: fixas.filter(x => noPeriodo(x.inicio, undefined, op.ate)).map(x => [rubricas.find(y => y.id === x.rubrica_id)?.nome || '—', dataPt(x.inicio), x.fim ? dataPt(x.fim) : 'em vigor']) } });
        }
        if (s === 'assiduidade') {
            const ultimoMes = ano === Number(hoje.slice(0, 4)) ? Number(hoje.slice(5, 7)) : 12;
            const linhas: string[][] = [];
            const total = { p: 0, f: 0, fj: 0, fe: 0, l: 0, at: 0, min: 0, ex: 0 };
            for (let mes = 1; mes <= ultimoMes; mes++) {
                const dias = (await ServicoTempoRH.pontosMes(ano, mes)).filter(x => x.funcionario_id === f.id) as Array<{ estado?: string | null; entrada: string | null; minutos_atraso: number; minutos_extra?: number | null; horas_extra: number }>;
                const conta = (e: string) => dias.filter(x => (x.estado || (x.entrada ? 'P' : '')) === e).length;
                const v = { p: conta('P'), f: conta('F'), fj: conta('FJ'), fe: conta('FR'), l: conta('L') + conta('D'), at: dias.filter(x => x.minutos_atraso > 0).length,
                    min: dias.reduce((a, x) => a + (x.minutos_atraso || 0), 0), ex: dias.reduce((a, x) => a + (x.minutos_extra ?? Math.round((x.horas_extra || 0) * 60)), 0) };
                (Object.keys(total) as Array<keyof typeof total>).forEach(k => { total[k] += v[k]; });
                linhas.push([MESES[mes - 1], String(v.p), String(v.f), String(v.fj), String(v.fe), String(v.l), `${v.at} (${v.min} min)`, `${Math.round(v.ex / 6) / 10} h`]);
            }
            linhas.push(['Total', String(total.p), String(total.f), String(total.fj), String(total.fe), String(total.l), `${total.at} (${total.min} min)`, `${Math.round(total.ex / 6) / 10} h`]);
            saida.push({ titulo: `Assiduidade ${ano} (livro de ponto)`, tabela: { colunas: ['Mês', 'Presenças', 'Faltas', 'Faltas justif.', 'Férias', 'Licenças/dispensas', 'Atrasos', 'Horas extra'], linhas } });
        }
        if (s === 'ferias') {
            const contrato = contratos.find(c => c.estado === 'activo');
            const direito = contrato?.dias_ferias || valorNumerico(parametros, 'dias_ferias_ano', hoje, 22);
            const primeiro = Math.max(Number(f.data_admissao.slice(0, 4)), ano - 4);
            const linhas: string[][] = [];
            for (let a = primeiro; a <= ano; a++) {
                const sld = saldoFerias(planos, f.id, a, direito, hoje, direito, f.data_admissao, valorNumerico(parametros, 'ferias_transitados_max', hoje, 0));
                linhas.push([String(a), String(sld.direito), String(sld.transitados), String(sld.marcados), String(sld.gozados), String(sld.saldo)]);
            }
            saida.push({ titulo: 'Férias por ano (dias úteis)', tabela: { colunas: ['Ano', 'Direito', 'Transitados', 'Marcados', 'Gozados', 'Por gozar'], linhas } });
            saida.push({ titulo: 'Períodos de férias', tabela: { colunas: ['Ano', 'Período', 'Dias', 'Estado'],
                linhas: planos.filter(p => p.funcionario_id === f.id && noPeriodo(p.data_inicio, op.de, op.ate)).map(p => [String(p.ano), `${dataPt(p.data_inicio)} a ${dataPt(p.data_fim)}`, String(p.dias), p.estado]) } });
        }
        if (s === 'ausencias') saida.push({ titulo: 'Ausências e licenças', tabela: { colunas: ['Tipo', 'Período', 'Dias / horas', 'Estado'],
            linhas: ausencias.filter(a => a.funcionario_id === f.id && noPeriodo(a.data_inicio, op.de, op.ate)).map(a => [tipos.find(t => t.id === a.tipo_id)?.nome || '—', `${dataPt(a.data_inicio)} a ${dataPt(a.data_fim)}`, a.horas ? `${a.horas} h` : `${a.dias} d`, a.estado]) } });
        if (s === 'dependentes') saida.push({ titulo: 'Dependentes', tabela: { colunas: ['Nome', 'Parentesco', 'Data de nascimento'], linhas: dependentes.map(d => [d.nome, d.parentesco || '—', dataPt(d.data_nascimento)]) } });
        if (s === 'documentos') saida.push({ titulo: 'Documentos', tabela: { colunas: ['Documento', 'Categoria', 'Validade', 'Estado'],
            linhas: documentos.filter(d => !d.confidencial && d.estado === 'activo').map(d => [d.nome, CATEGORIAS_DOCUMENTO.find(c => c.id === d.categoria)?.nome || d.categoria, dataPt(d.data_validade), d.estado]) } });
    }
    return saida;
}

const FICHA: SeccaoPersonalizada[] = ['dados', 'empresa', 'contratos', 'subsidios', 'historico', 'dependentes', 'ausencias', 'documentos'];

/** Gera o PDF (sem descarregar): devolve o ficheiro, o nome a usar no arquivo e a subpasta de destino. */
export async function gerarRelatorioPessoal(tipo: TipoRelatorio, f: Funcionario, ctx: ContextoRH, settings: unknown, actor: ActorRH, salarios: boolean, op: OpcoesRelatorio = {}): Promise<RelatorioGerado> {
    const hoje = dataPt(luandaTodayKey());
    const ano = op.ano || Number(luandaTodayKey().slice(0, 4));
    if (tipo === 'declaracao') {
        const modelos = await ServicoModelosRH.modelos('declaracao');
        const modelo = modelos.find(m => m.id === op.modeloId) || modelos.find(m => m.activo) || null;
        const contrato = ctx.contratos.find(c => c.funcionario_id === f.id && c.estado === 'activo');
        const emitido = await ServicoTempoRH.emitirDocumento(f.id, 'declaracao_servico', 'DS', { finalidade: op.finalidade || '', salarioBaseMinor: contrato?.salario_base_minor, modelo: modelo?.nome || 'sistema' }, actor);
        const texto = aplicarModelo(modelo?.conteudo || MODELO_DECLARACAO_SERVICO, valoresModelo(f, ctx, settings, op.finalidade || ''));
        const pdf = gerarDeclaracaoPdf({ numero: emitido.numero, modelo: 'servico', texto, titulo: modelo?.titulo || modelo?.nome || 'Declaração de serviço',
            funcionario: { nome: f.nome, numero: f.numero_mecanografico, admissao: f.data_admissao } }, settings, actor.name, 'datauri');
        return { pdf, nome: `${modelo?.nome || 'Declaração de serviço'} ${emitido.numero}`, chave: 'declaracoes', origem: 'declaracao' };
    }
    const def: Record<Exclude<TipoRelatorio, 'declaracao'>, { lista: SeccaoPersonalizada[]; titulo: string; prefixo: string; nome: string }> = {
        ficha: { lista: FICHA, titulo: 'FICHA INDIVIDUAL DO FUNCIONÁRIO', prefixo: 'Ficha', nome: `Ficha individual ${hoje}` },
        historico: { lista: ['empresa', 'contratos', 'historico'], titulo: 'HISTÓRICO SALARIAL', prefixo: 'Historico-salarial', nome: `Histórico salarial ${hoje}` },
        assiduidade: { lista: ['empresa', 'assiduidade'], titulo: `ASSIDUIDADE ANUAL ${ano}`, prefixo: `Assiduidade-${ano}`, nome: `Assiduidade ${ano}` },
        ferias: { lista: ['empresa', 'ferias'], titulo: 'FÉRIAS GOZADAS E POR GOZAR', prefixo: 'Ferias', nome: `Férias ${hoje}` },
        personalizado: { lista: op.seccoes?.length ? op.seccoes : ['dados', 'empresa'], titulo: 'RELATÓRIO DO FUNCIONÁRIO', prefixo: 'Relatorio', nome: `Relatório personalizado ${hoje}` },
    };
    const d = def[tipo];
    const periodo = op.de || op.ate ? ` · período ${op.de ? dataPt(op.de) : '…'} a ${op.ate ? dataPt(op.ate) : '…'}` : '';
    const pdf = gerarFichaIndividualPdf(`${f.nome}${periodo}`, await seccoes(f, ctx, d.lista, salarios, op), settings, actor.name, 'datauri', d.titulo, d.prefixo);
    return { pdf: { ...pdf, fileName: `${d.prefixo}-${f.numero_mecanografico}-${f.nome.normalize('NFD').replace(/[̀-ͯ]/gu, '').replace(/[^\w]+/gu, '_')}.pdf` }, nome: d.nome, chave: 'relatorios', origem: 'relatorio' };
}
