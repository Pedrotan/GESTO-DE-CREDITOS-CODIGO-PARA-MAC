/**
 * Motor de risco da carteira (puro, sem dependências de UI ou base de dados).
 *
 * Partilhado pelo Painel, Garantias, Análise de Risco e Contencioso para que
 * todos os ecrãs usem exactamente as mesmas regras:
 *  - só conta como "desembolsado" o crédito aprovado (exclui pendentes,
 *    rejeitados, cancelados e apagados);
 *  - atraso (DPD) = maior entre o valor guardado e os dias desde o próximo
 *    vencimento em aberto;
 *  - garantias entram pelo valor elegível (valor de mercado − haircut);
 *  - provisões estimadas por escalão de atraso sobre a parte não coberta.
 *
 * As percentagens (haircuts e provisões) são uma matriz interna de referência
 * e podem ser ajustadas aqui para acompanhar a política de risco da empresa.
 */

export interface CreditLike {
    id: string;
    clientId: string;
    clientName?: string;
    status: string;
    currentBalance?: number | string | null;
    totalDue?: number | string | null;
    principalAmount?: number | string | null;
    daysOverdue?: number | string | null;
    nextDueDate?: Date | string | null;
    dueDate?: Date | string | null;
    startDate?: Date | string | null;
    createdAt?: Date | string | null;
    deletedAt?: Date | string | null;
}

export interface PaymentLike {
    creditId: string;
    amount?: number | string | null;
    paymentDate: Date | string;
    dueDate?: Date | string | null;
    status?: string | null;
    deletedAt?: Date | string | null;
}

export interface WarrantyLike {
    id: string;
    clientId: string;
    creditId?: string | null;
    type: string;
    marketValue: number | string;
    status: string;
    createdAt: string;
    updatedAt?: string | null;
    notes?: string | null;
    photos?: string[] | null;
    documents?: string[] | null;
}

export interface LegalCaseLike {
    id: string;
    clientId: string;
    creditId: string;
    stage: string;
    priority?: string;
    debtAmount: number | string;
    createdAt: string;
    updatedAt?: string | null;
    closedAt?: string | null;
}

export interface ClientLike {
    id: string;
    name: string;
    creditLimit?: number | string | null;
    blocked?: boolean | null;
    status?: string | null;
}

const DAY_MS = 86_400_000;
const num = (value: unknown): number => {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
};
const toDate = (value: unknown): Date | null => {
    if (value === null || value === undefined || value === '') return null;
    const d = value instanceof Date ? value : new Date(String(value));
    return Number.isNaN(d.getTime()) ? null : d;
};
const dayIndex = (d: Date): number => Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY_MS);

/** Diferença em dias de calendário (b − a). */
export function daysBetween(a: Date, b: Date): number {
    return dayIndex(b) - dayIndex(a);
}

// ---------------------------------------------------------------------------
// Estados do crédito
// ---------------------------------------------------------------------------

export const NON_DISBURSED_STATUSES = new Set(['pending_approval', 'rejected', 'cancelled']);
export const OPEN_CREDIT_STATUSES = new Set(['active', 'overdue', 'renegotiated', 'defaulted']);

/** Crédito efectivamente concedido (o dinheiro saiu). */
export function isDisbursedCredit(credit: CreditLike): boolean {
    return !credit.deletedAt && !NON_DISBURSED_STATUSES.has(credit.status);
}

/** Crédito concedido que ainda tem saldo em dívida. */
export function isOpenCredit(credit: CreditLike): boolean {
    return !credit.deletedAt && OPEN_CREDIT_STATUSES.has(credit.status) && num(credit.currentBalance) > 0.01;
}

/** Exposição = capital em dívida. */
export function creditExposure(credit: CreditLike): number {
    return Math.max(0, num(credit.currentBalance));
}

/** Dívida total (capital + juros + mora), nunca inferior ao capital. */
export function creditTotalDue(credit: CreditLike): number {
    return Math.max(creditExposure(credit), num(credit.totalDue));
}

