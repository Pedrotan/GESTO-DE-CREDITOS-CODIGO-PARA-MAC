-- Verificação do e-mail de empresas no onboarding
BEGIN;

CREATE TABLE IF NOT EXISTS tango_company_email_verifications (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL,
  nif TEXT NOT NULL,
  email TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_company_email_verification_request
  ON tango_company_email_verifications (request_id, nif);
CREATE INDEX IF NOT EXISTS idx_company_email_verification_expiry
  ON tango_company_email_verifications (expires_at, used);

ALTER TABLE tango_registration_requests
  ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;

COMMIT;
