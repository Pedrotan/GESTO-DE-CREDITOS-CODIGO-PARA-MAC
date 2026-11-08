// Local de trabalho do cliente particular: o sector escolhido decide os campos pedidos. No sector público pede-se o
// ministério e a instituição; no privado, a empresa e o seu NIF. A instituição usa a coluna existente workInstitution.

export type EmploymentSector = 'PUBLICO' | 'PRIVADO';

export type WorkplaceFields = {
    employmentSector?: string | null;
    ministry?: string | null;
    workInstitution?: string | null;
    employerNif?: string | null;
    workPosition?: string | null;
};

export const EMPLOYMENT_SECTORS: Array<{ value: EmploymentSector; label: string }> = [
    { value: 'PUBLICO', label: 'Instituição pública' },
    { value: 'PRIVADO', label: 'Instituição privada' },
];

/** Sugestões para o campo Ministério; o texto continua livre, porque os nomes dos ministérios mudam. */
export const MINISTRY_SUGGESTIONS = [
    'Ministério da Educação',
    'Ministério da Saúde',
    'Ministério das Finanças',
    'Ministério do Interior',
    'Ministério da Defesa Nacional',
    'Ministério da Justiça e dos Direitos Humanos',
    'Ministério da Administração do Território',
    'Ministério do Ensino Superior, Ciência, Tecnologia e Inovação',
];

const clean = (value: unknown) => String(value ?? '').trim();

/** Campos que deixam de se aplicar ao mudar de sector: limpam-se para não ficarem dados do sector anterior. */
export const fieldsToClearOnSectorChange = (sector: string): Array<keyof WorkplaceFields> =>
    sector === 'PUBLICO' ? ['employerNif'] : sector === 'PRIVADO' ? ['ministry'] : ['ministry', 'employerNif', 'workInstitution', 'workPosition'];

/** Campos em falta: [campo, mensagem]. O sector é opcional (nem todos os clientes têm emprego). */
export function validateWorkplace(data: WorkplaceFields): Array<[keyof WorkplaceFields, string]> {
    const missing: Array<[keyof WorkplaceFields, string]> = [];
    if (data.employmentSector === 'PUBLICO') {
        if (!clean(data.ministry)) missing.push(['ministry', 'Indique o ministério.']);
        if (!clean(data.workInstitution)) missing.push(['workInstitution', 'Indique a instituição onde trabalha.']);
    } else if (data.employmentSector === 'PRIVADO') {
        if (!clean(data.workInstitution)) missing.push(['workInstitution', 'Indique a empresa onde trabalha.']);
    }
    return missing;
}

/** Texto para fichas e relatórios, com o que estiver preenchido. */
export function describeWorkplace(data: WorkplaceFields): string {
    const parts = data.employmentSector === 'PUBLICO'
        ? [clean(data.workInstitution), clean(data.ministry)]
        : [clean(data.workInstitution), clean(data.employerNif) && `NIF ${clean(data.employerNif)}`];
    const sector = EMPLOYMENT_SECTORS.find(item => item.value === data.employmentSector)?.label;
    const place = parts.filter(Boolean).join(' · ');
    const position = clean(data.workPosition);
    return [position, place, sector && `(${sector})`].filter(Boolean).join(position && place ? ' — ' : ' ').replace(' — (', ' (');
}
