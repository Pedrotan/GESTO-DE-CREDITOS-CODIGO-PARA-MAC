// Tango AI: análise da carteira a partir dos dados reais (créditos, prestações e pagamentos). Cada sugestão só
// aparece quando os números a justificam: a cobrança só com prestações vencidas e por pagar; nunca por um crédito
// acabado de conceder que ainda não tem nada vencido. Datas na hora de Angola; valores em cêntimos.
import { addDaysToKey, daysBetweenKeys, luandaDateKey } from './fuso-angola.ts';

export type AIInsightKind = 'cobranca' | 'vencimentos' | 'risco' | 'concentracao' | 'lucro' | 'pagadores' | 'inicio';
export type AIInsightData = {
    /** Muda quando a situação muda: um alerta dispensado volta a aparecer se entrar outro cliente ou outro valor. */
    id: string;
    kind: AIInsightKind;
    title: string;
    message: string;
    details?: string[];
    solution?: string;
    actionLabel: string;
    actionPath: string;
    color: 'emerald' | 'amber' | 'red' | 'indigo';
};

type CreditLike = {
    id: string; clientId: string; clientName?: string; status: string; principalAmount: number; currentBalance?: number; totalDue?: number;
    daysOverdue?: number; deletedAt?: unknown;
};
type PaymentLike = { creditId: string; status?: string; allocatedToInterest?: number; deletedAt?: unknown };
type InstallmentLike = {
    creditId: string; dueDate: string; principalMinor: number; interestMinor: number; paidPrincipalMinor: number; paidInterestMinor: number;
    status?: string; paidAt?: string | null;
};
type ClientLike = { id: string; name: string };

const IN_COURSE = new Set(['active', 'overdue', 'defaulted', 'renegotiated']);
const toMinor = (value: unknown) => Math.round((Number(value) || 0) * 100);
const owedOf = (item: InstallmentLike) => Math.max(0, Number(item.principalMinor) + Number(item.interestMinor) - Number(item.paidPrincipalMinor) - Number(item.paidInterestMinor));
const real = (item: InstallmentLike) => item.status !== 'cancelled' && Number(item.principalMinor) + Number(item.interestMinor) > 0;
const kz = (minor: number) => `${(minor / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Kz`;
const dateLabel = (key: string) => key.split('-').reverse().join('/');
const signature = (parts: Array<string | number>) => parts.join('|');

