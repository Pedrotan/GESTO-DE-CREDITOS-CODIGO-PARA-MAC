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

export const BRAND_ORANGE: [number, number, number] = [243, 112, 33]; // #F37021 (Laranja Corporativo de Referência)
export const BRAND_CHARCOAL: [number, number, number] = [43, 45, 47]; // #2B2D2F (Carvão Escuro de Referência)
export const BRAND_SILVER: [number, number, number] = [229, 231, 235]; // #E5E7EB (Prata / Cinza Claro de Referência)

export const isLegacyOrInvalidColor = (col: any): boolean => {
    if (!col) return true;
    let r = 0, g = 0, b = 0;
    if (Array.isArray(col) && col.length >= 3) {
        r = Number(col[0]) || 0;
        g = Number(col[1]) || 0;
        b = Number(col[2]) || 0;
    } else if (typeof col === 'string') {
        const hex = col.trim().toLowerCase().replace(/^#/, '');
        if (hex.length === 6) {
            r = parseInt(hex.substring(0, 2), 16) || 0;
            g = parseInt(hex.substring(2, 4), 16) || 0;
            b = parseInt(hex.substring(4, 6), 16) || 0;
        } else if (hex.length === 3) {
            r = parseInt(hex[0] + hex[0], 16) || 0;
            g = parseInt(hex[1] + hex[1], 16) || 0;
            b = parseInt(hex[2] + hex[2], 16) || 0;
        } else {
            return true;
        }
    } else {
        return true;
    }

    // Specific legacy defaults: slate [30, 41, 59], blue [37, 99, 235], dark blue [15, 23, 42], etc.
    if (r === 30 && g === 41 && b === 59) return true;
    if (r === 37 && g === 99 && b === 235) return true;
    if (r === 15 && g === 23 && b === 42) return true;
    if (r === 0 && g === 50 && b === 100) return true;
    if (r === 4 && g === 67 && b === 44) return true;
    if (r === 220 && g === 38 && b === 38) return true;

    // Corporate Brand color is #F37021 [243, 112, 33].
    // If the color is predominantly blue (b > r) or green (g > r) or dark slate (r < 140), it's not the reference brand.
    if (b > r || (g > r && g > 150) || r < 140) {
        return true;
    }

    return false;
};

export const resolveBrandPrimary = (col?: any): [number, number, number] => {
    if (!col || isLegacyOrInvalidColor(col)) return BRAND_ORANGE;
    return parseRgbColor(col, BRAND_ORANGE);
};

export const resolveBrandDark = (col?: any): [number, number, number] => {
    if (!col) return BRAND_CHARCOAL;
    if (Array.isArray(col)) {
        if (col[0] === 30 && col[1] === 41 && col[2] === 59) return BRAND_CHARCOAL;
        if (col[0] === 100 && col[1] === 116 && col[2] === 139) return BRAND_CHARCOAL;
    }
    if (typeof col === 'string') {
        const hex = col.trim().toLowerCase().replace(/^#/, '');
        if (hex === '1e293b' || hex === '64748b' || hex === '0f172a') return BRAND_CHARCOAL;
    }
    return parseRgbColor(col, BRAND_CHARCOAL);
};

export const getCompanySettings = (providedSettings?: any): CompanySettings => {
    let settings: any = null;
    if (!providedSettings) {
        try {
            const activeAccountId = localStorage.getItem('tango_active_account_id') || 'default';
            const saved = localStorage.getItem(`cached_company_settings:${activeAccountId}`) || localStorage.getItem('company_settings');
            if (saved) settings = JSON.parse(saved);
        } catch (e) { }
    } else {
        settings = providedSettings;
    }

    return {
        name: settings?.name || '',
        nif: settings?.nif || '',
        address: settings?.address || '',
        logo: settings?.logo || null,
        reportLogo: settings?.reportLogo || null,
        watermarkLogo: null, // Keep canvas clean and crisp as in reference image
        currency: settings?.currency || 'AOA',
        customClauses: settings?.customClauses || '',
        primaryColor: resolveBrandPrimary(settings?.primaryColor),
        secondaryColor: resolveBrandDark(settings?.secondaryColor),
        phone: settings?.phone || '',
        email: settings?.email || '',
        whatsapp: settings?.whatsapp || '',
        digitalSignatureEnabled: settings?.digitalSignatureEnabled || false,
        authorizedSigners: settings?.authorizedSigners || '[]',
        sessionTimeout: settings?.sessionTimeout || 5,
        syncEnabled: settings?.syncEnabled || false,
        bankingInfo: settings?.bankingInfo || '[]',
        contractTemplates: settings?.contractTemplates || '[]',
        location: settings?.location || ''
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

const parseRgbColor = (col: any, fallback: [number, number, number]): [number, number, number] => {
    if (Array.isArray(col) && col.length >= 3) {
        return [
            Math.min(255, Math.max(0, Number(col[0]) || 0)),
            Math.min(255, Math.max(0, Number(col[1]) || 0)),
            Math.min(255, Math.max(0, Number(col[2]) || 0))
        ];
    }
    if (typeof col === 'string') {
        const hex = col.trim().replace(/^#/, '');
        if (hex.length === 6) {
            const r = parseInt(hex.substring(0, 2), 16);
            const g = parseInt(hex.substring(2, 4), 16);
            const b = parseInt(hex.substring(4, 6), 16);
            if (!isNaN(r) && !isNaN(g) && !isNaN(b)) return [r, g, b];
        } else if (hex.length === 3) {
            const r = parseInt(hex[0] + hex[0], 16);
            const g = parseInt(hex[1] + hex[1], 16);
            const b = parseInt(hex[2] + hex[2], 16);
            if (!isNaN(r) && !isNaN(g) && !isNaN(b)) return [r, g, b];
        }
    }
    return fallback;
};

export const applyBranding = (doc: jsPDF, config: CompanySettings, userName?: string, onlyDecoration: boolean = false) => {
    const pageWidth = doc.internal.pageSize.width;
    const pageHeight = doc.internal.pageSize.height;
    const isLandscape = pageWidth > pageHeight;

    // Cores exatas do modelo de referência (Laranja Corporativo #F37021 e Carvão Escuro #2B2D2F)
    const primary = resolveBrandPrimary(config.primaryColor); // #F37021
    const dark = resolveBrandDark(config.secondaryColor);   // #2B2D2F
    const lightSilver = BRAND_SILVER;   // #E5E7EB

    if (isValidLogoData(config.watermarkLogo)) {
        addWatermark(doc, config.watermarkLogo);
    }

    // =========================================================================
    // =========================================================================
    // 1. MOTIVO GEOMÉTRICO DO TOPO DIREITO: MOLDURA EM "L" INVERTIDO + CIRCUIT DOTS
    // =========================================================================
    const topCutW = isLandscape ? 110 : 85;
    const barThick = isLandscape ? 9 : 11;
    const topHorizInnerW = isLandscape ? 82 : 62;
    const vertBarH = isLandscape ? 60 : 78;

    // Moldura L Invertida (Laranja Primário #F37021)
    doc.setFillColor(primary[0], primary[1], primary[2]);
    // 1. Cunha chanfrada no canto superior esquerdo da barra horizontal (45° de cima-esquerda para baixo-direita)
    doc.triangle(
        pageWidth - topCutW, 0,
        pageWidth - topHorizInnerW, 0,
        pageWidth - topHorizInnerW, barThick,
        'F'
    );
    // 2. Barra horizontal superior
    doc.rect(pageWidth - topHorizInnerW, 0, topHorizInnerW, barThick, 'F');
    // 3. Barra vertical direita (corpo superior)
    doc.rect(pageWidth - barThick, barThick, barThick, vertBarH - 2 * barThick, 'F');
    // 4. Cunha chanfrada inferior da barra vertical (45° de cima-esquerda para baixo-direita)
    doc.triangle(
        pageWidth - barThick, vertBarH - barThick,
        pageWidth, vertBarH - barThick,
        pageWidth, vertBarH,
        'F'
    );

    // 3 Linhas Circuit com Nós Circulares (Dots) na base branca sob a barra
    // Conforme a imagem de referência: linha superior mais longa (nó mais à esquerda),
    // linha média mais curta (nó recuado), linha inferior intermediária.
    const dot1X = isLandscape ? pageWidth - 85 : pageWidth - 70;
    const dot2X = isLandscape ? pageWidth - 72 : pageWidth - 58;
    const dot3X = isLandscape ? pageWidth - 59 : pageWidth - 46;
    const dot1Y = isLandscape ? 18 : 24;
    const dot2Y = isLandscape ? 23 : 29;
    const dot3Y = isLandscape ? 28 : 34;

    // Linha 1: Nó e Linha Laranja (Superior)
    doc.setFillColor(primary[0], primary[1], primary[2]);
    doc.setDrawColor(primary[0], primary[1], primary[2]);
    doc.setLineWidth(0.85);
    doc.circle(dot1X, dot1Y, 1.8, 'F');
    doc.line(dot1X, dot1Y, pageWidth - barThick, dot1Y);

    // Linha 2: Nó e Linha Carvão Escuro (Média)
    doc.setFillColor(dark[0], dark[1], dark[2]);
    doc.setDrawColor(dark[0], dark[1], dark[2]);
    doc.setLineWidth(0.85);
    doc.circle(dot2X, dot2Y, 1.8, 'F');
    doc.line(dot2X, dot2Y, pageWidth - barThick, dot2Y);

    // Linha 3: Nó e Linha Laranja (Inferior)
    doc.setFillColor(primary[0], primary[1], primary[2]);
    doc.setDrawColor(primary[0], primary[1], primary[2]);
    doc.setLineWidth(0.85);
    doc.circle(dot3X, dot3Y, 1.8, 'F');
    doc.line(dot3X, dot3Y, pageWidth - barThick, dot3Y);

    // =========================================================================
    // 2. MOTIVO GEOMÉTRICO DA MARGEM ESQUERDA: CHEVRONS A 45° + BARRA VERTICAL
    // =========================================================================
    const midY = isLandscape ? 62 : 92;
    const bandThick = 7.5;
    const bandH = 8.5;
    const gap = 2.8;

    // Faixa 1 (Superior - Carvão Escuro #2B2D2F) inclinada a 45°
    const c1Y = midY;
    doc.setFillColor(dark[0], dark[1], dark[2]);
    doc.triangle(0, c1Y, bandThick, c1Y + bandThick, bandThick, c1Y + bandThick + bandH, 'F');
    doc.triangle(0, c1Y, bandThick, c1Y + bandThick + bandH, 0, c1Y + bandH, 'F');

    // Faixa 2 (Média - Laranja Primário #F37021) inclinada a 45°
    const c2Y = c1Y + bandH + gap;
    doc.setFillColor(primary[0], primary[1], primary[2]);
    doc.triangle(0, c2Y, bandThick, c2Y + bandThick, bandThick, c2Y + bandThick + bandH, 'F');
    doc.triangle(0, c2Y, bandThick, c2Y + bandThick + bandH, 0, c2Y + bandH, 'F');

    // Faixa 3 (Inferior - Laranja Primário): Barra vertical contínua até o rodapé
    // Inicia com chanfro a 45° idêntico à imagem de referência
    const c3Y = c2Y + bandH + gap;
    doc.setFillColor(primary[0], primary[1], primary[2]);
    doc.triangle(0, c3Y, bandThick, c3Y + bandThick, 0, c3Y + bandThick, 'F');
    doc.rect(0, c3Y + bandThick, bandThick, pageHeight - (c3Y + bandThick), 'F');

    // =========================================================================
    // 3. MOTIVO GEOMÉTRICO DO RODAPÉ (BARRA CHANFRADA, FAIXA DIAGONAL E CARVÃO)
    // =========================================================================
    const footBarH = 8.5;
    const footBarY = pageHeight - footBarH;
    const cut1X = isLandscape ? pageWidth - 100 : 142;
    const stripeW = 9;
    const gapW = 3.2;

    // 1. Friso Superior Prata / Cinza Elegante com Chanfro (idêntico à imagem de referência)
    const silverH = 2.2;
    const silverY = footBarY - silverH;
    const cutSilverX = cut1X - 6;
    doc.setFillColor(241, 245, 249);
    doc.rect(bandThick, silverY, cutSilverX - bandThick - silverH, 0.7, 'F');
    doc.triangle(cutSilverX - silverH, silverY, cutSilverX, silverY + 0.7, cutSilverX - silverH, silverY + 0.7, 'F');
    doc.setFillColor(lightSilver[0], lightSilver[1], lightSilver[2]);
    doc.rect(bandThick, silverY + 0.7, cutSilverX - bandThick - (silverH - 0.7), 1.5, 'F');
    doc.triangle(cutSilverX - (silverH - 0.7), silverY + 0.7, cutSilverX, footBarY, cutSilverX, silverY + 0.7, 'F');

    // 2. Barra Principal Inferior (Laranja Primário #F37021) com corte a 45°
    doc.setFillColor(primary[0], primary[1], primary[2]);
    doc.rect(0, footBarY, cut1X, footBarH, 'F');
    doc.triangle(cut1X, footBarY, cut1X + footBarH, pageHeight, cut1X, pageHeight, 'F');

    // 3. Faixa Diagonal Paralela (Laranja Primário #F37021)
    const sTop1 = cut1X + gapW;
    const sTop2 = sTop1 + stripeW;
    const sBot1 = cut1X + footBarH + gapW;
    const sBot2 = sBot1 + stripeW;
    doc.setFillColor(primary[0], primary[1], primary[2]);
    doc.triangle(sTop1, footBarY, sTop2, footBarY, sBot2, pageHeight, 'F');
    doc.triangle(sTop1, footBarY, sBot2, pageHeight, sBot1, pageHeight, 'F');

    // 4. Bloco Chanfrado Carvão Escuro (#2B2D2F) no Canto Inferior Direito
    const dTop = sTop2 + gapW;
    const dBot = sBot2 + gapW;
    doc.setFillColor(dark[0], dark[1], dark[2]);
    doc.triangle(dTop, footBarY, dBot, pageHeight, dBot, footBarY, 'F');
    doc.rect(dBot, footBarY, pageWidth - dBot, footBarH, 'F');

    // =========================================================================
    // 4. INFORMAÇÕES DE CONTACTO EM 3 COLUNAS COM ÍCONES CIRCULARES
    // =========================================================================
    const footInfoY = pageHeight - 17.5;
    const col1X = isLandscape ? 32 : 26;
    const col2X = isLandscape ? pageWidth * 0.38 : 82;
    const col3X = isLandscape ? pageWidth * 0.70 : 138;

    // Helper para desenhar o badge circular laranja
    const drawBadgeIcon = (x: number, y: number, type: 'phone' | 'web' | 'pin') => {
        doc.setFillColor(primary[0], primary[1], primary[2]);
        doc.circle(x, y, 2.0, 'F');
        doc.setFillColor(255, 255, 255);
        doc.setDrawColor(255, 255, 255);
        doc.setLineWidth(0.35);

        if (type === 'phone') {
            doc.circle(x - 0.3, y - 0.3, 0.6, 'F');
            doc.line(x - 0.3, y - 0.3, x + 0.5, y + 0.5);
            doc.circle(x + 0.5, y + 0.5, 0.6, 'F');
        } else if (type === 'web') {
            doc.circle(x, y, 1.1);
            doc.line(x - 1.1, y, x + 1.1, y);
            doc.line(x, y - 1.1, x, y + 1.1);
        } else {
            doc.circle(x, y - 0.4, 0.8, 'F');
            doc.line(x, y + 0.4, x, y + 1.0);
        }
    };

    // Coluna 1: Contactos Telefónicos
    drawBadgeIcon(col1X, footInfoY + 0.5, 'phone');
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.8);
    doc.setTextColor(dark[0], dark[1], dark[2]);
    doc.text(config.phone || '+244 941 537 486', col1X + 4.2, footInfoY);
    doc.text(config.whatsapp || '+244 923 000 000', col1X + 4.2, footInfoY + 3.4);

    // Coluna 2: Website & Email
    drawBadgeIcon(col2X, footInfoY + 0.5, 'web');
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.8);
    doc.setTextColor(dark[0], dark[1], dark[2]);
    doc.text('www.tango.co.ao', col2X + 4.2, footInfoY);
    const displayEmail = (config.email || 'geral@tango.co.ao').substring(0, 30);
    doc.text(displayEmail, col2X + 4.2, footInfoY + 3.4);

    // Coluna 3: Endereço & Localização
    drawBadgeIcon(col3X, footInfoY + 0.5, 'pin');
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.8);
    doc.setTextColor(dark[0], dark[1], dark[2]);
    const cleanAddr1 = (config.address || 'Cuanza Norte, N´dalatando').substring(0, 32);
    doc.text(cleanAddr1, col3X + 4.2, footInfoY);
    const cleanAddr2 = (config.location || 'Angola').substring(0, 32);
    doc.text(cleanAddr2, col3X + 4.2, footInfoY + 3.4);

    // =========================================================================
    // 5. CABEÇALHO COMPLETO NA PÁGINA INICIAL (!onlyDecoration)
    // =========================================================================
    if (!onlyDecoration) {
        const pdfLogo = isValidLogoData(config.reportLogo) ? config.reportLogo : config.logo;
        let textStartX = 18;

        if (isValidLogoData(pdfLogo)) {
            const imgFormat = detectImageFormat(pdfLogo);
            try {
                let imgWidth = 26;
                let imgHeight = 18;
                try {
                    const properties = doc.getImageProperties(pdfLogo);
                    const originalWidth = properties.width;
                    const originalHeight = properties.height;
                    if (originalWidth && originalHeight) {
                        const aspectRatio = originalWidth / originalHeight;
                        if (aspectRatio > 1.3) {
                            imgWidth = 28;
                            imgHeight = 28 / aspectRatio;
                        } else {
                            imgHeight = 18;
                            imgWidth = 18 * aspectRatio;
                        }
                    }
                } catch (err) {
                    console.warn("Could not get logo properties:", err);
                }
                const yOffset = 12 + (18 - imgHeight) / 2;
                doc.addImage(pdfLogo, imgFormat, 18, yOffset, imgWidth, imgHeight, undefined, 'NONE');
                textStartX = 18 + imgWidth + 5;
            } catch (e) {
                console.warn("Logo skip:", e);
            }
        } else {
            // Emblema Geométrico Idêntico ao Modelo da Imagem: Quadrado Laranja com [ | ]
            doc.setFillColor(primary[0], primary[1], primary[2]);
            doc.roundedRect(18, 13, 14, 14, 1.8, 1.8, 'F');
            doc.setFillColor(255, 255, 255);
            // Barra esquerda
            doc.rect(20.8, 15.5, 1.6, 9, 'F');
            doc.rect(20.8, 15.5, 3.2, 1.6, 'F');
            doc.rect(20.8, 22.9, 3.2, 1.6, 'F');
            // Barra central
            doc.rect(24.4, 16.8, 1.2, 6.4, 'F');
            // Barra direita
            doc.rect(27.6, 15.5, 1.6, 9, 'F');
            doc.rect(26.0, 15.5, 3.2, 1.6, 'F');
            doc.rect(26.0, 22.9, 3.2, 1.6, 'F');
            textStartX = 37;
        }

        const maxTitleW = pageWidth - textStartX - (topCutW - 10);
        const compName = (toTitleCase(config.name) || config.name || 'Digital Norte').toUpperCase();

        // 1. Nome da Empresa (Negrito, Caixa Alta, Carvão Escuro)
        doc.setFont("helvetica", "bold");
        doc.setFontSize(13.5);
        doc.setTextColor(dark[0], dark[1], dark[2]);
        const nameLines = doc.splitTextToSize(compName, maxTitleW);
        doc.text(nameLines, textStartX, 18.5);

        // 2. Tagline Institucional (Letras espaçadas, estilo "YOUR TAGLINE HERE")
        const taglineY = 18.5 + (nameLines.length * 4.2);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(6.8);
        doc.setTextColor(115, 125, 135);
        const tagText = (config.nif ? `NIF: ${config.nif}   •   ` : '') + 'SISTEMA DE GESTÃO DE CRÉDITO';
        doc.text(tagText, textStartX, taglineY, { maxWidth: maxTitleW });

        // 3. Bloco de Responsável e Data (Estilo Executivo do Modelo)
        const metaY = Math.max(taglineY + 7.5, 33);

        // Linha divisória vertical fina à esquerda do bloco de responsável (conforme imagem de referência)
        doc.setDrawColor(210, 215, 225);
        doc.setLineWidth(0.35);
        doc.line(textStartX, metaY - 1, textStartX, metaY + 15);

        const infoStartX = textStartX + 2.5;

        // Nome do Titular / Responsável (Laranja Primário em Negrito)
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8.2);
        doc.setTextColor(primary[0], primary[1], primary[2]);
        doc.text((userName || 'ADMINISTRADOR').toUpperCase(), infoStartX, metaY);

        // Cargo / Departamento (Carvão / Cinza Escuro)
        doc.setFont("helvetica", "bold");
        doc.setFontSize(6.5);
        doc.setTextColor(dark[0], dark[1], dark[2]);
        doc.text("GESTOR DE CRÉDITO / OPERAÇÕES", infoStartX, metaY + 3.6);

        // Linhas de Contacto Rápido do Responsável
        doc.setFont("helvetica", "bold");
        doc.setFontSize(6.0);
        doc.setTextColor(dark[0], dark[1], dark[2]);
        doc.text("PHONE : ", infoStartX, metaY + 7.2);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(100, 116, 139);
        doc.text(config.phone || '+244 941 537 486', infoStartX + 9, metaY + 7.2);

        doc.setFont("helvetica", "bold");
        doc.setTextColor(dark[0], dark[1], dark[2]);
        doc.text("WEB : ", infoStartX, metaY + 10.4);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(100, 116, 139);
        doc.text("www.tango.co.ao", infoStartX + 7, metaY + 10.4);

        doc.setFont("helvetica", "bold");
        doc.setTextColor(dark[0], dark[1], dark[2]);
        doc.text("ADDR : ", infoStartX, metaY + 13.6);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(100, 116, 139);
        doc.text(`${cleanAddr1}, ${cleanAddr2}`, infoStartX + 8, metaY + 13.6);

        // Data Alinhada à Direita (Estilo do Modelo: "DATE : 25-Set-2026" com DATE : em Laranja)
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7.5);
        const dateY = isLandscape ? 34 : metaY + 13.6;
        const datePrefix = "DATE : ";
        const dateFullStr = `${formatDate(new Date())}`;
        const prefixW = doc.getTextWidth(datePrefix);
        const dateW = doc.getTextWidth(dateFullStr);
        const totalDateW = prefixW + dateW;
        const dateStartX = pageWidth - (isLandscape ? 16 : 14) - totalDateW;
        doc.setTextColor(primary[0], primary[1], primary[2]);
        doc.text(datePrefix, dateStartX, dateY);
        doc.setTextColor(dark[0], dark[1], dark[2]);
        doc.text(dateFullStr, dateStartX + prefixW, dateY);

        // Linha Divisória Sutil de Separação
        const divLineY = isLandscape ? 44 : metaY + 18;
        doc.setDrawColor(226, 232, 240);
        doc.setLineWidth(0.25);
        doc.line(18, divLineY, pageWidth - 14, divLineY);
    }

    // Repor configurações padrão para evitar vazamento de estilos
    doc.setTextColor(dark[0], dark[1], dark[2]);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.2);
};

