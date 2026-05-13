-- Enable RLS on device_valuations
ALTER TABLE device_valuations ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_valuations FORCE ROW LEVEL SECURITY;

-- Tenant isolation policy
CREATE POLICY tenant_isolation ON device_valuations
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

-- Admin bypass policy
CREATE POLICY admin_bypass ON device_valuations
  TO app_admin
  USING (true)
  WITH CHECK (true);
