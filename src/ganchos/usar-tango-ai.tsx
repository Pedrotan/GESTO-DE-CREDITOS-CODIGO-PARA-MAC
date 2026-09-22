import { useMemo, useState, useCallback } from 'react';
import { useData } from '@/contextos/ContextoDados';
import { useAuth } from '@/contextos/ContextoAutenticacao';
import { subDays, isBefore, startOfMonth, endOfMonth, subMonths, isAfter } from 'date-fns';
import { TrendingUp, Zap, Brain, AlertTriangle } from 'lucide-react';
import { getScopedLocalStorageItem } from '@/bibliotecas/contas';

export interface AIInsight {
    id: string;
    title: string;
    message: string;
    details?: string[];
    solution?: string;
    actionLabel: string;
    actionPath: string;
    color: 'emerald' | 'amber' | 'red' | 'indigo';
    icon: React.ReactNode;
}

export function useTangoAI() {
    const { clients, credits, payments } = useData();
    const { user } = useAuth();

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
            const updated = [...prev, id];
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

    const insights = useMemo(() => {
        const today = new Date();
        const lastMonthStart = startOfMonth(subMonths(today, 1));
        const lastMonthEnd = endOfMonth(subMonths(today, 1));
        const list: AIInsight[] = [];

        // Filter helper to avoid pushing dismissed ones
        const pushIfActive = (insight: AIInsight) => {
            if (!dismissedIds.includes(insight.id)) {
                list.push(insight);
            }
        };

        const overdueCredits = credits.filter(c => c.status === 'overdue' || c.status === 'defaulted');
        const totalActive = credits.filter(c => c.status === 'active' || c.status === 'overdue' || c.status === 'defaulted').length;
        const currentDefaultRate = totalActive > 0 ? (overdueCredits.length / totalActive) * 100 : 0;

        const lastMonthOverdue = credits.filter(c => {
            if (c.status === 'paid' && c.paidAt && isAfter(new Date(c.paidAt), lastMonthStart) && isBefore(new Date(c.paidAt), lastMonthEnd)) return false;
            return (c.status === 'overdue' || c.status === 'defaulted') && c.startDate && isBefore(new Date(c.startDate), lastMonthStart);
        }).length;

        const lastMonthRate = totalActive > 0 ? (lastMonthOverdue / totalActive) * 100 : 0;
        const rateDiff = lastMonthRate - currentDefaultRate;

        const isMaster = getScopedLocalStorageItem('is_master') === 'true';
        const isSuperAdmin = user?.role === 'super_admin';

        // 0. ESTADO DO SISTEMA (Sempre visível para Super Admin ou Master)
        if ((isMaster || isSuperAdmin || user?.role === 'admin' || user?.role === 'manager') && totalActive < 5) {
            pushIfActive({
                id: 'system_health',
                title: 'Estado do Sistema',
                icon: <Zap className="h-5 w-5 text-indigo-400" />,
                message: isMaster
                    ? 'Servidor Tango Ativo: O sistema está pronto para sincronizar dados com os terminais clientes.'
                    : 'Sistema Tango Ativo: Painel operacional. A IA precisa de mais dados para gerar insights.',
                solution: isMaster
                    ? 'Certifique-se de que os clientes estão na mesma rede para garantir a atualização em tempo real.'
                    : 'Comece a adicionar clientes e créditos para ver insights personalizados.',
                actionLabel: isMaster ? 'Configurar sincronização' : 'Adicionar cliente',
                actionPath: isMaster ? '/definicoes' : '/clientes',
                color: 'indigo'
            });
        }

        // 1. OTIMIZAÇÃO DE RECEITA (Tendência de Inadimplência)
        if (totalActive >= 5) {
            pushIfActive({
                id: 'revenue_opt',
                title: 'Otimização de Receita',
                icon: <TrendingUp className="h-5 w-5 text-emerald-400" />,
                message: rateDiff > 0 
                    ? `A taxa de inadimplência caiu ${rateDiff.toFixed(1)}% em relação ao mês anterior.`
                    : `A taxa de inadimplência está controlada em ${currentDefaultRate.toFixed(1)}%.`,
                solution: 'Considere aumentar o limite de crédito para clientes com Score A para maximizar o retorno.',
                actionLabel: 'Ver scoring',
                actionPath: '/scoring',
                color: 'emerald'
            });
        }

        // 2. AJUSTE DE JUROS (Análise de Faixa de Valor)
        const highValueCredits = credits.filter(c => c.principalAmount > 500000);
        const highValueOverdue = highValueCredits.filter(c => c.status === 'overdue' || c.status === 'defaulted');
        const highValueRate = highValueCredits.length > 0 ? (highValueOverdue.length / highValueCredits.length) * 100 : 0;

        if (highValueCredits.length >= 3 && highValueRate > 0) {
            pushIfActive({
                id: 'interest_adj',
                title: 'Ajuste de Juros',
                icon: <Zap className="h-5 w-5 text-amber-400" />,
                message: `Empréstimos acima de 500.000 AOA apresentam ${highValueRate.toFixed(0)}% de taxa de atraso.`,
                details: highValueOverdue.map(c => c.clientName).slice(0, 3),
                solution: 'Recomenda-se aumentar a taxa base em +0.5% p.m. para esta faixa ou exigir garantias adicionais.',
                actionLabel: 'Rever créditos',
                actionPath: '/creditos',
                color: 'amber'
            });
        }

        // 3. ANÁLISE PREDITIVA (Pagadores Ouro)
        const starClients = clients.filter(c => {
            const cCredits = credits.filter(cr => cr.clientId === c.id);
            return cCredits.length >= 2 && cCredits.every(cr => cr.status === 'paid' || (cr.status === 'active' && cr.daysOverdue === 0));
        });

        if (starClients.length > 0) {
            pushIfActive({
                id: 'predictive_score',
                title: 'Scoring Preditivo',
                icon: <Brain className="h-5 w-5 text-indigo-400" />,
                message: `Identificamos ${starClients.length} clientes com perfil "Pagador Ouro" e baixíssima probabilidade de default.`,
                details: starClients.map(c => c.name).slice(0, 5),
                solution: 'Ofereça condições premium de renovação para fidelizar estes clientes de baixo risco.',
                actionLabel: 'Ver clientes',
                actionPath: '/clientes',
                color: 'indigo'
            });
        }

        // 4. PREVENÇÃO DE RISCO (Inatividade)
        const thirtyDaysAgo = subDays(today, 30);
        const inactiveHighRisk = clients.filter(c => {
            const clientCredits = credits.filter(cr => cr.clientId === c.id && cr.status === 'active');
            if (clientCredits.length === 0) return false;
            const clientPayments = payments.filter(p => clientCredits.some(cc => cc.id === p.creditId));
            if (clientPayments.length === 0) return true;
            const latestPayment = Math.max(...clientPayments.map(p => new Date(p.paymentDate).getTime()));
            return isBefore(new Date(latestPayment), thirtyDaysAgo);
        });

        if (inactiveHighRisk.length > 0) {
            pushIfActive({
                id: 'risk_prevent',
                title: 'Sinais de Alerta',
                icon: <AlertTriangle className="h-5 w-5 text-red-500" />,
                message: `Detectada inatividade de +30 dias em ${inactiveHighRisk.length} clientes com créditos ativos.`,
                details: inactiveHighRisk.map(c => c.name).slice(0, 5),
                solution: 'Inicie o protocolo de cobrança preventiva e verifique a situação atual do cliente.',
                actionLabel: 'Iniciar cobrança',
                actionPath: '/hub-whatsapp',
                color: 'red'
            });
        }

        return list;
    }, [credits, clients, payments, user, dismissedIds]);

    return { insights, dismissInsight, resetDismissed, hasDismissed };
}
