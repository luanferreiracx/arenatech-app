-- AlterEnum: adiciona CLOSING ao status da apuracao (lock anti-race)
ALTER TYPE "ProviderApuracaoStatus" ADD VALUE 'CLOSING';

-- CreateTable: SocioCommissionRule (flat % por categoria, paridade Laravel socio_regras_comissao)
CREATE TABLE "socio_commission_rules" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "category" TEXT NOT NULL,
    "rate" DECIMAL(5,2) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "socio_commission_rules_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "socio_commission_rules_tenant_id_user_id_category_key" ON "socio_commission_rules"("tenant_id", "user_id", "category");
CREATE INDEX "socio_commission_rules_tenant_id_user_id_active_idx" ON "socio_commission_rules"("tenant_id", "user_id", "active");

-- RLS
ALTER TABLE "socio_commission_rules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "socio_commission_rules" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "socio_commission_rules"
  USING ("tenant_id" = current_setting('app.current_tenant_id')::uuid);
