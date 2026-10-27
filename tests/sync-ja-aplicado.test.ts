import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { applyRemoteGroups, conflictStatements, reprocessableGroups, type SyncOperation, type SyncStatement } from '../src/bibliotecas/sync-operacoes.ts';

// Pedido de aumento de limite noutro computador: actualiza o crédito (com versão) e grava auditoria e notificação.
const SQL = new Map([
    ['upd-credit', 'UPDATE credits SET status = ?, version = version + 1 WHERE id = ? AND version = ?'],
    ['ins-audit', 'INSERT INTO audit_logs (id, details) VALUES (?, ?)'],
    ['ins-notif-ignore', 'INSERT OR IGNORE INTO notifications (id, title) VALUES (?, ?)'],
]);
const base = () => {
    const database = new DatabaseSync(':memory:');
    database.exec(`CREATE TABLE credits (id TEXT PRIMARY KEY, status TEXT, version INTEGER);
        CREATE TABLE audit_logs (id TEXT PRIMARY KEY, details TEXT);
        CREATE TABLE notifications (id TEXT PRIMARY KEY, title TEXT);
        CREATE TABLE sync_conflicts (id TEXT PRIMARY KEY, entityType TEXT, entityId TEXT, operation TEXT, status TEXT, createdAt TEXT, resolutionNote TEXT, resolvedBy TEXT, resolvedAt TEXT);
        INSERT INTO credits VALUES ('cr1', 'active', 0);`);
    const transaction = async (statements: SyncStatement[]) => {
        database.exec('BEGIN');
        try {
            for (const s of statements) {
                const r = database.prepare(s.sql).run(...((s.params || []) as never[]));
                if (s.expectChanges !== undefined && Number(r.changes) !== s.expectChanges) throw new Error(`Conflito de concorrência: esperadas ${s.expectChanges} alterações, obtidas ${r.changes}.`);
            }
            database.exec('COMMIT');
        } catch (error) { database.exec('ROLLBACK'); throw error; }
    };
    const tableColumns = async (table: string) => new Set((database.prepare(`PRAGMA table_info("${table}")`).all() as Array<{ name: string }>).map(r => r.name));
    const rowExists = async (table: string, rowId: string) => Boolean(database.prepare(`SELECT 1 FROM "${table}" WHERE id = ?`).get(rowId));
    return { database, deps: { sqlById: SQL, tableColumns, rowExists, transaction } };
};
const tx = (): SyncOperation[] => {
    const meta = { txId: 'TX-LIMITE', txSize: 3, deviceId: 'pc-luanda', kind: 'statement' as const, commandVersion: 1, tenantId: 't', createdAt: '2026-10-27T16:20:03.000Z' };
    return [
        { ...meta, id: 'o1', statementId: 'upd-credit', params: ['limit_review', 'cr1', 0], expectChanges: 1 },
        { ...meta, id: 'o2', statementId: 'ins-audit', params: ['audit-1', 'Pedido de aumento de limite'] },
        { ...meta, id: 'o3', statementId: 'ins-notif-ignore', params: ['limit-escalation-timer:cr1', 'Prazo'] },
    ];
};
const pending = (db: DatabaseSync) => (db.prepare("SELECT COUNT(*) AS n FROM sync_conflicts WHERE status = 'pending'").get() as { n: number }).n;

test('transacção que já foi aplicada e volta a chegar não é conflito', async () => {
    const { database, deps } = base();
    assert.deepEqual(await applyRemoteGroups([{ operations: tx() }], deps), { applied: 3, conflicts: 0 });
    // O histórico volta a chegar: a actualização com versão falha, mas a auditoria da transacção já existe aqui.
    assert.deepEqual(await applyRemoteGroups([{ operations: tx() }], deps), { applied: 3, conflicts: 0 });
    assert.equal(pending(database), 0);
});

test('conflitos antigos de transacções já aplicadas ficam resolvidos no reprocessamento', async () => {
    const { database, deps } = base();
    await applyRemoteGroups([{ operations: tx() }], deps);
    await deps.transaction(conflictStatements(tx(), 'UNIQUE constraint failed: audit_logs.id', SQL));
    assert.equal(pending(database), 3);
    await applyRemoteGroups(reprocessableGroups(database.prepare("SELECT id, operation FROM sync_conflicts WHERE status = 'pending'").all() as never[], SQL), deps);
    assert.equal(pending(database), 0);
});

test('uma inserção «OR IGNORE» que já existe não prova nada: o conflito real continua', async () => {
    const { database, deps } = base();
    database.exec(`INSERT INTO notifications VALUES ('limit-escalation-timer:cr1', 'Prazo');`);
    const sóNotificação = tx().filter(operation => operation.id !== 'o2').map(operation => ({ ...operation, txSize: 2 }));
    database.exec(`UPDATE credits SET version = 5`);
    assert.equal((await applyRemoteGroups([{ operations: sóNotificação }], deps)).conflicts, 2);
    assert.equal(pending(database), 2);
});
