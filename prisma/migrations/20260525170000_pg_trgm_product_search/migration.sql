-- pg_trgm: acelera ILIKE/contains em product.name, sku, barcode, brand.
-- Sem isso, busca cai em seq-scan em tenant com 10k+ produtos.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS products_name_trgm_idx
  ON products USING gin (name gin_trgm_ops)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS products_sku_trgm_idx
  ON products USING gin (sku gin_trgm_ops)
  WHERE deleted_at IS NULL AND sku IS NOT NULL;

CREATE INDEX IF NOT EXISTS products_barcode_trgm_idx
  ON products USING gin (barcode gin_trgm_ops)
  WHERE deleted_at IS NULL AND barcode IS NOT NULL;

CREATE INDEX IF NOT EXISTS products_brand_trgm_idx
  ON products USING gin (brand gin_trgm_ops)
  WHERE deleted_at IS NULL AND brand IS NOT NULL;

-- Customers tambem se beneficia (busca por nome/cpf no PDV).
CREATE INDEX IF NOT EXISTS customers_name_trgm_idx
  ON customers USING gin (name gin_trgm_ops)
  WHERE deleted_at IS NULL;
