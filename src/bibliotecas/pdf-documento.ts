import { jsPDF } from 'jspdf';

const configured = new WeakMap<jsPDF, string | null>();
const stamped = new WeakMap<jsPDF, Set<number>>();

const pageDecorators = new WeakMap<jsPDF, (doc: jsPDF) => void>();
const decoratedPages = new WeakMap<jsPDF, Set<number>>();
const currentPage = (doc: jsPDF) => doc.getCurrentPageInfo().pageNumber;

const brandTextLocked = new WeakSet<jsPDF>();
const rgbKey = (args: any[]): string | null => {
    if (args.length >= 3) return args.slice(0, 3).map(Number).join(',');
    const value = args[0];
    if (Array.isArray(value)) return value.slice(0, 3).map(Number).join(',');
    if (typeof value !== 'string') return null;
    const hex = value.trim().replace(/^#/, '');
    const full = hex.length === 3 ? hex.split('').map(c => c + c).join('') : hex;
    return /^[0-9a-f]{6}$/i.test(full) ? [0, 2, 4].map(i => parseInt(full.slice(i, i + 2), 16)).join(',') : null;
};

/**
 * Letras dos documentos sempre a preto: as cores da marca escolhidas nas definições ficam só para as molduras,
 * barras, ícones e fundos. Qualquer texto pedido numa dessas cores (cabeçalho, títulos, indicadores, tabelas)
 * passa a preto; o texto branco sobre fundos de cor e as cores de estado (verde, vermelho) mantêm-se.
 */
export function lockBrandTextToBlack(doc: jsPDF, brandColors: Array<[number, number, number]>) {
    if (brandTextLocked.has(doc)) return;
    brandTextLocked.add(doc);
    const brand = new Set(brandColors.map(color => color.join(',')));
    const setTextColor = doc.setTextColor.bind(doc) as (...args: any[]) => jsPDF;
    (doc as any).setTextColor = (...args: any[]) => {
        const key = rgbKey(args);
        return key && brand.has(key) ? setTextColor(0, 0, 0) : setTextColor(...args);
    };
}

/** Regista como decorar (moldura, rodapé com contactos) as páginas novas deste documento. */
export function setPdfPageDecorator(doc: jsPDF, decorate: (doc: jsPDF) => void) {
    pageDecorators.set(doc, decorate);
}

/** Marca a página actual como já decorada (chamado pela própria moldura). */
export function markPdfPageDecorated(doc: jsPDF) {
    const pages = decoratedPages.get(doc) || new Set<number>();
    pages.add(currentPage(doc));
    decoratedPages.set(doc, pages);
}

/** Decora a página actual se ainda não tiver moldura (ex.: páginas criadas por uma tabela longa). */
export function decorateCurrentPdfPage(doc: jsPDF) {
    if (decoratedPages.get(doc)?.has(currentPage(doc))) return;
    pageDecorators.get(doc)?.(doc);
}

export function setPdfWatermark(doc: jsPDF, logo: string | null | undefined) {
    if (logo === undefined) configured.delete(doc);
    else configured.set(doc, logo || null);
}

function storedWatermark(): string | null {
    try {
        const master = localStorage.getItem('tango_master_watermark');
        if (master) return master;
        const account = localStorage.getItem('tango_active_account_id') || 'default';
        const saved = localStorage.getItem('cached_company_settings:' + account) || localStorage.getItem('company_settings');
        const settings = saved ? JSON.parse(saved) : null;
        return settings?.watermarkLogo || localStorage.getItem('company_watermark_logo_backup:' + account) || null;
    } catch {
        return null;
    }
}

export function getMasterPdfWatermark(): string | null {
    try { return localStorage.getItem('tango_master_watermark'); } catch { return null; }
}

export function applyPdfWatermark(doc: jsPDF) {
    const logo = configured.has(doc) ? configured.get(doc) : storedWatermark();
    if (!logo || !logo.startsWith('data:image/')) return;
    const previousPage = doc.getCurrentPageInfo().pageNumber;
    const done = stamped.get(doc) || new Set<number>();
    stamped.set(doc, done);
    try {
        const image = doc.getImageProperties(logo);
        for (let page = 1; page <= doc.getNumberOfPages(); page++) {
            if (done.has(page)) continue;
            doc.setPage(page);
            const width = doc.internal.pageSize.getWidth();
            const height = doc.internal.pageSize.getHeight();
            const scale = Math.min(width * 0.65 / image.width, height * 0.65 / image.height);
            doc.saveGraphicsState();
            try {
                doc.setGState(new (doc.GState as unknown as { new (options: { opacity: number }): any })({ opacity: 0.08 }));
                doc.addImage(logo, image.fileType, (width - image.width * scale) / 2,
                    (height - image.height * scale) / 2, image.width * scale, image.height * scale);
                done.add(page);
            } finally {
                doc.restoreGraphicsState();
            }
        }
    } catch (error) {
        console.warn('Não foi possível aplicar a marca de água ao PDF.', error);
    } finally {
        doc.setPage(previousPage);
    }
}

// A exportação central cobre downloads, blobs, impressão e anexos, incluindo páginas adicionadas depois.
jsPDF.API.events.push(['initialized', function (this: jsPDF) {
    const save = this.save;
    const output = this.output;
    this.save = function (...args: any[]) {
        applyPdfWatermark(this);
        return (save as any).apply(this, args);
    } as typeof this.save;
    this.output = function (...args: any[]) {
        applyPdfWatermark(this);
        return (output as any).apply(this, args);
    } as typeof this.output;
}]);

export { jsPDF };
export default jsPDF;
