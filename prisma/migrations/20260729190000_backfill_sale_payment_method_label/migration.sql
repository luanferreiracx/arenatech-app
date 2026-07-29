-- Módulo 2 (PDV), PDV-3 — recibo imprimia o id da forma no lugar do nome.
--
-- Quando o tenant cadastra a própria forma de pagamento, o PDV grava o ID dela
-- em `sale.payment_details[].method`. O `methodLabel` (nome legível) só passou a
-- ser gravado depois, então as vendas anteriores não têm o rótulo e o recibo cai
-- no fallback, imprimindo "a6b9e67e-9c9f-…" para o cliente.
--
-- Medido em produção (2026-07-29): 61 vendas com forma em UUID, 37 sem rótulo.
-- Preenche `methodLabel` a partir do nome da forma cadastrada. Idempotente: só
-- mexe onde o rótulo falta e o método casa uma forma existente do mesmo tenant.
WITH legs AS (
  SELECT s.id AS sale_id,
         t.ord,
         CASE
           WHEN t.leg->>'methodLabel' IS NULL AND pm.name IS NOT NULL
             THEN t.leg || jsonb_build_object('methodLabel', pm.name)
           ELSE t.leg
         END AS leg,
         (t.leg->>'methodLabel' IS NULL AND pm.name IS NOT NULL) AS mudou
  FROM sales s
  CROSS JOIN LATERAL jsonb_array_elements(s.payment_details) WITH ORDINALITY AS t(leg, ord)
  LEFT JOIN payment_methods pm
    ON pm.id::text = t.leg->>'method' AND pm.tenant_id = s.tenant_id
  WHERE jsonb_typeof(s.payment_details) = 'array'
),
novo AS (
  SELECT sale_id, jsonb_agg(leg ORDER BY ord) AS payment_details
  FROM legs
  GROUP BY sale_id
  HAVING bool_or(mudou)
)
UPDATE sales s
SET payment_details = novo.payment_details
FROM novo
WHERE novo.sale_id = s.id;
