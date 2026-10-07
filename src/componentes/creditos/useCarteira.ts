import { useCallback, useEffect, useMemo, useState } from 'react';
import { useData } from '@/contextos/ContextoDados';
import * as C from '@/bibliotecas/carteira-credito';
import { luandaDateKey, luandaTodayKey } from '@/bibliotecas/fuso-angola';
import { ServicoCarteira, type Restructuring } from '@/servicos/ServicoCarteira';
import { ServicoAlcadas, type UserRow } from '@/servicos/ServicoAlcadas';
import { ServicoConfigSimulador } from '@/servicos/ServicoConfigSimulador';
import { getLastCloudSyncStatus, type CloudSyncStatus } from '@/servicos/ServicoSincronizacaoCloud';

export type CarteiraView = 'carteira' | 'producao' | 'anual';
export type CardFilter = 'all' | 'carteira' | 'atraso' | 'par30' | 'vence7' | 'mora' | 'incumprimento' | 'juros' | 'concedidos' | 'liquidados_periodo';

export type CreditFilters = {
    search: string; product: string; managerId: string; branchId: string; risk: string; aging: string;
    minAmount: string; maxAmount: string; grantedFrom: string; grantedTo: string; dueFrom: string; dueTo: string;
};
export const EMPTY_FILTERS: CreditFilters = { search: '', product: '', managerId: '', branchId: '', risk: '', aging: '', minAmount: '', maxAmount: '', grantedFrom: '', grantedTo: '', dueFrom: '', dueTo: '' };

const monthRange = (year: number, month: number) => {
    const key = `${year}-${String(month + 1).padStart(2, '0')}`;
    const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    return { start: `${key}-01`, end: `${key}-${String(last).padStart(2, '0')}` };
};

