export type InstallmentForReconciliation = {
    id: string;
    dueDate: string;
    principalMinor: number;
    interestMinor: number;
    lateInterestMinor: number;
    version: number;
};

export type PaidComponentTotals = {
    principalMinor: number;
    interestMinor: number;
    lateInterestMinor: number;
};

export type ReconciledInstallment = InstallmentForReconciliation & {
    paidPrincipalMinor: number;
    paidInterestMinor: number;
    paidLateInterestMinor: number;
    status: 'pending' | 'partial' | 'paid' | 'overdue';
    paidAt: string | null;
};

const safeAmount = (value: number) => Number.isSafeInteger(value) && value > 0 ? value : 0;

export function reconcileInstallments(
    schedule: InstallmentForReconciliation[],
    totals: PaidComponentTotals,
    asOf: Date | string = new Date()
): { installments: ReconciledInstallment[]; paidInstallments: number } {
    const timestamp = new Date(asOf);
    if (Number.isNaN(timestamp.getTime())) throw new Error('Data de conciliação inválida.');
    let principalRemaining = safeAmount(totals.principalMinor);
    let interestRemaining = safeAmount(totals.interestMinor);
    let lateRemaining = safeAmount(totals.lateInterestMinor);

    const installments = [...schedule]
        .sort((left, right) => new Date(left.dueDate).getTime() - new Date(right.dueDate).getTime())
        .map(item => {
            const principalDue = safeAmount(item.principalMinor);
            const interestDue = safeAmount(item.interestMinor);
            const lateDue = safeAmount(item.lateInterestMinor);
            const paidPrincipalMinor = Math.min(principalRemaining, principalDue);
            const paidInterestMinor = Math.min(interestRemaining, interestDue);
            const paidLateInterestMinor = Math.min(lateRemaining, lateDue);
            principalRemaining -= paidPrincipalMinor;
            interestRemaining -= paidInterestMinor;
            lateRemaining -= paidLateInterestMinor;
            const paid = paidPrincipalMinor >= principalDue && paidInterestMinor >= interestDue && paidLateInterestMinor >= lateDue;
            const partial = paidPrincipalMinor + paidInterestMinor + paidLateInterestMinor > 0;
            const overdue = !paid && new Date(item.dueDate).getTime() < timestamp.getTime();
            return {
                ...item,
                paidPrincipalMinor,
                paidInterestMinor,
                paidLateInterestMinor,
                status: paid ? 'paid' as const : partial ? 'partial' as const : overdue ? 'overdue' as const : 'pending' as const,
                paidAt: paid ? timestamp.toISOString() : null
            };
        });
    return { installments, paidInstallments: installments.filter(item => item.status === 'paid').length };
}
