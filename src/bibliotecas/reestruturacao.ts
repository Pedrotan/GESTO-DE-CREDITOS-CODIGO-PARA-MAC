// Plano de reestruturação proposto na ficha do crédito: o capital em dívida reescalonado com o gerador de plano
// existente (`restructurePlan`). Os juros vencidos e não pagos das prestações substituídas passam para a primeira
// prestação do novo plano (não são perdoados); a mora já lançada mantém-se no crédito.
import { luandaDateKey, luandaTodayKey } from '@/bibliotecas/fuso-angola';
import { restructurePlan } from '@/bibliotecas/liquidacao-antecipada';
import type { InstallmentRow } from '@/bibliotecas/carteira-credito';

/**
 * Reescalona o capital em dívida num novo plano. As prestações em aberto são substituídas; os juros vencidos e não
 * pagos dessas prestações passam para a primeira prestação do novo plano (não são perdoados). O plano original
 * fica guardado no pedido e o crédito passa a "Reestruturado" só depois da aprovação de outra pessoa.
 */
export function buildRestructuring(input: { installments: InstallmentRow[]; months: number; ratePercent: number; method: 'PRICE' | 'SAC' | 'FLAT'; firstDueKey: string; todayKey?: string }) {
    const open = input.installments.filter(item => item.status !== 'cancelled' && (Number(item.principalMinor) + Number(item.interestMinor)) > (Number(item.paidPrincipalMinor) + Number(item.paidInterestMinor)));
    if (!open.length) throw new Error('Este crédito não tem prestações em aberto para reestruturar.');
    const capital = open.reduce((sum, item) => sum + Math.max(0, Number(item.principalMinor) - Number(item.paidPrincipalMinor)), 0);
    const today = input.todayKey || luandaTodayKey();
    const overdueInterest = open.filter(item => luandaDateKey(item.dueDate) < today).reduce((sum, item) => sum + Math.max(0, Number(item.interestMinor) - Number(item.paidInterestMinor)), 0);
    if (!(input.months >= 1 && input.months <= 120)) throw new Error('O prazo tem de ser entre 1 e 120 meses.');
    if (input.firstDueKey < today) throw new Error('A primeira prestação do novo plano não pode ser no passado.');
    const plan = restructurePlan({ outstandingCapitalMinor: capital, installments: input.months, annualRatePercent: input.ratePercent, method: input.method, firstDueDate: `${input.firstDueKey}T12:00:00Z` });
    if (plan[0] && overdueInterest > 0) plan[0] = { ...plan[0], interestMinor: plan[0].interestMinor + overdueInterest, totalMinor: plan[0].totalMinor + overdueInterest };
    return { plan, replacedIds: open.map(item => item.id), capitalMinor: capital, overdueInterestMinor: overdueInterest, oldCount: open.length };
}

