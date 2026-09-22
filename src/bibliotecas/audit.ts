
import { AccountingEntry, Credit, Payment } from '@/tipos/credito';
import { calculateLedgerHash, toMinorUnits } from '@/bibliotecas/ledger-financeiro';

export interface AuditFinding {
    id: string;
    severity: 'critical' | 'high' | 'medium';
    type: string;
    description: string;
    impact: string;
    entityId?: string;
    details?: any;
}

// 1. Hash Integrity Check
const generateEntryHash = async (entry: any, previousHash: string): Promise<string> => {
    const data = JSON.stringify({
        t: new Date(entry.timestamp),
        type: entry.type,
        d: entry.debit,
        c: entry.credit,
        ph: previousHash
    });

    const msgUint8 = new TextEncoder().encode(data);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
};

export const validateIntegrity = async (entries: AccountingEntry[]): Promise<AuditFinding[]> => {
    const findings: AuditFinding[] = [];
    // rowid is the append order and remains correct for backdated transactions.
    const sortedEntries = [...entries].sort((a, b) => {
        if (a.ledgerSequence != null && b.ledgerSequence != null) return a.ledgerSequence - b.ledgerSequence;
        const timeA = new Date(a.timestamp).getTime();
        const timeB = new Date(b.timestamp).getTime();
        if (timeA === timeB) return a.id.localeCompare(b.id);
        return timeA - timeB;
    });

    let previousHash = '0'.repeat(64); // Genesis hash default

    for (const entry of sortedEntries) {
        // Verify Previous Hash Link
        if (entry.previousHash !== previousHash && sortedEntries.indexOf(entry) > 0) {
            // Skip strict check for genesis or first batch if history is partial? 
            // For strict audit, this is a break.
            // However, if we just started tracking hashes recently, old entries might be weird. 
            // Assuming clean slate or fully hashed DB.
            // Let's assume strict check.
            if (entry.previousHash !== previousHash) {
                findings.push({
                    id: crypto.randomUUID(),
                    severity: 'critical',
                    type: 'Quebra de Corrente (Blockchain)',
                    description: `O registro #${entry.id.slice(0, 8)} aponta para um hash anterior inválido. A sequência foi quebrada.`,
                    impact: 'Perda de rastreabilidade e possível manipulação de histórico.',
                    entityId: entry.id
                });
            }
        }

        // Recalculate This Hash
        const calculatedHash = entry.hashVersion === 2
            ? await calculateLedgerHash({
                ...entry,
                amountPrincipalMinor: entry.amountPrincipalMinor ?? toMinorUnits(entry.amountPrincipal),
                amountInterestMinor: entry.amountInterestMinor ?? toMinorUnits(entry.amountInterest),
                amountLateInterestMinor: entry.amountLateInterestMinor ?? toMinorUnits(entry.amountLateInterest),
                amountTotalMinor: entry.amountTotalMinor ?? toMinorUnits(entry.amountTotal)
            })
            : await generateEntryHash(entry, entry.previousHash);

        if (calculatedHash !== entry.integrityHash) {
            findings.push({
                id: crypto.randomUUID(),
                severity: 'critical',
                type: 'Violação de Integridade',
                description: `O hash do registro #${entry.id.slice(0, 8)} não confere com os dados armazenados. O registro foi alterado externamente.`,
                impact: 'Dados contábeis não confiáveis. Fraude provável.',
                entityId: entry.id
            });
        }

        previousHash = entry.integrityHash;
    }

    return findings;
};

