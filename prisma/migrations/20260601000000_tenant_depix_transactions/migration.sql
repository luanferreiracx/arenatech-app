-- Fase 2 do modulo DePix multi-tenant: transacoes unificadas (deposito + saque)
-- via carteira LWK propria do tenant, com rateio de taxa Arena Tech on-chain.

-- CreateEnum
CREATE TYPE "DepixTransactionKind" AS ENUM ('DEPOSIT', 'WITHDRAW');

CREATE TYPE "DepixTransactionStatus" AS ENUM (
  'PENDING',
  'PROCESSING',
  'PROCESSING_FEE',
  'COMPLETED',
  'COMPLETED_FEE_PENDING',
  'FAILED',
  'CANCELLED',
  'EXPIRED'
);

-- CreateTable
CREATE TABLE "tenant_depix_transactions" (
  "id"                     UUID NOT NULL,
  "tenant_id"              UUID NOT NULL,
  "number"                 TEXT NOT NULL,
  "kind"                   "DepixTransactionKind" NOT NULL,
  "status"                 "DepixTransactionStatus" NOT NULL DEFAULT 'PENDING',
  "gross_amount_cents"     INTEGER NOT NULL,
  "fee_arena_tech_cents"   INTEGER NOT NULL DEFAULT 0,
  "fee_pixpay_cents"       INTEGER,
  "net_amount_cents"       INTEGER,
  "pix_key_type"           "PixKeyType",
  "pix_key"                TEXT,
  "recipient_name"         TEXT,
  "recipient_tax_id"       TEXT,
  "pixpay_depix_id"        TEXT,
  "pixpay_deposit_address" TEXT,
  "withdraw_tx_id"         TEXT,
  "qr_code"                TEXT,
  "qr_code_base64"         TEXT,
  "deposit_address"        TEXT,
  "deposit_label"          TEXT,
  "deposit_tx_id"          TEXT,
  "confirmations"          INTEGER DEFAULT 0,
  "api_response"           JSONB,
  "error_message"          TEXT,
  "expires_at"             TIMESTAMP(3),
  "user_id"                UUID NOT NULL,
  "user_name"              TEXT,
  "idempotency_key"        TEXT,
  "created_at"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"             TIMESTAMP(3) NOT NULL,
  "completed_at"           TIMESTAMP(3),
  CONSTRAINT "tenant_depix_transactions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tenant_depix_transactions_number_key"
  ON "tenant_depix_transactions"("number");
CREATE UNIQUE INDEX "tenant_depix_transactions_tenant_idempotency_key"
  ON "tenant_depix_transactions"("tenant_id", "idempotency_key")
  WHERE "idempotency_key" IS NOT NULL;
CREATE INDEX "tenant_depix_tx_tenant_kind_status_idx"
  ON "tenant_depix_transactions"("tenant_id", "kind", "status", "created_at");
CREATE INDEX "tenant_depix_tx_deposit_label_idx"
  ON "tenant_depix_transactions"("tenant_id", "deposit_label");
CREATE INDEX "tenant_depix_tx_deposit_txid_idx"
  ON "tenant_depix_transactions"("tenant_id", "deposit_tx_id");
CREATE INDEX "tenant_depix_tx_withdraw_txid_idx"
  ON "tenant_depix_transactions"("tenant_id", "withdraw_tx_id");
CREATE INDEX "tenant_depix_tx_pixpay_depix_id_idx"
  ON "tenant_depix_transactions"("pixpay_depix_id");

ALTER TABLE "tenant_depix_transactions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tenant_depix_transactions" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "tenant_depix_transactions"
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

-- Historico de taxa Arena Tech cobrada (sempre on-chain na Fase 2 -> nasce
-- SETTLED). PENDING_SETTLEMENT so se transfer de taxa do deposito falhar
-- (status=COMPLETED_FEE_PENDING) — reconciliacao posterior.
CREATE TABLE "tenant_depix_fee_ledger" (
  "id"               UUID NOT NULL,
  "tenant_id"        UUID NOT NULL,
  "transaction_id"   UUID NOT NULL,
  "kind"             "DepixTransactionKind" NOT NULL,
  "amount_cents"     INTEGER NOT NULL,
  "status"           TEXT NOT NULL DEFAULT 'PENDING_SETTLEMENT',
  "settled_at"       TIMESTAMP(3),
  "settlement_tx_id" TEXT,
  "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tenant_depix_fee_ledger_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "tenant_depix_fee_ledger_transaction_fkey"
    FOREIGN KEY ("transaction_id")
    REFERENCES "tenant_depix_transactions"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "tenant_depix_fee_ledger_tenant_status_idx"
  ON "tenant_depix_fee_ledger"("tenant_id", "status");
CREATE INDEX "tenant_depix_fee_ledger_tx_idx"
  ON "tenant_depix_fee_ledger"("transaction_id");

ALTER TABLE "tenant_depix_fee_ledger" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tenant_depix_fee_ledger" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "tenant_depix_fee_ledger"
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());
