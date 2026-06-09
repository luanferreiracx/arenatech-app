DROP INDEX IF EXISTS "sale_items_stock_item_id_key";

CREATE INDEX IF NOT EXISTS "sale_items_stock_item_id_idx" ON "sale_items"("stock_item_id");
