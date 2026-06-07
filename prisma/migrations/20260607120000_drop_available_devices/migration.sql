-- Consolida a fonte de verdade dos aparelhos no catalogo administrado.
-- available_devices foi criada como tabela dedicada para o Talison, mas duplicava
-- catalog_devices e permitia que aparelhos excluidos em /aparelhos-catalogo
-- continuassem sendo ofertados pelo bot.

INSERT INTO "catalog_device_categories" (
  "id",
  "tenant_id",
  "name",
  "slug",
  "order",
  "created_at",
  "updated_at"
)
SELECT
  gen_random_uuid(),
  d."tenant_id",
  initcap(replace(d."category", '_', ' ')),
  regexp_replace(lower(d."category"), '[^a-z0-9]+', '-', 'g'),
  0,
  now(),
  now()
FROM "available_devices" d
WHERE d."deleted_at" IS NULL
  AND d."category" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "catalog_device_categories" c
    WHERE c."tenant_id" = d."tenant_id"
      AND c."slug" = regexp_replace(lower(d."category"), '[^a-z0-9]+', '-', 'g')
  )
GROUP BY d."tenant_id", d."category";

INSERT INTO "catalog_devices" (
  "id",
  "tenant_id",
  "category_id",
  "name",
  "condition",
  "description",
  "price",
  "promotional_price",
  "available",
  "featured",
  "order",
  "price_updated_at",
  "deleted_at",
  "created_at",
  "updated_at"
)
SELECT
  gen_random_uuid(),
  d."tenant_id",
  c."id",
  d."model",
  CASE d."condition"::text
    WHEN 'NEW' THEN 'Novo'
    WHEN 'SEMI_NEW' THEN 'Seminovo'
    WHEN 'USED' THEN 'Usado'
    WHEN 'DISPLAY' THEN 'Vitrine'
    WHEN 'REFURBISHED' THEN 'Recondicionado'
    WHEN 'DEFECTIVE' THEN 'Com defeito'
    ELSE initcap(replace(d."condition"::text, '_', ' '))
  END,
  d."note",
  d."price",
  d."price",
  d."active",
  false,
  0,
  d."price_updated_at",
  d."deleted_at",
  d."created_at",
  d."updated_at"
FROM "available_devices" d
LEFT JOIN "catalog_device_categories" c
  ON c."tenant_id" = d."tenant_id"
 AND c."slug" = regexp_replace(lower(d."category"), '[^a-z0-9]+', '-', 'g')
WHERE NOT EXISTS (
  SELECT 1
  FROM "catalog_devices" cd
  WHERE cd."tenant_id" = d."tenant_id"
    AND cd."name" = d."model"
    AND cd."condition" IS NOT DISTINCT FROM CASE d."condition"::text
      WHEN 'NEW' THEN 'Novo'
      WHEN 'SEMI_NEW' THEN 'Seminovo'
      WHEN 'USED' THEN 'Usado'
      WHEN 'DISPLAY' THEN 'Vitrine'
      WHEN 'REFURBISHED' THEN 'Recondicionado'
      WHEN 'DEFECTIVE' THEN 'Com defeito'
      ELSE initcap(replace(d."condition"::text, '_', ' '))
    END
    AND cd."promotional_price" IS NOT DISTINCT FROM d."price"
    AND cd."deleted_at" IS NULL
);

DROP TABLE IF EXISTS "available_devices";
