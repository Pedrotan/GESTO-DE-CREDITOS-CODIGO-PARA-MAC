import { RECEIPT_SCHEMA_SQL } from './comprovativo-despesa.ts';
import { AUDIT_CHAIN_SCHEMA_SQL } from './cadeia-auditoria.ts';
import { AUDIT_EXTENSION_SQL } from './esquema-auditoria.ts';
import { LIMITS_EXTENSION_SQL } from './esquema-alcadas.ts';
import { PORTFOLIO_SCHEMA_SQL } from './esquema-carteira.ts';
import { BANK_IMPORT_SCHEMA_SQL } from './esquema-extratos.ts';
import { COLLECTION_SCHEMA_SQL } from './cobranca-operacional.ts';
export const LEDGER_GENESIS_HASH = '0'.repeat(64);

export const LEDGER_PROTECTION_SQL = [
    ...COLLECTION_SCHEMA_SQL,
    ...BANK_IMPORT_SCHEMA_SQL,
    ...RECEIPT_SCHEMA_SQL,
    ...AUDIT_CHAIN_SCHEMA_SQL,
    ...AUDIT_EXTENSION_SQL,
    ...LIMITS_EXTENSION_SQL,
    ...PORTFOLIO_SCHEMA_SQL,
    `CREATE TABLE IF NOT EXISTS accounting_divergence_events (
        id TEXT PRIMARY KEY, issueKey TEXT NOT NULL, previousId TEXT NOT NULL DEFAULT '',
        source TEXT NOT NULL, description TEXT NOT NULL,
        state TEXT NOT NULL CHECK(state IN ('pending','justified','resolved')),
        reason TEXT NOT NULL CHECK(length(trim(reason)) >= 10),
        actorId TEXT NOT NULL, actorName TEXT NOT NULL, createdAt TEXT NOT NULL,
        UNIQUE(issueKey, previousId)
    );`,
    `CREATE TRIGGER IF NOT EXISTS trg_divergence_immutable_update BEFORE UPDATE ON accounting_divergence_events
        BEGIN SELECT RAISE(ABORT, 'Decisões de divergências são imutáveis'); END`,
    `CREATE TRIGGER IF NOT EXISTS trg_divergence_immutable_delete BEFORE DELETE ON accounting_divergence_events
        BEGIN SELECT RAISE(ABORT, 'Decisões de divergências são imutáveis'); END`,
    `CREATE TABLE IF NOT EXISTS accounting_cash_sessions (
    id TEXT PRIMARY KEY,
    operatorId TEXT NOT NULL,
    operatorName TEXT NOT NULL,
    sessionDate TEXT NOT NULL,
    openedAt TEXT NOT NULL,
    closedAt TEXT,
    openingMinor INTEGER NOT NULL CHECK(openingMinor >= 0),
    expectedMinor INTEGER,
    countedMinor INTEGER,
    reason TEXT,
    status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','closed')),
    UNIQUE(operatorId, sessionDate),
    CHECK(status = 'open' OR (expectedMinor IS NOT NULL AND countedMinor IS NOT NULL AND countedMinor >= 0
          AND (expectedMinor = countedMinor OR length(trim(reason)) >= 10)))
);`,
    `CREATE TRIGGER IF NOT EXISTS trg_cash_session_closed_update BEFORE UPDATE ON accounting_cash_sessions
        WHEN OLD.status = 'closed' BEGIN SELECT RAISE(ABORT, 'Fecho de caixa imutável'); END`,
    `CREATE TRIGGER IF NOT EXISTS trg_cash_session_delete BEFORE DELETE ON accounting_cash_sessions
        BEGIN SELECT RAISE(ABORT, 'O histórico de caixa é imutável'); END`,
    `CREATE TRIGGER IF NOT EXISTS trg_audit_logs_immutable_update
        BEFORE UPDATE ON audit_logs BEGIN
        SELECT RAISE(ABORT, 'Os registos de auditoria são imutáveis'); END`,
    `CREATE TRIGGER IF NOT EXISTS trg_audit_logs_immutable_delete
        BEFORE DELETE ON audit_logs BEGIN
        SELECT RAISE(ABORT, 'Os registos de auditoria são imutáveis'); END`,
    `CREATE TRIGGER IF NOT EXISTS trg_accounting_closed_period
        BEFORE INSERT ON accounting_entries
        WHEN EXISTS (SELECT 1 FROM closed_months WHERE id = substr(NEW.timestamp, 1, 7))
        BEGIN SELECT RAISE(ABORT, 'Período contabilístico fechado. Reabra-o com autorização e justificação.'); END`,
    `CREATE TRIGGER IF NOT EXISTS trg_accounting_entries_immutable_update
        BEFORE UPDATE ON accounting_entries BEGIN
        SELECT RAISE(ABORT, 'Os lançamentos contabilísticos são imutáveis'); END`,
    `CREATE TRIGGER IF NOT EXISTS trg_accounting_entries_immutable_delete
        BEFORE DELETE ON accounting_entries BEGIN
        SELECT RAISE(ABORT, 'Os lançamentos contabilísticos são imutáveis; use um estorno'); END`,
    `CREATE TRIGGER IF NOT EXISTS trg_accounting_entries_payment_unique
        BEFORE INSERT ON accounting_entries
        WHEN NEW.paymentId IS NOT NULL AND NEW.type = 'payment' AND EXISTS (
            SELECT 1 FROM accounting_entries WHERE paymentId = NEW.paymentId AND type = 'payment'
        ) BEGIN SELECT RAISE(ABORT, 'Pagamento já registado no ledger'); END`,
    `CREATE TRIGGER IF NOT EXISTS trg_accounting_entries_chain
        BEFORE INSERT ON accounting_entries
        WHEN NEW.previousHash <> COALESCE(
            (SELECT integrityHash FROM accounting_entries ORDER BY rowid DESC LIMIT 1),
            '${LEDGER_GENESIS_HASH}'
        ) BEGIN SELECT RAISE(ABORT, 'Cadeia contabilística concorrente ou inválida'); END`,
    `CREATE TRIGGER IF NOT EXISTS trg_ledger_transactions_immutable_update
        BEFORE UPDATE ON ledger_transactions BEGIN
        SELECT RAISE(ABORT, 'As transações do ledger são imutáveis'); END`,
    `CREATE TRIGGER IF NOT EXISTS trg_ledger_transactions_immutable_delete
        BEFORE DELETE ON ledger_transactions BEGIN
        SELECT RAISE(ABORT, 'As transações do ledger são imutáveis'); END`,
    `CREATE TRIGGER IF NOT EXISTS trg_ledger_lines_immutable_update
        BEFORE UPDATE ON ledger_lines BEGIN
        SELECT RAISE(ABORT, 'As linhas do ledger são imutáveis'); END`,
    `CREATE TRIGGER IF NOT EXISTS trg_ledger_lines_immutable_delete
        BEFORE DELETE ON ledger_lines BEGIN
        SELECT RAISE(ABORT, 'As linhas do ledger são imutáveis'); END`,
    // Abates de créditos: aprovados por um administrador diferente de quem os pediu; nunca se alteram.
    `CREATE TABLE IF NOT EXISTS credit_writeoffs (
        id TEXT PRIMARY KEY, creditId TEXT NOT NULL UNIQUE,
        principalMinor INTEGER NOT NULL CHECK(principalMinor >= 0), interestMinor INTEGER NOT NULL DEFAULT 0 CHECK(interestMinor >= 0),
        provisionUsedMinor INTEGER NOT NULL DEFAULT 0 CHECK(provisionUsedMinor >= 0), lossMinor INTEGER NOT NULL DEFAULT 0 CHECK(lossMinor >= 0),
        reason TEXT NOT NULL CHECK(length(trim(reason)) >= 10),
        requestedBy TEXT NOT NULL, requestedById TEXT NOT NULL, approvedBy TEXT NOT NULL, approvedById TEXT NOT NULL,
        entryId TEXT NOT NULL, createdAt TEXT NOT NULL,
        CHECK(requestedById <> approvedById)
    );`,
    `CREATE TRIGGER IF NOT EXISTS trg_credit_writeoffs_immutable_update BEFORE UPDATE ON credit_writeoffs
        BEGIN SELECT RAISE(ABORT, 'Os abates de créditos são imutáveis'); END`,
    `CREATE TRIGGER IF NOT EXISTS trg_credit_writeoffs_immutable_delete BEFORE DELETE ON credit_writeoffs
        BEGIN SELECT RAISE(ABORT, 'Os abates de créditos são imutáveis'); END`,
    // Histórico das auditorias executadas (quem, quando, resultado e apontamentos).
    `CREATE TABLE IF NOT EXISTS accounting_audit_runs (
        id TEXT PRIMARY KEY, kind TEXT NOT NULL, startedAt TEXT NOT NULL, finishedAt TEXT NOT NULL,
        userId TEXT, userName TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('ok','warning','critical')),
        criticalCount INTEGER NOT NULL DEFAULT 0, highCount INTEGER NOT NULL DEFAULT 0,
        mediumCount INTEGER NOT NULL DEFAULT 0, lowCount INTEGER NOT NULL DEFAULT 0,
        headEntryId TEXT, headHash TEXT, sealStatus TEXT, summary TEXT, findings TEXT
    );`,
    `CREATE INDEX IF NOT EXISTS idx_accounting_audit_runs_finished ON accounting_audit_runs(finishedAt)`,
    `CREATE TRIGGER IF NOT EXISTS trg_accounting_audit_runs_immutable_update BEFORE UPDATE ON accounting_audit_runs
        BEGIN SELECT RAISE(ABORT, 'O histórico de auditorias é imutável'); END`,
    `CREATE TRIGGER IF NOT EXISTS trg_accounting_audit_runs_immutable_delete BEFORE DELETE ON accounting_audit_runs
        BEGIN SELECT RAISE(ABORT, 'O histórico de auditorias é imutável'); END`,
    // Fecho diário: fotografia do fim do dia (último lançamento, hash, totais) depois de uma auditoria sem críticos.
    `CREATE TABLE IF NOT EXISTS accounting_daily_closes (
        day TEXT PRIMARY KEY, headEntryId TEXT, headHash TEXT, entryCount INTEGER NOT NULL,
        debitMinor INTEGER NOT NULL, creditMinor INTEGER NOT NULL, liquidMinor INTEGER NOT NULL, portfolioMinor INTEGER NOT NULL,
        auditRunId TEXT, sealStatus TEXT, closedAt TEXT NOT NULL, closedBy TEXT NOT NULL, closedById TEXT
    );`,
    `CREATE TRIGGER IF NOT EXISTS trg_accounting_daily_closes_immutable_update BEFORE UPDATE ON accounting_daily_closes
        BEGIN SELECT RAISE(ABORT, 'Os fechos diários são imutáveis'); END`,
    `CREATE TRIGGER IF NOT EXISTS trg_accounting_daily_closes_immutable_delete BEFORE DELETE ON accounting_daily_closes
        BEGIN SELECT RAISE(ABORT, 'Os fechos diários são imutáveis'); END`,
    // Pedidos que exigem aprovação de outro administrador (estornos de lançamentos e abates).
    `CREATE TABLE IF NOT EXISTS accounting_requests (
        id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('reversal','writeoff')), targetId TEXT NOT NULL,
        amountMinor INTEGER, description TEXT, reason TEXT NOT NULL CHECK(length(trim(reason)) >= 10),
        requestedBy TEXT NOT NULL, requestedById TEXT NOT NULL, requestedAt TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
        decidedBy TEXT, decidedById TEXT, decidedAt TEXT, decisionReason TEXT, resultEntryId TEXT
    );`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_accounting_requests_pending ON accounting_requests(kind, targetId) WHERE status = 'pending'`,
    `CREATE TRIGGER IF NOT EXISTS trg_accounting_requests_decided BEFORE UPDATE ON accounting_requests
        WHEN OLD.status <> 'pending' BEGIN SELECT RAISE(ABORT, 'Pedido já decidido: não pode ser alterado'); END`,
    `CREATE TRIGGER IF NOT EXISTS trg_accounting_requests_segregation BEFORE UPDATE ON accounting_requests
        WHEN NEW.decidedById IS NOT NULL AND NEW.decidedById = OLD.requestedById
        BEGIN SELECT RAISE(ABORT, 'O pedido tem de ser decidido por outro administrador'); END`,
    `CREATE TRIGGER IF NOT EXISTS trg_accounting_requests_delete BEFORE DELETE ON accounting_requests
        BEGIN SELECT RAISE(ABORT, 'O histórico de pedidos é imutável'); END`,
    // Selos HMAC (só o processo principal do aplicativo desktop escreve aqui, com uma chave fora da base
    // de dados). Não são sincronizados: cada computador sela a sua cópia do razão.
    `CREATE TABLE IF NOT EXISTS accounting_entry_seals (
        seq INTEGER PRIMARY KEY AUTOINCREMENT, entryId TEXT NOT NULL UNIQUE, hmac TEXT NOT NULL, previousHmac TEXT NOT NULL,
        origin TEXT NOT NULL CHECK(origin IN ('local','remote','legacy','review')), sealedAt TEXT NOT NULL
    );`,
    `CREATE TRIGGER IF NOT EXISTS trg_accounting_entry_seals_update BEFORE UPDATE ON accounting_entry_seals
        BEGIN SELECT RAISE(ABORT, 'Os selos contabilísticos são imutáveis'); END`,
    `CREATE TRIGGER IF NOT EXISTS trg_accounting_entry_seals_delete BEFORE DELETE ON accounting_entry_seals
        BEGIN SELECT RAISE(ABORT, 'Os selos contabilísticos são imutáveis'); END`
];
