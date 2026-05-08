-- RLS for commission_rules
ALTER TABLE commission_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE commission_rules FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON commission_rules
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

-- RLS for commissions
ALTER TABLE commissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE commissions FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON commissions
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

-- RLS for imei_queries
ALTER TABLE imei_queries ENABLE ROW LEVEL SECURITY;
ALTER TABLE imei_queries FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON imei_queries
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

-- RLS for imei_quotas
ALTER TABLE imei_quotas ENABLE ROW LEVEL SECURITY;
ALTER TABLE imei_quotas FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON imei_quotas
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());
