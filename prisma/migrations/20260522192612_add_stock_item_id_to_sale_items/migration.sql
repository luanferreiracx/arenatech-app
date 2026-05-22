-- Paridade Laravel pdv_venda_itens.estoque_item_id — vincula unidade especifica
-- (serializada/IMEI) ao item da venda. UNIQUE garante que uma StockItem
-- nao esta em duas vendas (proteçao contra venda duplicada).
ALTER TABLE "sale_items" ADD COLUMN "stock_item_id" UUID;
CREATE UNIQUE INDEX "sale_items_stock_item_id_key" ON "sale_items"("stock_item_id");
