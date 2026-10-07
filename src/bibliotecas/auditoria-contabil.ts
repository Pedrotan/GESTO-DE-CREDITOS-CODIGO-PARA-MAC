// Motor de auditoria contabilística. Todas as regras usam o razão em partidas dobradas (ledger_lines)
// como fonte única de verdade e comparam-no com os registos operacionais (contratos, prestações e
// pagamentos). Cada apontamento traz a referência completa dos registos envolvidos.

import { calculateLedgerHash } from './ledger-financeiro';
import { checkWorkingTime, type WorkingTimeConfig, DEFAULT_WORKING_TIME } from './feriados-angola';
import { accountName, LIQUID_ACCOUNTS } from './plano-contas';
import type { SealVerification } from './selo-contabilistico';

export type AuditSeverity = 'critical' | 'high' | 'medium' | 'low';
export type AuditGroup = 'integrity' | 'balances' | 'cash' | 'payments' | 'contracts' | 'users';
export type AuditKind = 'full' | AuditGroup;

export type AuditRuleCode =
    | 'integrity_chain' | 'integrity_hash' | 'integrity_seal' | 'unsealed_entry' | 'legacy_hash'
    | 'missing_double_entry' | 'unbalanced_entry' | 'orphan_line'
    | 'trial_balance' | 'asset_credit_balance' | 'portfolio_mismatch' | 'contract_balance'
    | 'cash_leak' | 'disbursement_without_funds' | 'cash_session'
    | 'payment_without_contract' | 'payment_allocation' | 'payment_without_entry' | 'entry_without_payment' | 'off_hours_payment'
    | 'contract_without_plan' | 'credit_without_disbursement'
    | 'user_risk';

export type AuditReference = { kind: 'entry' | 'payment' | 'credit' | 'user' | 'session' | 'account'; id: string; label?: string };

export type AuditFinding = {
    /** Chave estável da ocorrência (regra + registo): usada para marcar como justificada. */
    id: string;
    rule: AuditRuleCode;
    group: AuditGroup;
    severity: AuditSeverity;
    title: string;
    message: string;
    references: AuditReference[];
    amountMinor?: number;
    at?: string;
    justification?: { state: 'pending' | 'justified' | 'resolved'; reason: string; actorName: string; createdAt: string };
};

export const AUDIT_GROUP_LABELS: Record<AuditGroup, string> = {
    integrity: 'Cadeia de Integridade',
    balances: 'Conciliação de Saldos',
    cash: 'Caixa e Desembolsos',
    payments: 'Pagamentos',
    contracts: 'Contratos e Planos',
    users: 'Utilizadores e Permissões',
};

export const AUDIT_KIND_LABELS: Record<AuditKind, string> = {
    full: 'Auditoria Completa',
    ...AUDIT_GROUP_LABELS,
};

export const AUDIT_RULE_TITLES: Record<AuditRuleCode, string> = {
    integrity_chain: 'Cadeia de integridade quebrada',
    integrity_hash: 'Lançamento adulterado (hash inválido)',
    integrity_seal: 'Selo HMAC inválido',
    unsealed_entry: 'Lançamento sem selo HMAC',
    legacy_hash: 'Lançamento antigo sem hash da versão actual',
    missing_double_entry: 'Lançamento sem partidas dobradas',
    unbalanced_entry: 'Lançamento desequilibrado (débito ≠ crédito)',
    orphan_line: 'Linha do razão sem lançamento',
    trial_balance: 'Balancete desequilibrado',
    asset_credit_balance: 'Conta do activo com saldo credor',
    portfolio_mismatch: 'Carteira diferente da soma do capital em dívida',
    contract_balance: 'Divergência no saldo contratual calculado',
    cash_leak: 'Fuga monetária',
    disbursement_without_funds: 'Desembolso sem saldo disponível',
    cash_session: 'Diferença no fecho de caixa',
    payment_without_contract: 'Pagamento sem contrato válido',
    payment_allocation: 'Alocação do pagamento incoerente',
    payment_without_entry: 'Pagamento sem lançamento contabilístico',
    entry_without_payment: 'Lançamento de pagamento sem pagamento registado',
    off_hours_payment: 'Pagamento fora do expediente',
    contract_without_plan: 'Contrato sem plano de prestações',
    credit_without_disbursement: 'Crédito concedido sem lançamento de desembolso',
    user_risk: 'Risco de controlo interno',
};

