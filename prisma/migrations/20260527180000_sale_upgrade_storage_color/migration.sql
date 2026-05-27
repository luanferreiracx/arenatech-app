-- Adiciona storage (capacidade) e color (cor) ao SaleUpgrade.
-- Pedido do usuario para identificar GB do aparelho recebido em trade-in.
ALTER TABLE sale_upgrades
  ADD COLUMN IF NOT EXISTS storage TEXT,
  ADD COLUMN IF NOT EXISTS color TEXT;
