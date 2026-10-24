import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import {
    applyRemoteGroups, conflictStatements, groupOperations, markIncomplete, reprocessableGroups, splitExpired, stampReceived,
    type SyncOperation, type SyncStatement,
} from '../src/bibliotecas/sync-operacoes.ts';

// Aprovação de crédito noutro computador: decisão + desembolso + activação na mesma transacção.
const SQL = new Map<string, string>([
    ['upd-credit', `UPDATE credits SET status = 'active', version = version + 1 WHERE id = ? AND status = 'pending_approval' AND version = ?`],
    ['ins-approval', 'INSERT INTO credit_approvals (id, creditId, decision) VALUES (?, ?, ?)'],
    ['ins-entry', 'INSERT INTO accounting_entries (id, creditId, amount) VALUES (?, ?, ?)'],
]);
const DIA = 86_400_000;
const criado = new Date(Date.now() - 3 * DIA).toISOString(); // aprovado há 3 dias, recebido só agora
const op = (partial: Partial<SyncOperation>): SyncOperation => ({
    id: crypto.randomUUID(), deviceId: 'computador-osvaldo', kind: 'statement', params: [], createdAt: criado, commandVersion: 1, tenantId: 't', ...partial,
});
const aprovacao = () => {
    const tx = { txId: 'TX-APROVAR', txSize: 3 };
    return [
        op({ ...tx, statementId: 'upd-credit', params: ['c1', 0], expectChanges: 1, createdAt: '2026-10-20T07:38:59.800Z' }),
        op({ ...tx, statementId: 'ins-approval', params: ['a1', 'c1', 'approved'], createdAt: '2026-10-20T07:38:59.801Z' }),
        op({ ...tx, statementId: 'ins-entry', params: ['e1', 'c1', 150000], createdAt: '2026-10-20T07:38:59.802Z' }),
    ];
};
const base = () => {
    const database = new DatabaseSync(':memory:');
    database.exec(`CREATE TABLE credits (id TEXT PRIMARY KEY, status TEXT, version INTEGER);
        CREATE TABLE credit_approvals (id TEXT PRIMARY KEY, creditId TEXT, decision TEXT);
        CREATE TABLE accounting_entries (id TEXT PRIMARY KEY, creditId TEXT, amount INTEGER);
        CREATE TABLE sync_conflicts (id TEXT PRIMARY KEY, entityType TEXT, entityId TEXT, operation TEXT, status TEXT, createdAt TEXT, resolutionNote TEXT, resolvedBy TEXT, resolvedAt TEXT);
        INSERT INTO credits VALUES ('c1', 'pending_approval', 0);`);
    const transaction = async (statements: SyncStatement[]) => {
        database.exec('BEGIN');
        try {
            for (const s of statements) {
                const r = database.prepare(s.sql).run(...((s.params || []) as never[]));
                if (s.expectChanges !== undefined && Number(r.changes) !== s.expectChanges) throw new Error('Conflito de concorrência');
            }
            database.exec('COMMIT');
        } catch (error) { database.exec('ROLLBACK'); throw error; }
    };
    const tableColumns = async (table: string) => new Set((database.prepare(`PRAGMA table_info("${table}")`).all() as Array<{ name: string }>).map(r => r.name));
    return { database, deps: { sqlById: SQL, tableColumns, transaction } };
};
const estado = (db: DatabaseSync) => ({
    credito: (db.prepare(`SELECT status FROM credits WHERE id = 'c1'`).get() as { status: string }).status,
    aprovacoes: (db.prepare('SELECT COUNT(*) AS n FROM credit_approvals').get() as { n: number }).n,
    lancamentos: (db.prepare('SELECT COUNT(*) AS n FROM accounting_entries').get() as { n: number }).n,
});

test('transacção antiga entre duas páginas: espera pela página seguinte em vez de expirar', () => {
    const [a, b, c] = aprovacao();
    const agora = Date.now();
    // 1.ª página: só duas partes. Criadas há 3 dias, mas acabaram de chegar e ainda há páginas por receber.
    const pagina1 = groupOperations([a, b]);
    const pendentes = stampReceived(pagina1.pending, new Date(agora).toISOString());
    assert.equal(splitExpired(pendentes, agora, false, DIA).expired.length, 0, 'com páginas por receber nunca expira');
    assert.equal(splitExpired(pendentes, agora, true, DIA).expired.length, 0, 'acabadas de chegar: ainda não expiram');
    // 2.ª página: a parte que faltava completa a transacção.
    const pagina2 = groupOperations([...pendentes, c]);
    assert.equal(pagina2.complete.length, 1);
    assert.equal(pagina2.complete[0].length, 3);
    // Só expiram as que chegaram há mais de um dia, com o histórico todo recebido.
    const velhas = stampReceived([a], new Date(agora - 2 * DIA).toISOString());
    assert.equal(splitExpired(velhas, agora, true, DIA).expired.length, 1);
});

