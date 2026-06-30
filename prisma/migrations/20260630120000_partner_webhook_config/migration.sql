-- Config de webhook de saida da API de parceiros (ADR 0057, Fase 4): 1 por tenant.
-- URL + secret HMAC. RLS por tenant (mesma como as demais tabelas tenant-scoped).
CREATE TABLE "partner_webhook_configs" (
  "tenant_id" UUID NOT NULL,
  "url" TEXT,
  "secret" TEXT,
  "last_delivery_at" TIMESTAMP(3),
  "updated_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "partner_webhook_configs_pkey" PRIMARY KEY ("tenant_id")
);

ALTER TABLE "partner_webhook_configs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "partner_webhook_configs" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "partner_webhook_configs"
  USING ("tenant_id" = current_setting('app.current_tenant_id')::uuid);
