// Alçadas (limites de transação) ao estilo bancário: limites por perfil e por tipo de operação, limites
// individuais, limites globais da empresa, regras por risco, cadeia de escalonamento com dupla aprovação
// acima do nível máximo, períodos de contagem no dia civil e mês civil de Angola, validação de coerência,
// diferenças entre versões e simulação de impacto. Funções puras: usadas pela interface, pelos serviços,
// pelo processo principal do Electron (verificação no servidor) e pelos testes.

import { luandaDateKey, luandaToUtc } from './fuso-angola.ts';

export type OperationType =
    | 'credit_approval' | 'disbursement' | 'cash_receipt' | 'payment_reversal'
    | 'interest_waiver' | 'accounting_reversal' | 'write_off' | 'client_export';

export type LimitField = 'perOperationMinor' | 'dailyMinor' | 'monthlyMinor' | 'perOperationCount' | 'dailyCount' | 'maxPercent';
export type LimitScope = 'user' | 'branch' | 'company';

/** Valores de um tipo de operação. null = sem teto nessa dimensão; ausente/`allowed: false` = bloqueado. */
export type LimitValues = {
    allowed: boolean;
    perOperationMinor?: number | null;
    dailyMinor?: number | null;
    monthlyMinor?: number | null;
    perOperationCount?: number | null;
    dailyCount?: number | null;
    maxPercent?: number | null;
};

export type ProfileLimits = {
    profileId: string;
    /** Desativar exige a aprovação de um segundo administrador e fica com aviso permanente. */
    enabled: boolean;
    /** Âmbito dos volumes diário e mensal: por utilizador, por agência (perfil + agência) ou empresa toda (perfil). */
    scope: LimitScope;
    ops: Partial<Record<OperationType, LimitValues>>;
};

export type ApprovalLevel = { id: string; name: string; profileIds: string[] };

export type UserOverride = {
    userId: string;
    userName: string;
    ops: Partial<Record<OperationType, Partial<LimitValues>>>;
    reason: string;
    setBy: string;
    setAt: string;
};

export type ProductLimit = { perOperationMinor: number | null; monthlyMinor: number | null };

export type GlobalLimits = {
    clientExposureMinor: number | null;
    groupExposureMinor: number | null;
    companyDailyDisbursementMinor: number | null;
    companyMonthlyDisbursementMinor: number | null;
    /** O volume diário de desembolsos nunca ultrapassa o saldo de caixa disponível. */
    linkToCash: boolean;
    regulatory: { enabled: boolean; ownFundsMinor: number; singleClientPct: number };
    products: Record<string, ProductLimit>;
};

export type RiskRules = {
    /** Nível mínimo para clientes de risco Alto (null = sem regra). */
    highRiskLevelId: string | null;
    /** Nível mínimo para clientes de risco Médio (null = sem regra). */
    mediumRiskLevelId: string | null;
    /** Taxa de esforço máxima (%); acima dela a aprovação sobe `effortBumpLevels` níveis. */
    effortLimitPct: number;
    effortBumpLevels: number;
};

export type Governance = {
    /** Aumentos acima desta percentagem exigem um segundo administrador. */
    secondApprovalIncreasePct: number;
    /** Percentagens de consumo que geram alerta ao utilizador e ao supervisor. */
    alertThresholds: number[];
};

export type LimitPolicy = {
    schema: 1;
    profiles: Record<string, ProfileLimits>;
    chain: { levels: ApprovalLevel[]; escalationHours: number };
    userOverrides: UserOverride[];
    global: GlobalLimits;
    risk: RiskRules;
    governance: Governance;
};

export type LimitException = {
    id: string;
    userId: string;
    userName: string;
    operationType: OperationType;
    perOperationMinor: number | null;
    dailyMinor: number | null;
    monthlyMinor: number | null;
    dailyCount: number | null;
    startsAt: string;
    endsAt: string;
    reason: string;
    status: 'pending' | 'approved' | 'rejected' | 'revoked';
    requestedBy: string;
    requestedByName: string;
    requestedAt: string;
    decidedBy?: string | null;
    decidedByName?: string | null;
    decidedAt?: string | null;
    decisionReason?: string | null;
};

export type LimitActor = { id: string; name: string; role: string; branchId?: string | null };

// ── Catálogo ─────────────────────────────────────────────────────────────────────

export const OPERATION_TYPES: Array<{ id: OperationType; label: string; short: string; rule: string; fields: LimitField[] }> = [
    { id: 'credit_approval', label: 'Aprovação de crédito', short: 'Aprovação', rule: 'Valor máximo de cada crédito aprovado sem subir na cadeia.', fields: ['perOperationMinor', 'dailyMinor', 'monthlyMinor'] },
    { id: 'disbursement', label: 'Desembolso', short: 'Desembolso', rule: 'Capital libertado por dia e por mês.', fields: ['perOperationMinor', 'dailyMinor', 'monthlyMinor'] },
    { id: 'cash_receipt', label: 'Recebimento em numerário', short: 'Numerário', rule: 'Acima do valor por operação, só por transferência.', fields: ['perOperationMinor', 'dailyMinor', 'monthlyMinor'] },
    { id: 'payment_reversal', label: 'Anulação de pagamento', short: 'Anulação', rule: 'Valor por anulação e número de anulações por dia.', fields: ['perOperationMinor', 'dailyMinor', 'monthlyMinor', 'dailyCount'] },
    { id: 'interest_waiver', label: 'Perdão de juros de mora / descontos', short: 'Perdão', rule: 'Percentagem e valor máximos perdoados por crédito.', fields: ['maxPercent', 'perOperationMinor', 'monthlyMinor'] },
    { id: 'accounting_reversal', label: 'Estorno contabilístico', short: 'Estorno', rule: 'Valor máximo de cada estorno aprovado.', fields: ['perOperationMinor', 'dailyMinor', 'monthlyMinor'] },
    { id: 'write_off', label: 'Abate de crédito', short: 'Abate', rule: 'Exige sempre dupla aprovação, seja qual for o valor.', fields: ['perOperationMinor'] },
    { id: 'client_export', label: 'Exportação de dados de clientes', short: 'Exportação', rule: 'Registos por exportação e exportações por dia.', fields: ['perOperationCount', 'dailyCount'] },
];
export const OPERATION_LABELS = Object.fromEntries(OPERATION_TYPES.map(item => [item.id, item.label])) as Record<OperationType, string>;

export const FIELD_LABELS: Record<LimitField, string> = {
    perOperationMinor: 'por operação', dailyMinor: 'volume diário', monthlyMinor: 'volume mensal',
    perOperationCount: 'registos por exportação', dailyCount: 'quantidade por dia', maxPercent: 'percentagem máxima',
};
export const SCOPE_LABELS: Record<LimitScope, string> = { user: 'Por utilizador', branch: 'Por agência', company: 'Empresa toda' };
export const isMoneyField = (field: LimitField) => field.endsWith('Minor');

const NO_CAP = 9_000_000_000_000_000;
const kz = (value: number) => Math.round(value * 100);

// ── Valores por omissão ──────────────────────────────────────────────────────────

const allow = (perOp: number | null, daily: number | null, monthly: number | null, extra: Partial<LimitValues> = {}): LimitValues => ({
    allowed: true, perOperationMinor: perOp === null ? null : kz(perOp), dailyMinor: daily === null ? null : kz(daily),
    monthlyMinor: monthly === null ? null : kz(monthly), ...extra,
});

export const DEFAULT_LEVELS: ApprovalLevel[] = [
    { id: 'gestor', name: 'Gestor', profileIds: ['manager', 'commercial_manager'] },
    { id: 'administrador', name: 'Administrador', profileIds: ['admin'] },
    { id: 'diretor', name: 'Diretor', profileIds: ['credit_director', 'super_admin'] },
];

