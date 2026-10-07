// Ficha de Simulação de Crédito (FTI) em PDF: identificação, características, custo do crédito, plano
// completo, incumprimento, validade, assinaturas e uma página final com os termos, as políticas e o
// enquadramento legal angolano. Número único, código de verificação e QR code em todas as fichas.

import QRCode from 'qrcode';
import jsPDF from '@/bibliotecas/pdf-documento';
import autoTable from '@/bibliotecas/pdf-tabela';
import { applyBranding, brandingHeaderBottom, getCompanySettings, resolveBrandPrimary, BRAND_CHARCOAL } from './pdf';
import { formatCurrency, formatDate, formatDateTime, formatDecimal, formatPercent } from './formatters';
import { AMORTIZATION_LABELS, GRACE_LABELS, type AmortizationSystem, type FeeMode, type FeePayment, type GraceType, type SimulationResult } from './simulador-credito';
import { RISK_LABELS } from './risco-simulacao';
import type { RiskLevel, RateType } from './config-simulador';
import {
    LEGAL_DISCLAIMER, LEGAL_REFERENCES, LEGAL_SOURCE_NOTE, SIMULATION_NOTICE, TERMS_UPDATED_AT, TERMS_VERSION,
    companyIdentity, simulationMethodology, type LegalContext,
} from './termos-legais';

export type SimulationSheet = {
    number: string;
    verificationCode: string;
    issuedAt: Date | string;
    expiresAt: Date | string;
    client: { name: string; nif?: string; phone?: string; email?: string; address?: string; income?: number; otherDebts?: number; registered: boolean };
    productName: string;
    params: {
        principal: number;
        months: number;
        system: AmortizationSystem;
        startDate: string;
        dueDay: number;
        graceMonths: number;
        graceType: GraceType;
        rateType: RateType;
        indexName?: string;
        indexValue?: number;
        spread?: number;
        /** TAN antes do ajuste por risco. */
        baseRate: number;
        riskAdjustment: number;
        annualRate: number;
        feePayment: FeePayment;
        openingFee: { mode: FeeMode; value: number };
        processingFee: number;
        insuranceRate: number;
    };
    result: SimulationResult;
    effortRate: number | null;
    effortLimit: number;
    risk: { level: RiskLevel; overridden: boolean; justification?: string };
    lateSurcharge: number;
    validityDays: number;
};

/** Os tipos de letra base do PDF só têm Latin-1: troca os caracteres tipográficos por equivalentes. */
const PDF_REPLACEMENTS: Array<[number[], string]> = [
    [[0x2014, 0x2013, 0x2212], '-'], [[0x2264], '<='], [[0x2265], '>='], [[0x2026], '...'],
    [[0x2018, 0x2019], "'"], [[0x201C, 0x201D], '"'], [[0x2022], String.fromCharCode(0xB7)], [[0x202F, 0x2009], ' '],
];
const PDF_MAP = new Map<number, string>(PDF_REPLACEMENTS.flatMap(([codes, text]) => codes.map(code => [code, text] as [number, string])));
const pdfText = (value: string) => Array.from(String(value ?? ''), char => {
    const code = char.codePointAt(0) ?? 0;
    return PDF_MAP.get(code) ?? (code > 0xFF ? '' : char);
}).join('');

const money = (value: number) => pdfText(formatCurrency(value));
const percent = (value: number | null | undefined, digits = 2) => (value === null || value === undefined || !Number.isFinite(value) ? 'n.d.' : pdfText(formatPercent(value, digits)));
const dateOf = (key: string | null | undefined) => (key ? formatDate(`${key}T12:00:00`) : '-');
const yearsText = (months: number) => {
    const years = months / 12;
    return Number.isInteger(years) ? `${years} ${years === 1 ? 'ano' : 'anos'}` : `${formatDecimal(years, 1)} anos`;
};

