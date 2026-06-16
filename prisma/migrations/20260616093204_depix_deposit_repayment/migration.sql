-- ADR 0052 — taxa de deposito non-custodial via carteira de taxas custodial.
-- Aditivo, zero-downtime.

-- Coluna que registra a carteira que RECEBE o DePix do deposito. Para tenant
-- non-custodial = carteira de taxas (arena-fees); null = legado/custodial
-- (recebe na propria carteira do tenant). Nullable -> sem backfill.
ALTER TABLE "tenant_depix_transactions"
  ADD COLUMN "deposit_receiving_tenant_id" UUID;

-- Fila idempotente do repasse do liquido (bruto - taxa) da carteira de taxas
-- custodial -> carteira do tenant non-custodial real.
CREATE TABLE "depix_deposit_repayments" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "transaction_id" UUID NOT NULL,
    "destination_address" TEXT NOT NULL,
    "net_amount_cents" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "repayment_tx_id" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "depix_deposit_repayments_pkey" PRIMARY KEY ("id")
);

-- 1 repasse por deposito — defesa estrutural anti-duplo.
CREATE UNIQUE INDEX "depix_deposit_repayments_transaction_id_key"
  ON "depix_deposit_repayments"("transaction_id");

CREATE INDEX "depix_deposit_repayments_status_created_at_idx"
  ON "depix_deposit_repayments"("status", "created_at");

-- Indexa tenant_id (coluna usada na policy de RLS abaixo).
CREATE INDEX "depix_deposit_repayments_tenant_id_created_at_idx"
  ON "depix_deposit_repayments"("tenant_id", "created_at");

-- RLS: tenant_id = tenant DESTINO real. Hoje so acessada via withAdmin
-- (app_admin, BYPASSRLS) no settle/cron; isto instala o backstop padrao das
-- tabelas tenant-scoped, pra caso futuro de acesso via withTenant (app_user).
ALTER TABLE "depix_deposit_repayments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "depix_deposit_repayments" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "depix_deposit_repayments"
  USING ("tenant_id" = current_setting('app.current_tenant_id')::uuid);