export function defaultPolicy(seed?: { manager?: { maxTransaction: number; dailyLimit: number; monthlyLimit: number }; admin?: { maxTransaction: number; dailyLimit: number; monthlyLimit: number } }): LimitPolicy {
    const mgr = seed?.manager || { maxTransaction: 500_000, dailyLimit: 2_000_000, monthlyLimit: 10_000_000 };
    const adm = seed?.admin || { maxTransaction: 1_000_000, dailyLimit: 5_000_000, monthlyLimit: 20_000_000 };
    const profile = (profileId: string, scope: LimitScope, ops: ProfileLimits['ops']): ProfileLimits => ({ profileId, enabled: true, scope, ops });
    const credit = (perOp: number, daily: number, monthly: number) => ({
        credit_approval: allow(perOp, daily, monthly), disbursement: allow(perOp, daily, monthly),
    });
    return {
        schema: 1,
        profiles: {
            manager: profile('manager', 'user', {
                ...credit(mgr.maxTransaction, mgr.dailyLimit, mgr.monthlyLimit),
                cash_receipt: allow(500_000, 3_000_000, 30_000_000),
                payment_reversal: allow(100_000, 300_000, 2_000_000, { dailyCount: 3 }),
                interest_waiver: allow(50_000, null, 500_000, { maxPercent: 10 }),
                client_export: { allowed: true, perOperationCount: 100, dailyCount: 3 },
            }),
            commercial_manager: profile('commercial_manager', 'user', {
                ...credit(Math.min(300_000, mgr.maxTransaction), Math.min(1_500_000, mgr.dailyLimit), Math.min(6_000_000, mgr.monthlyLimit)),
                client_export: { allowed: true, perOperationCount: 100, dailyCount: 3 },
            }),
            admin: profile('admin', 'user', {
                ...credit(adm.maxTransaction, adm.dailyLimit, adm.monthlyLimit),
                cash_receipt: allow(1_000_000, 10_000_000, 60_000_000),
                payment_reversal: allow(500_000, 2_000_000, 10_000_000, { dailyCount: 10 }),
                interest_waiver: allow(250_000, null, 3_000_000, { maxPercent: 30 }),
                accounting_reversal: allow(1_000_000, 5_000_000, 20_000_000),
                write_off: allow(1_000_000, null, null),
                client_export: { allowed: true, perOperationCount: 1_000, dailyCount: 10 },
            }),
            credit_director: profile('credit_director', 'user', {
                ...credit(Math.max(5_000_000, adm.maxTransaction), Math.max(20_000_000, adm.dailyLimit), Math.max(80_000_000, adm.monthlyLimit)),
                cash_receipt: allow(2_000_000, 20_000_000, 100_000_000),
                payment_reversal: allow(2_000_000, 5_000_000, 30_000_000, { dailyCount: 20 }),
                interest_waiver: allow(1_000_000, null, 10_000_000, { maxPercent: 50 }),
                accounting_reversal: allow(5_000_000, 20_000_000, 80_000_000),
                write_off: allow(5_000_000, null, null),
                client_export: { allowed: true, perOperationCount: 5_000, dailyCount: 20 },
            }),
            super_admin: profile('super_admin', 'user', {
                ...credit(Math.max(5_000_000, adm.maxTransaction), Math.max(20_000_000, adm.dailyLimit), Math.max(80_000_000, adm.monthlyLimit)),
                cash_receipt: allow(2_000_000, 20_000_000, 100_000_000),
                payment_reversal: allow(2_000_000, 5_000_000, 30_000_000, { dailyCount: 20 }),
                interest_waiver: allow(1_000_000, null, 10_000_000, { maxPercent: 50 }),
                accounting_reversal: allow(5_000_000, 20_000_000, 80_000_000),
                write_off: allow(5_000_000, null, null),
                client_export: { allowed: true, perOperationCount: 10_000, dailyCount: 20 },
            }),
            cashier: profile('cashier', 'branch', { cash_receipt: allow(500_000, 5_000_000, 50_000_000) }),
            accountant: profile('accountant', 'company', {
                accounting_reversal: allow(500_000, 2_000_000, 10_000_000),
                client_export: { allowed: true, perOperationCount: 500, dailyCount: 5 },
            }),
            collection_officer: profile('collection_officer', 'user', { interest_waiver: allow(20_000, null, 200_000, { maxPercent: 5 }) }),
            risk_analyst: profile('risk_analyst', 'user', {
                cash_receipt: allow(500_000, 3_000_000, 30_000_000),
                client_export: { allowed: true, perOperationCount: 500, dailyCount: 5 },
            }),
            system_admin: profile('system_admin', 'user', {
                ...credit(adm.maxTransaction, adm.dailyLimit, adm.monthlyLimit),
                cash_receipt: allow(1_000_000, 10_000_000, 60_000_000),
                payment_reversal: allow(500_000, 2_000_000, 10_000_000, { dailyCount: 10 }),
                interest_waiver: allow(250_000, null, 3_000_000, { maxPercent: 30 }),
                accounting_reversal: allow(1_000_000, 5_000_000, 20_000_000),
                write_off: allow(1_000_000, null, null),
                client_export: { allowed: true, perOperationCount: 1_000, dailyCount: 10 },
            }),
            legal: profile('legal', 'user', {
                cash_receipt: allow(500_000, 3_000_000, 30_000_000),
                client_export: { allowed: true, perOperationCount: 500, dailyCount: 5 },
            }),
            internal_auditor: profile('internal_auditor', 'user', {
                client_export: { allowed: true, perOperationCount: 1_000, dailyCount: 10 },
            }),
        },
        chain: { levels: DEFAULT_LEVELS.map(level => ({ ...level, profileIds: [...level.profileIds] })), escalationHours: 24 },
        userOverrides: [],
        global: {
            clientExposureMinor: kz(15_000_000), groupExposureMinor: kz(30_000_000),
            companyDailyDisbursementMinor: kz(50_000_000), companyMonthlyDisbursementMinor: kz(500_000_000),
            linkToCash: true, regulatory: { enabled: false, ownFundsMinor: 0, singleClientPct: 25 }, products: {},
        },
        risk: { highRiskLevelId: 'diretor', mediumRiskLevelId: null, effortLimitPct: 33, effortBumpLevels: 1 },
        governance: { secondApprovalIncreasePct: 20, alertThresholds: [80, 100] },
    };
}

/** Lê e completa uma política guardada (versões antigas ganham os campos novos). */
export function parsePolicy(value: string | null | undefined): LimitPolicy {
    if (!value) return defaultPolicy();
    const parsed = JSON.parse(value) as Partial<LimitPolicy>;
    const base = defaultPolicy();
    return {
        schema: 1,
        profiles: parsed.profiles && typeof parsed.profiles === 'object' ? parsed.profiles : base.profiles,
        chain: { levels: parsed.chain?.levels?.length ? parsed.chain.levels : base.chain.levels, escalationHours: Number(parsed.chain?.escalationHours) > 0 ? Number(parsed.chain?.escalationHours) : base.chain.escalationHours },
        userOverrides: Array.isArray(parsed.userOverrides) ? parsed.userOverrides : [],
        global: { ...base.global, ...(parsed.global || {}), regulatory: { ...base.global.regulatory, ...(parsed.global?.regulatory || {}) }, products: parsed.global?.products || {} },
        risk: { ...base.risk, ...(parsed.risk || {}) },
        governance: { ...base.governance, ...(parsed.governance || {}) },
    };
}

/** Política activa a partir das versões guardadas (a mais recente já em vigor) e dos limites antigos. */
export function policyFromRows(rows: Array<{ policy: string; status: string; effectiveFrom: string; version: number }>, legacy: Array<{ role: string; maxTransaction: number; dailyLimit: number; monthlyLimit: number }>, now: Date = new Date()) {
    const active = rows.filter(row => row.status === 'approved' && new Date(row.effectiveFrom).getTime() <= now.getTime())
        .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom) || Number(b.version) - Number(a.version))[0];
    if (active) return parsePolicy(active.policy);
    const seed = (role: string) => { const row = legacy.find(item => item.role === role); return row ? { maxTransaction: Number(row.maxTransaction), dailyLimit: Number(row.dailyLimit), monthlyLimit: Number(row.monthlyLimit) } : undefined; };
    return defaultPolicy({ manager: seed('manager'), admin: seed('admin') });
}

export const clonePolicy = (policy: LimitPolicy): LimitPolicy => JSON.parse(JSON.stringify(policy));

// ── Períodos (dia civil e mês civil de Angola) ───────────────────────────────────

/** Chaves de contagem: o dia vai das 00:00 às 23:59:59 de Luanda e o mês do dia 1 ao último dia. */
export function periodKeys(now: Date = new Date()) {
    const day = luandaDateKey(now);
    return { day, month: day.slice(0, 7) };
}

/** Próximos reinícios dos contadores (instantes UTC das 00:00 de Luanda). */
export function nextResets(now: Date = new Date()) {
    const { day } = periodKeys(now);
    const [year, month, date] = day.split('-').map(Number);
    const tomorrow = new Date(Date.UTC(year, month - 1, date + 1)).toISOString().slice(0, 10);
    const nextMonth = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
    return { daily: luandaToUtc(tomorrow), monthly: luandaToUtc(nextMonth) };
}

