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

/** Colunas do talão (letra monoespaçada de 7 pt numa largura útil de 72 mm, como nas impressoras de 80 mm). */
const SLIP_COLS = 48;
const amount = (value: number) => formatKz(value).replace(/\s*Kz$/, '');

/** Quebra o texto em linhas de no máximo `cols` caracteres, por palavras. */
const wrapCols = (text: string, cols: number) => {
    const out: string[] = [];
    let current = '';
    for (const word of pdfSafe(text).split(/\s+/).filter(Boolean)) {
        if (!current) current = word;
        else if (current.length + 1 + word.length <= cols) current += ` ${word}`;
        else { out.push(current); current = word; }
        while (current.length > cols) { out.push(current.slice(0, cols)); current = current.slice(cols); }
    }
    if (current) out.push(current);
    return out.length ? out : [''];
};
const centerCols = (text: string) => {
    const value = text.slice(0, SLIP_COLS);
    return ' '.repeat(Math.floor((SLIP_COLS - value.length) / 2)) + value;
};
/** Texto à esquerda e à direita na mesma linha (o da esquerda encurta se não couber). */
const spread = (leftText: string, rightText: string) => {
    const right = pdfSafe(rightText).slice(0, SLIP_COLS);
    const room = Math.max(0, SLIP_COLS - right.length - 1);
    const left = pdfSafe(leftText).slice(0, room);
    return left + ' '.repeat(SLIP_COLS - left.length - right.length) + right;
};

/**
 * Talão de 80 mm para impressoras térmicas, no formato de cupão: letra monoespaçada em 48 colunas, separadores
 * "====" e "----", logótipo e dados da empresa no cabeçalho, prestações com capital/juros/total, totais, forma de
 * pagamento, operador e cliente, QR de verificação e agradecimento. Marca de água ao fundo e altura exacta.
 */
