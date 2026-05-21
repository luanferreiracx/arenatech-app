-- Habilita RLS em addon_purchases e refunds (tabelas tenant-scoped que estavam sem policy).
-- Defense-in-depth: query direta via $queryRaw sem withTenant nao deve vazar dados cross-tenant.

-- addon_purchases
ALTER TABLE "addon_purchases" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "addon_purchases" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "addon_purchases"
  USING ("tenant_id" = current_setting('app.current_tenant_id')::uuid);

-- refunds
ALTER TABLE "refunds" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "refunds" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "refunds"
  USING ("tenant_id" = current_setting('app.current_tenant_id')::uuid);
