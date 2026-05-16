-- RLS for Estoque-A new tables
-- Pattern: ENABLE RLS + FORCE + policy for app_user (tenant-scoped)

-- product_category_pivots
ALTER TABLE "product_category_pivots" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "product_category_pivots" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "product_category_pivots"
  USING ("tenant_id" = current_setting('app.current_tenant_id')::uuid);

-- product_attributes
ALTER TABLE "product_attributes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "product_attributes" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "product_attributes"
  USING ("tenant_id" = current_setting('app.current_tenant_id')::uuid);

-- product_attribute_values
ALTER TABLE "product_attribute_values" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "product_attribute_values" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "product_attribute_values"
  USING ("tenant_id" = current_setting('app.current_tenant_id')::uuid);

-- product_variations
ALTER TABLE "product_variations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "product_variations" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "product_variations"
  USING ("tenant_id" = current_setting('app.current_tenant_id')::uuid);

-- product_photos
ALTER TABLE "product_photos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "product_photos" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "product_photos"
  USING ("tenant_id" = current_setting('app.current_tenant_id')::uuid);
