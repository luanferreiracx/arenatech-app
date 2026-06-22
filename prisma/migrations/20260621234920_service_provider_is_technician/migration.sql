-- Prestador que atua como técnico: aparece no seletor de técnico responsável da
-- OS, junto com os usuários internos (user_tenants.is_technician).
ALTER TABLE "service_providers"
  ADD COLUMN "is_technician" BOOLEAN NOT NULL DEFAULT false;
