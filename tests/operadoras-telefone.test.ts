import test from 'node:test';
import assert from 'node:assert/strict';
import { analisarTelefoneAngola, telefoneOpcionalValido } from '../src/bibliotecas/operadoras-telefone.ts';

test('identifica a operadora pelo prefixo (como a Angola-API)', () => {
    assert.equal(analisarTelefoneAngola('+244 923 445 618').operadora, 'Unitel');
    assert.equal(analisarTelefoneAngola('934000000').operadora, 'Unitel');
    assert.equal(analisarTelefoneAngola('944000000').operadora, 'Unitel');
    assert.equal(analisarTelefoneAngola('00244 913 000 000').operadora, 'Movicel');
    assert.equal(analisarTelefoneAngola('991000000').operadora, 'Movicel');
    assert.equal(analisarTelefoneAngola('+244951000000').operadora, 'Africell');
    assert.equal(analisarTelefoneAngola('+244951000000').numero, '+244951000000');
});

test('telefone fixo é válido e não tem operadora móvel', () => {
    const fixo = analisarTelefoneAngola('222 123 456');
    assert.equal(fixo.valido, true);
    assert.equal(fixo.fixo, true);
    assert.equal(fixo.operadora, null);
});

test('rejeita números incompletos ou com prefixo desconhecido', () => {
    assert.equal(analisarTelefoneAngola('92344561').valido, false);
    assert.equal(analisarTelefoneAngola('9234456189').valido, false);
    assert.match(analisarTelefoneAngola('961000000').mensagem, /prefixo 96/);
    assert.equal(analisarTelefoneAngola('123').valido, false);
});

test('campo opcional: vazio aceite, preenchido tem de ser válido', () => {
    assert.equal(telefoneOpcionalValido(''), true);
    assert.equal(telefoneOpcionalValido(undefined), true);
    assert.equal(telefoneOpcionalValido('+244 '), true);
    assert.equal(telefoneOpcionalValido('961000000'), false);
    assert.equal(telefoneOpcionalValido('923445618'), true);
});
