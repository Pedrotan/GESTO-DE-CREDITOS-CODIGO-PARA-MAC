// Cenário obrigatório da Parte D (contabilidade e auditoria) com SQLite real, o mesmo esquema, os
// mesmos triggers de protecção e o mesmo motor de auditoria da aplicação.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const root = path.resolve(import.meta.dirname, '..');

async function loadModules() {
    const outdir = mkdtempSync(path.join(tmpdir(), 'contabilidade-parte-d-'));
    const outfile = path.join(outdir, 'modulos.mjs');
    await build({
        stdin: {
            contents: `
                export { ServicoFinanceiro } from '@/servicos/ServicoFinanceiro';
                export { runAccountingAudit } from '@/bibliotecas/auditoria-contabil';
                export { LEDGER_PROTECTION_SQL } from '@/bibliotecas/esquema-ledger';
                export { auditSqlHash } from '@/bibliotecas/cadeia-auditoria';
                export { createLedgerSealer } from './electron/selos-contabilisticos';
            `,
            resolveDir: root, loader: 'ts',
        },
        bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent',
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

const modules = await loadModules();
const { ServicoFinanceiro, runAccountingAudit, LEDGER_PROTECTION_SQL, auditSqlHash, createLedgerSealer } = modules;

async function createDatabase() {
    const { RENDERER_SQL_ALLOWLIST } = await import('../electron/renderer-sql-allowlist.ts');
    const database = new DatabaseSync(':memory:');
    database.function('tango_audit_hash', { varargs: true }, (...values) => auditSqlHash(...values));
    for (const sql of RENDERER_SQL_ALLOWLIST) if (sql.startsWith('CREATE TABLE IF NOT EXISTS')) database.exec(sql);
    for (const sql of RENDERER_SQL_ALLOWLIST) {
        if (/^ALTER TABLE \w+ ADD COLUMN/.test(sql)) { try { database.exec(sql); } catch { /* coluna já existe */ } }
    }
    const adapter = readFileSync(path.join(root, 'src/bibliotecas/adaptador-sqlite.ts'), 'utf8');
    for (const [, table, column, , definition] of adapter.matchAll(/safeAddColumn\(\s*["'](\w+)["']\s*,\s*["'](\w+)["']\s*,\s*(["'])(.+?)\3\s*\)/g)) {
        try { database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`); } catch { /* tabela ausente ou coluna já existe */ }
    }
    // Triggers de imutabilidade, cadeia e períodos fechados: os mesmos que a aplicação cria no arranque.
    for (const sql of LEDGER_PROTECTION_SQL) database.exec(sql);
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
            } catch (error) {
                database.exec('ROLLBACK');
                throw error;
            }
        }
    };
    // Cliente que recebe em mão: o desembolso sai da Caixa, onde entra o capital do cenário.
    database.prepare(`INSERT INTO clients (id, name, receiveMethod, createdAt) VALUES ('c1', 'Cliente Parte D', 'cash', ?)`).run(new Date().toISOString());
    return database;
}

const actor = { actorId: 'admin-1', actorName: 'Administrador', actorRole: 'admin' };
const ALWAYS_OPEN = { workDays: [0, 1, 2, 3, 4, 5, 6], startHour: 0, endHour: 24, extraHolidays: [], useNationalHolidays: false };

const newCredit = (id, principalAmount, accruedInterest, extra = {}) => ({
    id, clientId: 'c1', clientName: 'Cliente Parte D', principalAmount, interestRate: 35, lateInterestRate: 0,
    installments: 1, paidInstallments: 0, currentBalance: principalAmount, accruedInterest, lateInterest: 0,
    totalDue: principalAmount + accruedInterest, startDate: new Date(), dueDate: new Date(Date.now() + 30 * 86400000),
    createdAt: new Date(), status: 'active', amortizationMethod: 'FLAT', daysOverdue: 0, creditNumber: 1, requestedBy: 'gestor-1',
    usuario_id: 'gestor-1', ...extra
});

const newPayment = (id, creditId, amount, extra = {}) => ({
    id, creditId, clientName: 'Cliente Parte D', amount, paymentDate: new Date(), method: 'cash', reference: id,
    allocatedToPrincipal: 0, allocatedToInterest: 0, allocatedToLateInterest: 0,
    processedBy: 'Operador', status: 'confirmed', usuario_id: 'operador-1', ...extra
});

function balances(database) {
    const rows = database.prepare('SELECT account, side, SUM(amountMinor) AS total FROM ledger_lines GROUP BY account, side').all();
    const result = {};
    for (const row of rows) result[row.account] = (result[row.account] || 0) + (row.side === 'debit' ? 1 : -1) * Number(row.total);
    return result;
}

function totals(database) {
    const row = database.prepare(`SELECT SUM(CASE WHEN side = 'debit' THEN amountMinor ELSE 0 END) AS debit,
        SUM(CASE WHEN side = 'credit' THEN amountMinor ELSE 0 END) AS credit FROM ledger_lines`).get();
    return { debit: Number(row.debit), credit: Number(row.credit) };
}

async function audit(database, seals = null) {
    const all = sql => database.prepare(sql).all();
    return runAccountingAudit({
        entries: all('SELECT * FROM accounting_entries ORDER BY rowid'),
        transactions: all('SELECT * FROM ledger_transactions ORDER BY rowid'),
        lines: all('SELECT * FROM ledger_lines ORDER BY rowid'),
        payments: all('SELECT * FROM payments'),
        credits: all('SELECT * FROM credits'),
        installments: all('SELECT * FROM credit_installments'),
        writtenOffCreditIds: all('SELECT creditId FROM credit_writeoffs').map(row => row.creditId),
        cashSessions: [], userFindings: [], seals, workingTime: ALWAYS_OPEN,
    }, 'full');
}

/** Cenário base: capital 1 000 000, crédito 100 000 + 35 000 de juros, pagamentos de 100 000 e 35 000. */
async function runBaseScenario(database) {
    await ServicoFinanceiro.registerJournalEntry({ ...actor, kind: 'capital_entry', amount: 1_000_000, liquidAccount: 'cash',
        description: 'Realização do capital social', idempotencyKey: 'capital-inicial-0001' });
    await ServicoFinanceiro.addCredit(newCredit('cr-d1', 100_000, 35_000));
    await ServicoFinanceiro.addPaymentAndUpdateCredit(newPayment('pay-d1', 'cr-d1', 100_000), 0, 'c1');
    await ServicoFinanceiro.addPaymentAndUpdateCredit(newPayment('pay-d2', 'cr-d1', 35_000), 1, 'c1');
}

test('Parte D: capital, desembolso e pagamentos deixam Caixa 1 035 000, Carteira 0 e Receita de Juros 35 000', async () => {
    const database = await createDatabase();
    await runBaseScenario(database);

    const result = balances(database);
    assert.equal(result.cash, 103_500_000, 'Caixa e Bancos = 1 035 000,00');
    assert.equal(result.bank || 0, 0);
    assert.equal(result.portfolio, 0, 'Carteira = 0');
    assert.equal(result.revenue_interest, -3_500_000, 'Receita de Juros = 35 000,00 (saldo credor)');
    assert.equal(result.capital, -100_000_000, 'Capital Social = 1 000 000,00 (saldo credor)');

    const { debit, credit } = totals(database);
    assert.equal(debit, credit, 'balancete equilibrado');
    assert.equal(Object.values(result).reduce((sum, value) => sum + value, 0), 0);

    const stored = database.prepare("SELECT status, currentBalanceMinor, accruedInterestMinor FROM credits WHERE id = 'cr-d1'").get();
    assert.equal(stored.status, 'paid');
    assert.equal(Number(stored.currentBalanceMinor), 0);
    assert.equal(Number(stored.accruedInterestMinor), 0);

    // Cada pagamento é repartido no diário: o primeiro liquida os juros e parte do capital.
    const firstLines = database.prepare("SELECT account, side, amountMinor FROM ledger_lines WHERE transactionId = 'payment:pay-d1' ORDER BY id").all();
    assert.deepEqual(firstLines.map(line => [line.account, line.side, Number(line.amountMinor)]).sort(), [
        ['cash', 'debit', 10_000_000], ['portfolio', 'credit', 6_500_000], ['revenue_interest', 'credit', 3_500_000]
    ].sort());

    const report = await audit(database);
    const critical = report.findings.filter(finding => finding.severity === 'critical');
    assert.deepEqual(critical, [], 'auditoria sem apontamentos críticos');
    assert.deepEqual(report.findings.filter(finding => ['cash_leak', 'portfolio_mismatch', 'contract_balance', 'trial_balance'].includes(finding.rule)), []);
    assert.equal(report.summary.liquidMinor, 103_500_000);
    assert.equal(report.summary.portfolioMinor, 0);
    assert.equal(report.summary.revenueMinor, 3_500_000);
});

test('Parte D: pagamento em atraso lança juros de mora diários e a auditoria continua limpa', async () => {
    const database = await createDatabase();
    await runBaseScenario(database);
    const start = new Date(); start.setMonth(start.getMonth() - 2);
    const due = new Date(start); due.setMonth(due.getMonth() + 1);
    await ServicoFinanceiro.addCredit(newCredit('cr-mora', 60_000, 10_000, { lateInterestRate: 1, startDate: start, dueDate: due, createdAt: start }));

    const summary = await ServicoFinanceiro.getLateInterestSummary('cr-mora', new Date());
    assert.ok(summary.accruedMinor > 0, 'há mora acumulada numa prestação vencida');
    const totalMinor = 7_000_000 + summary.accruedMinor;
    const result = await ServicoFinanceiro.addPaymentAndUpdateCredit(newPayment('pay-mora', 'cr-mora', totalMinor / 100), 0, 'c1');
    assert.equal(Math.round(result.payment.allocatedToLateInterest * 100), summary.accruedMinor, 'a mora é liquidada primeiro');
    assert.equal(result.creditState.status, 'paid');

    const after = balances(database);
    assert.equal(after.revenue_late_interest, -summary.accruedMinor, 'Receita de Juros de Mora reconhecida');
    assert.equal(after.receivable_late_interest || 0, 0, 'a mora reconhecida fica liquidada');
    assert.equal(after.portfolio, 0);
    const report = await audit(database);
    assert.deepEqual(report.findings.filter(finding => finding.severity === 'critical'), []);
});

test('Parte D: pagamento acima da dívida é recusado sem alterar saldos', async () => {
    const database = await createDatabase();
    await ServicoFinanceiro.registerJournalEntry({ ...actor, kind: 'capital_entry', amount: 1_000_000, liquidAccount: 'cash',
        description: 'Realização do capital social', idempotencyKey: 'capital-inicial-0002' });
    await ServicoFinanceiro.addCredit(newCredit('cr-over', 100_000, 35_000));
    const before = balances(database);
    await assert.rejects(ServicoFinanceiro.addPaymentAndUpdateCredit(newPayment('pay-over', 'cr-over', 135_000.01), 0, 'c1'), /excede/);
    assert.deepEqual(balances(database), before);
    assert.equal(database.prepare("SELECT COUNT(*) AS total FROM payments WHERE id = 'pay-over'").get().total, 0);
});

test('Parte D: desembolso e despesa sem saldo disponível são bloqueados', async () => {
    const database = await createDatabase();
    await assert.rejects(ServicoFinanceiro.addCredit(newCredit('cr-sem-saldo', 100_000, 35_000)), /Saldo de Caixa e Bancos insuficiente/);
    assert.equal(database.prepare("SELECT COUNT(*) AS total FROM credits WHERE id = 'cr-sem-saldo'").get().total, 0, 'nada foi gravado');
    assert.equal(database.prepare('SELECT COUNT(*) AS total FROM ledger_lines').get().total, 0);

    await ServicoFinanceiro.registerJournalEntry({ ...actor, kind: 'capital_entry', amount: 50_000, liquidAccount: 'cash',
        description: 'Capital inicial reduzido', idempotencyKey: 'capital-inicial-0003' });
    await assert.rejects(ServicoFinanceiro.addCredit(newCredit('cr-sem-saldo', 100_000, 35_000)), /insuficiente/);
    await assert.rejects(ServicoFinanceiro.registerJournalEntry({ ...actor, kind: 'expense', amount: 60_000, liquidAccount: 'cash',
        description: 'Renda do escritório', idempotencyKey: 'despesa-renda-0001' }), /insuficiente/);
    // Com saldo suficiente o mesmo crédito é concedido.
    await ServicoFinanceiro.registerJournalEntry({ ...actor, kind: 'loan_received', amount: 60_000, liquidAccount: 'cash',
        description: 'Financiamento do sócio', idempotencyKey: 'financiamento-0001' });
    await ServicoFinanceiro.addCredit(newCredit('cr-sem-saldo', 100_000, 35_000));
    assert.equal(balances(database).cash, 1_000_000);
    // A mesma chave idempotente não regista o movimento duas vezes.
    await assert.rejects(ServicoFinanceiro.registerJournalEntry({ ...actor, kind: 'loan_received', amount: 60_000, liquidAccount: 'cash',
        description: 'Financiamento do sócio', idempotencyKey: 'financiamento-0001' }));
    assert.equal(balances(database).cash, 1_000_000);
});

test('Parte D: alteração manual da base de dados é detectada (hash, cadeia e selo HMAC)', async () => {
    const database = await createDatabase();
    await runBaseScenario(database);
    const keyDir = mkdtempSync(path.join(tmpdir(), 'selo-parte-d-'));
    const sealer = createLedgerSealer({
        query: async (type, sql, values = []) => {
            const statement = database.prepare(sql);
            if (type === 'get') return statement.get(...values);
            if (type === 'query') return statement.all(...values);
            return statement.run(...values);
        },
        transaction: globalThis.__testDb.transaction,
        keyPath: path.join(keyDir, 'ledger-seal.key'),
        safeStorage: { isEncryptionAvailable: () => false, encryptString: value => Buffer.from(value), decryptString: value => value.toString() },
    });
    await sealer.initialize();
    const clean = await sealer.verify();
    assert.equal(clean.sealedCount, 4);
    assert.deepEqual([clean.tampered, clean.broken, clean.missing, clean.unsealed], [[], [], [], []]);
    assert.deepEqual((await audit(database, clean)).findings.filter(finding => finding.severity === 'critical'), []);

    // Os triggers impedem a alteração pela aplicação…
    assert.throws(() => database.prepare("UPDATE accounting_entries SET amountTotalMinor = 1 WHERE id = 'payment:pay-d2'").run(), /imutáveis/);
    assert.throws(() => database.prepare("DELETE FROM ledger_lines WHERE transactionId = 'payment:pay-d2'").run(), /imutáveis/);

    // …mas um atacante com acesso directo ao ficheiro pode removê-los. 1) Alterar o valor de um lançamento:
    database.exec('DROP TRIGGER trg_accounting_entries_immutable_update');
    database.prepare("UPDATE accounting_entries SET amountTotalMinor = 2500000, amountTotal = 25000 WHERE id = 'payment:pay-d2'").run();
    let report = await audit(database, await sealer.verify());
    assert.ok(report.findings.some(finding => finding.rule === 'integrity_hash' && finding.references.some(ref => ref.id === 'payment:pay-d2')), 'hash inválido detectado');
    assert.ok(report.findings.some(finding => finding.rule === 'integrity_seal' && finding.severity === 'critical'), 'selo HMAC inválido detectado');

    // 2) Desviar receita para a carteira mantendo débito = crédito (a cadeia SHA-256 não cobre as linhas; o selo HMAC cobre).
    database.exec('DROP TRIGGER trg_ledger_lines_immutable_update');
    database.prepare("UPDATE ledger_lines SET amountMinor = amountMinor - 100000 WHERE transactionId = 'payment:pay-d1' AND account = 'revenue_interest'").run();
    database.prepare("UPDATE ledger_lines SET amountMinor = amountMinor + 100000 WHERE transactionId = 'payment:pay-d1' AND account = 'portfolio'").run();
    const seals = await sealer.verify();
    assert.ok(seals.tampered.includes('payment:pay-d1'), 'o selo HMAC denuncia a troca de contas');
    report = await audit(database, seals);
    assert.equal(totals(database).debit, totals(database).credit, 'o balancete continua equilibrado: só o selo e a conciliação o apanham');
    assert.ok(report.findings.some(finding => finding.rule === 'portfolio_mismatch'), 'a carteira deixa de bater com os contratos');

    // 3) Apagar um lançamento: quebra a cadeia e o selo aponta para um lançamento em falta.
    database.exec('DROP TRIGGER trg_accounting_entries_immutable_delete');
    database.prepare("DELETE FROM accounting_entries WHERE id = 'payment:pay-d2'").run();
    const afterDelete = await sealer.verify();
    assert.ok(afterDelete.missing.includes('payment:pay-d2'));
    report = await audit(database, afterDelete);
    assert.ok(report.findings.some(finding => finding.rule === 'integrity_seal' && finding.id.startsWith('integrity_seal:missing:')));
    assert.ok(report.findings.some(finding => finding.rule === 'payment_without_entry'), 'pagamento sem lançamento');
    rmSync(keyDir, { recursive: true, force: true });
});

test('Parte D: estorno de lançamento manual só uma vez e com motivo', async () => {
    const database = await createDatabase();
    await ServicoFinanceiro.registerJournalEntry({ ...actor, kind: 'capital_entry', amount: 1_000_000, liquidAccount: 'bank',
        description: 'Realização do capital social', idempotencyKey: 'capital-inicial-0004' });
    const expense = await ServicoFinanceiro.registerJournalEntry({ ...actor, kind: 'expense', amount: 20_000, liquidAccount: 'bank',
        description: 'Material de escritório', idempotencyKey: 'despesa-material-0001' });
    await assert.rejects(ServicoFinanceiro.reverseJournalEntry({ entryId: expense.id, reason: 'curto', actorId: 'admin-2', actorName: 'Outro Admin' }), /motivo/);
    await ServicoFinanceiro.reverseJournalEntry({ entryId: expense.id, reason: 'Despesa lançada em duplicado', actorId: 'admin-2', actorName: 'Outro Admin' });
    await assert.rejects(ServicoFinanceiro.reverseJournalEntry({ entryId: expense.id, reason: 'Despesa lançada em duplicado', actorId: 'admin-2', actorName: 'Outro Admin' }), /já foi estornado/);
    const result = balances(database);
    assert.equal(result.bank, 100_000_000);
    assert.equal(result.expenses || 0, 0);
    assert.deepEqual((await audit(database)).findings.filter(finding => finding.severity === 'critical'), []);
});
