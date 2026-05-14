-- Enable RLS on new tables
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON suppliers
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

CREATE POLICY admin_bypass ON suppliers
  TO app_admin
  USING (true)
  WITH CHECK (true);

ALTER TABLE product_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_categories FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON product_categories
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

CREATE POLICY admin_bypass ON product_categories
  TO app_admin
  USING (true)
  WITH CHECK (true);
