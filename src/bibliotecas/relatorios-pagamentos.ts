// Relatórios da página de Pagamentos. Cada relatório é descrito uma única vez (secções, colunas, totais) e
// desenhado em PDF (A4 com o cabeçalho da empresa, páginas numeradas e "Gerado por") e em Excel (filtros
// activos, totais e colunas em Kz). Os números saem das mesmas linhas, por isso coincidem nos dois formatos.
import * as XLSX from 'xlsx';
import jsPDF from '@/bibliotecas/pdf-documento';
import autoTable from '@/bibliotecas/pdf-tabela';
import { applyBranding, brandingHeaderBottom, contentBottom, ensurePdfSpace, getCompanySettings, resolveBrandDark, resolveBrandPrimary } from './pdf';
import { formatLuandaDate, formatLuandaDateTime } from './fuso-angola';
import {
    cashCloseData, clientStatementData, computeKpis, dailySeries, formatKz, incomeMapData, methodBreakdown, monthlyListData,
    sumRows, variation, type KeyRange, type PaymentRow, type RowTotals, type ScheduleItem,
} from './pagamentos-analise';

export type ReportKey = 'lista-mensal' | 'resumo-mensal' | 'nao-pagas' | 'fecho-caixa' | 'por-metodo' | 'rendimentos' | 'anulados' | 'extrato-cliente';

export const REPORTS: Array<{ key: ReportKey; title: string; description: string }> = [
    { key: 'lista-mensal', title: 'Lista Mensal de Pagamentos', description: 'Todos os pagamentos, com subtotais por dia e por método e os anulados à parte.' },
    { key: 'resumo-mensal', title: 'Resumo Mensal de Cobrança', description: 'Indicadores, previsto vs cobrado, comparações, gráfico diário e 10 maiores pagamentos.' },
    { key: 'nao-pagas', title: 'Prestações Não Pagas no Período', description: 'Lista de trabalho da cobrança: em falta, dias de atraso, mora, telefone e gestor.' },
    { key: 'fecho-caixa', title: 'Fecho de Caixa por Operador', description: 'Pagamentos por operador e método, para conferir dinheiro e comprovativos.' },
    { key: 'por-metodo', title: 'Pagamentos por Método', description: 'Totais e número de operações por numerário, transferência, Multicaixa, etc.' },
    { key: 'rendimentos', title: 'Mapa de Rendimentos', description: 'Juros e mora cobrados por mês, para a contabilidade e efeitos fiscais.' },
    { key: 'anulados', title: 'Pagamentos Anulados e Estornados', description: 'Com motivo, quem anulou e quem aprovou.' },
    { key: 'extrato-cliente', title: 'Extrato de Pagamentos do Cliente', description: 'Todos os pagamentos de um cliente ou contrato, com o capital em dívida após cada um.' },
];

export type Cell = string | number | null;
export type Section = {
    heading?: string;
    head: string[];
    rows: Cell[][];
    foot?: Cell[][];
    /** Colunas com valores em Kz (números). */
    money?: number[];
    /** Colunas numéricas sem moeda (contagens, dias, percentagens). */
    numeric?: number[];
    widths?: Record<number, number>;
    emptyText?: string;
};
export type ReportDef = {
    key: ReportKey | string;
    title: string;
    subtitle: string;
    orientation: 'portrait' | 'landscape';
    fileBase: string;
    summary?: Array<[string, string]>;
    chart?: { title: string; points: Array<{ label: string; value: number; line: number }> };
    sections: Section[];
    /** Nota no rodapé de cada página (ex.: hash do relatório para provar que não foi alterado). */
    footerNote?: string;
    /** Linha por baixo do nome da empresa no cabeçalho. */
    tagline?: string;
};

export type ReportInput = {
    rows: PaymentRow[];
    schedule: ScheduleItem[];
    range: KeyRange;
    previousRange: KeyRange;
    lastYearRange: KeyRange;
    periodLabel: string;
    filters: string[];
    today: string;
    numbers: Map<string, string>;
    phones: Map<string, string>;
    managers: Map<string, string>;
    statement?: { clientId?: string; creditId?: string; label: string };
};

const dateText = (key: string) => key ? `${key.slice(8, 10)}/${key.slice(5, 7)}/${key.slice(0, 4)}` : '-';
const pct = (value: number | null) => value === null ? 'n.d.' : `${value.toFixed(1).replace('.', ',')}%`;
const delta = (value: number | null) => value === null ? 'n.d.' : `${value > 0 ? '+' : ''}${value.toFixed(1).replace('.', ',')}%`;
const totalsRow = (label: string, totals: RowTotals, before: number, after = 0): Cell[] =>
    [label, ...Array(before - 1).fill(''), totals.principal, totals.interest, totals.late, totals.total, ...Array(after).fill('')];

