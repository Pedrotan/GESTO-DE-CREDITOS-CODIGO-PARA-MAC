
import jsPDF from '../src/bibliotecas/pdf-documento';
import { contractDesign, contractText, type SoftwareContract } from '../src/bibliotecas/contrato-software';
import { CREATO_DISPLAY_REGULAR_B64, CREATO_DISPLAY_BOLD_B64 } from '../src/bibliotecas/fonte-creato-display';
import { getMasterPdfWatermark } from '../src/bibliotecas/pdf-documento';

export function contractParagraphs(body: string) {
    const out: string[] = [];
    for (const line of body.split('\n')) {
        const value = line.trim();
        const previous = out[out.length - 1];
        const boundary = /^(?:\d+[.)]|\d+\.\d+\.|[a-z]\)|[•\-–—*]|(?:Anexo|Cláusula|Artigo|AUTO|TERMO)\b|[A-ZÀ-Ý][\wÀ-ÿ /.-]{0,35}:|Nome:|Cargo:|Data:|B\.I\.:|NIF:|Pelo |Assinatura|Carimbo)/i.test(value);
        if (value && previous && previous.length >= 52 && !/[.;:!?_]$/.test(previous) && !boundary && !previous.endsWith(':')) {
            out[out.length - 1] = previous + ' ' + value;
        } else {
            out.push(value);
        }
    }
    return out;
}

export function softwareContractPdf(contract: SoftwareContract, logo?: string) {
    const doc = new jsPDF();
    const design = contractDesign(contract);
    const left = 24, width = 162, bottom = 252;
    const clean = (text: string) => (text || '').replace(/[—–]/g, '-').replace(/●/g, '.').replace(/×/g, 'x').replace(/\t/g, '    ');
    const rgb = (hex: string): [number, number, number] => [
        parseInt(hex.slice(1, 3), 16),
        parseInt(hex.slice(3, 5), 16),
        parseInt(hex.slice(5, 7), 16),
    ];

    try {
        doc.addFileToVFS('CreatoDisplay-Regular.otf', CREATO_DISPLAY_REGULAR_B64);
        doc.addFont('CreatoDisplay-Regular.otf', 'CreatoDisplay', 'normal');
        doc.addFileToVFS('CreatoDisplay-Bold.otf', CREATO_DISPLAY_BOLD_B64);
        doc.addFont('CreatoDisplay-Bold.otf', 'CreatoDisplay', 'bold');
    } catch {}

    const FONT_NAME = 'CreatoDisplay';

    let y = 68;
    const page = () => {
        doc.addPage();
        y = 68;
    };

    const write = (text: string, bold = false, center = false, isTitle = false) => {
        if (!text) { y += 2.5; return; }
        const cleanText = clean(contractText(text, contract));
        const isHeading = bold || isTitle;
        doc.setFont(FONT_NAME, isHeading ? 'bold' : 'normal');
        doc.setFontSize(isHeading ? (isTitle ? 11.5 : 10.5) : 9.5);

        const lines: string[] = doc.splitTextToSize(cleanText, width);
        if (isHeading && y + Math.min(lines.length + 2, 6) * 5 > bottom) {
            page();
        }

        for (let i = 0; i < lines.length; i++) {
            if (y + 5 > bottom) page();
            const line = lines[i];
            const trimmed = line.trim();
            const words = trimmed.split(/\s+/);

            if (center) {
                doc.text(trimmed, 105, y, { align: 'center' });
            } else if (!isHeading && i < lines.length - 1 && words.length > 1) {
                const wordsWidth = words.reduce((sum, word) => sum + doc.getTextWidth(word), 0);
                const gap = (width - wordsWidth) / (words.length - 1);
                if (gap > 0 && gap < 7) {
                    let curX = left;
                    for (const word of words) {
                        doc.text(word, curX, y);
                        curX += doc.getTextWidth(word) + gap;
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

    // Título
    write(contract.title, true, true, true);
    write('Contrato n.º ' + (contract.number || '0015'), false, true);
    y += 5;

    // Cláusulas e Anexos
    for (const section of contract.sections) {
        if (section.title === 'Assinaturas') continue;
        
        // Cada Anexo inicia em página própria para estruturação formal oficial
        if (section.title.startsWith('Anexo ') && doc.getNumberOfPages() > 1 && y > 75) {
            page();
        }

        console.log(section.title, '--> Page:', doc.getNumberOfPages());
        write(section.title, true, false, true);
        const paragraphs = contractParagraphs(section.body);
        for (const p of paragraphs) {
            write(p);
        }
    }

    // Assinaturas na Página 30
    while (doc.getNumberOfPages() < 29) {
        page();
    }
    page(); // Força início na página 30
    console.log('Assinaturas --> Page:', doc.getNumberOfPages());
    write('TERMO DE ENCERRAMENTO E ASSINATURAS', true, true, true);

    return doc;
}
