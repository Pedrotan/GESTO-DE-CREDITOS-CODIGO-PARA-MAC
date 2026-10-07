-- TangoERP Database Performance Indexes
-- Purpose: Optimize query performance for large datasets
-- Created: 2026-02-10

-- Credits table indexes
CREATE INDEX IF NOT EXISTS idx_credits_clientId ON credits(clientId);
CREATE INDEX IF NOT EXISTS idx_credits_status ON credits(status);
CREATE INDEX IF NOT EXISTS idx_credits_dueDate ON credits(dueDate);
CREATE INDEX IF NOT EXISTS idx_credits_startDate ON credits(startDate);
CREATE INDEX IF NOT EXISTS idx_credits_createdAt ON credits(createdAt);

-- Payments table indexes
CREATE INDEX IF NOT EXISTS idx_payments_creditId ON payments(creditId);
CREATE INDEX IF NOT EXISTS idx_payments_paymentDate ON payments(paymentDate);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);

-- Clients table indexes
-- NIF index managed by adaptador-sqlite.ts (partial unique index excluding SEM-* clients)
CREATE INDEX IF NOT EXISTS idx_clients_status ON clients(status);
CREATE INDEX IF NOT EXISTS idx_clients_createdAt ON clients(createdAt);
CREATE INDEX IF NOT EXISTS idx_clients_email ON clients(email);

-- Audit logs table indexes
CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_audit_userId ON audit_logs(userId);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity);

-- Users table indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);

-- Simulations table indexes
CREATE INDEX IF NOT EXISTS idx_simulations_clientName ON simulations(clientName);
CREATE INDEX IF NOT EXISTS idx_simulations_createdAt ON simulations(createdAt);
CREATE INDEX IF NOT EXISTS idx_simulations_amount ON simulations(amount);

-- Composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_credits_status_dueDate ON credits(status, dueDate);
CREATE INDEX IF NOT EXISTS idx_payments_credit_date ON payments(creditId, paymentDate);
CREATE INDEX IF NOT EXISTS idx_audit_user_timestamp ON audit_logs(userId, timestamp);

-- Tabelas acrescentadas depois da instalação inicial: o arranque garante que existem em bases antigas
-- (o esquema completo só é criado pelo renderer na primeira configuração).
CREATE TABLE IF NOT EXISTS shared_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updatedAt TEXT NOT NULL, updatedBy TEXT);
-- Histórico das decisões de aprovação/rejeição de créditos (auditoria e relatórios mensais).
CREATE TABLE IF NOT EXISTS credit_approvals (id TEXT PRIMARY KEY, creditId TEXT NOT NULL, clientId TEXT, clientName TEXT, principalAmount REAL, interestRate REAL, installments INTEGER, decision TEXT NOT NULL CHECK (decision IN ('approved', 'rejected')), reason TEXT, requestedBy TEXT, requestedAt TEXT, decidedBy TEXT NOT NULL, decidedById TEXT, decidedAt TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_credit_approvals_decidedAt ON credit_approvals(decidedAt);
CREATE INDEX IF NOT EXISTS idx_credit_approvals_creditId ON credit_approvals(creditId);

CREATE TRIGGER IF NOT EXISTS trg_audit_logs_immutable_update BEFORE UPDATE ON audit_logs
BEGIN SELECT RAISE(ABORT, 'Os registos de auditoria são imutáveis'); END;
CREATE TRIGGER IF NOT EXISTS trg_audit_logs_immutable_delete BEFORE DELETE ON audit_logs
BEGIN SELECT RAISE(ABORT, 'Os registos de auditoria são imutáveis'); END;
CREATE TRIGGER IF NOT EXISTS trg_accounting_closed_period BEFORE INSERT ON accounting_entries
WHEN EXISTS (SELECT 1 FROM closed_months WHERE id = substr(NEW.timestamp, 1, 7))
BEGIN SELECT RAISE(ABORT, 'Período contabilístico fechado. Reabra-o com autorização e justificação.'); END;
CREATE TABLE IF NOT EXISTS accounting_cash_sessions (
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
);
CREATE TRIGGER IF NOT EXISTS trg_cash_session_closed_update BEFORE UPDATE ON accounting_cash_sessions
WHEN OLD.status = 'closed' BEGIN SELECT RAISE(ABORT, 'Fecho de caixa imutável'); END;
CREATE TRIGGER IF NOT EXISTS trg_cash_session_delete BEFORE DELETE ON accounting_cash_sessions
BEGIN SELECT RAISE(ABORT, 'O histórico de caixa é imutável'); END;
CREATE TABLE IF NOT EXISTS accounting_divergence_events (
 id TEXT PRIMARY KEY,
 issueKey TEXT NOT NULL,
 previousId TEXT NOT NULL DEFAULT '',
 source TEXT NOT NULL,
 description TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('pending','justified','resolved')),
 reason TEXT NOT NULL CHECK(length(trim(reason)) >= 10),
 actorId TEXT NOT NULL,
 actorName TEXT NOT NULL,
 createdAt TEXT NOT NULL,
 UNIQUE(issueKey, previousId)
);
CREATE TRIGGER IF NOT EXISTS trg_divergence_immutable_update BEFORE UPDATE ON accounting_divergence_events
 BEGIN SELECT RAISE(ABORT, 'Decisões de divergências são imutáveis'); END;
