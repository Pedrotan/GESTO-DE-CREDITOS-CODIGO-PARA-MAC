import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { CompanySettings } from '@/tipos/base-dados';
import { Client, Credit } from '@/tipos/credito';
import { formatCurrency, formatDate, formatDateTime } from './formatters';
import { AVAILABLE_PERMISSIONS } from '@/tipos/autenticacao';

const translateRiskLevel = (risk: string): string => {
    const levels: Record<string, string> = {
        'low': 'BAIXO',
        'medium': 'MÉDIO',
        'high': 'ALTO'
    };
    return levels[risk.toLowerCase()] || risk.toUpperCase();
};

export const getCompanySettings = (providedSettings?: any): CompanySettings => {
    if (!providedSettings) {
        try {
            const activeAccountId = localStorage.getItem('tango_active_account_id') || 'default';
            const saved = localStorage.getItem(`cached_company_settings:${activeAccountId}`) || localStorage.getItem('company_settings');
            if (saved) return JSON.parse(saved);
        } catch (e) { }
    }

    return {
        name: providedSettings?.name || '',
        nif: providedSettings?.nif || '',
        address: providedSettings?.address || '',
        logo: providedSettings?.logo || null,
        reportLogo: providedSettings?.reportLogo || null,
        watermarkLogo: providedSettings?.watermarkLogo || null,
        currency: providedSettings?.currency || 'AOA',
        customClauses: providedSettings?.customClauses || '',
        primaryColor: providedSettings?.primaryColor || [255, 127, 0],
        secondaryColor: providedSettings?.secondaryColor || [30, 41, 59],
        phone: providedSettings?.phone || '',
        email: providedSettings?.email || '',
        whatsapp: providedSettings?.whatsapp || '',
        digitalSignatureEnabled: providedSettings?.digitalSignatureEnabled || false,
        authorizedSigners: providedSettings?.authorizedSigners || '[]',
        sessionTimeout: providedSettings?.sessionTimeout || 5,
        syncEnabled: providedSettings?.syncEnabled || false,
        bankingInfo: providedSettings?.bankingInfo || '[]',
        contractTemplates: providedSettings?.contractTemplates || '[]',
        location: providedSettings?.location || ''
    };
};

const addWatermark = (doc: jsPDF, logo: string | null) => {
    if (!logo) return;
    // Must be a data URI or sufficiently long base64 string
    if (!logo.startsWith('data:') && logo.length < 100) return;
    try {
        const pageWidth = doc.internal.pageSize.width;
        const pageHeight = doc.internal.pageSize.height;
        
        let imgWidth = 180;
        let imgHeight = 180;
        
        try {
            const properties = doc.getImageProperties(logo);
            const originalWidth = properties.width;
            const originalHeight = properties.height;
            if (originalWidth && originalHeight) {
                const aspectRatio = originalWidth / originalHeight;
                // Limit watermark size to 75% of page dimensions or 180, whichever is smaller
                const maxSize = Math.min(pageWidth * 0.75, pageHeight * 0.75, 180);
                if (aspectRatio > 1) {
                    imgWidth = maxSize;
                    imgHeight = maxSize / aspectRatio;
                } else {
                    imgHeight = maxSize;
                    imgWidth = maxSize * aspectRatio;
                }
            }
        } catch (e) {
            console.warn("Could not get watermark image properties, falling back to square:", e);
        }

        const x = (pageWidth - imgWidth) / 2;
        const y = (pageHeight - imgHeight) / 2;

        try {
            // Check if GState exists (it might fail if jspdf plugins are not loaded correctly)
            // @ts-ignore
            const GState = doc.GState || (doc as any).constructor?.GState;

            if (typeof GState === 'function') {
                // @ts-ignore
                doc.setGState(new GState({ opacity: 0.08 }));
                doc.addImage(logo, 'PNG', x, y, imgWidth, imgHeight, undefined, 'NONE');
                // @ts-ignore
                doc.setGState(new GState({ opacity: 1.0 }));
            } else {
                // Fallback without transparency if GState is missing
                console.warn("GState plugin not available, skipping watermark opacity");
                doc.addImage(logo, 'PNG', x, y, imgWidth, imgHeight, undefined, 'NONE');
            }
        } catch (e) {
            console.error("Error adding watermark:", e);
        }
    } catch (e) {
        console.warn("Watermark skip:", e);
    }
};

/** Detect image format from a data URI or return a safe default */
const detectImageFormat = (data: string): string => {
    if (data.startsWith('data:image/png')) return 'PNG';
    if (data.startsWith('data:image/jpeg') || data.startsWith('data:image/jpg')) return 'JPEG';
    if (data.startsWith('data:image/webp')) return 'WEBP';
    return 'PNG'; // Safe default
};

/** Check if a logo value is a valid image data URI */
const isValidLogoData = (logo: string | null | undefined): logo is string => {
    if (!logo) return false;
    if (logo.startsWith('data:image/')) return true;
    // Legacy: raw base64 without data URI prefix (length > 100 chars)
    if (logo.length > 100 && !logo.includes('/') && !logo.includes('\\')) return true;
    return false;
};

/** Converte texto para Title Case alternando maiúsculas e minúsculas de forma elegante */
export const toTitleCase = (str: string): string => {
    if (!str) return '';
    return str
        .toLowerCase()
        .split(' ')
        .filter(Boolean)
        .map((word) => {
            const minorWords = ['de', 'da', 'do', 'das', 'dos', 'e', 'em', 'para', 'com', 'por', 'se', 'na', 'no', 'nas', 'nos'];
            if (minorWords.includes(word)) return word;
            return word.charAt(0).toUpperCase() + word.slice(1);
        })
        .join(' ')
        .replace(/^([a-z])/, (m) => m.toUpperCase());
};

export const applyBranding = (doc: jsPDF, config: CompanySettings, userName?: string, onlyDecoration: boolean = false) => {
    const pageWidth = doc.internal.pageSize.width;
    const pageHeight = doc.internal.pageSize.height;
    const orange = (config.primaryColor as [number, number, number]) || [255, 127, 0];
    const black = [30, 41, 59] as [number, number, number];

    if (isValidLogoData(config.watermarkLogo)) {
        addWatermark(doc, config.watermarkLogo);
    }

    // Destaque decorativo no topo direito
    doc.setFillColor(orange[0], orange[1], orange[2]);
    doc.rect(pageWidth - 65, 0, 65, 13, 'F');
    doc.setFillColor(black[0], black[1], black[2]);
    doc.rect(pageWidth - 65, 13, 65, 1.5, 'F');

    // Metadados no topo direito
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.setTextColor(255, 255, 255);
    doc.text(`Processado por: ${userName || 'Sistema'}`, pageWidth - 8, 5.5, { align: 'right' });
    doc.setFont("helvetica", "normal");
    doc.text(`Emissão: ${formatDateTime(new Date())}`, pageWidth - 8, 9.8, { align: 'right' });

    // Friso lateral decorativo
    doc.setFillColor(orange[0], orange[1], orange[2]);
    doc.rect(0, 75, 2.5, 75, 'F');

    // Selo de processamento digital no rodapé (Sem triângulo cortando o texto)
    doc.setFillColor(orange[0], orange[1], orange[2]);
    doc.rect(10, pageHeight - 17, pageWidth - 20, 6.5, 'F');
    
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.8);
    doc.setTextColor(255, 255, 255);
    doc.text("Documento Processado por Computador", 14, pageHeight - 12.8);
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.text(`Gerado por: ${userName || 'Sistema'}   •   ${formatDateTime(new Date())}`, pageWidth - 14, pageHeight - 12.8, { align: 'right' });

    // Barra de rodapé corporativo (Com dados da empresa em tamanho reduzido e Title Case)
    doc.setFillColor(black[0], black[1], black[2]);
    doc.rect(0, pageHeight - 9, pageWidth, 9, 'F');
    
    // Friso decorativo sutil acima da barra escura
    doc.setFillColor(orange[0], orange[1], orange[2]);
    doc.rect(0, pageHeight - 9.5, pageWidth, 0.5, 'F');

    // Texto de rodapé com Nome, NIF, Telefone e Email
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(241, 245, 249);
    
    const companyTitle = toTitleCase(config.name) || 'Digital Norte';
    const footerParts = [
        companyTitle,
        config.nif ? `NIF: ${config.nif}` : null,
        config.phone ? `Tel: ${config.phone}` : null,
        config.email ? `Email: ${config.email}` : null
    ].filter(Boolean);
    
    const footerText = footerParts.join('   •   ');
    doc.text(footerText, pageWidth / 2, pageHeight - 3.5, { align: 'center', maxWidth: pageWidth - 16 });

    // CABEÇALHO COMPLETO NA PARTE SUPERIOR (Nome, NIF, Logótipo, Telefone e Email)
    if (!onlyDecoration) {
        const pdfLogo = isValidLogoData(config.reportLogo) ? config.reportLogo : config.logo;
        let textStartX = 14;

        if (isValidLogoData(pdfLogo)) {
            const imgFormat = detectImageFormat(pdfLogo);
            try {
                let imgWidth = 30;
                let imgHeight = 24;
                try {
                    const properties = doc.getImageProperties(pdfLogo);
                    const originalWidth = properties.width;
                    const originalHeight = properties.height;
                    if (originalWidth && originalHeight) {
                        const aspectRatio = originalWidth / originalHeight;
                        if (aspectRatio > 1.25) {
                            imgWidth = 32;
                            imgHeight = 32 / aspectRatio;
                        } else {
                            imgHeight = 24;
                            imgWidth = 24 * aspectRatio;
                        }
                    }
                } catch (err) {
                    console.warn("Could not get logo properties:", err);
                }
                const yOffset = 10 + (24 - imgHeight) / 2;
                doc.addImage(pdfLogo, imgFormat, 14, yOffset, imgWidth, imgHeight, undefined, 'NONE');
                textStartX = 14 + imgWidth + 5;
            } catch (e) {
                console.warn("Logo skip:", e);
            }
        }

        // Informações da Empresa no Cabeçalho Superior
        const availableWidth = pageWidth - textStartX - 70;
        const compName = toTitleCase(config.name) || config.name || 'Digital Norte';

        // 1. Nome da Empresa (Destaque em Title Case / Maiúsculas e Minúsculas)
        let nameFontSize = 13;
        if (compName.length > 45) nameFontSize = 10.5;
        else if (compName.length > 30) nameFontSize = 11.5;

        doc.setFont("helvetica", "bold");
        doc.setFontSize(nameFontSize);
        doc.setTextColor(black[0], black[1], black[2]);
        const nameLines = doc.splitTextToSize(compName, availableWidth);
        doc.text(nameLines, textStartX, 15);

        let curY = 15 + (nameLines.length * 4.8);

        // 2. NIF da Empresa
        doc.setFontSize(8.5);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(orange[0], orange[1], orange[2]);
        doc.text(config.nif ? `NIF: ${config.nif}` : "Entidade Registada", textStartX, curY, { maxWidth: availableWidth });
        curY += 4.5;

        // 3. Contactos: Telefone e Email na Parte Superior
        doc.setFontSize(7.5);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(71, 85, 105);
        const contactParts = [
            config.phone ? `Tel: ${config.phone}` : null,
            config.email ? `Email: ${config.email}` : null
        ].filter(Boolean);
        const contactLine = contactParts.join('   |   ') || (config.phone ? `Tel: ${config.phone}` : 'Tel: N/D');
        doc.text(contactLine, textStartX, curY, { maxWidth: availableWidth });
        curY += 4;

        // 4. Endereço (se disponível)
        if (config.address) {
            doc.setFontSize(7);
            doc.setTextColor(100, 116, 139);
            doc.text(`Endereço: ${config.address}`, textStartX, curY, { maxWidth: availableWidth });
        }

        // 5. Divisor elegante abaixo do cabeçalho
        doc.setDrawColor(226, 232, 240);
        doc.setLineWidth(0.4);
        doc.line(12, 35, pageWidth - 12, 35);
    }

    // Reset text color to default dark slate/black to prevent light gray text bleeding to other elements
    doc.setTextColor(black[0], black[1], black[2]);
};

export const generatePaymentReceipt = (payment: any, credit: any, settings?: any, userName?: string) => {
    const doc = new jsPDF();
    const config = getCompanySettings(settings);
    const orange = (config.primaryColor as [number, number, number]) || [255, 127, 0];
    const black = [30, 41, 59] as [number, number, number];

    applyBranding(doc, config, userName);

    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    const title = 'RECIBO DE PAGAMENTO';
    const splitTitle = doc.splitTextToSize(title, 170);
    doc.text(splitTitle, 105, 55, { align: 'center' });

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Nº: #${payment.id}`, 20, 70);
    doc.text(`Data: ${formatDateTime(payment.paymentDate)}`, 20, 75);
    doc.text(`Processado: ${payment.processedBy || 'Sistema'}`, 20, 80);

    doc.text('Cliente:', 120, 70);
    doc.setFont("helvetica", "bold");
    doc.text(payment.clientName, 120, 75);
    doc.setFont("helvetica", "normal");
    doc.text(`Crédito Ref: ${credit.id}`, 120, 80);

    autoTable(doc, {
        startY: 90,
        head: [['Discriminação do Pagamento', 'Montante']],
        body: [
            ['Amortização do Principal', formatCurrency(payment.allocatedToPrincipal)],
            ['Juros Correntes', formatCurrency(payment.allocatedToInterest)],
            ['Juros de Mora / Penalidades', formatCurrency(payment.allocatedToLateInterest)],
            ['TOTAL PAGO', formatCurrency(payment.amount)]
        ],
        headStyles: { fillColor: orange },
        styles: { fontSize: 9 },
        theme: 'striped',
        didDrawPage: () => applyBranding(doc, config, userName, true)
    });

    const footerY = 280;
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text('Este documento serve de comprovativo de pagamento.', 105, footerY, { align: 'center' });

    doc.save(`Recibo-${payment.id}.pdf`);
};

export const generateReceiptPDF = generatePaymentReceipt;

const calculateDebtDays = (credit: Credit): number => {
    const dueDate = new Date(credit.dueDate);
    if (Number.isNaN(dueDate.getTime())) return Number(credit.daysOverdue || 0);
    const diff = Math.floor((Date.now() - dueDate.getTime()) / (24 * 60 * 60 * 1000));
    return Math.max(Number(credit.daysOverdue || 0), diff, 0);
};

const buildDebtNoticeFileName = (clientName: string): string => {
    const safeName = (clientName || 'Cliente')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^\w-]+/g, '_')
        .replace(/^_+|_+$/g, '');
    return `Nota-Cobranca-${safeName || 'Cliente'}-${new Date().toISOString().slice(0, 10)}.pdf`;
};

