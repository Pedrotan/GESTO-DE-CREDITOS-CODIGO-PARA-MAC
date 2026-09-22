import assert from 'node:assert/strict';
import test from 'node:test';
import { installStructuredConsole } from '../src/bibliotecas/logger-estruturado.ts';

test('logger estruturado remove segredos e documentos', () => {
    const lines: string[] = [];
    const original = console.info;
    console.info = (value?: any) => { lines.push(String(value)); };
    installStructuredConsole('test');
    console.info('evento', { password: 'segredo', nif: '123456789LA001', authorization: 'Bearer abc.def' });
    console.info = original;
    const record = JSON.parse(lines[0]);
    assert.equal(record.service, 'test');
    assert.equal(record.context[0].password, '[REDACTED]');
    assert.equal(record.context[0].nif, '[REDACTED]');
    assert.equal(record.context[0].authorization, '[REDACTED]');
});
