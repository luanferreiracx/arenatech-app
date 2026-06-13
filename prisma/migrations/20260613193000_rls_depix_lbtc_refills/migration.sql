-- RLS para depix_lbtc_refills.
-- Tabela com tenant_id que ainda nao tinha politica de isolamento. Hoje so e
-- acessada via withAdmin (app_admin, BYPASSRLS), entao nada muda no acesso
-- atual; isto instala o mesmo backstop das demais tabelas tenant-scoped, pra
-- caso futuro de acesso via withTenant (app_user). O indice
-- (tenant_id, created_at) ja existe, satisfazendo a regra de indexar coluna
-- usada em policy.
ALTER TABLE "depix_lbtc_refills" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "depix_lbtc_refills" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "depix_lbtc_refills"
  USING ("tenant_id" = current_setting('app.current_tenant_id')::uuid);
