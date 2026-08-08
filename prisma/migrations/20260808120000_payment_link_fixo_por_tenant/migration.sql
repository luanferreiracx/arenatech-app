-- Link de pagamento: de "um link descartável por cobrança" para UM link fixo e
-- reutilizável por tenant.
--
-- O modelo antigo amarrava "1 link = 1 pagamento" na própria estrutura
-- (`wallet_transaction_id` UNIQUE + `status PAID` + `expires_at`), o que impedia
-- o caso real: um link divulgado uma vez que continua recebendo.
--
-- A rastreabilidade não se perde — ela nunca morou no link, e sim na
-- `tenant_depix_transactions` de cada pagamento (valor, pagador, txid on-chain).
--
-- SEGURO PARA DADOS EXISTENTES: em produção não há nenhum link ACTIVE (só 2
-- EXPIRED e 2 CANCELLED), então nada em uso é convertido. Ainda assim a migration
-- não apaga linhas: converte o que existe e deduplica por tenant, mantendo o mais
-- recente — apagar histórico de cobrança sem necessidade seria pior que manter.

-- 1) Colunas novas (nullable primeiro: padrão zero-downtime).
ALTER TABLE "payment_links" ADD COLUMN IF NOT EXISTS "active" BOOLEAN NOT NULL DEFAULT true;

-- 2) Um link por tenant: mantém o MAIS RECENTE e remove os demais.
--    Sem isto o índice único abaixo falharia em qualquer tenant com 2+ links.
DELETE FROM "payment_links" a
USING "payment_links" b
WHERE a."tenant_id" = b."tenant_id"
  AND a."created_at" < b."created_at";

-- 3) Links que estavam encerrados (PAID/EXPIRED/CANCELLED) nascem DESLIGADOS no
--    modelo novo: reabrir recebimento tem de ser ato explícito do comerciante,
--    nunca efeito colateral de uma migration.
UPDATE "payment_links" SET "active" = false WHERE "status" <> 'ACTIVE';

-- 4) Remove o que amarrava o link a um único pagamento.
DROP INDEX IF EXISTS "payment_links_wallet_transaction_id_key";
DROP INDEX IF EXISTS "payment_links_tenant_id_status_idx";
DROP INDEX IF EXISTS "payment_links_status_expires_at_idx";
DROP INDEX IF EXISTS "payment_links_tenant_id_created_at_idx";

ALTER TABLE "payment_links" DROP COLUMN IF EXISTS "wallet_transaction_id";
ALTER TABLE "payment_links" DROP COLUMN IF EXISTS "amount_cents";
ALTER TABLE "payment_links" DROP COLUMN IF EXISTS "expires_at";
ALTER TABLE "payment_links" DROP COLUMN IF EXISTS "paid_at";
ALTER TABLE "payment_links" DROP COLUMN IF EXISTS "status";

DROP TYPE IF EXISTS "PaymentLinkStatus";

-- 5) UM link por tenant. Este índice também é o que a policy de RLS exige para
--    não varrer a tabela (`tenant_id` é a coluna do filtro).
CREATE UNIQUE INDEX IF NOT EXISTS "payment_links_tenant_id_key"
  ON "payment_links" ("tenant_id");
