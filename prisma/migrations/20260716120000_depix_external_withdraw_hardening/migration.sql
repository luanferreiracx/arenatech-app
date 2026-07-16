-- Hardening do saque externo: endereco unico por saque + estado HELD (reembolso humano).

-- Novo estado: inbound recebido mas nao repassavel -> aguarda DECISAO HUMANA (nunca
-- move dinheiro sozinho). ADD VALUE e append-only e seguro (PG 12+).
ALTER TYPE "DepixTransactionStatus" ADD VALUE IF NOT EXISTS 'HELD';

-- Indice BIP32 do endereco de intermediacao (unico por saque) + valor recebido
-- on-chain (pro admin decidir o reembolso). Colunas aditivas nullable.
ALTER TABLE "tenant_depix_transactions" ADD COLUMN "intermediation_index" INTEGER;
ALTER TABLE "tenant_depix_transactions" ADD COLUMN "intermediation_received_cents" INTEGER;

-- Suporta a query cross-tenant do "menor indice livre" na alocacao.
CREATE INDEX "tenant_depix_transactions_intermediation_index_idx"
  ON "tenant_depix_transactions"("intermediation_index");
