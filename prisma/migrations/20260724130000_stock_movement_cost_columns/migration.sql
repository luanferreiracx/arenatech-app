-- Kardex valorizado (C3): custo do movimento em CENTAVOS. Preenchido nas entradas
-- com custo informado (custo médio ponderado); permite reconstruir o valor do
-- estoque numa data e o CMV. Nullable — movimentos antigos e saídas ficam NULL.
ALTER TABLE "stock_movements"
  ADD COLUMN "unit_cost_cents" INTEGER,
  ADD COLUMN "total_cost_cents" INTEGER;
