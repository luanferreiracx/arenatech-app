-- RLS faltando em tabelas tenant dos modulos reward / chatbot / checklist.
--
-- Os routers reward/chatbot/checklist estao montados em root.ts e sao
-- chamaveis via tRPC. Operam sob withTenant() confiando 100% na RLS, mas estas
-- tabelas foram criadas SEM Row Level Security — entao app_user enxergava
-- linhas de TODOS os tenants. Mesmo que alguns modulos estejam pouco usados, o
-- principio e: NENHUM dado de tenant pode vazar, jamais. RLS aqui e defesa em
-- profundidade barata e inofensiva. Padrao canonico (tenant_isolation +
-- admin_bypass + grants).
--
-- Mais sensiveis: reward_balances/reward_movements/reward_actions (dinheiro,
-- cashback) e chatbot_messages/checklists (PII, IMEI, conversas de clientes).

-- reward_balances
ALTER TABLE reward_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE reward_balances FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON reward_balances
  USING (tenant_id::text = current_setting('app.current_tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.current_tenant_id', true));
CREATE POLICY admin_bypass ON reward_balances
  FOR ALL TO app_admin USING (true) WITH CHECK (true);
GRANT ALL ON reward_balances TO app_user;
GRANT ALL ON reward_balances TO app_admin;

-- reward_movements
ALTER TABLE reward_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE reward_movements FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON reward_movements
  USING (tenant_id::text = current_setting('app.current_tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.current_tenant_id', true));
CREATE POLICY admin_bypass ON reward_movements
  FOR ALL TO app_admin USING (true) WITH CHECK (true);
GRANT ALL ON reward_movements TO app_user;
GRANT ALL ON reward_movements TO app_admin;

-- reward_actions
ALTER TABLE reward_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE reward_actions FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON reward_actions
  USING (tenant_id::text = current_setting('app.current_tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.current_tenant_id', true));
CREATE POLICY admin_bypass ON reward_actions
  FOR ALL TO app_admin USING (true) WITH CHECK (true);
GRANT ALL ON reward_actions TO app_user;
GRANT ALL ON reward_actions TO app_admin;

-- reward_campaigns
ALTER TABLE reward_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE reward_campaigns FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON reward_campaigns
  USING (tenant_id::text = current_setting('app.current_tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.current_tenant_id', true));
CREATE POLICY admin_bypass ON reward_campaigns
  FOR ALL TO app_admin USING (true) WITH CHECK (true);
GRANT ALL ON reward_campaigns TO app_user;
GRANT ALL ON reward_campaigns TO app_admin;

-- chatbot_conversations
ALTER TABLE chatbot_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE chatbot_conversations FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON chatbot_conversations
  USING (tenant_id::text = current_setting('app.current_tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.current_tenant_id', true));
CREATE POLICY admin_bypass ON chatbot_conversations
  FOR ALL TO app_admin USING (true) WITH CHECK (true);
GRANT ALL ON chatbot_conversations TO app_user;
GRANT ALL ON chatbot_conversations TO app_admin;

-- chatbot_messages
ALTER TABLE chatbot_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE chatbot_messages FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON chatbot_messages
  USING (tenant_id::text = current_setting('app.current_tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.current_tenant_id', true));
CREATE POLICY admin_bypass ON chatbot_messages
  FOR ALL TO app_admin USING (true) WITH CHECK (true);
GRANT ALL ON chatbot_messages TO app_user;
GRANT ALL ON chatbot_messages TO app_admin;

-- chatbot_follow_ups
ALTER TABLE chatbot_follow_ups ENABLE ROW LEVEL SECURITY;
ALTER TABLE chatbot_follow_ups FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON chatbot_follow_ups
  USING (tenant_id::text = current_setting('app.current_tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.current_tenant_id', true));
CREATE POLICY admin_bypass ON chatbot_follow_ups
  FOR ALL TO app_admin USING (true) WITH CHECK (true);
GRANT ALL ON chatbot_follow_ups TO app_user;
GRANT ALL ON chatbot_follow_ups TO app_admin;

-- checklists
ALTER TABLE checklists ENABLE ROW LEVEL SECURITY;
ALTER TABLE checklists FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON checklists
  USING (tenant_id::text = current_setting('app.current_tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.current_tenant_id', true));
CREATE POLICY admin_bypass ON checklists
  FOR ALL TO app_admin USING (true) WITH CHECK (true);
GRANT ALL ON checklists TO app_user;
GRANT ALL ON checklists TO app_admin;
