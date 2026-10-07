// Relatórios da carteira de crédito em PDF e Excel (mesmo motor dos relatórios de pagamentos): carteira numa
// data, produção mensal, aging e PAR30, mapa de vencimentos, créditos por situação, rentabilidade por produto e
// por gestor, e o extrato de um crédito para o cliente. Os valores vêm da biblioteca partilhada da carteira.
import { luandaDateKey, formatLuandaDate } from '@/bibliotecas/fuso-angola';
import { AGING_LABELS, IN_PORTFOLIO, STAGES, agingOf, type AgingBucket, type InstallmentRow, type PortfolioRow } from '@/bibliotecas/carteira-credito';
import type { Cell, ReportDef, Section } from '@/bibliotecas/relatorios-pagamentos';
import type { Payment } from '@/tipos/credito';

export type CreditReportKey = 'carteira' | 'producao' | 'aging' | 'vencimentos' | 'situacoes' | 'rentabilidade' | 'extrato';
export const CREDIT_REPORTS: Array<{ key: CreditReportKey; title: string; description: string; needs: 'date' | 'month' | 'none' | 'credit' }> = [
    { key: 'carteira', title: 'Carteira de Crédito', description: 'Créditos em curso e capital em dívida numa data escolhida.', needs: 'date' },
    { key: 'producao', title: 'Produção Mensal', description: 'Créditos concedidos no mês, por produto e gestor.', needs: 'month' },
    { key: 'aging', title: 'Aging da Carteira e PAR30', description: 'Escalões de atraso e percentagem em risco.', needs: 'none' },
    { key: 'vencimentos', title: 'Mapa de Vencimentos', description: 'Prestações a vencer nos próximos 30, 60 e 90 dias.', needs: 'none' },
    { key: 'situacoes', title: 'Liquidados, Reestruturados, Contencioso e Abatidos', description: 'Créditos fora do curso normal.', needs: 'none' },
    { key: 'rentabilidade', title: 'Rentabilidade por Produto e por Gestor', description: 'Juros contratados e recebidos, capital e atrasos.', needs: 'none' },
    { key: 'extrato', title: 'Extrato do Crédito', description: 'Plano de prestações e pagamentos, para o cliente.', needs: 'credit' },
];

const kz = (minor: number) => Math.round(minor) / 100;
const label = (key: string | null) => key ? key.split('-').reverse().join('/') : '—';
const owed = (item: InstallmentRow) => Math.max(0, (Number(item.principalMinor) + Number(item.interestMinor)) - (Number(item.paidPrincipalMinor) + Number(item.paidInterestMinor)));
const real = (item: InstallmentRow) => item.status !== 'cancelled' && Number(item.principalMinor) + Number(item.interestMinor) > 0;

export type CreditReportInput = {
    rows: PortfolioRow[]; installments: InstallmentRow[]; payments: Payment[];
    dateKey?: string; monthKey?: string; creditId?: string; todayKey: string;
};

const baseRow = (row: PortfolioRow): Cell[] => [row.reference, row.clientName, row.product, row.managerName];
const HEAD = ['Referência', 'Cliente', 'Produto', 'Gestor'];
const WIDTHS = { 0: 26, 1: 44, 2: 30, 3: 34 };

