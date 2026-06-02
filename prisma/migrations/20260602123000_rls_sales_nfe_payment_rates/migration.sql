-- RLS faltando em mais tabelas tenant de fluxos em PRODUCAO.
--
-- Mesma classe de bug do saque/venda avulsa: tabelas com tenant_id criadas sem
-- Row Level Security, entao withTenant() nao isolava e dados de um tenant
-- apareciam para outro. Aplicamos o padrao canonico (tenant_isolation +
-- admin_bypass + grants), identico as demais tabelas tenant.
--
-- Cobertas aqui (todas com fluxo ativo em prod):
--   payment_method_rates  (taxas por forma de pagamento)
--   sale_audits           (auditoria de vendas/PDV)
--   sale_documents        (documentos de venda)
--   sale_upgrades         (upgrades/trade-in de venda)
--   nfe_imports           (NF-e de entrada)
--   nfe_import_items      (itens da NF-e de entrada)
--
-- NAO incluidas (precisam de analise dedicada, NAO sao corrigidas aqui):
--   user_tenants            (tabela de juncao global usuario<->tenant)
--   tenant_number_sequences (geracao sequencial transacional; RLS pode interagir
--                            com o lock de numeracao)
--   checklists, reward_*, chatbot_* (modulos fora de escopo / inativos)

-- helper local: aplica o padrao em cada tabela
-- (Postgres nao tem "macro"; repetimos o bloco por tabela.)

-- payment_method_rates
ALTER TABLE payment_method_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_method_rates FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON payment_method_rates
  USING (tenant_id::text = current_setting('app.current_tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.current_tenant_id', true));
CREATE POLICY admin_bypass ON payment_method_rates
  FOR ALL TO app_admin USING (true) WITH CHECK (true);
GRANT ALL ON payment_method_rates TO app_user;
GRANT ALL ON payment_method_rates TO app_admin;

-- sale_audits
ALTER TABLE sale_audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_audits FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON sale_audits
  USING (tenant_id::text = current_setting('app.current_tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.current_tenant_id', true));
CREATE POLICY admin_bypass ON sale_audits
  FOR ALL TO app_admin USING (true) WITH CHECK (true);
GRANT ALL ON sale_audits TO app_user;
GRANT ALL ON sale_audits TO app_admin;

-- sale_documents
ALTER TABLE sale_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_documents FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON sale_documents
  USING (tenant_id::text = current_setting('app.current_tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.current_tenant_id', true));
CREATE POLICY admin_bypass ON sale_documents
  FOR ALL TO app_admin USING (true) WITH CHECK (true);
GRANT ALL ON sale_documents TO app_user;
GRANT ALL ON sale_documents TO app_admin;

-- sale_upgrades
ALTER TABLE sale_upgrades ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_upgrades FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON sale_upgrades
  USING (tenant_id::text = current_setting('app.current_tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.current_tenant_id', true));
CREATE POLICY admin_bypass ON sale_upgrades
  FOR ALL TO app_admin USING (true) WITH CHECK (true);
GRANT ALL ON sale_upgrades TO app_user;
GRANT ALL ON sale_upgrades TO app_admin;

-- nfe_imports
ALTER TABLE nfe_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE nfe_imports FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON nfe_imports
  USING (tenant_id::text = current_setting('app.current_tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.current_tenant_id', true));
CREATE POLICY admin_bypass ON nfe_imports
  FOR ALL TO app_admin USING (true) WITH CHECK (true);
GRANT ALL ON nfe_imports TO app_user;
GRANT ALL ON nfe_imports TO app_admin;

-- nfe_import_items
ALTER TABLE nfe_import_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE nfe_import_items FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON nfe_import_items
  USING (tenant_id::text = current_setting('app.current_tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.current_tenant_id', true));
CREATE POLICY admin_bypass ON nfe_import_items
  FOR ALL TO app_admin USING (true) WITH CHECK (true);
GRANT ALL ON nfe_import_items TO app_user;
GRANT ALL ON nfe_import_items TO app_admin;
