import { useCallback, useEffect, useMemo, useState } from 'react';
import { useData } from '@/contextos/ContextoDados';
import type { Payment } from '@/tipos/credito';
import { buildPaymentRows, contractNumbers, type PaymentRow, type ScheduleItem } from '@/bibliotecas/pagamentos-analise';
import { ServicoPagamentos, type ImportBatch, type PaymentsConfig } from '@/servicos/ServicoPagamentos';

/**
 * Dados da página de Pagamentos: todos os pagamentos (confirmados, pendentes e anulados), o plano de
 * prestações, os lotes de importação e as regras. Recarrega sempre que o contexto muda (novo pagamento,
 * sincronização) e quando a página o pede depois de uma operação.
 */
export function usePagamentos() {
    const { payments: confirmedPayments, credits, deletedCredits, allClients, clients, users } = useData() as any;
    const [payments, setPayments] = useState<Payment[]>([]);
    const [schedule, setSchedule] = useState<ScheduleItem[]>([]);
    const [batches, setBatches] = useState<ImportBatch[]>([]);
    const [config, setConfig] = useState<PaymentsConfig>({ cancelApprovalThreshold: 500_000 });
    const [closedMonths, setClosedMonths] = useState<Set<string>>(new Set());
    const [loading, setLoading] = useState(true);
    const [version, setVersion] = useState(0);

    const reload = useCallback(() => setVersion(value => value + 1), []);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const [list, plan, lots, rules, closed] = await Promise.all([
                    ServicoPagamentos.listPayments(), ServicoPagamentos.loadSchedule(), ServicoPagamentos.listBatches(),
                    ServicoPagamentos.getConfig(), ServicoPagamentos.closedMonths(),
                ]);
                if (cancelled) return;
                setPayments(list); setSchedule(plan); setBatches(lots); setConfig(rules); setClosedMonths(closed);
            } catch (error) {
                console.error('[Pagamentos] Falha ao carregar os pagamentos:', error);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [confirmedPayments, credits, version]);

    const clientList = useMemo(() => (allClients?.length ? allClients : clients) || [], [allClients, clients]);
    const numbers = useMemo(() => contractNumbers([...(credits || []), ...(deletedCredits || [])]), [credits, deletedCredits]);
    const rows: PaymentRow[] = useMemo(() => buildPaymentRows({ payments, credits: [...(credits || []), ...(deletedCredits || [])], clients: clientList, users: users || [], numbers })
        .sort((a, b) => b.valueDateKey.localeCompare(a.valueDateKey) || b.registeredAt.localeCompare(a.registeredAt)), [payments, credits, deletedCredits, clientList, users, numbers]);
    const phones = useMemo(() => new Map<string, string>(clientList.map((client: any) => [client.id, client.phone || ''])), [clientList]);
    const managers = useMemo(() => {
        const names = new Map<string, string>((users || []).map((user: any) => [user.id, user.name]));
        return new Map<string, string>(clientList.map((client: any) => [client.id, names.get(client.usuario_id) || '']));
    }, [clientList, users]);

    return { rows, payments, schedule, batches, config, closedMonths, loading, reload, numbers, phones, managers, clients: clientList, credits: credits || [], users: users || [] };
}
