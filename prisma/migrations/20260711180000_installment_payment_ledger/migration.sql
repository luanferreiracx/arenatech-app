-- FIN-B2 (auditoria financeira 2026-07-11): razão (ledger) de pagamentos de
-- parcela. Cada evento de pagamento/estorno vira uma linha imutável com data-caixa
-- própria, para que o regime de caixa por mês (stats/DRE/dashboard) seja correto
-- mesmo quando uma parcela é paga em várias vezes/datas.

-- CreateTable
CREATE TABLE "installment_payments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "installment_id" UUID NOT NULL,
    "transaction_id" UUID NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "payment_method" TEXT,
    "paid_at" TIMESTAMP(3) NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'payment',
    "created_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "installment_payments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "installment_payments_installment_id_fkey" FOREIGN KEY ("installment_id") REFERENCES "installments" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "installment_payments_tenant_id_paid_at_idx" ON "installment_payments" ("tenant_id", "paid_at");
CREATE INDEX "installment_payments_tenant_id_transaction_id_idx" ON "installment_payments" ("tenant_id", "transaction_id");
CREATE INDEX "installment_payments_installment_id_idx" ON "installment_payments" ("installment_id");

-- Backfill: uma linha por parcela já paga, usando o único paid_at conhecido.
-- (Histórico de multi-pagamento não é recuperável — a informação já se perdeu;
--  o ledger passa a ser exato só para pagamentos NOVOS.)
INSERT INTO "installment_payments" ("id", "tenant_id", "installment_id", "transaction_id", "amount_cents", "payment_method", "paid_at", "kind", "created_by_user_id", "created_at")
SELECT
    gen_random_uuid(),
    i."tenant_id",
    i."id",
    i."transaction_id",
    ROUND(i."paid_amount" * 100)::INTEGER,
    i."payment_method",
    COALESCE(i."paid_at", i."updated_at"),
    'payment',
    i."paid_by_user_id",
    NOW()
FROM "installments" i
WHERE i."paid_amount" > 0;

-- RLS por tenant (paridade com as demais tabelas do módulo).
ALTER TABLE "installment_payments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "installment_payments" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "installment_payments"
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());
