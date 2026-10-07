// Relatórios da auditoria em PDF e Excel (mesmo motor dos relatórios de pagamentos). Cada relatório leva o hash
// SHA-256 do seu conteúdo no rodapé e no resumo, para provar que não foi alterado depois de gerado.
import { sha256 } from '@noble/hashes/sha2.js';
import {
    ACTION_LABELS, MODULE_LABELS, RESULT_LABELS, SEVERITY_LABELS, SEVERITY_ORDER, activityHeatmap, auditKpis, byModuleAndSeverity, formatAuditTimestamp,
    type AuditEvent,
} from './auditoria-analise';
import type { Cell, ReportDef, Section } from './relatorios-pagamentos';

export type AuditReportKey = 'eventos' | 'semanal' | 'auditor-externo' | 'por-utilizador' | 'config-permissoes';
export const AUDIT_REPORTS: Array<{ key: AuditReportKey; title: string; description: string }> = [
    { key: 'eventos', title: 'Registo de Auditoria', description: 'Os eventos com os filtros aplicados.' },
    { key: 'semanal', title: 'Resumo Semanal de Segurança', description: 'Eventos críticos, alertas, logins falhados e acessos fora de horas.' },
    { key: 'auditor-externo', title: 'Relatório para Auditor Externo', description: 'Período escolhido, com a verificação de integridade.' },
    { key: 'por-utilizador', title: 'Atividade por Utilizador', description: 'Totais por utilizador, sessões, IP e dispositivos.' },
    { key: 'config-permissoes', title: 'Alterações a Configurações e Permissões', description: 'Valores anteriores e novos de cada alteração.' },
];

export type AuditReportInput = {
    events: AuditEvent[];
    periodLabel: string;
    filters: string[];
    alerts?: Array<{ title: string; severity: string; status: string; occurredAt: string; originUserName: string | null; description: string | null }>;
    integrity?: { ok: boolean; checked: number; message: string; verifiedAt: string; hmac?: { detail: string } | null } | null;
};

const hex = (bytes: Uint8Array) => Array.from(bytes).map(byte => byte.toString(16).padStart(2, '0')).join('');
export const contentHash = (value: unknown) => hex(sha256(new TextEncoder().encode(JSON.stringify(value))));

const eventLine = (event: AuditEvent): Cell[] => [
    event.seq ?? '—', formatAuditTimestamp(event.timestamp), event.userName, MODULE_LABELS[event.module], ACTION_LABELS[event.action],
    event.entity?.label || '—', RESULT_LABELS[event.result], SEVERITY_LABELS[event.severity], event.ip || '—', event.summary.slice(0, 220),
];
const EVENT_HEAD = ['N.º', 'Data/Hora', 'Utilizador', 'Módulo', 'Ação', 'Entidade', 'Resultado', 'Gravidade', 'IP', 'Resumo'];
const EVENT_WIDTHS = { 0: 11, 1: 30, 2: 28, 3: 22, 4: 26, 5: 30, 6: 17, 7: 17, 8: 20 };
const eventsSection = (heading: string, list: AuditEvent[], emptyText = 'Sem eventos.'): Section => ({
    heading, head: EVENT_HEAD, rows: list.map(eventLine), numeric: [0], widths: EVENT_WIDTHS, emptyText,
});

