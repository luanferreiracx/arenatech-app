-- Link publico de pagamento na QuickSale: o cliente paga o QR por /pay/<token>
-- sem login. publicAmountOpen = o cliente define o valor (dentro dos limites).
-- Colunas nullable + default (zero-downtime; sem backfill).
ALTER TABLE "quick_sales" ADD COLUMN "public_token" TEXT;
ALTER TABLE "quick_sales" ADD COLUMN "public_amount_open" BOOLEAN NOT NULL DEFAULT false;

-- Token unico (lookup do link publico). Indice unico cobre a busca por token.
CREATE UNIQUE INDEX "quick_sales_public_token_key" ON "quick_sales"("public_token");
