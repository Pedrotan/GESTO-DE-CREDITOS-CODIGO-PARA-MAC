import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    DEFAULT_INTEREST_TIERS,
    normalizeInterestTiers,
    tierForMonths,
    tierLabel,
    validateInterestTiers,
} from '../src/bibliotecas/taxas-juro.ts';

test('tierLabel reproduz os rótulos da tabela padrão', () => {
    assert.deepEqual(DEFAULT_INTEREST_TIERS.map(tierLabel), [
        '1 Mês (35%)', '2 Meses (50%)', '3 Meses (60%)', '4-5 Meses (70%)', '6-8 Meses (80%)', '9-10 Meses (100%)',
    ]);
});

test('tierForMonths encontra o escalão, usa o último acima do limite e ignora lacunas', () => {
    assert.equal(tierForMonths(DEFAULT_INTEREST_TIERS, 5)?.rate, 70);
    assert.equal(tierForMonths(DEFAULT_INTEREST_TIERS, 24)?.rate, 100);
    assert.equal(tierForMonths(DEFAULT_INTEREST_TIERS, 0), undefined);
    const withGap = [{ id: 'a', minMonths: 1, maxMonths: 2, rate: 10 }, { id: 'b', minMonths: 5, maxMonths: 6, rate: 20 }];
    assert.equal(tierForMonths(withGap, 3), undefined);
});

test('validateInterestTiers rejeita sobreposições, intervalos invertidos e taxas negativas', () => {
    assert.equal(validateInterestTiers(DEFAULT_INTEREST_TIERS), null);
    assert.match(validateInterestTiers([]) ?? '', /pelo menos/);
    assert.match(validateInterestTiers([{ id: 'a', minMonths: 1, maxMonths: 3, rate: 10 }, { id: 'b', minMonths: 3, maxMonths: 4, rate: 20 }]) ?? '', /sobrepõem/);
    assert.match(validateInterestTiers([{ id: 'a', minMonths: 4, maxMonths: 2, rate: 10 }]) ?? '', /menor/);
    assert.match(validateInterestTiers([{ id: 'a', minMonths: 1, maxMonths: 1, rate: -1 }]) ?? '', /taxas/);
});

test('normalizeInterestTiers lê JSON guardado, ordena e recorre à tabela padrão se inválido', () => {
    const saved = JSON.stringify([{ id: 'x', minMonths: 3, maxMonths: 4, rate: 40 }, { id: 'y', minMonths: 1, maxMonths: 2, rate: 20 }]);
    assert.deepEqual(normalizeInterestTiers(saved).map(t => t.id), ['y', 'x']);
    assert.equal(normalizeInterestTiers('lixo'), DEFAULT_INTEREST_TIERS);
    assert.equal(normalizeInterestTiers(null), DEFAULT_INTEREST_TIERS);
    assert.equal(normalizeInterestTiers([{ minMonths: 2, maxMonths: 1, rate: 5 }]), DEFAULT_INTEREST_TIERS);
});