const RULE_GROUP: Record<AuditRuleCode, AuditGroup> = {
    integrity_chain: 'integrity', integrity_hash: 'integrity', integrity_seal: 'integrity', unsealed_entry: 'integrity', legacy_hash: 'integrity',
    missing_double_entry: 'integrity', unbalanced_entry: 'integrity', orphan_line: 'integrity',
    trial_balance: 'balances', asset_credit_balance: 'balances', portfolio_mismatch: 'balances', contract_balance: 'balances',
    cash_leak: 'cash', disbursement_without_funds: 'cash', cash_session: 'cash',
    payment_without_contract: 'payments', payment_allocation: 'payments', payment_without_entry: 'payments', entry_without_payment: 'payments', off_hours_payment: 'payments',
    contract_without_plan: 'contracts', credit_without_disbursement: 'contracts',
    user_risk: 'users',
};

export type AuditEntryRow = {
    id: string; timestamp: string; type: string; debit: string; credit: string; description?: string | null;
    clientId?: string | null; creditId?: string | null; paymentId?: string | null;
    amountTotalMinor?: number | null; amountPrincipalMinor?: number | null; amountInterestMinor?: number | null; amountLateInterestMinor?: number | null;
    amountTotal?: number | null; amountPrincipal?: number | null; amountInterest?: number | null; amountLateInterest?: number | null;
    integrityHash?: string | null; previousHash?: string | null; hashVersion?: number | null;
    processedBy?: string | null; usuario_id?: string | null; justification?: string | null;
};
export type AuditTransactionRow = { id: string; type: string; sourceType: string; sourceId: string; totalDebitMinor: number; totalCreditMinor: number; timestamp: string };
export type AuditLineRow = { id: string; transactionId: string; account: string; side: 'debit' | 'credit' | string; component: string; amountMinor: number };
export type AuditPaymentRow = {
    id: string; creditId: string; clientName?: string | null; amount?: number | null; amountMinor?: number | null; paymentDate: string; status?: string | null; deletedAt?: string | null; method?: string | null;
    allocatedToPrincipalMinor?: number | null; allocatedToInterestMinor?: number | null; allocatedToLateInterestMinor?: number | null;
    allocatedToPrincipal?: number | null; allocatedToInterest?: number | null; allocatedToLateInterest?: number | null; processedBy?: string | null;
};
export type AuditCreditRow = {
    id: string; clientId?: string | null; clientName?: string | null; status: string; deletedAt?: string | null; createdAt?: string | null;
    principalAmountMinor?: number | null; principalAmount?: number | null; currentBalanceMinor?: number | null; currentBalance?: number | null;
};
export type AuditInstallmentRow = { creditId: string; principalMinor: number };
export type AuditCashSessionRow = { id: string; operatorName: string; sessionDate: string; expectedMinor: number; countedMinor: number; reason?: string | null };
export type AuditUserFinding = { id: string; severity: 'error' | 'warning'; message: string; entityId?: string };

export type AuditDataset = {
    entries: AuditEntryRow[];
    transactions: AuditTransactionRow[];
    lines: AuditLineRow[];
    payments: AuditPaymentRow[];
    credits: AuditCreditRow[];
    installments: AuditInstallmentRow[];
    writtenOffCreditIds: string[];
    cashSessions: AuditCashSessionRow[];
    userFindings: AuditUserFinding[];
    seals?: SealVerification | null;
    workingTime?: WorkingTimeConfig;
};

export type AuditSummary = {
    totalDebitMinor: number;
    totalCreditMinor: number;
    liquidMinor: number;
    portfolioMinor: number;
    contractsPortfolioMinor: number;
    revenueMinor: number;
    entryCount: number;
    headEntryId: string | null;
    headHash: string | null;
    sealStatus: 'valid' | 'invalid' | 'unavailable' | 'partial';
};

export type AuditResult = { kind: AuditKind; groups: AuditGroup[]; findings: AuditFinding[]; summary: AuditSummary };

const GROUPS_BY_KIND: Record<AuditKind, AuditGroup[]> = {
    full: ['integrity', 'balances', 'cash', 'payments', 'contracts', 'users'],
    integrity: ['integrity'], balances: ['balances'], cash: ['cash'], payments: ['payments'], contracts: ['contracts'], users: ['users'],
};