export async function generateReceiptThermal(row: PaymentRow, client: ReceiptClient, settings: any, userName?: string, output: 'save' | 'datauri' = 'save') {
    if (!row.receipt) throw new Error('Este pagamento ainda não tem recibo (está pendente de validação).');
    const config = getCompanySettings(settings);
    const width = 80;
    const left = 4.4;
    const fontSize = 7;
    const lineH = 3.15;
    const code = receiptVerificationCode(row);
    const logo = [config.reportLogo, config.logo].find(isImageData);
    const watermark = [config.watermarkLogo, getMasterPdfWatermark(), logo].find(isImageData);
    const slogan = String(settings?.slogan || settings?.segment || '').trim();
    const issuedAt = formatLuandaDateTime(new Date());
    const qr = await QRCode.toDataURL(qrContent(row, config, code), { margin: 0, width: 240, errorCorrectionLevel: 'M' }).catch(() => '');

    // Duas passagens: a primeira mede o conteúdo e a segunda gera o talão com a altura exacta (sem papel em branco).
    const draw = (height: number) => {
        const doc = new jsPDF({ unit: 'mm', format: [width, height] });
        // Talão: sem moldura nem rodapé de contactos (o verificador de PDFs reconhece-o por esta marca).
        (doc as any).__receiptSlip = true;
        // A marca de água deste talão é desenhada aqui, por baixo do conteúdo (e não por cima, à saída).
        setPdfWatermark(doc, null);
        if (watermark) {
            try {
                const props = doc.getImageProperties(watermark);
                const size = Math.min(58 / props.width, 58 / props.height);
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

        let y = 5;
        doc.setTextColor(0, 0, 0);
        const text = (value: string, bold = false, size = fontSize) => {
            doc.setFont('courier', bold ? 'bold' : 'normal'); doc.setFontSize(size);
            doc.text(value, left, y);
            y += lineH * (size / fontSize);
        };
        const centered = (value: string, bold = false) => wrapCols(value, SLIP_COLS).forEach(part => text(centerCols(part), bold));
        const field = (label: string, value: string) => {
            const [first, ...rest] = wrapCols(`${label} ${value}`, SLIP_COLS);
            text(first);
            for (const part of rest.length ? wrapCols(rest.join(' '), SLIP_COLS - 2) : []) text(`  ${part}`);
        };
        const rule = (char: '=' | '-') => text(char.repeat(SLIP_COLS));

        // Cabeçalho: logótipo centrado e identificação da empresa.
        if (logo) {
            try {
                const props = doc.getImageProperties(logo);
                const scale = Math.min(30 / props.width, 17 / props.height);
                const w = props.width * scale;
                const h = props.height * scale;
                doc.addImage(logo, imageFormat(logo), (width - w) / 2, y - 1.5, w, h);
                y += h + 1.5;
            } catch { /* sem logótipo */ }
        }
        rule('=');
        centered((config.name || 'Empresa').toUpperCase(), true);
        if (slogan) centered(slogan);
        rule('=');
        field('NIF:', config.nif || '-');
        if (config.address) field('Endereço:', config.address);
        if (config.location) field('Cidade:', config.location);
        // Telefone e WhatsApp na mesma linha quando cabem (como no cupão); senão, um por linha, sem partir os números.
        const phones = `Telefone: ${config.phone || '-'} | WhatsApp: ${config.whatsapp}`;
        if (config.phone && config.whatsapp && phones.length <= SLIP_COLS) text(pdfSafe(phones));
        else {
            if (config.phone) field('Telefone:', config.phone);
            if (config.whatsapp) field('WhatsApp:', config.whatsapp);
        }
        if (config.email) field('Email:', config.email);
        if (config.website) field('Site:', config.website);
        rule('=');
        text(spread(issuedAt, `RECIBO: ${row.receipt.replace(/^RC\s*/, '')}`));
        text(spread(`CONTRATO: ${row.contract}`, row.reference ? `REF: ${row.reference}` : ''));
        rule('-');
        text(centerCols('RECIBO DE PAGAMENTO'), true);
        if (row.status === 'cancelled') {
            text(centerCols('*** ANULADO ***'), true);
            wrapCols(`Motivo: ${row.payment.cancelReason || '-'}`, SLIP_COLS).forEach(part => text(part));
        }
        rule('-');

        // Prestações pagas (descrição e capital / juros / total, como as linhas de um cupão).
        text('Nº  DESCRIÇÃO');
        text(`     ${'CAPITAL(Kz)'.padStart(13)}${'JUROS(Kz)'.padStart(13)}${'TOTAL(Kz)'.padStart(15)}`);
        rule('-');
        const items = row.installments.length ? row.installments : [{ n: 0, principalMinor: Math.round(row.principal * 100), interestMinor: Math.round(row.interest * 100), lateMinor: Math.round(row.late * 100), settled: false }];
        items.forEach((item, index) => {
            const label = item.n ? `${item.n}.ª PRESTAÇÃO${item.settled ? ' (LIQUIDADA)' : ''}` : 'IMPUTAÇÃO GLOBAL AO CONTRATO';
            text(`${String(index + 1).padStart(3, '0')} ${label}`);
            const total = (item.principalMinor + item.interestMinor + item.lateMinor) / 100;
            text(`     ${amount(item.principalMinor / 100).padStart(13)}${amount(item.interestMinor / 100).padStart(13)}${amount(total).padStart(15)}`);
            if (item.lateMinor) text(`     JUROS DE MORA: ${amount(item.lateMinor / 100)}`);
        });
        rule('-');
        text(spread('CAPITAL (Kz):', amount(row.principal)));
        text(spread('JUROS (Kz):', amount(row.interest)));
        text(spread('JUROS DE MORA (Kz):', amount(row.late)));
        if (row.other) text(spread('SELO E COMISSÕES (Kz):', amount(row.other)));
        text(spread('TOTAL PAGO (Kz):', amount(row.total)), true);
        rule('-');
        text(spread('FORMA DE PAGAMENTO', 'VALOR PAGO'));
        text(spread(row.methodLabel, amount(row.total)));
        text(spread('CAPITAL EM DÍVIDA (Kz):', row.balanceAfter === null ? '-' : amount(row.balanceAfter)));
        rule('-');
        field('Operador:', userName || row.operator);
        field('Cliente:', client.name || row.clientName);
        field('NIF/BI:', client.nif || '-');
        if (client.phone) field('Telefone:', client.phone);
        field('Data-valor:', formatLuandaDate(`${row.valueDateKey}T12:00:00Z`));
        field('Registado:', formatRegistration(row.registeredAt));
        rule('=');

        if (qr) {
            y += 0.5;
            doc.addImage(qr, 'PNG', (width - 26) / 2, y, 26, 26);
            y += 28.5;
        }
        text(centerCols(`VERIFICAÇÃO: ${code}`), true);
        rule('=');
        text(centerCols('OBRIGADO PELA PREFERÊNCIA!'), true);
        centered(`Volte sempre à ${(config.name || 'nossa empresa').split(/\s+[-–,]\s*|,/)[0]}.`);
        rule('=');
        // Quem desenvolveu o sistema, em letra pequena.
        doc.setFont('helvetica', 'normal'); doc.setFontSize(4.6); doc.setTextColor(70, 70, 70);
        const dev = doc.splitTextToSize(pdfSafe(`Processado por ${SYSTEM_DEVELOPER}`), width - 2 * left) as string[];
        doc.text(dev, width / 2, y + 0.4, { align: 'center' });
        y += dev.length * 2;
        doc.setTextColor(0, 0, 0);
        return { doc, end: y };
    };
    const probe = draw(600);
    const { doc } = draw(Math.max(100, Math.ceil(probe.end + 4)));
    const fileName = `Talao-${row.receipt.replace(/[^\w]+/g, '-')}.pdf`;
    if (output === 'datauri') return { fileName, dataUrl: doc.output('datauristring') as string };
    doc.save(fileName);
    return { fileName, dataUrl: '' };
}