/** Dias em atraso (DPD) de um crédito em aberto. */
export function daysPastDue(credit: CreditLike, today: Date = new Date()): number {
    if (!isOpenCredit(credit)) return 0;
    let dpd = Math.max(0, Math.floor(num(credit.daysOverdue)));
    const next = toDate(credit.nextDueDate) ?? (credit.status === 'overdue' || credit.status === 'defaulted' ? toDate(credit.dueDate) : null);
    if (next) {
        const late = daysBetween(next, today);
        if (late > dpd) dpd = late;
    }
    if (dpd === 0 && (credit.status === 'overdue' || credit.status === 'defaulted')) dpd = 1;
    return dpd;
}

// ---------------------------------------------------------------------------
// Escalões de atraso (aging) e provisões
// ---------------------------------------------------------------------------

export type AgingKey = 'em_dia' | '1_30' | '31_60' | '61_90' | '91_180' | '180_mais';

export interface AgingBucketDef {
    key: AgingKey;
    label: string;
    min: number;
    max: number;
    /** Percentagem de provisão aplicada à exposição não coberta. */
    provisionRate: number;
    color: string;
}

export const AGING_BUCKETS: AgingBucketDef[] = [
    { key: 'em_dia', label: 'Em dia', min: 0, max: 0, provisionRate: 0.01, color: '#10b981' },
    { key: '1_30', label: '1–30 dias', min: 1, max: 30, provisionRate: 0.03, color: '#84cc16' },
    { key: '31_60', label: '31–60 dias', min: 31, max: 60, provisionRate: 0.1, color: '#eab308' },
    { key: '61_90', label: '61–90 dias', min: 61, max: 90, provisionRate: 0.25, color: '#f97316' },
    { key: '91_180', label: '91–180 dias', min: 91, max: 180, provisionRate: 0.5, color: '#ef4444' },
    { key: '180_mais', label: '+180 dias', min: 181, max: Number.POSITIVE_INFINITY, provisionRate: 1, color: '#991b1b' },
];

export function agingBucketFor(dpd: number): AgingBucketDef {
    return AGING_BUCKETS.find(b => dpd >= b.min && dpd <= b.max) ?? AGING_BUCKETS[AGING_BUCKETS.length - 1];
}

// ---------------------------------------------------------------------------
// Garantias
// ---------------------------------------------------------------------------

/** Desconto prudencial sobre o valor de mercado, por tipo de bem. */
export const WARRANTY_HAIRCUTS: Record<string, number> = {
    'Imóvel': 0.3,
    'Veículo': 0.4,
    'Equipamento': 0.5,
    'Outro': 0.6,
};

/** Meses após os quais uma garantia activa deve ser revistada/reavaliada. */
export const INSPECTION_INTERVAL_MONTHS = 12;

export function warrantyHaircut(type: string): number {
    return WARRANTY_HAIRCUTS[type] ?? WARRANTY_HAIRCUTS['Outro'];
}

export function eligibleCollateralValue(warranty: WarrantyLike): number {
    if (warranty.status !== 'active') return 0;
    return Math.max(0, num(warranty.marketValue) * (1 - warrantyHaircut(warranty.type)));
}

// ---------------------------------------------------------------------------
// Histórico em notas (vistorias e diligências) — sem alterar o esquema da BD
// ---------------------------------------------------------------------------

export interface TimelineEntry {
    date: string; // yyyy-mm-dd
    kind: string; // VISTORIA, DILIGÊNCIA, FASE, CARTA, ...
    author: string;
    text: string;
}

const TIMELINE_RE = /^\[(\d{4}-\d{2}-\d{2})\|([^|\]]+)\|([^\]]*)\]\s?(.*)$/u;

export function formatTimelineEntry(entry: TimelineEntry): string {
    const clean = (s: string) => s.replace(/[|\]\r\n]/g, ' ').trim();
    return `[${entry.date}|${clean(entry.kind).toUpperCase()}|${clean(entry.author) || 'Sistema'}] ${entry.text.replace(/\r?\n/g, ' ').trim()}`;
}

