-- SEGURANÇA: a migração 20260713120000_product_brand_entity (#536) criou a tabela
-- product_brands SEM RLS — todas as outras tabelas com tenant_id têm RLS forçado +
-- policy. Sem isto, product_brands vaza cross-tenant (um tenant lê/escreve as
-- marcas de outro). Achado da auditoria RLS 2026-07-13 (H1). Mesmo padrão da
-- tabela-irmã product_categories (migração 20260514013206_rls_suppliers_categories).

ALTER TABLE product_brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_brands FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON product_brands
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

CREATE POLICY admin_bypass ON product_brands
  TO app_admin
  USING (true)
  WITH CHECK (true);
