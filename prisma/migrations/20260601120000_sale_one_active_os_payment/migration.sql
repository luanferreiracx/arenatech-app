-- Garante no maximo UMA sale ativa (DRAFT ou COMPLETED, nao cancelada/excluida)
-- por OS quando isOSPayment=true. Previne race em createFromOS — dois cliques
-- paralelos nao podem mais criar duas DRAFT sales pra mesma OS.

-- Dedup: para cada OS com mais de uma sale ativa (estado inconsistente raro),
-- mantem a mais antiga (saleDate ASC, NULLS LAST) e cancela as demais.
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY service_order_id ORDER BY sale_date NULLS LAST, created_at) AS rn
  FROM "sales"
  WHERE is_os_payment = TRUE
    AND service_order_id IS NOT NULL
    AND status IN ('DRAFT', 'COMPLETED')
    AND deleted_at IS NULL
)
UPDATE "sales"
SET status = 'CANCELLED',
    cancelled_at = now(),
    cancellation_reason = 'Dedup: outra venda ativa ja existia para esta OS'
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- Indice unico parcial (Prisma nao representa partial indexes — definido em SQL).
CREATE UNIQUE INDEX "sales_one_active_os_payment_per_order"
  ON "sales" ("service_order_id")
  WHERE is_os_payment = TRUE
    AND status IN ('DRAFT', 'COMPLETED')
    AND deleted_at IS NULL;
