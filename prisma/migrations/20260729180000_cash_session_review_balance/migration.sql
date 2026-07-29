-- Módulo 1 (Caixa), CX-6 — a conferência do gerente apagava a contagem do operador.
--
-- `cashier.review` gravava o valor contado pelo gerente por cima de
-- `declared_balance`, que é o que o OPERADOR declarou no fechamento. O registro
-- de "o operador disse R$ 500 e o gerente achou R$ 450" colapsava para R$ 450 —
-- some justamente a evidência que dá sentido à conferência.
--
-- Campos próprios para a contagem da conferência. `declared_balance` volta a
-- significar só uma coisa: o que o operador declarou.
ALTER TABLE "cash_sessions"
  ADD COLUMN IF NOT EXISTS "reviewed_balance" DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS "review_difference" DECIMAL(10,2);

COMMENT ON COLUMN "cash_sessions"."declared_balance" IS
  'Dinheiro contado pelo OPERADOR no fechamento. NULL em fechamento automatico/forcado (ninguem contou).';
COMMENT ON COLUMN "cash_sessions"."reviewed_balance" IS
  'Dinheiro contado pelo GERENTE na conferencia. NULL enquanto nao conferido.';
COMMENT ON COLUMN "cash_sessions"."review_difference" IS
  'reviewed_balance - calculated_balance. NULL enquanto nao conferido.';