export function buildCreditReport(key: CreditReportKey, input: CreditReportInput): ReportDef {
    const info = CREDIT_REPORTS.find(item => item.key === key)!;
    let subtitle = `Situação em ${label(input.todayKey)}`;
    let summary: Array<[string, string]> = [];
    let sections: Section[] = [];
    let orientation: ReportDef['orientation'] = 'landscape';
    const book = input.rows.filter(row => IN_PORTFOLIO.includes(row.stage));
    const money = (minor: number) => `${kz(minor).toLocaleString('pt-AO', { minimumFractionDigits: 2 })} Kz`;
    switch (key) {
        case 'carteira': {
            const date = input.dateKey || input.todayKey;
            subtitle = `Carteira em ${label(date)}`;
            // Capital em dívida na data: concedido menos o capital pago até essa data (pagamentos confirmados).
            const paidBy = new Map<string, number>();
            for (const payment of input.payments) if (payment.status === 'confirmed' && !payment.deletedAt && luandaDateKey(payment.paymentDate) <= date)
                paidBy.set(payment.creditId, (paidBy.get(payment.creditId) || 0) + Math.round(Number(payment.allocatedToPrincipal || 0) * 100));
            const list = input.rows.filter(row => row.grantedKey <= date && !['pedido', 'em_analise', 'rejeitado', 'cancelado', 'abatido'].includes(row.stage))
                .map(row => ({ row, outstanding: Math.max(0, row.grantedMinor - (paidBy.get(row.id) || 0)) })).filter(item => item.outstanding > 0);
            const total = list.reduce((sum, item) => sum + item.outstanding, 0);
            summary = [['Créditos em curso', String(list.length)], ['Capital em dívida', money(total)], ['Clientes', String(new Set(list.map(item => item.row.clientId)).size)]];
            sections = [{ heading: 'Créditos em curso', head: [...HEAD, 'Concedido em', 'Capital concedido', 'Capital em dívida', 'Estado atual'], widths: WIDTHS, money: [5, 6],
                rows: list.map(({ row, outstanding }) => [...baseRow(row), label(row.grantedKey), kz(row.grantedMinor), kz(outstanding), STAGES[row.stage].label]),
                foot: [['Total', '', '', '', '', kz(list.reduce((sum, item) => sum + item.row.grantedMinor, 0)), kz(total), '']], emptyText: 'Sem créditos em curso nessa data.' }];
            break;
        }
        case 'producao': {
            const month = input.monthKey || input.todayKey.slice(0, 7);
            subtitle = `Produção de ${month.slice(5, 7)}/${month.slice(0, 4)}`;
            const list = input.rows.filter(row => row.competenceMonth === month && !['pedido', 'em_analise', 'rejeitado', 'cancelado'].includes(row.stage));
            const byProduct = new Map<string, { count: number; minor: number }>();
            for (const row of list) { const item = byProduct.get(row.product) || { count: 0, minor: 0 }; item.count += 1; item.minor += row.grantedMinor; byProduct.set(row.product, item); }
            summary = [['Créditos concedidos', String(list.length)], ['Clientes', String(new Set(list.map(row => row.clientId)).size)], ['Capital concedido', money(list.reduce((sum, row) => sum + row.grantedMinor, 0))],
                ['Juros contratados', money(list.reduce((sum, row) => sum + row.contractedInterestMinor, 0))]];
            sections = [
                { heading: 'Por produto', head: ['Produto', 'Créditos', 'Capital concedido'], numeric: [1], money: [2], rows: [...byProduct.entries()].map(([product, item]) => [product, item.count, kz(item.minor)]) },
                { heading: 'Créditos concedidos', head: [...HEAD, 'Data', 'Capital', 'TAN', 'Prestações', 'Juros contratados', 'Estado'], widths: WIDTHS, money: [5, 9], numeric: [6, 7],
                    rows: list.map(row => [...baseRow(row), label(row.grantedKey), kz(row.grantedMinor), `${row.rate}%`, row.totalCount, kz(row.contractedInterestMinor), STAGES[row.stage].label]), emptyText: 'Sem créditos concedidos no mês.' },
            ];
            break;
        }
        case 'aging': {
            const total = book.reduce((sum, row) => sum + row.outstandingMinor, 0);
            const buckets = (Object.keys(AGING_LABELS) as AgingBucket[]).map(bucket => {
                const items = book.filter(row => row.aging === bucket);
                const minor = items.reduce((sum, row) => sum + row.outstandingMinor, 0);
                return [AGING_LABELS[bucket], items.length, kz(minor), total ? `${(minor / total * 100).toFixed(1).replace('.', ',')}%` : '0,0%'] as Cell[];
            });
            const par30 = book.filter(row => row.daysOverdue > 30).reduce((sum, row) => sum + row.outstandingMinor, 0);
            summary = [['Capital em dívida', money(total)], ['PAR30', total ? `${(par30 / total * 100).toFixed(1).replace('.', ',')}%` : '—'], ['Capital com mais de 30 dias', money(par30)],
                ['Créditos em atraso', String(book.filter(row => row.daysOverdue > 0).length)]];
            sections = [
                { heading: 'Escalões de atraso', head: ['Escalão', 'Créditos', 'Capital em dívida', '% da carteira'], numeric: [1], money: [2], rows: buckets },
                { heading: 'Créditos em atraso', head: [...HEAD, 'Dias', 'Escalão', 'Em atraso', 'Mora', 'Capital em dívida'], widths: WIDTHS, numeric: [4], money: [6, 7, 8],
                    rows: book.filter(row => row.daysOverdue > 0).sort((a, b) => b.daysOverdue - a.daysOverdue).map(row => [...baseRow(row), row.daysOverdue, AGING_LABELS[agingOf(row.daysOverdue)], kz(row.overdueMinor), kz(row.moraMinor), kz(row.outstandingMinor)]),
                    emptyText: 'Sem créditos em atraso.' },
            ];
            break;
        }
        case 'vencimentos': {
            const byId = new Map(book.map(row => [row.id, row]));
            const open = input.installments.filter(item => real(item) && byId.has(item.creditId) && owed(item) > 0 && luandaDateKey(item.dueDate) >= input.todayKey);
            const until = (days: number) => luandaDateKey(new Date(Date.parse(`${input.todayKey}T12:00:00Z`) + days * 86_400_000));
            const window = (from: string, to: string) => open.filter(item => luandaDateKey(item.dueDate) > from && luandaDateKey(item.dueDate) <= to);
            const groups: Array<[string, InstallmentRow[]]> = [['Próximos 30 dias', open.filter(item => luandaDateKey(item.dueDate) <= until(30))], ['31 a 60 dias', window(until(30), until(60))], ['61 a 90 dias', window(until(60), until(90))]];
            summary = groups.map(([name, items]) => [name, `${items.length} prestação(ões) · ${money(items.reduce((sum, item) => sum + owed(item), 0))}`]);
            sections = groups.map(([name, items]) => ({
                heading: name, head: ['Vencimento', ...HEAD, 'Prestação n.º', 'Valor'], widths: { 0: 24, 1: 26, 2: 44 }, numeric: [5], money: [6],
                rows: items.sort((a, b) => luandaDateKey(a.dueDate).localeCompare(luandaDateKey(b.dueDate))).map(item => { const row = byId.get(item.creditId)!; return [label(luandaDateKey(item.dueDate)), ...baseRow(row), item.installmentNumber, kz(owed(item))]; }),
                emptyText: 'Sem vencimentos neste intervalo.',
            }));
            break;
        }
        case 'situacoes': {
            const of = (stage: PortfolioRow['stage']) => input.rows.filter(row => row.stage === stage);
            summary = (['liquidado', 'reestruturado', 'contencioso', 'abatido'] as const).map(stage => [STAGES[stage].label, String(of(stage).length)]);
            sections = (['liquidado', 'reestruturado', 'contencioso', 'abatido'] as const).map(stage => ({
                heading: STAGES[stage].label, head: [...HEAD, 'Concedido em', 'Capital concedido', 'Capital em dívida', stage === 'liquidado' ? 'Liquidado em' : 'Dias de atraso'], widths: WIDTHS, money: [5, 6],
                rows: of(stage).map(row => [...baseRow(row), label(row.grantedKey), kz(row.grantedMinor), kz(row.outstandingMinor), stage === 'liquidado' ? label(row.paidOffKey) : row.daysOverdue]),
                emptyText: `Sem créditos ${STAGES[stage].label.toLowerCase()}.`,
            }));
            break;
        }
        case 'rentabilidade': {
            const interestPaid = new Map<string, number>();
            for (const payment of input.payments) if (payment.status === 'confirmed' && !payment.deletedAt)
                interestPaid.set(payment.creditId, (interestPaid.get(payment.creditId) || 0) + Math.round((Number(payment.allocatedToInterest || 0) + Number(payment.allocatedToLateInterest || 0)) * 100));
            const group = (by: (row: PortfolioRow) => string) => {
                const map = new Map<string, { count: number; granted: number; contracted: number; received: number; outstanding: number; overdue: number }>();
                for (const row of input.rows.filter(item => !['pedido', 'em_analise', 'rejeitado', 'cancelado'].includes(item.stage))) {
                    const item = map.get(by(row)) || { count: 0, granted: 0, contracted: 0, received: 0, outstanding: 0, overdue: 0 };
                    item.count += 1; item.granted += row.grantedMinor; item.contracted += row.contractedInterestMinor; item.received += interestPaid.get(row.id) || 0;
                    item.outstanding += row.outstandingMinor; if (row.daysOverdue > 30) item.overdue += row.outstandingMinor;
                    map.set(by(row), item);
                }
                return [...map.entries()].sort((a, b) => b[1].received - a[1].received).map(([name, item]) => [name, item.count, kz(item.granted), kz(item.contracted), kz(item.received),
                    item.granted ? `${(item.received / item.granted * 100).toFixed(1).replace('.', ',')}%` : '—', kz(item.outstanding), item.outstanding ? `${(item.overdue / item.outstanding * 100).toFixed(1).replace('.', ',')}%` : '—'] as Cell[]);
            };
            const head = ['', 'Créditos', 'Capital concedido', 'Juros contratados', 'Juros recebidos', 'Rendimento s/ capital', 'Capital em dívida', 'PAR30'];
            sections = [
                { heading: 'Por produto', head: ['Produto', ...head.slice(1)], numeric: [1], money: [2, 3, 4, 6], rows: group(row => row.product) },
                { heading: 'Por gestor', head: ['Gestor', ...head.slice(1)], numeric: [1], money: [2, 3, 4, 6], rows: group(row => row.managerName) },
            ];
            summary = [['Juros recebidos (total)', money([...interestPaid.values()].reduce((sum, value) => sum + value, 0))]];
            break;
        }
        case 'extrato': {
            const row = input.rows.find(item => item.id === input.creditId);
            if (!row) throw new Error('Escolha o crédito para o extrato.');
            subtitle = `${row.reference} · ${row.clientName} · ${label(input.todayKey)}`;
            orientation = 'portrait';
            const plan = input.installments.filter(item => item.creditId === row.id && real(item)).sort((a, b) => a.installmentNumber - b.installmentNumber);
            const paid = input.payments.filter(payment => payment.creditId === row.id && payment.status === 'confirmed' && !payment.deletedAt).sort((a, b) => String(a.paymentDate).localeCompare(String(b.paymentDate)));
            summary = [['Capital concedido', money(row.grantedMinor)], ['TAN', `${row.rate.toLocaleString('pt-AO')}%`], ['Capital em dívida', money(row.outstandingMinor)],
                ['Próxima prestação', row.nextDueKey ? `${label(row.nextDueKey)} · ${money(row.nextDueMinor)}` : '—'], ['Dias de atraso', String(row.daysOverdue)], ['Mora por pagar', money(row.moraMinor)], ['Estado', STAGES[row.stage].label]];
            sections = [
                { heading: 'Plano de prestações', head: ['N.º', 'Vencimento', 'Capital', 'Juros', 'Prestação', 'Pago', 'Situação'], numeric: [0], money: [2, 3, 4, 5],
                    rows: plan.map(item => {
                        const due = luandaDateKey(item.dueDate);
                        const total = Number(item.principalMinor) + Number(item.interestMinor);
                        const paidMinor = Number(item.paidPrincipalMinor) + Number(item.paidInterestMinor);
                        return [item.installmentNumber, label(due), kz(Number(item.principalMinor)), kz(Number(item.interestMinor)), kz(total), kz(paidMinor),
                            paidMinor >= total ? 'Paga' : due < input.todayKey ? 'Em atraso' : paidMinor > 0 ? 'Parcial' : 'Por vencer'];
                    }) },
                { heading: 'Pagamentos', head: ['Data-valor', 'Recibo', 'Valor', 'Capital', 'Juros', 'Mora'], money: [2, 3, 4, 5],
                    rows: paid.map(payment => [formatLuandaDate(payment.paymentDate), payment.receiptYear && payment.receiptSeq ? `RC ${payment.receiptYear}/${String(payment.receiptSeq).padStart(6, '0')}` : '—',
                        Number(payment.amount), Number(payment.allocatedToPrincipal || 0), Number(payment.allocatedToInterest || 0), Number(payment.allocatedToLateInterest || 0)]), emptyText: 'Ainda sem pagamentos.' },
            ];
            break;
        }
    }
    return { key: `creditos-${key}`, title: info.title, subtitle, orientation, fileBase: `creditos-${key}`, summary, sections, tagline: 'CARTEIRA DE CRÉDITO' };
}
