// Relatórios da previsão de lucros (como se chega ao lucro de cada crédito, prestação a prestação) e dos devedores
// (com filtros escolhidos pelo utilizador). Mesmo motor PDF/Excel dos restantes relatórios; valores em cêntimos.
import { luandaDateKey } from '@/bibliotecas/fuso-angola';
import { IN_PORTFOLIO, STAGES, expectedProfitSummary, type InstallmentRow, type PortfolioRow } from '@/bibliotecas/carteira-credito';
import type { Cell, ReportDef, Section } from '@/bibliotecas/relatorios-pagamentos';
import type { Payment } from '@/tipos/credito';

const kz = (minor: number) => Math.round(minor) / 100;
const money = (minor: number) => `${kz(minor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} Kz`;
const pct = (value: number) => `${(value * 100).toFixed(1).replace('.', ',')}%`;
const label = (key: string | null | undefined) => key ? key.slice(0, 10).split('-').reverse().join('/') : '—';
const real = (item: InstallmentRow) => item.status !== 'cancelled' && Number(item.principalMinor) + Number(item.interestMinor) > 0;

/** Detalhe da previsão de um crédito: as prestações com o juro (lucro) de cada uma, o pago e o que falta. */
export function creditProfitBreakdown(row: PortfolioRow, installments: InstallmentRow[], todayKey: string) {
    const plan = installments.filter(item => item.creditId === row.id && real(item)).sort((a, b) => a.installmentNumber - b.installmentNumber);
    const lines = plan.map(item => {
        const due = luandaDateKey(item.dueDate);
        const interest = Number(item.interestMinor);
        const paidInterest = Math.min(interest, Number(item.paidInterestMinor));
        const total = Number(item.principalMinor) + interest;
        const paid = Number(item.paidPrincipalMinor) + Number(item.paidInterestMinor);
        return {
            number: item.installmentNumber, due, principalMinor: Number(item.principalMinor), interestMinor: interest, totalMinor: total,
            paidInterestMinor: paidInterest, toReceiveInterestMinor: Math.max(0, interest - paidInterest),
            situation: paid >= total ? 'Paga' : due < todayKey ? 'Em atraso' : paid > 0 ? 'Parcial' : 'Por vencer',
        };
    });
    const interestFromPlan = lines.reduce((sum, line) => sum + line.interestMinor, 0);
    return {
        lines,
        // Sem plano de prestações (créditos antigos): o lucro é o total a pagar menos o capital.
        expectedMinor: lines.length ? interestFromPlan : Math.max(0, row.contractedInterestMinor),
        nextDue: lines.find(line => line.situation !== 'Paga')?.due || null,
        paidCount: lines.filter(line => line.situation === 'Paga').length,
    };
}

