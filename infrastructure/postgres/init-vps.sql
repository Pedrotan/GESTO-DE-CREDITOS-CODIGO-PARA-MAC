-- =====================================================================
-- Tango Gestão e Créditos ERP - Inicialização da Base de Dados PostgreSQL
-- Compatível com: PostgreSQL 14+, 15, 16, 17 (Docker, VPS Nativo ou Neon)
-- =====================================================================

BEGIN;

-- Extensões úteis
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------
-- 1. Empresas Registadas (Tenants)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tango_tenants (
  tenant_id TEXT PRIMARY KEY,
  tenant_hash TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  access_code TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_sync_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_tango_tenants_status ON tango_tenants (status);
CREATE INDEX IF NOT EXISTS idx_tango_tenants_access_code ON tango_tenants (access_code);

-- ---------------------------------------------------------------------
-- 2. Pedidos de Registo e Onboarding de Empresas
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tango_registration_requests (
  id TEXT PRIMARY KEY,
  nif TEXT NOT NULL,
  company_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  country TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  admin_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_tango_reg_nif ON tango_registration_requests (nif);
CREATE INDEX IF NOT EXISTS idx_tango_reg_email ON tango_registration_requests (email);
CREATE INDEX IF NOT EXISTS idx_tango_reg_status ON tango_registration_requests (status);

-- ---------------------------------------------------------------------
-- 3. Tokens Seguros de Recuperação de Senha
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tango_password_reset_tokens (
  token_hash TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tango_tenants(tenant_id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tango_pwd_tenant ON tango_password_reset_tokens (tenant_id);
CREATE INDEX IF NOT EXISTS idx_tango_pwd_expires ON tango_password_reset_tokens (expires_at);

-- ---------------------------------------------------------------------
-- 4. Dados e Operações de Sincronização Cloud
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tango_sync_data (
  id BIGSERIAL PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  table_name TEXT NOT NULL,
  record_id TEXT NOT NULL,
  operation_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tango_sync_tenant ON tango_sync_data (tenant_id, id);

-- ---------------------------------------------------------------------
-- 5. Relatórios de Utilização e Métricas SaaS
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tango_usage_reports (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  reported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  active_clients INTEGER NOT NULL DEFAULT 0,
  active_loans INTEGER NOT NULL DEFAULT 0,
  total_portfolio NUMERIC(15, 2) NOT NULL DEFAULT 0,
  monthly_volume NUMERIC(15, 2) NOT NULL DEFAULT 0,
  system_version TEXT,
  metadata JSONB
);

CREATE INDEX IF NOT EXISTS idx_tango_usage_tenant ON tango_usage_reports (tenant_id, reported_at DESC);

-- ---------------------------------------------------------------------
-- 6. Rate Limiting Distribuído (Anti-DDoS e Anti-Força Bruta)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS api_rate_limits (
  key_hash TEXT PRIMARY KEY,
  request_count INTEGER NOT NULL CHECK (request_count > 0),
  reset_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_api_rate_limits_reset ON api_rate_limits (reset_at);

-- ---------------------------------------------------------------------
-- 7. Eventos de Segurança, Auditoria e Bloqueios (Lockouts)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS security_events (
  id TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  type TEXT NOT NULL,
  severity TEXT NOT NULL,
  title TEXT NOT NULL,
  details TEXT,
  ip TEXT,
  path TEXT,
  subject TEXT,
  user_agent TEXT,
  count INTEGER NOT NULL DEFAULT 1,
  acknowledged BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_security_events_seen ON security_events (last_seen DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_type ON security_events (type);

CREATE TABLE IF NOT EXISTS security_lockouts (
  key_hash TEXT PRIMARY KEY,
  failures INTEGER NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  locked_until TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_security_lockouts_locked ON security_lockouts (locked_until);

-- ---------------------------------------------------------------------
-- 8. Core Multi-Tenant e Ledger de Eventos de Domínio
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_name TEXT NOT NULL,
  tax_id_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('active', 'blocked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tenant_memberships (
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('super_admin', 'admin', 'manager', 'collector', 'auditor')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, user_id)
);

CREATE TABLE IF NOT EXISTS domain_events (
  sequence BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_id UUID NOT NULL UNIQUE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  entity_version BIGINT NOT NULL CHECK (entity_version >= 0),
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  origin_device TEXT NOT NULL,
  logical_timestamp TIMESTAMPTZ NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, entity_type, entity_id, entity_version)
);

CREATE TABLE IF NOT EXISTS sync_inbox (
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  operation_id UUID NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, operation_id)
);

CREATE TABLE IF NOT EXISTS job_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  kind TEXT NOT NULL,
  payload JSONB NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'failed', 'dead')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  locked_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS domain_events_tenant_sequence ON domain_events(tenant_id, sequence);
CREATE INDEX IF NOT EXISTS job_queue_ready ON job_queue(status, available_at) WHERE status IN ('queued', 'failed');

COMMIT;
