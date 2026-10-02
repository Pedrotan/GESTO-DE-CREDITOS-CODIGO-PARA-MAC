// Tabela de taxas de juro por prazo (meses) usada na emissão de créditos.
// Cada escalão cobre um intervalo de meses; ao escolher um escalão o contrato fica com `months` meses.

export interface InterestTier {
    id: string;
    minMonths: number;
    maxMonths: number;
    rate: number;
}

export const DEFAULT_INTEREST_TIERS: InterestTier[] = [
    { id: '1m', minMonths: 1, maxMonths: 1, rate: 35 },
    { id: '2m', minMonths: 2, maxMonths: 2, rate: 50 },
    { id: '3m', minMonths: 3, maxMonths: 3, rate: 60 },
    { id: '4-5m', minMonths: 4, maxMonths: 5, rate: 70 },
    { id: '6-8m', minMonths: 6, maxMonths: 8, rate: 80 },
    { id: '9-10m', minMonths: 9, maxMonths: 10, rate: 100 },
];

export const MAX_INTEREST_TIERS = 12;

// Perfis que podem alterar a tabela de taxas.
export const canManageInterestTiers = (role: string | undefined | null): boolean =>
    role === 'super_admin' || role === 'admin' || role === 'manager';

export const tierPeriodLabel = (tier: Pick<InterestTier, 'minMonths' | 'maxMonths'>): string => {
    const range = tier.minMonths === tier.maxMonths ? `${tier.minMonths}` : `${tier.minMonths}-${tier.maxMonths}`;
    return `${range} ${tier.maxMonths === 1 ? 'Mês' : 'Meses'}`;
};

export const tierLabel = (tier: InterestTier): string => `${tierPeriodLabel(tier)} (${tier.rate}%)`;

// Prazo aplicado ao escolher o escalão: o limite superior do intervalo.
export const tierMonths = (tier: InterestTier): number => tier.maxMonths;

/** Valida a tabela e devolve a mensagem do primeiro problema encontrado, ou null. */
export const validateInterestTiers = (tiers: InterestTier[]): string | null => {
    if (tiers.length === 0) return 'Defina pelo menos um escalão de taxa.';
    if (tiers.length > MAX_INTEREST_TIERS) return `Máximo de ${MAX_INTEREST_TIERS} escalões.`;
    const sorted = [...tiers].sort((a, b) => a.minMonths - b.minMonths);
    for (let i = 0; i < sorted.length; i++) {
        const t = sorted[i];
        if (!Number.isInteger(t.minMonths) || !Number.isInteger(t.maxMonths) || t.minMonths < 1 || t.maxMonths > 120) {
            return 'Os meses devem ser números inteiros entre 1 e 120.';
        }
        if (t.maxMonths < t.minMonths) return `No escalão ${tierPeriodLabel(t)}, o mês final é menor que o inicial.`;
        if (!Number.isFinite(t.rate) || t.rate < 0 || t.rate > 1000) return 'As taxas devem estar entre 0% e 1000%.';
        const prev = sorted[i - 1];
        if (prev && t.minMonths <= prev.maxMonths) {
            return `Os escalões ${tierPeriodLabel(prev)} e ${tierPeriodLabel(t)} sobrepõem-se.`;
        }
    }
    return null;
};

/** Aceita o valor guardado (JSON ou array) e devolve uma tabela válida e ordenada, ou a tabela padrão. */
export const normalizeInterestTiers = (value: unknown): InterestTier[] => {
    let raw: unknown = value;
    if (typeof raw === 'string') {
        try { raw = JSON.parse(raw); } catch { return DEFAULT_INTEREST_TIERS; }
    }
    if (!Array.isArray(raw)) return DEFAULT_INTEREST_TIERS;
    const tiers: InterestTier[] = raw.map((item, index) => {
        const t = (item ?? {}) as Record<string, unknown>;
        return {
            id: typeof t.id === 'string' && t.id ? t.id : `tier-${index}`,
            minMonths: Number(t.minMonths),
            maxMonths: Number(t.maxMonths),
            rate: Number(t.rate),
        };
    });
    if (validateInterestTiers(tiers)) return DEFAULT_INTEREST_TIERS;
    return tiers.sort((a, b) => a.minMonths - b.minMonths);
};

/** Escalão que cobre o prazo; prazos acima do último escalão usam o último. */
export const tierForMonths = (tiers: InterestTier[], months: number): InterestTier | undefined => {
    if (!Number.isFinite(months) || months < 1 || tiers.length === 0) return undefined;
    const match = tiers.find(t => months >= t.minMonths && months <= t.maxMonths);
    if (match) return match;
    const last = tiers[tiers.length - 1];
    return months > last.maxMonths ? last : undefined;
};
