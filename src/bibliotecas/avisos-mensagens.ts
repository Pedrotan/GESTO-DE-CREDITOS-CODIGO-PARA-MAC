// Avisos de mensagens do chat, no estilo das notificações do telemóvel: aparecem em qualquer página quando chega
// uma mensagem. O estado vive aqui (e não no componente) para não se perder ao mudar de página.
import type { ChatMessage } from '../tipos/credito.ts';
import { resumoMensagem } from './chat-interno.ts';

export type AvisoMensagem = { id: string; senderId: string; senderName: string; resumo: string; at: number; count: number };

/** Só avisa de mensagens com menos de 10 minutos: as antigas (recebidas de uma vez) ficam no contador do ícone. */
export const JANELA_AVISO_MS = 10 * 60_000;

/**
 * Mensagens novas a avisar: recebidas por mim, por ler, ainda não avisadas, recentes e fora da conversa que estou a
 * ver. Marca-as em `vistos` (não voltam a aparecer).
 */
export const novasParaAvisar = (mensagens: ChatMessage[], opcoes: { meId: string; vistos: Set<string>; conversaAberta: string | null; agora?: number }) => {
    const agora = opcoes.agora ?? Date.now();
    const novas: ChatMessage[] = [];
    for (const mensagem of mensagens) {
        if (opcoes.vistos.has(mensagem.id)) continue;
        opcoes.vistos.add(mensagem.id);
        if (mensagem.receiverId !== opcoes.meId || mensagem.senderId === opcoes.meId || mensagem.read) continue;
        if (mensagem.senderId === opcoes.conversaAberta) continue;
        if (agora - new Date(mensagem.timestamp).getTime() > JANELA_AVISO_MS) continue;
        novas.push(mensagem);
    }
    return novas;
};

/** «agora», «há 3 min», «há 2 h» (como no telemóvel). */
export const quandoAviso = (instante: number, agora = Date.now()) => {
    const minutos = Math.floor((agora - instante) / 60_000);
    if (minutos < 1) return 'agora';
    if (minutos < 60) return `há ${minutos} min`;
    return `há ${Math.floor(minutos / 60)} h`;
};

/** Junta as mensagens à pilha: uma por remetente, com o número de mensagens e o resumo da última. */
export const juntarAvisos = (actuais: AvisoMensagem[], novas: ChatMessage[], agora = Date.now()): AvisoMensagem[] => {
    const lista = [...actuais];
    for (const mensagem of novas) {
        const existente = lista.findIndex(aviso => aviso.senderId === mensagem.senderId);
        const base = { senderId: mensagem.senderId, senderName: mensagem.senderName, resumo: resumoMensagem(mensagem), at: agora };
        if (existente >= 0) {
            const anterior = lista.splice(existente, 1)[0];
            lista.unshift({ ...anterior, ...base, count: anterior.count + 1 });
        } else {
            lista.unshift({ ...base, id: `aviso-${mensagem.senderId}`, count: 1 });
        }
    }
    return lista.slice(0, 4);
};

// ── Estado partilhado entre páginas ──────────────────────────────────────────────────────────────────────────────
let avisos: AvisoMensagem[] = [];
const vistos = new Set<string>();
let conversaAberta: string | null = null;
const ouvintes = new Set<() => void>();
const avisar = () => ouvintes.forEach(ouvinte => ouvinte());

export const lojaAvisos = {
    get: () => avisos,
    subscribe(ouvinte: () => void) {
        ouvintes.add(ouvinte);
        return () => { ouvintes.delete(ouvinte); };
    },
    /** Recebe a lista de mensagens actual e devolve as que acabaram de chegar (já na pilha de avisos). */
    receber(mensagens: ChatMessage[], meId: string) {
        const novas = novasParaAvisar(mensagens, { meId, vistos, conversaAberta });
        if (novas.length) { avisos = juntarAvisos(avisos, novas); avisar(); }
        return novas;
    },
    fechar(id: string) { avisos = avisos.filter(aviso => aviso.id !== id); avisar(); },
    limpar() { avisos = []; avisar(); },
    /** A página do chat diz com quem está a conversar: essas mensagens não precisam de aviso. */
    definirConversaAberta(userId: string | null) {
        conversaAberta = userId;
        if (userId && avisos.some(aviso => aviso.senderId === userId)) { avisos = avisos.filter(aviso => aviso.senderId !== userId); avisar(); }
    },
};
