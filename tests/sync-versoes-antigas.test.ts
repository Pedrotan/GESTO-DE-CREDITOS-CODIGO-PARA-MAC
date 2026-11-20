import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { RENDERER_SQL_BY_ID } from '../electron/renderer-sql-allowlist.ts';
import { RENDERER_SQL_LEGACY_BY_ID } from '../electron/renderer-sql-legacy.ts';
import { SYNC_SQL_BY_ID } from '../electron/sync-sql.ts';
import { applyRemoteGroups, reprocessableGroups, type SyncOperation, type SyncStatement } from '../src/bibliotecas/sync-operacoes.ts';

test('a sincronização aceita os comandos desta versão e os de escrita das versões anteriores', () => {
    assert.ok(RENDERER_SQL_LEGACY_BY_ID.size > 0, 'o registo de comandos antigos não pode ficar vazio');
    for (const [id, sql] of RENDERER_SQL_BY_ID) assert.equal(SYNC_SQL_BY_ID.get(id), sql);
    for (const [id, sql] of RENDERER_SQL_LEGACY_BY_ID) {
        assert.equal(SYNC_SQL_BY_ID.get(id), sql);
        assert.equal(createHash('sha256').update(sql).digest('hex'), id, 'o identificador é o hash do SQL');
        assert.ok(!RENDERER_SQL_BY_ID.has(id), 'só ficam no registo antigo os que saíram da lista actual');
        assert.match(sql, /^(INSERT|UPDATE|DELETE|REPLACE)\b/i, 'só comandos de escrita');
        if (/^DELETE\b/i.test(sql)) {
            assert.match(sql, /\bWHERE\b/i, 'nunca um DELETE sem WHERE');
            assert.doesNotMatch(sql, /^DELETE FROM audit_logs\b/i, 'a auditoria nunca é apagada por outro dispositivo');
        }
    }
    // O registo de clientes antes dos campos de naturalidade e morada (versões de Outubro) continua reconhecido.
    assert.ok([...RENDERER_SQL_LEGACY_BY_ID.values()].some(sql => /^INSERT INTO clients \(/.test(sql)));
});

// Computador de um colaborador ainda com a versão antiga: regista o cliente com o comando antigo e, a seguir,
// aprova o crédito. A versão nova não conhecia o comando antigo: o cliente ficava retido e a aprovação falhava.
const OLD_CLIENT = 'INSERT INTO clients (id, name) VALUES (?, ?)';
const NEW_SQL = new Map<string, string>([
    ['ins-credit', 'INSERT INTO credits (id, clientId, status) VALUES (?, ?, ?)'],
    ['approve', `UPDATE credits SET status = 'active' WHERE id = ? AND status = 'pending_approval' AND EXISTS (SELECT 1 FROM clients WHERE id = credits.clientId)`],
]);
const op = (partial: Partial<SyncOperation>): SyncOperation => ({
    id: crypto.randomUUID(), deviceId: 'computador-antigo', kind: 'statement', params: [], createdAt: '2026-10-27T08:07:58.000Z',
    commandVersion: 1, tenantId: 't', ...partial,
});

test('alterações de uma versão antiga: o cliente e o que depende dele são reaplicados pela ordem original', async () => {
    const database = new DatabaseSync(':memory:');
    database.exec(`CREATE TABLE clients (id TEXT PRIMARY KEY, name TEXT);
        CREATE TABLE credits (id TEXT PRIMARY KEY, clientId TEXT, status TEXT);
        CREATE TABLE sync_conflicts (id TEXT PRIMARY KEY, entityType TEXT, entityId TEXT, operation TEXT, status TEXT, createdAt TEXT, resolutionNote TEXT, resolvedBy TEXT, resolvedAt TEXT);`);
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
    const tableColumns = async () => new Set<string>();
    const cliente = op({ statementId: 'old-client', params: ['cl1', 'Stanislau'], createdAt: '2026-10-27T08:07:58.000Z' });
    const credito = op({ statementId: 'ins-credit', params: ['cr1', 'cl1', 'pending_approval'], createdAt: '2026-10-27T08:08:50.000Z' });
    const aprovacao = op({ statementId: 'approve', params: ['cr1'], expectChanges: 1, createdAt: '2026-10-27T08:08:51.000Z' });

    // Antes da correcção: o comando antigo é desconhecido e a aprovação falha por o cliente não existir.
    const antes = await applyRemoteGroups([[cliente], [credito], [aprovacao]].map(operations => ({ operations })), { sqlById: NEW_SQL, tableColumns, transaction });
    assert.deepEqual(antes, { applied: 1, conflicts: 2 });

    // Com o registo dos comandos antigos: o reprocessamento aplica o cliente e depois a aprovação.
    const sqlById = new Map([['old-client', OLD_CLIENT], ...NEW_SQL]);
    const rows = database.prepare("SELECT id, operation FROM sync_conflicts WHERE status = 'pending'").all() as Array<{ id: string; operation: string }>;
    const grupos = reprocessableGroups(rows, sqlById);
    assert.deepEqual(grupos.map(grupo => grupo.operations[0].statementId), ['old-client', 'approve'], 'pela ordem em que foram feitas');
    assert.equal((await applyRemoteGroups(grupos, { sqlById, tableColumns, transaction })).applied, 2);
    assert.equal((database.prepare("SELECT status FROM credits WHERE id = 'cr1'").get() as { status: string }).status, 'active');
    assert.equal((database.prepare("SELECT COUNT(*) AS n FROM sync_conflicts WHERE status = 'pending'").get() as { n: number }).n, 0);

    // Uma alteração com condição que continua a não se cumprir (crédito já activo) fica pendente, sem duplicar.
    const repetida = op({ statementId: 'approve', params: ['cr1'], expectChanges: 1 });
    await applyRemoteGroups([{ operations: [repetida] }], { sqlById, tableColumns, transaction });
    const pendentes = database.prepare("SELECT id, operation FROM sync_conflicts WHERE status = 'pending'").all() as Array<{ id: string; operation: string }>;
    assert.equal(pendentes.length, 1);
    assert.equal((await applyRemoteGroups(reprocessableGroups(pendentes, sqlById), { sqlById, tableColumns, transaction })).conflicts, 1);
    assert.equal((database.prepare("SELECT COUNT(*) AS n FROM sync_conflicts").get() as { n: number }).n, 3, 'os dois resolvidos e o novo, sem duplicados');
});
