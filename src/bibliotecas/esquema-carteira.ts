// Esquema complementar da carteira de crédito: reestruturações e liquidações antecipadas (com o plano original
// guardado no histórico e aprovação de outra pessoa na reestruturação), documentos do crédito, lotes de
// importação de créditos (anuláveis) e histórico de transferências de gestor. Tabelas novas: as existentes e
// as suas instruções SQL não mudam, para a sincronização entre versões continuar a funcionar.
export const PORTFOLIO_SCHEMA_SQL = [
    `CREATE TABLE IF NOT EXISTS credit_restructurings (
        id TEXT PRIMARY KEY, creditId TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('restructure','early_settlement')),
        mode TEXT, reason TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('pending','approved','rejected')),
        originalPlan TEXT NOT NULL, newPlan TEXT NOT NULL, params TEXT, payNowMinor INTEGER,
        requestedBy TEXT NOT NULL, requestedByName TEXT NOT NULL, requestedAt TEXT NOT NULL,
        decidedBy TEXT, decidedByName TEXT, decidedAt TEXT, decisionReason TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS credit_documents (
        id TEXT PRIMARY KEY, creditId TEXT NOT NULL, kind TEXT NOT NULL, fileName TEXT NOT NULL, mimeType TEXT NOT NULL,
        dataUrl TEXT NOT NULL, uploadedAt TEXT NOT NULL, uploadedBy TEXT, uploadedByName TEXT, deletedAt TEXT, deletedBy TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS credit_import_batches (
        id TEXT PRIMARY KEY, number TEXT NOT NULL, fileName TEXT, createdAt TEXT NOT NULL, createdBy TEXT NOT NULL, createdById TEXT,
        rowsCount INTEGER NOT NULL DEFAULT 0, totalMinor INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','cancelled')),
        cancelledAt TEXT, cancelledBy TEXT, cancelReason TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS credit_import_items (
        batchId TEXT NOT NULL, creditId TEXT NOT NULL, PRIMARY KEY(batchId, creditId)
    )`,
    `CREATE TABLE IF NOT EXISTS credit_manager_transfers (
        id TEXT PRIMARY KEY, creditId TEXT NOT NULL, fromUserId TEXT, toUserId TEXT NOT NULL, toUserName TEXT,
        reason TEXT NOT NULL, actorId TEXT NOT NULL, actorName TEXT NOT NULL, createdAt TEXT NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_credit_restructurings_credit ON credit_restructurings(creditId, requestedAt)`,
    `CREATE INDEX IF NOT EXISTS idx_credit_documents_credit ON credit_documents(creditId)`,
    `CREATE TRIGGER IF NOT EXISTS trg_credit_restructurings_delete BEFORE DELETE ON credit_restructurings
        BEGIN SELECT RAISE(ABORT, 'O histórico de reestruturações não pode ser apagado'); END`,
    `CREATE TRIGGER IF NOT EXISTS trg_credit_restructurings_immutable BEFORE UPDATE ON credit_restructurings
        WHEN OLD.status <> 'pending' OR NEW.originalPlan <> OLD.originalPlan OR NEW.newPlan <> OLD.newPlan OR NEW.creditId <> OLD.creditId
        BEGIN SELECT RAISE(ABORT, 'Uma reestruturação já decidida não pode ser alterada'); END`,
    `CREATE TRIGGER IF NOT EXISTS trg_credit_restructurings_four_eyes BEFORE UPDATE ON credit_restructurings
        WHEN NEW.status = 'approved' AND OLD.kind = 'restructure' AND (NEW.decidedBy IS NULL OR NEW.decidedBy = OLD.requestedBy)
        BEGIN SELECT RAISE(ABORT, 'A reestruturação tem de ser aprovada por outra pessoa'); END`,
    `CREATE TRIGGER IF NOT EXISTS trg_credit_manager_transfers_update BEFORE UPDATE ON credit_manager_transfers
        BEGIN SELECT RAISE(ABORT, 'O histórico de transferências é imutável'); END`,
    `CREATE TRIGGER IF NOT EXISTS trg_credit_manager_transfers_delete BEFORE DELETE ON credit_manager_transfers
        BEGIN SELECT RAISE(ABORT, 'O histórico de transferências é imutável'); END`,
    `CREATE TRIGGER IF NOT EXISTS trg_credit_documents_delete BEFORE DELETE ON credit_documents
        BEGIN SELECT RAISE(ABORT, 'Os documentos do crédito não podem ser apagados (só arquivados)'); END`,
];
