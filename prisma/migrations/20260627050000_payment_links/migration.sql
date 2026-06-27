-- Link de pagamento DePix (gerado no DePix Wallet; cliente paga por /pay/<token>).
-- Sem conceito de venda — so a cobranca. Token unico; vinculo opcional ao
-- deposito quando pago.

-- Enum de status do link.
CREATE TYPE "PaymentLinkStatus" AS ENUM ('ACTIVE', 'PAID', 'EXPIRED', 'CANCELLED');

-- Novo valor de origem da transacao DePix.
ALTER TYPE "DepixTransactionSourceType" ADD VALUE 'PAYMENT_LINK';

CREATE TABLE "payment_links" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "token" TEXT NOT NULL,
  "amount_cents" INTEGER,
  "description" TEXT,
  "status" "PaymentLinkStatus" NOT NULL DEFAULT 'ACTIVE',
  "wallet_transaction_id" UUID,
  "created_by_id" UUID NOT NULL,
  "paid_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "payment_links_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "payment_links_token_key" ON "payment_links"("token");
CREATE UNIQUE INDEX "payment_links_wallet_transaction_id_key" ON "payment_links"("wallet_transaction_id");
CREATE INDEX "payment_links_tenant_id_status_idx" ON "payment_links"("tenant_id", "status");
CREATE INDEX "payment_links_tenant_id_created_at_idx" ON "payment_links"("tenant_id", "created_at");

-- RLS: isolamento por tenant (mesmo backstop das demais tabelas tenant-scoped).
-- A pagina publica /pay le via withAdmin (BYPASSRLS); o painel le via withTenant.
ALTER TABLE "payment_links" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payment_links" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "payment_links"
  USING ("tenant_id" = current_setting('app.current_tenant_id')::uuid);
