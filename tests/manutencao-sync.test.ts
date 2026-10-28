import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { executarManutencaoSync, type ComandoManutencao } from '../src/bibliotecas/manutencao-sync.ts';

// Base como a do computador depois de receber os repetidos (Paulo Armando Narciso registado em dois computadores).
const base = () => {
    const db = new DatabaseSync(':memory:');
    db.exec(`CREATE TABLE clients (id TEXT PRIMARY KEY, name TEXT, nif TEXT, createdAt TEXT, deletedAt TEXT, deletedBy TEXT);
        CREATE TABLE credits (id TEXT PRIMARY KEY, clientId TEXT, clientName TEXT);
        CREATE TABLE contracts (id TEXT PRIMARY KEY, clientId TEXT, clientName TEXT);
        CREATE TABLE credit_approvals (id TEXT PRIMARY KEY, clientId TEXT, clientName TEXT);
        CREATE TABLE accounting_entries (id TEXT PRIMARY KEY);
        CREATE TABLE notifications (id TEXT PRIMARY KEY, title TEXT, message TEXT, timestamp TEXT);
        CREATE TABLE sync_conflicts (id TEXT PRIMARY KEY, entityType TEXT, entityId TEXT, operation TEXT, status TEXT, createdAt TEXT, resolutionNote TEXT, resolvedBy TEXT, resolvedAt TEXT);
        INSERT INTO clients VALUES ('paulo-a', 'Paulo Armando Narciso ', '000422514KS033', '2026-10-26T09:23:48.949Z', NULL, NULL);
        INSERT INTO clients VALUES ('paulo-b', 'Paulo Armando Narciso', '000422514KS033', '2026-10-26T18:22:16.022Z', NULL, NULL);
        INSERT INTO credits VALUES ('cr-1', 'paulo-b', 'Paulo Armando Narciso');
        INSERT INTO contracts VALUES ('cr-1', 'paulo-b', 'Paulo Armando Narciso');
        INSERT INTO credit_approvals VALUES ('ap-1', 'paulo-b', 'Paulo Armando Narciso');
        INSERT INTO accounting_entries VALUES ('disbursement:origination:cr-1');`);
    const conflito = (id: string, entityType: string, operation: object) =>
        db.prepare(`INSERT INTO sync_conflicts VALUES (?, ?, NULL, ?, 'pending', '2026-10-28', NULL, NULL, NULL)`).run(id, entityType, JSON.stringify(operation));
    // «Apagar definitivamente» de uma ficha que já não existe aqui; lançamento recebido outra vez; um conflito verdadeiro.
    conflito('c-purge', 'clients', { kind: 'statement', reason: 'Conflito de concorrência: esperadas 1 alterações, obtidas 0.', params: ['purged:923f877a-22d3-4e9f-96de-5eed6b161cfc', 'eca454ca-e27f-48de-b260-03381c07ccfe'] });
    conflito('c-ledger', 'accounting_entries', { kind: 'snapshot', reason: 'Cadeia contabilística inválida: o lançamento anterior não existe', columns: ['id'], params: ['disbursement:origination:cr-1'] });
    conflito('c-real', 'credits', { kind: 'statement', reason: 'Conflito de concorrência: esperadas 1 alterações, obtidas 0.', params: ['active', 'cr-1'] });
    const alerta = (id: string, message: string, timestamp: string) =>
        db.prepare('INSERT INTO notifications VALUES (?, ?, ?, ?)').run(id, 'Alerta de segurança: Tentativa de acção sem permissão (repetido 5 vezes)', message, timestamp);
    alerta('falso', 'Canal "db-transaction": A decisão exige o responsável autenticado e diferente do solicitante.', '2026-10-28T10:09:00.000Z');
    alerta('verdadeiro', 'Canal "db-transaction": Sem permissao: manage_users.', '2026-10-28T10:10:00.000Z');
    const deps = {
        all: async <T,>(sql: string, params: unknown[] = []) => db.prepare(sql).all(...(params as never[])).map(row => ({ ...row })) as T[],
        transaction: async (statements: ComandoManutencao[]) => {
            db.exec('BEGIN');
            try { for (const s of statements) db.prepare(s.sql).run(...((s.params || []) as never[])); db.exec('COMMIT'); }
            catch (error) { db.exec('ROLLBACK'); throw error; }
        },
        sqlById: new Map<string, string>(),
    };
    return { db, deps };
};
const um = <T,>(db: DatabaseSync, sql: string) => ({ ...(db.prepare(sql).get() as object) }) as T;

test('manutenção: funde os repetidos sem tocar nas aprovações, resolve os conflitos sem efeito e só apaga os alertas falsos', async () => {
    const { db, deps } = base();
    const result = await executarManutencaoSync(deps, { limparAlertasFalsos: true });
    assert.deepEqual(result.erros, []);
    assert.equal(result.fundidos, 1);
    assert.equal(um<{ n: number }>(db, 'SELECT COUNT(*) AS n FROM clients WHERE deletedAt IS NULL').n, 1, 'fica um só Paulo');
    assert.equal(um<{ clientId: string }>(db, "SELECT clientId FROM credits WHERE id = 'cr-1'").clientId, 'paulo-a');
    assert.equal(um<{ clientId: string }>(db, "SELECT clientId FROM contracts WHERE id = 'cr-1'").clientId, 'paulo-a');
    assert.equal(um<{ clientId: string }>(db, "SELECT clientId FROM credit_approvals WHERE id = 'ap-1'").clientId, 'paulo-b', 'a aprovação (registo da decisão) não muda');
    assert.equal(result.resolvidos, 2);
    assert.deepEqual(db.prepare("SELECT id FROM sync_conflicts WHERE status = 'pending'").all().map(row => (row as { id: string }).id), ['c-real'], 'o conflito verdadeiro continua para ver');
    assert.equal(result.alertasLimpos, 1);
    assert.deepEqual(db.prepare('SELECT id FROM notifications').all().map(row => (row as { id: string }).id), ['verdadeiro'], 'um alerta de segurança verdadeiro fica');
    const again = await executarManutencaoSync(deps, { limparAlertasFalsos: true });
    assert.equal(again.fundidos + again.resolvidos + again.alertasLimpos + again.religados, 0, 'depois de feita, nada a fazer');
});
