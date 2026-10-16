import { Client, Credit, Payment } from '@/tipos/credito';
import { differenceInMonths } from 'date-fns';
import { daysPastDue } from './risco-carteira.ts';

export interface ClientScore {
    score: number; // 0-1000
    rating: 'Excelente' | 'Bom' | 'Regular' | 'Fraco' | 'Muito Fraco';
    stars: number; // 1-5
    breakdown: {
        paymentHistory: number; // 0-600
        activeCredits: number; // 0-200
        borrowedAmount: number; // 0-100
        tenure: number; // 0-100
        /** Penalização pela situação actual de atraso (0 ou negativa). */
        delinquencyPenalty: number;
    };
    /** Fiabilidade do score: 'baixa' quando há pouco histórico de pagamentos. */
    confidence: 'alta' | 'média' | 'baixa';
    metrics: {
        totalCredits: number;
        totalContracts: number;
        paymentsOnTime: number;
        latePayments: number;
        totalPayments: number;
        activeCreditsCount: number;
        totalBorrowed: number;
        monthsAsClient: number;
        /** Maior atraso actual (dias) entre os créditos em aberto. */
        maxDaysOverdue: number;
    };
}

/** Penalização aplicada ao score conforme o atraso actual. */
export function delinquencyPenaltyFor(maxDaysOverdue: number, hasDefault: boolean): number {
    if (hasDefault || maxDaysOverdue > 90) return -450;
    if (maxDaysOverdue > 60) return -300;
    if (maxDaysOverdue > 30) return -200;
    if (maxDaysOverdue > 0) return -100;
    return 0;
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
    const clientCredits = credits.filter(c => c.clientId === client.id && !c.deletedAt);
    const clientCreditIds = new Set(clientCredits.map(c => c.id));
    // Pagamentos anulados não contam para o histórico
    const clientPayments = payments.filter(p =>
        clientCreditIds.has(p.creditId) && p.status !== 'cancelled' && !(p as any).deletedAt
    );

    // Métricas básicas
    const totalCredits = clientCredits.length;
    const totalContracts = clientCredits.length; // Assumindo 1 contrato por crédito
    const activeCreditsCount = clientCredits.filter(c =>
        c.status === 'active' || c.status === 'overdue' || c.status === 'renegotiated' || c.status === 'defaulted'
    ).length;
    const totalBorrowed = clientCredits.reduce((sum, c) => sum + c.principalAmount, 0);

    // Calcular antiguidade (meses como cliente)
    const registrationDate = client.createdAt ? new Date(client.createdAt) : new Date();
    const monthsAsClient = Math.max(0, differenceInMonths(new Date(), registrationDate));

    // 1. Histórico de Pagamentos (0-600 pontos)
    let paymentsOnTime = 0;
    let latePayments = 0;

    clientPayments.forEach(payment => {
        // Verificar se o pagamento foi feito antes ou depois da data de vencimento
        const paymentDate = new Date(payment.paymentDate);
        const dueDate = new Date(payment.dueDate as any);
        // Sem data de vencimento válida não há evidência de atraso: fica fora da pontualidade
        if (isNaN(paymentDate.getTime()) || isNaN(dueDate.getTime())) return;

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

    // 5. Situação actual: atraso em curso penaliza o score (um cliente em
    // incumprimento não pode aparecer como "Bom" só por falta de histórico)
    const today = new Date();
    const maxDaysOverdue = clientCredits.reduce((max, c) => Math.max(max, daysPastDue(c as any, today)), 0);
    const hasDefault = clientCredits.some(c => c.status === 'defaulted' && Number(c.currentBalance || 0) > 0.01);
    const delinquencyPenalty = delinquencyPenaltyFor(maxDaysOverdue, hasDefault);

    // Score total
    const totalScore = Math.round(
        paymentHistoryScore +
        activeCreditsScore +
        borrowedAmountScore +
        tenureScore +
        delinquencyPenalty
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
            delinquencyPenalty,
        },
        confidence: totalPayments >= 6 ? 'alta' : totalPayments >= 2 ? 'média' : 'baixa',
        metrics: {
            totalCredits,
            totalContracts,
            paymentsOnTime,
            latePayments,
            totalPayments,
            activeCreditsCount,
            totalBorrowed,
            monthsAsClient,
            maxDaysOverdue,
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
