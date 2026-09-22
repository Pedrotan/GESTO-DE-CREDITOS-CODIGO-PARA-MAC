import type { Credit, Payment } from '@/tipos/credito';

export type PaymentAllocation = {
    allocatedToPrincipal: number;
    allocatedToInterest: number;
    allocatedToLateInterest: number;
};

export function calculateCreditAfterPayment(
    credit: Credit,
    allocation: PaymentAllocation,
    existingPayments: Payment[]
): Credit {
    const principalPaid = Math.min(credit.currentBalance, Math.max(0, allocation.allocatedToPrincipal));
    const interestPaid = Math.min(credit.accruedInterest, Math.max(0, allocation.allocatedToInterest));
    const lateInterestPaid = Math.min(credit.lateInterest, Math.max(0, allocation.allocatedToLateInterest));
    const currentBalance = Math.max(0, credit.currentBalance - principalPaid);
    const accruedInterest = Math.max(0, credit.accruedInterest - interestPaid);
    const lateInterest = Math.max(0, credit.lateInterest - lateInterestPaid);
    const totalDue = currentBalance + accruedInterest + lateInterest;
    const installmentPrincipal = credit.installments > 0 ? credit.principalAmount / credit.installments : credit.principalAmount;
    const previousPrincipalPaid = existingPayments
        .filter(payment => payment.creditId === credit.id && !payment.deletedAt && payment.status !== 'cancelled')
        .reduce((sum, payment) => sum + Math.max(0, payment.allocatedToPrincipal || 0), 0);
    const paidInstallments = installmentPrincipal > 0
        ? Math.min(credit.installments, Math.floor((previousPrincipalPaid + principalPaid + 0.000001) / installmentPrincipal))
        : credit.installments;
    const isFullyPaid = totalDue <= 0.01;

    return {
        ...credit,
        currentBalance,
        accruedInterest,
        lateInterest,
        totalDue,
        paidInstallments,
        status: isFullyPaid ? 'paid' : credit.status,
        paidAt: isFullyPaid ? new Date() : credit.paidAt
    };
}

export function calculateCreditAfterPaymentRemoval(credit: Credit, payment: Payment, remainingPayments: Payment[]): Credit {
    const currentBalance = Math.max(0, Number(credit.currentBalance || 0) + Number(payment.allocatedToPrincipal || 0));
    const accruedInterest = Math.max(0, Number(credit.accruedInterest || 0) + Number(payment.allocatedToInterest || 0));
    const lateInterest = Math.max(0, Number(credit.lateInterest || 0) + Number(payment.allocatedToLateInterest || 0));
    const installmentPrincipal = credit.installments > 0 ? credit.principalAmount / credit.installments : credit.principalAmount;
    const principalPaid = remainingPayments
        .filter(item => item.creditId === credit.id && !item.deletedAt && item.status !== 'cancelled')
        .reduce((sum, item) => sum + Math.max(0, Number(item.allocatedToPrincipal || 0)), 0);
    const paidInstallments = installmentPrincipal > 0
        ? Math.min(credit.installments, Math.floor((principalPaid + 0.000001) / installmentPrincipal))
        : credit.installments;
    return {
        ...credit, currentBalance, accruedInterest, lateInterest,
        totalDue: currentBalance + accruedInterest + lateInterest,
        paidInstallments,
        status: credit.status === 'paid' ? 'active' : credit.status,
        paidAt: undefined
    };
}
