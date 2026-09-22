BEGIN;
INSERT INTO tenants (id, legal_name, tax_id_hash, status) VALUES
  ('00000000-0000-4000-8000-000000000001', 'Tenant A', 'test-a', 'active'),
  ('00000000-0000-4000-8000-000000000002', 'Tenant B', 'test-b', 'active')
ON CONFLICT DO NOTHING;
SET LOCAL app.tenant_id = '00000000-0000-4000-8000-000000000001';
INSERT INTO domain_events (event_id, tenant_id, entity_type, entity_id, entity_version, event_type, payload, origin_device, logical_timestamp)
VALUES ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'credit', 'credit-a', 1, 'credit.created', '{}', 'test', now())
ON CONFLICT DO NOTHING;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM domain_events WHERE tenant_id = '00000000-0000-4000-8000-000000000002') THEN
    RAISE EXCEPTION 'RLS tenant isolation failed';
  END IF;
END $$;
ROLLBACK;