test('reprocessamento: uma transacção partida nunca é aplicada às fatias', async () => {
    const { database, deps } = base();
    const [a, b, c] = aprovacao();
    // Duas partes ficaram em conflito como «incompletas»; a terceira ainda não está lá.
    const linhas = (ops: SyncOperation[]) => conflictStatements(ops.map(markIncomplete), 'Transacção incompleta', SQL)
        .map(s => ({ id: String(s.params![0]), operation: String(s.params![3]) }));
    assert.equal(reprocessableGroups(linhas([b, c]), SQL).length, 0, 'sem todas as partes não se aplica nada (antes entravam as inserções soltas)');
    // Com as três partes, volta a ser aplicada inteira e pela ordem original.
    const grupos = reprocessableGroups(linhas([c, a, b]), SQL);
    assert.equal(grupos.length, 1);
    assert.deepEqual(grupos[0].operations.map(o => o.statementId), ['upd-credit', 'ins-approval', 'ins-entry'], 'comando original recuperado da marca «incompleto»');
    const result = await applyRemoteGroups(grupos, deps);
    assert.equal(result.applied, 3);
    assert.deepEqual(estado(database), { credito: 'active', aprovacoes: 1, lancamentos: 1 });
});

test('a activação falha (versão diferente): nada da transacção fica gravado', async () => {
    const { database, deps } = base();
    database.exec(`UPDATE credits SET version = 1 WHERE id = 'c1'`);
    const result = await applyRemoteGroups([{ operations: aprovacao() }], deps);
    assert.equal(result.conflicts, 3);
    assert.deepEqual(estado(database), { credito: 'pending_approval', aprovacoes: 0, lancamentos: 0 }, 'sem «aprovado» nem desembolso de um crédito pendente');
    const rows = database.prepare('SELECT id, operation FROM sync_conflicts').all() as Array<{ id: string; operation: string }>;
    assert.equal(reprocessableGroups(rows, SQL).length, 1, 'a transacção inteira fica disponível para reprocessar');
});

test('comando desconhecido numa versão antiga: depois de actualizar, a alteração é reaplicada', async () => {
    const { database, deps } = base();
    const update = op({ statementId: 'upd-credit', params: ['c1', 0], expectChanges: 1 });
    // Versão antiga: não conhecia o comando, a alteração ficou retida.
    const antiga = await applyRemoteGroups([{ operations: [update] }], { ...deps, sqlById: new Map() });
    assert.equal(antiga.conflicts, 1);
    const rows = database.prepare('SELECT id, operation FROM sync_conflicts').all() as Array<{ id: string; operation: string }>;
    assert.equal(reprocessableGroups(rows, new Map()).length, 0, 'ainda sem o comando: continua retida');
    // Versão nova: já conhece o comando e aplica-o (antes só as inserções eram reaplicadas).
    const grupos = reprocessableGroups(rows, SQL);
    assert.equal(grupos.length, 1);
    assert.equal((await applyRemoteGroups(grupos, deps)).applied, 1);
    assert.equal(estado(database).credito, 'active');
    // Uma alteração que falhou por outro motivo (ex.: versão diferente) não é reaplicada às cegas.
    const outra = conflictStatements([op({ statementId: 'upd-credit', params: ['c1', 5] })], 'Conflito de concorrência', SQL)
        .map(s => ({ id: String(s.params![0]), operation: String(s.params![3]) }));
    assert.equal(reprocessableGroups(outra, SQL).length, 0);
});

test('histórico recebido de novo: inserções que já existem não viram conflitos e os antigos ficam resolvidos', async () => {
    const { database, deps } = base();
    const lancamento = op({ statementId: 'ins-entry', params: ['e9', 'c1', 1000] });
    assert.equal((await applyRemoteGroups([{ operations: [lancamento] }], deps)).applied, 1);
    // A nuvem volta a entregar o mesmo lançamento: já existe, não é conflito.
    const repetido = await applyRemoteGroups([{ operations: [lancamento] }], deps);
    assert.deepEqual(repetido, { applied: 1, conflicts: 0 });
    assert.equal((database.prepare('SELECT COUNT(*) AS n FROM sync_conflicts').get() as { n: number }).n, 0);
    // Conflito antigo «Pagamento já registado no ledger»: reprocessado, fica resolvido.
    const antigo = conflictStatements([lancamento], 'Pagamento já registado no ledger', SQL);
    await deps.transaction(antigo);
    const rows = database.prepare("SELECT id, operation FROM sync_conflicts WHERE status = 'pending'").all() as Array<{ id: string; operation: string }>;
    await applyRemoteGroups(reprocessableGroups(rows, SQL), deps);
    assert.equal((database.prepare("SELECT COUNT(*) AS n FROM sync_conflicts WHERE status = 'pending'").get() as { n: number }).n, 0);
    // Uma alteração (UPDATE) que falha continua a ser conflito.
    assert.equal((await applyRemoteGroups([{ operations: [op({ statementId: 'upd-credit', params: ['c1', 7], expectChanges: 1 })] }], deps)).conflicts, 1);
});
