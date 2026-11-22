// Declarações do RH (página Declarações): «Declaração de serviço e salário» e «Declaração para outras instituições»,
// com o texto preenchido a partir da ficha e do contrato e editável antes de emitir. Funções puras, testáveis.

const UNIDADES = ['zero', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze', 'treze', 'catorze', 'quinze',
    'dezasseis', 'dezassete', 'dezoito', 'dezanove'];
const DEZENAS = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
const CENTENAS = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/** 0 a 999 por extenso. */
function ate999(n: number): string {
    if (n < 20) return UNIDADES[n];
    if (n < 100) return DEZENAS[Math.floor(n / 10)] + (n % 10 ? ` e ${UNIDADES[n % 10]}` : '');
    if (n === 100) return 'cem';
    return CENTENAS[Math.floor(n / 100)] + (n % 100 ? ` e ${ate999(n % 100)}` : '');
}

/** Inteiro por extenso (português de Angola/Portugal: mil milhões, não «bilhão»). */
export function inteiroPorExtenso(valor: number): string {
    const n = Math.floor(Math.abs(valor));
    if (n === 0) return 'zero';
    const grupos: Array<[number, string, string]> = [[1_000_000_000, 'mil milhões', 'mil milhões'], [1_000_000, 'milhão', 'milhões'], [1_000, 'mil', 'mil']];
    const partes: Array<{ texto: string; valor: number }> = [];
    let resto = n;
    for (const [base, singular, plural] of grupos) {
        const q = Math.floor(resto / base);
        resto %= base;
        if (!q) continue;
        if (base === 1_000) partes.push({ texto: q === 1 ? 'mil' : `${ate999(q)} mil`, valor: q });
        else if (base === 1_000_000_000) partes.push({ texto: q === 1 ? 'mil milhões' : `${inteiroPorExtenso(q)} ${plural}`, valor: q });
        else partes.push({ texto: `${ate999(q)} ${q === 1 ? singular : plural}`, valor: q });
    }
    if (resto) partes.push({ texto: ate999(resto), valor: resto });
    if (partes.length === 1) return partes[0].texto;
    // O último grupo liga-se com «e» quando é menor que 100 ou uma centena redonda; os outros com vírgula.
    const ultimo = partes[partes.length - 1];
    const ligaComE = ultimo.valor < 100 || ultimo.valor % 100 === 0;
    return `${partes.slice(0, -1).map(p => p.texto).join(', ')}${ligaComE ? ' e ' : ', '}${ultimo.texto}`;
}

/** Valor em Kwanzas por extenso (ex.: 1 119 686,00 → «um milhão, cento e dezanove mil, seiscentos e oitenta e seis kwanzas»). */
export function kwanzasPorExtenso(minor: number): string {
    const total = Math.round(Math.abs(minor));
    const inteiro = Math.floor(total / 100);
    const centimos = total % 100;
    const exacto = inteiro >= 1_000_000 && inteiro % 1_000_000 === 0;
    const kz = inteiro === 1 ? 'um kwanza' : `${inteiroPorExtenso(inteiro)}${exacto ? ' de' : ''} kwanzas`;
    if (!centimos) return kz;
    const cts = `${inteiroPorExtenso(centimos)} ${centimos === 1 ? 'cêntimo' : 'cêntimos'}`;
    return inteiro ? `${kz} e ${cts}` : cts;
}

/** «1 de setembro de 2022» a partir de AAAA-MM-DD. */
export function dataPorExtenso(data: string | null | undefined): string {
    const m = /^(\d{4})-(\d{2})-(\d{2})/u.exec(String(data || ''));
    if (!m) return '____________________';
    return `${Number(m[3])} de ${MESES[Number(m[2]) - 1]} de ${m[1]}`;
}

/** Valor em Kz com separadores de Angola (1.119.686,00). */
export const valorKz = (minor: number) => (Math.round(minor) / 100).toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: true }).replace(/\s/gu, '.');

