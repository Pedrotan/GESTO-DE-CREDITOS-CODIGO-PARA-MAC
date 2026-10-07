// Página de Créditos (Parte L): crédito liquidado visível no mês, valores iguais em Créditos, Pagamentos e
// Contabilidade, Carteira vs Produção, atraso automático com mora, novo crédito só depois de liquidado, operações
// bloqueadas sem ligação ao servidor e liquidação antecipada parcial (reduzir prestação e reduzir prazo).
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const root = path.resolve(import.meta.dirname, '..');
const memory = new Map();
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
globalThis.sessionStorage = { getItem: key => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, String(value)), removeItem: key => memory.delete(key) };
globalThis.window = globalThis;

let modules;
async function loadModules() {
    if (modules) return modules;
    const outdir = mkdtempSync(path.join(tmpdir(), 'carteira-'));
    const outfile = path.join(outdir, 'carteira.mjs');
    await build({
        stdin: {
            contents: `
                export { ServicoFinanceiro } from '@/servicos/ServicoFinanceiro';
                export { ServicoCarteira } from '@/servicos/ServicoCarteira';
                export { ServicoContabilidadeGeral } from '@/servicos/ServicoContabilidadeGeral';
                export { LEDGER_PROTECTION_SQL } from '@/bibliotecas/esquema-ledger';
                export { auditSqlHash } from '@/bibliotecas/cadeia-auditoria';
                export { setFinancialConnectionProbe } from '@/bibliotecas/ligacao-financeira';
                export { buildInstallmentSchedule } from '@/bibliotecas/cronograma-prestacoes';
                export * as C from '@/bibliotecas/carteira-credito';
                export * as L from '@/bibliotecas/liquidacao-antecipada';
                export * as P from '@/bibliotecas/pagamentos-analise';
                export * as R from '@/bibliotecas/regras-credito';
                export * as F from '@/bibliotecas/fuso-angola';
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
                builder.onLoad({ filter: /.*/, namespace: 'test-db' }, () => ({ contents: 'export const db = new Proxy({}, { get: (_, key) => globalThis.__testDb[key] });', loader: 'js' }));
                builder.onResolve({ filter: /^@\// }, async args => builder.resolve(path.join(root, 'src', args.path.slice(2)), { kind: args.kind, resolveDir: root }));
            }
        }]
    });
    modules = await import(pathToFileURL(outfile).href);
    rmSync(outdir, { recursive: true, force: true });
    return modules;
}

const ADMIN = { id: 'u-admin', name: 'Bruno Administrador', role: 'admin' };

async function createDatabase(M) {
    const { RENDERER_SQL_ALLOWLIST } = await import('../electron/renderer-sql-allowlist.ts');
    const database = new DatabaseSync(':memory:');
    database.function('tango_audit_hash', { varargs: true }, (...args) => M.auditSqlHash(...args));
    for (const sql of RENDERER_SQL_ALLOWLIST) if (sql.startsWith('CREATE TABLE IF NOT EXISTS')) database.exec(sql);
    for (const sql of RENDERER_SQL_ALLOWLIST) if (/^ALTER TABLE \w+ ADD COLUMN/.test(sql)) { try { database.exec(sql); } catch { /* já existe */ } }
    const adapter = readFileSync(path.join(root, 'src/bibliotecas/adaptador-sqlite.ts'), 'utf8');
    for (const [, table, column, , definition] of adapter.matchAll(/safeAddColumn\(\s*["'](\w+)["']\s*,\s*["'](\w+)["']\s*,\s*(["'])(.+?)\3\s*\)/g)) {
        try { database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`); } catch { /* tabela ausente ou coluna já existe */ }
    }
    for (const sql of M.LEDGER_PROTECTION_SQL) { try { database.exec(sql); } catch { /* depende de tabelas não usadas no teste */ } }
    for (const sql of RENDERER_SQL_ALLOWLIST) if (sql.startsWith('CREATE UNIQUE INDEX IF NOT EXISTS idx_payments')) { try { database.exec(sql); } catch { /* opcional */ } }
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
                    if (statement.expectChanges !== undefined && Number(result.changes) !== statement.expectChanges) throw new Error('Conflito de concorrência.');
                }
                database.exec('COMMIT');
            } catch (error) { database.exec('ROLLBACK'); throw error; }
        }
    };
    const now = new Date().toISOString();
    database.prepare(`INSERT INTO users (id, name, email, password, role, createdAt) VALUES (?, ?, 'a@example.invalid', 'x', 'admin', ?)`).run(ADMIN.id, ADMIN.name, now);
    database.prepare(`INSERT INTO users (id, name, email, password, role, createdAt) VALUES ('u-dir', 'Diogo Diretor', 'd@example.invalid', 'x', 'credit_director', ?)`).run(now);
    for (const [id, name] of [['c1', 'Pedro de Morais Tango'], ['c2', 'Maria Antónia'], ['c3', 'João Baptista'], ['c4', 'Ana Domingos'], ['c5', 'Rui Fernandes']]) {
        database.prepare(`INSERT INTO clients (id, name, nif, riskLevel, status, createdAt) VALUES (?, ?, ?, 'low', 'active', ?)`).run(id, name, `00${id}LA000`, now);
    }
    database.prepare(`INSERT INTO shared_settings (key, value, updatedAt) VALUES ('accounting_config', '{"cashGuard":false}', ?)`).run(now);
    return database;
}