export const createDebtCollectionNoticePDF = (
    client: Client,
    debtCredits: Credit[],
    settings?: any,
    userName?: string
): jsPDF => {
    const doc = new jsPDF();
    const config = getCompanySettings(settings);
    const orange = (config.primaryColor as [number, number, number]) || [255, 127, 0];
    const black = [30, 41, 59] as [number, number, number];
    const currency = config.currency || 'AOA';
    const issueDate = new Date();
    const noticeNumber = `NC-${issueDate.getFullYear()}${String(issueDate.getMonth() + 1).padStart(2, '0')}${String(issueDate.getDate()).padStart(2, '0')}-${client.id.slice(-6).toUpperCase()}`;

    const totalPrincipal = debtCredits.reduce((sum, credit) => sum + Number(credit.principalAmount || 0), 0);
    const totalBalance = debtCredits.reduce((sum, credit) => sum + Number(credit.currentBalance || 0), 0);
    const totalLateInterest = debtCredits.reduce((sum, credit) => sum + Number(credit.lateInterest || 0), 0);
    const totalDue = debtCredits.reduce((sum, credit) => sum + Number(credit.totalDue || credit.currentBalance || 0), 0);
    const maxDaysOverdue = debtCredits.reduce((max, credit) => Math.max(max, calculateDebtDays(credit)), 0);

    applyBranding(doc, config, userName);

    doc.setTextColor(black[0], black[1], black[2]);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(19);
    doc.text('NOTA DE COBRANCA DE DIVIDA', 105, 55, { align: 'center' });

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(`Nota: ${noticeNumber}`, 20, 68);
    doc.text(`Emissao: ${formatDateTime(issueDate)}`, 20, 74);
    doc.text(`Responsavel: ${userName || 'Sistema de Cobranca'}`, 20, 80);

    doc.setFont("helvetica", "bold");
    doc.text('Cliente:', 120, 68);
    doc.setFont("helvetica", "normal");
    doc.text(client.name || 'N/A', 120, 74, { maxWidth: 70 });
    doc.text(`NIF: ${client.nif || 'N/A'}`, 120, 80);
    doc.text(`Telefone: ${client.phone || 'N/A'}`, 120, 86);
    doc.text(`Email: ${client.email || 'N/A'}`, 120, 92, { maxWidth: 70 });

    autoTable(doc, {
        startY: 102,
        head: [['Resumo da cobranca', 'Valor']],
        body: [
            ['Total de creditos em cobranca', String(debtCredits.length)],
            ['Principal cedido', formatCurrency(totalPrincipal, currency)],
            ['Saldo em aberto', formatCurrency(totalBalance, currency)],
            ['Juros de mora acumulados', formatCurrency(totalLateInterest, currency)],
            ['Valor total a regularizar', formatCurrency(totalDue, currency)],
            ['Maior atraso identificado', `${maxDaysOverdue} dias`]
        ],
        headStyles: { fillColor: orange, textColor: 255, fontStyle: 'bold' },
        styles: { fontSize: 9, cellPadding: 3 },
        theme: 'striped',
        didDrawPage: () => applyBranding(doc, config, userName, true)
    });

    const detailStartY = (doc as any).lastAutoTable.finalY + 10;
    autoTable(doc, {
        startY: detailStartY,
        head: [['Credito', 'Referencia', 'Vencimento', 'Atraso', 'Saldo', 'Mora', 'Total']],
        body: debtCredits.map((credit, index) => [
            `Credito No ${index + 1}`,
            credit.id,
            formatDate(credit.dueDate),
            `${calculateDebtDays(credit)} dias`,
            formatCurrency(credit.currentBalance || 0, currency),
            `${Number(credit.lateInterestRate || 0)}% | ${formatCurrency(credit.lateInterest || 0, currency)}`,
            formatCurrency(credit.totalDue || credit.currentBalance || 0, currency)
        ]),
        headStyles: { fillColor: black, textColor: 255, fontStyle: 'bold' },
        styles: { fontSize: 8, cellPadding: 2.6 },
        columnStyles: {
            0: { cellWidth: 24 },
            1: { cellWidth: 35 },
            2: { cellWidth: 24 },
            3: { cellWidth: 20 },
            4: { cellWidth: 27, halign: 'right' },
            5: { cellWidth: 31, halign: 'right' },
            6: { cellWidth: 29, halign: 'right', fontStyle: 'bold' }
        },
        theme: 'grid',
        didDrawPage: () => applyBranding(doc, config, userName, true)
    });

    let y = (doc as any).lastAutoTable.finalY + 12;
    if (y > 235) {
        doc.addPage();
        applyBranding(doc, config, userName);
        y = 55;
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(black[0], black[1], black[2]);
    doc.text('Orientacao para regularizacao', 20, y);
    y += 7;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    const paragraphs = [
        `Solicitamos a regularizacao do valor total de ${formatCurrency(totalDue, currency)} referente aos creditos discriminados nesta nota.`,
        'Caso o pagamento ja tenha sido efectuado, por favor envie o comprovativo para atualizacao imediata do processo.',
        `Contactos da entidade credora: ${config.phone || (config as any).whatsapp || 'N/A'}${(config as any).email ? ` | ${(config as any).email}` : ''}.`
    ];

    paragraphs.forEach((paragraph) => {
        const lines = doc.splitTextToSize(paragraph, 170);
        doc.text(lines, 20, y);
        y += lines.length * 5 + 3;
    });

    doc.setDrawColor(orange[0], orange[1], orange[2]);
    doc.setLineWidth(0.5);
    doc.line(20, y + 8, 85, y + 8);
    doc.line(125, y + 8, 190, y + 8);
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    doc.text('Assinatura da entidade credora', 52.5, y + 14, { align: 'center' });
    doc.text('Confirmacao do cliente', 157.5, y + 14, { align: 'center' });

    return doc;
};

export const generateDebtCollectionNoticePDF = (
    client: Client,
    debtCredits: Credit[],
    settings?: any,
    userName?: string,
    returnType: 'save' | 'datauristring' | 'blob' = 'save'
): jsPDF | string | Blob => {
    const doc = createDebtCollectionNoticePDF(client, debtCredits, settings, userName);
    if (returnType === 'datauristring') return doc.output('datauristring');
    if (returnType === 'blob') return doc.output('blob');
    doc.save(buildDebtNoticeFileName(client.name));
    return doc;
};

export const generateContractPDF = (
    contract: any,
    settings?: any,
    payments: any[] = [],
    returnType: 'save' | 'blob' = 'save',
    userName?: string,
    signerSignature?: string,
    options: { templateId?: string } = {}
) => {
    const doc = new jsPDF();
    const config = getCompanySettings(settings);
    const orange = (config.primaryColor as [number, number, number]) || [255, 127, 0];
    const black = [30, 41, 59] as [number, number, number];

    const generatePageFormat = (copyType: string) => {
        applyBranding(doc, config, userName);
        doc.setTextColor(0, 0, 0);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(20);
        const title = 'CONTRATO DE CRÉDITO E CONFISSÃO DE DÍVIDA';
        const splitTitle = doc.splitTextToSize(title, 170);
        doc.text(splitTitle, 105, 50, { align: 'center' });

        // Calculate Y position dynamically based on title lines
        const titleHeight = splitTitle.length * 8; // approx height per line
        const refY = 50 + titleHeight - 4;

        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(150, 150, 150);
        doc.text(`REF: ${contract.id}`, 105, refY, { align: 'center' });
        doc.text(copyType || '', 105, refY + 5, { align: 'center' });
    };

    const generateCopy = (type: 'VIA DO CREDOR' | 'VIA DO CLIENTE', isNewPage: boolean) => {
        if (isNewPage) doc.addPage();
        generatePageFormat(type);

        let cursorY = 80;
        const margin = 25;
        const maxWidth = 160;

        const addParagraph = (text: string, isBold: boolean = false, align: 'left' | 'center' | 'justify' = 'justify') => {
            doc.setFont("helvetica", isBold ? "bold" : "normal");
            doc.setTextColor(30, 30, 30);
            const splitText = doc.splitTextToSize(text, maxWidth);

            if (cursorY + (splitText.length * 6) > 260) {
                doc.addPage();
                applyBranding(doc, config, userName, true);
                doc.setTextColor(30, 30, 30);
                cursorY = 30;
            }

            if (align === 'justify') {
                // Justificação Inteligente: Justificar todas as linhas excepto a última
                splitText.forEach((line: string, index: number) => {
                    const isLastLine = index === splitText.length - 1;
                    doc.text(line, margin, cursorY + (index * 6), {
                        align: isLastLine ? 'left' : 'justify',
                        maxWidth: maxWidth
                    });
                });
            } else {
                // @ts-ignore
                doc.text(splitText, margin, cursorY, { align: align });
            }

            cursorY += (splitText.length * 6) + 4;
        };

        // Selecionar Modelo de Contrato
        const safeParse = (val: any) => {
            if (!val) return [];
            if (Array.isArray(val) || typeof val === 'object') return val;
            try { return JSON.parse(val); } catch (e) { return []; }
        };

        const templates = safeParse(config.contractTemplates);
        const selectedTemplate = options.templateId
            ? templates.find((t: any) => t.id === options.templateId)
            : templates[0]; // Fallback para o primeiro se nenhum for especificado

        const clauses = selectedTemplate?.content || config.customClauses || `
CLÁUSULA PRIMEIRA (Objeto)
1. O CREDOR concede ao CLIENTE um empréstimo no valor de ${formatCurrency(contract.principalAmount || contract.value)}.
2. O CLIENTE confessa-se devedor desta importância e obriga-se a restituí-la acrescida de juros acordados.

CLÁUSULA SEGUNDA (Prazo e Prestações)
O montante total deverá ser liquidado em ${contract.installments || 1} prestações, conforme plano de pagamentos anexo a este contrato.

CLÁUSULA TERCEIRA (Inadimplemento)
Em caso de falta de pagamento de qualquer prestação na data do seu vencimento, o CREDOR reserva-se o direito de cobrar juros de mora acumuláveis conforme a taxa legal em vigor.
`;

        addParagraph(`ENTRE:`, true, 'left');
        addParagraph(`PRIMEIRO OUTORGANTE: ${config.name}, NIF ${config.nif}, com sede em ${config.address}, doravante designado por "CREDOR".`, false, 'left');
        addParagraph(`SEGUNDO OUTORGANTE: ${contract.clientName}, NIF/Documento ${contract.clientNif || 'N/A'}, doravante designado por "CLIENTE".`, false, 'left');

        const receiveMethodText = contract.receiveMethod === 'cash'
            ? 'O CLIENTE optou pelo recebimento do capital em mão (numerário), servindo a assinatura deste contrato como prova irrevogável do recebimento da totalidade do capital aqui mencionado.'
            : `O capital será transferido para uma das coordenadas bancárias associadas ao CLIENTE na ficha de cadastro do sistema.`;
        addParagraph(`MÉTODO DE ENTREGA DE CAPITAL: ${receiveMethodText}`, true, 'left');

        clauses.split('\n').forEach(line => {
            if (!line.trim()) { cursorY += 2; return; }
            addParagraph(line, line.toUpperCase().includes('CLÁUSULA'));
        });

        // Adicionar Coordenadas Bancárias da Empresa para Pagamento
        const companyBanks = safeParse(config.bankingInfo);
        if (companyBanks && companyBanks.length > 0) {
            cursorY += 5;
            addParagraph('COORDENADAS BANCÁRIAS PARA LIQUIDAÇÃO:', true, 'left');
            companyBanks.forEach((b: any) => {
                addParagraph(`${b.bankName}: ${b.iban} (${b.holder})`, false, 'left');
            });
        }
        if (cursorY < 230) cursorY = 230;
        else cursorY += 10;

        addParagraph(`${config.location || 'Luanda'}, ${formatDate(new Date())}`, false, 'left');
        cursorY += 15;

        if (signerSignature && config.digitalSignatureEnabled) {
            try {
                // Posicionar a assinatura acima da linha do Credor
                doc.addImage(signerSignature, 'PNG', 30, cursorY - 15, 60, 15);
            } catch (e) {
                console.warn("Digital Signature render failed:", e);
            }
        }

        doc.setDrawColor(orange[0], orange[1], orange[2]);
        doc.line(30, cursorY, 90, cursorY);
        doc.line(120, cursorY, 180, cursorY);
        doc.setFontSize(9);
        doc.text('O CREDOR', 60, cursorY + 5, { align: 'center' });
        doc.text('O CLIENTE', 150, cursorY + 5, { align: 'center' });
    };

    generateCopy('VIA DO CREDOR', false);
    generateCopy('VIA DO CLIENTE', true);

    if (payments && payments.length > 0) {
        doc.addPage();
        applyBranding(doc, config, userName, true);
        doc.setTextColor(30, 30, 30);
        doc.setFontSize(14);
        doc.text('EXTRATO DE PAGAMENTOS', 105, 35, { align: 'center' });
        autoTable(doc, {
            startY: 45,
            head: [['Data', 'ID', 'Método', 'Montante']],
            body: payments.map(p => [formatDate(p.paymentDate), p.id, p.method, formatCurrency(p.amount)]),
            headStyles: { fillColor: orange as [number, number, number] },
            didDrawPage: () => applyBranding(doc, config, userName, true)
        });
    }

    if (returnType === 'blob') {
        const blob = doc.output('blob');
        return URL.createObjectURL(blob);
    }
    doc.save(`Contrato-${contract.id}.pdf`);
};

export const generatePromessaContractPDF = (
    contract: any,
    settings?: any,
    userName?: string,
    extendedDetails?: {
        fatherName?: string;
        motherName?: string;
        birthPlace?: string;
        province?: string;
        municipality?: string;
        street?: string;
        biIssueDate?: string;
        isForeigner?: boolean;
        nationality?: string;
        documentType?: string;
        documentNumber?: string;
    },
    returnType: 'save' | 'blob' = 'save'
) => {
    const doc = new jsPDF();
    const config = getCompanySettings(settings);
    const orange = (config.primaryColor as [number, number, number]) || [255, 127, 0];
    const black = [30, 41, 59] as [number, number, number];

    applyBranding(doc, config, userName);

    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text('CONTRATO-PROMESSA', 105, 45, { align: 'center' });

    let cursorY = 60;
    const margin = 20;
    const maxWidth = 170;

    const parseAdditionalClauses = (value: any): string => {
        if (!value) return '';
        if (Array.isArray(value)) {
            return value
                .map((item) => typeof item === 'string' ? item : (item?.content || item?.text || item?.clause || ''))
                .filter(Boolean)
                .join('\n');
        }
        if (typeof value === 'object') return value.content || value.text || '';

        const raw = String(value).trim();
        if (!raw || raw === '[]') return '';
        if (raw.startsWith('[') || raw.startsWith('{')) {
            try { return parseAdditionalClauses(JSON.parse(raw)); } catch (e) { return raw; }
        }
        return raw;
    };

    const addParagraph = (text: string, isBold: boolean = false, align: 'left' | 'center' | 'justify' = 'justify') => {
        doc.setFont("helvetica", isBold ? "bold" : "normal");
        doc.setFontSize(10);
        doc.setTextColor(30, 30, 30);
        const splitText = doc.splitTextToSize(text, maxWidth);

        if (isBold && text.toLowerCase().includes('cl') && cursorY > 225) {
            doc.addPage();
            applyBranding(doc, config, userName, true);
            doc.setTextColor(30, 30, 30);
            cursorY = 30;
        }

        if (cursorY + (splitText.length * 5) > 270) {
            doc.addPage();
            applyBranding(doc, config, userName, true);
            doc.setTextColor(30, 30, 30);
            cursorY = 30;
        }

        if (align === 'justify') {
            splitText.forEach((line: string, index: number) => {
                const isLastLine = index === splitText.length - 1;
                doc.text(line, margin, cursorY + (index * 5), {
                    align: isLastLine ? 'left' : 'justify',
                    maxWidth: maxWidth
                });
            });
        } else {
            // @ts-ignore
            doc.text(splitText, align === 'center' ? 105 : margin, cursorY, { align: align });
        }
        cursorY += (splitText.length * 5) + 3;
    };

    addParagraph('Entre:', true);
    addParagraph(`ANA DA PURIFICAÇÃO NZAU MABICA, maior, filha de Alexandre Mabica e de Maria Malonda Nzau, natural de Cabinda, Província de Cabinda, titular do BI n.º 003211299CA035, emitido aos 13/01/2021, pelo Arquivo Nacional de Identificação Civil e Criminal, doravante denominada por Promitente Credora/Primeira Outorgante.`);

    addParagraph('E', true);

    const docLabel = extendedDetails?.isForeigner
        ? (extendedDetails?.documentType || 'Passaporte/C.R.')
        : 'BI';
    const docNumber = extendedDetails?.documentNumber || contract.clientNif || '_________________________';
    const nationalityText = extendedDetails?.isForeigner && extendedDetails?.nationality
        ? `, de nacionalidade ${extendedDetails.nationality.toUpperCase()}`
        : '';
    const birthLocation = extendedDetails?.birthPlace
        ? `natural de ${extendedDetails.birthPlace}, Província de ${extendedDetails.province || '______'}${nationalityText}`
        : `natural de ____________, Província de ____________${nationalityText}`;

    addParagraph(`${(contract.clientName || '_________________________').toUpperCase()}, maior, filho/a de ${extendedDetails?.fatherName || '__________________________________'} e de ${extendedDetails?.motherName || '____________________________________'}, ${birthLocation}, residente em ${extendedDetails?.street || contract.clientAddress || '________________________'}, Município de ${extendedDetails?.municipality || '_______________'}, titular do ${docLabel} n.º ${docNumber}, emitido aos ${extendedDetails?.biIssueDate || '____________'}, adiante designado por Promitente Devedor/Segundo Outorgante.`);

    addParagraph('Cláusula 1.ª', true, 'center');
    addParagraph('(Objecto)', false, 'center');
    addParagraph('O presente Contrato visa regular a promessa de recebimento de valores pecuniários estabelecida entre os entes acima identificados, pelo que o Promitente-Devedor recebe uma quantia monetária abaixo descrita.');

    addParagraph('Cláusula 2ª', true, 'center');
    addParagraph('(Valor e prazo)', false, 'center');
    addParagraph(`1.- A quantia monetária entregue é de ${formatCurrency(contract.value || contract.principalAmount || 0, config.currency)}, e que as partes manifestam livremente e de boa-fé vincularem-se a este facto;`);
    addParagraph('2.- A DEVEDORA, tem a obrigação de restituir o valor num prazo de 30 dias, a contar com a data da emissão e assinatura deste contrato;');
    addParagraph(`3.- Em virtude do prazo, o que leva morosidade no processo de devolução do valor, as partes acordam livremente o acréscimo de uma taxa de ${contract.interestRate || contract.defaultInterestRate || '____'}% no valor supra para o cumprimento da prestação debitória.`);

    addParagraph('Cláusula 3.ª', true, 'center');
    addParagraph('(Comunicação)', false, 'center');
    addParagraph('As partes devem comunicar-se pela seguinte via:');
    addParagraph('Promitente Credor', true);
    addParagraph(`Tel.: ${config.phone || '923 414 621'}`);
    addParagraph('Promitente Devedor', true);
    addParagraph(`Tel.: ${contract.clientPhone || '_______________________'}`);

    addParagraph('Cláusula 4.ª', true, 'center');
    addParagraph('(Cumprimento)', false, 'center');
    addParagraph('1.- O Promitente Devedor assume a obrigação de cumprir integralmente com a prestação debitória no prazo acordado, nos termos da Cláusula 2ª;');
    addParagraph('2.- o inadimplemento do presente Contrato no prazo mencionado constantes no número um da presente cláusula dará lugar a juros de mora previstos nos termos do artigo 804.º e seguintes do Código Civil, despoletar a obrigação do pagamento de juros de mora legais na ordem 10% por cada mês de atraso e que incidem sobre o montante total em dívida;');
    addParagraph('3.- Tais valores pecuniários deverão ser devolvidos da seguinte forma:');
    addParagraph('a).- Prestação Única.');
    addParagraph('4.- Deve ser creditado na seguinte conta bancária:');
    addParagraph(`IBAN: ${config.bankingInfo ? 'Ver Coordenadas Bancárias da Empresa' : '0005 0000 1119.889. 261.1011.5'}`, true);
    addParagraph(`Titular: ${config.name || 'Ana da Purificação Nzau Mabica'}`, true);

    addParagraph('Cláusula 5.ª', true, 'center');
    addParagraph('(Foro)', false, 'center');
    addParagraph('1.- Em caso de litígios as partes indicam o Centro de Resolução de Litígios ou Tribunal da Comarca de Belas como órgãos competentes para resolução de conflitos.');
    addParagraph('2.- Registando-se litígio, o presente acordo servirá de título executivo nos termos do Código do Processo Civil vigente no ordenamento jurídico angolano.');

    addParagraph('Cláusula 6.ª', true, 'center');
    addParagraph('(Data e entrada em vigor)', false, 'center');
    addParagraph('O presente Contrato entra imediatamente em vigor com a assinatura das Partes, feito em duas vias originais.');

    const additionalClauses = parseAdditionalClauses(config.customClauses);
    if (additionalClauses) {
        addParagraph('Clausulas Adicionais', true, 'center');
        additionalClauses.split('\n').forEach((line) => {
            if (!line.trim()) {
                cursorY += 2;
                return;
            }
            addParagraph(line.trim(), line.toLowerCase().includes('cl'));
        });
    }

    cursorY += 10;
    const today = new Date();
    const day = today.getDate();
    const months = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    const month = months[today.getMonth()];
    const year = today.getFullYear();
    addParagraph(`${(extendedDetails?.province || config.location || 'Luanda')}, aos ${day} de ${month} de ${year}.`, false, 'center');

    const signatureY = cursorY + 30;
    if (signatureY > 270) {
        doc.addPage();
        applyBranding(doc, config, userName, true);
        cursorY = 50;
    } else {
        cursorY = signatureY;
    }

    doc.setDrawColor(30, 41, 59);
    doc.line(30, cursorY, 90, cursorY);
    doc.line(120, cursorY, 180, cursorY);

    doc.setFontSize(8);
    doc.setTextColor(30, 41, 59);
    doc.setFont("helvetica", "bold");
    doc.text('PROMITENTE CREDORA', 60, cursorY + 5, { align: 'center' });
    doc.text('PROMITENTE DEVEDOR', 150, cursorY + 5, { align: 'center' });

    doc.setFont("helvetica", "normal");
    doc.text('Ana da Purificação Nzau Mabica', 60, cursorY + 10, { align: 'center' });
    doc.text((contract.clientName || '').toUpperCase(), 150, cursorY + 10, { align: 'center' });

    if (returnType === 'blob') {
        const blob = doc.output('blob');
        return URL.createObjectURL(blob);
    } else {
        doc.save(`Contrato-Promessa-${contract.id || 'doc'}.pdf`);
    }
};

export const generateAuditLogPDF = (logs: any[], settings?: any, userInfo?: { name?: string, role?: string }) => {
    const doc = new jsPDF();
    const config = getCompanySettings(settings);
    const orange = (config.primaryColor as [number, number, number]) || [255, 127, 0];

    applyBranding(doc, config, userInfo?.name);

    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    const title = 'RELATÓRIO DE AUDITORIA';
    const splitTitle = doc.splitTextToSize(title, 170);
    doc.text(splitTitle, 105, 55, { align: 'center' });

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(120, 120, 120);
    doc.text(`Emissão: ${new Date().toLocaleString('pt-AO', { timeZone: 'Africa/Luanda' })}`, 105, 62, { align: 'center' });
    if (userInfo?.name) doc.text(`Solicitado por: ${userInfo.name}`, 105, 67, { align: 'center' });

    const entityT: any = { 'client': 'Cliente', 'credit': 'Crédito', 'payment': 'Pagamento', 'user': 'Usuário', 'system': 'Sistema' };
    const actionT: any = { 'create': 'Criação', 'update': 'Edição', 'delete': 'Exclusão', 'login': 'Login', 'logout': 'Logout' };

    autoTable(doc, {
        startY: 75,
        head: [['Data/Hora', 'Usuário', 'Ação', 'Entidade', 'Detalhes']],
        body: logs.map(l => [
            new Date(l.timestamp).toLocaleString('pt-AO', { timeZone: 'Africa/Luanda' }),
            l.userName || l.userId,
            actionT[l.action] || l.action,
            entityT[l.entity] || l.entity,
            l.details
        ]),
        headStyles: { fillColor: orange as [number, number, number] },
        styles: { fontSize: 7, cellPadding: 2 },
        columnStyles: {
            4: { fontStyle: 'bold', fontSize: 8 } // Tornar a coluna de Detalhes em negrito e ligeiramente maior
        },
        didDrawPage: () => applyBranding(doc, config, userInfo?.name, true)
    });

    doc.save(`Auditoria-${Date.now()}.pdf`);
};

export const generateClientProfilePDF = (
    client: any,
    credits: any[],
    payments: any[],
    settings?: any,
    userName?: string,
    options: { includeInterest?: boolean } = { includeInterest: true }
) => {
    const doc = new jsPDF();
    const config = getCompanySettings(settings);
    const orange = (config.primaryColor as [number, number, number]) || [255, 127, 0];

    applyBranding(doc, config, userName);

    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    const title = 'FICHA DO CLIENTE';
    const splitTitle = doc.splitTextToSize(title, 170);
    doc.text(splitTitle, 105, 45, { align: 'center' });

    doc.setTextColor(60, 60, 60); // Texto meta mais escuro
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 100, 100);
    doc.text(`Emissão em Angola: ${new Date().toLocaleString('pt-AO', { timeZone: 'Africa/Luanda' })}`, 105, 52, { align: 'center' });

    const infoRows = [
        ['Nome:', client.name, 'NIF:', client.nif || 'N/A'],
        ['Telefone:', client.phone, 'Risco:', translateRiskLevel(client.riskLevel || 'medium')],
        ['Status:', client.status === 'active' ? 'ATIVO' : 'INATIVO', 'Limite:', formatCurrency(client.creditLimit)],
    ];

    if (options.includeInterest) {
        infoRows.push(['Juro Padrão:', `${client.defaultInterestRate || 0}%`, 'Juro Mora:', `${client.lateInterestRate || 0}%`]);
    }

    infoRows.push(['Tolerância:', `${client.toleranceDays || 0} Dias`, 'Data Registo:', formatDate(client.createdAt)]);
    infoRows.push(['Método Recebto:', client.receiveMethod === 'cash' ? 'EM MÃO (ASSINATURA)' : 'TRANSFERÊNCIA', '', '']);

    autoTable(doc, {
        startY: 60,
        body: infoRows,
        theme: 'plain',
        styles: { fontSize: 10, cellPadding: 2 },
        didDrawPage: () => applyBranding(doc, config, userName, true)
    });

    const totalDebt = credits.reduce((acc, c) => acc + c.currentBalance, 0);
    const totalPaid = payments.reduce((acc, p) => acc + p.amount, 0);

    doc.setFontSize(14);
    doc.text("Resumo Financeiro", 20, (doc as any).lastAutoTable.finalY + 15);
    autoTable(doc, {
        startY: (doc as any).lastAutoTable.finalY + 20,
        head: [['Total Emprestado', 'Total Pago', 'Saldo Devedor']],
        body: [[formatCurrency(credits.reduce((a, c) => a + c.principalAmount, 0)), formatCurrency(totalPaid), formatCurrency(totalDebt)]],
        headStyles: { fillColor: orange as [number, number, number] },
        didDrawPage: () => applyBranding(doc, config, userName, true)
    });

    // Secção de Coordenadas Bancárias
    if (client.bankCoordinates && client.bankCoordinates.length > 0) {
        doc.setFontSize(14);
        doc.text("Coordenadas Bancárias", 20, (doc as any).lastAutoTable.finalY + 15);

        autoTable(doc, {
            startY: (doc as any).lastAutoTable.finalY + 20,
            head: [['Banco', 'IBAN', 'Titular']],
            body: client.bankCoordinates.map((b: any) => [
                b.bankName,
                b.iban,
                b.holder
            ]),
            headStyles: { fillColor: [30, 41, 59] },
            theme: 'grid',
            didDrawPage: () => applyBranding(doc, config, userName, true)
        });
    }

    // Secção de Documentos
    if (client.documents && client.documents.length > 0) {
        doc.setFontSize(14);
        doc.text("Documentos Anexados", 20, (doc as any).lastAutoTable.finalY + 15);

        autoTable(doc, {
            startY: (doc as any).lastAutoTable.finalY + 20,
            head: [['Nome do Documento', 'Tipo', 'Data de Envio']],
            body: client.documents.map((d: any) => [
                d.title,
                d.type.toUpperCase(),
                new Date(d.createdAt).toLocaleDateString('pt-AO', { timeZone: 'Africa/Luanda' })
            ]),
            headStyles: { fillColor: [100, 116, 139] }, // slate-500
            theme: 'striped',
            didDrawPage: () => applyBranding(doc, config, userName, true)
        });
    }

    // Secção de Coordenadas Bancárias da Empresa
    const safeParse = (val: any) => {
        if (!val) return [];
        if (Array.isArray(val) || typeof val === 'object') return val;
        try { return JSON.parse(val); } catch (e) { return []; }
    };
    const companyBanks = safeParse(config.bankingInfo);
    if (companyBanks && companyBanks.length > 0) {
        doc.setFontSize(14);
        doc.setTextColor(orange[0], orange[1], orange[2]);
        doc.text("Dados para Pagamento (Empresa)", 20, (doc as any).lastAutoTable.finalY + 15);

        autoTable(doc, {
            startY: (doc as any).lastAutoTable.finalY + 20,
            head: [['Banco', 'IBAN', 'Titular']],
            body: companyBanks.map((b: any) => [
                b.bankName,
                b.iban,
                b.holder
            ]),
            headStyles: { fillColor: orange as [number, number, number] },
            theme: 'grid',
            styles: { fontSize: 8 },
            didDrawPage: () => applyBranding(doc, config, userName, true)
        });
    }

    doc.save(`Ficha_${client.name.replace(/\s/g, '_')}.pdf`);
};

