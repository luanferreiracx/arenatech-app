-- ADR 0069 — Conta do dinheiro vive no ledger de pagamentos.
--
-- O sistema registrava COMO o dinheiro se moveu (`payment_method`) e nunca DE
-- ONDE saiu / PARA ONDE entrou. Sem isso não há conciliação bancária nem saldo
-- por conta. `receiving_accounts` já existia (com tipo, RLS, CRUD e tela), mas
-- só era alcançada por adquirente de cartão.
--
-- Padrão zero-downtime: coluna NULLABLE → backfill do que dá para inferir →
-- endurecer depois, se o dono quiser. Nada aqui bloqueia escrita concorrente.

-- Não segurar a fila atrás de um lock de DDL num deploy quente.
SET lock_timeout = '5s';

-- ── 1) Conta no ledger de pagamentos ──────────────────────────────────────
ALTER TABLE "installment_payments"
  ADD COLUMN IF NOT EXISTS "receiving_account_id" UUID;

ALTER TABLE "installment_payments"
  DROP CONSTRAINT IF EXISTS "installment_payments_receiving_account_id_fkey";
-- ON DELETE SET NULL espelha o que `card_receivables` já faz: conta não é
-- apagada (só desativada), mas se um dia for, o histórico do ledger sobrevive
-- sem conta em vez de sumir junto.
ALTER TABLE "installment_payments"
  ADD CONSTRAINT "installment_payments_receiving_account_id_fkey"
  FOREIGN KEY ("receiving_account_id") REFERENCES "receiving_accounts"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- ── 2) Conta padrão por FORMA de pagamento ────────────────────────────────
ALTER TABLE "payment_methods"
  ADD COLUMN IF NOT EXISTS "default_receiving_account_id" UUID;

ALTER TABLE "payment_methods"
  DROP CONSTRAINT IF EXISTS "payment_methods_default_receiving_account_id_fkey";
ALTER TABLE "payment_methods"
  ADD CONSTRAINT "payment_methods_default_receiving_account_id_fkey"
  FOREIGN KEY ("default_receiving_account_id") REFERENCES "receiving_accounts"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- ── 3) `is_default` vira carregado: exclusividade no BANCO ────────────────
-- Antes a unicidade era só dois `updateMany` imperativos no router — dois
-- admins concorrentes deixavam duas contas padrão e a resolução virava
-- não-determinística. Agora que `is_default` é LIDO para escolher a conta, isso
-- deixa de ser cosmético.
--
-- Desempata antes de criar o índice: mantém a mais antiga como padrão.
UPDATE receiving_accounts ra
SET is_default = false
WHERE ra.is_default
  AND ra.id <> (
    SELECT r2.id FROM receiving_accounts r2
    WHERE r2.tenant_id = ra.tenant_id AND r2.is_default
    ORDER BY r2.created_at ASC, r2.id ASC
    LIMIT 1
  );

DROP INDEX IF EXISTS "receiving_accounts_one_default_per_tenant";
CREATE UNIQUE INDEX "receiving_accounts_one_default_per_tenant"
  ON "receiving_accounts" ("tenant_id")
  WHERE "is_default";

-- ── 4) Índice do extrato por conta ────────────────────────────────────────
-- "quanto entrou/saiu da conta X no período" — a consulta da conciliação.
-- `paid_at` por último: é filtro de RANGE, os demais são de igualdade.
CREATE INDEX IF NOT EXISTS "installment_payments_tenant_account_paid_at_idx"
  ON "installment_payments" ("tenant_id", "receiving_account_id", "paid_at");

-- ── 5) Backfill: só o que dá para AFIRMAR ─────────────────────────────────
-- Deliberadamente conservador. Conta errada é pior que conta ausente: dado
-- errado dá falso negativo silencioso na conciliação, enquanto nulo aparece
-- como "sem conta" e pede correção.
--
-- 5a) Cartão: o CardReceivable já sabe a conta (herdada da adquirente). É a
--     única inferência que não é chute — vem de dado que o próprio sistema
--     gravou no momento da venda.
UPDATE installment_payments ip
SET receiving_account_id = cr.account_id
FROM (
  SELECT DISTINCT ON (ft.id)
         ft.id AS transaction_id,
         COALESCE(c.settled_account_id, c.receiving_account_id) AS account_id
  FROM financial_transactions ft
  JOIN card_receivables c ON c.sale_id = ft.sale_id
  WHERE ft.sale_id IS NOT NULL
    AND COALESCE(c.settled_account_id, c.receiving_account_id) IS NOT NULL
  ORDER BY ft.id, c.created_at ASC
) cr
WHERE ip.transaction_id = cr.transaction_id
  AND ip.receiving_account_id IS NULL;

-- 5b) Tenant com UMA única conta ativa: não há ambiguidade possível — todo o
--     dinheiro dele passou por ela. Tenant com 2+ contas fica nulo, porque aí
--     qualquer escolha seria adivinhação.
UPDATE installment_payments ip
SET receiving_account_id = solo.id
FROM (
  SELECT tenant_id, MIN(id::text)::uuid AS id
  FROM receiving_accounts
  WHERE active
  GROUP BY tenant_id
  HAVING COUNT(*) = 1
) solo
WHERE ip.tenant_id = solo.tenant_id
  AND ip.receiving_account_id IS NULL;
