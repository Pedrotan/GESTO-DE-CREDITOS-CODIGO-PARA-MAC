// Ficha de Simulação (PDF), termos legais e regras da página do simulador (estado, histórico do cliente).
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const root = path.resolve(import.meta.dirname, '..');
const outdir = mkdtempSync(path.join(tmpdir(), 'simulador-ficha-'));
const outfile = path.join(outdir, 'ficha.mjs');
await build({
    stdin: {
        contents: `
            export { generateSimulationSheetPdf } from '@/bibliotecas/ficha-simulacao-pdf';
            export * from '@/bibliotecas/termos-legais';
            export { simulateCredit } from '@/bibliotecas/simulador-credito';
            export { normalizeSimulatorConfig } from '@/bibliotecas/config-simulador';
            export { clientHistory, simulationStatus, formFromSimulation, defaultForm, buildInput, newSimulationNumber, newVerificationCode, effortTone } from '@/componentes/simulador/modelo';
        `,
        resolveDir: root, loader: 'ts',
    },
    bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent',
    // O qrcode usa require() de módulos do Node (fs, zlib): disponibiliza-o no pacote ESM.
    banner: { js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);" },
    loader: { '.png': 'dataurl', '.jpg': 'dataurl', '.jpeg': 'dataurl', '.svg': 'dataurl' },
    plugins: [{
        name: 'alias',
        setup(builder) {
            builder.onResolve({ filter: /^@\// }, async args => builder.resolve(path.join(root, 'src', args.path.slice(2)), { kind: args.kind, resolveDir: root }));
        },
    }],
});
const mod = await import(pathToFileURL(outfile).href);
rmSync(outdir, { recursive: true, force: true });

const config = mod.normalizeSimulatorConfig({});
const settings = { name: 'Microcrédito Exemplo, Lda.', nif: '5000000000', address: 'Rua da Missão, 10', location: 'Luanda', phone: '+244 900 000 000', email: 'geral@exemplo.ao' };
const legal = mod.legalContextFrom(settings, config);

test('termos com o nome da empresa, artigos numerados e base legal conhecida', () => {
    const articles = mod.buildTermsArticles(legal);
    assert.ok(articles.length >= 15);
    articles.forEach((article, index) => assert.equal(article.number, index + 1));
    assert.match(articles[0].paragraphs[0], /Microcrédito Exemplo, Lda\., NIF 5000000000, com sede em Rua da Missão, 10, Luanda/);
    const text = articles.flatMap(article => article.paragraphs).join(' ');
    assert.match(text, /20 dias/);
    assert.match(text, /15 dias/, 'validade configurada');
    assert.match(text, /33%/, 'limite da taxa de esforço');
    const diplomas = mod.LEGAL_REFERENCES.map(reference => reference.diploma).join(' | ');
    for (const law of ['Lei n.º 14/21', 'Lei n.º 24/21', 'Aviso n.º 12/2016', 'Aviso n.º 15/2020', 'Instrutivo n.º 12/2020', 'Lei n.º 22/11', 'Lei n.º 05/20', 'Imposto do Selo']) {
        assert.ok(diplomas.includes(law), `${law} na legislação de referência`);
    }
    const methodology = mod.simulationMethodology(legal).map(item => item.text).join(' ');
    assert.match(methodology, /0,50%/);
    assert.match(methodology, /0,20%/);
    assert.match(methodology, /\(1 \+ TIR mensal\)\^12/);
});

test('ficha de simulação em PDF: número, código, plano, incumprimento, assinaturas e página legal', async () => {
    const form = { ...mod.defaultForm(config), clientName: 'Cliente Teste', principal: 1_000_000, months: 12, baseRate: 24, applyRiskAdjustment: false, openingFee: { mode: 'percent', value: 0 }, processingFee: 0, insuranceEnabled: false };
    const result = mod.simulateCredit({ ...mod.buildInput(form, config, 24), startDate: '2026-10-05T12:00:00', dueDay: 10 });
    const bytes = await mod.generateSimulationSheetPdf({
        number: 'SIM-2026-TESTE1', verificationCode: '4F7K-QM2X', issuedAt: new Date('2026-10-05T10:00:00'), expiresAt: new Date('2026-10-20T10:00:00'),
        client: { name: 'Cliente Teste', registered: false, income: 400_000, otherDebts: 0 }, productName: 'Crédito Pessoal',
        params: { principal: 1_000_000, months: 12, system: 'price', startDate: '2026-10-05', dueDay: 10, graceMonths: 0, graceType: 'capital', rateType: 'fixed', baseRate: 24, riskAdjustment: 0, annualRate: 24, feePayment: 'deducted', openingFee: { mode: 'percent', value: 0 }, processingFee: 0, insuranceRate: 0 },
        result, effortRate: 23.65, effortLimit: 33, risk: { level: 'low', overridden: false }, lateSurcharge: 2, validityDays: 15,
    }, settings, 'Operador', legal, 'bytes');
    const pdf = Buffer.from(bytes).toString('latin1');
    const pages = (pdf.match(/\/Type \/Page\b/g) || []).length;
    assert.ok(pages >= 3, `pelo menos 3 páginas (obtidas ${pages})`);
    for (const text of ['SIM-2026-TESTE1', '4F7K-QM2X', 'FICHA DE INFORMA', 'TERMOS, POL', 'Lei n.', '14/21', 'Aviso n.', '12/2016', 'TAEG', 'MTIC', 'O Cliente', `Página 1 de ${pages}`]) {
        assert.ok(pdf.includes(text), `o PDF contém «${text}»`);
    }
    assert.ok(pdf.includes('94 559,60') || pdf.includes('94\xa0559,60'), 'prestação do teste obrigatório no plano');
    assert.ok(pdf.includes('/Subtype /Image'), 'QR code incluído');
});

test('estado da simulação, histórico do cliente e simulações antigas', () => {
    const now = new Date('2026-10-05T12:00:00');
    assert.equal(mod.simulationStatus({ status: 'converted', date: '2026-01-01', expiresAt: '2026-01-15' }, now), 'converted');
    assert.equal(mod.simulationStatus({ status: 'simulated', date: '2026-09-01', expiresAt: '2026-09-16' }, now), 'expired');
    assert.equal(mod.simulationStatus({ status: 'simulated', date: '2026-10-01', expiresAt: '2026-10-16' }, now), 'simulated');
    assert.equal(mod.simulationStatus({ date: '2026-08-01' }, now), 'expired', 'antigas sem validade expiram ao fim de 15 dias');

    const client = { id: 'c1', name: 'Ana' };
    const credits = [
        { id: 'k1', clientId: 'c1', status: 'paid', principalAmount: 100_000, totalDue: 0, installments: 6, paidInstallments: 6, daysOverdue: 0 },
        { id: 'k2', clientId: 'c1', status: 'active', principalAmount: 200_000, totalDue: 120_000, installments: 10, paidInstallments: 4, daysOverdue: 0 },
        { id: 'k3', clientId: 'c1', status: 'overdue', principalAmount: 50_000, totalDue: 30_000, installments: 3, paidInstallments: 0, daysOverdue: 45 },
        { id: 'k4', clientId: 'c1', status: 'rejected', principalAmount: 999_000, totalDue: 999_000, installments: 1, paidInstallments: 0, daysOverdue: 0 },
        { id: 'k5', clientId: 'outro', status: 'active', principalAmount: 1, totalDue: 1, installments: 1, paidInstallments: 0, daysOverdue: 0 },
    ];
    const payments = [
        { creditId: 'k1', status: 'confirmed', paymentDate: '2026-03-20', dueDate: '2026-03-10' },
        { creditId: 'k1', status: 'confirmed', paymentDate: '2026-04-10', dueDate: '2026-04-10' },
    ];
    const warranties = [{ clientId: 'c1', status: 'active', marketValue: 250_000 }, { clientId: 'c1', status: 'released', marketValue: 1_000_000 }];
    const history = mod.clientHistory(client, credits, payments, warranties, 500_000);
    assert.equal(history.activeCredits, 2);
    assert.equal(history.paidCredits, 1);
    assert.equal(history.latePayments, 2, '1 pagamento atrasado + 1 crédito em atraso');
    assert.equal(history.maxDaysOverdue, 45);
    assert.equal(history.guaranteeCoverage, 0.5);
    assert.equal(history.monthlyDebts, 20_000 + 10_000, '120 000 / 6 + 30 000 / 3');

    const legacy = mod.formFromSimulation({ clientName: 'Antigo', clientIncome: 300_000, amount: 500_000, term: 10, interestRate: 2, method: 'sac', date: '2025-01-01' }, config);
    assert.equal(legacy.baseRate, 24, 'a taxa mensal antiga (2%) passa a TAN de 24%');
    assert.equal(legacy.system, 'sac');
    assert.match(mod.newSimulationNumber(new Date('2026-10-05')), /^SIM-2026-[A-Z2-9]{6}$/);
    assert.match(mod.newVerificationCode(), /^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    assert.equal(mod.effortTone(25, 33), 'green');
    assert.equal(mod.effortTone(31, 33), 'yellow');
    assert.equal(mod.effortTone(34, 33), 'red');
});
