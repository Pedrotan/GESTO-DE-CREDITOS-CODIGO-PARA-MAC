// Nível de risco da simulação, calculado (não escolhido à mão) a partir da taxa de esforço, do histórico
// de pagamentos do cliente no sistema, do número de créditos activos e das garantias apresentadas.

import type { RiskLevel } from './config-simulador';

export type RiskInputs = {
    /** Taxa de esforço (%) com a nova prestação; null quando o rendimento não é conhecido. */
    effortRate: number | null;
    effortLimit: number;
    /** Pagamentos feitos depois do vencimento ou prestações vencidas por pagar. */
    latePayments: number;
    /** Maior atraso registado (dias). */
    maxDaysOverdue: number;
    /** Créditos liquidados no sistema. */
    paidCredits: number;
    /** Créditos activos (em curso) no sistema. */
    activeCredits: number;
    /** Créditos em incumprimento ou abatidos. */
    defaultedCredits: number;
    /** Valor das garantias activas / montante pedido. */
    guaranteeCoverage: number;
};

export type RiskAssessment = { level: RiskLevel; score: number; reasons: Array<{ text: string; impact: number }> };

export const RISK_LABELS: Record<RiskLevel, string> = { low: 'Baixo', medium: 'Médio', high: 'Elevado' };

const pct = (value: number) => `${value.toFixed(1).replace('.', ',')}%`;

export function assessRisk(input: RiskInputs): RiskAssessment {
    const reasons: RiskAssessment['reasons'] = [];
    let score = 70;
    const add = (impact: number, text: string) => { score += impact; reasons.push({ impact, text }); };

    if (input.effortRate === null) add(-10, 'Rendimento mensal não indicado: a capacidade de pagamento não pôde ser medida.');
    else if (input.effortRate > input.effortLimit) add(-35, `Taxa de esforço de ${pct(input.effortRate)}, acima do limite de ${pct(input.effortLimit)}.`);
    else if (input.effortRate >= 30) add(-15, `Taxa de esforço de ${pct(input.effortRate)}, próxima do limite.`);
    else add(10, `Taxa de esforço confortável (${pct(input.effortRate)}).`);

    if (input.defaultedCredits > 0) add(-40, `${input.defaultedCredits} crédito(s) em incumprimento ou abatido(s) no histórico.`);
    if (input.latePayments > 0) add(-Math.min(30, input.latePayments * 5), `${input.latePayments} pagamento(s) em atraso no histórico.`);
    if (input.maxDaysOverdue > 90) add(-20, `Atraso máximo de ${input.maxDaysOverdue} dias.`);
    else if (input.maxDaysOverdue > 30) add(-10, `Atraso máximo de ${input.maxDaysOverdue} dias.`);
    if (input.paidCredits > 0 && input.latePayments === 0 && input.defaultedCredits === 0) add(Math.min(20, input.paidCredits * 7), `${input.paidCredits} crédito(s) liquidado(s) sem atrasos.`);
    else if (input.paidCredits > 0) add(Math.min(10, input.paidCredits * 3), `${input.paidCredits} crédito(s) liquidado(s).`);
    if (input.activeCredits > 0) add(-Math.min(30, input.activeCredits * 10), `${input.activeCredits} crédito(s) activo(s) no sistema.`);
    if (input.guaranteeCoverage >= 1) add(15, 'Garantias cobrem a totalidade do montante.');
    else if (input.guaranteeCoverage >= 0.5) add(8, 'Garantias cobrem pelo menos metade do montante.');
    else if (input.guaranteeCoverage > 0) add(3, 'Garantias parciais apresentadas.');

    const finalScore = Math.max(0, Math.min(100, Math.round(score)));
    const level: RiskLevel = finalScore >= 70 ? 'low' : finalScore >= 45 ? 'medium' : 'high';
    return { level, score: finalScore, reasons };
}
