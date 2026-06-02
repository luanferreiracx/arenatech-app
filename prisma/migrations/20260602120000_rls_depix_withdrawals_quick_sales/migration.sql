-- RLS faltando em depix_withdrawals e quick_sales.
--
-- Ambas tem coluna tenant_id mas foram criadas SEM Row Level Security, entao o
-- withTenant() nao isolava: saques e vendas avulsas de TODOS os tenants
-- (inclusive o central arena-tech) vazavam na listagem de qualquer tenant.
-- Aqui aplicamos o padrao canonico do projeto (tenant_isolation + admin_bypass),
-- identico ao usado nas demais tabelas tenant.

-- ── depix_withdrawals (Saques DePix) ──
ALTER TABLE depix_withdrawals ENABLE ROW LEVEL SECURITY;
ALTER TABLE depix_withdrawals FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON depix_withdrawals
  USING (tenant_id::text = current_setting('app.current_tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.current_tenant_id', true));

CREATE POLICY admin_bypass ON depix_withdrawals
  FOR ALL TO app_admin USING (true) WITH CHECK (true);

GRANT ALL ON depix_withdrawals TO app_user;
GRANT ALL ON depix_withdrawals TO app_admin;

-- ── quick_sales (Vendas Avulsas DePix) ──
ALTER TABLE quick_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE quick_sales FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON quick_sales
  USING (tenant_id::text = current_setting('app.current_tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.current_tenant_id', true));

CREATE POLICY admin_bypass ON quick_sales
  FOR ALL TO app_admin USING (true) WITH CHECK (true);

GRANT ALL ON quick_sales TO app_user;
GRANT ALL ON quick_sales TO app_admin;
