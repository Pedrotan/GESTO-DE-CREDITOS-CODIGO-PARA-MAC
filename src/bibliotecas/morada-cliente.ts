// Naturalidade e morada administrativa do cliente e do cônjuge (província, município, bairro, zona): campos
// obrigatórios no cadastro. Empresas não têm naturalidade; o cônjuge só quando os seus dados são fornecidos.

/** Províncias de Angola (divisão de 2024, 21 províncias): sugestões; o campo aceita outro texto. */
export const PROVINCIAS_ANGOLA = ['Bengo', 'Benguela', 'Bié', 'Cabinda', 'Cuando', 'Cubango', 'Cuanza Norte', 'Cuanza Sul', 'Cunene', 'Huambo', 'Huíla',
    'Icolo e Bengo', 'Luanda', 'Lunda Norte', 'Lunda Sul', 'Malanje', 'Moxico', 'Moxico Leste', 'Namibe', 'Uíge', 'Zaire'];

export type CampoMorada = 'birthPlace' | 'province' | 'municipality' | 'neighborhood' | 'zone';
export const CAMPOS_MORADA: Array<{ key: CampoMorada; label: string; placeholder: string; falta: string }> = [
    { key: 'birthPlace', label: 'Naturalidade', placeholder: 'Ex.: Luanda, Ingombota', falta: 'a naturalidade' },
    { key: 'province', label: 'Província', placeholder: 'Ex.: Luanda', falta: 'a província' },
    { key: 'municipality', label: 'Município', placeholder: 'Ex.: Belas', falta: 'o município' },
    { key: 'neighborhood', label: 'Bairro', placeholder: 'Ex.: Talatona', falta: 'o bairro' },
    { key: 'zone', label: 'Zona', placeholder: 'Ex.: Zona 2 / Rua 5', falta: 'a zona' },
];
export const campoConjuge = (key: CampoMorada) => `spouse${key[0].toUpperCase()}${key.slice(1)}`;

/** Campos de naturalidade e morada em falta: [campo, mensagem]. Empresas não têm naturalidade. */
export function validarNaturalidadeMorada(data: Record<string, any>, regras: { particular: boolean; conjuge: boolean }): Array<[string, string]> {
    const falta = (value: unknown) => !String(value ?? '').trim();
    const erros: Array<[string, string]> = [];
    for (const campo of CAMPOS_MORADA) {
        if (campo.key === 'birthPlace' && !regras.particular) continue;
        if (falta(data[campo.key])) erros.push([campo.key, `Indique ${campo.falta} do cliente.`]);
    }
    if (regras.conjuge) for (const campo of CAMPOS_MORADA) {
        if (falta(data[campoConjuge(campo.key)])) erros.push([campoConjuge(campo.key), `Indique ${campo.falta} do cônjuge.`]);
    }
    return erros;
}
