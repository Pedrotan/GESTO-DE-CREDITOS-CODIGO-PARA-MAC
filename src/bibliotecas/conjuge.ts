// Dados do cônjuge no cadastro de clientes. Em Angola, casados em comunhão de bens (ou em união de facto)
// respondem solidariamente pela dívida, por isso a identificação do cônjuge é pedida; o cliente pode recusar
// («Ignorar»), e essa recusa fica registada com data e utilizador. Quando os dados são preenchidos, fica
// registado o consentimento para o tratamento (Lei n.º 22/11, da Protecção de Dados Pessoais).

export const MARITAL_WITH_SPOUSE = ['CASADO', 'UNIAO_DE_FACTO'];

export const SPOUSE_TEXT_FIELDS = ['spouseName', 'spouseBi', 'spouseNif', 'spousePhone', 'spouseEmail', 'spouseBirthDate', 'spouseOccupation'] as const;

export type SpouseFields = {
    maritalStatus?: string | null;
    spouseName?: string | null;
    spouseBi?: string | null;
    spouseNif?: string | null;
    spousePhone?: string | null;
    spouseEmail?: string | null;
    spouseBirthDate?: string | null;
    spouseOccupation?: string | null;
    spouseIncome?: number | null;
    spouseDataRefused?: boolean | number | null;
    spouseDataRefusedAt?: string | null;
    spouseDataRefusedBy?: string | null;
    spouseConsentAt?: string | null;
    spouseConsentBy?: string | null;
};

export const needsSpouse = (maritalStatus: string | null | undefined) => MARITAL_WITH_SPOUSE.includes(String(maritalStatus || '').toUpperCase());

const hasSpouseData = (data: SpouseFields) => SPOUSE_TEXT_FIELDS.some(field => String(data[field] ?? '').trim()) || Number(data.spouseIncome) > 0;
const refused = (data: SpouseFields) => data.spouseDataRefused === true || data.spouseDataRefused === 1;

export type SpouseDataStatus = 'not_applicable' | 'provided' | 'refused' | 'missing';

/** Estado mostrado na ficha do cliente. */
export function spouseDataStatus(data: SpouseFields): SpouseDataStatus {
    if (!needsSpouse(data.maritalStatus)) return 'not_applicable';
    if (refused(data)) return 'refused';
    return hasSpouseData(data) ? 'provided' : 'missing';
}

export const SPOUSE_STATUS_LABELS: Record<SpouseDataStatus, string> = {
    not_applicable: 'Não aplicável',
    provided: 'Preenchidos',
    refused: 'Não fornecidos pelo cliente',
    missing: 'Por preencher',
};

/**
 * Campos do cônjuge a gravar. Estado civil sem cônjuge: tudo apagado (não se guardam dados do cônjuge).
 * Recusa: dados apagados e recusa registada (mantém a data/utilizador da primeira recusa).
 * Dados preenchidos: recusa anulada e consentimento registado (mantém o primeiro registo).
 */
export function spouseFieldsToSave(data: SpouseFields, previous: SpouseFields | null | undefined, actorName: string, now = new Date()): Required<Omit<SpouseFields, 'maritalStatus'>> {
    const empty = {
        spouseName: '', spouseBi: '', spouseNif: '', spousePhone: '', spouseEmail: '', spouseBirthDate: '', spouseOccupation: '', spouseIncome: 0,
    };
    if (!needsSpouse(data.maritalStatus)) {
        return { ...empty, spouseDataRefused: false, spouseDataRefusedAt: '', spouseDataRefusedBy: '', spouseConsentAt: '', spouseConsentBy: '' };
    }
    if (refused(data)) {
        const keep = previous && refused(previous) && previous.spouseDataRefusedAt;
        return {
            ...empty, spouseDataRefused: true,
            spouseDataRefusedAt: keep ? String(previous!.spouseDataRefusedAt) : now.toISOString(),
            spouseDataRefusedBy: keep ? String(previous!.spouseDataRefusedBy || actorName) : actorName,
            spouseConsentAt: '', spouseConsentBy: '',
        };
    }
    const filled = hasSpouseData(data);
    return {
        spouseName: String(data.spouseName || '').trim(),
        spouseBi: String(data.spouseBi || '').trim(),
        spouseNif: String(data.spouseNif || '').trim(),
        spousePhone: String(data.spousePhone || '').trim(),
        spouseEmail: String(data.spouseEmail || '').trim(),
        spouseBirthDate: String(data.spouseBirthDate || '').trim(),
        spouseOccupation: String(data.spouseOccupation || '').trim(),
        spouseIncome: Math.max(0, Number(data.spouseIncome) || 0),
        spouseDataRefused: false, spouseDataRefusedAt: '', spouseDataRefusedBy: '',
        spouseConsentAt: filled ? String(previous?.spouseConsentAt || now.toISOString()) : '',
        spouseConsentBy: filled ? String(previous?.spouseConsentBy || actorName) : '',
    };
}
