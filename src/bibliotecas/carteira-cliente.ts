// Carteira do cliente (comum, aposentado ou estrangeiro). Os clientes registados antes de a carteira ser gravada não a
// têm: é deduzida do que ficou guardado, sem escrever nada, e a escolhida na edição prevalece sempre.

export type ClientCategory = 'COMUM' | 'APOSENTADO' | 'ESTRANGEIRO';

export const CLIENT_CATEGORIES: Array<{ value: ClientCategory; label: string }> = [
    { value: 'COMUM', label: 'Cliente comum' },
    { value: 'APOSENTADO', label: 'Aposentado' },
    { value: 'ESTRANGEIRO', label: 'Estrangeiro' },
];

type ClientRow = {
    clientCategory?: string | null;
    clientType?: string | null;
    documentType?: string | null;
    nif?: string | null;
    socialSecurityNumber?: string | null;
    workInstitution?: string | null;
    employmentSector?: string | null;
};

const filled = (value: unknown) => String(value ?? '').trim() !== '';
const isCategory = (value: unknown): value is ClientCategory => CLIENT_CATEGORIES.some(item => item.value === value);

/** Parece um passaporte: 6 a 12 letras e algarismos, com os dois. O BI tem 14 caracteres e o NIF de empresa só algarismos. */
const looksLikePassport = (nif: unknown) => {
    const value = String(nif ?? '').trim().toUpperCase();
    if (value.startsWith('SEM')) return false;
    return /^[A-Z0-9]{6,12}$/.test(value) && /[A-Z]/.test(value) && /\d/.test(value);
};

export function clientCategoryOf(row: ClientRow): ClientCategory {
    if (isCategory(row.clientCategory)) return row.clientCategory;
    if (row.documentType === 'PASSAPORTE') return 'ESTRANGEIRO';
    if (row.clientType === 'EMPRESA') return 'COMUM';
    // Até aqui, a segurança social e a instituição só eram pedidas na carteira de aposentados. A instituição de um
    // cliente com sector de actividade é o emprego actual, por isso não conta.
    if (filled(row.socialSecurityNumber) || (filled(row.workInstitution) && !filled(row.employmentSector))) return 'APOSENTADO';
    return looksLikePassport(row.nif) ? 'ESTRANGEIRO' : 'COMUM';
}