export const generateFinancialAuditPDF = (
    findings: any[],
    metrics: any,
    settings?: any,
    userName?: string,
    dateRange?: { start?: string, end?: string }
) => {
    try {
        const doc = new jsPDF();
        const config = getCompanySettings(settings);
        const orange = (config.primaryColor as [number, number, number]) || [255, 127, 0];
        const black = [30, 41, 59] as [number, number, number];

        applyBranding(doc, config, userName);

        doc.setTextColor(black[0], black[1], black[2]);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(18);
        doc.text('RELATÓRIO DE AUDITORIA FINANCEIRA', 105, 45, { align: 'center' });

        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(100, 100, 100);
        const period = dateRange?.start && dateRange?.end
            ? `${dateRange.start} até ${dateRange.end}`
            : 'Histórico Completo';
        doc.text(`Período de Análise: ${period}`, 105, 52, { align: 'center' });

        // Sumário Executivo
        doc.setFontSize(12);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(orange[0], orange[1], orange[2]);
        doc.text("SUMÁRIO EXECUTIVO", 20, 65);

        autoTable(doc, {
            startY: 70,
            head: [['Métrica', 'Valor']],
            body: [
                ['Receita Bruta Total', formatCurrency(metrics?.revenue || 0, config.currency)],
                ['Despesas Totais', formatCurrency(metrics?.expenses || 0, config.currency)],
                ['Margem Líquida (Lucro)', formatCurrency(metrics?.profit || 0, config.currency)],
                ['Contratos Novos no Período', (metrics?.contractsCount || 0).toString()],
                ['Total de Irregularidades Detectadas', findings.length.toString()],
                ['Status de Integridade (Blockchain)', findings.some(f => f.type.includes('Hash')) ? '⚠️ FALHA DETECTADA' : '✅ ÍNTEGRO']
            ],
            theme: 'striped',
            headStyles: { fillColor: black as [number, number, number] },
            styles: { fontSize: 10, cellPadding: 5 }
        });

        // Safely get Y position
        let finalY = (doc as any).lastAutoTable?.finalY || 150;

        // Detalhes das Irregularidades
        if (findings.length > 0) {
            // Check if we need a new page
            if (finalY > 250) {
                doc.addPage();
                applyBranding(doc, config, userName, true);
                finalY = 40;
            }

            doc.setFontSize(12);
            doc.text("APONTAMENTOS DETALHADOS", 20, finalY + 15);

            autoTable(doc, {
                startY: finalY + 20,
                head: [['Severidade', 'Tipo/Origem', 'Descrição', 'Impacto']],
                body: findings.map(f => [
                    f.severity?.toLowerCase() === 'warning' ? 'AVISO' :
                        f.severity?.toLowerCase() === 'error' ? 'ERRO' :
                            (f.severity || 'INFO').toUpperCase(),
                    f.type || 'Geral',
                    f.description || '',
                    f.impact || ''
                ]),
                theme: 'grid',
                headStyles: { fillColor: [185, 28, 28] }, // red-700
                styles: { fontSize: 8 },
                columnStyles: {
                    0: { fontStyle: 'bold', cellWidth: 25 },
                    1: { cellWidth: 40 },
                    2: { cellWidth: 70 },
                    3: { cellWidth: 35 }
                }
            });

            finalY = (doc as any).lastAutoTable?.finalY || finalY + 50;

        } else {
            doc.setFontSize(11);
            doc.setTextColor(16, 185, 129); // emerald-500
            doc.setFont("helvetica", "italic");
            doc.text("Nenhuma irregularidade ou inconsistência foi detectada no período analisado.", 20, finalY + 15);
            finalY += 30;
        }

        // Disclaimer Legal
        const disclaimerY = finalY + 20;
        if (disclaimerY < 270) {
            doc.setFontSize(8);
            doc.setTextColor(150, 150, 150);
            doc.setFont("helvetica", "normal");
            const disclaimer = "Este relatório é gerado automaticamente pelo algoritmo de auditoria interna da plataforma. As informações aqui contidas servem para fins de compliance e supervisão administrativa.";
            doc.text(doc.splitTextToSize(disclaimer, 170), 20, disclaimerY);
        }

        doc.save(`Relatorio_Auditoria_${new Date().getTime()}.pdf`);
        return true;
    } catch (e) {
        console.error("Erro ao gerar PDF de Auditoria:", e);
        throw e;
    }
};

