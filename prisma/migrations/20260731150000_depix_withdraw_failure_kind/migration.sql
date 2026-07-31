-- Distingue "o provedor recusou, o dinheiro NAO saiu" de "nao sei o que
-- aconteceu" num saque que falhou.
--
-- Ate aqui, `status = FAILED` nao dizia nada sobre o dinheiro. Em 2026-07-27 um
-- saque foi transmitido de verdade e gravado como FAILED (o timeout comeu a
-- resposta); o operador confiou no registro e pagou duas vezes. A guarda de
-- quase-duplicata precisa poder bloquear o caso incerto sem prender o operador
-- quando a Eulen recusou de forma definitiva.

-- CreateEnum
CREATE TYPE "DepixWithdrawFailureKind" AS ENUM ('REJECTED', 'UNKNOWN');

-- AlterTable
ALTER TABLE "tenant_depix_transactions"
  ADD COLUMN "failure_kind" "DepixWithdrawFailureKind";

-- Indice parcial: a guarda so consulta saques FALHOS de causa incerta, dentro de
-- uma janela curta. Parcial porque a esmagadora maioria das linhas tem
-- failure_kind NULL e nunca sera lida por esta consulta.
CREATE INDEX "tenant_depix_transactions_failure_kind_idx"
  ON "tenant_depix_transactions" ("tenant_id", "pix_key", "created_at")
  WHERE "kind" = 'WITHDRAW' AND "failure_kind" = 'UNKNOWN';

-- Backfill das linhas ja existentes. Classifica SO o que a mensagem de erro
-- torna inequivoco; o resto fica NULL, que o codigo ja trata como incerto.
--
-- Nao ha efeito pratico sobre a guarda (ela olha 10 minutos para tras), mas
-- deixa o historico legivel para quem for auditar um saque antigo.
UPDATE "tenant_depix_transactions"
SET "failure_kind" = 'REJECTED'
WHERE "kind" = 'WITHDRAW'
  AND "status" = 'FAILED'
  AND "error_message" IS NOT NULL
  AND (
    -- A Eulen respondeu recusando: entendeu o pedido e disse nao.
    "error_message" ILIKE '%Daily withdrawal limit exceeded%'
    OR "error_message" ILIKE '%compliance review%'
    OR "error_message" ILIKE '%Withdraw blocked%'
    OR "error_message" ILIKE '%Saldo insuficiente%'
    OR "error_message" ILIKE '%janela do saque expirou%'
  );

-- Deliberadamente NAO classificados (ficam NULL = incerto):
--   'Erro ao solicitar saque: HTTP 520'  -> o pedido pode ter chegado
--   'Resposta invalida: sem id'          -> a Eulen pode ter criado o saque
--   'falha ao transferir'                -> o broadcast on-chain pode ter saido
