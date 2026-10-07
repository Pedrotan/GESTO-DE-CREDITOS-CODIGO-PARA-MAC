// Página de Pagamentos (Parte K): uma linha por pagamento com totais iguais nos cartões, no PDF e no Excel;
// datas na hora de Angola; anulação sem apagar (recibo ANULADO, estorno e secção de anulados); protecção
// contra duplo clique; importação que assinala duplicados e contratos inexistentes; transferências pendentes
// fora do arrecadado até serem validadas. Tudo sobre SQLite real e com os serviços verdadeiros.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const root = path.resolve(import.meta.dirname, '..');
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
globalThis.window = globalThis;

async function loadModules() {
    const outdir = mkdtempSync(path.join(tmpdir(), 'pagamentos-'));
    const outfile = path.join(outdir, 'pagamentos.mjs');
    await build({
        stdin: {
            contents: `
                export { ServicoFinanceiro } from '@/servicos/ServicoFinanceiro';
                export { ServicoPagamentos } from '@/servicos/ServicoPagamentos';
                export * as A from '@/bibliotecas/pagamentos-analise';
                export * as R from '@/bibliotecas/relatorios-pagamentos';
                export * as Recibo from '@/bibliotecas/recibo-pagamento';
                export * as Fuso from '@/bibliotecas/fuso-angola';
                export * as Periodos from '@/bibliotecas/periodos';
            `,
            resolveDir: root, loader: 'ts',
        },
        bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent',
        define: { 'import.meta.env': JSON.stringify({ BASE_URL: '/', MODE: 'test', DEV: false, PROD: true }) },
        banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
        loader: { '.png': 'dataurl', '.jpg': 'dataurl', '.svg': 'dataurl', '.webp': 'dataurl' },
        plugins: [{
            name: 'test-db',
            setup(builder) {
                builder.onResolve({ filter: /^@\/bibliotecas\/bd$/ }, () => ({ path: 'test-db', namespace: 'test-db' }));
                builder.onLoad({ filter: /.*/, namespace: 'test-db' }, () => ({
                    contents: 'export const db = new Proxy({}, { get: (_, key) => globalThis.__testDb[key] });', loader: 'js'
                }));
                builder.onResolve({ filter: /^@\// }, async args => builder.resolve(
                    path.join(root, 'src', args.path.slice(2)), { kind: args.kind, resolveDir: root }));
            }
        }]
    });
    const module = await import(pathToFileURL(outfile).href);
    rmSync(outdir, { recursive: true, force: true });
    return module;
}

