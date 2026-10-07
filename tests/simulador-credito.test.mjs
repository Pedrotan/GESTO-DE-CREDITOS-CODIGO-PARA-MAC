// Motor do simulador de crédito: cálculo, Imposto do Selo, carência, TAEG, MTIC, datas e risco.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const root = path.resolve(import.meta.dirname, '..');
const outdir = mkdtempSync(path.join(tmpdir(), 'simulador-'));
const outfile = path.join(outdir, 'simulador.mjs');
await build({
    stdin: {
        contents: `
            export * from './src/bibliotecas/simulador-credito';
            export * from './src/bibliotecas/config-simulador';
            export * from './src/bibliotecas/risco-simulacao';
            export { formatCurrency, parseDecimalInput, formatPercent } from './src/bibliotecas/formatters';
        `,
        resolveDir: root, loader: 'ts',
    },
    bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent',
});
const sim = await import(pathToFileURL(outfile).href);
rmSync(outdir, { recursive: true, force: true });
const { simulateCredit, effortRate, maxPrincipalForPayment, minMonthsForPayment, nextBusinessDay, stampDutyUseRate, monthlyIrr, assessRisk, productLimitErrors, normalizeSimulatorConfig, formatCurrency, parseDecimalInput } = sim;

const close = (actual, expected, tolerance = 0.01, label = '') => assert.ok(Math.abs(actual - expected) <= tolerance, `${label} esperado ≈ ${expected}, obtido ${actual}`);
const base = { principal: 1_000_000, months: 12, annualRate: 24, system: 'price', startDate: '2026-10-05', dueDay: 10 };

test('teste obrigatório: 1 000 000 Kz, 12 meses, TAN 24%, prestações constantes, sem comissões', () => {
    const result = simulateCredit(base);
    close(result.installmentBase, 94_559.60, 0.005, 'Prestação');
    close(result.totalInterest, 134_715.20, 0.05, 'Total de juros');
    close(result.totalStampDutyInterest, 269.43, 0.05, 'IS sobre juros');
    assert.equal(result.stampDutyUse, 5_000, 'IS de utilização (0,5%, até 1 ano)');
    assert.equal(result.rows.at(-1).closingBalance, 0, 'capital em dívida final');
    assert.equal(result.rows.length, 12);
    assert.equal(result.netReceived, 995_000, 'o IS de utilização é descontado no desembolso');
    // Cada linha: prestação = juros + amortização + IS s/ juros (sem comissões nem seguro).
    for (const row of result.rows) close(row.payment, row.basePayment + row.stampDutyInterest, 1e-9);
    close(result.rows.reduce((sum, row) => sum + row.amortization, 0), 1_000_000, 1e-6, 'soma das amortizações');
    close(result.mtic, 1_000_000 + result.totalInterest + result.totalTaxes, 1e-6, 'MTIC');
    assert.ok(result.taeg > 26.82 && result.taeg < 30, `TAEG ${result.taeg} deve exceder a taxa efectiva da TAN (26,82%) por causa do IS`);
});

test('amortizações constantes: capital fixo, juros decrescentes e saldo final zero', () => {
    const result = simulateCredit({ ...base, system: 'sac' });
    const amortizations = result.rows.map(row => row.amortization);
    assert.ok(amortizations.slice(0, -1).every(value => value === amortizations[0]));
    assert.equal(result.rows.at(-1).closingBalance, 0);
    assert.ok(result.rows[0].interest > result.rows.at(-1).interest);
    assert.equal(result.maxInstallment, result.rows[0].payment, 'a maior prestação é a primeira');
});

test('Imposto do Selo de utilização conforme o prazo', () => {
    assert.equal(stampDutyUseRate(12), 0.5);
    assert.equal(stampDutyUseRate(13), 0.4);
    assert.equal(stampDutyUseRate(59), 0.4);
    assert.equal(stampDutyUseRate(60), 0.3);
    assert.equal(simulateCredit({ ...base, months: 24 }).stampDutyUse, 4_000);
    assert.equal(simulateCredit({ ...base, months: 60 }).stampDutyUse, 3_000);
});

test('carência de capital paga só juros; carência total capitaliza os juros', () => {
    const capital = simulateCredit({ ...base, graceMonths: 3, graceType: 'capital' });
    assert.ok(capital.rows.slice(0, 3).every(row => row.amortization === 0 && row.payment > 0 && row.closingBalance === 1_000_000));
    assert.equal(capital.rows.at(-1).closingBalance, 0);
    const total = simulateCredit({ ...base, graceMonths: 3, graceType: 'total' });
    assert.ok(total.rows.slice(0, 3).every(row => row.payment === 0));
    assert.ok(total.rows[2].closingBalance > 1_000_000, 'os juros da carência aumentam o capital em dívida');
    assert.equal(total.rows.at(-1).closingBalance, 0);
    close(total.rows.reduce((sum, row) => sum + row.amortization, 0), total.rows[2].closingBalance, 1e-6, 'amortiza o capital capitalizado');
});

