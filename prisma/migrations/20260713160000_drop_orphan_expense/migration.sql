-- Remove a tabela `expenses` (despesa operacional) e seus enums — feature nunca
-- ligada à UI (0 callers, 0 linhas em prod). Auditoria 2026-07-13 (#5). A despesa
-- de caixa em uso é outra (cashier.expense via cash_movements). Decisão do dono:
-- remover. Reversível: o modelo pode ser recriado por migração futura se preciso.

DROP TABLE IF EXISTS "expenses";
DROP TYPE IF EXISTS "ExpenseCategory";
DROP TYPE IF EXISTS "ExpenseStatus";
