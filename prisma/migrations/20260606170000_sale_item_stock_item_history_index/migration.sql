-- Permite revenda historica do mesmo StockItem apos estorno com retorno ao estoque.
-- A protecao contra double-sell fica no update atomico de StockItem.status=AVAILABLE
-- durante a finalizacao da venda. O historico em sale_items deve aceitar multiplas
-- linhas para o mesmo stock_item_id em vendas diferentes.
DROP INDEX IF EXISTS "sale_items_stock_item_id_key";
CREATE INDEX IF NOT EXISTS "sale_items_tenant_id_stock_item_id_created_at_idx"
  ON "sale_items"("tenant_id", "stock_item_id", "created_at");
