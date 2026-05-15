-- Realign Customer module to SPEC v1.0
-- ADR 0005: PF+PJ unified, ADR 0006: soft delete, ADR 0007: address fields

-- ============================================================
-- 1. Drop old models that are being replaced
-- ============================================================

-- Drop old interest_interactions (will be recreated)
DROP TABLE IF EXISTS "interest_interactions" CASCADE;

-- Drop old customer_interests (will be recreated as interests)
DROP TABLE IF EXISTS "customer_interests" CASCADE;

-- ============================================================
-- 2. Alter customers table to match SPEC
-- ============================================================

-- Remove old columns
ALTER TABLE "customers" DROP COLUMN IF EXISTS "address";
ALTER TABLE "customers" DROP COLUMN IF EXISTS "phone2";
ALTER TABLE "customers" DROP COLUMN IF EXISTS "consent_at";

-- Add new columns (SPEC fields)
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "trade_name" VARCHAR(255);
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "phone_secondary" VARCHAR(20);
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "zip_code" VARCHAR(9);
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "street" VARCHAR(255);
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "street_number" VARCHAR(20);
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "complement" VARCHAR(100);
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "neighborhood" VARCHAR(100);
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "city" VARCHAR(100);
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "state" VARCHAR(2);
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "created_by_id" UUID;

-- Alter existing columns to match SPEC constraints
ALTER TABLE "customers" ALTER COLUMN "cpf" TYPE VARCHAR(11);
ALTER TABLE "customers" ALTER COLUMN "cnpj" TYPE VARCHAR(14);
ALTER TABLE "customers" ALTER COLUMN "name" TYPE VARCHAR(255);
ALTER TABLE "customers" ALTER COLUMN "phone" TYPE VARCHAR(20);
ALTER TABLE "customers" ALTER COLUMN "phone" SET NOT NULL;
ALTER TABLE "customers" ALTER COLUMN "email" TYPE VARCHAR(255);
ALTER TABLE "customers" ALTER COLUMN "notes" TYPE TEXT;

-- Drop old indexes that will be recreated
DROP INDEX IF EXISTS "customers_tenant_id_cpf_idx";
DROP INDEX IF EXISTS "customers_tenant_id_cnpj_idx";

-- Partial unique indexes (Q1: allow CPF reuse after soft delete)
CREATE UNIQUE INDEX "customers_tenant_id_cpf_unique" ON "customers" ("tenant_id", "cpf") WHERE "deleted_at" IS NULL AND "cpf" IS NOT NULL;
CREATE UNIQUE INDEX "customers_tenant_id_cnpj_unique" ON "customers" ("tenant_id", "cnpj") WHERE "deleted_at" IS NULL AND "cnpj" IS NOT NULL;

-- ============================================================
-- 3. Update InterestStatus enum (FINISHED -> COMPLETED)
-- ============================================================

-- Rename FINISHED to COMPLETED
ALTER TYPE "InterestStatus" RENAME VALUE 'FINISHED' TO 'COMPLETED';

-- ============================================================
-- 4. Create InteractionType enum
-- ============================================================

CREATE TYPE "InteractionType" AS ENUM ('PHONE', 'WHATSAPP', 'IN_STORE');

-- ============================================================
-- 5. Create interests table (autonomous, no FK to customers)
-- ============================================================

CREATE TABLE "interests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "customer_name" VARCHAR(150) NOT NULL,
    "phone" VARCHAR(20),
    "cpf" VARCHAR(14),
    "email" VARCHAR(255),
    "type" "InterestType" NOT NULL DEFAULT 'PURCHASE',
    "desired_model" VARCHAR(200),
    "notes" TEXT,
    "status" "InterestStatus" NOT NULL DEFAULT 'WAITING',
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "interests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "interests_tenant_id_status_idx" ON "interests" ("tenant_id", "status");
CREATE INDEX "interests_tenant_id_type_idx" ON "interests" ("tenant_id", "type");
CREATE INDEX "interests_tenant_id_customer_name_idx" ON "interests" ("tenant_id", "customer_name");

-- ============================================================
-- 6. Create interest_interactions table
-- ============================================================

CREATE TABLE "interest_interactions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "interest_id" UUID NOT NULL,
    "user_id" UUID,
    "type" "InteractionType" NOT NULL,
    "description" TEXT NOT NULL,
    "occurred_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "interest_interactions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "interest_interactions_interest_id_fkey" FOREIGN KEY ("interest_id") REFERENCES "interests" ("id") ON DELETE CASCADE
);

CREATE INDEX "interest_interactions_tenant_id_interest_id_idx" ON "interest_interactions" ("tenant_id", "interest_id");

-- ============================================================
-- 7. RLS for new tables
-- ============================================================

-- interests
ALTER TABLE "interests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "interests" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "interests"
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

-- interest_interactions
ALTER TABLE "interest_interactions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "interest_interactions" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "interest_interactions"
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

-- Ensure customers RLS is still active (may already exist from earlier migration)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'customers' AND policyname = 'tenant_isolation'
  ) THEN
    ALTER TABLE "customers" ENABLE ROW LEVEL SECURITY;
    ALTER TABLE "customers" FORCE ROW LEVEL SECURITY;
    CREATE POLICY tenant_isolation ON "customers"
      USING (tenant_id = current_tenant_id())
      WITH CHECK (tenant_id = current_tenant_id());
  END IF;
END $$;