// ── Formatação ───────────────────────────────────────────────────────────────────

/** "1 000 000,00 Kz" (espaços normais, para PDF e texto). */
export function formatKz(minor: number | null | undefined, withUnit = true): string {
    if (minor === null || minor === undefined || !Number.isFinite(minor)) return 'Sem teto';
    const negative = minor < 0;
    const abs = Math.abs(Math.round(minor));
    const whole = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    const cents = String(abs % 100).padStart(2, '0');
    return `${negative ? '-' : ''}${whole},${cents}${withUnit ? ' Kz' : ''}`;
}
export const formatShortKz = (minor: number) => String(Math.round(minor / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

export function formatLimitValue(field: LimitField, value: number | null | undefined): string {
    if (value === null || value === undefined) return 'Sem teto';
    if (isMoneyField(field)) return formatKz(value);
    if (field === 'maxPercent') return `${String(value).replace('.', ',')}%`;
    return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/** Cor da barra de consumo: verde abaixo de 70%, amarelo de 70% a 90%, vermelho acima de 90%. */
export function usageTone(percent: number): 'green' | 'yellow' | 'red' {
    if (percent > 90) return 'red';
    if (percent >= 70) return 'yellow';
    return 'green';
}

// ── Cadeia de aprovação ──────────────────────────────────────────────────────────

export const levelIndexOfProfile = (policy: LimitPolicy, profileId: string) =>
    policy.chain.levels.findIndex(level => level.profileIds.includes(profileId));

/** Alçada de aprovação de crédito de um nível (o maior valor por operação dos seus perfis). */
export function levelAmount(policy: LimitPolicy, levelIndex: number): number {
    const level = policy.chain.levels[levelIndex];
    if (!level) return 0;
    return Math.max(0, ...level.profileIds.map(id => policy.profiles[id]?.ops.credit_approval?.allowed ? Number(policy.profiles[id].ops.credit_approval?.perOperationMinor ?? 0) : 0));
}

export type RequiredLevel = { index: number; id: string; name: string; dual: boolean; reasons: string[] };

/** Nível exigido para aprovar um crédito: pelo valor, pelo risco do cliente e pela taxa de esforço. */
export function requiredLevelFor(policy: LimitPolicy, amountMinor: number, context: { riskLevel?: string | null; effortRate?: number | null } = {}): RequiredLevel {
    const levels = policy.chain.levels;
    const top = levels.length - 1;
    const reasons: string[] = [];
    let index = levels.findIndex((_, i) => amountMinor <= levelAmount(policy, i));
    let dual = false;
    if (index < 0) { index = top; dual = true; reasons.push(`Valor acima da alçada do nível máximo (${formatKz(levelAmount(policy, top))})`); }
    const riskLevelId = context.riskLevel === 'high' ? policy.risk.highRiskLevelId : context.riskLevel === 'medium' ? policy.risk.mediumRiskLevelId : null;
    if (riskLevelId) {
        const riskIndex = levels.findIndex(level => level.id === riskLevelId);
        if (riskIndex > index) { index = riskIndex; reasons.push(`Cliente de risco ${context.riskLevel === 'high' ? 'Alto' : 'Médio'}: exige sempre ${levels[riskIndex].name}`); }
    }
    if (context.effortRate !== null && context.effortRate !== undefined && context.effortRate > policy.risk.effortLimitPct && policy.risk.effortBumpLevels > 0) {
        const bumped = index + policy.risk.effortBumpLevels;
        reasons.push(`Taxa de esforço de ${context.effortRate.toFixed(1).replace('.', ',')}% acima do limite de ${policy.risk.effortLimitPct}%: exige um nível acima`);
        if (bumped > top) { index = top; dual = true; } else index = bumped;
    }
    const level = levels[Math.max(0, index)];
    return { index: Math.max(0, index), id: level?.id || 'sem-nivel', name: dual ? `Dupla aprovação (${level?.name || 'nível máximo'})` : level?.name || 'Sem nível', dual, reasons };
}

export const chainLabel = (policy: LimitPolicy) => [...policy.chain.levels.map(level => level.name), 'Dupla aprovação'].join(' → ');

// ── Limites efectivos ────────────────────────────────────────────────────────────

export type EffectiveLimit = LimitValues & {
    source: 'perfil' | 'individual' | 'temporaria' | 'desativado' | 'sem-limite';
    scope: LimitScope;
    profileEnabled: boolean;
    exceptionId?: string;
};

const pick = (base: number | null | undefined, override: number | null | undefined) => override === undefined ? base : override;
const maxOf = (a: number | null | undefined, b: number | null | undefined) => (a === null || b === null) ? null : Math.max(Number(a ?? 0), Number(b ?? 0));

export const activeExceptions = (exceptions: LimitException[], now: Date = new Date()) =>
    exceptions.filter(item => item.status === 'approved' && new Date(item.startsAt).getTime() <= now.getTime() && now.getTime() < new Date(item.endsAt).getTime());

/** Limites padrão para perfis sem definição explícita (para não bloquear numerário nem exportações básicas). */
export const DEFAULT_OPERATOR_LIMITS: Partial<Record<OperationType, LimitValues>> = {
    cash_receipt: { allowed: true, perOperationMinor: kz(500_000), dailyMinor: kz(3_000_000), monthlyMinor: kz(30_000_000) },
    client_export: { allowed: true, perOperationCount: 500, dailyCount: 5 },
};

/** Limite que se aplica a um utilizador: perfil → limite individual → exceção temporária activa. */
export function effectiveLimit(policy: LimitPolicy, actor: LimitActor, operationType: OperationType, exceptions: LimitException[] = [], now: Date = new Date()): EffectiveLimit {
    const profile = policy.profiles[actor.role];
    const scope = profile?.scope || 'user';
    const base = profile?.ops[operationType];
    const fallback = DEFAULT_OPERATOR_LIMITS[operationType];
    let result: EffectiveLimit = base?.allowed
        ? { ...base, source: 'perfil', scope, profileEnabled: profile?.enabled !== false }
        : base && base.allowed === false
        ? { allowed: false, source: 'sem-limite', scope, profileEnabled: profile?.enabled !== false }
        : fallback
        ? { ...fallback, source: 'perfil', scope, profileEnabled: profile?.enabled !== false }
        : { allowed: false, source: 'sem-limite', scope, profileEnabled: profile?.enabled !== false };
    const override = policy.userOverrides.find(item => item.userId === actor.id)?.ops[operationType];
    if (override) {
        result = {
            ...result, allowed: override.allowed ?? true, source: 'individual',
            perOperationMinor: pick(result.perOperationMinor, override.perOperationMinor), dailyMinor: pick(result.dailyMinor, override.dailyMinor),
            monthlyMinor: pick(result.monthlyMinor, override.monthlyMinor), perOperationCount: pick(result.perOperationCount, override.perOperationCount),
            dailyCount: pick(result.dailyCount, override.dailyCount), maxPercent: pick(result.maxPercent, override.maxPercent),
        };
    }
    const exception = activeExceptions(exceptions, now).filter(item => item.userId === actor.id && item.operationType === operationType)
        .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt))[0];
    if (exception) {
        result = {
            ...result, allowed: true, source: 'temporaria', exceptionId: exception.id,
            perOperationMinor: maxOf(result.perOperationMinor, exception.perOperationMinor),
            dailyMinor: exception.dailyMinor === null ? result.dailyMinor : maxOf(result.dailyMinor, exception.dailyMinor),
            monthlyMinor: exception.monthlyMinor === null ? result.monthlyMinor : maxOf(result.monthlyMinor, exception.monthlyMinor),
            dailyCount: exception.dailyCount === null ? result.dailyCount : maxOf(result.dailyCount, exception.dailyCount),
        };
    }
    if (profile && profile.enabled === false && result.source !== 'sem-limite') result = { ...result, source: 'desativado' };
    return result;
}

// ── Consumo ──────────────────────────────────────────────────────────────────────

export type UsageTotals = { dayMinor: number; monthMinor: number; dayCount: number; monthCount: number };
export type UsageSnapshot = { scope: UsageTotals; company: UsageTotals; product?: { monthMinor: number } };
export const EMPTY_USAGE: UsageTotals = { dayMinor: 0, monthMinor: 0, dayCount: 0, monthCount: 0 };

/** Chave do âmbito de contagem de um utilizador (o mesmo valor que o guarda SQL compara). */
export function scopeKey(scope: LimitScope, actor: LimitActor): { scope: 'user' | 'branch' | 'profile'; scopeId: string } {
    if (scope === 'branch') return { scope: 'branch', scopeId: `${actor.role}|${actor.branchId || ''}` };
    if (scope === 'company') return { scope: 'profile', scopeId: actor.role };
    return { scope: 'user', scopeId: actor.id };
}

export type LedgerRow = { operationType: string; userId: string; profileId: string | null; branchId: string | null; amountMinor: number; count: number; dayKey: string; monthKey: string };

/** Soma o consumo de um conjunto de movimentos para um âmbito (mesma regra do guarda SQL). */
export function sumUsage(rows: LedgerRow[], operationType: OperationType, scope: 'user' | 'branch' | 'profile' | 'all', scopeId: string, now: Date = new Date()): UsageTotals {
    const { day, month } = periodKeys(now);
    const totals = { ...EMPTY_USAGE };
    for (const row of rows) {
        if (row.operationType !== operationType) continue;
        const id = scope === 'user' ? row.userId : scope === 'branch' ? `${row.profileId || ''}|${row.branchId || ''}` : scope === 'profile' ? row.profileId : 'all';
        if (id !== scopeId) continue;
        if (row.monthKey === month) { totals.monthMinor += Number(row.amountMinor) || 0; totals.monthCount += Number(row.count) || 0; }
        if (row.dayKey === day) { totals.dayMinor += Number(row.amountMinor) || 0; totals.dayCount += Number(row.count) || 0; }
    }
    return totals;
}

export type UsageMeter = { used: number; limit: number | null; pct: number | null };
export type UsageRow = {
    userId: string; userName: string; role: string; branchId: string; operationType: OperationType;
    scope: LimitScope; scopeId: string; source: EffectiveLimit['source']; day: UsageMeter; month: UsageMeter; count: UsageMeter;
};

const meter = (used: number, limit: number | null | undefined): UsageMeter => ({
    used, limit: limit ?? null, pct: limit ? Math.round((used / limit) * 1000) / 10 : limit === 0 ? (used > 0 ? 100 : 0) : null,
});

/** Consumo do dia e do mês de cada utilizador, por tipo de operação com limite de volume (para barras e alertas). */
export function usageRows(policy: LimitPolicy, users: LimitActor[], ledger: LedgerRow[], exceptions: LimitException[] = [], now: Date = new Date()): UsageRow[] {
    const rows: UsageRow[] = [];
    for (const user of users) {
        for (const op of OPERATION_TYPES) {
            const limit = effectiveLimit(policy, user, op.id, exceptions, now);
            if (!limit.allowed) continue;
            if (limit.dailyMinor == null && limit.monthlyMinor == null && limit.dailyCount == null) continue;
            const key = scopeKey(limit.scope, user);
            const totals = sumUsage(ledger, op.id, key.scope, key.scopeId, now);
            const disabled = limit.source === 'desativado';
            rows.push({
                userId: user.id, userName: user.name, role: user.role, branchId: user.branchId || '', operationType: op.id, scope: limit.scope, scopeId: key.scopeId, source: limit.source,
                day: meter(totals.dayMinor, disabled ? null : limit.dailyMinor), month: meter(totals.monthMinor, disabled ? null : limit.monthlyMinor),
                count: meter(totals.dayCount, disabled ? null : limit.dailyCount),
            });
        }
    }
    return rows;
}

// ── Avaliação de uma operação ────────────────────────────────────────────────────

export type GuardCheck = { scope: 'user' | 'branch' | 'profile' | 'all'; scopeId: string; period: 'day' | 'month'; limitMinor: number; limitCount: number; label: string };

export type Evaluation = {
    decision: 'allow' | 'escalate' | 'block';
    reasons: string[];
    /** Texto para a fila de Aprovações: "Acima da alçada de [nome] — requer [nível]". */
    queueReason: string | null;
    required: RequiredLevel | null;
    dual: boolean;
    actorLevel: number;
    limit: EffectiveLimit;
    remaining: { perOperationMinor: number | null; dailyMinor: number | null; monthlyMinor: number | null; dailyCount: number | null };
    guards: GuardCheck[];
};

export type EvaluationInput = {
    policy: LimitPolicy;
    actor: LimitActor;
    operationType: OperationType;
    amountMinor: number;
    count?: number;
    percent?: number;
    usage: UsageSnapshot;
    exceptions?: LimitException[];
    now?: Date;
    client?: { riskLevel?: string | null; exposureMinor?: number; groupExposureMinor?: number } | null;
    effortRate?: number | null;
    cashAvailableMinor?: number | null;
    productId?: string | null;
};

const remainingOf = (limit: number | null | undefined, used: number) => limit === null || limit === undefined ? null : Math.max(0, limit - used);

/**
 * Decide se o utilizador pode executar a operação sozinho (`allow`), se tem de subir na cadeia (`escalate`)
 * ou se é recusada (`block`). Os guardas devolvidos são verificados na base de dados, na mesma transacção.
 */
export function evaluateOperation(input: EvaluationInput): Evaluation {
    const { policy, actor, operationType, amountMinor } = input;
    const now = input.now || new Date();
    const count = input.count ?? 1;
    const limit = effectiveLimit(policy, actor, operationType, input.exceptions || [], now);
    const usage = input.usage.scope;
    const actorLevel = levelIndexOfProfile(policy, actor.role);
    const reasons: string[] = [];
    const guards: GuardCheck[] = [];
    const remaining = {
        perOperationMinor: limit.allowed ? (limit.perOperationMinor ?? null) : 0,
        dailyMinor: limit.allowed ? remainingOf(limit.dailyMinor, usage.dayMinor) : 0,
        monthlyMinor: limit.allowed ? remainingOf(limit.monthlyMinor, usage.monthMinor) : 0,
        dailyCount: limit.allowed ? remainingOf(limit.dailyCount, usage.dayCount) : 0,
    };
    const isCredit = operationType === 'credit_approval' || operationType === 'disbursement';
    const required = isCredit ? requiredLevelFor(policy, amountMinor, { riskLevel: input.client?.riskLevel, effortRate: input.effortRate }) : null;
    const disabled = limit.source === 'desativado';
    let decision = 'allow' as Evaluation['decision'];
    let blockOnly = false;
    const escalate = (reason: string) => { reasons.push(reason); if (decision === 'allow') decision = 'escalate'; };
    const block = (reason: string) => { reasons.push(reason); decision = 'block'; blockOnly = true; };

    if (!limit.allowed) {
        const text = `O perfil ${actor.role} não tem limite definido para ${OPERATION_LABELS[operationType].toLowerCase()}: a operação fica bloqueada por defeito`;
        if (isCredit || operationType === 'payment_reversal' || operationType === 'write_off') escalate(text); else block(text);
    } else if (!disabled) {
        if (limit.perOperationMinor !== null && limit.perOperationMinor !== undefined && amountMinor > limit.perOperationMinor) {
            const text = `Valor de ${formatKz(amountMinor)} acima do limite por operação de ${formatKz(limit.perOperationMinor)}`;
            if (operationType === 'cash_receipt') block(`${text}: acima deste valor o recebimento só pode ser feito por transferência`);
            else if (operationType === 'interest_waiver' || operationType === 'accounting_reversal' || operationType === 'client_export') block(text);
            else escalate(text);
        }
        if (operationType === 'interest_waiver' && limit.maxPercent !== null && limit.maxPercent !== undefined && (input.percent ?? 0) > limit.maxPercent)
            block(`Perdão de ${String((input.percent ?? 0).toFixed(1)).replace('.', ',')}% acima do máximo de ${limit.maxPercent}% do perfil`);
        if (operationType === 'client_export' && limit.perOperationCount !== null && limit.perOperationCount !== undefined && count > limit.perOperationCount)
            block(`Exportação de ${count} registos acima do máximo de ${limit.perOperationCount} por exportação`);
        if (limit.dailyMinor !== null && limit.dailyMinor !== undefined && usage.dayMinor + amountMinor > limit.dailyMinor) {
            const text = usage.dayMinor > 0 ? `Volume diário insuficiente: ${formatKz(usage.dayMinor)} usados de ${formatKz(limit.dailyMinor)} (restam ${formatKz(remaining.dailyMinor ?? 0)})` : `Valor acima do volume diário de ${formatKz(limit.dailyMinor)}`;
            if (isCredit || operationType === 'payment_reversal') escalate(text); else block(text);
        }
        if (limit.monthlyMinor !== null && limit.monthlyMinor !== undefined && usage.monthMinor + amountMinor > limit.monthlyMinor) {
            const text = usage.monthMinor > 0 ? `Volume mensal insuficiente: ${formatKz(usage.monthMinor)} usados de ${formatKz(limit.monthlyMinor)} (restam ${formatKz(remaining.monthlyMinor ?? 0)})` : `Valor acima do volume mensal de ${formatKz(limit.monthlyMinor)}`;
            if (isCredit || operationType === 'payment_reversal') escalate(text); else block(text);
        }
        if (limit.dailyCount !== null && limit.dailyCount !== undefined && usage.dayCount + (operationType === 'client_export' ? 1 : count) > limit.dailyCount) {
            const text = `Número máximo por dia atingido (${usage.dayCount} de ${limit.dailyCount})`;
            if (operationType === 'payment_reversal') escalate(text); else block(text);
        }
        const key = scopeKey(limit.scope, actor);
        if (limit.dailyMinor != null || limit.dailyCount != null) guards.push({ ...key, period: 'day', limitMinor: limit.dailyMinor ?? NO_CAP, limitCount: limit.dailyCount ?? NO_CAP, label: 'volume diário' });
        if (limit.monthlyMinor != null) guards.push({ ...key, period: 'month', limitMinor: limit.monthlyMinor, limitCount: NO_CAP, label: 'volume mensal' });
    }

    if (required) {
        if (required.dual) escalate(`Exige dupla aprovação: ${required.reasons.join('; ') || 'valor acima do nível máximo'}`);
        else if (actorLevel < required.index) {
            const riskReason = required.reasons.find(reason => reason.startsWith('Cliente de risco') || reason.startsWith('Taxa de esforço'));
            const ownAlcada = limit.allowed && limit.perOperationMinor != null && amountMinor <= limit.perOperationMinor;
            if (riskReason || !ownAlcada) escalate(riskReason || `Acima da alçada do nível ${policy.chain.levels[actorLevel]?.name || actor.role}`);
        }
        // Limites globais da empresa (exposição por cliente e grupo, volume da empresa, caixa e produto).
        const global = policy.global;
        if (operationType === 'credit_approval' || operationType === 'disbursement') {
            const exposure = (input.client?.exposureMinor ?? 0) + amountMinor;
            if (global.regulatory.enabled && global.regulatory.ownFundsMinor > 0) {
                const cap = Math.floor(global.regulatory.ownFundsMinor * global.regulatory.singleClientPct / 100);
                if (exposure > cap) block(`Limite regulamentar: a exposição ao cliente ficaria em ${formatKz(exposure)}, acima de ${global.regulatory.singleClientPct}% dos fundos próprios (${formatKz(cap)})`);
            }
            if (global.clientExposureMinor !== null && exposure > global.clientExposureMinor) escalate(`Exposição ao cliente ficaria em ${formatKz(exposure)}, acima do máximo de ${formatKz(global.clientExposureMinor)}: exige dupla aprovação`);
            const groupExposure = (input.client?.groupExposureMinor ?? input.client?.exposureMinor ?? 0) + amountMinor;
            if (global.groupExposureMinor !== null && groupExposure > global.groupExposureMinor) escalate(`Exposição ao grupo de clientes relacionados ficaria em ${formatKz(groupExposure)}, acima do máximo de ${formatKz(global.groupExposureMinor)}: exige dupla aprovação`);
            const company = input.usage.company;
            if (global.companyDailyDisbursementMinor !== null && company.dayMinor + amountMinor > global.companyDailyDisbursementMinor)
                escalate(`Volume diário de desembolsos da empresa esgotado (${formatKz(company.dayMinor)} de ${formatKz(global.companyDailyDisbursementMinor)})`);
            if (global.companyMonthlyDisbursementMinor !== null && company.monthMinor + amountMinor > global.companyMonthlyDisbursementMinor)
                escalate(`Volume mensal de desembolsos da empresa esgotado (${formatKz(company.monthMinor)} de ${formatKz(global.companyMonthlyDisbursementMinor)})`);
            if (global.linkToCash && input.cashAvailableMinor !== null && input.cashAvailableMinor !== undefined && amountMinor > input.cashAvailableMinor)
                block(`Saldo de caixa disponível insuficiente (${formatKz(input.cashAvailableMinor)}) para desembolsar ${formatKz(amountMinor)}`);
            const product = input.productId ? global.products[input.productId] : undefined;
            if (product?.perOperationMinor != null && amountMinor > product.perOperationMinor) escalate(`Acima do limite do produto (${formatKz(product.perOperationMinor)} por operação)`);
            if (product?.monthlyMinor != null && (input.usage.product?.monthMinor ?? 0) + amountMinor > product.monthlyMinor) escalate(`Volume mensal do produto esgotado (${formatKz(product.monthlyMinor)})`);
            if (global.companyDailyDisbursementMinor !== null) guards.push({ scope: 'all', scopeId: 'all', period: 'day', limitMinor: global.companyDailyDisbursementMinor, limitCount: NO_CAP, label: 'volume diário da empresa' });
            if (global.companyMonthlyDisbursementMinor !== null) guards.push({ scope: 'all', scopeId: 'all', period: 'month', limitMinor: global.companyMonthlyDisbursementMinor, limitCount: NO_CAP, label: 'volume mensal da empresa' });
        }
    }
    if (operationType === 'write_off') escalate('O abate de crédito exige sempre dupla aprovação');

    // Destino na cadeia quando sobe.
    let finalRequired = required;
    let dual = Boolean(required?.dual) || operationType === 'write_off';
    if (decision === 'escalate' && isCredit && required) {
        const exposureDual = reasons.some(reason => reason.includes('exige dupla aprovação'));
        const nextIndex = Math.min(policy.chain.levels.length - 1, Math.max(required.index, actorLevel + 1));
        const overTop = actorLevel >= policy.chain.levels.length - 1 && !required.dual;
        dual = dual || exposureDual || overTop;
        const level = policy.chain.levels[dual ? policy.chain.levels.length - 1 : nextIndex];
        finalRequired = { ...required, index: dual ? policy.chain.levels.length - 1 : nextIndex, id: level?.id || required.id, dual, name: dual ? `Dupla aprovação (${level?.name || 'nível máximo'})` : level?.name || required.name };
    }
    const actorLevelName = policy.chain.levels[actorLevel]?.name || actor.name;
    const queueReason = decision === 'escalate'
        ? `Acima da alçada de ${actor.name}${actorLevel >= 0 ? ` (${actorLevelName})` : ''} — requer ${finalRequired?.name || (dual ? 'dupla aprovação' : 'nível superior')}`
        : null;
    if (blockOnly) decision = 'block';
    return { decision, reasons, queueReason, required: finalRequired, dual, actorLevel, limit, remaining, guards: decision === 'allow' ? guards : [] };
}

/** Pode este utilizador decidir (aprovar) um pedido que exige o nível indicado? */
export function canApproveAtLevel(policy: LimitPolicy, role: string, required: { index: number; dual: boolean }): boolean {
    const index = levelIndexOfProfile(policy, role);
    if (index < 0) return false;
    return required.dual ? index >= policy.chain.levels.length - 1 : index >= required.index;
}

// ── Guardas SQL (bloqueio na base de dados) ──────────────────────────────────────

/**
 * Guarda do limite: só insere a linha de bloqueio se o consumo já registado + este valor couber no limite.
 * Corre dentro da transacção da operação, antes do registo do consumo; com expectChanges = 1, duas operações
 * em simultâneo são serializadas pela transacção de escrita do SQLite e a segunda falha se ultrapassar.
 */
export const LIMIT_GUARD_SQL = `INSERT INTO limit_locks (id, ledgerId, scope, scopeId, period, periodKey, createdAt)
    SELECT ?, ?, ?, ?, ?, ?, ?
    WHERE COALESCE((SELECT SUM(amountMinor) FROM limit_ledger WHERE operationType = ?
            AND (CASE ? WHEN 'user' THEN userId WHEN 'branch' THEN COALESCE(profileId, '') || '|' || COALESCE(branchId, '') WHEN 'profile' THEN profileId ELSE 'all' END) = ?
            AND (CASE ? WHEN 'day' THEN dayKey ELSE monthKey END) = ?), 0) + ? <= ?
      AND COALESCE((SELECT SUM(count) FROM limit_ledger WHERE operationType = ?
            AND (CASE ? WHEN 'user' THEN userId WHEN 'branch' THEN COALESCE(profileId, '') || '|' || COALESCE(branchId, '') WHEN 'profile' THEN profileId ELSE 'all' END) = ?
            AND (CASE ? WHEN 'day' THEN dayKey ELSE monthKey END) = ?), 0) + ? <= ?`;

export const LIMIT_LEDGER_INSERT_SQL = `INSERT INTO limit_ledger (id, operationType, userId, userName, profileId, branchId, amountMinor, count, dayKey, monthKey, entityType, entityId, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

export const LIMIT_GUARD_ERROR = 'LIMITE_ESGOTADO';

export type ConsumptionInput = {
    operationType: OperationType;
    actor: LimitActor;
    amountMinor: number;
    count?: number;
    entityType: string;
    entityId: string;
    guards: GuardCheck[];
    now?: Date;
    id?: () => string;
};

/** Instruções a juntar à transacção da operação: guardas (expectChanges 1) e o registo do consumo. */
export function consumptionStatements(input: ConsumptionInput): Array<{ sql: string; params: unknown[]; expectChanges?: number; guard?: string }> {
    const now = input.now || new Date();
    const id = input.id || (() => crypto.randomUUID());
    const { day, month } = periodKeys(now);
    const ledgerId = id();
    const amount = input.operationType === 'client_export' ? 0 : input.amountMinor;
    const count = input.count ?? 1;
    const guardCount = input.operationType === 'client_export' ? 1 : count;
    const statements: Array<{ sql: string; params: unknown[]; expectChanges?: number; guard?: string }> = input.guards.map(guard => {
        const key = guard.period === 'day' ? day : month;
        const where = [input.operationType, guard.scope, guard.scopeId, guard.period, key];
        return {
            sql: LIMIT_GUARD_SQL,
            params: [id(), ledgerId, guard.scope, guard.scopeId, guard.period, key, now.toISOString(), ...where, amount, guard.limitMinor, ...where, guardCount, guard.limitCount],
            expectChanges: 1, guard: guard.label,
        };
    });
    statements.push({
        sql: LIMIT_LEDGER_INSERT_SQL,
        params: [ledgerId, input.operationType, input.actor.id, input.actor.name, input.actor.role, input.actor.branchId || '', amount, guardCount, day, month, input.entityType, input.entityId, now.toISOString()],
    });
    return statements;
}

// ── Validação de coerência ───────────────────────────────────────────────────────

export type PolicyIssue = { path: string; message: string };

/** Por operação ≤ diário ≤ mensal e um nível inferior nunca com limites maiores do que o nível superior. */
export function validatePolicy(policy: LimitPolicy, profileName: (id: string) => string = id => id): PolicyIssue[] {
    const issues: PolicyIssue[] = [];
    const nonNegative = (value: unknown) => value === null || value === undefined || (Number.isFinite(Number(value)) && Number(value) >= 0);
    for (const [profileId, profile] of Object.entries(policy.profiles)) {
        for (const op of OPERATION_TYPES) {
            const values = profile.ops[op.id];
            if (!values?.allowed) continue;
            const path = `${profileId}.${op.id}`;
            const name = `${profileName(profileId)} — ${op.label}`;
            for (const field of op.fields) if (!nonNegative(values[field])) issues.push({ path: `${path}.${field}`, message: `${name}: ${FIELD_LABELS[field]} tem de ser um número positivo.` });
            const per = values.perOperationMinor, daily = values.dailyMinor, monthly = values.monthlyMinor;
            if (op.fields.includes('perOperationMinor') && (per === null || per === undefined) && op.id !== 'client_export')
                issues.push({ path: `${path}.perOperationMinor`, message: `${name}: indique o limite por operação (sem ele a operação fica sem controlo).` });
            if (per != null && daily != null && per > daily) issues.push({ path: `${path}.perOperationMinor`, message: `${name}: o limite por operação (${formatKz(per)}) não pode ser maior do que o volume diário (${formatKz(daily)}).` });
            if (daily != null && monthly != null && daily > monthly) issues.push({ path: `${path}.dailyMinor`, message: `${name}: o volume diário (${formatKz(daily)}) não pode ser maior do que o volume mensal (${formatKz(monthly)}).` });
            if (per != null && daily == null && monthly != null && per > monthly) issues.push({ path: `${path}.perOperationMinor`, message: `${name}: o limite por operação não pode ser maior do que o volume mensal.` });
            if (values.maxPercent != null && (values.maxPercent < 0 || values.maxPercent > 100)) issues.push({ path: `${path}.maxPercent`, message: `${name}: a percentagem tem de estar entre 0 e 100.` });
        }
    }
    // Monotonia da cadeia: cada campo de cada perfil de um nível ≤ mínimo do mesmo campo nos níveis acima.
    const levels = policy.chain.levels;
    const seen = new Set<string>();
    for (const level of levels) for (const id of level.profileIds) {
        if (seen.has(id)) issues.push({ path: `chain.${level.id}`, message: `O perfil ${profileName(id)} está em mais de um nível da cadeia.` });
        seen.add(id);
    }
    if (!levels.length) issues.push({ path: 'chain', message: 'A cadeia de aprovação tem de ter pelo menos um nível.' });
    for (let lower = 0; lower < levels.length; lower++) {
        for (let upper = lower + 1; upper < levels.length; upper++) {
            for (const lowId of levels[lower].profileIds) for (const highId of levels[upper].profileIds) {
                const low = policy.profiles[lowId], high = policy.profiles[highId];
                if (!low || !high) continue;
                for (const op of OPERATION_TYPES) {
                    const a = low.ops[op.id], b = high.ops[op.id];
                    if (!a?.allowed) continue;
                    if (!b?.allowed) { if (op.id === 'credit_approval') issues.push({ path: `${lowId}.${op.id}`, message: `${profileName(lowId)} pode fazer ${op.label.toLowerCase()} mas ${profileName(highId)} (nível superior) não.` }); continue; }
                    for (const field of op.fields) {
                        const x = a[field], y = b[field];
                        if (x === undefined || y === undefined) continue;
                        const bigger = (x === null && y !== null) || (x !== null && y !== null && Number(x) > Number(y));
                        if (bigger) issues.push({ path: `${lowId}.${op.id}.${field}`, message: `${profileName(lowId)} (${levels[lower].name}) — ${op.label}, ${FIELD_LABELS[field]}: ${formatLimitValue(field, x)} é maior do que em ${profileName(highId)} (${levels[upper].name}, ${formatLimitValue(field, y)}).` });
                    }
                }
            }
        }
    }
    if (!(policy.chain.escalationHours > 0)) issues.push({ path: 'chain.escalationHours', message: 'Indique em quantas horas um pedido sem decisão sobe ao nível seguinte.' });
    for (const override of policy.userOverrides) if ((override.reason || '').trim().length < 10) issues.push({ path: `override.${override.userId}`, message: `O limite individual de ${override.userName} precisa de um motivo.` });
    const g = policy.global;
    if (g.clientExposureMinor != null && g.groupExposureMinor != null && g.clientExposureMinor > g.groupExposureMinor)
        issues.push({ path: 'global.groupExposureMinor', message: 'A exposição máxima por grupo não pode ser menor do que a exposição por cliente.' });
    if (g.companyDailyDisbursementMinor != null && g.companyMonthlyDisbursementMinor != null && g.companyDailyDisbursementMinor > g.companyMonthlyDisbursementMinor)
        issues.push({ path: 'global.companyDailyDisbursementMinor', message: 'O volume diário de desembolsos da empresa não pode ser maior do que o mensal.' });
    return issues;
}

// ── Diferenças entre políticas ───────────────────────────────────────────────────

export type PolicyChange = { path: string; label: string; before: string; after: string; increasePct: number | null; disables: boolean; kind: 'profile' | 'chain' | 'override' | 'global' | 'risk' | 'governance' };

export function diffPolicies(before: LimitPolicy, after: LimitPolicy, profileName: (id: string) => string = id => id): PolicyChange[] {
    const changes: PolicyChange[] = [];
    const pct = (a: number | null | undefined, b: number | null | undefined) => {
        if (b === null && a !== null && a !== undefined) return Infinity; // passou a "sem teto"
        if (a === null || a === undefined || b === null || b === undefined) return null;
        if (a === 0) return b > 0 ? Infinity : null;
        return b > a ? Math.round(((b - a) / a) * 1000) / 10 : null;
    };
    const ids = new Set([...Object.keys(before.profiles), ...Object.keys(after.profiles)]);
    for (const id of ids) {
        const a = before.profiles[id], b = after.profiles[id];
        const name = profileName(id);
        if ((a?.enabled ?? true) !== (b?.enabled ?? true)) changes.push({ path: `${id}.enabled`, label: `${name} — limites`, before: a?.enabled === false ? 'Desativados' : 'Ativados', after: b?.enabled === false ? 'Desativados' : 'Ativados', increasePct: null, disables: b?.enabled === false, kind: 'profile' });
        if ((a?.scope || 'user') !== (b?.scope || 'user')) changes.push({ path: `${id}.scope`, label: `${name} — âmbito`, before: SCOPE_LABELS[a?.scope || 'user'], after: SCOPE_LABELS[b?.scope || 'user'], increasePct: null, disables: false, kind: 'profile' });
        for (const op of OPERATION_TYPES) {
            const x = a?.ops[op.id], y = b?.ops[op.id];
            if (Boolean(x?.allowed) !== Boolean(y?.allowed)) {
                changes.push({ path: `${id}.${op.id}`, label: `${name} — ${op.label}`, before: x?.allowed ? 'Permitida' : 'Bloqueada', after: y?.allowed ? 'Permitida' : 'Bloqueada', increasePct: y?.allowed ? Infinity : null, disables: false, kind: 'profile' });
                continue;
            }
            if (!y?.allowed) continue;
            for (const field of op.fields) {
                const p = x?.[field] ?? null, q = y?.[field] ?? null;
                if (p === q) continue;
                changes.push({ path: `${id}.${op.id}.${field}`, label: `${name} — ${op.label}, ${FIELD_LABELS[field]}`, before: formatLimitValue(field, p), after: formatLimitValue(field, q), increasePct: pct(p, q), disables: q === null && p !== null, kind: 'profile' });
            }
        }
    }
    const levelText = (policy: LimitPolicy) => policy.chain.levels.map(level => `${level.name} (${level.profileIds.map(profileName).join(', ')})`).join(' → ');
    if (levelText(before) !== levelText(after)) changes.push({ path: 'chain.levels', label: 'Cadeia de aprovação', before: levelText(before), after: levelText(after), increasePct: null, disables: false, kind: 'chain' });
    if (before.chain.escalationHours !== after.chain.escalationHours) changes.push({ path: 'chain.escalationHours', label: 'Escalonamento automático', before: `${before.chain.escalationHours} h`, after: `${after.chain.escalationHours} h`, increasePct: null, disables: false, kind: 'chain' });
    const overrideIds = new Set([...before.userOverrides.map(item => item.userId), ...after.userOverrides.map(item => item.userId)]);
    for (const userId of overrideIds) {
        const a = before.userOverrides.find(item => item.userId === userId), b = after.userOverrides.find(item => item.userId === userId);
        const name = (b || a)!.userName;
        if (!a) { changes.push({ path: `override.${userId}`, label: `Limite individual de ${name}`, before: 'Sem limite próprio', after: overrideSummary(b!), increasePct: overrideRaises(after, b!) ? Infinity : null, disables: false, kind: 'override' }); continue; }
        if (!b) { changes.push({ path: `override.${userId}`, label: `Limite individual de ${name}`, before: overrideSummary(a), after: 'Removido (volta ao perfil)', increasePct: null, disables: false, kind: 'override' }); continue; }
        if (JSON.stringify(a.ops) !== JSON.stringify(b.ops)) changes.push({ path: `override.${userId}`, label: `Limite individual de ${name}`, before: overrideSummary(a), after: overrideSummary(b), increasePct: overrideRaises(after, b) ? Infinity : null, disables: false, kind: 'override' });
    }
    const money: Array<[keyof GlobalLimits, string]> = [['clientExposureMinor', 'Exposição máxima por cliente'], ['groupExposureMinor', 'Exposição máxima por grupo'], ['companyDailyDisbursementMinor', 'Desembolsos da empresa por dia'], ['companyMonthlyDisbursementMinor', 'Desembolsos da empresa por mês']];
    for (const [key, label] of money) {
        const p = before.global[key] as number | null, q = after.global[key] as number | null;
        if (p !== q) changes.push({ path: `global.${key}`, label, before: formatKz(p), after: formatKz(q), increasePct: pct(p, q), disables: q === null && p !== null, kind: 'global' });
    }
    if (before.global.linkToCash !== after.global.linkToCash) changes.push({ path: 'global.linkToCash', label: 'Ligação ao saldo de caixa', before: before.global.linkToCash ? 'Sim' : 'Não', after: after.global.linkToCash ? 'Sim' : 'Não', increasePct: null, disables: !after.global.linkToCash, kind: 'global' });
    if (JSON.stringify(before.global.regulatory) !== JSON.stringify(after.global.regulatory)) changes.push({ path: 'global.regulatory', label: 'Limites regulamentares', before: regulatorySummary(before), after: regulatorySummary(after), increasePct: null, disables: before.global.regulatory.enabled && !after.global.regulatory.enabled, kind: 'global' });
    const products = new Set([...Object.keys(before.global.products), ...Object.keys(after.global.products)]);
    for (const id of products) {
        const p = before.global.products[id], q = after.global.products[id];
        if (JSON.stringify(p || null) !== JSON.stringify(q || null)) changes.push({ path: `global.products.${id}`, label: `Produto ${id}`, before: p ? `${formatKz(p.perOperationMinor)} / mês ${formatKz(p.monthlyMinor)}` : 'Sem limite próprio', after: q ? `${formatKz(q.perOperationMinor)} / mês ${formatKz(q.monthlyMinor)}` : 'Sem limite próprio', increasePct: p && q ? pct(p.perOperationMinor, q.perOperationMinor) : null, disables: Boolean(p && !q), kind: 'global' });
    }
    const levelName = (policy: LimitPolicy, id: string | null) => id ? policy.chain.levels.find(level => level.id === id)?.name || id : 'Sem regra';
    if (before.risk.highRiskLevelId !== after.risk.highRiskLevelId) changes.push({ path: 'risk.high', label: 'Risco Alto — nível mínimo', before: levelName(before, before.risk.highRiskLevelId), after: levelName(after, after.risk.highRiskLevelId), increasePct: null, disables: after.risk.highRiskLevelId === null, kind: 'risk' });
    if (before.risk.mediumRiskLevelId !== after.risk.mediumRiskLevelId) changes.push({ path: 'risk.medium', label: 'Risco Médio — nível mínimo', before: levelName(before, before.risk.mediumRiskLevelId), after: levelName(after, after.risk.mediumRiskLevelId), increasePct: null, disables: false, kind: 'risk' });
    if (before.risk.effortLimitPct !== after.risk.effortLimitPct || before.risk.effortBumpLevels !== after.risk.effortBumpLevels) changes.push({ path: 'risk.effort', label: 'Taxa de esforço', before: `${before.risk.effortLimitPct}% (+${before.risk.effortBumpLevels} nível)`, after: `${after.risk.effortLimitPct}% (+${after.risk.effortBumpLevels} nível)`, increasePct: after.risk.effortLimitPct > before.risk.effortLimitPct ? Infinity : null, disables: after.risk.effortBumpLevels === 0 && before.risk.effortBumpLevels > 0, kind: 'risk' });
    if (before.governance.secondApprovalIncreasePct !== after.governance.secondApprovalIncreasePct) changes.push({ path: 'governance.increase', label: 'Aumento que exige segundo administrador', before: `${before.governance.secondApprovalIncreasePct}%`, after: `${after.governance.secondApprovalIncreasePct}%`, increasePct: after.governance.secondApprovalIncreasePct > before.governance.secondApprovalIncreasePct ? Infinity : null, disables: false, kind: 'governance' });
    if (JSON.stringify(before.governance.alertThresholds) !== JSON.stringify(after.governance.alertThresholds)) changes.push({ path: 'governance.alerts', label: 'Alertas de consumo', before: before.governance.alertThresholds.map(v => `${v}%`).join(' e '), after: after.governance.alertThresholds.map(v => `${v}%`).join(' e '), increasePct: null, disables: false, kind: 'governance' });
    return changes;
}

function overrideSummary(override: UserOverride): string {
    return Object.entries(override.ops).map(([op, values]) => {
        const v = values || {};
        if (v.allowed === false) return `${OPERATION_LABELS[op as OperationType]}: bloqueada`;
        const parts = (['perOperationMinor', 'dailyMinor', 'monthlyMinor', 'perOperationCount', 'dailyCount', 'maxPercent'] as LimitField[])
            .filter(field => v[field] !== undefined).map(field => `${FIELD_LABELS[field]} ${formatLimitValue(field, v[field])}`);
        return `${OPERATION_LABELS[op as OperationType]}: ${parts.join(', ') || 'como o perfil'}`;
    }).join('; ') || 'Sem alterações';
}
const regulatorySummary = (policy: LimitPolicy) => policy.global.regulatory.enabled ? `${policy.global.regulatory.singleClientPct}% de ${formatKz(policy.global.regulatory.ownFundsMinor)}` : 'Não aplicados';

/** O limite individual sobe algum valor acima do perfil do utilizador? */
export function overrideRaises(policy: LimitPolicy, override: UserOverride, role?: string): boolean {
    for (const [op, values] of Object.entries(override.ops)) {
        const profileValues = role ? policy.profiles[role]?.ops[op as OperationType] : undefined;
        for (const field of ['perOperationMinor', 'dailyMinor', 'monthlyMinor', 'perOperationCount', 'dailyCount', 'maxPercent'] as LimitField[]) {
            const value = values?.[field];
            if (value === undefined) continue;
            const base = profileValues?.[field];
            if (value === null || base === undefined || base === null || Number(value) > Number(base)) { if (!(base === null && value === null)) return true; }
        }
    }
    return false;
}

/** Aumentos acima de X% ou desativações exigem um segundo administrador. */
export function needsSecondApproval(changes: PolicyChange[], governance: Governance): { required: boolean; reasons: string[] } {
    const reasons: string[] = [];
    for (const change of changes) {
        if (change.disables) reasons.push(`${change.label}: ${change.before} → ${change.after} (desativação)`);
        else if (change.increasePct !== null && (change.increasePct === Infinity || change.increasePct > governance.secondApprovalIncreasePct))
            reasons.push(`${change.label}: ${change.before} → ${change.after} (${change.increasePct === Infinity ? 'novo teto ou sem teto' : `+${String(change.increasePct).replace('.', ',')}%`})`);
    }
    return { required: reasons.length > 0, reasons };
}

// ── Simulação de impacto ─────────────────────────────────────────────────────────

export type HistoricOperation = {
    id: string; operationType: OperationType; amountMinor: number; createdAt: string;
    actor: LimitActor; riskLevel?: string | null; effortRate?: number | null;
};

/**
 * Reavalia as operações dos últimos 30 dias com a política actual e a nova: quantas teriam sido aprovadas
 * directamente ou escaladas, e que utilizadores já ultrapassaram hoje o novo limite.
 */
export function simulateImpact(input: {
    before: LimitPolicy; after: LimitPolicy; operations: HistoricOperation[]; ledger: LedgerRow[];
    users: LimitActor[]; now?: Date;
}) {
    const now = input.now || new Date();
    const since = now.getTime() - 30 * 86_400_000;
    const recent = input.operations.filter(item => new Date(item.createdAt).getTime() >= since);
    const outcome = (policy: LimitPolicy, op: HistoricOperation) => evaluateOperation({
        policy, actor: op.actor, operationType: op.operationType, amountMinor: op.amountMinor,
        usage: { scope: EMPTY_USAGE, company: EMPTY_USAGE }, now: new Date(op.createdAt),
        client: { riskLevel: op.riskLevel }, effortRate: op.effortRate ?? null,
    }).decision;
    let approvedBefore = 0, approvedAfter = 0, escalatedBefore = 0, escalatedAfter = 0, blockedAfter = 0;
    const changed: Array<{ id: string; label: string; before: string; after: string }> = [];
    for (const op of recent) {
        const a = outcome(input.before, op), b = outcome(input.after, op);
        if (a === 'allow') approvedBefore++; else escalatedBefore++;
        if (b === 'allow') approvedAfter++; else if (b === 'escalate') escalatedAfter++; else blockedAfter++;
        if (a !== b && changed.length < 50) changed.push({ id: op.id, label: `${OPERATION_LABELS[op.operationType]} de ${formatKz(op.amountMinor)} por ${op.actor.name}`, before: DECISION_LABELS[a], after: DECISION_LABELS[b] });
    }
    const overToday: Array<{ userId: string; userName: string; operation: string; usedMinor: number; limitMinor: number }> = [];
    for (const user of input.users) {
        for (const op of OPERATION_TYPES) {
            const limit = effectiveLimit(input.after, user, op.id, [], now);
            if (!limit.allowed || limit.dailyMinor === null || limit.dailyMinor === undefined) continue;
            const key = scopeKey(limit.scope, user);
            const used = sumUsage(input.ledger, op.id, key.scope, key.scopeId, now).dayMinor;
            if (used > limit.dailyMinor) overToday.push({ userId: user.id, userName: user.name, operation: op.label, usedMinor: used, limitMinor: limit.dailyMinor });
        }
    }
    return { total: recent.length, approvedBefore, approvedAfter, escalatedBefore, escalatedAfter, blockedAfter, changed, overToday };
}

export const DECISION_LABELS: Record<Evaluation['decision'], string> = { allow: 'Aprovada', escalate: 'Escalada', block: 'Bloqueada' };

// ── Grupos de clientes relacionados ──────────────────────────────────────────────

type RelatedClient = {
    id: string;
    name?: string;
    nif?: string;
    phone?: string;
    spouseNif?: string;
    spouseBi?: string;
    spouseName?: string;
    spousePhone?: string;
    legalRepresentative?: string;
    fatherName?: string;
    motherName?: string;
};

/**
 * Grupos de clientes relacionados (família, empresa e sócios): irmãos (mesmos pais), pai/mãe que também é
 * cliente, o mesmo telefone (agregado familiar ou empresa e sócios) e, quando existem, cônjuge e representante legal.
 */
export function relatedGroups(clients: RelatedClient[]): Map<string, string> {
    const parent = new Map<string, string>();
    const find = (id: string): string => { const p = parent.get(id) ?? id; if (p === id) return id; const root = find(p); parent.set(id, root); return root; };
    const union = (a: string, b: string) => { const x = find(a), y = find(b); if (x !== y) parent.set(x, y); };
    const norm = (value?: string) => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const byDoc = new Map<string, string>();
    const byName = new Map<string, string>();
    for (const client of clients) {
        parent.set(client.id, client.id);
        if (norm(client.nif)) byDoc.set(norm(client.nif), client.id);
        if (norm(client.name)) byName.set(norm(client.name), client.id);
    }
    const parents = new Map<string, string>();
    const phones = new Map<string, string>();
    const spouseDocs = new Map<string, string>();
    const spouseNames = new Map<string, string>();
    const legalReps = new Map<string, string>();

    for (const client of clients) {
        for (const name of [client.fatherName, client.motherName]) { const other = byName.get(norm(name)); if (other && other !== client.id) union(client.id, other); }
        const phone = String(client.phone || '').replace(/[^0-9]/g, '').slice(-9);
        if (phone.length === 9) { const other = phones.get(phone); if (other) union(client.id, other); else phones.set(phone, client.id); }

        // Cônjuge: por documento (NIF / BI) quer o cônjuge seja cliente quer ambos partilhem o mesmo documento de cônjuge
        for (const doc of [client.spouseNif, client.spouseBi]) {
            const clean = norm(doc);
            if (clean) {
                const other = byDoc.get(clean);
                if (other && other !== client.id) union(client.id, other);
                const shared = spouseDocs.get(clean);
                if (shared) union(client.id, shared);
                else spouseDocs.set(clean, client.id);
            }
        }
        // Cônjuge: por nome (se for cliente registado ou se ambos indicarem o mesmo cônjuge)
        const sName = norm(client.spouseName);
        if (sName) {
            const other = byName.get(sName);
            if (other && other !== client.id) union(client.id, other);
            const shared = spouseNames.get(sName);
            if (shared) union(client.id, shared);
            else spouseNames.set(sName, client.id);
        }

        // Representante legal: empresa e sócios (o representante é cliente ou duas empresas partilham o representante)
        const repName = norm(client.legalRepresentative);
        if (repName) {
            const other = byName.get(repName);
            if (other && other !== client.id) union(client.id, other);
            const shared = legalReps.get(repName);
            if (shared) union(client.id, shared);
            else legalReps.set(repName, client.id);
        }

        const family = norm(client.fatherName) && norm(client.motherName) ? `${norm(client.fatherName)}|${norm(client.motherName)}` : '';
        if (family) { const other = parents.get(family); if (other) union(client.id, other); else parents.set(family, client.id); }
    }
    const result = new Map<string, string>();
    for (const client of clients) result.set(client.id, find(client.id));
    return result;
}
