import { CONFLICT_REPORT_COLUMNS, conflictReportRows, conflictStatus, type SyncConflict } from './sync-conflitos';

export async function downloadConflictReport(format: string, rows: SyncConflict[], context: Record<string, unknown>) {
    const generatedAt = new Date().toISOString();
    const name = `sincronizacao-completa-${generatedAt.slice(0, 19).replace(/[:T]/g, '-')}`;
    if (format === 'pdf') {
        const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
        const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a3' });
        pdf.setFontSize(15); pdf.text('Relatório completo de sincronização', 12, 15);
        pdf.setFontSize(9);
        const header = pdf.splitTextToSize(`${context.company || 'Empresa'} | NIF: ${context.nif || '—'}\nServidor: ${context.server || '—'}\nGerado: ${new Date(generatedAt).toLocaleString('pt-AO')} | Estado: ${({ idle: 'Parado', syncing: 'A sincronizar', synced: 'Sincronizado', pending: 'Com alterações por enviar', error: 'Com erro' } as Record<string, string>)[String(context.syncState)] || context.syncState || '—'}\nTotal: ${rows.length} | Inclui todos os estados e páginas, incluindo o arquivo.`, 390);
        pdf.text(header, 12, 22);
        autoTable(pdf, { startY: 25 + header.length * 4, head: [CONFLICT_REPORT_COLUMNS], body: conflictReportRows(rows),
            styles: { fontSize: 7, cellPadding: 2, overflow: 'linebreak', valign: 'top' },
            headStyles: { fillColor: [22, 42, 79] }, margin: { left: 12, right: 12, bottom: 15 },
            columnStyles: { 0: { cellWidth: 34 }, 1: { cellWidth: 27 }, 2: { cellWidth: 23 }, 3: { cellWidth: 34 }, 4: { cellWidth: 22 }, 5: { cellWidth: 100 }, 6: { cellWidth: 90 }, 7: { cellWidth: 29 }, 8: { cellWidth: 27 } },
        });
        const total = pdf.getNumberOfPages();
        for (let page = 1; page <= total; page++) { pdf.setPage(page); pdf.text(`Página ${page} de ${total}`, 370, 290); }
        pdf.save(`${name}.pdf`);
        return;
    }
    const csvCell = (value: unknown) => `"${String(value ?? '').replace(/^[=+@\-\t\r]/, "'$&").replace(/"/g, '""')}"`;
    const content = format === 'json'
        ? JSON.stringify({ ...context, generatedAt, total: rows.length, records: rows.map(row => ({ ...row, displayStatus: conflictStatus(row) })) }, null, 2)
        : '\uFEFF' + [CONFLICT_REPORT_COLUMNS, ...conflictReportRows(rows)].map(row => row.map(csvCell).join(';')).join('\r\n');
    const url = URL.createObjectURL(new Blob([content], { type: format === 'json' ? 'application/json;charset=utf-8' : 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = `${name}.${format}`;
    document.body.appendChild(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
