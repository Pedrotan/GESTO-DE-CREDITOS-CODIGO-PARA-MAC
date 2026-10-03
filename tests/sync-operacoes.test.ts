import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import {
    applyRemoteGroups,
    buildRemoteStatements,
    groupOperations,
    isSafeToReprocess,
    type SyncOperation,
    type SyncStatement,
} from '../src/bibliotecas/sync-operacoes.ts';

const SQL = new Map<string, string>([
    ['ins-payment', 'INSERT INTO payments (id, creditId, amount) VALUES (?, ?, ?)'],
    ['upd-credit', 'UPDATE credits SET balance = ?, version = version + 1 WHERE id = ? AND version = ?'],
    ['ins-user', 'INSERT INTO users (id, passwordHash) VALUES (?, ?)'],
    ['ins-client', 'INSERT INTO clients (id, name) VALUES (?, ?)'],
]);

const op = (partial: Partial<SyncOperation>): SyncOperation => ({
    id: crypto.randomUUID(), deviceId: 'outro', kind: 'statement', params: [], createdAt: new Date().toISOString(),
    commandVersion: 1, tenantId: 't', ...partial,
});

const createDatabase = () => {
    const database = new DatabaseSync(':memory:');
    database.exec(`
        CREATE TABLE credits (id TEXT PRIMARY KEY, balance INTEGER, version INTEGER);
        CREATE TABLE payments (id TEXT PRIMARY KEY, creditId TEXT, amount INTEGER);
        CREATE TABLE clients (id TEXT PRIMARY KEY, name TEXT);
        CREATE TABLE users (id TEXT PRIMARY KEY, passwordHash TEXT);
        CREATE TABLE sync_conflicts (id TEXT PRIMARY KEY, entityType TEXT, entityId TEXT, operation TEXT, status TEXT,
            createdAt TEXT, resolutionNote TEXT, resolvedBy TEXT, resolvedAt TEXT);
        INSERT INTO credits VALUES ('c1', 1000, 1);
    `);
    const transaction = async (statements: SyncStatement[]) => {
        database.exec('BEGIN');
        try {
            for (const statement of statements) {
                const result = database.prepare(statement.sql).run(...((statement.params || []) as never[]));
                if (statement.expectChanges !== undefined && Number(result.changes) !== statement.expectChanges) {
                    throw new Error('Conflito de concorrência: o registo foi alterado noutro dispositivo.');
                }
            }
            database.exec('COMMIT');
        } catch (error) {
            database.exec('ROLLBACK');
            throw error;
        }
    };
    const tableColumns = async (table: string) =>
        new Set((database.prepare(`PRAGMA table_info("${table}")`).all() as Array<{ name: string }>).map(row => row.name));
    return { database, deps: { sqlById: SQL, tableColumns, transaction } };
};

test('agrupa pela transacção de origem e deixa pendentes as que ainda não chegaram completas', () => {
    const a1 = op({ txId: 'A', txSize: 2 });
    const a2 = op({ txId: 'A', txSize: 2 });
    const b1 = op({ txId: 'B', txSize: 3 });
    const solo = op({});
    const { complete, pending } = groupOperations([a1, b1, solo, a2, a1]);
    assert.deepEqual(complete.map(group => group.map(item => item.id)), [[a1.id, a2.id], [solo.id]]);
    assert.deepEqual(pending.map(item => item.id), [b1.id]);
});

test('um pagamento remoto é aplicado com o crédito actualizado (tudo ou nada)', async () => {
    const { database, deps } = createDatabase();
    const result = await applyRemoteGroups([{ operations: [
        op({ statementId: 'ins-payment', params: ['p1', 'c1', 200], txId: 'T', txSize: 2 }),
        op({ statementId: 'upd-credit', params: [800, 'c1', 1], txId: 'T', txSize: 2, expectChanges: 1 }),
    ] }], deps);
    assert.deepEqual(result, { applied: 2, conflicts: 0 });
    assert.deepEqual({ ...database.prepare('SELECT balance, version FROM credits').get() }, { balance: 800, version: 2 });
    assert.equal((database.prepare('SELECT COUNT(*) AS n FROM payments').get() as { n: number }).n, 1);
});

