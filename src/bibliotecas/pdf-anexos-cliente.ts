import type jsPDF from 'jspdf';
import { applyBranding, brandingHeaderBottom, buildClientProfileDoc, getCompanySettings, BRAND_CHARCOAL } from '@/bibliotecas/pdf';
import { rasterizePdfForPrint, trimImageMargins } from '@/bibliotecas/pdfPrint';
import type { ClientDocument } from '@/tipos/credito';

// Ficha do cliente com os documentos anexados (BI, comprovativos, declarações…) visíveis dentro do próprio PDF:
// cada imagem ocupa uma página e cada PDF anexado entra página a página, a seguir à ficha. Na tabela da secção
// «Documentos Anexados» cada documento leva o número do anexo, para o encontrar.
// Cada documento ocupa a folha toda: a folha fica deitada para documentos deitados (o BI), as margens brancas das
// páginas digitalizadas são recortadas e o documento fica centrado entre o cabeçalho e o rodapé, sem nada por cima.

const MARGIN = 12;
// Espaço do rodapé (contactos e faixa) no fundo de cada folha: o documento fica sempre acima dele.
const FOOTER_SPACE = 26;
// Resolução das páginas de PDF anexadas: texto nítido em ecrã e na impressão (JPEG de alta qualidade).
const ATTACHMENT_DPI = 220;
const ATTACHMENT_QUALITY = 0.92;
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

/**
 * Nova página com o cabeçalho da empresa e o título do anexo; devolve a área livre para o conteúdo (entre o título e
 * o rodapé). A folha fica deitada quando o documento é mais largo do que alto.
 */
const attachmentPage = (doc: jsPDF, config: ReturnType<typeof getCompanySettings>, userName: string | undefined, title: string, landscape = false) => {
    doc.addPage('a4', landscape ? 'landscape' : 'portrait');
    applyBranding(doc, config, userName, true);
    const top = brandingHeaderBottom(doc) + 6;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(BRAND_CHARCOAL[0], BRAND_CHARCOAL[1], BRAND_CHARCOAL[2]);
    doc.text(title, MARGIN, top, { maxWidth: doc.internal.pageSize.getWidth() - MARGIN * 2 });
    const width = doc.internal.pageSize.getWidth() - MARGIN * 2;
    const height = doc.internal.pageSize.getHeight() - FOOTER_SPACE - (top + 4);
    return { x: MARGIN, y: top + 4, width, height };
};

/** Desenha o documento o maior possível dentro da área, sem deformar, centrado. */
const drawFitted = (doc: jsPDF, dataUrl: string, area: { x: number; y: number; width: number; height: number }, size?: { width: number; height: number }) => {
    const properties = size || doc.getImageProperties(dataUrl);
    const ratio = Math.min(area.width / properties.width, area.height / properties.height);
    const width = properties.width * ratio;
    const height = properties.height * ratio;
    const x = area.x + (area.width - width) / 2;
    const y = area.y + (area.height - height) / 2;
    const format = /^data:image\/png/i.test(dataUrl) ? 'PNG' : 'JPEG';
    doc.setDrawColor(226, 232, 240);
    doc.rect(x - 0.5, y - 0.5, width + 1, height + 1);
    doc.addImage(dataUrl, format, x, y, width, height, undefined, 'FAST');
};

/** Documento mais largo do que alto (ex.: o BI): vai numa folha deitada. */
const isWide = (size: { width: number; height: number }) => size.width > size.height * 1.05;

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
                const pages = await rasterizePdfForPrint(base64Bytes(document.data), ATTACHMENT_DPI, 'image/jpeg', { quality: ATTACHMENT_QUALITY, trimMargins: true });
                const shown = pages.slice(0, MAX_PDF_PAGES_PER_DOCUMENT);
                if (!shown.length) throw new Error('o PDF não tem páginas');
                shown.forEach((page, pageIndex) => {
                    const size = { width: page.widthMm, height: page.heightMm };
                    const area = attachmentPage(doc, config, userName, shown.length > 1 ? `${label} (página ${pageIndex + 1} de ${pages.length})` : label, isWide(size));
                    drawFitted(doc, page.dataUrl, area, size);
                });
            } catch (error) {
                const area = attachmentPage(doc, config, userName, label);
                unavailableNote(doc, area, error instanceof Error ? error.message : 'PDF ilegível');
            }
        } else {
            const trimmed = await trimImageMargins(imageDataUrl(document), ATTACHMENT_QUALITY);
            const dataUrl = trimmed?.dataUrl || imageDataUrl(document);
            let size: { width: number; height: number } | undefined = trimmed || undefined;
            if (!size) {
                try { size = doc.getImageProperties(dataUrl); } catch { size = undefined; }
            }
            const area = attachmentPage(doc, config, userName, label, Boolean(size && isWide(size)));
            try {
                drawFitted(doc, dataUrl, area, size);
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