export const generateAnalyticalReportPDF = (data: {
    summary: { label: string, value: string }[],
    credits: any[],
    title?: string,
    visualImg?: string
}, settings?: any, userName?: string) => {
    const doc = new jsPDF({ orientation: 'landscape' });
    const config = getCompanySettings(settings);
    const orange = (config.primaryColor as [number, number, number]) || [255, 127, 0];
    const black = [30, 41, 59] as [number, number, number];

    applyBranding(doc, config, userName);

    const pageWidth = doc.internal.pageSize.width;
    const pageHeight = doc.internal.pageSize.height;

    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    const title = data.title || 'RELATÓRIO ANALÍTICO COMPLETO';
    const splitTitle = doc.splitTextToSize(title, pageWidth - 90);
    doc.text(splitTitle, 20, 55);

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(120, 120, 120);
    const dateY = 55 + (splitTitle.length * 7);
    doc.text(`Emissão: ${new Date().toLocaleString('pt-AO', { timeZone: 'Africa/Luanda' })}`, 20, dateY);

    let currentY = dateY + 12;

    // Gráfico Visual se fornecido
    if (data.visualImg && data.visualImg.length > 50) {
        try {
            doc.setFont("helvetica", "bold");
            doc.setFontSize(12);
            doc.setTextColor(black[0], black[1], black[2]);
            doc.text("RESUMO VISUAL", 20, currentY);
            currentY += 5;
            doc.addImage(data.visualImg, 'UNKNOWN', 15, currentY, pageWidth - 30, 100);
            
            // Colocar as tabelas na página 2
            doc.addPage();
            applyBranding(doc, config, userName, true);
            currentY = 45;
        } catch (e) {
            console.error("PDF Visual Chart Error", e);
            currentY += 10;
        }
    }

    // Tabela de Resumo
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(30, 41, 59);
    doc.text("MÉTRICAS GERAIS", 20, currentY);

    autoTable(doc, {
        startY: currentY + 5,
        head: [['Indicador', 'Valor']],
        body: data.summary.map(s => [s.label, s.value]),
        headStyles: { fillColor: [40, 40, 40] },
        theme: 'striped',
        didDrawPage: () => applyBranding(doc, config, userName, true)
    });

    currentY = (doc as any).lastAutoTable.finalY + 15;

    // Tabela de Detalhes
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("DETALHAMENTO DE CARTEIRA", 20, currentY);

    autoTable(doc, {
        startY: currentY + 5,
        head: [['Cliente', 'Principal', 'Saldo', 'Vencimento', 'Estado']],
        body: data.credits.map(c => [
            c.clientName,
            formatCurrency(c.principalAmount),
            formatCurrency(c.currentBalance),
            formatDate(c.dueDate),
            c.status === 'overdue' ? 'ATRASADO' : 'REGULAR'
        ]),
        headStyles: { fillColor: orange },
        styles: { fontSize: 8 },
        didDrawPage: () => applyBranding(doc, config, userName, true)
    });

    doc.save(`Relatorio_Analitico_${Date.now()}.pdf`);
};


export const generateGenericReportPDF = (title: string, content: string[], settings?: any, userName?: string) => {
    const doc = new jsPDF();
    const config = getCompanySettings(settings);
    const orange = (config.primaryColor as [number, number, number]) || [255, 127, 0];
    const black = [30, 41, 59] as [number, number, number];

    applyBranding(doc, config, userName);

    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    const titleText = title.toUpperCase();
    const splitTitle = doc.splitTextToSize(titleText, 170);

    // Calcular altura do título (cada linha tem aprox 8 unidades em fontSize 20)
    const titleLineHeight = 8;
    const titleHeight = splitTitle.length * titleLineHeight;
    const titleY = 55;

    doc.text(splitTitle, 105, titleY, { align: 'center' });

    // Posicionar subtítulo dinamicamente abaixo do título
    const subtitleY = titleY + titleHeight - 1; // Pequeno ajuste de espaçamento
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(120, 120, 120);
    doc.text(`Documentação Oficial - ${config.name}`, 105, subtitleY, { align: 'center' });

    // O corpo do texto começa dinamicamente conforme o cabeçalho
    let y = subtitleY + 12;
    const margin = 20;
    const maxWidth = 170;
    const lineHeight = 6;
    const pageHeight = doc.internal.pageSize.height;

    content.forEach(line => {
        if (!line.trim()) { y += 4; return; }

        let fontSize = 10;
        let isBold = false;
        let textColor = [30, 41, 59];

        if (line.startsWith('# ')) {
            fontSize = 16;
            isBold = true;
            line = line.replace('# ', '');
            y += 5;
        } else if (line.startsWith('## ')) {
            fontSize = 13;
            isBold = true;
            line = line.replace('## ', '');
            y += 3;
            textColor = orange;
        } else if (line.startsWith('### ')) {
            fontSize = 11;
            isBold = true;
            line = line.replace('### ', '');
        }

        doc.setFont("helvetica", isBold ? "bold" : "normal");
        doc.setFontSize(fontSize);
        doc.setTextColor(textColor[0], textColor[1], textColor[2]);

        const splitText = doc.splitTextToSize(line, maxWidth);

        if (y + (splitText.length * lineHeight) > 260) {
            doc.addPage();
            applyBranding(doc, config, userName, true);
            y = 35;
        }

        doc.text(splitText, margin, y);
        y += (splitText.length * lineHeight) + 2;
    });

    doc.save(`${title.replace(/\s/g, '_')}.pdf`);
};

export const generateNotificationPDF = (notification: any, settings?: any, userName?: string) => {
    const doc = new jsPDF();
    const config = getCompanySettings(settings);
    const orange = (config.primaryColor as [number, number, number]) || [255, 127, 0];
    const black = [30, 41, 59] as [number, number, number];

    applyBranding(doc, config, userName);

    // Título Principal
    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18); // Slightly smaller for elegance
    const title = 'NOTIFICAÇÃO DO SISTEMA';
    doc.text(title, 105, 45, { align: 'center' });

    // Metadados (Ref e Data)
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 100, 100);
    doc.text(`Ref: ${notification.id}`, 190, 52, { align: 'right' });
    doc.text(`Data do Evento: ${formatDateTime(notification.timestamp)}`, 190, 56, { align: 'right' });

    // Caixa de Detalhes
    const boxY = 65;
    const boxHeight = 25;

    doc.setDrawColor(220, 220, 220);
    doc.setFillColor(252, 252, 252);
    doc.roundedRect(20, boxY, 170, boxHeight, 2, 2, 'FD');

    // Conteúdo da Caixa
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(black[0], black[1], black[2]);
    doc.text("Assunto:", 25, boxY + 8);
    doc.text("Tipo:", 25, boxY + 18);

    doc.setFont("helvetica", "normal");
    doc.text(notification.title, 55, boxY + 8);

    // Etiqueta de Tipo
    const typeLabel = notification.type === 'info' ? 'Informativo' :
        notification.type === 'warning' ? 'Aviso' :
            notification.type === 'error' ? 'Erro/Crítico' : 'Sucesso';

    // Cor do tipo
    if (notification.type === 'error') doc.setTextColor(220, 50, 50);
    else if (notification.type === 'warning') doc.setTextColor(200, 150, 0);
    else if (notification.type === 'success') doc.setTextColor(0, 150, 0);
    else doc.setTextColor(50, 50, 50);

    doc.text(typeLabel.toUpperCase(), 55, boxY + 18);

    // Corpo da Mensagem
    const msgY = boxY + boxHeight + 15;
    doc.setTextColor(black[0], black[1], black[2]);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("Mensagem:", 20, msgY);

    // Linha separadora abaixo de "Mensagem"
    doc.setDrawColor(orange[0], orange[1], orange[2]);
    doc.setLineWidth(0.5);
    doc.line(20, msgY + 3, 45, msgY + 3);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(50, 50, 50);

    const splitText = doc.splitTextToSize(notification.message, 170);
    let messageY = msgY + 10;

    splitText.forEach((line: string) => {
        if (messageY > 260) {
            doc.addPage();
            applyBranding(doc, config, userName, true);
            messageY = 35;
        }
        doc.text(line, 20, messageY);
        messageY += 6;
    });

    // Assinatura de Rodapé
    const y = 250;
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.line(20, y, 190, y);
    doc.text("Documento gerado automaticamente pelo sistema Tango Gestão de Créditos.", 105, y + 5, { align: 'center' });

    doc.save(`Notificacao_${formatDate(notification.timestamp)}.pdf`);
};

