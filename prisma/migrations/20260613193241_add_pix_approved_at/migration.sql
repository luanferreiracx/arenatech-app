-- Sinal intermediario "PixPay confirmou o PIX" (status approved/paid).
-- Nullable, sem default, sem backfill: zero-downtime. NAO credita saldo —
-- o credito real continua exclusivamente no webhook LWK `confirmed`.
ALTER TABLE "tenant_depix_transactions"
  ADD COLUMN "pix_approved_at" TIMESTAMP(3);