/** Acrescenta uma entrada no topo das notas, preservando o texto existente. */
export function appendTimelineEntry(notes: string | null | undefined, entry: TimelineEntry): string {
    const line = formatTimelineEntry(entry);
    const current = (notes ?? '').trim();
    return current ? `${line}\n${current}` : line;
}

export function parseTimeline(notes: string | null | undefined): { entries: TimelineEntry[]; freeText: string } {
    const entries: TimelineEntry[] = [];
    const free: string[] = [];
    for (const raw of (notes ?? '').split(/\r?\n/)) {
        const line = raw.trim();
        if (!line) continue;
        const m = TIMELINE_RE.exec(line);
        if (m) entries.push({ date: m[1], kind: m[2], author: m[3], text: m[4] });
        else free.push(line);
    }
    entries.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    return { entries, freeText: free.join('\n') };
}

export function lastInspectionDate(warranty: WarrantyLike): Date {
    const visits = parseTimeline(warranty.notes).entries.filter(e => e.kind === 'VISTORIA');
    const fromNotes = visits.length ? toDate(`${visits[0].date}T12:00:00`) : null;
    return fromNotes ?? toDate(warranty.createdAt) ?? new Date(0);
}

export function needsInspection(warranty: WarrantyLike, today: Date = new Date(), months = INSPECTION_INTERVAL_MONTHS): boolean {
    if (warranty.status !== 'active') return false;
    return daysBetween(lastInspectionDate(warranty), today) > Math.round(months * 30.4);
}

export function warrantyDocumentationScore(warranty: WarrantyLike): { photos: number; documents: number; complete: boolean } {
    const photos = warranty.photos?.length ?? 0;
    const documents = warranty.documents?.length ?? 0;
    return { photos, documents, complete: photos > 0 && documents > 0 };
}

// ---------------------------------------------------------------------------
// Carteira
// ---------------------------------------------------------------------------

export interface CreditRisk {
    creditId: string;
    clientId: string;
    exposure: number;
    totalDue: number;
    dpd: number;
    bucket: AgingKey;
    collateralEligible: number;
    coverage: number; // 0..1 da exposição coberta por garantia elegível
    provision: number;
}

export interface ClientRisk {
    clientId: string;
    name: string;
    exposure: number;
    totalDue: number;
    openCredits: number;
    maxDpd: number;
    collateralMarket: number;
    collateralEligible: number;
    coverage: number;
    ltv: number | null; // exposição / valor de mercado
    overLimit: boolean;
    hasLegalCase: boolean;
    share: number; // peso na carteira
}

export interface PortfolioRisk {
    totalExposure: number;
    totalDue: number;
    openCredits: number;
    aging: Array<AgingBucketDef & { exposure: number; count: number; provision: number; share: number }>;
    par30: number;
    par30Amount: number;
    par90: number;
    nplAmount: number;
    provisionGross: number;
    provisionNet: number;
    collateralMarket: number;
    collateralEligible: number;
    coveredExposure: number;
    coverageRatio: number;
    concentration: { top1Share: number; top5Share: number; hhi: number; top: ClientRisk[] };
    perCredit: Map<string, CreditRisk>;
    perClient: Map<string, ClientRisk>;
}

export interface PortfolioInput {
    credits: CreditLike[];
    warranties?: WarrantyLike[];
    legalCases?: LegalCaseLike[];
    clients?: ClientLike[];
}

