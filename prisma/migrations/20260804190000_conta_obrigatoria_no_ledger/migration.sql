-- ADR 0069, fase 2 — a conta do dinheiro passa a ser OBRIGATÓRIA.
--
-- Decisão do dono (2026-08-04): "melhor forçar a sempre ter uma conta".
--
-- O problema de fazer isso direto: NENHUM tenant tinha conta cadastrada (0 de 6
-- na medição). Um `NOT NULL` seco pararia venda, OS e compra em produção até
-- cada loja cadastrar uma conta na mão. Por isso a migration GARANTE a conta
-- antes de exigi-la:
--
--   1. todo tenant sem conta ganha um "Caixa da Loja" (CASH, padrão);
--   2. todo tenant sem conta padrão promove a mais antiga a padrão;
--   3. backfill do que ficou nulo, agora que sempre existe uma conta;
--   4. só então NOT NULL, pelo caminho seguro (CHECK NOT VALID → VALIDATE).
--
-- Assim a cascata de resolução (input → forma → padrão do tenant) nunca cai em
-- nulo, e ninguém precisa fazer nada para continuar vendendo.

SET lock_timeout = '5s';

-- ── 1) Todo tenant tem pelo menos UMA conta ───────────────────────────────
-- "Caixa da Loja" tipo CASH: representa o dinheiro da loja como conta contábil
-- permanente. É o default honesto — a loja que só opera no balcão não precisa
-- fazer nada; quem tem Nubank/Itaú separa depois na tela de Contas.
INSERT INTO receiving_accounts (id, tenant_id, name, type, active, is_default, created_at, updated_at)
SELECT gen_random_uuid(), t.id, 'Caixa da Loja', 'CASH', true, true, now(), now()
FROM tenants t
WHERE NOT EXISTS (SELECT 1 FROM receiving_accounts ra WHERE ra.tenant_id = t.id);

-- ── 2) Todo tenant tem uma conta PADRÃO ───────────────────────────────────
-- Tenant que já tinha contas mas nenhuma marcada como padrão: promove a mais
-- antiga. Sem isso o degrau 3 da cascata continuaria vazio.
-- O índice único parcial garante que só existe uma; o `NOT EXISTS` respeita.
UPDATE receiving_accounts ra
SET is_default = true
WHERE ra.active
  AND NOT EXISTS (
    SELECT 1 FROM receiving_accounts d
    WHERE d.tenant_id = ra.tenant_id AND d.is_default
  )
  AND ra.id = (
    SELECT r2.id FROM receiving_accounts r2
    WHERE r2.tenant_id = ra.tenant_id AND r2.active
    ORDER BY r2.created_at ASC, r2.id ASC
    LIMIT 1
  );

-- ── 3) Backfill do histórico ──────────────────────────────────────────────
-- Agora que todo tenant tem conta padrão, o que sobrou nulo pode ser atribuído
-- a ela. Não é chute: é a mesma resposta que a cascata daria hoje para um
-- lançamento novo do mesmo tenant.
UPDATE installment_payments ip
SET receiving_account_id = d.id
FROM (
  SELECT tenant_id, id FROM receiving_accounts WHERE is_default
) d
WHERE ip.tenant_id = d.tenant_id
  AND ip.receiving_account_id IS NULL;

-- Rede de segurança: se algum lançamento pertence a um tenant sem conta
-- (não deveria, depois do passo 1), casa com QUALQUER conta ativa dele em vez
-- de deixar a migration quebrar no NOT NULL.
UPDATE installment_payments ip
SET receiving_account_id = any_acc.id
FROM (
  SELECT DISTINCT ON (tenant_id) tenant_id, id
  FROM receiving_accounts
  WHERE active
  ORDER BY tenant_id, created_at ASC
) any_acc
WHERE ip.tenant_id = any_acc.tenant_id
  AND ip.receiving_account_id IS NULL;

-- ── 4) Exigir a conta ─────────────────────────────────────────────────────
-- Caminho seguro: CHECK NOT VALID (não varre a tabela, não trava escrita) →
-- VALIDATE (varredura com lock fraco) → SET NOT NULL, que o Postgres aceita
-- barato porque o CHECK já provou o invariante. Depois o CHECK sai, redundante.
ALTER TABLE installment_payments
  DROP CONSTRAINT IF EXISTS installment_payments_receiving_account_not_null;
ALTER TABLE installment_payments
  ADD CONSTRAINT installment_payments_receiving_account_not_null
  CHECK (receiving_account_id IS NOT NULL) NOT VALID;

ALTER TABLE installment_payments
  VALIDATE CONSTRAINT installment_payments_receiving_account_not_null;

ALTER TABLE installment_payments
  ALTER COLUMN receiving_account_id SET NOT NULL;

ALTER TABLE installment_payments
  DROP CONSTRAINT installment_payments_receiving_account_not_null;

-- A conta agora é obrigatória: `ON DELETE SET NULL` viraria violação de NOT NULL
-- no momento em que alguém apagasse a conta. Conta não é apagada pela UI (só
-- desativada), mas a FK precisa ser coerente: RESTRICT diz explicitamente
-- "não dá para apagar conta que tem histórico".
ALTER TABLE installment_payments
  DROP CONSTRAINT IF EXISTS installment_payments_receiving_account_id_fkey;
ALTER TABLE installment_payments
  ADD CONSTRAINT installment_payments_receiving_account_id_fkey
  FOREIGN KEY (receiving_account_id) REFERENCES receiving_accounts(id)
  ON DELETE RESTRICT ON UPDATE CASCADE;
