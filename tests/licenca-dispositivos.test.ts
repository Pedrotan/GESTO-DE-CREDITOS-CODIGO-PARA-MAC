import { test } from 'node:test';
import assert from 'node:assert/strict';
import { licenseAppliesToDevice } from '../src/bibliotecas/payload-licenca.ts';

test('licença global ou da própria máquina vale neste dispositivo', () => {
    assert.equal(licenseAppliesToDevice({ mid: 'GLOBAL' }, 'TANGO-AAAA'), true);
    assert.equal(licenseAppliesToDevice({ mid: 'TANGO-AAAA', nif: '999999999' }, 'TANGO-AAAA'), true);
});

test('licença emitida para o NIF da empresa vale em todos os dispositivos dessa empresa', () => {
    const license = { mid: 'TANGO-PC-DO-ESCRITORIO', nif: '5003207439' };
    assert.equal(licenseAppliesToDevice(license, 'TANGO-WEB-NAVEGADOR', '5003207439'), true);
    assert.equal(licenseAppliesToDevice(license, 'TANGO-OUTRO-PC', ' 5003-207-439 '), true);
});

test('licença de outra empresa, ou sem NIF real, não vale noutra máquina', () => {
    assert.equal(licenseAppliesToDevice({ mid: 'TANGO-PC', nif: '5003207439' }, 'TANGO-WEB', '5009990001'), false);
    assert.equal(licenseAppliesToDevice({ mid: 'TANGO-PC', nif: '999999999' }, 'TANGO-WEB', '999999999'), false);
    assert.equal(licenseAppliesToDevice({ mid: 'TANGO-PC' }, 'TANGO-WEB', '5003207439'), false);
    assert.equal(licenseAppliesToDevice({ mid: 'TANGO-PC', nif: '5003207439' }, 'TANGO-WEB', ''), false);
});