const paymentLine = (row: PaymentRow): Cell[] => [
    row.receipt || 'Por validar', dateText(row.valueDateKey), row.clientName, row.contract, row.installmentsLabel,
    row.principal, row.interest, row.late, row.total, row.methodLabel, row.operator, row.statusLabel,
];
const PAYMENT_HEAD = ['Recibo', 'Data-valor', 'Cliente', 'Contrato', 'Prestações', 'Capital', 'Juros', 'Mora', 'Total', 'Método', 'Operador', 'Estado'];
const PAYMENT_WIDTHS = { 0: 24, 1: 17, 3: 22, 4: 16, 5: 23, 6: 21, 7: 19, 8: 24, 9: 22, 10: 24, 11: 20 };

// ── Definições ───────────────────────────────────────────────────────────────────────
export function buildReport(key: ReportKey, input: ReportInput): ReportDef {
    const subtitle = `${input.periodLabel}${input.filters.length ? ` · ${input.filters.join(' · ')}` : ''}`;
    const base = { key, title: REPORTS.find(item => item.key === key)!.title, subtitle };
    const inRange = (row: PaymentRow) => !input.range || (row.valueDateKey >= input.range.start && row.valueDateKey <= input.range.end);
    switch (key) {
        case 'lista-mensal': {
            const data = monthlyListData(input.rows, input.range);
            return {
                ...base, orientation: 'landscape', fileBase: 'lista-mensal-pagamentos',
                summary: [['Pagamentos confirmados', String(data.totals.count)], ['Total arrecadado', formatKz(data.totals.total)],
                    ['Capital', formatKz(data.totals.principal)], ['Juros', formatKz(data.totals.interest)], ['Juros de mora', formatKz(data.totals.late)],
                    ['Pendentes de validação', `${data.pending.length} (${formatKz(sumRows(data.pending).total)})`], ['Anulados', `${data.cancelled.length} (${formatKz(sumRows(data.cancelled).total)})`]],
                sections: [
                    { heading: 'Pagamentos do período', head: PAYMENT_HEAD, rows: data.rows.map(paymentLine), money: [5, 6, 7, 8], widths: PAYMENT_WIDTHS,
                        foot: [totalsRow('Total geral (confirmados)', data.totals, 5, 3)], emptyText: 'Sem pagamentos no período.' },
                    { heading: 'Subtotais por dia', head: ['Dia', 'N.º', 'Capital', 'Juros', 'Mora', 'Total'], money: [2, 3, 4, 5], numeric: [1],
                        rows: data.days.map(day => [dateText(day.key), day.totals.count, day.totals.principal, day.totals.interest, day.totals.late, day.totals.total]),
                        foot: [['Total', data.totals.count, data.totals.principal, data.totals.interest, data.totals.late, data.totals.total]] },
                    { heading: 'Subtotais por método', head: ['Método', 'N.º', 'Capital', 'Juros', 'Mora', 'Total'], money: [2, 3, 4, 5], numeric: [1],
                        rows: data.methods.map(item => [item.label, item.totals.count, item.totals.principal, item.totals.interest, item.totals.late, item.totals.total]),
                        foot: [['Total', data.totals.count, data.totals.principal, data.totals.interest, data.totals.late, data.totals.total]] },
                    { heading: 'Pagamentos anulados (não contam no total)', head: [...PAYMENT_HEAD.slice(0, 4), 'Total', 'Motivo', 'Anulado por', 'Aprovado por'], money: [4],
                        rows: data.cancelled.map(row => [row.receipt || '-', dateText(row.valueDateKey), row.clientName, row.contract, row.total, row.payment.cancelReason || '-', row.payment.cancelledBy || '-', row.payment.cancelApprovedBy || '-']),
                        emptyText: 'Nenhum pagamento anulado no período.' },
                ],
            };
        }
        case 'resumo-mensal': {
            const context = { today: input.today, phones: input.phones, managers: input.managers, numbers: input.numbers };
            const current = computeKpis(input.rows, input.schedule, input.range, context);
            const previous = computeKpis(input.rows, input.schedule, input.previousRange, context);
            const lastYear = computeKpis(input.rows, input.schedule, input.lastYearRange, context);
            const top = input.rows.filter(row => row.status === 'confirmed' && inRange(row)).sort((a, b) => b.total - a.total).slice(0, 10);
            const compare = (label: string, pick: (k: typeof current) => number, money = true): Cell[] => [
                label, money ? pick(current) : pick(current), money ? pick(previous) : pick(previous), delta(variation(pick(current), pick(previous))),
                money ? pick(lastYear) : pick(lastYear), delta(variation(pick(current), pick(lastYear))),
            ];
            return {
                ...base, orientation: 'portrait', fileBase: 'resumo-mensal-cobranca',
                summary: [['Valor arrecadado', formatKz(current.collected)], ['Previsto no período', formatKz(current.expected)],
                    ['Taxa de cobrança', pct(current.rate)], ['N.º de pagamentos', String(current.count)], ['Juros cobrados', formatKz(current.interest)],
                    ['Juros de mora cobrados', formatKz(current.late)], ['Capital amortizado', formatKz(current.principal)], ['Valor médio por pagamento', formatKz(current.average)],
                    ['Em falta no período', `${formatKz(current.missingAmount)} (${current.missingClients} cliente(s))`], ['Pendentes de validação', formatKz(current.pendingAmount)]],
                chart: { title: 'Cobrado por dia (barras) e acumulado (linha)', points: dailySeries(input.rows, input.schedule, input.range).map(point => ({ label: point.label, value: point.collected, line: point.cumulative })) },
                sections: [
                    { heading: 'Comparação com o período anterior e com o mesmo período do ano anterior',
                        head: ['Indicador', 'Este período', 'Anterior', 'Variação', 'Ano anterior', 'Variação'], money: [1, 2, 4],
                        rows: [compare('Valor arrecadado', k => k.collected), compare('Previsto', k => k.expected), compare('Juros cobrados', k => k.interest),
                            compare('Juros de mora', k => k.late), compare('Capital amortizado', k => k.principal),
                            ['Taxa de cobrança', pct(current.rate), pct(previous.rate), current.rate !== null && previous.rate !== null ? delta(Math.round((current.rate - previous.rate) * 10) / 10) : 'n.d.', pct(lastYear.rate), current.rate !== null && lastYear.rate !== null ? delta(Math.round((current.rate - lastYear.rate) * 10) / 10) : 'n.d.'],
                            ['N.º de pagamentos', String(current.count), String(previous.count), delta(variation(current.count, previous.count)), String(lastYear.count), delta(variation(current.count, lastYear.count))]] },
                    { heading: 'Os 10 maiores pagamentos', head: ['Recibo', 'Data-valor', 'Cliente', 'Contrato', 'Método', 'Total'], money: [5],
                        rows: top.map(row => [row.receipt, dateText(row.valueDateKey), row.clientName, row.contract, row.methodLabel, row.total]), emptyText: 'Sem pagamentos no período.' },
                ],
            };
        }
        case 'nao-pagas': {
            const kpis = computeKpis(input.rows, input.schedule, input.range, { today: input.today, phones: input.phones, managers: input.managers, numbers: input.numbers });
            const missingTotal = kpis.missing.reduce((sum, item) => sum + Math.round(item.missing * 100), 0) / 100;
            const lateTotal = kpis.missing.reduce((sum, item) => sum + Math.round(item.late * 100), 0) / 100;
            return {
                ...base, orientation: 'landscape', fileBase: 'prestacoes-nao-pagas',
                summary: [['Prestações em falta', String(kpis.missing.length)], ['Clientes', String(kpis.missingClients)], ['Valor em falta', formatKz(missingTotal)], ['Mora acumulada', formatKz(lateTotal)]],
                sections: [{
                    heading: 'Lista de trabalho da cobrança (mais atrasadas primeiro)',
                    head: ['Cliente', 'Telefone', 'Contrato', 'Prest.', 'Vencimento', 'Dias de atraso', 'Em falta', 'Mora acumulada', 'Gestor'],
                    money: [6, 7], numeric: [3, 5], widths: { 1: 26, 2: 24, 3: 13, 4: 21, 5: 18, 6: 27, 7: 25, 8: 34 },
                    rows: kpis.missing.map(item => [item.clientName, item.phone || '-', item.contract, `${item.number}.ª`, dateText(item.dueDateKey), item.daysLate, item.missing, item.late, item.manager || '-']),
                    foot: [['Total', '', '', '', '', '', missingTotal, lateTotal, '']], emptyText: 'Não há prestações vencidas por pagar no período.',
                }],
            };
        }
        case 'fecho-caixa': {
            const operators = cashCloseData(input.rows, input.range);
            const all = sumRows(operators.flatMap(item => item.rows.filter(row => row.status === 'confirmed')));
            return {
                ...base, orientation: 'portrait', fileBase: 'fecho-caixa-operador',
                summary: [['Operadores', String(operators.length)], ['Total confirmado', formatKz(all.total)], ['N.º de operações', String(all.count)]],
                sections: [
                    { heading: 'Resumo por operador e método', head: ['Operador', 'Método', 'N.º', 'Total'], money: [3], numeric: [2],
                        rows: operators.flatMap(item => [...item.methods.map(method => [item.operator, method.label, method.count, method.amount] as Cell[]),
                            [`Subtotal ${item.operator}`, '', item.totals.count, item.totals.total],
                            ...(item.pending.count ? [[`${item.operator} (pendentes de validação)`, 'Transferência/depósito', item.pending.count, item.pending.total] as Cell[]] : [])]),
                        foot: [['Total geral', '', all.count, all.total]], emptyText: 'Sem pagamentos no período.' },
                    { heading: 'Detalhe dos pagamentos', head: ['Operador', 'Recibo', 'Data-valor', 'Cliente', 'Método', 'Referência', 'Total', 'Estado'], money: [6],
                        rows: operators.flatMap(item => item.rows.map(row => [row.operator, row.receipt || 'Por validar', dateText(row.valueDateKey), row.clientName, row.methodLabel, row.reference || '-', row.total, row.statusLabel])) },
                ],
            };
        }
        case 'por-metodo': {
            const confirmed = input.rows.filter(row => row.status === 'confirmed' && inRange(row));
            const methods = methodBreakdown(confirmed);
            const total = sumRows(confirmed).total;
            return {
                ...base, orientation: 'portrait', fileBase: 'pagamentos-por-metodo',
                summary: [['Total arrecadado', formatKz(total)], ['N.º de operações', String(confirmed.length)]],
                sections: [{ heading: 'Totais por método', head: ['Método', 'N.º de operações', 'Total', '% do total'], money: [2], numeric: [1, 3],
                    rows: methods.map(item => [item.label, item.count, item.amount, pct(total ? Math.round((item.amount / total) * 1000) / 10 : 0)]),
                    foot: [['Total', confirmed.length, total, total ? '100,0%' : '0,0%']], emptyText: 'Sem pagamentos no período.' }],
            };
        }
        case 'rendimentos': {
            const year = Number((input.range?.start || input.today).slice(0, 4));
            const months = incomeMapData(input.rows, year);
            const sum = (pick: (m: typeof months[number]) => number) => Math.round(months.reduce((total, month) => total + Math.round(pick(month) * 100), 0)) / 100;
            return {
                ...base, subtitle: `Ano de ${year}${input.filters.length ? ` · ${input.filters.join(' · ')}` : ''}`, orientation: 'portrait', fileBase: `mapa-rendimentos-${year}`,
                summary: [['Juros cobrados no ano', formatKz(sum(m => m.interest))], ['Juros de mora no ano', formatKz(sum(m => m.late))], ['Total de rendimentos', formatKz(sum(m => m.income))]],
                sections: [{ heading: `Rendimentos cobrados por mês (${year})`, head: ['Mês', 'N.º pagamentos', 'Juros', 'Juros de mora', 'Total de rendimentos', 'Capital recebido'],
                    money: [2, 3, 4, 5], numeric: [1],
                    rows: months.map(month => [month.month, month.count, month.interest, month.late, month.income, month.principal]),
                    foot: [['Total', months.reduce((total, month) => total + month.count, 0), sum(m => m.interest), sum(m => m.late), sum(m => m.income), sum(m => m.principal)]] }],
            };
        }
        case 'anulados': {
            const cancelled = input.rows.filter(row => row.status === 'cancelled' && inRange(row));
            const totals = sumRows(cancelled);
            return {
                ...base, orientation: 'landscape', fileBase: 'pagamentos-anulados',
                summary: [['Pagamentos anulados', String(totals.count)], ['Valor estornado', formatKz(totals.total)]],
                sections: [{ heading: 'Anulações e estornos', head: ['Recibo', 'Data-valor', 'Cliente', 'Contrato', 'Valor', 'Anulado em', 'Motivo', 'Anulado por', 'Aprovado por'],
                    money: [4], widths: { 0: 24, 1: 18, 3: 22, 4: 24, 5: 26, 7: 28, 8: 28 },
                    rows: cancelled.map(row => [row.receipt || 'Sem recibo (pendente)', dateText(row.valueDateKey), row.clientName, row.contract, row.total,
                        formatLuandaDateTime(row.payment.cancelledAt), row.payment.cancelReason || '-', row.payment.cancelledBy || '-', row.payment.cancelApprovedBy || 'Não exigida']),
                    foot: [['Total', '', '', '', totals.total, '', '', '', '']], emptyText: 'Nenhum pagamento anulado no período.' }],
            };
        }
        case 'extrato-cliente': {
            const rows = clientStatementData(input.rows, input.statement || {});
            const confirmed = sumRows(rows.filter(row => row.status === 'confirmed'));
            return {
                ...base, subtitle: `${input.statement?.label || 'Todos os clientes'} · todos os pagamentos registados`, orientation: 'landscape', fileBase: 'extrato-pagamentos-cliente',
                summary: [['Pagamentos confirmados', String(confirmed.count)], ['Total pago', formatKz(confirmed.total)], ['Capital amortizado', formatKz(confirmed.principal)],
                    ['Juros + mora', formatKz(Math.round((confirmed.interest + confirmed.late) * 100) / 100)]],
                sections: [{ heading: 'Extrato', head: ['Data-valor', 'Recibo', 'Contrato', 'Prestações', 'Capital', 'Juros', 'Mora', 'Total', 'Capital em dívida após', 'Estado'],
                    money: [4, 5, 6, 7, 8], widths: { 0: 18, 1: 25, 2: 22, 3: 18, 9: 24 },
                    rows: rows.map(row => [dateText(row.valueDateKey), row.receipt || 'Por validar', row.contract, row.installmentsLabel, row.principal, row.interest, row.late, row.total,
                        row.balanceAfter === null ? '-' : row.balanceAfter, row.statusLabel]),
                    foot: [['Total (confirmados)', '', '', '', confirmed.principal, confirmed.interest, confirmed.late, confirmed.total, '', '']], emptyText: 'Sem pagamentos para este cliente.' }],
            };
        }
    }
}

