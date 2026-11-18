// Modelos de declaração editáveis (Configurações › Modelos de declaração): texto com variáveis {{nome}}, {{bi}}…
// substituídas pelos dados do funcionário e da empresa. Função pura, testável.

export type VariavelModelo = { chave: string; descricao: string; exemplo: string };
export const VARIAVEIS_MODELO: VariavelModelo[] = [
    { chave: 'nome', descricao: 'Nome completo', exemplo: 'Pedro de Morais Tango' },
    { chave: 'numero', descricao: 'N.º mecanográfico', exemplo: '99445110' },
    { chave: 'bi', descricao: 'N.º do BI', exemplo: '002658949BA031' },
    { chave: 'nif', descricao: 'NIF', exemplo: '002658949BA031' },
    { chave: 'nacionalidade', descricao: 'Nacionalidade', exemplo: 'Angolana' },
    { chave: 'cargo', descricao: 'Cargo', exemplo: 'Chefe de Secção' },
    { chave: 'departamento', descricao: 'Departamento', exemplo: 'Administração' },
    { chave: 'vinculo', descricao: 'Vínculo', exemplo: 'Comissão de Serviço' },
    { chave: 'categoria', descricao: 'Categoria', exemplo: 'Técnico Médio' },
    { chave: 'data_admissao', descricao: 'Data de admissão', exemplo: '01/09/2022' },
    { chave: 'antiguidade', descricao: 'Antiguidade', exemplo: '4 anos e 2 meses' },
    { chave: 'tipo_contrato', descricao: 'Tipo de contrato', exemplo: 'por tempo indeterminado' },
    { chave: 'salario_base', descricao: 'Salário base', exemplo: '362 147,20 Kz' },
    { chave: 'finalidade', descricao: 'Finalidade indicada ao gerar', exemplo: 'abertura de conta bancária' },
    { chave: 'empresa', descricao: 'Nome da empresa', exemplo: 'Bravaldo - Comércio e Serviços, Lda' },
    { chave: 'nif_empresa', descricao: 'NIF da empresa', exemplo: '5001032771' },
    { chave: 'morada_empresa', descricao: 'Morada da empresa', exemplo: 'Benguela' },
    { chave: 'data_hoje', descricao: 'Data de hoje', exemplo: '18/11/2026' },
];

/** Texto do modelo inicial «Declaração de serviço» (o mesmo conteúdo que o sistema já emitia). */
export const MODELO_DECLARACAO_SERVICO = 'Para os devidos efeitos{{#finalidade}} ({{finalidade}}){{/finalidade}}, declara-se que {{nome}}, portador(a) do BI n.º {{bi}}, '
    + 'NIF {{nif}}, presta serviço em {{empresa}} desde {{data_admissao}}, com o n.º mecanográfico {{numero}}, exercendo as funções de {{cargo}}'
    + '{{#departamento}} no departamento {{departamento}}{{/departamento}}, com contrato {{tipo_contrato}} e o salário base mensal de {{salario_base}}.\n\n'
    + 'Por ser verdade, passa-se a presente declaração, que vai assinada e autenticada.';

/**
 * Substitui {{variavel}} pelos valores (os que faltam ficam «—») e trata os blocos condicionais
 * {{#variavel}}…{{/variavel}}, que só aparecem quando a variável tem valor.
 */
export function aplicarModelo(texto: string, valores: Record<string, string | null | undefined>) {
    const tem = (k: string) => Boolean(valores[k] && String(valores[k]).trim());
    const semBlocos = texto.replace(/\{\{#\s*([a-z_]+)\s*\}\}([\s\S]*?)\{\{\/\s*\1\s*\}\}/gu, (_m, k: string, dentro: string) => (tem(k) ? dentro : ''));
    return semBlocos.replace(/\{\{\s*([a-z_]+)\s*\}\}/gu, (_m, k: string) => (tem(k) ? String(valores[k]).trim() : '—'));
}

/** Variáveis usadas no texto que não existem (para avisar no editor). */
export function variaveisDesconhecidas(texto: string) {
    const conhecidas = new Set(VARIAVEIS_MODELO.map(v => v.chave));
    return [...new Set([...texto.matchAll(/\{\{\s*[#/]?\s*([a-z_]+)\s*\}\}/gu)].map(m => m[1]))].filter(k => !conhecidas.has(k));
}
