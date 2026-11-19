import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { LEDGER_GENESIS_HASH } from '../src/bibliotecas/esquema-ledger.ts';
import { LEDGER_PROTECTION_SQL } from '../src/bibliotecas/esquema-ledger.ts';

// Trigger real do esquema protegido sobre uma tabela mínima de lançamentos.
const base = () => {
    const db = new DatabaseSync(':memory:');
    db.exec(`CREATE TABLE accounting_entries (id TEXT PRIMARY KEY, timestamp TEXT, type TEXT, paymentId TEXT, integrityHash TEXT, previousHash TEXT);
        CREATE TABLE closed_months (id TEXT PRIMARY KEY);
        CREATE TRIGGER trg_accounting_entries_chain BEFORE INSERT ON accounting_entries
        WHEN NEW.previousHash <> COALESCE((SELECT integrityHash FROM accounting_entries ORDER BY rowid DESC LIMIT 1), '${LEDGER_GENESIS_HASH}')
        BEGIN SELECT RAISE(ABORT, 'Cadeia contabilística concorrente ou inválida'); END;`);
    // Base antiga (com o trigger antigo) actualizada pelo esquema protegido.
    for (const sql of LEDGER_PROTECTION_SQL.filter(s => /accounting_entries_chain|idx_accounting_entries_integrity_hash/u.test(s))) db.exec(sql);
    const lancar = (id: string, previousHash: string) =>
        db.prepare(`INSERT INTO accounting_entries (id, timestamp, type, integrityHash, previousHash) VALUES (?, '2026-10-24', 'payment', ?, ?)`).run(id, `${id}`.padEnd(64, '0'), previousHash);
    return { db, lancar, hash: (id: string) => `${id}`.padEnd(64, '0') };
};

test('dois computadores lançam ao mesmo tempo: o lançamento que chega depois é aceite (ramo paralelo)', () => {
    const { db, lancar, hash } = base();
    lancar('a', LEDGER_GENESIS_HASH);
    lancar('b', hash('a'));          // feito aqui
    lancar('c', hash('a'));          // feito noutro computador ao mesmo tempo, chega pela sincronização
    lancar('d', hash('c'));          // o seguinte junta os ramos
    assert.equal((db.prepare('SELECT COUNT(*) AS n FROM accounting_entries').get() as { n: number }).n, 4);
    const triggers = (db.prepare(`SELECT name FROM sqlite_master WHERE type = 'trigger'`).all() as Array<{ name: string }>).map(t => t.name);
    assert.deepEqual(triggers, ['trg_accounting_entries_chain_v2'], 'o trigger antigo foi substituído');
});

test('apontar para um lançamento que não existe continua recusado', () => {
    const { lancar } = base();
    lancar('a', LEDGER_GENESIS_HASH);
    assert.throws(() => lancar('x', 'f'.repeat(64)), /o lançamento anterior não existe/);
});

test('lançamento repetido pela sincronização num mês fechado é ignorado; um novo continua recusado', () => {
    const db = new DatabaseSync(':memory:');
    db.exec(`CREATE TABLE accounting_entries (id TEXT PRIMARY KEY, timestamp TEXT, type TEXT, paymentId TEXT, integrityHash TEXT, previousHash TEXT);
        CREATE TABLE closed_months (id TEXT PRIMARY KEY);
        CREATE TRIGGER trg_accounting_closed_period BEFORE INSERT ON accounting_entries
        WHEN EXISTS (SELECT 1 FROM closed_months WHERE id = substr(NEW.timestamp, 1, 7))
        BEGIN SELECT RAISE(ABORT, 'Período contabilístico fechado. Reabra-o com autorização e justificação.'); END;
        CREATE TRIGGER trg_accounting_entries_payment_unique BEFORE INSERT ON accounting_entries
        WHEN NEW.paymentId IS NOT NULL AND NEW.type = 'payment' AND EXISTS (SELECT 1 FROM accounting_entries WHERE paymentId = NEW.paymentId AND type = 'payment')
        BEGIN SELECT RAISE(ABORT, 'Pagamento já registado no ledger'); END;`);
    for (const sql of LEDGER_PROTECTION_SQL.filter(s => /accounting_closed_period|accounting_entries_payment_unique/u.test(s))) db.exec(sql);
    const repetir = (id: string, timestamp: string, paymentId: string | null) =>
        db.prepare(`INSERT OR IGNORE INTO accounting_entries (id, timestamp, type, paymentId) VALUES (?, ?, 'payment', ?)`).run(id, timestamp, paymentId);
    repetir('payment:p1', '2026-10-20T10:00:00Z', 'p1');
    db.exec(`INSERT INTO closed_months (id) VALUES ('2026-10')`);
    // Já existe aqui: a sincronização volta a enviá-lo e é ignorado sem erro.
    assert.doesNotThrow(() => repetir('payment:p1', '2026-10-20T10:00:00Z', 'p1'));
    // Lançamento novo num mês fechado, ou outro lançamento para o mesmo pagamento: continuam recusados.
    assert.throws(() => repetir('payment:p2', '2026-10-21T10:00:00Z', 'p2'), /Período contabilístico fechado/);
    assert.throws(() => repetir('payment:p1-b', '2026-11-02T10:00:00Z', 'p1'), /Pagamento já registado/);
    const triggers = (db.prepare(`SELECT name FROM sqlite_master WHERE type = 'trigger' ORDER BY name`).all() as Array<{ name: string }>).map(t => t.name);
    assert.deepEqual(triggers, ['trg_accounting_closed_period_v2', 'trg_accounting_entries_payment_unique_v2']);
});
