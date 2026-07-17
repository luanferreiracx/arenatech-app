-- ADR 0057: marca de idempotencia do webhook de saida `deposit.pix_received` pro
-- parceiro (dispara UMA vez no marco PIX recebido). Necessario pro parceiro saber que
-- o pagamento caiu sem esperar as ~24h do delay da Eulen. Coluna aditiva nullable.
ALTER TABLE "tenant_depix_transactions" ADD COLUMN "partner_pix_received_notified_at" TIMESTAMP(3);