const LINHA = '____________________';
const vazio = (v: string | null | undefined) => (v && String(v).trim() ? String(v).trim() : LINHA);

export type DadosServico = {
    empresa: string; sexo?: string | null; nome: string; bi?: string | null; nif?: string | null; admissao?: string | null; numero: string;
    cargo?: string | null; departamento?: string | null; tipoContrato?: string | null; salarioBaseMinor?: number | null;
};

const TIPO_CONTRATO: Record<string, string> = { indeterminado: 'por tempo indeterminado', determinado: 'por tempo determinado', a_termo: 'a termo certo', estagio: 'de estágio' };
export const tipoContratoPorExtenso = (tipo?: string | null) => (tipo ? TIPO_CONTRATO[tipo] || tipo : LINHA);

/** Parágrafos do modelo «Declaração de serviço e salário». */
export function textoDeclaracaoServico(d: DadosServico): string {
    const feminino = String(d.sexo || '').toUpperCase().startsWith('F');
    const salario = d.salarioBaseMinor ? `Kz ${valorKz(d.salarioBaseMinor)} (${kwanzasPorExtenso(d.salarioBaseMinor)})` : `Kz ${LINHA}`;
    return [
        `A ${d.empresa}, declara, para os devidos efeitos, que ${feminino ? 'a Senhora' : 'o Senhor'} ${d.nome}, titular do Bilhete de Identidade n.º ${vazio(d.bi)} e ${feminino ? 'inscrita' : 'inscrito'} no NIF sob o n.º ${vazio(d.nif)}, presta serviço nesta empresa desde ${dataPorExtenso(d.admissao)}, com o número mecanográfico ${d.numero}.`,
        `${feminino ? 'A trabalhadora' : 'O trabalhador'} exerce as funções de ${vazio(d.cargo)}${d.departamento ? ` no departamento de ${d.departamento}` : ''}, ao abrigo de contrato de trabalho ${tipoContratoPorExtenso(d.tipoContrato)}, auferindo o salário base mensal de ${salario}.`,
        'Por corresponder à verdade, emite-se a presente declaração para os fins tidos por convenientes.',
    ].join('\n\n');
}

export type DadosInstituicao = {
    empresa: string; morada?: string | null; nifEmpresa?: string | null; representante?: string | null; cargoRepresentante?: string | null;
    factos?: string | null; instituicao?: string | null; finalidade?: string | null; anexos?: string | null;
};

/** Parágrafos do modelo «Declaração para outras instituições». */
export function textoDeclaracaoInstituicao(d: DadosInstituicao): string {
    return [
        `A ${d.empresa}, com sede em ${vazio(d.morada)}, titular do NIF ${vazio(d.nifEmpresa)}, neste acto representada por ${vazio(d.representante)}, na qualidade de ${vazio(d.cargoRepresentante)}, declara, para os devidos efeitos, que:`,
        vazio(d.factos),
        `A presente declaração destina-se a ser apresentada junto de ${vazio(d.instituicao)}, para efeitos de ${vazio(d.finalidade)}.${d.anexos && d.anexos.trim() ? ` ${d.anexos.trim()}` : ''}`,
        'Por corresponder à verdade, é emitida a presente declaração para os fins acima indicados.',
    ].join('\n\n');
}

/** Factos sugeridos quando a declaração é sobre um funcionário (o utilizador pode reescrever). */
export function factosDoFuncionario(d: DadosServico): string {
    const feminino = String(d.sexo || '').toUpperCase().startsWith('F');
    return `${feminino ? 'A Senhora' : 'O Senhor'} ${d.nome}, titular do Bilhete de Identidade n.º ${vazio(d.bi)}, é ${feminino ? 'trabalhadora' : 'trabalhador'} desta empresa desde ${dataPorExtenso(d.admissao)}, com o número mecanográfico ${d.numero}, exercendo as funções de ${vazio(d.cargo)}${d.departamento ? ` no departamento de ${d.departamento}` : ''}, com contrato de trabalho ${tipoContratoPorExtenso(d.tipoContrato)}.`;
}
