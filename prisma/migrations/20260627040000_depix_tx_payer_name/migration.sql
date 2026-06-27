-- Nome do pagador no deposito DePix, capturado da Eulen ao confirmar o PIX
-- (deposit-status/webhook trazem payerName). Nullable, sem backfill.
ALTER TABLE "tenant_depix_transactions" ADD COLUMN "payer_name" TEXT;
