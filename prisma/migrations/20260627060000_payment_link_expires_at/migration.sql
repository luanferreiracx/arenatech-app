-- Validade do link de pagamento: nao pago ate expires_at -> EXPIRED (cron).
-- Setado na criacao (now + 12h). Nullable p/ links antigos (sem backfill;
-- o cron so expira quem tem expires_at no passado).
ALTER TABLE "payment_links" ADD COLUMN "expires_at" TIMESTAMP(3);

-- Indice da varredura do cron (status ACTIVE + vencidos).
CREATE INDEX "payment_links_status_expires_at_idx" ON "payment_links"("status", "expires_at");
