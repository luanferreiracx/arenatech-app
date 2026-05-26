-- Indices para webhooks/queries por ID Autentique e refs raras.
--
-- Autentique webhook: `serviceOrder.findFirst({ where: { signatureDocumentId } })`
--   — busca cross-tenant via withAdmin. Sem index = seq scan na tabela inteira
--   a cada webhook. Idem para os termos de entrega/devolucao.
--
-- service_orders.original_order_id: lookup de OS de garantia que referencia
--   a OS original. Usado em validacao do isWarranty + originalOrderId.
--
-- service_orders.pending_quote_id: 1:1 com ServiceOrderQuote, mas como a FK
--   pode ser nula (orcamento pendente apenas em alguns states), index parcial
--   acelera lookups.
--
-- Todos PARTIAL indexes (WHERE col IS NOT NULL) — minimiza espaco para
-- colunas majoritariamente NULL.

CREATE INDEX IF NOT EXISTS service_orders_signature_document_id_idx
  ON service_orders (signature_document_id)
  WHERE signature_document_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS service_orders_delivery_term_autentique_id_idx
  ON service_orders (delivery_term_autentique_id)
  WHERE delivery_term_autentique_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS service_orders_return_term_autentique_id_idx
  ON service_orders (return_term_autentique_id)
  WHERE return_term_autentique_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS service_orders_original_order_id_idx
  ON service_orders (original_order_id)
  WHERE original_order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS service_orders_pending_quote_id_idx
  ON service_orders (pending_quote_id)
  WHERE pending_quote_id IS NOT NULL;

-- service_order_quotes.signature_document_id (paridade autentique para quotes)
CREATE INDEX IF NOT EXISTS service_order_quotes_signature_document_id_idx
  ON service_order_quotes (signature_document_id)
  WHERE signature_document_id IS NOT NULL;
