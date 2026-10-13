import test from 'node:test';
import assert from 'node:assert/strict';

// localStorage mínimo (a tabela de preços vive no computador do Master).
const store = new Map<string, string>();
(globalThis as any).localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, String(value)); },
    removeItem: (key: string) => { store.delete(key); },
};

const P = await import('../src/bibliotecas/precos-master.ts');

test('sem tabela guardada usa os preços por omissão', () => {
    store.clear();
    assert.deepEqual(P.getMasterPrices(), P.DEFAULT_PRICES);
});

test('a tabela guardada é usada em todos os cálculos (licença, escalão, computadores e período)', () => {
    store.clear();
    P.saveMasterPrices({ ...P.DEFAULT_PRICES, monthly: 20000, annual: 200000, enterpriseMultiplier: 2 });
    const prices = P.getMasterPrices();
    assert.equal(P.licensePrice(prices, 'monthly', 'singular', 1), 20000);
    assert.equal(P.licensePrice(prices, 'monthly', 'empresarial', 3), 120000);
    assert.equal(P.periodPrice(prices, '1y'), 400000, 'empresas da web: plano do período no escalão Empresarial');
    assert.equal(P.periodPrice(prices, '1m', 'singular'), 20000);
    assert.equal(P.periodPrice(prices, 'custom'), null);
    assert.equal(P.priceInputValue(P.periodPrice(prices, '3m')), String(P.DEFAULT_PRICES.quarterly * 2));
});

test('valores inválidos guardados não estragam a tabela', () => {
    store.clear();
    store.set(P.PRICES_STORAGE_KEY, JSON.stringify({ monthly: -5, annual: 'abc', quarterly: 50000, enterpriseMultiplier: 0 }));
    const prices = P.getMasterPrices();
    assert.equal(prices.monthly, P.DEFAULT_PRICES.monthly);
    assert.equal(prices.annual, P.DEFAULT_PRICES.annual);
    assert.equal(prices.quarterly, 50000);
    assert.equal(prices.enterpriseMultiplier, P.DEFAULT_PRICES.enterpriseMultiplier);
    store.set(P.PRICES_STORAGE_KEY, '{nao json');
    assert.deepEqual(P.getMasterPrices(), P.DEFAULT_PRICES);
});
