// Valores por extenso em português (usado nos contratos: "duzentos mil kwanzas").

const UNIDADES = ['zero', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze', 'treze',
    'catorze', 'quinze', 'dezasseis', 'dezassete', 'dezoito', 'dezanove'];
const DEZENAS = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
const CENTENAS = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];
const ESCALAS: Array<[string, string]> = [['', ''], ['mil', 'mil'], ['milhão', 'milhões'], ['mil milhões', 'mil milhões'], ['bilião', 'biliões']];

/** Número de 0 a 999 por extenso. */
const ate999 = (n: number): string => {
    if (n < 20) return UNIDADES[n];
    if (n < 100) return DEZENAS[Math.floor(n / 10)] + (n % 10 ? ` e ${UNIDADES[n % 10]}` : '');
    if (n === 100) return 'cem';
    return CENTENAS[Math.floor(n / 100)] + (n % 100 ? ` e ${ate999(n % 100)}` : '');
};

/** Inteiro não negativo por extenso ("1 250 300" → "um milhão duzentos e cinquenta mil e trezentos"). */
export const inteiroPorExtenso = (valor: number): string => {
    let n = Math.floor(Math.abs(Number(valor) || 0));
    if (n === 0) return 'zero';
    const grupos: number[] = [];
    while (n > 0) { grupos.push(n % 1000); n = Math.floor(n / 1000); }
    const partes: Array<{ texto: string; grupo: number }> = [];
    for (let i = grupos.length - 1; i >= 0; i--) {
        const g = grupos[i];
        if (!g) continue;
        const [singular, plural] = ESCALAS[i] || ESCALAS[ESCALAS.length - 1];
        // "mil" e não "um mil".
        const numero = i === 1 && g === 1 ? '' : ate999(g);
        const escala = i === 0 ? '' : (g === 1 ? singular : plural);
        partes.push({ texto: [numero, escala].filter(Boolean).join(' '), grupo: g });
    }
    // O último grupo liga-se com "e" quando é inferior a 100 ou uma centena exacta ("mil e quinhentos").
    return partes.map((parte, index) => {
        if (index === 0) return parte.texto;
        const ultimo = index === partes.length - 1;
        const liga = ultimo && (parte.grupo < 100 || parte.grupo % 100 === 0);
        return `${liga ? 'e ' : ''}${parte.texto}`;
    }).join(' ');
};

/** Montante em kwanzas por extenso, com cêntimos quando existem ("vinte mil e oitocentos kwanzas"). */
export const kwanzasPorExtenso = (valor: number): string => {
    const total = Math.round(Math.abs(Number(valor) || 0) * 100);
    const inteiro = Math.floor(total / 100);
    const centimos = total % 100;
    const milhoes = inteiro >= 1_000_000 && inteiro % 1_000_000 === 0;
    const kz = `${inteiroPorExtenso(inteiro)}${milhoes ? ' de' : ''} ${inteiro === 1 ? 'kwanza' : 'kwanzas'}`;
    if (!centimos) return kz;
    return `${kz} e ${inteiroPorExtenso(centimos)} ${centimos === 1 ? 'cêntimo' : 'cêntimos'}`;
};
