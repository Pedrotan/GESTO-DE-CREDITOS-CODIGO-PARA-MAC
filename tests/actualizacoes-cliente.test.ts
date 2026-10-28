import test from 'node:test';
import assert from 'node:assert/strict';
import {
    deferHours, nextCheckDelayMs, parseCheckReply, parseSseChunk, reconnectDelayMs, trustedUpdateServer,
} from '../src/bibliotecas/actualizacoes.ts';

// Lado do desktop: o actualizador só fala com o servidor oficial por HTTPS, valida tudo o que o servidor responde
// e trata o aviso em tempo real apenas como um sinal (nunca leva endereços nem comandos).

test('servidor de actualizações: só HTTPS e só o domínio oficial', () => {
    assert.equal(trustedUpdateServer('https://tangogestaoecreditos.tech'), 'https://tangogestaoecreditos.tech');
    assert.equal(trustedUpdateServer('https://tangogestaoecreditos.tech/'), 'https://tangogestaoecreditos.tech');
    assert.equal(trustedUpdateServer('http://tangogestaoecreditos.tech'), null);
    assert.equal(trustedUpdateServer('https://tangogestaoecreditos.tech.atacante.com'), null);
    assert.equal(trustedUpdateServer('https://191.215.45.104'), null);
    assert.equal(trustedUpdateServer('https://user:pass@tangogestaoecreditos.tech'), null);
    assert.equal(trustedUpdateServer('https://tangogestaoecreditos.tech/outro/caminho'), null);
    assert.equal(trustedUpdateServer('https://tangogestaoecreditos.tech:8443'), null);
    assert.equal(trustedUpdateServer('http://localhost:3000'), null, 'localhost só em desenvolvimento');
    assert.equal(trustedUpdateServer('http://localhost:3000', true), 'http://localhost:3000');
    assert.equal(trustedUpdateServer('javascript:alert(1)'), null);
});

test('resposta do /check é validada antes de chegar à interface', () => {
    assert.equal(parseCheckReply({ success: false }), null);
    assert.deepEqual(parseCheckReply({ success: true, channel: 'internal', available: false }), { channel: 'internal', release: null });
    assert.equal(parseCheckReply({ success: true, available: true, release: { version: '3.0.4; rm -rf /' } }), null);
    const parsed = parseCheckReply({ success: true, channel: 'qualquer', available: true, release: { releaseId: 'rel_3.0.4', version: '3.0.4', notes: 'x'.repeat(10_000), mandatory: 'sim', size: -5 } });
    assert.equal(parsed?.channel, 'stable');
    assert.equal(parsed?.release?.notes.length, 8_000);
    assert.equal(parsed?.release?.mandatory, false, 'só true conta como obrigatória');
    assert.equal(parsed?.release?.size, null);
});

test('«Mais tarde»: 1 a 72 horas; obrigatória volta ao fim de 1 hora', () => {
    assert.equal(deferHours(24, false), 24);
    assert.equal(deferHours(500, false), 72);
    assert.equal(deferHours(-3, false), 1);
    assert.equal(deferHours('abc', false), 1);
    assert.equal(deferHours(24, true), 1);
});

test('aviso em tempo real (SSE): só tipos conhecidos, blocos partidos ficam à espera', () => {
    const first = parseSseChunk('data: {"type":"connected"}\n\ndata: {"type":"update.avail');
    assert.deepEqual(first.events.map(event => event.type), ['connected']);
    const second = parseSseChunk(`${first.rest}able","version":"3.0.4","url":"https://mal.example/x.exe"}\n\n: keepalive\n\ndata: {"type":"executar","cmd":"rm"}\n\ndata: lixo\n\n`);
    assert.deepEqual(second.events, [{ type: 'update.available', version: '3.0.4', mandatory: false }]);
    assert.equal('url' in second.events[0], false, 'endereços vindos do aviso são descartados');
    assert.equal(second.rest, '');
});

test('verificação periódica com variação e religação com espera crescente', () => {
    assert.equal(nextCheckDelayMs(0.5), 4 * 3_600_000);
    assert.ok(nextCheckDelayMs(0) >= 3.5 * 3_600_000 && nextCheckDelayMs(1) <= 4.5 * 3_600_000);
    assert.equal(reconnectDelayMs(0), 5_000);
    assert.equal(reconnectDelayMs(2), 20_000);
    assert.equal(reconnectDelayMs(50), 300_000);
});
