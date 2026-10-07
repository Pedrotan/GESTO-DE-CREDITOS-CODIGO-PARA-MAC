import { useEffect } from 'react';
import { useAuth } from '@/contextos/ContextoAutenticacao';
import { useData } from '@/contextos/ContextoDados';
import { ServicoAlcadas } from '@/servicos/ServicoAlcadas';

// Tarefas periódicas das alçadas, em segundo plano: pedidos sem decisão há mais de X horas sobem ao nível
// seguinte (com lembrete aos aprovadores) e as exceções temporárias que terminaram são notificadas.
let running = false;
export function ProcessamentoAlcadas() {
    const { user } = useAuth();
    const { isDataLoading, refreshData } = useData();
    useEffect(() => {
        if (isDataLoading || !user) return;
        let cancelled = false;
        const run = async () => {
            if (running || cancelled) return;
            running = true;
            try {
                const changes = await ServicoAlcadas.processTimers();
                if (changes && !cancelled) await refreshData().catch(() => undefined);
            } catch { /* tenta de novo no próximo ciclo */ } finally { running = false; }
        };
        void run();
        const timer = window.setInterval(() => void run(), 5 * 60_000);
        return () => { cancelled = true; window.clearInterval(timer); };
    }, [isDataLoading, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps
    return null;
}