export function analyseTangoAI(input: {
    clients: ClientLike[]; credits: CreditLike[]; payments: PaymentLike[]; installments: InstallmentLike[]; todayKey: string; canManage: boolean;
}): AIInsightData[] {
    const { todayKey } = input;
    const names = new Map(input.clients.map(client => [client.id, client.name]));
    const credits = input.credits.filter(credit => !credit.deletedAt && IN_COURSE.has(credit.status));
    const insights: AIInsightData[] = [];

    if (input.credits.filter(credit => !credit.deletedAt).length === 0) {
        if (input.canManage) insights.push({
            id: 'inicio', kind: 'inicio', color: 'indigo', title: 'Primeiros passos',
            message: 'Ainda não há créditos na carteira. As análises do Tango AI aparecem assim que houver créditos concedidos.',
            solution: 'Registe os clientes e conceda o primeiro crédito.', actionLabel: 'Adicionar cliente', actionPath: '/clientes',
        });
        return insights;
    }

    const schedule = new Map<string, InstallmentLike[]>();
    for (const item of input.installments) if (real(item)) schedule.set(item.creditId, [...(schedule.get(item.creditId) || []), item]);

    // ── 1. Cobrança: prestações vencidas e por pagar (o que o cliente deve mesmo hoje) ──────────────────
    const debtors = new Map<string, { overdueMinor: number; maxDays: number; installments: number }>();
    for (const credit of credits) {
        const plan = schedule.get(credit.id) || [];
        let overdueMinor = 0, maxDays = 0, count = 0;
        if (plan.length) {
            for (const item of plan) {
                const due = luandaDateKey(item.dueDate);
                const owed = owedOf(item);
                if (due < todayKey && owed > 0) { overdueMinor += owed; count += 1; maxDays = Math.max(maxDays, daysBetweenKeys(due, todayKey)); }
            }
        } else if ((credit.status === 'overdue' || credit.status === 'defaulted') && Number(credit.daysOverdue) > 0) {
            // Crédito sem plano de prestações (antigo): usa o estado e os dias de atraso registados.
            overdueMinor = toMinor(credit.currentBalance); maxDays = Number(credit.daysOverdue); count = 1;
        }
        if (overdueMinor <= 0) continue;
        const current = debtors.get(credit.clientId) || { overdueMinor: 0, maxDays: 0, installments: 0 };
        debtors.set(credit.clientId, { overdueMinor: current.overdueMinor + overdueMinor, maxDays: Math.max(current.maxDays, maxDays), installments: current.installments + count });
    }
    if (debtors.size) {
        const list = [...debtors.entries()].sort((a, b) => b[1].maxDays - a[1].maxDays || b[1].overdueMinor - a[1].overdueMinor);
        const total = list.reduce((sum, [, item]) => sum + item.overdueMinor, 0);
        const maxDays = list[0][1].maxDays;
        const over90 = list.filter(([, item]) => item.maxDays > 90).length;
        const over30 = list.filter(([, item]) => item.maxDays > 30).length;
        insights.push({
            id: signature(['cobranca', ...list.map(([id, item]) => `${id}:${item.overdueMinor}`)]), kind: 'cobranca', color: 'red',
            title: 'Cobrança: clientes em atraso',
            message: `${list.length} cliente(s) com prestações vencidas e por pagar: ${kz(total)} em atraso. O atraso mais longo é de ${maxDays} dia(s).`,
            details: list.slice(0, 5).map(([id, item]) => `${names.get(id) || 'Cliente'} · ${item.maxDays} dia(s) · ${kz(item.overdueMinor)}`),
            solution: over90
                ? `${over90} cliente(s) com mais de 90 dias: contacte-os hoje e, sem acordo, avalie o envio para contencioso.`
                : over30
                    ? `${over30} cliente(s) com mais de 30 dias: telefone, proponha um plano de pagamento e registe a promessa.`
                    : 'Atrasos recentes: envie um lembrete com o valor e a referência de pagamento.',
            actionLabel: 'Iniciar cobrança', actionPath: '/hub-whatsapp',
        });
    }

    // ── 2. Vencimentos nos próximos 7 dias (lembrete antes de atrasar) ──────────────────────────────────
    const limit = addDaysToKey(todayKey, 7);
    const upcoming = credits.flatMap(credit => (schedule.get(credit.id) || [])
        .filter(item => { const due = luandaDateKey(item.dueDate); return due >= todayKey && due <= limit && owedOf(item) > 0; })
        .map(item => ({ credit, item, due: luandaDateKey(item.dueDate) })))
        .sort((a, b) => a.due.localeCompare(b.due));
    if (upcoming.length) {
        const total = upcoming.reduce((sum, entry) => sum + owedOf(entry.item), 0);
        insights.push({
            id: signature(['vencimentos', todayKey, upcoming.length, total]), kind: 'vencimentos', color: 'amber', title: 'Vencimentos nos próximos 7 dias',
            message: `${upcoming.length} prestação(ões) vencem até ${dateLabel(limit)}, no total de ${kz(total)}.`,
            details: upcoming.slice(0, 5).map(entry => `${names.get(entry.credit.clientId) || entry.credit.clientName || 'Cliente'} · ${dateLabel(entry.due)} · ${kz(owedOf(entry.item))}`),
            solution: 'Envie um lembrete dois dias antes do vencimento: reduz os atrasos.', actionLabel: 'Ver créditos', actionPath: '/creditos',
        });
    }

    // ── 3. Risco da carteira (PAR30): só com carteira suficiente para a percentagem ter significado ──────
    const outstanding = new Map<string, number>();
    for (const credit of credits) {
        const plan = schedule.get(credit.id) || [];
        const principal = plan.length ? plan.reduce((sum, item) => sum + Math.max(0, Number(item.principalMinor) - Number(item.paidPrincipalMinor)), 0) : toMinor(credit.currentBalance);
        outstanding.set(credit.id, principal);
    }
    const totalOutstanding = [...outstanding.values()].reduce((sum, value) => sum + value, 0);
    if (credits.length >= 5 && totalOutstanding > 0) {
        const at30 = credits.filter(credit => (debtors.get(credit.clientId)?.maxDays || 0) > 30).reduce((sum, credit) => sum + (outstanding.get(credit.id) || 0), 0);
        const par30 = at30 / totalOutstanding;
        if (par30 >= 0.05) insights.push({
            id: signature(['risco', Math.round(par30 * 1000)]), kind: 'risco', color: par30 >= 0.1 ? 'red' : 'amber', title: 'Risco da carteira',
            message: `${(par30 * 100).toFixed(1).replace('.', ',')}% do capital em dívida (${kz(at30)}) está em créditos com mais de 30 dias de atraso (PAR30).`,
            solution: 'Suspenda novos créditos a clientes em atraso e reforce garantias nos próximos pedidos.', actionLabel: 'Ver análise de risco', actionPath: '/creditos',
        });
    }

    // ── 4. Concentração: um só cliente com grande parte do capital em dívida ─────────────────────────────
    if (credits.length >= 3 && totalOutstanding > 0) {
        const byClient = new Map<string, number>();
        for (const credit of credits) byClient.set(credit.clientId, (byClient.get(credit.clientId) || 0) + (outstanding.get(credit.id) || 0));
        const [topId, topMinor] = [...byClient.entries()].sort((a, b) => b[1] - a[1])[0];
        const share = topMinor / totalOutstanding;
        if (byClient.size >= 2 && share >= 0.4) insights.push({
            id: signature(['concentracao', topId, Math.round(share * 100)]), kind: 'concentracao', color: 'amber', title: 'Concentração da carteira',
            message: `${names.get(topId) || 'Um cliente'} tem ${(share * 100).toFixed(0)}% do capital em dívida (${kz(topMinor)}). Um atraso deste cliente pesa muito nos resultados.`,
            solution: 'Evite aumentar a exposição a este cliente sem garantias adicionais.', actionLabel: 'Ver clientes', actionPath: '/clientes',
        });
    }

    // ── 5. Lucro previsto por receber (juros dos créditos em curso) ──────────────────────────────────────
    const interestPaid = new Map<string, number>();
    for (const payment of input.payments) if ((payment.status || 'confirmed') === 'confirmed' && !payment.deletedAt)
        interestPaid.set(payment.creditId, (interestPaid.get(payment.creditId) || 0) + toMinor(payment.allocatedToInterest));
    let expected = 0, received = 0;
    for (const credit of credits) {
        const plan = schedule.get(credit.id) || [];
        const contracted = plan.length ? plan.reduce((sum, item) => sum + Number(item.interestMinor), 0) : Math.max(0, toMinor(credit.totalDue) - toMinor(credit.principalAmount));
        expected += contracted;
        received += Math.min(contracted, interestPaid.get(credit.id) || 0);
    }
    if (expected - received > 0) insights.push({
        id: signature(['lucro', expected - received]), kind: 'lucro', color: 'emerald', title: 'Lucro previsto por receber',
        message: `Os ${credits.length} crédito(s) em curso ainda vão render ${kz(expected - received)} de juros (já recebidos ${kz(received)} de ${kz(expected)}).`,
        solution: debtors.size ? 'Recuperar os atrasos protege este lucro: comece pela cobrança.' : 'Os pagamentos estão em dia: mantenha os lembretes antes dos vencimentos.',
        actionLabel: 'Ver lucros previstos', actionPath: '/creditos',
    });

    // ── 6. Bons pagadores: dois ou mais créditos pagos sempre a tempo ────────────────────────────────────
    const allCredits = input.credits.filter(credit => !credit.deletedAt);
    const good = input.clients.filter(client => {
        const own = allCredits.filter(credit => credit.clientId === client.id);
        if (own.filter(credit => credit.status === 'paid').length < 2 || debtors.has(client.id)) return false;
        return own.every(credit => (schedule.get(credit.id) || []).every(item => !item.paidAt || luandaDateKey(item.paidAt) <= luandaDateKey(item.dueDate)));
    });
    if (good.length) insights.push({
        id: signature(['pagadores', ...good.map(client => client.id)]), kind: 'pagadores', color: 'indigo', title: 'Bons pagadores',
        message: `${good.length} cliente(s) pagaram dois ou mais créditos sempre a tempo.`,
        details: good.slice(0, 5).map(client => client.name),
        solution: 'Proponha a renovação com condições preferenciais: são os clientes de menor risco.', actionLabel: 'Ver clientes', actionPath: '/clientes',
    });

    return insights;
}
