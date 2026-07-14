-- G-P1-17: RLS backstop na tabela `subscriptions`.
--
-- Era a UNICA tabela com `tenant_id` sem ENABLE+FORCE ROW LEVEL SECURITY (120/120
-- outras tabelas tenant tem). O acesso legitimo e sempre via `withAdmin`
-- (SET LOCAL ROLE app_admin, BYPASSRLS) — que ignora RLS, entao o billing admin
-- NAO quebra. A policy fecha o buraco do modelo: um futuro `withTenant(...)`
-- (role app_user, sujeito a RLS) que consultasse `subscription` sem filtro
-- explicito passaria a NAO ver o plano/billing de outro tenant.
--
-- `tenant_id` ja e `@unique` (indice unico) — coluna da policy indexada.
-- Segue o padrao `tenant_isolation` USING das demais tabelas (WITH CHECK herda a
-- expressao USING para policies FOR ALL).
ALTER TABLE "subscriptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "subscriptions" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "subscriptions"
  USING ("tenant_id" = current_setting('app.current_tenant_id')::uuid);
