-- Conciliação manual de recebíveis de cartão.
-- Aditivo, zero-downtime: colunas nullable, sem backfill. PENDING existentes
-- seguem conciliáveis. O operador bate o recebível contra o extrato da
-- adquirente e grava o líquido REAL + a diferença vs. o esperado.

-- AlterTable
ALTER TABLE "card_receivables"
  ADD COLUMN "settled_net_amount" DECIMAL(10,2),
  ADD COLUMN "settled_difference" DECIMAL(10,2),
  ADD COLUMN "settled_account_id" UUID,
  ADD COLUMN "settled_by_user_id" UUID,
  ADD COLUMN "settlement_note" TEXT;

-- CreateIndex
-- Suporta o relatório de liquidados/divergências por período (status + settled_at).
CREATE INDEX "card_receivables_tenant_id_status_settled_at_idx"
  ON "card_receivables"("tenant_id", "status", "settled_at");