const credit = (input) => {
    const start = new Date(input.start);
    const months = input.installments || 1;
    const due = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + months, start.getUTCDate()));
    return {
        id: input.id, clientId: input.clientId, clientName: input.clientName || 'Cliente', principalAmount: input.amount, currentBalance: input.amount,
        interestRate: input.rate ?? 35, lateInterestRate: input.lateRate ?? 1, installments: months, paidInstallments: 0, startDate: start, dueDate: due,
        status: 'active', daysOverdue: 0, accruedInterest: input.interest ?? input.amount * 0.35, lateInterest: 0, totalDue: input.amount * 1.35,
        createdAt: start, creditNumber: 1, requestedBy: 'Teste', requestedAt: start, targetMonthId: input.month, amortizationMethod: input.method || 'FLAT', usuario_id: ADMIN.id,
    };
};
const pay = async (M, creditId, amount, dateIso = new Date().toISOString()) => {
    const row = (await M.ServicoFinanceiro.getAllCredits()).find(item => item.id === creditId);
    const id = crypto.randomUUID();
    return M.ServicoFinanceiro.addPaymentAndUpdateCredit({ id, idempotencyKey: id, creditId, clientName: row.clientName, amount, allocatedToPrincipal: 0, allocatedToInterest: 0, allocatedToLateInterest: 0,
        method: 'transfer', paymentDate: new Date(dateIso), registeredAt: dateIso, processedBy: 'Teste', status: 'confirmed' }, Number(row.version ?? 0), row.clientId);
};
const portfolio = async (M, now = new Date()) => {
    const context = await M.ServicoCarteira.loadContext();
    const credits = await M.ServicoFinanceiro.getAllCredits();
    const payments = await M.ServicoFinanceiro.getAllPayments();
    const rows = M.C.buildPortfolio(credits, { ...context, payments, now });
    return { rows, credits, payments, context };
};
const monthRange = (M) => {
    const month = M.F.luandaTodayKey().slice(0, 7);
    const [year, m] = month.split('-').map(Number);
    return { month, range: { start: `${month}-01`, end: `${month}-${String(new Date(Date.UTC(year, m, 0)).getUTCDate()).padStart(2, '0')}` } };
};
const kz = minor => (minor / 100).toLocaleString('pt-AO', { minimumFractionDigits: 2 });

