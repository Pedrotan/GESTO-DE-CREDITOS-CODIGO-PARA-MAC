export type PaymentJournalInput = {
    // Numerário entra em Caixa; transferência, Multicaixa, TPA, referência e depósito entram no Banco.
    method?: 'cash' | 'transfer' | 'multicaixa' | 'tpa' | 'reference' | 'deposit';
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
        debit: payment.method && payment.method !== 'cash' ? 'bank' as const : 'cash' as const, credit: 'portfolio' as const,
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
    // O estorno e a reposição usam a mesma conta de disponibilidades do pagamento original (caixa ou banco).
    const settlement = base.debit;
    const debit = isReversal ? 'portfolio' as const : settlement;
    const credit = isReversal ? settlement : 'portfolio' as const;
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
    /** Conta de onde sai o dinheiro: caixa (entrega em mão) ou banco (transferência). */
    fundingAccount?: 'cash' | 'bank';
}, previousHash: string, timestamp = new Date()) {
    const amountMinor = toMinorUnits(input.amount, 'Desembolso');
    if (amountMinor <= 0) throw new Error('O desembolso deve ser superior a zero.');
    if (!/^[a-f0-9]{64}$/i.test(previousHash)) throw new Error('Hash contabilístico anterior inválido.');
    const timestampIso = timestamp.toISOString();
    const entry = {
        id: `disbursement:${input.id}`, timestamp, timestampIso, type: 'disbursement' as const,
        description: input.description, clientId: input.clientId, creditId: input.creditId,
        paymentId: undefined, debit: 'portfolio' as const, credit: input.fundingAccount === 'bank' ? 'bank' as const : 'cash' as const,
        amountPrincipal: amountMinor / 100, amountInterest: 0, amountLateInterest: 0,
        amountTotal: amountMinor / 100, amountPrincipalMinor: amountMinor,
        amountInterestMinor: 0, amountLateInterestMinor: 0, amountTotalMinor: amountMinor,
        processedBy: input.processedBy, justification: input.justification,
        previousHash, usuario_id: input.usuario_id, hashVersion: 2
    };
    return { ...entry, integrityHash: await calculateLedgerHash(entry) };
}

export async function buildChargeAdjustmentEntry(input: {
    id: string; creditId: string; clientId?: string; component: 'interest' | 'late_interest';
    deltaMinor: number; processedBy: string; usuario_id?: string; justification: string;
}, previousHash: string, timestamp = new Date()) {
    if (!Number.isSafeInteger(input.deltaMinor) || input.deltaMinor === 0) throw new Error('Ajuste de encargos inválido.');
    if (!/^[a-f0-9]{64}$/iu.test(previousHash)) throw new Error('Hash contabilístico anterior inválido.');
    const amount = Math.abs(input.deltaMinor);
    const increasing = input.deltaMinor > 0;
    const receivable = input.component === 'interest' ? 'receivable_interest' : 'receivable_late_interest';
    const revenue = input.component === 'interest' ? 'revenue_interest' : 'revenue_late_interest';
    const entry = {
        id: input.id, timestamp, timestampIso: timestamp.toISOString(),
        type: input.component === 'interest' ? 'interest_accrual' as const : 'late_interest' as const,
        description: `${increasing ? 'Acréscimo' : 'Redução'} de ${input.component === 'interest' ? 'juro' : 'juro de mora'} no crédito ${input.creditId}`,
        clientId: input.clientId, creditId: input.creditId, paymentId: undefined,
        debit: increasing ? receivable : revenue, credit: increasing ? revenue : receivable,
        amountPrincipal: 0, amountInterest: input.component === 'interest' ? amount / 100 : 0,
        amountLateInterest: input.component === 'late_interest' ? amount / 100 : 0,
        amountTotal: amount / 100, amountPrincipalMinor: 0,
        amountInterestMinor: input.component === 'interest' ? amount : 0,
        amountLateInterestMinor: input.component === 'late_interest' ? amount : 0,
        amountTotalMinor: amount, processedBy: input.processedBy,
        justification: input.justification, previousHash, usuario_id: input.usuario_id,
        hashVersion: 2
    };
    return { ...entry, integrityHash: await calculateLedgerHash(entry) };
}

export type JournalLineInput = { account: string; side: 'debit' | 'credit'; amountMinor: number; component: string };

/**
 * Lançamento genérico em partidas dobradas (entrada de capital, despesa, transferência, provisão, abate,
 * estorno…). Recusa linhas inválidas e lançamentos desequilibrados; o resumo fica na cadeia de hashes.
 */
export async function buildJournalEntry(input: {
    id: string; type: string; description: string; lines: JournalLineInput[];
    sourceType: string; sourceId: string; processedBy: string;
    clientId?: string; creditId?: string; paymentId?: string; usuario_id?: string; justification?: string;
}, previousHash: string, timestamp = new Date()) {
    if (!/^[a-f0-9]{64}$/iu.test(previousHash)) throw new Error('Hash contabilístico anterior inválido.');
    if (!input.description?.trim()) throw new Error('Indique a descrição do lançamento.');
    if (!input.processedBy?.trim()) throw new Error('Indique o responsável pelo lançamento.');
    const lines = input.lines.filter(line => line.amountMinor !== 0);
    if (lines.length < 2) throw new Error('Um lançamento precisa de pelo menos uma linha a débito e outra a crédito.');
    for (const line of lines) {
        if (!Number.isSafeInteger(line.amountMinor) || line.amountMinor <= 0) throw new Error('Valor de linha inválido.');
        if (!/^[a-z_]{2,40}$/u.test(line.account)) throw new Error('Conta inválida: ' + line.account);
        if (line.side !== 'debit' && line.side !== 'credit') throw new Error('Sentido de linha inválido.');
    }
    const debitMinor = lines.filter(line => line.side === 'debit').reduce((sum, line) => sum + line.amountMinor, 0);
    const creditMinor = lines.filter(line => line.side === 'credit').reduce((sum, line) => sum + line.amountMinor, 0);
    if (debitMinor <= 0 || debitMinor !== creditMinor) throw new Error('O lançamento não está equilibrado (débito ≠ crédito).');
    const firstDebit = lines.find(line => line.side === 'debit')!;
    const firstCredit = lines.find(line => line.side === 'credit')!;
    const entry = {
        id: input.id, timestamp, timestampIso: timestamp.toISOString(), type: input.type,
        description: input.description.trim(), clientId: input.clientId, creditId: input.creditId, paymentId: input.paymentId,
        debit: firstDebit.account, credit: firstCredit.account,
        amountPrincipal: 0, amountInterest: 0, amountLateInterest: 0, amountTotal: debitMinor / 100,
        amountPrincipalMinor: 0, amountInterestMinor: 0, amountLateInterestMinor: 0, amountTotalMinor: debitMinor,
        processedBy: input.processedBy.trim(), justification: input.justification, previousHash,
        usuario_id: input.usuario_id, hashVersion: 2,
        sourceType: input.sourceType, sourceId: input.sourceId, journalLines: lines,
    };
    return { ...entry, integrityHash: await calculateLedgerHash(entry) };
}
