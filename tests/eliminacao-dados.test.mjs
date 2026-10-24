// Eliminação de clientes e contratos (créditos, contratos, pagamentos e contabilidade), numeração BV-CRT/AAAA/NNN
// e lucros previstos dos créditos concedidos.
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
    const outdir = mkdtempSync(path.join(tmpdir(), 'eliminacao-'));
    const outfile = path.join(outdir, 'eliminacao.mjs');
    await build({
        stdin: {
            contents: `
                export * as A from '@/bibliotecas/pagamentos-analise';
                export * as E from '@/bibliotecas/eliminacao-dados';
                export * as C from '@/bibliotecas/carteira-credito';
                export { RepositorioCliente } from '@/repositorios/RepositorioCliente';
                export { RepositorioCredito } from '@/repositorios/RepositorioCredito';
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

const M = await loadModules();

test('prefixo do número de contrato sai do nome da empresa e o número segue BV-CRT/AAAA/NNN', () => {
    assert.equal(M.A.deriveContractPrefix('BRAVALDO - COMERCIO E SERVIÇOS, LDA'), 'BV');
    assert.equal(M.A.deriveContractPrefix('Digital Norte'), 'DN');
    assert.equal(M.A.normalizeContractPrefix(' bv-1 '), 'BV1');
    assert.equal(M.A.formatContractNumber('BV', 2026, 7), 'BV-CRT/2026/007');
});

test('numeração por ano, sem repetir nem mudar quando um crédito é apagado definitivamente', () => {
    const credits = [
        { id: 'c', createdAt: '2026-03-01T10:00:00Z' }, { id: 'a', createdAt: '2026-01-01T10:00:00Z' },
        { id: 'b', createdAt: '2026-02-01T10:00:00Z' }, { id: 'x', createdAt: '2025-12-01T10:00:00Z' },
    ];
    M.A.setContractNumbering({ prefix: 'BV', credits });
    const all = M.A.contractNumbers([]);
    assert.equal(all.get('a'), 'BV-CRT/2026/001');
    assert.equal(all.get('c'), 'BV-CRT/2026/003');
    assert.equal(all.get('x'), 'BV-CRT/2025/001');
    // A lista visível perde o «b» (apagado definitivamente), mas o «c» mantém o número.
    assert.equal(M.A.contractNumbers([credits[0], credits[1]]).get('c'), 'BV-CRT/2026/003');
    M.A.setContractNumbering({ prefix: '', credits: [] });
});

test('lançamentos saem da contabilidade só de clientes/créditos eliminados com contabilidade ou apagados definitivamente', () => {
    const removal = M.E.computeAccountingRemoval({
        deletedClients: [{ id: 'est', deletedBy: 'u1' }, { id: 'lixo', deletedBy: 'u1' }, { id: 'purgado', deletedBy: 'purged:u1' }],
        deletedCredits: [{ id: 'cr-est', clientId: 'est', deletedBy: 'u1' }, { id: 'cr-p', clientId: 'purgado', deletedBy: 'purged:u1' }, { id: 'cr-solo', clientId: 'outro', deletedBy: 'u1' }],
        hidden: { clients: ['est', 'restaurado'], credits: [] },
    });
    assert.deepEqual([...removal.clients].sort(), ['est', 'purgado']);
    assert.deepEqual([...removal.credits].sort(), ['cr-est', 'cr-p']);
});

const seedCredit = (database, id, clientId, name) => {
    const now = '2026-10-20T10:00:00.000Z';
    database.prepare("INSERT INTO credits (id, clientId, clientName, principalAmount, interestRate, lateInterestRate, installments, currentBalance, totalDue, startDate, dueDate, status, createdAt) VALUES (?, ?, ?, 500000, 10, 0, 1, 500000, 550000, ?, ?, 'active', ?)").run(id, clientId, name, now, now, now);
    database.prepare("INSERT INTO contracts (id, clientId, clientName, title, value, status, createdAt) VALUES (?, ?, ?, 'Contrato', 500000, 'active', ?)").run(id, clientId, name, now);
};
const contractDeletedAt = (database, id) => database.prepare('SELECT deletedAt FROM contracts WHERE id = ?').get(id).deletedAt;

test('eliminar cliente leva créditos e contratos; restaurar devolve; apagar definitivamente tira da contabilidade', async () => {
    const database = await createDatabase();
    database.prepare("INSERT INTO clients (id, name, createdAt) VALUES ('est', 'Stanislau', '2026-10-20T10:00:00.000Z')").run();
    seedCredit(database, 'CR-1', 'est', 'Stanislau');

    await M.RepositorioCliente.softDelete('est', 'u1', undefined, true);
    assert.ok(contractDeletedAt(database, 'CR-1'), 'o contrato foi para a lixeira com o cliente');
    await M.RepositorioCliente.restore('est');
    assert.equal(contractDeletedAt(database, 'CR-1'), null, 'o contrato voltou com o cliente');

    await M.RepositorioCliente.softDelete('est', 'u1', undefined, true);
    await M.RepositorioCliente.purge('est', 'u1');
    await M.E.loadDataRemovalState('BRAVALDO');
    assert.ok(M.E.isRemovedFromAccounting({ clientId: 'est', creditId: 'CR-1' }));
    assert.ok(M.E.isRemovedFromAccounting({ creditId: 'CR-1' }));
    assert.ok(!M.E.isRemovedFromAccounting({ clientId: 'outro' }));
    assert.equal(M.A.contractNumbers([]).get('CR-1'), 'BV-CRT/2026/001', 'o crédito apagado continua a contar na numeração');
});

test('eliminar contrato (crédito) leva o contrato; marcar contabilidade retira os lançamentos até ser restaurado', async () => {
    const database = await createDatabase();
    database.prepare("INSERT INTO clients (id, name, createdAt) VALUES ('cli', 'Ana', '2026-10-20T10:00:00.000Z')").run();
    seedCredit(database, 'CR-2', 'cli', 'Ana');
    await M.RepositorioCredito.softDelete('CR-2', 'u1');
    assert.ok(contractDeletedAt(database, 'CR-2'));
    await M.E.hideFromAccounting({ credits: ['CR-2'] }, 'u1');
    await M.E.loadDataRemovalState('Ana');
    assert.ok(M.E.isRemovedFromAccounting({ creditId: 'CR-2' }));
    await M.RepositorioCredito.restore('CR-2');
    assert.equal(contractDeletedAt(database, 'CR-2'), null);
    await M.E.loadDataRemovalState('Ana');
    assert.ok(!M.E.isRemovedFromAccounting({ creditId: 'CR-2' }), 'restaurado: os lançamentos voltam');
});

test('lucros previstos: capital investido face ao lucro dos juros, recebido e por receber', () => {
    const row = (id, stage, granted, interest) => ({ id, reference: id, clientName: id, stage, rate: 10, grantedMinor: granted, contractedInterestMinor: interest });
    const summary = M.C.expectedProfitSummary(
        [row('a', 'ativo', 100000_00, 25000_00), row('b', 'liquidado', 50000_00, 5000_00), row('p', 'pedido', 999_00, 99_00)],
        [{ creditId: 'a', status: 'confirmed', allocatedToInterest: 10000 }, { creditId: 'b', status: 'confirmed', allocatedToInterest: 5000 }, { creditId: 'a', status: 'cancelled', allocatedToInterest: 9999 }],
    );
    assert.equal(summary.count, 2, 'o pedido não conta');
    assert.equal(summary.capitalMinor, 150000_00);
    assert.equal(summary.expectedProfitMinor, 30000_00);
    assert.equal(summary.receivedProfitMinor, 15000_00);
    assert.equal(summary.toReceiveProfitMinor, 15000_00);
    assert.equal(summary.totalExpectedMinor, 180000_00);
    assert.equal(summary.rows[0].id, 'a');
    assert.equal(summary.rows[0].marginRate, 0.25);
});
