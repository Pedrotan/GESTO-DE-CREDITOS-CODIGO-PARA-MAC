// Listagens do sistema: o registo mais recente aparece primeiro (pela data de registo).

/** Instante de uma data (Date, ISO ou AAAA-MM-DD); sem data válida, -Infinity (fica no fim da lista). */
export const instante = (valor: unknown): number => {
    const tempo = valor instanceof Date ? valor.getTime() : Date.parse(String(valor ?? ''));
    return Number.isFinite(tempo) ? tempo : -Infinity;
};

/** Comparador «mais recente primeiro»; empates mantêm a ordem que tinham. */
export const porMaisRecente = <T>(data: (item: T) => unknown) => (a: T, b: T) => {
    const x = instante(data(a));
    const y = instante(data(b));
    return x === y ? 0 : x > y ? -1 : 1;
};

/** Cópia da lista com o registo mais recente primeiro. */
export const maisRecentePrimeiro = <T>(itens: readonly T[], data: (item: T) => unknown): T[] => [...itens].sort(porMaisRecente(data));
