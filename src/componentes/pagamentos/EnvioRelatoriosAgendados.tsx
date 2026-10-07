import { useEffect, useRef } from 'react';
import { useAuth } from '@/contextos/ContextoAutenticacao';
import { useData } from '@/contextos/ContextoDados';
import { luandaParts } from '@/bibliotecas/fuso-angola';
import { defaultPeriod } from '@/bibliotecas/periodos';
import { buildPaymentRows, contractNumbers } from '@/bibliotecas/pagamentos-analise';
import { REPORTS, type ReportKey } from '@/bibliotecas/relatorios-pagamentos';
import { ServicoPagamentos } from '@/servicos/ServicoPagamentos';
import { generatePaymentsReport } from './gerar-relatorio';
import { WEEKLY_AUDIT_REPORT, buildWeeklySecurityReport, previousWeek } from '@/componentes/auditoria/gerar-relatorio-auditoria';

const HOUR = 60 * 60 * 1000;

/**
 * Envio automático dos relatórios agendados (Resumo Mensal e Lista Mensal): a partir do dia 1 de cada mês,
 * gera o relatório do mês anterior e envia-o por email (SMTP da aplicação desktop). Cada agendamento é
 * enviado uma vez por mês; se falhar, volta a tentar na hora seguinte.
 */
export function EnvioRelatoriosAgendados() {
    const { user } = useAuth();
    const { credits, deletedCredits, allClients, clients, users, companySettings } = useData() as any;
    const running = useRef(false);
    const latest = useRef({ credits, deletedCredits, allClients, clients, users, companySettings, user });
    latest.current = { credits, deletedCredits, allClients, clients, users, companySettings, user };

    useEffect(() => {
        const api = (window as any).electronAPI;
        if (!user || typeof api?.sendEmail !== 'function') return;
        const run = async () => {
            const data = latest.current;
            const settings = data.companySettings || {};
            if (running.current || !data.user || !settings.smtpHost || !settings.smtpUser || !settings.smtpPassword) return;
            running.current = true;
            try {
                const all = (await ServicoPagamentos.listSchedules()).filter(item => item.enabled);
                const smtpSettings = { host: settings.smtpHost, port: settings.smtpPort, user: settings.smtpUser, pass: settings.smtpPassword, secure: settings.smtpSecure, fromName: settings.smtpFromName || settings.name };
                // Resumo semanal de segurança (auditoria): segunda-feira ou depois, para a semana anterior.
                for (const item of all.filter(entry => entry.reportType === WEEKLY_AUDIT_REPORT)) {
                    const week = previousWeek();
                    if (item.lastRunMonth === week.key) continue;
                    try {
                        const roles = new Map<string, string>((data.users || []).map((entry: any) => [entry.id, entry.role]));
                        const file = await buildWeeklySecurityReport(settings, { id: data.user.id, name: `${data.user.name} (envio automático)`, role: data.user.role }, roles);
                        const result = await api.sendEmail({ smtpSettings, emailOptions: {
                            to: item.recipients, subject: `Resumo semanal de segurança - ${week.label} - ${settings.name || ''}`,
                            html: `<p>Segue em anexo o <b>Resumo Semanal de Segurança</b> (${week.label}): eventos críticos, alertas, logins falhados e acessos fora de horas.</p>`,
                            attachments: [{ filename: file.fileName, content: file.dataUrl.split(',')[1], encoding: 'base64' }],
                        } });
                        await ServicoPagamentos.markScheduleRun(item.id, week.key, result?.success ? null : String(result?.error || 'Falha no envio').slice(0, 300));
                    } catch (error) {
                        await ServicoPagamentos.markScheduleRun(item.id, week.key, (error instanceof Error ? error.message : String(error)).slice(0, 300)).catch(() => undefined);
                    }
                }
                const schedules = all.filter(entry => entry.reportType !== WEEKLY_AUDIT_REPORT);
                if (!schedules.length) return;
                const now = luandaParts(new Date())!;
                const previous = new Date(Date.UTC(now.year, now.month - 1, 1));
                const monthKey = previous.toISOString().slice(0, 7);
                const due = schedules.filter(item => item.lastRunMonth !== monthKey);
                if (!due.length) return;
                const allCredits = [...(data.credits || []), ...(data.deletedCredits || [])];
                const clientList = (data.allClients?.length ? data.allClients : data.clients) || [];
                const numbers = contractNumbers(allCredits);
                const rows = buildPaymentRows({ payments: await ServicoPagamentos.listPayments(), credits: allCredits, clients: clientList, users: data.users || [], numbers });
                const schedule = await ServicoPagamentos.loadSchedule();
                const names = new Map<string, string>((data.users || []).map((item: any) => [item.id, item.name]));
                const selection = { ...defaultPeriod(new Date()), kind: 'month' as const, year: previous.getUTCFullYear(), month: previous.getUTCMonth() };
                for (const item of due) {
                    try {
                        const file = await generatePaymentsReport({
                            key: item.reportType as ReportKey, format: 'pdf', rows, schedule, selection, filters: [],
                            numbers, phones: new Map(clientList.map((client: any) => [client.id, client.phone || ''])),
                            managers: new Map(clientList.map((client: any) => [client.id, names.get(client.usuario_id) || ''])),
                            settings, actor: { id: data.user.id, name: `${data.user.name} (envio automático)`, role: data.user.role }, download: false,
                        });
                        const title = REPORTS.find(report => report.key === item.reportType)?.title || file.title;
                        const result = await api.sendEmail({
                            smtpSettings: { host: settings.smtpHost, port: settings.smtpPort, user: settings.smtpUser, pass: settings.smtpPassword, secure: settings.smtpSecure, fromName: settings.smtpFromName || settings.name },
                            emailOptions: {
                                to: item.recipients, subject: `${title} - ${monthKey.slice(5)}/${monthKey.slice(0, 4)} - ${settings.name || ''}`,
                                html: `<p>Segue em anexo o relatório <b>${title}</b> referente a ${monthKey.slice(5)}/${monthKey.slice(0, 4)}, gerado automaticamente pelo Tango Gestão de Créditos.</p>`,
                                attachments: [{ filename: file.fileName, content: file.dataUrl.split(',')[1], encoding: 'base64' }],
                            },
                        });
                        await ServicoPagamentos.markScheduleRun(item.id, monthKey, result?.success ? null : String(result?.error || 'Falha no envio').slice(0, 300));
                    } catch (error) {
                        await ServicoPagamentos.markScheduleRun(item.id, monthKey, (error instanceof Error ? error.message : String(error)).slice(0, 300)).catch(() => undefined);
                    }
                }
            } catch (error) {
                console.warn('[Relatórios] Envio automático adiado:', error);
            } finally {
                running.current = false;
            }
        };
        const first = setTimeout(run, 60_000);
        const timer = setInterval(run, HOUR);
        return () => { clearTimeout(first); clearInterval(timer); };
    }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

    return null;
}
