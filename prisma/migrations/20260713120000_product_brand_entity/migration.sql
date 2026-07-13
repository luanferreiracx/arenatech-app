-- Marca do produto vira ENTIDADE (product_brands) referenciável por FK, no lugar
-- do texto livre Product.brand (que gerava duplicatas por caixa/acento:
-- Asus/ASUS, GENERICA/GENÉRICA/GENERICO). Auditoria de cadastro de produto (A1).
--
-- Ordem (backfill deduplicado antes da FK, para nenhum produto perder a marca):
--   1. Cria product_brands + products.brand_id.
--   2. Backfill: agrupa as marcas por nome NORMALIZADO (lower+unaccent+trim) por
--      tenant, escolhe a grafia CANÔNICA (mais frequente; desempate: mais curta,
--      depois alfabética), cria 1 linha por grupo e aponta products.brand_id.
--   3. FK products.brand_id -> product_brands.id (ON DELETE SET NULL: apagar uma
--      marca não apaga produtos, só desvincula).

-- 0. `unaccent` é usado na normalização do backfill (GENÉRICA = GENERICA). Não
--    vem por padrão num banco limpo (o CI roda migrate deploy do zero) — garante.
CREATE EXTENSION IF NOT EXISTS unaccent;

-- 1. Tabela + coluna.
CREATE TABLE "product_brands" (
  "id"         UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id"  UUID NOT NULL,
  "name"       TEXT NOT NULL,
  "active"     BOOLEAN NOT NULL DEFAULT true,
  "deleted_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT now(),
  CONSTRAINT "product_brands_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "product_brands_tenant_id_name_key" ON "product_brands" ("tenant_id", "name");
CREATE INDEX "product_brands_tenant_id_active_idx" ON "product_brands" ("tenant_id", "active");

ALTER TABLE "products" ADD COLUMN "brand_id" UUID;

-- 2. Backfill deduplicado.
--    2a. Escolhe a grafia canônica por (tenant, nome normalizado).
WITH normalized AS (
  SELECT
    p.tenant_id,
    p.brand AS raw,
    lower(unaccent(btrim(p.brand))) AS norm
  FROM products p
  WHERE p.brand IS NOT NULL AND btrim(p.brand) <> '' AND p.deleted_at IS NULL
),
ranked AS (
  SELECT
    tenant_id, norm, btrim(raw) AS raw,
    count(*) AS freq,
    row_number() OVER (
      PARTITION BY tenant_id, norm
      ORDER BY count(*) DESC, length(btrim(raw)) ASC, btrim(raw) ASC
    ) AS rn
  FROM normalized
  GROUP BY tenant_id, norm, btrim(raw)
),
canonical AS (
  SELECT tenant_id, norm, raw AS canonical_name
  FROM ranked
  WHERE rn = 1
)
INSERT INTO "product_brands" (id, tenant_id, name, created_at, updated_at)
SELECT gen_random_uuid(), tenant_id, canonical_name, now(), now()
FROM canonical;

--    2b. Vincula cada produto à marca canônica do seu grupo normalizado.
UPDATE "products" p
SET brand_id = b.id
FROM "product_brands" b
WHERE p.brand IS NOT NULL
  AND btrim(p.brand) <> ''
  AND b.tenant_id = p.tenant_id
  AND lower(unaccent(b.name)) = lower(unaccent(btrim(p.brand)));

-- 3. FK.
ALTER TABLE "products"
  ADD CONSTRAINT "products_brand_id_fkey"
  FOREIGN KEY ("brand_id") REFERENCES "product_brands"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "products_tenant_id_brand_id_idx" ON "products" ("tenant_id", "brand_id");
