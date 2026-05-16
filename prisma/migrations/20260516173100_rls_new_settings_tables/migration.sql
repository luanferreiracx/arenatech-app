-- Enable RLS on new settings tables

ALTER TABLE tenant_fiscal_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_fiscal_settings FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON tenant_fiscal_settings
  USING (tenant_id::text = current_setting('app.current_tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.current_tenant_id', true));

CREATE POLICY admin_bypass ON tenant_fiscal_settings
  FOR ALL TO app_admin USING (true) WITH CHECK (true);

GRANT ALL ON tenant_fiscal_settings TO app_user;
GRANT ALL ON tenant_fiscal_settings TO app_admin;

-- Assistance settings
ALTER TABLE tenant_assistance_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_assistance_settings FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON tenant_assistance_settings
  USING (tenant_id::text = current_setting('app.current_tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.current_tenant_id', true));

CREATE POLICY admin_bypass ON tenant_assistance_settings
  FOR ALL TO app_admin USING (true) WITH CHECK (true);

GRANT ALL ON tenant_assistance_settings TO app_user;
GRANT ALL ON tenant_assistance_settings TO app_admin;

-- Receiving settings
ALTER TABLE tenant_receiving_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_receiving_settings FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON tenant_receiving_settings
  USING (tenant_id::text = current_setting('app.current_tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.current_tenant_id', true));

CREATE POLICY admin_bypass ON tenant_receiving_settings
  FOR ALL TO app_admin USING (true) WITH CHECK (true);

GRANT ALL ON tenant_receiving_settings TO app_user;
GRANT ALL ON tenant_receiving_settings TO app_admin;