test('L1 · O crédito CR-bc61b816 aparece no mês com estado "Liquidado" (e o separador Todos inclui liquidados)', async () => {
    const M = await loadModules();
    const database = await createDatabase(M);
    try {
        const { month, range } = monthRange(M);
        await M.ServicoFinanceiro.addCredit(credit({ id: 'CR-bc61b816-4aa6-4eb7-936a-1cd129f4e588', clientId: 'c1', clientName: 'Pedro de Morais Tango', amount: 100_000, interest: 35_000, start: `${month}-01T12:00:00Z`, month }));
        await pay(M, 'CR-bc61b816-4aa6-4eb7-936a-1cd129f4e588', 135_000);
        const { rows } = await portfolio(M);
        const row = rows.find(item => item.id.startsWith('CR-bc61b816'));
        assert.ok(row, 'o crédito está na carteira');
        assert.equal(row.stage, 'liquidado');
        assert.equal(row.competenceMonth, month, 'aparece na folha do mês');
        const tab = M.C.STAGE_TABS.find(item => item.id === 'todos');
        assert.equal(tab.stages, null, '"Todos" não exclui nenhum estado');
        const production = rows.filter(item => item.competenceMonth === month);
        assert.ok(production.some(item => item.id === row.id));
        assert.ok(M.C.periodFigures({ rows, credits: [row.credit], payments: [], entries: [], range }).paidOffCount >= 1, 'conta nos liquidados do período');
        console.log(`    L1: ${row.reference} (${row.id.slice(0, 11)}) · mês ${month} · estado ${M.C.STAGES[row.stage].label} · progresso ${row.paidCount}/${row.totalCount}`);
    } finally { database.close(); }
});

test('L2 · Os valores do mês são iguais em Créditos, Pagamentos e Contabilidade', async () => {
    const M = await loadModules();
    const database = await createDatabase(M);
    try {
        const { month, range } = monthRange(M);
        await M.ServicoFinanceiro.addCredit(credit({ id: 'CR-bc61b816-4aa6-4eb7-936a-1cd129f4e588', clientId: 'c1', clientName: 'Pedro de Morais Tango', amount: 100_000, interest: 35_000, start: `${month}-01T12:00:00Z`, month }));
        await pay(M, 'CR-bc61b816-4aa6-4eb7-936a-1cd129f4e588', 135_000);
        const { rows, credits, payments } = await portfolio(M);
        const entries = (await database.prepare('SELECT * FROM accounting_entries').all()).map(entry => ({ ...entry, timestamp: new Date(entry.timestamp) }));
        // Créditos (biblioteca partilhada).
        const figures = M.C.periodFigures({ rows, credits, payments, entries, range });
        // Pagamentos (as funções da própria página de Pagamentos).
        const paymentRows = M.P.buildPaymentRows({ payments, credits, clients: [], users: [] }).filter(item => item.status === 'confirmed' && M.P.inKeyRange(item.valueDateKey, range));
        const pagamentos = M.P.sumRows(paymentRows);
        // Contabilidade (razão: lançamentos de desembolso e de recebimento do mês).
        const snapshot = await M.ServicoContabilidadeGeral.loadSnapshot();
        const ledgerMonth = snapshot.entries.filter(entry => M.F.luandaDateKey(entry.timestamp).startsWith(month));
        const ledgerDisbursed = ledgerMonth.filter(entry => entry.type === 'disbursement').reduce((sum, entry) => sum + Number(entry.amountTotalMinor), 0);
        const ledgerReceived = ledgerMonth.filter(entry => entry.type === 'payment').reduce((sum, entry) => sum + Number(entry.amountTotalMinor), 0);
        const ledgerInterest = ledgerMonth.filter(entry => entry.type === 'payment').reduce((sum, entry) => sum + Number(entry.amountInterestMinor) + Number(entry.amountLateInterestMinor), 0);
        const outstanding = rows.reduce((sum, row) => sum + row.outstandingMinor, 0);

        assert.equal(figures.disbursedMinor, 10_000_000, 'Créditos: desembolsado 100 000 Kz');
        assert.equal(ledgerDisbursed, 10_000_000, 'Contabilidade: desembolsado 100 000 Kz');
        assert.equal(Math.round(figures.received.total * 100), 13_500_000, 'Créditos: recebido 135 000 Kz');
        assert.equal(Math.round(pagamentos.total * 100), 13_500_000, 'Pagamentos: recebido 135 000 Kz');
        assert.equal(ledgerReceived, 13_500_000, 'Contabilidade: recebido 135 000 Kz');
        assert.equal(figures.receivedInterestMinor, 3_500_000, 'Créditos: juros 35 000 Kz');
        assert.equal(Math.round((pagamentos.interest + pagamentos.late) * 100), 3_500_000, 'Pagamentos: juros 35 000 Kz');
        assert.equal(ledgerInterest, 3_500_000, 'Contabilidade: juros 35 000 Kz');
        assert.equal(outstanding, 0, 'capital em dívida 0 Kz');
        assert.equal(Number(snapshot.credits.find(item => item.id.startsWith('CR-bc61b816')).currentBalanceMinor), 0, 'Contabilidade: saldo do crédito 0 Kz');
        console.log(`    L2: desembolsado ${kz(figures.disbursedMinor)} = ${kz(ledgerDisbursed)} · recebido ${kz(Math.round(figures.received.total * 100))} = ${kz(Math.round(pagamentos.total * 100))} = ${kz(ledgerReceived)} · juros ${kz(figures.receivedInterestMinor)} = ${kz(ledgerInterest)} · em dívida ${kz(outstanding)}`);
    } finally { database.close(); }
});

