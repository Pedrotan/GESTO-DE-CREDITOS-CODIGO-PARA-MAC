import { useEffect } from 'react';
import { useAuth } from '@/contextos/ContextoAutenticacao';
import { useData } from '@/contextos/ContextoDados';
import { db } from '@/bibliotecas/bd';
import { luandaTodayKey } from '@/bibliotecas/fuso-angola';
import { podeCompliance, type ActorCompliance } from '@/servicos/compliance/ServicoCompliance';
import { ServicoMonitorizacao } from '@/servicos/compliance/ServicoMonitorizacao';

/**
 * Monitorização automática de operações: corre ao entrar e de 30 em 30 minutos para quem pode registar no Compliance
 * (os alertas têm id fixo, por isso correr em vários computadores não duplica nada) e deixa no sino um aviso quando
 * aparecem alertas novos de gravidade média ou alta.
 */
export function TarefaMonitorizacaoCompliance() {
    const { user } = useAuth();
    const { isDataLoading, addNotification } = useData();

    useEffect(() => {
        if (!user || isDataLoading) return;
        const actor: ActorCompliance = { id: user.id, name: user.name, role: user.role, permissions: user.permissions, isOwner: user.isOwner };
        if (!podeCompliance(actor, 'compliance_manage')) return;
        let parado = false;
        const correr = async () => {
            if (parado) return;
            try {
                const { novos } = await ServicoMonitorizacao.analisar(actor);
                const relevantes = novos.filter(a => a.gravidade !== 'baixa');
                if (!relevantes.length || parado) return;
                const id = `compliance-alertas:${user.id}:${luandaTodayKey()}:${relevantes.map(a => a.id).sort().join('|').length}:${relevantes.length}`;
                if (await db.get('SELECT id FROM notifications WHERE id = ?', [id]).catch(() => undefined)) return;
                const altas = relevantes.filter(a => a.gravidade === 'alta').length;
                await addNotification({
                    id, userId: user.id, title: `Compliance: ${relevantes.length} alerta(s) novo(s)${altas ? ` (${altas} de gravidade alta)` : ''}`,
                    message: relevantes.slice(0, 3).map(a => a.titulo).join(' · ') + (relevantes.length > 3 ? ' · …' : '') + ' — ver em Compliance › Alertas de operações.',
                    type: 'warning', source: 'system', read: false, timestamp: new Date(),
                } as Parameters<typeof addNotification>[0]);
            } catch (error) {
                console.warn('[Compliance] Monitorização automática:', error instanceof Error ? error.message : error);
            }
        };
        const inicio = setTimeout(() => void correr(), 15_000); // depois do arranque, para não atrasar a entrada
        const intervalo = setInterval(() => void correr(), 30 * 60 * 1000);
        return () => { parado = true; clearTimeout(inicio); clearInterval(intervalo); };
    }, [user, isDataLoading, addNotification]);
    return null;
}
