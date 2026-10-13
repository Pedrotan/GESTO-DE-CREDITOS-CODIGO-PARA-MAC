// Taxas automáticas por produto e prazo: tabela do produto (ou geral), juro fixo do prazo e taxa no formulário.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const root = path.resolve(import.meta.dirname, '..');
const outdir = mkdtempSync(path.join(tmpdir(), 'taxas-produto-'));
const outfile = path.join(outdir, 'taxas.mjs');
await build({
    stdin: {
        contents: `
            export * from './src/bibliotecas/simulador-credito';
            export * from './src/bibliotecas/config-simulador';
            export { DEFAULT_INTEREST_TIERS } from './src/bibliotecas/taxas-juro';
            export { computeSimulation, defaultForm, nearestTerm, productFields, termRatePatch } from './src/componentes/simulador/modelo';
        `,
        resolveDir: root, loader: 'ts',
    },
    bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent', alias: { '@': path.join(root, 'src') },
});
const mod = await import(pathToFileURL(outfile).href);
rmSync(outdir, { recursive: true, force: true });
const { normalizeSimulatorConfig, productTermOptions, productTermRate, productLimitErrors, simulateCredit, DEFAULT_INTEREST_TIERS, computeSimulation, defaultForm, nearestTerm, productFields, termRatePatch } = mod;

const config = normalizeSimulatorConfig({
    products: [
        { id: 'pessoal', name: 'Crédito Pessoal', active: true, minAmount: 10_000, maxAmount: 5_000_000, rateMode: 'term',
            termRates: [{ id: 'a', minMonths: 1, maxMonths: 1, rate: 35 }, { id: 'b', minMonths: 2, maxMonths: 3, rate: 50 }] },
        { id: 'empresa', name: 'Crédito Empresarial', active: true, minAmount: 10_000, maxAmount: 5_000_000, rateMode: 'term', termRates: [] },
        { id: 'tan', name: 'Crédito TAN', active: true, minAmount: 10_000, maxAmount: 5_000_000, rateMode: 'annual', annualRate: 24, system: 'price' },
    ],
});
const noFees = { openingFee: { mode: 'fixed', value: 0 }, processingFee: 0, insuranceRate: 0, feePayment: 'deducted', stampDuty: { upToOneYear: 0, overOneYear: 0, overFiveYears: 0, interest: 0 } };

test('os produtos guardados antes passam a usar a taxa por prazo; a tabela própria vale sobre a geral', () => {
    const legacy = normalizeSimulatorConfig({ products: [{ id: 'x', name: 'X', active: true }] });
    assert.equal(legacy.products[0].rateMode, 'term');
    const [pessoal, empresa] = config.products;
    assert.deepEqual(productTermOptions(pessoal, DEFAULT_INTEREST_TIERS), [{ months: 1, rate: 35 }, { months: 2, rate: 50 }, { months: 3, rate: 50 }]);
    assert.equal(productTermRate(empresa, DEFAULT_INTEREST_TIERS, 2), 50, 'sem tabela própria usa a tabela geral');
    assert.equal(productTermRate(pessoal, DEFAULT_INTEREST_TIERS, 4), null, 'prazo fora da tabela');
    assert.deepEqual(productLimitErrors(pessoal, 100_000, 1, String), [], 'os prazos mínimo/máximo não se aplicam à tabela');
});

test('juro fixo do prazo: 100 000 Kz a 1 mês com 35% dá 35 000 Kz de juros', () => {
    const result = simulateCredit({ principal: 100_000, months: 1, annualRate: 0, termRate: 35, system: 'flat', startDate: '2026-01-10T12:00:00', dueDay: 10, ...noFees });
    assert.equal(result.valid, true);
    assert.equal(result.totalInterest, 35_000);
    assert.equal(result.rows.length, 1);
    assert.equal(result.rows[0].amortization + result.rows[0].interest, 135_000);
    const three = simulateCredit({ principal: 100_000, months: 3, annualRate: 0, termRate: 50, system: 'flat', startDate: '2026-01-10T12:00:00', dueDay: 10, ...noFees });
    assert.equal(three.totalInterest, 50_000);
    assert.equal(three.rows.reduce((sum, row) => sum + row.amortization, 0), 100_000);
});

test('escolher produto e prazo preenche a taxa e recalcula; a taxa alterada à mão não é substituída', () => {
    const pessoal = config.products[0];
    let form = { ...defaultForm(config), ...productFields(pessoal, config), principal: 100_000, months: 2 };
    assert.equal(form.system, 'flat');
    form = { ...form, ...termRatePatch(form, config, DEFAULT_INTEREST_TIERS) };
    assert.equal(form.termRate, 50);
    const calc = computeSimulation(form, config, null);
    assert.equal(calc.result?.totalInterest, 50_000);
    assert.equal(calc.riskAdjustment, 0, 'a taxa do prazo não leva ajuste ao risco');
    assert.equal(termRatePatch({ ...form, months: 1 }, config, DEFAULT_INTEREST_TIERS)?.termRate, 35);
    assert.equal(termRatePatch({ ...form, termRate: 40, termRateManual: true }, config, DEFAULT_INTEREST_TIERS), null);
    assert.equal(nearestTerm([{ months: 1 }, { months: 3 }], 2), 3);
    assert.equal(nearestTerm([{ months: 1 }, { months: 3 }], 12), 3);
    const tan = { ...defaultForm(config), ...productFields(config.products[2], config) };
    assert.equal(tan.system, 'price');
    assert.equal(termRatePatch(tan, config, DEFAULT_INTEREST_TIERS), null);
});
