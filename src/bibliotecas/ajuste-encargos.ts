export type EncargoPrestacao = {
    id: string;
    status: string;
    interestMinor: number;
    lateInterestMinor: number;
    paidInterestMinor: number;
    paidLateInterestMinor: number;
    version: number;
};

export function planearAjusteEncargos(
    prestacoes: EncargoPrestacao[],
    deltaJuroMinor: number,
    deltaMoraMinor: number
): EncargoPrestacao[] {
    if (!Number.isSafeInteger(deltaJuroMinor) || !Number.isSafeInteger(deltaMoraMinor)) {
        throw new Error('O ajuste deve usar unidades monetárias inteiras.');
    }
    const resultado = prestacoes.map(item => ({ ...item }));
    const abertas = resultado.filter(item => item.status !== 'paid' && item.status !== 'cancelled');
    if (abertas.length === 0) throw new Error('Não há prestação aberta para receber o ajuste.');

    const aplicar = (coluna: 'interestMinor' | 'lateInterestMinor', paga: 'paidInterestMinor' | 'paidLateInterestMinor', delta: number) => {
        if (delta > 0) {
            abertas[abertas.length - 1][coluna] += delta;
        } else if (delta < 0) {
            let restante = -delta;
            for (const item of [...abertas].reverse()) {
                const disponivel = Math.max(0, item[coluna] - item[paga]);
                const retirada = Math.min(restante, disponivel);
                item[coluna] -= retirada;
                restante -= retirada;
                if (restante === 0) break;
            }
            if (restante > 0) throw new Error('O desconto excede os encargos ainda não pagos.');
        }
    };
    aplicar('interestMinor', 'paidInterestMinor', deltaJuroMinor);
    aplicar('lateInterestMinor', 'paidLateInterestMinor', deltaMoraMinor);
    return resultado.filter((item, index) =>
        item.interestMinor !== prestacoes[index].interestMinor ||
        item.lateInterestMinor !== prestacoes[index].lateInterestMinor);
}
