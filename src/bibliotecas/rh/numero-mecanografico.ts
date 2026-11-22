// Número mecanográfico dos funcionários: formato definido nas Configurações de RH.
//  - «sigla»: 4 algarismos aleatórios, a sigla da empresa e mais 4 algarismos aleatórios (ex.: 4821-BRV-0937);
//  - «sequencial»: o formato antigo, 0001, 0002…
// Os números já atribuídos nunca mudam: o formato só se aplica aos funcionários novos.

export type FormatoNumero = 'sigla' | 'sequencial';

/** Chaves das definições guardadas em rh_parametro (sincronizadas entre dispositivos como os outros parâmetros). */
export const CHAVE_FORMATO_NUMERO = 'numero_mecanografico_formato';
export const CHAVE_SIGLA_EMPRESA = 'numero_mecanografico_sigla';
export const CHAVES_NUMERACAO = new Set([CHAVE_FORMATO_NUMERO, CHAVE_SIGLA_EMPRESA]);

export const FORMATO_OMISSAO: FormatoNumero = 'sigla';
export const SIGLA_REGEX = /^[A-Z0-9]{2,5}$/u;

// Palavras que não entram na sigla: artigos, preposições e formas jurídicas.
const IGNORAR = new Set(['DE', 'DA', 'DO', 'DAS', 'DOS', 'E', 'EM', 'A', 'O', 'AS', 'OS', 'LDA', 'LIMITADA', 'SA', 'SU', 'S', 'U', 'EP', 'UNIPESSOAL', 'SOCIEDADE', 'COMERCIAL']);

const semAcentos = (texto: string) => texto.normalize('NFD').replace(/[̀-ͯ]/gu, '');

/**
 * Sigla sugerida a partir do nome da empresa: usa só a parte antes de « - », «,» ou «(» (o nome comercial),
 * sem artigos nem forma jurídica. Uma palavra dá a primeira letra e as consoantes seguintes (BRAVALDO → BRV);
 * duas palavras dão as iniciais e a consoante seguinte da segunda; três ou mais dão as iniciais das três primeiras.
 */
export function sugerirSigla(nomeEmpresa: string | null | undefined): string {
    const base = semAcentos(String(nomeEmpresa || '')).toUpperCase().split(/\s+-\s+|[,(]/u)[0] || '';
    const palavras = base.split(/[^A-Z0-9]+/u).filter(p => p && !IGNORAR.has(p));
    if (!palavras.length) return 'EMP';
    const consoantes = (p: string) => p.slice(1).replace(/[AEIOU0-9]/gu, '');
    if (palavras.length >= 3) return palavras.slice(0, 3).map(p => p[0]).join('');
    if (palavras.length === 2) {
        const [a, b] = palavras;
        return `${a[0]}${b[0]}${consoantes(b)[0] || b[1] || a[1] || ''}`.slice(0, 3);
    }
    const p = palavras[0];
    const sigla = `${p[0]}${consoantes(p).slice(0, 2)}`;
    return sigla.length >= 3 ? sigla : p.slice(0, 3);
}

/** Normaliza o que o utilizador escreve na sigla (maiúsculas, sem acentos nem espaços). */
export const normalizarSigla = (sigla: string | null | undefined) => semAcentos(String(sigla || '')).toUpperCase().replace(/[^A-Z0-9]/gu, '').slice(0, 5);

export function validarSigla(sigla: string): string | null {
    return SIGLA_REGEX.test(sigla) ? null : 'A sigla tem de ter 2 a 5 letras ou algarismos (ex.: BRV).';
}

/** Quatro algarismos aleatórios com o gerador criptográfico (0000 a 9999, sem enviesamento). */
function quatroAlgarismos(aleatorio: () => number): string {
    return String(aleatorio() % 10_000).padStart(4, '0');
}

const aleatorioSeguro = () => {
    // 2^32 não é múltiplo de 10 000: rejeita o resto para não favorecer os números mais baixos.
    const limite = Math.floor(0x1_0000_0000 / 10_000) * 10_000;
    const caixa = new Uint32Array(1);
    for (;;) {
        crypto.getRandomValues(caixa);
        if (caixa[0] < limite) return caixa[0];
    }
};

/** Número no formato 0000-SIGLA-0000. */
export function gerarNumeroComSigla(sigla: string, aleatorio: () => number = aleatorioSeguro): string {
    return `${quatroAlgarismos(aleatorio)}-${sigla}-${quatroAlgarismos(aleatorio)}`;
}

/** Diz se o número segue o formato com sigla (para a ajuda do formulário). */
export const eNumeroComSigla = (numero: string) => /^\d{4}-[A-Z0-9]{2,5}-\d{4}$/u.test(numero);

/**
 * Gera um número que ainda não existe. `existe` consulta a base local (todos os funcionários, também os cessados);
 * com 10^8 combinações por sigla a repetição é rara e, se acontecer, tenta outro.
 */
export async function gerarNumeroUnico(sigla: string, existe: (numero: string) => Promise<boolean>, aleatorio?: () => number, tentativas = 50): Promise<string> {
    for (let i = 0; i < tentativas; i += 1) {
        const numero = gerarNumeroComSigla(sigla, aleatorio);
        if (!(await existe(numero))) return numero;
    }
    throw new Error('Não foi possível gerar um n.º mecanográfico livre. Tente outra vez.');
}
