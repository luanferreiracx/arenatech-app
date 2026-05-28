-- Snapshot do aparelho no item de venda (paridade Laravel pdv_venda_itens).
-- Persiste IMEI/serial/condicao/bateria/garantia direto no item, em vez de
-- derivar do StockItem na hora do recibo. Cobre vendas migradas sem StockItem.
ALTER TABLE sale_items
  ADD COLUMN IF NOT EXISTS imei TEXT,
  ADD COLUMN IF NOT EXISTS serial TEXT,
  ADD COLUMN IF NOT EXISTS condition TEXT,
  ADD COLUMN IF NOT EXISTS battery_health INTEGER,
  ADD COLUMN IF NOT EXISTS warranty_months INTEGER,
  ADD COLUMN IF NOT EXISTS eh_upgrade BOOLEAN NOT NULL DEFAULT false;
