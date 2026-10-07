import { useMemo } from 'react';
import { balanceAt, incomeStatement, receivablesForecast, type DateRange } from '@/bibliotecas/relatorios-contabeis';
import type { ContabilidadeData } from './useContabilidade';

const ACTIVE_STATUSES = new Set(['active', 'overdue', 'defaulted', 'renegotiated']);

export function useIndicadores(data: ContabilidadeData, range: DateRange) {
    return useMemo(() => {
        const end = range.end && range.end.getTime() < Date.now() ? range.end : null;
        const cash = balanceAt(data.journal, 'cash', end);
        const bank = balanceAt(data.journal, 'bank', end);
        const income = incomeStatement(data.journal, range);
        const revenueOf = (account: string) => income.revenue.find(item => item.account === account)?.amountMinor || 0;
        const activeIds = new Set((data.snapshot?.credits || []).filter(credit => !credit.deletedAt && ACTIVE_STATUSES.has(String(credit.status))).map(credit => credit.id));
        const forecast = receivablesForecast((data.snapshot?.installments || []) as any, activeIds);
        const findings = data.evaluation?.findings || [];
        const open = findings.filter(finding => finding.severity !== 'low' && (!finding.justification || finding.justification.state === 'pending'));
        return {
            cash, bank, liquid: cash + bank,
            portfolio: balanceAt(data.journal, 'portfolio', end),
            provisions: -balanceAt(data.journal, 'provision', end),
            interest: revenueOf('revenue_interest'),
            late: revenueOf('revenue_late_interest'),
            otherRevenue: income.revenueMinor - revenueOf('revenue_interest') - revenueOf('revenue_late_interest'),
            result: income.resultMinor, revenue: income.revenueMinor, expenses: income.expensesMinor,
            overdue: forecast.overdueMinor, overdueCount: forecast.overdueCount, forecast,
            openFindings: open, criticalOpen: open.filter(finding => finding.severity === 'critical').length,
            hasCapital: data.journal.some(entry => entry.type === 'capital_entry' || entry.type === 'loan_received'),
        };
    }, [data.journal, data.snapshot, data.evaluation, range]);
}