const DISBURSED_STATUSES = new Set(['active', 'overdue', 'paid', 'renegotiated', 'defaulted']);
const minorOf = (minor: unknown, legacy: unknown) => minor !== null && minor !== undefined && minor !== '' ? Number(minor) : Math.round(Number(legacy || 0) * 100);
const money = (minor: number) => `${(minor / 100).toLocaleString('pt-AO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Kz`;

export async function runAccountingAudit(data: AuditDataset, kind: AuditKind = 'full'): Promise<AuditResult> {
    const groups = GROUPS_BY_KIND[kind];
    const wanted = new Set(groups);
    const findings: AuditFinding[] = [];
    const add = (rule: AuditRuleCode, severity: AuditSeverity, key: string, message: string, references: AuditReference[], extra: Partial<AuditFinding> = {}) => {
        if (!wanted.has(RULE_GROUP[rule])) return;
        findings.push({ id: `${rule}:${key}`, rule, group: RULE_GROUP[rule], severity, title: AUDIT_RULE_TITLES[rule], message, references, ...extra });
    };

    const transactionsById = new Map(data.transactions.map(tx => [tx.id, tx]));
    const linesByTx = new Map<string, AuditLineRow[]>();
    for (const line of data.lines) linesByTx.set(line.transactionId, [...(linesByTx.get(line.transactionId) || []), line]);
    const entriesById = new Map(data.entries.map(entry => [entry.id, entry]));
    const creditsById = new Map(data.credits.map(credit => [credit.id, credit]));
    const writtenOff = new Set(data.writtenOffCreditIds);
    const signed = (line: AuditLineRow) => (line.side === 'debit' ? 1 : -1) * Number(line.amountMinor);

    // ---------------------------------------------------------------- Cadeia de integridade
    let previous = '0'.repeat(64);
    for (const entry of data.entries) {
        if ((entry.previousHash || '') !== previous) {
            add('integrity_chain', 'critical', entry.id, `O lançamento ${entry.id} não aponta para o hash do lançamento anterior: a sequência foi alterada (lançamento apagado, inserido ou reordenado).`, [{ kind: 'entry', id: entry.id }], { at: entry.timestamp });
        }
        if (Number(entry.hashVersion) === 2) {
            const expected = await calculateLedgerHash({
                ...entry, clientId: entry.clientId ?? undefined, creditId: entry.creditId ?? undefined, paymentId: entry.paymentId ?? undefined,
                debit: entry.debit, credit: entry.credit, processedBy: entry.processedBy || '', previousHash: entry.previousHash || '',
                amountPrincipalMinor: minorOf(entry.amountPrincipalMinor, entry.amountPrincipal),
                amountInterestMinor: minorOf(entry.amountInterestMinor, entry.amountInterest),
                amountLateInterestMinor: minorOf(entry.amountLateInterestMinor, entry.amountLateInterest),
                amountTotalMinor: minorOf(entry.amountTotalMinor, entry.amountTotal),
            });
            if (expected !== entry.integrityHash) {
                add('integrity_hash', 'critical', entry.id, `O conteúdo do lançamento ${entry.id} não corresponde ao hash gravado: foi alterado fora da aplicação.`, [{ kind: 'entry', id: entry.id }], { at: entry.timestamp, amountMinor: minorOf(entry.amountTotalMinor, entry.amountTotal) });
            }
        } else {
            add('legacy_hash', 'low', entry.id, `O lançamento ${entry.id} é anterior ao hash da versão actual; continua coberto pelo encadeamento.`, [{ kind: 'entry', id: entry.id }], { at: entry.timestamp });
        }
        if (!transactionsById.has(entry.id)) {
            add('missing_double_entry', 'high', entry.id, `O lançamento ${entry.id} não tem linhas de partidas dobradas. Use "Gerar linhas históricas" depois de rever o histórico.`, [{ kind: 'entry', id: entry.id }], { at: entry.timestamp });
        }
        previous = entry.integrityHash || '';
    }
    for (const tx of data.transactions) {
        const own = linesByTx.get(tx.id) || [];
        const debit = own.filter(line => line.side === 'debit').reduce((sum, line) => sum + Number(line.amountMinor), 0);
        const credit = own.filter(line => line.side === 'credit').reduce((sum, line) => sum + Number(line.amountMinor), 0);
        if (!own.length || debit !== credit || debit !== Number(tx.totalDebitMinor) || credit !== Number(tx.totalCreditMinor)) {
            add('unbalanced_entry', 'critical', tx.id, `O lançamento ${tx.id} tem débitos de ${money(debit)} e créditos de ${money(credit)} (cabeçalho: ${money(Number(tx.totalDebitMinor))}).`, [{ kind: 'entry', id: tx.id }], { at: tx.timestamp, amountMinor: Math.abs(debit - credit) });
        }
    }
    for (const line of data.lines) {
        if (!transactionsById.has(line.transactionId)) {
            add('orphan_line', 'critical', line.id, `A linha ${line.id} (${accountName(line.account)}, ${money(Number(line.amountMinor))}) não pertence a nenhum lançamento.`, [{ kind: 'entry', id: line.transactionId }], { amountMinor: Number(line.amountMinor) });
        }
    }
    let sealStatus: AuditSummary['sealStatus'] = 'unavailable';
    if (data.seals?.available) {
        for (const id of data.seals.tampered) add('integrity_seal', 'critical', `tampered:${id}`, `O selo HMAC do lançamento ${id} não confere: o resumo ou as linhas foram alterados fora da aplicação, mesmo que a cadeia SHA-256 tenha sido recalculada.`, [{ kind: 'entry', id }]);
        for (const id of data.seals.broken) add('integrity_seal', 'critical', `broken:${id}`, `A sequência de selos está quebrada no lançamento ${id}: um selo foi apagado ou reordenado.`, [{ kind: 'entry', id }]);
        for (const id of data.seals.missing) add('integrity_seal', 'critical', `missing:${id}`, `O lançamento selado ${id} já não existe na base de dados (eliminação fora da aplicação).`, [{ kind: 'entry', id }]);
        for (const id of data.seals.unsealed) add('unsealed_entry', 'high', id, `O lançamento ${id} não tem selo HMAC: pode ter sido inserido fora da aplicação ou numa falha antes da selagem. Reveja-o e, se for legítimo, use "Selar pendentes".`, [{ kind: 'entry', id }]);
        const bad = data.seals.tampered.length + data.seals.broken.length + data.seals.missing.length;
        sealStatus = bad ? 'invalid' : data.seals.unsealed.length ? 'partial' : 'valid';
    }

    // ---------------------------------------------------------------- Saldos (razão) e conciliação
    const balances = new Map<string, number>();
    let totalDebitMinor = 0, totalCreditMinor = 0;
    for (const line of data.lines) {
        balances.set(line.account, (balances.get(line.account) || 0) + signed(line));
        if (line.side === 'debit') totalDebitMinor += Number(line.amountMinor); else totalCreditMinor += Number(line.amountMinor);
    }
    if (totalDebitMinor !== totalCreditMinor) {
        add('trial_balance', 'critical', 'global', `O total dos débitos (${money(totalDebitMinor)}) é diferente do total dos créditos (${money(totalCreditMinor)}).`, [], { amountMinor: Math.abs(totalDebitMinor - totalCreditMinor) });
    }
    for (const account of ['cash', 'bank', 'portfolio', 'receivable_interest', 'receivable_late_interest']) {
        const balance = balances.get(account) || 0;
        if (balance < 0) {
            const liquid = LIQUID_ACCOUNTS.has(account);
            add('asset_credit_balance', account === 'portfolio' ? 'critical' : 'high', account,
                liquid
                    ? `${accountName(account)} tem saldo credor de ${money(-balance)}: saiu mais dinheiro do que entrou. Registe a entrada de capital, o financiamento ou a transferência interna em falta.`
                    : `${accountName(account)} tem saldo credor de ${money(-balance)}: foi creditada mais do que debitada.`,
                [{ kind: 'account', id: account, label: accountName(account) }], { amountMinor: -balance });
        }
    }
    const disbursedCredits = data.credits.filter(credit => DISBURSED_STATUSES.has(String(credit.status)) && !credit.deletedAt);
    const contractsPortfolioMinor = disbursedCredits.filter(credit => !writtenOff.has(credit.id))
        .reduce((sum, credit) => sum + minorOf(credit.currentBalanceMinor, credit.currentBalance), 0);
    const portfolioMinor = balances.get('portfolio') || 0;
    if (portfolioMinor !== contractsPortfolioMinor) {
        add('portfolio_mismatch', 'critical', 'global', `A Carteira de Crédito no razão (${money(portfolioMinor)}) é diferente da soma do capital em dívida dos contratos (${money(contractsPortfolioMinor)}): diferença de ${money(portfolioMinor - contractsPortfolioMinor)}.`, [], { amountMinor: Math.abs(portfolioMinor - contractsPortfolioMinor) });
    }
    // Saldo contratual calculado por crédito: capital do plano − capital pago; comparado com o gravado e com o razão.
    const planPrincipal = new Map<string, number>();
    for (const item of data.installments) planPrincipal.set(item.creditId, (planPrincipal.get(item.creditId) || 0) + Number(item.principalMinor));
    const paidPrincipal = new Map<string, number>();
    for (const payment of data.payments) {
        if (payment.deletedAt || payment.status !== 'confirmed') continue;
        paidPrincipal.set(payment.creditId, (paidPrincipal.get(payment.creditId) || 0) + minorOf(payment.allocatedToPrincipalMinor, payment.allocatedToPrincipal));
    }
    const ledgerPortfolioByCredit = new Map<string, number>();
    for (const line of data.lines) {
        if (line.account !== 'portfolio') continue;
        const creditId = entriesById.get(line.transactionId)?.creditId;
        if (creditId) ledgerPortfolioByCredit.set(creditId, (ledgerPortfolioByCredit.get(creditId) || 0) + signed(line));
    }
    for (const credit of disbursedCredits) {
        const stored = minorOf(credit.currentBalanceMinor, credit.currentBalance);
        const label = `${credit.clientName || 'Cliente'} · ${credit.id}`;
        if (planPrincipal.has(credit.id)) {
            const calculated = (planPrincipal.get(credit.id) || 0) - (paidPrincipal.get(credit.id) || 0);
            if (calculated !== stored) {
                add('contract_balance', 'high', `stored:${credit.id}`, `Crédito ${label}: saldo contratual calculado (plano − capital pago) de ${money(calculated)} e saldo gravado de ${money(stored)}.`, [{ kind: 'credit', id: credit.id, label: credit.clientName || undefined }], { amountMinor: Math.abs(calculated - stored) });
            }
        }
        if (!writtenOff.has(credit.id)) {
            const ledger = ledgerPortfolioByCredit.get(credit.id) || 0;
            if (ledger !== stored) {
                add('contract_balance', 'high', `ledger:${credit.id}`, `Crédito ${label}: capital em dívida de ${money(stored)} e saldo do crédito na Carteira (razão) de ${money(ledger)}.`, [{ kind: 'credit', id: credit.id, label: credit.clientName || undefined }], { amountMinor: Math.abs(ledger - stored) });
            }
        }
    }

    // ---------------------------------------------------------------- Caixa e desembolsos
    const liquidMovement = (txIds: Set<string>) => data.lines
        .filter(line => txIds.has(line.transactionId) && LIQUID_ACCOUNTS.has(line.account))
        .reduce((sum, line) => sum + signed(line), 0);
    const paymentTx = new Set(data.entries.filter(entry => entry.paymentId).map(entry => entry.id));
    const confirmedPayments = data.payments.filter(payment => !payment.deletedAt && payment.status === 'confirmed');
    const receivedMinor = confirmedPayments.reduce((sum, payment) => sum + minorOf(payment.amountMinor, payment.amount), 0);
    const ledgerReceived = liquidMovement(paymentTx);
    if (receivedMinor !== ledgerReceived) {
        add('cash_leak', 'critical', 'payments', `Os pagamentos confirmados somam ${money(receivedMinor)}, mas as entradas em Caixa/Bancos por pagamentos somam ${money(ledgerReceived)}: diferença de ${money(receivedMinor - ledgerReceived)}.`, [], { amountMinor: Math.abs(receivedMinor - ledgerReceived) });
    }
    const disbursementTx = new Set(data.entries.filter(entry => entry.type === 'disbursement').map(entry => entry.id));
    const disbursedMinor = disbursedCredits.reduce((sum, credit) => sum + minorOf(credit.principalAmountMinor, credit.principalAmount), 0)
        + data.credits.filter(credit => credit.deletedAt && DISBURSED_STATUSES.has(String(credit.status)) && data.entries.some(entry => entry.type === 'disbursement' && entry.creditId === credit.id))
            .reduce((sum, credit) => sum + minorOf(credit.principalAmountMinor, credit.principalAmount), 0);
    const ledgerDisbursed = -liquidMovement(disbursementTx);
    if (disbursedMinor !== ledgerDisbursed) {
        add('cash_leak', 'critical', 'disbursements', `O capital concedido nos contratos soma ${money(disbursedMinor)}, mas as saídas de Caixa/Bancos por desembolsos somam ${money(ledgerDisbursed)}: diferença de ${money(disbursedMinor - ledgerDisbursed)}.`, [], { amountMinor: Math.abs(disbursedMinor - ledgerDisbursed) });
    }
    let runningLiquid = 0;
    for (const entry of data.entries) {
        const own = linesByTx.get(entry.id) || [];
        runningLiquid += own.filter(line => LIQUID_ACCOUNTS.has(line.account)).reduce((sum, line) => sum + signed(line), 0);
        if (entry.type === 'disbursement' && runningLiquid < 0) {
            add('disbursement_without_funds', 'high', entry.id, `O desembolso ${entry.id}${entry.creditId ? ` (crédito ${entry.creditId})` : ''} de ${money(minorOf(entry.amountTotalMinor, entry.amountTotal))} deixou as disponibilidades em ${money(runningLiquid)}.`, [{ kind: 'entry', id: entry.id }, ...(entry.creditId ? [{ kind: 'credit' as const, id: entry.creditId }] : [])], { at: entry.timestamp, amountMinor: -runningLiquid });
        }
    }
    for (const session of data.cashSessions) {
        const diff = Number(session.countedMinor) - Number(session.expectedMinor);
        if (diff !== 0) add('cash_session', 'medium', session.id, `Fecho de caixa de ${session.operatorName} em ${session.sessionDate}: diferença de ${money(diff)}. Motivo registado: ${session.reason || '—'}.`, [{ kind: 'session', id: session.id, label: session.operatorName }], { amountMinor: Math.abs(diff) });
    }

    // ---------------------------------------------------------------- Pagamentos
    const workingTime = data.workingTime || DEFAULT_WORKING_TIME;
    for (const payment of confirmedPayments) {
        const credit = creditsById.get(payment.creditId);
        if (!credit) {
            add('payment_without_contract', 'critical', payment.id, `O pagamento ${payment.id} (${money(minorOf(payment.amountMinor, payment.amount))}) refere o crédito ${payment.creditId}, que não existe.`, [{ kind: 'payment', id: payment.id }], { amountMinor: minorOf(payment.amountMinor, payment.amount), at: payment.paymentDate });
        } else if (!DISBURSED_STATUSES.has(String(credit.status))) {
            add('payment_without_contract', 'high', payment.id, `O pagamento ${payment.id} foi registado no crédito ${credit.id}, que está "${credit.status}" (não concedido).`, [{ kind: 'payment', id: payment.id }, { kind: 'credit', id: credit.id }], { amountMinor: minorOf(payment.amountMinor, payment.amount), at: payment.paymentDate });
        }
        const total = minorOf(payment.amountMinor, payment.amount);
        const allocated = minorOf(payment.allocatedToPrincipalMinor, payment.allocatedToPrincipal) + minorOf(payment.allocatedToInterestMinor, payment.allocatedToInterest) + minorOf(payment.allocatedToLateInterestMinor, payment.allocatedToLateInterest);
        if (allocated !== total) {
            add('payment_allocation', 'high', payment.id, `O pagamento ${payment.id} de ${money(total)} tem ${money(allocated)} distribuídos por capital, juros e mora.`, [{ kind: 'payment', id: payment.id }], { amountMinor: Math.abs(total - allocated) });
        }
        const entry = entriesById.get(`payment:${payment.id}`);
        if (!entry) {
            add('payment_without_entry', 'critical', payment.id, `O pagamento ${payment.id} de ${payment.clientName || 'cliente'} (${money(total)}) não tem lançamento no diário.`, [{ kind: 'payment', id: payment.id }], { amountMinor: total, at: payment.paymentDate });
        } else {
            const check = checkWorkingTime(entry.timestamp, workingTime);
            if (!check.working) {
                add('off_hours_payment', 'medium', payment.id, `O pagamento ${payment.id} de ${payment.clientName || 'cliente'} (${money(total)}) foi registado em ${new Date(entry.timestamp).toLocaleString('pt-AO')} — ${check.reason}${entry.processedBy ? `, por ${entry.processedBy}` : ''}.`, [{ kind: 'payment', id: payment.id }, { kind: 'entry', id: entry.id }], { amountMinor: total, at: entry.timestamp });
            }
        }
    }
    const paymentIds = new Set(data.payments.map(payment => payment.id));
    for (const entry of data.entries) {
        if (entry.type === 'payment' && entry.paymentId && !paymentIds.has(entry.paymentId)) {
            add('entry_without_payment', 'critical', entry.id, `O lançamento ${entry.id} regista um recebimento de ${money(minorOf(entry.amountTotalMinor, entry.amountTotal))} para o pagamento ${entry.paymentId}, que não existe.`, [{ kind: 'entry', id: entry.id }], { at: entry.timestamp, amountMinor: minorOf(entry.amountTotalMinor, entry.amountTotal) });
        }
    }

    // ---------------------------------------------------------------- Contratos
    const withPlan = new Set(data.installments.map(item => item.creditId));
    const withDisbursement = new Set(data.entries.filter(entry => entry.type === 'disbursement' && entry.creditId).map(entry => entry.creditId as string));
    for (const credit of disbursedCredits) {
        if (!withPlan.has(credit.id) && credit.status !== 'paid') {
            add('contract_without_plan', 'medium', credit.id, `O crédito ${credit.id} de ${credit.clientName || 'cliente'} está concedido mas não tem plano de prestações gravado.`, [{ kind: 'credit', id: credit.id }]);
        }
        if (!withDisbursement.has(credit.id)) {
            add('credit_without_disbursement', 'high', credit.id, `O crédito ${credit.id} de ${credit.clientName || 'cliente'} (${money(minorOf(credit.principalAmountMinor, credit.principalAmount))}) está concedido mas não tem lançamento de desembolso.`, [{ kind: 'credit', id: credit.id }], { amountMinor: minorOf(credit.principalAmountMinor, credit.principalAmount) });
        }
    }

    // ---------------------------------------------------------------- Utilizadores
    for (const item of data.userFindings) {
        add('user_risk', item.severity === 'error' ? 'high' : 'medium', item.id, item.message, item.entityId ? [{ kind: 'user', id: item.entityId }] : []);
    }

    const last = data.entries[data.entries.length - 1];
    const revenueMinor = ['revenue_interest', 'revenue_late_interest', 'revenue_commissions', 'revenue_recoveries']
        .reduce((sum, account) => sum - (balances.get(account) || 0), 0);
    return {
        kind, groups, findings,
        summary: {
            totalDebitMinor, totalCreditMinor,
            liquidMinor: (balances.get('cash') || 0) + (balances.get('bank') || 0),
            portfolioMinor, contractsPortfolioMinor, revenueMinor,
            entryCount: data.entries.length,
            headEntryId: last?.id || null, headHash: last?.integrityHash || null,
            sealStatus,
        },
    };
}

