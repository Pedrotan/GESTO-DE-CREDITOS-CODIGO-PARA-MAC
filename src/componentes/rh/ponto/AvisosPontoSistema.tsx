// Avisos do livro de ponto como notificação do sistema (Windows, macOS, Android ou navegador), além do sino 🔔:
// «ainda não marcou a entrada», «falta marcar a saída», justificações por decidir e decididas. Cada aviso aparece uma
// só vez por computador. A empresa pode desligar em Configuração do ponto (ponto_notificacoes_ambiente).
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contextos/ContextoAutenticacao';
import { db } from '@/bibliotecas/bd';
import { luandaTodayKey } from '@/bibliotecas/fuso-angola';
import { configDosParametros } from '@/bibliotecas/rh/ponto-calculo';
import { ServicoRH } from '@/servicos/rh/ServicoRH';
import { useModuloRH } from '@/ganchos/usar-modulo-rh';

const CHAVE = 'tango_ponto_avisos_mostrados';
const PREFIXOS = ['ponto_', 'justificacao:', 'justificacao-decisao:'];

const mostrados = (): Set<string> => {
    try { return new Set(JSON.parse(localStorage.getItem(CHAVE) || '[]')); } catch { return new Set(); }
};
const guardar = (ids: Set<string>) => {
    try { localStorage.setItem(CHAVE, JSON.stringify([...ids].slice(-300))); } catch { /* sem armazenamento */ }
};

/** Mostra uma notificação do sistema (se o utilizador deu permissão). */
export const notificarSistema = (titulo: string, texto: string, etiqueta: string, abrir?: () => void) => {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return false;
    try {
        const nota = new Notification(titulo, { body: texto, tag: etiqueta });
        nota.onclick = () => { window.focus(); abrir?.(); nota.close(); };
        return true;
    } catch {
        return false;
    }
};

export function AvisosPontoSistema() {
    const { user } = useAuth();
    const { activo } = useModuloRH();
    const navigate = useNavigate();

    useEffect(() => {
        if (!user || !activo) return;
        let parado = false;
        const verificar = async () => {
            if (parado || typeof Notification === 'undefined') return;
            const parametros = await ServicoRH.parametros().catch(() => []);
            if (!configDosParametros(parametros, luandaTodayKey()).notificacoes_ambiente) return;
            if (Notification.permission === 'default') await Notification.requestPermission().catch(() => undefined);
            if (Notification.permission !== 'granted') return;
            const desde = new Date(Date.now() - 2 * 86_400_000).toISOString();
            const linhas = await db.all<{ id: string; title: string; message: string }>(
                'SELECT id, title, message FROM notifications WHERE userId = ? AND read = 0 AND timestamp >= ? ORDER BY timestamp DESC LIMIT 20', [user.id, desde]).catch(() => []);
            const vistos = mostrados();
            let mudou = false;
            for (const n of linhas.filter(x => PREFIXOS.some(p => x.id.startsWith(p)) && !vistos.has(x.id))) {
                vistos.add(n.id);
                mudou = true;
                const destino = n.id.startsWith('justificacao:') ? '/rh/ponto' : '/rh/portal';
                notificarSistema(n.title, n.message, n.id, () => navigate(destino));
            }
            if (mudou) guardar(vistos);
        };
        const primeiro = setTimeout(() => void verificar(), 15_000);
        const intervalo = setInterval(() => void verificar(), 60_000);
        return () => { parado = true; clearTimeout(primeiro); clearInterval(intervalo); };
    }, [user, activo, navigate]);
    return null;
}
