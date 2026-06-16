-- Fundação do controle financeiro de recebimentos (PDV).
-- Aditivo, zero-downtime: tabelas novas, nenhum backfill, comportamento antigo
-- intacto (vendas sem adquirente seguem como hoje).
--
-- Modela meios de recebimento por cartão (adquirente + bandeira + taxa por
-- parcela), contas de recebimento e recebíveis (card_receivables) com líquido
-- esperado e liquidação D+N. Base p/ conciliação futura.

-- CreateEnum
CREATE TYPE "ReceivingAccountType" AS ENUM ('CASH', 'BANK', 'PIX', 'WALLET');

-- CreateEnum
CREATE TYPE "CardKind" AS ENUM ('CREDIT', 'DEBIT');

-- CreateEnum
CREATE TYPE "CardReceivableStatus" AS ENUM ('PENDING', 'SETTLED', 'CANCELLED');

-- CreateTable
CREATE TABLE "receiving_accounts" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ReceivingAccountType" NOT NULL,
    "bank_name" TEXT,
    "agency" TEXT,
    "account_number" TEXT,
    "pix_key" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "receiving_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "acquirers" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "receiving_account_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "acquirers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "card_brands" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "card_brands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "acquirer_rates" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "acquirer_id" UUID NOT NULL,
    "card_brand_id" UUID NOT NULL,
    "kind" "CardKind" NOT NULL,
    "installments" INTEGER NOT NULL,
    "fee_percent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "fee_fixed" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "settlement_days" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "acquirer_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "card_receivables" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "sale_id" UUID,
    "service_order_id" UUID,
    "cash_movement_id" UUID,
    "acquirer_id" UUID NOT NULL,
    "card_brand_id" UUID NOT NULL,
    "kind" "CardKind" NOT NULL,
    "installment_number" INTEGER NOT NULL,
    "installments_total" INTEGER NOT NULL,
    "gross_amount" DECIMAL(10,2) NOT NULL,
    "fee_amount" DECIMAL(10,2) NOT NULL,
    "net_amount" DECIMAL(10,2) NOT NULL,
    "expected_settlement_date" TIMESTAMP(3) NOT NULL,
    "receiving_account_id" UUID,
    "status" "CardReceivableStatus" NOT NULL DEFAULT 'PENDING',
    "settled_at" TIMESTAMP(3),
    "created_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "card_receivables_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "receiving_accounts_tenant_id_active_idx" ON "receiving_accounts"("tenant_id", "active");

-- CreateIndex
CREATE UNIQUE INDEX "receiving_accounts_tenant_id_name_key" ON "receiving_accounts"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "acquirers_tenant_id_active_idx" ON "acquirers"("tenant_id", "active");

-- CreateIndex
CREATE INDEX "acquirers_tenant_id_receiving_account_id_idx" ON "acquirers"("tenant_id", "receiving_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "acquirers_tenant_id_name_key" ON "acquirers"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "card_brands_tenant_id_active_idx" ON "card_brands"("tenant_id", "active");

-- CreateIndex
CREATE UNIQUE INDEX "card_brands_tenant_id_name_key" ON "card_brands"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "acquirer_rates_tenant_id_acquirer_id_idx" ON "acquirer_rates"("tenant_id", "acquirer_id");

-- CreateIndex
CREATE UNIQUE INDEX "acquirer_rates_acquirer_id_card_brand_id_kind_installments_key" ON "acquirer_rates"("acquirer_id", "card_brand_id", "kind", "installments");

-- CreateIndex
CREATE INDEX "card_receivables_tenant_id_status_expected_settlement_date_idx" ON "card_receivables"("tenant_id", "status", "expected_settlement_date");

-- CreateIndex
CREATE INDEX "card_receivables_tenant_id_sale_id_idx" ON "card_receivables"("tenant_id", "sale_id");

-- CreateIndex
CREATE INDEX "card_receivables_tenant_id_service_order_id_idx" ON "card_receivables"("tenant_id", "service_order_id");

-- CreateIndex
CREATE INDEX "card_receivables_tenant_id_acquirer_id_idx" ON "card_receivables"("tenant_id", "acquirer_id");

-- AddForeignKey
ALTER TABLE "acquirers" ADD CONSTRAINT "acquirers_receiving_account_id_fkey" FOREIGN KEY ("receiving_account_id") REFERENCES "receiving_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "acquirer_rates" ADD CONSTRAINT "acquirer_rates_acquirer_id_fkey" FOREIGN KEY ("acquirer_id") REFERENCES "acquirers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "acquirer_rates" ADD CONSTRAINT "acquirer_rates_card_brand_id_fkey" FOREIGN KEY ("card_brand_id") REFERENCES "card_brands"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card_receivables" ADD CONSTRAINT "card_receivables_acquirer_id_fkey" FOREIGN KEY ("acquirer_id") REFERENCES "acquirers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card_receivables" ADD CONSTRAINT "card_receivables_card_brand_id_fkey" FOREIGN KEY ("card_brand_id") REFERENCES "card_brands"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card_receivables" ADD CONSTRAINT "card_receivables_receiving_account_id_fkey" FOREIGN KEY ("receiving_account_id") REFERENCES "receiving_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS: isolamento por tenant. Padrão das tabelas tenant-scoped (ADR 0052):
-- ENABLE + FORCE + policy tenant_isolation por app.current_tenant_id.
-- tenant_id já indexado em todas (coluna usada na policy).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "receiving_accounts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "receiving_accounts" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "receiving_accounts"
  USING ("tenant_id" = current_setting('app.current_tenant_id')::uuid);

ALTER TABLE "acquirers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "acquirers" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "acquirers"
  USING ("tenant_id" = current_setting('app.current_tenant_id')::uuid);

ALTER TABLE "card_brands" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "card_brands" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "card_brands"
  USING ("tenant_id" = current_setting('app.current_tenant_id')::uuid);

ALTER TABLE "acquirer_rates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "acquirer_rates" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "acquirer_rates"
  USING ("tenant_id" = current_setting('app.current_tenant_id')::uuid);

ALTER TABLE "card_receivables" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "card_receivables" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "card_receivables"
  USING ("tenant_id" = current_setting('app.current_tenant_id')::uuid);
