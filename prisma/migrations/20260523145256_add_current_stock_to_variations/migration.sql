-- Adiciona current_stock em product_variations (paridade Laravel
-- produto_variacoes.quantidade_estoque). Permite controle de estoque por
-- variacao quando product.has_variations = true.

ALTER TABLE "product_variations"
  ADD COLUMN "current_stock" INTEGER NOT NULL DEFAULT 0;