test('L3 · Um crédito de março ainda ativo aparece na Carteira mas não na Produção do mês atual', async () => {
    const M = await loadModules();
    const database = await createDatabase(M);
    try {
        const { month, range } = monthRange(M);
        const [year, m] = month.split('-').map(Number);
        const march = `${m > 3 ? year : year - 1}-03`;
        await M.ServicoFinanceiro.addCredit(credit({ id: 'CR-MARCO', clientId: 'c2', clientName: 'Maria Antónia', amount: 600_000, interest: 120_000, installments: 12, start: `${march}-10T12:00:00Z`, month: march }));
        const { rows, credits, payments } = await portfolio(M);
        const row = rows.find(item => item.id === 'CR-MARCO');
        assert.ok(M.C.IN_PORTFOLIO.includes(row.stage), `está em curso (${row.stage})`);
        const carteira = rows.filter(item => M.C.IN_PORTFOLIO.includes(item.stage));
        const producao = rows.filter(item => item.competenceMonth === month);
        assert.ok(carteira.some(item => item.id === 'CR-MARCO'), 'aparece na vista Carteira');
        assert.ok(!producao.some(item => item.id === 'CR-MARCO'), 'não aparece na Produção do mês atual');
        assert.equal(M.C.periodFigures({ rows, credits, payments, entries: [], range }).grantedCount, 0, 'não conta como concedido no mês');
        console.log(`    L3: CR-MARCO (concedido em ${march}) · Carteira ✔ (${M.C.STAGES[row.stage].label}, ${kz(row.outstandingMinor)} em dívida) · Produção de ${month} ✘`);
    } finally { database.close(); }
});

