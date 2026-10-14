import test from 'node:test';
import assert from 'node:assert/strict';
import { angolanIbanProblem, holderMatchesClient, identifyBankFromIBAN, ibanMod97, validateAngolanIBAN } from '../src/bibliotecas/ibanHelper.ts';

const VALID = 'AO06 0044 0000 6729 5030 1010 2';

test('IBAN angolano: AO, 25 caracteres, dígito de controlo (mod 97) e banco pelo código', () => {
    assert.equal(ibanMod97(VALID), 1);
    assert.equal(validateAngolanIBAN(VALID), true);
    assert.equal(identifyBankFromIBAN(VALID)?.shortName, 'Sol');
    assert.match(angolanIbanProblem('PT50 0044 0000 6729 5030 1010 2')!, /começa por AO/);
    assert.match(angolanIbanProblem('AO06 0044 0000 6729 5030 1010')!, /25 caracteres/);
    assert.match(angolanIbanProblem('AO06 0044 0000 6729 5030 1010 3')!, /dígito de controlo/, 'um algarismo trocado é apanhado');
    assert.match(angolanIbanProblem('AO06 0044 0000 6729 5030 1001 2')!, /dígito de controlo/, 'dois algarismos trocados de lugar também');
    assert.match(angolanIbanProblem('AO06 0044 000A 6729 5030 1010 2')!, /só tem algarismos/);
});

test('titular: aviso quando não coincide com o nome do cliente (sem acentos, nomes do meio abreviados)', () => {
    assert.equal(holderMatchesClient('PEDRO TANGO', 'Pedro de Morais Tango'), true);
    assert.equal(holderMatchesClient('Pédro M. Tango', 'Pedro de Morais Tango'), true);
    assert.equal(holderMatchesClient('Maria Tango', 'Pedro de Morais Tango'), false);
    assert.equal(holderMatchesClient('', 'Pedro'), true, 'sem titular não há aviso');
});
