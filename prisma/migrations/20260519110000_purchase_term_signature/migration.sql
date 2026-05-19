-- DevicePurchase: termo de responsabilidade + assinatura + supplier link
-- Paridade Laravel `compra_aparelhos.termo_*` + `tipo_vendedor` + `fornecedor_id`.
ALTER TABLE "device_purchases"
  ADD COLUMN IF NOT EXISTS "supplier_id" UUID,
  ADD COLUMN IF NOT EXISTS "seller_type" TEXT NOT NULL DEFAULT 'customer',
  ADD COLUMN IF NOT EXISTS "term_signed" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "term_signed_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "term_signed_via" TEXT,
  ADD COLUMN IF NOT EXISTS "term_signed_by_user_id" UUID,
  ADD COLUMN IF NOT EXISTS "autentique_document_id" TEXT,
  ADD COLUMN IF NOT EXISTS "autentique_link" TEXT,
  ADD COLUMN IF NOT EXISTS "autentique_sent_at" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "device_purchases_tenant_id_supplier_id_idx"
  ON "device_purchases"("tenant_id", "supplier_id");