test('L4 · Uma prestação vencida ontem e não paga põe o crédito "Em atraso" com 1 dia e a mora correta', async () => {
    const M = await loadModules();
    const database = await createDatabase(M);
    try {
        const today = M.F.luandaTodayKey();
        const [y, m, d] = today.split('-').map(Number);
        const yesterday = new Date(Date.UTC(y, m - 1, d - 1));
        const start = new Date(Date.UTC(yesterday.getUTCFullYear(), yesterday.getUTCMonth() - 1, yesterday.getUTCDate(), 12));
        await M.ServicoFinanceiro.addCredit(credit({ id: 'CR-ATRASO', clientId: 'c3', clientName: 'João Baptista', amount: 100_000, interest: 10_000, start: start.toISOString(), month: today.slice(0, 7), lateRate: 1 }));
        const installment = database.prepare(`SELECT dueDate FROM credit_installments WHERE creditId = 'CR-ATRASO'`).get();
        assert.equal(M.F.luandaDateKey(installment.dueDate), M.F.luandaDateKey(yesterday), 'a prestação venceu ontem');
        const refreshed = await M.ServicoCarteira.refreshDelinquency();
        assert.ok(refreshed.changed >= 1);
        const stored = database.prepare(`SELECT status, daysOverdue FROM credits WHERE id = 'CR-ATRASO'`).get();
        assert.deepEqual({ status: stored.status, days: stored.daysOverdue }, { status: 'overdue', days: 1 });
        const { rows } = await portfolio(M);
        const row = rows.find(item => item.id === 'CR-ATRASO');
        assert.equal(row.stage, 'em_atraso');
        assert.equal(row.daysOverdue, 1);
        const summary = await M.ServicoFinanceiro.getLateInterestSummary('CR-ATRASO');
        const late = summary.installments[0];
        assert.equal(row.moraMinor, summary.owedMinor, 'a mora é a mesma do cálculo existente');
        assert.equal(row.moraMinor, late.daysLate * 11_000_000 * 0.01, 'prestação de 110 000 Kz × 1%/dia × dias de atraso');
        assert.ok(database.prepare(`SELECT COUNT(*) AS n FROM audit_logs WHERE details LIKE '%passou a Em atraso%'`).get().n === 1, 'a mudança fica na auditoria');
        console.log(`    L4: vencida a ${M.F.luandaDateKey(yesterday).split('-').reverse().join('/')} · estado ${M.C.STAGES[row.stage].label} · ${row.daysOverdue} dia de atraso · mora ${kz(row.moraMinor)} (110 000,00 × 1%/dia)`);
    } finally { database.close(); }
});

test('L5 · Cliente com crédito ativo: novo crédito bloqueado; depois de liquidado: "Solicitar novo crédito" disponível', async () => {
    const M = await loadModules();
    const database = await createDatabase(M);
    try {
        const { month } = monthRange(M);
        await M.ServicoFinanceiro.addCredit(credit({ id: 'CR-PRIMEIRO', clientId: 'c4', clientName: 'Ana Domingos', amount: 50_000, interest: 5_000, start: `${month}-01T12:00:00Z`, month }), ADMIN);
        await assert.rejects(M.ServicoFinanceiro.addCredit(credit({ id: 'CR-SEGUNDO', clientId: 'c4', clientName: 'Ana Domingos', amount: 50_000, start: `${month}-02T12:00:00Z`, month }), ADMIN),
            /Disponível apenas depois de liquidar a totalidade do crédito anterior/);
        assert.equal(database.prepare(`SELECT COUNT(*) AS n FROM credits WHERE clientId = 'c4'`).get().n, 1, 'o segundo crédito não foi gravado');
        await pay(M, 'CR-PRIMEIRO', 55_000);
        const credits = await M.ServicoFinanceiro.getAllCredits();
        const standing = M.R.clientCreditStanding('c4', credits);
        assert.equal(M.R.newCreditBlockReason(standing, String), null, '"Solicitar novo crédito" disponível');
        assert.equal(standing.lastPaidPrincipal, 50_000, 'o novo valor tem de ser igual ou superior a 50 000 Kz');
        const second = await M.ServicoFinanceiro.addCredit({ ...credit({ id: 'CR-SEGUNDO', clientId: 'c4', clientName: 'Ana Domingos', amount: 60_000, start: `${month}-03T12:00:00Z`, month }), status: 'pending_approval' }, ADMIN);
        assert.equal(second.status, 'pending_approval', 'o pedido segue o fluxo normal de aprovação');
        console.log(`    L5: com crédito ativo → bloqueado · liquidado → disponível (mínimo ${kz(standing.lastPaidPrincipal * 100)}) · novo pedido → ${second.status}`);
    } finally { database.close(); }
});