export const generateCreditPaymentHistoryPDF = (
    credit: any,
    payments: any[],
    settings?: any,
    userName?: string
) => {
    const doc = new jsPDF();
    const config = getCompanySettings(settings);
    const orange = (config.primaryColor as [number, number, number]) || [255, 127, 0];
    const black = [30, 41, 59] as [number, number, number];

    applyBranding(doc, config, userName);

    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    const title = 'EXTRATO HISTÓRICO DE PAGAMENTOS';
    doc.text(title, 105, 45, { align: 'center' });

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Ref. Crédito: ${credit.id || '-'}`, 20, 58);
    doc.text(`Ciclo de Crédito: ${credit.creditNumber || 1}º Crédito`, 20, 63);
    doc.text(`Cliente: ${credit.clientName || '-'}`, 20, 68);
    doc.text(`Data de Emissão: ${formatDateTime(new Date())}`, 20, 73);

    const totalPrincipal = payments.reduce((acc, p) => acc + (p.allocatedToPrincipal || 0), 0);
    const totalInterest = payments.reduce((acc, p) => acc + (p.allocatedToInterest || 0), 0);
    const totalLateInterest = payments.reduce((acc, p) => acc + (p.allocatedToLateInterest || 0), 0);
    const totalPaid = payments.reduce((acc, p) => acc + (p.amount || 0), 0);

    const currentBalance = Number(credit.currentBalance) || 0;
    const totalDebt = totalPaid + currentBalance;
    const percentagePaid = totalDebt > 0 ? (totalPaid / totalDebt) * 100 : 0;
    const remainingAmount = currentBalance;

    // Resumo em Caixas
    const boxY = 80;
    doc.setFillColor(245, 247, 250);
    doc.roundedRect(20, boxY, 170, 22, 2, 2, 'F');

    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text('TOTAL CONCEDIDO', 25, boxY + 7);
    doc.text('TOTAL PAGO', 72, boxY + 7);
    doc.text('SALDO DEVEDOR', 120, boxY + 7);
    doc.text('AMORTIZAÇÃO', 165, boxY + 7);

    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(black[0], black[1], black[2]);
    doc.text(formatCurrency(credit.amount || credit.principalAmount || 0, config.currency), 25, boxY + 16);
    doc.setTextColor(34, 197, 94);
    doc.text(formatCurrency(totalPaid, config.currency), 72, boxY + 16);
    doc.setTextColor(remainingAmount > 0 ? 239 : 34, remainingAmount > 0 ? 68 : 197, remainingAmount > 0 ? 68 : 94);
    doc.text(formatCurrency(remainingAmount, config.currency), 120, boxY + 16);
    doc.setTextColor(black[0], black[1], black[2]);
    doc.text(`${percentagePaid.toFixed(1)}%`, 165, boxY + 16);

    // Tabela de Histórico de Pagamentos
    autoTable(doc, {
        startY: boxY + 28,
        head: [['Data', 'Ref. Recibo', 'Método', 'Principal', 'Juros', 'Mora', 'Total Pago']],
        body: payments.map(p => [
            formatDate(p.date || p.paymentDate || p.createdAt),
            p.receiptNumber || p.reference || p.id || '-',
            p.method || p.paymentMethod || 'Numerário',
            formatCurrency(p.allocatedToPrincipal || 0, config.currency),
            formatCurrency(p.allocatedToInterest || 0, config.currency),
            formatCurrency(p.allocatedToLateInterest || 0, config.currency),
            formatCurrency(p.amount || 0, config.currency)
        ]),
        headStyles: {
            fillColor: orange,
            textColor: [255, 255, 255],
            fontStyle: 'bold'
        },
        alternateRowStyles: {
            fillColor: [248, 250, 252]
        },
        styles: {
            fontSize: 8,
            cellPadding: 3
        },
        didDrawPage: () => applyBranding(doc, config, userName, true)
    });

    const finalY = (doc as any).lastAutoTable?.finalY || 200;

    // Totais discriminados
    const summaryY = Math.min(finalY + 10, 245);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 116, 139);
    doc.text(`Amortização de Capital: ${formatCurrency(totalPrincipal, config.currency)}`, 20, summaryY);
    doc.text(`Juros Ordinários: ${formatCurrency(totalInterest, config.currency)}`, 20, summaryY + 5);
    doc.text(`Juros de Mora / Multas: ${formatCurrency(totalLateInterest, config.currency)}`, 20, summaryY + 10);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(black[0], black[1], black[2]);
    doc.text(`Total Liquidado: ${formatCurrency(totalPaid, config.currency)}`, 190, summaryY + 5, { align: 'right' });
    doc.text(`Saldo em Aberto: ${formatCurrency(remainingAmount, config.currency)}`, 190, summaryY + 11, { align: 'right' });

    // Rodapé
    const footY = 275;
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(150, 150, 150);
    doc.line(20, footY, 190, footY);
    doc.text("Documento gerado automaticamente pelo sistema Tango Gestão de Créditos.", 105, footY + 5, { align: 'center' });

    doc.save(`Extrato_Pagamentos_${credit.id || 'Credito'}_${formatDate(new Date())}.pdf`);
};

export const generateClientGeneralPaymentHistoryPDF = (
    client: any,
    credits: any[],
    payments: any[],
    settings?: any,
    userName?: string
) => {
    const doc = new jsPDF();
    const config = getCompanySettings(settings);
    const primaryColor = (config.primaryColor as [number, number, number]) || [255, 127, 0];
    const black = [30, 41, 59] as [number, number, number];

    applyBranding(doc, config, userName);

    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    const title = 'HISTÓRICO GERAL DE PAGAMENTOS DO CLIENTE';
    doc.text(title, 105, 45, { align: 'center' });

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(`Cliente: ${client.name || '-'}`, 20, 56);
    doc.text(`NIF / BI: ${client.nif || 'Não informado'}`, 20, 61);
    doc.text(`Telefone: ${client.phone || '-'}`, 20, 66);
    doc.text(`Morada: ${client.address || 'Não informado'}`, 20, 71);

    doc.text(`Data de Emissão: ${formatDateTime(new Date())}`, 190, 56, { align: 'right' });
    doc.text(`Total de Créditos: ${credits.length} contrato(s)`, 190, 61, { align: 'right' });
    doc.text(`Total de Pagamentos: ${payments.length} recibo(s)`, 190, 66, { align: 'right' });

    const totalLoaned = credits.reduce((acc, c) => acc + (c.principalAmount || c.amount || 0), 0);
    const totalPrincipalPaid = payments.reduce((acc, p) => acc + (p.allocatedToPrincipal || 0), 0);
    const totalInterestPaid = payments.reduce((acc, p) => acc + (p.allocatedToInterest || 0), 0);
    const totalLatePaid = payments.reduce((acc, p) => acc + (p.allocatedToLateInterest || 0), 0);
    const totalPaid = payments.reduce((acc, p) => acc + (p.amount || 0), 0);
    const totalDebt = credits.reduce((acc, c) => acc + (c.currentBalance || 0), 0);

    // Resumo em Caixas
    const boxY = 77;
    doc.setFillColor(245, 247, 250);
    doc.roundedRect(20, boxY, 170, 22, 2, 2, 'F');

    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text('TOTAL CONCEDIDO', 25, boxY + 7);
    doc.text('TOTAL PAGO', 72, boxY + 7);
    doc.text('SALDO DEVEDOR ATUAL', 120, boxY + 7);
    doc.text('AMORTIZAÇÃO', 165, boxY + 7);

    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(black[0], black[1], black[2]);
    doc.text(formatCurrency(totalLoaned, config.currency), 25, boxY + 16);
    doc.setTextColor(34, 197, 94);
    doc.text(formatCurrency(totalPaid, config.currency), 72, boxY + 16);
    doc.setTextColor(totalDebt > 0 ? 239 : 34, totalDebt > 0 ? 68 : 197, totalDebt > 0 ? 68 : 94);
    doc.text(formatCurrency(totalDebt, config.currency), 120, boxY + 16);
    doc.setTextColor(black[0], black[1], black[2]);
    const amortPerc = totalLoaned > 0 ? Math.min(100, (totalPrincipalPaid / totalLoaned) * 100) : 0;
    doc.text(`${amortPerc.toFixed(1)}%`, 165, boxY + 16);

    // Tabela de Histórico
    const sortedPayments = [...payments].sort((a, b) => new Date(b.paymentDate || b.date || b.createdAt).getTime() - new Date(a.paymentDate || a.date || a.createdAt).getTime());

    autoTable(doc, {
        startY: boxY + 28,
        head: [['Data', 'Crédito Ref.', 'Recibo', 'Método / Canal', 'Principal', 'Juros/Mora', 'Total Pago']],
        body: sortedPayments.map(p => {
            const methodLabel = p.method === 'cash' ? 'Numerário' :
                p.method === 'transfer' ? 'Transferência' :
                p.method === 'reference' ? 'Multicaixa Express' :
                p.method === 'deposit' ? 'Depósito Bancário' :
                p.method || 'Numerário';

            const channel = p.notes || p.bankName ? ` (${p.bankName || p.notes})` : '';

            return [
                formatDate(p.paymentDate || p.date || p.createdAt),
                p.creditId || '-',
                p.receiptNumber || p.id || '-',
                `${methodLabel}${channel}`,
                formatCurrency(p.allocatedToPrincipal || 0, config.currency),
                formatCurrency((p.allocatedToInterest || 0) + (p.allocatedToLateInterest || 0), config.currency),
                formatCurrency(p.amount || 0, config.currency)
            ];
        }),
        headStyles: {
            fillColor: primaryColor,
            textColor: [255, 255, 255],
            fontStyle: 'bold'
        },
        alternateRowStyles: {
            fillColor: [248, 250, 252]
        },
        styles: {
            fontSize: 8,
            cellPadding: 3
        },
        didDrawPage: () => applyBranding(doc, config, userName, true)
    });

    const finalY = (doc as any).lastAutoTable?.finalY || 200;
    const summaryY = Math.min(finalY + 10, 250);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 116, 139);
    doc.text(`Amortização de Capital: ${formatCurrency(totalPrincipalPaid, config.currency)}`, 20, summaryY);
    doc.text(`Juros Ordinários: ${formatCurrency(totalInterestPaid, config.currency)}`, 20, summaryY + 5);
    doc.text(`Juros de Mora / Penalizações: ${formatCurrency(totalLatePaid, config.currency)}`, 20, summaryY + 10);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(black[0], black[1], black[2]);
    doc.text(`Total Amortizado + Juros: ${formatCurrency(totalPaid, config.currency)}`, 190, summaryY + 5, { align: 'right' });
    doc.text(`Saldo Devedor Consolidado: ${formatCurrency(totalDebt, config.currency)}`, 190, summaryY + 11, { align: 'right' });

    const footY = 275;
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(150, 150, 150);
    doc.line(20, footY, 190, footY);
    doc.text("Extrato geral emitido automaticamente pelo sistema Tango Gestão de Créditos ERP.", 105, footY + 5, { align: 'center' });

    doc.save(`Extrato_Geral_Pagamentos_${(client.name || 'Cliente').replace(/\s+/g, '_')}_${formatDate(new Date())}.pdf`);
};

export const generateDailyCashFlowPDF = (
    dateStr: string,
    outflows: Array<{ clientName: string; creditId: string; amount: number; method?: string; time?: string }>,
    inflows: Array<{ clientName: string; receiptId: string; amount: number; method?: string; time?: string }>,
    summary: { totalOut: number; totalIn: number; net: number },
    settings?: any,
    userName?: string
) => {
    const doc = new jsPDF();
    const config = getCompanySettings(settings);
    const orange = (config.primaryColor as [number, number, number]) || [255, 127, 0];
    const black = [30, 41, 59] as [number, number, number];

    applyBranding(doc, config, userName);

    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    const title = 'RELATÓRIO DIÁRIO DE FLUXO DE CAIXA: SAÍDAS VS ENTRADAS';
    doc.text(title, 105, 45, { align: 'center' });

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(`Data de Referência: ${dateStr}`, 20, 56);
    doc.text(`Data de Emissão: ${formatDateTime(new Date())}`, 190, 56, { align: 'right' });

    // Caixas de Resumo
    const boxY = 64;
    doc.setFillColor(245, 247, 250);
    doc.roundedRect(20, boxY, 170, 20, 2, 2, 'F');

    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text('TOTAL SAÍDAS (DESEMBOLSOS)', 25, boxY + 6);
    doc.text('TOTAL ENTRADAS (PAGAMENTOS)', 82, boxY + 6);
    doc.text('BALANÇO LÍQUIDO DO DIA', 140, boxY + 6);

    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(239, 68, 68); // Red
    doc.text(formatCurrency(summary.totalOut, config.currency), 25, boxY + 14);
    doc.setTextColor(34, 197, 94); // Green
    doc.text(formatCurrency(summary.totalIn, config.currency), 82, boxY + 14);
    doc.setTextColor(summary.net >= 0 ? 34 : 239, summary.net >= 0 ? 197 : 68, summary.net >= 0 ? 94 : 68);
    doc.text(formatCurrency(summary.net, config.currency), 140, boxY + 14);

    let currentY = boxY + 28;

    // Tabela 1: Saídas
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(black[0], black[1], black[2]);
    doc.text(`1. Saídas do Dia (${outflows.length} operações)`, 20, currentY);

    autoTable(doc, {
        startY: currentY + 4,
        head: [['Horário', 'Beneficiário / Cliente', 'Crédito Ref.', 'Forma de Desembolso', 'Montante']],
        body: outflows.length === 0 ? [['-', 'Nenhuma saída registada nesta data', '-', '-', '-']] : outflows.map(o => [
            o.time || '-',
            o.clientName,
            o.creditId,
            o.method || 'Transferência',
            formatCurrency(o.amount, config.currency)
        ]),
        headStyles: {
            fillColor: [239, 68, 68],
            textColor: [255, 255, 255],
            fontStyle: 'bold'
        },
        styles: { fontSize: 8, cellPadding: 2.5 },
        theme: 'striped',
        didDrawPage: () => applyBranding(doc, config, userName, true)
    });

    currentY = (doc as any).lastAutoTable?.finalY + 12 || currentY + 40;

    // Tabela 2: Entradas
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(black[0], black[1], black[2]);
    doc.text(`2. Entradas do Dia (${inflows.length} pagamentos)`, 20, currentY);

    autoTable(doc, {
        startY: currentY + 4,
        head: [['Horário', 'Cliente Pagador', 'Recibo / Ref.', 'Método de Pagamento', 'Montante']],
        body: inflows.length === 0 ? [['-', 'Nenhuma entrada registada nesta data', '-', '-', '-']] : inflows.map(i => [
            i.time || '-',
            i.clientName,
            i.receiptId,
            i.method || 'Numerário',
            formatCurrency(i.amount, config.currency)
        ]),
        headStyles: {
            fillColor: [34, 197, 94],
            textColor: [255, 255, 255],
            fontStyle: 'bold'
        },
        styles: { fontSize: 8, cellPadding: 2.5 },
        theme: 'striped',
        didDrawPage: () => applyBranding(doc, config, userName, true)
    });

    const footY = 275;
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(150, 150, 150);
    doc.line(20, footY, 190, footY);
    doc.text("Relatório de tesouraria diária gerado pelo sistema Tango Gestão de Créditos ERP.", 105, footY + 5, { align: 'center' });

    doc.save(`Fluxo_Diario_${dateStr.replace(/[\/\s:]/g, '_')}.pdf`);
};

export const generateUserActivityPDF = (
    userId: string,
    userName: string,
    logs: any[],
    settings?: any,
    generatedBy?: string
) => {
    const doc = new jsPDF();
    const config = getCompanySettings(settings);
    const orange = (config.primaryColor as [number, number, number]) || [255, 127, 0];
    const black = [30, 41, 59] as [number, number, number];

    applyBranding(doc, config, generatedBy);

    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    const title = 'RELATÓRIO DE ATIVIDADE DO UTILIZADOR';
    doc.text(title, 105, 45, { align: 'center' });

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Utilizador: ${userName}`, 20, 58);
    doc.text(`ID do Utilizador: ${userId}`, 20, 63);
    doc.text(`Total de Ações Registadas: ${logs.length}`, 20, 68);
    doc.text(`Data de Emissão: ${formatDateTime(new Date())}`, 20, 73);

    autoTable(doc, {
        startY: 80,
        head: [['Data/Hora', 'Ação', 'Entidade', 'Descrição', 'IP']],
        body: logs.map(log => [
            formatDateTime(log.createdAt || log.timestamp),
            (log.action || '').toUpperCase(),
            (log.entity || log.targetType || '-').toUpperCase(),
            log.details || log.description || '-',
            log.ip || 'Local'
        ]),
        headStyles: {
            fillColor: orange,
            textColor: [255, 255, 255],
            fontStyle: 'bold'
        },
        alternateRowStyles: {
            fillColor: [248, 250, 252]
        },
        styles: {
            fontSize: 8,
            cellPadding: 3
        },
        didDrawPage: () => applyBranding(doc, config, generatedBy, true)
    });

    const y = 275;
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(150, 150, 150);
    doc.line(20, y, 190, y);
    doc.text("Documento gerado automaticamente pelo sistema Tango Gestão de Créditos.", 105, y + 5, { align: 'center' });

    doc.save(`Relatorio_Atividade_${userName.replace(/\s+/g, '_')}_${formatDate(new Date())}.pdf`);
};

export const generateUserProfilePDF = (targetUser: any, settings?: any, generatedBy?: string) => {
    const doc = new jsPDF();
    const config = getCompanySettings(settings);
    const orange = (config.primaryColor as [number, number, number]) || [255, 127, 0];
    const black = [30, 41, 59] as [number, number, number];

    applyBranding(doc, config, generatedBy);

    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    const title = 'FICHA DETALHADA DO UTILIZADOR';
    const splitTitle = doc.splitTextToSize(title, 170);
    doc.text(splitTitle, 105, 45, { align: 'center' });

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 100, 100);
    doc.text(`Documento gerado em: ${formatDateTime(new Date())}`, 105, 52, { align: 'center' });

    // Informação Principal
    autoTable(doc, {
        startY: 60,
        head: [[{ content: 'IDENTIFICAÇÃO E DADOS DE ACESSO', colSpan: 2, styles: { halign: 'center', fillColor: black } }]],
        body: [
            ['Nome Completo:', targetUser.name],
            ['E-mail / Login:', targetUser.email],
            ['Cargo / Nível:', targetUser.role === 'super_admin' ? 'SUPER ADMINISTRADOR' : targetUser.role === 'admin' ? 'ADMINISTRADOR' : 'GESTOR DE CRÉDITO'],
            ['Status de Ligação:', targetUser.status === 'active' ? 'ONLINE / ATIVO' : targetUser.status === 'blocked' ? 'BLOQUEADO' : 'OFFLINE'],
            ['IP da Máquina (Último):', targetUser.ip || 'Não Registado'],
            ['Último Acesso:', targetUser.lastLogin ? formatDateTime(targetUser.lastLogin) : 'Nunca'],
            ['Membro Desde:', targetUser.createdAt ? formatDate(targetUser.createdAt) : 'N/A']
        ],
        theme: 'grid',
        styles: { fontSize: 10, cellPadding: 3 },
        columnStyles: {
            0: { cellWidth: 60, fontStyle: 'bold', fillColor: [245, 245, 245] }
        },
        didDrawPage: () => applyBranding(doc, config, generatedBy, true)
    });

    // Permissões
    const userPermissions = targetUser.permissions || [];
    const permissionLabels = AVAILABLE_PERMISSIONS
        .filter(p => userPermissions.includes(p.id))
        .map(p => p.label);

    autoTable(doc, {
        startY: (doc as any).lastAutoTable.finalY + 15,
        head: [[{ content: 'PRIVILÉGIOS E PERMISSÕES NO SISTEMA', colSpan: 2, styles: { halign: 'center', fillColor: orange } }]],
        body: [
            ['Nível de Acesso:', targetUser.role.toUpperCase()],
            ['Permissões Ativas:', targetUser.role === 'super_admin' ? 'ACESSO TOTAL E IRRESTRITO A TODAS AS FUNCIONALIDADES' : (permissionLabels.length > 0 ? permissionLabels.join(', ') : 'SEM PERMISSÕES ESPECÍFICAS ATRIBUÍDAS')]
        ],
        theme: 'grid',
        styles: { fontSize: 9, cellPadding: 3 },
        columnStyles: {
            0: { cellWidth: 60, fontStyle: 'bold', fillColor: [245, 245, 245] }
        },
        didDrawPage: () => applyBranding(doc, config, generatedBy, true)
    });

    // Assinaturas e Validação
    const y = 240;
    doc.setDrawColor(200, 200, 200);
    doc.line(25, y, 90, y);
    doc.line(120, y, 185, y);

    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    doc.text('ASSINATURA DO UTILIZADOR', 57, y + 5, { align: 'center' });
    doc.text('CARIMBO E ASSINATURA DA ADMINISTRAÇÃO', 152, y + 5, { align: 'center' });

    // Rodapé de Confidencialidade
    doc.setFontSize(7);
    doc.setTextColor(150, 150, 150);
    const disclaimer = "ESTE DOCUMENTO CONTÉM INFORMAÇÕES CONFIDENCIAIS E PRIVILEGIADAS. O SEU USO É ESTRITAMENTE PROFISSIONAL E PARA EFEITOS DE AUDITORIA INTERNA NA TANGO GESTÃO E CRÉDITOS ERP.";
    const splitDisclaimer = doc.splitTextToSize(disclaimer, 160);
    doc.text(splitDisclaimer, 105, 275, { align: 'center' });

    doc.save(`Ficha_Utilizador_${targetUser.name.replace(/\s+/g, '_')}.pdf`);
};

export const generateNotificationsReportPDF = (notifications: any[], settings?: any, userName?: string, customTitle?: string) => {
    const doc = new jsPDF();
    const config = getCompanySettings(settings);
    const orange = (config.primaryColor as [number, number, number]) || [255, 127, 0];
    const black = [30, 41, 59] as [number, number, number];

    applyBranding(doc, config, userName);

    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    const title = customTitle || 'RELATÓRIO DE NOTIFICAÇÕES';
    const splitTitle = doc.splitTextToSize(title, 170);
    doc.text(splitTitle, 105, 55, { align: 'center' });

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(120, 120, 120);
    doc.text(`Emissão: ${formatDateTime(new Date())}`, 105, 62, { align: 'center' });
    if (userName) doc.text(`Solicitado por: ${userName}`, 105, 67, { align: 'center' });

    const typeT: any = { 'info': 'Informação', 'warning': 'Aviso', 'error': 'Erro', 'success': 'Sucesso' };

    autoTable(doc, {
        startY: 75,
        head: [['Data/Hora', 'Título', 'Tipo', 'Mensagem']],
        body: notifications.map(n => [
            formatDateTime(n.timestamp),
            n.title,
            typeT[n.type] || n.type,
            n.message
        ]),
        headStyles: { fillColor: orange as [number, number, number] },
        styles: { fontSize: 8, cellPadding: 2 },
        columnStyles: {
            0: { cellWidth: 35 },
            1: { cellWidth: 40, fontStyle: 'bold' },
            2: { cellWidth: 20 },
            3: { cellWidth: 'auto' }
        },
        didDrawPage: () => applyBranding(doc, config, userName, true)
    });


    const fileName = customTitle ? `Notificacoes_${customTitle.replace(/\s+/g, '_')}.pdf` : `Relatorio_Notificacoes_${Date.now()}.pdf`;
    doc.save(fileName);
};

