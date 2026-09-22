import { Client, Credit, Payment } from '@/tipos/credito';
import { differenceInMonths } from 'date-fns';

export interface ClientScore {
    score: number; // 0-1000
    rating: 'Excelente' | 'Bom' | 'Regular' | 'Fraco' | 'Muito Fraco';
    stars: number; // 1-5
    breakdown: {
        paymentHistory: number; // 0-600
        activeCredits: number; // 0-200
        borrowedAmount: number; // 0-100
        tenure: number; // 0-100
    };
    metrics: {
        totalCredits: number;
        totalContracts: number;
        paymentsOnTime: number;
        latePayments: number;
        totalPayments: number;
        activeCreditsCount: number;
        totalBorrowed: number;
        monthsAsClient: number;
    };
}

/**
 * Calcula a pontuação de um cliente baseada em múltiplos fatores
 */
export function calculateClientScore(
    client: Client,
    credits: Credit[],
    payments: Payment[]
): ClientScore {
    // Filtrar créditos e pagamentos deste cliente
    const clientCredits = credits.filter(c => c.clientId === client.id);
    const clientPayments = payments.filter(p =>
        clientCredits.some(c => c.id === p.creditId)
    );

    // Métricas básicas
    const totalCredits = clientCredits.length;
    const totalContracts = clientCredits.length; // Assumindo 1 contrato por crédito
    const activeCreditsCount = clientCredits.filter(c =>
        c.status === 'active' || c.status === 'overdue' || c.status === 'renegotiated'
    ).length;
    const totalBorrowed = clientCredits.reduce((sum, c) => sum + c.principalAmount, 0);

    // Calcular antiguidade (meses como cliente)
    const registrationDate = client.createdAt ? new Date(client.createdAt) : new Date();
    const monthsAsClient = Math.max(0, differenceInMonths(new Date(), registrationDate));

    // 1. Histórico de Pagamentos (0-600 pontos)
    let paymentsOnTime = 0;
    let latePayments = 0;

    clientPayments.forEach(payment => {
        const credit = clientCredits.find(c => c.id === payment.creditId);
        if (!credit) return;

        // Verificar se o pagamento foi feito antes ou depois da data de vencimento
        const paymentDate = new Date(payment.paymentDate);
        const dueDate = new Date(payment.dueDate);

        if (paymentDate <= dueDate) {
            paymentsOnTime++;
        } else {
            latePayments++;
        }
    });

    const totalPayments = paymentsOnTime + latePayments;
    const paymentHistoryScore = totalPayments > 0
        ? (paymentsOnTime / totalPayments) * 600
        : 300; // Score neutro se não houver histórico

    // 2. Número de Créditos Ativos (0-200 pontos)
    // Menos créditos simultâneos = melhor score (indica gestão responsável)
    const activeCreditsScore = Math.max(0, 200 - (activeCreditsCount * 40));

    // 3. Valor Total Emprestado (0-100 pontos)
    // Clientes que não excedem muito o limite ideal ganham mais pontos
    const idealLimit = client.creditLimit * 0.7; // 70% do limite é considerado ideal
    const borrowedAmountScore = totalBorrowed <= idealLimit ? 100 : 50;

    // 4. Tempo como Cliente (0-100 pontos)
    // Clientes com mais de 12 meses ganham pontuação máxima
    const tenureScore = monthsAsClient >= 12 ? 100 : monthsAsClient * 8.33;

    // Score total
    const totalScore = Math.round(
        paymentHistoryScore +
        activeCreditsScore +
        borrowedAmountScore +
        tenureScore
    );

    // Garantir que o score está entre 0-1000
    const finalScore = Math.max(0, Math.min(1000, totalScore));

    // Determinar rating e estrelas
    let rating: ClientScore['rating'];
    let stars: number;

    if (finalScore >= 800) {
        rating = 'Excelente';
        stars = 5;
    } else if (finalScore >= 600) {
        rating = 'Bom';
        stars = 4;
    } else if (finalScore >= 400) {
        rating = 'Regular';
        stars = 3;
    } else if (finalScore >= 200) {
        rating = 'Fraco';
        stars = 2;
    } else {
        rating = 'Muito Fraco';
        stars = 1;
    }

    return {
        score: finalScore,
        rating,
        stars,
        breakdown: {
            paymentHistory: Math.round(paymentHistoryScore),
            activeCredits: Math.round(activeCreditsScore),
            borrowedAmount: Math.round(borrowedAmountScore),
            tenure: Math.round(tenureScore),
        },
        metrics: {
            totalCredits,
            totalContracts,
            paymentsOnTime,
            latePayments,
            totalPayments,
            activeCreditsCount,
            totalBorrowed,
            monthsAsClient,
        },
    };
}

/**
 * Renderiza estrelas visuais baseado na pontuação
 */
export function renderStars(stars: number): string {
    return '⭐'.repeat(stars) + '☆'.repeat(5 - stars);
}

/**
 * Retorna a cor do badge baseado no rating
 */
export function getRatingColor(rating: ClientScore['rating']): string {
    switch (rating) {
        case 'Excelente':
            return 'bg-green-100 text-green-800 border-green-300';
        case 'Bom':
            return 'bg-blue-100 text-blue-800 border-blue-300';
        case 'Regular':
            return 'bg-yellow-100 text-yellow-800 border-yellow-300';
        case 'Fraco':
            return 'bg-orange-100 text-orange-800 border-orange-300';
        case 'Muito Fraco':
            return 'bg-red-100 text-red-800 border-red-300';
    }
}