test('L6 · Sem ligação ao servidor, registar um crédito é bloqueado e nada fica gravado', async () => {
    const M = await loadModules();
    const database = await createDatabase(M);
    try {
        const { month } = monthRange(M);
        const count = table => database.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
        const before = { credits: count('credits'), installments: count('credit_installments'), entries: count('accounting_entries'), audit: count('audit_logs') };
        M.setFinancialConnectionProbe(async () => ({ ok: false, message: 'sem Internet' }));
        await assert.rejects(M.ServicoFinanceiro.addCredit(credit({ id: 'CR-OFFLINE', clientId: 'c5', clientName: 'Rui Fernandes', amount: 80_000, start: `${month}-01T12:00:00Z`, month }), ADMIN),
            /Sem ligação ao servidor: não é possível registar o crédito agora\. Nada foi gravado neste dispositivo/);
        const after = { credits: count('credits'), installments: count('credit_installments'), entries: count('accounting_entries'), audit: count('audit_logs') };
        assert.deepEqual(after, before, 'nenhuma linha gravada');
        M.setFinancialConnectionProbe(async () => ({ ok: true }));
        const saved = await M.ServicoFinanceiro.addCredit(credit({ id: 'CR-OFFLINE', clientId: 'c5', clientName: 'Rui Fernandes', amount: 80_000, start: `${month}-01T12:00:00Z`, month }), ADMIN);
        assert.ok(saved.id, 'com ligação, a operação é concluída');
        console.log(`    L6: sem ligação → "Sem ligação ao servidor: não é possível registar o crédito agora. Nada foi gravado…" · 0 linhas novas · com ligação → gravado`);
    } finally { M.setFinancialConnectionProbe(null); database.close(); }
});