export const generatePaymentReceipt = (payment: any, credit: any, settings?: any, userName?: string) => {
    const doc = new jsPDF();
    const config = getCompanySettings(settings);
    const orange = resolveBrandPrimary(config.primaryColor);
    const black = BRAND_CHARCOAL;

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
    const orange = resolveBrandPrimary(config.primaryColor);
    const black = BRAND_CHARCOAL;
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
    const orange = resolveBrandPrimary(config.primaryColor);
    const black = BRAND_CHARCOAL;

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
    const orange = resolveBrandPrimary(config.primaryColor);
    const black = BRAND_CHARCOAL;

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

    doc.setDrawColor(BRAND_CHARCOAL[0], BRAND_CHARCOAL[1], BRAND_CHARCOAL[2]);
    doc.line(30, cursorY, 90, cursorY);
    doc.line(120, cursorY, 180, cursorY);

    doc.setFontSize(8);
    doc.setTextColor(BRAND_CHARCOAL[0], BRAND_CHARCOAL[1], BRAND_CHARCOAL[2]);
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
    const orange = resolveBrandPrimary(config.primaryColor);

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
    const orange = resolveBrandPrimary(config.primaryColor);

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
            headStyles: { fillColor: BRAND_CHARCOAL },
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
            headStyles: { fillColor: BRAND_CHARCOAL },
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
        const orange = resolveBrandPrimary(config.primaryColor);
        const black = BRAND_CHARCOAL;

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
    const primary = resolveBrandPrimary(config.primaryColor);
    const dark = BRAND_CHARCOAL;
    const orange = primary;
    const black = dark;

    applyBranding(doc, config, userName);

    const pageWidth = doc.internal.pageSize.width;
    const pageHeight = doc.internal.pageSize.height;

    // 1. Título Executivo com Acento Vertical Laranja (Conforme Imagem de Referência)
    const titleY = 48;
    doc.setFillColor(primary[0], primary[1], primary[2]);
    doc.roundedRect(16, titleY, 3.5, 11, 0.8, 0.8, 'F');

    const title = (data.title || 'RELATÓRIO GERENCIAL ANALÍTICO').toUpperCase();
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12.5);
    doc.setTextColor(dark[0], dark[1], dark[2]);
    doc.text(title, 22, titleY + 5);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(`Emissão: ${new Date().toLocaleString('pt-AO', { timeZone: 'Africa/Luanda' })}   |   Responsável: ${(userName || 'Sistema').toUpperCase()}`, 22, titleY + 9.5);

    let currentY = titleY + 15;

    // Gráfico Visual se fornecido
    if (data.visualImg && data.visualImg.length > 50) {
        try {
            doc.setFont("helvetica", "bold");
            doc.setFontSize(10.5);
            doc.setTextColor(dark[0], dark[1], dark[2]);
            doc.text("RESUMO VISUAL", 16, currentY);
            currentY += 4;
            doc.addImage(data.visualImg, 'UNKNOWN', 16, currentY, pageWidth - 32, 90);
            
            // Colocar as tabelas na página 2
            doc.addPage();
            applyBranding(doc, config, userName, true);
            currentY = 40;
        } catch (e) {
            console.error("PDF Visual Chart Error", e);
        }
    }

    // 2. Cards de Métricas Gerais (Layout elegante em grid com friso superior laranja)
    if (data.summary && data.summary.length > 0) {
        const cardsPerRow = Math.min(data.summary.length, 5);
        const cardGap = 2.5;
        const startX = 16;
        const totalW = pageWidth - startX - 14;
        const cardW = (totalW - (cardsPerRow - 1) * cardGap) / cardsPerRow;
        const cardH = 13.5;

        for (let i = 0; i < data.summary.length; i++) {
            const rowIndex = Math.floor(i / cardsPerRow);
            const colIndex = i % cardsPerRow;
            const cx = startX + colIndex * (cardW + cardGap);
            const cy = currentY + rowIndex * (cardH + cardGap);

            doc.setFillColor(255, 255, 255);
            doc.setDrawColor(226, 232, 240);
            doc.setLineWidth(0.3);
            doc.roundedRect(cx, cy, cardW, cardH, 1.5, 1.5, 'FD');

            // Top stripe laranja de referência
            doc.setFillColor(primary[0], primary[1], primary[2]);
            doc.rect(cx + 1.5, cy, cardW - 3, 1.0, 'F');

            // Label
            doc.setFont("helvetica", "bold");
            doc.setFontSize(5.8);
            doc.setTextColor(100, 116, 139);
            doc.text(data.summary[i].label.toUpperCase(), cx + 2.5, cy + 4.8);

            // Value
            doc.setFont("helvetica", "bold");
            doc.setFontSize(7.5);
            doc.setTextColor(dark[0], dark[1], dark[2]);
            doc.text(doc.splitTextToSize(data.summary[i].value, cardW - 4), cx + 2.5, cy + 9.8);
        }

        const totalRows = Math.ceil(data.summary.length / cardsPerRow);
        currentY += totalRows * (cardH + cardGap) + 5;
    }

    // 3. Tabela de Detalhamento de Carteira
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5);
    doc.setTextColor(dark[0], dark[1], dark[2]);
    doc.text("DETALHAMENTO DE CARTEIRA", 16, currentY);

    autoTable(doc, {
        startY: currentY + 3.5,
        head: [['Cliente', 'Principal Concedido', 'Saldo em Aberto', 'Data Vencimento', 'Estado do Crédito']],
        body: data.credits.map(c => [
            c.clientName || 'N/A',
            formatCurrency(c.principalAmount || 0, config.currency),
            formatCurrency(c.currentBalance || 0, config.currency),
            formatDate(c.dueDate),
            c.status === 'overdue' ? 'ATRASADO' : 'REGULAR'
        ]),
        headStyles: {
            fillColor: dark,
            textColor: [255, 255, 255],
            fontStyle: 'bold',
            fontSize: 8.5
        },
        alternateRowStyles: { fillColor: [250, 250, 252] },
        styles: { fontSize: 8, cellPadding: 2.2, textColor: dark },
        columnStyles: {
            1: { halign: 'right' },
            2: { halign: 'right' },
            3: { halign: 'center' },
            4: { halign: 'center', fontStyle: 'bold' }
        },
        margin: { left: 16, right: 14, bottom: 25 },
        didParseCell: (hookData: any) => {
            if (hookData.section === 'body' && hookData.column.index === 4) {
                if (hookData.cell.raw === 'ATRASADO') {
                    hookData.cell.styles.textColor = [220, 38, 38];
                } else {
                    hookData.cell.styles.textColor = [22, 101, 52];
                }
            }
        },
        didDrawPage: () => applyBranding(doc, config, userName, true)
    });

    doc.save(`Relatorio_Analitico_${Date.now()}.pdf`);
};


