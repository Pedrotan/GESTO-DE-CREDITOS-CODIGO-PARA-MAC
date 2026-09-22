import { Credit } from '@/tipos/credito';
import { differenceInDays, isValid } from 'date-fns';

export class CreditEntity {
    static calculateBalance(credit: Credit): number {
        // Lógica de domínio: Saldo é o principal menos amortizações (simplificado por agora)
        return credit.currentBalance;
    }

    static getDaysOverdue(credit: Credit): number {
        if (credit.status === 'paid') return 0;
        const today = new Date();
        const dueDate = new Date(credit.dueDate);
        if (!isValid(dueDate)) return 0;
        const days = differenceInDays(today, dueDate);
        return days > 0 ? days : 0;
    }

    static calculateAccruedInterest(credit: Credit): number {
        // Implementar fórmula bancária de juros aqui
        return credit.accruedInterest;
    }

    static calculateScore(credits: Credit[]): number {
        let score = 100;
        if (credits.length === 0) return 100;

        credits.forEach(c => {
            if (c.status === 'overdue' || c.status === 'defaulted') {
                score -= 15;
                score -= Math.min(c.daysOverdue || 0, 35);
            }
            if (c.status === 'paid') score += 5;
        });

        return Math.max(0, Math.min(100, score));
    }
}




