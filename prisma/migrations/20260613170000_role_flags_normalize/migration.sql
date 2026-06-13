-- Modelo de papéis definitivo: papel de PRIVILÉGIO = admin | operator.
-- "Técnico" e "caixa" viram FLAGS de função (independentes do privilégio).

-- 1) Nova flag is_cashier.
ALTER TABLE "user_tenants"
  ADD COLUMN "is_cashier" BOOLEAN NOT NULL DEFAULT false;

-- 2) Normaliza os dados legados (vindos do Laravel):
--    - owner/manager  → admin (privilégio máximo no tenant)
--    - technician      → operator + is_technician=true
--    - cashier         → operator + is_cashier=true
UPDATE "user_tenants" SET "role" = 'admin'
  WHERE lower("role") IN ('owner', 'manager', 'admin');

UPDATE "user_tenants" SET "is_technician" = true
  WHERE lower("role") = 'technician';

UPDATE "user_tenants" SET "is_cashier" = true
  WHERE lower("role") = 'cashier';

-- Qualquer papel que não seja admin vira operator (technician/cashier/legado/strings soltas).
UPDATE "user_tenants" SET "role" = 'operator'
  WHERE "role" <> 'admin';

-- 3) Constrange o papel a admin|operator (impede divergência futura).
ALTER TABLE "user_tenants"
  ADD CONSTRAINT "user_tenants_role_check" CHECK ("role" IN ('admin', 'operator'));
