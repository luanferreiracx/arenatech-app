-- Fix: o numero da transacao DePix (TXD/TXW-YYYYMMDD-NNNNN) e gerado POR TENANT
-- (nextTransactionNumber roda sob RLS do tenant), mas tinha unique GLOBAL —
-- dois tenants criando no mesmo dia colidiam (ex.: dois TXD<hoje>-00001),
-- quebrando o createDeposit de qualquer tenant nao-central.
--
-- Troca o unique global por unique POR TENANT. Afrouxa a constraint (nenhum
-- dado existente viola, ja que o global garantia unicidade total).
DROP INDEX "tenant_depix_transactions_number_key";

CREATE UNIQUE INDEX "tenant_depix_transactions_tenant_id_number_key"
  ON "tenant_depix_transactions"("tenant_id", "number");
