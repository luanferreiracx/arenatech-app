-- DePix webhook performance:
--   1) Webhook procura por `payment_details @? jsonpath` em sales — sem
--      GIN era seq scan, latencia O(N) em vendas do tenant.
--   2) Webhook tambem busca por `service_orders.depix_transaction_id` (legado)
--      — sem indice era seq scan tambem.
-- Paridade Laravel: la era find por PK; aqui mantemos jsonpath pra suportar
-- split payment, mas com index GIN o custo cai para O(log N).

-- GIN com jsonb_path_ops eh mais leve e suporta `@?` (jsonpath).
CREATE INDEX IF NOT EXISTS sales_payment_details_gin_idx
  ON sales USING gin (payment_details jsonb_path_ops);

CREATE INDEX IF NOT EXISTS service_orders_depix_transaction_id_idx
  ON service_orders (depix_transaction_id)
  WHERE depix_transaction_id IS NOT NULL;
