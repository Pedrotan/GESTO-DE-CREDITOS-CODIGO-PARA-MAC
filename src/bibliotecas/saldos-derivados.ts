// Saldos de um crédito calculados a partir do seu plano de prestações (o que é devido menos o que foi pago, por
// componente). Cada pagamento, mora, ajuste, reforço ou reestruturação actualiza na mesma transacção as prestações e
// os totais do crédito; por isso os totais gravados têm de ser exactamente estas somas. Uma diferença quer dizer que o
// total chegou de outro computador calculado sobre prestações diferentes das deste (sincronização parcial).

/** Uma linha por crédito: totais gravados e somas das prestações (não canceladas). */
export const CREDIT_BALANCE_CHECK_SQL = `SELECT c.id, c.clientName, c.status,
    c.currentBalanceMinor, c.currentBalance, c.accruedInterestMinor, c.accruedInterest, c.lateInterestMinor, c.lateInterest, c.totalDueMinor, c.totalDue,
    SUM(i.principalMinor - i.paidPrincipalMinor) AS duePrincipalMinor,
    SUM(i.interestMinor - i.paidInterestMinor) AS dueInterestMinor,
    SUM(i.lateInterestMinor - i.paidLateInterestMinor) AS dueLateInterestMinor
    FROM credits c JOIN credit_installments i ON i.creditId = c.id AND i.status <> 'cancelled'
    WHERE c.deletedAt IS NULL GROUP BY c.id`;

export type CreditBalanceRow = {
    id: string; clientName?: string | null; status?: string | null;
    currentBalanceMinor?: unknown; currentBalance?: unknown; accruedInterestMinor?: unknown; accruedInterest?: unknown;
    lateInterestMinor?: unknown; lateInterest?: unknown; totalDueMinor?: unknown; totalDue?: unknown;
    duePrincipalMinor?: unknown; dueInterestMinor?: unknown; dueLateInterestMinor?: unknown;
};

export type BalanceField = 'balance' | 'interest' | 'lateInterest' | 'totalDue';
export const BALANCE_FIELD_LABELS: Record<BalanceField, string> = {
    balance: 'Capital em dívida', interest: 'Juros por pagar', lateInterest: 'Juros de mora por pagar', totalDue: 'Total em dívida',
};
export type BalanceMismatch = { creditId: string; clientName: string; field: BalanceField; storedMinor: number; derivedMinor: number };

const minor = (value: unknown, legacy: unknown) => {
    if (value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value))) return Math.round(Number(value));
    return Math.round(Number(legacy || 0) * 100);
};

/** Totais do crédito que as prestações dão (nunca negativos). */
export const derivedBalances = (row: CreditBalanceRow) => {
    const balance = Math.max(0, Math.round(Number(row.duePrincipalMinor || 0)));
    const interest = Math.max(0, Math.round(Number(row.dueInterestMinor || 0)));
    const lateInterest = Math.max(0, Math.round(Number(row.dueLateInterestMinor || 0)));
    return { balance, interest, lateInterest, totalDue: balance + interest + lateInterest };
};

/** Campos em que o total gravado no crédito não é a soma das prestações (diferença de pelo menos 1 cêntimo). */
export const balanceMismatches = (rows: CreditBalanceRow[]): BalanceMismatch[] => rows.flatMap(row => {
    const derived = derivedBalances(row);
    const stored: Record<BalanceField, number> = {
        balance: minor(row.currentBalanceMinor, row.currentBalance),
        interest: minor(row.accruedInterestMinor, row.accruedInterest),
        lateInterest: minor(row.lateInterestMinor, row.lateInterest),
        totalDue: minor(row.totalDueMinor, row.totalDue),
    };
    return (Object.keys(stored) as BalanceField[])
        .filter(field => stored[field] !== derived[field])
        .map(field => ({ creditId: String(row.id), clientName: String(row.clientName || ''), field, storedMinor: stored[field], derivedMinor: derived[field] }));
});
