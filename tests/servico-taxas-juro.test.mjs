// A tabela de taxas de juro é guardada em shared_settings (sincronizada pela nuvem) com
// "última alteração ganha", para que uma operação remota antiga não apague uma mais recente.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const root = path.resolve(import.meta.dirname, '..');

async function loadService() {
    const outdir = mkdtempSync(path.join(tmpdir(), 'servico-taxas-'));
    const outfile = path.join(outdir, 'servico.mjs');
    await build({
        entryPoints: [path.join(root, 'src/servicos/ServicoTaxasJuro.ts')],
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
    return module.ServicoTaxasJuro;
}

async function createDatabase() {
    const { RENDERER_SQL_ALLOWLIST } = await import('../electron/renderer-sql-allowlist.ts');
    const database = new DatabaseSync(':memory:');
    const createShared = [...RENDERER_SQL_ALLOWLIST].find(sql => sql.startsWith('CREATE TABLE IF NOT EXISTS shared_settings'));
    assert.ok(createShared, 'o esquema de shared_settings tem de estar na allowlist');
    database.exec(createShared);
    const params = values => (values || []).map(value => value === undefined ? null : value);
    const statements = [];
    globalThis.__testDb = {
        get: async (sql, values) => database.prepare(sql).get(...params(values)),
        run: async (sql, values) => {
            statements.push({ sql, values });
            return database.prepare(sql).run(...params(values));
        },
    };
    return { database, statements, RENDERER_SQL_ALLOWLIST };
}

const normalize = sql => sql.replace(/\s+/g, ' ').trim();
const tiers = [
    { id: 'b', minMonths: 3, maxMonths: 4, rate: 60 },
    { id: 'a', minMonths: 1, maxMonths: 2, rate: 40 },
];

test('sem registo devolve a tabela padrão; guardar persiste ordenado e o SQL é sincronizável', async () => {
    const ServicoTaxasJuro = await loadService();
    const { statements, RENDERER_SQL_ALLOWLIST } = await createDatabase();

    assert.equal((await ServicoTaxasJuro.load()).length, 6);
    await ServicoTaxasJuro.save(tiers, 'Admin');
    assert.deepEqual((await ServicoTaxasJuro.load()).map(t => t.id), ['a', 'b']);
    // Tem de estar na allowlist para o Electron aceitar e a nuvem replicar a operação.
    assert.ok(RENDERER_SQL_ALLOWLIST.has(normalize(statements[0].sql)));
    assert.match(statements[0].sql, /INTO shared_settings/);
});

test('uma alteração remota mais antiga não substitui a mais recente', async () => {
    const ServicoTaxasJuro = await loadService();
    const { database, statements } = await createDatabase();
    await ServicoTaxasJuro.save(tiers, 'Admin');
    const upsert = statements[0].sql;

    database.prepare(upsert).run('interest_tiers', JSON.stringify([{ id: 'x', minMonths: 1, maxMonths: 1, rate: 5 }]), '2000-01-01T00:00:00.000Z', 'Antigo');
    assert.deepEqual((await ServicoTaxasJuro.load()).map(t => t.rate), [40, 60]);

    database.prepare(upsert).run('interest_tiers', JSON.stringify([{ id: 'y', minMonths: 1, maxMonths: 1, rate: 7 }]), '2999-01-01T00:00:00.000Z', 'Novo');
    assert.deepEqual((await ServicoTaxasJuro.load()).map(t => t.rate), [7]);
});

test('recusa guardar uma tabela inválida', async () => {
    const ServicoTaxasJuro = await loadService();
    await createDatabase();
    await assert.rejects(ServicoTaxasJuro.save([{ id: 'a', minMonths: 1, maxMonths: 3, rate: 10 }, { id: 'b', minMonths: 2, maxMonths: 4, rate: 20 }]), /sobrepõem/);
});
