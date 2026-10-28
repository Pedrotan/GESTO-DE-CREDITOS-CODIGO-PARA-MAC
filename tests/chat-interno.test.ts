import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estadoPresenca, fichaCliente, problemaFicheiro, resumoMensagem, rotuloDia, tamanhoLegivel } from '../src/bibliotecas/chat-interno.ts';

test('presença: «Online» só com sinal recente do servidor; sem dados da nuvem não se inventa', () => {
    const agora = Date.parse('2026-10-28T10:00:00.000Z');
    assert.deepEqual(estadoPresenca({ online: true, lastSeen: '2026-10-28T09:59:30.000Z' }, true, agora), { online: true, texto: 'Online' });
    assert.deepEqual(estadoPresenca({ online: false, lastSeen: '2026-10-28T09:52:00.000Z' }, true, agora), { online: false, texto: 'Visto há 8 min' });
    assert.deepEqual(estadoPresenca({ online: false, lastSeen: null }, true, agora), { online: false, texto: 'Offline' });
    assert.equal(estadoPresenca(undefined, false, agora).online, false, 'sem ligação à nuvem nunca aparece online');
});

test('separadores de dia, tamanhos e resumo das mensagens', () => {
    const hoje = new Date(2026, 9, 28, 15, 0);
    assert.equal(rotuloDia(new Date(2026, 9, 28, 8, 0), hoje), 'Hoje');
    assert.equal(rotuloDia(new Date(2026, 9, 27, 23, 0), hoje), 'Ontem');
    assert.equal(tamanhoLegivel(2_621_440), '2,5 MB');
    assert.equal(tamanhoLegivel(2048), '2 KB');
    assert.equal(resumoMensagem({ content: '  Olá  ', attachments: [] }), 'Olá');
    assert.equal(resumoMensagem({ content: '', clientCard: { id: 'c', name: 'Sukeina' } }), 'Ficha de cliente: Sukeina');
    assert.equal(resumoMensagem({ content: '', attachments: [{ id: 'a', name: 'foto.jpg', mime: 'image/jpeg', size: 1, dataUrl: '' }] }), 'Fotografia');
    assert.equal(resumoMensagem({ content: '', attachments: [{ id: 'a', name: 'bi.pdf', mime: 'application/pdf', size: 1, dataUrl: '' }, { id: 'b', name: 'x.pdf', mime: 'application/pdf', size: 1, dataUrl: '' }] }), '2 ficheiros');
});

test('ficha de cliente partilhada leva só identificação e crédito; ficheiros validados', () => {
    const ficha = fichaCliente({ id: 'c1', name: 'Isaac', nif: '001412796BA039', phone: '+244 924', creditLimit: 1_000_000, usedCredit: 50_000, availableCredit: 950_000, status: 'active', riskLevel: 'medium', ...{ documents: '[...]' } } as never);
    assert.deepEqual(Object.keys(ficha).sort(), ['address', 'availableCredit', 'creditLimit', 'email', 'id', 'name', 'nif', 'phone', 'riskLevel', 'status', 'usedCredit']);
    assert.equal(ficha.creditLimit, 1_000_000);
    assert.equal(problemaFicheiro({ name: 'bi.pdf', type: 'application/pdf', size: 1000 }, 0), '');
    assert.match(problemaFicheiro({ name: 'virus.exe', type: 'application/x-msdownload', size: 1000 }, 0), /só imagens/);
    assert.match(problemaFicheiro({ name: 'grande.pdf', type: 'application/pdf', size: 9 * 1024 * 1024 }, 0), /mais de/);
    assert.equal(problemaFicheiro({ name: 'foto.jpg', type: 'image/jpeg', size: 9 * 1024 * 1024 }, 0), '', 'fotografias grandes são reduzidas antes de enviar');
    assert.match(problemaFicheiro({ name: 'a.pdf', type: 'application/pdf', size: 10 }, 6), /Máximo de 6/);
});
