import { luandaTodayKey } from '@/bibliotecas/fuso-angola';
import { periodRange, type PeriodSelection } from '@/bibliotecas/periodos';
import { previousKeyRange, rangeKeys, sameRangeLastYear, type PaymentRow, type ScheduleItem } from '@/bibliotecas/pagamentos-analise';
import { buildReport, downloadDataUrl, renderReportExcel, renderReportPdf, type ReportKey } from '@/bibliotecas/relatorios-pagamentos';
import { ServicoPagamentos, type Actor } from '@/servicos/ServicoPagamentos';

export type ReportRequest = {
    key: ReportKey;
    format: 'pdf' | 'xlsx';
    rows: PaymentRow[];
    schedule: ScheduleItem[];
    selection: PeriodSelection;
    filters: string[];
    numbers: Map<string, string>;
    phones: Map<string, string>;
    managers: Map<string, string>;
    statement?: { clientId?: string; creditId?: string; label: string };
    settings: any;
    actor: Actor;
    /** false = só gera (envio automático); true = também descarrega no computador. */
    download?: boolean;
};

/** Gera um relatório em PDF ou Excel, guarda-o no histórico (com auditoria) e, se pedido, descarrega-o. */
export async function generatePaymentsReport(request: ReportRequest) {
    const range = periodRange(request.selection);
    const keys = rangeKeys(range);
    const def = buildReport(request.key, {
        rows: request.rows, schedule: request.schedule, range: keys,
        previousRange: previousKeyRange(request.selection, keys), lastYearRange: sameRangeLastYear(keys),
        periodLabel: range.label, filters: request.filters, today: luandaTodayKey(),
        numbers: request.numbers, phones: request.phones, managers: request.managers, statement: request.statement,
    });
    const file = request.format === 'pdf'
        ? renderReportPdf(def, request.settings, request.actor.name, 'datauri')
        : renderReportExcel(def, request.settings, request.actor.name, 'datauri');
    await ServicoPagamentos.saveReport({
        reportType: request.key, title: def.title, format: request.format, fileName: file.fileName, dataUrl: file.dataUrl,
        filters: { periodo: range.label, filtros: request.filters, ...(request.statement ? { extrato: request.statement.label } : {}) },
    }, request.actor);
    if (request.download !== false) downloadDataUrl(file.dataUrl, file.fileName);
    return { ...file, title: def.title };
}
