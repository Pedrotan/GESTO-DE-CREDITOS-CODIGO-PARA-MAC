/** Migração confiável no arranque do worker, sem DDL vindo do renderer nem alteração da política SQL. */
type NativeDatabase = {
    inTransaction?: boolean;
    prepare(sql: string): { get(...params: any[]): any; all(...params: any[]): any[]; run(...params: any[]): unknown };
    exec(sql: string): unknown;
};
const METHOD_CHECK = /CHECK\s*\(\s*(?:method|"method"|`method`|\[method\])\s+IN\s*\(([^)]*)\)\s*\)/i;
const EXTRA_COLUMNS = [
    ['createdAt', 'TEXT'], ['status', "TEXT DEFAULT 'simulated'"], ['clientId', 'TEXT'], ['productId', 'TEXT'],
    ['verificationCode', 'TEXT'], ['expiresAt', 'TEXT'], ['details', 'TEXT'], ['convertedCreditId', 'TEXT'], ['updatedAt', 'TEXT'],
] as const;
const quote = (identifier: string) => `"${identifier.replace(/"/g, '""')}"`;

export function migrateNativeSimulations(database: NativeDatabase, beforeMigration?: () => void): boolean {
    const original = database.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='simulations'").get();
    if (!original?.sql) return false; // Base nova: o esquema atual será criado pelo bootstrap.
    const columns = database.prepare('PRAGMA table_info("simulations")').all();
    const existing = new Set(columns.map(row => String(row.name)));
    const missing = EXTRA_COLUMNS.filter(([name]) => !existing.has(name));
    const constraint = String(original.sql).match(METHOD_CHECK);
    const needsFlat = Boolean(constraint && !/['"]flat['"]/.test(constraint[1]));
    if (!needsFlat && !missing.length) return false;
    if (database.inTransaction) throw new Error('A migração de simulações exige uma ligação sem transação aberta.');
    beforeMigration?.();

    // Procedimento SQLite de substituição de tabela: os nomes referenciados por FKs/views ficam iguais.
    // As restrições voltam ao estado anterior no finally, incluindo quando há erro e rollback.
    const foreignKeys = Number(database.prepare('PRAGMA foreign_keys').get()?.foreign_keys || 0);
    const legacyAlter = Number(database.prepare('PRAGMA legacy_alter_table').get()?.legacy_alter_table || 0);
    const previousViolations = new Set(database.prepare('PRAGMA foreign_key_check').all().map(row => JSON.stringify(row)));
    database.exec('PRAGMA foreign_keys = OFF');
    database.exec('PRAGMA legacy_alter_table = ON');
    try {
        database.exec('BEGIN IMMEDIATE');
        for (const [name, definition] of missing) database.exec(`ALTER TABLE simulations ADD COLUMN ${quote(name)} ${definition}`);
        if (!existing.has('createdAt') && existing.has('date')) database.exec('UPDATE simulations SET createdAt = date WHERE createdAt IS NULL');
        if (needsFlat) {
            const objects = database.prepare("SELECT sql FROM sqlite_master WHERE tbl_name='simulations' AND type IN ('index','trigger') AND sql IS NOT NULL").all();
            const schema = String(database.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='simulations'").get().sql);
            const updatedSchema = schema.replace(METHOD_CHECK, (_match, values: string) => `CHECK(method IN (${values}, 'flat'))`);
            const create = updatedSchema.replace(/^CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:"simulations"|`simulations`|\[simulations\]|simulations)(?=\s|\()/i, 'CREATE TABLE simulations_flat_upgrade');
            if (create === updatedSchema) throw new Error('Não foi possível reconhecer o esquema de simulações.');
            database.exec(create);
            // Usa todas as colunas reais, incluindo extensões de versões anteriores.
            const names = database.prepare('PRAGMA table_info("simulations")').all().filter(row => row.hidden === undefined || row.hidden === 0).map(row => quote(String(row.name))).join(', ');
            database.exec(`INSERT INTO simulations_flat_upgrade (${names}) SELECT ${names} FROM simulations`);
            const count = Number(database.prepare('SELECT COUNT(*) AS total FROM simulations').get().total);
            const copied = Number(database.prepare('SELECT COUNT(*) AS total FROM simulations_flat_upgrade').get().total);
            if (count !== copied) throw new Error('A cópia das simulações não está completa.');
            database.exec('DROP TABLE simulations');
            database.exec('ALTER TABLE simulations_flat_upgrade RENAME TO simulations');
            for (const object of objects) database.exec(String(object.sql));
        }
        const newViolation = database.prepare('PRAGMA foreign_key_check').all().some(row => !previousViolations.has(JSON.stringify(row)));
        if (newViolation) throw new Error('A migração de simulações alteraria relações existentes.');
        database.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, appliedAt TEXT NOT NULL)');
        database.prepare('INSERT OR IGNORE INTO schema_migrations (version, name, appliedAt) VALUES (?, ?, ?)').run(2026101803, 'native-simulations-flat', new Date().toISOString());
        database.exec('COMMIT');
        return true;
    } catch (error) {
        try { database.exec('ROLLBACK'); } catch { /* O erro original prevalece. */ }
        throw error;
    } finally {
        database.exec(`PRAGMA legacy_alter_table = ${legacyAlter ? 'ON' : 'OFF'}`);
        database.exec(`PRAGMA foreign_keys = ${foreignKeys ? 'ON' : 'OFF'}`);
    }
}
