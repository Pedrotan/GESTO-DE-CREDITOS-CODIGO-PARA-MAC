import type jsPDF from 'jspdf';
import { applyBranding, brandingHeaderBottom, buildClientProfileDoc, getCompanySettings, BRAND_CHARCOAL } from '@/bibliotecas/pdf';
import { rasterizePdfForPrint } from '@/bibliotecas/pdfPrint';
import type { ClientDocument } from '@/tipos/credito';

// Ficha do cliente com os documentos anexados (BI, comprovativos, declarações…) visíveis dentro do próprio PDF:
// cada imagem ocupa uma página e cada PDF anexado entra página a página, a seguir à ficha. Na tabela da secção
// «Documentos Anexados» cada documento leva o número do anexo, para o encontrar.

const MARGIN = 14;
// Resolução das páginas de PDF anexadas: legível em ecrã e impressão, sem tornar a ficha pesada.
const ATTACHMENT_DPI = 130;
const MAX_PDF_PAGES_PER_DOCUMENT = 40;

export const clientDocumentsOf = (client: { documents?: unknown }): ClientDocument[] => {
    const raw = client?.documents;
    let list: unknown = raw;
    if (typeof raw === 'string') {
        try { list = JSON.parse(raw); } catch { list = []; }
    }
    return Array.isArray(list) ? list.filter((item): item is ClientDocument => !!item && typeof item === 'object' && typeof (item as ClientDocument).data === 'string') : [];
};

const isPdfData = (document: ClientDocument) => document.type === 'pdf' || /^data:application\/pdf/i.test(document.data);

const base64Bytes = (data: string) => {
    const binary = atob(data.includes(',') ? data.slice(data.indexOf(',') + 1) : data);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
    return bytes;
};

const imageDataUrl = (document: ClientDocument) => {
    if (document.data.startsWith('data:')) return document.data;
    return `data:image/jpeg;base64,${document.data}`;
};

/** Nova página com o cabeçalho da empresa e o título do anexo; devolve a área livre para o conteúdo. */
const attachmentPage = (doc: jsPDF, config: ReturnType<typeof getCompanySettings>, userName: string | undefined, title: string) => {
    doc.addPage('a4', 'portrait');
    applyBranding(doc, config, userName, true);
    const top = brandingHeaderBottom(doc) + 6;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(BRAND_CHARCOAL[0], BRAND_CHARCOAL[1], BRAND_CHARCOAL[2]);
    doc.text(title, MARGIN, top, { maxWidth: doc.internal.pageSize.getWidth() - MARGIN * 2 });
    const width = doc.internal.pageSize.getWidth() - MARGIN * 2;
    const height = doc.internal.pageSize.getHeight() - top - 4 - 14;
    return { x: MARGIN, y: top + 4, width, height };
};

const drawFitted = (doc: jsPDF, dataUrl: string, area: { x: number; y: number; width: number; height: number }, size?: { width: number; height: number }) => {
    const properties = size || doc.getImageProperties(dataUrl);
    const ratio = Math.min(area.width / properties.width, area.height / properties.height);
    const width = properties.width * ratio;
    const height = properties.height * ratio;
    const format = /^data:image\/png/i.test(dataUrl) ? 'PNG' : 'JPEG';
    doc.setDrawColor(226, 232, 240);
    doc.rect(area.x + (area.width - width) / 2 - 0.5, area.y - 0.5, width + 1, height + 1);
    doc.addImage(dataUrl, format, area.x + (area.width - width) / 2, area.y, width, height, undefined, 'FAST');
};

const unavailableNote = (doc: jsPDF, area: { x: number; y: number }, reason: string) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(185, 28, 28);
    doc.text(`Não foi possível mostrar este documento na ficha: ${reason}`, area.x, area.y + 6, { maxWidth: 180 });
};

/** Acrescenta à ficha, a seguir, cada documento anexado do cliente (imagens e páginas dos PDF). */
export const appendClientDocuments = async (doc: jsPDF, documents: ClientDocument[], settings?: unknown, userName?: string) => {
    const config = getCompanySettings(settings);
    for (const [index, document] of documents.entries()) {
        const label = `Anexo ${index + 1} — ${document.title || 'Documento'}`;
        if (isPdfData(document)) {
            try {
                const pages = await rasterizePdfForPrint(base64Bytes(document.data), ATTACHMENT_DPI, 'image/jpeg');
                const shown = pages.slice(0, MAX_PDF_PAGES_PER_DOCUMENT);
                if (!shown.length) throw new Error('o PDF não tem páginas');
                shown.forEach((page, pageIndex) => {
                    const area = attachmentPage(doc, config, userName, shown.length > 1 ? `${label} (página ${pageIndex + 1} de ${pages.length})` : label);
                    drawFitted(doc, page.dataUrl, area, { width: page.widthMm, height: page.heightMm });
                });
            } catch (error) {
                const area = attachmentPage(doc, config, userName, label);
                unavailableNote(doc, area, error instanceof Error ? error.message : 'PDF ilegível');
            }
        } else {
            const area = attachmentPage(doc, config, userName, label);
            try {
                drawFitted(doc, imageDataUrl(document), area);
            } catch (error) {
                unavailableNote(doc, area, error instanceof Error ? error.message : 'imagem ilegível');
            }
        }
    }
    return doc;
};

/** Ficha do cliente em PDF com os documentos anexados visíveis no fim. */
export const generateClientProfilePDFWithDocuments = async (
    client: any,
    credits: any[] = [],
    payments: any[] = [],
    settings?: any,
    userName?: string,
    options: { includeInterest?: boolean } = { includeInterest: true },
) => {
    const doc = buildClientProfileDoc(client, credits, payments, settings, userName, options);
    await appendClientDocuments(doc, clientDocumentsOf(client), settings, userName);
    doc.save(`Ficha_${(client.name || 'Cliente').replace(/\s+/g, '_')}.pdf`);
    return doc;
};