export function computePortfolioRisk(input: PortfolioInput, today: Date = new Date()): PortfolioRisk {
    const openCredits = input.credits.filter(isOpenCredit);
    const clientsById = new Map((input.clients ?? []).map(c => [c.id, c]));
    const activeWarranties = (input.warranties ?? []).filter(w => w.status === 'active');
    const openLegalCredits = new Set((input.legalCases ?? []).filter(l => l.stage !== 'closed').map(l => l.creditId));
    const openLegalClients = new Set((input.legalCases ?? []).filter(l => l.stage !== 'closed').map(l => l.clientId));

    const exposureByClient = new Map<string, number>();
    for (const c of openCredits) exposureByClient.set(c.clientId, (exposureByClient.get(c.clientId) ?? 0) + creditExposure(c));

    // Garantias ligadas a um crédito aberto cobrem esse crédito; as restantes
    // ficam num "pool" do cliente, repartido proporcionalmente à exposição.
    const openIds = new Set(openCredits.map(c => c.id));
    const directCollateral = new Map<string, number>();
    const poolCollateral = new Map<string, number>();
    const marketByClient = new Map<string, number>();
    for (const w of activeWarranties) {
        const eligible = eligibleCollateralValue(w);
        marketByClient.set(w.clientId, (marketByClient.get(w.clientId) ?? 0) + num(w.marketValue));
        if (w.creditId && openIds.has(w.creditId)) directCollateral.set(w.creditId, (directCollateral.get(w.creditId) ?? 0) + eligible);
        else poolCollateral.set(w.clientId, (poolCollateral.get(w.clientId) ?? 0) + eligible);
    }

    const perCredit = new Map<string, CreditRisk>();
    const aging = AGING_BUCKETS.map(b => ({ ...b, exposure: 0, count: 0, provision: 0, share: 0 }));
    let totalExposure = 0, totalDue = 0, provisionGross = 0, provisionNet = 0, coveredExposure = 0;

    for (const c of openCredits) {
        const exposure = creditExposure(c);
        const dpd = daysPastDue(c, today);
        const bucket = agingBucketFor(dpd);
        const clientExposure = exposureByClient.get(c.clientId) ?? 0;
        const pooled = clientExposure > 0 ? (poolCollateral.get(c.clientId) ?? 0) * (exposure / clientExposure) : 0;
        const collateralEligible = (directCollateral.get(c.id) ?? 0) + pooled;
        const covered = Math.min(exposure, collateralEligible);
        const gross = exposure * bucket.provisionRate;
        const net = Math.max(0, exposure - covered) * bucket.provisionRate;
        const risk: CreditRisk = {
            creditId: c.id, clientId: c.clientId, exposure, totalDue: creditTotalDue(c), dpd, bucket: bucket.key,
            collateralEligible, coverage: exposure > 0 ? covered / exposure : 0, provision: net,
        };
        perCredit.set(c.id, risk);
        const slot = aging.find(a => a.key === bucket.key);
        if (slot) { slot.exposure += exposure; slot.count += 1; slot.provision += net; }
        totalExposure += exposure;
        totalDue += risk.totalDue;
        provisionGross += gross;
        provisionNet += net;
        coveredExposure += covered;
    }
    for (const a of aging) a.share = totalExposure > 0 ? a.exposure / totalExposure : 0;

    const perClient = new Map<string, ClientRisk>();
    const openById = new Map(openCredits.map(c => [c.id, c]));
    for (const risk of perCredit.values()) {
        const client = clientsById.get(risk.clientId);
        const credit = openById.get(risk.creditId);
        const current = perClient.get(risk.clientId) ?? {
            clientId: risk.clientId,
            name: client?.name ?? credit?.clientName ?? risk.clientId,
            exposure: 0, totalDue: 0, openCredits: 0, maxDpd: 0,
            collateralMarket: marketByClient.get(risk.clientId) ?? 0,
            collateralEligible: 0, coverage: 0, ltv: null, overLimit: false,
            hasLegalCase: openLegalClients.has(risk.clientId), share: 0,
        };
        current.exposure += risk.exposure;
        current.totalDue += risk.totalDue;
        current.openCredits += 1;
        current.maxDpd = Math.max(current.maxDpd, risk.dpd);
        current.collateralEligible += risk.collateralEligible;
        if (openLegalCredits.has(risk.creditId)) current.hasLegalCase = true;
        perClient.set(risk.clientId, current);
    }
    for (const c of perClient.values()) {
        c.coverage = c.exposure > 0 ? Math.min(1, c.collateralEligible / c.exposure) : 0;
        c.ltv = c.collateralMarket > 0 ? c.exposure / c.collateralMarket : null;
        const limit = num(clientsById.get(c.clientId)?.creditLimit);
        c.overLimit = limit > 0 && c.exposure > limit + 0.01;
        c.share = totalExposure > 0 ? c.exposure / totalExposure : 0;
    }

    const ranked = [...perClient.values()].sort((a, b) => b.exposure - a.exposure);
    const par30Amount = aging.filter(a => a.min > 30).reduce((s, a) => s + a.exposure, 0);
    const nplAmount = aging.filter(a => a.min > 90).reduce((s, a) => s + a.exposure, 0);
    const collateralMarket = activeWarranties.reduce((s, w) => s + num(w.marketValue), 0);
    const collateralEligible = activeWarranties.reduce((s, w) => s + eligibleCollateralValue(w), 0);

    return {
        totalExposure,
        totalDue,
        openCredits: openCredits.length,
        aging,
        par30: totalExposure > 0 ? par30Amount / totalExposure : 0,
        par30Amount,
        par90: totalExposure > 0 ? nplAmount / totalExposure : 0,
        nplAmount,
        provisionGross,
        provisionNet,
        collateralMarket,
        collateralEligible,
        coveredExposure,
        coverageRatio: totalExposure > 0 ? coveredExposure / totalExposure : 0,
        concentration: {
            top1Share: ranked[0]?.share ?? 0,
            top5Share: ranked.slice(0, 5).reduce((s, c) => s + c.share, 0),
            hhi: ranked.reduce((s, c) => s + c.share * c.share, 0),
            top: ranked.slice(0, 10),
        },
        perCredit,
        perClient,
    };
}

