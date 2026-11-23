// Contratos de trabalho: prazo de cada contrato (duração, dias decorridos e em falta, situação para os alertas),
// variáveis dos modelos de contrato e os modelos iniciais (editáveis por cada empresa). Funções puras, testadas.
import { VARIAVEIS_MODELO, type VariavelModelo } from './modelos-rh.ts';

export type ContratoPrazo = { tipo: string; inicio: string; fim: string | null; estado: string; periodo_experiencia_fim?: string | null };
export type SituacaoContrato = 'indeterminado' | 'por_iniciar' | 'em_vigor' | 'a_terminar' | 'expirado' | 'terminado';
export type PrazoContrato = {
    situacao: SituacaoContrato; rotulo: string;
    /** «Indeterminado» ou a duração entre o início e o fim (ex.: «1 ano e 6 meses»). */
    duracao: string;
    totalDias: number | null; decorridos: number; restantes: number | null;
    /** Percentagem já decorrida (0–100), só nos contratos a termo. */
    pct: number | null;
};

const dia = (d: string) => Date.parse(`${d.slice(0, 10)}T00:00:00Z`);
export const diasEntre = (a: string, b: string) => Math.round((dia(b) - dia(a)) / 86_400_000);

/** Duração entre duas datas em anos, meses e dias (o fim conta como dia de contrato). */
export function duracaoTexto(inicio: string, fim: string): string {
    const [a1, m1, d1] = inicio.slice(0, 10).split('-').map(Number);
    const fimMais = new Date(dia(fim) + 86_400_000);
    let anos = fimMais.getUTCFullYear() - a1;
    let meses = fimMais.getUTCMonth() + 1 - m1;
    let dias = fimMais.getUTCDate() - d1;
    if (dias < 0) { meses -= 1; dias += new Date(Date.UTC(fimMais.getUTCFullYear(), fimMais.getUTCMonth(), 0)).getUTCDate(); }
    if (meses < 0) { anos -= 1; meses += 12; }
    const partes = [anos ? `${anos} ${anos === 1 ? 'ano' : 'anos'}` : '', meses ? `${meses} ${meses === 1 ? 'mês' : 'meses'}` : '', dias ? `${dias} ${dias === 1 ? 'dia' : 'dias'}` : ''].filter(Boolean);
    if (!partes.length) return '0 dias';
    return partes.length === 1 ? partes[0] : `${partes.slice(0, -1).join(', ')} e ${partes[partes.length - 1]}`;
}

/**
 * Situação do contrato hoje: indeterminado, por iniciar, em vigor, a terminar (faltam `alertaDias` ou menos),
 * expirado (o fim passou e o contrato continua activo: renovar ou terminar) ou terminado.
 */
export function prazoContrato(c: ContratoPrazo, hoje: string, alertaDias = 60): PrazoContrato {
    const decorridos = Math.max(0, diasEntre(c.inicio, hoje) + 1);
    if (c.tipo === 'indeterminado' || !c.fim) {
        const situacao: SituacaoContrato = c.estado === 'terminado' ? 'terminado' : c.inicio > hoje ? 'por_iniciar' : 'indeterminado';
        return { situacao, rotulo: situacao === 'terminado' ? 'Terminado' : situacao === 'por_iniciar' ? 'Por iniciar' : 'Indeterminado', duracao: 'Indeterminado', totalDias: null, decorridos, restantes: null, pct: null };
    }
    const totalDias = diasEntre(c.inicio, c.fim) + 1;
    const restantes = diasEntre(hoje, c.fim);
    const pct = Math.min(100, Math.max(0, Math.round((Math.min(decorridos, totalDias) / totalDias) * 100)));
    const duracao = duracaoTexto(c.inicio, c.fim);
    if (c.estado === 'terminado') return { situacao: 'terminado', rotulo: 'Terminado', duracao, totalDias, decorridos: Math.min(decorridos, totalDias), restantes: null, pct: 100 };
    if (c.inicio > hoje) return { situacao: 'por_iniciar', rotulo: `Começa daqui a ${diasEntre(hoje, c.inicio)} dia(s)`, duracao, totalDias, decorridos: 0, restantes, pct: 0 };
    if (restantes < 0) return { situacao: 'expirado', rotulo: `Terminou há ${-restantes} dia(s)`, duracao, totalDias, decorridos: totalDias, restantes, pct: 100 };
    if (restantes <= alertaDias) return { situacao: 'a_terminar', rotulo: restantes === 0 ? 'Termina hoje' : `Termina em ${restantes} dia(s)`, duracao, totalDias, decorridos, restantes, pct };
    return { situacao: 'em_vigor', rotulo: `Faltam ${restantes} dias`, duracao, totalDias, decorridos, restantes, pct };
}