// ── PDF ──────────────────────────────────────────────────────────────────────────────
const pdfSafe = (value: string) => Array.from(String(value ?? ''), char => {
    const code = char.codePointAt(0) ?? 0;
    if (code === 0x2014 || code === 0x2013) return '-';
    if (code === 0x2026) return '...';
    return code > 0xFF ? '' : char;
}).join('');
const cellText = (value: Cell, money: boolean) => value === null || value === undefined ? '' : money && typeof value === 'number' ? formatKz(value) : pdfSafe(String(value));

function drawChart(doc: jsPDF, x: number, y: number, width: number, height: number, chart: NonNullable<ReportDef['chart']>, color: [number, number, number]) {
    const points = chart.points;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(30, 41, 59);
    doc.text(pdfSafe(chart.title), x, y);
    const top = y + 4;
    const plotHeight = height - 12;
    const bottom = top + plotHeight;
    const maxBar = Math.max(1, ...points.map(point => point.value));
    const maxLine = Math.max(1, ...points.map(point => point.line));
    doc.setDrawColor(203, 213, 225); doc.setLineWidth(0.2);
    doc.line(x, bottom, x + width, bottom);
    if (!points.length) return y + height;
    const step = width / points.length;
    const barWidth = Math.min(3.6, step * 0.62);
    doc.setFillColor(color[0], color[1], color[2]);
    points.forEach((point, index) => {
        const h = (point.value / maxBar) * (plotHeight - 2);
        if (h > 0.05) doc.rect(x + index * step + (step - barWidth) / 2, bottom - h, barWidth, h, 'F');
    });
    doc.setDrawColor(15, 23, 42); doc.setLineWidth(0.45);
    for (let index = 1; index < points.length; index++) {
        const x1 = x + (index - 1) * step + step / 2;
        const x2 = x + index * step + step / 2;
        doc.line(x1, bottom - (points[index - 1].line / maxLine) * (plotHeight - 2), x2, bottom - (points[index].line / maxLine) * (plotHeight - 2));
    }
    doc.setFont('helvetica', 'normal'); doc.setFontSize(5.6); doc.setTextColor(100, 116, 139);
    const every = Math.max(1, Math.ceil(points.length / 16));
    points.forEach((point, index) => { if (index % every === 0) doc.text(point.label, x + index * step + step / 2, bottom + 3, { align: 'center' }); });
    doc.text(pdfSafe(`Máx. diário ${formatKz(maxBar)} · acumulado ${formatKz(points[points.length - 1].line)}`), x, bottom + 7.5);
    return bottom + 9;
}