// ---------------------------------------------------------------------------
// Vencimentos, tendência e contencioso
// ---------------------------------------------------------------------------

export function upcomingDue<T extends CreditLike>(credits: T[], today: Date = new Date(), days = 7): Array<{ credit: T; dueDate: Date; inDays: number }> {
    const out: Array<{ credit: T; dueDate: Date; inDays: number }> = [];
    for (const credit of credits) {
        if (!isOpenCredit(credit)) continue;
        const due = toDate(credit.nextDueDate);
        if (!due) continue;
        const inDays = daysBetween(today, due);
        if (inDays >= 0 && inDays <= days) out.push({ credit, dueDate: due, inDays });
    }
    return out.sort((a, b) => a.inDays - b.inDays || creditExposure(b.credit) - creditExposure(a.credit));
}

export type PaymentTrend = 'up' | 'down' | 'stable' | 'insufficient';

/**
 * Tendência real de pontualidade: compara a taxa de pagamentos em dia dos
 * últimos 90 dias com os 90 dias anteriores.
 */
export function paymentTrend(creditIds: Set<string>, payments: PaymentLike[], today: Date = new Date(), windowDays = 90): PaymentTrend {
    const recent = { onTime: 0, total: 0 };
    const previous = { onTime: 0, total: 0 };
    for (const p of payments) {
        if (!creditIds.has(p.creditId) || p.status === 'cancelled' || p.deletedAt) continue;
        const paid = toDate(p.paymentDate);
        if (!paid) continue;
        const age = daysBetween(paid, today);
        const bucket = age >= 0 && age < windowDays ? recent : age >= windowDays && age < windowDays * 2 ? previous : null;
        if (!bucket) continue;
        const due = toDate(p.dueDate);
        bucket.total += 1;
        if (!due || daysBetween(due, paid) <= 0) bucket.onTime += 1;
    }
    if (recent.total < 2 || previous.total < 2) return 'insufficient';
    const delta = recent.onTime / recent.total - previous.onTime / previous.total;
    if (delta > 0.1) return 'up';
    if (delta < -0.1) return 'down';
    return 'stable';
}

