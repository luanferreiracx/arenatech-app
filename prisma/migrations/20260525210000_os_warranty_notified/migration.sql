-- Coluna para registrar aviso de garantia vencendo (cron diario).
-- Evita aviso duplicado quando a OS cair na janela de 7 dias varias vezes.
ALTER TABLE service_orders ADD COLUMN warranty_expiry_notified_at TIMESTAMP(3);
