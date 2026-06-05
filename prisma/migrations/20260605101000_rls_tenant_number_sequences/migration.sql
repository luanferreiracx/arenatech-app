-- Aplica defesa em profundidade na tabela de sequencias tenant-scoped.
-- A numeracao continua sendo feita por nextTenantNumber(...) dentro de withTenant,
-- via INSERT ... ON CONFLICT DO UPDATE atomico para (tenant_id, scope, year).

ALTER TABLE tenant_number_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_number_sequences FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON tenant_number_sequences;
CREATE POLICY tenant_isolation ON tenant_number_sequences
  USING (tenant_id::text = current_setting('app.current_tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.current_tenant_id', true));

DROP POLICY IF EXISTS admin_bypass ON tenant_number_sequences;
CREATE POLICY admin_bypass ON tenant_number_sequences
  FOR ALL TO app_admin USING (true) WITH CHECK (true);

GRANT ALL ON tenant_number_sequences TO app_user;
GRANT ALL ON tenant_number_sequences TO app_admin;
