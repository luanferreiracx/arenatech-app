-- ServiceOrderQuote: campos Autentique p/ assinatura digital do orcamento
ALTER TABLE service_order_quotes
  ADD COLUMN signature_document_id TEXT,
  ADD COLUMN signature_link TEXT,
  ADD COLUMN signed_at TIMESTAMP(3);

-- ServiceOrder: signature-pad SVG base64 (paridade Laravel `assinatura_entrada_*`)
ALTER TABLE service_orders
  ADD COLUMN entry_signature_client TEXT,
  ADD COLUMN entry_signature_technician TEXT,
  ADD COLUMN entry_signature_at TIMESTAMP(3),
  ADD COLUMN exit_signature_client TEXT,
  ADD COLUMN exit_signature_technician TEXT,
  ADD COLUMN exit_signature_at TIMESTAMP(3);
