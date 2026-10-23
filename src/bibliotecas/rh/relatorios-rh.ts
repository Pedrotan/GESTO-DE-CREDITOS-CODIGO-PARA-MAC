// Relatórios de RH: funções puras que transformam os dados em tabelas (colunas tipadas, linhas e totais), usadas
// pelo ecrã, pelo PDF e pelo Excel. Os mapas salariais só contam processamentos aprovados, pagos ou fechados.
import { resumoMes, HORARIO_OMISSAO, type Ausencia, type Feriado, type Horario, type RegistoPonto, type TipoAusencia } from './ponto.ts';
import { estadoEfectivo, saldoFerias, type PlanoFerias } from './ferias.ts';
import { aniversarioNoAno } from './alertas-rh.ts';

export type TipoColuna = 'texto' | 'kz' | 'numero' | 'data' | 'pct';
export type Coluna = { titulo: string; tipo: TipoColuna };
export type Celula = string | number | null;
export type TabelaRH = { titulo: string; subtitulo: string; colunas: Coluna[]; linhas: Celula[][]; totais?: Celula[]; nota?: string };

export type FiltroRH = { de: string; ate: string; departamentoId: string | null; estado: 'todos' | 'activo' | 'suspenso' | 'cessado'; hoje: string };
type Func = { id: string; numero_mecanografico: string; nome: string; nif: string | null; numero_inss: string | null; departamento_id: string | null; cargo_id: string | null;
    estado: string; data_admissao: string; data_saida: string | null; data_nascimento: string | null; horario_id: string | null; telefone?: string | null; bi_validade?: string | null };
type Nome = { id: string; nome: string };
export type ReciboRel = { id: string; funcionario_id: string; ano: number; mes: number; tipo: string; estado: string; departamento: string | null; nome: string;
    numero_mecanografico: string | null; nif: string | null; numero_inss: string | null; bruto_minor: number; base_inss_minor: number; inss_minor: number; inss_emp_minor: number;
    base_irt_minor: number; irt_minor: number; outros_descontos_minor: number; liquido_minor: number; custo_empresa_minor: number };
export type LinhaRel = { recibo_id: string; codigo: string; quantidade: number; valor_minor: number };
export type Base = {
    funcionarios: Func[]; departamentos: Nome[]; cargos: Nome[]; recibos: ReciboRel[]; linhas: LinhaRel[]; ausencias: Ausencia[]; tipos: TipoAusencia[];
    pontos: RegistoPonto[]; horarios: Horario[]; feriados: Feriado[]; planos: PlanoFerias[]; contratos: Array<{ id: string; funcionario_id: string; estado: string; tipo: string; fim: string | null; dias_ferias: number }>;
    documentos: Array<{ id: string; funcionario_id: string; nome: string; categoria: string; estado: string; data_validade: string | null }>; diasFeriasPadrao: number;
};

const OFICIAIS = new Set(['aprovado', 'pago', 'fechado']);
const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const kz = (minor: number) => Math.round(minor) / 100;
const chaveMes = (ano: number, mes: number) => `${ano}-${String(mes).padStart(2, '0')}`;
const nomeDe = (lista: Nome[], id: string | null) => lista.find(x => x.id === id)?.nome || '—';
const soma = (linhas: Celula[][], indice: number) => Math.round(linhas.reduce((s, l) => s + (Number(l[indice]) || 0), 0) * 100) / 100;
const periodo = (f: FiltroRH) => `${f.de.split('-').reverse().join('/')} a ${f.ate.split('-').reverse().join('/')}`;

/** Funcionários dentro dos filtros de departamento e estado. */
export const filtrarFuncionarios = (b: Base, f: FiltroRH) =>
    b.funcionarios.filter(x => (!f.departamentoId || x.departamento_id === f.departamentoId) && (f.estado === 'todos' || x.estado === f.estado));

