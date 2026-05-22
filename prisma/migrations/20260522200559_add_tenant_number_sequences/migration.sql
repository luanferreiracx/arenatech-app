-- Sequencias por (tenant, scope, year) com bump atomico via upsert.
-- Substitui findFirst max+parseInt sujeito a race em concurrency.
CREATE TABLE "tenant_number_sequences" (
  "tenant_id" UUID NOT NULL,
  "scope"     VARCHAR(50) NOT NULL,
  "year"      INTEGER NOT NULL,
  "value"     INTEGER NOT NULL DEFAULT 0,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("tenant_id", "scope", "year")
);
