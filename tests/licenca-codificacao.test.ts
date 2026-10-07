import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeLicensePayload, encodeLicensePayload, isLanLicenseServer, normalizeLicenseKey } from '../src/bibliotecas/payload-licenca.ts';

test('o conteúdo da licença mantém os acentos do nome do cliente', () => {
    const json = JSON.stringify({ client: 'DIGITAL NORTE - COMÉRCIO E PRESTAÇÃO DE SERVIÇOS, (SU), LDA', nif: '5003207439' });
    const encoded = encodeLicensePayload(json);
    assert.equal(decodeLicensePayload(encoded), json);
    // Igual ao que o processo principal produz com Buffer (UTF-8).
    assert.equal(encoded, Buffer.from(json, 'utf8').toString('base64'));
});

test('a chave colada de um PDF ignora quebras de linha e espaços', () => {
    assert.equal(normalizeLicenseKey(' eyJwYXls\r\nb2FkIjoi\n  ZXlK== '), 'eyJwYXlsb2FkIjoiZXlK==');
    assert.equal(decodeLicensePayload('eyJh\nIjox fQ=='), '{"a":1}');
});

test('o uso único da licença só é verificado num servidor Master da rede local', () => {
    assert.equal(isLanLicenseServer('http://192.168.1.10:3000'), true);
    assert.equal(isLanLicenseServer('https://tango-gestao-creditos.vercel.app'), false);
    assert.equal(isLanLicenseServer(''), false);
    assert.equal(isLanLicenseServer(null), false);
});
