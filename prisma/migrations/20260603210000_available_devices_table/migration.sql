-- Catálogo de aparelhos disponíveis para venda (espelho do aparelhos_catalogo
-- do Laravel). Tabela dedicada, consultada pelo Talison ("tem iPhone 15?").
-- Reusa o enum DeviceCondition já existente.

CREATE TABLE "available_devices" (
  "id"               UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id"        UUID NOT NULL,
  "model"            TEXT NOT NULL,
  "category"         TEXT NOT NULL,
  "condition"        "DeviceCondition" NOT NULL DEFAULT 'NEW',
  "price"            DECIMAL(10,2) NOT NULL,
  "note"             TEXT,
  "active"           BOOLEAN NOT NULL DEFAULT true,
  "price_updated_at" TIMESTAMP(3),
  "deleted_at"       TIMESTAMP(3),
  "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"       TIMESTAMP(3) NOT NULL,
  CONSTRAINT "available_devices_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "available_devices_tenant_id_active_idx" ON "available_devices"("tenant_id", "active");
CREATE INDEX "available_devices_tenant_id_category_idx" ON "available_devices"("tenant_id", "category");
CREATE INDEX "available_devices_tenant_id_model_idx" ON "available_devices"("tenant_id", "model");

-- RLS por tenant (padrão do projeto — ADR isolamento de tenants).
ALTER TABLE "available_devices" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "available_devices" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "available_devices"
  USING (tenant_id::text = current_setting('app.current_tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.current_tenant_id', true));
CREATE POLICY admin_bypass ON "available_devices"
  FOR ALL TO app_admin USING (true) WITH CHECK (true);
GRANT ALL ON "available_devices" TO app_user;
GRANT ALL ON "available_devices" TO app_admin;