test('L7 · Liquidação antecipada parcial recalcula o plano (reduzir prestação e reduzir prazo)', async () => {
    const M = await loadModules();
    // Simulação: crédito PRICE de 1 200 000 Kz a 24%/ano em 12 meses, com 3 prestações pagas.
    const schedule = M.buildInstallmentSchedule({ principalMinor: 120_000_000, installments: 12, startDate: '2026-01-15T12:00:00Z', method: 'PRICE', annualRatePercent: 24 });
    const rows = schedule.map(item => ({ id: `i${item.number}`, creditId: 'X', installmentNumber: item.number, dueDate: item.dueDate, principalMinor: item.principalMinor, interestMinor: item.interestMinor,
        lateInterestMinor: 0, paidPrincipalMinor: item.number <= 3 ? item.principalMinor : 0, paidInterestMinor: item.number <= 3 ? item.interestMinor : 0, paidLateInterestMinor: 0, status: item.number <= 3 ? 'paid' : 'pending' }));
    const asOf = new Date(new Date(rows[2].dueDate).getTime() + 10 * 86_400_000);
    const base = { method: 'PRICE', annualRatePercent: 24, startDate: '2026-01-15T12:00:00Z', installments: rows, moraMinor: 0, asOf, kind: 'partial', capitalMinor: 30_000_000 };
    const futureCapital = rows.slice(3).reduce((sum, item) => sum + item.principalMinor, 0);
    const lower = M.L.simulateEarlySettlement({ ...base, mode: 'reduce_installment' });
    const shorter = M.L.simulateEarlySettlement({ ...base, mode: 'reduce_term' });
    const sum = plan => plan.reduce((total, item) => total + item.principalMinor, 0);
    assert.equal(lower.newCount, 9, 'reduzir prestação: mantém as 9 prestações');
    assert.equal(sum(lower.newPlan), futureCapital - 30_000_000, 'o capital restante é repartido sem erros');
    assert.ok(lower.newPlan[1].totalMinor < rows[4].principalMinor + rows[4].interestMinor, 'a prestação baixa');
    assert.ok(shorter.newCount < 9, 'reduzir prazo: menos prestações');
    assert.equal(sum(shorter.newPlan), futureCapital - 30_000_000);
    assert.ok(Math.abs(shorter.newPlan[1].totalMinor - (rows[4].principalMinor + rows[4].interestMinor)) <= 100, 'a prestação mantém-se');
    assert.ok(shorter.interestSavedMinor > lower.interestSavedMinor, 'reduzir o prazo poupa mais juros');
    assert.equal(lower.payNowMinor, 30_000_000 + lower.accruedInterestMinor, 'paga hoje: capital antecipado + juros decorridos');
    assert.deepEqual(shorter.newPlan.map(item => item.dueDate), rows.slice(3, 3 + shorter.newCount).map(item => item.dueDate), 'mantém as datas de vencimento');

    // Execução real: plano gravado, pagamento registado com a imputação de sempre e capital restante correto.
    const database = await createDatabase(M);
    try {
        const today = M.F.luandaTodayKey();
        const [y, m, d] = today.split('-').map(Number);
        const start = new Date(Date.UTC(y, m - 1, d - 20, 12)).toISOString();
        await M.ServicoFinanceiro.addCredit(credit({ id: 'CR-ANTECIPADO', clientId: 'c1', clientName: 'Pedro de Morais Tango', amount: 1_200_000, installments: 12, rate: 24, method: 'PRICE', interest: 0, start, month: today.slice(0, 7) }));
        const { rows: book, credits, context } = await portfolio(M);
        const row = book.find(item => item.id === 'CR-ANTECIPADO');
        const target = credits.find(item => item.id === 'CR-ANTECIPADO');
        const simulation = M.L.simulateEarlySettlement({ method: 'PRICE', annualRatePercent: 24, startDate: start, installments: context.installments.filter(item => item.creditId === 'CR-ANTECIPADO'),
            moraMinor: row.moraMinor, kind: 'partial', capitalMinor: 30_000_000, mode: 'reduce_term' });
        const done = await M.ServicoCarteira.earlySettlement({ credit: target, simulation, reason: 'Cliente recebeu subsídio e antecipa parte do capital em dívida', actor: ADMIN });
        await pay(M, 'CR-ANTECIPADO', done.payNowMinor / 100);
        const after = database.prepare(`SELECT SUM(principalMinor - paidPrincipalMinor) AS capital, COUNT(*) AS n FROM credit_installments WHERE creditId = 'CR-ANTECIPADO' AND status <> 'cancelled' AND principalMinor > 0`).get();
        assert.equal(Number(after.capital), 120_000_000 - 30_000_000, 'capital em dívida depois do pagamento: 900 000 Kz');
        assert.equal(database.prepare(`SELECT COUNT(*) AS n FROM credit_restructurings WHERE creditId = 'CR-ANTECIPADO' AND kind = 'early_settlement'`).get().n, 1, 'o plano original fica no histórico');
        console.log(`    L7: 300 000 Kz antecipados · reduzir prestação: 9 × ${kz(lower.newPlan[1].totalMinor)} (antes ${kz(rows[4].principalMinor + rows[4].interestMinor)}) · reduzir prazo: ${shorter.newCount} × ${kz(shorter.newPlan[1].totalMinor)} · poupança ${kz(lower.interestSavedMinor)} vs ${kz(shorter.interestSavedMinor)} · execução real: pagos ${kz(done.payNowMinor)}, em dívida ${kz(Number(after.capital))} em ${simulation.newCount} prestações`);
    } finally { database.close(); }
});