export const generateGenericReportPDF = (title: string, content: string[], settings?: any, userName?: string) => {
    const doc = new jsPDF();
    const config = getCompanySettings(settings);
    const orange = resolveBrandPrimary(config.primaryColor);
    const black = BRAND_CHARCOAL;

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
        let textColor = black;

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
    const orange = resolveBrandPrimary(config.primaryColor);
    const black = BRAND_CHARCOAL;

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
    const orange = resolveBrandPrimary(config.primaryColor);
    const black = BRAND_CHARCOAL;

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
    const primaryColor = resolveBrandPrimary(config.primaryColor);
    const black = BRAND_CHARCOAL;

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
    const orange = resolveBrandPrimary(config.primaryColor);
    const black = BRAND_CHARCOAL;

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
    const orange = resolveBrandPrimary(config.primaryColor);
    const black = BRAND_CHARCOAL;

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
    const orange = resolveBrandPrimary(config.primaryColor);
    const black = BRAND_CHARCOAL;

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
    const orange = resolveBrandPrimary(config.primaryColor);
    const black = BRAND_CHARCOAL;

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
    const orange = resolveBrandPrimary(config.primaryColor);

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
    const orange = resolveBrandPrimary(config.primaryColor);

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
    const orange = resolveBrandPrimary(config.primaryColor);

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
    const orange = resolveBrandPrimary(config.primaryColor);
    const black = BRAND_CHARCOAL;

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
    const orange = resolveBrandPrimary(config.primaryColor);
    const black = BRAND_CHARCOAL;

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
        doc.setTextColor(black[0], black[1], black[2]);
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

        // Draw Income Bar (Carvão Escuro)
        doc.setFillColor(black[0], black[1], black[2]);
        doc.rect(xPos, chartY - incomeH, barSpace / 4, incomeH, 'F');

        // Draw Payment Bar (Orange)
        doc.setFillColor(orange[0], orange[1], orange[2]);
        doc.rect(xPos + (barSpace / 4) + 1, chartY - paymentH, barSpace / 4, paymentH, 'F');

        // Month Label
        doc.setFontSize(7);
        doc.setTextColor(100, 100, 100);
        doc.text(`Mês ${i + 1}`, xPos + 2, chartY + 5);
    }

    // Legend
    doc.setFontSize(8);
    doc.setFillColor(black[0], black[1], black[2]);
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
        const orange = resolveBrandPrimary(config.primaryColor);
        const black = BRAND_CHARCOAL;
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
        const orange = resolveBrandPrimary(config.primaryColor);
        const black = BRAND_CHARCOAL;
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
        const orange = resolveBrandPrimary(config.primaryColor);
        const black = BRAND_CHARCOAL;
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
        const orange = resolveBrandPrimary(config.primaryColor);
        const black = BRAND_CHARCOAL;
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
        const primaryColor = resolveBrandPrimary(config.primaryColor);
        const black = BRAND_CHARCOAL;

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
        doc.setTextColor(black[0], black[1], black[2]);
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

