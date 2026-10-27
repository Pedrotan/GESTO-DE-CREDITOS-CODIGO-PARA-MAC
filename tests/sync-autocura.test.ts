import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import {
    applyRemoteGroups, conflictStatements, RETAINED_FOR_ROW_SQL, statementColumns, statementRowId, UNKNOWN_COMMAND_REASON,
    type SyncOperation, type SyncStatement,
} from '../src/bibliotecas/sync-operacoes.ts';

test('identifica o registo alterado por cada comando', () => {
    assert.equal(statementRowId('INSERT INTO clients (id, name) VALUES (?, ?)', ['cl1', 'Ana']), 'cl1');
    assert.equal(statementRowId(`INSERT INTO audit_logs (action, id, details) VALUES ('create', ?, ?)`, ['a1', 'x']), 'a1');
    assert.equal(statementRowId('INSERT INTO t (name, id) VALUES (COALESCE(?, ?), ?)', ['a', 'b', 'r3']), 'r3');
    assert.equal(statementRowId(`UPDATE credits SET status = ?, version = version + 1 WHERE id = ? AND status = 'pending_approval' AND version = ?`, ['active', 'cr1', 0]), 'cr1');
    assert.equal(statementRowId('UPDATE credits SET clientId = ? WHERE clientId = ?', ['a', 'b']), null, 'clientId não é o id do registo');
    assert.equal(statementRowId('DELETE FROM payments WHERE id = ?', ['p1']), 'p1');
    assert.equal(statementRowId('INSERT INTO credit_installments (creditId, n) VALUES (?, ?)', ['cr1', 1]), null);
});

test('identifica os campos que cada comando escreve', () => {
    assert.deepEqual(statementColumns('INSERT INTO clients (id, name, phone) VALUES (?, ?, ?)'), ['id', 'name', 'phone']);
    assert.deepEqual(statementColumns(`UPDATE clients SET phone = COALESCE(?, phone), status = 'active', version = version + 1 WHERE id = ?`), ['phone', 'status', 'version']);
    assert.deepEqual(statementColumns('DELETE FROM clients WHERE id = ?'), []);
});

