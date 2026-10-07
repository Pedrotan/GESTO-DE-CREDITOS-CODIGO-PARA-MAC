// Esquema complementar da auditoria: centro de alertas (com comentários imutáveis e regra de que quem
// originou um alerta não o pode fechar) e fechos diários da cadeia de integridade (imutáveis).
export const AUDIT_EXTENSION_SQL = [
    `CREATE TABLE IF NOT EXISTS audit_alerts (
        id TEXT PRIMARY KEY, alertKey TEXT NOT NULL UNIQUE, ruleId TEXT NOT NULL, severity TEXT NOT NULL, title TEXT NOT NULL,
        description TEXT, eventIds TEXT, originUserId TEXT, originUserName TEXT, occurredAt TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','in_review','justified','false_positive','resolved')),
        assignedTo TEXT, assignedToName TEXT, dueAt TEXT, createdAt TEXT NOT NULL, updatedAt TEXT, closedBy TEXT, closedByName TEXT, closedAt TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS audit_alert_comments (
        id TEXT PRIMARY KEY, alertId TEXT NOT NULL, userId TEXT, userName TEXT NOT NULL, status TEXT, comment TEXT NOT NULL, createdAt TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS audit_daily_closes (
        day TEXT PRIMARY KEY, lastAuditId TEXT, headHash TEXT, eventCount INTEGER NOT NULL, status TEXT NOT NULL CHECK(status IN ('ok','broken')),
        brokenSeq INTEGER, verifiedAt TEXT NOT NULL, verifiedBy TEXT
    )`,
    `CREATE INDEX IF NOT EXISTS idx_audit_alerts_status ON audit_alerts(status, occurredAt)`,
    `CREATE TRIGGER IF NOT EXISTS trg_audit_alerts_delete BEFORE DELETE ON audit_alerts
        BEGIN SELECT RAISE(ABORT, 'Os alertas de auditoria não podem ser apagados'); END`,
    `CREATE TRIGGER IF NOT EXISTS trg_audit_alerts_self_close BEFORE UPDATE ON audit_alerts
        WHEN NEW.status IN ('justified','false_positive','resolved') AND NEW.closedBy IS NOT NULL AND NEW.closedBy = OLD.originUserId
        BEGIN SELECT RAISE(ABORT, 'Quem originou o alerta não o pode fechar'); END`,
    `CREATE TRIGGER IF NOT EXISTS trg_audit_alert_comments_update BEFORE UPDATE ON audit_alert_comments
        BEGIN SELECT RAISE(ABORT, 'Os comentários dos alertas são imutáveis'); END`,
    `CREATE TRIGGER IF NOT EXISTS trg_audit_alert_comments_delete BEFORE DELETE ON audit_alert_comments
        BEGIN SELECT RAISE(ABORT, 'Os comentários dos alertas são imutáveis'); END`,
    `CREATE TRIGGER IF NOT EXISTS trg_audit_daily_closes_update BEFORE UPDATE ON audit_daily_closes
        BEGIN SELECT RAISE(ABORT, 'Os fechos diários da auditoria são imutáveis'); END`,
    `CREATE TRIGGER IF NOT EXISTS trg_audit_daily_closes_delete BEFORE DELETE ON audit_daily_closes
        BEGIN SELECT RAISE(ABORT, 'Os fechos diários da auditoria são imutáveis'); END`,
];
