-- RLS for delivery_persons
ALTER TABLE delivery_persons ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_persons FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON delivery_persons
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

-- RLS for external_labs
ALTER TABLE external_labs ENABLE ROW LEVEL SECURITY;
ALTER TABLE external_labs FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON external_labs
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

-- RLS for lab_orders
ALTER TABLE lab_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE lab_orders FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON lab_orders
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

-- RLS for service_providers
ALTER TABLE service_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_providers FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON service_providers
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());
