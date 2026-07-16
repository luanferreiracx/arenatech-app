-- Fase B — saque do modo carteira externa por intermediacao.

-- Novo estado: saque externo aguardando o tenant enviar o DePix pra nossa carteira
-- de intermediacao (arena-fees). ADD VALUE e append-only e seguro (PG 12+); nao e
-- usado em nenhum statement desta mesma migration.
ALTER TYPE "DepixTransactionStatus" ADD VALUE IF NOT EXISTS 'AWAITING_DEPOSIT';

-- Fila idempotente de repasse (-> Eulen) / refund (-> tenant) do saque externo.
CREATE TABLE "depix_withdraw_forwards" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "transaction_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "destination_address" TEXT NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "forward_tx_id" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "depix_withdraw_forwards_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "depix_withdraw_forwards_transaction_id_key" ON "depix_withdraw_forwards"("transaction_id");
CREATE INDEX "depix_withdraw_forwards_status_created_at_idx" ON "depix_withdraw_forwards"("status", "created_at");
CREATE INDEX "depix_withdraw_forwards_tenant_id_created_at_idx" ON "depix_withdraw_forwards"("tenant_id", "created_at");