/** Meses (ano, mês) entre duas datas, inclusive. */
export function mesesDoPeriodo(de: string, ate: string) {
    const lista: Array<{ ano: number; mes: number }> = [];
    let [a, m] = de.split('-').map(Number);
    const [a2, m2] = ate.split('-').map(Number);
    while (a < a2 || (a === a2 && m <= m2)) { lista.push({ ano: a, mes: m }); m += 1; if (m > 12) { m = 1; a += 1; } }
    return lista;
}

function recibosDoPeriodo(b: Base, f: FiltroRH) {
    const ids = new Set(filtrarFuncionarios(b, f).map(x => x.id));
    return b.recibos.filter(r => OFICIAIS.has(r.estado) && ids.has(r.funcionario_id) && chaveMes(r.ano, r.mes) >= f.de.slice(0, 7) && chaveMes(r.ano, r.mes) <= f.ate.slice(0, 7))
        .sort((a, c) => chaveMes(a.ano, a.mes).localeCompare(chaveMes(c.ano, c.mes)) || a.nome.localeCompare(c.nome));
}

export function folhaSalarios(b: Base, f: FiltroRH): TabelaRH {
    const linhas = recibosDoPeriodo(b, f).map(r => [`${MESES[r.mes - 1]}/${r.ano}`, r.tipo, r.numero_mecanografico, r.nome, r.departamento || '—',
        kz(r.bruto_minor), kz(r.inss_minor), kz(r.irt_minor), kz(r.outros_descontos_minor), kz(r.liquido_minor)] as Celula[]);
    return { titulo: 'Folha de salários', subtitulo: periodo(f),
        colunas: [{ titulo: 'Mês', tipo: 'texto' }, { titulo: 'Tipo', tipo: 'texto' }, { titulo: 'N.º', tipo: 'texto' }, { titulo: 'Funcionário', tipo: 'texto' }, { titulo: 'Departamento', tipo: 'texto' },
            { titulo: 'Bruto', tipo: 'kz' }, { titulo: 'INSS 3%', tipo: 'kz' }, { titulo: 'IRT', tipo: 'kz' }, { titulo: 'Outros', tipo: 'kz' }, { titulo: 'Líquido', tipo: 'kz' }],
        linhas, totais: ['TOTAL', '', '', `${linhas.length} recibo(s)`, '', soma(linhas, 5), soma(linhas, 6), soma(linhas, 7), soma(linhas, 8), soma(linhas, 9)] };
}

export function mapaINSS(b: Base, f: FiltroRH): TabelaRH {
    const linhas = recibosDoPeriodo(b, f).map(r => [`${MESES[r.mes - 1]}/${r.ano}`, r.nome, r.numero_inss || '—', kz(r.base_inss_minor), kz(r.inss_minor), kz(r.inss_emp_minor), kz(r.inss_minor + r.inss_emp_minor)] as Celula[]);
    return { titulo: 'Mapa de remunerações para a Segurança Social (INSS)', subtitulo: periodo(f), nota: 'Confirmar o formato de submissão electrónica aceite pelo INSS antes de entregar.',
        colunas: [{ titulo: 'Mês', tipo: 'texto' }, { titulo: 'Funcionário', tipo: 'texto' }, { titulo: 'N.º INSS', tipo: 'texto' }, { titulo: 'Base de incidência', tipo: 'kz' },
            { titulo: 'Trabalhador', tipo: 'kz' }, { titulo: 'Empresa', tipo: 'kz' }, { titulo: 'Total', tipo: 'kz' }],
        linhas, totais: ['TOTAL', '', '', soma(linhas, 3), soma(linhas, 4), soma(linhas, 5), soma(linhas, 6)] };
}