/** Variáveis dos modelos de contrato: as das declarações (sem a finalidade) e as do contrato. */
export const VARIAVEIS_CONTRATO: VariavelModelo[] = [
    ...VARIAVEIS_MODELO.filter(v => v.chave !== 'finalidade'),
    { chave: 'data_nascimento', descricao: 'Data de nascimento', exemplo: '22/02/1983' },
    { chave: 'estado_civil', descricao: 'Estado civil', exemplo: 'Casado(a)' },
    { chave: 'morada', descricao: 'Morada do trabalhador', exemplo: 'Rua 1, Casa 12, Benguela' },
    { chave: 'data_inicio', descricao: 'Início do contrato', exemplo: '01/12/2026' },
    { chave: 'data_fim', descricao: 'Fim do contrato (termo certo)', exemplo: '30/11/2027' },
    { chave: 'duracao', descricao: 'Duração do contrato', exemplo: '1 ano' },
    { chave: 'periodo_experimental', descricao: 'Fim do período experimental', exemplo: '01/03/2027' },
    { chave: 'horas_semanais', descricao: 'Horas de trabalho por semana', exemplo: '40' },
    { chave: 'dias_ferias', descricao: 'Dias úteis de férias por ano', exemplo: '22' },
    { chave: 'local_trabalho', descricao: 'Local de trabalho', exemplo: 'Benguela' },
    { chave: 'representante', descricao: 'Representante da empresa', exemplo: 'Nome do gerente' },
    { chave: 'cargo_representante', descricao: 'Cargo do representante', exemplo: 'Gerente' },
];