export function renderReportPdf(def: ReportDef, settings: any, userName: string, output: 'save' | 'datauri' | 'none' = 'datauri') {
    const doc = new jsPDF({ orientation: def.orientation });
    const config = getCompanySettings(settings);
    const primary = resolveBrandPrimary(config.primaryColor);
    const dark = resolveBrandDark(config.secondaryColor);
    applyBranding(doc, config, userName, false, { tagline: def.tagline || 'RELATÓRIOS DE PAGAMENTOS' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 14;
    let y = brandingHeaderBottom(doc) + 9;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.setTextColor(dark[0], dark[1], dark[2]);
    const title = doc.splitTextToSize(pdfSafe(def.title.toUpperCase()), pageWidth - margin * 2) as string[];
    doc.text(title, margin, y);
    y += title.length * 5.8;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.4); doc.setTextColor(71, 85, 105);
    const subtitle = doc.splitTextToSize(pdfSafe(def.subtitle), pageWidth - margin * 2) as string[];
    doc.text(subtitle, margin, y);
    y += subtitle.length * 3.7;
    doc.text(pdfSafe(`Gerado por ${userName || 'Sistema'} em ${formatLuandaDateTime(new Date())} (hora de Angola)`), margin, y);
    y += 5;

    if (def.summary?.length) {
        const pairs: string[][] = [];
        for (let index = 0; index < def.summary.length; index += 2) {
            const [a, b] = [def.summary[index], def.summary[index + 1]];
            pairs.push([pdfSafe(a[0]), pdfSafe(a[1]), b ? pdfSafe(b[0]) : '', b ? pdfSafe(b[1]) : '']);
        }
        autoTable(doc, {
            startY: y, margin: { left: margin, right: margin }, body: pairs, theme: 'grid',
            styles: { fontSize: 8, cellPadding: 1.7, textColor: [30, 41, 59], lineColor: [226, 232, 240] },
            columnStyles: { 0: { fillColor: [248, 250, 252], fontStyle: 'bold' }, 1: { halign: 'right' }, 2: { fillColor: [248, 250, 252], fontStyle: 'bold' }, 3: { halign: 'right' } },
            didDrawPage: hook => { if (hook.pageNumber > 1) applyBranding(doc, config, userName, true); },
        });
        y = (doc as any).lastAutoTable.finalY + 6;
    }

    if (def.chart) {
        y = ensurePdfSpace(doc, y, 62, config, userName);
        y = drawChart(doc, margin, y, pageWidth - margin * 2, 58, def.chart, primary) + 4;
    }

    for (const section of def.sections) {
        y = ensurePdfSpace(doc, y, 22, config, userName);
        if (section.heading) {
            doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(primary[0], primary[1], primary[2]);
            doc.text(pdfSafe(section.heading), margin, y);
            y += 2.5;
        }
        const money = new Set(section.money || []);
        const numeric = new Set(section.numeric || []);
        const columnStyles: Record<number, any> = {};
        section.head.forEach((_, index) => {
            const style: any = {};
            if (money.has(index) || numeric.has(index)) style.halign = 'right';
            if (section.widths?.[index]) style.cellWidth = section.widths[index];
            if (Object.keys(style).length) columnStyles[index] = style;
        });
        const body = section.rows.length ? section.rows.map(row => row.map((cell, index) => cellText(cell, money.has(index))))
            : [[{ content: pdfSafe(section.emptyText || 'Sem registos.'), colSpan: section.head.length, styles: { halign: 'center', textColor: [100, 116, 139], fontStyle: 'italic' } } as any]];
        autoTable(doc, {
            startY: y, margin: { left: margin, right: margin },
            head: [section.head.map(pdfSafe)],
            body,
            foot: section.foot?.map(row => row.map((cell, index) => cellText(cell, money.has(index)))),
            showFoot: 'lastPage',
            theme: 'striped',
            styles: { fontSize: def.orientation === 'landscape' ? 7.2 : 7.6, cellPadding: 1.5, overflow: 'linebreak', textColor: [30, 41, 59] },
            headStyles: { fillColor: [dark[0], dark[1], dark[2]], textColor: [255, 255, 255], fontStyle: 'bold' },
            footStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold' },
            columnStyles,
            didDrawPage: hook => { if (hook.pageNumber > 1) applyBranding(doc, config, userName, true); },
        });
        y = (doc as any).lastAutoTable.finalY + 7;
    }

    // Numeração das páginas (entre o conteúdo e os contactos do rodapé).
    const pages = doc.getNumberOfPages();
    for (let page = 1; page <= pages; page++) {
        doc.setPage(page);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(100, 116, 139);
        doc.text(`Página ${page} de ${pages}`, pageWidth - margin, contentBottom(doc) + 5.4, { align: 'right' });
        if (def.footerNote) {
            doc.setFontSize(6.2);
            const room = pageWidth - margin * 2 - doc.getTextWidth(`Página ${pages} de ${pages}`) - 8;
            let note = pdfSafe(def.footerNote);
            while (note.length > 8 && doc.getTextWidth(note) > room) note = note.slice(0, -2);
            doc.text(note, margin, contentBottom(doc) + 5.4);
        }
    }
    const fileName = `${def.fileBase}-${(def.subtitle.split(' · ')[0] || '').normalize('NFD').replace(/\p{M}/gu, '').replace(/[^\w]+/g, '-').toLowerCase().replace(/^-|-$/g, '')}.pdf`;
    if (output === 'save') doc.save(fileName);
    return { fileName, dataUrl: output === 'datauri' ? doc.output('datauristring') as string : '', doc };
}

// ── Excel ────────────────────────────────────────────────────────────────────────────
const KZ_FORMAT = '#,##0.00 "Kz"';

export function buildReportWorkbook(def: ReportDef, settings: any, userName: string) {
    const config = getCompanySettings(settings);
    const rows: Cell[][] = [
        [def.title], [config.name || ''], [def.subtitle], [`Gerado por ${userName || 'Sistema'} em ${formatLuandaDateTime(new Date())} (hora de Angola)`], [],
    ];
    const moneyCells: Array<[number, number]> = [];
    const boldRows: number[] = [0];
    let autofilter: string | null = null;
    if (def.summary?.length) {
        rows.push(['Resumo']); boldRows.push(rows.length - 1);
        for (const [label, value] of def.summary) rows.push([label, value]);
        rows.push([]);
    }
    for (const section of def.sections) {
        if (section.heading) { rows.push([section.heading]); boldRows.push(rows.length - 1); }
        rows.push(section.head); boldRows.push(rows.length - 1);
        const headerRow = rows.length - 1;
        const money = new Set(section.money || []);
        const push = (row: Cell[], bold = false) => {
            rows.push(row.map(cell => cell === null ? '' : cell));
            const index = rows.length - 1;
            row.forEach((cell, column) => { if (money.has(column) && typeof cell === 'number') moneyCells.push([index, column]); });
            if (bold) boldRows.push(index);
        };
        if (!section.rows.length) rows.push([section.emptyText || 'Sem registos.']);
        section.rows.forEach(row => push(row));
        if (!autofilter && section.rows.length) autofilter = XLSX.utils.encode_range({ s: { r: headerRow, c: 0 }, e: { r: rows.length - 1, c: section.head.length - 1 } });
        section.foot?.forEach(row => push(row, true));
        rows.push([]);
    }
    const sheet = XLSX.utils.aoa_to_sheet(rows);
    for (const [r, c] of moneyCells) {
        const ref = XLSX.utils.encode_cell({ r, c });
        if (sheet[ref]) sheet[ref].z = KZ_FORMAT;
    }
    for (const r of boldRows) {
        for (let c = 0; c < 14; c++) {
            const ref = XLSX.utils.encode_cell({ r, c });
            if (sheet[ref]) sheet[ref].s = { font: { bold: true } };
        }
    }
    const widest = Math.max(...def.sections.map(section => section.head.length), 2);
    sheet['!cols'] = Array.from({ length: widest }, (_, column) => ({
        wch: Math.min(48, Math.max(12, ...rows.slice(5).map(row => String(row[column] ?? '').length + 3))),
    }));
    if (autofilter) sheet['!autofilter'] = { ref: autofilter };
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, def.title.slice(0, 31).replace(/[\\/?*[\]:]/g, ' '));
    return book;
}

