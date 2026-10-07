export const BANK_IMPORT_SCHEMA_SQL=[
    `CREATE TABLE IF NOT EXISTS accounting_bank_imports (id TEXT PRIMARY KEY, fileName TEXT NOT NULL, movements TEXT NOT NULL,
        actorId TEXT NOT NULL, actorName TEXT NOT NULL, importedAt TEXT NOT NULL)`,
    `CREATE TRIGGER IF NOT EXISTS trg_bank_import_update BEFORE UPDATE ON accounting_bank_imports
        BEGIN SELECT RAISE(ABORT, 'O extrato importado é imutável'); END`,
    `CREATE TRIGGER IF NOT EXISTS trg_bank_import_delete BEFORE DELETE ON accounting_bank_imports
        BEGIN SELECT RAISE(ABORT, 'O extrato importado é imutável'); END`
];
