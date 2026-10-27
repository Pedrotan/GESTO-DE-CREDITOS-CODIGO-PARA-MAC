import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { applyRemoteGroups, conflictStatements, statementRowId, UNKNOWN_COMMAND_REASON, type SyncOperation, type SyncStatement } from '../src/bibliotecas/sync-operacoes.ts';

test('identifica o registo alterado por cada comando', () => {
    assert.equal(statementRowId('INSERT INTO clients (id, name) VALUES (?, ?)', ['cl1', 'Ana']), 'cl1');
    assert.equal(statementRowId(`INSERT INTO audit_logs (action, id, details) VALUES ('create', ?, ?)`, ['a1', 'x']), 'a1');
    assert.equal(statementRowId('INSERT INTO t (name, id) VALUES (COALESCE(?, ?), ?)', ['a', 'b', 'r3']), 'r3');
    assert.equal(statementRowId(`UPDATE credits SET status = ?, version = version + 1 WHERE id = ? AND status = 'pending_approval' AND version = ?`, ['active', 'cr1', 0]), 'cr1');
    assert.equal(statementRowId('UPDATE credits SET clientId = ? WHERE clientId = ?', ['a', 'b']), null, 'clientId não é o id do registo');
    assert.equal(statementRowId('DELETE FROM payments WHERE id = ?', ['p1']), 'p1');
    assert.equal(statementRowId('INSERT INTO credit_installments (creditId, n) VALUES (?, ?)', ['cr1', 1]), null);
});

const SCHEMA = `CREATE TABLE credits (id TEXT PRIMARY KEY, status TEXT, version INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE clients (id TEXT PRIMARY KEY, name TEXT, updatedAt TEXT);
    CREATE TABLE accounting_entries (id TEXT PRIMARY KEY, amount INTEGER, previousHash TEXT);
    CREATE TRIGGER entries_immutable BEFORE UPDATE ON accounting_entries BEGIN SELECT RAISE(ABORT, 'Lançamento imutável'); END;
    CREATE TRIGGER entries_chain BEFORE INSERT ON accounting_entries WHEN NEW.previousHash IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM accounting_entries WHERE id = NEW.previousHash)
        BEGIN SELECT RAISE(ABORT, 'Cadeia contabilística inválida: o lançamento anterior não existe'); END;
    CREATE TABLE sync_conflicts (id TEXT PRIMARY KEY, entityType TEXT, entityId TEXT, operation TEXT, status TEXT, createdAt TEXT, resolutionNote TEXT, resolvedBy TEXT, resolvedAt TEXT);`;
const base = () => {
    const database = new DatabaseSync(':memory:');
    database.exec(SCHEMA);
    const transaction = async (statements: SyncStatement[]) => {
        database.exec('BEGIN');
        try {
            for (const s of statements) database.prepare(s.sql).run(...((s.params || []) as never[]));
            database.exec('COMMIT');
        } catch (error) { database.exec('ROLLBACK'); throw error; }
    };
    const tableColumns = async (table: string) => new Set((database.prepare(`PRAGMA table_info("${table}")`).all() as Array<{ name: string }>).map(r => r.name));
    return { database, deps: { sqlById: new Map<string, string>(), tableColumns, transaction } };
};
const heal = (table: string, row: Record<string, unknown>): SyncOperation => ({
    id: crypto.randomUUID(), deviceId: 'computador-origem', kind: 'snapshot', table, columns: Object.keys(row), params: Object.values(row),
    createdAt: new Date().toISOString(), commandVersion: 1, tenantId: 't', entityId: String(row.id), heal: true,
});
const one = <T>(db: DatabaseSync, sql: string) => db.prepare(sql).get() as T;

