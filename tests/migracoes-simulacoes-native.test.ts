import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { migrateNativeSimulations } from '../electron/migracoes-simulacoes.ts';

function oldDatabase() {
    const db = new DatabaseSync(':memory:');
    db.exec(`PRAGMA foreign_keys=ON;
        CREATE TABLE simulations (id TEXT PRIMARY KEY, date TEXT NOT NULL, createdAt TEXT,
            method TEXT CHECK(method IN ('price','sac')), customColumn TEXT UNIQUE, extra TEXT DEFAULT 'flat');
        CREATE INDEX idx_simulation_custom ON simulations(customColumn);
        CREATE TABLE simulation_links (id TEXT PRIMARY KEY, simulationId TEXT REFERENCES simulations(id) ON DELETE CASCADE);
        CREATE TABLE events (id INTEGER PRIMARY KEY, simulationId TEXT);
        CREATE TRIGGER simulation_created AFTER INSERT ON simulations BEGIN INSERT INTO events(simulationId) VALUES (new.id); END;
        CREATE VIEW simulation_view AS SELECT id, method, customColumn FROM simulations;
        INSERT INTO simulations VALUES ('old','2026-10-01','2026-10-01','price','preservar','flat');
        INSERT INTO simulation_links VALUES ('link','old');`);
    return db;
}

test('base antiga rejeita FLAT antes da migração; depois aceita preservando dados, índices, triggers, views e FKs', () => {
    const db = oldDatabase();
    const before = db.prepare('SELECT * FROM simulations').get()!;
    assert.throws(() => db.exec("INSERT INTO simulations(id,date,method) VALUES ('flat','2026-10-18','flat')"), /CHECK/);
    let backups = 0;
    assert.equal(migrateNativeSimulations(db, () => { backups++; }), true);
    assert.equal(backups, 1);
    const after = db.prepare("SELECT * FROM simulations WHERE id='old'").get()!;
    for (const [key, value] of Object.entries(before)) assert.deepEqual(after[key], value);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM simulation_links').get()!.n, 1);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM events').get()!.n, 1);
    assert.equal(db.prepare('SELECT customColumn FROM simulation_view').get()!.customColumn, 'preservar');
    db.exec("INSERT INTO simulations(id,date,method,details,convertedCreditId) VALUES ('flat','2026-10-18','flat','detalhes','cr1')");
    assert.equal(db.prepare("SELECT method FROM simulations WHERE id='flat'").get()!.method, 'flat');
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM events').get()!.n, 2);
    assert.throws(() => db.exec("INSERT INTO simulations(id,date,method) VALUES ('invalid','2026-10-18','desconhecido')"), /CHECK/);
    assert.throws(() => db.exec("INSERT INTO simulations(id,date,method,customColumn) VALUES ('duplicate','2026-10-18','flat','preservar')"), /UNIQUE/);
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
    assert.equal(db.prepare('PRAGMA foreign_keys').get()!.foreign_keys, 1);
    assert.equal(db.prepare('PRAGMA legacy_alter_table').get()!.legacy_alter_table, 0);
    assert.equal(migrateNativeSimulations(db, () => { backups++; }), false);
    assert.equal(backups, 1);
    assert.equal(db.prepare('SELECT name FROM schema_migrations WHERE version=2026101803').get()!.name, 'native-simulations-flat');
    db.close();
});

test('falha a meio reverte o esquema e os dados e repõe as proteções', () => {
    const db = oldDatabase();
    const schema = db.prepare("SELECT sql FROM sqlite_master WHERE name='simulations'").get()!.sql;
    const before = db.prepare('SELECT * FROM simulations').all();
    const wrapped = {
        prepare: db.prepare.bind(db),
        exec: (sql: string) => {
            if (sql.startsWith('INSERT INTO simulations_flat_upgrade')) throw new Error('Falha simulada na cópia');
            return db.exec(sql);
        },
    };
    assert.throws(() => migrateNativeSimulations(wrapped), /Falha simulada/);
    assert.equal(db.prepare("SELECT sql FROM sqlite_master WHERE name='simulations'").get()!.sql, schema);
    assert.deepEqual(db.prepare('SELECT * FROM simulations').all(), before);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name='simulations_flat_upgrade'").get()!.n, 0);
    assert.equal(db.prepare('PRAGMA foreign_keys').get()!.foreign_keys, 1);
    assert.equal(db.prepare('PRAGMA legacy_alter_table').get()!.legacy_alter_table, 0);
    db.close();
});

test('base nova não migra; base já FLAT recebe somente as colunas em falta', () => {
    const db = new DatabaseSync(':memory:');
    assert.equal(migrateNativeSimulations(db), false);
    db.exec("CREATE TABLE simulations (id TEXT PRIMARY KEY,date TEXT,method TEXT CHECK(method IN ('price','sac','flat')))");
    db.exec("INSERT INTO simulations VALUES ('s1','2026-10-18','flat')");
    assert.equal(migrateNativeSimulations(db), true);
    assert.equal(db.prepare("SELECT createdAt FROM simulations WHERE id='s1'").get()!.createdAt, '2026-10-18');
    assert.equal(migrateNativeSimulations(db), false);
    db.close();
});
