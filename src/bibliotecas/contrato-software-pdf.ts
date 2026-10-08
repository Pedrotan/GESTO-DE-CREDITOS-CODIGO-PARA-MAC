import jsPDF, { setPdfWatermark, getMasterPdfWatermark } from './pdf-documento';
import { contractDesign, contractText, type SoftwareContract } from './contrato-software';

export function contractParagraphs(body: string): string[] {
    const out: string[] = [];
    const lines = (body || '').split('\n');
    for (const rawLine of lines) {
        const value = rawLine.trim();
        const previous = out[out.length - 1];
        const boundary = /^(?:\d+[.)]|\d+\.\d+\.|[a-z]\)|[•\-–—*]|(?:Anexo|Cláusula|Artigo|AUTO|TERMO)\b|[A-ZÀ-Ý][\wÀ-ÿ /.-]{0,35}:|Nome:|Cargo:|Data:|B\.I\.:|NIF:|Pelo |Assinatura|Carimbo)/i.test(value);
        if (value && previous && previous.length >= 48 && !/[.;:!?_]$/.test(previous) && !boundary && !previous.endsWith(':')) {
            out[out.length - 1] = previous + ' ' + value;
        } else {
            if (!value && previous === '') continue;
            out.push(value);
        }
    }
    return out;
}

