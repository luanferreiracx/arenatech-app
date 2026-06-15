-- ADR 0051 — DePix wallet non-custodial.
-- Aditivo, zero-downtime: custody_model com default garante que tenants
-- existentes seguem "custodial" (comportamento atual intacto). encrypted_seed
-- e seed_kdf_version sao nullable (so populados quando o tenant migra).
ALTER TABLE "tenant_depix_wallets"
  ADD COLUMN "custody_model" TEXT NOT NULL DEFAULT 'custodial',
  ADD COLUMN "encrypted_seed" JSONB,
  ADD COLUMN "seed_kdf_version" INTEGER;
