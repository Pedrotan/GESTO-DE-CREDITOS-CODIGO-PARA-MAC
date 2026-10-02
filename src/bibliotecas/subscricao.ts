// Regras partilhadas da subscrição das empresas (Tango Master e versão web).

/** Dias antes da expiração a partir dos quais se avisa para renovar. */
export const RENEWAL_WARNING_DAYS = 15;

const DAY_MS = 24 * 60 * 60 * 1000;

export type SubscriptionState =
    | { kind: 'lifetime' }
    | { kind: 'active'; daysLeft: number }
    | { kind: 'expiring'; daysLeft: number }
    | { kind: 'expired'; daysAgo: number };

/** Classifica a validade; dias contados em dias de calendário completos até ao fim do prazo. */
export function subscriptionState(expiresAt: string | Date | null | undefined, now: Date = new Date()): SubscriptionState {
    if (!expiresAt) return { kind: 'lifetime' };
    const end = new Date(expiresAt).getTime();
    if (!Number.isFinite(end)) return { kind: 'lifetime' };
    const diff = end - now.getTime();
    if (diff <= 0) return { kind: 'expired', daysAgo: Math.floor(-diff / DAY_MS) };
    const daysLeft = Math.ceil(diff / DAY_MS);
    return daysLeft <= RENEWAL_WARNING_DAYS ? { kind: 'expiring', daysLeft } : { kind: 'active', daysLeft };
}

export type RenewalPeriod = '1m' | '3m' | '6m' | '1y' | 'lifetime';

export const RENEWAL_PERIODS: { key: RenewalPeriod; label: string }[] = [
    { key: '1m', label: '1 Mês' },
    { key: '3m', label: '3 Meses' },
    { key: '6m', label: '6 Meses' },
    { key: '1y', label: '1 Ano' },
    { key: 'lifetime', label: 'Sem Expiração' }
];

/**
 * Nova data de fim: o período soma-se à validade atual se ainda estiver em vigor,
 * para o cliente não perder os dias que já tinha pago; caso contrário começa hoje.
 */
export function extendSubscription(currentExpiresAt: string | null | undefined, period: RenewalPeriod, now: Date = new Date()): string | null {
    if (period === 'lifetime') return null;
    const current = currentExpiresAt ? new Date(currentExpiresAt) : null;
    const base = current && Number.isFinite(current.getTime()) && current > now ? new Date(current) : new Date(now);
    if (period === '1m') base.setMonth(base.getMonth() + 1);
    else if (period === '3m') base.setMonth(base.getMonth() + 3);
    else if (period === '6m') base.setMonth(base.getMonth() + 6);
    else base.setFullYear(base.getFullYear() + 1);
    return base.toISOString();
}

/** Converte o valor pago escrito pelo utilizador (aceita "15 000,50" ou "15000.50"). */
export function parsePaidAmount(input: string): number | null {
    const clean = input.trim().replace(/\s/g, '').replace(/kz|aoa/giu, '');
    if (!clean) return null;
    const normalized = clean.includes(',') ? clean.replace(/\./g, '').replace(',', '.') : clean;
    if (!/^\d+(\.\d{1,2})?$/u.test(normalized)) return null;
    const value = Number(normalized);
    return Number.isFinite(value) && value >= 0 ? value : null;
}