export function sanitizeForPdf(text: string): string {
    if (!text) return '';
    const cleaned = String(text)
        .replace(/\*\*(.*?)\*\*/g, '$1')
        .replace(/==(.*?)==/g, '$1')
        .replace(/__(.*?)__/g, '$1')
        .replace(/`([^`]+)`/g, '$1')
        // Travessões, hífens especiais e traços tipográficos
        .replace(/[\u2014\u2013\u2015\u2212]/g, '-')
        // Aspas curvas tipográficas e guillemets
        .replace(/[\u201C\u201D\u00AB\u00BB]/g, '"')
        .replace(/[\u2018\u2019]/g, "'")
        // Marcadores de lista e símbolos
        .replace(/[\u2022\u25CF\u25AA\u25AB]/g, '-')
        .replace(/\u2026/g, '...')
        .replace(/\u00D7/g, 'x')
        // Espaços protegidos, estreitos e especiais
        .replace(/[\u00A0\u202F\u2007]/g, ' ')
        .replace(/[\u200B\uFEFF]/g, '')
        .replace(/\t/g, '    ');

    // Mapeamento seguro para tabela WinAnsi (Latin-1) padrão do jsPDF
    return Array.from(cleaned, char => {
        const code = char.codePointAt(0) ?? 0;
        if (code === 0x20AC) return 'EUR';
        if (code > 0xFF) return ' ';
        return char;
    }).join('');
}

export function softwareContractPdf(contract: SoftwareContract, logo?: string) {
    const doc = new jsPDF();
    setPdfWatermark(doc, null); // Evita duplicar a marca de água já desenhada pelo decorate()
    const design = contractDesign(contract);
    const left = 24, width = 162, bottom = 252;
    const FONT_NAME = 'helvetica';

    const rgb = (hex: string): [number, number, number] => [
        parseInt(hex.slice(1, 3), 16),
        parseInt(hex.slice(3, 5), 16),
        parseInt(hex.slice(5, 7), 16),
    ];

    const polygon = (points: number[][], color: string) => {
        doc.setFillColor(...rgb(color));
        doc.lines(points.slice(1).map((p, i) => [p[0] - points[i][0], p[1] - points[i][1]]), points[0][0], points[0][1], [1, 1], 'F', true);
    };

    const decorate = () => {
        doc.setFillColor(...rgb(design.paper));
        doc.rect(0, 0, 210, 297, 'F');

        // Faixas cruzadas do papel timbrado institucional (vetores de alta precisão)
        polygon([[0, 8], [146, 8], [153, 19], [0, 19]], design.primary);
        polygon([[151, 14], [210, 14], [210, 25], [158, 25]], design.accent);
        polygon([[103, 8], [120, 0], [133, 0], [143, 8]], design.accent);
        polygon([[155, 25], [184, 25], [166, 34]], design.primary);
        polygon([[120, 0], [132, 0], [152, 34], [140, 34]], design.accent);
        polygon([[132, 0], [134, 0], [154, 34], [152, 34]], design.paper);
        polygon([[134, 0], [146, 0], [167, 34], [154, 34]], design.primary);
        doc.setDrawColor(...rgb(design.paper));
        doc.setLineWidth(0.7);
        doc.line(0, 17, 130, 17);
        doc.line(157, 16, 210, 16);

        // Faixas inferiores
        polygon([[0, 281], [44, 281], [50, 287], [0, 287]], design.accent);
        polygon([[58, 285], [210, 285], [210, 292], [62, 292]], design.primary);
        polygon([[26, 281], [38, 275], [46, 275], [53, 281]], design.primary);
        polygon([[38, 275], [46, 275], [59, 297], [51, 297]], design.primary);
        polygon([[46, 275], [48, 275], [61, 297], [59, 297]], design.paper);
        polygon([[48, 275], [56, 275], [69, 297], [61, 297]], design.accent);
        polygon([[69, 297], [80, 292], [66, 292]], design.accent);
        doc.setDrawColor(...rgb(design.paper));
        doc.setLineWidth(0.7);
        doc.line(0, 286, 44, 286);
        doc.line(65, 287, 210, 287);

        // Marca de água de alta definição e proporção harmoniosa
        const watermarkImg = getMasterPdfWatermark() || design.logo || logo;
        if (watermarkImg && watermarkImg.startsWith('data:image/')) {
            try {
                const imgProps = doc.getImageProperties(watermarkImg);
                const scale = Math.min((210 * 0.65) / imgProps.width, (297 * 0.55) / imgProps.height);
                const w = imgProps.width * scale;
                const h = imgProps.height * scale;
                doc.saveGraphicsState();
                try {
                    doc.setGState(new (doc.GState as any)({ opacity: 0.08 }));
                    doc.addImage(watermarkImg, imgProps.fileType, (210 - w) / 2, (297 - h) / 2, w, h);
                } finally {
                    doc.restoreGraphicsState();
                }
            } catch {}
        }

        // Logótipo maior e nítido no cabeçalho
        const visibleLogo = design.logo || logo;
        let headingLeft = 24;
        if (visibleLogo) {
            try {
                const image = doc.getImageProperties(visibleLogo);
                const ratio = image.width / image.height;
                const maxW = 38, maxH = 24;
                let w = Math.min(maxW, maxH * ratio);
                let h = w / ratio;
                if (h > maxH) { h = maxH; w = h * ratio; }
                doc.addImage(visibleLogo, image.fileType, 24, 34 + (24 - h) / 2, w, h);
                headingLeft = 24 + w + 8;
            } catch {}
        }

        // Nome da Empresa no cabeçalho em Helvetica Bold
        doc.setTextColor(...rgb(design.accent));
        doc.setFont(FONT_NAME, 'bold');
        let size = 18;
        doc.setFontSize(size);
        const compName = sanitizeForPdf(design.company);
        while (doc.getTextWidth(compName) > 190 - headingLeft && size > 9) {
            doc.setFontSize(--size);
        }
        const heading: string[] = doc.splitTextToSize(compName, 190 - headingLeft);
        doc.text(heading, headingLeft, 44);

        // Subtítulo institucional
        doc.setFont(FONT_NAME, 'normal');
        doc.setFontSize(9.5);
        doc.setTextColor(...rgb(design.primary));
        const tagLine = sanitizeForPdf(design.tagline);
        doc.text(doc.splitTextToSize(tagLine, 190 - headingLeft).slice(0, 2), headingLeft, 44 + heading.length * 5.2);
    };

    let y = 68;
    decorate();
    const page = () => {
        doc.addPage();
        decorate();
        y = 68;
    };

    const write = (text: string, bold = false, center = false, isTitle = false) => {
        if (!text) {
            y += 2.5;
            return;
        }
        const cleanText = sanitizeForPdf(contractText(text, contract));
        const isHeading = bold || isTitle;
        const fontStyle = isHeading ? 'bold' : 'normal';
        const fontSize = isHeading ? (isTitle ? 11 : 10) : 9.5;
        doc.setFont(FONT_NAME, fontStyle);
        doc.setFontSize(fontSize);

        const lines: string[] = doc.splitTextToSize(cleanText, width);
        if (isHeading && y + Math.min(lines.length + 3, 6) * 5 > bottom) {
            page();
        }

        for (let i = 0; i < lines.length; i++) {
            if (y + 5 > bottom) page();
            doc.setTextColor(...rgb(isHeading ? design.primary : design.text));
            doc.setFont(FONT_NAME, fontStyle);
            doc.setFontSize(fontSize);

            const line = lines[i];
            const trimmed = line.trim();
            const words = trimmed.split(/\s+/).filter(Boolean);

            if (center) {
                doc.text(trimmed, 105, y, { align: 'center' });
            } else if (!isHeading && i < lines.length - 1 && words.length > 2) {
                // Justificação harmónica de texto corrido
                const wordsWidth = words.reduce((sum, word) => sum + doc.getTextWidth(word), 0);
                const normalSpaceWidth = doc.getTextWidth(' ');
                const targetGap = (width - wordsWidth) / (words.length - 1);

                // Aplica justificação apenas se o espaçamento for natural e legível
                if (targetGap >= normalSpaceWidth * 0.7 && targetGap <= normalSpaceWidth * 2.0) {
                    let curX = left;
                    for (const word of words) {
                        doc.text(word, curX, y);
                        curX += doc.getTextWidth(word) + targetGap;
                    }
                } else {
                    doc.text(trimmed, left, y);
                }
            } else {
                doc.text(trimmed, left, y);
            }
            y += 5.0;
        }
        y += isHeading ? 2.5 : 1.5;
    };

    // Card Nobre e Destacado do Título Principal
    const titleBoxY = y;
    const titleBoxH = 26;
    doc.setFillColor(...rgb(design.paper === '#ffffff' ? '#f8fafc' : design.paper));
    doc.roundedRect(left, titleBoxY, width, titleBoxH, 2.5, 2.5, 'F');
    doc.setDrawColor(...rgb(design.accent));
    doc.setLineWidth(0.8);
    doc.roundedRect(left, titleBoxY, width, titleBoxH, 2.5, 2.5, 'S');

    doc.setFillColor(...rgb(design.primary));
    doc.roundedRect(left, titleBoxY, width, 2, 1, 1, 'F');

    doc.setFont(FONT_NAME, 'bold');
    doc.setFontSize(14);
    doc.setTextColor(...rgb(design.primary));
    const titleStr = sanitizeForPdf(contract.title || 'Contrato de Licenciamento e Venda de Software');
    doc.text(titleStr, 105, titleBoxY + 11, { align: 'center' });

    doc.setFontSize(10.5);
    doc.setFont(FONT_NAME, 'bold');
    doc.setTextColor(...rgb(design.accent));
    const contractNumStr = 'CONTRATO N.º ' + sanitizeForPdf(contract.number || '0015');
    doc.text(contractNumStr, 105, titleBoxY + 19, { align: 'center' });

    y = titleBoxY + titleBoxH + 6;
    if (contract.client) {
        doc.setFont(FONT_NAME, 'normal');
        doc.setFontSize(9.5);
        doc.setTextColor(...rgb(design.text));
        const clientLine = 'Cliente: ' + sanitizeForPdf(contract.client) + (contract.nif ? ' · NIF: ' + sanitizeForPdf(contract.nif) : '');
        doc.text(clientLine, 105, y, { align: 'center' });
        y += 6;
    }

    // Processamento de todas as Cláusulas e Anexos (Assinaturas na página de encerramento)
    for (const section of contract.sections) {
        if (section.title === 'Assinaturas') continue;

        // Cada Anexo inicia em página própria para estruturação formal oficial
        if (section.title.startsWith('Anexo ') && doc.getNumberOfPages() > 1 && y > 75) {
            page();
        }

        y += 2.5;
        write(section.title, true, false, true);
        const paragraphs = contractParagraphs(section.body);
        for (const p of paragraphs) {
            write(p);
        }
    }

    // Página Dedicada Oficial de Termo de Encerramento e Assinaturas
    page();

    // Título de Encerramento
    doc.setFont(FONT_NAME, 'bold');
    doc.setFontSize(13);
    doc.setTextColor(...rgb(design.primary));
    doc.text('TERMO DE ENCERRAMENTO E ASSINATURAS', 105, y, { align: 'center' });
    y += 2;
    doc.setDrawColor(...rgb(design.accent));
    doc.setLineWidth(0.8);
    doc.line(70, y, 140, y);
    y += 7;

    const closureText = 'E, por estarem plenamente ajustadas e acordadas com o teor integral de todas as cláusulas e respetivos anexos que antecedem, as Partes outorgam o presente Contrato de Licenciamento e Venda de Software, redigido em língua portuguesa, em 2 (dois) exemplares originais de igual teor, forma e valor jurídico, destinando-se um exemplar a cada uma das Partes outorgantes.';
    write(closureText, false, false);
    y += 2;

    const dateLocation = "Feito em N'dalatando, aos _____ dias do mês de ___________________ de 2026.";
    doc.setFont(FONT_NAME, 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(...rgb(design.primary));
    doc.text(dateLocation, 105, y, { align: 'center' });
    y += 12;

    // Assinaturas lado a lado conforme documentos oficiais
    const colW = 76;
    const col1X = left;
    const col2X = left + width - colW;

    // Caixa Fornecedor (Esquerda)
    doc.setDrawColor(...rgb(design.primary));
    doc.setLineWidth(0.5);
    doc.setFillColor(...rgb(design.paper === '#ffffff' ? '#f8fafc' : design.paper));
    doc.roundedRect(col1X, y, colW, 76, 2, 2, 'FD');

    doc.setFillColor(...rgb(design.primary));
    doc.roundedRect(col1X, y, colW, 6, 1, 1, 'F');
    doc.setFont(FONT_NAME, 'bold');
    doc.setFontSize(8);
    doc.setTextColor(255, 255, 255);
    doc.text('PELO FORNECEDOR', col1X + colW / 2, y + 4.2, { align: 'center' });

    let inY1 = y + 11;
    doc.setFont(FONT_NAME, 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(...rgb(design.primary));
    doc.text('DIGITAL NORTE (SU), LDA', col1X + colW / 2, inY1, { align: 'center' });

    inY1 += 18;
    doc.setDrawColor(...rgb(design.text));
    doc.setLineWidth(0.4);
    doc.line(col1X + 8, inY1, col1X + colW - 8, inY1);

    inY1 += 4.5;
    doc.setFont(FONT_NAME, 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...rgb(design.text));
    doc.text('Pedro de Morais Tango', col1X + colW / 2, inY1, { align: 'center' });
    inY1 += 4;
    doc.text('Administrador Geral / Representante Legal', col1X + colW / 2, inY1, { align: 'center' });
    inY1 += 4;
    doc.text('NIF: 5003207439', col1X + colW / 2, inY1, { align: 'center' });

    inY1 += 7;
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.3);
    doc.roundedRect(col1X + 10, inY1, colW - 20, 16, 1.5, 1.5, 'S');
    doc.setFontSize(6.5);
    doc.setTextColor(148, 163, 184);
    doc.text('[ CARIMBO / SELO OFICIAL ]', col1X + colW / 2, inY1 + 9, { align: 'center' });

    // Caixa Cliente (Direita)
    doc.setDrawColor(...rgb(design.primary));
    doc.setLineWidth(0.5);
    doc.setFillColor(...rgb(design.paper === '#ffffff' ? '#f8fafc' : design.paper));
    doc.roundedRect(col2X, y, colW, 76, 2, 2, 'FD');

    doc.setFillColor(...rgb(design.accent));
    doc.roundedRect(col2X, y, colW, 6, 1, 1, 'F');
    doc.setFont(FONT_NAME, 'bold');
    doc.setFontSize(8);
    doc.setTextColor(255, 255, 255);
    doc.text('PELO CLIENTE', col2X + colW / 2, y + 4.2, { align: 'center' });

    let inY2 = y + 11;
    doc.setFont(FONT_NAME, 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(...rgb(design.primary));
    const clientTitle = sanitizeForPdf(contract.client || '[DENOMINAÇÃO DO CLIENTE]');
    doc.text(doc.splitTextToSize(clientTitle, colW - 10).slice(0, 1), col2X + colW / 2, inY2, { align: 'center' });

    inY2 += 18;
    doc.setDrawColor(...rgb(design.text));
    doc.setLineWidth(0.4);
    doc.line(col2X + 8, inY2, col2X + colW - 8, inY2);

    inY2 += 4.5;
    doc.setFont(FONT_NAME, 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...rgb(design.text));
    doc.text('Assinatura do Representante Legal', col2X + colW / 2, inY2, { align: 'center' });
    inY2 += 4;
    doc.text('Nome: _______________________________', col2X + colW / 2, inY2, { align: 'center' });
    inY2 += 4;
    doc.text('NIF: ' + sanitizeForPdf(contract.nif || '[NIF DO CLIENTE]'), col2X + colW / 2, inY2, { align: 'center' });

    inY2 += 7;
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.3);
    doc.roundedRect(col2X + 10, inY2, colW - 20, 16, 1.5, 1.5, 'S');
    doc.setFontSize(6.5);
    doc.setTextColor(148, 163, 184);
    doc.text('[ CARIMBO / SELO DO CLIENTE ]', col2X + colW / 2, inY2 + 9, { align: 'center' });

    // Testemunhas instrumentárias
    y += 84;
    doc.setFont(FONT_NAME, 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...rgb(design.primary));
    doc.text('TESTEMUNHAS INSTRUMENTÁRIAS:', left, y);
    y += 6;

    doc.setFont(FONT_NAME, 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...rgb(design.text));
    doc.text('1.ª ___________________________________ (B.I. n.º ____________________)', left, y);
    doc.text('2.ª ___________________________________ (B.I. n.º ____________________)', col2X, y);

    // Rodapé Oficial em todas as páginas do contrato
    const totalPages = doc.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
        doc.setPage(p);

        doc.setDrawColor(215, 222, 230);
        doc.setLineWidth(0.3);
        doc.line(left, 276, left + width, 276);

        doc.setFont(FONT_NAME, 'normal');
        doc.setFontSize(7);
        doc.setTextColor(100, 116, 139);
        doc.text('DIGITAL NORTE - COMÉRCIO E PRESTAÇÃO DE SERVIÇOS (SU), LDA · NIF: 5003207439', left, 280);
        doc.text("N'dalatando, Província do Cuanza Norte, Angola · Tel.: (+244) 923 000 000 / 940 000 000 · geral@digitalnorte.ao", left, 283.5);

        doc.setFont(FONT_NAME, 'bold');
        doc.setTextColor(...rgb(design.primary));
        doc.text('Página ' + p + ' de ' + totalPages, left + width, 280, { align: 'right' });
        doc.setFont(FONT_NAME, 'normal');
        doc.setFontSize(6.5);
        doc.text('Contrato n.º ' + sanitizeForPdf(contract.number || '0015') + ' · ' + sanitizeForPdf(contract.software), left + width, 283.5, { align: 'right' });
    }

    doc.setProperties({
        title: sanitizeForPdf(contract.title),
        subject: 'Licenciamento e venda - ' + sanitizeForPdf(contract.software),
        author: sanitizeForPdf(design.company),
    });

    return doc;
}
