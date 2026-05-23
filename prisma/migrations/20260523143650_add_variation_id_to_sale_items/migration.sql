-- Adiciona variation_id em sale_items (paridade Laravel pdv_venda_itens.variacao_id).
-- Permite registrar qual variacao (cor/tamanho) foi vendida quando o produto
-- tem has_variations=true.

ALTER TABLE "sale_items" ADD COLUMN "variation_id" UUID;
CREATE INDEX "sale_items_variation_id_idx" ON "sale_items"("variation_id");