CREATE TRIGGER IF NOT EXISTS trg_divergence_immutable_delete BEFORE DELETE ON accounting_divergence_events
 BEGIN SELECT RAISE(ABORT, 'Decisões de divergências são imutáveis'); END;
CREATE TABLE IF NOT EXISTS collection_events (
 id TEXT PRIMARY KEY, creditId TEXT, kind TEXT NOT NULL CHECK(kind IN ('contact','promise','promise_kept','promise_broken','assignment','target')),
 agentId TEXT, agentName TEXT, monthKey TEXT,
 amountMinor INTEGER CHECK(amountMinor IS NULL OR (typeof(amountMinor) = 'integer' AND amountMinor >= 0)),
 promisedDate TEXT, relatedId TEXT, notes TEXT NOT NULL CHECK(length(trim(notes)) >= 5),
 actorId TEXT NOT NULL, actorName TEXT NOT NULL, createdAt TEXT NOT NULL,
 CHECK(kind NOT IN ('contact','promise','promise_kept','promise_broken','assignment') OR creditId IS NOT NULL),
 CHECK(kind <> 'promise' OR (amountMinor > 0 AND promisedDate IS NOT NULL)),
 CHECK(kind <> 'target' OR (agentId IS NOT NULL AND monthKey IS NOT NULL AND amountMinor IS NOT NULL)),
 CHECK(kind <> 'assignment' OR agentId IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_collection_credit ON collection_events(creditId, createdAt);
CREATE TRIGGER IF NOT EXISTS trg_collection_update BEFORE UPDATE ON collection_events
 BEGIN SELECT RAISE(ABORT, 'O histórico de cobrança é imutável'); END;
CREATE TRIGGER IF NOT EXISTS trg_collection_delete BEFORE DELETE ON collection_events
 BEGIN SELECT RAISE(ABORT, 'O histórico de cobrança é imutável'); END;
CREATE UNIQUE INDEX IF NOT EXISTS idx_collection_promise_decision ON collection_events(relatedId) WHERE kind IN ('promise_kept','promise_broken');

CREATE TABLE IF NOT EXISTS accounting_bank_imports (id TEXT PRIMARY KEY, fileName TEXT NOT NULL, movements TEXT NOT NULL,
 actorId TEXT NOT NULL, actorName TEXT NOT NULL, importedAt TEXT NOT NULL);
CREATE TRIGGER IF NOT EXISTS trg_bank_import_update BEFORE UPDATE ON accounting_bank_imports
 BEGIN SELECT RAISE(ABORT, 'O extrato importado é imutável'); END;
CREATE TRIGGER IF NOT EXISTS trg_bank_import_delete BEFORE DELETE ON accounting_bank_imports
 BEGIN SELECT RAISE(ABORT, 'O extrato importado é imutável'); END;
CREATE TABLE IF NOT EXISTS audit_log_chain (seq INTEGER PRIMARY KEY AUTOINCREMENT, auditId TEXT NOT NULL UNIQUE, previousHash TEXT NOT NULL, integrityHash TEXT NOT NULL, origin TEXT NOT NULL CHECK(origin IN ('live','legacy')));
CREATE TRIGGER IF NOT EXISTS trg_audit_chain_insert AFTER INSERT ON audit_logs BEGIN
        INSERT INTO audit_log_chain (auditId, previousHash, integrityHash, origin)
        VALUES (NEW.id, COALESCE((SELECT integrityHash FROM audit_log_chain ORDER BY seq DESC LIMIT 1), '0000000000000000000000000000000000000000000000000000000000000000'),
            tango_audit_hash(NEW.id,NEW.timestamp,NEW.userId,NEW.userName,NEW.action,NEW.entity,NEW.details,NEW.previousState,NEW.newState,NEW.metadata,
                COALESCE((SELECT integrityHash FROM audit_log_chain ORDER BY seq DESC LIMIT 1), '0000000000000000000000000000000000000000000000000000000000000000')),'live'); END;
CREATE TRIGGER IF NOT EXISTS trg_audit_chain_update BEFORE UPDATE ON audit_log_chain BEGIN SELECT RAISE(ABORT,'A cadeia de auditoria é imutável'); END;
CREATE TRIGGER IF NOT EXISTS trg_audit_chain_delete BEFORE DELETE ON audit_log_chain BEGIN SELECT RAISE(ABORT,'A cadeia de auditoria é imutável'); END;

CREATE TABLE IF NOT EXISTS accounting_receipts (id TEXT PRIMARY KEY, entryId TEXT NOT NULL UNIQUE, fileName TEXT NOT NULL, mime TEXT NOT NULL,
        data TEXT NOT NULL, digest TEXT NOT NULL, createdAt TEXT NOT NULL);
CREATE TRIGGER IF NOT EXISTS trg_receipt_update BEFORE UPDATE ON accounting_receipts BEGIN SELECT RAISE(ABORT,'O comprovativo contabilístico é imutável'); END;
CREATE TRIGGER IF NOT EXISTS trg_receipt_delete BEFORE DELETE ON accounting_receipts BEGIN SELECT RAISE(ABORT,'O comprovativo contabilístico é imutável'); END;
