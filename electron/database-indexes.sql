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