export function buildAuditReport(key: AuditReportKey, input: AuditReportInput): ReportDef {
    const info = AUDIT_REPORTS.find(item => item.key === key)!;
    const events = [...input.events].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    const kpis = auditKpis(events);
    const subtitle = `${input.periodLabel}${input.filters.length ? ` · ${input.filters.join(' · ')}` : ''}`;
    const severityRows: Cell[][] = SEVERITY_ORDER.slice().reverse().map(level => [SEVERITY_LABELS[level], events.filter(event => event.severity === level).length]);
    let sections: Section[] = [];
    let summary: Array<[string, string]> = [['Eventos', String(kpis.total)], ['Críticos e altos', String(kpis.criticalHigh)], ['Logins falhados', String(kpis.loginFailed)], ['Acessos negados', String(kpis.accessDenied)]];
    let orientation: ReportDef['orientation'] = 'landscape';
    switch (key) {
        case 'eventos':
            sections = [eventsSection('Eventos', events, 'Sem eventos com estes filtros.')];
            break;
        case 'semanal': {
            const heat = activityHeatmap(events);
            const offHours = events.filter(event => heat.offHours(event.weekday, event.hour));
            const alerts = input.alerts || [];
            summary = [...summary, ['Alertas no período', String(alerts.length)], ['Eventos fora de horas', String(offHours.length)]];
            sections = [
                eventsSection('Eventos críticos e de gravidade alta', events.filter(event => event.severity === 'critical' || event.severity === 'high'), 'Sem eventos críticos ou altos.'),
                { heading: 'Alertas', head: ['Data/Hora', 'Gravidade', 'Alerta', 'Originado por', 'Estado', 'Descrição'], widths: { 0: 30, 1: 20, 2: 50, 3: 34, 4: 22 },
                    rows: alerts.map(alert => [formatAuditTimestamp(alert.occurredAt), SEVERITY_LABELS[alert.severity as keyof typeof SEVERITY_LABELS] || alert.severity, alert.title, alert.originUserName || '—', alert.status, (alert.description || '').slice(0, 200)]),
                    emptyText: 'Sem alertas no período.' },
                eventsSection('Logins falhados', events.filter(event => event.action === 'login_failed'), 'Sem logins falhados.'),
                eventsSection('Atividade fora de horas (antes das 08:00, depois das 18:00 ou ao fim de semana)', offHours, 'Sem atividade fora de horas.'),
            ];
            break;
        }
        case 'auditor-externo': {
            const integrity = input.integrity;
            summary = [...summary,
                ['Integridade da cadeia', integrity ? (integrity.ok ? 'Íntegra' : integrity.message) : 'Não verificada'],
                ['Registos verificados', integrity ? String(integrity.checked) : '—'],
                ['Verificada em', integrity ? formatAuditTimestamp(integrity.verifiedAt) : '—'],
                ['Selos HMAC', integrity?.hmac?.detail || 'Indisponível nesta versão'],
            ];
            sections = [
                { heading: 'Eventos por gravidade', head: ['Gravidade', 'Eventos'], rows: severityRows, numeric: [1] },
                { heading: 'Eventos por módulo', head: ['Módulo', 'Total', 'Críticos', 'Altos', 'Médios', 'Baixos', 'Informativos'], numeric: [1, 2, 3, 4, 5, 6],
                    rows: byModuleAndSeverity(events).map(row => [row.label, row.total, row.critical, row.high, row.medium, row.low, row.info]) },
                eventsSection('Registo completo do período', events),
            ];
            break;
        }
        case 'por-utilizador': {
            const users = new Map<string, AuditEvent[]>();
            for (const event of events) users.set(event.userName, [...(users.get(event.userName) || []), event]);
            sections = [
                { heading: 'Totais por utilizador', head: ['Utilizador', 'Eventos', 'Sessões', 'Logins', 'Falhados', 'Críticos/altos', 'IP usados', 'Dispositivos'], numeric: [1, 2, 3, 4, 5],
                    widths: { 0: 46, 1: 18, 2: 18, 3: 18, 4: 18, 5: 24 },
                    rows: [...users.entries()].sort((a, b) => b[1].length - a[1].length).map(([name, list]) => [name, list.length, new Set(list.map(event => event.sessionId)).size,
                        list.filter(event => event.action === 'login').length, list.filter(event => event.action === 'login_failed').length,
                        list.filter(event => event.severity === 'critical' || event.severity === 'high').length,
                        [...new Set(list.map(event => event.ip).filter(Boolean))].join(', ') || '—', [...new Set(list.map(event => event.device).filter(Boolean))].join(', ') || '—']) },
                eventsSection('Eventos por utilizador e sessão', [...events].sort((a, b) => a.userName.localeCompare(b.userName) || a.sessionId.localeCompare(b.sessionId) || a.timestamp.localeCompare(b.timestamp))),
            ];
            break;
        }
        case 'config-permissoes': {
            const changes = events.filter(event => event.action === 'settings_change' || event.action === 'permission_change');
            summary = [['Alterações', String(changes.length)], ['De configurações', String(changes.filter(event => event.action === 'settings_change').length)],
                ['De permissões', String(changes.filter(event => event.action === 'permission_change').length)]];
            sections = [{
                heading: 'Alterações (valor anterior e valor novo)', head: ['Data/Hora', 'Utilizador', 'Tipo', 'Campo', 'Antes', 'Depois', 'Justificação'],
                widths: { 0: 30, 1: 30, 2: 30, 3: 34 },
                rows: changes.flatMap(event => (event.changes.length ? event.changes : [{ label: event.summary.slice(0, 80), before: '—', after: '—' }]).map(change => [
                    formatAuditTimestamp(event.timestamp), event.userName, ACTION_LABELS[event.action], change.label, change.before, change.after, event.justification || '—'])),
                emptyText: 'Sem alterações no período.',
            }];
            orientation = 'landscape';
            break;
        }
    }
    const hash = contentHash({ key, subtitle, summary, sections: sections.map(section => section.rows) });
    return {
        key: `auditoria-${key}`, title: info.title, subtitle, orientation, fileBase: `auditoria-${key}`,
        summary: [...summary, ['Hash SHA-256 do conteúdo', hash]],
        sections, footerNote: `Hash SHA-256 do relatório: ${hash}`, tagline: 'AUDITORIA E SEGURANÇA',
    };
}
