-- API-key de PARCEIRO externo (ADR 0057). Por-tenant; resolve tenant + escopos
-- na borda REST /api/v1/partner. Segredo so no hash (bcrypt); prefix p/ lookup.
CREATE TABLE "partner_api_keys" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "key_prefix" TEXT NOT NULL,
  "key_hash" TEXT NOT NULL,
  "scopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "last_used_at" TIMESTAMP(3),
  "revoked_at" TIMESTAMP(3),
  "created_by_id" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "partner_api_keys_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "partner_api_keys_key_prefix_key" ON "partner_api_keys"("key_prefix");
CREATE INDEX "partner_api_keys_tenant_id_revoked_at_idx" ON "partner_api_keys"("tenant_id", "revoked_at");

-- RLS: isolamento por tenant (mesmo backstop das demais tabelas tenant-scoped).
-- A validacao da key na borda roda via withAdmin (BYPASSRLS) p/ achar a key pelo
-- prefix ANTES de saber o tenant; o painel de gestao le via withTenant.
ALTER TABLE "partner_api_keys" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "partner_api_keys" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "partner_api_keys"
  USING ("tenant_id" = current_setting('app.current_tenant_id')::uuid);