export const SEVERITY_ORDER: Record<AuditSeverity, number> = { critical: 0, high: 1, medium: 2, low: 3 };
export const SEVERITY_LABELS: Record<AuditSeverity, string> = { critical: 'Crítico', high: 'Alto', medium: 'Médio', low: 'Informativo' };

/** Estado de uma execução: os apontamentos justificados ou resolvidos não contam. */
export function auditStatus(findings: AuditFinding[]): 'ok' | 'warning' | 'critical' {
    const open = findings.filter(finding => !finding.justification || finding.justification.state === 'pending');
    if (open.some(finding => finding.severity === 'critical')) return 'critical';
    if (open.some(finding => finding.severity === 'high' || finding.severity === 'medium')) return 'warning';
    return 'ok';
}

/** Agrupa os apontamentos por regra (para mostrar "12 pagamentos fora do expediente" numa só linha). */
export function groupFindings(findings: AuditFinding[]) {
    const groups = new Map<AuditRuleCode, { rule: AuditRuleCode; title: string; group: AuditGroup; severity: AuditSeverity; items: AuditFinding[]; amountMinor: number }>();
    for (const finding of findings) {
        const current = groups.get(finding.rule) || { rule: finding.rule, title: finding.title, group: finding.group, severity: finding.severity, items: [], amountMinor: 0 };
        current.items.push(finding);
        current.amountMinor += finding.amountMinor || 0;
        if (SEVERITY_ORDER[finding.severity] < SEVERITY_ORDER[current.severity]) current.severity = finding.severity;
        groups.set(finding.rule, current);
    }
    return [...groups.values()].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || b.items.length - a.items.length);
}
