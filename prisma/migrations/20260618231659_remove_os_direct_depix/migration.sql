-- Remove o PIX/DePix direto na OS. Pagamento de OS é feito pelo PDV (ADR 0042),
-- que registra caixa + recebível corretamente; o caminho direto na OS era
-- financeiramente incompleto (marcava PAID sem caixa/financeiro) e ficou sem UI.
--
-- Dropar as colunas remove automaticamente os índices que dependem delas no
-- Postgres; ainda assim removemos explicitamente por clareza/idempotência.

DROP INDEX IF EXISTS "service_orders_tenant_id_wallet_transaction_id_idx";
DROP INDEX IF EXISTS "service_orders_depix_transaction_id_idx";

ALTER TABLE "service_orders"
  DROP COLUMN IF EXISTS "wallet_transaction_id",
  DROP COLUMN IF EXISTS "depix_transaction_id",
  DROP COLUMN IF EXISTS "depix_status",
  DROP COLUMN IF EXISTS "depix_paid_at";