export function renderReportExcel(def: ReportDef, settings: any, userName: string, output: 'save' | 'datauri' = 'datauri') {
    const book = buildReportWorkbook(def, settings, userName);
    const fileName = `${def.fileBase}-${(def.subtitle.split(' · ')[0] || '').normalize('NFD').replace(/\p{M}/gu, '').replace(/[^\w]+/g, '-').toLowerCase().replace(/^-|-$/g, '')}.xlsx`;
    const base64 = XLSX.write(book, { type: 'base64', bookType: 'xlsx' }) as string;
    const dataUrl = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${base64}`;
    if (output === 'save') downloadDataUrl(dataUrl, fileName);
    return { fileName, dataUrl, book };
}

export function dataUrlToBlob(dataUrl: string) {
    const [meta, data] = dataUrl.split(',');
    const mime = /data:([^;]+)/.exec(meta)?.[1] || 'application/octet-stream';
    const binary = atob(data || '');
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
    return new Blob([bytes], { type: mime });
}

export function downloadDataUrl(dataUrl: string, fileName: string) {
    const url = URL.createObjectURL(dataUrlToBlob(dataUrl));
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

// ── Modelo de importação (com instruções e validações nas colunas) ──────────────────
/** Acrescenta validações de dados ao XML da folha (o SheetJS não as escreve). */
function injectValidations(bytes: Uint8Array, sheetPath: string, validations: string): Uint8Array {
    const cfb = XLSX.CFB.read(bytes, { type: 'array' });
    const entry = XLSX.CFB.find(cfb, sheetPath);
    if (!entry?.content) return bytes;
    const xml = new TextDecoder().decode(entry.content as Uint8Array);
    const block = `<dataValidations count="${(validations.match(/<dataValidation /g) || []).length}">${validations}</dataValidations>`;
    const patched = xml.includes('<pageMargins') ? xml.replace('<pageMargins', `${block}<pageMargins`) : xml.replace('</worksheet>', `${block}</worksheet>`);
    entry.content = new TextEncoder().encode(patched) as any;
    entry.size = (entry.content as Uint8Array).length;
    return XLSX.CFB.write(cfb, { fileType: 'zip', type: 'array' }) as Uint8Array;
}

export function buildImportTemplate(examples: Array<{ contract: string }>) {
    const head = ['Contrato', 'Data-valor (AAAA-MM-DD)', 'Valor (Kz)', 'Método', 'Referência'];
    const sample = examples.slice(0, 3).map((item, index) => [item.contract, '', index === 0 ? 25000 : '', index === 0 ? 'Numerário' : '', '']);
    const data = XLSX.utils.aoa_to_sheet([head, ...(sample.length ? sample : [['CR-2026-0001', '', 25000, 'Numerário', '']])]);
    data['!cols'] = [{ wch: 18 }, { wch: 24 }, { wch: 16 }, { wch: 26 }, { wch: 28 }];
    for (let r = 1; r <= 500; r++) {
        const ref = XLSX.utils.encode_cell({ r, c: 2 });
        if (data[ref]) data[ref].z = KZ_FORMAT;
    }
    const instructions = XLSX.utils.aoa_to_sheet([
        ['Instruções de importação de pagamentos'],
        [],
        ['1. Preencha uma linha por pagamento na folha «Pagamentos». Não altere os títulos das colunas.'],
        ['2. Contrato: número curto (ex.: CR-2026-0001) tal como aparece na página de Pagamentos.'],
        ['3. Data-valor: dia em que o cliente pagou, no formato AAAA-MM-DD. Não pode ser futura nem cair num mês fechado.'],
        ['4. Valor (Kz): número maior que zero, sem exceder a dívida do contrato.'],
        ['5. Método: Numerário, Transferência, Depósito, Multicaixa, TPA ou Referência.'],
        ['6. Transferências e depósitos entram como «Pendente de validação» até alguém confirmar a entrada no banco.'],
        ['7. Antes de importar, o sistema mostra cada linha: verde = válida, amarelo = aviso (ex.: possível duplicado), vermelho = erro.'],
        ['8. Só as linhas válidas são importadas. Cada importação forma um lote que pode ser anulado por inteiro, com motivo.'],
    ]);
    instructions['!cols'] = [{ wch: 110 }];
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, data, 'Pagamentos');
    XLSX.utils.book_append_sheet(book, instructions, 'Instruções');
    const bytes = new Uint8Array(XLSX.write(book, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer);
    const validations = [
        '<dataValidation type="list" allowBlank="1" showErrorMessage="1" errorTitle="Método inválido" error="Escolha um método da lista." sqref="D2:D500"><formula1>"Numerário,Transferência,Depósito,Multicaixa,TPA,Referência"</formula1></dataValidation>',
        '<dataValidation type="decimal" operator="greaterThan" allowBlank="1" showErrorMessage="1" errorTitle="Valor inválido" error="O valor tem de ser maior que zero." sqref="C2:C500"><formula1>0</formula1></dataValidation>',
        '<dataValidation type="textLength" operator="between" allowBlank="1" showInputMessage="1" promptTitle="Data-valor" prompt="Formato AAAA-MM-DD, por exemplo 2026-10-04." sqref="B2:B500"><formula1>10</formula1><formula2>10</formula2></dataValidation>',
        '<dataValidation type="textLength" operator="between" allowBlank="1" showErrorMessage="1" errorTitle="Contrato" error="Indique o número do contrato (ex.: CR-2026-0001)." sqref="A2:A500"><formula1>4</formula1><formula2>40</formula2></dataValidation>',
    ].join('');
    try { return injectValidations(bytes, 'xl/worksheets/sheet1.xml', validations); } catch { return bytes; }
}

export async function readImportFile(file: File): Promise<Array<Record<string, unknown>>> {
    const buffer = await file.arrayBuffer();
    const book = XLSX.read(buffer, { type: 'array', cellDates: true });
    const sheet = book.Sheets['Pagamentos'] || book.Sheets[book.SheetNames[0]];
    return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { raw: true, defval: '' })
        .filter(row => Object.values(row).some(value => String(value ?? '').trim() !== ''));
}

export const reportFormatDate = formatLuandaDate;
