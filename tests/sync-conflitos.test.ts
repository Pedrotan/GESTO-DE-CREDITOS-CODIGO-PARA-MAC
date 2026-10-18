import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { conflictArchiveStatements, conflictNote, conflictReportRows, conflictStatus, filterConflicts, type SyncConflict } from '../src/bibliotecas/sync-conflitos.ts';

const row = (id: string): SyncConflict => ({ id, entityType: 'credits', entityId: `credit-${id}`, operation: JSON.stringify({ reason: 'Dependência em falta', params: [123] }), status: 'pending', createdAt: '2026-10-17T10:00:00Z', resolutionNote: null, resolvedBy: null, resolvedAt: null });
const setup = () => {
    const db = new DatabaseSync(':memory:');
    db.exec(`CREATE TABLE sync_conflicts (id TEXT PRIMARY KEY, status TEXT CHECK(status IN ('pending','accepted','rejected')), resolutionNote TEXT, resolvedBy TEXT, resolvedAt TEXT);
        CREATE TABLE audit_logs (id TEXT PRIMARY KEY, timestamp TEXT, userId TEXT, userName TEXT, action TEXT, entity TEXT, details TEXT, metadata TEXT);
        CREATE TABLE credits (id TEXT PRIMARY KEY, amount INTEGER);
        INSERT INTO credits VALUES ('credit-a', 250000);
        INSERT INTO sync_conflicts (id,status) VALUES ('a','pending'),('b','pending');`);
    return db;
};
const execute = (db: DatabaseSync, statements: ReturnType<typeof conflictArchiveStatements>) => {
    db.exec('BEGIN');
    try {
        for (const statement of statements) {
            const result = db.prepare(statement.sql).run(...statement.params as (string | number | null)[]);
            if (statement.expectChanges !== undefined && Number(result.changes) !== statement.expectChanges) throw new Error('Estado alterado');
        }
        db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
};

test('arquivar conserva os conflitos e os dados financeiros e regista auditoria; restaurar volta a pending', () => {
    const db = setup();
    execute(db, conflictArchiveStatements([row('a'), row('b')], 'archive', 'admin', 'Administrador', 'Arquivo para revisão futura.'));
    const archived = db.prepare("SELECT * FROM sync_conflicts WHERE id='a'").get() as Partial<SyncConflict>;
    assert.equal(conflictStatus({ ...row('a'), ...archived }), 'archived');
    assert.equal(conflictNote({ ...row('a'), ...archived }), 'Arquivo para revisão futura.');
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM sync_conflicts').get()?.n, 2);
    assert.equal(db.prepare('SELECT amount FROM credits').get()?.amount, 250000);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM audit_logs').get()?.n, 1);
    execute(db, conflictArchiveStatements([{ ...row('a'), ...archived }], 'restore', 'admin', 'Administrador', 'Reabrir para análise manual.'));
    assert.equal(db.prepare("SELECT status FROM sync_conflicts WHERE id='a'").get()?.status, 'pending');
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM audit_logs').get()?.n, 2);
    db.close();
});

test('mudança concorrente impede arquivo parcial de uma selecção', () => {
    const db = setup();
    db.exec("UPDATE sync_conflicts SET status='accepted' WHERE id='b'");
    assert.throws(() => execute(db, conflictArchiveStatements([row('a'), row('b')], 'archive', 'admin', 'Administrador', 'Arquivar estes dois registos.')), /Estado alterado/);
    assert.equal(db.prepare("SELECT status FROM sync_conflicts WHERE id='a'").get()?.status, 'pending');
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM audit_logs').get()?.n, 0);
    assert.throws(() => conflictArchiveStatements([{ ...row('a'), status: 'accepted' }], 'archive', 'admin', 'Administrador', 'Não pode arquivar resolvidos.'), /mudaram/);
    db.close();
});

test('filtros distinguem arquivo de rejeição e o relatório mantém todos os registos acima de 100', () => {
    const rows = Array.from({ length: 237 }, (_, index) => row(String(index)));
    rows[0] = { ...rows[0], status: 'rejected', resolutionNote: '[ARQUIVADO] Arquivo de teste' };
    rows[1] = { ...rows[1], status: 'rejected', resolutionNote: 'Decisão de rejeição manual.' };
    assert.equal(filterConflicts(rows, '', 'archived', 'all').length, 1);
    assert.equal(filterConflicts(rows, '', 'rejected', 'all').length, 1);
    assert.equal(filterConflicts(rows, 'Dependência', 'pending', 'credits').length, 235);
    assert.equal(filterConflicts(rows, 'Decisão de rejeição', 'all', 'all').length, 1);
    assert.equal(conflictReportRows(rows).length, 237);
    assert.equal(conflictReportRows(rows)[0][4], 'Arquivado');
    assert.equal(conflictReportRows(rows)[236][5], 'Dependência em falta');
});