export async function generateSimulationSheetPdf(
    sheet: SimulationSheet,
    settings: any,
    userName: string | undefined,
    legal: LegalContext,
    output: 'save' | 'blob' | 'bytes' = 'save',
): Promise<string | ArrayBuffer | void> {
    const doc = new jsPDF();
    const config = getCompanySettings(settings);
    const primary = resolveBrandPrimary(config.primaryColor);
    const dark = BRAND_CHARCOAL;
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const left = 16;
    const width = pageWidth - left * 2;
    const bottomLimit = pageHeight - 30;
    const result = sheet.result;
    const params = sheet.params;

    applyBranding(doc, config, userName, false, { tagline: 'FICHA DE SIMULAÇÃO DE CRÉDITO' });
    let y = brandingHeaderBottom(doc) + 8;

    const newPage = () => {
        doc.addPage();
        applyBranding(doc, config, userName, true);
        y = 40;
    };
    const ensure = (height: number) => { if (y + height > bottomLimit) newPage(); };
    const lastTableY = () => ((doc as any).lastAutoTable?.finalY as number) || y;

    const section = (title: string) => {
        ensure(16);
        doc.setFillColor(primary[0], primary[1], primary[2]);
        doc.rect(left, y, 1.6, 6, 'F');
        doc.setFillColor(248, 250, 252);
        doc.rect(left + 1.6, y, width - 1.6, 6, 'F');
        doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(dark[0], dark[1], dark[2]);
        doc.text(pdfText(title.toUpperCase()), left + 4.5, y + 4.2);
        y += 9;
    };

    const paragraph = (text: string, options: { size?: number; style?: 'normal' | 'bold' | 'italic'; color?: [number, number, number]; indent?: number; gap?: number } = {}) => {
        const size = options.size ?? 8.4;
        const indent = options.indent ?? 0;
        doc.setFont('helvetica', options.style ?? 'normal'); doc.setFontSize(size);
        const color = options.color ?? [51, 65, 85];
        doc.setTextColor(color[0], color[1], color[2]);
        const lines = doc.splitTextToSize(pdfText(text), width - indent) as string[];
        const lineHeight = size * 0.43;
        for (const line of lines) {
            ensure(lineHeight + 1);
            doc.text(line, left + indent, y + lineHeight * 0.8);
            y += lineHeight;
        }
        y += options.gap ?? 1.8;
    };

    /** Pares rótulo/valor em duas colunas (quatro células por linha). */
    const pairs = (rows: Array<[string, string]>, highlight: string[] = []) => {
        const body: string[][] = [];
        for (let index = 0; index < rows.length; index += 2) {
            const a = rows[index];
            const b = rows[index + 1];
            body.push([pdfText(a[0]), pdfText(a[1]), b ? pdfText(b[0]) : '', b ? pdfText(b[1]) : '']);
        }
        autoTable(doc, {
            startY: y,
            body,
            theme: 'grid',
            margin: { left, right: left, bottom: 30 }, rowPageBreak: 'avoid',
            styles: { fontSize: 7.9, cellPadding: { top: 1.6, bottom: 1.6, left: 2, right: 2 }, lineColor: [226, 232, 240], lineWidth: 0.2, textColor: [30, 41, 59], overflow: 'linebreak' },
            columnStyles: {
                0: { fontStyle: 'bold', fillColor: [248, 250, 252], cellWidth: 37, textColor: [71, 85, 105] },
                1: { cellWidth: width / 2 - 37 },
                2: { fontStyle: 'bold', fillColor: [248, 250, 252], cellWidth: 37, textColor: [71, 85, 105] },
                3: { cellWidth: width / 2 - 37 },
            },
            didParseCell: hook => {
                if (hook.section !== 'body') return;
                const label = String(hook.row.raw && (hook.row.raw as string[])[hook.column.index === 1 ? 0 : 2]);
                if ((hook.column.index === 1 || hook.column.index === 3) && highlight.includes(label)) {
                    hook.cell.styles.fontStyle = 'bold';
                    hook.cell.styles.textColor = [primary[0], primary[1], primary[2]];
                }
            },
            didDrawPage: hook => { if (hook.pageNumber > 1) applyBranding(doc, config, userName, true); },
        });
        y = lastTableY() + 5;
    };

    // ── Título, número, validade e QR code ───────────────────────────────────────────────
    const qrSize = 24;
    const qrX = pageWidth - left - qrSize;
    const qrContent = [
        'TANGO-SIMULACAO', sheet.number, `Codigo: ${sheet.verificationCode}`, pdfText(config.name || ''),
        `Cliente: ${pdfText(sheet.client.name)}`, `Montante: ${formatDecimal(params.principal, 2)} Kz`, `Prazo: ${params.months} meses`,
        `TAN: ${formatDecimal(params.annualRate, 2)}%`, `TAEG: ${result.taeg === null ? 'n.d.' : formatDecimal(result.taeg, 2) + '%'}`,
        `Emitida: ${formatDate(sheet.issuedAt)}`, `Valida ate: ${formatDate(sheet.expiresAt)}`,
    ].join('\n');
    try {
        const qr = await QRCode.toDataURL(qrContent, { margin: 0, width: 300, errorCorrectionLevel: 'M' });
        doc.addImage(qr, 'PNG', qrX, y - 2, qrSize, qrSize);
    } catch { /* sem QR, o código de verificação continua impresso */ }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(dark[0], dark[1], dark[2]);
    doc.text(sheet.verificationCode, qrX + qrSize / 2, y + qrSize + 1.8, { align: 'center' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(5.8); doc.setTextColor(100, 116, 139);
    doc.text('Código de verificação', qrX + qrSize / 2, y + qrSize + 4.4, { align: 'center' });

    const titleWidth = width - qrSize - 6;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(13.5); doc.setTextColor(dark[0], dark[1], dark[2]);
    const titleLines = doc.splitTextToSize('FICHA DE INFORMAÇÃO DE SIMULAÇÃO DE CRÉDITO', titleWidth) as string[];
    doc.text(titleLines, left, y + 4);
    y += 4 + titleLines.length * 5.6;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(primary[0], primary[1], primary[2]);
    doc.text(`N.º ${sheet.number}`, left, y);
    y += 5;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.2); doc.setTextColor(71, 85, 105);
    doc.text(pdfText(`Emitida em ${formatDateTime(sheet.issuedAt)}${userName ? ` por ${userName}` : ''}`), left, y);
    y += 4.4;
    doc.text(pdfText(`Válida até ${formatDate(sheet.expiresAt)} (${sheet.validityDays} dias)`), left, y);
    y += 4.4;
    doc.setFont('helvetica', 'italic'); doc.setFontSize(7.8); doc.setTextColor(185, 28, 28);
    doc.text(pdfText(SIMULATION_NOTICE), left, y);
    y = Math.max(y + 6, brandingHeaderBottom(doc) + 8 + qrSize + 9);

    // ── 1. Identificação ────────────────────────────────────────────────────────────────
    section('1. Identificação da entidade e do cliente');
    pairs([
        ['Entidade', config.name || '-'], ['Cliente', sheet.client.name || '-'],
        ['NIF da entidade', config.nif || '-'], ['NIF do cliente', sheet.client.nif || '-'],
        ['Morada', [config.address, (config as any).location].filter(Boolean).join(', ') || '-'], ['Contacto do cliente', [sheet.client.phone, sheet.client.email].filter(Boolean).join(' · ') || '-'],
        ['Contactos', [config.phone, config.email].filter(Boolean).join(' · ') || '-'], ['Rendimento mensal líquido', sheet.client.income ? money(sheet.client.income) : 'Não indicado'],
        ['Cliente registado', sheet.client.registered ? 'Sim' : 'Não (simulação avulsa)'], ['Outros encargos mensais com créditos', money(sheet.client.otherDebts || 0)],
    ]);

    // ── 2. Características ──────────────────────────────────────────────────────────────
    const firstRow = result.rows.find(row => !row.grace) || result.rows[0];
    section('2. Características do crédito');
    pairs([
        ['Produto', sheet.productName], ['Montante do crédito', money(params.principal)],
        ['Prazo', `${params.months} meses (${yearsText(params.months)})`], ['Sistema de amortização', AMORTIZATION_LABELS[params.system]],
        ['Número de prestações', String(result.rows.length)], ['Carência', params.graceMonths > 0 ? `${params.graceMonths} meses — ${GRACE_LABELS[params.graceType]}` : 'Sem carência'],
        ['Data de desembolso', dateOf(params.startDate)], ['Dia de vencimento', `Dia ${params.dueDay} (ou dia útil seguinte)`],
        ['1.º vencimento', dateOf(result.firstDueDate)], ['Último vencimento', dateOf(result.lastDueDate)],
        [params.system === 'price' ? 'Prestação mensal' : '1.ª prestação (decrescente)', money(firstRow?.payment || 0)], ['Prestação sem encargos', money(result.installmentBase)],
        ['Montante a receber', money(result.netReceived)], ['Comissão de abertura e IS', params.feePayment === 'financed' ? `Financiados no capital (${money(result.upfrontCharges)})` : `Descontados no desembolso (${money(result.upfrontCharges)})`],
    ], ['Prestação mensal', '1.ª prestação (decrescente)', 'Montante a receber']);

    // ── 3. Custo do crédito ─────────────────────────────────────────────────────────────
    const regime = params.rateType === 'variable'
        ? `Variável: ${params.indexName || 'indexante'} ${percent(params.indexValue ?? 0, 3)} + spread ${formatDecimal(params.spread ?? 0, 2)} p.p.`
        : 'Fixa durante todo o contrato';
    const riskText = `${RISK_LABELS[sheet.risk.level]}${sheet.risk.overridden ? ' (alterado manualmente)' : ''}${params.riskAdjustment ? ` · ajuste ${params.riskAdjustment > 0 ? '+' : ''}${formatDecimal(params.riskAdjustment, 2)} p.p.` : ''}`;
    section('3. Custo do crédito');
    pairs([
        ['TAN (taxa anual nominal)', percent(params.annualRate)], ['Taxa mensal (TAN ÷ 12)', percent(result.monthlyRate, 4)],
        ['Regime da taxa', regime], ['TAEG', percent(result.taeg)],
        ['Comissão de abertura', `${money(result.openingFee)}${params.openingFee.mode === 'percent' ? ` (${formatDecimal(params.openingFee.value, 2)}%)` : ''}`], ['Comissões de processamento', `${money(result.totalProcessingFees)} (${money(params.processingFee)} por prestação)`],
        ['Imposto do Selo — utilização', `${money(result.stampDutyUse)} (${formatDecimal(result.stampDutyUseRate, 2)}%)`], ['Imposto do Selo — juros', money(result.totalStampDutyInterest)],
        ['Seguros', params.insuranceRate > 0 ? `${money(result.totalInsurance)} (${formatDecimal(params.insuranceRate, 3)}% ao mês)` : 'Sem seguro'], ['Total de juros', money(result.totalInterest)],
        ['Taxa de esforço', sheet.effortRate === null ? 'Rendimento não indicado' : `${percent(sheet.effortRate)} (limite ${percent(sheet.effortLimit, 0)})`], ['Nível de risco', riskText],
        ['MTIC', money(result.mtic)], ['Total das prestações', money(result.totalPayments)],
    ], ['TAEG', 'MTIC', 'TAN (taxa anual nominal)']);
    paragraph('MTIC — Montante Total Imputado ao Cliente: capital + juros + comissões + impostos + seguros. A TAEG inclui todos estes encargos e é calculada pela taxa interna de rentabilidade dos fluxos efectivos.', { size: 7.2, style: 'italic', color: [100, 116, 139] });
    if (sheet.risk.overridden && sheet.risk.justification) paragraph(`Justificação da alteração do risco: ${sheet.risk.justification}`, { size: 7.2, color: [100, 116, 139] });

    // ── 4. Plano de prestações ──────────────────────────────────────────────────────────
    section('4. Plano completo de prestações');
    const sum = (pick: (row: SimulationResult['rows'][number]) => number) => result.rows.reduce((total, row) => total + pick(row), 0);
    const plain = (value: number) => pdfText(formatDecimal(value, 2));
    autoTable(doc, {
        startY: y,
        margin: { left, right: left, bottom: 30 }, rowPageBreak: 'avoid',
        head: [['N.º', 'Vencimento', 'Capital em dívida (início)', 'Juros', 'IS s/ juros', 'Amortização de capital', 'Comissões / seguro', 'Prestação total', 'Capital em dívida (fim)']],
        body: result.rows.map(row => [
            `${row.number}${row.grace ? '*' : ''}`, dateOf(row.dueDate), plain(row.openingBalance), plain(row.interest), plain(row.stampDutyInterest),
            plain(row.amortization), plain(row.charges), plain(row.payment), plain(row.closingBalance),
        ]),
        foot: [['', 'Totais', '', plain(sum(row => row.interest)), plain(sum(row => row.stampDutyInterest)), plain(sum(row => row.amortization)), plain(sum(row => row.charges)), plain(sum(row => row.payment)), '']],
        showFoot: 'lastPage',
        theme: 'grid',
        styles: { fontSize: 6.9, cellPadding: 1.3, halign: 'right', lineColor: [226, 232, 240], lineWidth: 0.15, textColor: [30, 41, 59] },
        headStyles: { fillColor: [primary[0], primary[1], primary[2]], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center', valign: 'middle', fontSize: 6.6 },
        footStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [250, 250, 250] },
        columnStyles: { 0: { halign: 'center', cellWidth: 9 }, 1: { halign: 'center', cellWidth: 18 }, 7: { fontStyle: 'bold' } },
        didDrawPage: hook => { if (hook.pageNumber > 1) applyBranding(doc, config, userName, true); },
    });
    y = lastTableY() + 3;
    paragraph(`Valores em Kwanzas (Kz). Cada linha é arredondada a 2 casas decimais; a diferença é acertada na última prestação, pelo que o capital em dívida termina em 0,00 Kz.${result.rows.some(row => row.grace) ? ' * Prestação em período de carência.' : ''} Os vencimentos que calham em fim-de-semana ou feriado passam para o dia útil seguinte.`, { size: 7, style: 'italic', color: [100, 116, 139], gap: 4 });

    // ── 5. Incumprimento ────────────────────────────────────────────────────────────────
    section('5. Incumprimento');
    paragraph(`Em caso de atraso, sobre o valor vencido e não pago incidem juros de mora à taxa de ${percent(params.annualRate + sheet.lateSurcharge)} ao ano (TAN de ${percent(params.annualRate)} + sobretaxa de ${formatDecimal(sheet.lateSurcharge, 2)} p.p.), desde a data de vencimento até ao pagamento efectivo (Código Civil, arts. 804.º a 806.º).`);
    paragraph('O incumprimento pode determinar o vencimento antecipado das restantes prestações, a execução das garantias prestadas e a comunicação da responsabilidade em incumprimento à Central de Informação de Risco de Crédito (CIRC) do Banco Nacional de Angola.', { gap: 4 });

    // ── 6. Validade ─────────────────────────────────────────────────────────────────────
    section('6. Validade');
    paragraph(`Esta simulação é válida por ${sheet.validityDays} dias, até ${formatDate(sheet.expiresAt)}. Depois dessa data, a TAN, as comissões e os impostos podem ser revistos.`);
    ensure(12);
    doc.setDrawColor(primary[0], primary[1], primary[2]); doc.setFillColor(255, 247, 237); doc.setLineWidth(0.3);
    doc.roundedRect(left, y, width, 9, 1.5, 1.5, 'FD');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8.6); doc.setTextColor(154, 52, 18);
    doc.text(pdfText(SIMULATION_NOTICE), pageWidth / 2, y + 5.8, { align: 'center' });
    y += 14;

    // ── 7. Assinaturas ──────────────────────────────────────────────────────────────────
    section('7. Assinaturas');
    ensure(30);
    paragraph('Declaro que recebi esta ficha, que me foram explicadas as condições simuladas e que compreendo que não constitui aprovação do crédito.', { size: 7.8, gap: 10 });
    const signatureWidth = (width - 16) / 2;
    doc.setDrawColor(100, 116, 139); doc.setLineWidth(0.3);
    doc.line(left, y, left + signatureWidth, y);
    doc.line(left + signatureWidth + 16, y, left + width, y);
    const columns = [
        { x: left + signatureWidth / 2, title: 'O Cliente', name: sheet.client.name || '' },
        { x: left + signatureWidth + 16 + signatureWidth / 2, title: `Pela ${config.name || 'entidade'}`, name: userName || '' },
    ];
    let signatureBottom = y;
    for (const column of columns) {
        let lineY = y + 4;
        doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(dark[0], dark[1], dark[2]);
        for (const line of doc.splitTextToSize(pdfText(column.title), signatureWidth) as string[]) { doc.text(line, column.x, lineY, { align: 'center' }); lineY += 3.4; }
        doc.setFont('helvetica', 'normal'); doc.setFontSize(7.4); doc.setTextColor(100, 116, 139);
        for (const line of doc.splitTextToSize(pdfText(column.name), signatureWidth) as string[]) { doc.text(line, column.x, lineY + 0.6, { align: 'center' }); lineY += 3.2; }
        doc.text('Data: ____/____/________', column.x, lineY + 2.6, { align: 'center' });
        signatureBottom = Math.max(signatureBottom, lineY + 4);
    }
    y = signatureBottom + 4;

    // ── Termos, políticas e enquadramento legal ─────────────────────────────────────────
    newPage();
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12.5); doc.setTextColor(dark[0], dark[1], dark[2]);
    doc.text('TERMOS, POLÍTICAS E ENQUADRAMENTO LEGAL', left, y);
    y += 5;
    paragraph(`Como esta simulação foi calculada por ${companyIdentity(legal)} e em que legislação angolana se baseia. Termos de Utilização e Políticas, versão ${TERMS_VERSION} de ${TERMS_UPDATED_AT}.`, { size: 7.8, color: [100, 116, 139], gap: 3 });

    section('A. Como a simulação é calculada');
    for (const item of simulationMethodology(legal)) {
        ensure(8);
        doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(dark[0], dark[1], dark[2]);
        doc.text(pdfText(item.title), left, y + 3);
        y += 4.2;
        paragraph(item.text, { size: 7.7, gap: 1.6 });
    }
    y += 2;

    section('B. Políticas aplicadas');
    const policies = [
        `Natureza: ${SIMULATION_NOTICE} A concessão depende da análise de risco, da documentação e da decisão da entidade (Aviso n.º 12/2016, art. 7.º).`,
        `Validade: ${sheet.validityDays} dias. Cada ficha tem número único e código de verificação, conferíveis no histórico de simulações da entidade.`,
        'Dados pessoais: tratados apenas para avaliar e gerir o crédito, com controlo de acessos, auditoria e dever de segredo (Lei n.º 22/11; Aviso n.º 12/2016, arts. 10.º, 11.º e 13.º).',
        `Capacidade de pagamento: taxa de esforço máxima de ${formatDecimal(legal.effortLimit, 0)}%; o risco é calculado a partir do rendimento, do histórico e das garantias (Instrutivo n.º 07/2020).`,
        'Reclamações: resolvidas em 20 dias após a recepção (30 dias se envolverem mais de uma instituição), com resposta escrita; o cliente pode também reclamar junto do BNA (Aviso n.º 12/2016, arts. 19.º, 23.º e 24.º).',
        'Identificação do cliente: exigida antes da contratação, nos termos da Lei n.º 05/20 (prevenção do branqueamento de capitais).',
    ];
    for (const policy of policies) paragraph(`· ${policy}`, { size: 7.7, indent: 1, gap: 1.4 });
    y += 2;

    section('C. Legislação de referência');
    autoTable(doc, {
        startY: y,
        margin: { left, right: left, bottom: 30 }, rowPageBreak: 'avoid',
        head: [['Diploma', 'Assunto', 'O que o sistema aplica', 'Fonte']],
        body: LEGAL_REFERENCES.map(reference => [pdfText(reference.diploma), pdfText(reference.subject), pdfText(reference.application), reference.source === 'BNA' ? 'BNA' : 'DR']),
        theme: 'grid',
        styles: { fontSize: 6.8, cellPadding: 1.4, lineColor: [226, 232, 240], lineWidth: 0.15, textColor: [30, 41, 59], overflow: 'linebreak', valign: 'top' },
        headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: 'bold' },
        columnStyles: { 0: { cellWidth: 40, fontStyle: 'bold' }, 1: { cellWidth: 46 }, 3: { cellWidth: 12, halign: 'center' } },
        didDrawPage: hook => { if (hook.pageNumber > 1) applyBranding(doc, config, userName, true); },
    });
    y = lastTableY() + 4;
    paragraph(`BNA = Banco Nacional de Angola (www.bna.ao); DR = Diário da República. ${LEGAL_SOURCE_NOTE}`, { size: 7, style: 'italic', color: [100, 116, 139] });
    paragraph(LEGAL_DISCLAIMER, { size: 7, style: 'italic', color: [100, 116, 139] });

    // ── Rodapé com número, código e paginação ───────────────────────────────────────────
    const pages = doc.getNumberOfPages();
    for (let page = 1; page <= pages; page++) {
        doc.setPage(page);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor(100, 116, 139);
        doc.text(pdfText(`Ficha de Simulação N.º ${sheet.number} · Código de verificação ${sheet.verificationCode}`), left, pageHeight - 23);
        doc.text(`Página ${page} de ${pages}`, pageWidth - left, pageHeight - 23, { align: 'right' });
    }

    const fileName = `Ficha-Simulacao-${sheet.number}.pdf`;
    if (output === 'blob') return URL.createObjectURL(doc.output('blob'));
    if (output === 'bytes') return doc.output('arraybuffer');
    doc.save(fileName);
}

