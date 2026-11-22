import { CAMPOS_OMISSAO, type CampoExportacao, type FormatoExportacao, type Ordenacao } from '@/bibliotecas/contactos/agenda-contactos';

/** Opções de exportação lembradas por utilizador (só neste dispositivo). */
export type PreferenciasExportacao = { campos: CampoExportacao[]; formato: FormatoExportacao; ordenar: Ordenacao; orientacao: 'vertical' | 'horizontal'; cabecalhoEmpresa: boolean };
export const PREFERENCIAS_OMISSAO: PreferenciasExportacao = { campos: CAMPOS_OMISSAO, formato: 'pdf', ordenar: 'nome_asc', orientacao: 'vertical', cabecalhoEmpresa: true };

const chave = (utilizador: string) => `agenda-contactos:exportacao:${utilizador}`;

export function lerPreferencias(utilizador: string): PreferenciasExportacao {
    try {
        const v = JSON.parse(localStorage.getItem(chave(utilizador)) || 'null');
        return v && Array.isArray(v.campos) ? { ...PREFERENCIAS_OMISSAO, ...v } : PREFERENCIAS_OMISSAO;
    } catch { return PREFERENCIAS_OMISSAO; }
}

/** Os campos ficam sempre lembrados; o resto só quando o utilizador pede «Guardar como predefinição». */
export function guardarPreferencias(utilizador: string, p: PreferenciasExportacao, predefinicao: boolean) {
    const actual = lerPreferencias(utilizador);
    const nova = predefinicao ? p : { ...actual, campos: p.campos };
    try { localStorage.setItem(chave(utilizador), JSON.stringify(nova)); } catch { /* sem armazenamento local */ }
    return nova;
}
