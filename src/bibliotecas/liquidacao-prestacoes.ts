export interface InstallmentBalance {
    id: string;
    installmentNumber: number;
    dueDate: string;
    principalMinor: number;
    interestMinor: number;
    lateInterestMinor: number;
    paidPrincipalMinor: number;
    paidInterestMinor: number;
    paidLateInterestMinor: number;
    status: 'pending' | 'partial' | 'paid' | 'overdue' | 'cancelled';
    paidAt: string | null;
    version: number;
}

export function planConsecutiveInstallments(schedule: InstallmentBalance[], count: number) {
    if (!Number.isSafeInteger(count) || count < 1) throw new Error('Selecione uma quantidade válida de prestações.');
    const ordered = [...schedule].sort((a, b) => a.installmentNumber - b.installmentNumber);
    const open = ordered.filter(item => item.status !== 'cancelled' &&
        item.principalMinor + item.interestMinor + item.lateInterestMinor >
        item.paidPrincipalMinor + item.paidInterestMinor + item.paidLateInterestMinor);
    if (open.length === 0) throw new Error('Este crédito já se encontra totalmente liquidado.');
    if (count > open.length) throw new Error('A quantidade excede as prestações em aberto.');
    const selected = open.slice(0, count);
    const totals = selected.reduce((sum, item) => ({
        principalMinor: sum.principalMinor + item.principalMinor - item.paidPrincipalMinor,
        interestMinor: sum.interestMinor + item.interestMinor - item.paidInterestMinor,
        lateInterestMinor: sum.lateInterestMinor + item.lateInterestMinor - item.paidLateInterestMinor
    }), { principalMinor: 0, interestMinor: 0, lateInterestMinor: 0 });
    if (Object.values(totals).some(value => !Number.isSafeInteger(value) || value < 0)) {
        throw new Error('Cronograma inconsistente. Reveja as prestações antes de receber o pagamento.');
    }
    return { selected, open, ...totals,
        amountMinor: totals.principalMinor + totals.interestMinor + totals.lateInterestMinor };
}