export function mapaIRT(b: Base, f: FiltroRH): TabelaRH {
    const linhas = recibosDoPeriodo(b, f).map(r => [`${MESES[r.mes - 1]}/${r.ano}`, r.nome, r.nif || '—', kz(r.bruto_minor), kz(r.base_irt_minor), kz(r.irt_minor)] as Celula[]);
    return { titulo: 'Mapa de retenções na fonte de IRT (Grupo A)', subtitulo: periodo(f), nota: 'Confirmar o formato de submissão aceite pela AGT antes de entregar.',
        colunas: [{ titulo: 'Mês', tipo: 'texto' }, { titulo: 'Funcionário', tipo: 'texto' }, { titulo: 'NIF', tipo: 'texto' }, { titulo: 'Rendimento bruto', tipo: 'kz' },
            { titulo: 'Matéria colectável', tipo: 'kz' }, { titulo: 'IRT retido', tipo: 'kz' }],
        linhas, totais: ['TOTAL', '', '', soma(linhas, 3), soma(linhas, 4), soma(linhas, 5)] };
}

export function mapaAnualRendimentos(b: Base, f: FiltroRH): TabelaRH {
    const ano = Number(f.ate.slice(0, 4));
    const recibos = recibosDoPeriodo(b, { ...f, de: `${ano}-01-01`, ate: `${ano}-12-31` });
    const porFunc = new Map<string, ReciboRel[]>();
    for (const r of recibos) porFunc.set(r.funcionario_id, [...(porFunc.get(r.funcionario_id) || []), r]);
    const linhas = [...porFunc.values()].map(rs => {
        const t = (k: keyof ReciboRel) => kz(rs.reduce((s, r) => s + Number(r[k]), 0));
        return [rs[0].nome, rs[0].nif || '—', rs.length, t('bruto_minor'), t('inss_minor'), t('irt_minor'), t('liquido_minor')] as Celula[];
    }).sort((a, c) => String(a[0]).localeCompare(String(c[0])));
    return { titulo: `Mapa anual de rendimentos ${ano}`, subtitulo: 'Rendimentos e retenções do ano por funcionário',
        colunas: [{ titulo: 'Funcionário', tipo: 'texto' }, { titulo: 'NIF', tipo: 'texto' }, { titulo: 'Recibos', tipo: 'numero' }, { titulo: 'Rendimento bruto', tipo: 'kz' },
            { titulo: 'INSS retido', tipo: 'kz' }, { titulo: 'IRT retido', tipo: 'kz' }, { titulo: 'Líquido pago', tipo: 'kz' }],
        linhas, totais: ['TOTAL', '', soma(linhas, 2), soma(linhas, 3), soma(linhas, 4), soma(linhas, 5), soma(linhas, 6)] };
}

export function custoPessoal(b: Base, f: FiltroRH): TabelaRH {
    const grupos = new Map<string, { mes: string; dep: string; bruto: number; inssEmp: number; custo: number; n: number }>();
    for (const r of recibosDoPeriodo(b, f)) {
        const chave = `${chaveMes(r.ano, r.mes)}|${r.departamento || '—'}`;
        const g = grupos.get(chave) || { mes: `${MESES[r.mes - 1]}/${r.ano}`, dep: r.departamento || '—', bruto: 0, inssEmp: 0, custo: 0, n: 0 };
        g.bruto += r.bruto_minor; g.inssEmp += r.inss_emp_minor; g.custo += r.custo_empresa_minor; g.n += 1;
        grupos.set(chave, g);
    }
    const linhas = [...grupos.entries()].sort(([a], [c]) => a.localeCompare(c)).map(([, g]) => [g.mes, g.dep, g.n, kz(g.bruto), kz(g.inssEmp), kz(g.custo)] as Celula[]);
    return { titulo: 'Custo com pessoal', subtitulo: `${periodo(f)} · por mês e departamento`,
        colunas: [{ titulo: 'Mês', tipo: 'texto' }, { titulo: 'Departamento', tipo: 'texto' }, { titulo: 'Recibos', tipo: 'numero' }, { titulo: 'Remunerações', tipo: 'kz' },
            { titulo: 'INSS empresa', tipo: 'kz' }, { titulo: 'Custo total', tipo: 'kz' }],
        linhas, totais: ['TOTAL', '', soma(linhas, 2), soma(linhas, 3), soma(linhas, 4), soma(linhas, 5)] };
}