export function variaveisDesconhecidasContrato(texto: string) {
    const conhecidas = new Set(VARIAVEIS_CONTRATO.map(v => v.chave));
    return [...new Set([...texto.matchAll(/\{\{\s*[#/]?\s*([a-z_]+)\s*\}\}/gu)].map(m => m[1]))].filter(k => !conhecidas.has(k));
}

const PARTES = 'Entre:\n\n{{empresa}}, com o NIF {{nif_empresa}} e sede em {{morada_empresa}}, neste acto representada por {{representante}}, na qualidade de {{cargo_representante}}, '
    + 'adiante designada por EMPREGADOR; e\n\n{{nome}}, de nacionalidade {{nacionalidade}}, {{estado_civil}}, portador(a) do BI n.º {{bi}}, NIF {{nif}}, residente em {{morada}}, '
    + 'adiante designado(a) por TRABALHADOR,\n\né celebrado o presente contrato de trabalho, nos termos da Lei Geral do Trabalho (Lei n.º 12/23, de 27 de Dezembro), '
    + 'que se rege pelas cláusulas seguintes:';
const CLAUSULAS_COMUNS = 'CLÁUSULA {{n_funcoes}} (Funções)\nO TRABALHADOR obriga-se a exercer as funções de {{cargo}}{{#departamento}}, no departamento {{departamento}}{{/departamento}}, '
    + 'sob a autoridade e direcção do EMPREGADOR.';

/** Modelos iniciais (o RH altera-os ou cria outros em Contratos › Modelos). Confirmar o texto com um jurista. */
export const MODELOS_CONTRATO_INICIAIS: Array<{ id: string; nome: string; tipo_contrato: 'indeterminado' | 'determinado'; titulo: string; conteudo: string }> = [
    {
        id: 'modelo-contrato-indeterminado', nome: 'Contrato por tempo indeterminado', tipo_contrato: 'indeterminado', titulo: 'CONTRATO DE TRABALHO POR TEMPO INDETERMINADO',
        conteudo: [
            PARTES,
            CLAUSULAS_COMUNS.replace('{{n_funcoes}}', 'PRIMEIRA'),
            'CLÁUSULA SEGUNDA (Duração e início)\nO contrato é celebrado por tempo indeterminado e produz efeitos a partir de {{data_inicio}}.{{#periodo_experimental}} '
                + 'O período experimental termina a {{periodo_experimental}}.{{/periodo_experimental}}',
            'CLÁUSULA TERCEIRA (Local e horário de trabalho)\nO trabalho é prestado em {{local_trabalho}}, com o período normal de {{horas_semanais}} horas por semana, '
                + 'de acordo com o horário em vigor na empresa.',
            'CLÁUSULA QUARTA (Remuneração)\nO EMPREGADOR paga ao TRABALHADOR o salário base mensal de {{salario_base}}, sujeito aos descontos legais (INSS e IRT), '
                + 'acrescido dos subsídios a que tenha direito.',
            'CLÁUSULA QUINTA (Férias)\nO TRABALHADOR tem direito a {{dias_ferias}} dias úteis de férias por ano e ao respectivo subsídio, nos termos da lei.',
            'CLÁUSULA SEXTA (Disposições finais)\nEm tudo o que não estiver previsto neste contrato aplica-se a Lei Geral do Trabalho e demais legislação em vigor. '
                + 'O presente contrato é feito em dois exemplares, ficando um para cada parte.',
        ].join('\n\n'),
    },
    {
        id: 'modelo-contrato-termo-certo', nome: 'Contrato a termo certo', tipo_contrato: 'determinado', titulo: 'CONTRATO DE TRABALHO A TERMO CERTO',
        conteudo: [
            PARTES,
            CLAUSULAS_COMUNS.replace('{{n_funcoes}}', 'PRIMEIRA'),
            'CLÁUSULA SEGUNDA (Duração)\nO contrato é celebrado a termo certo, com a duração de {{duracao}}, com início a {{data_inicio}} e fim a {{data_fim}}, '
                + 'podendo ser renovado nos termos da lei.{{#periodo_experimental}} O período experimental termina a {{periodo_experimental}}.{{/periodo_experimental}}',
            'CLÁUSULA TERCEIRA (Local e horário de trabalho)\nO trabalho é prestado em {{local_trabalho}}, com o período normal de {{horas_semanais}} horas por semana, '
                + 'de acordo com o horário em vigor na empresa.',
            'CLÁUSULA QUARTA (Remuneração)\nO EMPREGADOR paga ao TRABALHADOR o salário base mensal de {{salario_base}}, sujeito aos descontos legais (INSS e IRT), '
                + 'acrescido dos subsídios a que tenha direito.',
            'CLÁUSULA QUINTA (Férias)\nO TRABALHADOR tem direito a {{dias_ferias}} dias úteis de férias por ano e ao respectivo subsídio, nos termos da lei.',
            'CLÁUSULA SEXTA (Caducidade)\nO contrato caduca no fim do prazo se uma das partes comunicar à outra, por escrito e com a antecedência legal, a vontade de o não renovar.',
            'CLÁUSULA SÉTIMA (Disposições finais)\nEm tudo o que não estiver previsto neste contrato aplica-se a Lei Geral do Trabalho e demais legislação em vigor. '
                + 'O presente contrato é feito em dois exemplares, ficando um para cada parte.',
        ].join('\n\n'),
    },
];
