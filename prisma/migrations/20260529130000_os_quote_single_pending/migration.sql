-- Garante no maximo 1 orcamento ('pending') por OS, prevenindo race em
-- ensureBudgetRevision (duas edicoes simultaneas criando quotes orfaos).

-- Dedup: orcamentos 'pending' nao referenciados por nenhuma OS viram 'rejected'.
UPDATE "service_order_quotes" q
SET "status" = 'rejected', "rejected_at" = now()
WHERE q."status" = 'pending'
  AND NOT EXISTS (
    SELECT 1 FROM "service_orders" o WHERE o."pending_quote_id" = q."id"
  );

-- Indice unico parcial (Prisma nao representa partial index — definido em SQL).
CREATE UNIQUE INDEX "service_order_quotes_one_pending_per_order"
  ON "service_order_quotes" ("order_id")
  WHERE "status" = 'pending';