function resumos(b: Base, f: FiltroRH) {
    return filtrarFuncionarios(b, f).map(x => {
        const horario = b.horarios.find(h => h.id === x.horario_id) || b.horarios.find(h => h.id === 'horario-normal') || HORARIO_OMISSAO;
        const meses = mesesDoPeriodo(f.de, f.ate).map(({ ano, mes }) =>
            resumoMes({ funcionarioId: x.id, ano, mes, horario, feriados: b.feriados, pontos: b.pontos, ausencias: b.ausencias, tipos: b.tipos, admissao: x.data_admissao, saida: x.data_saida, hoje: f.hoje }));
        const t = (k: keyof (typeof meses)[number]) => Math.round(meses.reduce((s, r) => s + Number(r[k]), 0) * 100) / 100;
        return { f: x, diasUteis: t('diasUteis'), injust: t('faltasInjustificadas'), just: t('faltasJustificadas'), desc: t('faltasDescontaveis'), atraso: t('minutosAtraso'), extra: t('horasExtra'), extraFeriado: t('horasExtraFeriado') };
    });
}

export function absentismo(b: Base, f: FiltroRH): TabelaRH {
    const linhas = resumos(b, f).map(r => [r.f.nome, nomeDe(b.departamentos, r.f.departamento_id), r.diasUteis, r.injust, r.just, r.desc,
        r.diasUteis ? Math.round(((r.injust + r.just) / r.diasUteis) * 1000) / 10 : 0] as Celula[]);
    const uteis = soma(linhas, 2);
    return { titulo: 'Absentismo', subtitulo: periodo(f), nota: 'Taxa = (faltas injustificadas + justificadas) ÷ dias úteis. Férias não contam como ausência.',
        colunas: [{ titulo: 'Funcionário', tipo: 'texto' }, { titulo: 'Departamento', tipo: 'texto' }, { titulo: 'Dias úteis', tipo: 'numero' }, { titulo: 'Injustificadas', tipo: 'numero' },
            { titulo: 'Justificadas', tipo: 'numero' }, { titulo: 'Descontadas', tipo: 'numero' }, { titulo: 'Taxa', tipo: 'pct' }],
        linhas, totais: ['TOTAL', '', uteis, soma(linhas, 3), soma(linhas, 4), soma(linhas, 5), uteis ? Math.round(((soma(linhas, 3) + soma(linhas, 4)) / uteis) * 1000) / 10 : 0] };
}

export function horasExtraAtrasos(b: Base, f: FiltroRH): TabelaRH {
    const recibos = new Map(recibosDoPeriodo(b, f).map(r => [r.id, r.funcionario_id]));
    const valor = (fid: string, codigo: string) => kz(b.linhas.filter(l => l.codigo === codigo && recibos.get(l.recibo_id) === fid).reduce((s, l) => s + l.valor_minor, 0));
    const linhas = resumos(b, f).map(r => [r.f.nome, nomeDe(b.departamentos, r.f.departamento_id), r.extra, r.extraFeriado, valor(r.f.id, 'HORAS_EXTRA'), r.atraso, valor(r.f.id, 'ATRASOS')] as Celula[]);
    return { titulo: 'Horas extra e atrasos', subtitulo: periodo(f), nota: 'Horas do livro de ponto; valores dos recibos processados no período.',
        colunas: [{ titulo: 'Funcionário', tipo: 'texto' }, { titulo: 'Departamento', tipo: 'texto' }, { titulo: 'H. extra (úteis)', tipo: 'numero' }, { titulo: 'H. extra (feriado/descanso)', tipo: 'numero' },
            { titulo: 'Valor pago', tipo: 'kz' }, { titulo: 'Atrasos (min)', tipo: 'numero' }, { titulo: 'Valor descontado', tipo: 'kz' }],
        linhas, totais: ['TOTAL', '', soma(linhas, 2), soma(linhas, 3), soma(linhas, 4), soma(linhas, 5), soma(linhas, 6)] };
}

