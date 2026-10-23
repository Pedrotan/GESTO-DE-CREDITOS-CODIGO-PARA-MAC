// Recibo de pagamento em A4 (com a moldura da empresa) e em talão de 80 mm para impressora térmica.
// Numeração sequencial por ano (RC 2026/000123), divisão capital/juros/mora, prestações pagas, capital em
// dívida após o pagamento e QR code de verificação. Os recibos anulados mantêm o número e ficam marcados.
import QRCode from 'qrcode';
import jsPDF, { getMasterPdfWatermark, setPdfWatermark } from '@/bibliotecas/pdf-documento';
import autoTable from '@/bibliotecas/pdf-tabela';
import { applyBranding, brandingHeaderBottom, ensurePdfSpace, getCompanySettings, resolveBrandDark, resolveBrandPrimary, writeClosingNote } from './pdf';
import { formatLuandaDate, formatLuandaDateTime, formatRegistration } from './fuso-angola';
import { formatKz, type PaymentRow } from './pagamentos-analise';

export type ReceiptClient = { name: string; nif?: string; phone?: string; address?: string };

/** Código curto de verificação (impresso e no QR): depende do recibo, do valor e da data-valor. */
export function receiptVerificationCode(row: Pick<PaymentRow, 'receipt' | 'id' | 'total' | 'valueDateKey'>): string {
    const text = `${row.receipt}|${row.id}|${Math.round(row.total * 100)}|${row.valueDateKey}`;
    let hash = 0x811c9dc5;
    for (let index = 0; index < text.length; index++) {
        hash ^= text.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    const hex = hash.toString(16).toUpperCase().padStart(8, '0');
    return `${hex.slice(0, 4)}-${hex.slice(4)}`;
}

const pdfSafe = (value: string) => Array.from(String(value ?? ''), char => {
    const code = char.codePointAt(0) ?? 0;
    if (code === 0x2014 || code === 0x2013) return '-';
    if (code === 0x2026) return '...';
    if (code === 0x2018 || code === 0x2019) return "'";
    if (code === 0x201C || code === 0x201D) return '"';
    return code > 0xFF ? '' : char;
}).join('');

const qrContent = (row: PaymentRow, company: { name?: string; nif?: string }, code: string) => [
    'TANGO-RECIBO', row.receipt, `Verificacao: ${code}`, pdfSafe(company.name || ''), `NIF: ${company.nif || '-'}`,
    `Cliente: ${pdfSafe(row.clientName)}`, `Contrato: ${row.contract}`, `Valor: ${(row.total).toFixed(2)} Kz`,
    `Data-valor: ${formatLuandaDate(`${row.valueDateKey}T12:00:00Z`)}`, `Estado: ${row.status === 'cancelled' ? 'ANULADO' : 'VALIDO'}`,
].join('\n');

const installmentsBody = (row: PaymentRow) => row.installments.length
    ? row.installments.map(item => [`${item.n}.ª prestação${item.settled ? ' (liquidada)' : ''}`, formatKz(item.principalMinor / 100), formatKz(item.interestMinor / 100), formatKz(item.lateMinor / 100), formatKz((item.principalMinor + item.interestMinor + item.lateMinor) / 100)])
    : [['Imputação global ao contrato', formatKz(row.principal), formatKz(row.interest), formatKz(row.late), formatKz(row.principal + row.interest + row.late)]];

export async function generateReceiptA4(row: PaymentRow, client: ReceiptClient, settings: any, userName?: string, output: 'save' | 'datauri' = 'save', secondCopy = false) {
    if (!row.receipt) throw new Error('Este pagamento ainda não tem recibo (está pendente de validação).');
    const doc = new jsPDF();
    const config = getCompanySettings(settings);
    const primary = resolveBrandPrimary(config.primaryColor);
    const dark = resolveBrandDark(config.secondaryColor);
    applyBranding(doc, config, userName, false, { tagline: 'RECIBO DE PAGAMENTO' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const left = 16;
    const right = pageWidth - 16;
    const code = receiptVerificationCode(row);
    let y = brandingHeaderBottom(doc) + 9;

    // Título, número e QR code
    const qrSize = 26;
    try {
        const qr = await QRCode.toDataURL(qrContent(row, config, code), { margin: 0, width: 300, errorCorrectionLevel: 'M' });
        doc.addImage(qr, 'PNG', right - qrSize, y - 3, qrSize, qrSize);
    } catch { /* sem QR: o código de verificação continua impresso */ }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(dark[0], dark[1], dark[2]);
    doc.text(code, right - qrSize / 2, y + qrSize + 0.8, { align: 'center' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(5.8); doc.setTextColor(100, 116, 139);
    doc.text('Código de verificação', right - qrSize / 2, y + qrSize + 3.4, { align: 'center' });

    doc.setFont('helvetica', 'bold'); doc.setFontSize(17); doc.setTextColor(dark[0], dark[1], dark[2]);
    doc.text('RECIBO DE PAGAMENTO', left, y + 3);
    doc.setFontSize(12); doc.setTextColor(primary[0], primary[1], primary[2]);
    doc.text(`N.º ${row.receipt}${secondCopy ? '  ·  2.ª VIA' : ''}`, left, y + 10);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.2); doc.setTextColor(71, 85, 105);
    doc.text(pdfSafe(`Emitido em ${formatLuandaDateTime(new Date())}${userName ? ` por ${userName}` : ''} (hora de Angola)`), left, y + 15.5);
    y += qrSize + 8;

    // Recibo anulado: faixa em destaque (o número mantém-se).
    if (row.status === 'cancelled') {
        const p = row.payment;
        doc.setFillColor(254, 226, 226);
        doc.setDrawColor(220, 38, 38);
        doc.setLineWidth(0.6);
        doc.roundedRect(left, y, right - left, 15, 2, 2, 'FD');
        doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.setTextColor(185, 28, 28);
        doc.text('ANULADO', left + 4, y + 6.4);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(7.6);
        const why = doc.splitTextToSize(pdfSafe(`Anulado em ${formatLuandaDateTime(p.cancelledAt)} por ${p.cancelledBy || '-'}${p.cancelApprovedBy ? `, aprovado por ${p.cancelApprovedBy}` : ''}. Motivo: ${p.cancelReason || '-'}`), right - left - 8).slice(0, 2) as string[];
        doc.text(why, left + 4, y + 10.6);
        y += 20;
    }

    const pairs = (head: string, rows: Array<[string, string]>, startY: number) => {
        autoTable(doc, {
            startY, margin: { left, right: 16 },
            head: [[{ content: head, colSpan: 4 }]],
            body: rows.reduce<string[][]>((acc, pair, index) => {
                if (index % 2 === 0) acc.push([pair[0], pair[1]]); else acc[acc.length - 1].push(pair[0], pair[1]);
                return acc;
            }, []).map(line => line.length === 2 ? [...line, '', ''] : line).map(line => line.map(pdfSafe)),
            theme: 'grid',
            styles: { fontSize: 8, cellPadding: 1.6, overflow: 'linebreak', textColor: [30, 41, 59] },
            headStyles: { fillColor: [dark[0], dark[1], dark[2]], textColor: [255, 255, 255], fontStyle: 'bold' },
            columnStyles: { 0: { fontStyle: 'bold', cellWidth: 30, fillColor: [248, 250, 252] }, 2: { fontStyle: 'bold', cellWidth: 30, fillColor: [248, 250, 252] } },
        });
        return (doc as any).lastAutoTable.finalY as number;
    };

    y = pairs('Entidade credora e cliente', [
        ['Empresa', config.name || '-'], ['NIF da empresa', config.nif || '-'],
        ['Cliente', client.name || row.clientName], ['NIF / BI do cliente', client.nif || '-'],
        ['Telefone', client.phone || '-'], ['Morada', client.address || '-'],
    ], y) + 4;
    y = pairs('Pagamento', [
        ['Contrato', row.contract], ['Prestação(ões)', row.installmentsLabel],
        ['Data-valor', formatLuandaDate(`${row.valueDateKey}T12:00:00Z`)], ['Registado em', formatRegistration(row.registeredAt)],
        ['Método', row.methodLabel], ['Referência', row.reference || '-'],
        ['Operador', row.operator], ['Estado', row.statusLabel],
    ], y) + 4;

    y = ensurePdfSpace(doc, y, 30, config, userName);
    autoTable(doc, {
        startY: y, margin: { left, right: 16 },
        head: [['Imputação', 'Capital', 'Juros', 'Juros de mora', 'Total']],
        body: installmentsBody(row),
        foot: [['Total pago', formatKz(row.principal), formatKz(row.interest), formatKz(row.late), formatKz(row.total)]],
        theme: 'striped',
        styles: { fontSize: 8, cellPadding: 1.8 },
        headStyles: { fillColor: [primary[0], primary[1], primary[2]], textColor: [255, 255, 255], fontStyle: 'bold' },
        footStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold' },
        columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } },
    });
    y = (doc as any).lastAutoTable.finalY + 4;

    y = ensurePdfSpace(doc, y, 24, config, userName);
    autoTable(doc, {
        startY: y, margin: { left: pageWidth / 2, right: 16 },
        body: [
            ['Imposto do Selo e comissões', formatKz(row.other)],
            ['Valor total recebido', formatKz(row.total)],
            ['Capital em dívida após o pagamento', row.balanceAfter === null ? '-' : formatKz(row.balanceAfter)],
        ],
        theme: 'plain',
        styles: { fontSize: 8.6, cellPadding: 1.4, textColor: [30, 41, 59] },
        columnStyles: { 0: { fontStyle: 'bold' }, 1: { halign: 'right', fontStyle: 'bold' } },
    });
    y = (doc as any).lastAutoTable.finalY;
    writeClosingNote(doc, pdfSafe(`Recibo emitido por processo informático. Verifique a autenticidade pelo QR code ou pelo código ${code}. Um recibo anulado não tem valor de quitação.`), y, config, userName, { fontSize: 7.4 });
    if (row.status === 'cancelled') {
        // Marca diagonal semitransparente sobre todas as páginas do recibo anulado.
        for (let page = 1; page <= doc.getNumberOfPages(); page++) {
            doc.setPage(page);
            doc.saveGraphicsState();
            doc.setGState(new (doc.GState as unknown as { new (options: { opacity: number }): any })({ opacity: 0.18 }));
            doc.setFont('helvetica', 'bold'); doc.setFontSize(80); doc.setTextColor(220, 38, 38);
            doc.text('ANULADO', pageWidth / 2, 200, { align: 'center', angle: 35 });
            doc.restoreGraphicsState();
        }
    }
    const fileName = `Recibo-${row.receipt.replace(/[^\w]+/g, '-')}${secondCopy ? '-2a-via' : ''}.pdf`;
    if (output === 'datauri') return { fileName, dataUrl: doc.output('datauristring') as string };
    doc.save(fileName);
    return { fileName, dataUrl: '' };
}

const isImageData = (value: unknown): value is string => typeof value === 'string' && /^data:image\/(png|jpe?g|webp);base64,/i.test(value);
const imageFormat = (value: string) => /^data:image\/jpe?g/i.test(value) ? 'JPEG' : /^data:image\/webp/i.test(value) ? 'WEBP' : 'PNG';

/** Empresa que desenvolve o sistema (rodapé dos talões). */
const SYSTEM_DEVELOPER = 'Tango Gestão de Créditos · DIGITAL NORTE - Comércio e Prestação de Serviços, (SU), Lda';

/**
 * Talão de 80 mm (largura útil 72 mm) para impressoras térmicas. A altura acompanha o conteúdo.
 * Cabeçalho com o logótipo e os dados da empresa, marca de água por baixo do conteúdo, emissão e operador
 * no fim, e o agradecimento e quem desenvolveu o sistema em letra pequena no rodapé.
 */
export async function generateReceiptThermal(row: PaymentRow, client: ReceiptClient, settings: any, userName?: string, output: 'save' | 'datauri' = 'save') {
    if (!row.receipt) throw new Error('Este pagamento ainda não tem recibo (está pendente de validação).');
    const config = getCompanySettings(settings);
    const width = 80;
    const left = 4;
    const usable = width - 8;
    // Duas passagens: a primeira mede o conteúdo e a segunda gera o talão com a altura exacta (sem papel em branco).
    const draw = async (height: number) => {
    const doc = new jsPDF({ unit: 'mm', format: [width, height] });
    // Talão: sem moldura nem rodapé de contactos (o verificador de PDFs reconhece-o por esta marca).
    (doc as any).__receiptSlip = true;
    // A marca de água deste talão é desenhada aqui, por baixo do conteúdo (e não por cima, à saída).
    setPdfWatermark(doc, null);
    const code = receiptVerificationCode(row);
    const logo = [config.reportLogo, config.logo].find(isImageData);
    const watermark = [config.watermarkLogo, getMasterPdfWatermark(), logo].find(isImageData);

    // Marca de água: logótipo grande e muito claro ao centro do talão.
    if (watermark) {
        try {
            const props = doc.getImageProperties(watermark);
            const size = Math.min(56 / props.width, 56 / props.height);
            const w = props.width * size;
            const h = props.height * size;
            doc.saveGraphicsState();
            doc.setGState(new (doc.GState as unknown as { new (options: { opacity: number }): any })({ opacity: 0.07 }));
            (doc as any).__drawingWatermark = true;
            doc.addImage(watermark, imageFormat(watermark), (width - w) / 2, (height - h) / 2, w, h);
            (doc as any).__drawingWatermark = false;
            doc.restoreGraphicsState();
        } catch { /* imagem inválida: talão sem marca de água */ }
    }

    let y = 6;
    const center = (text: string, size: number, bold = false) => {
        doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(size);
        const wrapped = doc.splitTextToSize(pdfSafe(text), usable) as string[];
        doc.text(wrapped, width / 2, y, { align: 'center' });
        y += wrapped.length * size * 0.42 + 1;
    };
    const line = (label: string, value: string, bold = false) => {
        doc.setFontSize(7.6);
        doc.setFont('helvetica', 'normal');
        const labelWidth = doc.getTextWidth(pdfSafe(label)) + 2;
        doc.setFont('helvetica', bold ? 'bold' : 'normal');
        const wrapped = doc.splitTextToSize(pdfSafe(value), usable - labelWidth) as string[];
        doc.setFont('helvetica', 'normal');
        doc.text(pdfSafe(label), left, y);
        doc.setFont('helvetica', bold ? 'bold' : 'normal');
        doc.text(wrapped, width - left, y, { align: 'right' });
        y += Math.max(1, wrapped.length) * 3.3;
    };
    const rule = () => { doc.setDrawColor(120, 120, 120); doc.setLineWidth(0.15); doc.setLineDashPattern([0.8, 0.8], 0); doc.line(left, y - 1.6, width - left, y - 1.6); doc.setLineDashPattern([], 0); y += 1.6; };

    // Cabeçalho: logótipo à esquerda e os dados da empresa ao lado (nome em letra moderada).
    doc.setTextColor(0, 0, 0);
    let textX = left;
    let logoBottom = y;
    if (logo) {
        try {
            const props = doc.getImageProperties(logo);
            const scale = Math.min(18 / props.width, 18 / props.height);
            const w = props.width * scale;
            const h = props.height * scale;
            doc.addImage(logo, imageFormat(logo), left, y - 2, w, h);
            textX = left + w + 2.5;
            logoBottom = y - 2 + h;
        } catch { /* sem logótipo */ }
    }
    const infoWidth = width - left - textX;
    const info = (text: string, size: number, bold = false) => {
        if (!text) return;
        doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(size);
        const wrapped = (doc.splitTextToSize(pdfSafe(text), infoWidth) as string[]).slice(0, bold ? 3 : 2);
        doc.text(wrapped, textX, y);
        y += wrapped.length * size * 0.4 + 0.5;
    };
    info(config.name || 'Empresa', 7.2, true);
    info(`NIF ${config.nif || '-'}`, 5.8);
    info([config.address, config.location].filter(Boolean).join(', ') || 'Angola', 5.8);
    info([config.phone && `Tel. ${config.phone}`, config.whatsapp && `WhatsApp ${config.whatsapp}`].filter(Boolean).join(' · '), 5.8);
    info(config.email || '', 5.8);
    info(config.website || '', 5.8);
    y = Math.max(y, logoBottom + 1) + 2.5;
    rule();
    center('RECIBO DE PAGAMENTO', 9.5, true);
    center(row.receipt, 9, true);
    if (row.status === 'cancelled') {
        y += 1;
        doc.setFillColor(0, 0, 0);
        doc.rect(left, y - 4, usable, 7, 'F');
        doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
        doc.text('*** ANULADO ***', width / 2, y + 0.8, { align: 'center' });
        doc.setTextColor(0, 0, 0);
        y += 6;
        center(`Motivo: ${row.payment.cancelReason || '-'}`, 6.6);
    }
    rule();
    line('Cliente', row.clientName, true);
    line('NIF/BI', client.nif || '-');
    line('Contrato', row.contract);
    line('Data-valor', formatLuandaDate(`${row.valueDateKey}T12:00:00Z`));
    line('Registado', formatRegistration(row.registeredAt));
    line('Método', row.methodLabel);
    if (row.reference) line('Referência', row.reference);
    rule();
    for (const item of row.installments) line(`${item.n}.ª prestação`, formatKz((item.principalMinor + item.interestMinor + item.lateMinor) / 100));
    if (row.installments.length) rule();
    line('Capital', formatKz(row.principal));
    line('Juros', formatKz(row.interest));
    line('Juros de mora', formatKz(row.late));
    if (row.other) line('Selo e comissões', formatKz(row.other));
    line('TOTAL PAGO', formatKz(row.total), true);
    line('Capital em dívida', row.balanceAfter === null ? '-' : formatKz(row.balanceAfter));
    rule();
    line('Emitido em', formatLuandaDateTime(new Date()));
    line('Operador', userName || row.operator);
    y += 1;
    try {
        const qr = await QRCode.toDataURL(qrContent(row, config, code), { margin: 0, width: 240, errorCorrectionLevel: 'M' });
        doc.addImage(qr, 'PNG', (width - 30) / 2, y, 30, 30);
        y += 33;
    } catch { /* sem QR */ }
    center(`Verificação: ${code}`, 7, true);
    y += 0.5;
    doc.setTextColor(70, 70, 70);
    center(`Obrigado pela sua preferência, ${row.clientName}!`, 5.2);
    center(`Processado por ${SYSTEM_DEVELOPER}`, 4.6);
    doc.setTextColor(0, 0, 0);
    return { doc, end: y };
    };
    const probe = await draw(500);
    const { doc } = await draw(Math.max(100, Math.ceil(probe.end + 5)));
    const fileName = `Talao-${row.receipt.replace(/[^\w]+/g, '-')}.pdf`;
    if (output === 'datauri') return { fileName, dataUrl: doc.output('datauristring') as string };
    doc.save(fileName);
    return { fileName, dataUrl: '' };
}
