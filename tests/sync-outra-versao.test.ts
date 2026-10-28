import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import {
    applyRemoteGroups, isOtherVersionReason, reprocessableGroups, SUPPORTED_COMMAND_VERSIONS, UNKNOWN_COMMAND_REASON,
    type SyncOperation, type SyncStatement,
} from '../src/bibliotecas/sync-operacoes.ts';
import { translateReason } from '../src/bibliotecas/sync-conflitos.ts';

const SQL = new Map([['ins-client', 'INSERT INTO clients (id, name) VALUES (?, ?)']]);
const base = () => {
    const database = new DatabaseSync(':memory:');
    database.exec(`CREATE TABLE clients (id TEXT PRIMARY KEY, name TEXT);
        CREATE TABLE sync_conflicts (id TEXT PRIMARY KEY, entityType TEXT, entityId TEXT, operation TEXT, status TEXT, createdAt TEXT, resolutionNote TEXT, resolvedBy TEXT, resolvedAt TEXT);`);
    const transaction = async (statements: SyncStatement[]) => {
        database.exec('BEGIN');
        try { for (const s of statements) database.prepare(s.sql).run(...((s.params || []) as never[])); database.exec('COMMIT'); }
        catch (error) { database.exec('ROLLBACK'); throw error; }
    };
    const tableColumns = async (table: string) => new Set((database.prepare(`PRAGMA table_info("${table}")`).all() as Array<{ name: string }>).map(r => r.name));
    return { database, deps: { sqlById: SQL, tableColumns, transaction } };
};
const op = (partial: Partial<SyncOperation>): SyncOperation => ({
    id: crypto.randomUUID(), deviceId: 'pc-novo', kind: 'statement', statementId: 'ins-client', params: ['c1', 'Osvaldo'],
    createdAt: '2026-10-27T12:00:00.000Z', commandVersion: 1, tenantId: 't', entityId: 'c1', ...partial,
});
const pending = (db: DatabaseSync) => db.prepare("SELECT id, operation FROM sync_conflicts WHERE status = 'pending'").all() as Array<{ id: string; operation: string }>;

test('formato de uma versão mais recente: fica retido em vez de ser deitado fora', async () => {
    const { database, deps } = base();
    const futura = op({ commandVersion: 2 });
    const copia = op({ kind: 'snapshot', table: 'clients', columns: ['id', 'name'], params: ['c2', 'Cópia'], commandVersion: 2, heal: true, entityId: 'c2' });
    const result = await applyRemoteGroups([{ operations: [futura] }, { operations: [copia] }], deps);
    assert.deepEqual(result, { applied: 0, conflicts: 2 }, 'as duas ficam retidas, também a cópia da autocura');
    assert.equal((database.prepare('SELECT COUNT(*) AS n FROM clients').get() as { n: number }).n, 0, 'nada aplicado às cegas');
    const rows = pending(database);
    assert.equal(rows.length, 2);
    assert.ok(rows.every(row => isOtherVersionReason(JSON.parse(row.operation).reason)));
    assert.match(translateReason(JSON.parse(rows[0].operation).reason), /versão mais recente do sistema/);
    assert.equal(reprocessableGroups(rows, SQL).length, 0, 'esta versão ainda não sabe aplicá-las');
});

test('depois de actualizar: o formato passa a ser conhecido e a alteração retida aplica-se sozinha', async () => {
    const { database, deps } = base();
    await applyRemoteGroups([{ operations: [op({ commandVersion: 2 })] }], deps);
    SUPPORTED_COMMAND_VERSIONS.add(2);
    try {
        const groups = reprocessableGroups(pending(database), SQL);
        assert.equal(groups.length, 1);
        assert.equal((await applyRemoteGroups(groups, deps)).applied, 1);
        assert.equal((database.prepare("SELECT name FROM clients WHERE id = 'c1'").get() as { name: string }).name, 'Osvaldo');
        assert.equal(pending(database).length, 0);
    } finally {
        SUPPORTED_COMMAND_VERSIONS.delete(2);
    }
});

test('comando desconhecido conta também como «de outra versão»', () => {
    assert.ok(isOtherVersionReason(UNKNOWN_COMMAND_REASON));
    assert.ok(!isOtherVersionReason('UNIQUE constraint failed: clients.nif'));
});
