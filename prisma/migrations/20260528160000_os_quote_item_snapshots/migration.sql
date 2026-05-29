-- Snapshot dos itens nas revisoes de orcamento da OS.
-- previous_items_snapshot: estado autorizado anterior (revert na rejeicao + exibir orcamento anterior).
-- new_items_snapshot: estado enviado/aprovado (pagina publica + PDF ao cliente).
ALTER TABLE "service_order_quotes"
  ADD COLUMN "previous_items_snapshot" JSONB,
  ADD COLUMN "new_items_snapshot" JSONB;
