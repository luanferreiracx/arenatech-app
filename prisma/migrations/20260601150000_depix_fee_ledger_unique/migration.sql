-- DePix Wallet hardening: unique constraint no fee ledger por (transaction_id, kind).
-- Defesa contra ledger duplicado em webhook reprocessado / race no settleDepositConfirmed.
-- Use combinado com state guard atomico (updateMany WHERE status=PROCESSING_FEE) no service.

-- Limpa eventual duplicata pre-existente (mantem o registro mais antigo).
DELETE FROM tenant_depix_fee_ledger a
USING tenant_depix_fee_ledger b
WHERE a.id > b.id
  AND a.transaction_id = b.transaction_id
  AND a.kind = b.kind;

ALTER TABLE tenant_depix_fee_ledger
  ADD CONSTRAINT tenant_depix_fee_ledger_transaction_id_kind_key
  UNIQUE (transaction_id, kind);