/** Relatório detalhado da previsão de lucros: resumo, como se calcula e o detalhe de cada crédito. */
export function profitForecastDetailReport(input: { rows: PortfolioRow[]; installments: InstallmentRow[]; payments: Payment[]; todayKey: string; creditIds?: string[] }): ReportDef {
    const forecast = expectedProfitSummary(input.rows, input.payments);
    const chosen = input.creditIds?.length ? forecast.rows.filter(row => input.creditIds!.includes(row.id)) : forecast.rows;
    const byId = new Map(input.rows.map(row => [row.id, row]));
    const sections: Section[] = [{
        heading: 'Como se calcula a previsão',
        head: ['Passo', 'Explicação'], widths: { 0: 48 },
        rows: [
            ['1. Capital investido', 'Valor entregue ao cliente em cada crédito concedido (desembolso).'],
            ['2. Juros de cada prestação', 'Calculados pela taxa do crédito sobre o capital, segundo o plano de prestações gerado na concessão.'],
            ['3. Lucro previsto', 'Soma dos juros de todas as prestações do crédito. É o ganho da empresa com o crédito.'],
            ['4. Lucro já recebido', 'Parte dos pagamentos confirmados que foi imputada a juros.'],
            ['5. Lucro por receber', 'Lucro previsto menos o lucro já recebido (juros das prestações ainda por pagar).'],
            ['6. Total a receber', 'Capital investido + lucro previsto: tudo o que o cliente paga no fim do crédito (sem mora).'],
        ],
    }, {
        heading: 'Resumo por crédito',
        head: ['Contrato', 'Cliente', 'Taxa', 'Prestações', 'Capital investido', 'Lucro previsto', '% s/ capital', 'Recebido', 'Por receber', 'Total a receber'],
        widths: { 0: 28, 1: 46 }, numeric: [2, 3, 6], money: [4, 5, 7, 8, 9],
        rows: chosen.map(item => {
            const row = byId.get(item.id)!;
            return [item.reference, item.clientName, `${item.rate.toLocaleString('pt-BR')}%`, `${row.paidCount}/${row.totalCount}`, kz(item.capitalMinor), kz(item.expectedProfitMinor),
                pct(item.marginRate), kz(item.receivedProfitMinor), kz(item.toReceiveProfitMinor), kz(item.totalExpectedMinor)];
        }),
        foot: [['Total', '', '', '', kz(chosen.reduce((s, r) => s + r.capitalMinor, 0)), kz(chosen.reduce((s, r) => s + r.expectedProfitMinor, 0)), '',
            kz(chosen.reduce((s, r) => s + r.receivedProfitMinor, 0)), kz(chosen.reduce((s, r) => s + r.toReceiveProfitMinor, 0)), kz(chosen.reduce((s, r) => s + r.totalExpectedMinor, 0))]],
        emptyText: 'Sem créditos concedidos.',
    }];
    for (const item of chosen) {
        const row = byId.get(item.id)!;
        const detail = creditProfitBreakdown(row, input.installments, input.todayKey);
        sections.push({
            heading: `${item.reference} · ${item.clientName} · capital ${money(item.capitalMinor)} à taxa de ${item.rate.toLocaleString('pt-BR')}% em ${row.totalCount || detail.lines.length} prestação(ões) = lucro ${money(detail.expectedMinor)}`,
            head: ['N.º', 'Vencimento', 'Capital', 'Juros (lucro)', 'Prestação', 'Juros recebidos', 'Juros por receber', 'Situação'],
            numeric: [0], money: [2, 3, 4, 5, 6],
            rows: detail.lines.map(line => [line.number, label(line.due), kz(line.principalMinor), kz(line.interestMinor), kz(line.totalMinor), kz(line.paidInterestMinor), kz(line.toReceiveInterestMinor), line.situation] as Cell[]),
            foot: detail.lines.length ? [['Total', '', kz(detail.lines.reduce((s, l) => s + l.principalMinor, 0)), kz(detail.expectedMinor), kz(detail.lines.reduce((s, l) => s + l.totalMinor, 0)),
                kz(detail.lines.reduce((s, l) => s + l.paidInterestMinor, 0)), kz(detail.lines.reduce((s, l) => s + l.toReceiveInterestMinor, 0)), '']] : undefined,
            emptyText: `Crédito sem plano de prestações: lucro previsto = total a pagar − capital = ${money(detail.expectedMinor)}.`,
        });
    }
    return {
        key: 'creditos-previsao-lucros', title: 'Previsão de Lucros dos Créditos Concedidos', subtitle: `Situação em ${label(input.todayKey)}`,
        orientation: 'landscape', fileBase: 'previsao-lucros', tagline: 'PREVISÃO DE LUCROS',
        summary: [['Créditos concedidos', String(chosen.length)], ['Capital investido', money(chosen.reduce((s, r) => s + r.capitalMinor, 0))],
            ['Lucro previsto (juros)', `${money(chosen.reduce((s, r) => s + r.expectedProfitMinor, 0))} · ${pct(forecast.marginRate)}`], ['Lucro já recebido', money(chosen.reduce((s, r) => s + r.receivedProfitMinor, 0))],
            ['Lucro por receber', money(chosen.reduce((s, r) => s + r.toReceiveProfitMinor, 0))], ['Total a receber (capital + lucro)', money(chosen.reduce((s, r) => s + r.totalExpectedMinor, 0))]],
        sections,
    };
}