export const exportCompanyCredentialsPDF = (company: {
    name: string;
    nif: string;
    accessCode: string;
    expiresAt?: string | null;
    webUrl?: string;
}) => {
    try {
        const doc = new jsPDF();
        const primaryColor: [number, number, number] = [243, 112, 33]; // #F37021
        const darkColor: [number, number, number] = [43, 45, 47]; // #2B2D2F
        const webUrl = company.webUrl || 'https://tango-gestao-creditos.vercel.app';

        // Cabeçalho institucional
        doc.setFillColor(darkColor[0], darkColor[1], darkColor[2]);
        doc.rect(0, 0, 210, 38, 'F');

        doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
        doc.rect(0, 36, 210, 2.5, 'F');

        doc.setFont("helvetica", "bold");
        doc.setFontSize(16);
        doc.setTextColor(255, 255, 255);
        doc.text("TANGO GESTÃO DE CRÉDITOS ERP", 20, 18);

        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(220, 220, 220);
        doc.text("Módulo Central Tango Master Gen • Certificação e Ativação Cloud", 20, 26);
        doc.text(`Data de Emissão: ${new Date().toLocaleDateString('pt-AO')}`, 190, 26, { align: 'right' });

        // Título do Documento
        let currentY = 52;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(15);
        doc.setTextColor(darkColor[0], darkColor[1], darkColor[2]);
        doc.text("CREDENCIAL OFICIAL DE ACESSO WEB", 105, currentY, { align: 'center' });
        currentY += 6;

        doc.setFontSize(9.5);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(100, 116, 139);
        doc.text("Ficha de Ativação e Homologação de Empresa para Acesso Online", 105, currentY, { align: 'center' });
        currentY += 12;

        // Caixa Principal de Credenciais
        doc.setFillColor(248, 250, 252);
        doc.setDrawColor(primaryColor[0], primaryColor[1], primaryColor[2]);
        doc.setLineWidth(0.8);
        doc.roundedRect(20, currentY, 170, 78, 3, 3, 'FD');

        const boxStartY = currentY + 10;
        doc.setFontSize(8.5);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(100, 116, 139);
        doc.text("EMPRESA LICENCIADA:", 28, boxStartY);
        doc.setFontSize(13);
        doc.setTextColor(darkColor[0], darkColor[1], darkColor[2]);
        doc.text(company.name.toUpperCase(), 28, boxStartY + 7);

        doc.setFontSize(8.5);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(100, 116, 139);
        doc.text("NÚMERO DE IDENTIFICAÇÃO FISCAL (NIF):", 28, boxStartY + 20);
        doc.setFontSize(12);
        doc.setFont("courier", "bold");
        doc.setTextColor(darkColor[0], darkColor[1], darkColor[2]);
        doc.text(company.nif, 28, boxStartY + 27);

        // Caixa de destaque do Código de Acesso
        doc.setFillColor(254, 243, 199);
        doc.setDrawColor(245, 158, 11);
        doc.setLineWidth(0.6);
        doc.roundedRect(28, boxStartY + 35, 154, 24, 2, 2, 'FD');

        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        doc.setTextColor(180, 83, 9);
        doc.text("CÓDIGO DE ACESSO E ATIVAÇÃO (TANGOMASTER):", 34, boxStartY + 42);

        doc.setFont("courier", "bold");
        doc.setFontSize(15);
        doc.setTextColor(15, 23, 42);
        doc.text(company.accessCode, 34, boxStartY + 52);

        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(100, 116, 139);
        const expStr = company.expiresAt ? new Date(company.expiresAt).toLocaleDateString('pt-AO') : 'Vitalício / Permanente';
        doc.text(`Validade: ${expStr}`, 174, boxStartY + 52, { align: 'right' });

        currentY += 88;

        // Caixa do Link de Acesso
        doc.setFillColor(241, 245, 249);
        doc.setDrawColor(203, 213, 225);
        doc.setLineWidth(0.4);
        doc.roundedRect(20, currentY, 170, 24, 2, 2, 'FD');

        doc.setFont("helvetica", "bold");
        doc.setFontSize(8.5);
        doc.setTextColor(darkColor[0], darkColor[1], darkColor[2]);
        doc.text("LINK DE ACESSO ONLINE (WEB / VERCEL):", 28, currentY + 8);

        doc.setFont("courier", "bold");
        doc.setFontSize(10.5);
        doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
        doc.text(webUrl, 28, currentY + 16);

        currentY += 34;

        // Instruções de Ativação
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.setTextColor(darkColor[0], darkColor[1], darkColor[2]);
        doc.text("INSTRUÇÕES PARA ATIVAÇÃO NO PRIMEIRO ACESSO:", 20, currentY);
        currentY += 7;

        doc.setFont("helvetica", "normal");
        doc.setFontSize(8.5);
        doc.setTextColor(71, 85, 105);

        const instructions = [
            `1. Aceda ao endereço ${webUrl} através de qualquer navegador web (Chrome, Edge, Safari, etc.).`,
            "2. No ecrã de ativação, introduza o NIF da empresa e o Código de Acesso impresso nesta credencial.",
            "3. O sistema fará a validação instantânea com o Tango Master e desbloqueará a configuração da empresa.",
            "4. Conclua o assistente inicial (Onboarding) para definir o utilizador Administrador e iniciar o trabalho."
        ];

        instructions.forEach(step => {
            doc.text(step, 24, currentY);
            currentY += 6;
        });

        currentY += 8;

        // Alerta de Confidencialidade
        doc.setFillColor(254, 242, 242);
        doc.setDrawColor(239, 68, 68);
        doc.setLineWidth(0.4);
        doc.roundedRect(20, currentY, 170, 22, 2, 2, 'FD');

        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        doc.setTextColor(185, 28, 28);
        doc.text("AVISO DE SEGURANÇA E CONFIDENCIALIDADE:", 28, currentY + 7);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7.5);
        doc.setTextColor(127, 29, 29);
        doc.text("Este código de acesso é confidencial e exclusivo da empresa titulada. O registo das operações é", 28, currentY + 12);
        doc.text("auditado centralmente pelo Tango Master Gen para efeitos de conformidade e integridade.", 28, currentY + 17);

        // Rodapé
        doc.setFontSize(7.5);
        doc.setTextColor(148, 163, 184);
        doc.line(20, 280, 190, 280);
        doc.text("TangoMaster Gen • Sistema Integrado de Licenciamento e Gestão de Créditos", 105, 285, { align: 'center' });

        doc.save(`Credencial_Acesso_${company.nif}_${(company.name || 'Empresa').replace(/\s+/g, '_')}.pdf`);
    } catch (e) {
        console.error("Erro ao gerar PDF de credenciais da empresa:", e);
    }
};

