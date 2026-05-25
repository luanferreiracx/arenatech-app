-- Unique IMEI por tenant em stock_items (StockItem) e device_purchases.
-- Partial unique index (NULL ignorado) — permite multiplos StockItems sem imei.
-- Filtra deletedAt IS NULL pra nao bloquear reentry apos delete.

CREATE UNIQUE INDEX IF NOT EXISTS stock_items_tenant_imei_unique
  ON stock_items (tenant_id, imei)
  WHERE imei IS NOT NULL AND deleted_at IS NULL;

-- DevicePurchase: cancelados (cancelledAt IS NOT NULL) podem ser reinseridos.
CREATE UNIQUE INDEX IF NOT EXISTS device_purchases_tenant_imei_unique
  ON device_purchases (tenant_id, imei)
  WHERE imei IS NOT NULL AND cancelled_at IS NULL;