async function createDatabase() {
    const { RENDERER_SQL_ALLOWLIST } = await import('../electron/renderer-sql-allowlist.ts');
    const database = new DatabaseSync(':memory:');
    for (const sql of RENDERER_SQL_ALLOWLIST) if (sql.startsWith('CREATE TABLE IF NOT EXISTS')) database.exec(sql);
    for (const sql of RENDERER_SQL_ALLOWLIST) if (/^ALTER TABLE \w+ ADD COLUMN/.test(sql)) { try { database.exec(sql); } catch { /* já existe */ } }
    const adapter = readFileSync(path.join(root, 'src/bibliotecas/adaptador-sqlite.ts'), 'utf8');
    for (const [, table, column, , definition] of adapter.matchAll(/safeAddColumn\(\s*["'](\w+)["']\s*,\s*["'](\w+)["']\s*,\s*(["'])(.+?)\3\s*\)/g)) {
        try { database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`); } catch { /* tabela ausente ou coluna já existe */ }
    }
    // Índices únicos do arranque (chave de idempotência e número de recibo).
    for (const sql of RENDERER_SQL_ALLOWLIST) if (sql.startsWith('CREATE UNIQUE INDEX IF NOT EXISTS idx_payments')) database.exec(sql);
    const params = values => (values || []).map(value => value === undefined ? null : value);
    globalThis.__testDb = {
        all: async (sql, values) => database.prepare(sql).all(...params(values)),
        query: async (sql, values) => database.prepare(sql).all(...params(values)),
        get: async (sql, values) => database.prepare(sql).get(...params(values)),
        run: async (sql, values) => database.prepare(sql).run(...params(values)),
        transaction: async statements => {
            database.exec('BEGIN');
            try {
                for (const statement of statements) {
                    const result = database.prepare(statement.sql).run(...params(statement.params));
                    if (statement.expectChanges !== undefined && Number(result.changes) !== statement.expectChanges) {
                        throw new Error(`Conflito de concorrência: esperadas ${statement.expectChanges} alterações.`);
                    }
                }
                database.exec('COMMIT');
            } catch (error) { database.exec('ROLLBACK'); throw error; }
        }
    };
    const now = new Date().toISOString();
    database.prepare(`INSERT INTO clients (id, name, phone, createdAt, usuario_id) VALUES ('c1', 'Pedro de Morais Tango', '+244 923 000 000', ?, 'u1')`).run(now);
    database.prepare(`INSERT INTO users (id, name, email, password, role, createdAt) VALUES ('u1', 'Operador de Caixa', 'u1@example.invalid', 'x', 'cashier', ?)`).run(now);
    database.prepare(`INSERT INTO users (id, name, email, password, role, createdAt) VALUES ('u2', 'Director Financeiro', 'u2@example.invalid', 'x', 'super_admin', ?)`).run(now);
    database.prepare(`INSERT INTO shared_settings (key, value, updatedAt) VALUES ('accounting_config', '{"cashGuard":false}', ?)`).run(now);
    return database;
}

// Crédito de 100 000 Kz com 35 000 Kz de juros numa prestação que venceu a 01/10/2026.
const credit = {
    id: 'cr-outubro', clientId: 'c1', clientName: 'Pedro de Morais Tango', principalAmount: 100_000, interestRate: 35, lateInterestRate: 0,
    installments: 1, paidInstallments: 0, currentBalance: 100_000, accruedInterest: 35_000, lateInterest: 0, totalDue: 135_000,
    startDate: new Date('2026-09-01T12:00:00Z'), dueDate: new Date('2026-10-01T12:00:00Z'), createdAt: new Date('2026-09-01T12:00:00Z'),
    status: 'active', amortizationMethod: 'FLAT', daysOverdue: 0, creditNumber: 1, requestedBy: 'Operador de Caixa', usuario_id: 'u1'
};
const operator = { id: 'u1', name: 'Operador de Caixa', role: 'cashier' };
const director = { id: 'u2', name: 'Director Financeiro', role: 'super_admin' };
const settings = { name: 'DIGITAL NORTE - COMÉRCIO E PRESTAÇÃO DE SERVIÇOS, (SU), LDA', nif: '5003207439', currency: 'AOA' };

async function setup() {
    const M = await loadModules();
    const database = await createDatabase();
    await M.ServicoFinanceiro.addCredit(credit);
    database.prepare(`UPDATE credit_installments SET dueDate = '2026-10-01T11:00:00.000Z' WHERE creditId = ?`).run(credit.id);
    return { M, database };
}

async function pay(M, id, amount, dateKey, extra = {}) {
    const draft = { creditId: credit.id, valueDateKey: dateKey, amount, method: extra.method || 'cash', reference: extra.reference || '' };
    const payment = M.ServicoPagamentos.buildPayment(draft, { id, idempotencyKey: extra.key || `key-${id}`, clientName: credit.clientName, actor: operator });
    if (payment.status === 'pending') return M.ServicoPagamentos.registerPending(payment, extra.proof);
    const current = (await M.ServicoFinanceiro.getAllCredits()).find(item => item.id === credit.id);
    return M.ServicoFinanceiro.addPaymentAndUpdateCredit(payment, current.version ?? 0, 'c1');
}

async function rowsOf(M) {
    const payments = await M.ServicoPagamentos.listPayments();
    const credits = await M.ServicoFinanceiro.getAllCredits();
    const clients = [{ id: 'c1', name: credit.clientName, phone: '+244 923 000 000', usuario_id: 'u1' }];
    return M.A.buildPaymentRows({ payments, credits, clients, users: [operator, director] });
}

const october = M => {
    const selection = { ...M.Periodos.defaultPeriod(new Date('2026-10-06T10:00:00Z')), kind: 'month', year: 2026, month: 9 };
    return { selection, range: M.A.rangeKeys(M.Periodos.periodRange(selection)) };
};

const pdfText = doc => doc.output();

test('K1 · Outubro de 2026: 2 linhas com referências diferentes e 135 000 Kz iguais nos cartões, no PDF e no Excel', async () => {
    const { M, database } = await setup();
    try {
        await pay(M, 'PAG-A', 100_000, '2026-10-04');
        await pay(M, 'PAG-B', 35_000, '2026-10-05');
        const rows = await rowsOf(M);
        const { selection, range } = october(M);
        const inOctober = rows.filter(row => M.A.inKeyRange(row.valueDateKey, range));
        assert.equal(inOctober.length, 2, 'uma linha por pagamento');
        assert.notEqual(inOctober[0].receipt, inOctober[1].receipt, 'cada pagamento tem o seu recibo');
        assert.deepEqual(inOctober.map(row => row.receipt).sort(), ['RC 2026/000001', 'RC 2026/000002']);
        assert.ok(inOctober.every(row => row.contract === 'CR-2026-0001'), 'número curto do contrato em vez do UUID');

        const schedule = await M.ServicoPagamentos.loadSchedule();
        const kpis = M.A.computeKpis(rows, schedule, range, { today: '2026-10-06' });
        assert.deepEqual([kpis.collected, kpis.interest, kpis.principal, kpis.late, kpis.count], [135_000, 35_000, 100_000, 0, 2]);
        assert.equal(kpis.expected, 135_000);
        assert.equal(kpis.rate, 100);
        assert.equal(kpis.inconsistent.length, 0, 'capital + juros + mora = arrecadado');

        const input = {
            rows, schedule, range, previousRange: M.A.previousKeyRange(selection, range), lastYearRange: M.A.sameRangeLastYear(range),
            periodLabel: 'Outubro de 2026', filters: [], today: '2026-10-06', numbers: M.A.contractNumbers(await M.ServicoFinanceiro.getAllCredits()),
            phones: new Map(), managers: new Map(),
        };
        const def = M.R.buildReport('lista-mensal', input);
        const pdf = pdfText(M.R.renderReportPdf(def, settings, 'Director Financeiro', 'none').doc);
        for (const text of ['135 000,00 Kz', '35 000,00 Kz', '100 000,00 Kz', 'RC 2026/000001', 'RC 2026/000002', 'Gerado por Director Financeiro', 'gina 1 de']) {
            assert.ok(pdf.includes(text), `o PDF mostra «${text}»`);
        }
        const book = M.R.buildReportWorkbook(def, settings, 'Director Financeiro');
        const sheet = book.Sheets[book.SheetNames[0]];
        const cells = Object.entries(sheet).filter(([key]) => !key.startsWith('!')).map(([, cell]) => cell);
        const totalCell = Object.entries(sheet).find(([, cell]) => cell?.v === 'Total geral (confirmados)');
        assert.ok(totalCell, 'linha de total geral no Excel');
        const totalRow = Number(totalCell[0].replace(/^[A-Z]+/, ''));
        const value = column => sheet[`${column}${totalRow}`]?.v;
        assert.deepEqual([value('F'), value('G'), value('H'), value('I')], [100_000, 35_000, 0, 135_000]);
        assert.equal(sheet[`I${totalRow}`].z, '#,##0.00 "Kz"', 'colunas formatadas em Kz');
        assert.ok(cells.some(cell => cell.v === 'RC 2026/000002'));
        console.log(`    K1: tabela 2 linhas (${inOctober.map(row => row.receipt).join(', ')}) · cartões ${kpis.collected} = juros ${kpis.interest} + capital ${kpis.principal} · PDF e Excel com 135 000,00 Kz`);
    } finally { database.close(); }
});

test('K2 · pagamento às 23h30 de 31/10 (hora de Angola) fica em Outubro e a data-valor sem hora não mostra 01:00', async () => {
    const M = await loadModules();
    const late = '2026-10-31T22:30:00.000Z';
    assert.equal(M.Fuso.luandaDateKey(late), '2026-10-31');
    assert.equal(M.Fuso.formatLuandaDateTime(late), '31/10/2026 23:30');
    const row = { valueDateKey: M.Fuso.luandaDateKey(late) };
    const { range } = october(M);
    const november = M.A.rangeKeys(M.Periodos.periodRange({ ...october(M).selection, month: 10 }));
    assert.equal(M.A.inKeyRange(row.valueDateKey, range), true, 'aparece em Outubro');
    assert.equal(M.A.inKeyRange(row.valueDateKey, november), false, 'não aparece em Novembro');
    // Antes, a data "2026-10-04" era gravada como 00:00 UTC e aparecia como 01:00 de Luanda.
    const stored = M.Fuso.valueDateToIso('2026-10-04', new Date('2026-10-06T09:00:00Z'));
    assert.equal(M.Fuso.formatLuandaDate(stored), '04/10/2026');
    assert.equal(M.Fuso.formatLuandaDateTime(stored), '04/10/2026 12:00');
    console.log(`    K2: ${late} → ${M.Fuso.formatLuandaDateTime(late)} (Luanda) → Outubro ✔, Novembro ✘`);
});

test('K3 · anular: cartões actualizam, recibo ANULADO, estorno na Contabilidade e secção de anulados no relatório', async () => {
    const { M, database } = await setup();
    try {
        await pay(M, 'PAG-A', 100_000, '2026-10-04');
        await pay(M, 'PAG-B', 35_000, '2026-10-05');
        const { selection, range } = october(M);
        const schedule = await M.ServicoPagamentos.loadSchedule();
        const before = M.A.computeKpis(await rowsOf(M), schedule, range, { today: '2026-10-06' });
        assert.equal(before.collected, 135_000);
        // Quem registou não pode anular (segregação de funções).
        await assert.rejects(M.ServicoPagamentos.cancel('PAG-B', 'Valor registado em duplicado', { ...operator, role: 'super_admin' }), /Segregação|Quatro Olhos/);
        await assert.rejects(M.ServicoPagamentos.cancel('PAG-B', 'curto', director), /justificação/);
        const result = await M.ServicoPagamentos.cancel('PAG-B', 'Valor registado em duplicado', director);
        assert.equal(result.status, 'cancelled');
        const rows = await rowsOf(M);
        const after = M.A.computeKpis(rows, await M.ServicoPagamentos.loadSchedule(), range, { today: '2026-10-06' });
        assert.deepEqual([after.collected, after.count, after.cancelledCount], [100_000, 1, 1], 'cartões actualizados');
        const cancelled = rows.find(row => row.id === 'PAG-B');
        assert.equal(cancelled.status, 'cancelled');
        assert.equal(cancelled.receipt, 'RC 2026/000002', 'o recibo mantém o número');
        assert.equal(database.prepare(`SELECT COUNT(*) AS n FROM payments`).get().n, 2, 'nada foi apagado');
        const reversal = database.prepare(`SELECT type, amountTotal FROM accounting_entries WHERE paymentId = 'PAG-B' AND type = 'reversal'`).get();
        assert.ok(reversal, 'estorno contabilístico gerado');
        assert.equal(reversal.amountTotal, 35_000);
        const receipt = await M.Recibo.generateReceiptA4(cancelled, { name: credit.clientName }, settings, 'Director Financeiro', 'datauri');
        const receiptPdf = Buffer.from(receipt.dataUrl.split(',')[1], 'base64').toString('latin1');
        assert.ok(receiptPdf.includes('ANULADO'), 'recibo marcado ANULADO');
        const input = { rows, schedule, range, previousRange: M.A.previousKeyRange(selection, range), lastYearRange: M.A.sameRangeLastYear(range),
            periodLabel: 'Outubro de 2026', filters: [], today: '2026-10-06', numbers: new Map(), phones: new Map(), managers: new Map() };
        const def = M.R.buildReport('lista-mensal', input);
        const section = def.sections.find(item => item.heading.startsWith('Pagamentos anulados'));
        assert.equal(section.rows.length, 1);
        assert.equal(section.rows[0][0], 'RC 2026/000002');
        assert.equal(section.rows[0][5], 'Valor registado em duplicado');
        assert.equal(def.sections[0].rows.length, 1, 'o anulado sai da lista principal');
        console.log(`    K3: arrecadado 135 000 → ${after.collected} · recibo ${cancelled.receipt} ANULADO · estorno ${reversal.amountTotal} Kz · secção de anulados com 1 linha`);
    } finally { database.close(); }
});

test('K4 · duplo clique no mesmo pagamento: só um é gravado', async () => {
    const { M, database } = await setup();
    try {
        const results = await Promise.allSettled([
            pay(M, 'PAG-X', 20_000, '2026-10-05', { key: 'wizard-abc-123' }),
            pay(M, 'PAG-X', 20_000, '2026-10-05', { key: 'wizard-abc-123' }),
        ]);
        assert.equal(results.filter(item => item.status === 'fulfilled').length, 1);
        assert.equal(database.prepare(`SELECT COUNT(*) AS n FROM payments`).get().n, 1);
        assert.equal(database.prepare(`SELECT COUNT(*) AS n FROM accounting_entries WHERE type = 'payment'`).get().n, 1);
        // Transferência (pendente) com a mesma chave: o segundo pedido é reconhecido como repetido.
        const proof = { fileName: 'comprovativo.png', mimeType: 'image/png', dataUrl: 'data:image/png;base64,iVBORw0KGgo=' };
        const first = await pay(M, 'PAG-T', 5_000, '2026-10-05', { key: 'wizard-trf-1', method: 'transfer', proof });
        const second = await pay(M, 'PAG-T2', 5_000, '2026-10-05', { key: 'wizard-trf-1', method: 'transfer', proof });
        assert.deepEqual([first.duplicate, second.duplicate], [false, true]);
        assert.equal(database.prepare(`SELECT COUNT(*) AS n FROM payments`).get().n, 2);
        console.log('    K4: 2 cliques → 1 pagamento e 1 lançamento; transferência repetida reconhecida pela chave de idempotência');
    } finally { database.close(); }
});

test('K5 · importação: linha duplicada e contrato inexistente são assinalados e não entram', async () => {
    const { M, database } = await setup();
    try {
        await pay(M, 'PAG-A', 10_000, '2026-10-02');
        const rows = await rowsOf(M);
        const credits = await M.ServicoFinanceiro.getAllCredits();
        const preview = M.A.validateImportRows([
            { 'Contrato': 'CR-2026-0001', 'Data-valor (AAAA-MM-DD)': '2026-10-03', 'Valor (Kz)': 15000, 'Método': 'Numerário', 'Referência': '' },
            { 'Contrato': 'CR-2026-0001', 'Data-valor (AAAA-MM-DD)': '2026-10-03', 'Valor (Kz)': 15000, 'Método': 'Numerário', 'Referência': '' },
            { 'Contrato': 'CR-2099-9999', 'Data-valor (AAAA-MM-DD)': '2026-10-03', 'Valor (Kz)': 5000, 'Método': 'Numerário', 'Referência': '' },
            { 'Contrato': 'CR-2026-0001', 'Data-valor (AAAA-MM-DD)': '02/10/2026', 'Valor (Kz)': '10.000,00', 'Método': 'numerario', 'Referência': '' },
            { 'Contrato': 'CR-2026-0001', 'Data-valor (AAAA-MM-DD)': '2026-10-04', 'Valor (Kz)': 7000, 'Método': 'Transferência', 'Referência': 'TRF-1' },
        ], { credits, numbers: M.A.contractNumbers(credits), existing: rows, closedMonths: new Set(), today: '2026-10-06' });
        assert.deepEqual(preview.map(row => row.status), ['ok', 'warning', 'error', 'warning', 'ok']);
        assert.match(preview[1].messages.join(' '), /duplicada no ficheiro/);
        assert.match(preview[2].messages.join(' '), /Contrato inexistente/);
        assert.match(preview[3].messages.join(' '), /Possível duplicado/);
        assert.match(preview[4].messages.join(' '), /pendente de validação/);
        // Só as linhas válidas (verdes) entram, num lote.
        const batch = await M.ServicoPagamentos.createBatch('pagamentos-outubro.xlsx', director);
        let imported = 0;
        for (const row of preview.filter(item => item.status === 'ok')) {
            const draft = { creditId: row.creditId, valueDateKey: row.dateKey, amount: row.amount, method: row.method, reference: row.reference };
            const payment = M.ServicoPagamentos.buildPayment(draft, { id: `IMP-${row.line}`, idempotencyKey: `${batch.id}:${row.line}`, clientName: row.clientName, actor: director, batchId: batch.id });
            if (payment.status === 'pending') await M.ServicoPagamentos.registerPending(payment);
            else {
                const current = (await M.ServicoFinanceiro.getAllCredits()).find(item => item.id === row.creditId);
                await M.ServicoFinanceiro.addPaymentAndUpdateCredit(payment, current.version, 'c1');
            }
            imported++;
        }
        await M.ServicoPagamentos.finishBatch(batch.id, imported, 2_200_000);
        assert.equal(imported, 2);
        assert.equal(database.prepare(`SELECT COUNT(*) AS n FROM payments WHERE batchId = ?`).get(batch.id).n, 2);
        assert.equal(database.prepare(`SELECT COUNT(*) AS n FROM payments`).get().n, 3, 'duplicados e contrato inexistente ficaram de fora');
        // O lote inteiro pode ser anulado, com motivo.
        assert.equal(await M.ServicoPagamentos.cancelBatch(batch.id, 'Ficheiro importado por engano', { ...director, id: 'u3' }), 2);
        assert.equal(database.prepare(`SELECT COUNT(*) AS n FROM payments WHERE batchId = ? AND status = 'cancelled'`).get(batch.id).n, 2);
        assert.equal(database.prepare(`SELECT status FROM payment_import_batches WHERE id = ?`).get(batch.id).status, 'cancelled');
        console.log(`    K5: ${preview.map(row => `L${row.line}=${row.status}`).join(' ')} · importadas 2 linhas no lote ${batch.number} · lote anulado`);
    } finally { database.close(); }
});

test('K6 · transferência pendente não conta como arrecadado até ser validada', async () => {
    const { M, database } = await setup();
    try {
        await pay(M, 'PAG-A', 50_000, '2026-10-04');
        const proof = { fileName: 'talao.pdf', mimeType: 'application/pdf', dataUrl: 'data:application/pdf;base64,JVBERi0xLjQ=' };
        await pay(M, 'PAG-T', 30_000, '2026-10-05', { method: 'transfer', proof, reference: 'BAI-778899' });
        const { range } = october(M);
        const schedule = await M.ServicoPagamentos.loadSchedule();
        const pending = M.A.computeKpis(await rowsOf(M), schedule, range, { today: '2026-10-06' });
        assert.deepEqual([pending.collected, pending.pendingAmount, pending.pendingCount], [50_000, 30_000, 1]);
        assert.equal((await M.ServicoFinanceiro.getAllCredits())[0].currentBalance, 85_000, 'o saldo do contrato ainda não mudou');
        assert.equal((await M.ServicoPagamentos.getProof('PAG-T')).fileName, 'talao.pdf');
        await assert.rejects(M.ServicoPagamentos.validatePending('PAG-T', { id: 'u9', name: 'Sem permissão', role: 'collection_officer' }), /permissão/);
        await M.ServicoPagamentos.validatePending('PAG-T', director);
        const rows = await rowsOf(M);
        const validated = M.A.computeKpis(rows, schedule, range, { today: '2026-10-06' });
        assert.deepEqual([validated.collected, validated.pendingCount], [80_000, 0]);
        const row = rows.find(item => item.id === 'PAG-T');
        assert.equal(row.status, 'confirmed');
        assert.equal(row.receipt, 'RC 2026/000002', 'o recibo só é emitido na validação');
        assert.equal(row.payment.validatedBy, 'Director Financeiro');
        console.log(`    K6: antes da validação arrecadado ${pending.collected} (pendente ${pending.pendingAmount}) → depois ${validated.collected}, recibo ${row.receipt}`);
    } finally { database.close(); }
});

test('indicadores: variação, taxa de cobrança por cor, em falta e período anterior', async () => {
    const M = await loadModules();
    assert.equal(M.A.variation(135_000, 100_000), 35);
    assert.equal(M.A.variation(0, 0), 0);
    assert.equal(M.A.collectionRateTone(96), 'good');
    assert.equal(M.A.collectionRateTone(85), 'warning');
    assert.equal(M.A.collectionRateTone(50), 'bad');
    const { selection, range } = october(M);
    assert.deepEqual(M.A.previousKeyRange(selection, range), { start: '2026-09-01', end: '2026-09-30' });
    assert.deepEqual(M.A.previousKeyRange({ ...selection, kind: 'quarter', quarter: 4 }, { start: '2026-10-01', end: '2026-12-31' }), { start: '2026-07-01', end: '2026-09-30' });
    assert.deepEqual(M.A.sameRangeLastYear(range), { start: '2025-10-01', end: '2025-10-31' });
    assert.equal(M.Periodos.periodRange({ ...selection, kind: 'quarter', quarter: 4 }).label, '4.º trimestre de 2026');
});