/** Créditos com atraso elevado (ou em incumprimento) sem processo de contencioso aberto. */
export function legalCandidates<T extends CreditLike>(credits: T[], legalCases: LegalCaseLike[], today: Date = new Date(), minDpd = 90): Array<{ credit: T; dpd: number; totalDue: number }> {
    const inLitigation = new Set(legalCases.filter(l => l.stage !== 'closed').map(l => l.creditId));
    return credits
        .filter(c => isOpenCredit(c) && !inLitigation.has(c.id))
        .map(credit => ({ credit, dpd: daysPastDue(credit, today), totalDue: creditTotalDue(credit) }))
        .filter(r => r.dpd >= minDpd || r.credit.status === 'defaulted')
        .sort((a, b) => b.dpd - a.dpd || b.totalDue - a.totalDue);
}

export const LEGAL_STAGES = ['interpellated', 'mediation', 'court', 'closed'] as const;
export type LegalStage = typeof LEGAL_STAGES[number];

export function nextLegalStage(stage: string): LegalStage | null {
    const i = LEGAL_STAGES.indexOf(stage as LegalStage);
    return i >= 0 && i < LEGAL_STAGES.length - 1 ? LEGAL_STAGES[i + 1] : null;
}

/** Dias sem qualquer actualização a partir dos quais o processo é "parado". */
export const LEGAL_STALE_DAYS = 30;

/** Resultados de encerramento que NÃO representam dinheiro recuperado. */
export const LEGAL_NON_RECOVERY_OUTCOMES = ['Incobrável', 'Desistência'];

/** Um processo fechado conta como recuperado, salvo se o encerramento registado indicar abate/desistência. */
export function isLegalCaseRecovered(legalCase: LegalCaseLike & { notes?: string | null }): boolean {
    if (legalCase.stage !== 'closed') return false;
    const closing = parseTimeline(legalCase.notes).entries.find(e => e.kind === 'ENCERRAMENTO');
    return !closing || !LEGAL_NON_RECOVERY_OUTCOMES.some(o => closing.text.startsWith(o));
}

export function legalCaseMetrics(cases: Array<LegalCaseLike & { notes?: string | null }>, today: Date = new Date()) {
    const open = cases.filter(c => c.stage !== 'closed');
    const byStage = LEGAL_STAGES.map(stage => {
        const list = cases.filter(c => c.stage === stage);
        return { stage, count: list.length, amount: list.reduce((s, c) => s + num(c.debtAmount), 0) };
    });
    const closed = cases.filter(c => c.stage === 'closed');
    const recovered = closed.filter(isLegalCaseRecovered);
    const closedThisMonth = recovered.filter(c => {
        const d = toDate(c.closedAt);
        return d !== null && d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth();
    });
    const stale = open.filter(c => daysBetween(toDate(c.updatedAt) ?? toDate(c.createdAt) ?? today, today) > LEGAL_STALE_DAYS);
    const totalAmount = cases.reduce((s, c) => s + num(c.debtAmount), 0);
    const recoveredAmount = recovered.reduce((s, c) => s + num(c.debtAmount), 0);
    return {
        openCount: open.length,
        litigatedAmount: open.reduce((s, c) => s + num(c.debtAmount), 0),
        criticalCount: open.filter(c => c.priority === 'critical').length,
        byStage,
        recoveredThisMonth: closedThisMonth.reduce((s, c) => s + num(c.debtAmount), 0),
        recoveryRate: totalAmount > 0 ? recoveredAmount / totalAmount : 0,
        avgAgeDays: open.length ? Math.round(open.reduce((s, c) => s + daysBetween(toDate(c.createdAt) ?? today, today), 0) / open.length) : 0,
        staleIds: new Set(stale.map(c => c.id)),
    };
}

// ---------------------------------------------------------------------------
// Alertas operacionais e de controlo
// ---------------------------------------------------------------------------

export type AlertSeverity = 'critical' | 'warning' | 'info';

export interface RiskAlert {
    id: string;
    severity: AlertSeverity;
    title: string;
    description: string;
    count: number;
    amount?: number;
    link: string;
}

export interface AlertsInput extends PortfolioInput {
    payments?: PaymentLike[];
}

