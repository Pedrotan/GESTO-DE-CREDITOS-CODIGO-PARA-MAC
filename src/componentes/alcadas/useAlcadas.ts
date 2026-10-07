import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/contextos/ContextoAutenticacao';
import * as A from '@/bibliotecas/alcadas';
import { luandaDateKey } from '@/bibliotecas/fuso-angola';
import { ROLES } from '@/tipos/autenticacao';
import type { SimulatorProduct } from '@/bibliotecas/config-simulador';
import { ServicoAlcadas, canManageLimits, type Escalation, type EscalationApproval, type PolicyVersion, type UserRow } from '@/servicos/ServicoAlcadas';
import { ServicoControloAcesso } from '@/servicos/ServicoControloAcesso';
import { ServicoConfigSimulador } from '@/servicos/ServicoConfigSimulador';

export type LimitsData = {
    policy: A.LimitPolicy;
    version: PolicyVersion | null;
    versions: PolicyVersion[];
    exceptions: A.LimitException[];
    users: UserRow[];
    ledger: Awaited<ReturnType<typeof ServicoAlcadas.ledger>>;
    escalations: Escalation[];
    approvals: EscalationApproval[];
};

export type ProfileInfo = { id: string; name: string; predefined: boolean };

/**
 * Estado da página de Limites: política em vigor, rascunho em edição (só sai do ecrã quando é guardado),
 * validação de coerência e diferenças em tempo real, consumo de cada utilizador e actualização automática.
 */
export function useAlcadas() {
    const { user } = useAuth();
    const [data, setData] = useState<LimitsData | null>(null);
    const [draft, setDraftState] = useState<A.LimitPolicy | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [refreshedAt, setRefreshedAt] = useState(new Date());
    const [products, setProducts] = useState<SimulatorProduct[]>([]);
    const [now, setNow] = useState(new Date());
    const baseRef = useRef<string>('');
    const draftRef = useRef<A.LimitPolicy | null>(null);

    const profiles = useMemo<ProfileInfo[]>(() => {
        const list = ServicoControloAcesso.obterPerfis().map(profile => ({ id: profile.id, name: profile.nome, predefined: Boolean(profile.predefinido) }));
        const known = new Set(list.map(item => item.id));
        // Perfis presentes na política ou atribuídos a utilizadores mas ausentes da lista (ex.: removidos).
        for (const id of [...Object.keys(data?.policy.profiles || {}), ...(data?.users || []).map(item => item.role)]) {
            if (!known.has(id)) { list.push({ id, name: ROLES[id]?.label || id, predefined: false }); known.add(id); }
        }
        return list;
    }, [data]);
    const profileName = useCallback((id: string) => profiles.find(item => item.id === id)?.name || ROLES[id]?.label || id, [profiles]);

    const setDraft = useCallback((update: (previous: A.LimitPolicy) => A.LimitPolicy) => {
        setDraftState(previous => {
            if (!previous) return previous;
            const next = update(A.clonePolicy(previous));
            draftRef.current = next;
            return next;
        });
    }, []);

    const reload = useCallback(async (options: { resetDraft?: boolean; silent?: boolean } = {}) => {
        if (!options.silent) setLoading(true);
        try {
            await ServicoAlcadas.processTimers().catch(() => 0);
            const overview = await ServicoAlcadas.overview();
            setData(overview);
            const editing = draftRef.current && JSON.stringify(draftRef.current) !== baseRef.current;
            if (options.resetDraft || !editing) {
                baseRef.current = JSON.stringify(overview.policy);
                draftRef.current = A.clonePolicy(overview.policy);
                setDraftState(draftRef.current);
            } else if (JSON.stringify(overview.policy) !== baseRef.current) {
                // Outra pessoa alterou a política enquanto este utilizador editava: a base passa a ser a nova.
                baseRef.current = JSON.stringify(overview.policy);
            }
            setRefreshedAt(new Date());
            setError('');
        } catch (cause: any) {
            setError(cause?.message || 'Não foi possível carregar os limites.');
        } finally { if (!options.silent) setLoading(false); }
    }, []);

    useEffect(() => { void reload({ resetDraft: true }); }, [reload]);
    useEffect(() => { void ServicoConfigSimulador.load().then(config => setProducts(config.products)).catch(() => setProducts([])); }, []);
    // Consumo em tempo real: actualiza a cada 30 segundos e o relógio a cada segundo (contagem até ao reinício).
    useEffect(() => {
        const timer = window.setInterval(() => void reload({ silent: true }), 30_000);
        const clock = window.setInterval(() => setNow(new Date()), 1_000);
        return () => { window.clearInterval(timer); window.clearInterval(clock); };
    }, [reload]);

    const policy = data?.policy || null;
    const issues = useMemo(() => draft ? A.validatePolicy(draft, profileName) : [], [draft, profileName]);
    const issueByPath = useMemo(() => {
        const map = new Map<string, string>();
        for (const issue of issues) if (!map.has(issue.path)) map.set(issue.path, issue.message);
        return map;
    }, [issues]);
    const changes = useMemo(() => policy && draft ? A.diffPolicies(policy, draft, profileName) : [], [policy, draft, profileName]);
    const second = useMemo(() => policy ? A.needsSecondApproval(changes, policy.governance) : { required: false, reasons: [] }, [changes, policy]);
    const dirty = changes.length > 0;
    const discard = useCallback(() => {
        if (!policy) return;
        baseRef.current = JSON.stringify(policy);
        draftRef.current = A.clonePolicy(policy);
        setDraftState(draftRef.current);
    }, [policy]);

    const actors = useMemo<A.LimitActor[]>(() => (data?.users || []).map(item => ({ id: item.id, name: item.name, role: item.role, branchId: item.branchId || null })), [data]);
    const usage = useMemo(() => policy && data ? A.usageRows(policy, actors, data.ledger, data.exceptions, now) : [], [policy, data, actors, now]);
    const today = luandaDateKey(now);
    const branchName = useCallback((id?: string | null) => (data?.users || []).find(item => item.branchId && item.branchId === id)?.branchName || id || 'Sem agência', [data]);

    const summary = useMemo(() => {
        if (!policy || !data) return null;
        const enabledProfiles = Object.values(policy.profiles).filter(profile => profile.enabled !== false && Object.values(profile.ops).some(op => op?.allowed));
        const over80 = new Set(usage.filter(row => (row.day.pct ?? 0) >= 80 || (row.count.pct ?? 0) >= 80).map(row => row.userId));
        const escalatedToday = data.escalations.filter(item => luandaDateKey(item.createdAt) === today);
        const activeExceptions = A.activeExceptions(data.exceptions, now);
        const disabled = Object.values(policy.profiles).filter(profile => profile.enabled === false);
        return { enabledProfiles: enabledProfiles.length, over80: over80.size, over80Ids: over80, escalatedToday: escalatedToday.length, activeExceptions: activeExceptions.length, disabled };
    }, [policy, data, usage, today, now]);

    const actor = user ? { id: user.id, name: user.name, role: user.role, branchId: (user as any).branchId || null, permissions: user.permissions } : null;
    return {
        user, actor, canEdit: canManageLimits(actor), isAdmin: ['admin', 'super_admin'].includes(String(user?.role)),
        data, policy, draft, setDraft, discard, loading, error, reload, refreshedAt, now, products,
        profiles, profileName, issues, issueByPath, changes, second, dirty, usage, summary, branchName,
    };
}

export type AlcadasState = ReturnType<typeof useAlcadas>;
