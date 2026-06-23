-- pg_trgm: acelera a busca ILIKE/contains em customers.name (listagem/PDV/OS).
-- Sem isso, a busca por nome cai em seq-scan em tenants com muitos clientes.
-- Espelha o padrão de products_name_trgm_idx.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS customers_name_trgm_idx
  ON customers USING gin (name gin_trgm_ops)
  WHERE deleted_at IS NULL;