// ── Devedores ────────────────────────────────────────────────────────────────────────
export type DebtorFilters = {
    situation: 'all' | 'overdue' | 'current';
    minDays: number;
    minOwedKz: number;
    manager: string;
    sort: 'owed' | 'days' | 'overdue' | 'name';
    search: string;
};
export const DEFAULT_DEBTOR_FILTERS: DebtorFilters = { situation: 'all', minDays: 0, minOwedKz: 0, manager: 'all', sort: 'owed', search: '' };

export type DebtorRow = {
    clientId: string; clientName: string; phone: string; managers: string[]; credits: number; references: string[];
    capitalMinor: number; interestMinor: number; moraMinor: number; owedMinor: number; overdueMinor: number; maxDays: number; nextDue: string | null;
};

/** Um cliente por linha: o que deve (capital, juros e mora por pagar), quanto está em atraso e há quantos dias. */
export function buildDebtors(rows: PortfolioRow[], phones: Map<string, string>, filters: DebtorFilters): DebtorRow[] {
    const map = new Map<string, DebtorRow>();
    for (const row of rows.filter(item => IN_PORTFOLIO.includes(item.stage))) {
        const owed = row.outstandingMinor + row.interestOutstandingMinor + row.moraMinor;
        if (owed <= 0) continue;
        const item = map.get(row.clientId) || {
            clientId: row.clientId, clientName: row.clientName, phone: phones.get(row.clientId) || '', managers: [], credits: 0, references: [],
            capitalMinor: 0, interestMinor: 0, moraMinor: 0, owedMinor: 0, overdueMinor: 0, maxDays: 0, nextDue: null,
        };
        item.credits += 1; item.references.push(row.reference);
        if (!item.managers.includes(row.managerName)) item.managers.push(row.managerName);
        item.capitalMinor += row.outstandingMinor; item.interestMinor += row.interestOutstandingMinor; item.moraMinor += row.moraMinor; item.owedMinor += owed;
        item.overdueMinor += row.overdueMinor; item.maxDays = Math.max(item.maxDays, row.daysOverdue);
        if (row.nextDueKey && (!item.nextDue || row.nextDueKey < item.nextDue)) item.nextDue = row.nextDueKey;
        map.set(row.clientId, item);
    }
    const search = filters.search.trim().toLocaleLowerCase('pt');
    const list = [...map.values()].filter(item => {
        if (filters.situation === 'overdue' && item.maxDays <= 0) return false;
        if (filters.situation === 'current' && item.maxDays > 0) return false;
        if (item.maxDays < filters.minDays) return false;
        if (item.owedMinor < Math.round(filters.minOwedKz * 100)) return false;
        if (filters.manager !== 'all' && !item.managers.includes(filters.manager)) return false;
        if (search && ![item.clientName, item.phone, ...item.references].some(value => value.toLocaleLowerCase('pt').includes(search))) return false;
        return true;
    });
    const sorters: Record<DebtorFilters['sort'], (a: DebtorRow, b: DebtorRow) => number> = {
        owed: (a, b) => b.owedMinor - a.owedMinor, days: (a, b) => b.maxDays - a.maxDays || b.owedMinor - a.owedMinor,
        overdue: (a, b) => b.overdueMinor - a.overdueMinor || b.maxDays - a.maxDays, name: (a, b) => a.clientName.localeCompare(b.clientName, 'pt'),
    };
    return list.sort(sorters[filters.sort]);
}