/** Termos de Utilização e Políticas em PDF (mesmo texto da página do sistema). */
export async function generateTermsPdf(legal: LegalContext, articles: Array<{ number: number; title: string; paragraphs: string[]; references?: string[] }>, settings: any, userName?: string) {
    const doc = new jsPDF();
    const config = getCompanySettings(settings);
    const primary = resolveBrandPrimary(config.primaryColor);
    const dark = BRAND_CHARCOAL;
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const left = 18;
    const width = pageWidth - left * 2;
    applyBranding(doc, config, userName, false, { tagline: 'TERMOS DE UTILIZAÇÃO E POLÍTICAS' });
    let y = brandingHeaderBottom(doc) + 9;
    const ensure = (height: number) => {
        if (y + height <= pageHeight - 30) return;
        doc.addPage(); applyBranding(doc, config, userName, true); y = 40;
    };
    const write = (text: string, size: number, style: 'normal' | 'bold' | 'italic', color: [number, number, number], gap = 1.6) => {
        doc.setFont('helvetica', style); doc.setFontSize(size); doc.setTextColor(color[0], color[1], color[2]);
        const lineHeight = size * 0.43;
        for (const line of doc.splitTextToSize(pdfText(text), width) as string[]) { ensure(lineHeight + 1); doc.text(line, left, y + lineHeight * 0.8); y += lineHeight; }
        y += gap;
    };
    write('TERMOS DE UTILIZAÇÃO E POLÍTICAS', 14, 'bold', dark, 1);
    write(companyIdentity(legal), 9.5, 'bold', primary, 1);
    write(`Versão ${TERMS_VERSION} · Última actualização: ${TERMS_UPDATED_AT}`, 8, 'normal', [100, 116, 139], 5);
    for (const article of articles) {
        ensure(14);
        write(`Artigo ${article.number}.º — ${article.title}`, 10, 'bold', dark, 1.5);
        article.paragraphs.forEach((text, index) => write(`${article.paragraphs.length > 1 ? `${index + 1}. ` : ''}${text}`, 8.6, 'normal', [51, 65, 85], 1.4));
        if (article.references?.length) write(`Base legal: ${article.references.join('; ')}.`, 7.6, 'italic', [100, 116, 139], 3);
        else y += 1.6;
    }
    ensure(20);
    write('Legislação de referência', 10, 'bold', dark, 2);
    autoTable(doc, {
        startY: y,
        margin: { left, right: left, bottom: 30 }, rowPageBreak: 'avoid',
        head: [['Diploma', 'Assunto', 'Fonte']],
        body: LEGAL_REFERENCES.map(reference => [pdfText(reference.diploma), pdfText(reference.subject), reference.source === 'BNA' ? 'BNA' : 'Diário da República']),
        theme: 'grid',
        styles: { fontSize: 7.4, cellPadding: 1.6, overflow: 'linebreak' },
        headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255] },
        columnStyles: { 0: { cellWidth: 52, fontStyle: 'bold' }, 2: { cellWidth: 30 } },
        didDrawPage: hook => { if (hook.pageNumber > 1) applyBranding(doc, config, userName, true); },
    });
    y = ((doc as any).lastAutoTable?.finalY || y) + 4;
    write(LEGAL_SOURCE_NOTE, 7.4, 'italic', [100, 116, 139]);
    write(LEGAL_DISCLAIMER, 7.4, 'italic', [100, 116, 139]);
    const pages = doc.getNumberOfPages();
    for (let page = 1; page <= pages; page++) {
        doc.setPage(page);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor(100, 116, 139);
        doc.text(`Página ${page} de ${pages}`, pageWidth - left, pageHeight - 23, { align: 'right' });
    }
    doc.save(`Termos-e-Politicas-${(config.name || 'empresa').replace(/[^\w]+/g, '-')}.pdf`);
}
