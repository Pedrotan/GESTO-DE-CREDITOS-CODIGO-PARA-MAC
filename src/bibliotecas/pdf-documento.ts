import { jsPDF } from 'jspdf';

const configured = new WeakMap<jsPDF, string | null>();
const stamped = new WeakMap<jsPDF, Set<number>>();

export function setPdfWatermark(doc: jsPDF, logo: string | null | undefined) {
    configured.set(doc, logo || null);
}

function storedWatermark(): string | null {
    try {
        const account = localStorage.getItem('tango_active_account_id') || 'default';
        const saved = localStorage.getItem('cached_company_settings:' + account) || localStorage.getItem('company_settings');
        const settings = saved ? JSON.parse(saved) : null;
        return settings?.watermarkLogo || localStorage.getItem('company_watermark_logo_backup:' + account) || null;
    } catch {
        return null;
    }
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