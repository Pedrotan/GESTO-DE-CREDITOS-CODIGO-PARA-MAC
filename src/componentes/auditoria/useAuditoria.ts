import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/contextos/ContextoAutenticacao';
import { useData } from '@/contextos/ContextoDados';
import { contractNumbers } from '@/bibliotecas/pagamentos-analise';
import { assignSessions, detectAlerts, formatAuditTimestamp, toAuditEvent, type AuditEvent, type AuditRow } from '@/bibliotecas/auditoria-analise';
import { ServicoAuditoriaAvancada, type AuditConfig, type IntegrityResult, type StoredAlert, DEFAULT_AUDIT_CONFIG } from '@/servicos/ServicoAuditoriaAvancada';

export const isFullAuditor = (role?: string | null) => role === 'super_admin' || role === 'internal_auditor';

/**
 * Dados da página de Auditoria. Vista completa (Super Administrador e Auditor Interno): os últimos N meses
 * configurados, ou todo o arquivo quando pedido. Restantes utilizadores: só a própria actividade.
 */
export function useAuditoria(options: { archive: boolean }) {
    const { user, users } = useAuth() as any;
    const { credits, deletedCredits, accessSchedule } = useData() as any;
    const full = isFullAuditor(user?.role);
    const [rows, setRows] = useState<AuditRow[]>([]);
    const [alerts, setAlerts] = useState<StoredAlert[]>([]);
    const [config, setConfig] = useState<AuditConfig>(DEFAULT_AUDIT_CONFIG);
    const [integrity, setIntegrity] = useState<IntegrityResult | null>(null);
    const [lastClose, setLastClose] = useState<{ day: string; status: string; brokenSeq: number | null; verifiedAt: string } | null>(null);
    const [loading, setLoading] = useState(true);
    const [version, setVersion] = useState(0);
    const reload = useCallback(() => setVersion(value => value + 1), []);
    const actor = useMemo(() => ({ id: user?.id || 'system', name: user?.name || 'Sistema', role: user?.role || '' }), [user]);

    useEffect(() => {
        if (!user) return;
        void ServicoAuditoriaAvancada.logView(actor, full ? 'full' : 'own');
    }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (!user) return;
        let cancelled = false;
        setLoading(true);
        (async () => {
            const cfg = await ServicoAuditoriaAvancada.getConfig();
            let loaded: AuditRow[];
            if (!full) loaded = await ServicoAuditoriaAvancada.loadUserRows(user.id);
            else if (options.archive) loaded = await ServicoAuditoriaAvancada.loadRows(null, 100_000);
            else {
                const from = new Date();
                from.setMonth(from.getMonth() - cfg.visibleMonths);
                loaded = await ServicoAuditoriaAvancada.loadRows({ fromIso: from.toISOString(), toIso: new Date(Date.now() + 86_400_000).toISOString() });
            }
            if (cancelled) return;
            setConfig(cfg);
            setRows(loaded);
            if (full) {
                // Verificação automática diária da cadeia e alertas dos registos carregados.
                const daily = await ServicoAuditoriaAvancada.verifyDailyIfNeeded(actor).catch(() => null);
                if (daily && !cancelled) setIntegrity(daily);
                const close = await ServicoAuditoriaAvancada.lastIntegrity();
                if (!cancelled) setLastClose(close);
                const stored = await ServicoAuditoriaAvancada.listAlerts();
                if (!cancelled) setAlerts(stored);
            }
        })().catch(error => console.error('[Auditoria] Falha ao carregar:', error)).finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [user?.id, full, options.archive, version]); // eslint-disable-line react-hooks/exhaustive-deps

    const roles = useMemo(() => new Map<string, string>((users || []).map((item: any) => [item.id, item.role])), [users]);
    const numbers = useMemo(() => contractNumbers([...(credits || []), ...(deletedCredits || [])]), [credits, deletedCredits]);
    const events: AuditEvent[] = useMemo(() => assignSessions(rows.map(row => toAuditEvent(row, { roles, numbers, severityOverrides: config.severityOverrides }))), [rows, roles, numbers, config.severityOverrides]);

    // Alertas detectados nos registos carregados que ainda não estão no centro de alertas.
    useEffect(() => {
        if (!full || loading || !events.length) return;
        const allowedHours = accessSchedule?.enabled && Array.isArray(accessSchedule.days)
            ? accessSchedule.days.map((rule: any) => rule?.allowed ? { start: rule.start, end: rule.end } : null) : undefined;
        const detected = detectAlerts(events, { config: config.alerts, allowedHours });
        const known = new Set(alerts.map(alert => alert.alertKey));
        const fresh = detected.filter(alert => !known.has(alert.key));
        if (!fresh.length) return;
        ServicoAuditoriaAvancada.raiseAlerts(fresh).then(count => { if (count) ServicoAuditoriaAvancada.listAlerts().then(setAlerts); }).catch(() => undefined);
    }, [full, loading, events, alerts, config.alerts, accessSchedule]);

    const verifyNow = async () => {
        const result = await ServicoAuditoriaAvancada.verifyIntegrity(actor);
        setIntegrity(result);
        setLastClose(await ServicoAuditoriaAvancada.lastIntegrity());
        setAlerts(await ServicoAuditoriaAvancada.listAlerts());
        return result;
    };

    return { full, actor, events, alerts, setAlerts, config, setConfig, integrity, lastClose, loading, reload, verifyNow, users: users || [], numbers };
}

/** Texto do cartão "Estado da Integridade". */
export const integrityCard = (result: { ok: boolean; message: string; verifiedAt: string } | null, last: { status: string; brokenSeq: number | null; verifiedAt: string } | null) => {
    if (result) return { ok: result.ok, label: result.ok ? 'Íntegra' : result.message, detail: `Última verificação ${formatAuditTimestamp(result.verifiedAt).slice(11, 16)} de ${formatAuditTimestamp(result.verifiedAt).slice(0, 10)}` };
    if (last) return { ok: last.status === 'ok', label: last.status === 'ok' ? 'Íntegra' : `Quebra no registo n.º ${last.brokenSeq ?? '?'}`, detail: `Última verificação ${formatAuditTimestamp(last.verifiedAt).slice(11, 16)} de ${formatAuditTimestamp(last.verifiedAt).slice(0, 10)}` };
    return { ok: null, label: 'Por verificar', detail: 'Clique em «Verificar integridade»' };
};