test('comissões descontadas vs financiadas, seguro e comissão de processamento', () => {
    const fees = { openingFee: { mode: 'percent', value: 2 }, processingFee: 500, insuranceRate: 0.05 };
    const deducted = simulateCredit({ ...base, ...fees, feePayment: 'deducted' });
    assert.equal(deducted.netReceived, 1_000_000 - 20_000 - 5_000);
    assert.equal(deducted.financedPrincipal, 1_000_000);
    assert.equal(deducted.rows[0].processingFee, 500);
    assert.equal(deducted.rows[0].insurance, 500, '0,05% de 1 000 000');
    close(deducted.installment - deducted.installmentBase, deducted.rows.find(row => !row.grace).stampDutyInterest + 500 + 500, 1e-9);
    const financed = simulateCredit({ ...base, ...fees, feePayment: 'financed' });
    assert.equal(financed.netReceived, 1_000_000);
    assert.equal(financed.financedPrincipal, 1_025_000);
    assert.ok(financed.installment > deducted.installment);
    assert.ok(deducted.taeg > simulateCredit(base).taeg, 'as comissões aumentam a TAEG');
});

test('TAEG pela TIR: sem encargos coincide com a taxa efectiva da TAN', () => {
    const irr = monthlyIrr([1000, ...Array(12).fill(-1000 * 0.02 / (1 - Math.pow(1.02, -12)))]);
    close(irr, 0.02, 1e-9);
    const noTax = simulateCredit({ ...base, stampDuty: { upToOneYear: 0, overOneYear: 0, fiveYearsOrMore: 0, interest: 0 } });
    close(noTax.taeg, (Math.pow(1.02, 12) - 1) * 100, 0.01, 'TAEG sem encargos');
});

test('vencimentos no dia útil seguinte (fim-de-semana e feriados de Angola)', () => {
    const saturday = nextBusinessDay(new Date(2026, 9, 10));
    assert.equal(saturday.getDay(), 1, '10/10/2026 é sábado: passa para segunda-feira');
    const independence = nextBusinessDay(new Date(2026, 10, 11));
    assert.equal(independence.getDate(), 12, '11 de Novembro é feriado nacional');
    const extra = nextBusinessDay(new Date(2026, 10, 12), ['2026-11-12']);
    assert.equal(extra.getDate(), 13, 'data adicional configurada');
    const result = simulateCredit(base);
    assert.equal(result.rows[0].dueDate, '2026-11-10');
    assert.equal(result.rows[1].dueDate, '2026-12-10');
});

test('simulação inversa, montante máximo e prazo mínimo pela taxa de esforço', () => {
    const { principal, ...rest } = base;
    const target = simulateCredit(base).maxInstallment;
    close(target, 94_559.60 + 40, 0.005, 'primeira prestação com IS s/ juros (0,2% de 20 000)');
    const max = maxPrincipalForPayment(target, rest);
    assert.ok(Math.abs(max - principal) <= 1, `montante máximo ≈ 1 000 000 (obtido ${max})`);
    assert.ok(simulateCredit({ ...base, principal: max }).maxInstallment <= target);
    const months = minMonthsForPayment(50_000, base, 60);
    assert.ok(months > 12 && months <= 36);
    assert.ok(simulateCredit({ ...base, months }).maxInstallment <= 50_000);
    assert.ok(simulateCredit({ ...base, months: months - 1 }).maxInstallment > 50_000);
    close(effortRate(94_829.03, 20_000, 400_000), 28.707, 0.001);
    assert.equal(effortRate(1000, 0, 0), null);
});

test('risco calculado a partir da taxa de esforço, do histórico e das garantias', () => {
    const good = assessRisk({ effortRate: 20, effortLimit: 33, latePayments: 0, maxDaysOverdue: 0, paidCredits: 2, activeCredits: 0, defaultedCredits: 0, guaranteeCoverage: 1 });
    assert.equal(good.level, 'low');
    const bad = assessRisk({ effortRate: 45, effortLimit: 33, latePayments: 4, maxDaysOverdue: 120, paidCredits: 0, activeCredits: 1, defaultedCredits: 1, guaranteeCoverage: 0 });
    assert.equal(bad.level, 'high');
    assert.ok(bad.reasons.length >= 4);
    const middle = assessRisk({ effortRate: 31, effortLimit: 33, latePayments: 1, maxDaysOverdue: 10, paidCredits: 0, activeCredits: 0, defaultedCredits: 0, guaranteeCoverage: 0 });
    assert.equal(middle.level, 'medium');
});

test('limites do produto, configuração e formatação em Kz', () => {
    const config = normalizeSimulatorConfig({});
    const product = config.products.find(item => item.id === 'microcredito');
    const errors = productLimitErrors(product, 2_000_000, 30, formatCurrency);
    assert.equal(errors.length, 2);
    assert.match(errors[0], /montante máximo/);
    assert.equal(formatCurrency(1_000_000).replace(/ /g, ' '), '1 000 000,00 Kz');
    assert.equal(parseDecimalInput('1 000 000,50'), 1_000_000.5);
    assert.equal(parseDecimalInput('2,5'), 2.5);
    assert.equal(parseDecimalInput('24.5'), 24.5);
    assert.equal(config.stampDuty.upToOneYear, 0.5);
    assert.equal(normalizeSimulatorConfig({ effortLimit: 40, stampDuty: { interest: 0.3 } }).stampDuty.interest, 0.3);
});