test('se o crédito foi alterado nos dois lados, nada é aplicado e fica um conflito para revisão', async () => {
    const { database, deps } = createDatabase();
    database.exec(`UPDATE credits SET balance = 900, version = 2 WHERE id = 'c1'`);
    const result = await applyRemoteGroups([
        { operations: [
            op({ statementId: 'ins-payment', params: ['p1', 'c1', 200], txId: 'T', txSize: 2 }),
            op({ statementId: 'upd-credit', params: [800, 'c1', 1], txId: 'T', txSize: 2, expectChanges: 1 }),
        ] },
        { operations: [op({ statementId: 'ins-client', params: ['k1', 'Ana'] })] },
    ], deps);
    assert.deepEqual(result, { applied: 1, conflicts: 2 });
    assert.equal((database.prepare('SELECT COUNT(*) AS n FROM payments').get() as { n: number }).n, 0, 'o pagamento não pode entrar sem o crédito');
    assert.equal((database.prepare('SELECT balance FROM credits').get() as { balance: number }).balance, 900);
    assert.equal((database.prepare("SELECT COUNT(*) AS n FROM sync_conflicts WHERE status = 'pending'").get() as { n: number }).n, 2);
    assert.equal((database.prepare('SELECT COUNT(*) AS n FROM clients').get() as { n: number }).n, 1, 'os grupos seguintes continuam');
});

test('recusa tabelas de credenciais, comandos desconhecidos e colunas fora do esquema', async () => {
    const { deps } = createDatabase();
    await assert.rejects(buildRemoteStatements({ operations: [op({ statementId: 'ins-user', params: ['u', 'hash'] })] }, deps), /não sincronizável/);
    await assert.rejects(buildRemoteStatements({ operations: [op({ statementId: 'nao-existe' })] }, deps), /desconhecido/);
    await assert.rejects(buildRemoteStatements({ operations: [op({ kind: 'snapshot', table: 'users', columns: ['id'], params: ['u'] })] }, deps), /inválido/);
    await assert.rejects(buildRemoteStatements({ operations: [op({ kind: 'snapshot', table: 'clients', columns: ['id', 'hack'], params: ['x', 'y'] })] }, deps), /desconhecidas/);
    await assert.rejects(buildRemoteStatements({ operations: [op({ kind: 'dynamic', sql: 'UPDATE users SET role = ? WHERE id = ?' })] }, deps), /não autorizada/);
    const dynamic = await buildRemoteStatements({ operations: [op({ kind: 'dynamic', sql: 'UPDATE suppliers SET name = ?, phone = ? WHERE id = ?' })] }, deps);
    assert.equal(dynamic.length, 1);
});

test('snapshots entram sem substituir dados existentes e só inserções antigas são reprocessadas', async () => {
    const { database, deps } = createDatabase();
    await applyRemoteGroups([{ operations: [op({ kind: 'snapshot', table: 'credits', columns: ['id', 'balance', 'version'], params: ['c1', 1, 9] })] }], deps);
    assert.equal((database.prepare('SELECT balance FROM credits').get() as { balance: number }).balance, 1000);
    assert.equal(isSafeToReprocess(op({ kind: 'snapshot', table: 'credits' }), SQL), true);
    assert.equal(isSafeToReprocess(op({ statementId: 'ins-payment' }), SQL), true);
    assert.equal(isSafeToReprocess(op({ statementId: 'upd-credit' }), SQL), false);
});

test('reprocessar um conflito antigo aplica a operação e marca-o como resolvido', async () => {
    const { database, deps } = createDatabase();
    database.exec(`INSERT INTO sync_conflicts (id, entityType, status, createdAt) VALUES ('old', 'payments', 'pending', '2026-01-01')`);
    const result = await applyRemoteGroups([{ operations: [op({ statementId: 'ins-payment', params: ['p9', 'c1', 50] })], resolvesConflictIds: ['old'] }], deps);
    assert.equal(result.applied, 1);
    assert.equal((database.prepare(`SELECT status FROM sync_conflicts WHERE id = 'old'`).get() as { status: string }).status, 'accepted');
});
