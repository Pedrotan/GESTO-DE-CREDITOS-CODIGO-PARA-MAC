// Regras partilhadas para conceder créditos: situação do cliente, novo crédito após liquidação e aprovação.

export type CreditForRules = {
    clientId: string;
    status: string;
    principalAmount?: number;
    currentBalance?: number;
    totalDue?: number;
    createdAt?: Date | string;
    startDate?: Date | string;
    deletedAt?: Date | string | null;
};

export type ClientCreditStanding = {
    /** O cliente já teve algum crédito concedido ou pedido (excluindo rejeitados e cancelados). */
    hasCredits: boolean;
    /** Todos os créditos estão liquidados e não há pedidos pendentes. */
    fullyPaid: boolean;
    openCount: number;
    pendingApproval: boolean;
    /** Total ainda em dívida nos créditos abertos. */
    outstandingAmount: number;
    /** Valor concedido no crédito liquidado mais recente: mínimo para o próximo. */
    lastPaidPrincipal: number;
};

const remainingOf = (credit: CreditForRules) => Math.max(0, Number(credit.totalDue ?? credit.currentBalance ?? 0) || 0);
const timeOf = (credit: CreditForRules) => new Date(credit.createdAt || credit.startDate || 0).getTime() || 0;

export function clientCreditStanding(clientId: string, credits: CreditForRules[]): ClientCreditStanding {
    const own = credits.filter(credit => credit.clientId === clientId && !credit.deletedAt && !['rejected', 'cancelled'].includes(credit.status));
    // Um pedido pendente ainda não foi concedido, mas também impede pedir outro em paralelo.
    const open = own.filter(credit => credit.status === 'pending_approval' || (credit.status !== 'paid' && remainingOf(credit) > 0.1));
    const paid = own.filter(credit => !open.includes(credit)).sort((a, b) => timeOf(b) - timeOf(a));
    return {
        hasCredits: own.length > 0,
        fullyPaid: open.length === 0,
        openCount: open.length,
        pendingApproval: open.some(credit => credit.status === 'pending_approval'),
        outstandingAmount: open.filter(credit => credit.status !== 'pending_approval').reduce((sum, credit) => sum + remainingOf(credit), 0),
        lastPaidPrincipal: Number(paid[0]?.principalAmount || 0),
    };
}

/** Motivo pelo qual o cliente ainda não pode pedir um novo crédito, ou null se pode. */
export function newCreditBlockReason(standing: ClientCreditStanding, formatMoney: (value: number) => string): string | null {
    if (standing.fullyPaid) return null;
    if (standing.pendingApproval) return 'Já existe um pedido de crédito pendente de aprovação para este cliente.';
    return `Disponível apenas depois de liquidar a totalidade do crédito anterior (em dívida: ${formatMoney(standing.outstandingAmount)}).`;
}

/** Regra de aprovação: abaixo do limite, cliente activo, sem risco alto e utilizador com permissão para aprovar. */
export function requiresCreditApproval(input: {
    canApprove: boolean; principalAmount: number; availableCredit: number; clientStatus?: string; riskLevel?: string;
}): boolean {
    return !input.canApprove
        || input.principalAmount > input.availableCredit
        || (input.clientStatus !== undefined && input.clientStatus !== 'active')
        || input.riskLevel === 'high';
}
