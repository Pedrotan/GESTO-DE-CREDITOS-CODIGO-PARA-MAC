import { useEffect, useMemo, useState, useCallback } from 'react';
import { useData } from '@/contextos/ContextoDados';
import { useAuth } from '@/contextos/ContextoAutenticacao';
import { AlertTriangle, Brain, CalendarClock, PieChart, TrendingUp, Zap } from 'lucide-react';
import { db } from '@/bibliotecas/bd';
import { luandaTodayKey } from '@/bibliotecas/fuso-angola';
import { analyseTangoAI, type AIInsightData, type AIInsightKind } from '@/bibliotecas/tango-ai';

export interface AIInsight extends AIInsightData {
    icon: React.ReactNode;
}

const ICONS: Record<AIInsightKind, React.ReactNode> = {
    cobranca: <AlertTriangle className="h-5 w-5 text-red-500" />,
    vencimentos: <CalendarClock className="h-5 w-5 text-amber-400" />,
    risco: <AlertTriangle className="h-5 w-5 text-amber-400" />,
    concentracao: <PieChart className="h-5 w-5 text-amber-400" />,
    lucro: <TrendingUp className="h-5 w-5 text-emerald-400" />,
    pagadores: <Brain className="h-5 w-5 text-indigo-400" />,
    inicio: <Zap className="h-5 w-5 text-indigo-400" />,
};

type InstallmentRow = Parameters<typeof analyseTangoAI>[0]['installments'][number];

/**
 * Tango AI: sugestões calculadas a partir das prestações, dos pagamentos e dos créditos reais (ver tango-ai.ts).
 * Só aparece o que os dados justificam; um alerta dispensado volta se a situação mudar (outro cliente ou valor).
 */
export function useTangoAI() {
    const { clients, credits, payments } = useData();
    const { user } = useAuth();
    const [installments, setInstallments] = useState<InstallmentRow[]>([]);

    // O plano de prestações vem da base (recarrega quando os créditos ou os pagamentos mudam).
    useEffect(() => {
        let alive = true;
        db.all<InstallmentRow>(`SELECT creditId, dueDate, principalMinor, interestMinor, paidPrincipalMinor, paidInterestMinor, status, paidAt
            FROM credit_installments WHERE status <> 'cancelled'`)
            .then(rows => { if (alive) setInstallments(rows || []); })
            .catch(() => { if (alive) setInstallments([]); });
        return () => { alive = false; };
    }, [credits, payments]);

    const storageKey = `dismissed_insights_${user?.id || 'guest'}`;

    const [dismissedIds, setDismissedIds] = useState<string[]>(() => {
        try {
            const stored = localStorage.getItem(storageKey);
            return stored ? JSON.parse(stored) : [];
        } catch {
            return [];
        }
    });

    const dismissInsight = useCallback((id: string) => {
        setDismissedIds(prev => {
            if (prev.includes(id)) return prev;
            const updated = [...prev, id].slice(-200);
            try {
                localStorage.setItem(storageKey, JSON.stringify(updated));
            } catch (e) {
                console.error("Failed to save dismissed insights", e);
            }
            return updated;
        });
    }, [storageKey]);

    const resetDismissed = useCallback(() => {
        setDismissedIds([]);
        try {
            localStorage.setItem(storageKey, JSON.stringify([]));
        } catch (e) {
            console.error("Failed to reset dismissed insights", e);
        }
    }, [storageKey]);

    const hasDismissed = dismissedIds.length > 0;

    const insights = useMemo<AIInsight[]>(() => {
        const canManage = ['super_admin', 'admin', 'manager'].includes(String(user?.role));
        return analyseTangoAI({
            clients: clients as any, credits: credits as any, payments: payments as any, installments, todayKey: luandaTodayKey(), canManage,
        }).filter(insight => !dismissedIds.includes(insight.id)).map(insight => ({ ...insight, icon: ICONS[insight.kind] }));
    }, [clients, credits, payments, installments, user, dismissedIds]);

    return { insights, dismissInsight, resetDismissed, hasDismissed };
}