/**
 * Gera relatório PDF de todos os clientes com pontuação
 */
export const generateClientListReport = (
    clientsWithScores: Array<{ client: any; scoreData: any }>,
    settings?: any,
    userName?: string
) => {
    const doc = new jsPDF();
    const config = getCompanySettings(settings);
    const orange = (config.primaryColor as [number, number, number]) || [255, 127, 0];

    applyBranding(doc, config, userName);

    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    const title = 'RELATÓRIO DE CLIENTES';
    const splitTitle = doc.splitTextToSize(title, 170);
    doc.text(splitTitle, 105, 55, { align: 'center' });

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(120, 120, 120);
    doc.text(`Total de Clientes: ${clientsWithScores.length}`, 105, 62, { align: 'center' });
    doc.text(`Emissão: ${formatDateTime(new Date())}`, 105, 67, { align: 'center' });

    autoTable(doc, {
        startY: 75,
        head: [['Cliente', 'Créditos', 'Contratos', 'Pagamentos (Dia/Atraso)', 'Pontuação', 'Classificação']],
        body: clientsWithScores.map(({ client, scoreData }) => [
            client.name,
            scoreData.metrics.totalCredits.toString(),
            scoreData.metrics.totalContracts.toString(),
            `${scoreData.metrics.paymentsOnTime} / ${scoreData.metrics.latePayments}`,
            scoreData.score.toString(),
            scoreData.rating
        ]),
        headStyles: { fillColor: orange as [number, number, number] },
        styles: { fontSize: 8, cellPadding: 2 },
        columnStyles: {
            0: { cellWidth: 50, fontStyle: 'bold' },
            1: { cellWidth: 20, halign: 'center' },
            2: { cellWidth: 20, halign: 'center' },
            3: { cellWidth: 35, halign: 'center' },
            4: { cellWidth: 25, halign: 'center', fontStyle: 'bold' },
            5: { cellWidth: 30, halign: 'center' }
        },
        didDrawPage: () => applyBranding(doc, config, userName, true)
    });

    doc.save(`Relatorio_Clientes_${Date.now()}.pdf`);
};

/**
 * Gera relatório PDF de clientes ativos
 */
export const generateActiveClientsReport = (
    activeClientsData: Array<{
        client: any;
        activeCredits: any[];
        totalDue: number;
        nextDueDate: Date | null;
        oldestCreditDate: Date | null;
        hasOverdue: boolean;
    }>,
    settings?: any,
    userName?: string
) => {
    const doc = new jsPDF();
    const config = getCompanySettings(settings);
    const orange = (config.primaryColor as [number, number, number]) || [255, 127, 0];

    applyBranding(doc, config, userName);

    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    const title = 'RELATÓRIO DE CLIENTES ATIVOS';
    const splitTitle = doc.splitTextToSize(title, 170);
    doc.text(splitTitle, 105, 55, { align: 'center' });

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(120, 120, 120);
    doc.text(`Total de Clientes Ativos: ${activeClientsData.length}`, 105, 62, { align: 'center' });
    doc.text(`Emissão: ${formatDateTime(new Date())}`, 105, 67, { align: 'center' });

    autoTable(doc, {
        startY: 75,
        head: [['Cliente', 'Contratos Ativos', 'Início', 'Próximo Vencimento', 'Valor em Dívida', 'Status']],
        body: activeClientsData.map(({ client, activeCredits, totalDue, nextDueDate, oldestCreditDate, hasOverdue }) => [
            client.name,
            activeCredits.length.toString(),
            oldestCreditDate ? formatDate(oldestCreditDate) : 'N/A',
            nextDueDate ? formatDate(nextDueDate) : 'N/A',
            formatCurrency(totalDue),
            hasOverdue ? 'ATRASADO' : 'EM DIA'
        ]),
        headStyles: { fillColor: orange as [number, number, number] },
        styles: { fontSize: 8, cellPadding: 2 },
        columnStyles: {
            0: { cellWidth: 45, fontStyle: 'bold' },
            1: { cellWidth: 25, halign: 'center' },
            2: { cellWidth: 25, halign: 'center' },
            3: { cellWidth: 30, halign: 'center' },
            4: { cellWidth: 30, halign: 'right' },
            5: { cellWidth: 25, halign: 'center', fontStyle: 'bold' }
        },
        didDrawPage: () => applyBranding(doc, config, userName, true)
    });

    doc.save(`Relatorio_Clientes_Ativos_${Date.now()}.pdf`);
};

/**
 * Gera relatório PDF de clientes bloqueados
 */
export const generateBlockedClientsReport = (
    blockedClients: any[],
    settings?: any,
    userName?: string
) => {
    const doc = new jsPDF();
    const config = getCompanySettings(settings);
    const orange = (config.primaryColor as [number, number, number]) || [255, 127, 0];

    applyBranding(doc, config, userName);

    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    const title = 'RELATÓRIO DE CLIENTES BLOQUEADOS';
    const splitTitle = doc.splitTextToSize(title, 170);
    doc.text(splitTitle, 105, 55, { align: 'center' });

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(120, 120, 120);
    doc.text(`Total de Clientes Bloqueados: ${blockedClients.length}`, 105, 62, { align: 'center' });
    doc.text(`Emissão: ${formatDateTime(new Date())}`, 105, 67, { align: 'center' });

    autoTable(doc, {
        startY: 75,
        head: [['Cliente', 'Telefone', 'Motivo do Bloqueio', 'Data de Bloqueio', 'Bloqueado Por']],
        body: blockedClients.map(client => [
            client.name,
            client.phone || 'N/A',
            client.blockReason || 'Motivo não especificado',
            client.blockedAt ? formatDateTime(client.blockedAt) : 'N/A',
            client.blockedBy || 'Sistema'
        ]),
        headStyles: { fillColor: [185, 28, 28] as [number, number, number] }, // red-700
        styles: { fontSize: 8, cellPadding: 2 },
        columnStyles: {
            0: { cellWidth: 40, fontStyle: 'bold' },
            1: { cellWidth: 30 },
            2: { cellWidth: 60 },
            3: { cellWidth: 30, halign: 'center' },
            4: { cellWidth: 30, halign: 'center' }
        },
        didDrawPage: () => applyBranding(doc, config, userName, true)
    });

    doc.save(`Relatorio_Clientes_Bloqueados_${Date.now()}.pdf`);
};

/**
 * Gera uma ficha informativa do cliente em PDF para envio por email
 */
export const generateClientInfoSheetPDF = (
    client: any,
    settings?: any,
    userName?: string
) => {
    const doc = new jsPDF();
    const config = getCompanySettings(settings);
    const orange = (config.primaryColor as [number, number, number]) || [255, 127, 0];
    const black = [30, 41, 59] as [number, number, number];

    applyBranding(doc, config, userName);

    // Título
    doc.setTextColor(black[0], black[1], black[2]);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.text("FICHA DE CLIENTE", 105, 45, { align: 'center' });

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 100, 100);
    doc.text(`Gerado em: ${formatDateTime(new Date())}`, 105, 52, { align: 'center' });

    let currentY = 65;

    // Dados Pessoais
    doc.setFillColor(245, 245, 245);
    doc.rect(20, currentY, 170, 8, 'F');
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(black[0], black[1], black[2]);
    doc.text("DADOS DE IDENTIFICAÇÃO", 25, currentY + 5.5);
    currentY += 15;

    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text("Nome Completo:", 25, currentY);
    doc.setFont("helvetica", "normal");
    doc.text(client.name, 70, currentY);
    currentY += 7;

    doc.setFont("helvetica", "bold");
    doc.text("NIF / BI:", 25, currentY);
    doc.setFont("helvetica", "normal");
    doc.text(client.nif || 'N/A', 70, currentY);
    currentY += 7;

    doc.setFont("helvetica", "bold");
    doc.text("Telefone:", 25, currentY);
    doc.setFont("helvetica", "normal");
    doc.text(client.phone || 'N/A', 70, currentY);
    currentY += 7;

    doc.setFont("helvetica", "bold");
    doc.text("Email:", 25, currentY);
    doc.setFont("helvetica", "normal");
    doc.text(client.email || 'N/A', 70, currentY);
    currentY += 7;

    doc.setFont("helvetica", "bold");
    doc.text("Endereço:", 25, currentY);
    doc.setFont("helvetica", "normal");
    doc.text(client.address || 'N/A', 70, currentY);
    currentY += 15;

    // Condições Comerciais
    doc.setFillColor(245, 245, 245);
    doc.rect(20, currentY, 170, 8, 'F');
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(black[0], black[1], black[2]);
    doc.text("CONDIÇÕES COMERCIAIS", 25, currentY + 5.5);
    currentY += 15;

    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text("Estado da Conta:", 25, currentY);

    // Status color
    if (client.status === 'active') doc.setTextColor(0, 128, 0);
    else if (client.status === 'blocked') doc.setTextColor(200, 0, 0);
    else doc.setTextColor(100, 100, 100);

    doc.setFont("helvetica", "bold");
    doc.text(client.status === 'active' ? 'ATIVO' : client.status === 'blocked' ? 'BLOQUEADO' : 'INATIVO', 70, currentY);

    doc.setTextColor(black[0], black[1], black[2]);
    currentY += 7;

    doc.setFont("helvetica", "bold");
    doc.text("Limite de Crédito:", 25, currentY);
    doc.setFont("helvetica", "normal");
    doc.text(formatCurrency(client.creditLimit || 0, config.currency), 70, currentY);
    currentY += 7;

    doc.setFont("helvetica", "bold");
    doc.text("Método de Pagamento:", 25, currentY);
    doc.setFont("helvetica", "normal");
    doc.text(client.receiveMethod === 'transfer' ? 'Transferência Bancária' : 'Numerário', 70, currentY);
    currentY += 15;

    // Coordenadas Bancárias (Se houver)
    if (client.bankCoordinates && client.bankCoordinates.length > 0) {
        doc.setFillColor(245, 245, 245);
        doc.rect(20, currentY, 170, 8, 'F');
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.setTextColor(black[0], black[1], black[2]);
        doc.text("COORDENADAS BANCÁRIAS REGISTADAS", 25, currentY + 5.5);
        currentY += 12;

        autoTable(doc, {
            startY: currentY,
            head: [['Banco', 'IBAN', 'Titular']],
            body: client.bankCoordinates.map((b: any) => [b.bankName, b.iban, b.holder]),
            headStyles: { fillColor: orange },
            styles: { fontSize: 9 },
            theme: 'striped'
        });

        currentY = (doc as any).lastAutoTable.finalY + 15;
    }

    // Rodapé Legal
    const footerY = 270;
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text("Documento processado por Tango Gestão de Créditos.", 105, footerY, { align: 'center' });

    // Retornar como Blob para anexo ou Salvar se for download direto
    return doc;
};

/**
 * Gera uma proposta de simulação de crédito em PDF
 */
export const generateSimulationPDF = (
    simulationData: {
        rows: any[],
        totalInterest: number,
        totalPayment: number,
        totalUpfrontCosts: number,
        totalCost: number,
        cetTotal: number
    },
    clientInfo: {
        name: string,
        income: number,
        requestedAmount: number,
        term: number,
        interestRate: number,
        method: string,
        reference?: string
    },
    settings?: any,
    userName?: string,
    aiAnalysis?: any
) => {
    const doc = new jsPDF();
    const config = getCompanySettings(settings);
    const orange = (config.primaryColor as [number, number, number]) || [255, 127, 0];
    const black = [30, 41, 59] as [number, number, number];

    applyBranding(doc, config, userName);

    // Título Proposta
    doc.setTextColor(black[0], black[1], black[2]);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.text("PROPOSTA DE CRÉDITO", 105, 45, { align: 'center' });

    if (clientInfo.reference) {
        doc.setFont("helvetica", "bolditalic");
        doc.setFontSize(11);
        doc.setTextColor(orange[0], orange[1], orange[2]);
        doc.text(`Ref: ${clientInfo.reference}`, 105, 52, { align: 'center' });
    }

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 100, 100);
    doc.text(`Simulação gerada em: ${formatDateTime(new Date())}`, 105, 58, { align: 'center' });
    if (userName) doc.text(`Consultor: ${userName}`, 105, 63, { align: 'center' });

    let currentY = 72;

    // --- AI ANALYSIS SECTION ---
    if (aiAnalysis) {
        const statusColors: any = {
            'safe': [22, 163, 74],      // Green 600
            'warning': [217, 119, 6],   // Amber 600
            'danger': [220, 38, 38]     // Red 600
        };
        const color = statusColors[aiAnalysis.status] || [71, 85, 105];

        // Background box with solid border and very light fill for clarity
        doc.setDrawColor(color[0], color[1], color[2]);
        doc.setLineWidth(0.3);
        doc.setFillColor(250, 250, 250); // Very light grey instead of color-based fill
        doc.rect(20, currentY, 170, 28, 'FD');

        doc.setFont("helvetica", "bolditalic");
        doc.setFontSize(11);
        doc.setTextColor(color[0], color[1], color[2]);
        doc.text("ANÁLISE INTELIGENTE TANGO", 25, currentY + 8);

        doc.setFont("helvetica", "italic");
        doc.setFontSize(10);
        doc.setTextColor(30, 41, 59); // Dark slate for maximum contrast
        const wrappedMsg = doc.splitTextToSize(aiAnalysis.message, 160);
        doc.text(wrappedMsg, 25, currentY + 14);

        currentY += 35;
    }

    // Dados do Cliente (Se houver)
    if (clientInfo.name) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(12);
        doc.setTextColor(orange[0], orange[1], orange[2]);
        doc.text("DADOS DO CLIENTE", 20, currentY);

        autoTable(doc, {
            startY: currentY + 5,
            body: [
                ['Nome do Cliente:', clientInfo.name.toUpperCase()],
                ['Rendimento Mensal Declarado:', clientInfo.income > 0 ? formatCurrency(clientInfo.income, config.currency) : 'Não informado'],
                ['Comprometimento (DTI):', aiAnalysis ? `${aiAnalysis.dti.toFixed(1)}%` : 'N/A']
            ],
            theme: 'plain',
            styles: { fontSize: 10, cellPadding: 2 },
            columnStyles: {
                0: { cellWidth: 60, fontStyle: 'bold' }
            }
        });
        currentY = (doc as any).lastAutoTable.finalY + 10;
    }

    // --- FINANCIAL CHART (Projected vs Income) ---
    // Mirroring the image: Clustered bar chart for first 6 months
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(orange[0], orange[1], orange[2]);
    doc.text("GRÁFICO FINANCEIRO - PROJEÇÃO MENSAL", 20, currentY);

    const chartX = 25;
    const chartY = currentY + 45;
    const chartWidth = 160;
    const chartHeight = 35;
    const monthsToShow = Math.min(6, clientInfo.term);

    // Draw Axis
    doc.setDrawColor(200, 200, 200);
    doc.line(chartX, chartY, chartX + chartWidth, chartY); // X axis

    const barSpace = chartWidth / monthsToShow;
    const maxVal = Math.max(clientInfo.income, ...simulationData.rows.slice(0, monthsToShow).map(r => r.payment)) * 1.2;

    for (let i = 0; i < monthsToShow; i++) {
        const xPos = chartX + (i * barSpace) + (barSpace / 4);
        const incomeH = (clientInfo.income / maxVal) * chartHeight;
        const paymentH = (simulationData.rows[i].payment / maxVal) * chartHeight;

        // Draw Income Bar (Dark Blue)
        doc.setFillColor(30, 41, 59);
        doc.rect(xPos, chartY - incomeH, barSpace / 4, incomeH, 'F');

        // Draw Payment Bar (Orange/Gold)
        doc.setFillColor(orange[0], orange[1], orange[2]);
        doc.rect(xPos + (barSpace / 4) + 1, chartY - paymentH, barSpace / 4, paymentH, 'F');

        // Month Label
        doc.setFontSize(7);
        doc.setTextColor(100, 100, 100);
        doc.text(`Mês ${i + 1}`, xPos + 2, chartY + 5);
    }

    // Legend
    doc.setFontSize(8);
    doc.setFillColor(30, 41, 59);
    doc.rect(130, currentY + 5, 3, 3, 'F');
    doc.text("Rendimento", 135, currentY + 8);
    doc.setFillColor(orange[0], orange[1], orange[2]);
    doc.rect(160, currentY + 5, 3, 3, 'F');
    doc.text("Parcela", 165, currentY + 8);

    currentY += 60;

    // Resumo da Simulação
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(orange[0], orange[1], orange[2]);
    doc.text("RESUMO DA OPERAÇÃO", 20, currentY);

    autoTable(doc, {
        startY: currentY + 5,
        head: [['Parâmetro', 'Valor']],
        body: [
            ['Valor do Crédito Solicitado', formatCurrency(clientInfo.requestedAmount, config.currency)],
            ['Prazo de Pagamento', `${clientInfo.term} meses`],
            ['Taxa de Juros Mensal', `${clientInfo.interestRate.toFixed(2)}%`],
            ['Sistema de Amortização', clientInfo.method === 'price' ? 'PRICE (Parcelas Fixas)' : 'SAC (Amortização Constante)'],
            ['Total de Juros', formatCurrency(simulationData.totalInterest, config.currency)],
            ['Custo Efetivo Total (CET)', `${simulationData.cetTotal.toFixed(2)}%`],
            ['TOTAL A PAGAR', formatCurrency(simulationData.totalPayment, config.currency)]
        ],
        theme: 'grid',
        headStyles: { fillColor: black },
        styles: { fontSize: 10, cellPadding: 4 },
        columnStyles: {
            0: { fontStyle: 'bold', cellWidth: 80 },
            1: { halign: 'right' }
        },
        didParseCell: (data: any) => {
            if (data.section === 'body') {
                if (data.row.index === 0) { // Valor do Crédito
                    data.cell.styles.fillColor = [232, 245, 233]; // Verde Bebé
                } else if (data.row.index === 1) { // Prazo
                    data.cell.styles.fillColor = [255, 249, 196]; // Amarelo
                } else if (data.row.index === 2 || data.row.index === 4) { // Juros (Taxa e Total)
                    data.cell.styles.fillColor = [225, 245, 254]; // Azul Bebé
                } else if (data.row.index === 6) { // TOTAL A PAGAR
                    data.cell.styles.fillColor = [200, 230, 201]; // Verde
                    data.cell.styles.fontStyle = 'bold';
                }
            }
        },
        didDrawPage: () => applyBranding(doc, config, userName, true)
    });

    currentY = (doc as any).lastAutoTable.finalY + 15;

    // Check page break for Schedule
    if (currentY > 210) {
        doc.addPage();
        applyBranding(doc, config, userName, true);
        currentY = 40;
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(orange[0], orange[1], orange[2]);
    doc.text("PLANO DE REEMBOLSO PREVISTO", 20, currentY);

    autoTable(doc, {
        startY: currentY + 5,
        head: [['Mês', 'Prestação', 'Juros', 'Amortização', 'Saldo Devedor']],
        body: simulationData.rows.map(row => [
            `${row.month}º`,
            formatCurrency(row.payment, config.currency),
            formatCurrency(row.interest, config.currency),
            formatCurrency(row.amortization, config.currency),
            formatCurrency(row.balance, config.currency)
        ]),
        headStyles: { fillColor: orange },
        theme: 'grid',
        styles: { fontSize: 9, cellPadding: 2 },
        columnStyles: {
            0: { halign: 'center', cellWidth: 20 },
            1: { halign: 'right' },
            2: { halign: 'right' },
            3: { halign: 'right' },
            4: { halign: 'right', fontStyle: 'bold' }
        },
        didDrawPage: () => applyBranding(doc, config, userName, true)
    });

    // Disclaimer
    const finalY = (doc as any).lastAutoTable.finalY + 20;
    const pageHeight = doc.internal.pageSize.height;
    if (finalY < pageHeight - 30) {
        doc.setFontSize(8);
        doc.setTextColor(150, 150, 150);
        doc.setFont("helvetica", "normal");
        const disclaimer = "Atenção: Esta simulação não garante a aprovação do crédito. Os valores apresentados são estimativos baseados na análise de risco Tango AI. A concessão definitiva depende da entrega de documentação e validação física.";
        doc.text(doc.splitTextToSize(disclaimer, 170), 20, finalY);
    }

    doc.save(`Simulacao_TangoAI_${clientInfo.name ? clientInfo.name.replace(/\s+/g, '_') : 'Proposta'}_${Date.now()}.pdf`);
};


