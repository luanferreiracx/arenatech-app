-- Politica de taxa por FORMA de pagamento (quem paga a taxa do cartao).
-- Antes a politica vivia em payment_method_rates.policy (por parcela). A decisao
-- (PR #329) e que ela e UMA por forma; e conforme a taxa de cartao migra para
-- AcquirerRate, payment_method_rates deixa de ser a fonte. Esta coluna da a
-- politica um lar definitivo no nivel da forma, ANTES de pararmos de ler rates.
--
-- Aditiva, com DEFAULT -> Postgres 11+ nao reescreve a tabela (zero-downtime).
-- O enum "PaymentFeePolicy" ja existe (migration 20260522194348).
ALTER TABLE "payment_methods"
  ADD COLUMN "fee_policy" "PaymentFeePolicy" NOT NULL DEFAULT 'LOJA_ABSORVE';

-- Backfill: cada forma herda a politica da sua taxa de MENOR numero de parcelas
-- (a UI ja assume policy unica por forma — payment-methods/page.tsx le rates[0]).
-- Formas sem rate ficam no default (LOJA_ABSORVE). DISTINCT ON pega 1 rate/forma.
UPDATE "payment_methods" pm
SET "fee_policy" = sub."policy"
FROM (
  SELECT DISTINCT ON ("payment_method_id")
    "payment_method_id",
    "policy"
  FROM "payment_method_rates"
  ORDER BY "payment_method_id", "installments" ASC, "created_at" ASC
) sub
WHERE pm."id" = sub."payment_method_id";