export function mapaFerias(b: Base, f: FiltroRH): TabelaRH {
    const ano = Number(f.ate.slice(0, 4));
    const linhas = filtrarFuncionarios(b, f).map(x => {
        const direito = b.contratos.find(c => c.funcionario_id === x.id && c.estado === 'activo')?.dias_ferias ?? b.diasFeriasPadrao;
        const s = saldoFerias(b.planos, x.id, ano, direito, f.hoje, direito, x.data_admissao);
        const periodos = b.planos.filter(p => p.funcionario_id === x.id && p.ano === ano && p.estado !== 'anulado')
            .map(p => p.data_inicio ? `${p.data_inicio.slice(8, 10)}/${p.data_inicio.slice(5, 7)}–${p.data_fim!.slice(8, 10)}/${p.data_fim!.slice(5, 7)} (${estadoEfectivo(p, f.hoje).replace('_', ' ')})` : `${MESES[(p.mes_previsto || 1) - 1]} (previsto)`).join('; ');
        return [x.nome, nomeDe(b.departamentos, x.departamento_id), s.direito, s.transitados, s.marcados, s.gozados, s.saldo, periodos || '—'] as Celula[];
    });
    return { titulo: `Mapa de férias ${ano}`, subtitulo: 'Plano anual, dias gozados e saldo (dias úteis)',
        colunas: [{ titulo: 'Funcionário', tipo: 'texto' }, { titulo: 'Departamento', tipo: 'texto' }, { titulo: 'Direito', tipo: 'numero' }, { titulo: 'Transitados', tipo: 'numero' },
            { titulo: 'Marcados', tipo: 'numero' }, { titulo: 'Gozados', tipo: 'numero' }, { titulo: 'Saldo', tipo: 'numero' }, { titulo: 'Períodos', tipo: 'texto' }],
        linhas };
}

/** Antiguidade em anos e meses completos. */
export function antiguidade(admissao: string, ate: string) {
    const [a1, m1, d1] = admissao.split('-').map(Number);
    const [a2, m2, d2] = ate.split('-').map(Number);
    let meses = (a2 - a1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0);
    meses = Math.max(0, meses);
    return `${Math.floor(meses / 12)} ano(s) e ${meses % 12} mês(es)`;
}

export function efectivos(b: Base, f: FiltroRH): TabelaRH {
    const lista = filtrarFuncionarios(b, f).filter(x => x.data_admissao <= f.ate && (!x.data_saida || x.data_saida >= f.de));
    const linhas = lista.map(x => [x.numero_mecanografico, x.nome, nomeDe(b.cargos, x.cargo_id), nomeDe(b.departamentos, x.departamento_id), x.data_admissao, x.data_saida,
        antiguidade(x.data_admissao, x.data_saida && x.data_saida < f.hoje ? x.data_saida : f.hoje),
        x.data_admissao >= f.de ? 'Admissão no período' : x.data_saida && x.data_saida <= f.ate ? 'Saída no período' : x.estado] as Celula[]);
    const admissoes = lista.filter(x => x.data_admissao >= f.de).length;
    const saidas = lista.filter(x => x.data_saida && x.data_saida >= f.de && x.data_saida <= f.ate).length;
    return { titulo: 'Efectivos', subtitulo: `${periodo(f)} · ${admissoes} admissão(ões), ${saidas} saída(s)`,
        colunas: [{ titulo: 'N.º', tipo: 'texto' }, { titulo: 'Funcionário', tipo: 'texto' }, { titulo: 'Cargo', tipo: 'texto' }, { titulo: 'Departamento', tipo: 'texto' },
            { titulo: 'Admissão', tipo: 'data' }, { titulo: 'Saída', tipo: 'data' }, { titulo: 'Antiguidade', tipo: 'texto' }, { titulo: 'Situação', tipo: 'texto' }],
        linhas, totais: ['', `${linhas.length} funcionário(s)`, '', '', '', '', '', ''] };
}