/** Estado da página de Créditos: dados calculados com a biblioteca partilhada e filtros da vista escolhida. */
export function useCarteira(input: { search?: string } = {}) {
    const { credits, payments, clients, accountingEntries, dataLoadIssues, isDataLoading } = useData();
    const [context, setContext] = useState<Awaited<ReturnType<typeof ServicoCarteira.loadContext>> | null>(null);
    const [users, setUsers] = useState<UserRow[]>([]);
    const [productNames, setProductNames] = useState<Map<string, string>>(new Map());
    const [contextError, setContextError] = useState('');
    const today = luandaTodayKey();
    const [view, setView] = useState<CarteiraView>('carteira');
    const [year, setYear] = useState(() => Number(today.slice(0, 4)));
    const [month, setMonth] = useState(() => Number(today.slice(5, 7)) - 1);
    const [tab, setTab] = useState('todos');
    const [card, setCard] = useState<CardFilter>('all');
    const [filters, setFilters] = useState<CreditFilters>({ ...EMPTY_FILTERS, search: input.search || '' });
    const [cloud, setCloud] = useState<CloudSyncStatus>(getLastCloudSyncStatus);

    const reloadContext = useCallback(async () => {
        try { setContext(await ServicoCarteira.loadContext()); setContextError(''); }
        catch (error: any) { setContextError(error?.message || 'Não foi possível carregar o plano de prestações.'); }
    }, []);
    // O plano de prestações muda com cada crédito/pagamento: volta a ler quando os dados do contexto mudam.
    useEffect(() => { void reloadContext(); }, [reloadContext, credits, payments]);
    useEffect(() => { void ServicoAlcadas.users().then(setUsers).catch(() => setUsers([])); }, []);
    useEffect(() => { void ServicoConfigSimulador.load().then(config => setProductNames(new Map(config.products.map(item => [item.id, item.name])))).catch(() => undefined); }, []);
    useEffect(() => {
        const handler = (event: Event) => setCloud((event as CustomEvent<CloudSyncStatus>).detail);
        window.addEventListener('tango-cloud-sync-status', handler);
        return () => window.removeEventListener('tango-cloud-sync-status', handler);
    }, []);

    const rows = useMemo(() => context ? C.buildPortfolio(credits, {
        installments: context.installments, payments, legalCreditIds: context.legalCreditIds, writtenOffIds: context.writtenOffIds,
        escalatedIds: context.escalatedIds, clients, users, productOf: context.productOf, productNames,
    }) : [], [context, credits, payments, clients, users, productNames]);

    const range = useMemo(() => monthRange(year, month), [year, month]);
    const previousRange = useMemo(() => month === 0 ? monthRange(year - 1, 11) : monthRange(year, month - 1), [year, month]);
    const monthKey = range.start.slice(0, 7);
    const entries = accountingEntries;
    const figures = useMemo(() => C.periodFigures({ rows, credits, payments, entries, clients, range }), [rows, credits, payments, entries, clients, range]);
    const previousFigures = useMemo(() => C.periodFigures({ rows, credits, payments, entries, clients, range: previousRange }), [rows, credits, payments, entries, clients, previousRange]);
    const kpis = useMemo(() => C.portfolioKpis(rows, context?.installments || []), [rows, context]);
    const annual = useMemo(() => C.annualTable({ rows, credits, payments, entries, installments: context?.installments || [], clients, year }), [rows, credits, payments, entries, context, clients, year]);
    const dots = useMemo(() => C.monthDots(rows, context?.installments || [], year), [rows, context, year]);
    const alerts = useMemo(() => C.creditAlerts(rows, context?.installments || [], context?.brokenPromises || []), [rows, context]);

    /**
     * Linhas da vista, antes dos separadores e filtros. Carteira: todos os créditos, seja qual for o mês de concessão
     * (os cards mostram o que está em curso hoje; o separador Todos mostra todos os estados, incluindo liquidados).
     * Produção: os concedidos no mês escolhido.
     */
    const viewRows = useMemo(() => view === 'producao' ? rows.filter(row => row.competenceMonth === monthKey) : rows, [rows, view, monthKey]);

    const matchesFilters = useCallback((row: C.PortfolioRow) => {
        const term = filters.search.trim().toLowerCase();
        if (term && ![row.reference, row.id, row.clientName, row.managerName, row.product].some(value => value.toLowerCase().includes(term))) return false;
        if (filters.product && row.product !== filters.product) return false;
        if (filters.managerId && row.managerId !== filters.managerId) return false;
        if (filters.branchId && row.branchId !== filters.branchId) return false;
        if (filters.risk && row.riskLevel !== filters.risk) return false;
        if (filters.aging && row.aging !== filters.aging) return false;
        if (filters.minAmount && row.grantedMinor < Number(filters.minAmount) * 100) return false;
        if (filters.maxAmount && row.grantedMinor > Number(filters.maxAmount) * 100) return false;
        if (filters.grantedFrom && row.grantedKey < filters.grantedFrom) return false;
        if (filters.grantedTo && row.grantedKey > filters.grantedTo) return false;
        if (filters.dueFrom && (!row.nextDueKey || row.nextDueKey < filters.dueFrom)) return false;
        if (filters.dueTo && (!row.nextDueKey || row.nextDueKey > filters.dueTo)) return false;
        return true;
    }, [filters]);

    const matchesCard = useCallback((row: C.PortfolioRow) => {
        const in7 = luandaDateKey(new Date(Date.now() + 7 * 86_400_000));
        switch (card) {
            case 'carteira': return C.IN_PORTFOLIO.includes(row.stage);
            case 'atraso': return C.IN_PORTFOLIO.includes(row.stage) && row.daysOverdue > 0;
            case 'par30': return C.IN_PORTFOLIO.includes(row.stage) && row.daysOverdue > 30;
            case 'incumprimento': return C.IN_PORTFOLIO.includes(row.stage) && row.daysOverdue > 90;
            case 'vence7': return C.IN_PORTFOLIO.includes(row.stage) && !!row.nextDueKey && row.nextDueKey >= today && row.nextDueKey <= in7;
            case 'mora': return row.moraMinor > 0;
            case 'juros': return C.IN_PORTFOLIO.includes(row.stage) && row.interestOutstandingMinor > 0;
            case 'liquidados_periodo': return !!row.paidOffKey && row.paidOffKey >= range.start && row.paidOffKey <= range.end;
            default: return true;
        }
    }, [card, today, range]);

    const baseRows = useMemo(() => view === 'producao' && card === 'liquidados_periodo' ? rows : viewRows, [view, card, rows, viewRows]);
    const filteredNoTab = useMemo(() => baseRows.filter(row => matchesFilters(row) && matchesCard(row)), [baseRows, matchesFilters, matchesCard]);
    const tabCounts = useMemo(() => Object.fromEntries(C.STAGE_TABS.map(item => [item.id, item.stages ? filteredNoTab.filter(row => item.stages!.includes(row.stage)).length : filteredNoTab.length])), [filteredNoTab]);
    const visibleRows = useMemo(() => {
        const definition = C.STAGE_TABS.find(item => item.id === tab);
        return definition?.stages ? filteredNoTab.filter(row => definition.stages!.includes(row.stage)) : filteredNoTab;
    }, [filteredNoTab, tab]);

    const stale = cloud.state === 'syncing' || ((cloud.state === 'pending' || cloud.state === 'error') && Number(cloud.pending || 0) > 0);
    const restructurings: Restructuring[] = context?.restructurings || [];

    return {
        loading: isDataLoading || !context, contextError, dataLoadIssues, stale, cloud,
        view, setView, year, setYear, month, setMonth, range, monthKey, tab, setTab, card, setCard, filters, setFilters,
        rows, viewRows, visibleRows, tabCounts, figures, previousFigures, kpis, annual, dots, alerts, users, context, restructurings,
        reloadContext, today,
    };
}

export type CarteiraState = ReturnType<typeof useCarteira>;
