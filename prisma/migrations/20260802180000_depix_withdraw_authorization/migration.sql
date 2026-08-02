-- Fila de pedidos de saque da API de parceiros que dependem de autorização humana.
--
-- O saque da API exigia carteira CUSTODIAL, e desde o ADR 0051 nenhum cliente é
-- custodial. Medido em produção: das 5 carteiras, as 2 custodiais são da própria
-- Arena e as 3 de cliente são 2 non-custodial e 1 external — o endpoint estava
-- inalcançável por 100% dos clientes.
--
-- A saída não é dar a chave para a máquina: em carteira non-custodial o servidor
-- não assina sem a passphrase do titular, e é isso que torna o modelo
-- non-custodial. O parceiro pede, o humano autoriza no painel.
CREATE TYPE "DepixWithdrawAuthorizationStatus" AS ENUM (
  'PENDING', 'AUTHORIZED', 'REJECTED', 'EXPIRED'
);

CREATE TABLE "depix_withdraw_authorizations" (
  "id"                  UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id"           UUID NOT NULL,
  "status"              "DepixWithdrawAuthorizationStatus" NOT NULL DEFAULT 'PENDING',
  "pix_key_type"        "PixKeyType" NOT NULL,
  "pix_key"             TEXT NOT NULL,
  "recipient_name"      TEXT,
  "recipient_tax_id"    TEXT NOT NULL,
  "net_amount_cents"    INTEGER NOT NULL,
  "description"         TEXT,
  "idempotency_key"     TEXT NOT NULL,
  "key_prefix"          TEXT NOT NULL,
  "transaction_id"      UUID,
  "resolved_by_user_id" UUID,
  "resolved_at"         TIMESTAMP(3),
  "rejection_reason"    TEXT,
  "expires_at"          TIMESTAMP(3) NOT NULL,
  "created_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"          TIMESTAMP(3) NOT NULL,
  CONSTRAINT "depix_withdraw_authorizations_pkey" PRIMARY KEY ("id")
);

-- Uma autorização nunca vira dois saques.
CREATE UNIQUE INDEX "depix_withdraw_authorizations_transaction_id_key"
  ON "depix_withdraw_authorizations" ("transaction_id");

-- Retry do parceiro cai no MESMO pedido. Sem isto, um cliente HTTP com retry
-- automático enfileiraria dois pedidos idênticos para o humano — e dois pedidos
-- idênticos são o que produz pagamento em dobro quando alguém autoriza os dois.
CREATE UNIQUE INDEX "depix_withdraw_authorizations_tenant_idempotency_key"
  ON "depix_withdraw_authorizations" ("tenant_id", "idempotency_key");

CREATE INDEX "depix_withdraw_authorizations_tenant_status_created_idx"
  ON "depix_withdraw_authorizations" ("tenant_id", "status", "created_at");

-- Varredura do cron pelos vencidos, cross-tenant.
CREATE INDEX "depix_withdraw_authorizations_status_expires_idx"
  ON "depix_withdraw_authorizations" ("status", "expires_at");

-- RLS desde o nascimento. A tabela guarda destino e valor de saque — vazamento
-- entre tenants aqui é vazamento de para-quem-o-cliente-paga. `depix_withdraw_forwards`
-- nasceu sem RLS em 2026-07 e só não virou incidente porque o guardião pegou.
ALTER TABLE "depix_withdraw_authorizations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "depix_withdraw_authorizations" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "depix_withdraw_authorizations"
  USING ("tenant_id" = current_setting('app.current_tenant_id')::uuid);
