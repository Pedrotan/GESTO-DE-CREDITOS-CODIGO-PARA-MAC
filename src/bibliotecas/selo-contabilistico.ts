// Conteúdo canónico selado por HMAC no aplicativo desktop: o resumo do lançamento (incluindo o hash
// SHA-256 da cadeia) e todas as linhas de partidas dobradas. Quem alterar a base de dados por fora e
// recalcular a cadeia SHA-256 continua a ser detectado, porque não tem a chave HMAC.

export const SEAL_GENESIS = '0'.repeat(64);

export type SealEntryRow = {
    id: string; timestamp: string; type: string; debit: string; credit: string;
    clientId?: string | null; creditId?: string | null; paymentId?: string | null;
    amountTotalMinor?: number | null; amountPrincipalMinor?: number | null; amountInterestMinor?: number | null;
    amountLateInterestMinor?: number | null; integrityHash?: string | null; previousHash?: string | null;
};

export type SealLineRow = { id: string; account: string; side: string; component: string; amountMinor: number };

export function sealPayload(entry: SealEntryRow, lines: SealLineRow[], previousHmac: string): string {
    const number = (value: unknown) => value === null || value === undefined || value === '' ? null : Number(value);
    return JSON.stringify({
        v: 1,
        previousHmac,
        entry: {
            id: entry.id, timestamp: entry.timestamp, type: entry.type, debit: entry.debit, credit: entry.credit,
            clientId: entry.clientId || null, creditId: entry.creditId || null, paymentId: entry.paymentId || null,
            totalMinor: number(entry.amountTotalMinor), principalMinor: number(entry.amountPrincipalMinor),
            interestMinor: number(entry.amountInterestMinor), lateInterestMinor: number(entry.amountLateInterestMinor),
            integrityHash: entry.integrityHash || null, previousHash: entry.previousHash || null,
        },
        lines: [...lines]
            .sort((a, b) => a.id.localeCompare(b.id))
            .map(line => [line.id, line.account, line.side, line.component, Number(line.amountMinor)]),
    });
}

export type SealVerification = {
    available: boolean;
    reason?: string;
    sealedCount: number;
    keyFingerprint?: string;
    /** Lançamentos cujo conteúdo (resumo ou linhas) já não corresponde ao selo. */
    tampered: string[];
    /** Selos fora de sequência (um selo apagado ou reordenado). */
    broken: string[];
    /** Selos de lançamentos que já não existem (lançamento apagado). */
    missing: string[];
    /** Lançamentos sem selo (inseridos fora da aplicação ou numa falha antes da selagem). */
    unsealed: string[];
    checkedAt: string;
};
