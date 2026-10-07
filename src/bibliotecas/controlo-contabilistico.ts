export type LedgerLine = { id: string; transactionId: string; account: string; side: 'debit' | 'credit'; component: string; amountMinor: number; timestamp?: string; sourceId?: string; description?: string };
export type Finding = { id: string; severity: 'error' | 'warning'; message: string; entityId?: string };
export const ACCOUNT_NAMES: Record<string, string> = { cash: 'Caixa', bank: 'Bancos', portfolio: 'Carteira de crédito',
    revenue_interest: 'Juros recebidos', revenue_late_interest: 'Juros de mora recebidos', interest_receivable: 'Juros a receber',
    accrued_interest: 'Juros reconhecidos', receivable_interest: 'Juros a receber', receivable_late_interest: 'Juros de mora a receber', capital: 'Capital', equity: 'Capital próprio', provision: 'Provisões',
    expenses: 'Despesas', pdd: 'Perdas por imparidade', commissions: 'Comissões', fines: 'Multas' };
export function trialBalance(lines: LedgerLine[]) {
    const accounts = new Map<string, { account: string; debitMinor: number; creditMinor: number }>();
    for (const line of lines) {
        if (!Number.isSafeInteger(line.amountMinor) || line.amountMinor <= 0) throw new Error('Linha monetária inválida: ' + line.id);
        const row = accounts.get(line.account) || { account: line.account, debitMinor: 0, creditMinor: 0 };
        if (line.side === 'debit') row.debitMinor += line.amountMinor;
        else if (line.side === 'credit') row.creditMinor += line.amountMinor;
        else throw new Error('Sentido inválido.');
        accounts.set(line.account, row);
    }
    return [...accounts.values()].map(row => ({ ...row, balanceMinor: row.debitMinor - row.creditMinor })).sort((a,b) => a.account.localeCompare(b.account));
}
export function ledgerFindings(transactions: any[], lines: LedgerLine[]): Finding[] {
    const result: Finding[] = [];
    const ids = new Set(transactions.map(t => t.id));
    for (const line of lines) {
        if (!ids.has(line.transactionId)) result.push({ id: 'orphan-line:' + line.id, severity: 'error', message: 'Linha sem transação contabilística.', entityId: line.id });
        if (!Number.isSafeInteger(Number(line.amountMinor)) || Number(line.amountMinor) <= 0)
            result.push({ id: 'invalid-line:' + line.id, severity: 'error', message: 'Valor monetário inválido.', entityId: line.id });
    }
    for (const tx of transactions) {
        const own = lines.filter(line => line.transactionId === tx.id);
        const debit = own.filter(l => l.side === 'debit').reduce((s,l) => s + Number(l.amountMinor),0);
        const credit = own.filter(l => l.side === 'credit').reduce((s,l) => s + Number(l.amountMinor),0);
        if (!own.length || debit !== credit || debit !== Number(tx.totalDebitMinor) || credit !== Number(tx.totalCreditMinor))
            result.push({ id: 'unbalanced:' + tx.id, severity: 'error', message: 'Lançamento desequilibrado ou linhas em falta.', entityId: tx.id });
    }
    return result;
}
export type BankMovement = { id: string; date: string; amountMinor: number; reference: string };
export function reconcileBank(bank: BankMovement[], system: BankMovement[]) {
    const used = new Set<string>();
    return {
        bank: bank.map(row => {
            const candidates = system.filter(item => !used.has(item.id) && item.date === row.date && item.amountMinor === row.amountMinor &&
                (!row.reference || item.reference.toLowerCase().includes(row.reference.toLowerCase()) || row.reference.toLowerCase().includes(item.reference.toLowerCase())));
            if (candidates.length !== 1) return { ...row, state: candidates.length ? 'ambiguous' : 'missing-system', paymentId: null };
            used.add(candidates[0].id);
            return { ...row, state: 'matched', paymentId: candidates[0].id };
        }),
        unmatchedSystem: system.filter(item => !used.has(item.id))
    };
}
export function agingPortfolio(credits: any[], rates = [0, 0, 0, 0, 0]) {
    const labels = ['Em dia', '1–30 dias', '31–60 dias', '61–90 dias', 'Mais de 90 dias'];
    const buckets = labels.map((label, i) => ({ label, count: 0, principalMinor: 0, rate: rates[i] || 0, provisionMinor: 0 }));
    for (const credit of credits.filter(c => !c.deletedAt && ['active','overdue','defaulted','renegotiated'].includes(c.status))) {
        const days = Math.max(0, Number(credit.daysOverdue) || 0);
        const i = days === 0 ? 0 : days <= 30 ? 1 : days <= 60 ? 2 : days <= 90 ? 3 : 4;
        const principal = credit.currentBalanceMinor ?? Math.round(Number(credit.currentBalance || 0) * 100);
        buckets[i].count++;
        buckets[i].principalMinor += principal;
        buckets[i].provisionMinor += Math.round(principal * buckets[i].rate / 100);
    }
    const total = buckets.reduce((s,b) => s+b.principalMinor,0);
    return { buckets, totalMinor: total, par30: total ? buckets.slice(2).reduce((s,b) => s+b.principalMinor,0)/total*100 : 0,
        defaultRate: total ? buckets.slice(1).reduce((s,b) => s+b.principalMinor,0)/total*100 : 0 };
}
export function historicalLines(entry: any): LedgerLine[] {
    const total = Number(entry.amountTotalMinor);
    if (!Number.isSafeInteger(total) || total <= 0) throw new Error('Total histórico inválido: ' + entry.id);
    const base = { transactionId: entry.id, timestamp: entry.timestamp, sourceId: entry.paymentId || entry.creditId || entry.id };
    const pair = (debit: string, credit: string) => [
        { ...base, id: entry.id+':line:1', account: debit, side: 'debit' as const, component: 'historical', amountMinor: total },
        { ...base, id: entry.id+':line:2', account: credit, side: 'credit' as const, component: 'historical', amountMinor: total }
    ];
    if (['payment','reversal','restoration'].includes(entry.type)) {
        const components = [['portfolio', Number(entry.amountPrincipalMinor)], ['revenue_interest', Number(entry.amountInterestMinor)],
            ['revenue_late_interest', Number(entry.amountLateInterestMinor)]] as const;
        if (components.some(([,amount])=>!Number.isSafeInteger(amount)||amount<0) || components.reduce((sum,[,amount])=>sum+amount,0)!==total)
            throw new Error('Alocações históricas incompletas: ' + entry.id);
        const reversed = entry.type === 'reversal';
        return [{ ...base, id: entry.id+':line:1', account: reversed ? entry.credit : entry.debit,
            side: reversed ? 'credit' : 'debit', component: 'settlement', amountMinor: total },
            ...components.filter(([,amount])=>amount>0).map(([account,amount],i)=>({ ...base, id: entry.id+':line:'+(i+2),
                account, side: reversed ? 'debit' as const : 'credit' as const, component: 'historical', amountMinor: amount }))];
    }
    if (!entry.debit || !entry.credit || entry.debit===entry.credit) throw new Error('Contas históricas inválidas: ' + entry.id);
    if (!['disbursement','adjustment','interest_accrual','late_interest'].includes(entry.type)) throw new Error('Tipo histórico não suportado: '+entry.type);
    return pair(entry.debit, entry.credit);
}