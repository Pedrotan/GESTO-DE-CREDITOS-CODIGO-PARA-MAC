import { test } from 'node:test';
import assert from 'node:assert/strict';
import { juntarAvisos, novasParaAvisar, quandoAviso } from '../src/bibliotecas/avisos-mensagens.ts';
import type { ChatMessage } from '../src/tipos/credito.ts';

const agora = Date.parse('2026-10-28T12:00:00.000Z');
const mensagem = (id: string, de: string, para: string, minutosAtras: number, extra: Partial<ChatMessage> = {}): ChatMessage => ({
    id, senderId: de, senderName: de === 'osvaldo' ? 'Osvaldo Furtado' : 'Stanislau Bastos', receiverId: para, receiverName: '',
    content: `mensagem ${id}`, timestamp: new Date(agora - minutosAtras * 60_000), read: false, ...extra,
});

test('aviso só para mensagens novas recebidas por mim, por ler, recentes e fora da conversa aberta — e uma só vez', () => {
    const vistos = new Set<string>();
    const lista = [
        mensagem('a', 'osvaldo', 'paulo', 1),
        mensagem('b', 'paulo', 'osvaldo', 1),                    // enviada por mim
        mensagem('c', 'osvaldo', 'paulo', 1, { read: true }),    // já lida
        mensagem('d', 'osvaldo', 'paulo', 45),                   // antiga (recebida de uma vez)
        mensagem('e', 'stanislau', 'paulo', 2),                  // da conversa que está aberta
    ];
    const novas = novasParaAvisar(lista, { meId: 'paulo', vistos, conversaAberta: 'stanislau', agora });
    assert.deepEqual(novas.map(m => m.id), ['a']);
    assert.equal(novasParaAvisar(lista, { meId: 'paulo', vistos, conversaAberta: null, agora }).length, 0, 'não volta a avisar');
});

test('avisos agrupados por pessoa (a mais recente em cima), no máximo 4, e hora como no telemóvel', () => {
    let avisos = juntarAvisos([], [mensagem('a', 'osvaldo', 'paulo', 0)], agora);
    avisos = juntarAvisos(avisos, [mensagem('b', 'stanislau', 'paulo', 0, { content: '', attachments: [{ id: 'f', name: 'bi.pdf', mime: 'application/pdf', size: 1, dataUrl: '' }] })], agora);
    avisos = juntarAvisos(avisos, [mensagem('c', 'osvaldo', 'paulo', 0, { content: 'Já viu o contrato?' })], agora);
    assert.deepEqual(avisos.map(a => [a.senderName, a.count, a.resumo]), [['Osvaldo Furtado', 2, 'Já viu o contrato?'], ['Stanislau Bastos', 1, 'bi.pdf']]);
    assert.equal(quandoAviso(agora - 20_000, agora), 'agora');
    assert.equal(quandoAviso(agora - 3 * 60_000, agora), 'há 3 min');
    assert.equal(quandoAviso(agora - 2 * 3_600_000, agora), 'há 2 h');
});
