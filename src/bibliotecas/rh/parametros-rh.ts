// Parâmetros e tabelas com vigência: o sistema usa sempre o valor em vigor na data do processamento.

export type ParametroRH = { id: string; chave: string; valor: string; descricao?: string | null; vigencia_inicio: string; vigencia_fim?: string | null };
export type IrtTabela = { id: string; ano: number; lei_referencia: string; vigencia_inicio: string; vigencia_fim?: string | null };
export type IrtEscalao = { id?: string; tabela_id?: string; ordem: number; limite_inferior_minor: number; limite_superior_minor: number | null; parcela_fixa_minor: number; taxa: number };

const emVigor = (inicio: string, fim: string | null | undefined, data: string) =>
    inicio.slice(0, 10) <= data.slice(0, 10) && (!fim || fim.slice(0, 10) >= data.slice(0, 10));

/** Linha do parâmetro em vigor na data (a de início mais recente, se houver várias). */
export function parametroEmVigor(parametros: ParametroRH[], chave: string, data: string): ParametroRH | undefined {
    return parametros
        .filter(p => p.chave === chave && emVigor(p.vigencia_inicio, p.vigencia_fim, data))
        .sort((a, b) => b.vigencia_inicio.localeCompare(a.vigencia_inicio))[0];
}

export function valorNumerico(parametros: ParametroRH[], chave: string, data: string, omissao: number): number {
    const texto = parametroEmVigor(parametros, chave, data)?.valor;
    const valor = Number(String(texto ?? '').replace(',', '.'));
    return texto !== undefined && texto.trim() !== '' && Number.isFinite(valor) ? valor : omissao;
}

export function valorTexto(parametros: ParametroRH[], chave: string, data: string, omissao: string): string {
    return parametroEmVigor(parametros, chave, data)?.valor ?? omissao;
}

export function tabelaIrtEmVigor(tabelas: IrtTabela[], data: string): IrtTabela | undefined {
    return tabelas.filter(t => emVigor(t.vigencia_inicio, t.vigencia_fim, data))
        .sort((a, b) => b.vigencia_inicio.localeCompare(a.vigencia_inicio))[0];
}

/** Valida os escalões de uma tabela nova: contínuos, crescentes, só o último sem limite superior. */
export function validarEscaloes(escaloes: IrtEscalao[]): string[] {
    const erros: string[] = [];
    const lista = [...escaloes].sort((a, b) => a.ordem - b.ordem);
    if (lista.length === 0) return ['A tabela tem de ter pelo menos um escalão.'];
    if (lista[0].limite_inferior_minor !== 0) erros.push('O 1.º escalão tem de começar em 0.');
    lista.forEach((e, i) => {
        const ultimo = i === lista.length - 1;
        if (e.taxa < 0 || e.taxa > 1) erros.push(`Escalão ${i + 1}: taxa inválida.`);
        if (e.parcela_fixa_minor < 0) erros.push(`Escalão ${i + 1}: parcela fixa inválida.`);
        if (!ultimo && e.limite_superior_minor === null) erros.push(`Escalão ${i + 1}: só o último pode não ter limite.`);
        if (e.limite_superior_minor !== null && e.limite_superior_minor <= e.limite_inferior_minor) erros.push(`Escalão ${i + 1}: o limite superior tem de ser maior do que o inferior.`);
        if (!ultimo && e.limite_superior_minor !== lista[i + 1].limite_inferior_minor) erros.push(`Escalão ${i + 2}: tem de começar onde acaba o anterior.`);
    });
    return erros;
}
