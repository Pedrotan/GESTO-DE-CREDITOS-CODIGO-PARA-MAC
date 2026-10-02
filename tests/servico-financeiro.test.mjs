// Integração do ServicoFinanceiro com SQLite real: os saldos têm de vir da base de dados,
// nunca de valores enviados pela interface.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const root = path.resolve(import.meta.dirname, '..');

async function loadService() {
    const outdir = mkdtempSync(path.join(tmpdir(), 'servico-financeiro-'));
    const outfile = path.join(outdir, 'servico.mjs');
    await build({
        entryPoints: [path.join(root, 'src/servicos/ServicoFinanceiro.ts')],
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
    return module.ServicoFinanceiro;
}

async function createDatabase() {
    const { RENDERER_SQL_ALLOWLIST } = await import('../electron/renderer-sql-allowlist.ts');
    const database = new DatabaseSync(':memory:');
    for (const sql of RENDERER_SQL_ALLOWLIST) {
        if (sql.startsWith('CREATE TABLE IF NOT EXISTS')) database.exec(sql);
    }
    for (const sql of RENDERER_SQL_ALLOWLIST) {
        if (/^ALTER TABLE \w+ ADD COLUMN/.test(sql)) { try { database.exec(sql); } catch { /* coluna já existe */ } }
    }
    // Aplica as mesmas migrações de colunas que o adaptador SQLite executa no arranque.
    const adapter = readFileSync(path.join(root, 'src/bibliotecas/adaptador-sqlite.ts'), 'utf8');
    for (const [, table, column, , definition] of adapter.matchAll(/safeAddColumn\(\s*["'](\w+)["']\s*,\s*["'](\w+)["']\s*,\s*(["'])(.+?)\3\s*\)/g)) {
        try { database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`); } catch { /* tabela ausente ou coluna já existe */ }
    }
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
    database.prepare(`INSERT INTO clients (id, name, createdAt) VALUES ('c1', 'Cliente', ?)`).run(new Date().toISOString());
    return database;
}

const credit = {
    id: 'cr1', clientId: 'c1', clientName: 'Cliente', principalAmount: 1200, interestRate: 10, lateInterestRate: 0,
    installments: 3, paidInstallments: 0, currentBalance: 1200, accruedInterest: 300, lateInterest: 0, totalDue: 1500,
    startDate: new Date('2026-01-01'), dueDate: new Date('2026-04-01'), createdAt: new Date('2026-01-01'),
    status: 'active', amortizationMethod: 'FLAT', daysOverdue: 0, creditNumber: 1, requestedBy: 'u1'
};

const payment = (id, amount, extra = {}) => ({
    id, creditId: 'cr1', clientName: 'Cliente', amount, paymentDate: new Date('2026-02-01'), method: 'cash',
    reference: id, allocatedToPrincipal: 0, allocatedToInterest: 0, allocatedToLateInterest: 0,
    processedBy: 'Operador', status: 'confirmed', usuario_id: 'u1', ...extra
});

const stored = database => database.prepare(`SELECT currentBalanceMinor, accruedInterestMinor, lateInterestMinor,
    totalDueMinor, status, version, paidInstallments FROM credits WHERE id = 'cr1'`).get();

test('pagamento ignora saldos enviados pela interface e grava os calculados da base de dados', async () => {
    const ServicoFinanceiro = await loadService();
    const database = await createDatabase();
    await ServicoFinanceiro.addCredit(credit);

    // A interface tenta impor alocações e saldos falsos; o serviço recalcula tudo.
    const result = await ServicoFinanceiro.addPaymentAndUpdateCredit(
        payment('p1', 400, { allocatedToPrincipal: 400, currentBalance: 0 }), 0, 'c1');
    assert.deepEqual([result.payment.allocatedToInterest, result.payment.allocatedToPrincipal], [300, 100]);
    assert.deepEqual({ ...stored(database) }, {
        currentBalanceMinor: 110_000, accruedInterestMinor: 0, lateInterestMinor: 0,
        totalDueMinor: 110_000, status: 'active', version: 1, paidInstallments: 0
    });
    assert.equal(result.creditState.currentBalance, 1100);
    assert.equal(result.creditState.version, 1);

    // Segundo pagamento livre: o juro já liquidado não é descontado outra vez.
    const second = await ServicoFinanceiro.addPaymentAndUpdateCredit(payment('p2', 100), 1, 'c1');
    assert.deepEqual([second.payment.allocatedToInterest, second.payment.allocatedToPrincipal], [0, 100]);
    assert.equal(stored(database).currentBalanceMinor, 100_000);
});

test('versão desatualizada e pagamento acima da dívida são recusados sem alterar a base', async () => {
    const ServicoFinanceiro = await loadService();
    const database = await createDatabase();
    await ServicoFinanceiro.addCredit(credit);
    await ServicoFinanceiro.addPaymentAndUpdateCredit(payment('p1', 100), 0, 'c1');

    await assert.rejects(ServicoFinanceiro.addPaymentAndUpdateCredit(payment('p2', 100), 0, 'c1'), /alterado por outra operação/);
    await assert.rejects(ServicoFinanceiro.addPaymentAndUpdateCredit(payment('p3', 1400.01), 1, 'c1'), /excede o total em dívida/);
    assert.equal(stored(database).totalDueMinor, 140_000);
    assert.equal(database.prepare('SELECT COUNT(*) AS n FROM payments').get().n, 1);
});

test('liquidação total, estorno e reposição mantêm saldo, estado e contrato coerentes', async () => {
    const ServicoFinanceiro = await loadService();
    const database = await createDatabase();
    await ServicoFinanceiro.addCredit(credit);
    const paid = await ServicoFinanceiro.addPaymentAndUpdateCredit(payment('p1', 1500), 0, 'c1');
    assert.equal(paid.creditState.status, 'paid');
    assert.equal(stored(database).paidInstallments, 3);
    assert.equal(database.prepare(`SELECT status FROM contracts WHERE id = 'cr1'`).get().status, 'paid');

    const current = { ...credit, version: 1, status: 'paid' };
    const reversed = await ServicoFinanceiro.reversePaymentAndUpdateCredit(paid.payment, current, 'u2', 'Pagamento duplicado');
    assert.deepEqual([reversed.creditState.totalDue, reversed.creditState.status], [1500, 'active']);
    assert.equal(database.prepare(`SELECT status FROM contracts WHERE id = 'cr1'`).get().status, 'active');

    const restored = await ServicoFinanceiro.restorePaymentAndUpdateCredit(paid.payment, { ...current, version: 2, status: 'active' }, 'u2');
    assert.deepEqual([restored.creditState.totalDue, restored.creditState.status], [0, 'paid']);
    assert.deepEqual({ ...stored(database) }, {
        currentBalanceMinor: 0, accruedInterestMinor: 0, lateInterestMinor: 0,
        totalDueMinor: 0, status: 'paid', version: 3, paidInstallments: 3
    });
});

test('reforço soma ao saldo persistido e não ao enviado pela interface', async () => {
    const ServicoFinanceiro = await loadService();
    const database = await createDatabase();
    await ServicoFinanceiro.addCredit(credit);
    await ServicoFinanceiro.reinforceCredit({
        idempotencyKey: 'reforco-0001', credit: { ...credit, currentBalance: 1, totalDue: 1, version: 0 },
        amount: 300, interestAmount: 30, processedBy: 'Operador', userId: 'u1'
    });
    const row = database.prepare(`SELECT principalAmountMinor, currentBalanceMinor, accruedInterestMinor, totalDueMinor,
        reinforcedAmount FROM credits WHERE id = 'cr1'`).get();
    assert.deepEqual({ ...row }, {
        principalAmountMinor: 150_000, currentBalanceMinor: 150_000, accruedInterestMinor: 33_000,
        totalDueMinor: 183_000, reinforcedAmount: 300
    });
});
