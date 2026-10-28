// Página de Contratos: estado «Em atraso» e «Liquidado» calculado a partir do plano de prestações (não do estado
// gravado), filtros rápidos com contagem, indicadores com dinheiro em risco, alertas «Requer atenção» e o
// relatório de contratos com os mesmos totais no PDF e no Excel. A numeração dos contratos fica igual.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const root = path.resolve(import.meta.dirname, '..');
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
globalThis.window = globalThis;

async function loadModules() {
    const outdir = mkdtempSync(path.join(tmpdir(), 'contratos-'));
    const outfile = path.join(outdir, 'contratos.mjs');
    await build({
        stdin: {
            contents: `
                export * as K from '@/bibliotecas/contratos-analise';
                export * as C from '@/bibliotecas/carteira-credito';
                export * as R from '@/bibliotecas/relatorios-pagamentos';
                export { contractNumbers } from '@/bibliotecas/pagamentos-analise';
            `,
            resolveDir: root, loader: 'ts',
        },
        bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent',
        define: { 'import.meta.env': JSON.stringify({ BASE_URL: '/', MODE: 'test', DEV: false, PROD: true }) },
        banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
        loader: { '.png': 'dataurl', '.jpg': 'dataurl', '.svg': 'dataurl', '.webp': 'dataurl' },
        plugins: [{
            name: 'alias',
            setup(builder) {
                builder.onResolve({ filter: /^@\/bibliotecas\/bd$/ }, () => ({ path: 'test-db', namespace: 'test-db' }));
                builder.onLoad({ filter: /.*/, namespace: 'test-db' }, () => ({ contents: 'export const db = {};', loader: 'js' }));
                builder.onResolve({ filter: /^@\// }, async args => builder.resolve(path.join(root, 'src', args.path.slice(2)), { kind: args.kind, resolveDir: root }));
            },
        }],
    });
    const module = await import(pathToFileURL(outfile).href);
    rmSync(outdir, { recursive: true, force: true });
    return module;
}

const { K, C, R, contractNumbers } = await loadModules();
const NOW = new Date('2026-10-26T12:00:00Z');
const TODAY = '2026-10-26';

const credit = (id, extra = {}) => ({
    id, clientId: `cl-${id}`, clientName: `Cliente ${id}`, principalAmount: 100_000, currentBalance: 100_000, interestRate: 5, lateInterestRate: 0.1,
    installments: 2, paidInstallments: 0, startDate: '2026-10-01T12:00:00Z', dueDate: '2026-12-01T12:00:00Z', status: 'active', daysOverdue: 0,
    accruedInterest: 0, lateInterest: 0, totalDue: 0, createdAt: '2026-10-01T12:00:00Z', usuario_id: 'u1', ...extra,
});
const installment = (creditId, n, dueDate, paid = 0) => ({
    id: `${creditId}-${n}`, creditId, installmentNumber: n, dueDate, principalMinor: 5_000_000, interestMinor: 250_000, lateInterestMinor: 0,
    paidPrincipalMinor: paid ? 5_000_000 : 0, paidInterestMinor: paid ? 250_000 : 0, paidLateInterestMinor: 0, status: paid ? 'paid' : 'pending',
});
const contract = (id, extra = {}) => ({ id, clientId: `cl-${id}`, clientName: `Cliente ${id}`, title: `Contrato ${id}`, startDate: '2026-10-01T12:00:00Z', endDate: '2026-12-01T12:00:00Z', value: 100_000, status: 'active', createdAt: '2026-10-01T12:00:00Z', ...extra });

function scenario() {
    // A: em dia (próxima prestação daqui a 3 dias). B: prestação vencida há 11 dias. L: tudo pago, mas o contrato
    // continua gravado como «active» (o estado sai do plano). T: terminado. X: liquidado (crédito pago, sem plano).
    const credits = [
        credit('A'), credit('B', { startDate: '2026-09-01T12:00:00Z' }), credit('L'), credit('T'), credit('X', { status: 'paid', currentBalance: 0 }),
    ];
    const installments = [
        installment('A', 1, '2026-10-29T12:00:00Z'), installment('A', 2, '2026-11-29T12:00:00Z'),
        installment('B', 1, '2026-10-15T12:00:00Z'), installment('B', 2, '2026-11-15T12:00:00Z'),
        installment('L', 1, '2026-10-05T12:00:00Z', 1), installment('L', 2, '2026-10-20T12:00:00Z', 1),
    ];
    const clients = credits.map(item => ({ id: item.clientId, name: item.clientName, nif: `NIF${item.id}`, phone: '923000000', riskLevel: 'low',
        expiryDate: item.id === 'A' ? '2026-11-15' : '2030-01-01', documents: [] }));
    const contracts = [contract('A'), contract('B', { startDate: '2026-09-01T12:00:00Z' }), contract('L'), contract('T', { status: 'terminated' }), contract('X')];
    const portfolio = C.buildPortfolio(credits, { installments, payments: [], clients, users: [{ id: 'u1', name: 'Gestora' }], now: NOW });
    const numbers = contractNumbers(credits);
    const rows = K.buildContractRows({ contracts, portfolio, installments, clients, numbers, today: TODAY,
        documents: [{ creditId: 'B', kind: 'contrato', fileName: 'b.pdf', uploadedAt: '2026-09-02' }, { creditId: 'B', kind: 'bi', fileName: 'bi.pdf', uploadedAt: '2026-09-02' }] });
    return { rows, installments, numbers };
}

test('estado vem do plano de prestações e a numeração é a de sempre', () => {
    const { rows, numbers } = scenario();
    const state = Object.fromEntries(rows.map(row => [row.id, row.state]));
    assert.deepEqual(state, { A: 'em_dia', B: 'atraso', L: 'liquidado', T: 'terminado', X: 'liquidado' });
    for (const row of rows) assert.equal(row.number, numbers.get(row.id));
    const b = rows.find(row => row.id === 'B');
    assert.equal(b.daysOverdue, 11);
    assert.equal(b.overdueMinor, 5_250_000);
    assert.equal(b.outstandingMinor, 10_000_000);
    assert.equal(b.risk, 'B');
    const l = rows.find(row => row.id === 'L');
    assert.equal(l.outstandingMinor, 0);
    assert.equal(l.repaidMinor, 10_500_000);
    assert.equal(rows.find(row => row.id === 'A').daysToNext, 3);
});

test('filtros rápidos contam e filtram as mesmas linhas', () => {
    const { rows } = scenario();
    const counts = K.quickCounts(rows);
    assert.deepEqual({ ...counts }, { todos: 5, em_dia: 1, atraso: 1, vence7: 1, docs: 1, liquidados: 2, terminados: 1 });
    assert.equal(rows.filter(row => K.matchesQuick(row, 'vigor')).length, 2);
    assert.equal(rows.filter(row => K.matchesContractFilters(row, { ...K.EMPTY_CONTRACT_FILTERS, search: 'nifb' })).length, 1);
});

test('indicadores mostram o dinheiro em risco e os alertas pedem acção', () => {
    const { rows, installments } = scenario();
    const kpis = K.contractKpis(rows, installments, TODAY, 7);
    assert.equal(kpis.period.count, 5);
    assert.equal(kpis.inForce.count, 2);
    assert.equal(kpis.inForce.outstandingMinor, 20_000_000);
    assert.equal(kpis.overdue.overdueMinor, 5_250_000);
    assert.deepEqual(kpis.dueSoon, { installments: 1, amountMinor: 5_250_000 });
    assert.equal(kpis.paid.count, 2);
    assert.equal(kpis.closed.count, 1);
    const alerts = K.attentionItems(rows, 7);
    assert.deepEqual(alerts.map(item => `${item.row.id}:${item.kind}`), ['B:overdue', 'A:due_soon', 'A:missing_contract', 'A:id_expiring']);
});

test('relatório tem os totais pedidos e o Excel bate com o resumo', () => {
    const { rows } = scenario();
    const def = K.buildContractsReport(rows, { periodLabel: 'Outubro de 2026', filters: ['Estado: Todos'] });
    const summary = Object.fromEntries(def.summary);
    assert.equal(summary['N.º de contratos'], '5');
    assert.equal(summary['Valor contratado'], '500.000,00 Kz');
    assert.equal(summary['Saldo em dívida'], '200.000,00 Kz');
    assert.equal(summary['Valor em atraso'], '52.500,00 Kz');
    assert.equal(summary['Valor reembolsado'], '205.000,00 Kz');
    const foot = def.sections[0].foot[0];
    assert.deepEqual(foot.slice(7, 11), [500_000, 205_000, 200_000, 52_500]);
    const book = R.buildReportWorkbook(def, { name: 'Empresa Teste' }, 'Tester');
    const sheet = book.Sheets[book.SheetNames[0]];
    const values = Object.values(sheet).map(cell => cell?.v);
    assert.ok(values.includes('Relatório de Contratos Celebrados'));
    assert.ok(values.includes('200.000,00 Kz'));
    const pdf = R.renderReportPdf(def, { name: 'Empresa Teste' }, 'Tester', 'none');
    assert.match(pdf.fileName, /^relatorio-contratos-outubro-de-2026\.pdf$/);
    assert.ok(pdf.doc.getNumberOfPages() >= 1);
});