export const generateMonthlyConsolidationReport = (
    closedMonth: {
        id: string;
        month: number;
        year: number;
        capitalApplied: number;
        projectedProfit: number;
        realizedProfit: number;
        overdueAmount: number;
        liquidationRate: number;
        closedAt: string;
        closedBy: string;
    },
    credits: any[],
    settings?: any,
    userName?: string
) => {
    try {
        const doc = new jsPDF({ orientation: 'landscape' });
        const config = getCompanySettings(settings);
        const orange = (config.primaryColor as [number, number, number]) || [255, 127, 0];
        const black = [30, 41, 59] as [number, number, number];
        const pageWidth = doc.internal.pageSize.width;
        const pageHeight = doc.internal.pageSize.height;

        applyBranding(doc, config, userName);

        doc.setTextColor(black[0], black[1], black[2]);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(18);
        doc.text('RELATÓRIO DE CONSOLIDAÇÃO MENSAL', pageWidth / 2, 45, { align: 'center' });

        const MONTH_FULL_NAMES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
        const monthLabel = MONTH_FULL_NAMES[closedMonth.month] || `Mês ${closedMonth.month + 1}`;

        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(100, 100, 100);
        doc.text(`Período de Referência: ${monthLabel} de ${closedMonth.year}`, pageWidth / 2, 52, { align: 'center' });
        doc.text(`Consolidado em: ${formatDateTime(new Date(closedMonth.closedAt))} por ${closedMonth.closedBy}`, pageWidth / 2, 57, { align: 'center' });

        // Seção: Indicadores Consolidados
        doc.setFontSize(12);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(orange[0], orange[1], orange[2]);
        doc.text("INDICADORES FINANCEIROS CONSOLIDADOS", 20, 70);

        autoTable(doc, {
            startY: 75,
            head: [['Indicador', 'Valor']],
            body: [
                ['Capital Total Aplicado (Saídas)', formatCurrency(closedMonth.capitalApplied, config.currency)],
                ['Lucro Total Projetado (Juros Projetados)', formatCurrency(closedMonth.projectedProfit, config.currency)],
                ['Lucro Realizado (Juros Pagos - Caixa)', formatCurrency(closedMonth.realizedProfit, config.currency)],
                ['Créditos em Incumprimento / Atraso', formatCurrency(closedMonth.overdueAmount, config.currency)],
                ['Taxa de Liquidação de Capital', `${closedMonth.liquidationRate.toFixed(2)}%`]
            ],
            theme: 'striped',
            headStyles: { fillColor: black as [number, number, number] },
            styles: { fontSize: 10, cellPadding: 5 }
        });

        let finalY = (doc as any).lastAutoTable?.finalY || 140;

        // Tabela de Créditos
        doc.setFontSize(12);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(orange[0], orange[1], orange[2]);
        doc.text("CARTEIRA DE CRÉDITOS DO PERÍODO", 20, finalY + 15);

        const monthCredits = credits.filter(c => {
            if (c.deletedAt) return false;
            if (c.targetMonthId) {
                const [y, mStr] = c.targetMonthId.split('-');
                return parseInt(y) === closedMonth.year && (parseInt(mStr) - 1) === closedMonth.month;
            }
            const d = new Date(c.startDate || c.createdAt);
            return d.getMonth() === closedMonth.month && d.getFullYear() === closedMonth.year;
        });

        const statusLabelMap: Record<string, string> = {
            active: 'Ativo',
            overdue: 'Em Atraso',
            paid: 'Pago',
            renegotiated: 'Renegociado',
            defaulted: 'Incumprimento',
            pending_approval: 'Pendente',
            rejected: 'Rejeitado',
            cancelled: 'Cancelado'
        };

        const creditRows = monthCredits.map(c => [
            c.id,
            c.clientName,
            formatCurrency(c.principalAmount, config.currency),
            formatCurrency(c.accruedInterest, config.currency),
            formatCurrency(c.currentBalance, config.currency),
            statusLabelMap[c.status] || c.status.toUpperCase()
        ]);

        autoTable(doc, {
            startY: finalY + 20,
            head: [['ID Crédito', 'Cliente', 'Capital Base', 'Juros', 'Saldo Atual', 'Estado']],
            body: creditRows.length > 0 ? creditRows : [['-', 'Nenhum crédito registado neste período.', '-', '-', '-', '-']],
            theme: 'striped',
            headStyles: { fillColor: black as [number, number, number] },
            styles: { fontSize: 9, cellPadding: 4 }
        });

        finalY = (doc as any).lastAutoTable?.finalY || 200;

        // Check if we need to add signature lines on a new page or if there's enough space
        if (finalY > pageHeight - 40) {
            doc.addPage();
            applyBranding(doc, config, userName, true);
            finalY = 40;
        }

        // Assinaturas de conformidade
        doc.setDrawColor(150, 150, 150);
        doc.setLineWidth(0.5);
        
        const sigY = finalY + 30;
        doc.line(40, sigY, 110, sigY);
        doc.line(187, sigY, 257, sigY);

        doc.setFontSize(9);
        doc.setTextColor(100, 100, 100);
        doc.setFont("helvetica", "normal");
        doc.text("Responsável Financeiro", 75, sigY + 5, { align: 'center' });
        doc.text("Administrador / Gerência", 222, sigY + 5, { align: 'center' });

        doc.save(`Fecho_Mes_${closedMonth.year}_${(closedMonth.month + 1).toString().padStart(2, '0')}.pdf`);
    } catch (e) {
        console.error("Erro ao gerar PDF de fecho de mês:", e);
    }
};

export const generateAnnualReportPDF = (
    year: number,
    annualSummary: any[],
    credits: any[],
    settings?: any,
    userName?: string
) => {
    try {
        const doc = new jsPDF({ orientation: 'landscape' });
        const config = getCompanySettings(settings);
        const orange = (config.primaryColor as [number, number, number]) || [255, 127, 0];
        const black = [30, 41, 59] as [number, number, number];
        const pageWidth = doc.internal.pageSize.width;
        const pageHeight = doc.internal.pageSize.height;

        applyBranding(doc, config, userName);

        doc.setTextColor(black[0], black[1], black[2]);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(18);
        doc.text('RELATÓRIO FINANCEIRO ANUAL', pageWidth / 2, 45, { align: 'center' });

        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(100, 100, 100);
        doc.text(`Ano de Referência: ${year}`, pageWidth / 2, 52, { align: 'center' });
        doc.text(`Gerado em: ${formatDateTime(new Date())}`, pageWidth / 2, 57, { align: 'center' });

        // Table with Month Summaries
        const tableBody = annualSummary.map(m => [
            m.monthLabel,
            m.isClosed ? 'Fechado' : 'Aberto',
            formatCurrency(m.capitalApplied, config.currency),
            formatCurrency(m.projectedProfit, config.currency),
            formatCurrency(m.realizedProfit, config.currency),
            formatCurrency(m.outstandingCapital, config.currency),
            `${m.liquidationRate.toFixed(2)}%`
        ]);

        // Add a total row
        const totals = annualSummary.reduce((acc, m) => {
            acc.capitalApplied += m.capitalApplied;
            acc.projectedProfit += m.projectedProfit;
            acc.realizedProfit += m.realizedProfit;
            acc.outstandingCapital += m.outstandingCapital;
            return acc;
        }, { capitalApplied: 0, projectedProfit: 0, realizedProfit: 0, outstandingCapital: 0 });

        const totalLiquidationRate = totals.capitalApplied > 0 
            ? ((totals.capitalApplied - totals.outstandingCapital) / totals.capitalApplied) * 100 
            : 0;

        tableBody.push([
            'TOTAL ANUAL',
            '-',
            formatCurrency(totals.capitalApplied, config.currency),
            formatCurrency(totals.projectedProfit, config.currency),
            formatCurrency(totals.realizedProfit, config.currency),
            formatCurrency(totals.outstandingCapital, config.currency),
            `${totalLiquidationRate.toFixed(2)}%`
        ]);

        autoTable(doc, {
            startY: 70,
            head: [['Mês', 'Estado', 'Capital Aplicado', 'Lucro Projetado', 'Lucro Realizado', 'Saldo em Aberto', 'Tx. Liquidação']],
            body: tableBody,
            theme: 'striped',
            headStyles: { fillColor: black as [number, number, number] },
            styles: { fontSize: 9, cellPadding: 4 }
        });

        let finalY = (doc as any).lastAutoTable?.finalY || 160;

        // Signature section
        if (finalY > pageHeight - 40) {
            doc.addPage();
            applyBranding(doc, config, userName, true);
            finalY = 40;
        }

        doc.setDrawColor(150, 150, 150);
        doc.setLineWidth(0.5);
        const sigY = finalY + 25;
        doc.line(40, sigY, 110, sigY);
        doc.line(187, sigY, 257, sigY);

        doc.setFontSize(9);
        doc.setTextColor(100, 100, 100);
        doc.text("Responsável Financeiro", 75, sigY + 5, { align: 'center' });
        doc.text("Administrador / Gerência", 222, sigY + 5, { align: 'center' });

        doc.save(`Relatorio_Anual_${year}.pdf`);
    } catch (e) {
        console.error("Erro ao gerar PDF anual:", e);
    }
};