// 2. Balance Reconciliation
export const reconcileBalances = (credits: Credit[], payments: Payment[], entries: AccountingEntry[]): AuditFinding[] => {
    const findings: AuditFinding[] = [];

    credits.forEach(credit => {
        const creditPayments = payments.filter(p => p.creditId === credit.id);
        const totalPaid = creditPayments.reduce((sum, p) => sum + p.amount, 0);

        // Simple formula: Principal + Interest + Late (if added to balance) - Payments
        // However, standard logic usually tracks 'currentBalance' as remaining principal + accrued fees.
        // Let's assume: expectedBalance = (OriginalAmount + AccruedInterest + LateFees) - TotalPaid
        // Note: 'totalDue' usually reflects this. 'currentBalance' might be just Principal depending on implementation.
        // Let's rely on standard: Balance = TotalDue - TotalPaid (if TotalDue is static) or 
        // Logic: Start Balance = Principal. 
        // + Interest Accrued 
        // - Payments

        // Let's inverse check: Is 'currentBalance' consistent with 'totalDue' - 'paid'?
        // Or simpler: credit.currentBalance should roughly equal credit.totalDue - totalPaid? 
        // Not exactly because 'totalDue' includes future interest often.

        // Let's use the USER'S Formula: Saldo Inicial + Liberações - Pagamentos + Juros/Multas = Saldo Atual
        let calculatedBalance = credit.principalAmount; // "Liberações" (assuming 1 disbursement)

        // Add accrued interest + late fees (Juros/Multas)
        calculatedBalance += (credit.accruedInterest || 0);
        calculatedBalance += (credit.lateInterest || 0);

        // Subtract payments
        calculatedBalance -= totalPaid;

        // NEW: Cross-check with Accounting Entries (Financial flow integrity)
        // We find entries that reference this credit to see if any disbursement/payment differs
        const creditEntries = entries.filter(e => e.creditId === credit.id);
        const entryPaidTotal = creditEntries
            .filter(e => e.credit === 'bank' || e.credit === 'cash')
            .reduce((sum, e) => sum + e.amountTotal, 0);

        // Tolerance for floating point
        const diff = Math.abs(calculatedBalance - credit.currentBalance);
        const paymentEntryDiff = Math.abs(totalPaid - entryPaidTotal);

        if (diff > 5) {
            findings.push({
                id: crypto.randomUUID(),
                severity: 'high',
                type: 'Divergência de Saldo (Contrato)',
                description: `Contrato #${credit.id.slice(0, 8)}: Saldo registrado (${credit.currentBalance}) difere do cálculo atuarial (${calculatedBalance.toFixed(2)}).`,
                impact: `Diferença de ${diff.toFixed(2)} AOA. Risco de erro nos juros calculados.`,
                entityId: credit.id
            });
        }

        if (paymentEntryDiff > 1) {
            findings.push({
                id: crypto.randomUUID(),
                severity: 'critical',
                type: 'Inconsistência de Fluxo de Caixa',
                description: `Contrato #${credit.id.slice(0, 8)}: Soma de pagamentos registrados (${totalPaid.toFixed(2)}) não bate com lançamentos contábeis (${entryPaidTotal.toFixed(2)}).`,
                impact: "Dinheiro pode ter sido registrado mas não entrou no livro diário (ou vice-versa).",
                entityId: credit.id
            });
        }
    });

    return findings;
};

// 2.5 Monetary Leakage Check (New)
export const scanMonetaryLeaks = (entries: AccountingEntry[], credits: Credit[], payments: Payment[]): AuditFinding[] => {
    const findings: AuditFinding[] = [];

    // Check if total income in book matches total payment amounts
    const totalPaymentsBook = entries
        .filter(e => e.credit === 'bank' || e.credit === 'cash')
        .reduce((sum, e) => sum + e.amountTotal, 0);

    const totalPaymentsActual = payments.reduce((sum, p) => sum + p.amount, 0);

    if (Math.abs(totalPaymentsBook - totalPaymentsActual) > 10) {
        findings.push({
            id: crypto.randomUUID(),
            severity: 'critical',
            type: 'Fuga Monetária Detectada',
            description: `A soma de todos os pagamentos (${totalPaymentsActual.toFixed(2)}) não coincide com a receita registrada no Livro Diário (${totalPaymentsBook.toFixed(2)}).`,
            impact: "Quebra de integridade financeira global. Valores não reconciliados no sistema.",
        });
    }

    return findings;
};

