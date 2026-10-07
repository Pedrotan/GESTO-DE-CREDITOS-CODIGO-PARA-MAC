// Esquema das alçadas: versões da política de limites (imutáveis, com dupla aprovação), exceções temporárias,
// registo de consumo (imutável, sincronizado), linhas de bloqueio locais (guardas na mesma transacção da
// operação) e escalonamentos com as aprovações de cada nível. Os triggers impõem as regras na base de dados.
export const LIMITS_EXTENSION_SQL = [
    `CREATE TABLE IF NOT EXISTS limit_policy_versions (
        id TEXT PRIMARY KEY, version INTEGER NOT NULL, policy TEXT NOT NULL, summary TEXT, reason TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('pending','approved','rejected','cancelled')),
        effectiveFrom TEXT NOT NULL, requiresSecondApproval INTEGER NOT NULL DEFAULT 0, secondApprovalReasons TEXT,
        createdBy TEXT NOT NULL, createdByName TEXT NOT NULL, createdAt TEXT NOT NULL,
        decidedBy TEXT, decidedByName TEXT, decidedAt TEXT, decisionReason TEXT, restoredFrom TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS limit_exceptions (
        id TEXT PRIMARY KEY, userId TEXT NOT NULL, userName TEXT NOT NULL, operationType TEXT NOT NULL,
        perOperationMinor INTEGER, dailyMinor INTEGER, monthlyMinor INTEGER, dailyCount INTEGER,
        startsAt TEXT NOT NULL, endsAt TEXT NOT NULL, reason TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('pending','approved','rejected','revoked')),
        requestedBy TEXT NOT NULL, requestedByName TEXT NOT NULL, requestedAt TEXT NOT NULL,
        decidedBy TEXT, decidedByName TEXT, decidedAt TEXT, decisionReason TEXT, expiryNotifiedAt TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS limit_ledger (
        id TEXT PRIMARY KEY, operationType TEXT NOT NULL, userId TEXT NOT NULL, userName TEXT, profileId TEXT, branchId TEXT DEFAULT '',
        amountMinor INTEGER NOT NULL DEFAULT 0, count INTEGER NOT NULL DEFAULT 1, dayKey TEXT NOT NULL, monthKey TEXT NOT NULL,
        entityType TEXT, entityId TEXT, createdAt TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS limit_locks (
        id TEXT PRIMARY KEY, ledgerId TEXT NOT NULL, scope TEXT NOT NULL, scopeId TEXT NOT NULL, period TEXT NOT NULL, periodKey TEXT NOT NULL, createdAt TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS limit_escalations (
        id TEXT PRIMARY KEY, operationType TEXT NOT NULL, entityType TEXT NOT NULL, entityId TEXT NOT NULL, amountMinor INTEGER NOT NULL,
        requestedById TEXT, requestedByName TEXT, requestedRole TEXT, reason TEXT NOT NULL, details TEXT,
        requiredLevelId TEXT NOT NULL, requiredLevelIndex INTEGER NOT NULL, requiredLevelName TEXT NOT NULL, dual INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','cancelled')),
        createdAt TEXT NOT NULL, levelSince TEXT NOT NULL, escalationCount INTEGER NOT NULL DEFAULT 0, lastReminderAt TEXT,
        decidedAt TEXT, decidedBy TEXT, decidedByName TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS limit_escalation_approvals (
        id TEXT PRIMARY KEY, escalationId TEXT NOT NULL, approverId TEXT NOT NULL, approverName TEXT NOT NULL, approverRole TEXT,
        decision TEXT NOT NULL CHECK(decision IN ('approved','rejected')), notes TEXT, decidedAt TEXT NOT NULL,
        UNIQUE(escalationId, approverId)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_limit_ledger_user ON limit_ledger(operationType, userId, dayKey)`,
    `CREATE INDEX IF NOT EXISTS idx_limit_ledger_month ON limit_ledger(operationType, monthKey)`,
    `CREATE INDEX IF NOT EXISTS idx_limit_escalations_entity ON limit_escalations(entityType, entityId, status)`,
    `CREATE INDEX IF NOT EXISTS idx_limit_versions_status ON limit_policy_versions(status, effectiveFrom)`,
    `CREATE TRIGGER IF NOT EXISTS trg_limit_versions_delete BEFORE DELETE ON limit_policy_versions
        BEGIN SELECT RAISE(ABORT, 'As versões dos limites não podem ser apagadas'); END`,
    `CREATE TRIGGER IF NOT EXISTS trg_limit_versions_immutable BEFORE UPDATE ON limit_policy_versions
        WHEN OLD.status <> 'pending' OR NEW.policy <> OLD.policy OR NEW.version <> OLD.version OR NEW.createdBy <> OLD.createdBy
            OR NEW.effectiveFrom <> OLD.effectiveFrom OR NEW.reason <> OLD.reason OR NEW.requiresSecondApproval <> OLD.requiresSecondApproval
        BEGIN SELECT RAISE(ABORT, 'Uma versão dos limites já decidida não pode ser alterada'); END`,
    `CREATE TRIGGER IF NOT EXISTS trg_limit_versions_four_eyes BEFORE UPDATE ON limit_policy_versions
        WHEN NEW.status = 'approved' AND (NEW.decidedBy IS NULL OR NEW.decidedBy = OLD.createdBy)
        BEGIN SELECT RAISE(ABORT, 'A alteração tem de ser aprovada por um segundo administrador'); END`,
    `CREATE TRIGGER IF NOT EXISTS trg_limit_exceptions_delete BEFORE DELETE ON limit_exceptions
        BEGIN SELECT RAISE(ABORT, 'As exceções de limites não podem ser apagadas'); END`,
    `CREATE TRIGGER IF NOT EXISTS trg_limit_exceptions_four_eyes BEFORE UPDATE ON limit_exceptions
        WHEN NEW.status = 'approved' AND OLD.status = 'pending' AND (NEW.decidedBy IS NULL OR NEW.decidedBy = OLD.requestedBy OR NEW.decidedBy = OLD.userId)
        BEGIN SELECT RAISE(ABORT, 'A exceção tem de ser aprovada por outro administrador'); END`,
    `CREATE TRIGGER IF NOT EXISTS trg_limit_exceptions_immutable BEFORE UPDATE ON limit_exceptions
        WHEN NEW.userId <> OLD.userId OR NEW.operationType <> OLD.operationType OR NEW.startsAt <> OLD.startsAt OR NEW.endsAt <> OLD.endsAt
            OR COALESCE(NEW.perOperationMinor, -1) <> COALESCE(OLD.perOperationMinor, -1) OR COALESCE(NEW.dailyMinor, -1) <> COALESCE(OLD.dailyMinor, -1)
            OR COALESCE(NEW.monthlyMinor, -1) <> COALESCE(OLD.monthlyMinor, -1) OR NEW.reason <> OLD.reason
            OR (OLD.status IN ('rejected','revoked') AND NEW.status <> OLD.status)
        BEGIN SELECT RAISE(ABORT, 'Os valores de uma exceção não podem ser alterados'); END`,
    `CREATE TRIGGER IF NOT EXISTS trg_limit_ledger_update BEFORE UPDATE ON limit_ledger
        BEGIN SELECT RAISE(ABORT, 'O registo de consumo dos limites é imutável'); END`,
    `CREATE TRIGGER IF NOT EXISTS trg_limit_ledger_delete BEFORE DELETE ON limit_ledger
        BEGIN SELECT RAISE(ABORT, 'O registo de consumo dos limites é imutável'); END`,
    `CREATE TRIGGER IF NOT EXISTS trg_limit_escalations_delete BEFORE DELETE ON limit_escalations
        BEGIN SELECT RAISE(ABORT, 'Os pedidos escalados não podem ser apagados'); END`,
    `CREATE TRIGGER IF NOT EXISTS trg_limit_escalation_self BEFORE INSERT ON limit_escalation_approvals
        WHEN NEW.approverId = (SELECT requestedById FROM limit_escalations WHERE id = NEW.escalationId)
        BEGIN SELECT RAISE(ABORT, 'Quem pediu a operação não a pode aprovar'); END`,
    `CREATE TRIGGER IF NOT EXISTS trg_limit_escalation_approvals_update BEFORE UPDATE ON limit_escalation_approvals
        BEGIN SELECT RAISE(ABORT, 'As decisões dos aprovadores são imutáveis'); END`,
    `CREATE TRIGGER IF NOT EXISTS trg_limit_escalation_approvals_delete BEFORE DELETE ON limit_escalation_approvals
        BEGIN SELECT RAISE(ABORT, 'As decisões dos aprovadores são imutáveis'); END`,
];
