export type PaymentJournalInput = {
    id: string;
    creditId: string;
    clientId?: string;
    clientName: string;
    amount: number;
    allocatedToPrincipal: number;
    allocatedToInterest: number;
    allocatedToLateInterest: number;
    processedBy: string;
    usuario_id?: string;
};

export const toMinorUnits = (value: number, label = 'Valor') => {
    if (!Number.isFinite(value) || value < 0) throw new Error(`${label} inválido.`);
    const minor = Math.round(value * 100);
    if (!Number.isSafeInteger(minor) || Math.abs(value - minor / 100) > 0.000001) {
        throw new Error(`${label} deve ter no máximo duas casas decimais.`);
    }
    return minor;
};

export async function calculateLedgerHash(entry: {
    id: string; timestamp: Date | string; type: string; clientId?: string | null; creditId?: string;
    paymentId?: string; debit: string; credit: string; amountPrincipalMinor: number;
    amountInterestMinor: number; amountLateInterestMinor: number; amountTotalMinor: number;
    processedBy: string; usuario_id?: string | null; previousHash: string;
}) {
    const canonical = JSON.stringify({
        id: entry.id, timestamp: new Date(entry.timestamp).toISOString(), type: entry.type,
        clientId: entry.clientId || null, creditId: entry.creditId || null,
        paymentId: entry.paymentId || null, debit: entry.debit, credit: entry.credit,
        principalMinor: entry.amountPrincipalMinor, interestMinor: entry.amountInterestMinor,
        lateInterestMinor: entry.amountLateInterestMinor, totalMinor: entry.amountTotalMinor,
        processedBy: entry.processedBy, usuario_id: entry.usuario_id || null, previousHash: entry.previousHash
    });
    const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical));
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function buildPaymentAccountingEntry(payment: PaymentJournalInput, previousHash: string, timestamp = new Date()) {
    const totalMinor = toMinorUnits(payment.amount, 'Pagamento');
    const principalMinor = toMinorUnits(payment.allocatedToPrincipal, 'Capital alocado');
    const interestMinor = toMinorUnits(payment.allocatedToInterest, 'Juro alocado');
    const lateInterestMinor = toMinorUnits(payment.allocatedToLateInterest, 'Juro de mora alocado');
    if (totalMinor <= 0) throw new Error('O pagamento deve ser superior a zero.');
    if (principalMinor + interestMinor + lateInterestMinor !== totalMinor) {
        throw new Error('A soma das alocações deve ser igual ao valor do pagamento.');
    }
    if (!/^[a-f0-9]{64}$/i.test(previousHash)) throw new Error('Hash contabilístico anterior inválido.');
    const id = `payment:${payment.id}`;
    const timestampIso = timestamp.toISOString();
    const entry = {
        id, timestamp, type: 'payment' as const,
        description: `Pagamento recebido de ${payment.clientName}`,
        clientId: payment.clientId, creditId: payment.creditId, paymentId: payment.id,
        debit: 'cash' as const, credit: 'portfolio' as const,
        amountPrincipal: principalMinor / 100,
        amountInterest: interestMinor / 100,
        amountLateInterest: lateInterestMinor / 100,
        amountTotal: totalMinor / 100,
        amountPrincipalMinor: principalMinor, amountInterestMinor: interestMinor,
        amountLateInterestMinor: lateInterestMinor, amountTotalMinor: totalMinor,
        processedBy: payment.processedBy, previousHash, usuario_id: payment.usuario_id,
        hashVersion: 2,
        timestampIso
    };
    return { ...entry, integrityHash: await calculateLedgerHash(entry) };
}

export async function buildPaymentCorrectionEntry(
    payment: PaymentJournalInput,
    previousHash: string,
    operation: 'reversal' | 'restore',
    timestamp = new Date(),
    entryId = crypto.randomUUID()
) {
    const base = await buildPaymentAccountingEntry(payment, previousHash, timestamp);
    const isReversal = operation === 'reversal';
    const id = `${operation}:${payment.id}:${entryId}`;
    const type = isReversal ? 'reversal' as const : 'adjustment' as const;
    const debit = isReversal ? 'portfolio' as const : 'cash' as const;
    const credit = isReversal ? 'cash' as const : 'portfolio' as const;
    const entry = {
        ...base, id, type, debit, credit,
        description: isReversal
            ? `Estorno do pagamento de ${payment.clientName}`
            : `Reposição do pagamento de ${payment.clientName}`,
        hashVersion: 2
    };
    return { ...entry, integrityHash: await calculateLedgerHash(entry) };
}

export async function buildDisbursementAccountingEntry(input: {
    id: string; creditId: string; clientId?: string; amount: number; processedBy: string;
    usuario_id?: string; description: string; justification?: string;
}, previousHash: string, timestamp = new Date()) {
    const amountMinor = toMinorUnits(input.amount, 'Desembolso');
    if (amountMinor <= 0) throw new Error('O desembolso deve ser superior a zero.');
    if (!/^[a-f0-9]{64}$/i.test(previousHash)) throw new Error('Hash contabilístico anterior inválido.');
    const timestampIso = timestamp.toISOString();
    const entry = {
        id: `disbursement:${input.id}`, timestamp, timestampIso, type: 'disbursement' as const,
        description: input.description, clientId: input.clientId, creditId: input.creditId,
        paymentId: undefined, debit: 'portfolio' as const, credit: 'cash' as const,
        amountPrincipal: amountMinor / 100, amountInterest: 0, amountLateInterest: 0,
        amountTotal: amountMinor / 100, amountPrincipalMinor: amountMinor,
        amountInterestMinor: 0, amountLateInterestMinor: 0, amountTotalMinor: amountMinor,
        processedBy: input.processedBy, justification: input.justification,
        previousHash, usuario_id: input.usuario_id, hashVersion: 2
    };
    return { ...entry, integrityHash: await calculateLedgerHash(entry) };
}