/** Plano de pagamento entregue ao cliente: valor concedido, prazo, prestações e datas. */
export const generatePaymentPlanPDF = (
    data: {
        clientName: string;
        clientNif?: string;
        creditReference?: string;
        plan: {
            principalMinor: number; ratePercent: number; months: number; interestMinor: number; totalMinor: number;
            installmentMinor: number; firstDueDate: string; lastDueDate: string;
            installments: Array<{ number: number; dueDate: string; principalMinor: number; interestMinor: number; totalMinor: number; balanceAfterMinor: number }>;
        };
        paidInstallments?: number;
    },
    settings?: any,
    userName?: string
) => {
    const doc = new jsPDF();
    const config = getCompanySettings(settings);
    const primary = resolveBrandPrimary(config.primaryColor);
    const black = BRAND_CHARCOAL;
    const money = (minor: number) => formatCurrency(minor / 100, config.currency);
    const { plan } = data;

    applyBranding(doc, config, userName);

    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text('PLANO DE PAGAMENTO', 105, 45, { align: 'center' });

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Cliente: ${data.clientName}`, 20, 58);
    doc.text(`NIF/BI: ${data.clientNif || 'Não informado'}`, 20, 63);
    doc.text(`Referência: ${data.creditReference || 'Simulação'}`, 20, 68);
    doc.text(`Data de Emissão: ${formatDateTime(new Date())}`, 20, 73);

    const boxY = 80;
    doc.setFillColor(245, 247, 250);
    doc.roundedRect(20, boxY, 170, 22, 2, 2, 'F');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text('VALOR CONCEDIDO', 25, boxY + 7);
    doc.text(`JUROS (${plan.ratePercent}%)`, 68, boxY + 7);
    doc.text('TOTAL A PAGAR', 108, boxY + 7);
    doc.text(`${plan.months} PRESTAÇÕES DE`, 148, boxY + 7);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(black[0], black[1], black[2]);
    doc.text(money(plan.principalMinor), 25, boxY + 16);
    doc.text(money(plan.interestMinor), 68, boxY + 16);
    doc.setTextColor(primary[0], primary[1], primary[2]);
    doc.text(money(plan.totalMinor), 108, boxY + 16);
    doc.setTextColor(black[0], black[1], black[2]);
    doc.text(money(plan.installmentMinor), 148, boxY + 16);

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(80, 80, 80);
    doc.text(`Prazo de ${plan.months} ${plan.months === 1 ? 'mês' : 'meses'}: primeira prestação a ${formatDate(plan.firstDueDate)} e última a ${formatDate(plan.lastDueDate)}.`, 20, boxY + 30);

    const paid = data.paidInstallments || 0;
    autoTable(doc, {
        startY: boxY + 35,
        head: [['Nº', 'Vencimento', 'Capital', 'Juros', 'Prestação', 'Saldo restante', 'Estado']],
        body: plan.installments.map(item => [
            String(item.number),
            formatDate(item.dueDate),
            money(item.principalMinor),
            money(item.interestMinor),
            money(item.totalMinor),
            money(item.balanceAfterMinor),
            item.number <= paid ? 'Paga' : 'Por pagar'
        ]),
        foot: [['', 'TOTAL', money(plan.principalMinor), money(plan.interestMinor), money(plan.totalMinor), '', '']],
        headStyles: { fillColor: primary, textColor: [255, 255, 255], fontStyle: 'bold' },
        footStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold' },
        styles: { fontSize: 9 },
        columnStyles: { 0: { halign: 'center', cellWidth: 10 }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' } },
        margin: { left: 20, right: 20 },
    });

    const finalY = (doc as any).lastAutoTable?.finalY || 200;
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    doc.text('Os pagamentos em atraso estão sujeitos à taxa de mora prevista no contrato.', 20, Math.min(finalY + 10, 280));

    doc.save(`plano-pagamento-${data.clientName.replace(/[^\w]+/g, '-').toLowerCase()}.pdf`);
};
