import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateCreditAfterPayment, calculateCreditAfterPaymentRemoval } from '../src/bibliotecas/calculos-financeiros.ts';

const credit = {
    id: 'credit-1', clientId: 'client-1', clientName: 'Cliente', principalAmount: 1000,
    currentBalance: 1000, interestRate: 10, lateInterestRate: 2, installments: 10,
    paidInstallments: 0, startDate: new Date(), dueDate: new Date(), status: 'active',
    daysOverdue: 0, accruedInterest: 100, lateInterest: 20, totalDue: 1120, createdAt: new Date()
} as const;

test('pagamento respeita a alocação e não reduz capital com juros', () => {
    const updated = calculateCreditAfterPayment(credit as never, {
        allocatedToPrincipal: 80,
        allocatedToInterest: 100,
        allocatedToLateInterest: 20
    }, []);
    assert.equal(updated.currentBalance, 920);
    assert.equal(updated.accruedInterest, 0);
    assert.equal(updated.lateInterest, 0);
    assert.equal(updated.totalDue, 920);
    assert.equal(updated.paidInstallments, 0);
});

test('quitação fecha o crédito e limita parcelas', () => {
    const updated = calculateCreditAfterPayment(credit as never, {
        allocatedToPrincipal: 1000,
        allocatedToInterest: 100,
        allocatedToLateInterest: 20
    }, []);
    assert.equal(updated.status, 'paid');
    assert.equal(updated.totalDue, 0);
    assert.equal(updated.paidInstallments, 10);
});

test('estorno repõe cada componente sem tratar juros como capital', () => {
    const afterPayment = calculateCreditAfterPayment(credit as never, {
        allocatedToPrincipal: 80, allocatedToInterest: 100, allocatedToLateInterest: 20
    }, []);
    const payment = {
        id: 'payment-1', creditId: 'credit-1', clientName: 'Cliente', amount: 200,
        allocatedToPrincipal: 80, allocatedToInterest: 100, allocatedToLateInterest: 20,
        paymentDate: new Date(), method: 'cash', processedBy: 'user', status: 'confirmed'
    };
    const restored = calculateCreditAfterPaymentRemoval(afterPayment, payment as never, []);
    assert.equal(restored.currentBalance, 1000);
    assert.equal(restored.accruedInterest, 100);
    assert.equal(restored.lateInterest, 20);
    assert.equal(restored.totalDue, 1120);
    assert.equal(restored.paidInstallments, 0);
});
