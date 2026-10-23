import { useEffect } from 'react';
import { useAuth } from '@/contextos/ContextoAutenticacao';
import { useData } from '@/contextos/ContextoDados';
import { db } from '@/bibliotecas/bd';
import { luandaTodayKey } from '@/bibliotecas/fuso-angola';
import { useActorRH, useModuloRH } from '@/ganchos/usar-modulo-rh';
import { ServicoAlertasRH } from '@/servicos/rh/ServicoAlertasRH';
import { ServicoControloAcesso } from '@/servicos/ServicoControloAcesso';

let aCorrer = false;
export const EVENTO_ALERTAS_RH = 'tango:rh-alertas';

/**
 * Tarefa diária do RH: gera os alertas (férias a 5 dias, aniversários, contratos, documentos, Natal, prazos de
 * INSS e IRT, BI dos clientes) ao entrar e de 30 em 30 minutos, e deixa no sino um resumo diário por utilizador.
 */
export function TarefaDiariaRH() {
    const { user } = useAuth();
    const { isDataLoading, addNotification } = useData();
    const { activo } = useModuloRH();
    const { actor, gerir } = useActorRH();

    useEffect(() => {
        if (!user || !actor || isDataLoading) return;
        let parado = false;
        const notificar = async (id: string, title: string, message: string, type: 'info' | 'warning') => {
            if (await db.get('SELECT id FROM notifications WHERE id = ?', [id]).catch(() => undefined)) return;
            await addNotification({ id, userId: user.id, title, message, type, source: 'system', read: false, timestamp: new Date() } as Parameters<typeof addNotification>[0]);
        };
        const correr = async () => {
            if (aCorrer || parado) return;
            aCorrer = true;
            try {
                const gerirClientes = ServicoControloAcesso.temPermissao(user, 'manage_clients');
                const verRH = activo && (ServicoControloAcesso.temPermissao(user, 'hr_view') || gerir);
                if (!activo && !gerirClientes) return;
                await ServicoAlertasRH.executar(actor, { gerirRH: activo && gerir, gerirClientes });
                window.dispatchEvent(new Event(EVENTO_ALERTAS_RH));
                const abertos = await ServicoAlertasRH.abertos();
                const hoje = luandaTodayKey();
                if (activo) for (const a of abertos.filter(x => x.tipo === 'aniversario'))
                    await notificar(`rh-aniversario:${user.id}:${a.id}`, 'Aniversário', a.mensagem, 'info');
                const rh = abertos.filter(a => a.estado === 'novo' && ['rh', 'financeiro'].includes(a.destinatario_perfil) && a.tipo !== 'aniversario');
                if (verRH && rh.length)
                    await notificar(`rh-alertas:${user.id}:${hoje}`, `Recursos Humanos: ${rh.length} alerta(s)`, rh.slice(0, 3).map(a => a.mensagem).join(' · ') + (rh.length > 3 ? ' · …' : ''), 'warning');
                const bi = abertos.filter(a => a.tipo === 'bi_cliente');
                if (gerirClientes && bi.length)
                    await notificar(`bi-clientes:${user.id}:${hoje}`, 'Validade do BI dos clientes', `${bi.length} cliente(s) com o BI expirado ou a expirar. Veja a lista em Clientes (filtro «Expirado ou a expirar»).`, 'warning');
            } catch (error) {
                console.warn('[RH] Tarefa diária de alertas:', error instanceof Error ? error.message : error);
            } finally {
                aCorrer = false;
            }
        };
        void correr();
        const intervalo = setInterval(() => void correr(), 30 * 60 * 1000);
        return () => { parado = true; clearInterval(intervalo); };
    }, [user, actor, gerir, activo, isDataLoading, addNotification]);
    return null;
}