const SET_PHONE = 'UPDATE clients SET phone = ? WHERE id = ?';
const SET_STATUS = 'UPDATE clients SET status = ? WHERE id = ?';
const SQL = new Map([['set-phone', SET_PHONE], ['set-status', SET_STATUS]]);
const SCHEMA = `CREATE TABLE clients (id TEXT PRIMARY KEY, name TEXT, phone TEXT, status TEXT, updatedAt TEXT);
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
    const retainedForRow = async (table: string, rowId: string) =>
        database.prepare(RETAINED_FOR_ROW_SQL).all(table, rowId, JSON.stringify(rowId)) as Array<{ id: string; operation: string }>;
    return { database, deps: { sqlById: SQL, tableColumns, retainedForRow, transaction } };
};
const heal = (table: string, row: Record<string, unknown>, extra: Partial<SyncOperation> = {}): SyncOperation => ({
    id: crypto.randomUUID(), deviceId: 'pc-luanda', kind: 'snapshot', table, columns: Object.keys(row), params: Object.values(row),
    createdAt: new Date().toISOString(), commandVersion: 1, tenantId: 't', entityId: String(row.id), heal: true, ...extra,
});
const retain = async (deps: ReturnType<typeof base>['deps'], operation: Partial<SyncOperation>, reason = 'Conflito de concorrência: esperadas 1 alterações, obtidas 0.') => {
    const full = { id: crypto.randomUUID(), kind: 'statement', commandVersion: 1, tenantId: 't', createdAt: '2026-10-27T08:00:00.000Z', ...operation } as SyncOperation;
    await deps.transaction(conflictStatements([full], reason, SQL));
    return full.id;
};
const one = <T>(db: DatabaseSync, sql: string) => ({ ...(db.prepare(sql).get() as object) }) as T;
const cliente = (db: DatabaseSync) => one<{ name: string; phone: string; status: string }>(db, "SELECT name, phone, status FROM clients WHERE id = 'cl1'");
const pendentes = (db: DatabaseSync) => one<{ n: number }>(db, "SELECT COUNT(*) AS n FROM sync_conflicts WHERE status = 'pending'").n;

test('autocura: cria o registo que falta; num registo saudável a cópia não mexe em nada', async () => {
    const { database, deps } = base();
    database.exec(`INSERT INTO clients VALUES ('cl1', 'Sukeina', '923000001', 'inactive', '2026-10-27T08:00:00Z')`);
    const result = await applyRemoteGroups([
        { operations: [heal('clients', { id: 'cl-falta', name: 'Nova', phone: '9', status: 'active' })] },
        { operations: [heal('clients', { id: 'cl1', name: 'Outro nome', phone: '000', status: 'active', updatedAt: '2030-01-01T00:00:00Z' }, { serverSeq: 99 })] },
    ], deps);
    assert.deepEqual(result, { applied: 2, conflicts: 0 });
    assert.equal(one<{ name: string }>(database, "SELECT name FROM clients WHERE id = 'cl-falta'").name, 'Nova');
    assert.deepEqual(cliente(database), { name: 'Sukeina', phone: '923000001', status: 'inactive' }, 'nem uma data «mais recente» do PC muda o registo');
});

test('autocura campo a campo: só os campos da alteração retida, só do mesmo autor e pela ordem do servidor', async () => {
    const { database, deps } = base();
    // Benguela muda o telefone (seq 10) mas a alteração ficou retida aqui; Luanda (aqui) mudou o estado.
    database.exec(`INSERT INTO clients VALUES ('cl1', 'Sukeina', '923000001', 'blocked', NULL)`);
    await retain(deps, { deviceId: 'pc-benguela', statementId: 'set-phone', params: ['924111222', 'cl1'], entityId: 'cl1', serverSeq: 10 });
    // Cópia de outro dispositivo: não é o autor da alteração retida → não repõe nada.
    await applyRemoteGroups([{ operations: [heal('clients', { id: 'cl1', name: 'Sukeina', phone: '999999999', status: 'active' }, { deviceId: 'pc-huambo', serverSeq: 20 })] }], deps);
    assert.equal(cliente(database).phone, '923000001');
    assert.equal(pendentes(database), 1);
    // Cópia do autor, mas anterior à alteração na ordem do servidor → também não.
    await applyRemoteGroups([{ operations: [heal('clients', { id: 'cl1', name: 'Sukeina', phone: '911', status: 'active' }, { deviceId: 'pc-benguela', serverSeq: 5 })] }], deps);
    assert.equal(cliente(database).phone, '923000001');
    // Cópia do autor posterior: repõe só o telefone; o estado mudado aqui fica (a cópia de Benguela ainda dizia «active»).
    await applyRemoteGroups([{ operations: [heal('clients', { id: 'cl1', name: 'Sukeina M.', phone: '924111222', status: 'active' }, { deviceId: 'pc-benguela', serverSeq: 30 })] }], deps);
    assert.deepEqual(cliente(database), { name: 'Sukeina', phone: '924111222', status: 'blocked' });
    assert.equal(pendentes(database), 0, 'a alteração retida fica resolvida');
});

test('autocura: campos alterados aqui e ainda por enviar nunca são repostos', async () => {
    const { database, deps } = base();
    database.exec(`INSERT INTO clients VALUES ('cl1', 'Sukeina', '923000001', 'inactive', NULL)`);
    await retain(deps, { deviceId: 'pc-benguela', statementId: 'set-phone', params: ['924111222', 'cl1'], entityId: 'cl1', serverSeq: 10 });
    await applyRemoteGroups([{ operations: [heal('clients', { id: 'cl1', name: 'Sukeina', phone: '924111222', status: 'active' },
        { deviceId: 'pc-benguela', serverSeq: 30, keepColumns: ['phone'] })] }], deps);
    assert.equal(cliente(database).phone, '923000001', 'o telefone alterado aqui segue depois para os outros');
});

test('autocura: alteração de um comando desconhecido do mesmo autor repõe o registo inteiro (menos o que está por enviar)', async () => {
    const { database, deps } = base();
    database.exec(`INSERT INTO clients VALUES ('cl9', 'Antigo', '1', 'inactive', NULL)`);
    await retain(deps, { deviceId: 'pc-antigo', statementId: 'hash-que-ninguem-conhece', params: ['x'], entityId: 'cl9', serverSeq: 3 }, UNKNOWN_COMMAND_REASON);
    const outra = await retain(deps, { deviceId: 'pc-antigo', statementId: 'hash-que-ninguem-conhece', params: ['y'], entityId: 'cl-outro', serverSeq: 4 }, UNKNOWN_COMMAND_REASON);
    await applyRemoteGroups([{ operations: [heal('clients', { id: 'cl9', name: 'Novo', phone: '2', status: 'active' }, { deviceId: 'pc-antigo', serverSeq: 8, keepColumns: ['status'] })] }], deps);
    assert.deepEqual(one(database, "SELECT name, phone, status FROM clients WHERE id = 'cl9'"), { name: 'Novo', phone: '2', status: 'inactive' });
    assert.equal(one<{ status: string }>(database, `SELECT status FROM sync_conflicts WHERE id = '${outra}'`).status, 'pending', 'o conflito de outro registo não é tocado');
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
    assert.equal(pendentes(database), 0);
});
