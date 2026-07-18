-- RLS na fila de repasses de saque externo (auditoria: a tabela nasceu no #596
-- com `tenant_id` mas SEM RLS — o guard-rail rls.test pegou). Processada só via
-- withAdmin (app_admin = BYPASSRLS), então a política é isolamento defense-in-depth
-- e destrava um futuro acesso via withTenant. Mesmo padrão das irmãs
-- (depix_deposit_repayments). tenant_id já é indexado (@@index([tenantId, createdAt])).
ALTER TABLE "depix_withdraw_forwards" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "depix_withdraw_forwards" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "depix_withdraw_forwards"
  USING ("tenant_id" = current_setting('app.current_tenant_id')::uuid);
