import baseAutoTable, { type UserOptions } from 'jspdf-autotable';
import type { jsPDF } from 'jspdf';
import { decorateCurrentPdfPage } from './pdf-documento';

// Todas as tabelas dos PDFs passam por aqui: nas páginas seguintes à primeira, a moldura decorativa do topo
// (canto superior direito) e os contactos do rodapé ocupam espaço fixo. Garante margens mínimas para que o
// conteúdo nunca fique por baixo deles.

/** Topo mínimo (mm) das tabelas que continuam noutra página, em retrato e em paisagem. */
export const PDF_TABLE_MIN_TOP_PORTRAIT = 40;
export const PDF_TABLE_MIN_TOP_LANDSCAPE = 34;
/** Espaço mínimo (mm) reservado ao rodapé (contactos e barra inferior). */
export const PDF_TABLE_MIN_BOTTOM = 26;

type Sides = { top?: number; right?: number; bottom?: number; left?: number };

const toSides = (margin: UserOptions['margin']): Sides => {
    if (typeof margin === 'number') return { top: margin, right: margin, bottom: margin, left: margin };
    if (Array.isArray(margin)) {
        const [top, right = top, bottom = top, left = right] = margin as number[];
        return { top, right, bottom, left };
    }
    if (!margin || typeof margin !== 'object') return {};
    const value = margin as Sides & { horizontal?: number; vertical?: number };
    return {
        top: value.top ?? value.vertical,
        bottom: value.bottom ?? value.vertical,
        left: value.left ?? value.horizontal,
        right: value.right ?? value.horizontal,
    };
};

/**
 * Larguras fixas de colunas que, somadas, não cabem na página são reduzidas na mesma proporção (as colunas
 * automáticas ficam com pelo menos 14 mm cada). Evita tabelas a sair da página ou por cima da moldura.
 */
const fitColumnStyles = (columnStyles: UserOptions['columnStyles'], available: number, columnCount: number): UserOptions['columnStyles'] => {
    if (!columnStyles) return columnStyles;
    const entries = Object.entries(columnStyles) as Array<[string, any]>;
    const fixed = entries.filter(([, style]) => typeof style?.cellWidth === 'number');
    const fixedTotal = fixed.reduce((sum, [, style]) => sum + style.cellWidth, 0);
    const autoColumns = Math.max(0, columnCount - fixed.length);
    const room = available - autoColumns * 14;
    if (!fixed.length || fixedTotal <= room || room <= 0) return columnStyles;
    const factor = (room - 1) / fixedTotal;
    return Object.fromEntries(entries.map(([key, style]) => [key, typeof style?.cellWidth === 'number' ? { ...style, cellWidth: Math.floor(style.cellWidth * factor * 10) / 10 } : style]));
};

const columnCountOf = (options: UserOptions) => {
    const rows = [...((options.head as any[]) || []), ...((options.body as any[]) || []).slice(0, 5)];
    const counts = rows.map(row => Array.isArray(row) ? row.reduce((sum: number, cell: any) => sum + (Number(cell?.colSpan) || 1), 0) : Object.keys(row || {}).length);
    return Math.max(0, ...counts, ...(options.columns ? [options.columns.length] : []));
};

export default function autoTable(doc: jsPDF, options: UserOptions) {
    const pageWidth = doc.internal.pageSize.getWidth();
    const landscape = pageWidth > doc.internal.pageSize.getHeight();
    const sides = toSides(options.margin);
    const left = sides.left ?? 14;
    const right = sides.right ?? 14;
    const tableWidth = typeof options.tableWidth === 'number' ? options.tableWidth : pageWidth - left - right;
    return baseAutoTable(doc, {
        ...options,
        didDrawPage: hook => { options.didDrawPage?.(hook); decorateCurrentPdfPage(doc); },
        columnStyles: fitColumnStyles(options.columnStyles, tableWidth, columnCountOf(options)),
        margin: {
            left,
            right,
            top: Math.max(sides.top ?? 0, landscape ? PDF_TABLE_MIN_TOP_LANDSCAPE : PDF_TABLE_MIN_TOP_PORTRAIT),
            bottom: Math.max(sides.bottom ?? 0, PDF_TABLE_MIN_BOTTOM),
        },
    });
}

export type { UserOptions };