export function aExpirar(b: Base, f: FiltroRH, dias: number): TabelaRH {
    const limite = new Date(Date.parse(`${f.hoje}T00:00:00Z`) + dias * 86_400_000).toISOString().slice(0, 10);
    const ids = new Set(filtrarFuncionarios(b, f).map(x => x.id));
    const nome = (id: string) => b.funcionarios.find(x => x.id === id)?.nome || '—';
    const linhas: Celula[][] = [
        ...b.contratos.filter(c => c.estado === 'activo' && c.fim && c.fim <= limite && ids.has(c.funcionario_id)).map(c => [nome(c.funcionario_id), 'Contrato', c.tipo === 'determinado' ? 'Termo certo' : 'Contrato', c.fim] as Celula[]),
        ...b.documentos.filter(d => d.estado === 'activo' && d.data_validade && d.data_validade <= limite && ids.has(d.funcionario_id)).map(d => [nome(d.funcionario_id), 'Documento', d.nome, d.data_validade] as Celula[]),
        ...b.funcionarios.filter(x => ids.has(x.id) && x.bi_validade && x.bi_validade <= limite)
            .map(x => [x.nome, 'Documento', 'Bilhete de Identidade (ficha)', x.bi_validade!] as Celula[]),
    ].sort((a, c) => String(a[3]).localeCompare(String(c[3])));
    return { titulo: 'Contratos e documentos a expirar', subtitulo: `Até ${limite.split('-').reverse().join('/')} (próximos ${dias} dias, incluindo os já expirados)`,
        colunas: [{ titulo: 'Funcionário', tipo: 'texto' }, { titulo: 'Tipo', tipo: 'texto' }, { titulo: 'Descrição', tipo: 'texto' }, { titulo: 'Data', tipo: 'data' }], linhas };
}

export function aniversariantes(b: Base, f: FiltroRH): TabelaRH {
    const ano = Number(f.de.slice(0, 4));
    const mes = f.de.slice(5, 7);
    const linhas = filtrarFuncionarios(b, f).filter(x => x.data_nascimento?.slice(5, 7) === mes)
        .map(x => [aniversarioNoAno(x.data_nascimento!, ano), x.nome, nomeDe(b.departamentos, x.departamento_id), ano - Number(x.data_nascimento!.slice(0, 4))] as Celula[])
        .sort((a, c) => String(a[0]).localeCompare(String(c[0])));
    return { titulo: `Aniversariantes de ${MESES[Number(mes) - 1]} ${ano}`, subtitulo: 'Mês do início do período',
        colunas: [{ titulo: 'Dia', tipo: 'data' }, { titulo: 'Funcionário', tipo: 'texto' }, { titulo: 'Departamento', tipo: 'texto' }, { titulo: 'Idade', tipo: 'numero' }], linhas };
}

export const RELATORIOS_RH = [
    { id: 'folha', nome: 'Folha de salários', salarial: true, gerar: folhaSalarios },
    { id: 'inss', nome: 'Mapa de remunerações INSS', salarial: true, gerar: mapaINSS },
    { id: 'irt', nome: 'Mapa de retenções IRT', salarial: true, gerar: mapaIRT },
    { id: 'anual', nome: 'Mapa anual de rendimentos', salarial: true, gerar: mapaAnualRendimentos },
    { id: 'custo', nome: 'Custo com pessoal', salarial: true, gerar: custoPessoal },
    { id: 'absentismo', nome: 'Absentismo', salarial: false, gerar: absentismo },
    { id: 'horas', nome: 'Horas extra e atrasos', salarial: true, gerar: horasExtraAtrasos },
    { id: 'ferias', nome: 'Mapa de férias', salarial: false, gerar: mapaFerias },
    { id: 'efectivos', nome: 'Efectivos', salarial: false, gerar: efectivos },
    { id: 'expirar', nome: 'Contratos e documentos a expirar', salarial: false, gerar: (b: Base, f: FiltroRH) => aExpirar(b, f, 60) },
    { id: 'aniversarios', nome: 'Aniversariantes', salarial: false, gerar: aniversariantes },
] as const;