export function buildRiskAlerts(input: AlertsInput, portfolio: PortfolioRisk, today: Date = new Date()): RiskAlert[] {
    const alerts: RiskAlert[] = [];
    const credits = input.credits.filter(c => !c.deletedAt);
    const push = (a: RiskAlert) => { if (a.count > 0) alerts.push(a); };

    const npl = legalCandidates(credits, input.legalCases ?? [], today, 90);
    push({ id: 'npl-sem-contencioso', severity: 'critical', title: 'Atraso +90 dias sem contencioso', description: 'Créditos em incumprimento sem processo de recuperação aberto.', count: npl.length, amount: npl.reduce((s, r) => s + r.totalDue, 0), link: '/contencioso' });

    const overLimit = [...portfolio.perClient.values()].filter(c => c.overLimit);
    push({ id: 'acima-limite', severity: 'critical', title: 'Exposição acima do plafond', description: 'Clientes com dívida superior ao limite de crédito aprovado.', count: overLimit.length, amount: overLimit.reduce((s, c) => s + c.exposure, 0), link: '/clientes' });

    const blockedWithDebt = (input.clients ?? []).filter(c => (c.blocked || c.status === 'blocked') && (portfolio.perClient.get(c.id)?.exposure ?? 0) > 0);
    push({ id: 'bloqueados-com-saldo', severity: 'warning', title: 'Clientes bloqueados com saldo', description: 'Contas suspensas que ainda têm valores em dívida.', count: blockedWithDebt.length, link: '/clientes' });

    const lateUncovered = [...portfolio.perCredit.values()].filter(r => r.dpd > 30 && r.coverage < 0.5);
    push({ id: 'atraso-sem-garantia', severity: 'warning', title: 'Atraso sem garantia suficiente', description: 'Créditos com +30 dias de atraso e menos de 50% de cobertura.', count: lateUncovered.length, amount: lateUncovered.reduce((s, r) => s + r.exposure, 0), link: '/garantias' });

    const pendingApproval = credits.filter(c => c.status === 'pending_approval');
    push({ id: 'aprovacoes-pendentes', severity: 'warning', title: 'Créditos a aguardar aprovação', description: 'Pedidos que ainda não foram desembolsados.', count: pendingApproval.length, amount: pendingApproval.reduce((s, c) => s + num(c.principalAmount), 0), link: '/aprovacoes' });

    const pendingPayments = (input.payments ?? []).filter(p => p.status === 'pending' && !p.deletedAt);
    push({ id: 'pagamentos-por-validar', severity: 'warning', title: 'Pagamentos por validar', description: 'Transferências/depósitos registados mas ainda não confirmados.', count: pendingPayments.length, amount: pendingPayments.reduce((s, p) => s + num(p.amount), 0), link: '/pagamentos' });

    const inspections = (input.warranties ?? []).filter(w => needsInspection(w, today));
    push({ id: 'vistorias', severity: 'info', title: 'Garantias por revistar', description: `Garantias activas sem vistoria há mais de ${INSPECTION_INTERVAL_MONTHS} meses.`, count: inspections.length, link: '/garantias' });

    const staleCases = legalCaseMetrics(input.legalCases ?? [], today).staleIds.size;
    push({ id: 'contencioso-parado', severity: 'info', title: 'Processos sem diligência', description: `Processos sem actualização há mais de ${LEGAL_STALE_DAYS} dias.`, count: staleCases, link: '/contencioso' });

    if (portfolio.concentration.top1Share > 0.2 && portfolio.perClient.size > 1) {
        const top = portfolio.concentration.top[0];
        alerts.push({ id: 'concentracao', severity: 'warning', title: 'Concentração elevada', description: `${top.name} representa ${(top.share * 100).toFixed(1)}% da carteira.`, count: 1, amount: top.exposure, link: '/scoring' });
    }

    const order: Record<AlertSeverity, number> = { critical: 0, warning: 1, info: 2 };
    return alerts.sort((a, b) => order[a.severity] - order[b.severity]);
}
