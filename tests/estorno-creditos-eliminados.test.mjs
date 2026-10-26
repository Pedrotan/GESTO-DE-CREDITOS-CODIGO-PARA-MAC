// Contabilidade: um crédito eliminado não pode deixar dinheiro "preso" na carteira. O estorno devolve o capital em
// dívida à conta de onde saiu (uma só vez, mesmo chamado de novo), o restauro volta a lançar o desembolso, o desembolso
// verifica o saldo da conta concreta (Caixa ou Bancos) e as Aprovações deixam de mostrar créditos eliminados.
// Também: naturalidade e morada obrigatórias no cadastro do cliente e do cônjuge. Tudo sobre SQLite real.
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
    const outdir = mkdtempSync(path.join(tmpdir(), 'estorno-'));
    const outfile = path.join(outdir, 'estorno.mjs');
    await build({
        stdin: {
            contents: `
                export { ServicoFinanceiro } from '@/servicos/ServicoFinanceiro';
                export * as Morada from '@/bibliotecas/morada-cliente';
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
    database.prepare(`INSERT INTO clients (id, name, phone, createdAt, usuario_id, receiveMethod) VALUES ('c1', 'Stanislau Ernesto Bastos', '+244 923 000 000', ?, 'u1', 'transfer')`).run(now);
    database.prepare(`INSERT INTO clients (id, name, phone, createdAt, usuario_id, receiveMethod) VALUES ('c2', 'Isaac Daniel Antonio', '+244 923 000 001', ?, 'u1', 'cash')`).run(now);
    database.prepare(`INSERT INTO users (id, name, email, password, role, createdAt) VALUES ('u1', 'Director Financeiro', 'u1@example.invalid', 'x', 'super_admin', ?)`).run(now);
    database.prepare(`INSERT INTO shared_settings (key, value, updatedAt) VALUES ('accounting_config', '{"cashGuard":true}', ?)`).run(now);
    return database;
}

const actor = { id: 'u1', name: 'Director Financeiro' };
const creditOf = (id, clientId, clientName, amount) => ({
    id, clientId, clientName, principalAmount: amount, interestRate: 10, lateInterestRate: 0,
    installments: 2, paidInstallments: 0, currentBalance: amount, accruedInterest: amount * 0.1, lateInterest: 0, totalDue: amount * 1.1,
    startDate: new Date('2026-10-01T12:00:00Z'), dueDate: new Date('2026-12-01T12:00:00Z'), createdAt: new Date('2026-10-01T12:00:00Z'),
    status: 'active', amortizationMethod: 'FLAT', daysOverdue: 0, creditNumber: 1, requestedBy: 'Director Financeiro', usuario_id: 'u1'
});

async function setup() {
    const M = await loadModules();
    const database = await createDatabase();
    await M.ServicoFinanceiro.registerJournalEntry({ kind: 'capital_entry', amount: 1_000_000, description: 'Realização do capital social',
        idempotencyKey: 'capital-0001-teste', actorId: 'u1', actorName: 'Director Financeiro', actorRole: 'super_admin', liquidAccount: 'bank' });
    return { M, database };
}

const portfolioOf = (database, creditId) => Number(database.prepare(`SELECT COALESCE(SUM(CASE WHEN l.side = 'debit' THEN l.amountMinor ELSE -l.amountMinor END), 0) AS n
    FROM ledger_lines l JOIN accounting_entries a ON a.id = l.transactionId WHERE a.creditId = ? AND l.account = 'portfolio'`).get(creditId).n);

test('crédito eliminado: o estorno devolve o capital a Bancos uma só vez e o restauro volta a desembolsar', async () => {
    const { M, database } = await setup();
    await M.ServicoFinanceiro.addCredit(creditOf('cr-stanislau', 'c1', 'Stanislau Ernesto Bastos', 500_000));
    assert.equal((await M.ServicoFinanceiro.liquidBalancesMinor()).total, 50_000_000);
    assert.equal(portfolioOf(database, 'cr-stanislau'), 50_000_000);

    await M.ServicoFinanceiro.deleteCredit('cr-stanislau', 'u1');
    const pending = await M.ServicoFinanceiro.removedCreditsPendingReversal();
    assert.deepEqual(pending.map(item => [item.creditId, item.principalMinor]), [['cr-stanislau', 50_000_000]]);

    const first = await M.ServicoFinanceiro.reverseRemovedCredits(actor);
    assert.deepEqual(first, { entries: 1, returnedMinor: 50_000_000 });
    const balances = await M.ServicoFinanceiro.liquidBalancesMinor();
    assert.equal(balances.bank, 100_000_000, 'o capital volta à conta de onde saiu (Bancos)');
    assert.equal(portfolioOf(database, 'cr-stanislau'), 0);
    assert.deepEqual(await M.ServicoFinanceiro.reverseRemovedCredits(actor), { entries: 0, returnedMinor: 0 }, 'não estorna duas vezes');
    assert.deepEqual(await M.ServicoFinanceiro.removedCreditsPendingReversal(), []);

    // Com o dinheiro de volta, um novo crédito de 400 000 Kz já é aceite.
    await M.ServicoFinanceiro.addCredit(creditOf('cr-paulo', 'c1', 'Paulo Armando Narciso', 400_000));
    assert.equal((await M.ServicoFinanceiro.liquidBalancesMinor()).total, 60_000_000);

    // Restaurar exige saldo e volta a lançar o desembolso estornado.
    await M.ServicoFinanceiro.restoreRemovedCreditLedger('cr-stanislau', actor);
    await M.ServicoFinanceiro.restoreCredit('cr-stanislau');
    assert.equal(portfolioOf(database, 'cr-stanislau'), 50_000_000);
    assert.equal((await M.ServicoFinanceiro.liquidBalancesMinor()).total, 10_000_000);
    const types = database.prepare(`SELECT type FROM accounting_entries WHERE creditId = 'cr-stanislau' ORDER BY rowid`).all().map(row => row.type);
    assert.deepEqual(types, ['disbursement', 'credit_removal', 'credit_restore']);
});

test('desembolso em numerário exige saldo em Caixa, mesmo havendo dinheiro no banco', async () => {
    const { M } = await setup();
    await assert.rejects(() => M.ServicoFinanceiro.addCredit(creditOf('cr-isaac', 'c2', 'Isaac Daniel Antonio', 50_000)), /Saldo em Caixa insuficiente.*transferência Bancos → Caixa/);
    await M.ServicoFinanceiro.registerJournalEntry({ kind: 'transfer', amount: 60_000, description: 'Levantamento para a caixa', idempotencyKey: 'transfer-0001-teste',
        actorId: 'u1', actorName: 'Director Financeiro', actorRole: 'super_admin', debitAccount: 'cash', creditAccount: 'bank', liquidAccount: 'cash' });
    const balances = await M.ServicoFinanceiro.liquidBalancesMinor();
    assert.equal(balances.cash, 6_000_000);
    await M.ServicoFinanceiro.addCredit(creditOf('cr-isaac', 'c2', 'Isaac Daniel Antonio', 50_000));
    assert.equal((await M.ServicoFinanceiro.liquidBalancesMinor()).cash, 1_000_000);
});

test('Aprovações: decisões de créditos e clientes eliminados saem da lista', async () => {
    const { M, database } = await setup();
    await M.ServicoFinanceiro.addCredit(creditOf('cr-stanislau', 'c1', 'Stanislau Ernesto Bastos', 500_000));
    const insert = database.prepare(`INSERT INTO credit_approvals (id, creditId, clientId, clientName, principalAmount, decision, decidedBy, decidedAt) VALUES (?, ?, ?, ?, ?, 'approved', 'Director', ?)`);
    insert.run('ap-1', 'cr-stanislau', 'c1', 'Stanislau Ernesto Bastos', 500_000, new Date().toISOString());
    insert.run('ap-2', 'cr-outro', 'c2', 'Isaac Daniel Antonio', 50_000, new Date().toISOString());
    assert.equal((await M.ServicoFinanceiro.getCreditApprovals()).length, 2);
    await M.ServicoFinanceiro.deleteCredit('cr-stanislau', 'u1');
    assert.deepEqual((await M.ServicoFinanceiro.getCreditApprovals()).map(item => item.id), ['ap-2']);
    database.prepare(`UPDATE clients SET deletedAt = ? WHERE id = 'c2'`).run(new Date().toISOString());
    assert.deepEqual(await M.ServicoFinanceiro.getCreditApprovals(), []);
});

test('cadastro: naturalidade, província, município, bairro e zona obrigatórios (cliente e cônjuge)', async () => {
    const { Morada } = await loadModules();
    const vazio = Morada.validarNaturalidadeMorada({}, { particular: true, conjuge: true }).map(([campo]) => campo);
    assert.deepEqual(vazio, ['birthPlace', 'province', 'municipality', 'neighborhood', 'zone',
        'spouseBirthPlace', 'spouseProvince', 'spouseMunicipality', 'spouseNeighborhood', 'spouseZone']);
    // Empresa: sem naturalidade e sem cônjuge.
    assert.deepEqual(Morada.validarNaturalidadeMorada({ province: 'Luanda' }, { particular: false, conjuge: false }).map(([campo]) => campo),
        ['municipality', 'neighborhood', 'zone']);
    const completo = { birthPlace: 'Luanda', province: 'Luanda', municipality: 'Belas', neighborhood: 'Talatona', zone: 'Zona 2' };
    assert.deepEqual(Morada.validarNaturalidadeMorada({ ...completo, spouseBirthPlace: ' ' }, { particular: true, conjuge: false }), []);
    assert.equal(Morada.PROVINCIAS_ANGOLA.length, 21);
});
