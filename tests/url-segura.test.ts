import test from 'node:test';
import assert from 'node:assert/strict';
import { getKnownCloudServers, secureCloudUrl } from '../src/servicos/ServicoLigacaoNuvem.ts';

// Na Internet, códigos de acesso e chaves só viajam por HTTPS.

test('o IP e o domínio da VPS em HTTP passam para o domínio oficial em HTTPS', () => {
    assert.equal(secureCloudUrl('http://191.215.45.104:3000'), 'https://tangogestaoecreditos.tech');
    assert.equal(secureCloudUrl('http://191.215.45.104/'), 'https://tangogestaoecreditos.tech');
    assert.equal(secureCloudUrl('http://tangogestaoecreditos.tech/api/sync'), 'https://tangogestaoecreditos.tech/api/sync');
    assert.equal(secureCloudUrl('http://outro-servidor.example.com:80'), 'https://outro-servidor.example.com');
});

test('HTTPS e servidores da rede local ficam como estão', () => {
    assert.equal(secureCloudUrl('https://tango-gestao-creditos.vercel.app/'), 'https://tango-gestao-creditos.vercel.app');
    for (const local of ['http://localhost:3000', 'http://127.0.0.1:8081', 'http://192.168.1.20:3000', 'http://10.0.0.5', 'http://servidor.local:3000']) {
        assert.equal(secureCloudUrl(local), local);
    }
});

test('a lista de servidores alternativos não tem nenhum endereço HTTP', () => {
    assert.ok(getKnownCloudServers().every(url => url.startsWith('https://')));
});
