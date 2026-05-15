-- Enable RLS on provider commission tables and service_observations

-- providers
ALTER TABLE providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE providers FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON providers USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());
CREATE POLICY admin_bypass ON providers TO app_admin USING (true) WITH CHECK (true);

-- provider_contracts
ALTER TABLE provider_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_contracts FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON provider_contracts USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());
CREATE POLICY admin_bypass ON provider_contracts TO app_admin USING (true) WITH CHECK (true);

-- provider_commission_rules
ALTER TABLE provider_commission_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_commission_rules FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON provider_commission_rules USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());
CREATE POLICY admin_bypass ON provider_commission_rules TO app_admin USING (true) WITH CHECK (true);

-- provider_apuracoes
ALTER TABLE provider_apuracoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_apuracoes FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON provider_apuracoes USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());
CREATE POLICY admin_bypass ON provider_apuracoes TO app_admin USING (true) WITH CHECK (true);

-- provider_reversals
ALTER TABLE provider_reversals ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_reversals FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON provider_reversals USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());
CREATE POLICY admin_bypass ON provider_reversals TO app_admin USING (true) WITH CHECK (true);

-- provider_uncovered_days
ALTER TABLE provider_uncovered_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_uncovered_days FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON provider_uncovered_days USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());
CREATE POLICY admin_bypass ON provider_uncovered_days TO app_admin USING (true) WITH CHECK (true);

-- service_observations
ALTER TABLE service_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_observations FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON service_observations USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());
CREATE POLICY admin_bypass ON service_observations TO app_admin USING (true) WITH CHECK (true);
