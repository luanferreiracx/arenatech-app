-- Enable RLS on service_order_quotes
ALTER TABLE "service_order_quotes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "service_order_quotes" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON "service_order_quotes"
  USING ("tenant_id" = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK ("tenant_id" = current_setting('app.current_tenant_id')::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON "service_order_quotes" TO app_user;
GRANT ALL ON "service_order_quotes" TO app_admin;
