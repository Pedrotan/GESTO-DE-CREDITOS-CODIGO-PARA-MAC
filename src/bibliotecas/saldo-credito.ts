import type { Credit } from '@/tipos/credito';

/** Saldos de um crédito em unidades mínimas (cêntimos), lidos da base de dados. */
export type CreditBalancesMinor = {
    principalMinor: number;
    balanceMinor: number;
    interestMinor: number;
    lateInterestMinor: number;
    status: Credit['status'];
    version: number;
};

export type AllocationMinor = {
    principalMinor: number;
    interestMinor: number;
    lateInterestMinor: number;
};

export type CreditBalancesAfter = {
    balanceMinor: number;
    interestMinor: number;
    lateInterestMinor: number;
    totalDueMinor: number;
    status: Credit['status'];
};

type CreditRow = {
    principalAmount?: unknown; principalAmountMinor?: unknown;
    currentBalance?: unknown; currentBalanceMinor?: unknown;
    accruedInterest?: unknown; accruedInterestMinor?: unknown;
    lateInterest?: unknown; lateInterestMinor?: unknown;
    status?: unknown; version?: unknown;
};

const minorFrom = (minor: unknown, legacy: unknown): number => {
    if (minor !== null && minor !== undefined && minor !== '') {
        const value = Number(minor);
        if (Number.isSafeInteger(value)) return value;
    }
    const fallback = Math.round(Number(legacy || 0) * 100);
    if (!Number.isSafeInteger(fallback)) throw new Error('Montante do crédito inválido na base de dados.');
    return fallback;
};

const nonNegative = (value: number, label: string): number => {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label} inválido.`);
    return value;
};

/** Converte a linha persistida em saldos inteiros; as colunas *Minor são a fonte de verdade. */
export function creditBalancesFromRow(row: CreditRow): CreditBalancesMinor {
    return {
        principalMinor: minorFrom(row.principalAmountMinor, row.principalAmount),
        balanceMinor: minorFrom(row.currentBalanceMinor, row.currentBalance),
        interestMinor: minorFrom(row.accruedInterestMinor, row.accruedInterest),
        lateInterestMinor: minorFrom(row.lateInterestMinor, row.lateInterest),
        status: String(row.status || 'active') as Credit['status'],
        version: Number(row.version ?? 0)
    };
}

/**
 * Distribui um pagamento livre pelos componentes em dívida: mora, depois juro, depois capital.
 * Recusa montantes acima do total em dívida para que nenhum valor recebido fique por alocar.
 */
export function allocatePaymentMinor(current: CreditBalancesMinor, amountMinor: number): AllocationMinor {
    let remaining = nonNegative(amountMinor, 'Montante do pagamento');
    if (remaining === 0) throw new Error('O valor do pagamento tem de ser maior que zero.');
    const lateInterestMinor = Math.min(remaining, current.lateInterestMinor);
    remaining -= lateInterestMinor;
    const interestMinor = Math.min(remaining, current.interestMinor);
    remaining -= interestMinor;
    const principalMinor = Math.min(remaining, current.balanceMinor);
    remaining -= principalMinor;
    if (remaining > 0) {
        const totalDue = (current.balanceMinor + current.interestMinor + current.lateInterestMinor) / 100;
        throw new Error(`O pagamento excede o total em dívida (${totalDue.toFixed(2)}).`);
    }
    return { principalMinor, interestMinor, lateInterestMinor };
}

/** Aplica um pagamento (ou a reposição de um pagamento) aos saldos persistidos. */
export function applyPaymentToBalances(current: CreditBalancesMinor, allocation: AllocationMinor): CreditBalancesAfter {
    const principal = nonNegative(allocation.principalMinor, 'Capital alocado');
    const interest = nonNegative(allocation.interestMinor, 'Juro alocado');
    const late = nonNegative(allocation.lateInterestMinor, 'Juro de mora alocado');
    if (principal > current.balanceMinor || interest > current.interestMinor || late > current.lateInterestMinor) {
        throw new Error('O pagamento excede o saldo em dívida do crédito. Atualize os dados e tente novamente.');
    }
    const balanceMinor = current.balanceMinor - principal;
    const interestMinor = current.interestMinor - interest;
    const lateInterestMinor = current.lateInterestMinor - late;
    const totalDueMinor = balanceMinor + interestMinor + lateInterestMinor;
    return {
        balanceMinor, interestMinor, lateInterestMinor, totalDueMinor,
        status: totalDueMinor <= 0 ? 'paid' : current.status
    };
}

/** Reverte um pagamento estornado, devolvendo os componentes ao saldo em dívida. */
export function revertPaymentFromBalances(current: CreditBalancesMinor, allocation: AllocationMinor): CreditBalancesAfter {
    const balanceMinor = current.balanceMinor + nonNegative(allocation.principalMinor, 'Capital alocado');
    const interestMinor = current.interestMinor + nonNegative(allocation.interestMinor, 'Juro alocado');
    const lateInterestMinor = current.lateInterestMinor + nonNegative(allocation.lateInterestMinor, 'Juro de mora alocado');
    const totalDueMinor = balanceMinor + interestMinor + lateInterestMinor;
    return {
        balanceMinor, interestMinor, lateInterestMinor, totalDueMinor,
        status: current.status === 'paid' && totalDueMinor > 0 ? 'active' : current.status
    };
}