const SITUATION_TEXT = { all: 'Todos', overdue: 'Só em atraso', current: 'Só em dia' };
const SORT_TEXT = { owed: 'maior dívida', days: 'maior atraso', overdue: 'maior valor em atraso', name: 'nome' };

export function debtorsReport(input: { rows: PortfolioRow[]; phones: Map<string, string>; filters: DebtorFilters; todayKey: string }): ReportDef {
    const { filters } = input;
    const list = buildDebtors(input.rows, input.phones, filters);
    const sum = (key: keyof Pick<DebtorRow, 'capitalMinor' | 'interestMinor' | 'moraMinor' | 'owedMinor' | 'overdueMinor'>) => list.reduce((total, item) => total + item[key], 0);
    const applied = [`Situação: ${SITUATION_TEXT[filters.situation]}`, filters.minDays > 0 ? `atraso ≥ ${filters.minDays} dia(s)` : '', filters.minOwedKz > 0 ? `dívida ≥ ${money(filters.minOwedKz * 100)}` : '',
        filters.manager !== 'all' ? `gestor: ${filters.manager}` : '', filters.search.trim() ? `pesquisa: «${filters.search.trim()}»` : '', `ordenado por ${SORT_TEXT[filters.sort]}`].filter(Boolean).join(' · ');
    const aging = [['Em dia', (d: DebtorRow) => d.maxDays === 0], ['1 a 30 dias', (d: DebtorRow) => d.maxDays >= 1 && d.maxDays <= 30], ['31 a 90 dias', (d: DebtorRow) => d.maxDays > 30 && d.maxDays <= 90],
        ['Mais de 90 dias', (d: DebtorRow) => d.maxDays > 90]] as Array<[string, (d: DebtorRow) => boolean]>;
    return {
        key: 'creditos-devedores', title: 'Relatório de Devedores', subtitle: `Situação em ${label(input.todayKey)} · ${applied}`, orientation: 'landscape',
        fileBase: 'devedores', tagline: 'DEVEDORES',
        summary: [['Clientes com dívida', String(list.length)], ['Total em dívida', money(sum('owedMinor'))], ['Em atraso', money(sum('overdueMinor'))],
            ['Clientes em atraso', String(list.filter(item => item.maxDays > 0).length)], ['Capital por pagar', money(sum('capitalMinor'))], ['Juros e mora por pagar', money(sum('interestMinor') + sum('moraMinor'))]],
        sections: [
            {
                heading: 'Por escalão de atraso', head: ['Escalão', 'Clientes', 'Total em dívida', 'Em atraso'], numeric: [1], money: [2, 3],
                rows: aging.map(([name, test]) => { const items = list.filter(test); return [name, items.length, kz(items.reduce((s, d) => s + d.owedMinor, 0)), kz(items.reduce((s, d) => s + d.overdueMinor, 0))] as Cell[]; }),
            },
            {
                heading: 'Devedores', head: ['Cliente', 'Telefone', 'Contratos', 'Gestor', 'Capital por pagar', 'Juros por pagar', 'Mora', 'Total em dívida', 'Em atraso', 'Dias', 'Próximo vencimento'],
                widths: { 0: 42, 1: 28, 2: 30, 3: 26 }, numeric: [9], money: [4, 5, 6, 7, 8],
                rows: list.map(item => [item.clientName, item.phone || '—', item.references.join(', '), item.managers.join(', '), kz(item.capitalMinor), kz(item.interestMinor), kz(item.moraMinor),
                    kz(item.owedMinor), kz(item.overdueMinor), item.maxDays, label(item.nextDue)] as Cell[]),
                foot: [['Total', '', '', '', kz(sum('capitalMinor')), kz(sum('interestMinor')), kz(sum('moraMinor')), kz(sum('owedMinor')), kz(sum('overdueMinor')), '', '']],
                emptyText: 'Nenhum devedor com estes filtros.',
            },
        ],
    };
}

export const stageLabel = (row: PortfolioRow) => STAGES[row.stage].label;
