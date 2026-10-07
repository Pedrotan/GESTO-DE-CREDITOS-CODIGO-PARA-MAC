import jsPDF from '@/bibliotecas/pdf-documento';
import autoTable from '@/bibliotecas/pdf-tabela';
import { applyBranding, brandingHeaderBottom, getCompanySettings } from '@/bibliotecas/pdf';
import { formatDateTime } from '@/bibliotecas/formatters';

export type ExportTable = {
    title: string;
    /** Período e filtros aplicados, mostrados por baixo do título. */
    subtitle?: string;
    head: string[];
    body: Array<Array<string | number>>;
    /** Colunas alinhadas à direita (valores). */
    numericColumns?: number[];
    /** Linhas finais (totais) em negrito. */
    footer?: Array<Array<string | number>>;
    fileName: string;
};

const safeName = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w-]+/g, '-').replace(/-+/g, '-').toLowerCase();

/** Exporta uma tabela contabilística em PDF (paisagem, com o cabeçalho e rodapé da empresa). */
export function exportTablePdf(table: ExportTable, settings: any, userName?: string) {
    const doc = new jsPDF({ orientation: 'landscape' });
    const config = getCompanySettings(settings);
    applyBranding(doc, config, userName, false, { tagline: 'CONTABILIDADE E AUDITORIA' });
    const top = brandingHeaderBottom(doc) + 9;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.setTextColor(20, 20, 20);
    doc.text(table.title.toUpperCase(), 14, top);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(100, 116, 139);
    doc.text(`${table.subtitle ? `${table.subtitle}  •  ` : ''}Emitido em ${formatDateTime(new Date())}${userName ? ` por ${userName}` : ''}`, 14, top + 5.5);
    const columnStyles: Record<number, any> = {};
    for (const column of table.numericColumns || []) columnStyles[column] = { halign: 'right' };
    autoTable(doc, {
        startY: top + 10,
        head: [table.head],
        body: table.body.map(row => row.map(cell => String(cell ?? ''))),
        foot: table.footer?.map(row => row.map(cell => String(cell ?? ''))),
        showFoot: 'lastPage',
        styles: { fontSize: 7.6, cellPadding: 1.8, overflow: 'linebreak' },
        headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: 'bold' },
        footStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold' },
        columnStyles,
        didDrawPage: hook => { if (hook.pageNumber > 1) applyBranding(doc, config, userName, true); },
    });
    doc.save(`${safeName(table.fileName)}.pdf`);
}

/** Exporta a mesma tabela para Excel (título e filtros nas primeiras linhas). */
export async function exportTableExcel(table: ExportTable) {
    const XLSX = await import('xlsx');
    const rows: Array<Array<string | number>> = [[table.title], ...(table.subtitle ? [[table.subtitle]] : []), [], table.head, ...table.body, ...(table.footer || [])];
    const book = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet(rows);
    sheet['!cols'] = table.head.map((_, index) => ({ wch: Math.min(60, Math.max(12, ...[table.head, ...table.body].map(row => String(row[index] ?? '').length + 2))) }));
    XLSX.utils.book_append_sheet(book, sheet, table.title.slice(0, 31).replace(/[\\/?*[\]:]/g, ' '));
    XLSX.writeFile(book, `${safeName(table.fileName)}.xlsx`);
}
