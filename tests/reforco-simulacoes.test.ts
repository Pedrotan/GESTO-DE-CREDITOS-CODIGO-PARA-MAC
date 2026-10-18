import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { SIMULATIONS_FLAT_MIGRATION } from '../src/bibliotecas/migracao-simulacoes.ts';
import { reinforcementInterest, selectReinforcementInstallment } from '../src/bibliotecas/reforco-capital.ts';

test('migração preserva fichas antigas e permite gravar FLAT sem alterar o método', () => {
    const db = new DatabaseSync(':memory:');
    const old = SIMULATIONS_FLAT_MIGRATION[0].replace('simulations_flat_v2', 'simulations').replace("'price', 'sac', 'flat'", "'price', 'sac'");
    db.exec(old);
    db.prepare(`INSERT INTO simulations (id,date,createdAt,method,details,convertedCreditId) VALUES ('old','2026-01-01','2026-01-01','sac','detalhes','cr-old')`).run();
    const before = db.prepare('SELECT * FROM simulations').get();
    db.exec('BEGIN');
    for (const sql of SIMULATIONS_FLAT_MIGRATION) db.exec(sql);
    db.exec('COMMIT');
    assert.deepEqual(db.prepare("SELECT * FROM simulations WHERE id='old'").get(), before);
    db.prepare(`INSERT INTO simulations (id,date,createdAt,method) VALUES ('new','2026-02-01','2026-02-01','flat')`).run();
    assert.equal(db.prepare("SELECT method FROM simulations WHERE id='new'").get()!.method, 'flat');
    assert.throws(() => db.exec("UPDATE simulations SET method='invalido' WHERE id='new'"), /CHECK/);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='index' AND name LIKE 'idx_simulations_%'").get()!.n, 5);
    db.close();
});

test('taxa e precisão do reforço dependem do método original e a prestação é explícita', () => {
    assert.equal(reinforcementInterest(100.05, 10, 'FLAT'), 10.01);
    assert.equal(reinforcementInterest(1200, 12, 'PRICE'), 12);
    assert.equal(reinforcementInterest(1200, 12, 'SAC'), 12);
    assert.throws(() => reinforcementInterest(100, -1), /inválidos/);
    const rows = [{ id: 'p1', dueDate: '2026-01-01', status: 'paid' }, { id: 'p2', dueDate: '2026-02-01', status: 'pending' }];
    assert.equal(selectReinforcementInstallment(rows, 'p2'), rows[1]);
    assert.throws(() => selectReinforcementInstallment(rows, ''), /Selecione/);
    assert.throws(() => selectReinforcementInstallment(rows, 'p1'), /Selecione/);
});