// 3. Exception Scanning & Period Analysis
export const scanExceptionsAndMetrics = (
    entries: AccountingEntry[],
    payments: Payment[],
    credits: Credit[],
    startDate?: Date,
    endDate?: Date
): { findings: AuditFinding[], metrics: any } => {
    const findings: AuditFinding[] = [];
    let periodRevenue = 0;
    let periodExpenses = 0; // Currently not tracked explicitly as 'Expense' type, maybe future use
    let periodProfit = 0;
    let newContractsCount = 0;

    // Filter by Date Range if provided
    const start = startDate ? new Date(startDate) : new Date(0);
    const end = endDate ? new Date(endDate) : new Date(8640000000000000);

    // -- Metrics Calculation --

    // Revenue from Interest and Late Fees in period
    // We can use AccountingEntries for precise revenue tracking
    const revenueEntries = entries.filter(e =>
        (e.credit === 'revenue_interest' || e.credit === 'revenue_late_interest') &&
        new Date(e.timestamp) >= start &&
        new Date(e.timestamp) <= end
    );

    periodRevenue = revenueEntries.reduce((sum, e) => sum + e.amountTotal, 0);

    // Expenses (e.g., 'expenses' in debit)
    const expenseEntries = entries.filter(e =>
        e.debit === 'expenses' &&
        new Date(e.timestamp) >= start &&
        new Date(e.timestamp) <= end
    );
    periodExpenses = expenseEntries.reduce((sum, e) => sum + e.amountTotal, 0);

    // Net Profit
    periodProfit = periodRevenue - periodExpenses;

    // Contracts Created in Period
    newContractsCount = credits.filter(c =>
        new Date(c.createdAt) >= start &&
        new Date(c.createdAt) <= end
    ).length;


    // -- Exception Scanning --

    // Check Payments in Period
    const relevantPayments = payments.filter(p => {
        const d = new Date(p.paymentDate);
        return d >= start && d <= end;
    });

    relevantPayments.forEach(payment => {
        const date = new Date(payment.paymentDate);
        if (date.getDay() === 0) { // 0 is Sunday
            findings.push({
                id: crypto.randomUUID(),
                severity: 'medium',
                type: 'Pagamento em Domingo',
                description: `Pagamento #${payment.id.slice(0, 8)} registrado em um domingo (${date.toLocaleDateString()}).`,
                impact: 'Possível caixa 2 ou erro operacional (Verificar se a agência abre domingo).',
                entityId: payment.id
            });
        }
    });

    // Check Status Conflicts (Global check, not just period)
    credits.forEach(credit => {
        if (credit.status === 'active' && credit.currentBalance <= 0) {
            findings.push({
                id: crypto.randomUUID(),
                severity: 'medium',
                type: 'Status Inconsistente',
                description: `Crédito #${credit.id.slice(0, 8)} está 'Ativo' mas possui saldo zero.`,
                impact: 'Relatórios de ativos inflados incorretamente.',
                entityId: credit.id
            });
        }
    });

    return {
        findings,
        metrics: {
            revenue: periodRevenue,
            expenses: periodExpenses,
            profit: periodProfit,
            contractsCount: newContractsCount
        }
    };
};

export const runAuditScan = async (
    entries: AccountingEntry[],
    credits: Credit[],
    payments: Payment[],
    startDate?: Date,
    endDate?: Date
): Promise<{ findings: AuditFinding[], metrics: any }> => {
    // Integrity check is always global for safety, or we could filter? 
    // Integrity MUST be global chain check usually. But finding specific errors in period is okay.
    // Let's keep integrity global for now as chain depends on history.
    const integrityFindings = await validateIntegrity(entries);

    const reconciliationFindings = reconcileBalances(credits, payments, entries);
    const leakageFindings = scanMonetaryLeaks(entries, credits, payments);

    const { findings: exceptionFindings, metrics } = scanExceptionsAndMetrics(entries, payments, credits, startDate, endDate);

    return {
        findings: [...integrityFindings, ...reconciliationFindings, ...exceptionFindings, ...leakageFindings],
        metrics
    };
};




