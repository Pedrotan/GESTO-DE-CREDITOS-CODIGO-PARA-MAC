// Estado do cliente mostrado ao utilizador. O estado gravado continua a ser active | inactive | blocked
// (calculado em ContextoDados): o cliente nasce Inactivo e passa a Activo quando um crédito é desembolsado
// (crédito em curso: activo, em atraso, em incumprimento ou renegociado). Um pedido pendente ainda não conta.
// Depois de liquidar todos os créditos volta a «inactive» na base, mas aparece como «Sem crédito activo» para
// distinguir os clientes antigos dos que nunca tiveram crédito.

export type ClientDisplayStatus = 'active' | 'inactive' | 'no_active_credit' | 'blocked';

export const CLIENT_STATUS_LABELS: Record<ClientDisplayStatus, string> = {
    active: 'Activo',
    inactive: 'Inactivo',
    no_active_credit: 'Sem crédito activo',
    blocked: 'Bloqueado',
};

/** Estados dos créditos que tornam o cliente Activo (crédito desembolsado e ainda em curso). */
export const CREDIT_STATUSES_THAT_ACTIVATE = new Set(['active', 'overdue', 'defaulted', 'renegotiated']);

type ClientLike = { id: string; status?: string | null; blocked?: boolean | null };
type CreditLike = { clientId: string; status: string; deletedAt?: unknown };

export function clientDisplayStatus(client: ClientLike, credits: CreditLike[]): ClientDisplayStatus {
    if (client.status === 'blocked' || client.blocked) return 'blocked';
    if (client.status === 'active') return 'active';
    const hadCredit = credits.some(credit => credit.clientId === client.id && !credit.deletedAt && credit.status === 'paid');
    return hadCredit ? 'no_active_credit' : 'inactive';
}

/** Texto da auditoria quando o estado muda sozinho (crédito desembolsado ou liquidado). */
export function automaticStatusChangeText(name: string, from: string | null | undefined, to: string): string | null {
    if (!from || from === to || from === 'blocked' || to === 'blocked') return null;
    if (to === 'active') return `Estado do cliente ${name} mudou automaticamente para Activo: crédito concedido (desembolsado).`;
    if (to === 'inactive') return `Estado do cliente ${name} mudou automaticamente para Sem crédito activo: todos os créditos foram liquidados ou encerrados.`;
    return null;
}
