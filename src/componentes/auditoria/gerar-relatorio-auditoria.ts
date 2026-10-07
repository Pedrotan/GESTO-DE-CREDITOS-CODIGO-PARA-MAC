import { assignSessions, toAuditEvent, type AuditEvent } from '@/bibliotecas/auditoria-analise';
import { addDaysToKey, luandaParts, luandaToUtc, luandaTodayKey } from '@/bibliotecas/fuso-angola';
import { buildAuditReport, type AuditReportKey } from '@/bibliotecas/relatorios-auditoria';
import { downloadDataUrl, renderReportExcel, renderReportPdf } from '@/bibliotecas/relatorios-pagamentos';
import { ServicoAuditoriaAvancada, ALERT_STATUS_LABELS, type IntegrityResult, type StoredAlert } from '@/servicos/ServicoAuditoriaAvancada';
import { ServicoPagamentos } from '@/servicos/ServicoPagamentos';

export const WEEKLY_AUDIT_REPORT = 'auditoria-semanal';

/** Gera um relatório de auditoria, guarda-o no histórico (a exportação fica na auditoria) e descarrega-o. */
export async function generateAuditReport(input: {
    key: AuditReportKey; format: 'pdf' | 'xlsx'; events: AuditEvent[]; periodLabel: string; filters: string[];
    alerts?: StoredAlert[]; integrity?: IntegrityResult | null; settings: any; actor: { id: string; name: string; role?: string }; download?: boolean;
}) {
    const def = buildAuditReport(input.key, {
        events: input.events, periodLabel: input.periodLabel, filters: input.filters, integrity: input.integrity,
        alerts: (input.alerts || []).map(alert => ({ ...alert, status: ALERT_STATUS_LABELS[alert.status] || alert.status })),
    });
    const file = input.format === 'pdf' ? renderReportPdf(def, input.settings, input.actor.name, 'datauri') : renderReportExcel(def, input.settings, input.actor.name, 'datauri');
    await ServicoPagamentos.saveReport({
        reportType: `auditoria-${input.key}`, title: def.title, format: input.format, fileName: file.fileName, dataUrl: file.dataUrl,
        filters: { periodo: input.periodLabel, filtros: input.filters, eventos: input.events.length, hash: def.footerNote },
    }, { id: input.actor.id, name: input.actor.name, role: input.actor.role || '' } as any);
    if (input.download !== false) downloadDataUrl(file.dataUrl, file.fileName);
    return { ...file, title: def.title };
}

/** Semana anterior completa (segunda a domingo), na hora de Angola. */
export function previousWeek(now = new Date()) {
    const today = luandaTodayKey(now);
    const weekday = luandaParts(now)?.weekday ?? 1;
    const monday = addDaysToKey(today, -((weekday + 6) % 7) - 7);
    const sunday = addDaysToKey(monday, 6);
    return {
        key: `W${monday}`, label: `Semana de ${monday.split('-').reverse().join('/')} a ${sunday.split('-').reverse().join('/')}`,
        fromIso: luandaToUtc(monday).toISOString(), toIso: luandaToUtc(sunday, 23, 59, 59, 999).toISOString(),
    };
}

/** Resumo semanal de segurança em PDF, para o envio automático (sem descarregar). */
export async function buildWeeklySecurityReport(settings: any, actor: { id: string; name: string; role?: string }, roles: Map<string, string>) {
    const week = previousWeek();
    const rows = await ServicoAuditoriaAvancada.loadRows({ fromIso: week.fromIso, toIso: week.toIso });
    const events = assignSessions(rows.map(row => toAuditEvent(row, { roles })));
    const alerts = (await ServicoAuditoriaAvancada.listAlerts()).filter(alert => alert.occurredAt >= week.fromIso && alert.occurredAt <= week.toIso);
    const file = await generateAuditReport({ key: 'semanal', format: 'pdf', events, periodLabel: week.label, filters: [], alerts, settings, actor, download: false });
    return { ...file, week };
}