export const generatePeriodReportPDF = (
    periodLabel: string,
    credits: any[],
    payments: any[],
    settings?: any,
    userName?: string
) => {
    try {
        const doc = new jsPDF({ orientation: 'landscape' });
        const config = getCompanySettings(settings);
        const orange = (config.primaryColor as [number, number, number]) || [255, 127, 0];
        const black = [30, 41, 59] as [number, number, number];
        const pageWidth = doc.internal.pageSize.width;
        const pageHeight = doc.internal.pageSize.height;

        applyBranding(doc, config, userName);

        doc.setTextColor(black[0], black[1], black[2]);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(18);
        doc.text('RELATÓRIO FINANCEIRO POR PERÍODO', pageWidth / 2, 45, { align: 'center' });

        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(100, 100, 100);
        doc.text(`Filtro Aplicado: ${periodLabel}`, pageWidth / 2, 52, { align: 'center' });
        doc.text(`Gerado em: ${formatDateTime(new Date())}`, pageWidth / 2, 57, { align: 'center' });

        // Stats summary
        const uniqueClients = new Set(credits.map(c => c.clientId)).size;
        const capitalApplied = credits.reduce((sum, c) => sum + Number(c.principalAmount || 0), 0);
        const projectedProfit = credits.reduce((sum, c) => sum + Number(c.accruedInterest || 0), 0);
        
        const outstandingCapital = credits.reduce((sum, c) => {
            const paidPrincipal = payments
                .filter(p => p.creditId === c.id && p.status !== 'cancelled' && !p.deletedAt)
                .reduce((pSum, p) => pSum + Number(p.allocatedToPrincipal || 0), 0);
            return sum + Math.max(0, Number(c.principalAmount || 0) - paidPrincipal);
        }, 0);

        const realizedProfit = payments.reduce((sum, p) => {
            return sum + Number(p.allocatedToInterest || 0) + Number(p.allocatedToLateInterest || 0);
        }, 0);

        const liquidationRate = capitalApplied > 0 
            ? ((capitalApplied - outstandingCapital) / capitalApplied) * 100 
            : 0;

        autoTable(doc, {
            startY: 65,
            head: [['Métrica de Período', 'Valor']],
            body: [
                ['Clientes Únicos Concedidos', String(uniqueClients)],
                ['Capital Total Concedido', formatCurrency(capitalApplied, config.currency)],
                ['Juros Projetados Concedidos', formatCurrency(projectedProfit, config.currency)],
                ['Saldo Devedor de Principal Restante', formatCurrency(outstandingCapital, config.currency)],
                ['Juros & Moras Arrecadados no Período', formatCurrency(realizedProfit, config.currency)],
                ['Taxa de Liquidação de Capital', `${liquidationRate.toFixed(2)}%`]
            ],
            theme: 'striped',
            headStyles: { fillColor: black as [number, number, number] },
            styles: { fontSize: 9, cellPadding: 4 }
        });

        let finalY = (doc as any).lastAutoTable?.finalY || 120;

        // Section: Credits detail
        doc.setFontSize(12);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(orange[0], orange[1], orange[2]);
        doc.text("CRÉDITOS DO PERÍODO", 20, finalY + 12);

        const statusLabelMap: Record<string, string> = {
            active: 'Ativo',
            overdue: 'Em Atraso',
            paid: 'Pago',
            renegotiated: 'Renegociado',
            defaulted: 'Incumprimento',
            pending_approval: 'Pendente',
            rejected: 'Rejeitado',
            cancelled: 'Cancelado'
        };

        const creditRows = credits.map(c => {
            const paidPrincipal = payments
                .filter(p => p.creditId === c.id && p.status !== 'cancelled' && !p.deletedAt)
                .reduce((pSum, p) => pSum + Number(p.allocatedToPrincipal || 0), 0);
            const remainingPrincipal = Math.max(0, Number(c.principalAmount || 0) - paidPrincipal);

            return [
                c.id,
                c.clientName,
                new Date(c.startDate).toLocaleDateString(),
                formatCurrency(c.principalAmount, config.currency),
                formatCurrency(c.accruedInterest, config.currency),
                formatCurrency(remainingPrincipal, config.currency),
                statusLabelMap[c.status] || c.status.toUpperCase()
            ];
        });

        autoTable(doc, {
            startY: finalY + 16,
            head: [['ID Crédito', 'Cliente', 'Data Início', 'Capital Base', 'Juros Previstos', 'Saldo Principal Restante', 'Estado']],
            body: creditRows.length > 0 ? creditRows : [['-', 'Nenhum crédito neste período.', '-', '-', '-', '-', '-']],
            theme: 'striped',
            headStyles: { fillColor: black as [number, number, number] },
            styles: { fontSize: 8.5, cellPadding: 3.5 }
        });

        finalY = (doc as any).lastAutoTable?.finalY || 180;

        if (finalY > pageHeight - 40) {
            doc.addPage();
            applyBranding(doc, config, userName, true);
            finalY = 40;
        }

        doc.setDrawColor(150, 150, 150);
        doc.setLineWidth(0.5);
        const sigY = finalY + 25;
        doc.line(40, sigY, 110, sigY);
        doc.line(187, sigY, 257, sigY);

        doc.setFontSize(9);
        doc.setTextColor(100, 100, 100);
        doc.text("Responsável Financeiro", 75, sigY + 5, { align: 'center' });
        doc.text("Administrador / Gerência", 222, sigY + 5, { align: 'center' });

        doc.save(`Relatorio_Periodo_${periodLabel.replace(/\s+/g, '_')}.pdf`);
    } catch (e) {
        console.error("Erro ao gerar PDF de período:", e);
    }
};

export const generateSupplierReportPDF = (
    supplier: any,
    credits: any[],
    payments: any[],
    periodLabel: string,
    settings?: any,
    userName?: string
) => {
    try {
        const doc = new jsPDF({ orientation: 'landscape' });
        const config = getCompanySettings(settings);
        const orange = (config.primaryColor as [number, number, number]) || [255, 127, 0];
        const black = [30, 41, 59] as [number, number, number];
        const pageWidth = doc.internal.pageSize.width;
        const pageHeight = doc.internal.pageSize.height;

        applyBranding(doc, config, userName);

        doc.setTextColor(black[0], black[1], black[2]);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(18);
        doc.text('RELATÓRIO DETALHADO DE PARCEIRO / FORNECEDOR', pageWidth / 2, 45, { align: 'center' });

        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(100, 100, 100);
        doc.text(`Gerado em: ${formatDateTime(new Date())}`, pageWidth / 2, 51, { align: 'center' });

        // Supplier Info Block
        doc.setFontSize(11);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(black[0], black[1], black[2]);
        doc.text("DADOS DO FORNECEDOR / PARCEIRO", 20, 62);

        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        doc.text(`Nome: ${supplier.name}`, 20, 68);
        doc.text(`NIF: ${supplier.nif || 'N/A'}`, 20, 74);
        doc.text(`Telefone: ${supplier.phone || 'N/A'}`, 20, 80);
        doc.text(`Período de Análise: ${periodLabel}`, 150, 68);
        doc.text(`Email: ${supplier.email || 'N/A'}`, 150, 74);

        // Stats calculation
        const totalInvested = credits.reduce((sum, c) => sum + Number(c.principalAmount || 0), 0);
        const totalInterestExpected = credits.reduce((sum, c) => sum + Number(c.accruedInterest || 0), 0);
        
        let totalPrincipalPaid = 0;
        let totalInterestPaid = 0;

        credits.forEach(c => {
            const creditPayments = payments.filter(p => p.creditId === c.id && p.status !== 'cancelled' && !p.deletedAt);
            creditPayments.forEach(p => {
                totalPrincipalPaid += Number(p.allocatedToPrincipal || 0);
                totalInterestPaid += Number(p.allocatedToInterest || 0) + Number(p.allocatedToLateInterest || 0);
            });
        });

        const outstandingCapital = Math.max(0, totalInvested - totalPrincipalPaid);
        const activeCreditsCount = credits.filter(c => c.status === 'active' || c.status === 'overdue').length;
        const settledCreditsCount = credits.filter(c => c.status === 'paid').length;

        autoTable(doc, {
            startY: 87,
            head: [['Indicador de Performance', 'Valor']],
            body: [
                ['Total de Capital Investido', formatCurrency(totalInvested, config.currency)],
                ['Juros & Rendimentos Projetados', formatCurrency(totalInterestExpected, config.currency)],
                ['Capital Recuperado (Amortizado)', formatCurrency(totalPrincipalPaid, config.currency)],
                ['Rendimentos Recebidos (Juros + Mora)', formatCurrency(totalInterestPaid, config.currency)],
                ['Capital Pendente em Carteira', formatCurrency(outstandingCapital, config.currency)],
                ['Créditos em Curso / Liquidados', `${activeCreditsCount} ativos / ${settledCreditsCount} pagos`]
            ],
            theme: 'striped',
            headStyles: { fillColor: black as [number, number, number] },
            styles: { fontSize: 8.5, cellPadding: 3 }
        });

        let finalY = (doc as any).lastAutoTable?.finalY || 135;

        // Credits table header
        doc.setFontSize(11);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(orange[0], orange[1], orange[2]);
        doc.text("DEMONSTRATIVO DE CRÉDITOS ASSOCIADOS", 20, finalY + 12);

        const statusLabelMap: Record<string, string> = {
            active: 'Ativo',
            overdue: 'Em Atraso',
            paid: 'Pago',
            renegotiated: 'Renegociado',
            defaulted: 'Incumprimento',
            pending_approval: 'Pendente',
            rejected: 'Rejeitado',
            cancelled: 'Cancelado'
        };

        const creditRows = credits.map(c => {
            const creditPayments = payments.filter(p => p.creditId === c.id && p.status !== 'cancelled' && !p.deletedAt);
            const paidPrincipal = creditPayments.reduce((sum, p) => sum + Number(p.allocatedToPrincipal || 0), 0);
            const paidInterest = creditPayments.reduce((sum, p) => sum + Number(p.allocatedToInterest || 0) + Number(p.allocatedToLateInterest || 0), 0);
            const remainingPrincipal = Math.max(0, Number(c.principalAmount || 0) - paidPrincipal);

            return [
                c.id,
                c.clientName,
                new Date(c.startDate).toLocaleDateString(),
                formatCurrency(c.principalAmount, config.currency),
                formatCurrency(c.accruedInterest, config.currency),
                formatCurrency(paidPrincipal, config.currency),
                formatCurrency(paidInterest, config.currency),
                formatCurrency(remainingPrincipal, config.currency),
                statusLabelMap[c.status] || c.status.toUpperCase()
            ];
        });

        autoTable(doc, {
            startY: finalY + 16,
            head: [['Ref. Crédito', 'Beneficiário', 'Data Início', 'Capital Aplicado', 'Juros Previstos', 'Capital Amort.', 'Juros Rec.', 'Saldo Devedor', 'Estado']],
            body: creditRows.length > 0 ? creditRows : [['-', 'Nenhum crédito associado a este parceiro.', '-', '-', '-', '-', '-', '-', '-']],
            theme: 'striped',
            headStyles: { fillColor: black as [number, number, number] },
            styles: { fontSize: 7.5, cellPadding: 2.5 }
        });

        finalY = (doc as any).lastAutoTable?.finalY || 180;

        if (finalY > pageHeight - 40) {
            doc.addPage();
            applyBranding(doc, config, userName, true);
            finalY = 40;
        }

        doc.setDrawColor(150, 150, 150);
        doc.setLineWidth(0.5);
        const sigY = finalY + 25;
        doc.line(40, sigY, 110, sigY);
        doc.line(187, sigY, 257, sigY);

        doc.setFontSize(9);
        doc.setTextColor(100, 100, 100);
        doc.text("Parceiro / Fornecedor", 75, sigY + 5, { align: 'center' });
        doc.text("Administrador / Sistema", 222, sigY + 5, { align: 'center' });

        doc.save(`Relatorio_Fornecedor_${supplier.name.replace(/\s+/g, '_')}.pdf`);
    } catch (e) {
        console.error("Erro ao gerar PDF de fornecedor:", e);
    }
};

export const generatePermanentTransferLetterPDF = (
    letter: any,
    settings?: any,
    userName?: string
) => {
    try {
        const doc = new jsPDF({
            orientation: 'portrait',
            unit: 'mm',
            format: 'a4'
        });

        const config = getCompanySettings(settings);
        const primaryColor = (config.primaryColor as [number, number, number]) || [255, 127, 0];
        const black = [30, 41, 59] as [number, number, number];

        // Apply formal company header/branding
        applyBranding(doc, config, userName);

        let currentY = 50;

        // Cabeçalho de Envio ao Banco
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.setTextColor(black[0], black[1], black[2]);
        doc.text("Ao", 20, currentY);
        currentY += 5;
        doc.text(`Exmo.(a) Senhor(a) Gerente do ${letter.bankDestinationName || 'Banco de Domicílio'}`, 20, currentY);
        currentY += 5;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.text(`Balcão / Agência: ${letter.destinationBranch || 'Balcão Central'}`, 20, currentY);

        // Data alinhada à direita
        const todayFormatted = new Date().toLocaleDateString('pt-PT', {
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        });
        doc.text(`Luanda, ${todayFormatted}`, 190, 50, { align: 'right' });

        currentY += 12;

        // Assunto em destaque
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.setTextColor(black[0], black[1], black[2]);
        doc.text(letter.subject || 'ASSUNTO: ORDEM DE TRANSFERÊNCIA BANCÁRIA PERMANENTE', 20, currentY);
        doc.line(20, currentY + 1.5, 190, currentY + 1.5);

        currentY += 10;

        // Texto introdutório formal
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9.5);
        doc.setTextColor(40, 40, 40);

        const introText = `Eu, ${letter.clientName}, titular do BI / NIF n.º ${letter.clientNif || 'N/D'}, titular da conta domiciliada nessa conceituada instituição financeira com o IBAN n.º ${letter.clientIban || 'N/D'}, venho por este meio solicitar a constituição e execução de uma ORDEM DE TRANSFERÊNCIA BANCÁRIA PERMANENTE, com as seguintes condições e termos de referência:`;

        const splitIntro = doc.splitTextToSize(introText, 170);
        doc.text(splitIntro, 20, currentY);
        currentY += splitIntro.length * 5 + 4;

        // Tabela com Termos de Referência da Transferência Permanente
        autoTable(doc, {
            startY: currentY,
            head: [['Termo / Condição', 'Especificação']],
            body: [
                ['Beneficiário:', `${letter.companyAccountName || config.name} (NIF: ${config.nif || 'Não informado'})`],
                ['Banco de Destino:', letter.companyBank || 'Banco Comercial'],
                ['IBAN de Destino:', letter.companyIban || 'AO06.0000.0000.0000.0000.0000.0'],
                ['Montante por Prestação:', formatCurrency(letter.installmentAmount || 0, config.currency)],
                ['Periodicidade:', 'Mensal e Consecutiva'],
                ['Dia de Débito em Conta:', `Dia ${letter.dayOfMonth || 28} de cada mês (ou dia útil seguinte)`],
                ['Finalidade / Referência:', `Amortização de Prestação de Crédito - Ref. ${letter.creditReference || 'Contrato'}`]
            ],
            headStyles: {
                fillColor: primaryColor,
                textColor: [255, 255, 255],
                fontStyle: 'bold',
                fontSize: 9
            },
            styles: {
                fontSize: 8.5,
                cellPadding: 3,
                lineColor: [203, 213, 225],
                lineWidth: 0.2
            },
            columnStyles: {
                0: { fontStyle: 'bold', cellWidth: 60, fillColor: [248, 250, 252] },
                1: { cellWidth: 110 }
            },
            theme: 'grid',
            didDrawPage: () => applyBranding(doc, config, userName, true)
        });

        currentY = (doc as any).lastAutoTable?.finalY + 8;

        // Cláusula de irrevogabilidade
        const clauseText = "Mais declaro que a presente ordem é de execução regular e irrevogável sem o prévio consentimento formal da entidade credora acima identificada, autorizando desde já a instituição bancária a debitar na minha referida conta os montantes devidos acrescidos dos encargos regulamentares aplicáveis.";
        const splitClause = doc.splitTextToSize(clauseText, 170);
        doc.text(splitClause, 20, currentY);
        currentY += splitClause.length * 5 + 6;

        doc.text("Sem outro assunto de momento, subscrevo-me com a mais elevada consideração.", 20, currentY);
        currentY += 18;

        // Bloco de Assinatura de Ambas as Partes (Cliente e Entidade Credora)
        doc.setFont("helvetica", "normal");
        // Linha Cliente (Esquerda)
        doc.line(20, currentY, 95, currentY);
        // Linha Entidade Credora (Direita)
        doc.line(115, currentY, 190, currentY);
        currentY += 5;
        
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8.5);
        doc.setTextColor(15, 23, 42);
        doc.text(letter.clientName || 'O(A) Cliente', 57.5, currentY, { align: 'center' });
        doc.text("Pela Entidade Credora", 152.5, currentY, { align: 'center' });
        currentY += 4;
        
        doc.setFontSize(7.5);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(100, 116, 139);
        doc.text("(Assinatura conforme o Bilhete de Identidade / Ficha Bancária)", 57.5, currentY, { align: 'center' });
        doc.text(`(${config.name || 'Assinatura Autorizada e Carimbo'})`, 152.5, currentY, { align: 'center' });

        currentY += 14;

        // Caixa reservada ao balcão bancário
        doc.setDrawColor(148, 163, 184);
        doc.setLineDashPattern([2, 2], 0);
        doc.roundedRect(20, currentY, 170, 25, 2, 2, 'S');
        doc.setLineDashPattern([], 0);

        doc.setFontSize(7.5);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(71, 85, 105);
        doc.text("RESERVADO À INSTITUIÇÃO BANCÁRIA DE DOMICÍLIO:", 25, currentY + 6);
        doc.setFont("helvetica", "normal");
        doc.text("Recepcionado por: _________________________________________    Data: _____ / _____ / 202___", 25, currentY + 12);
        doc.text("Carimbo e Validação do Balcão:", 25, currentY + 18);

        // Rodapé de segurança
        const footY = 282;
        doc.setFontSize(7.5);
        doc.setTextColor(150, 150, 150);
        doc.line(20, footY, 190, footY);
        doc.text("Documento oficial emitido pelo sistema Tango Gestão de Créditos ERP.", 105, footY + 4, { align: 'center' });

        doc.save(`Carta_Transferencia_${(letter.clientName || 'Cliente').replace(/\s+/g, '_')}_${formatDate(new Date())}.pdf`);
    } catch (e) {
        console.error("Erro ao gerar PDF da Carta de Transferência:", e);
    }
};

