-- Onda 2 da auditoria final pre-go-live:
--
-- 1) service_orders.depix_paid_at: timestamp do PIX/DePix confirmado.
--    Paridade Laravel `depix_pago_em`. Backfill posterior copia o valor
--    das OS migradas. Webhook DePix passa a setar este campo ao receber
--    confirmacao.
--
-- 2) user_tenants.is_technician: flag explicita de "atua como tecnico de
--    reparo". Paridade Laravel `usuarios.eh_tecnico`. Substitui a heuristica
--    "role IN (technician, owner, admin, manager)" que listava admins
--    administrativos no dropdown de tecnicos da OS.

ALTER TABLE "service_orders" ADD COLUMN "depix_paid_at" TIMESTAMP(3);

ALTER TABLE "user_tenants" ADD COLUMN "is_technician" BOOLEAN NOT NULL DEFAULT false;

-- Backfill: usuarios com role=technician ja sao tecnicos.
UPDATE "user_tenants" SET "is_technician" = true WHERE "role" = 'technician';
