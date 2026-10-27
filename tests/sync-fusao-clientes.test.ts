import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { applyRemoteGroups, clientMergeWinner, conflictStatements, reprocessableGroups, type SyncOperation, type SyncStatement } from '../src/bibliotecas/sync-operacoes.ts';

const SQL = new Map([
    ['ins-client', 'INSERT INTO clients (id, name, nif, createdAt) VALUES (?, ?, ?, ?)'],
    ['ins-credit', 'INSERT INTO credits (id, clientId, clientName) VALUES (?, ?, ?)'],
]);
// Um dispositivo com o mesmo NIF já registado com outro ID (a Sukeina registada duas vezes).
const device = (local: { id: string; createdAt: string }) => {
    const database = new DatabaseSync(':memory:');
    database.exec(`CREATE TABLE clients (id TEXT PRIMARY KEY, name TEXT, nif TEXT, createdAt TEXT, deletedAt TEXT, deletedBy TEXT);
        CREATE UNIQUE INDEX idx_clients_nif_active ON clients(nif) WHERE deletedAt IS NULL;
        CREATE TABLE credits (id TEXT PRIMARY KEY, clientId TEXT, clientName TEXT);
        CREATE TABLE contracts (id TEXT PRIMARY KEY, clientId TEXT);
        CREATE TABLE sync_conflicts (id TEXT PRIMARY KEY, entityType TEXT, entityId TEXT, operation TEXT, status TEXT, createdAt TEXT, resolutionNote TEXT, resolvedBy TEXT, resolvedAt TEXT);`);
    database.prepare('INSERT INTO clients (id, name, nif, createdAt) VALUES (?, ?, ?, ?)').run(local.id, 'Sukeina Capingana Ricaxi', '00999LA041', local.createdAt);
    database.prepare('INSERT INTO credits VALUES (?, ?, ?)').run(`cr-${local.id}`, local.id, 'Sukeina');
    database.prepare('INSERT INTO contracts VALUES (?, ?)').run(`cr-${local.id}`, local.id);
    const transaction = async (statements: SyncStatement[]) => {
        database.exec('BEGIN');
        try { for (const s of statements) database.prepare(s.sql).run(...((s.params || []) as never[])); database.exec('COMMIT'); }
        catch (error) { database.exec('ROLLBACK'); throw error; }
    };
    const tableColumns = async (table: string) => new Set((database.prepare(`PRAGMA table_info("${table}")`).all() as Array<{ name: string }>).map(r => r.name));
    const queryOne = async (sql: string, params: unknown[]) => database.prepare(sql).get(...(params as never[])) as Record<string, unknown> | undefined;
    return { database, deps: { sqlById: SQL, tableColumns, queryOne, transaction } };
};
const chegada = (id: string, createdAt: string): SyncOperation[] => {
    const meta = { txId: `tx-${id}`, txSize: 2, deviceId: 'pc-benguela', kind: 'statement' as const, commandVersion: 1, tenantId: 't', createdAt };
    return [
        { ...meta, id: `o1-${id}`, statementId: 'ins-client', params: [id, 'Sukeina Capingana Ricaxi', '00999LA041', createdAt] },
        { ...meta, id: `o2-${id}`, statementId: 'ins-credit', params: [`cr-${id}`, id, 'Sukeina'] },
    ];
};
const vivos = (db: DatabaseSync) => (db.prepare('SELECT id FROM clients WHERE deletedAt IS NULL').all() as Array<{ id: string }>).map(row => row.id);
const donos = (db: DatabaseSync, table: string) => [...new Set((db.prepare(`SELECT clientId FROM ${table}`).all() as Array<{ clientId: string }>).map(row => row.clientId))];

test('mesmo NIF com outro ID: os dois dispositivos ficam com o mesmo cliente (o mais antigo) e com todos os créditos dele', async () => {
    const antigo = { id: 'cl-luanda', createdAt: '2026-10-27T10:37:00.000Z' };
    const novo = { id: 'cl-benguela', createdAt: '2026-10-27T15:00:00.000Z' };
    // Luanda tem o antigo e recebe o novo; Benguela tem o novo e recebe o antigo.
    const luanda = device(antigo);
    const benguela = device(novo);
    assert.deepEqual(await applyRemoteGroups([{ operations: chegada(novo.id, novo.createdAt) }], luanda.deps), { applied: 2, conflicts: 0 });
    assert.deepEqual(await applyRemoteGroups([{ operations: chegada(antigo.id, antigo.createdAt) }], benguela.deps), { applied: 2, conflicts: 0 });
    for (const { database } of [luanda, benguela]) {
        assert.deepEqual(vivos(database), ['cl-luanda'], 'fica o registo mais antigo, igual nos dois');
        assert.deepEqual(donos(database, 'credits'), ['cl-luanda'], 'os créditos dos dois passam para ele');
        assert.deepEqual(donos(database, 'contracts'), ['cl-luanda']);
        assert.match(String((database.prepare("SELECT deletedBy FROM clients WHERE id = 'cl-benguela'").get() as { deletedBy: string }).deletedBy), /Fundido com o cliente cl-luanda/);
    }
    assert.equal(clientMergeWinner({ id: 'b', createdAt: 'x' }, { id: 'a', createdAt: 'y' }).id, 'a', 'sem datas, o menor ID');
});

test('o conflito antigo «mesmo NIF» fica resolvido no reprocessamento', async () => {
    const { database, deps } = device({ id: 'cl-luanda', createdAt: '2026-10-27T10:37:00.000Z' });
    const operations = chegada('cl-benguela', '2026-10-27T15:00:00.000Z');
    await deps.transaction(conflictStatements(operations, 'UNIQUE constraint failed: clients.nif', SQL));
    const rows = database.prepare("SELECT id, operation FROM sync_conflicts WHERE status = 'pending'").all() as Array<{ id: string; operation: string }>;
    await applyRemoteGroups(reprocessableGroups(rows, SQL), deps);
    assert.equal((database.prepare("SELECT COUNT(*) AS n FROM sync_conflicts WHERE status = 'pending'").get() as { n: number }).n, 0);
    assert.deepEqual(vivos(database), ['cl-luanda']);
});