test('autocura: cria o registo que falta e só substitui o que é mais antigo', async () => {
    const { database, deps } = base();
    database.exec(`INSERT INTO credits VALUES ('cr-antigo', 'pending_approval', 1), ('cr-novo', 'active', 5);
        INSERT INTO clients VALUES ('cl1', 'Nome antigo', '2026-10-27T08:00:00.000Z');`);
    const result = await applyRemoteGroups([
        heal('credits', { id: 'cr-falta', status: 'active', version: 2 }),
        heal('credits', { id: 'cr-antigo', status: 'active', version: 2 }),
        heal('credits', { id: 'cr-novo', status: 'pending_approval', version: 3 }),
        heal('clients', { id: 'cl1', name: 'Nome novo', updatedAt: '2026-10-27T09:00:00.000Z' }),
    ].map(operation => ({ operations: [operation] })), deps);
    assert.deepEqual(result, { applied: 4, conflicts: 0 });
    assert.equal(one<{ status: string }>(database, "SELECT status FROM credits WHERE id = 'cr-falta'").status, 'active', 'registo em falta criado');
    assert.equal(one<{ status: string }>(database, "SELECT status FROM credits WHERE id = 'cr-antigo'").status, 'active', 'cópia mais recente substitui');
    assert.equal(one<{ status: string }>(database, "SELECT status FROM credits WHERE id = 'cr-novo'").status, 'active', 'a cópia mais antiga nunca ganha');
    assert.equal(one<{ name: string }>(database, "SELECT name FROM clients WHERE id = 'cl1'").name, 'Nome novo');
});

test('autocura: lançamentos contabilísticos só se acrescentam e uma cópia que não se aplica nunca vira conflito', async () => {
    const { database, deps } = base();
    database.exec(`INSERT INTO accounting_entries VALUES ('e1', 100, NULL);`);
    const result = await applyRemoteGroups([
        heal('accounting_entries', { id: 'e1', amount: 999, previousHash: null }),
        heal('accounting_entries', { id: 'e3', amount: 300, previousHash: 'e2' }),
        heal('accounting_entries', { id: 'e2', amount: 200, previousHash: 'e1' }),
    ].map(operation => ({ operations: [operation] })), deps);
    assert.equal(result.conflicts, 0);
    assert.equal(one<{ amount: number }>(database, "SELECT amount FROM accounting_entries WHERE id = 'e1'").amount, 100, 'imutável');
    assert.equal(one<{ n: number }>(database, 'SELECT COUNT(*) AS n FROM accounting_entries').n, 2, 'e3 chegou antes do anterior e fica para a próxima cópia');
    assert.equal(one<{ n: number }>(database, 'SELECT COUNT(*) AS n FROM sync_conflicts').n, 0);
});

test('autocura: fecha os conflitos do registo corrigido, mesmo os de comandos desconhecidos', async () => {
    const { database, deps } = base();
    const desconhecida: SyncOperation = {
        id: 'op-x', deviceId: 'outro', kind: 'statement', statementId: 'hash-que-ninguem-conhece', params: ['cr9', 'active'],
        createdAt: '2026-10-27T08:07:59.000Z', commandVersion: 1, tenantId: 't', entityId: 'cr9',
    };
    const outra: SyncOperation = { ...desconhecida, id: 'op-y', params: ['cr-outro'], entityId: 'cr-outro' };
    await deps.transaction([...conflictStatements([desconhecida], UNKNOWN_COMMAND_REASON, new Map()), ...conflictStatements([outra], UNKNOWN_COMMAND_REASON, new Map())]);
    await applyRemoteGroups([{ operations: [heal('credits', { id: 'cr9', status: 'active', version: 4 })] }], deps);
    const estados = database.prepare('SELECT id, status, resolutionNote FROM sync_conflicts ORDER BY id').all() as Array<{ id: string; status: string; resolutionNote: string | null }>;
    assert.equal(estados[0].status, 'accepted');
    assert.match(String(estados[0].resolutionNote), /Corrigido automaticamente/);
    assert.equal(estados[1].status, 'pending', 'o conflito de outro registo não é tocado');
});
